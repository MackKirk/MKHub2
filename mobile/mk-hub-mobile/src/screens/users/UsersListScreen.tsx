import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  CommonActions,
  useFocusEffect,
  useNavigation,
  type CompositeNavigationProp
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useAuth } from "../../hooks/useAuth";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { canOpenHrUserProfile } from "../../lib/permissions";
import {
  hubUserDisplayName,
  hubUserInitials,
  hubUserPhotoUrl
} from "../../lib/userUi";
import { ScreenLayout } from "../../components/ScreenLayout";
import { getUsersTabCounts, listUsers } from "../../services/users";
import { toApiError } from "../../services/api";
import type {
  AppTabParamList,
  HomeStackParamList,
  RootStackParamList
} from "../../navigation/types";
import type { HubUserListItem, HubUsersTabCounts } from "../../types/users";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { typography } from "../../theme/typography";

const GLOBE_BG = require("../../../assets/brand/globe.png");
const ACCENT = colors.homeAccent;
const RAIL_WIDTH = 6;
const PAGE_SIZE = 50;

type StatusChip = "all" | "active" | "inactive" | "admins";

type UsersListNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, "UsersList">,
  CompositeNavigationProp<
    BottomTabNavigationProp<AppTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;

const emptyCounts: HubUsersTabCounts = { active: 0, inactive: 0, admins: 0 };

export const UsersListScreen: React.FC = () => {
  const navigation = useNavigation<UsersListNav>();
  const { openMenu } = useHubMenu();
  const { token, permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const canOpenProfile = canOpenHrUserProfile(permissionsSet, roles);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusChip, setStatusChip] = useState<StatusChip>("active");
  const [rows, setRows] = useState<HubUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState<HubUsersTabCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subtitle = useMemo(() => {
    if (total === 1) return "1 person";
    if (rows.length < total) return `${rows.length} of ${total} loaded`;
    return `${total} people`;
  }, [rows.length, total]);

  const listParams = useMemo(() => {
    if (statusChip === "admins") return { is_admin: true as const };
    if (statusChip === "active") return { status: "active" as const };
    if (statusChip === "inactive") return { status: "inactive" as const };
    return {};
  }, [statusChip]);

  const fetchPage = useCallback(
    (pageNumber: number) =>
      listUsers({
        q: debouncedQuery.trim() || undefined,
        page: pageNumber,
        limit: PAGE_SIZE,
        ...listParams
      }),
    [debouncedQuery, listParams]
  );

  const loadFirstPage = useCallback(
    async (asRefresh = false) => {
      try {
        if (asRefresh) setRefreshing(true);
        else setLoading(true);
        const [result, tabCounts] = await Promise.all([
          fetchPage(1),
          getUsersTabCounts(debouncedQuery.trim() || undefined).catch(() => emptyCounts)
        ]);
        setRows(result.items);
        setTotal(result.total);
        setTotalPages(result.total_pages);
        setPage(1);
        setCounts(tabCounts);
      } catch (err) {
        Alert.alert("Could not load users", toApiError(err).message);
        setRows([]);
        setTotal(0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchPage, debouncedQuery]
  );

  const loadNextPage = useCallback(async () => {
    if (loading || loadingMore || refreshing || page >= totalPages) return;
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const result = await fetchPage(nextPage);
      setRows((prev) => [...prev, ...result.items]);
      setTotal(result.total);
      setTotalPages(result.total_pages);
      setPage(nextPage);
    } catch (err) {
      Alert.alert("Could not load more users", toApiError(err).message);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loading, loadingMore, refreshing, page, totalPages]);

  useFocusEffect(
    useCallback(() => {
      void loadFirstPage();
    }, [loadFirstPage])
  );

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 400);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query]);

  const openUser = (user: HubUserListItem) => {
    if (!canOpenProfile) {
      Alert.alert(
        "Access denied",
        "You can see the directory, but you do not have permission to open user profiles."
      );
      return;
    }
    navigation.dispatch(
      CommonActions.navigate({
        name: "UserDetail",
        params: {
          userId: user.id,
          title: hubUserDisplayName(user)
        }
      })
    );
  };

  const chips: Array<{ key: StatusChip; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.active + counts.inactive },
    { key: "active", label: "Active", count: counts.active },
    { key: "inactive", label: "Inactive", count: counts.inactive },
    { key: "admins", label: "Admins", count: counts.admins }
  ];

  const renderRow = ({ item }: { item: HubUserListItem }) => {
    const name = hubUserDisplayName(item);
    const photoUri = hubUserPhotoUrl(item.profile_photo_file_id, token);
    const active = item.is_active !== false;
    const rail: [string, string] = active
      ? [ACCENT, "#0E5A27"]
      : ["#9CA3AF", "#6B7280"];
    const meta = [item.job_title, item.username].filter(Boolean).join(" · ");

    return (
      <Pressable style={styles.card} onPress={() => openUser(item)}>
        <LinearGradient
          colors={rail}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.rail}
        />
        <View style={styles.cardBody}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{hubUserInitials(name)}</Text>
            </View>
          )}
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {name}
            </Text>
            {meta ? (
              <Text style={styles.cardMeta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.statusChip,
              active ? styles.statusChipActive : styles.statusChipInactive
            ]}
          >
            <Text
              style={[
                styles.statusChipText,
                active ? styles.statusChipTextActive : styles.statusChipTextInactive
              ]}
            >
              {active ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
      <Image
        source={GLOBE_BG}
        style={styles.globeBg}
        resizeMode="contain"
        tintColor="#c22033"
        pointerEvents="none"
      />

      <View style={styles.topHeader}>
        <Pressable style={styles.headerIconBtn} onPress={openMenu} hitSlop={8}>
          <Ionicons name="menu" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Users
          </Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.headerIconSpacer} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name, username, or email…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>Loading users…</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.35}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadFirstPage(true)}
              tintColor={ACCENT}
            />
          }
          ListHeaderComponent={
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {chips.map((chip) => {
                const active = statusChip === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setStatusChip(chip.key)}
                    style={[
                      styles.filterChip,
                      styles.filterChipCounted,
                      active && styles.filterChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive
                      ]}
                    >
                      {chip.label}
                    </Text>
                    <View
                      style={[
                        styles.filterCount,
                        active && styles.filterCountActive
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterCountText,
                          active && styles.filterCountTextActive
                        ]}
                      >
                        {chip.count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={ACCENT} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="people-outline" size={28} color={ACCENT} />
                </View>
                <Text style={styles.emptyTitle}>No people here</Text>
                <Text style={styles.emptyText}>
                  {query
                    ? "Try a different search or filter."
                    : "People matching this view will show up here."}
                </Text>
              </View>
            ) : null
          }
          renderItem={renderRow}
        />
      )}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  screen: { backgroundColor: "#fff" },
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
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
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
  headerIconSpacer: { width: 40, height: 40 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: colors.textMuted
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: spacing.sm,
    zIndex: 1,
    ...shadows.card
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
    color: colors.textPrimary
  },
  list: { flex: 1, zIndex: 1 },
  listContent: { paddingBottom: spacing.xxl, flexGrow: 1, gap: spacing.md },
  filterRow: { gap: spacing.sm, paddingRight: spacing.sm, marginBottom: spacing.sm },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 7
  },
  filterChipCounted: { paddingRight: 6 },
  filterChipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT
  },
  filterChipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    color: colors.textBody
  },
  filterChipTextActive: { color: "#fff" },
  filterCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  filterCountText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    color: colors.textMuted
  },
  filterCountTextActive: { color: "#fff" },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card
  },
  rail: { width: RAIL_WIDTH },
  cardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: 12
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECFDF3"
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarInitials: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    color: ACCENT
  },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: colors.textPrimary
  },
  cardMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted
  },
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusChipActive: { backgroundColor: "#ECFDF3" },
  statusChipInactive: { backgroundColor: "#F3F4F6" },
  statusChipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11
  },
  statusChipTextActive: { color: ACCENT },
  statusChipTextInactive: { color: colors.textMuted },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    zIndex: 1
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center"
  },
  emptyTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  },
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: "center"
  }
});
