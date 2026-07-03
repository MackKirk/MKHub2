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

interface MKButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  variant?: "primary" | "secondary";
  size?: "default" | "compact";
}

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

  const content =
    loading ? (
      <ActivityIndicator
        color={variant === "primary" ? "#ffffff" : colors.primary}
        size="small"
      />
    ) : variant === "primary" ? (
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

  if (variant === "primary") {
    return (
      <View style={[styles.wrapper, styles.buttonPrimaryShadow, style]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          disabled={isDisabled}
          style={styles.touchable}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
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
