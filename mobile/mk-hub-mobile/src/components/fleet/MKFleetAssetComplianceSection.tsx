import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MKCard } from "../MKCard";
import { formatFleetDateTime } from "../../lib/fleetLabels";
import type { FleetComplianceRecord } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKFleetAssetComplianceSectionProps {
  items: FleetComplianceRecord[];
  loading: boolean;
}

export const MKFleetAssetComplianceSection: React.FC<MKFleetAssetComplianceSectionProps> = ({
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
        <Text style={styles.emptyText}>No compliance records for this asset.</Text>
      </MKCard>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <MKCard key={item.id} style={styles.card} elevated>
          <Text style={styles.cardTitle}>{item.record_type.replace(/_/g, " ")}</Text>
          {item.facility ? <Text style={styles.meta}>Facility: {item.facility}</Text> : null}
          {item.completed_by ? <Text style={styles.meta}>Completed by: {item.completed_by}</Text> : null}
          {item.expiry_date ? (
            <Text style={styles.meta}>Expires: {formatFleetDateTime(item.expiry_date)}</Text>
          ) : null}
          {item.annual_inspection_date ? (
            <Text style={styles.meta}>
              Annual inspection: {formatFleetDateTime(item.annual_inspection_date)}
            </Text>
          ) : null}
          {item.file_reference_number ? (
            <Text style={styles.meta}>File ref: {item.file_reference_number}</Text>
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
  cardTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
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
