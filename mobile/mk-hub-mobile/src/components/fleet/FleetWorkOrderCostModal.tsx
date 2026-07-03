import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import type { WorkOrderCostItem } from "../../types/fleet";
import type { WorkOrderCostCategory } from "../../lib/fleetWorkOrderCosts";
import { MKButton } from "../MKButton";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

const CATEGORY_LABELS: Record<WorkOrderCostCategory, string> = {
  labor: "Labor",
  parts: "Parts",
  other: "Other"
};

interface FleetWorkOrderCostModalProps {
  visible: boolean;
  category: WorkOrderCostCategory;
  existingCost?: WorkOrderCostItem;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (item: WorkOrderCostItem) => void;
}

export const FleetWorkOrderCostModal: React.FC<FleetWorkOrderCostModalProps> = ({
  visible,
  category,
  existingCost,
  loading = false,
  onClose,
  onSubmit
}) => {
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const isEditing = Boolean(existingCost);

  useEffect(() => {
    if (!visible) return;
    setDescription(existingCost?.description ?? "");
    setAmountInput(
      existingCost?.amount && existingCost.amount > 0 ? String(existingCost.amount) : ""
    );
  }, [visible, existingCost]);

  const amount = parseFloat(amountInput.replace(/,/g, "")) || 0;
  const canSubmit = description.trim().length > 0 && amount > 0 && !loading;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      description: description.trim(),
      amount,
      invoice_files: existingCost?.invoice_files ?? []
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {isEditing ? `Edit ${CATEGORY_LABELS[category].toLowerCase()} cost` : `Add ${CATEGORY_LABELS[category].toLowerCase()} cost`}
          </Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Description"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.label}>Price ($)</Text>
          <TextInput
            style={styles.input}
            value={amountInput}
            onChangeText={setAmountInput}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
          />
          <View style={styles.actions}>
            <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} />
            <MKButton
              title={isEditing ? "Update" : "Add"}
              onPress={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  card: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.sm
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  }
});
