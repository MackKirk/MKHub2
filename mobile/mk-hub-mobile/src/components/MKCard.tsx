import React from "react";
import { StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius, shadows } from "../theme/radius";

interface MKCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  elevated?: boolean;
}

export const MKCard: React.FC<MKCardProps> = ({
  children,
  style,
  onPress,
  elevated = true
}) => {
  if (onPress) {
    return (
      <TouchableOpacity
        style={[
          styles.card,
          elevated && styles.elevated,
          style
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={[
        styles.card,
        elevated && styles.elevated,
        style
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card
  },
  elevated: shadows.cardElevated
});

