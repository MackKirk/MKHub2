import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import {
  CommonActions,
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission, isAdminRole } from "../../lib/permissions";
import { MANUAL_WORK_ORDER_STATUS_TRANSITIONS, WORK_ORDER_STATUS_LABELS } from "../../lib/fleetLabels";
import { resolveFileUrl } from "../../lib/fileUrls";
import { getFleetInspection } from "../../services/fleetInspections";
import { MKPageHeader } from "../../components/MKPageHeader";
import { MKButton } from "../../components/MKButton";
import { ScreenLayout } from "../../components/ScreenLayout";
import { FleetWorkOrderServiceModal } from "../../components/fleet/FleetWorkOrderServiceModal";
import {
  MKFleetWorkOrderDetailTabBar,
  fleetWorkOrderDetailTabBarHeight,
  type WorkOrderDetailTabItem
} from "../../components/fleet/MKFleetWorkOrderDetailTabBar";
import { MKFleetWorkOrderHero } from "../../components/fleet/MKFleetWorkOrderHero";
import { MKFleetWorkOrderGeneralSection } from "../../components/fleet/MKFleetWorkOrderGeneralSection";
import { MKFleetWorkOrderCostsSection } from "../../components/fleet/MKFleetWorkOrderCostsSection";
import { MKFleetWorkOrderFilesSection } from "../../components/fleet/MKFleetWorkOrderFilesSection";
import { MKFleetWorkOrderActivitySection } from "../../components/fleet/MKFleetWorkOrderActivitySection";
import { getEquipment, getFleetAsset } from "../../services/fleet";
import {
  buildWorkOrderAssetLine,
  checkInWorkOrder,
  checkOutWorkOrder,
  getWorkOrder,
  getWorkOrderActivity,
  reopenWorkOrder,
  updateWorkOrder,
  updateWorkOrderStatus
} from "../../services/fleetWorkOrders";
import { toApiError } from "../../services/api";
import type { RootStackParamList } from "../../navigation/types";
import type {
  WorkOrder,
  WorkOrderActivityEntry,
  WorkOrderCheckInRequest,
  WorkOrderCheckOutRequest,
  WorkOrderCosts,
  WorkOrderDetailTabKey
} from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

type FleetWorkOrderDetailRoute = RouteProp<RootStackParamList, "FleetWorkOrderDetail">;
type FleetWorkOrderDetailNav = NativeStackNavigationProp<
  RootStackParamList,
  "FleetWorkOrderDetail"
>;

const WO_TABS: WorkOrderDetailTabItem[] = [
  { key: "general", label: "General", icon: "grid-outline" },
  { key: "costs", label: "Costs", icon: "cash-outline" },
  { key: "files", label: "Files", icon: "folder-outline" },
  { key: "activity", label: "Activity", icon: "time-outline" }
];

export const FleetWorkOrderDetailScreen: React.FC = () => {
  const route = useRoute<FleetWorkOrderDetailRoute>();
  const navigation = useNavigation<FleetWorkOrderDetailNav>();
  const { openMenu } = useHubMenu();
  const { token, permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const canWrite = hasPermission(permissionsSet, roles, "work_orders:write");
  const isAdmin = isAdminRole(roles);
  const insets = useSafeAreaInsets();
  const bottomTabHeight = fleetWorkOrderDetailTabBarHeight(insets.bottom);

  const [activeTab, setActiveTab] = useState<WorkOrderDetailTabKey>(
    route.params.initialTab ?? "general"
  );
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [activity, setActivity] = useState<WorkOrderActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [assetLine, setAssetLine] = useState("");
  const [assetPhotoUrl, setAssetPhotoUrl] = useState<string | null>(null);
  const [assetLineLoading, setAssetLineLoading] = useState(false);
  const [showOdometer, setShowOdometer] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [defaultOdometer, setDefaultOdometer] = useState<number | null>(null);
  const [defaultHours, setDefaultHours] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [showCheckOut, setShowCheckOut] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const loadWorkOrder = useCallback(async () => {
    const order = await getWorkOrder(route.params.workOrderId);
    setWorkOrder(order);
    setDescriptionDraft(order.description);
    return order;
  }, [route.params.workOrderId]);

  const loadAssetContext = useCallback(
    async (order: WorkOrder) => {
      setAssetLineLoading(true);
      try {
        if (order.entity_type === "fleet") {
          const asset = await getFleetAsset(order.entity_id);
          setAssetLine(buildWorkOrderAssetLine("fleet", asset, null));
          setAssetPhotoUrl(
            asset.photos?.[0]
              ? resolveFileUrl(`/files/${asset.photos[0]}/thumbnail?w=400`, token)
              : null
          );
          setShowOdometer(asset.asset_type === "vehicle");
          setShowHours(asset.asset_type !== "vehicle");
          setDefaultOdometer(asset.odometer_current ?? null);
          setDefaultHours(asset.hours_current ?? null);
        } else if (order.entity_type === "equipment") {
          const equipment = await getEquipment(order.entity_id);
          setAssetLine(buildWorkOrderAssetLine("equipment", null, equipment));
          setAssetPhotoUrl(null);
          setShowOdometer(false);
          setShowHours(false);
          setDefaultOdometer(null);
          setDefaultHours(null);
        }
      } finally {
        setAssetLineLoading(false);
      }
    },
    [token]
  );

  const loadActivity = useCallback(async () => {
    try {
      setActivityLoading(true);
      const log = await getWorkOrderActivity(route.params.workOrderId);
      setActivity(log);
    } catch {
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }, [route.params.workOrderId]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const order = await loadWorkOrder();
      await loadAssetContext(order);
      await loadActivity();
    } catch (err) {
      Alert.alert("Could not load work order", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [loadWorkOrder, loadAssetContext, loadActivity]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const canStartService = workOrder?.status === "open";
  const canFinishService =
    workOrder?.status === "in_progress" || workOrder?.status === "pending_parts";
  const canReopen =
    isAdmin && (workOrder?.status === "cancelled" || workOrder?.status === "not_approved");
  const canEditDescription =
    canWrite &&
    workOrder != null &&
    ["open", "in_progress", "pending_parts"].includes(workOrder.status);
  const canEditCosts =
    canWrite &&
    workOrder != null &&
    ["open", "in_progress", "pending_parts"].includes(workOrder.status);
  const canEditFiles = canWrite;

  const statusOptions = useMemo(() => {
    if (!workOrder) return [];
    const manual = MANUAL_WORK_ORDER_STATUS_TRANSITIONS[workOrder.status] ?? [];
    return manual.map((status) => ({
      value: status,
      label: WORK_ORDER_STATUS_LABELS[status] ?? status
    }));
  }, [workOrder]);

  const openAsset = () => {
    if (!workOrder) return;
    navigation.dispatch(
      CommonActions.navigate({
        name: "FleetAssetDetail",
        params: {
          targetType: workOrder.entity_type,
          assetId: workOrder.entity_id,
          title: assetLine || undefined
        }
      })
    );
  };

  const openOriginatingInspection = async () => {
    if (!workOrder?.origin_id) return;
    try {
      const inspection = await getFleetInspection(workOrder.origin_id);
      if (inspection.inspection_schedule_id) {
        navigation.dispatch(
          CommonActions.navigate({
            name: "App",
            params: {
              screen: "MainTabs",
              params: {
                screen: "Home",
                params: {
                  screen: "FleetInspectionDetail",
                  params: { scheduleId: inspection.inspection_schedule_id }
                }
              }
            }
          })
        );
        return;
      }
      Alert.alert(
        "Inspection unavailable",
        "This inspection is not linked to a schedule view on mobile yet."
      );
    } catch (err) {
      Alert.alert("Could not open inspection", toApiError(err).message);
    }
  };

  const handleCheckIn = async (payload: WorkOrderCheckInRequest) => {
    try {
      setSubmitting(true);
      await checkInWorkOrder(route.params.workOrderId, payload);
      setShowCheckIn(false);
      await load();
    } catch (err) {
      Alert.alert("Check-in failed", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async (payload: WorkOrderCheckOutRequest) => {
    try {
      setSubmitting(true);
      await checkOutWorkOrder(route.params.workOrderId, payload);
      setShowCheckOut(false);
      await load();
    } catch (err) {
      Alert.alert("Check-out failed", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusTarget) return;
    if (statusTarget === "cancelled" && !statusReason.trim()) {
      Alert.alert("Reason required", "Please provide a reason for cancellation.");
      return;
    }
    try {
      setSubmitting(true);
      await updateWorkOrderStatus(route.params.workOrderId, {
        status: statusTarget,
        reason: statusReason.trim() || null
      });
      setShowStatusModal(false);
      setStatusTarget("");
      setStatusReason("");
      await load();
    } catch (err) {
      Alert.alert("Status update failed", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) {
      Alert.alert("Reason required", "Please provide a reason to reopen this work order.");
      return;
    }
    try {
      setSubmitting(true);
      await reopenWorkOrder(route.params.workOrderId, { reason: reopenReason.trim() });
      setShowReopenModal(false);
      setReopenReason("");
      await load();
    } catch (err) {
      Alert.alert("Reopen failed", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!descriptionDraft.trim()) return;
    try {
      setSubmitting(true);
      await updateWorkOrder(route.params.workOrderId, {
        description: descriptionDraft.trim()
      });
      setDescriptionEditing(false);
      await load();
    } catch (err) {
      Alert.alert("Could not save description", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCosts = async (costs: WorkOrderCosts) => {
    try {
      setSubmitting(true);
      await updateWorkOrder(route.params.workOrderId, { costs });
      await load();
    } catch (err) {
      Alert.alert("Could not save costs", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderTabContent = () => {
    if (!workOrder) return null;
    switch (activeTab) {
      case "costs":
        return (
          <MKFleetWorkOrderCostsSection
            workOrder={workOrder}
            canEdit={canEditCosts}
            saving={submitting}
            onSaveCosts={handleSaveCosts}
          />
        );
      case "files":
        return (
          <MKFleetWorkOrderFilesSection workOrderId={workOrder.id} canEdit={canEditFiles} />
        );
      case "activity":
        return (
          <MKFleetWorkOrderActivitySection activity={activity} loading={activityLoading} />
        );
      case "general":
      default:
        return (
          <MKFleetWorkOrderGeneralSection
            workOrder={workOrder}
            canEditDescription={canEditDescription}
            descriptionEditing={descriptionEditing}
            descriptionDraft={descriptionDraft}
            saving={submitting}
            onStartEditDescription={() => setDescriptionEditing(true)}
            onCancelEditDescription={() => {
              setDescriptionEditing(false);
              setDescriptionDraft(workOrder.description);
            }}
            onDescriptionDraftChange={setDescriptionDraft}
            onSaveDescription={handleSaveDescription}
            onViewOriginatingInspection={
              workOrder.origin_source === "inspection" && workOrder.origin_id
                ? openOriginatingInspection
                : undefined
            }
          />
        );
    }
  };

  const subtitle = workOrder
    ? WORK_ORDER_STATUS_LABELS[workOrder.status] ?? workOrder.status
    : "Loading…";

  if (loading && !workOrder) {
    return (
      <ScreenLayout scroll={false}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
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
          { paddingBottom: bottomTabHeight + spacing.lg }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <MKPageHeader
          title={workOrder?.work_order_number ?? "Work order"}
          subtitle={subtitle}
          onBack={() => navigation.goBack()}
          onMenu={openMenu}
        />

        {workOrder ? (
          <>
            <MKFleetWorkOrderHero
              workOrder={workOrder}
              assetPhotoUrl={assetPhotoUrl}
              assetLine={assetLine}
              assetLineLoading={assetLineLoading}
              variant={activeTab === "general" ? "full" : "compact"}
              canStartService={canWrite && !!canStartService}
              canFinishService={canWrite && !!canFinishService}
              canReopen={canWrite && canReopen}
              canEditStatus={canWrite && statusOptions.length > 0}
              onOpenAsset={openAsset}
              onStartService={() => setShowCheckIn(true)}
              onFinishService={() => setShowCheckOut(true)}
              onReopen={() => setShowReopenModal(true)}
              onEditStatus={() => setShowStatusModal(true)}
            />
            <View style={styles.tabContent}>{renderTabContent()}</View>
          </>
        ) : null}
      </ScrollView>

      <MKFleetWorkOrderDetailTabBar
        tabs={WO_TABS}
        activeKey={activeTab}
        onChange={setActiveTab}
        style={styles.bottomTabBar}
      />

      <FleetWorkOrderServiceModal
        visible={showCheckIn}
        mode="check-in"
        title={`Start service — ${workOrder?.work_order_number ?? "Work order"}`}
        showOdometer={showOdometer}
        showHours={showHours}
        defaultOdometer={defaultOdometer}
        defaultHours={defaultHours}
        loading={submitting}
        onClose={() => setShowCheckIn(false)}
        onSubmit={handleCheckIn}
      />

      <FleetWorkOrderServiceModal
        visible={showCheckOut}
        mode="check-out"
        title={`Finish service — ${workOrder?.work_order_number ?? "Work order"}`}
        showOdometer={showOdometer}
        showHours={showHours}
        defaultOdometer={workOrder?.odometer_reading ?? defaultOdometer}
        defaultHours={workOrder?.hours_reading ?? defaultHours}
        loading={submitting}
        onClose={() => setShowCheckOut(false)}
        onSubmit={handleCheckOut}
      />

      <StatusModal
        visible={showStatusModal}
        title="Change status"
        options={statusOptions}
        selected={statusTarget}
        reason={statusReason}
        loading={submitting}
        onSelect={setStatusTarget}
        onReasonChange={setStatusReason}
        onClose={() => setShowStatusModal(false)}
        onSubmit={handleStatusChange}
      />

      <StatusModal
        visible={showReopenModal}
        title="Reopen work order"
        options={[]}
        selected=""
        reason={reopenReason}
        loading={submitting}
        reasonLabel="Reason"
        onReasonChange={setReopenReason}
        onClose={() => setShowReopenModal(false)}
        onSubmit={handleReopen}
        submitLabel="Reopen"
      />
    </ScreenLayout>
  );
};

function StatusModal({
  visible,
  title,
  options,
  selected,
  reason,
  loading,
  reasonLabel = "Reason (optional)",
  submitLabel = "Update",
  onSelect,
  onReasonChange,
  onClose,
  onSubmit
}: {
  visible: boolean;
  title: string;
  options: Array<{ value: string; label: string }>;
  selected: string;
  reason: string;
  loading: boolean;
  reasonLabel?: string;
  submitLabel?: string;
  onSelect?: (value: string) => void;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          {options.length > 0 ? (
            <View style={styles.statusOptions}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.statusOption,
                    selected === option.value && styles.statusOptionActive
                  ]}
                  onPress={() => onSelect?.(option.value)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      selected === option.value && styles.statusOptionTextActive
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TextInput
            style={[styles.input, styles.textArea]}
            value={reason}
            onChangeText={onReasonChange}
            placeholder={reasonLabel}
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <View style={styles.inlineActions}>
            <MKButton title="Cancel" variant="secondary" onPress={onClose} />
            <MKButton
              title={submitLabel}
              onPress={onSubmit}
              loading={loading}
              disabled={options.length > 0 && !selected}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

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
    marginTop: spacing.md
  },
  bottomTabBar: {
    marginHorizontal: -spacing.xl
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.md
  },
  modalTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  statusOptions: {
    gap: spacing.sm
  },
  statusOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: spacing.md
  },
  statusOptionActive: {
    borderColor: colors.primary,
    backgroundColor: "#fef2f2"
  },
  statusOptionText: {
    ...typography.body,
    color: colors.textPrimary
  },
  statusOptionTextActive: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  inlineActions: {
    flexDirection: "row",
    gap: spacing.sm
  }
});
