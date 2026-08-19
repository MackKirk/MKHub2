import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../hooks/useAuth";
import { useCommunityBadge } from "../../hooks/useCommunityBadge";
import { useTasksBadge } from "../../hooks/useTasksBadge";
import { hasPermission } from "../../lib/permissions";
import { ScreenLayout } from "../../components/ScreenLayout";
import { getCommunityPosts } from "../../services/community";
import type { CommunityPost } from "../../types/community";
import { stripHtmlToPlain } from "../../utils/stripHtml";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius, shadows } from "../../theme/radius";
import { formatDateLocal } from "../../lib/dateUtils";
import {
  formatMinutesLabel,
  formatTime12h,
  getClockStateForDate
} from "../../services/shifts";
import type { ClockDayState, ShiftAttendanceResponse } from "../../types/shifts";
import type { AppTabParamList, HomeStackParamList, RootStackParamList } from "../../navigation/types";

type HomeNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, "HomeMain">,
  CompositeNavigationProp<
    BottomTabNavigationProp<AppTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;

interface QuickAction {
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  tintBg: string;
  onPress: () => void;
}

const COMMUNITY_PREVIEW_LIMIT = 2;
const HOME_GREEN = colors.homeAccent;

const COMMUNITY_TINTS: Array<{
  bg: string;
  fg: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { bg: "#DBEAFE", fg: "#2563EB", icon: "megaphone-outline" },
  { bg: "#DCFCE7", fg: HOME_GREEN, icon: "calendar-outline" },
  { bg: "#FEF3C7", fg: "#D97706", icon: "notifications-outline" },
  { bg: "#EDE9FE", fg: "#7C3AED", icon: "chatbubbles-outline" }
];

function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function communityAccent(post: CommunityPost, index: number) {
  if (post.is_urgent) {
    return { bg: "#FEE2E2", fg: "#DC2626", icon: "megaphone-outline" as const };
  }
  return COMMUNITY_TINTS[index % COMMUNITY_TINTS.length];
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function attendanceWorkedMinutes(
  attendance: ShiftAttendanceResponse,
  now: Date
): number {
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
}

function dayWorkedMinutes(dayState: ClockDayState | null, now: Date): number {
  if (!dayState) return 0;
  const seen = new Set<string>();
  let total = 0;
  const add = (att: ShiftAttendanceResponse) => {
    const key =
      att.id ||
      `${att.shift_id || "direct"}-${att.clock_in_time || ""}-${att.clock_out_time || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    total += attendanceWorkedMinutes(att, now);
  };
  if (dayState.openAttendance) add(dayState.openAttendance);
  for (const att of dayState.completeAttendances) add(att);
  for (const att of dayState.attendances) {
    if (!att.clock_in_time) continue;
    add(att);
  }
  return total;
}

export const HomeScreen: React.FC = () => {
  const { user, permissions, roles } = useAuth();
  const navigation = useNavigation<HomeNav>();
  const { openMenu } = useHubMenu();
  const { unreadCount, setUnreadCount } = useCommunityBadge();
  const { acceptedCount, inProgressCount, refreshTasks } = useTasksBadge();

  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);

  const [novidades, setNovidades] = useState<CommunityPost[]>([]);
  const [loadingNovidades, setLoadingNovidades] = useState(false);
  const [dayState, setDayState] = useState<ClockDayState | null>(null);

  const firstName =
    (user?.first_name && user.first_name.trim()) ||
    user?.username ||
    "there";

  const greeting = `${timeOfDayGreeting()}, ${firstName}`;
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  const goStack = useCallback(
    (screen: keyof HomeStackParamList, params?: object) => {
      navigation.dispatch(CommonActions.navigate({ name: screen, params }));
    },
    [navigation]
  );

  const goPlaceholder = useCallback(
    (title: string, message: string) => {
      goStack("Placeholder", { title, message });
    },
    [goStack]
  );

  const openAssets = useCallback(() => {
    if (hasPermission(permissionsSet, roles, "fleet:access")) {
      goStack("FleetMyAssets");
      return;
    }
    if (hasPermission(permissionsSet, roles, "equipment:read")) {
      goStack("FleetAssetsList", { listKind: "equipment", title: "Equipment" });
      return;
    }
    goPlaceholder("Assets", "Company assets will be available here soon.");
  }, [goPlaceholder, goStack, permissionsSet, roles]);

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        label: "Clock In/Out",
        subtitle: "Track your time",
        icon: "time-outline",
        accentColor: "#166534",
        tintBg: "#DCFCE7",
        onPress: () => navigation.navigate("Clock")
      },
      {
        label: "Schedule",
        subtitle: "View your shifts",
        icon: "calendar-outline",
        accentColor: "#2563EB",
        tintBg: "#DBEAFE",
        onPress: () => goStack("Schedule")
      },
      {
        label: "Time Off",
        subtitle: "Request time off",
        icon: "sunny-outline",
        accentColor: "#EA580C",
        tintBg: "#FFEDD5",
        onPress: () =>
          goPlaceholder(
            "Time Off",
            "Time-off requests will be available here soon."
          )
      },
      {
        label: "Sick Leave",
        subtitle: "Report an absence",
        icon: "medkit-outline",
        accentColor: "#DC2626",
        tintBg: "#FEE2E2",
        onPress: () =>
          goPlaceholder(
            "Sick Leave",
            "Sick leave reporting will be available here soon."
          )
      }
    ],
    [goPlaceholder, goStack, navigation]
  );

  const loadNovidades = useCallback(async () => {
    try {
      setLoadingNovidades(true);
      const [unread, all] = await Promise.all([
        getCommunityPosts("unread"),
        getCommunityPosts("all")
      ]);
      const unreadList = Array.isArray(unread) ? unread : [];
      const allList = Array.isArray(all) ? all : [];
      setUnreadCount(unreadList.length);
      const previewSource = unreadList.length > 0 ? unreadList : allList;
      setNovidades(previewSource.slice(0, COMMUNITY_PREVIEW_LIMIT));
    } catch {
      setNovidades([]);
      setUnreadCount(0);
    } finally {
      setLoadingNovidades(false);
    }
  }, [setUnreadCount]);

  const loadDay = useCallback(async () => {
    if (!user?.id) return;
    try {
      const state = await getClockStateForDate(formatDateLocal(new Date()), user.id);
      setDayState(state);
    } catch {
      setDayState(null);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadNovidades();
      void refreshTasks();
      void loadDay();
    }, [loadNovidades, refreshTasks, loadDay])
  );

  const nextShift = dayState?.nextPendingShift ?? dayState?.shifts[0] ?? null;
  const clockedIn = !!dayState?.openAttendance;
  const hoursLabel = formatMinutesLabel(dayWorkedMinutes(dayState, new Date()));
  const nextShiftLabel = nextShift
    ? formatTime12h(nextShift.start_time)
    : "None";
  const clockStatusLabel = clockedIn ? "Clocked in" : "Clocked out";

  const renderSectionHeader = (title: string, onViewAll?: () => void) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onViewAll ? (
        <TouchableOpacity onPress={onViewAll} hitSlop={8}>
          <Text style={styles.viewAll}>View all</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <ScreenLayout
      scroll={false}
      style={styles.screen}
      contentStyle={styles.layout}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={openMenu}
            activeOpacity={0.75}
            hitSlop={8}
          >
            <Ionicons name="menu" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit>
            {greeting}
          </Text>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation.navigate("Community")}
            activeOpacity={0.75}
            hitSlop={8}
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color={colors.textPrimary}
            />
            {unreadCount > 0 ? <View style={styles.headerDot} /> : null}
          </TouchableOpacity>
        </View>

        <View style={styles.myDayCard}>
          <View style={styles.myDayTop}>
            <View style={styles.myDayTitles}>
              <Text style={styles.myDayTitle}>My Day</Text>
              <Text style={styles.myDayDate}>{todayLabel}</Text>
            </View>
            <View style={styles.statusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: clockedIn ? HOME_GREEN : HOME_GREEN }
                ]}
              />
              <Text style={styles.statusPillText}>{clockStatusLabel}</Text>
            </View>
          </View>

          <View style={styles.myDayStats}>
            <View style={styles.myDayStat}>
              <View style={styles.myDayStatHead}>
                <Ionicons name="calendar-outline" size={14} color={HOME_GREEN} />
                <Text style={styles.myDayStatLabel}>Next shift</Text>
              </View>
              <Text style={styles.myDayStatValue}>{nextShiftLabel}</Text>
            </View>
            <View style={styles.myDayDivider} />
            <View style={styles.myDayStat}>
              <View style={styles.myDayStatHead}>
                <Ionicons name="time-outline" size={14} color={HOME_GREEN} />
                <Text style={styles.myDayStatLabel}>Today</Text>
              </View>
              <Text style={styles.myDayStatValue}>{hoursLabel}</Text>
            </View>
            <View style={styles.myDayDivider} />
            <View style={styles.myDayStat}>
              <View style={styles.myDayStatHead}>
                <Ionicons name="enter-outline" size={14} color={HOME_GREEN} />
                <Text style={styles.myDayStatLabel}>Clock status</Text>
              </View>
              <Text style={[styles.myDayStatValue, { color: HOME_GREEN }]}>
                {clockStatusLabel}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.clockButton}
            onPress={() => navigation.navigate("Clock")}
            activeOpacity={0.85}
          >
            <Ionicons name="time-outline" size={18} color="#fff" />
            <Text style={styles.clockButtonText}>
              {clockedIn ? "Clock Out" : "Clock In"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          {renderSectionHeader("Quick Actions", openMenu)}
          <View style={styles.quickGrid}>
            {quickActions.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.quickAction}
                onPress={item.onPress}
                activeOpacity={0.75}
              >
                <View style={[styles.quickIcon, { backgroundColor: item.tintBg }]}>
                  <Ionicons name={item.icon} size={22} color={item.accentColor} />
                </View>
                <Text style={styles.quickLabel} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={styles.quickSubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          {renderSectionHeader("Tasks", () => navigation.navigate("Tasks"))}
          <View style={styles.tasksCard}>
            <TouchableOpacity
              style={styles.taskStat}
              onPress={() => navigation.navigate("Tasks")}
              activeOpacity={0.75}
            >
              <View style={[styles.taskIcon, { backgroundColor: "#FFEDD5" }]}>
                <Ionicons name="document-text-outline" size={18} color="#EA580C" />
              </View>
              <View>
                <Text style={[styles.taskCount, { color: "#EA580C" }]}>
                  {acceptedCount}
                </Text>
                <Text style={styles.taskLabel}>Open</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.taskDivider} />
            <TouchableOpacity
              style={styles.taskStat}
              onPress={() => navigation.navigate("Tasks")}
              activeOpacity={0.75}
            >
              <View style={[styles.taskIcon, { backgroundColor: "#DCFCE7" }]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={HOME_GREEN} />
              </View>
              <View>
                <Text style={[styles.taskCount, { color: HOME_GREEN }]}>
                  {inProgressCount}
                </Text>
                <Text style={styles.taskLabel}>In Progress</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          {renderSectionHeader("Community Updates", () =>
            navigation.navigate("Community")
          )}
          {loadingNovidades ? (
            <View style={styles.novidadesLoading}>
              <ActivityIndicator color={HOME_GREEN} />
            </View>
          ) : novidades.length === 0 ? (
            <View style={styles.novidadesEmpty}>
              <Text style={styles.novidadesEmptyText}>No community posts yet</Text>
            </View>
          ) : (
            <View style={styles.novidadesList}>
              {novidades.map((post, index) => {
                const tint = communityAccent(post, index);
                return (
                  <TouchableOpacity
                    key={post.id}
                    style={[
                      styles.novidadeRow,
                      index === novidades.length - 1 && styles.novidadeRowLast
                    ]}
                    onPress={() => navigation.navigate("Community")}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.novidadeIcon, { backgroundColor: tint.bg }]}>
                      <Ionicons name={tint.icon} size={18} color={tint.fg} />
                    </View>
                    <View style={styles.novidadeCopy}>
                      <Text style={styles.novidadeTitle} numberOfLines={1}>
                        {post.title}
                      </Text>
                      <Text style={styles.novidadePreview} numberOfLines={1}>
                        {stripHtmlToPlain(post.content)}
                      </Text>
                      <Text style={styles.novidadeMeta}>
                        {formatRelativeTime(post.created_at)}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          {renderSectionHeader("More tools")}
          <View style={styles.moreCard}>
            <TouchableOpacity style={styles.moreItem} onPress={openAssets}>
              <View style={[styles.moreIcon, { backgroundColor: "#EDE9FE" }]}>
                <Ionicons name="cube-outline" size={20} color="#7C3AED" />
              </View>
              <Text style={styles.moreLabel}>Assets</Text>
            </TouchableOpacity>
            <View style={styles.moreDivider} />
            <TouchableOpacity
              style={styles.moreItem}
              onPress={() =>
                goPlaceholder(
                  "Policies",
                  "Policies and training will be available here soon."
                )
              }
            >
              <View style={[styles.moreIcon, { backgroundColor: "#DBEAFE" }]}>
                <Ionicons name="document-text-outline" size={20} color="#2563EB" />
              </View>
              <Text style={styles.moreLabel}>Policies</Text>
            </TouchableOpacity>
            <View style={styles.moreDivider} />
            <TouchableOpacity
              style={styles.moreItem}
              onPress={() =>
                goPlaceholder(
                  "Directory",
                  "The company directory will be available here soon."
                )
              }
            >
              <View style={[styles.moreIcon, { backgroundColor: "#CCFBF1" }]}>
                <Ionicons name="people-outline" size={20} color="#0F766E" />
              </View>
              <Text style={styles.moreLabel}>Directory</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#fff"
  },
  layout: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: spacing.md
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
  greeting: {
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
  myDayCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.card
  },
  myDayTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  myDayTitles: {
    flex: 1,
    minWidth: 0
  },
  myDayTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary
  },
  myDayDate: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF3",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  statusPillText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    color: HOME_GREEN
  },
  myDayStats: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: spacing.lg
  },
  myDayStat: {
    flex: 1,
    minWidth: 0
  },
  myDayStatHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6
  },
  myDayStatLabel: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted
  },
  myDayStatValue: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary
  },
  myDayDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm
  },
  clockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: HOME_GREEN,
    borderRadius: 14,
    paddingVertical: 14
  },
  clockButtonText: {
    color: "#fff",
    fontFamily: typography.button.fontFamily,
    fontSize: 16
  },
  section: {
    marginBottom: 22
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md
  },
  sectionTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary
  },
  viewAll: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: HOME_GREEN
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12
  },
  quickAction: {
    width: "48.5%",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    ...shadows.card
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12
  },
  quickLabel: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary
  },
  quickSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 2
  },
  tasksCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 14,
    ...shadows.card
  },
  taskStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  taskDivider: {
    width: StyleSheet.hairlineWidth,
    height: 44,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md
  },
  taskCount: {
    fontFamily: typography.button.fontFamily,
    fontSize: 22,
    lineHeight: 26
  },
  taskLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted
  },
  novidadesLoading: {
    paddingVertical: spacing.lg,
    alignItems: "center"
  },
  novidadesEmpty: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: "center",
    ...shadows.card
  },
  novidadesEmptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  novidadesList: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  novidadeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  novidadeRowLast: {
    borderBottomWidth: 0
  },
  novidadeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  novidadeCopy: {
    flex: 1,
    minWidth: 0
  },
  novidadeTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary
  },
  novidadePreview: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 2
  },
  novidadeMeta: {
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
    marginTop: 4
  },
  moreCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 16,
    ...shadows.card
  },
  moreItem: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm
  },
  moreDivider: {
    width: StyleSheet.hairlineWidth,
    height: 44,
    backgroundColor: colors.border
  },
  moreIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  moreLabel: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.textPrimary
  }
});
