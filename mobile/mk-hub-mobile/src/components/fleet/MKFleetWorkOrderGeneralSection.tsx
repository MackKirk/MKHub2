import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { formatDurationMinutes, formatFleetDateTime } from "../../lib/fleetLabels";
import { MKBadge } from "../MKBadge";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import type { WorkOrder } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

interface MKFleetWorkOrderGeneralSectionProps {
  workOrder: WorkOrder;
  canEditDescription: boolean;
  descriptionEditing: boolean;
  descriptionDraft: string;
  saving: boolean;
  onStartEditDescription: () => void;
  onCancelEditDescription: () => void;
  onDescriptionDraftChange: (value: string) => void;
  onSaveDescription: () => void;
  onViewOriginatingInspection?: () => void;
}

export const MKFleetWorkOrderGeneralSection: React.FC<MKFleetWorkOrderGeneralSectionProps> = ({
  workOrder,
  canEditDescription,
  descriptionEditing,
  descriptionDraft,
  saving,
  onStartEditDescription,
  onCancelEditDescription,
  onDescriptionDraftChange,
  onSaveDescription,
  onViewOriginatingInspection
}) => {
  const scheduledDate = workOrder.scheduled_start_at
    ? new Date(workOrder.scheduled_start_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    : "—";
  const scheduledTime = workOrder.scheduled_start_at
    ? new Date(workOrder.scheduled_start_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "—";

  return (
    <View style={styles.wrap}>
      <MKCard style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.headerText}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.sectionDescription}>Work order details and notes.</Text>
          </View>
          {canEditDescription && !descriptionEditing ? (
            <TouchableOpacity onPress={onStartEditDescription}>
              <Text style={styles.link}>Edit</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {descriptionEditing ? (
          <View style={styles.editBlock}>
            <TextInput
              style={styles.textArea}
              value={descriptionDraft}
              onChangeText={onDescriptionDraftChange}
              multiline
              textAlignVertical="top"
              placeholder="Description…"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.inlineActions}>
              <MKButton
                title="Cancel"
                variant="secondary"
                size="compact"
                onPress={onCancelEditDescription}
                disabled={saving}
              />
              <MKButton title="Save" size="compact" onPress={onSaveDescription} loading={saving} />
            </View>
          </View>
        ) : (
          <View style={styles.readBlock}>
            <Text style={styles.bodyText}>
              {workOrder.description?.trim() ? workOrder.description : "—"}
            </Text>
            {workOrder.origin_source === "inspection" && workOrder.origin_id && onViewOriginatingInspection ? (
              <TouchableOpacity onPress={onViewOriginatingInspection} activeOpacity={0.75}>
                <Text style={styles.link}>View originating inspection</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </MKCard>

      {workOrder.entity_type === "fleet" ? (
        <MKCard style={styles.card}>
          <Text style={styles.sectionTitle}>Service / Shop</Text>
          <Text style={styles.sectionDescription}>
            Scheduling, shop flags, and check-in/out times.
          </Text>
          <View style={styles.grid}>
            <InfoField label="Scheduled date" value={scheduledDate} />
            <InfoField label="Scheduled time" value={scheduledTime} />
            <InfoField
              label="Expected duration"
              value={formatDurationMinutes(workOrder.estimated_duration_minutes)}
            />
            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>Body repair required</Text>
              <MKBadge variant={workOrder.body_repair_required ? "warning" : "neutral"}>
                {workOrder.body_repair_required ? "Yes" : "No"}
              </MKBadge>
            </View>
            <View style={styles.infoField}>
              <Text style={styles.infoLabel}>New decals required</Text>
              <MKBadge variant={workOrder.new_stickers_applied ? "info" : "neutral"}>
                {workOrder.new_stickers_applied ? "Yes" : "No"}
              </MKBadge>
            </View>
            <InfoField label="Check-in" value={formatFleetDateTime(workOrder.check_in_at)} />
            <InfoField label="Check-out" value={formatFleetDateTime(workOrder.check_out_at)} />
          </View>
        </MKCard>
      ) : null}
    </View>
  );
};

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md
  },
  card: {
    gap: spacing.sm
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  headerText: {
    flex: 1,
    gap: 2
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  sectionDescription: {
    ...typography.caption,
    color: colors.textMuted
  },
  link: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  editBlock: {
    gap: spacing.sm
  },
  readBlock: {
    gap: spacing.sm
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary
  },
  textArea: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: spacing.md,
    backgroundColor: colors.background
  },
  inlineActions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.sm
  },
  infoField: {
    width: "45%",
    gap: 4
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  infoValue: {
    ...typography.bodySmall,
    color: colors.textPrimary
  }
});
