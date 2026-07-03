import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CATEGORY_LABELS,
  URGENCY_LABELS,
  WORK_ORDER_STATUS_LABELS,
  formatFleetDate,
  getUrgencyVariant,
  getWorkOrderStatusVariant
} from "../../lib/fleetLabels";
import { resolveFileUrl } from "../../lib/fileUrls";
import { MKBadge } from "../MKBadge";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import type { WorkOrder } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

interface MKFleetWorkOrderHeroProps {
  workOrder: WorkOrder;
  assetPhotoUrl?: string | null;
  assetLine: string;
  assetLineLoading?: boolean;
  variant?: "full" | "compact";
  canStartService: boolean;
  canFinishService: boolean;
  canReopen: boolean;
  canEditStatus: boolean;
  onOpenAsset: () => void;
  onStartService: () => void;
  onFinishService: () => void;
  onReopen: () => void;
  onEditStatus: () => void;
}

export const MKFleetWorkOrderHero: React.FC<MKFleetWorkOrderHeroProps> = ({
  workOrder,
  assetPhotoUrl,
  assetLine,
  assetLineLoading = false,
  variant = "full",
  canStartService,
  canFinishService,
  canReopen,
  canEditStatus,
  onOpenAsset,
  onStartService,
  onFinishService,
  onReopen,
  onEditStatus
}) => {
  const isCompact = variant === "compact";
  const categoryLabel = CATEGORY_LABELS[workOrder.category] ?? workOrder.category;
  const hasActions = canStartService || canFinishService || canReopen;

  if (isCompact) {
    return (
      <MKCard style={styles.compactCard}>
        <View style={styles.compactRow}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            {workOrder.work_order_number}
          </Text>
          <MKBadge variant={getWorkOrderStatusVariant(workOrder.status)}>
            {WORK_ORDER_STATUS_LABELS[workOrder.status] ?? workOrder.status}
          </MKBadge>
        </View>
      </MKCard>
    );
  }

  return (
    <MKCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.photoWrap}>
          {workOrder.entity_type === "fleet" && assetPhotoUrl ? (
            <Image source={{ uri: assetPhotoUrl }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name="car-outline" size={32} color={colors.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.primaryTitle}>{workOrder.work_order_number}</Text>
          <Text style={styles.subtitle}>{categoryLabel}</Text>

          <View style={styles.stats}>
            <HeroStat label="Asset">
              {assetLineLoading ? (
                <Text style={styles.muted}>Loading…</Text>
              ) : (
                <TouchableOpacity onPress={onOpenAsset} activeOpacity={0.75}>
                  <Text style={styles.link} numberOfLines={2}>
                    {assetLine || "Open record"}
                  </Text>
                </TouchableOpacity>
              )}
            </HeroStat>
            <HeroStat label="Created">
              <Text style={styles.value}>{formatFleetDate(workOrder.created_at)}</Text>
            </HeroStat>
            <HeroStat label="Entity">
              <Text style={styles.value}>{workOrder.entity_type}</Text>
            </HeroStat>
            <HeroStat label="Status">
              <View style={styles.statusRow}>
                <MKBadge variant={getWorkOrderStatusVariant(workOrder.status)}>
                  {WORK_ORDER_STATUS_LABELS[workOrder.status] ?? workOrder.status}
                </MKBadge>
                {canEditStatus ? (
                  <TouchableOpacity onPress={onEditStatus} hitSlop={8}>
                    <Text style={styles.editLink}>Edit</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </HeroStat>
            <HeroStat label="Urgency">
              <MKBadge variant={getUrgencyVariant(workOrder.urgency)}>
                {URGENCY_LABELS[workOrder.urgency] ?? workOrder.urgency}
              </MKBadge>
            </HeroStat>
            <HeroStat label="Category">
              <Text style={styles.value}>{categoryLabel}</Text>
            </HeroStat>
          </View>
        </View>
      </View>

      {hasActions ? (
        <View style={styles.actions}>
          {canStartService ? (
            <MKButton title="Start service" onPress={onStartService} size="compact" />
          ) : null}
          {canFinishService ? (
            <MKButton
              title="Finish service"
              onPress={onFinishService}
              size="compact"
              variant="secondary"
            />
          ) : null}
          {canReopen ? (
            <MKButton title="Reopen" onPress={onReopen} size="compact" variant="secondary" />
          ) : null}
        </View>
      ) : null}
    </MKCard>
  );
};

function HeroStat({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md
  },
  compactCard: {
    paddingVertical: spacing.sm
  },
  compactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  compactTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    flex: 1
  },
  row: {
    flexDirection: "row",
    gap: spacing.md
  },
  photoWrap: {
    width: 112
  },
  photo: {
    width: 112,
    height: 88,
    borderRadius: radius.control,
    backgroundColor: colors.background
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  primaryTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "capitalize"
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xs
  },
  stat: {
    width: "45%",
    gap: 2
  },
  statLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  value: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    textTransform: "capitalize"
  },
  muted: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  link: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  editLink: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  }
});
