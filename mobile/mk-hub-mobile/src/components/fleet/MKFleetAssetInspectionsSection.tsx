import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKButton } from "../MKButton";
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
  canSchedule?: boolean;
  onSchedule?: () => void;
  onOpen?: (inspection: FleetInspection) => void;
}

export const MKFleetAssetInspectionsSection: React.FC<MKFleetAssetInspectionsSectionProps> = ({
  items,
  loading,
  canSchedule = false,
  onSchedule,
  onOpen
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
      <View style={styles.list}>
        {canSchedule && onSchedule ? (
          <MKButton title="Schedule inspection" onPress={onSchedule} />
        ) : null}
        <MKCard style={styles.emptyCard} elevated>
          <Text style={styles.emptyText}>No inspections recorded for this asset.</Text>
        </MKCard>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {canSchedule && onSchedule ? (
        <MKButton title="Schedule inspection" onPress={onSchedule} />
      ) : null}
      {items.map((item) => {
        const canOpen = Boolean(item.inspection_schedule_id && onOpen);
        const card = (
          <MKCard style={styles.card} elevated>
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
          {canOpen ? (
            <View style={styles.openRow}>
              <Text style={styles.openText}>Open inspection</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.homeAccent} />
            </View>
          ) : null}
        </MKCard>
        );
        if (!canOpen || !onOpen) return <View key={item.id}>{card}</View>;
        return (
          <TouchableOpacity key={item.id} activeOpacity={0.75} onPress={() => onOpen(item)}>
            {card}
          </TouchableOpacity>
        );
      })}
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
  openRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4
  },
  openText: {
    ...typography.buttonSmall,
    color: colors.homeAccent
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
