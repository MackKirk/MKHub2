import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";
import {
  CATEGORY_LABELS,
  SCHEDULE_STATUS_LABELS,
  URGENCY_LABELS,
  formatFleetDate,
  getUrgencyVariant,
  getWorkOrderStatusVariant
} from "../../lib/fleetLabels";
import { resolveFileUrl } from "../../lib/fileUrls";
import { MKBadge } from "../MKBadge";
import { MKCard } from "../MKCard";
import type { FleetAsset, InspectionSchedule } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

interface MKInspectionScheduleHeroProps {
  schedule: InspectionSchedule;
  asset?: FleetAsset | null;
  onViewAsset?: () => void;
}

export const MKInspectionScheduleHero: React.FC<MKInspectionScheduleHeroProps> = ({
  schedule,
  asset,
  onViewAsset
}) => {
  const { token } = useAuth();
  const photoId = asset?.photos?.[0];
  const photoUri = photoId
    ? resolveFileUrl(`/files/${photoId}/thumbnail?w=400`, token)
    : null;
  const vehicleLabel =
    asset?.unit_number?.trim() || schedule.fleet_asset_name?.trim() || "—";

  return (
    <MKCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.photoWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <Ionicons name="car-outline" size={36} color={colors.textMuted} />
            </View>
          )}
          {onViewAsset ? (
            <TouchableOpacity onPress={onViewAsset} activeOpacity={0.75}>
              <Text style={styles.viewAsset}>View asset</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.stats}>
          <HeroStat label="Status">
            <MKBadge variant={getWorkOrderStatusVariant(schedule.status)}>
              {SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status}
            </MKBadge>
          </HeroStat>
          <HeroStat label="Category">
            <Text style={styles.statValue}>
              {CATEGORY_LABELS[schedule.category] ?? schedule.category}
            </Text>
          </HeroStat>
          <HeroStat label="Urgency">
            <MKBadge variant={getUrgencyVariant(schedule.urgency)}>
              {URGENCY_LABELS[schedule.urgency] ?? schedule.urgency}
            </MKBadge>
          </HeroStat>
          <HeroStat label="Vehicle">
            <Text style={styles.statValue} numberOfLines={1}>
              {vehicleLabel}
            </Text>
          </HeroStat>
          <HeroStat label="Scheduled">
            <Text style={styles.statValue}>{formatFleetDate(schedule.scheduled_at)}</Text>
          </HeroStat>
          <HeroStat label="Created">
            <Text style={styles.statValue}>{formatFleetDate(schedule.created_at)}</Text>
          </HeroStat>
        </View>
      </View>
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
  row: {
    flexDirection: "row",
    gap: spacing.md
  },
  photoWrap: {
    width: 120,
    gap: spacing.xs
  },
  photo: {
    width: 120,
    height: 96,
    borderRadius: radius.control,
    backgroundColor: colors.background
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border
  },
  viewAsset: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  stats: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
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
  statValue: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    textTransform: "capitalize"
  }
});
