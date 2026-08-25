import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

const GLOBE_BG = require("../../../assets/brand/globe.png");
const CLOCK_WATERMARK = require("../../../assets/brand/clock-watermark.png");
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

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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
  const isToday = selectedDate === todayStr;
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
        <Image
          source={GLOBE_BG}
          style={styles.globeBg}
          resizeMode="contain"
          tintColor={colors.textMuted}
          pointerEvents="none"
        />
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
      <Image
        source={GLOBE_BG}
        style={styles.globeBg}
        resizeMode="contain"
        tintColor={colors.textMuted}
        pointerEvents="none"
      />
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

        <Pressable
          onPress={() => {
            setEditingAttendance(null);
            setClockType("in");
          }}
          style={({ pressed }) => [styles.logBtnWrap, pressed && styles.logBtnPressed]}
        >
          <LinearGradient
            colors={["#22C55E", ACCENT, "#0E5A27"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logBtn}
          >
            <Image
              source={CLOCK_WATERMARK}
              style={styles.logBtnWatermark}
              resizeMode="contain"
              pointerEvents="none"
            />
            <View style={styles.logBtnIcon}>
              <Ionicons name="stopwatch" size={22} color={ACCENT} />
            </View>
            <Text style={styles.logBtnText}>Log hours</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>

        {hasOpenClockIn && canClockOut ? (
          <Pressable
            style={styles.clockOutBtn}
            onPress={() => {
              setEditingAttendance(null);
              setClockType("out");
            }}
          >
            <Ionicons name="log-out-outline" size={18} color={CLOCK_OUT} />
            <Text style={styles.clockOutBtnText}>Clock out</Text>
          </Pressable>
        ) : null}

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
    paddingBottom: spacing.md,
    overflow: "hidden",
    position: "relative"
  },
  globeBg: {
    position: "absolute",
    width: 640,
    height: 640,
    right: -255,
    bottom: -40,
    opacity: 0.06
  },
  scroll: { flex: 1, zIndex: 1 },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
    zIndex: 1
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
    alignItems: "center",
    zIndex: 1
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
  logBtnWrap: {
    borderRadius: 18,
    overflow: "hidden",
    ...shadows.cardElevated
  },
  logBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }]
  },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 84,
    paddingVertical: 20,
    paddingHorizontal: 16,
    overflow: "hidden"
  },
  logBtnWatermark: {
    position: "absolute",
    right: -28,
    bottom: -48,
    width: 136,
    height: 136,
    opacity: 0.3
  },
  logBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  logBtnText: {
    flex: 1,
    color: "#fff",
    fontFamily: typography.button.fontFamily,
    fontSize: 18
  },
  clockOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2"
  },
  clockOutBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: CLOCK_OUT
  },
  timesheetLink: {
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
