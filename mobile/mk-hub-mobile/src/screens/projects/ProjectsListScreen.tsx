import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import {
  useNavigation,
  useRoute,
  CommonActions,
  type CompositeNavigationProp,
  type RouteProp
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKProjectListRow } from "../../components/MKProjectListRow";
import { MKProjectFiltersModal } from "../../components/MKProjectFiltersModal";
import {
  fetchBusinessProjects,
  type BusinessProjectsQuery
} from "../../services/projects";
import {
  employeesInEstimatingDept,
  fetchClientsForFilter,
  fetchEmployees,
  fetchProjectDivisions,
  fetchSettings,
  type ClientListItem,
  type EmployeeListItem,
  type ProjectDivision,
  type ProjectStatus
} from "../../services/settings";
import { toApiError } from "../../services/api";
import { filterProjectDivisionsForBusinessLine } from "../../lib/businessLine";
import { resolveFileUrl } from "../../lib/fileUrls";
import {
  hasAdvancedFilters,
  resolveQuickStatusFiltersForListKind,
  type ProjectListAdvancedFilters
} from "../../lib/listFilters";
import {
  filterStatusesForOpportunity,
  filterStatusesForProject
} from "../../lib/projectStatusVisibility";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius, shadows } from "../../theme/radius";
import type {
  AppTabParamList,
  HomeStackParamList,
  RootStackParamList
} from "../../navigation/types";
import type { ProjectListItem } from "../../types/projects";

const GLOBE_BG = require("../../../assets/brand/globe.png");
const ACCENT = colors.homeAccent;

type ProjectsListRoute = RouteProp<HomeStackParamList, "ProjectsList">;
type ProjectsListNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, "ProjectsList">,
  CompositeNavigationProp<
    BottomTabNavigationProp<AppTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;

function buildListQuery(
  base: Pick<BusinessProjectsQuery, "listKind" | "businessLine">,
  options: {
    q?: string;
    relatedToMe: boolean;
    quickStatusId?: string;
    advancedFilters: ProjectListAdvancedFilters;
    page?: number;
    limit?: number;
  }
): BusinessProjectsQuery {
  const statusId =
    options.quickStatusId || options.advancedFilters.statusId || undefined;

  return {
    ...base,
    q: options.q?.trim() || undefined,
    relatedToMe: options.relatedToMe,
    status: statusId,
    divisionId: options.advancedFilters.divisionId,
    clientId: options.advancedFilters.clientId,
    estimatorId: options.advancedFilters.estimatorId,
    page: options.page,
    limit: options.limit
  };
}

export const ProjectsListScreen: React.FC = () => {
  const route = useRoute<ProjectsListRoute>();
  const navigation = useNavigation<ProjectsListNav>();
  const { openMenu } = useHubMenu();
  const { token } = useAuth();
  const { listKind, businessLine, title } = route.params;

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [relatedToMe, setRelatedToMe] = useState(false);
  const [quickStatusId, setQuickStatusId] = useState<string | undefined>();
  const [advancedFilters, setAdvancedFilters] =
    useState<ProjectListAdvancedFilters>({});
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [quickFilterCounts, setQuickFilterCounts] = useState<
    Record<string, number>
  >({});

  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [divisions, setDivisions] = useState<ProjectDivision[]>([]);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [estimators, setEstimators] = useState<EmployeeListItem[]>([]);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listBase = useMemo(
    () => ({ listKind, businessLine }),
    [listKind, businessLine]
  );

  const divisionsForLine = useMemo(
    () => filterProjectDivisionsForBusinessLine(divisions, businessLine ?? ""),
    [divisions, businessLine]
  );

  const filterStatuses = useMemo(() => {
    if (listKind === "projects") return filterStatusesForProject(statuses);
    return filterStatusesForOpportunity(statuses);
  }, [listKind, statuses]);

  const quickStatusFilters = useMemo(
    () => resolveQuickStatusFiltersForListKind(listKind, statuses),
    [listKind, statuses]
  );

  const quickFilterOptions = useMemo(
    () =>
      quickStatusFilters.map((f) => ({
        key: f.key,
        label: f.label,
        statusId: f.statusId,
        count: quickFilterCounts[f.key]
      })),
    [quickStatusFilters, quickFilterCounts]
  );

  const hasActiveFilters =
    relatedToMe ||
    Boolean(quickStatusId) ||
    hasAdvancedFilters(advancedFilters);

  const load = useCallback(
    async (searchQuery?: string, asRefresh = false) => {
      try {
        if (asRefresh) setRefreshing(true);
        else setLoading(true);

        const result = await fetchBusinessProjects(
          buildListQuery(listBase, {
            q: searchQuery,
            relatedToMe,
            quickStatusId,
            advancedFilters,
            limit: 50
          })
        );
        setItems(result.items);
        setTotal(result.total);
      } catch (err) {
        console.error("[ProjectsList]", toApiError(err).message);
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [listBase, relatedToMe, quickStatusId, advancedFilters]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      load(query);
    }, 400);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsData, divisionsData, clientsData, employeesData] =
          await Promise.all([
            fetchSettings(),
            fetchProjectDivisions(),
            fetchClientsForFilter(),
            fetchEmployees()
          ]);
        if (cancelled) return;
        setStatuses(settingsData.project_statuses ?? []);
        setDivisions(divisionsData);
        setClients(clientsData);
        setEstimators(employeesInEstimatingDept(employeesData));
      } catch (err) {
        console.warn("[ProjectsList] filter metadata", toApiError(err).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const segments = quickStatusFilters.map((f) => ({
      key: f.key,
      statusId: f.statusId
    }));

    (async () => {
      const counts: Record<string, number> = {};
      const countBase = buildListQuery(listBase, {
        q: query,
        relatedToMe: false,
        quickStatusId: undefined,
        advancedFilters: {
          divisionId: advancedFilters.divisionId,
          clientId: advancedFilters.clientId,
          estimatorId: advancedFilters.estimatorId
        },
        limit: 1
      });

      await Promise.all(
        segments.map(async (segment) => {
          try {
            const result = await fetchBusinessProjects({
              ...countBase,
              status: segment.statusId
            });
            counts[segment.key] = result.total;
          } catch {
            /* ignore count errors */
          }
        })
      );
      if (!cancelled) setQuickFilterCounts(counts);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    listBase,
    query,
    quickStatusFilters,
    advancedFilters.divisionId,
    advancedFilters.clientId,
    advancedFilters.estimatorId
  ]);

  const handleRelatedToMeChange = (value: boolean) => {
    setRelatedToMe(value);
    if (value && listKind !== "projects") {
      setQuickStatusId(undefined);
      setAdvancedFilters((f) => ({ ...f, statusId: undefined }));
    }
  };

  const handleSelectQuickStatus = (statusId: string | undefined) => {
    setQuickStatusId(statusId);
    setAdvancedFilters((f) => ({ ...f, statusId: undefined }));
  };

  const clearAllFilters = () => {
    setRelatedToMe(false);
    setQuickStatusId(undefined);
    setAdvancedFilters({});
  };

  const handleApplyAdvancedFilters = (filters: ProjectListAdvancedFilters) => {
    const { statusId, divisionId, clientId, estimatorId } = filters;
    const matchesQuick = statusId
      ? quickStatusFilters.some((f) => f.statusId === statusId)
      : false;

    setQuickStatusId(matchesQuick ? statusId : undefined);
    setAdvancedFilters({
      divisionId,
      clientId,
      estimatorId,
      statusId: statusId && !matchesQuick ? statusId : undefined
    });
  };

  const openProject = (project: ProjectListItem) => {
    navigation.dispatch(
      CommonActions.navigate({
        name: "ProjectDetail",
        params: { project }
      })
    );
  };

  const searchPlaceholder = "Search name, code, or client…";
  const isOpportunity = listKind === "opportunities";
  const subtitle =
    total === 1
      ? isOpportunity
        ? "1 opportunity"
        : "1 project"
      : `${total} ${isOpportunity ? "opportunities" : "projects"}`;

  return (
    <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
      <Image
        source={GLOBE_BG}
        style={styles.globeBg}
        resizeMode="contain"
        tintColor={colors.textMuted}
        pointerEvents="none"
      />

      <View style={styles.topHeader}>
        <Pressable style={styles.headerIconBtn} onPress={openMenu} hitSlop={8}>
          <Ionicons name="menu" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <Pressable
          style={styles.headerIconBtn}
          onPress={() => setFilterModalOpen(true)}
          hitSlop={8}
        >
          <Ionicons name="options-outline" size={20} color={colors.textMuted} />
          {hasActiveFilters ? <View style={styles.headerDot} /> : null}
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {hasActiveFilters ? (
        <Pressable onPress={clearAllFilters} style={styles.clearLink}>
          <Text style={styles.clearLinkText}>Clear filters</Text>
        </Pressable>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>
            {isOpportunity ? "Loading opportunities…" : "Loading projects…"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(query, true)}
              tintColor={ACCENT}
            />
          }
          ListHeaderComponent={
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <Pressable
                onPress={() => handleRelatedToMeChange(!relatedToMe)}
                style={[styles.filterChip, relatedToMe && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    relatedToMe && styles.filterChipTextActive
                  ]}
                >
                  Related to me
                </Text>
              </Pressable>
              {quickFilterOptions.map((item) => {
                const active = quickStatusId === item.statusId;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() =>
                      handleSelectQuickStatus(active ? undefined : item.statusId)
                    }
                    style={[
                      styles.filterChip,
                      typeof item.count === "number" && styles.filterChipCounted,
                      active && styles.filterChipActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive
                      ]}
                    >
                      {item.label}
                    </Text>
                    {typeof item.count === "number" ? (
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
                          {item.count}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={isOpportunity ? "document-text-outline" : "folder-open-outline"}
                  size={28}
                  color={ACCENT}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {isOpportunity ? "No opportunities here" : "No projects here"}
              </Text>
              <Text style={styles.emptyText}>
                {hasActiveFilters || query
                  ? "Try a different search or clear the filters."
                  : isOpportunity
                    ? "New opportunities will show up here."
                    : "Projects matching this view will show up here."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <MKProjectListRow
              project={item}
              imageUri={
                item.cover_image_url && item.cover_image_url.includes("/files/")
                  ? resolveFileUrl(item.cover_image_url, token)
                  : null
              }
              onPress={() => openProject(item)}
            />
          )}
        />
      )}

      <MKProjectFiltersModal
        visible={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        onApply={handleApplyAdvancedFilters}
        initialFilters={{
          ...advancedFilters,
          statusId: quickStatusId || advancedFilters.statusId
        }}
        statuses={filterStatuses}
        divisions={divisionsForLine}
        clients={clients}
        estimators={estimators}
      />
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
  headerDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary
  },
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
  clearLink: {
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
    zIndex: 1
  },
  clearLinkText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    color: ACCENT
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
  }
});
