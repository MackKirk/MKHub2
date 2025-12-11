import React from "react";
import { StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

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
    borderRadius: 16,
    padding: spacing.lg,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4
  },
  elevated: {
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6
  }
});

