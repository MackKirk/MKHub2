import React from "react";
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius, shadows } from "../theme/radius";
import { typography } from "../theme/typography";

type ButtonVariant = "primary" | "secondary" | "accent";

interface MKButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  variant?: ButtonVariant;
  size?: "default" | "compact";
}

function darkenHex(hex: string, amount = 0.18): string {
  const raw = hex.replace("#", "");
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const HOME_GREEN_DARK = darkenHex(colors.homeAccent);

export const MKButton: React.FC<MKButtonProps> = ({
  title,
  onPress,
  disabled,
  loading,
  style,
  variant = "primary",
  size = "default"
}) => {
  const isDisabled = disabled || loading;
  const innerStyle = size === "compact" ? styles.innerCompact : styles.inner;
  const filled = variant === "primary" || variant === "accent";
  const spinnerColor = filled ? "#ffffff" : colors.primary;

  const content = loading ? (
    <ActivityIndicator color={spinnerColor} size="small" />
  ) : filled ? (
    <Text style={styles.text}>{title}</Text>
  ) : (
    <Text style={styles.textSecondary}>{title}</Text>
  );

  if (isDisabled) {
    return (
      <View style={[styles.wrapper, styles.buttonDisabled, style]}>
        <View style={innerStyle}>{content}</View>
      </View>
    );
  }

  if (variant === "primary" || variant === "accent") {
    const gradient =
      variant === "accent"
        ? [colors.homeAccent, HOME_GREEN_DARK]
        : [colors.primary, colors.primaryDark];
    return (
      <View
        style={[
          styles.wrapper,
          variant === "accent" ? styles.buttonAccentShadow : styles.buttonPrimaryShadow,
          style
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          disabled={isDisabled}
          style={styles.touchable}
        >
          <LinearGradient
            colors={gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={innerStyle}
          >
            {content}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.wrapper, styles.buttonSecondary, style]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
    >
      <View style={innerStyle}>{content}</View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.xl,
    overflow: "hidden",
    alignSelf: "flex-start"
  },
  touchable: {
    borderRadius: radius.xl,
    overflow: "hidden"
  },
  buttonPrimaryShadow: {
    ...shadows.buttonPrimary,
    backgroundColor: colors.primaryDark
  },
  buttonAccentShadow: {
    shadowColor: colors.homeAccent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    backgroundColor: HOME_GREEN_DARK
  },
  inner: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48
  },
  innerCompact: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary
  },
  buttonDisabled: {
    backgroundColor: "#cccccc"
  },
  text: {
    color: "#ffffff",
    ...typography.button
  },
  textSecondary: {
    color: colors.primary,
    ...typography.buttonSmall
  }
});
