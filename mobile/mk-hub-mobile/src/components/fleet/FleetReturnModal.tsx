import React, { useEffect, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MKButton } from "../MKButton";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";
import type { AssetAssignmentReturnRequest } from "../../types/fleet";

interface FleetReturnModalProps {
  visible: boolean;
  title: string;
  showOdometer: boolean;
  showHours: boolean;
  minOdometer?: number | null;
  minHours?: number | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: AssetAssignmentReturnRequest) => void;
}

export const FleetReturnModal: React.FC<FleetReturnModalProps> = ({
  visible,
  title,
  showOdometer,
  showHours,
  minOdometer,
  minHours,
  loading = false,
  onClose,
  onSubmit
}) => {
  const [odometerIn, setOdometerIn] = useState("");
  const [hoursIn, setHoursIn] = useState("");
  const [notesIn, setNotesIn] = useState("");

  useEffect(() => {
    if (!visible) return;
    setOdometerIn("");
    setHoursIn("");
    setNotesIn("");
  }, [visible]);

  const handleSubmit = () => {
    onSubmit({
      odometer_in: odometerIn.trim() ? Number.parseInt(odometerIn, 10) : null,
      hours_in: hoursIn.trim() ? Number.parseFloat(hoursIn) : null,
      notes_in: notesIn.trim() || null
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Record return readings and notes.</Text>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          {showOdometer ? (
            <View style={styles.field}>
              <Text style={styles.label}>
                Odometer in{minOdometer != null ? ` (min ${minOdometer})` : ""}
              </Text>
              <TextInput
                style={styles.input}
                value={odometerIn}
                onChangeText={setOdometerIn}
                keyboardType="number-pad"
                placeholder="Current odometer"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}

          {showHours ? (
            <View style={styles.field}>
              <Text style={styles.label}>
                Hours in{minHours != null ? ` (min ${minHours})` : ""}
              </Text>
              <TextInput
                style={styles.input}
                value={hoursIn}
                onChangeText={setHoursIn}
                keyboardType="decimal-pad"
                placeholder="Current hours"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notesIn}
              onChangeText={setNotesIn}
              placeholder="Optional notes"
              placeholderTextColor={colors.textMuted}
              multiline
            />
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} />
          <MKButton title="Check in / Return" onPress={handleSubmit} loading={loading} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg
  },
  form: {
    flex: 1
  },
  field: {
    marginBottom: spacing.md
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
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
  textArea: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.md
  }
});
