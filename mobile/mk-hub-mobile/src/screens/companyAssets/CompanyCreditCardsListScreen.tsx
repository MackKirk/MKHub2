import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { MKBadge } from "../../components/MKBadge";
import { MKCard } from "../../components/MKCard";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { ScreenLayout } from "../../components/ScreenLayout";
import { listCompanyCreditCards } from "../../services/companyCreditCards";
import { toApiError } from "../../services/api";
import type { CompanyCreditCardItem } from "../../types/companyAssets";
import type { ProjectStatusBadgeVariant } from "../../lib/projectUi";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { label: "All", value: undefined },
  { label: "Active", value: "active" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Replaced", value: "replaced" },
  { label: "Lost", value: "lost" }
] as const;

const NETWORK_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  other: "Other"
};

function formatStatus(status: string): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusVariant(status: string): ProjectStatusBadgeVariant {
  switch (status) {
    case "active":
      return "success";
    case "cancelled":
    case "lost":
      return "danger";
    case "replaced":
      return "warning";
    default:
      return "neutral";
  }
}

function formatExpiry(card: CompanyCreditCardItem): string {
  return `${String(card.expiry_month).padStart(2, "0")}/${card.expiry_year}`;
}

export const CompanyCreditCardsListScreen: React.FC = () => {
  const { openMenu } = useHubMenu();
  const [rows, setRows] = useState<CompanyCreditCardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const subtitle = useMemo(() => {
    if (total <= 0) return "Corporate card custody";
    if (rows.length < total) return `${rows.length} of ${total} loaded`;
    return `${total} corporate cards`;
  }, [rows.length, total]);

  const fetchPage = useCallback(
    (pageNumber: number) =>
      listCompanyCreditCards({
        search: query.trim() || undefined,
        status: statusFilter,
        page: pageNumber,
        limit: PAGE_SIZE,
        sort: "label",
        dir: "asc"
      }),
    [query, statusFilter]
  );

  const loadFirstPage = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchPage(1);
      setRows(result.items);
      setTotal(result.total);
      setTotalPages(result.total_pages);
      setPage(1);
    } catch (err) {
      Alert.alert("Could not load corporate cards", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  const loadNextPage = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const result = await fetchPage(nextPage);
      setRows((prev) => [...prev, ...result.items]);
      setTotal(result.total);
      setTotalPages(result.total_pages);
      setPage(nextPage);
    } catch (err) {
      Alert.alert("Could not load more corporate cards", toApiError(err).message);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loading, loadingMore, page, totalPages]);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  const renderRow = ({ item }: { item: CompanyCreditCardItem }) => {
    const meta = [
      NETWORK_LABELS[item.network] ?? formatStatus(item.network),
      `Ending ${item.last_four}`,
      `Exp ${formatExpiry(item)}`
    ].join(" - ");

    return (
      <MKCard style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Ionicons name="card-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.cardTitleWrap}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {meta}
            </Text>
          </View>
          <MKBadge variant={getStatusVariant(item.status)}>{formatStatus(item.status)}</MKBadge>
        </View>

        <View style={styles.infoRow}>
          <InfoBlock label="Assigned to" value={item.assigned_to_name || "Available"} />
          <InfoBlock label="Billing entity" value={item.billing_entity || "Not set"} />
        </View>
      </MKCard>
    );
  };

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader
        title="Corporate Cards"
        subtitle={subtitle}
        onLeftPress={openMenu}
      />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search label, last four, cardholder, issuer"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={loadFirstPage}
        />
      </View>

      <View style={styles.filters}>
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter.value;
          return (
            <TouchableOpacity
              key={filter.label}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => setStatusFilter(filter.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.35}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={loadFirstPage} />}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No corporate cards found.</Text>
              </View>
            ) : null
          }
        />
      )}
    </ScreenLayout>
  );
};

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  filterPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterText: {
    ...typography.bodySmall,
    color: colors.textBody
  },
  filterTextActive: {
    color: "#fff",
    fontFamily: typography.button.fontFamily
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl
  },
  card: {
    gap: spacing.md
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2"
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  cardTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textMuted
  },
  infoRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  infoBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  infoValue: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  footerLoader: {
    paddingVertical: spacing.lg,
    alignItems: "center"
  },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: "center"
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  }
});
