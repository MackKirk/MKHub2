import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BODY_CONDITION_OPTIONS } from "../../lib/fleetInspectionForm";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius } from "../../theme/radius";
import { typography } from "../../theme/typography";

interface MKInspectionConditionPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const MKInspectionConditionPicker: React.FC<MKInspectionConditionPickerProps> = ({
  value,
  onChange,
  disabled = false
}) => (
  <View style={styles.row}>
    {BODY_CONDITION_OPTIONS.map((opt) => {
      const active = value === opt.value;
      return (
        <TouchableOpacity
          key={opt.value}
          style={[
            styles.option,
            active && styles.optionActive,
            opt.value === "ok" && active && styles.optionOk,
            opt.value === "damage" && active && styles.optionDamage,
            opt.value === "conditional" && active && styles.optionConditional,
            disabled && styles.optionDisabled
          ]}
          onPress={() => !disabled && onChange(opt.value)}
          disabled={disabled}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
        >
          <Text style={[styles.optionIcon, active && styles.optionIconActive]}>{opt.icon}</Text>
          <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{opt.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm
  },
  option: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.control,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  optionActive: {
    borderWidth: 2
  },
  optionOk: {
    borderColor: "#059669",
    backgroundColor: "#dcfce7"
  },
  optionDamage: {
    borderColor: "#dc2626",
    backgroundColor: "#fee2e2"
  },
  optionConditional: {
    borderColor: "#d97706",
    backgroundColor: "#fef9c3"
  },
  optionDisabled: {
    opacity: 0.5
  },
  optionIcon: {
    fontSize: 20,
    fontFamily: typography.button.fontFamily,
    color: colors.textMuted
  },
  optionIconActive: {
    color: colors.textPrimary
  },
  optionLabel: {
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    textAlign: "center"
  },
  optionLabelActive: {
    color: colors.textPrimary
  }
});
