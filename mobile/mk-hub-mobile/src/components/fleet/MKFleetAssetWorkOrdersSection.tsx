import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKCard } from "../MKCard";
import { MKBadge } from "../MKBadge";
import {
  CATEGORY_LABELS,
  URGENCY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  getUrgencyVariant,
  getWorkOrderStatusVariant
} from "../../lib/fleetLabels";
import { formatFleetDateTime } from "../../lib/fleetLabels";
import type { WorkOrder } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKFleetAssetWorkOrdersSectionProps {
  items: WorkOrder[];
  loading: boolean;
  onOpenWorkOrder: (workOrderId: string) => void;
}

export const MKFleetAssetWorkOrdersSection: React.FC<MKFleetAssetWorkOrdersSectionProps> = ({
  items,
  loading,
  onOpenWorkOrder
}) => {
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <MKCard style={styles.emptyCard} elevated>
        <Text style={styles.emptyText}>No work orders for this asset.</Text>
      </MKCard>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <TouchableOpacity key={item.id} activeOpacity={0.75} onPress={() => onOpenWorkOrder(item.id)}>
          <MKCard style={styles.card} elevated>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.work_order_number}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
            <Text style={styles.description} numberOfLines={2}>
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
            <Text style={styles.meta}>
              {CATEGORY_LABELS[item.category] ?? item.category} ·{" "}
              {formatFleetDateTime(item.created_at)}
            </Text>
          </MKCard>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center"
  },
  list: {
    gap: spacing.sm
  },
  card: {
    gap: spacing.xs,
    padding: spacing.md
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
  description: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "capitalize"
  },
  emptyCard: {
    padding: spacing.lg,
    alignItems: "center"
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  }
});
