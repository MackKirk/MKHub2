import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export type ProjectDetailTabKey =
  | "overview"
  | "notes"
  | "files"
  | "documents"
  | "pricing"
  | "safety";

export interface ProjectDetailTabItem {
  key: ProjectDetailTabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface MKProjectDetailTabBarProps {
  tabs: ProjectDetailTabItem[];
  activeKey: ProjectDetailTabKey;
  onChange: (key: ProjectDetailTabKey) => void;
  style?: ViewStyle;
}

export function projectDetailTabBarHeight(bottomInset: number): number {
  return 56 + bottomInset;
}

export const MKProjectDetailTabBar: React.FC<MKProjectDetailTabBarProps> = ({
  tabs,
  activeKey,
  onChange,
  style
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
        style
      ]}
    >
      <View style={styles.row}>
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.item}
              onPress={() => onChange(tab.key)}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: active }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon}
                size={22}
                color={active ? colors.primary : colors.textMuted}
              />
              {active ? <View style={styles.activeIndicator} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    minHeight: 56
  },
  row: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center"
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
    gap: 4,
    minHeight: 44
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary
  }
});
