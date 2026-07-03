import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { MKCard } from "../MKCard";
import { formatFleetDateTime } from "../../lib/fleetLabels";
import type { FleetHistoryItem } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKFleetAssetLogsSectionProps {
  items: FleetHistoryItem[];
  loading: boolean;
}

export const MKFleetAssetLogsSection: React.FC<MKFleetAssetLogsSectionProps> = ({
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
        <Text style={styles.emptyText}>No activity logged for this asset.</Text>
      </MKCard>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <MKCard key={item.id} style={styles.card} elevated>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {item.subtitle ? <Text style={styles.meta}>{item.subtitle}</Text> : null}
          {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
          <Text style={styles.meta}>
            {formatFleetDateTime(item.occurred_at)}
            {item.actor_name ? ` · ${item.actor_name}` : ""}
          </Text>
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
