import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";
import type { ProjectStatusBadgeVariant } from "../lib/projectUi";

const variantStyles: Record<
  ProjectStatusBadgeVariant,
  { bg: string; text: string }
> = {
  neutral: { bg: "#f3f4f6", text: "#374151" },
  success: { bg: "#dcfce7", text: "#15803d" },
  warning: { bg: "#fef9c3", text: "#a16207" },
  danger: { bg: "#fee2e2", text: "#b91c1c" },
  info: { bg: "#dbeafe", text: "#1d4ed8" }
};

interface MKBadgeProps {
  children: React.ReactNode;
  variant?: ProjectStatusBadgeVariant;
  style?: ViewStyle;
}

export const MKBadge: React.FC<MKBadgeProps> = ({
  children,
  variant = "neutral",
  style
}) => {
  const colors = variantStyles[variant];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  text: {
    ...typography.caption,
    fontSize: 10,
    fontFamily: typography.button.fontFamily,
    textTransform: "uppercase",
    letterSpacing: 0.5
  }
});
