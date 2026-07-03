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
        >
          <Text style={[styles.optionIcon, active && styles.optionIconActive]}>{opt.icon}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  option: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center"
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
  }
});
