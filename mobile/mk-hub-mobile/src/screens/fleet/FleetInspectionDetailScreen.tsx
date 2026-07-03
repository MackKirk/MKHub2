import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
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
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useAuth } from "../../hooks/useAuth";
import { hasPermission } from "../../lib/permissions";
import { isInspectionResultFinal } from "../../lib/fleetInspectionForm";
import {
  INSPECTION_RESULT_LABELS,
  SCHEDULE_STATUS_LABELS,
  getInspectionResultVariant
} from "../../lib/fleetLabels";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { MKBadge } from "../../components/MKBadge";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { MKInspectionBodyEditor } from "../../components/fleet/MKInspectionBodyEditor";
import { MKInspectionMechanicalEditor } from "../../components/fleet/MKInspectionMechanicalEditor";
import { MKInspectionReadOnlySection } from "../../components/fleet/MKInspectionReadOnlySection";
import { MKInspectionScheduleHero } from "../../components/fleet/MKInspectionScheduleHero";
import { ScreenLayout } from "../../components/ScreenLayout";
import { getFleetAsset } from "../../services/fleet";
import {
  generateWorkOrderFromInspection,
  getFleetInspection,
  getInspectionChecklistTemplate
} from "../../services/fleetInspections";
import {
  getInspectionSchedule,
  startInspectionScheduleBody,
  startInspectionScheduleMechanical
} from "../../services/fleetWorkOrders";
import { toApiError } from "../../services/api";
import type { HomeStackParamList } from "../../navigation/types";
import type {
  FleetAsset,
  FleetInspectionDetail,
  InspectionChecklistTemplate,
  InspectionSchedule
} from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type FleetInspectionDetailRoute = RouteProp<HomeStackParamList, "FleetInspectionDetail">;
type FleetInspectionDetailNav = NativeStackNavigationProp<HomeStackParamList, "FleetInspectionDetail">;

type InspectionTab = "body" | "mechanical";

export const FleetInspectionDetailScreen: React.FC = () => {
  const route = useRoute<FleetInspectionDetailRoute>();
  const navigation = useNavigation<FleetInspectionDetailNav>();
  const { openMenu } = useHubMenu();
  const { permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const canWrite = hasPermission(permissionsSet, roles, "inspections:write");
  const canWriteWorkOrders = hasPermission(permissionsSet, roles, "work_orders:write");

  const [schedule, setSchedule] = useState<InspectionSchedule | null>(null);
  const [asset, setAsset] = useState<FleetAsset | null>(null);
  const [bodyInspection, setBodyInspection] = useState<FleetInspectionDetail | null>(null);
  const [mechanicalInspection, setMechanicalInspection] = useState<FleetInspectionDetail | null>(
    null
  );
  const [bodyTemplate, setBodyTemplate] = useState<InspectionChecklistTemplate | null>(null);
  const [mechanicalTemplate, setMechanicalTemplate] = useState<InspectionChecklistTemplate | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<InspectionTab>("body");
  const [bodyEditorOpen, setBodyEditorOpen] = useState(false);
  const [mechEditorOpen, setMechEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingWo, setCreatingWo] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const scheduleData = await getInspectionSchedule(route.params.scheduleId);
      setSchedule(scheduleData);

      const [assetData, bodyData, mechData, bodyTpl, mechTpl] = await Promise.all([
        scheduleData.fleet_asset_id
          ? getFleetAsset(scheduleData.fleet_asset_id).catch(() => null)
          : Promise.resolve(null),
        scheduleData.body_inspection_id
          ? getFleetInspection(scheduleData.body_inspection_id).catch(() => null)
          : Promise.resolve(null),
        scheduleData.mechanical_inspection_id
          ? getFleetInspection(scheduleData.mechanical_inspection_id).catch(() => null)
          : Promise.resolve(null),
        scheduleData.body_inspection_id
          ? getInspectionChecklistTemplate("body").catch(() => null)
          : Promise.resolve(null),
        scheduleData.mechanical_inspection_id
          ? getInspectionChecklistTemplate("mechanical").catch(() => null)
          : Promise.resolve(null)
      ]);

      setAsset(assetData);
      setBodyInspection(bodyData);
      setMechanicalInspection(mechData);
      setBodyTemplate(bodyTpl);
      setMechanicalTemplate(mechTpl);
    } catch (err) {
      Alert.alert("Could not load inspection", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [route.params.scheduleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const bodyPending = !schedule?.body_result || schedule.body_result === "pending";
  const mechPending = !schedule?.mechanical_result || schedule.mechanical_result === "pending";

  const canEditBody =
    !!bodyInspection &&
    bodyPending &&
    !bodyInspection.auto_generated_work_order_id &&
    !isInspectionResultFinal(bodyInspection.result);

  const canEditMechanical =
    !!mechanicalInspection &&
    mechPending &&
    !mechanicalInspection.auto_generated_work_order_id &&
    !isInspectionResultFinal(mechanicalInspection.result);

  const fleetAssetContext = asset
    ? {
        unit_number: asset.unit_number,
        name: asset.name,
        odometer_current: asset.odometer_current,
        hours_current: asset.hours_current
      }
    : undefined;

  const startBody = async () => {
    try {
      setSubmitting(true);
      await startInspectionScheduleBody(route.params.scheduleId);
      await load();
      setBodyEditorOpen(true);
      setActiveTab("body");
    } catch (err) {
      Alert.alert("Could not start body inspection", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const startMechanical = async () => {
    try {
      setSubmitting(true);
      await startInspectionScheduleMechanical(route.params.scheduleId);
      await load();
      setMechEditorOpen(true);
      setActiveTab("mechanical");
    } catch (err) {
      Alert.alert("Could not start mechanical inspection", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditorSaved = async () => {
    setBodyEditorOpen(false);
    setMechEditorOpen(false);
    await load();
  };

  const openAsset = () => {
    if (!schedule?.fleet_asset_id) return;
    navigation.dispatch(
      CommonActions.navigate({
        name: "FleetAssetDetail",
        params: {
          targetType: "fleet",
          assetId: schedule.fleet_asset_id,
          title: schedule.fleet_asset_name ?? "Asset"
        }
      })
    );
  };

  const openWorkOrder = (workOrderId: string) => {
    navigation.dispatch(
      CommonActions.navigate({
        name: "FleetWorkOrderDetail",
        params: { workOrderId }
      })
    );
  };

  const createWorkOrder = async (inspectionId: string) => {
    try {
      setCreatingWo(true);
      const wo = await generateWorkOrderFromInspection(inspectionId);
      await load();
      openWorkOrder(wo.id);
    } catch (err) {
      Alert.alert("Could not create work order", toApiError(err).message);
    } finally {
      setCreatingWo(false);
    }
  };

  const title = schedule?.fleet_asset_name ?? "Inspection";
  const subtitle = schedule
    ? SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status
    : "Loading…";

  const renderBodyColumn = () => {
    if (!schedule) return null;

    if (bodyEditorOpen && schedule.body_inspection_id && bodyInspection && bodyTemplate?.areas) {
      return (
        <MKInspectionBodyEditor
          inspectionId={schedule.body_inspection_id}
          inspection={bodyInspection}
          templateAreas={bodyTemplate.areas}
          fleetAsset={fleetAssetContext}
          onSaved={handleEditorSaved}
          onCancel={() => setBodyEditorOpen(false)}
        />
      );
    }

    if (!schedule.body_inspection_id) {
      return (
        <MKCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Body not created</Text>
          {canWrite ? (
            <MKButton title="Start body inspection" onPress={startBody} loading={submitting} />
          ) : null}
        </MKCard>
      );
    }

    return (
      <View style={styles.columnContent}>
        {bodyPending && canEditBody && bodyTemplate?.areas ? (
          <MKButton
            title={bodyTemplate.areas.length ? "Start" : "Loading…"}
            onPress={() => setBodyEditorOpen(true)}
            disabled={!bodyTemplate.areas.length}
          />
        ) : null}

        {bodyInspection && bodyTemplate?.areas ? (
          <MKInspectionReadOnlySection
            inspection={bodyInspection}
            kind="body"
            templateAreas={bodyTemplate.areas}
            pending={bodyPending}
            canCreateWorkOrder={canWriteWorkOrders && !bodyPending}
            creatingWorkOrder={creatingWo}
            onCreateWorkOrder={() => createWorkOrder(bodyInspection.id)}
            onViewWorkOrder={openWorkOrder}
          />
        ) : null}

        {bodyPending && !canEditBody ? (
          <Text style={styles.hint}>
            This inspection cannot be edited (completed or work order linked).
          </Text>
        ) : null}

        {bodyPending && canEditBody && !bodyEditorOpen && !bodyInspection?.checklist_results ? (
          <Text style={styles.hint}>Use Start to fill the checklist here.</Text>
        ) : null}
      </View>
    );
  };

  const renderMechanicalColumn = () => {
    if (!schedule) return null;

    if (
      mechEditorOpen &&
      schedule.mechanical_inspection_id &&
      mechanicalInspection &&
      mechanicalTemplate?.sections
    ) {
      return (
        <MKInspectionMechanicalEditor
          inspectionId={schedule.mechanical_inspection_id}
          inspection={mechanicalInspection}
          templateSections={mechanicalTemplate.sections}
          fleetAsset={fleetAssetContext}
          onSaved={handleEditorSaved}
          onCancel={() => setMechEditorOpen(false)}
        />
      );
    }

    if (!schedule.mechanical_inspection_id) {
      return (
        <MKCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Mechanical not created</Text>
          {canWrite ? (
            <MKButton
              title="Start mechanical inspection"
              variant="secondary"
              onPress={startMechanical}
              loading={submitting}
            />
          ) : null}
        </MKCard>
      );
    }

    return (
      <View style={styles.columnContent}>
        {mechPending && canEditMechanical && mechanicalTemplate?.sections ? (
          <MKButton
            title={mechanicalTemplate.sections.length ? "Start" : "Loading…"}
            onPress={() => setMechEditorOpen(true)}
            disabled={!mechanicalTemplate.sections.length}
          />
        ) : null}

        {mechanicalInspection && mechanicalTemplate?.sections ? (
          <MKInspectionReadOnlySection
            inspection={mechanicalInspection}
            kind="mechanical"
            templateSections={mechanicalTemplate.sections}
            pending={mechPending}
            canCreateWorkOrder={canWriteWorkOrders && !mechPending}
            creatingWorkOrder={creatingWo}
            onCreateWorkOrder={() => createWorkOrder(mechanicalInspection.id)}
            onViewWorkOrder={openWorkOrder}
          />
        ) : null}

        {mechPending && !canEditMechanical ? (
          <Text style={styles.hint}>
            This inspection cannot be edited (completed or work order linked).
          </Text>
        ) : null}

        {mechPending &&
        canEditMechanical &&
        !mechEditorOpen &&
        !mechanicalInspection?.checklist_results ? (
          <Text style={styles.hint}>Use Start to fill the checklist here.</Text>
        ) : null}
      </View>
    );
  };

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader title={title} subtitle={subtitle} onLeftPress={openMenu} />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : schedule ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <MKInspectionScheduleHero schedule={schedule} asset={asset} onViewAsset={openAsset} />

          <MKCard style={styles.inspectionsCard}>
            <Text style={styles.inspectionsTitle}>Inspections</Text>
            <Text style={styles.inspectionsDescription}>
              Start opens the checklist here. Body and Mechanical can run together.
            </Text>

            <View style={styles.tabRow}>
              <TabButton
                label="Body / Exterior"
                emoji="🚗"
                active={activeTab === "body"}
                result={schedule.body_result}
                onPress={() => setActiveTab("body")}
              />
              <TabButton
                label="Mechanical"
                emoji="🔧"
                active={activeTab === "mechanical"}
                result={schedule.mechanical_result}
                onPress={() => setActiveTab("mechanical")}
              />
            </View>

            <View style={styles.tabPanel}>
              {activeTab === "body" ? renderBodyColumn() : renderMechanicalColumn()}
            </View>
          </MKCard>
        </ScrollView>
      ) : null}
    </ScreenLayout>
  );
};

function TabButton({
  label,
  emoji,
  active,
  result,
  onPress
}: {
  label: string;
  emoji: string;
  active: boolean;
  result?: string | null;
  onPress: () => void;
}) {
  const showResult = result && result !== "pending";
  return (
    <TouchableOpacity
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={styles.tabEmoji}>{emoji}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      {showResult ? (
        <MKBadge variant={getInspectionResultVariant(result!)}>
          {INSPECTION_RESULT_LABELS[result!] ?? result}
        </MKBadge>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl
  },
  inspectionsCard: {
    gap: spacing.md,
    padding: 0,
    overflow: "hidden"
  },
  inspectionsTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md
  },
  inspectionsDescription: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.md
  },
  tabRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background
  },
  tabButtonActive: {
    backgroundColor: colors.card,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary
  },
  tabEmoji: {
    fontSize: 18
  },
  tabLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center"
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontFamily: typography.button.fontFamily
  },
  tabPanel: {
    padding: spacing.md
  },
  columnContent: {
    gap: spacing.sm
  },
  emptyCard: {
    gap: spacing.sm,
    alignItems: "flex-start"
  },
  emptyTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textMuted
  },
  hint: {
    ...typography.bodySmall,
    color: colors.textMuted
  }
});
