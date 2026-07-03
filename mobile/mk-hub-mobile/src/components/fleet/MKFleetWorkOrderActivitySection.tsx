import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  formatWorkOrderActivityMessage,
  getWorkOrderActivityBadge
} from "../../lib/fleetWorkOrderActivity";
import { formatFleetDateTime } from "../../lib/fleetLabels";
import { MKBadge } from "../MKBadge";
import { MKCard } from "../MKCard";
import type { WorkOrderActivityEntry } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKFleetWorkOrderActivitySectionProps {
  activity: WorkOrderActivityEntry[];
  loading?: boolean;
}

export const MKFleetWorkOrderActivitySection: React.FC<MKFleetWorkOrderActivitySectionProps> = ({
  activity,
  loading = false
}) => {
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (activity.length === 0) {
    return (
      <MKCard style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No activity yet</Text>
        <Text style={styles.emptyText}>
          File attachments, status changes, and cost updates will appear here.
        </Text>
      </MKCard>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.introTitle}>Activity history</Text>
      <Text style={styles.introText}>
        File attachments, status changes, and cost updates (newest first).
      </Text>
      {activity.map((entry) => (
        <MKCard key={entry.id} style={styles.entryCard}>
          <View style={styles.entryHeader}>
            <MKBadge variant="neutral">{getWorkOrderActivityBadge(entry.action)}</MKBadge>
            <Text style={styles.entryTime}>{formatFleetDateTime(entry.created_at)}</Text>
          </View>
          <Text style={styles.entryMessage}>{formatWorkOrderActivityMessage(entry)}</Text>
          {entry.created_by_display ? (
            <Text style={styles.entryAuthor}>{entry.created_by_display}</Text>
          ) : null}
        </MKCard>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center"
  },
  introTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  introText: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  emptyCard: {
    gap: spacing.xs
  },
  emptyTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  entryCard: {
    gap: spacing.xs
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  entryTime: {
    ...typography.caption,
    color: colors.textMuted
  },
  entryMessage: {
    ...typography.body,
    color: colors.textPrimary
  },
  entryAuthor: {
    ...typography.caption,
    color: colors.textMuted
  }
});
