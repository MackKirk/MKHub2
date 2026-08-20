import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  formatJobPickerLine,
  getPredefinedJob,
  PREDEFINED_JOBS
} from "../../constants/predefinedJobs";
import { searchProjects } from "../../services/projects";
import { formatDateLocal } from "../../lib/dateUtils";
import {
  buildRoundedTimeHHMM,
  buildTimeSelectedLocal,
  formatShortDate,
  formatTime12h,
  formatMinutesLabel,
  getJobTypeFromAttendance,
  getServiceItemFromAttendance,
  getServiceItems,
  postAttendance,
  postDirectAttendance
} from "../../services/shifts";
import { toApiError } from "../../services/api";
import type { AttendanceGpsPayload, ServiceItemOption, ShiftAttendanceResponse, ShiftSummary } from "../../types/shifts";
import type { ProjectListItem } from "../../types/projects";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type JobOption = { id: string; code: string; name: string; kind: "predefined" | "shift" | "project" };

type ClockActionModalProps = {
  visible: boolean;
  clockType: "in" | "out" | null;
  selectedDate: string;
  shifts: ShiftSummary[];
  openAttendance: ShiftAttendanceResponse | null;
  nextPendingShift: ShiftSummary | null;
  permissions: string[];
  roles: string[];
  onClose: () => void;
  onSuccess: () => void;
};

function to12hParts(hhmm: string): { hour12: string; minute: string; amPm: "AM" | "PM" } {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr || "0", 10);
  const minute = String(Math.floor(parseInt(mStr || "0", 10) / 15) * 15).padStart(2, "0");
  const amPm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { hour12: String(h), minute, amPm };
}

function from12hParts(hour12: string, minute: string, amPm: "AM" | "PM"): string {
  let h = parseInt(hour12, 10);
  if (amPm === "PM" && h !== 12) h += 12;
  if (amPm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

const ACCENT = colors.homeAccent;
const CLOCK_OUT = "#a31414";

function formatSheetDateLabel(selectedDate: string): string {
  const today = formatDateLocal(new Date());
  const d = new Date(`${selectedDate}T00:00:00`);
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (selectedDate === today) return `Today, ${md}`;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

export const ClockActionModal: React.FC<ClockActionModalProps> = ({
  visible,
  clockType,
  selectedDate,
  shifts,
  openAttendance,
  nextPendingShift,
  permissions,
  roles,
  onClose,
  onSuccess
}) => {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [selectedJob, setSelectedJob] = useState("");
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [projectResults, setProjectResults] = useState<ProjectListItem[]>([]);
  const [searchingJobs, setSearchingJobs] = useState(false);
  const [serviceItems, setServiceItems] = useState<ServiceItemOption[]>([
    { id: "regular", label: "Regular", value: "regular" }
  ]);
  const [selectedServiceItem, setSelectedServiceItem] = useState("regular");
  const [servicePickerOpen, setServicePickerOpen] = useState(false);

  const roundedNow = buildRoundedTimeHHMM();
  const initial12 = to12hParts(roundedNow);
  const [startHour12, setStartHour12] = useState("");
  const [startMinute, setStartMinute] = useState("");
  const [startAmPm, setStartAmPm] = useState<"AM" | "PM">("AM");
  const [startTimeSet, setStartTimeSet] = useState(false);
  const [endHour12, setEndHour12] = useState(initial12.hour12);
  const [endMinute, setEndMinute] = useState(initial12.minute);
  const [endAmPm, setEndAmPm] = useState<"AM" | "PM">(initial12.amPm);
  const [expandedPanel, setExpandedPanel] = useState<"start" | "end" | null>("start");

  const [insertBreak, setInsertBreak] = useState(false);
  const [breakHours, setBreakHours] = useState("0");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [gps, setGps] = useState<AttendanceGpsPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  const lockedJobType = useMemo(() => {
    if (!openAttendance) return null;
    if (openAttendance.shift_id) {
      const shift = shifts.find((s) => s.id === openAttendance.shift_id);
      return shift?.project_id ?? getJobTypeFromAttendance(openAttendance);
    }
    return getJobTypeFromAttendance(openAttendance);
  }, [openAttendance, shifts]);

  const isJobLocked = clockType === "out" && !!openAttendance;

  const shiftJobOptions: JobOption[] = useMemo(() => {
    const seen = new Set<string>();
    const options: JobOption[] = [];
    for (const s of shifts) {
      if (!s.project_id || seen.has(s.project_id)) continue;
      seen.add(s.project_id);
      options.push({
        id: s.project_id,
        code: s.project_name || s.project_id,
        name: s.project_name || "Project",
        kind: "shift"
      });
    }
    return options;
  }, [shifts]);

  const baseJobOptions: JobOption[] = useMemo(
    () => [
      ...PREDEFINED_JOBS.map((j) => ({
        id: j.id,
        code: j.code,
        name: j.name,
        kind: "predefined" as const
      })),
      ...shiftJobOptions
    ],
    [shiftJobOptions]
  );

  const filteredJobOptions = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    const fromSearch: JobOption[] = projectResults.map((p) => ({
      id: p.id,
      code: p.code || p.id,
      name: p.name,
      kind: "project" as const
    }));
    const merged = [...baseJobOptions];
    for (const opt of fromSearch) {
      if (!merged.some((m) => m.id === opt.id)) merged.push(opt);
    }
    if (!q) return merged;
    return merged.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        j.code.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q)
    );
  }, [baseJobOptions, jobQuery, projectResults]);

  const selectedJobLabel = useMemo(() => {
    if (!selectedJob || selectedJob === "0") return "No project assigned";
    const pre = getPredefinedJob(selectedJob);
    if (pre) return formatJobPickerLine(pre);
    const fromBase = baseJobOptions.find((j) => j.id === selectedJob);
    if (fromBase) return formatJobPickerLine(fromBase);
    const fromSearch = projectResults.find((p) => p.id === selectedJob);
    if (fromSearch) return formatJobPickerLine(fromSearch);
    return selectedJob;
  }, [selectedJob, baseJobOptions, projectResults]);

  const selectedServiceItemLabel = useMemo(() => {
    const match = serviceItems.find(
      (item) =>
        item.value === selectedServiceItem ||
        item.id === selectedServiceItem ||
        item.label.toLowerCase() === selectedServiceItem.toLowerCase()
    );
    return match?.label || "Regular";
  }, [serviceItems, selectedServiceItem]);

  const workedHoursLabel = useMemo(() => {
    let startMs: number | null = null;
    if (clockType === "out" && openAttendance?.clock_in_time) {
      startMs = new Date(openAttendance.clock_in_time).getTime();
    } else if (clockType === "in" && startTimeSet && startHour12 && startMinute) {
      const [year, month, day] = selectedDate.split("-").map(Number);
      const startHHMM = from12hParts(startHour12, startMinute, startAmPm);
      const [hours, mins] = startHHMM.split(":").map(Number);
      startMs = new Date(year, month - 1, day, hours, mins, 0).getTime();
    }
    if (startMs == null) return null;

    const [year, month, day] = selectedDate.split("-").map(Number);
    const endHHMM = from12hParts(endHour12, endMinute, endAmPm);
    const [hours, mins] = endHHMM.split(":").map(Number);
    const endMs = new Date(year, month - 1, day, hours, mins, 0).getTime();
    const breakMins = insertBreak
      ? parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10)
      : 0;
    const net = Math.max(0, Math.floor((endMs - startMs) / 60000) - breakMins);
    return formatMinutesLabel(net);
  }, [
    clockType,
    openAttendance?.clock_in_time,
    startTimeSet,
    startHour12,
    startMinute,
    startAmPm,
    endHour12,
    endMinute,
    endAmPm,
    selectedDate,
    insertBreak,
    breakHours,
    breakMinutes
  ]);

  const resetForm = useCallback(() => {
    const now12 = to12hParts(buildRoundedTimeHHMM());
    setSelectedJob("");
    setJobPickerOpen(false);
    setJobQuery("");
    setProjectResults([]);
    setStartHour12("");
    setStartMinute("");
    setStartAmPm("AM");
    setStartTimeSet(false);
    setEndHour12(now12.hour12);
    setEndMinute(now12.minute);
    setEndAmPm(now12.amPm);
    setExpandedPanel("start");
    setInsertBreak(false);
    setBreakHours("0");
    setBreakMinutes("0");
    setGps(null);
    setNote("");
    setNoteOpen(false);
    setSelectedServiceItem("regular");
    setServicePickerOpen(false);
    setSubmitting(false);
  }, []);

  const captureGps = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGps(null);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      setGps({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy ?? 0,
        mocked: false
      });
    } catch {
      setGps(null);
    }
  }, []);

  useEffect(() => {
    if (!visible || !clockType) return;
    resetForm();
    if (clockType === "out") {
      setExpandedPanel("end");
    }
    if (isJobLocked && lockedJobType) {
      setSelectedJob(lockedJobType);
    } else if (clockType === "in" && nextPendingShift?.project_id) {
      setSelectedJob(nextPendingShift.project_id);
    } else if (clockType === "in") {
      setSelectedJob("0");
    }
    const existingService =
      openAttendance ? getServiceItemFromAttendance(openAttendance) : null;
    setSelectedServiceItem(existingService || "regular");
    void captureGps();
    let cancelled = false;
    void getServiceItems().then((items) => {
      if (cancelled) return;
      setServiceItems(items);
      setSelectedServiceItem((current) => {
        if (items.some((item) => item.value === current || item.id === current)) {
          return current;
        }
        const regular = items.find(
          (item) =>
            item.value.toLowerCase() === "regular" ||
            item.label.toLowerCase() === "regular"
        );
        return regular?.value || items[0]?.value || "regular";
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    clockType,
    isJobLocked,
    lockedJobType,
    nextPendingShift?.project_id,
    openAttendance?.id,
    openAttendance?.reason_text,
    openAttendance?.service_item,
    resetForm,
    captureGps
  ]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!noteOpen || keyboardHeight <= 0) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [noteOpen, keyboardHeight]);

  useEffect(() => {
    if (!jobPickerOpen) return;
    const q = jobQuery.trim();
    if (q.length < 2) {
      setProjectResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setSearchingJobs(true);
        const rows = await searchProjects(q);
        if (!cancelled) setProjectResults(rows.slice(0, 20));
      } catch {
        if (!cancelled) setProjectResults([]);
      } finally {
        if (!cancelled) setSearchingJobs(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobQuery, jobPickerOpen]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!clockType) return;
    if (clockType === "in" && !selectedJob) {
      Alert.alert("Job required", "Please select a Job to clock in.");
      return;
    }

    if (clockType === "in" && !startTimeSet) {
      Alert.alert("Start time required", "Please set a start time.");
      return;
    }

    const startHHMM = from12hParts(startHour12 || "7", startMinute || "00", startAmPm);
    const endHHMM = from12hParts(endHour12, endMinute, endAmPm);
    const [year, month, day] = selectedDate.split("-").map(Number);
    const now = new Date();
    const startDateTime = (() => {
      const [hours, mins] = startHHMM.split(":").map(Number);
      return new Date(year, month - 1, day, hours, mins, 0);
    })();
    const endDateTime = (() => {
      const [hours, mins] = endHHMM.split(":").map(Number);
      return new Date(year, month - 1, day, hours, mins, 0);
    })();

    if (clockType === "in") {
      if (endDateTime.getTime() <= startDateTime.getTime()) {
        Alert.alert("Invalid time", "End time must be after start time.");
        return;
      }
      if (endDateTime.getTime() > now.getTime() + 4 * 60 * 1000) {
        Alert.alert("Invalid time", "End time cannot be in the future.");
        return;
      }
    } else if (endDateTime.getTime() > now.getTime() + 4 * 60 * 1000) {
      Alert.alert("Invalid time", "Clock-out cannot be in the future.");
      return;
    }

    if (clockType === "out" && openAttendance?.clock_in_time) {
      const clockInDate = new Date(openAttendance.clock_in_time);
      if (endDateTime <= clockInDate) {
        Alert.alert("Invalid time", "Clock-out time must be after clock-in time.");
        return;
      }
    }

    const periodStart =
      clockType === "out" && openAttendance?.clock_in_time
        ? new Date(openAttendance.clock_in_time)
        : startDateTime;
    const totalMinutes = Math.floor(
      (endDateTime.getTime() - periodStart.getTime()) / (1000 * 60)
    );
    const breakTotal = insertBreak
      ? parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10)
      : undefined;
    if (insertBreak && (breakTotal || 0) >= totalMinutes) {
      Alert.alert(
        "Invalid break",
        "Break time cannot be greater than or equal to the total attendance time."
      );
      return;
    }

    let targetShiftId: string | null = null;
    if (clockType === "in") {
      const matching = shifts.filter(
        (s) =>
          String(s.project_id) === String(selectedJob) && s.status === "scheduled"
      );
      if (
        nextPendingShift &&
        String(nextPendingShift.project_id) === String(selectedJob)
      ) {
        targetShiftId = nextPendingShift.id;
      } else if (matching.length >= 1) {
        targetShiftId = matching[0].id;
      }
    }

    const startLocal = buildTimeSelectedLocal(selectedDate, startHHMM);
    const endLocal = buildTimeSelectedLocal(selectedDate, endHHMM);
    const noteText = note.trim() || undefined;
    const breakLabel =
      insertBreak && breakTotal
        ? ` with ${Math.floor(breakTotal / 60)}h ${String(breakTotal % 60).padStart(2, "0")}m break`
        : "";
    const confirmLabel =
      clockType === "in"
        ? `Log hours on ${formatShortDate(selectedDate)} from ${formatTime12h(startHHMM)} to ${formatTime12h(endHHMM)}${breakLabel}${
            selectedJobLabel && selectedJob ? ` for ${selectedJobLabel}` : ""
          }?`
        : `Clock out on ${formatShortDate(selectedDate)} at ${formatTime12h(endHHMM)}${breakLabel}?`;

    Alert.alert(
      clockType === "in" ? "Confirm hours" : "Confirm Clock Out",
      confirmLabel,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              setSubmitting(true);
              const gpsPayload = gps ?? undefined;
              if (clockType === "out") {
                if (!openAttendance) {
                  Alert.alert("Error", "No open clock-in found to clock out.");
                  return;
                }
                if (openAttendance.shift_id) {
                  await postAttendance({
                    shift_id: openAttendance.shift_id,
                    type: "out",
                    time_selected_local: endLocal,
                    manual_break_minutes: breakTotal,
                    gps: gpsPayload,
                    reason_text: noteText,
                    service_item: selectedServiceItem
                  });
                } else {
                  const jobType =
                    getJobTypeFromAttendance(openAttendance) ?? lockedJobType ?? "0";
                  await postDirectAttendance({
                    type: "out",
                    time_selected_local: endLocal,
                    job_type: jobType,
                    manual_break_minutes: breakTotal,
                    gps: gpsPayload,
                    reason_text: noteText,
                    service_item: selectedServiceItem
                  });
                }
              } else if (targetShiftId) {
                await postAttendance({
                  shift_id: targetShiftId,
                  type: "in",
                  time_selected_local: startLocal,
                  clock_out_time_local: endLocal,
                  manual_break_minutes: breakTotal,
                  gps: gpsPayload,
                  reason_text: noteText,
                  service_item: selectedServiceItem
                });
              } else {
                await postDirectAttendance({
                  type: "in",
                  time_selected_local: startLocal,
                  clock_out_time_local: endLocal,
                  job_type: selectedJob,
                  manual_break_minutes: breakTotal,
                  gps: gpsPayload,
                  reason_text: noteText,
                  service_item: selectedServiceItem
                });
              }
              resetForm();
              onSuccess();
            } catch (err) {
              Alert.alert("Clock failed", toApiError(err).message);
            } finally {
              setSubmitting(false);
            }
          }
        }
      ]
    );
  };

  if (!clockType) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
          <View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, spacing.md),
                marginBottom: Platform.OS === "android" ? keyboardHeight : 0,
                maxHeight: keyboardHeight > 0 ? "100%" : "94%"
              }
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.headerKicker}>
                  {clockType === "in" ? "Start, end and break" : "End shift"}
                </Text>
                <View style={styles.headerTitleRow}>
                  <Text style={styles.headerTitle}>
                    {clockType === "in" ? "Log hours" : "Clock Out"}
                  </Text>
                  {workedHoursLabel ? (
                    <Text style={styles.headerHours}>{workedHoursLabel}</Text>
                  ) : null}
                </View>
              </View>
              <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {clockType === "in" ? (
                <TimePickerCard
                  title="Start time"
                  dateLabel={formatSheetDateLabel(selectedDate)}
                  hour12={startHour12}
                  minute={startMinute}
                  amPm={startAmPm}
                  hasTime={startTimeSet}
                  accent={ACCENT}
                  background="#F7FBF8"
                  expanded={expandedPanel === "start"}
                  onToggle={() => setExpandedPanel("start")}
                  editable
                  showUseNow={false}
                  onChangeHour={(v) => {
                    setStartHour12(v);
                    if (!startMinute) setStartMinute("00");
                    setStartTimeSet(true);
                  }}
                  onChangeMinute={(v) => {
                    setStartMinute(v);
                    if (!startHour12) setStartHour12("7");
                    setStartTimeSet(true);
                  }}
                  onChangeAmPm={(v) => {
                    setStartAmPm(v);
                    if (!startHour12) setStartHour12("7");
                    if (!startMinute) setStartMinute("00");
                    setStartTimeSet(true);
                  }}
                  onUseNow={() => undefined}
                />
              ) : null}

              <TimePickerCard
                title={clockType === "in" ? "End time" : "Clock Out"}
                dateLabel={formatSheetDateLabel(selectedDate)}
                hour12={endHour12}
                minute={endMinute}
                amPm={endAmPm}
                hasTime
                accent={CLOCK_OUT}
                background="#FDF8F8"
                expanded={expandedPanel === "end"}
                onToggle={() => setExpandedPanel("end")}
                editable
                onChangeHour={setEndHour12}
                onChangeMinute={setEndMinute}
                onChangeAmPm={setEndAmPm}
                onUseNow={() => {
                  const now12 = to12hParts(buildRoundedTimeHHMM());
                  setEndHour12(now12.hour12);
                  setEndMinute(now12.minute);
                  setEndAmPm(now12.amPm);
                }}
              />

              <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <View style={styles.detailIcon}>
                      <Ionicons name="cafe-outline" size={18} color={ACCENT} />
                    </View>
                    <View style={styles.detailCopy}>
                      <Text style={styles.detailLabel}>Insert break time</Text>
                      <Text style={styles.detailValue}>
                        {insertBreak
                          ? `${breakHours}h ${String(breakMinutes).padStart(2, "0")}m`
                          : "Off"}
                      </Text>
                    </View>
                    <Switch
                      value={insertBreak}
                      onValueChange={setInsertBreak}
                      trackColor={{ true: ACCENT, false: "#d1d5db" }}
                      thumbColor="#fff"
                    />
                  </View>
                  {insertBreak ? (
                    <View style={styles.breakSteppers}>
                      <StepperField
                        label="Hours"
                        value={breakHours}
                        onDecrement={() =>
                          setBreakHours(String(Math.max(0, parseInt(breakHours, 10) - 1)))
                        }
                        onIncrement={() =>
                          setBreakHours(String(Math.min(2, parseInt(breakHours, 10) + 1)))
                        }
                      />
                      <StepperField
                        label="Minutes"
                        value={breakMinutes}
                        onDecrement={() => {
                          const m = parseInt(breakMinutes, 10);
                          setBreakMinutes(String(m <= 0 ? 55 : m - 5).padStart(2, "0"));
                        }}
                        onIncrement={() => {
                          const m = parseInt(breakMinutes, 10);
                          setBreakMinutes(String(m >= 55 ? 0 : m + 5).padStart(2, "0"));
                        }}
                      />
                    </View>
                  ) : null}
                </View>

              <DetailCard
                icon="briefcase-outline"
                label="Job"
                value={selectedJobLabel}
                muted={!selectedJob || selectedJob === "0"}
                right={
                  isJobLocked ? undefined : (
                    <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                  )
                }
                onPress={isJobLocked ? undefined : () => setJobPickerOpen(true)}
              />

              <DetailCard
                icon="pricetag-outline"
                label="Service item"
                value={selectedServiceItemLabel}
                right={
                  serviceItems.length > 1 ? (
                    <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                  ) : undefined
                }
                onPress={
                  serviceItems.length > 1 ? () => setServicePickerOpen(true) : undefined
                }
              />

              <View style={styles.detailCard}>
                <Pressable
                  style={styles.detailRow}
                  onPress={() => {
                    setNoteOpen(true);
                    setExpandedPanel(null);
                  }}
                >
                  <View style={styles.detailIcon}>
                    <Ionicons name="document-text-outline" size={18} color={ACCENT} />
                  </View>
                  <View style={styles.detailCopy}>
                    <Text style={styles.detailLabel}>Notes (optional)</Text>
                    {!noteOpen ? (
                      <Text
                        style={[styles.detailValue, !note && styles.detailMuted]}
                        numberOfLines={1}
                      >
                        {note.trim() || "Add a note..."}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                </Pressable>
                {noteOpen ? (
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Add a note..."
                    placeholderTextColor={colors.textMuted}
                    style={styles.noteInput}
                    multiline
                    autoFocus
                    onFocus={() => {
                      setTimeout(() => {
                        scrollRef.current?.scrollToEnd({ animated: true });
                      }, 120);
                    }}
                  />
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.submitBtn,
                  {
                    backgroundColor: clockType === "out" ? CLOCK_OUT : ACCENT
                  },
                  (submitting ||
                    (clockType === "in" && (!selectedJob || !startTimeSet))) &&
                    styles.submitBtnDisabled
                ]}
                onPress={handleSubmit}
                disabled={
                  submitting ||
                  (clockType === "in" && (!selectedJob || !startTimeSet))
                }
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.submitText}>
                      {clockType === "in" ? "Save hours" : "Clock Out"}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
            </View>
      </KeyboardAvoidingView>

      <Modal
        visible={jobPickerOpen}
        animationType="slide"
        onRequestClose={() => setJobPickerOpen(false)}
      >
        <View style={[styles.pickerSheet, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Job</Text>
            <Pressable
              onPress={() => setJobPickerOpen(false)}
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <TextInput
            value={jobQuery}
            onChangeText={setJobQuery}
            placeholder="Search projects…"
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            autoCorrect={false}
          />
          {searchingJobs ? (
            <ActivityIndicator color={ACCENT} style={{ marginVertical: spacing.sm }} />
          ) : null}
          <FlatList
            data={filteredJobOptions}
            keyExtractor={(item) => `${item.kind}-${item.id}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item.id === selectedJob;
              return (
                <Pressable
                  style={[styles.jobRow, active && styles.jobRowActive]}
                  onPress={() => {
                    setSelectedJob(item.id);
                    setJobPickerOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobRowTitle}>{formatJobPickerLine(item)}</Text>
                    <Text style={styles.jobRowMeta}>
                      {item.kind === "predefined"
                        ? "Predefined"
                        : item.kind === "shift"
                          ? "Scheduled today"
                          : "Project"}
                    </Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark" size={20} color={ACCENT} />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyJobs}>No jobs match your search.</Text>
            }
          />
        </View>
      </Modal>

      <Modal
        visible={servicePickerOpen}
        animationType="slide"
        onRequestClose={() => setServicePickerOpen(false)}
      >
        <View style={[styles.pickerSheet, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select service item</Text>
            <Pressable
              onPress={() => setServicePickerOpen(false)}
              hitSlop={12}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <FlatList
            data={serviceItems}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active =
                item.value === selectedServiceItem || item.id === selectedServiceItem;
              return (
                <Pressable
                  style={[styles.jobRow, active && styles.jobRowActive]}
                  onPress={() => {
                    setSelectedServiceItem(item.value);
                    setServicePickerOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobRowTitle}>{item.label}</Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark" size={20} color={ACCENT} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </Modal>
  );
};

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES_15 = Array.from({ length: 4 }, (_, i) =>
  String(i * 15).padStart(2, "0")
);

function cycleValue(values: string[], current: string, delta: number): string {
  const idx = Math.max(0, values.indexOf(current));
  const next = (idx + delta + values.length) % values.length;
  return values[next];
}

const DetailCard: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  muted?: boolean;
  right?: React.ReactNode;
  onPress?: () => void;
}> = ({ icon, label, value, muted, right, onPress }) => (
  <Pressable
    style={styles.detailCard}
    onPress={onPress}
    disabled={!onPress}
  >
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={18} color={ACCENT} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={[styles.detailValue, muted && styles.detailMuted]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {right}
    </View>
  </Pressable>
);

const TimePickerCard: React.FC<{
  title: string;
  dateLabel: string;
  hour12: string;
  minute: string;
  amPm: "AM" | "PM";
  hasTime?: boolean;
  accent: string;
  background: string;
  expanded: boolean;
  onToggle: () => void;
  editable: boolean;
  onChangeHour: (v: string) => void;
  onChangeMinute: (v: string) => void;
  onChangeAmPm: (v: "AM" | "PM") => void;
  onUseNow: () => void;
  showUseNow?: boolean;
}> = ({
  title,
  dateLabel,
  hour12,
  minute,
  amPm,
  hasTime = true,
  accent,
  background,
  expanded,
  onToggle,
  editable,
  onChangeHour,
  onChangeMinute,
  onChangeAmPm,
  onUseNow,
  showUseNow = true
}) => {
  const timeLabel = hasTime && hour12 && minute ? `${hour12}:${minute} ${amPm}` : "—";
  const hourValue = hour12 || "—";
  const minuteValue = minute || "—";

  return (
    <View style={[styles.timeCard, { backgroundColor: background }]}>
      <Pressable onPress={onToggle} style={styles.timeCardHeader}>
        <View style={styles.timeCardHeaderCopy}>
          <Text style={[styles.timeMetaTitle, { color: accent }]}>{title}</Text>
          <Text style={styles.timeDate}>{dateLabel}</Text>
        </View>
        <Text style={[styles.timeCollapsedValue, { color: accent }]}>{timeLabel}</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={accent}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.timeCardBody}>
          {editable && showUseNow ? (
            <Pressable onPress={onUseNow} style={[styles.useNowBtn, { backgroundColor: "#fff" }]}>
              <Ionicons name="time-outline" size={14} color={accent} />
              <Text style={[styles.useNowText, { color: accent }]}>Use current time</Text>
            </Pressable>
          ) : null}

          {editable ? (
            <View style={styles.adjustBlock}>
              <View style={styles.adjustRow}>
                <StepperField
                  label="Hour"
                  value={hourValue}
                  onDecrement={() =>
                    onChangeHour(hour12 ? cycleValue(HOURS_12, hour12, -1) : "7")
                  }
                  onIncrement={() =>
                    onChangeHour(hour12 ? cycleValue(HOURS_12, hour12, 1) : "7")
                  }
                />
                <StepperField
                  label="Minute"
                  value={minuteValue}
                  onDecrement={() =>
                    onChangeMinute(minute ? cycleValue(MINUTES_15, minute, -1) : "00")
                  }
                  onIncrement={() =>
                    onChangeMinute(minute ? cycleValue(MINUTES_15, minute, 1) : "00")
                  }
                />
              </View>
              <View style={styles.amPmSegment}>
                {(["AM", "PM"] as const).map((period) => {
                  const active = hasTime && amPm === period;
                  return (
                    <Pressable
                      key={period}
                      onPress={() => onChangeAmPm(period)}
                      style={[
                        styles.amPmOption,
                        active && { backgroundColor: accent }
                      ]}
                    >
                      <Text
                        style={[
                          styles.amPmOptionText,
                          active && styles.amPmOptionTextActive
                        ]}
                      >
                        {period}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const StepperField: React.FC<{
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}> = ({ label, value, onDecrement, onIncrement }) => (
  <View style={styles.stepperField}>
    <Text style={styles.stepperLabel}>{label}</Text>
    <View style={styles.stepperControls}>
      <Pressable
        onPress={onDecrement}
        style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
      >
        <Ionicons name="remove" size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        onPress={onIncrement}
        style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
      >
        <Ionicons name="add" size={22} color={colors.textPrimary} />
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.4)"
  },
  backdrop: {
    flex: 1
  },
  sheetWrap: {
    maxHeight: "94%"
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "100%",
    flexShrink: 1
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10
  },
  pickerSheet: {
    flex: 1,
    backgroundColor: "#fff"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md
  },
  headerCopy: {
    flex: 1,
    minWidth: 0
  },
  headerKicker: {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 2
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm
  },
  headerTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 22,
    color: colors.textPrimary
  },
  headerHours: {
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    color: ACCENT
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md
  },
  timeCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  timeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14
  },
  timeCardHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  timeCollapsedValue: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15
  },
  timeCardBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md
  },
  timeCardLocked: {
    backgroundColor: "#f9fafb"
  },
  timeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6
  },
  timeMetaTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: colors.textPrimary
  },
  timeDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2
  },
  useNowBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF3",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: spacing.md
  },
  useNowText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    color: ACCENT
  },
  adjustBlock: {
    gap: spacing.md
  },
  adjustRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md
  },
  amPmSegment: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 4
  },
  amPmOption: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  amPmOptionActive: {
    backgroundColor: ACCENT
  },
  amPmOptionText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: colors.textMuted
  },
  amPmOptionTextActive: {
    color: "#fff"
  },
  stepperField: {
    flex: 1
  },
  stepperLabel: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.textMuted,
    marginBottom: 6,
    textAlign: "center"
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff"
  },
  stepperBtn: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center"
  },
  stepperBtnPressed: {
    backgroundColor: "#ECFDF3"
  },
  stepperValue: {
    flex: 1,
    textAlign: "center",
    fontFamily: typography.button.fontFamily,
    fontSize: 20,
    color: colors.textPrimary
  },
  detailCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...shadows.card
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center"
  },
  detailCopy: {
    flex: 1,
    minWidth: 0
  },
  detailLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2
  },
  detailValue: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    color: colors.textPrimary
  },
  detailMuted: {
    fontFamily: typography.bodySmall.fontFamily,
    color: colors.textMuted
  },
  noteInput: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    minHeight: 64,
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  breakSteppers: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    minHeight: 48,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  cancelText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  submitBtn: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 14,
    minHeight: 48
  },
  submitBtnDisabled: {
    opacity: 0.5
  },
  submitText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: "#fff"
  },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  jobRowActive: {
    backgroundColor: "#ECFDF3"
  },
  jobRowTitle: {
    ...typography.body,
    color: colors.textPrimary
  },
  jobRowMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2
  },
  emptyJobs: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.xl
  }
});
