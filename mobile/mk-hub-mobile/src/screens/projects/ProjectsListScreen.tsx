import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKQuickFilterBar } from "../../components/MKQuickFilterBar";
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
import { radius } from "../../theme/radius";
import type {
  AppTabParamList,
  HomeStackParamList,
  RootStackParamList
} from "../../navigation/types";
import type { ProjectListItem } from "../../types/projects";

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

  const searchPlaceholder =
    listKind === "opportunities"
      ? "Search by opportunity name, code, or client..."
      : listKind === "leak_investigations"
        ? "Search by leak investigation name, code, or client..."
        : "Search by project name, code, or client...";

  return (
    <ScreenLayout scroll={false} contentStyle={styles.layout}>
      <MKHomeStyleHeader
        title={title}
        subtitle={total > 0 ? `${total} total` : undefined}
        onLeftPress={openMenu}
      />

      <View style={styles.filterCard}>
        <View style={styles.searchRow}>
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
          </View>
          <TouchableOpacity
            style={styles.filtersBtn}
            onPress={() => setFilterModalOpen(true)}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={colors.textBody}
            />
            <Text style={styles.filtersBtnText}>Filters</Text>
          </TouchableOpacity>
        </View>

        {hasActiveFilters ? (
          <TouchableOpacity style={styles.clearLink} onPress={clearAllFilters}>
            <Text style={styles.clearLinkText}>Clear filters</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.quickFiltersDivider} />
        <MKQuickFilterBar
          relatedToMe={relatedToMe}
          onRelatedToMeChange={handleRelatedToMeChange}
          options={quickFilterOptions}
          selectedStatusId={quickStatusId}
          onSelectStatusId={handleSelectQuickStatus}
        />
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(query, true)}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>No items found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <MKProjectListRow
              project={item}
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
  layout: {
    flex: 1
  },
  filterCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    minHeight: 44
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    paddingVertical: spacing.sm,
    color: colors.textPrimary
  },
  filtersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    minHeight: 44
  },
  filtersBtnText: {
    ...typography.bodySmall,
    color: colors.textBody,
    fontFamily: typography.button.fontFamily
  },
  clearLink: {
    alignSelf: "flex-start",
    marginTop: spacing.sm
  },
  clearLinkText: {
    ...typography.bodySmall,
    color: colors.primary
  },
  quickFiltersDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md
  },
  list: {
    paddingBottom: spacing.xxl,
    gap: spacing.sm
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl
  },
  empty: {
    ...typography.body,
    color: colors.textMuted
  }
});
