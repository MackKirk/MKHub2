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
import { CommonActions, useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKCard } from "../../components/MKCard";
import { MKAvailabilityAccent } from "../../components/fleet/MKAvailabilityAccent";
import { ScreenLayout } from "../../components/ScreenLayout";
import { isFleetAssetAssigned } from "../../lib/fleetAssetUi";
import {
  equipmentLabel,
  fleetAssetLabel,
  listEquipment,
  listFleetAssets,
  listKindToAssetType
} from "../../services/fleet";
import { toApiError } from "../../services/api";
import type { HomeStackParamList } from "../../navigation/types";
import type { EquipmentItem, FleetAsset } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

type FleetAssetsListRoute = RouteProp<HomeStackParamList, "FleetAssetsList">;
type FleetAssetsListNav = NativeStackNavigationProp<HomeStackParamList, "FleetAssetsList">;

type ListRow =
  | { key: string; targetType: "fleet"; item: FleetAsset }
  | { key: string; targetType: "equipment"; item: EquipmentItem };

function listItemTitle(row: ListRow): string {
  if (row.targetType === "fleet") {
    const asset = row.item;
    const makeModel = [asset.make, asset.model].filter(Boolean).join(" ").trim();
    return (
      asset.name?.trim() ||
      makeModel ||
      asset.license_plate?.trim() ||
      fleetAssetLabel(asset)
    );
  }
  return row.item.name?.trim() || equipmentLabel(row.item);
}

function listItemSecondaryMeta(row: ListRow): string {
  if (row.targetType === "fleet") {
    return [row.item.license_plate, row.item.asset_type.replace("_", " ")]
      .filter(Boolean)
      .join(" · ");
  }
  return row.item.category || "";
}

const UnitNumberHighlight: React.FC<{ unitNumber: string }> = ({ unitNumber }) => (
  <View style={styles.unitRow}>
    <View style={styles.unitDot} />
    <Text style={styles.unitText}>Unit #{unitNumber}</Text>
  </View>
);

const PAGE_SIZE = 50;

export const FleetAssetsListScreen: React.FC = () => {
  const route = useRoute<FleetAssetsListRoute>();
  const navigation = useNavigation<FleetAssetsListNav>();
  const { openMenu } = useHubMenu();
  const { listKind, title } = route.params;

  const [rows, setRows] = useState<ListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const subtitle = useMemo(() => {
    if (total <= 0) return "Browse available assets";
    if (rows.length < total) return `${rows.length} of ${total} loaded`;
    return `${total} total`;
  }, [rows.length, total]);

  const mapResultItems = useCallback(
    (
      items: FleetAsset[] | EquipmentItem[],
      targetType: ListRow["targetType"]
    ): ListRow[] =>
      items.map((item) => ({
        key: item.id,
        targetType,
        item
      })) as ListRow[],
    []
  );

  const fetchPage = useCallback(
    async (pageNumber: number) => {
      const search = query.trim() || undefined;

      if (listKind === "equipment") {
        return listEquipment({
          search,
          page: pageNumber,
          limit: PAGE_SIZE,
          sort: "unit_number",
          dir: "asc"
        });
      }

      return listFleetAssets({
        asset_type: listKindToAssetType(listKind),
        search,
        page: pageNumber,
        limit: PAGE_SIZE,
        sort: "unit_number",
        dir: "asc"
      });
    },
    [listKind, query]
  );

  const loadFirstPage = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchPage(1);
      setRows(mapResultItems(result.items, listKind === "equipment" ? "equipment" : "fleet"));
      setTotal(result.total);
      setTotalPages(result.total_pages);
      setPage(1);
    } catch (err) {
      Alert.alert("Could not load fleet assets", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, listKind, mapResultItems]);

  const loadNextPage = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;

    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const result = await fetchPage(nextPage);
      const targetType = listKind === "equipment" ? "equipment" : "fleet";
      setRows((prev) => [...prev, ...mapResultItems(result.items, targetType)]);
      setTotal(result.total);
      setTotalPages(result.total_pages);
      setPage(nextPage);
    } catch (err) {
      Alert.alert("Could not load more assets", toApiError(err).message);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, listKind, loading, loadingMore, mapResultItems, page, totalPages]);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  const openDetail = (row: ListRow) => {
    const label =
      row.targetType === "fleet"
        ? fleetAssetLabel(row.item)
        : equipmentLabel(row.item);
    navigation.dispatch(
      CommonActions.navigate({
        name: "FleetAssetDetail",
        params: {
          targetType: row.targetType,
          assetId: row.item.id,
          title: label
        }
      })
    );
  };

  const renderRow = ({ item: row }: { item: ListRow }) => {
    const label = listItemTitle(row);
    const unitNumber = row.item.unit_number?.trim();
    const secondaryMeta = listItemSecondaryMeta(row);
    const showTitle = !unitNumber || label !== unitNumber;

    const isAssigned =
      row.targetType === "fleet"
        ? isFleetAssetAssigned(row.item)
        : Boolean(row.item.assigned_to_name?.trim());

    return (
      <TouchableOpacity activeOpacity={0.75} onPress={() => openDetail(row)}>
        <MKCard style={styles.card}>
          <View style={styles.cardRow}>
            <MKAvailabilityAccent isAssigned={isAssigned} />
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                {showTitle ? (
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {label}
                  </Text>
                ) : unitNumber ? (
                  <UnitNumberHighlight unitNumber={unitNumber} />
                ) : (
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {label}
                  </Text>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
              {showTitle && unitNumber ? <UnitNumberHighlight unitNumber={unitNumber} /> : null}
              {secondaryMeta ? <Text style={styles.cardMeta}>{secondaryMeta}</Text> : null}
              {isAssigned ? (
                <Text style={styles.assignedMeta} numberOfLines={1}>
                  With {row.item.assigned_to_name}
                </Text>
              ) : (
                <Text style={styles.availableMeta}>Available</Text>
              )}
            </View>
          </View>
        </MKCard>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader title={title} subtitle={subtitle} onLeftPress={openMenu} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name, unit, or plate"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          onSubmitEditing={loadFirstPage}
        />
      </View>

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
          refreshControl={
            <RefreshControl refreshing={loading && rows.length > 0} onRefresh={loadFirstPage} />
          }
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No assets found.</Text>
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
  footerLoading: {
    paddingVertical: spacing.lg,
    alignItems: "center"
  },
  card: {
    padding: 0,
    overflow: "hidden",
    gap: 0
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "stretch"
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
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
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    minWidth: 0
  },
  unitDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#9ca3af"
  },
  unitText: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  cardMeta: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textTransform: "capitalize"
  },
  availableMeta: {
    ...typography.caption,
    color: "#059669",
    fontFamily: typography.button.fontFamily
  },
  assignedMeta: {
    ...typography.caption,
    color: "#dc2626",
    fontFamily: typography.button.fontFamily
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
