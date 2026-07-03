import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  buildUpdatedCosts,
  getCostCategoryTotal,
  getWorkOrderCostsTotal,
  normalizeCostItems,
  type WorkOrderCostCategory
} from "../../lib/fleetWorkOrderCosts";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import { FleetWorkOrderCostModal } from "./FleetWorkOrderCostModal";
import type { WorkOrder, WorkOrderCostItem, WorkOrderCosts } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKFleetWorkOrderCostsSectionProps {
  workOrder: WorkOrder;
  canEdit: boolean;
  saving: boolean;
  onSaveCosts: (costs: WorkOrderCosts) => void;
}

const CATEGORY_META: Record<
  WorkOrderCostCategory,
  { title: string; description: string; empty: string; addLabel: string }
> = {
  labor: {
    title: "Labor",
    description: "Labor entries and amounts.",
    empty: "No labor costs.",
    addLabel: "Add labor"
  },
  parts: {
    title: "Parts",
    description: "Parts and materials costs.",
    empty: "No parts costs.",
    addLabel: "Add parts"
  },
  other: {
    title: "Other",
    description: "Miscellaneous costs.",
    empty: "No other costs.",
    addLabel: "Add other"
  }
};

export const MKFleetWorkOrderCostsSection: React.FC<MKFleetWorkOrderCostsSectionProps> = ({
  workOrder,
  canEdit,
  saving,
  onSaveCosts
}) => {
  const costs = workOrder.costs ?? {};
  const [editing, setEditing] = useState<{
    category: WorkOrderCostCategory;
    index?: number;
  } | null>(null);

  const laborCosts = useMemo(() => normalizeCostItems(costs.labor), [costs.labor]);
  const partsCosts = useMemo(() => normalizeCostItems(costs.parts), [costs.parts]);
  const otherCosts = useMemo(() => normalizeCostItems(costs.other), [costs.other]);

  const itemsByCategory: Record<WorkOrderCostCategory, WorkOrderCostItem[]> = {
    labor: laborCosts,
    parts: partsCosts,
    other: otherCosts
  };

  const removeCost = (category: WorkOrderCostCategory, index: number) => {
    Alert.alert("Remove cost", "Remove this cost line?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          const next = buildUpdatedCosts(costs, category, (items) =>
            items.filter((_, idx) => idx !== index)
          );
          onSaveCosts(next);
        }
      }
    ]);
  };

  const handleSubmitCost = (item: WorkOrderCostItem) => {
    if (!editing) return;
    const next = buildUpdatedCosts(costs, editing.category, (items) => {
      if (editing.index !== undefined) {
        return items.map((existing, idx) => (idx === editing.index ? item : existing));
      }
      return [...items, item];
    });
    onSaveCosts(next);
    setEditing(null);
  };

  const existingCost =
    editing?.index !== undefined
      ? itemsByCategory[editing.category][editing.index]
      : undefined;

  return (
    <View style={styles.wrap}>
      {(["labor", "parts", "other"] as WorkOrderCostCategory[]).map((category) => {
        const meta = CATEGORY_META[category];
        const items = itemsByCategory[category];
        return (
          <MKCard key={category} style={styles.categoryCard}>
            <View style={styles.categoryHeader}>
              <View style={styles.headerText}>
                <Text style={styles.sectionTitle}>{meta.title}</Text>
                <Text style={styles.sectionDescription}>{meta.description}</Text>
              </View>
              <Text style={styles.total}>${getCostCategoryTotal(costs, category).toFixed(2)}</Text>
            </View>

            {canEdit ? (
              <MKButton
                title={meta.addLabel}
                variant="secondary"
                size="compact"
                onPress={() => setEditing({ category })}
                disabled={saving}
              />
            ) : null}

            {items.length === 0 ? (
              <Text style={styles.empty}>{meta.empty}</Text>
            ) : (
              items.map((item, index) => (
                <View key={`${category}-${index}-${item.description}`} style={styles.itemRow}>
                  <View style={styles.itemText}>
                    <Text style={styles.itemLabel}>Name</Text>
                    <Text style={styles.itemValue}>{item.description || "—"}</Text>
                    <Text style={styles.itemLabel}>Price</Text>
                    <Text style={styles.itemValue}>${item.amount.toFixed(2)}</Text>
                  </View>
                  {canEdit ? (
                    <View style={styles.itemActions}>
                      <TouchableOpacity
                        onPress={() => setEditing({ category, index })}
                        disabled={saving}
                      >
                        <Text style={styles.link}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeCost(category, index)} disabled={saving}>
                        <Text style={styles.danger}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </MKCard>
        );
      })}

      <MKCard style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Costs Summary</Text>
        <Text style={styles.sectionDescription}>Totals by category and overall work order cost.</Text>
        <View style={styles.summaryGrid}>
          <SummaryField label="Labor" value={`$${getCostCategoryTotal(costs, "labor").toFixed(2)}`} />
          <SummaryField label="Parts" value={`$${getCostCategoryTotal(costs, "parts").toFixed(2)}`} />
          <SummaryField label="Other" value={`$${getCostCategoryTotal(costs, "other").toFixed(2)}`} />
        </View>
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>${getWorkOrderCostsTotal(costs).toFixed(2)}</Text>
        </View>
      </MKCard>

      <FleetWorkOrderCostModal
        visible={Boolean(editing)}
        category={editing?.category ?? "labor"}
        existingCost={existingCost}
        loading={saving}
        onClose={() => setEditing(null)}
        onSubmit={handleSubmitCost}
      />
    </View>
  );
};

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryField}>
      <Text style={styles.itemLabel}>{label}</Text>
      <Text style={styles.itemValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md
  },
  categoryCard: {
    gap: spacing.sm
  },
  categoryHeader: {
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
  total: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  empty: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.sm
  },
  itemText: {
    gap: 2
  },
  itemLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  itemValue: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  itemActions: {
    flexDirection: "row",
    gap: spacing.md
  },
  link: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  danger: {
    ...typography.bodySmall,
    color: "#dc2626",
    fontFamily: typography.button.fontFamily
  },
  summaryCard: {
    gap: spacing.sm
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.sm
  },
  summaryField: {
    width: "30%",
    gap: 2
  },
  grandTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.sm
  },
  grandTotalLabel: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  grandTotalValue: {
    ...typography.subtitle,
    color: colors.primary
  }
});
