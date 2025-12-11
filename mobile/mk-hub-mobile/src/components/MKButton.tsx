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

interface MKButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  variant?: "primary" | "secondary";
}

export const MKButton: React.FC<MKButtonProps> = ({
  title,
  onPress,
  disabled,
  loading,
  style,
  variant = "primary"
}) => {
  const isDisabled = disabled || loading;

  const ButtonContent = (
    <>
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </>
  );

  if (isDisabled) {
    return (
      <View style={[styles.button, styles.buttonDisabled, style]}>
        {ButtonContent}
      </View>
    );
  }

  if (variant === "primary") {
    return (
      <TouchableOpacity
        style={[styles.button, style]}
        activeOpacity={0.8}
        onPress={onPress}
        disabled={isDisabled}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          {ButtonContent}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.button, styles.buttonSecondary, style]}
      activeOpacity={0.8}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Text style={styles.textSecondary}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48
  },
  gradient: {
    borderRadius: 8,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
    shadowOpacity: 0
  },
  buttonDisabled: {
    backgroundColor: "#cccccc",
    shadowOpacity: 0
  },
  text: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  textSecondary: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3
  }
});


