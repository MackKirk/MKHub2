import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MKBadge } from "../MKBadge";
import {
  INSPECTION_RESULT_LABELS,
  getInspectionConditionVariant,
  getInspectionResultVariant
} from "../../lib/fleetLabels";
import type { FleetInspectionDetail } from "../../types/fleet";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import { MKInspectionPhotoGallery } from "./MKInspectionPhotoGallery";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const CONDITION_ICONS: Record<string, string> = {
  ok: "✓",
  damage: "✗",
  conditional: "⚠"
};

interface MKInspectionReadOnlySectionProps {
  inspection: FleetInspectionDetail;
  kind: "body" | "mechanical";
  templateAreas?: Array<{ key: string; label: string; description?: string }>;
  templateSections?: Array<{
    id: string;
    title: string;
    items: Array<{ key: string; label: string; category: string }>;
  }>;
  pending: boolean;
  canCreateWorkOrder?: boolean;
  creatingWorkOrder?: boolean;
  onCreateWorkOrder?: () => void;
  onViewWorkOrder?: (workOrderId: string) => void;
}

export const MKInspectionReadOnlySection: React.FC<MKInspectionReadOnlySectionProps> = ({
  inspection,
  kind,
  templateAreas = [],
  templateSections = [],
  pending,
  canCreateWorkOrder = false,
  creatingWorkOrder = false,
  onCreateWorkOrder,
  onViewWorkOrder
}) => {
  const areas = inspection.checklist_results?.areas ?? [];

  return (
    <View style={styles.wrap}>
      {kind === "body"
        ? templateAreas.map((area) => {
            const result = areas.find((a) => a.key === area.key);
            const cond = result?.condition ?? "";
            return (
              <View key={area.key} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{area.label}</Text>
                  {area.description ? (
                    <Text style={styles.rowMeta}>{area.description}</Text>
                  ) : null}
                  {result?.issues ? (
                    <Text style={styles.rowMeta}>{result.issues}</Text>
                  ) : null}
                </View>
                {cond ? (
                  <MKBadge variant={getInspectionConditionVariant(cond)}>
                    {CONDITION_ICONS[cond] ?? cond}
                  </MKBadge>
                ) : null}
              </View>
            );
          })
        : templateSections.map((section) => (
            <View key={section.id} style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.items.map((item) => {
                const raw = inspection.checklist_results?.[item.key];
                const cond =
                  typeof raw === "object" && raw != null
                    ? (raw as { status?: string; condition?: string }).status ||
                      (raw as { condition?: string }).condition ||
                      ""
                    : (raw as string) || "";
                return (
                  <View key={item.key} style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      <Text style={styles.rowMeta}>{item.category}</Text>
                    </View>
                    {cond ? (
                      <MKBadge variant={getInspectionConditionVariant(String(cond))}>
                        {CONDITION_ICONS[String(cond)] ?? String(cond)}
                      </MKBadge>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}

      {inspection.notes ? (
        <MKCard style={styles.notesCard}>
          <Text style={styles.notesLabel}>Observations</Text>
          <Text style={styles.notesText}>{inspection.notes}</Text>
        </MKCard>
      ) : null}

      {inspection.photos && inspection.photos.length > 0 ? (
        <MKCard style={styles.photosCard}>
          <MKInspectionPhotoGallery photoIds={inspection.photos} readOnly />
        </MKCard>
      ) : null}

      {!pending ? (
        <View style={styles.resultRow}>
          <Text style={styles.resultLabel}>Result</Text>
          <MKBadge variant={getInspectionResultVariant(inspection.result)}>
            {INSPECTION_RESULT_LABELS[inspection.result] ?? inspection.result}
          </MKBadge>
        </View>
      ) : null}

      {inspection.auto_generated_work_order_id && onViewWorkOrder ? (
        <MKCard style={styles.woCard}>
          <Text style={styles.woTitle}>Work order</Text>
          <TouchableOpacity onPress={() => onViewWorkOrder(inspection.auto_generated_work_order_id!)}>
            <Text style={styles.woLink}>View work order</Text>
          </TouchableOpacity>
        </MKCard>
      ) : null}

      {!pending &&
      !inspection.auto_generated_work_order_id &&
      canCreateWorkOrder &&
      onCreateWorkOrder ? (
        <MKCard style={styles.woCard}>
          <Text style={styles.woTitle}>
            {inspection.result === "fail" ? "Inspection failed" : "Create work order"}
          </Text>
          <Text style={styles.woHint}>
            {inspection.result === "fail"
              ? "Create a linked work order to address the issues in the shop."
              : "Inspection is complete. Create a linked work order if you still need shop follow-up."}
          </Text>
          <MKButton
            title="Create work order"
            onPress={onCreateWorkOrder}
            loading={creatingWorkOrder}
          />
        </MKCard>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm
  },
  sectionBlock: {
    gap: spacing.xs
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  rowLabel: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  rowMeta: {
    ...typography.caption,
    color: colors.textMuted
  },
  notesCard: {
    gap: spacing.xs
  },
  notesLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  notesText: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  photosCard: {
    gap: spacing.sm
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  resultLabel: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  woCard: {
    gap: spacing.sm,
    backgroundColor: "#fffbeb",
    borderColor: "#fde68a"
  },
  woTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  woHint: {
    ...typography.caption,
    color: colors.textMuted
  },
  woLink: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  }
});
