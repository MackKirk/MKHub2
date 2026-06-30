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
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onBack?: () => void;
  onMenu?: () => void;
  actions?: React.ReactNode;
  style?: ViewStyle;
}

export const MKPageHeader: React.FC<MKPageHeaderProps> = ({
  title,
  subtitle,
  icon,
  onBack,
  onMenu,
  actions,
  style
}) => {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.left}>
        {onMenu ? (
          <TouchableOpacity onPress={onMenu} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="menu" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : null}
        {icon ? <View style={styles.iconTile}>{icon}</View> : null}
        <View style={styles.titles}>
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
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center"
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.control,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center"
  },
  titles: {
    flex: 1,
    minWidth: 0
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
  actions: {
    marginLeft: spacing.sm,
    flexShrink: 0
  }
});
