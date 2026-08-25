import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MKBadge } from "./MKBadge";
import {
  getProjectStatusBadgeVariant,
  getProjectStatusRail
} from "../lib/projectUi";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { shadows } from "../theme/radius";
import type { ProjectListItem } from "../types/projects";

interface MKProjectListRowProps {
  project: ProjectListItem;
  onPress: () => void;
  imageUri?: string | null;
  style?: ViewStyle;
}

const RAIL_WIDTH = 6;

function formatShortDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatMoney(value?: number | null): string | null {
  if (value == null || Number.isNaN(Number(value)) || Number(value) === 0) {
    return null;
  }
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

export const MKProjectListRow: React.FC<MKProjectListRowProps> = ({
  project,
  onPress,
  imageUri,
  style
}) => {
  const clientName = project.client_display_name || project.client_name || "";
  const progress = Math.max(0, Math.min(100, Number(project.progress ?? 0)));
  const start = formatShortDate(project.date_start || project.created_at);
  const eta = formatShortDate(project.date_eta);
  const value = formatMoney(project.service_value);
  const statusVariant = getProjectStatusBadgeVariant(project.status_label);
  const rail = getProjectStatusRail(project.status_label);
  const showProgress = !project.is_bidding && progress > 0;

  return (
    <Pressable style={[styles.card, style]} onPress={onPress}>
      <LinearGradient
        colors={[...rail]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.rail}
      />
        <View style={styles.body}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.cover} />
          ) : null}
          <View style={styles.inner}>
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

            {clientName ? (
              <View style={styles.metaRow}>
                <Ionicons name="business-outline" size={14} color={colors.textMuted} />
                <Text style={styles.meta} numberOfLines={1}>
                  {clientName}
                </Text>
              </View>
            ) : null}

            {project.code ? (
              <View style={styles.metaRow}>
                <Ionicons name="pricetag-outline" size={14} color={colors.textMuted} />
                <Text style={styles.meta} numberOfLines={1}>
                  {project.code}
                </Text>
              </View>
            ) : null}

            {start || eta || value ? (
              <View style={styles.metaRow}>
                {start ? <Text style={styles.dates}>Start {start}</Text> : null}
                {start && eta ? <Text style={styles.dot}>·</Text> : null}
                {eta ? <Text style={styles.dates}>ETA {eta}</Text> : null}
                {(start || eta) && value ? <Text style={styles.dot}>·</Text> : null}
                {value ? <Text style={styles.value}>{value}</Text> : null}
              </View>
            ) : null}

            {showProgress ? (
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round(progress)}%</Text>
              </View>
            ) : null}
          </View>
        </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  rail: { width: RAIL_WIDTH, alignSelf: "stretch" },
  body: { flex: 1 },
  cover: {
    width: "100%",
    height: 128,
    backgroundColor: colors.iconMutedBg
  },
  inner: { padding: 14, gap: 8 },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  name: {
    flex: 1,
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary
  },
  badge: {
    flexShrink: 0,
    maxWidth: "46%"
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  meta: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted
  },
  dates: {
    fontSize: 12,
    color: colors.textMuted
  },
  dot: {
    color: colors.textMuted,
    marginHorizontal: 2
  },
  value: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    color: colors.textPrimary
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
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.homeAccent,
    borderRadius: 999
  },
  progressText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    minWidth: 32,
    textAlign: "right",
    color: colors.textMuted
  }
});
