import React, { useCallback, useMemo, useState } from "react";
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
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { ScreenLayout } from "../../components/ScreenLayout";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { typography } from "../../theme/typography";
import { formatDateLocal } from "../../lib/dateUtils";
import {
  addDays,
  formatShortDate,
  formatTime12h,
  getShifts,
  getWeekStartSunday
} from "../../services/shifts";
import { toApiError } from "../../services/api";
import type { ShiftSummary } from "../../types/shifts";

const GLOBE_BG = require("../../../assets/brand/globe.png");
const ACCENT = "#2563EB";
const ACCENT_TINT = "#DBEAFE";
const RAIL_WIDTH = 6;

function darkenHex(hex: string, amount = 0.28): string {
  const raw = hex.replace("#", "");
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function capitalizeWeekday(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short"
  });
}

function shiftMinutes(shift: ShiftSummary): number {
  const [sh, sm] = (shift.start_time || "0:0").split(":").map((n) => parseInt(n, 10) || 0);
  const [eh, em] = (shift.end_time || "0:0").split(":").map((n) => parseInt(n, 10) || 0);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

function formatHoursMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

type DayGroup = {
  date: string;
  shifts: ShiftSummary[];
};

export const ScheduleScreen: React.FC = () => {
  const { openMenu } = useHubMenu();
  const { user } = useAuth();
  const todayStr = useMemo(() => formatDateLocal(new Date()), []);
  const [weekStart, setWeekStart] = useState(() => getWeekStartSunday());
  const [shifts, setShifts] = useState<ShiftSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const weekStartStr = useMemo(() => formatDateLocal(weekStart), [weekStart]);
  const weekEndStr = useMemo(() => addDays(weekStartStr, 6), [weekStartStr]);
  const isCurrentWeek = weekStartStr === formatDateLocal(getWeekStartSunday());

  const weekRangeLabel = useMemo(
    () => `${formatShortDate(weekStartStr)} – ${formatShortDate(weekEndStr)}`,
    [weekStartStr, weekEndStr]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await getShifts(`${weekStartStr},${weekEndStr}`, {
        workerId: user?.id
      });
      setShifts(Array.isArray(rows) ? rows : []);
    } catch (err) {
      Alert.alert("Could not load schedule", toApiError(err).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, weekStartStr, weekEndStr]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const goPrevWeek = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
  };
  const goNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };
  const goCurrentWeek = () => setWeekStart(getWeekStartSunday());

  const dayGroups = useMemo<DayGroup[]>(() => {
    const byDate = new Map<string, ShiftSummary[]>();
    const sorted = [...shifts].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
    for (const shift of sorted) {
      const list = byDate.get(shift.date) ?? [];
      list.push(shift);
      byDate.set(shift.date, list);
    }
    return [...byDate.entries()].map(([date, dayShifts]) => ({
      date,
      shifts: dayShifts
    }));
  }, [shifts]);

  const nextShift = useMemo(() => {
    return (
      [...shifts]
        .filter((s) => s.date >= todayStr)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (a.start_time || "").localeCompare(b.start_time || "");
        })[0] ?? null
    );
  }, [shifts, todayStr]);

  const weekMinutes = useMemo(
    () => shifts.reduce((sum, shift) => sum + shiftMinutes(shift), 0),
    [shifts]
  );

  const nextIsToday = nextShift?.date === todayStr;

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
        Schedule
      </Text>
      <TouchableOpacity
        style={styles.headerIconBtn}
        onPress={goCurrentWeek}
        activeOpacity={0.75}
        hitSlop={8}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.textPrimary} />
        {!isCurrentWeek ? <View style={styles.headerDot} /> : null}
      </TouchableOpacity>
    </View>
  );

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
      {loading && shifts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>Loading schedule…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={ACCENT}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[darkenHex(ACCENT), ACCENT]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.cardRail}
            />
            <View style={styles.heroBody}>
              <View style={styles.heroTagRow}>
                <View style={styles.heroTagChip}>
                  <Ionicons name="calendar-outline" size={12} color={ACCENT} />
                  <Text style={styles.heroTag}>
                    {nextIsToday ? "TODAY" : isCurrentWeek ? "THIS WEEK" : "WEEK"}
                  </Text>
                </View>
                <View style={styles.countChip}>
                  <Text style={styles.countChipText}>
                    {shifts.length === 1 ? "1 shift" : `${shifts.length} shifts`}
                  </Text>
                </View>
              </View>

              <View style={styles.heroSummary}>
                <View style={styles.summaryIcon}>
                  <Ionicons name="time-outline" size={18} color={ACCENT} />
                </View>
                <View style={styles.summaryCopy}>
                  <Text style={styles.summaryValue}>
                    {formatHoursMinutes(weekMinutes)}
                  </Text>
                  <Text style={styles.summaryLabel}>Scheduled hours</Text>
                </View>
              </View>

              {nextShift ? (
                <View style={styles.nextBox}>
                  <Text style={styles.nextLabel}>Next shift</Text>
                  <Text style={styles.nextProject} numberOfLines={1}>
                    {nextShift.project_name || nextShift.job_name || "Scheduled shift"}
                  </Text>
                  <Text style={styles.nextMeta}>
                    {capitalizeWeekday(nextShift.date)} · {formatShortDate(nextShift.date)}
                    {"  "}
                    {formatTime12h(nextShift.start_time)} – {formatTime12h(nextShift.end_time)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.noNext}>No upcoming shifts this week.</Text>
              )}
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

            <View style={styles.weekCard}>
              {dayGroups.length === 0 ? (
                <Text style={styles.emptyText}>No shifts scheduled for this week.</Text>
              ) : (
                dayGroups.map((group) =>
                  group.shifts.map((shift, index) => (
                    <View key={shift.id} style={styles.dayRow}>
                      <View style={{ flex: 1 }}>
                        {index === 0 ? (
                          <Text style={styles.dayName}>
                            {capitalizeWeekday(group.date)} · {formatShortDate(group.date)}
                          </Text>
                        ) : null}
                        <Text style={[styles.dayRange, index === 0 && { marginTop: 2 }]}>
                          {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
                        </Text>
                        {shift.project_name || shift.job_name ? (
                          <Text style={styles.dayProject} numberOfLines={1}>
                            {shift.project_name || shift.job_name}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.dayHours}>
                        {formatHoursMinutes(shiftMinutes(shift))}
                      </Text>
                    </View>
                  ))
                )
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </ScreenLayout>
  );
};

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
    backgroundColor: ACCENT
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
  heroCard: {
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
  heroBody: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16
  },
  heroTagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  heroTagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  heroTag: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    letterSpacing: 0.8,
    color: ACCENT
  },
  countChip: {
    borderRadius: radius.pill,
    backgroundColor: ACCENT_TINT,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  countChipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    color: ACCENT
  },
  heroSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.md
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ACCENT_TINT,
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
  nextBox: {
    marginTop: spacing.md,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  nextLabel: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    letterSpacing: 0.4,
    color: ACCENT,
    textTransform: "uppercase"
  },
  nextProject: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    marginTop: 2
  },
  nextMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: 2
  },
  noNext: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.md
  },
  section: {
    gap: spacing.md
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center"
  },
  weekNavBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center"
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
    backgroundColor: ACCENT_TINT,
    minHeight: 56,
    paddingBottom: 18
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
  weekNowHint: {
    position: "absolute",
    right: 8,
    bottom: 4,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.3,
    color: ACCENT
  },
  weekCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
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
    color: colors.textMuted
  },
  dayProject: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: 2
  },
  dayHours: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.xl
  }
});
