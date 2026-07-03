import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKPageHeader } from "../../components/MKPageHeader";
import { MKCard } from "../../components/MKCard";
import { MKProjectGeneralInfo } from "../../components/MKProjectGeneralInfo";
import { MKProjectEventCalendar } from "../../components/MKProjectEventCalendar";
import { MKProjectTeamSection } from "../../components/MKProjectTeamSection";
import {
  MKProjectDetailTabBar,
  projectDetailTabBarHeight,
  type ProjectDetailTabKey
} from "../../components/MKProjectDetailTabBar";
import { MKProjectNotesSection } from "../../components/MKProjectNotesSection";
import { MKProjectFilesSection } from "../../components/MKProjectFilesSection";
import { MKProjectDocumentsSection } from "../../components/MKProjectDocumentsSection";
import { MKProjectPricingSection } from "../../components/MKProjectPricingSection";
import { MKProjectSafetySection } from "../../components/MKProjectSafetySection";
import { hasProjectFeatureRead, hasProjectFeatureWrite } from "../../lib/projectFeatures";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, toApiError } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import {
  getProjectDetail,
  getProjectFileCategories,
  getProjectFiles
} from "../../services/projects";
import { getProjectReports } from "../../services/reports";
import { getProjectEvents, type ProjectEvent } from "../../services/projectEvents";
import {
  extractScheduledWorkerIds,
  getProjectMembers,
  getProjectShifts,
  type ProjectMember
} from "../../services/projectTeam";
import { getProjectProposals, getProposal } from "../../services/proposals";
import { getEstimateItems, getProjectEstimates } from "../../services/estimates";
import {
  employeeDisplayName,
  fetchEmployees,
  type EmployeeListItem
} from "../../services/settings";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { RootStackParamList } from "../../navigation/types";
import type {
  ProjectDetail,
  ProjectFileCategory,
  ProjectFileItem,
  ProjectListItem
} from "../../types/projects";
import type { ProjectReport } from "../../services/reports";
import type { EstimateItem } from "../../services/estimates";
import type { Proposal } from "../../services/proposals";

type ProjectDetailRoute = RouteProp<RootStackParamList, "ProjectDetail">;
type ProjectDetailNav = NativeStackNavigationProp<
  RootStackParamList,
  "ProjectDetail"
>;
type DetailTabKey = ProjectDetailTabKey;

interface ReportCategory {
  id?: string;
  value?: string;
  label: string;
  meta?: {
    group?: string;
  };
}

interface ProposalDetailSummary {
  latestProposal: Proposal | null;
  latestProposalDetail: any | null;
  estimateItems: EstimateItem[];
  estimateTotal: number;
}

const ALL_TABS: Array<{ key: DetailTabKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "overview", label: "Overview", icon: "grid-outline" },
  { key: "notes", label: "Notes / History", icon: "document-text-outline" },
  { key: "files", label: "Files", icon: "folder-open-outline" },
  { key: "documents", label: "Documents", icon: "reader-outline" },
  { key: "pricing", label: "Pricing", icon: "cash-outline" },
  { key: "safety", label: "Safety", icon: "shield-checkmark-outline" }
];

export const ProjectDetailScreen: React.FC = () => {
  const navigation = useNavigation<ProjectDetailNav>();
  const route = useRoute<ProjectDetailRoute>();
  const initialProject = route.params.project;
  const initialTabParam = route.params.initialTab;
  const { token, permissions, roles } = useAuth();
  const { openMenu } = useHubMenu();
  const insets = useSafeAreaInsets();
  const bottomTabHeight = projectDetailTabBarHeight(insets.bottom);

  const mapInitialTab = (
    tab?: RootStackParamList["ProjectDetail"]["initialTab"]
  ): DetailTabKey => {
    if (tab === "reports") return "notes";
    if (tab === "pricing") return "pricing";
    if (tab === "proposal") return "pricing";
    if (tab === "files") return "files";
    if (tab === "documents") return "documents";
    if (tab === "safety") return "safety";
    if (tab === "notes") return "notes";
    return "overview";
  };

  const [activeTab, setActiveTab] = useState<DetailTabKey>(
    mapInitialTab(initialTabParam)
  );
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [reportCategories, setReportCategories] = useState<ReportCategory[]>([]);

  const [files, setFiles] = useState<ProjectFileItem[]>([]);
  const [fileCategories, setFileCategories] = useState<ProjectFileCategory[]>([]);

  const [proposalData, setProposalData] = useState<ProposalDetailSummary | null>(null);
  const [loadingProposalData, setLoadingProposalData] = useState(false);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [projectEvents, setProjectEvents] = useState<ProjectEvent[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [scheduledWorkerIds, setScheduledWorkerIds] = useState<string[]>([]);
  const [loadingOverviewExtras, setLoadingOverviewExtras] = useState(true);

  const projectId = initialProject.id;

  const loadCoreData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingOverviewExtras(true);
      const [
        projectDetail,
        reportItems,
        fileItems,
        fileCats,
        events,
        members,
        shifts
      ] = await Promise.all([
        getProjectDetail(projectId),
        getProjectReports(projectId),
        getProjectFiles(projectId),
        getProjectFileCategories(),
        getProjectEvents(projectId).catch(() => []),
        getProjectMembers(projectId).catch(() => []),
        getProjectShifts(projectId).catch(() => [])
      ]);
      setProject(projectDetail);
      setReports(reportItems);
      setFiles(fileItems);
      setFileCategories(fileCats);
      setProjectEvents(events);
      setProjectMembers(members);
      setScheduledWorkerIds(extractScheduledWorkerIds(shifts));
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load project", apiError.message);
    } finally {
      setLoading(false);
      setLoadingOverviewExtras(false);
    }
  }, [projectId]);

  const loadSettingsData = useCallback(async () => {
    try {
      const [settingsResponse, employeesData] = await Promise.all([
        api.get<{ report_categories?: ReportCategory[] }>("/settings"),
        fetchEmployees()
      ]);
      setReportCategories(settingsResponse.data?.report_categories || []);
      setEmployees(employeesData);
    } catch (err) {
      console.warn("[ProjectDetailScreen] Could not load settings", err);
    }
  }, []);

  const loadProposalData = useCallback(async () => {
    try {
      setLoadingProposalData(true);
      const proposals = await getProjectProposals(projectId);
      const latestProposal = proposals[0] ?? null;
      const [latestProposalDetail, estimates] = await Promise.all([
        latestProposal ? getProposal(latestProposal.id) : Promise.resolve(null),
        getProjectEstimates(projectId)
      ]);
      const firstEstimate = estimates[0];
      const estimateItems = firstEstimate ? await getEstimateItems(firstEstimate.id) : [];
      const estimateTotal = estimateItems.reduce((sum, item) => sum + (item.total || 0), 0);

      setProposalData({
        latestProposal,
        latestProposalDetail,
        estimateItems,
        estimateTotal
      });
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load proposal data", apiError.message);
    } finally {
      setLoadingProposalData(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadCoreData();
    loadSettingsData();
  }, [loadCoreData, loadSettingsData]);

  useEffect(() => {
    if (activeTab === "pricing") {
      if (proposalData === null && !loadingProposalData) {
        loadProposalData();
      }
    }
  }, [activeTab, proposalData, loadingProposalData, loadProposalData]);

  const displayedProject = project ?? initialProject;
  const isBidding = displayedProject.is_bidding === true;
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);

  const visibleTabs = useMemo(() => {
    return ALL_TABS.filter((tab) => {
      if (tab.key === "safety" && isBidding) return false;
      if (tab.key === "documents" && !hasProjectFeatureRead(permissionsSet, roles, "documents")) {
        return false;
      }
      if (tab.key === "safety" && !hasProjectFeatureRead(permissionsSet, roles, "safety")) {
        return false;
      }
      return true;
    });
  }, [isBidding, permissionsSet, roles]);

  const canWriteSafety = hasProjectFeatureWrite(permissionsSet, roles, "safety");

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(visibleTabs[0]?.key ?? "overview");
    }
  }, [visibleTabs, activeTab]);

  const employeeLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) {
      map.set(String(emp.id), employeeDisplayName(emp));
    }
    return map;
  }, [employees]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <View style={styles.tabContent}>
            <MKProjectEventCalendar
              events={projectEvents}
              loading={loadingOverviewExtras}
            />

            <MKProjectTeamSection
              members={projectMembers}
              scheduledWorkerIds={scheduledWorkerIds}
              employeeLookup={employeeLookup}
              loading={loadingOverviewExtras}
            />

            {project?.description ? (
              <MKCard style={styles.sectionCard} elevated={true}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.bodyText}>{project.description}</Text>
              </MKCard>
            ) : null}
          </View>
        );
      case "notes":
        return (
          <View style={styles.tabContent}>
            <MKProjectNotesSection
              projectId={projectId}
              reports={reports}
              reportCategories={reportCategories}
              isBidding={displayedProject.is_bidding === true}
              businessLine={displayedProject.business_line}
              employeeLookup={employeeLookup}
              token={token}
              permissions={permissions}
              roles={roles}
              onRefresh={loadCoreData}
            />
          </View>
        );
      case "files":
        return (
          <View style={styles.tabContent}>
            <MKProjectFilesSection
              projectId={projectId}
              files={files}
              fileCategories={fileCategories}
              token={token}
              onRefresh={loadCoreData}
            />
          </View>
        );
      case "documents":
        return (
          <View style={styles.tabContent}>
            <MKProjectDocumentsSection projectId={projectId} />
          </View>
        );
      case "pricing":
        return (
          <View style={styles.tabContent}>
            <MKProjectPricingSection
              loading={loadingProposalData}
              proposalDetail={proposalData?.latestProposalDetail ?? null}
            />
          </View>
        );
      case "safety":
        return (
          <View style={styles.tabContent}>
            <MKProjectSafetySection projectId={projectId} canWrite={canWriteSafety} />
          </View>
        );
      default:
        return null;
    }
  };

  if (loading && project === null) {
    return (
      <ScreenLayout title="Project" scroll={false}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading project detail...</Text>
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
      >
        <MKPageHeader
          title={displayedProject.is_bidding ? "Opportunity" : "Project"}
          subtitle={displayedProject.code || undefined}
          onBack={() => navigation.goBack()}
          onMenu={openMenu}
        />

        <MKProjectGeneralInfo
          project={displayedProject}
          detail={project}
          token={token}
          employeeLookup={employeeLookup}
          variant={activeTab === "overview" ? "full" : "compact"}
        />

        {renderTabContent()}
      </ScrollView>

      <MKProjectDetailTabBar
        tabs={visibleTabs}
        activeKey={activeTab}
        onChange={setActiveTab}
        style={styles.bottomTabBar}
      />

    </ScreenLayout>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoRowLabel}>{label}</Text>
    <Text style={styles.infoRowValue}>{value}</Text>
  </View>
);

const formatDate = (value?: string | null): string => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
};

const formatCurrency = (value?: number | null): string => {
  if (value === undefined || value === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
};

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingBottom: 0
  },
  bottomTabBar: {
    marginHorizontal: -spacing.xl
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1
  },
  backButton: {
    marginBottom: spacing.md
  },
  backButtonText: {
    ...typography.body,
    color: colors.primary
  },
  tabContent: {
    gap: spacing.md
  },
  sectionCard: {
    marginBottom: spacing.md
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.md
  },
  sectionTitle: {
    ...typography.subtitle,
    marginBottom: spacing.xs
  },
  sectionSubtitle: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  smallAction: {
    minWidth: 110
  },
  infoRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  infoRowLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  infoRowValue: {
    ...typography.body
  },
  bodyText: {
    ...typography.body
  },
  timelineItem: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  timelineMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 8
  },
  timelineBody: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md
  },
  timelineTitle: {
    ...typography.subtitle,
    marginBottom: spacing.xs
  },
  timelineMeta: {
    ...typography.caption,
    marginBottom: spacing.xs
  },
  timelineText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  emptySectionText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  categoryScrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterChipText: {
    ...typography.bodySmall
  },
  filterChipTextActive: {
    color: colors.card
  },
  uploadActionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md
  },
  actionButton: {
    flex: 1
  },
  fullWidthButton: {
    marginTop: spacing.md
  },
  uploadQueue: {
    marginTop: spacing.md,
    gap: spacing.sm
  },
  uploadDraftRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  uploadDraftInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm
  },
  uploadDraftName: {
    ...typography.bodySmall,
    flex: 1
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  fileThumb: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    marginRight: spacing.md
  },
  fileThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md
  },
  fileMeta: {
    flex: 1,
    marginRight: spacing.sm
  },
  fileName: {
    ...typography.bodySmall,
    marginBottom: spacing.xs
  },
  fileCategory: {
    ...typography.caption
  },
  fileDate: {
    ...typography.caption,
    textAlign: "right"
  },
  pricingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  pricingItemLabel: {
    ...typography.bodySmall,
    flex: 1,
    marginRight: spacing.sm
  },
  pricingItemValue: {
    ...typography.bodySmall,
    color: colors.primary
  },
  loadingInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  loadingInlineText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md
  },
  modalTitle: {
    ...typography.titleSmall
  },
  modalClose: {
    ...typography.body,
    color: colors.primary
  },
  modalBody: {
    flex: 1,
    paddingHorizontal: spacing.xl
  },
  modalCategoryScroll: {
    marginBottom: spacing.lg
  },
  inputLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    marginBottom: spacing.lg
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top"
  }
});
