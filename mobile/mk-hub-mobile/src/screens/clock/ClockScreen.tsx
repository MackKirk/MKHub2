import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { ScreenLayout } from "../../components/ScreenLayout";
import { ClockActionModal } from "../../components/clock/ClockActionModal";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { typography } from "../../theme/typography";
import { formatDateLocal } from "../../lib/dateUtils";
import {
  addDays,
  formatClockTimestamp,
  formatMinutesLabel,
  formatShortDate,
  formatTime12h,
  getClockStateForDate,
  getWeekStartSunday,
  getWeeklyAttendanceSummary,
  isAttendanceHrLocked
} from "../../services/shifts";
import { toApiError } from "../../services/api";
import { consumeClockLogRequest } from "../../lib/clockNavigation";
import { syncHoursReminder } from "../../lib/hoursReminderNotifications";
import type {
  ClockDayState,
  ShiftAttendanceResponse,
  WeeklySummary,
  WeeklySummaryDay
} from "../../types/shifts";

const ACCENT = colors.homeAccent;
const CLOCK_OUT = "#a31414";
const TIMESHEET_BLUE = "#2563EB";
const RAIL_WIDTH = 6;

function darkenHex(hex: string, amount = 0.28): string {
  const raw = hex.replace("#", "");
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function formatHoursMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function capitalizeWeekday(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
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
  const [editingAttendance, setEditingAttendance] =
    useState<ShiftAttendanceResponse | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showDateNav, setShowDateNav] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

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

  useFocusEffect(
    useCallback(() => {
      const pending = consumeClockLogRequest();
      if (!pending) return;
      setSelectedDate(pending.date);
      const [y, m, d] = pending.date.split("-").map(Number);
      setWeekStart(getWeekStartSunday(new Date(y, m - 1, d)));
      if (pending.openLog) {
        setEditingAttendance(null);
        setClockType("in");
      }
    }, [])
  );

  const openAttendance = dayState?.openAttendance ?? null;
  const hasOpenClockIn = !!openAttendance;
  const canClockOut =
    hasOpenClockIn &&
    (!!openAttendance?.status
      ? openAttendance.status === "approved" || openAttendance.status === "pending"
      : true);
  const canClockIn = !hasOpenClockIn;

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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

    for (const att of dayState.attendances) {
      if (!att.clock_in_time && !att.clock_out_time) continue;
      if (att.clock_in_time && att.clock_out_time) continue;
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

  const weekRangeLabel = useMemo(() => {
    if (weeklySummary) {
      return `${formatShortDate(weeklySummary.week_start)} – ${formatShortDate(weeklySummary.week_end)}`;
    }
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return `${formatShortDate(weekStartStr)} – ${formatShortDate(formatDateLocal(end))}`;
  }, [weeklySummary, weekStart, weekStartStr]);

  const closeClockModal = () => {
    setClockType(null);
    setEditingAttendance(null);
  };

  const weeklyDayToAttendance = useCallback(
    (day: WeeklySummaryDay): ShiftAttendanceResponse | null => {
      if (!day.attendance_id) return null;
      return {
        id: day.attendance_id,
        shift_id: day.shift_id ?? null,
        worker_id: user?.id ?? "",
        type: "in",
        clock_in_time: day.clock_in,
        clock_out_time: day.clock_out,
        time_selected_utc: day.clock_in,
        status: day.status || day.clock_in_status || "pending",
        reason_text: day.reason_text,
        job_type: day.job_type,
        service_item: day.service_item,
        break_minutes: day.break_minutes,
        approved_by: day.approved_by,
        can_edit: day.can_edit
      };
    },
    [user?.id]
  );

  const openRecordForEdit = useCallback(
    (day: WeeklySummaryDay) => {
      if (!day.clock_out || !day.attendance_id) {
        setSelectedDate(day.date);
        return;
      }
      if (isAttendanceHrLocked(day, user?.id)) {
        Alert.alert(
          "Hours locked",
          "These hours were approved by HR and can no longer be edited. Please ask HR to make any changes."
        );
        return;
      }
      const record = weeklyDayToAttendance(day);
      if (!record) {
        setSelectedDate(day.date);
        return;
      }
      setSelectedDate(day.date);
      setEditingAttendance(record);
      setClockType("in");
    },
    [user?.id, weeklyDayToAttendance]
  );

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
  const isCurrentWeek = weekStartStr === formatDateLocal(getWeekStartSunday());

  const nextShift = dayState?.nextPendingShift ?? null;
  const shiftSubtitle = hasOpenClockIn
    ? workingDurationLive
      ? `Working for ${workingDurationLive}`
      : "Open session"
    : nextShift
      ? `Next shift ${formatTime12h(nextShift.start_time)}`
      : null;
  const clockStatusLabel = hasOpenClockIn ? "Clocked in" : null;
  const hoursTodayLabel = formatHoursMinutes(Math.floor(dayTotalSecondsLive / 60));
  const isToday = selectedDate === todayStr;
  const todayTag = isToday ? "TODAY" : formatShortDate(selectedDate).toUpperCase();
  const heroRail = hasOpenClockIn ? ACCENT : CLOCK_OUT;
  const weekHoursLabel = useMemo(() => {
    if (!weeklySummary) return "0h 00m";
    const todayDay = weeklySummary.days.find((day) => day.date === todayStr);
    if (!todayDay) return weeklySummary.total_hours_formatted || "0h 00m";
    const withoutToday = Math.max(
      0,
      (weeklySummary.total_minutes || 0) - (todayDay.hours_worked_minutes || 0)
    );
    const todayMinutes =
      selectedDate === todayStr
        ? Math.floor(dayTotalSecondsLive / 60)
        : todayDay.hours_worked_minutes || 0;
    return formatHoursMinutes(withoutToday + todayMinutes);
  }, [weeklySummary, todayStr, selectedDate, dayTotalSecondsLive]);

  const infoBanner = hasOpenClockIn
    ? "You have an open clock-in. Clock out to close this period."
    : nextShift
      ? `Next scheduled shift: ${nextShift.project_name || "Unknown"} (${formatTime12h(nextShift.start_time)} – ${formatTime12h(nextShift.end_time)})`
      : "At the end of the day, log your start time, end time, and any break.";

  const header = (
    <View style={styles.topHeader}>
      <TouchableOpacity
        style={styles.headerIconBtn}
        onPress={openMenu}
        activeOpacity={0.75}
        hitSlop={8}
      >
        <Ionicons name="menu" size={22} color={colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        Clock In / Out
      </Text>
      <TouchableOpacity
        style={styles.headerIconBtn}
        onPress={() => setShowDateNav((v) => !v)}
        activeOpacity={0.75}
        hitSlop={8}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.textPrimary} />
        {!isToday ? <View style={styles.headerDot} /> : null}
      </TouchableOpacity>
    </View>
  );

  if (loading && !dayState) {
    return (
      <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
        {header}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>Loading attendance…</Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ACCENT}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {showDateNav ? (
          <View style={styles.dateNav}>
            <Pressable onPress={goPrevDay} hitSlop={8} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={16} color={colors.textPrimary} />
            </Pressable>
            <Pressable onPress={goToday} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>
                {isToday ? "Today" : formatShortDate(selectedDate)}
              </Text>
            </Pressable>
            <Pressable onPress={goNextDay} hitSlop={8} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.todayCard}>
          <LinearGradient
            colors={[darkenHex(heroRail), heroRail]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.cardRail}
          />
          <View style={styles.todayBody}>
            <View style={styles.todayTagRow}>
              <View style={styles.todayTagChip}>
                <Ionicons name="calendar-outline" size={12} color={ACCENT} />
                <Text style={styles.todayTag}>{todayTag}</Text>
              </View>
              {clockStatusLabel ? (
                <View style={[styles.statusChip, styles.statusChipIn]}>
                  <View style={[styles.statusDot, { backgroundColor: ACCENT }]} />
                  <Text style={[styles.statusChipText, { color: ACCENT }]}>
                    {clockStatusLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.hoursToday}>
              <View style={[styles.summaryIcon, { backgroundColor: "#ECFDF3" }]}>
                <Ionicons name="time-outline" size={18} color={ACCENT} />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryValue}>{hoursTodayLabel}</Text>
                <Text style={styles.summaryLabel}>
                  {isToday ? "Hours today" : formatShortDate(selectedDate)}
                </Text>
              </View>
            </View>

            {shiftSubtitle ? (
              <Text style={styles.statusSub} numberOfLines={1}>
                {shiftSubtitle}
              </Text>
            ) : null}

            <Pressable
              style={[
                styles.clockBtn,
                { backgroundColor: hasOpenClockIn ? CLOCK_OUT : ACCENT },
                !canClockIn && !canClockOut && styles.clockBtnDisabled
              ]}
              disabled={!canClockIn && !canClockOut}
              onPress={() => {
                setEditingAttendance(null);
                setClockType(canClockOut ? "out" : "in");
              }}
            >
              <Ionicons
                name={hasOpenClockIn ? "stop" : "play"}
                size={16}
                color="#fff"
              />
              <Text style={styles.clockBtnText}>
                {hasOpenClockIn ? "Clock Out" : "Log hours"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Pressable onPress={goPrevWeek} hitSlop={4} style={styles.weekNavBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={goCurrentWeek}
              style={[
                styles.weekRangeBtn,
                isCurrentWeek && styles.weekRangeBtnCurrent
              ]}
            >
              <Text
                style={[
                  styles.weekRange,
                  isCurrentWeek && styles.weekRangeCurrent
                ]}
                numberOfLines={1}
              >
                {weekRangeLabel}
              </Text>
              {isCurrentWeek ? (
                <Text style={styles.weekNowHint}>this week</Text>
              ) : null}
            </Pressable>
            <Pressable onPress={goNextWeek} hitSlop={4} style={styles.weekNavBtn}>
              <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {weeklySummary ? (
            <View style={styles.weekCard}>
              <View style={styles.metricsGrid}>
                <WeekMetric
                  icon="time-outline"
                  label="Total hours"
                  value={weekHoursLabel}
                  tint="#ECFDF3"
                  accent={ACCENT}
                />
                <WeekMetric
                  icon="briefcase-outline"
                  label="Regular"
                  value={weeklySummary.reg_hours_formatted || "0h 00m"}
                  tint="#DBEAFE"
                  accent={TIMESHEET_BLUE}
                />
                <WeekMetric
                  icon="flash-outline"
                  label="Overtime"
                  value="0h 00m"
                  tint="#FFEDD5"
                  accent="#EA580C"
                />
                <WeekMetric
                  icon="cafe-outline"
                  label="Breaks"
                  value={weeklySummary.total_break_formatted || "0h 00m"}
                  tint="#F3F4F6"
                  accent={colors.textMuted}
                />
              </View>

              {weeklySummary.days.some(
                (day) =>
                  day.clock_in ||
                  day.clock_out ||
                  (day.hours_worked_minutes && day.hours_worked_minutes > 0)
              ) ? (
                <View style={styles.breakdown}>
                  {weeklySummary.days.map((day, index) => {
                    const hasHours =
                      day.clock_in ||
                      day.clock_out ||
                      (day.hours_worked_minutes && day.hours_worked_minutes > 0);
                    if (!hasHours) return null;
                    const inT = day.clock_in
                      ? formatClockTimestamp(day.clock_in)
                      : null;
                    const outT = day.clock_out
                      ? formatClockTimestamp(day.clock_out)
                      : null;
                    const range =
                      inT && outT
                        ? `${inT} – ${outT}`
                        : inT
                          ? `${inT} – --:--`
                          : null;
                    const uniqueKey = `${day.date}-${day.clock_in || "no-in"}-${day.clock_out || "no-out"}-${index}`;
                    return (
                      <Pressable
                        key={uniqueKey}
                        style={styles.dayRow}
                        onPress={() => openRecordForEdit(day)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.dayName}>
                            {capitalizeWeekday(day.day_name)} · {formatShortDate(day.date)}
                          </Text>
                          {range ? (
                            <Text style={styles.dayRange}>{range}</Text>
                          ) : null}
                        </View>
                        <Text style={styles.dayHours}>
                          {day.hours_worked_formatted || "0h 00m"}
                        </Text>
                        {day.clock_out && day.attendance_id ? (
                          <Ionicons
                            name={
                              isAttendanceHrLocked(day, user?.id)
                                ? "lock-closed-outline"
                                : "create-outline"
                            }
                            size={16}
                            color={
                              isAttendanceHrLocked(day, user?.id)
                                ? colors.textMuted
                                : ACCENT
                            }
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.emptyText}>No weekly summary available.</Text>
          )}
        </View>

        <View style={styles.infoBanner}>
          <View style={styles.infoIcon}>
            <Ionicons name="information-circle" size={18} color={ACCENT} />
          </View>
          <Text style={styles.infoBannerText}>{infoBanner}</Text>
        </View>

        <View style={styles.timesheetLink}>
          <LinearGradient
            colors={[darkenHex(TIMESHEET_BLUE), TIMESHEET_BLUE]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.cardRail}
          />
          <View style={styles.timesheetBody}>
            <View style={styles.timesheetIcon}>
              <Ionicons name="time-outline" size={18} color={TIMESHEET_BLUE} />
            </View>
            <Text style={styles.timesheetLinkText}>View timesheet</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </View>
        </View>
      </ScrollView>

      <ClockActionModal
        visible={!!clockType}
        clockType={clockType}
        selectedDate={selectedDate}
        shifts={dayState?.shifts ?? []}
        openAttendance={openAttendance}
        nextPendingShift={dayState?.nextPendingShift ?? null}
        editingAttendance={editingAttendance}
        permissions={permissions}
        roles={roles}
        onClose={closeClockModal}
        onSuccess={(loggedDate) => {
          closeClockModal();
          const today = formatDateLocal(new Date());
          if (!loggedDate || loggedDate === today) {
            void syncHoursReminder(true);
          }
          if (loggedDate && loggedDate !== selectedDate) {
            setSelectedDate(loggedDate);
            const [y, m, d] = loggedDate.split("-").map(Number);
            setWeekStart(getWeekStartSunday(new Date(y, m - 1, d)));
            return;
          }
          loadAll();
        }}
      />
    </ScreenLayout>
  );
};

const WeekMetric: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint: string;
  accent: string;
}> = ({ icon, label, value, tint, accent }) => (
  <View style={styles.metric}>
    <View style={[styles.metricIcon, { backgroundColor: tint }]}>
      <Ionicons name={icon} size={16} color={accent} />
    </View>
    <View style={styles.metricCopy}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#fff"
  },
  layout: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingBottom: spacing.md
  },
  scroll: { flex: 1 },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary
  },
  headerDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary
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
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  todayBtn: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border
  },
  todayBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.textPrimary
  },
  todayCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  cardRail: {
    width: RAIL_WIDTH,
    alignSelf: "stretch"
  },
  todayBody: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16
  },
  todayTagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  todayTagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  todayTag: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    letterSpacing: 0.8,
    color: ACCENT
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  statusChipIn: {
    backgroundColor: "#ECFDF3"
  },
  statusChipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0
  },
  summaryValue: {
    fontFamily: typography.button.fontFamily,
    fontSize: 22,
    lineHeight: 26,
    color: colors.textPrimary
  },
  summaryLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 2
  },
  clockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    minHeight: 48,
    paddingVertical: 14,
    marginTop: spacing.md
  },
  clockBtnDisabled: {
    opacity: 0.5
  },
  clockBtnText: {
    color: "#fff",
    fontFamily: typography.button.fontFamily,
    fontSize: 16
  },
  hoursToday: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.md
  },
  statusSub: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.sm
  },
  timesheetLink: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  timesheetBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  timesheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center"
  },
  timesheetLinkText: {
    flex: 1,
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    color: colors.textPrimary
  },
  section: {
    gap: spacing.md
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center"
  },
  weekRangeBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    overflow: "hidden"
  },
  weekRangeBtnCurrent: {
    backgroundColor: "#ECFDF3",
    minHeight: 56,
    paddingBottom: 18
  },
  weekNowHint: {
    position: "absolute",
    right: 8,
    bottom: 4,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.3,
    color: ACCENT
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  },
  weekNavBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  weekRange: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    textAlign: "center"
  },
  weekRangeCurrent: {
    color: ACCENT
  },
  weekCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 8,
    ...shadows.card
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  metric: {
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  metricCopy: {
    flex: 1,
    minWidth: 0
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted
  },
  metricValue: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary
  },
  breakdown: {
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  dayName: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary
  },
  dayRange: {
    fontFamily: typography.body.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: 2
  },
  dayHours: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: "#ECFDF3",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  infoBannerText: {
    flex: 1,
    ...typography.bodySmall,
    color: ACCENT,
    paddingTop: 6
  }
});
