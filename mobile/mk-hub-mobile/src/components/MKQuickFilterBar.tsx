import React, { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

export interface QuickFilterOption {
  key: string;
  label: string;
  statusId: string;
  count?: number;
}

interface MKQuickFilterBarProps {
  relatedToMe: boolean;
  onRelatedToMeChange: (value: boolean) => void;
  options: QuickFilterOption[];
  selectedStatusId?: string;
  onSelectStatusId: (statusId: string | undefined) => void;
  style?: ViewStyle;
}

export const MKQuickFilterBar: React.FC<MKQuickFilterBarProps> = ({
  relatedToMe,
  onRelatedToMeChange,
  options,
  selectedStatusId,
  onSelectStatusId,
  style
}) => {
  const insets = useSafeAreaInsets();
  const [modalOpen, setModalOpen] = useState(false);

  const selectedOption = options.find((o) => o.statusId === selectedStatusId);
  const quickFilterActive = Boolean(selectedOption);

  const handleSelect = (statusId: string | undefined) => {
    onSelectStatusId(statusId);
    setModalOpen(false);
  };

  return (
    <>
      <View style={[styles.row, style]}>
        <TouchableOpacity
          style={[styles.pill, relatedToMe && styles.pillActive]}
          onPress={() => onRelatedToMeChange(!relatedToMe)}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.pillText, relatedToMe && styles.pillTextActive]}
            numberOfLines={1}
          >
            Related to Me
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pill, styles.quickBtn, quickFilterActive && styles.pillActive]}
          onPress={() => setModalOpen(true)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.pillText,
              quickFilterActive && styles.pillTextActive
            ]}
            numberOfLines={1}
          >
            {selectedOption?.label ?? "Quick filter"}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={quickFilterActive ? "#fff" : colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setModalOpen(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) }
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Quick filter</Text>

            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => handleSelect(undefined)}
            >
              <Text style={styles.optionText}>Any</Text>
              {!selectedStatusId ? (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              ) : null}
            </TouchableOpacity>

            {options.map((option) => {
              const active = option.statusId === selectedStatusId;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={styles.optionRow}
                  onPress={() => handleSelect(option.statusId)}
                >
                  <Text style={styles.optionText} numberOfLines={2}>
                    {option.label}
                  </Text>
                  <View style={styles.optionTrailing}>
                    {typeof option.count === "number" ? (
                      <View style={[styles.countBadge, active && styles.countBadgeActive]}>
                        <Text
                          style={[
                            styles.countText,
                            active && styles.countTextActive
                          ]}
                        >
                          {option.count}
                        </Text>
                      </View>
                    ) : null}
                    {active ? (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={colors.primary}
                      />
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap"
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 38
  },
  quickBtn: {
    flexShrink: 1,
    maxWidth: "100%"
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  pillText: {
    ...typography.bodySmall,
    color: colors.textBody
  },
  pillTextActive: {
    color: "#fff",
    fontFamily: typography.button.fontFamily
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm
  },
  sheetTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1
  },
  optionTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  countBadgeActive: {
    backgroundColor: "#fee2e2"
  },
  countText: {
    ...typography.caption,
    color: colors.textBody,
    fontFamily: typography.button.fontFamily
  },
  countTextActive: {
    color: colors.primary
  }
});
