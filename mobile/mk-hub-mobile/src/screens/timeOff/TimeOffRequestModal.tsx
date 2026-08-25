import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius } from "../../theme/radius";
import { typography } from "../../theme/typography";
import {
  buildMonthGrid,
  earliestTimeOffDate,
  formatDateLocal
} from "../../lib/dateUtils";
import { formatShortDate } from "../../services/shifts";
import { countInclusiveDays, daysToHours } from "../../services/timeOff";
import type { TimeOffMode } from "../../navigation/types";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

interface Props {
  visible: boolean;
  mode: TimeOffMode;
  accent: string;
  policyName: string;
  remainingDays: number;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    startDate: string;
    endDate: string;
    hours: number;
    notes: string;
  }) => void;
}

export const TimeOffRequestModal: React.FC<Props> = ({
  visible,
  mode,
  accent,
  policyName,
  remainingDays,
  submitting,
  onClose,
  onSubmit
}) => {
  const insets = useSafeAreaInsets();
  const isSick = mode === "sick";
  const today = formatDateLocal(new Date());
  const minStart = isSick ? today : earliestTimeOffDate();
  const [startDate, setStartDate] = useState(minStart);
  const [endDate, setEndDate] = useState(minStart);
  const [notes, setNotes] = useState("");
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [calendarAnchor, setCalendarAnchor] = useState(
    () => new Date(`${minStart}T00:00:00`)
  );

  const days = useMemo(
    () => (startDate && endDate ? countInclusiveDays(startDate, endDate) : 0),
    [startDate, endDate]
  );
  const hours = daysToHours(Math.max(days, 0));
  const cells = useMemo(() => buildMonthGrid(calendarAnchor), [calendarAnchor]);
  const monthLabel = calendarAnchor.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
  const minSelectable = picking === "end" && startDate ? startDate : minStart;
  const canSubmit =
    days > 0 &&
    endDate >= startDate &&
    (!isSick || notes.trim().length > 0) &&
    !submitting;

  const selectDate = (key: string) => {
    if (picking === "start") {
      setStartDate(key);
      setEndDate((current) => (current < key ? key : current));
      setPicking("end");
      return;
    }
    setEndDate(key);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={styles.headerTitle}>
            {isSick ? "Report sick leave" : "Request time off"}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 16) + 24 }
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.policy}>{policyName}</Text>
          <Text style={styles.hint}>
            {isSick
              ? "A justification is required. Same-day sick leave is allowed."
              : "Time off must be requested at least 24 hours in advance."}
          </Text>
          <View style={styles.dateRow}>
            <Pressable
              onPress={() => setPicking("start")}
              style={[styles.dateCard, picking === "start" && { borderColor: accent }]}
            >
              <Text style={styles.dateLabel}>Start</Text>
              <Text style={styles.dateValue}>{formatShortDate(startDate)}</Text>
            </Pressable>
            <Pressable
              onPress={() => setPicking("end")}
              style={[styles.dateCard, picking === "end" && { borderColor: accent }]}
            >
              <Text style={styles.dateLabel}>End</Text>
              <Text style={styles.dateValue}>{formatShortDate(endDate)}</Text>
            </Pressable>
          </View>
          <View style={styles.monthRow}>
            <Pressable
              onPress={() =>
                setCalendarAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
              style={styles.navBtn}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <Pressable
              onPress={() =>
                setCalendarAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
              style={styles.navBtn}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map(({ date, key }) => {
              if (!date) return <View key={key} style={styles.cell} />;
              const dateKey = formatDateLocal(date);
              const disabled = dateKey < minSelectable;
              const inRange =
                dateKey === startDate ||
                dateKey === endDate ||
                (dateKey > startDate && dateKey < endDate);
              const isEdge = dateKey === startDate || dateKey === endDate;
              return (
                <Pressable
                  key={key}
                  disabled={disabled}
                  onPress={() => selectDate(dateKey)}
                  style={[
                    styles.cell,
                    inRange && { backgroundColor: `${accent}22` },
                    isEdge && { backgroundColor: accent, borderRadius: 999 }
                  ]}
                >
                  <Text
                    style={[
                      styles.day,
                      disabled && styles.dayDisabled,
                      isEdge && styles.daySelected
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {days} day{days === 1 ? "" : "s"} · {hours} hours
            </Text>
            <Text style={styles.summarySub}>
              Available: {remainingDays.toFixed(1)} days
            </Text>
          </View>
          <Text style={styles.notesLabel}>
            {isSick ? "Justification *" : "Notes (optional)"}
          </Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder={
              isSick
                ? "Why do you need sick leave?"
                : "Anything your supervisor should know"
            }
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
          <Pressable
            onPress={() => onSubmit({ startDate, endDate, hours, notes: notes.trim() })}
            disabled={!canSubmit}
            style={[
              styles.submitBtn,
              { backgroundColor: accent },
              !canSubmit && styles.submitDisabled
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>
                {isSick ? "Submit sick leave" : "Submit request"}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  headerTitle: {
    flex: 1,
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    color: colors.textPrimary
  },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, gap: spacing.md },
  policy: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  hint: { ...typography.bodySmall, color: colors.textMuted, marginTop: -4 },
  dateRow: { flexDirection: "row", gap: spacing.md },
  dateCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md
  },
  dateLabel: { fontSize: 11, color: colors.textMuted, textTransform: "uppercase" },
  dateValue: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: 4
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  monthLabel: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  weekRow: { flexDirection: "row" },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 8
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.2857%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  day: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: colors.textPrimary
  },
  daySelected: { color: "#fff" },
  dayDisabled: { color: colors.border },
  summary: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: spacing.md },
  summaryText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  summarySub: { marginTop: 2, fontSize: 13, color: colors.textMuted },
  notesLabel: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.textPrimary
  },
  notesInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 15
  },
  submitBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  submitDisabled: { opacity: 0.45 },
  submitText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: "#fff"
  }
});
