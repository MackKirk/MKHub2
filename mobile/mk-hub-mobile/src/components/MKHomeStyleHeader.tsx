import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";
import { shadows } from "../theme/radius";

interface MKHomeStyleHeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: "menu" | "back";
  onLeftPress: () => void;
  right?: React.ReactNode;
  style?: ViewStyle;
}

export const MKHomeStyleHeader: React.FC<MKHomeStyleHeaderProps> = ({
  title,
  subtitle,
  leftIcon = "menu",
  onLeftPress,
  right,
  style
}) => {
  const iconName = leftIcon === "back" ? "arrow-back" : "menu";

  return (
    <View style={[styles.header, style]}>
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onLeftPress}
        activeOpacity={0.75}
        hitSlop={8}
      >
        <Ionicons name={iconName} size={22} color={colors.textPrimary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card
  },
  content: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center"
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: 2
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  }
});
