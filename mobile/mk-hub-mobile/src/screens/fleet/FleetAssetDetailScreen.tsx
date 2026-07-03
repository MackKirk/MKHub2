import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { CommonActions, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission } from "../../lib/permissions";
import { buildFleetAssetSubtitle, buildFleetAssetTitle } from "../../lib/fleetAssetUi";
import { MKPageHeader } from "../../components/MKPageHeader";
import { MKButton } from "../../components/MKButton";
import { ScreenLayout } from "../../components/ScreenLayout";
import { FleetAssignModal } from "../../components/fleet/FleetAssignModal";
import { FleetReturnModal } from "../../components/fleet/FleetReturnModal";
import {
  MKFleetAssetDetailTabBar,
  fleetAssetDetailTabBarHeight,
  type FleetAssetDetailTabItem
} from "../../components/fleet/MKFleetAssetDetailTabBar";
import { MKFleetAssetHero } from "../../components/fleet/MKFleetAssetHero";
import { MKFleetAssetGeneralSection } from "../../components/fleet/MKFleetAssetGeneralSection";
import { MKFleetAssetInspectionsSection } from "../../components/fleet/MKFleetAssetInspectionsSection";
import { MKFleetAssetWorkOrdersSection } from "../../components/fleet/MKFleetAssetWorkOrdersSection";
import { MKFleetAssetComplianceSection } from "../../components/fleet/MKFleetAssetComplianceSection";
import { MKFleetAssetLogsSection } from "../../components/fleet/MKFleetAssetLogsSection";
import {
  assignEquipment,
  assignFleetAsset,
  equipmentLabel,
  getEquipment,
  getEquipmentAssignments,
  getFleetAsset,
  getFleetAssetAssignments,
  getFleetAssetCompliance,
  getFleetAssetHistory,
  getFleetAssetInspections,
  getFleetAssetWorkOrders,
  returnEquipment,
  returnFleetAsset
} from "../../services/fleet";
import { toApiError } from "../../services/api";
import type { RootStackParamList } from "../../navigation/types";
import type {
  AssetAssignment,
  AssetAssignmentAssignRequest,
  AssetAssignmentReturnRequest,
  EquipmentItem,
  FleetAsset,
  FleetAssetDetailTabKey,
  FleetComplianceRecord,
  FleetHistoryItem,
  FleetInspection,
  WorkOrder
} from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type FleetAssetDetailRoute = RouteProp<RootStackParamList, "FleetAssetDetail">;
type FleetAssetDetailNav = NativeStackNavigationProp<RootStackParamList, "FleetAssetDetail">;

const FLEET_TABS: FleetAssetDetailTabItem[] = [
  { key: "general", label: "General", icon: "grid-outline" },
  { key: "inspections", label: "Inspections", icon: "checkbox-outline" },
  { key: "work-orders", label: "Work Orders", icon: "clipboard-outline" },
  { key: "compliance", label: "Compliance", icon: "shield-checkmark-outline" },
  { key: "logs", label: "Logs", icon: "time-outline" }
];

export const FleetAssetDetailScreen: React.FC = () => {
  const route = useRoute<FleetAssetDetailRoute>();
  const navigation = useNavigation<FleetAssetDetailNav>();
  const { openMenu } = useHubMenu();
  const { user, token, permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const insets = useSafeAreaInsets();
  const bottomTabHeight = fleetAssetDetailTabBarHeight(insets.bottom);

  const { targetType, assetId, title: routeTitle, initialTab } = route.params;
  const isFleetAsset = targetType === "fleet";

  const canWrite = isFleetAsset
    ? hasPermission(permissionsSet, roles, "fleet:write")
    : hasPermission(permissionsSet, roles, "equipment:write");

  const [activeTab, setActiveTab] = useState<FleetAssetDetailTabKey>(initialTab ?? "general");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fleetAsset, setFleetAsset] = useState<FleetAsset | null>(null);
  const [equipment, setEquipment] = useState<EquipmentItem | null>(null);
  const [openAssignment, setOpenAssignment] = useState<AssetAssignment | null>(null);
  const [inspections, setInspections] = useState<FleetInspection[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [compliance, setCompliance] = useState<FleetComplianceRecord[]>([]);
  const [history, setHistory] = useState<FleetHistoryItem[]>([]);
  const [tabLoading, setTabLoading] = useState<Partial<Record<FleetAssetDetailTabKey, boolean>>>({});
  const loadedTabsRef = useRef<Set<FleetAssetDetailTabKey>>(new Set());
  const [showAssign, setShowAssign] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  const screenTitle = useMemo(() => {
    if (routeTitle) return routeTitle;
    if (fleetAsset) return buildFleetAssetTitle(fleetAsset);
    if (equipment) return equipmentLabel(equipment);
    return "Asset";
  }, [routeTitle, fleetAsset, equipment]);

  const screenSubtitle = useMemo(() => {
    if (fleetAsset) return buildFleetAssetSubtitle(fleetAsset);
    if (equipment?.unit_number) return `Unit #${equipment.unit_number}`;
    return undefined;
  }, [fleetAsset, equipment]);

  const showOdometer = isFleetAsset && fleetAsset?.asset_type === "vehicle";
  const showHours = isFleetAsset && fleetAsset != null && fleetAsset.asset_type !== "vehicle";

  const loadCore = useCallback(async () => {
    try {
      setLoading(true);
      if (isFleetAsset) {
        const [asset, assignments] = await Promise.all([
          getFleetAsset(assetId),
          getFleetAssetAssignments(assetId)
        ]);
        setFleetAsset(asset);
        setEquipment(null);
        setOpenAssignment(assignments.find((row) => !row.returned_at) ?? null);
      } else {
        const [item, assignments] = await Promise.all([
          getEquipment(assetId),
          getEquipmentAssignments(assetId)
        ]);
        setEquipment(item);
        setFleetAsset(null);
        setOpenAssignment(assignments.find((row) => !row.returned_at) ?? null);
      }
    } catch (err) {
      Alert.alert("Could not load asset", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [assetId, isFleetAsset]);

  const loadTabData = useCallback(
    async (tab: FleetAssetDetailTabKey) => {
      if (!isFleetAsset || loadedTabsRef.current.has(tab)) return;
      try {
        setTabLoading((prev) => ({ ...prev, [tab]: true }));
        if (tab === "inspections") {
          setInspections(await getFleetAssetInspections(assetId));
        } else if (tab === "work-orders") {
          setWorkOrders(await getFleetAssetWorkOrders(assetId));
        } else if (tab === "compliance") {
          setCompliance(await getFleetAssetCompliance(assetId));
        } else if (tab === "logs") {
          setHistory(await getFleetAssetHistory(assetId));
        }
        loadedTabsRef.current.add(tab);
      } catch (err) {
        Alert.alert("Could not load section", toApiError(err).message);
      } finally {
        setTabLoading((prev) => ({ ...prev, [tab]: false }));
      }
    },
    [assetId, isFleetAsset]
  );

  useEffect(() => {
    loadedTabsRef.current = new Set();
    setInspections([]);
    setWorkOrders([]);
    setCompliance([]);
    setHistory([]);
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (isFleetAsset && activeTab !== "general") {
      loadTabData(activeTab);
    }
  }, [activeTab, isFleetAsset, loadTabData]);

  const handleAssign = async (payload: AssetAssignmentAssignRequest) => {
    if (!user?.id) return;
    try {
      setSubmitting(true);
      const body = { ...payload, assigned_to_user_id: user.id };
      if (isFleetAsset) {
        await assignFleetAsset(assetId, body);
      } else {
        await assignEquipment(assetId, body);
      }
      setShowAssign(false);
      await loadCore();
    } catch (err) {
      Alert.alert("Check out failed", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async (payload: AssetAssignmentReturnRequest) => {
    try {
      setSubmitting(true);
      if (isFleetAsset) {
        await returnFleetAsset(assetId, payload);
      } else {
        await returnEquipment(assetId, payload);
      }
      setShowReturn(false);
      await loadCore();
    } catch (err) {
      Alert.alert("Check in failed", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const openWorkOrder = (workOrderId: string) => {
    navigation.dispatch(
      CommonActions.navigate({
        name: "FleetWorkOrderDetail",
        params: { workOrderId }
      })
    );
  };

  const renderFleetTabContent = () => {
    switch (activeTab) {
      case "general":
        return fleetAsset ? (
          <MKFleetAssetGeneralSection
            asset={fleetAsset}
            openAssignment={openAssignment}
            canWrite={canWrite}
            onCheckOut={() => setShowAssign(true)}
            onCheckIn={() => setShowReturn(true)}
          />
        ) : null;
      case "inspections":
        return (
          <MKFleetAssetInspectionsSection
            items={inspections}
            loading={!!tabLoading.inspections}
          />
        );
      case "work-orders":
        return (
          <MKFleetAssetWorkOrdersSection
            items={workOrders}
            loading={!!tabLoading["work-orders"]}
            onOpenWorkOrder={openWorkOrder}
          />
        );
      case "compliance":
        return (
          <MKFleetAssetComplianceSection
            items={compliance}
            loading={!!tabLoading.compliance}
          />
        );
      case "logs":
        return (
          <MKFleetAssetLogsSection
            items={history}
            loading={!!tabLoading.logs}
          />
        );
      default:
        return null;
    }
  };

  const renderEquipmentFallback = () => {
    if (!equipment) return null;
    const infoRows = [
      ["Category", equipment.category],
      ["Unit", equipment.unit_number],
      ["Serial", equipment.serial_number],
      ["Brand", equipment.brand],
      ["Model", equipment.model],
      ["Status", equipment.status]
    ].filter(([, value]) => value);

    return (
      <View style={styles.tabContent}>
        <View style={styles.equipmentCard}>
          {infoRows.map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
        </View>
        {canWrite ? (
          <View style={styles.equipmentActions}>
            {openAssignment ? (
              <MKButton title="Check in / Return" onPress={() => setShowReturn(true)} />
            ) : (
              <MKButton title="Check out" onPress={() => setShowAssign(true)} />
            )}
          </View>
        ) : null}
      </View>
    );
  };

  if (loading && !fleetAsset && !equipment) {
    return (
      <ScreenLayout scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading asset...</Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout scroll={false} contentStyle={styles.screenContent}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isFleetAsset ? bottomTabHeight + spacing.lg : spacing.xxl }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <MKPageHeader
          title={isFleetAsset ? "Fleet Asset" : "Equipment"}
          subtitle={screenSubtitle}
          onBack={() => navigation.goBack()}
          onMenu={openMenu}
        />

        {isFleetAsset && fleetAsset ? (
          <>
            <MKFleetAssetHero
              asset={fleetAsset}
              openAssignment={openAssignment}
              token={token}
              variant={activeTab === "general" ? "full" : "compact"}
            />
            <View style={styles.tabContent}>{renderFleetTabContent()}</View>
          </>
        ) : (
          renderEquipmentFallback()
        )}
      </ScrollView>

      {isFleetAsset ? (
        <MKFleetAssetDetailTabBar
          tabs={FLEET_TABS}
          activeKey={activeTab}
          onChange={setActiveTab}
          style={styles.bottomTabBar}
        />
      ) : null}

      <FleetAssignModal
        visible={showAssign}
        title={`Check out — ${screenTitle}`}
        showOdometer={!!showOdometer}
        showHours={!!showHours}
        minOdometer={fleetAsset?.odometer_current ?? null}
        defaultOdometer={fleetAsset?.odometer_current ?? null}
        defaultHours={fleetAsset?.hours_current ?? null}
        loading={submitting}
        onClose={() => setShowAssign(false)}
        onSubmit={handleAssign}
      />

      <FleetReturnModal
        visible={showReturn}
        title={`Return — ${screenTitle}`}
        showOdometer={!!showOdometer}
        showHours={!!showHours}
        minOdometer={openAssignment?.odometer_out ?? null}
        minHours={openAssignment?.hours_out ?? null}
        loading={submitting}
        onClose={() => setShowReturn(false)}
        onSubmit={handleReturn}
      />
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingBottom: 0
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: spacing.xxl
  },
  tabContent: {
    marginTop: spacing.md,
    gap: spacing.md
  },
  bottomTabBar: {
    marginHorizontal: -spacing.xl
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  equipmentCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm
  },
  infoRow: {
    gap: 2
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  infoValue: {
    ...typography.body,
    color: colors.textPrimary,
    textTransform: "capitalize"
  },
  equipmentActions: {
    marginTop: spacing.sm
  }
});
