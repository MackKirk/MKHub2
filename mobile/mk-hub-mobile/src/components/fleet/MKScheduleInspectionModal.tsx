import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MKButton } from "../MKButton";
import { MKDateQuickPick } from "../MKDateQuickPick";
import { formatDateLocal, localDateInputToIso } from "../../lib/dateUtils";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface MKScheduleInspectionModalProps {
  visible: boolean;
  assetName?: string | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (scheduledAt: string, notes: string) => void;
}

export const MKScheduleInspectionModal: React.FC<MKScheduleInspectionModalProps> = ({
  visible,
  assetName,
  loading = false,
  onClose,
  onSubmit
}) => {
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!visible) return;
    setDate(formatDateLocal(new Date()));
    setNotes("");
  }, [visible]);

  const handleSubmit = () => {
    try {
      localDateInputToIso(date.trim());
    } catch (err) {
      Alert.alert(
        "Invalid date",
        err instanceof Error ? err.message : "Use a date like 2026-04-15."
      );
      return;
    }
    onSubmit(date.trim(), notes.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={loading ? undefined : onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>Schedule inspection</Text>
          <Text style={styles.subtitle}>
            {assetName
              ? `Creates a pending Body and Mechanical inspection for ${assetName}.`
              : "Creates a pending Body and Mechanical inspection."}
          </Text>
          <MKDateQuickPick value={date} onChange={setDate} editable={!loading} />
          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            placeholderTextColor={colors.textMuted}
            multiline
            editable={!loading}
          />
          <View style={styles.actions}>
            <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} />
            <MKButton
              title="Schedule"
              variant="accent"
              onPress={handleSubmit}
              loading={loading}
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
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: spacing.lg
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.cardElevated
  },
  title: {
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    color: colors.textPrimary
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: spacing.xs
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary
  },
  notes: {
    minHeight: 72
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm
  }
});
