import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../theme/colors";
import { shadows } from "../../theme/radius";
import { typography } from "../../theme/typography";

const ACCENT = colors.homeAccent;
const PENDING_WATERMARK = require("../../../assets/brand/task-todo-watermark.png");

function darkenHex(hex: string, amount = 0.28): string {
  const raw = hex.replace("#", "");
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function pendingSummary(parts: {
  signCount?: number;
  followUpCount?: number;
  inspectionCount?: number;
  hoursPending?: boolean;
  taskCount?: number;
}): string {
  const chunks: string[] = [];
  if (parts.hoursPending) chunks.push("Hours to log");
  if ((parts.taskCount ?? 0) > 0) {
    chunks.push(
      parts.taskCount === 1 ? "1 task" : `${parts.taskCount} tasks`
    );
  }
  if ((parts.signCount ?? 0) > 0) {
    chunks.push(parts.signCount === 1 ? "1 to sign" : `${parts.signCount} to sign`);
  }
  if ((parts.followUpCount ?? 0) > 0) {
    chunks.push(
      parts.followUpCount === 1 ? "1 follow-up" : `${parts.followUpCount} follow-ups`
    );
  }
  if ((parts.inspectionCount ?? 0) > 0) {
    chunks.push(
      parts.inspectionCount === 1
        ? "1 inspection"
        : `${parts.inspectionCount} inspections`
    );
  }
  return chunks.length > 0 ? chunks.join(" · ") : "Nothing waiting on you";
}

interface HomePendingButtonProps {
  summary: string;
  count: number;
  onPress: () => void;
}

export const HomePendingButton: React.FC<HomePendingButtonProps> = ({
  summary,
  count,
  onPress
}) => (
  <TouchableOpacity
    style={styles.button}
    onPress={onPress}
    activeOpacity={0.75}
    accessibilityRole="button"
    accessibilityLabel={count > 0 ? `Pending, ${summary}` : "Pending, nothing waiting"}
  >
    <LinearGradient
      colors={[darkenHex(ACCENT), ACCENT]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.rail}
    />
    <View style={styles.body}>
      <Image
        source={PENDING_WATERMARK}
        style={styles.watermark}
        resizeMode="contain"
        tintColor={ACCENT}
        pointerEvents="none"
      />
      <View style={styles.buttonIcon}>
        <Ionicons name="checkbox-outline" size={22} color={ACCENT} />
      </View>
      <View style={styles.buttonCopy}>
        <Text style={styles.buttonTitle}>Pending</Text>
        <Text style={styles.buttonSubtitle} numberOfLines={1}>
          {summary}
        </Text>
      </View>
      {count > 0 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    marginTop: 12,
    minHeight: 108,
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  rail: {
    width: 6,
    alignSelf: "stretch"
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 14,
    overflow: "hidden"
  },
  watermark: {
    position: "absolute",
    right: -18,
    bottom: -26,
    width: 128,
    height: 128,
    opacity: 0.09
  },
  buttonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center"
  },
  buttonCopy: {
    flex: 1
  },
  buttonTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary
  },
  buttonSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 2
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#C22033",
    alignItems: "center",
    justifyContent: "center"
  },
  countText: {
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 12,
    lineHeight: 14,
    color: "#fff"
  }
});
