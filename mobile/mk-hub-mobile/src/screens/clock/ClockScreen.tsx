import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius } from "../../theme/radius";
import { MKBadge } from "../../components/MKBadge";
import { MKCard } from "../../components/MKCard";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { ScreenLayout } from "../../components/ScreenLayout";
import { ClockActionTile } from "../../components/clock/ClockActionTile";
import { ClockActionModal } from "../../components/clock/ClockActionModal";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { typography } from "../../theme/typography";
import { formatDateLocal } from "../../lib/dateUtils";
import {
  formatJobPickerLine,
  getPredefinedJob
} from "../../constants/predefinedJobs";
import {
  addDays,
  formatClockTimestamp,
  formatMinutesLabel,
  formatShortDate,
  formatTime12h,
  getClockStateForDate,
  getJobTypeFromAttendance,
  getWeekStartSunday,
  getWeeklyAttendanceSummary
} from "../../services/shifts";
import { toApiError } from "../../services/api";
import type {
  ClockDayState,
  ShiftAttendanceResponse,
  WeeklySummary
} from "../../types/shifts";

function attendanceBadgeVariant(
  status: string
): "success" | "warning" | "danger" {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  return "danger";
}

function resolveJobName(
  attendance: ShiftAttendanceResponse,
  dayState: ClockDayState
): string | null {
  if (attendance.shift_id) {
    const shift =
      dayState.allShifts.find((s) => s.id === attendance.shift_id) ||
      dayState.shifts.find((s) => s.id === attendance.shift_id);
    if (shift?.project_name) return shift.project_name;
  }
  const jobType = getJobTypeFromAttendance(attendance);
  if (!jobType) return null;
  const pre = getPredefinedJob(jobType);
  if (pre) return formatJobPickerLine(pre);
  return jobType;
}

export const ClockScreen: React.FC = () => {
  const { user, permissions, roles } = useAuth();
  const { openMenu } = useHubMenu();

  const todayStr = useMemo(() => formatDateLocal(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dayState, setDayState] = useState<ClockDayState | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStartSunday());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clockType, setClockType] = useState<"in" | "out" | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const weekStartStr = useMemo(() => formatDateLocal(weekStart), [weekStart]);

  const loadDay = useCallback(async () => {
    if (!user) return;
    const state = await getClockStateForDate(selectedDate, user.id);
    setDayState(state);
  }, [user, selectedDate]);

  const loadWeek = useCallback(async () => {
    if (!user) return;
    const summary = await getWeeklyAttendanceSummary(weekStartStr, user.id);
    setWeeklySummary(summary);
  }, [user, weekStartStr]);

  const loadAll = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      await Promise.all([loadDay(), loadWeek()]);
    } catch (err) {
      Alert.alert("Could not load clock data", toApiError(err).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, loadDay, loadWeek]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openAttendance = dayState?.openAttendance ?? null;
  const hasOpenClockIn = !!openAttendance;
  const canClockOut =
    hasOpenClockIn &&
    (!!openAttendance?.status
      ? openAttendance.status === "approved" || openAttendance.status === "pending"
      : true);
  const canClockIn = !hasOpenClockIn;

  useEffect(() => {
    if (!hasOpenClockIn) return;
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, [hasOpenClockIn]);

  useEffect(() => {
    setExpandedIds(new Set());
  }, [selectedDate]);

  const attendanceWorkedMinutes = useCallback(
    (attendance: ShiftAttendanceResponse, now: Date): number => {
      if (!attendance.clock_in_time) return 0;
      const start = new Date(attendance.clock_in_time).getTime();
      const end = attendance.clock_out_time
        ? new Date(attendance.clock_out_time).getTime()
        : now.getTime();
      const raw = Math.max(0, Math.floor((end - start) / (1000 * 60)));
      const breakMins = attendance.clock_out_time
        ? attendance.break_minutes || 0
        : 0;
      return Math.max(0, raw - breakMins);
    },
    []
  );

  const attendancesToShow = useMemo(() => {
    if (!dayState) return [] as ShiftAttendanceResponse[];
    const rows: ShiftAttendanceResponse[] = [];
    const seen = new Set<string>();

    const pushUnique = (att: ShiftAttendanceResponse) => {
      const key =
        att.id ||
        `${att.shift_id || "direct"}-${att.clock_in_time || ""}-${att.clock_out_time || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(att);
    };

    if (openAttendance) pushUnique(openAttendance);
    for (const att of dayState.completeAttendances) {
      pushUnique(att);
    }

    // Also include any other open/partial rows from raw list (deduped)
    for (const att of dayState.attendances) {
      if (!att.clock_in_time && !att.clock_out_time) continue;
      if (att.clock_in_time && att.clock_out_time) continue; // already via complete
      pushUnique(att);
    }

    return rows.sort((a, b) => {
      const aT = new Date(a.clock_in_time || a.time_selected_utc || "").getTime();
      const bT = new Date(b.clock_in_time || b.time_selected_utc || "").getTime();
      return aT - bT;
    });
  }, [dayState, openAttendance]);

  const dayTotalSecondsLive = useMemo(() => {
    if (!attendancesToShow.length) return 0;
    let totalSec = 0;
    for (const a of attendancesToShow) {
      if (!a.clock_in_time) continue;
      const start = new Date(a.clock_in_time).getTime();
      const end = a.clock_out_time
        ? new Date(a.clock_out_time).getTime()
        : currentTime.getTime();
      const rawSec = Math.max(0, Math.floor((end - start) / 1000));
      const breakSec = a.clock_out_time ? (a.break_minutes || 0) * 60 : 0;
      totalSec += Math.max(0, rawSec - breakSec);
    }
    return totalSec;
  }, [attendancesToShow, currentTime]);

  const workingDurationLive = useMemo(() => {
    if (!hasOpenClockIn || !openAttendance?.clock_in_time) return null;
    const mins = attendanceWorkedMinutes(openAttendance, currentTime);
    return formatMinutesLabel(mins);
  }, [hasOpenClockIn, openAttendance, currentTime, attendanceWorkedMinutes]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatTimerClock = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (hasOpenClockIn) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const dateLabel = useMemo(() => {
    const d = new Date(`${selectedDate}T00:00:00`);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric"
    });
  }, [selectedDate]);

  const weekRangeLabel = useMemo(() => {
    if (!weeklySummary) return "";
    return `${formatShortDate(weeklySummary.week_start)} - ${formatShortDate(weeklySummary.week_end)}`;
  }, [weeklySummary]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  const goPrevDay = () => setSelectedDate((d) => addDays(d, -1));
  const goNextDay = () => setSelectedDate((d) => addDays(d, 1));
  const goToday = () => setSelectedDate(todayStr);

  const goPrevWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() - 7);
    setWeekStart(next);
  };
  const goNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };
  const goCurrentWeek = () => setWeekStart(getWeekStartSunday());

  if (loading && !dayState) {
    return (
      <ScreenLayout scroll={false}>
        <MKHomeStyleHeader
          title="Clock In / Out"
          subtitle={dateLabel}
          onLeftPress={openMenu}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading attendance…</Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader
        title="Clock In / Out"
        subtitle="Track your work hours"
        onLeftPress={openMenu}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <MKCard style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Clock Actions</Text>
            <View style={styles.dateNav}>
              <Pressable onPress={goPrevDay} hitSlop={8} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
              </Pressable>
              <Pressable onPress={goToday} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>
                  {selectedDate === todayStr ? "Today" : formatShortDate(selectedDate)}
                </Text>
              </Pressable>
              <Pressable onPress={goNextDay} hitSlop={8} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.actionsStack}>
            <ClockActionTile
              kind="in"
              enabled={canClockIn}
              onPress={() => setClockType("in")}
              hint={
                hasOpenClockIn
                  ? "You must clock out first"
                  : dayState?.nextPendingShift
                    ? `Next: ${dayState.nextPendingShift.project_name || "Shift"}`
                    : "No shift required — pick a job"
              }
            />
            <ClockActionTile
              kind="out"
              enabled={canClockOut}
              onPress={() => setClockType("out")}
              hint={
                !hasOpenClockIn
                  ? "No open clock-in"
                  : workingDurationLive
                    ? `Working for ${workingDurationLive}`
                    : "End your current session"
              }
            />
          </View>
        </MKCard>

        <MKCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            {selectedDate === todayStr
              ? "Today Status"
              : `Status — ${formatShortDate(selectedDate)}`}
          </Text>

          <View style={[styles.totalTimerCard, hasOpenClockIn && styles.totalTimerCardLive]}>
            <Text style={styles.totalTimerLabel}>
              {hasOpenClockIn ? "Hours worked (live)" : "Total hours worked"}
            </Text>
            <Text style={styles.totalTimerValue}>
              {formatTimerClock(dayTotalSecondsLive)}
            </Text>
            <Text style={styles.totalTimerSub}>
              {attendancesToShow.length === 0
                ? "No entries yet"
                : `${attendancesToShow.length} entr${attendancesToShow.length === 1 ? "y" : "ies"} · ${formatMinutesLabel(Math.floor(dayTotalSecondsLive / 60))}`}
              {hasOpenClockIn ? " · clocked in" : ""}
            </Text>
          </View>

          {attendancesToShow.length === 0 ? (
            <Text style={styles.emptyText}>No attendance records for this date.</Text>
          ) : (
            <View style={styles.entriesList}>
              {attendancesToShow.map((attendance, index) => {
                const id = `${attendance.id || "att"}-${index}`;
                const expandKey = attendance.id || id;
                const expanded = expandedIds.has(expandKey);
                const isOpen = !attendance.clock_out_time;
                const isComplete = !!(
                  attendance.clock_in_time && attendance.clock_out_time
                );
                const jobName = dayState
                  ? resolveJobName(attendance, dayState)
                  : null;
                const workedMins = attendanceWorkedMinutes(
                  attendance,
                  currentTime
                );
                const inLabel = formatClockTimestamp(attendance.clock_in_time);
                const outLabel = isOpen
                  ? "Now"
                  : formatClockTimestamp(attendance.clock_out_time);

                return (
                  <View key={id} style={styles.entryCard}>
                    <Pressable
                      onPress={() => toggleExpanded(expandKey)}
                      style={styles.entryHeader}
                    >
                      <View
                        style={[
                          styles.entryDot,
                          {
                            backgroundColor: isOpen
                              ? colors.success
                              : colors.textMuted
                          }
                        ]}
                      />
                      <View style={styles.entryMain}>
                        <Text style={styles.entryTimeRange}>
                          {inLabel} – {outLabel}
                        </Text>
                        <Text style={styles.entryJob} numberOfLines={1}>
                          {jobName || (isOpen ? "Open session" : "Completed")}
                        </Text>
                      </View>
                      <Text style={styles.entryDuration}>
                        {formatMinutesLabel(workedMins)}
                      </Text>
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.textMuted}
                      />
                    </Pressable>

                    {expanded ? (
                      <View style={styles.entryDetails}>
                        <View style={styles.metaRow}>
                          <Text style={styles.metaLabel}>Status</Text>
                          <Text
                            style={[
                              styles.metaValue,
                              {
                                color: isOpen
                                  ? colors.success
                                  : colors.textBody
                              }
                            ]}
                          >
                            {isOpen ? "Clocked In" : "Completed"}
                          </Text>
                        </View>
                        {attendance.clock_in_time ? (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Clock-in</Text>
                            <Text style={styles.metaValue}>{inLabel}</Text>
                          </View>
                        ) : null}
                        {isComplete && attendance.clock_out_time ? (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Clock-out</Text>
                            <Text style={styles.metaValue}>{outLabel}</Text>
                          </View>
                        ) : null}
                        {isComplete ? (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Break</Text>
                            <Text style={styles.metaValue}>
                              {formatMinutesLabel(attendance.break_minutes || 0)}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.metaRow}>
                          <Text style={styles.metaLabel}>Worked</Text>
                          <Text style={styles.metaValue}>
                            {formatMinutesLabel(workedMins)}
                          </Text>
                        </View>
                        {attendance.status ? (
                          <View style={styles.metaRow}>
                            <Text style={styles.metaLabel}>Approval</Text>
                            <MKBadge
                              variant={attendanceBadgeVariant(attendance.status)}
                            >
                              {attendance.status}
                            </MKBadge>
                          </View>
                        ) : null}
                        {jobName ? (
                          <View style={styles.jobHint}>
                            <Ionicons
                              name="briefcase-outline"
                              size={14}
                              color="#3b82f6"
                            />
                            <Text style={styles.jobHintText}>Job: {jobName}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.noticeBox}>
            {hasOpenClockIn ? (
              <Text style={styles.noticeText}>
                You have an open clock-in. Clock out to close this period.
              </Text>
            ) : dayState?.nextPendingShift ? (
              <Text style={styles.noticeText}>
                Next scheduled shift:{" "}
                {dayState.nextPendingShift.project_name || "Unknown"} (
                {formatTime12h(dayState.nextPendingShift.start_time)} –{" "}
                {formatTime12h(dayState.nextPendingShift.end_time)})
              </Text>
            ) : dayState && dayState.shifts.length > 0 ? (
              <Text style={styles.noticeText}>
                All scheduled shifts are completed for this date.
              </Text>
            ) : (
              <Text style={styles.noticeText}>
                No scheduled shifts for this date. You can still clock in with a job.
              </Text>
            )}
          </View>
        </MKCard>

        <MKCard style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Weekly Summary</Text>
            <View style={styles.dateNav}>
              <Pressable onPress={goPrevWeek} hitSlop={8} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
              </Pressable>
              <Pressable onPress={goCurrentWeek} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>Today</Text>
              </Pressable>
              <Pressable onPress={goNextWeek} hitSlop={8} style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          {weeklySummary ? (
            <>
              <Text style={styles.weekRange}>{weekRangeLabel}</Text>
              <View style={styles.metricsGrid}>
                <Metric
                  label="Total Hours"
                  value={weeklySummary.total_hours_formatted || "0h 00m"}
                />
                <Metric
                  label="Break Time"
                  value={weeklySummary.total_break_formatted || "0h 00m"}
                />
                <Metric
                  label="Regular Hours"
                  value={weeklySummary.reg_hours_formatted || "0h 00m"}
                />
                <Metric label="Overtime" value="0h 00m" />
              </View>

              <Text style={styles.breakdownTitle}>Daily Breakdown</Text>
              {weeklySummary.days.map((day, index) => {
                const hasHours =
                  day.clock_in ||
                  day.clock_out ||
                  (day.hours_worked_minutes && day.hours_worked_minutes > 0);
                if (!hasHours) return null;
                const inT = day.clock_in ? formatClockTimestamp(day.clock_in) : null;
                const outT = day.clock_out ? formatClockTimestamp(day.clock_out) : null;
                const range =
                  inT && outT ? `${inT} – ${outT}` : inT ? `${inT} – --:--` : null;
                const uniqueKey = `${day.date}-${day.clock_in || "no-in"}-${day.clock_out || "no-out"}-${index}`;
                return (
                  <Pressable
                    key={uniqueKey}
                    style={styles.dayRow}
                    onPress={() => setSelectedDate(day.date)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayName}>
                        {day.day_name} · {formatShortDate(day.date)}
                      </Text>
                      {range ? <Text style={styles.dayRange}>{range}</Text> : null}
                      {day.job_name ? (
                        <Text style={styles.dayJob} numberOfLines={1}>
                          {day.job_name}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.dayHours}>
                      {day.hours_worked_formatted || "0h"}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <Text style={styles.emptyText}>No weekly summary available.</Text>
          )}
        </MKCard>
      </ScrollView>

      <ClockActionModal
        visible={!!clockType}
        clockType={clockType}
        selectedDate={selectedDate}
        shifts={dayState?.shifts ?? []}
        openAttendance={openAttendance}
        nextPendingShift={dayState?.nextPendingShift ?? null}
        permissions={permissions}
        roles={roles}
        onClose={() => setClockType(null)}
        onSuccess={() => {
          setClockType(null);
          loadAll();
        }}
      />
    </ScreenLayout>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted
  },
  sectionCard: {
    gap: spacing.md
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  todayBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card
  },
  todayBtnText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  },
  actionsStack: {
    gap: spacing.sm
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  totalTimerCard: {
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.xs
  },
  totalTimerCardLive: {
    backgroundColor: "#ecfdf5",
    borderColor: "#bbf7d0"
  },
  totalTimerLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  totalTimerValue: {
    fontFamily: typography.title.fontFamily,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: 1,
    color: colors.textPrimary
  },
  totalTimerSub: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  },
  entriesList: {
    gap: spacing.sm
  },
  entryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    overflow: "hidden"
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md
  },
  entryDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  entryMain: {
    flex: 1,
    gap: 2
  },
  entryTimeRange: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  },
  entryJob: {
    ...typography.caption,
    color: colors.textMuted
  },
  entryDuration: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  },
  entryDetails: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  metaValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  },
  jobHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  jobHintText: {
    ...typography.bodySmall,
    color: colors.textBody,
    flex: 1
  },
  noticeBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md
  },
  noticeText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  weekRange: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    textTransform: "uppercase"
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  metric: {
    width: "47%",
    gap: 2
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    fontSize: 10
  },
  metricValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  },
  breakdownTitle: {
    ...typography.caption,
    color: colors.textBody,
    textTransform: "uppercase",
    fontFamily: typography.button.fontFamily,
    marginTop: spacing.sm
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  dayName: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  },
  dayRange: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2
  },
  dayJob: {
    ...typography.caption,
    color: colors.textBody,
    marginTop: 2
  },
  dayHours: {
    ...typography.body,
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  }
});
