import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKCard } from "./MKCard";
import { buildMonthGrid, formatDateLocal } from "../lib/dateUtils";
import {
  formatEventTimeRange,
  groupEventsByDate
} from "../lib/projectEventOccurrences";
import type { ProjectEvent } from "../services/projectEvents";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

interface MKProjectEventCalendarProps {
  events: ProjectEvent[];
  loading?: boolean;
}

export const MKProjectEventCalendar: React.FC<MKProjectEventCalendarProps> = ({
  events,
  loading
}) => {
  const [anchorDate, setAnchorDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const monthLabel = anchorDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  const todayKey = formatDateLocal(new Date());
  const cells = useMemo(() => buildMonthGrid(anchorDate), [anchorDate]);
  const eventsByDate = useMemo(
    () => groupEventsByDate(events, anchorDate),
    [events, anchorDate]
  );

  const selectedEvents = selectedDateKey
    ? eventsByDate[selectedDateKey] ?? []
    : [];

  const goPrevMonth = () =>
    setAnchorDate(
      (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)
    );
  const goNextMonth = () =>
    setAnchorDate(
      (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)
    );
  const goToday = () => {
    const n = new Date();
    n.setDate(1);
    n.setHours(0, 0, 0, 0);
    setAnchorDate(n);
    setSelectedDateKey(formatDateLocal(new Date()));
  };

  return (
    <MKCard style={styles.card} elevated>
      <Text style={styles.title}>Workload</Text>
      <Text style={styles.subtitle}>Calendar events for this project.</Text>

      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={goPrevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.textBody} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={goNextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.textBody} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={goToday} style={styles.todayBtn}>
        <Text style={styles.todayBtnText}>Today</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <>
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekdayLabel}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map(({ date, key }) => {
              if (!date) {
                return <View key={key} style={styles.dayCell} />;
              }

              const dateKey = formatDateLocal(date);
              const hasEvents = (eventsByDate[dateKey]?.length ?? 0) > 0;
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedDateKey;

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.dayCell,
                    isToday && styles.dayCellToday,
                    isSelected && styles.dayCellSelected
                  ]}
                  onPress={() =>
                    setSelectedDateKey((prev) =>
                      prev === dateKey ? null : dateKey
                    )
                  }
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      isToday && styles.dayNumberToday,
                      isSelected && styles.dayNumberSelected
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {hasEvents ? (
                    <View
                      style={[
                        styles.eventDot,
                        isSelected && styles.eventDotSelected
                      ]}
                    />
                  ) : (
                    <View style={styles.dotSpacer} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedDateKey ? (
            <View style={styles.eventsPanel}>
              <Text style={styles.eventsPanelTitle}>
                {new Date(`${selectedDateKey}T12:00:00`).toLocaleDateString(
                  undefined,
                  { weekday: "long", month: "short", day: "numeric" }
                )}
              </Text>
              {selectedEvents.length === 0 ? (
                <Text style={styles.emptyEvents}>No events on this day.</Text>
              ) : (
                selectedEvents.map((event) => (
                  <View key={event.id} style={styles.eventRow}>
                    <View style={styles.eventDotLarge} />
                    <View style={styles.eventBody}>
                      <Text style={styles.eventName}>{event.name}</Text>
                      <Text style={styles.eventMeta}>
                        {formatEventTimeRange(event)}
                        {event.location ? ` · ${event.location}` : ""}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </>
      )}
    </MKCard>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.md
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border
  },
  monthLabel: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  todayBtn: {
    alignSelf: "flex-start",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  todayBtnText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  loadingWrap: {
    paddingVertical: spacing.xl,
    alignItems: "center"
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: spacing.xs
  },
  weekdayLabel: {
    flex: 1,
    textAlign: "center",
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: typography.button.fontFamily
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    borderRadius: radius.control
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: colors.primary
  },
  dayCellSelected: {
    backgroundColor: colors.primary
  },
  dayNumber: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  dayNumberToday: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  dayNumberSelected: {
    color: "#fff",
    fontFamily: typography.button.fontFamily
  },
  eventDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 2
  },
  eventDotSelected: {
    backgroundColor: "#fff"
  },
  dotSpacer: {
    height: 7
  },
  eventsPanel: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm
  },
  eventsPanelTitle: {
    ...typography.bodySmall,
    color: colors.textBody,
    fontFamily: typography.button.fontFamily,
    marginBottom: spacing.xs
  },
  emptyEvents: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  eventDotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6
  },
  eventBody: {
    flex: 1,
    gap: 2
  },
  eventName: {
    ...typography.body,
    color: colors.textPrimary
  },
  eventMeta: {
    ...typography.bodySmall,
    color: colors.textMuted
  }
});
