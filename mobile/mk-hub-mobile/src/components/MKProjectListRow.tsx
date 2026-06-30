import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKBadge } from "./MKBadge";
import { getProjectStatusBadgeVariant } from "../lib/projectUi";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { radius } from "../theme/radius";
import type { ProjectListItem } from "../types/projects";

interface MKProjectListRowProps {
  project: ProjectListItem;
  onPress: () => void;
  style?: ViewStyle;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

export const MKProjectListRow: React.FC<MKProjectListRowProps> = ({
  project,
  onPress,
  style
}) => {
  const clientName =
    project.client_display_name || project.client_name || "";
  const progress = Math.max(0, Math.min(100, Number(project.progress ?? 0)));
  const start = formatDate(project.date_start || project.created_at);
  const eta = formatDate(project.date_eta);
  const statusVariant = getProjectStatusBadgeVariant(project.status_label);
  const showProgress = !project.is_bidding && progress > 0;

  const metaParts = [project.code, clientName].filter(Boolean);

  return (
    <TouchableOpacity
      style={[styles.row, style]}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={2}>
            {project.name || "Untitled"}
          </Text>
          {project.status_label ? (
            <MKBadge variant={statusVariant} style={styles.badge}>
              {project.status_label}
            </MKBadge>
          ) : null}
        </View>

        {metaParts.length > 0 ? (
          <Text style={styles.meta} numberOfLines={1}>
            {metaParts.join(" · ")}
          </Text>
        ) : null}

        {(start || eta) && (
          <Text style={styles.dates} numberOfLines={1}>
            {[start && `Start ${start}`, eta && `ETA ${eta}`]
              .filter(Boolean)
              .join("  ·  ")}
          </Text>
        )}

        {showProgress ? (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progress}%` }]}
              />
            </View>
            <Text style={styles.progressText}>{Math.round(progress)}%</Text>
          </View>
        ) : null}
      </View>

      <Ionicons
        name="chevron-forward"
        size={20}
        color={colors.textMuted}
        style={styles.chevron}
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  name: {
    ...typography.subtitle,
    fontSize: 15,
    flex: 1,
    color: colors.textPrimary
  },
  badge: {
    flexShrink: 0,
    maxWidth: "45%"
  },
  meta: {
    ...typography.bodySmall,
    color: colors.textBody
  },
  dates: {
    ...typography.caption,
    color: colors.textMuted
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: "#e5e7eb",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: radius.pill
  },
  progressText: {
    ...typography.caption,
    minWidth: 32,
    textAlign: "right",
    color: colors.textMuted
  },
  chevron: {
    marginTop: 2
  }
});
