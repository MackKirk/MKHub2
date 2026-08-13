import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type ClockActionTileProps = {
  kind: "in" | "out";
  enabled: boolean;
  disabled?: boolean;
  onPress: () => void;
  hint?: string;
};

export const ClockActionTile: React.FC<ClockActionTileProps> = ({
  kind,
  enabled,
  disabled = false,
  onPress,
  hint
}) => {
  const interactive = enabled && !disabled;
  const isIn = kind === "in";
  const title = isIn ? "Clock In" : "Clock Out";
  const subtitle =
    hint ??
    (isIn ? "Start tracking your work time" : "End your current work session");

  const iconBg = !enabled
    ? "#d1d5db"
    : isIn
      ? "#16a34a"
      : "#dc2626";

  return (
    <Pressable
      onPress={onPress}
      disabled={!interactive}
      style={({ pressed }) => [
        styles.tile,
        !interactive && styles.tileDisabled,
        pressed && interactive && styles.tilePressed
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name="time-outline" size={22} color="#fff" />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, !interactive && styles.titleDisabled]}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={interactive ? colors.textMuted : "#d1d5db"}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md
  },
  tileDisabled: {
    opacity: 0.65
  },
  tilePressed: {
    backgroundColor: "#f9fafb"
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center"
  },
  copy: {
    flex: 1,
    gap: 2
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary
  },
  titleDisabled: {
    color: colors.textMuted
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted
  }
});
