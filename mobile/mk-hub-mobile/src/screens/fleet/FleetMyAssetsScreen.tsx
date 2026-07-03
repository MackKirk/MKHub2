import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission } from "../../lib/permissions";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKCard } from "../../components/MKCard";
import { MKButton } from "../../components/MKButton";
import { FleetReturnModal } from "../../components/fleet/FleetReturnModal";
import { ScreenLayout } from "../../components/ScreenLayout";
import {
  checkinEquipment,
  getUserAssets,
  returnEquipment,
  returnFleetAsset
} from "../../services/fleet";
import { toApiError } from "../../services/api";
import type { AssetAssignmentReturnRequest, CurrentAssignment, CurrentCheckout } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Row =
  | { key: string; kind: "assignment"; item: CurrentAssignment }
  | { key: string; kind: "checkout"; item: CurrentCheckout };

export const FleetMyAssetsScreen: React.FC = () => {
  const { openMenu } = useHubMenu();
  const { user, permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const canWriteFleet = hasPermission(permissionsSet, roles, "fleet:write");
  const canWriteEquipment = hasPermission(permissionsSet, roles, "equipment:write");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [returnTarget, setReturnTarget] = useState<Row | null>(null);

  const subtitle = useMemo(() => {
    if (rows.length === 0) return "Nothing checked out";
    return rows.length === 1 ? "1 asset with you" : `${rows.length} assets with you`;
  }, [rows.length]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const data = await getUserAssets(user.id);
      const nextRows: Row[] = [
        ...data.current_assignments.map((item) => ({
          key: `assignment-${item.id}`,
          kind: "assignment" as const,
          item
        })),
        ...data.current_checkouts.map((item) => ({
          key: `checkout-${item.id}`,
          kind: "checkout" as const,
          item
        }))
      ];
      setRows(nextRows);
    } catch (err) {
      Alert.alert("Could not load assets", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleReturn = async (payload: AssetAssignmentReturnRequest) => {
    if (!returnTarget) return;
    try {
      setSubmitting(true);
      if (returnTarget.kind === "assignment") {
        const item = returnTarget.item;
        if (item.target_type === "equipment" && item.equipment_id) {
          if (!canWriteEquipment) {
            Alert.alert("Not allowed", "You do not have permission to return equipment.");
            return;
          }
          await returnEquipment(item.equipment_id, payload);
        } else if (item.fleet_asset_id) {
          if (!canWriteFleet) {
            Alert.alert("Not allowed", "You do not have permission to return fleet assets.");
            return;
          }
          await returnFleetAsset(item.fleet_asset_id, payload);
        }
      } else {
        if (!canWriteEquipment) {
          Alert.alert("Not allowed", "You do not have permission to check in equipment.");
          return;
        }
        await checkinEquipment(returnTarget.item.equipment_id, {
          actual_return_date: new Date().toISOString(),
          condition_in: "good",
          notes_in: payload.notes_in ?? null
        });
      }
      setReturnTarget(null);
      await load();
    } catch (err) {
      Alert.alert("Return failed", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderRow = ({ item: row }: { item: Row }) => {
    const title =
      row.kind === "assignment" ? row.item.asset_name : row.item.equipment_name;
    const meta =
      row.kind === "assignment"
        ? row.item.fleet_asset_type === "vehicle" && row.item.odometer_out != null
          ? `Odometer out: ${row.item.odometer_out}`
          : row.item.hours_out != null
            ? `Hours out: ${row.item.hours_out}`
            : row.item.target_type === "fleet"
              ? "Fleet asset"
              : "Equipment"
        : "Legacy equipment checkout";

    const canReturn =
      row.kind === "assignment"
        ? row.item.target_type === "equipment"
          ? canWriteEquipment
          : canWriteFleet
        : canWriteEquipment;

    return (
      <MKCard style={styles.card}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardMeta}>{meta}</Text>
        {canReturn ? (
          <View style={styles.cardAction}>
            <MKButton
              title={row.kind === "checkout" ? "Check in" : "Return"}
              variant="secondary"
              size="compact"
              onPress={() => setReturnTarget(row)}
            />
          </View>
        ) : null}
      </MKCard>
    );
  };

  const returnModalTitle =
    returnTarget?.kind === "checkout"
      ? `Check in — ${returnTarget.item.equipment_name}`
      : returnTarget
        ? `Return — ${returnTarget.item.asset_name}`
        : "Return";

  const showOdometer =
    returnTarget?.kind === "assignment" &&
    returnTarget.item.fleet_asset_type === "vehicle";
  const showHours =
    returnTarget?.kind === "assignment" &&
    returnTarget.item.fleet_asset_type != null &&
    returnTarget.item.fleet_asset_type !== "vehicle";

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader
        title="My Assets"
        subtitle={subtitle}
        onLeftPress={openMenu}
      />

      {loading && rows.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>You have no assets checked out.</Text>
              </View>
            ) : null
          }
        />
      )}

      <FleetReturnModal
        visible={returnTarget != null}
        title={returnModalTitle}
        showOdometer={!!showOdometer}
        showHours={!!showHours}
        minOdometer={
          returnTarget?.kind === "assignment" ? returnTarget.item.odometer_out ?? null : null
        }
        minHours={
          returnTarget?.kind === "assignment" ? returnTarget.item.hours_out ?? null : null
        }
        loading={submitting}
        onClose={() => setReturnTarget(null)}
        onSubmit={handleReturn}
      />
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
    gap: spacing.sm,
    paddingBottom: spacing.xl
  },
  card: {
    gap: spacing.xs
  },
  cardTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  cardMeta: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  cardAction: {
    marginTop: spacing.sm
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
