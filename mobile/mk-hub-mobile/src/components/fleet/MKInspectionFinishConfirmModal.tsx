import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { MKButton } from "../MKButton";
import { formatDateLocal } from "../../lib/dateUtils";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKInspectionFinishConfirmModalProps {
  visible: boolean;
  inspectionLabel: string;
  resultLabel: string;
  result: string;
  loading?: boolean;
  allowScheduleNext?: boolean;
  onCancel: () => void;
  onConfirm: (nextDate: string | null) => void;
}

export const MKInspectionFinishConfirmModal: React.FC<
  MKInspectionFinishConfirmModalProps
> = ({
  visible,
  inspectionLabel,
  resultLabel,
  result,
  loading,
  allowScheduleNext = false,
  onCancel,
  onConfirm
}) => {
  const failed = result === "fail";
  const [scheduleNext, setScheduleNext] = useState(false);
  const [nextDate, setNextDate] = useState("");

  useEffect(() => {
    if (!visible) return;
    setScheduleNext(false);
    const next = new Date();
    next.setDate(next.getDate() + 30);
    setNextDate(formatDateLocal(next));
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={loading ? undefined : onCancel}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Text style={styles.iconText}>{failed ? "!" : "OK"}</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Inspection</Text>
              <Text style={styles.title}>Finish inspection?</Text>
            </View>
          </View>

          <Text style={styles.description}>
            Finalize this {inspectionLabel} inspection with the result below.
          </Text>

          <View style={[styles.resultBadge, failed && styles.resultBadgeFail]}>
            <Text style={[styles.resultLabel, failed && styles.resultLabelFail]}>
              {resultLabel}
            </Text>
          </View>

          {failed ? (
            <Text style={styles.warning}>
              A work order may be created automatically for a failed inspection.
            </Text>
          ) : null}

          {allowScheduleNext ? (
            <View style={styles.nextBlock}>
              <View style={styles.nextRow}>
                <Text style={styles.nextLabel}>Schedule next inspection</Text>
                <Switch value={scheduleNext} onValueChange={setScheduleNext} disabled={loading} />
              </View>
              {scheduleNext ? (
                <TextInput
                  style={styles.dateInput}
                  value={nextDate}
                  onChangeText={setNextDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  editable={!loading}
                />
              ) : null}
            </View>
          ) : null}

          <View style={styles.actions}>
            <MKButton
              title="Cancel"
              variant="secondary"
              onPress={onCancel}
              disabled={loading}
              style={styles.actionButton}
            />
            <MKButton
              title="Finish"
              onPress={() => onConfirm(scheduleNext ? nextDate.trim() : null)}
              loading={loading}
              style={styles.actionButton}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 11, 12, 0.58)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.cardElevated
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center"
  },
  iconText: {
    ...typography.subtitle,
    color: colors.primary
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  eyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  description: {
    ...typography.body,
    color: colors.textBody
  },
  resultBadge: {
    alignSelf: "flex-start",
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0"
  },
  resultBadgeFail: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca"
  },
  resultLabel: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.success
  },
  resultLabelFail: {
    color: colors.primary
  },
  nextBlock: {
    gap: spacing.sm
  },
  nextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  nextLabel: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  dateInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.textPrimary
  },
  warning: {
    ...typography.bodySmall,
    color: colors.textBody,
    marginTop: spacing.md
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl
  },
  actionButton: {
    flex: 1
  }
});
