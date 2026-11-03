import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent
} from "@react-native-community/datetimepicker";
import { formatDateLocal } from "../lib/dateUtils";
import { colors } from "../theme/colors";
import { radius } from "../theme/radius";
import { spacing } from "../theme/spacing";
import { typography } from "../theme/typography";

const PRESETS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "+7 days", days: 7 },
  { key: "30", label: "+30 days", days: 30 },
  { key: "60", label: "+60 days", days: 60 }
] as const;

function shiftDays(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

function parseIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    const fallback = new Date();
    fallback.setHours(12, 0, 0, 0);
    return fallback;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function formatLong(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

interface MKDateQuickPickProps {
  value: string;
  onChange: (next: string) => void;
  editable?: boolean;
  label?: string;
}

export const MKDateQuickPick: React.FC<MKDateQuickPickProps> = ({
  value,
  onChange,
  editable = true,
  label = "Date"
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const longLabel = useMemo(() => formatLong(value), [value]);
  const activePreset = PRESETS.find((p) => shiftDays(p.days) === value.trim())?.key;
  const pickerValue = parseIsoDate(value);

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setShowPicker(false);
    if (event.type === "dismissed") {
      setShowPicker(false);
      return;
    }
    if (selected) onChange(formatDateLocal(selected));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.presets}>
        {PRESETS.map((preset) => {
          const active = activePreset === preset.key;
          return (
            <Pressable
              key={preset.key}
              style={[styles.chip, active && styles.chipActive]}
              disabled={!editable}
              onPress={() => onChange(shiftDays(preset.days))}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={styles.chip}
          disabled={!editable}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.chipText}>Calendar</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        editable={editable}
      />
      {longLabel ? (
        <Text style={styles.hint}>{longLabel}</Text>
      ) : (
        <Text style={styles.hintWarn}>Use a date like 2026-04-15.</Text>
      )}
      {showPicker ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPickerChange}
        />
      ) : null}
      {Platform.OS === "ios" && showPicker ? (
        <Pressable style={styles.doneBtn} onPress={() => setShowPicker(false)}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center"
  },
  chipActive: {
    borderColor: colors.homeAccent,
    backgroundColor: "#ECFDF3"
  },
  chipText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: typography.button.fontFamily
  },
  chipTextActive: {
    color: colors.homeAccent
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: "#fff"
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  hintWarn: {
    ...typography.bodySmall,
    color: colors.warning
  },
  doneBtn: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  doneText: {
    color: colors.homeAccent,
    fontFamily: typography.button.fontFamily
  }
});
