import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { CommonActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../hooks/useAuth";
import { useCommunityBadge } from "../../hooks/useCommunityBadge";
import { useStartupAlerts } from "../../hooks/useStartupAlerts";
import { useTasksBadge } from "../../hooks/useTasksBadge";
import { ScreenLayout } from "../../components/ScreenLayout";
import { getCommunityPosts } from "../../services/community";
import type { CommunityPost } from "../../types/community";
import { isImageContentType, resolveFileUrl } from "../../lib/fileUrls";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { shadows } from "../../theme/radius";
import type { AppTabParamList, HomeStackParamList, RootStackParamList } from "../../navigation/types";

const GLOBE_BG = require("../../../assets/brand/globe.png");
const CLOCK_WATERMARK = require("../../../assets/brand/clock-watermark.png");
const CALENDAR_WATERMARK = require("../../../assets/brand/calendar-watermark.png");
const TIMEOFF_WATERMARK = require("../../../assets/brand/timeoff-watermark.png");
const MEDKIT_WATERMARK = require("../../../assets/brand/medkit-watermark.png");

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
  watermark?: ImageSourcePropType;
  onPress: () => void;
}

const COMMUNITY_PREVIEW_LIMIT = 2;
const HOME_GREEN = colors.homeAccent;
const QUICK_RAIL_WIDTH = 6;

function darkenHex(hex: string, amount = 0.28): string {
  const raw = hex.replace("#", "");
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function timeOfDayGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstImageFromHtml(html?: string): string | null {
  if (!html) return null;
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function postPreviewImage(
  post: CommunityPost,
  token: string | null
): string | null {
  if (post.photo_url) return resolveFileUrl(post.photo_url, token);
  const fromHtml = firstImageFromHtml(post.content);
  if (fromHtml) return resolveFileUrl(fromHtml, token);
  const imageAtt = post.attachments?.find(
    (att) =>
      isImageContentType(null, att.original_name) ||
      isImageContentType(null, att.url)
  );
  if (imageAtt?.url) return resolveFileUrl(imageAtt.url, token);
  return null;
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

export const HomeScreen: React.FC = () => {
  const { user, token } = useAuth();
  const navigation = useNavigation<HomeNav>();
  const { openMenu } = useHubMenu();
  const { unreadCount, setUnreadCount } = useCommunityBadge();
  const { openNotifications, notificationUnread } = useStartupAlerts();
  const { acceptedCount, inProgressCount, refreshTasks } = useTasksBadge();

  const [novidades, setNovidades] = useState<CommunityPost[]>([]);
  const [loadingNovidades, setLoadingNovidades] = useState(false);

  const firstName =
    (user?.first_name && user.first_name.trim()) ||
    user?.username ||
    "there";

  const greeting = `${timeOfDayGreeting()}, ${firstName}`;

  const goStack = useCallback(
    (screen: keyof HomeStackParamList, params?: object) => {
      navigation.dispatch(CommonActions.navigate({ name: screen, params }));
    },
    [navigation]
  );

  const quickActions: QuickAction[] = useMemo(
    () => [
      {
        label: "Clock In/Out",
        subtitle: "Track your time",
        icon: "time-outline",
        accentColor: "#166534",
        tintBg: "#DCFCE7",
        watermark: CLOCK_WATERMARK,
        onPress: () => navigation.navigate("Clock")
      },
      {
        label: "Schedule",
        subtitle: "View your shifts",
        icon: "calendar-outline",
        accentColor: "#2563EB",
        tintBg: "#DBEAFE",
        watermark: CALENDAR_WATERMARK,
        onPress: () => goStack("Schedule")
      },
      {
        label: "Time Off",
        subtitle: "Request time off",
        icon: "sunny-outline",
        accentColor: "#EA580C",
        tintBg: "#FFEDD5",
        watermark: TIMEOFF_WATERMARK,
        onPress: () => goStack("TimeOff", { mode: "vacation" })
      },
      {
        label: "Sick Leave",
        subtitle: "Report an absence",
        icon: "medkit-outline",
        accentColor: "#DC2626",
        tintBg: "#FEE2E2",
        watermark: MEDKIT_WATERMARK,
        onPress: () => goStack("TimeOff", { mode: "sick" })
      }
    ],
    [goStack, navigation]
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

  useFocusEffect(
    useCallback(() => {
      loadNovidades();
      void refreshTasks();
    }, [loadNovidades, refreshTasks])
  );

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
      <Image
        source={GLOBE_BG}
        style={styles.globeBg}
        resizeMode="contain"
        tintColor={colors.textMuted}
        pointerEvents="none"
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.homeScroll}
        contentContainerStyle={styles.homeScrollContent}
      >
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
            onPress={openNotifications}
            activeOpacity={0.75}
            hitSlop={8}
          >
            <Ionicons
              name="notifications-outline"
              size={20}
              color={colors.textPrimary}
            />
            {notificationUnread > 0 ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  {notificationUnread > 99 ? "99+" : notificationUnread}
                </Text>
              </View>
            ) : null}
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
                <LinearGradient
                  colors={[darkenHex(item.accentColor), item.accentColor]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.quickRail}
                />
                <View style={styles.quickBody}>
                  {item.watermark ? (
                    <Image
                      source={item.watermark}
                      style={styles.quickWatermark}
                      resizeMode="contain"
                      tintColor={item.accentColor}
                      pointerEvents="none"
                    />
                  ) : null}
                  <View style={[styles.quickIcon, { backgroundColor: item.tintBg }]}>
                    <Ionicons name={item.icon} size={22} color={item.accentColor} />
                  </View>
                  <Text style={styles.quickLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={styles.quickSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          {renderSectionHeader("My tasks", () => navigation.navigate("Tasks"))}
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

        <View style={styles.communityPanel}>
          <LinearGradient
            colors={[darkenHex(HOME_GREEN), HOME_GREEN]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.communityRail}
          />
          <View style={styles.communityBody}>
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
              {novidades.map((post) => {
                const avatarUri = resolveFileUrl(post.author_avatar, token);
                const bannerUri = postPreviewImage(post, token);
                return (
                  <TouchableOpacity
                    key={post.id}
                    style={styles.novidadeCard}
                    onPress={() =>
                      navigation.navigate("Community", { postId: post.id })
                    }
                    activeOpacity={0.75}
                  >
                    {bannerUri ? (
                      <Image
                        source={{ uri: bannerUri }}
                        style={[
                          styles.novidadeBanner,
                          post.photo_url
                            ? {
                                objectPosition: `${post.banner_focal_x ?? 50}% ${post.banner_focal_y ?? 50}%`,
                              }
                            : null,
                        ]}
                        resizeMode="cover"
                      />
                    ) : null}
                    <View style={styles.novidadeBody}>
                      {avatarUri ? (
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.novidadeAvatar}
                        />
                      ) : (
                        <View style={styles.novidadeAvatarFallback}>
                          <Text style={styles.novidadeAvatarText}>
                            {(post.author_name || "U")[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={styles.novidadeCopy}>
                        <Text style={styles.novidadeTitle} numberOfLines={2}>
                          {post.title}
                        </Text>
                        <Text style={styles.novidadeDate}>
                          {formatRelativeTime(post.created_at)}
                        </Text>
                        <View style={styles.novidadeFooter}>
                          <View style={styles.novidadeFooterItem}>
                            <Ionicons
                              name={post.user_has_liked ? "heart" : "heart-outline"}
                              size={15}
                              color={
                                post.user_has_liked
                                  ? colors.primary
                                  : colors.textMuted
                              }
                            />
                            <Text
                              style={[
                                styles.novidadeFooterText,
                                post.user_has_liked && styles.novidadeFooterLiked
                              ]}
                            >
                              {post.likes_count ?? 0}
                            </Text>
                          </View>
                          <View style={styles.novidadeFooterItem}>
                            <Ionicons
                              name="chatbubble-outline"
                              size={14}
                              color={colors.textMuted}
                            />
                            <Text style={styles.novidadeFooterText}>
                              {post.comments_count ?? 0}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors.textMuted}
                            style={styles.novidadeChevron}
                          />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
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
    opacity: 0.09
  },
  homeScroll: {
    flex: 1,
    zIndex: 1
  },
  homeScrollContent: {
    flexGrow: 1,
    paddingBottom: 0
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
  headerBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  headerBadgeText: {
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 9,
    lineHeight: 11,
    color: "#fff"
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
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  quickRail: {
    width: QUICK_RAIL_WIDTH,
    alignSelf: "stretch"
  },
  quickBody: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    overflow: "hidden"
  },
  quickWatermark: {
    position: "absolute",
    right: -34,
    bottom: -22,
    width: 108,
    height: 108,
    opacity: 0.09
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
  communityPanel: {
    flexGrow: 1,
    flexDirection: "row",
    marginTop: 6,
    marginBottom: spacing.sm,
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  communityRail: {
    width: QUICK_RAIL_WIDTH,
    alignSelf: "stretch"
  },
  communityBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14
  },
  novidadesEmpty: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: spacing.md,
    alignItems: "center"
  },
  novidadesEmptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  novidadesList: {
    gap: spacing.sm
  },
  novidadeCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    ...shadows.card
  },
  novidadeBanner: {
    width: "100%",
    aspectRatio: 10 / 3,
    backgroundColor: colors.iconMutedBg
  },
  novidadeBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10
  },
  novidadeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18
  },
  novidadeAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center"
  },
  novidadeAvatarText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: HOME_GREEN
  },
  novidadeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  novidadeTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    color: colors.textPrimary
  },
  novidadeDate: {
    fontSize: 11,
    color: colors.textMuted
  },
  novidadeFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 2
  },
  novidadeFooterItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  novidadeFooterText: {
    fontSize: 12,
    color: colors.textMuted
  },
  novidadeFooterLiked: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  novidadeChevron: {
    marginLeft: "auto"
  }
});
