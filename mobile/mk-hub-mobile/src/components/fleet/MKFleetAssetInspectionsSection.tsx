import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MKCard } from "../MKCard";
import { MKBadge } from "../MKBadge";
import { INSPECTION_RESULT_LABELS } from "../../lib/fleetLabels";
import { formatFleetDateTime } from "../../lib/fleetLabels";
import type { FleetInspection } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKFleetAssetInspectionsSectionProps {
  items: FleetInspection[];
  loading: boolean;
}

export const MKFleetAssetInspectionsSection: React.FC<MKFleetAssetInspectionsSectionProps> = ({
  items,
  loading
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
        <Text style={styles.emptyText}>No inspections recorded for this asset.</Text>
      </MKCard>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <MKCard key={item.id} style={styles.card} elevated>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {item.inspection_type?.replace(/_/g, " ") || "Inspection"}
            </Text>
            <MKBadge variant={item.result === "pass" ? "success" : item.result === "fail" ? "danger" : "neutral"}>
              {INSPECTION_RESULT_LABELS[item.result] ?? item.result}
            </MKBadge>
          </View>
          <Text style={styles.meta}>{formatFleetDateTime(item.inspection_date)}</Text>
          {item.inspector_name ? (
            <Text style={styles.meta}>Inspector: {item.inspector_name}</Text>
          ) : null}
          {item.notes ? <Text style={styles.detail}>{item.notes}</Text> : null}
        </MKCard>
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
    flex: 1,
    textTransform: "capitalize"
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  detail: {
    ...typography.bodySmall,
    color: colors.textPrimary
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
