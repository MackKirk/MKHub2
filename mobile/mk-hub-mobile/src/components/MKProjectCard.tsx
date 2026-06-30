import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { MKCard } from "./MKCard";
import { MKBadge } from "./MKBadge";
import { MKListRowAction } from "./MKListRowAction";
import { getProjectStatusBadgeVariant } from "../lib/projectUi";
import { resolveFileUrl } from "../lib/fileUrls";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { radius } from "../theme/radius";
import type { ProjectListItem } from "../types/projects";

export type ProjectQuickTab =
  | "files"
  | "proposal"
  | "pricing"
  | "reports"
  | "overview";

interface MKProjectCardProps {
  project: ProjectListItem;
  token: string | null;
  onPress: () => void;
  onQuickAction?: (tab: ProjectQuickTab) => void;
  style?: ViewStyle;
  showQuickActions?: boolean;
}

const QUICK_ACTIONS: Array<{ tab: ProjectQuickTab; icon: string }> = [
  { tab: "files", icon: "📁" },
  { tab: "proposal", icon: "📄" },
  { tab: "pricing", icon: "💰" },
  { tab: "reports", icon: "📝" }
];

export const MKProjectCard: React.FC<MKProjectCardProps> = ({
  project,
  token,
  onPress,
  onQuickAction,
  style,
  showQuickActions = true
}) => {
  const coverUri =
    resolveFileUrl(project.cover_image_url, token) ??
    resolveFileUrl("/ui/assets/placeholders/project.png", token);
  const progress = Math.max(0, Math.min(100, Number(project.progress ?? 0)));
  const clientName =
    project.client_display_name || project.client_name || "";
  const statusVariant = getProjectStatusBadgeVariant(project.status_label);

  return (
    <MKCard onPress={onPress} style={[styles.card, style]} elevated>
      <View style={styles.coverWrap}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]} />
        )}
        {project.status_label ? (
          <View style={styles.badgeOverlay}>
            <MKBadge variant={statusVariant}>{project.status_label}</MKBadge>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {project.name}
        </Text>
        {project.code ? (
          <Text style={styles.code} numberOfLines={1}>
            {project.code}
          </Text>
        ) : null}
        {clientName ? (
          <Text style={styles.client} numberOfLines={1}>
            {clientName}
          </Text>
        ) : null}

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress)}%</Text>
        </View>

        {showQuickActions && onQuickAction ? (
          <View style={styles.quickRow}>
            {QUICK_ACTIONS.map(({ tab, icon }) => (
              <MKListRowAction
                key={tab}
                icon={icon}
                onPress={() => onQuickAction(tab)}
              />
            ))}
          </View>
        ) : null}
      </View>
    </MKCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: "hidden"
  },
  coverWrap: {
    position: "relative"
  },
  cover: {
    width: "100%",
    height: 140,
    backgroundColor: "#e5e7eb"
  },
  coverPlaceholder: {
    backgroundColor: "#d1d5db"
  },
  badgeOverlay: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs
  },
  name: {
    ...typography.subtitle,
    fontSize: 16
  },
  code: {
    ...typography.caption,
    color: colors.textMuted
  },
  client: {
    ...typography.bodySmall,
    color: colors.textBody
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs
  },
  progressTrack: {
    flex: 1,
    height: 6,
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
    minWidth: 36,
    textAlign: "right"
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm
  }
});
