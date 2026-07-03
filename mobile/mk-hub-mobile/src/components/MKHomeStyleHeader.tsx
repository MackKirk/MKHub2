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
import { radius } from "../theme/radius";

const HUB_MENU_BG = "#111827";

interface MKHomeStyleHeaderProps {
  title: string;
  subtitle?: string;
  leftIcon?: "menu" | "back";
  onLeftPress: () => void;
  style?: ViewStyle;
}

export const MKHomeStyleHeader: React.FC<MKHomeStyleHeaderProps> = ({
  title,
  subtitle,
  leftIcon = "menu",
  onLeftPress,
  style
}) => {
  const iconName = leftIcon === "back" ? "arrow-back" : "menu";

  return (
    <View style={[styles.header, style]}>
      <TouchableOpacity
        style={styles.leftButton}
        onPress={onLeftPress}
        activeOpacity={0.75}
        hitSlop={8}
      >
        <Ionicons name={iconName} size={22} color="#f3f4f6" />
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
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.md
  },
  leftButton: {
    width: 52,
    backgroundColor: HUB_MENU_BG,
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    flex: 1,
    minWidth: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
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
  }
});
