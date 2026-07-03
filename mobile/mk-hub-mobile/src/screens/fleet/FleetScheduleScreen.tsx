import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { CommonActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import {
  WORK_ORDER_STATUS_LABELS,
  formatFleetDate,
  formatFleetDateTime,
  formatDurationMinutes,
  getWorkOrderStatusVariant
} from "../../lib/fleetLabels";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKBadge } from "../../components/MKBadge";
import { MKCard } from "../../components/MKCard";
import { ScreenLayout } from "../../components/ScreenLayout";
import { getWorkOrdersCalendar } from "../../services/fleetWorkOrders";
import { toApiError } from "../../services/api";
import type { HomeStackParamList } from "../../navigation/types";
import type { WorkOrderCalendarItem } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type ScheduleSection = {
  key: string;
  title: string;
  items: WorkOrderCalendarItem[];
};

type FleetScheduleNav = NativeStackNavigationProp<HomeStackParamList, "FleetSchedule">;

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export const FleetScheduleScreen: React.FC = () => {
  const navigation = useNavigation<FleetScheduleNav>();
  const { openMenu } = useHubMenu();
  const [items, setItems] = useState<WorkOrderCalendarItem[]>([]);
  const [loading, setLoading] = useState(false);

  const weekLabel = useMemo(() => {
    const start = startOfWeek(new Date());
    const end = endOfWeek(new Date());
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  }, []);

  const sections = useMemo<ScheduleSection[]>(() => {
    const grouped = new Map<string, WorkOrderCalendarItem[]>();
    for (const item of items) {
      const key = item.scheduled_start_at
        ? item.scheduled_start_at.slice(0, 10)
        : item.check_in_at
          ? item.check_in_at.slice(0, 10)
          : "unscheduled";
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, bucket]) => ({
        key,
        title: key === "unscheduled" ? "Unscheduled" : formatFleetDate(`${key}T12:00:00`),
        items: bucket.sort((a, b) => {
          const aTime = a.scheduled_start_at ?? a.check_in_at ?? a.created_at ?? "";
          const bTime = b.scheduled_start_at ?? b.check_in_at ?? b.created_at ?? "";
          return aTime.localeCompare(bTime);
        })
      }));
  }, [items]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const start = startOfWeek(new Date()).toISOString();
      const end = endOfWeek(new Date()).toISOString();
      const rows = await getWorkOrdersCalendar({ start, end });
      setItems(rows);
    } catch (err) {
      Alert.alert("Could not load schedule", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const renderItem = (item: WorkOrderCalendarItem) => (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() =>
        navigation.dispatch(
          CommonActions.navigate({
            name: "FleetWorkOrderDetail",
            params: { workOrderId: item.id }
          })
        )
      }
    >
      <MKCard style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.work_order_number}
        </Text>
        <MKBadge variant={getWorkOrderStatusVariant(item.status)}>
          {WORK_ORDER_STATUS_LABELS[item.status] ?? item.status}
        </MKBadge>
      </View>
      <Text style={styles.assetLine} numberOfLines={1}>
        {[item.asset_name, item.unit_number ? `Unit #${item.unit_number}` : null]
          .filter(Boolean)
          .join(" · ") || "Fleet asset"}
      </Text>
      <Text style={styles.meta}>
        {item.scheduled_start_at
          ? formatFleetDateTime(item.scheduled_start_at)
          : item.check_in_at
            ? `Checked in ${formatFleetDateTime(item.check_in_at)}`
            : "No schedule"}
      </Text>
      {item.estimated_duration_minutes != null ? (
        <Text style={styles.meta}>Duration {formatDurationMinutes(item.estimated_duration_minutes)}</Text>
      ) : null}
      </MKCard>
    </TouchableOpacity>
  );

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader
        title="Fleet Schedule"
        subtitle={weekLabel}
        onLeftPress={openMenu}
      />

      {loading && sections.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(section) => section.key}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={styles.list}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionItems}>
                {section.items.map((row) => (
                  <View key={row.id}>{renderItem(row)}</View>
                ))}
              </View>
            </View>
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No scheduled work this week.</Text>
              </View>
            ) : null
          }
        />
      )}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  list: {
    gap: spacing.lg,
    paddingBottom: spacing.xl
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  sectionItems: {
    gap: spacing.sm
  },
  card: {
    gap: spacing.xs
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  cardTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    flex: 1
  },
  assetLine: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted
  },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: "center"
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  }
});
