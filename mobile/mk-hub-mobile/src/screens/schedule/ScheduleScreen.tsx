import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { getShifts } from "../../services/shifts";
import type { ShiftSummary } from "../../types/shifts";
import { toApiError } from "../../services/api";
import { Alert } from "react-native";

interface Row {
  id: string;
  date: string;
  weekday: string;
  start: string;
  end: string;
  project: string | null | undefined;
}

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const ScheduleScreen: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const { start, end } = currentWeekRange();
      const shifts = await getShifts(`${start},${end}`);
      setRows(mapRows(shifts));
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load schedule", apiError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Schedule</Text>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.dateCol}>
              <Text style={styles.weekday}>{item.weekday}</Text>
              <Text style={styles.date}>{item.date}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.time}>
                {item.start} – {item.end}
              </Text>
              {item.project ? (
                <Text style={styles.project}>{item.project}</Text>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No upcoming shifts for this week.</Text>
          ) : null
        }
      />
    </View>
  );
};

const currentWeekRange = (): { start: string; end: string } => {
  const today = new Date();
  const day = today.getDay(); // Sunday = 0
  const diffToSunday = day;
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - diffToSunday);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toIsoDate(sunday), end: toIsoDate(saturday) };
};

const mapRows = (shifts: ShiftSummary[]): Row[] => {
  return shifts.map((s) => {
    const d = new Date(s.date);
    const weekday = weekdayNames[d.getDay()] ?? "";
    return {
      id: s.id,
      date: s.date,
      weekday,
      start: s.start_time,
      end: s.end_time,
      project: s.project_name
    };
  });
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: spacing.lg
  },
  row: {
    flexDirection: "row",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  dateCol: {
    width: 70
  },
  weekday: {
    fontSize: 13,
    color: colors.textMuted
  },
  date: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "500"
  },
  infoCol: {
    flex: 1
  },
  time: {
    fontSize: 15,
    color: colors.textPrimary
  },
  project: {
    fontSize: 13,
    color: colors.textMuted
  },
  empty: {
    marginTop: spacing.xl,
    textAlign: "center",
    color: colors.textMuted
  }
});


