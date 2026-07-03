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
import type { WorkOrderCheckInRequest, WorkOrderCheckOutRequest } from "../../types/fleet";

type ServicePayload = WorkOrderCheckInRequest | WorkOrderCheckOutRequest;

interface FleetWorkOrderServiceModalProps {
  visible: boolean;
  mode: "check-in" | "check-out";
  title: string;
  showOdometer: boolean;
  showHours: boolean;
  defaultOdometer?: number | null;
  defaultHours?: number | null;
  minOdometer?: number | null;
  minHours?: number | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: ServicePayload) => void;
}

export const FleetWorkOrderServiceModal: React.FC<FleetWorkOrderServiceModalProps> = ({
  visible,
  mode,
  title,
  showOdometer,
  showHours,
  defaultOdometer,
  defaultHours,
  minOdometer,
  minHours,
  loading = false,
  onClose,
  onSubmit
}) => {
  const [odometer, setOdometer] = useState("");
  const [hours, setHours] = useState("");

  useEffect(() => {
    if (!visible) return;
    setOdometer(defaultOdometer != null ? String(defaultOdometer) : "");
    setHours(defaultHours != null ? String(defaultHours) : "");
  }, [visible, defaultOdometer, defaultHours]);

  const handleSubmit = () => {
    const payload: ServicePayload = {};
    if (odometer.trim()) {
      payload.odometer_reading = Math.max(0, Number.parseInt(odometer, 10));
    }
    if (hours.trim()) {
      payload.hours_reading = Math.max(0, Number.parseFloat(hours));
    }
    if (mode === "check-in") {
      payload.check_in_at = new Date().toISOString();
    } else {
      payload.check_out_at = new Date().toISOString();
    }
    onSubmit(payload);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {mode === "check-in"
            ? "Start service and record current readings."
            : "Finish service and record final readings."}
        </Text>

        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          {showOdometer ? (
            <View style={styles.field}>
              <Text style={styles.label}>
                Odometer{minOdometer != null ? ` (min ${minOdometer})` : ""}
              </Text>
              <TextInput
                style={styles.input}
                value={odometer}
                onChangeText={setOdometer}
                keyboardType="number-pad"
                placeholder="Current odometer"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}

          {showHours ? (
            <View style={styles.field}>
              <Text style={styles.label}>Hours{minHours != null ? ` (min ${minHours})` : ""}</Text>
              <TextInput
                style={styles.input}
                value={hours}
                onChangeText={setHours}
                keyboardType="decimal-pad"
                placeholder="Current hours"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} />
          <MKButton
            title={mode === "check-in" ? "Start service" : "Finish service"}
            onPress={handleSubmit}
            loading={loading}
          />
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
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.md
  }
});
