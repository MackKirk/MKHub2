import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
import { MKButton } from "../MKButton";
import {
  formatJobPickerLine,
  getPredefinedJob,
  PREDEFINED_JOBS
} from "../../constants/predefinedJobs";
import { hasPermission } from "../../lib/permissions";
import { searchProjects } from "../../services/projects";
import {
  buildRoundedTimeHHMM,
  buildTimeSelectedLocal,
  formatShortDate,
  formatTime12h,
  getJobTypeFromAttendance,
  postAttendance,
  postDirectAttendance
} from "../../services/shifts";
import { toApiError } from "../../services/api";
import type { AttendanceGpsPayload, ShiftAttendanceResponse, ShiftSummary } from "../../types/shifts";
import type { ProjectListItem } from "../../types/projects";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
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
  const minute = String(Math.floor(parseInt(mStr || "0", 10) / 5) * 5).padStart(2, "0");
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
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const hasUnrestrictedClock =
    hasPermission(permissionsSet, roles, "hr:timesheet:unrestricted_clock") ||
    hasPermission(permissionsSet, roles, "timesheet:unrestricted_clock");

  const [selectedJob, setSelectedJob] = useState("");
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [jobQuery, setJobQuery] = useState("");
  const [projectResults, setProjectResults] = useState<ProjectListItem[]>([]);
  const [searchingJobs, setSearchingJobs] = useState(false);

  const roundedNow = buildRoundedTimeHHMM();
  const initial12 = to12hParts(roundedNow);
  const [hour12, setHour12] = useState(initial12.hour12);
  const [minute, setMinute] = useState(initial12.minute);
  const [amPm, setAmPm] = useState<"AM" | "PM">(initial12.amPm);

  const [insertBreak, setInsertBreak] = useState(false);
  const [breakHours, setBreakHours] = useState("0");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [gps, setGps] = useState<AttendanceGpsPayload | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    if (!selectedJob) return "Select a job";
    const pre = getPredefinedJob(selectedJob);
    if (pre) return formatJobPickerLine(pre);
    const fromBase = baseJobOptions.find((j) => j.id === selectedJob);
    if (fromBase) return formatJobPickerLine(fromBase);
    const fromSearch = projectResults.find((p) => p.id === selectedJob);
    if (fromSearch) return formatJobPickerLine(fromSearch);
    return selectedJob;
  }, [selectedJob, baseJobOptions, projectResults]);

  const resetForm = useCallback(() => {
    const now12 = to12hParts(buildRoundedTimeHHMM());
    setSelectedJob("");
    setJobPickerOpen(false);
    setJobQuery("");
    setProjectResults([]);
    setHour12(now12.hour12);
    setMinute(now12.minute);
    setAmPm(now12.amPm);
    setInsertBreak(false);
    setBreakHours("0");
    setBreakMinutes("0");
    setGps(null);
    setSubmitting(false);
  }, []);

  const captureGps = useCallback(async () => {
    setGpsLoading(true);
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
    } finally {
      setGpsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !clockType) return;
    resetForm();
    if (isJobLocked && lockedJobType) {
      setSelectedJob(lockedJobType);
    } else if (clockType === "in" && nextPendingShift?.project_id) {
      setSelectedJob(nextPendingShift.project_id);
    } else if (clockType === "in") {
      setSelectedJob("0");
    }
    void captureGps();
  }, [
    visible,
    clockType,
    isJobLocked,
    lockedJobType,
    nextPendingShift?.project_id,
    resetForm,
    captureGps
  ]);

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

    const timeHHMM = hasUnrestrictedClock
      ? from12hParts(hour12, minute, amPm)
      : buildRoundedTimeHHMM();

    const [hours, mins] = timeHHMM.split(":").map(Number);
    const [year, month, day] = selectedDate.split("-").map(Number);
    const selectedDateTime = new Date(year, month - 1, day, hours, mins, 0);
    const now = new Date();
    if (selectedDateTime.getTime() > now.getTime() + 4 * 60 * 1000) {
      Alert.alert("Invalid time", "Clock-in/out cannot be in the future.");
      return;
    }

    if (clockType === "out" && openAttendance?.clock_in_time) {
      const clockInDate = new Date(openAttendance.clock_in_time);
      if (selectedDateTime <= clockInDate) {
        Alert.alert("Invalid time", "Clock-out time must be after clock-in time.");
        return;
      }
      if (insertBreak) {
        const breakTotal = parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10);
        const totalMinutes = Math.floor(
          (selectedDateTime.getTime() - clockInDate.getTime()) / (1000 * 60)
        );
        if (breakTotal >= totalMinutes) {
          Alert.alert(
            "Invalid break",
            "Break time cannot be greater than or equal to the total attendance time."
          );
          return;
        }
      }
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

    const timeSelectedLocal = buildTimeSelectedLocal(selectedDate, timeHHMM);
    const breakTotal = insertBreak
      ? parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10)
      : undefined;

    const confirmLabel = `Clock ${clockType} on ${formatShortDate(selectedDate)} at ${formatTime12h(timeHHMM)}${
      selectedJobLabel && selectedJob ? ` for ${selectedJobLabel}` : ""
    }?`;

    Alert.alert(`Confirm Clock ${clockType === "in" ? "In" : "Out"}`, confirmLabel, [
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
                  time_selected_local: timeSelectedLocal,
                  manual_break_minutes: breakTotal,
                  gps: gpsPayload
                });
              } else {
                const jobType =
                  getJobTypeFromAttendance(openAttendance) ?? lockedJobType ?? "0";
                await postDirectAttendance({
                  type: "out",
                  time_selected_local: timeSelectedLocal,
                  job_type: jobType,
                  manual_break_minutes: breakTotal,
                  gps: gpsPayload
                });
              }
            } else if (targetShiftId) {
              await postAttendance({
                shift_id: targetShiftId,
                type: "in",
                time_selected_local: timeSelectedLocal,
                gps: gpsPayload
              });
            } else {
              await postDirectAttendance({
                type: "in",
                time_selected_local: timeSelectedLocal,
                job_type: selectedJob,
                gps: gpsPayload
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
    ]);
  };

  if (!clockType) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Clock {clockType === "in" ? "In" : "Out"}
          </Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatShortDate(selectedDate)}</Text>

          <Text style={styles.label}>Time</Text>
          <TimePickerCard
            hour12={hour12}
            minute={minute}
            amPm={amPm}
            editable={hasUnrestrictedClock}
            onChangeHour={setHour12}
            onChangeMinute={setMinute}
            onChangeAmPm={setAmPm}
            onUseNow={() => {
              const now12 = to12hParts(buildRoundedTimeHHMM());
              setHour12(now12.hour12);
              setMinute(now12.minute);
              setAmPm(now12.amPm);
            }}
          />
          {!hasUnrestrictedClock ? (
            <Text style={styles.hint}>
              Time is locked to now unless your account has unrestricted clock editing.
            </Text>
          ) : null}

          <Text style={styles.label}>Job</Text>
          <Pressable
            style={[styles.jobButton, isJobLocked && styles.jobButtonLocked]}
            disabled={isJobLocked}
            onPress={() => setJobPickerOpen(true)}
          >
            <Text
              style={[styles.jobButtonText, !selectedJob && styles.jobPlaceholder]}
              numberOfLines={1}
            >
              {selectedJobLabel}
            </Text>
            {!isJobLocked ? (
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            ) : null}
          </Pressable>
          {isJobLocked ? (
            <Text style={styles.hint}>Job is locked from your open clock-in.</Text>
          ) : (
            <Text style={styles.hint}>
              Pre-filled from your scheduled shift when applicable.
            </Text>
          )}

          {clockType === "out" ? (
            <View style={styles.breakBlock}>
              <View style={styles.breakHeader}>
                <Text style={styles.labelInline}>Insert break time</Text>
                <Switch
                  value={insertBreak}
                  onValueChange={setInsertBreak}
                  trackColor={{ true: colors.primary, false: "#d1d5db" }}
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
          ) : null}

          <Text style={styles.label}>Location</Text>
          <Text style={styles.value}>
            {gpsLoading
              ? "Getting GPS…"
              : gps
                ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${Math.round(gps.accuracy_m)}m)`
                : "GPS unavailable (you can still submit)"}
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <MKButton title="Cancel" variant="secondary" onPress={handleClose} style={styles.footerBtn} />
          <MKButton
            title={clockType === "in" ? "Clock In" : "Clock Out"}
            onPress={handleSubmit}
            loading={submitting}
            disabled={submitting || (clockType === "in" && !selectedJob)}
            style={styles.footerBtn}
          />
        </View>
      </View>

      <Modal visible={jobPickerOpen} animationType="slide" onRequestClose={() => setJobPickerOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Select Job</Text>
            <Pressable onPress={() => setJobPickerOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
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
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} />
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
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
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
    </Modal>
  );
};

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES_5 = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);

function cycleValue(values: string[], current: string, delta: number): string {
  const idx = Math.max(0, values.indexOf(current));
  const next = (idx + delta + values.length) % values.length;
  return values[next];
}

const TimePickerCard: React.FC<{
  hour12: string;
  minute: string;
  amPm: "AM" | "PM";
  editable: boolean;
  onChangeHour: (v: string) => void;
  onChangeMinute: (v: string) => void;
  onChangeAmPm: (v: "AM" | "PM") => void;
  onUseNow: () => void;
}> = ({
  hour12,
  minute,
  amPm,
  editable,
  onChangeHour,
  onChangeMinute,
  onChangeAmPm,
  onUseNow
}) => {
  const displayHour = hour12.padStart(2, "0");

  return (
    <View style={[styles.timeCard, !editable && styles.timeCardLocked]}>
      <View style={styles.timeHero}>
        <Text style={styles.timeHeroDigits}>
          {displayHour}
          <Text style={styles.timeHeroColon}>:</Text>
          {minute}
        </Text>
        <View style={styles.amPmSegment}>
          {(["AM", "PM"] as const).map((period) => {
            const active = amPm === period;
            return (
              <Pressable
                key={period}
                disabled={!editable}
                onPress={() => onChangeAmPm(period)}
                style={[
                  styles.amPmOption,
                  active && styles.amPmOptionActive,
                  !editable && styles.amPmOptionDisabled
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

      {editable ? (
        <>
          <View style={styles.stepperRow}>
            <StepperField
              label="Hour"
              value={hour12}
              onDecrement={() => onChangeHour(cycleValue(HOURS_12, hour12, -1))}
              onIncrement={() => onChangeHour(cycleValue(HOURS_12, hour12, 1))}
            />
            <View style={styles.stepperDivider} />
            <StepperField
              label="Minute"
              value={minute}
              onDecrement={() => onChangeMinute(cycleValue(MINUTES_5, minute, -1))}
              onIncrement={() => onChangeMinute(cycleValue(MINUTES_5, minute, 1))}
            />
          </View>
          <Pressable onPress={onUseNow} style={styles.useNowBtn} hitSlop={6}>
            <Ionicons name="refresh-outline" size={16} color={colors.primary} />
            <Text style={styles.useNowText}>Use current time</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.lockedCaption}>Using current time</Text>
      )}
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
        hitSlop={4}
      >
        <Ionicons name="remove" size={20} color={colors.textPrimary} />
      </Pressable>
      <Text style={styles.stepperValue}>{value}</Text>
      <Pressable
        onPress={onIncrement}
        style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
        hitSlop={4}
      >
        <Ionicons name="add" size={20} color={colors.textPrimary} />
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card
  },
  headerTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  body: {
    padding: spacing.xl,
    gap: spacing.sm,
    paddingBottom: spacing.xxl
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: spacing.md
  },
  labelInline: {
    ...typography.body,
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  },
  value: {
    ...typography.body,
    color: colors.textPrimary
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted
  },
  timeCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md
  },
  timeCardLocked: {
    backgroundColor: "#f9fafb"
  },
  timeHero: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  timeHeroDigits: {
    fontFamily: typography.title.fontFamily,
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: 1,
    color: colors.textPrimary
  },
  timeHeroColon: {
    color: colors.primary
  },
  amPmSegment: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: radius.pill,
    padding: 3,
    gap: 2
  },
  amPmOption: {
    minWidth: 64,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center"
  },
  amPmOptionActive: {
    backgroundColor: colors.primary
  },
  amPmOptionDisabled: {
    opacity: 0.85
  },
  amPmOptionText: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textMuted
  },
  amPmOptionTextActive: {
    color: "#ffffff"
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md
  },
  stepperDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm
  },
  stepperField: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm
  },
  stepperLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  stepperBtnPressed: {
    backgroundColor: "#fef2f2",
    borderColor: colors.primary
  },
  stepperValue: {
    minWidth: 36,
    textAlign: "center",
    fontFamily: typography.button.fontFamily,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary
  },
  useNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  useNowText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  lockedCaption: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center"
  },
  breakSteppers: {
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.sm
  },
  jobButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  jobButtonLocked: {
    backgroundColor: "#f3f4f6"
  },
  jobButtonText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm
  },
  jobPlaceholder: {
    color: colors.textMuted
  },
  breakBlock: {
    marginTop: spacing.md,
    gap: spacing.sm
  },
  breakHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card
  },
  footerBtn: {
    flex: 1
  },
  search: {
    marginHorizontal: spacing.xl,
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  jobRowActive: {
    backgroundColor: "#fef2f2"
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
