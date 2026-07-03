import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { hasPermission } from "../../lib/permissions";
import { useAuth } from "../../hooks/useAuth";
import {
  INSPECTION_RESULT_LABELS,
  SCHEDULE_STATUS_LABELS,
  formatFleetDateTime,
  getWorkOrderStatusVariant
} from "../../lib/fleetLabels";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKBadge } from "../../components/MKBadge";
import { MKCard } from "../../components/MKCard";
import { ScreenLayout } from "../../components/ScreenLayout";
import { listInspectionSchedules } from "../../services/fleetWorkOrders";
import { toApiError } from "../../services/api";
import type { HomeStackParamList } from "../../navigation/types";
import type { InspectionSchedule } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

type FleetInspectionsNav = NativeStackNavigationProp<HomeStackParamList, "FleetInspections">;

export const FleetInspectionsListScreen: React.FC = () => {
  const navigation = useNavigation<FleetInspectionsNav>();
  const { openMenu } = useHubMenu();
  const { permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const canWrite = hasPermission(permissionsSet, roles, "inspections:write");

  const [rows, setRows] = useState<InspectionSchedule[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const subtitle = useMemo(
    () => (rows.length > 0 ? `${rows.length} schedules` : "Inspection queue"),
    [rows.length]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const items = await listInspectionSchedules({
        search: query.trim() || undefined,
        sort: "scheduled_at",
        dir: "asc"
      });
      setRows(items);
    } catch (err) {
      Alert.alert("Could not load inspections", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const renderRow = ({ item }: { item: InspectionSchedule }) => (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() =>
        navigation.navigate("FleetInspectionDetail", { scheduleId: item.id })
      }
    >
      <MKCard style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.fleet_asset_name ?? "Fleet asset"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
        <Text style={styles.cardMeta}>{formatFleetDateTime(item.scheduled_at)}</Text>
        <View style={styles.badgeRow}>
          <MKBadge variant={getWorkOrderStatusVariant(item.status)}>
            {SCHEDULE_STATUS_LABELS[item.status] ?? item.status}
          </MKBadge>
          {item.body_result ? (
            <MKBadge variant="neutral">
              Body {INSPECTION_RESULT_LABELS[item.body_result] ?? item.body_result}
            </MKBadge>
          ) : null}
          {item.mechanical_result ? (
            <MKBadge variant="neutral">
              Mech {INSPECTION_RESULT_LABELS[item.mechanical_result] ?? item.mechanical_result}
            </MKBadge>
          ) : null}
        </View>
        {!canWrite ? null : (
          <Text style={styles.hint}>Tap to open schedule and start inspections</Text>
        )}
      </MKCard>
    </TouchableOpacity>
  );

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader title="Inspections" subtitle={subtitle} onLeftPress={openMenu} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by asset name"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={load}
        />
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No inspection schedules found.</Text>
              </View>
            ) : null
          }
        />
      )}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  list: {
    gap: spacing.sm,
    paddingBottom: spacing.xl
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
  cardMeta: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  hint: {
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
