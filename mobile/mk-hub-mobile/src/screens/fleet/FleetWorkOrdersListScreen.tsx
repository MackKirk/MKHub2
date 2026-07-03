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
import { CommonActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission } from "../../lib/permissions";
import {
  CATEGORY_LABELS,
  URGENCY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  getUrgencyVariant,
  getWorkOrderStatusVariant
} from "../../lib/fleetLabels";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKBadge } from "../../components/MKBadge";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { MKQuickFilterBar } from "../../components/MKQuickFilterBar";
import { FleetWorkOrderCreateModal } from "../../components/fleet/FleetWorkOrderCreateModal";
import { ScreenLayout } from "../../components/ScreenLayout";
import { createWorkOrder, listWorkOrders } from "../../services/fleetWorkOrders";
import { toApiError } from "../../services/api";
import type { HomeStackParamList } from "../../navigation/types";
import type { WorkOrder } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

type FleetWorkOrdersNav = NativeStackNavigationProp<HomeStackParamList, "FleetWorkOrders">;

const STATUS_FILTERS = [
  { key: "all", label: "All statuses", statusId: "" },
  { key: "open", label: "Pending", statusId: "open" },
  { key: "in_progress", label: "In progress", statusId: "in_progress" },
  { key: "pending_parts", label: "Awaiting parts", statusId: "pending_parts" },
  { key: "closed", label: "Finished", statusId: "closed" }
];

export const FleetWorkOrdersListScreen: React.FC = () => {
  const navigation = useNavigation<FleetWorkOrdersNav>();
  const { openMenu } = useHubMenu();
  const { user, permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const canWrite = hasPermission(permissionsSet, roles, "work_orders:write");

  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [relatedToMe, setRelatedToMe] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);

  const subtitle = useMemo(
    () => (total > 0 ? `${total} work orders` : "Shop queue"),
    [total]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await listWorkOrders({
        search: query.trim() || undefined,
        status: statusFilter || undefined,
        assigned_to: relatedToMe && user?.id ? user.id : undefined,
        limit: 50,
        sort: "created_at",
        dir: "desc"
      });
      setRows(result.items);
      setTotal(result.total);
    } catch (err) {
      Alert.alert("Could not load work orders", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [query, relatedToMe, statusFilter, user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleCreate = async (payload: Parameters<typeof createWorkOrder>[0]) => {
    try {
      setSubmitting(true);
      const created = await createWorkOrder(payload);
      setShowCreate(false);
      navigation.dispatch(
        CommonActions.navigate({
          name: "FleetWorkOrderDetail",
          params: { workOrderId: created.id }
        })
      );
    } catch (err) {
      Alert.alert("Could not create work order", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderRow = ({ item }: { item: WorkOrder }) => (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() =>
        navigation.dispatch(
          CommonActions.navigate({
            name: "FleetWorkOrderDetail",
            params: { workOrderId: item.id }
          })
        )
      }
    >
      <MKCard style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.work_order_number}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
        <Text style={styles.cardDescription} numberOfLines={2}>
          {item.description}
        </Text>
        <View style={styles.badgeRow}>
          <MKBadge variant={getWorkOrderStatusVariant(item.status)}>
            {WORK_ORDER_STATUS_LABELS[item.status] ?? item.status}
          </MKBadge>
          <MKBadge variant={getUrgencyVariant(item.urgency)}>
            {URGENCY_LABELS[item.urgency] ?? item.urgency}
          </MKBadge>
        </View>
        <Text style={styles.cardMeta}>
          {[item.entity_type, CATEGORY_LABELS[item.category] ?? item.category]
            .filter(Boolean)
            .join(" · ")}
          {item.assigned_to_name ? ` · ${item.assigned_to_name}` : ""}
        </Text>
      </MKCard>
    </TouchableOpacity>
  );

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader title="Work Orders" subtitle={subtitle} onLeftPress={openMenu} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by number or description"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={load}
        />
      </View>

      <MKQuickFilterBar
        relatedToMe={relatedToMe}
        onRelatedToMeChange={setRelatedToMe}
        options={STATUS_FILTERS.map((filter) => ({
          key: filter.key,
          label: filter.label,
          statusId: filter.statusId
        }))}
        selectedStatusId={statusFilter}
        onSelectStatusId={(statusId) => setStatusFilter(statusId || undefined)}
        style={styles.filterBar}
      />

      {canWrite ? (
        <MKButton
          title="New work order"
          onPress={() => setShowCreate(true)}
          style={styles.createButton}
        />
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
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No work orders found.</Text>
              </View>
            ) : null
          }
        />
      )}

      <FleetWorkOrderCreateModal
        visible={showCreate}
        loading={submitting}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
      />
    </ScreenLayout>
  );
};

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
  filterBar: {
    marginBottom: spacing.sm
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
    gap: spacing.xs
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  cardTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    flex: 1
  },
  cardDescription: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "capitalize"
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
