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
import { hasPermission } from "../../lib/permissions";
import {
  customerDisplayName,
  formatCustomerAddress,
  formatCustomerStatus,
  getCustomerStatusVariant
} from "../../lib/customerUi";
import { CustomerFormModal } from "../../components/customers/CustomerFormModal";
import { MKBadge } from "../../components/MKBadge";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { ScreenLayout } from "../../components/ScreenLayout";
import { createCustomer, listCustomers } from "../../services/customers";
import { toApiError } from "../../services/api";
import type { AppTabParamList, HomeStackParamList, RootStackParamList } from "../../navigation/types";
import type { Customer, CustomerPayload } from "../../types/customers";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type CustomersListNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, "CustomersList">,
  CompositeNavigationProp<
    BottomTabNavigationProp<AppTabParamList>,
    NativeStackNavigationProp<RootStackParamList>
  >
>;

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { label: "All statuses", value: undefined },
  { label: "Active", value: "active" },
  { label: "Prospect", value: "prospect" },
  { label: "Inactive", value: "inactive" }
] as const;

const TYPE_FILTERS = [
  { label: "All types", value: undefined },
  { label: "Customer", value: "Customer" },
  { label: "Prospect", value: "Prospect" },
  { label: "Vendor", value: "Vendor" }
] as const;

export const CustomersListScreen: React.FC = () => {
  const navigation = useNavigation<CustomersListNav>();
  const { openMenu } = useHubMenu();
  const { permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const canWrite = hasPermission(permissionsSet, roles, "business:customers:write");

  const [rows, setRows] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const subtitle = useMemo(() => {
    if (total <= 0) return "Customers, contacts and sites";
    if (rows.length < total) return `${rows.length} of ${total} loaded`;
    return `${total} customers`;
  }, [rows.length, total]);

  const fetchPage = useCallback(
    (pageNumber: number) =>
      listCustomers({
        q: query.trim() || undefined,
        status: statusFilter,
        type: typeFilter,
        page: pageNumber,
        limit: PAGE_SIZE,
        sort: "name",
        dir: "asc"
      }),
    [query, statusFilter, typeFilter]
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
      Alert.alert("Could not load customers", toApiError(err).message);
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
      Alert.alert("Could not load more customers", toApiError(err).message);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loading, loadingMore, page, totalPages]);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  const openCustomer = (customer: Customer) => {
    navigation.dispatch(
      CommonActions.navigate({
        name: "CustomerDetail",
        params: {
          customerId: customer.id,
          title: customerDisplayName(customer)
        }
      })
    );
  };

  const handleCreate = async (payload: CustomerPayload) => {
    try {
      setCreating(true);
      const created = await createCustomer(payload);
      setCreateOpen(false);
      await loadFirstPage();
      openCustomer(created);
    } catch (err) {
      Alert.alert("Could not create customer", toApiError(err).message);
    } finally {
      setCreating(false);
    }
  };

  const renderRow = ({ item }: { item: Customer }) => {
    const address = formatCustomerAddress(item);
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={() => openCustomer(item)}>
        <MKCard style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.customerIcon}>
              <Ionicons name="business-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {customerDisplayName(item)}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {[item.code, item.client_type].filter(Boolean).join(" - ") || "Customer"}
              </Text>
            </View>
            <MKBadge variant={getCustomerStatusVariant(item.client_status)}>
              {formatCustomerStatus(item.client_status)}
            </MKBadge>
          </View>
          {address ? (
            <Text style={styles.address} numberOfLines={2}>
              {address}
            </Text>
          ) : null}
        </MKCard>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader title="Customers" subtitle={subtitle} onLeftPress={openMenu} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search customers or contacts"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={loadFirstPage}
        />
      </View>

      <FilterRow
        options={STATUS_FILTERS}
        selectedValue={statusFilter}
        onChange={setStatusFilter}
      />
      <FilterRow options={TYPE_FILTERS} selectedValue={typeFilter} onChange={setTypeFilter} />

      {canWrite ? (
        <MKButton title="New customer" onPress={() => setCreateOpen(true)} style={styles.createButton} />
      ) : null}

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
                <Text style={styles.emptyText}>No customers found.</Text>
              </View>
            ) : null
          }
        />
      )}

      <CustomerFormModal
        visible={createOpen}
        loading={creating}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
    </ScreenLayout>
  );
};

function FilterRow({
  options,
  selectedValue,
  onChange
}: {
  options: readonly { label: string; value: string | undefined }[];
  selectedValue?: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <View style={styles.filters}>
      {options.map((filter) => {
        const active = selectedValue === filter.value;
        return (
          <TouchableOpacity
            key={filter.label}
            style={[styles.filterPill, active && styles.filterPillActive]}
            onPress={() => onChange(filter.value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.filterText, active && styles.filterTextActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        );
      })}
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
    marginBottom: spacing.sm
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
  createButton: {
    marginBottom: spacing.md
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
    gap: spacing.sm
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  customerIcon: {
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
  address: {
    ...typography.bodySmall,
    color: colors.textBody
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
