import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { radius } from "../theme/radius";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

export interface FieldAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}

export const MKFieldActions: React.FC<{ actions: FieldAction[] }> = ({ actions }) => {
  if (actions.length === 0) return null;
  return (
    <View style={styles.row}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          style={({ pressed }) => [
            styles.button,
            pressed && !action.disabled && styles.buttonPressed,
            action.disabled && styles.buttonDisabled
          ]}
          onPress={action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Ionicons name={action.icon} size={18} color={colors.homeAccent} />
          <Text style={styles.label}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm
  },
  button: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4"
  },
  buttonPressed: {
    backgroundColor: "#DCFCE7"
  },
  buttonDisabled: {
    opacity: 0.55
  },
  label: {
    ...typography.buttonSmall,
    color: colors.homeAccent
  }
});
