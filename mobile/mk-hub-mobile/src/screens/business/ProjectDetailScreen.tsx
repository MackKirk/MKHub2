import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKPageHeader } from "../../components/MKPageHeader";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { MKProjectGeneralInfo } from "../../components/MKProjectGeneralInfo";
import { MKProjectEventCalendar } from "../../components/MKProjectEventCalendar";
import { MKProjectTeamSection } from "../../components/MKProjectTeamSection";
import {
  MKProjectDetailTabBar,
  projectDetailTabBarHeight,
  type ProjectDetailTabKey
} from "../../components/MKProjectDetailTabBar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, toApiError } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import {
  getProjectDetail,
  getProjectFileCategories,
  getProjectFiles,
  uploadProjectFile
} from "../../services/projects";
import { getProjectReports, createProjectReport } from "../../services/reports";
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
import type { CreateReportPayload, ProjectReport } from "../../services/reports";
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

interface UploadDraft {
  uri: string;
  name: string;
  type: string;
  uploading?: boolean;
  uploaded?: boolean;
}

interface ProposalDetailSummary {
  latestProposal: Proposal | null;
  latestProposalDetail: any | null;
  estimateItems: EstimateItem[];
  estimateTotal: number;
}

const TABS: Array<{ key: DetailTabKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: "overview", label: "Overview", icon: "grid-outline" },
  { key: "notes", label: "Notes / History", icon: "document-text-outline" },
  { key: "files", label: "Files", icon: "folder-open-outline" },
  { key: "proposal", label: "Proposal / Pricing", icon: "cash-outline" }
];

export const ProjectDetailScreen: React.FC = () => {
  const navigation = useNavigation<ProjectDetailNav>();
  const route = useRoute<ProjectDetailRoute>();
  const initialProject = route.params.project;
  const initialTabParam = route.params.initialTab;
  const { token } = useAuth();
  const { openMenu } = useHubMenu();
  const insets = useSafeAreaInsets();
  const bottomTabHeight = projectDetailTabBarHeight(insets.bottom);

  const mapInitialTab = (
    tab?: RootStackParamList["ProjectDetail"]["initialTab"]
  ): DetailTabKey => {
    if (tab === "reports") return "notes";
    if (tab === "pricing") return "proposal";
    if (tab === "files" || tab === "proposal" || tab === "notes") return tab;
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
  const [selectedFileCategory, setSelectedFileCategory] = useState<string>("all");
  const [uploadCategory, setUploadCategory] = useState<string>("pictures");
  const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const [proposalData, setProposalData] = useState<ProposalDetailSummary | null>(null);
  const [loadingProposalData, setLoadingProposalData] = useState(false);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [projectEvents, setProjectEvents] = useState<ProjectEvent[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [scheduledWorkerIds, setScheduledWorkerIds] = useState<string[]>([]);
  const [loadingOverviewExtras, setLoadingOverviewExtras] = useState(true);

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDescription, setNoteDescription] = useState("");
  const [noteCategory, setNoteCategory] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);

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
      if (fileCats.length > 0 && !fileCats.some((item) => item.id === uploadCategory)) {
        setUploadCategory(fileCats[0].id);
      }
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load project", apiError.message);
    } finally {
      setLoading(false);
      setLoadingOverviewExtras(false);
    }
  }, [projectId, uploadCategory]);

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
    if (activeTab === "proposal" && proposalData === null && !loadingProposalData) {
      loadProposalData();
    }
  }, [activeTab, proposalData, loadingProposalData, loadProposalData]);

  const displayedProject = project ?? initialProject;

  const employeeLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) {
      map.set(String(emp.id), employeeDisplayName(emp));
    }
    return map;
  }, [employees]);

  const filteredFiles = useMemo(() => {
    if (selectedFileCategory === "all") {
      return files;
    }
    return files.filter((file) => file.category === selectedFileCategory);
  }, [files, selectedFileCategory]);

  const availableReportCategories = useMemo(() => {
    if ((displayedProject?.is_bidding ?? false) === true) {
      return reportCategories.filter((item) => item.meta?.group === "commercial");
    }
    return reportCategories.filter(
      (item) => item.meta?.group === "commercial" || item.meta?.group === "production"
    );
  }, [displayedProject?.is_bidding, reportCategories]);

  const authHeader = useMemo(
    () => (token ? `Bearer ${token}` : undefined),
    [token]
  );

  const fileCategoryLookup = useMemo(() => {
    const base = new Map<string, string>();
    fileCategories.forEach((category) => {
      base.set(category.id, category.name);
    });
    return base;
  }, [fileCategories]);

  const reportCategoryLookup = useMemo(() => {
    const base = new Map<string, string>();
    availableReportCategories.forEach((category) => {
      const value = category.value || category.id || category.label;
      base.set(value, category.label);
    });
    return base;
  }, [availableReportCategories]);

  const openCreateNote = () => {
    setNoteTitle("");
    setNoteDescription("");
    setNoteCategory("");
    setShowNoteModal(true);
  };

  const handleCreateNote = async () => {
    if (!noteTitle.trim() || !noteDescription.trim()) {
      Alert.alert("Missing information", "Please enter a title and description.");
      return;
    }

    try {
      setCreatingNote(true);
      const payload: CreateReportPayload = {
        title: noteTitle.trim(),
        description: noteDescription.trim(),
        category_id: noteCategory || undefined
      };
      await createProjectReport(projectId, payload);
      setShowNoteModal(false);
      await loadCoreData();
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not create note", apiError.message);
    } finally {
      setCreatingNote(false);
    }
  };

  const addCameraPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setUploadDrafts((current) => [
        ...current,
        {
          uri: asset.uri,
          name: asset.fileName ?? `photo_${Date.now()}.jpg`,
          type: asset.mimeType || "image/jpeg"
        }
      ]);
    }
  };

  const addGalleryFiles = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8
    });

    if (!result.canceled) {
      setUploadDrafts((current) => [
        ...current,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? `photo_${Date.now()}.jpg`,
          type: asset.mimeType || "image/jpeg"
        }))
      ]);
    }
  };

  const addDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
      copyToCacheDirectory: true
    });

    if (!result.canceled) {
      setUploadDrafts((current) => [
        ...current,
        ...result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/octet-stream"
        }))
      ]);
    }
  };

  const removeDraft = (index: number) => {
    setUploadDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const uploadAllDrafts = async () => {
    if (uploadDrafts.length === 0) {
      Alert.alert("No files selected", "Add at least one file or photo.");
      return;
    }

    try {
      setUploadingFiles(true);
      for (let index = 0; index < uploadDrafts.length; index += 1) {
        setUploadDrafts((current) =>
          current.map((item, currentIndex) =>
            currentIndex === index ? { ...item, uploading: true } : item
          )
        );

        await uploadProjectFile({
          projectId,
          category: uploadCategory,
          description: "",
          file: uploadDrafts[index]
        });

        setUploadDrafts((current) =>
          current.map((item, currentIndex) =>
            currentIndex === index
              ? { ...item, uploading: false, uploaded: true }
              : item
          )
        );
      }

      setUploadDrafts([]);
      await loadCoreData();
      Alert.alert("Upload complete", "Files added to the project successfully.");
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Upload failed", apiError.message);
    } finally {
      setUploadingFiles(false);
    }
  };

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
            <MKCard style={styles.sectionCard} elevated={true}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Notes / History</Text>
                  <Text style={styles.sectionSubtitle}>
                    Commercial and production updates for this project.
                  </Text>
                </View>
                <MKButton title="Add Note" onPress={openCreateNote} style={styles.smallAction} />
              </View>

              {reports.length === 0 ? (
                <Text style={styles.emptySectionText}>No notes yet.</Text>
              ) : (
                reports.map((report) => (
                  <View key={report.id} style={styles.timelineItem}>
                    <View style={styles.timelineMarker} />
                    <View style={styles.timelineBody}>
                      <Text style={styles.timelineTitle}>{report.title || "Untitled note"}</Text>
                      <Text style={styles.timelineMeta}>
                        {report.category_id
                          ? reportCategoryLookup.get(report.category_id) || report.category_id
                          : "General"}
                        {" · "}
                        {formatDate(report.created_at)}
                      </Text>
                      {report.description ? (
                        <Text style={styles.timelineText}>{report.description}</Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </MKCard>
          </View>
        );
      case "files":
        return (
          <View style={styles.tabContent}>
            <MKCard style={styles.sectionCard} elevated={true}>
              <Text style={styles.sectionTitle}>Upload files and photos</Text>
              <Text style={styles.sectionSubtitle}>
                Stay in the project context while sending new site files.
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScrollContent}
              >
                {fileCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.filterChip,
                      uploadCategory === category.id && styles.filterChipActive
                    ]}
                    onPress={() => setUploadCategory(category.id)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        uploadCategory === category.id && styles.filterChipTextActive
                      ]}
                    >
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.uploadActionsRow}>
                <MKButton title="Take Photo" onPress={addCameraPhoto} style={styles.actionButton} />
                <MKButton
                  title="Gallery"
                  onPress={addGalleryFiles}
                  variant="secondary"
                  style={styles.actionButton}
                />
              </View>

              <MKButton
                title="Add File"
                onPress={addDocuments}
                variant="secondary"
                style={styles.fullWidthButton}
              />

              {uploadDrafts.length > 0 ? (
                <View style={styles.uploadQueue}>
                  {uploadDrafts.map((item, index) => (
                    <View key={`${item.name}-${index}`} style={styles.uploadDraftRow}>
                      <View style={styles.uploadDraftInfo}>
                        <Ionicons
                          name={item.type.startsWith("image/") ? "image-outline" : "document-outline"}
                          size={18}
                          color={colors.primary}
                        />
                        <Text numberOfLines={1} style={styles.uploadDraftName}>
                          {item.name}
                        </Text>
                      </View>
                      {item.uploading ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <TouchableOpacity onPress={() => removeDraft(index)}>
                          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                  <MKButton
                    title={uploadingFiles ? "Uploading..." : "Upload All"}
                    onPress={uploadAllDrafts}
                    loading={uploadingFiles}
                    disabled={uploadingFiles}
                    style={styles.fullWidthButton}
                  />
                </View>
              ) : null}
            </MKCard>

            <MKCard style={styles.sectionCard} elevated={true}>
              <Text style={styles.sectionTitle}>Project files</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScrollContent}
              >
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    selectedFileCategory === "all" && styles.filterChipActive
                  ]}
                  onPress={() => setSelectedFileCategory("all")}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedFileCategory === "all" && styles.filterChipTextActive
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {fileCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.filterChip,
                      selectedFileCategory === category.id && styles.filterChipActive
                    ]}
                    onPress={() => setSelectedFileCategory(category.id)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedFileCategory === category.id && styles.filterChipTextActive
                      ]}
                    >
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {filteredFiles.length === 0 ? (
                <Text style={styles.emptySectionText}>No files in this category.</Text>
              ) : (
                filteredFiles.map((file) => (
                  <View key={file.id} style={styles.fileRow}>
                    {file.is_image ? (
                      <Image
                        source={buildFileSource(file, authHeader)}
                        style={styles.fileThumb}
                      />
                    ) : (
                      <View style={styles.fileThumbPlaceholder}>
                        <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                      </View>
                    )}
                    <View style={styles.fileMeta}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {file.original_name || file.key || "Untitled file"}
                      </Text>
                      <Text style={styles.fileCategory}>
                        {(file.category && fileCategoryLookup.get(file.category)) || file.category || "Uncategorized"}
                      </Text>
                    </View>
                    <Text style={styles.fileDate}>{formatDate(file.uploaded_at)}</Text>
                  </View>
                ))
              )}
            </MKCard>
          </View>
        );
      case "proposal":
        return (
          <View style={styles.tabContent}>
            {loadingProposalData ? (
              <MKCard style={styles.sectionCard} elevated={true}>
                <View style={styles.loadingInline}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingInlineText}>Loading proposal and pricing...</Text>
                </View>
              </MKCard>
            ) : (
              <>
                <MKCard style={styles.sectionCard} elevated={true}>
                  <Text style={styles.sectionTitle}>Latest proposal</Text>
                  {proposalData?.latestProposal ? (
                    <>
                      <InfoRow
                        label="Title"
                        value={
                          proposalData.latestProposalDetail?.data?.cover_title ||
                          proposalData.latestProposal.title ||
                          "Proposal"
                        }
                      />
                      <InfoRow
                        label="Order"
                        value={proposalData.latestProposal.order_number || "-"}
                      />
                      <InfoRow
                        label="Created"
                        value={formatDate(proposalData.latestProposal.created_at)}
                      />
                    </>
                  ) : (
                    <Text style={styles.emptySectionText}>No proposal found.</Text>
                  )}
                </MKCard>

                <MKCard style={styles.sectionCard} elevated={true}>
                  <Text style={styles.sectionTitle}>Pricing summary</Text>
                  {proposalData && proposalData.estimateItems.length > 0 ? (
                    <>
                      <InfoRow
                        label="Estimate items"
                        value={String(proposalData.estimateItems.length)}
                      />
                      <InfoRow
                        label="Estimated total"
                        value={formatCurrency(proposalData.estimateTotal)}
                      />
                      {proposalData.estimateItems.slice(0, 3).map((item) => (
                        <View key={item.id} style={styles.pricingItem}>
                          <Text style={styles.pricingItemLabel}>
                            {item.description || "Item"}
                          </Text>
                          <Text style={styles.pricingItemValue}>
                            {formatCurrency(item.total)}
                          </Text>
                        </View>
                      ))}
                    </>
                  ) : (
                    <Text style={styles.emptySectionText}>No pricing data available.</Text>
                  )}
                </MKCard>
              </>
            )}
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
        tabs={TABS}
        activeKey={activeTab}
        onChange={setActiveTab}
        style={styles.bottomTabBar}
      />

      <Modal
        visible={showNoteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNoteModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add note / history</Text>
            <TouchableOpacity onPress={() => setShowNoteModal(false)}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={noteTitle}
              onChangeText={setNoteTitle}
              placeholder="Daily update, client call, site note..."
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScrollContent}
              style={styles.modalCategoryScroll}
            >
              <TouchableOpacity
                style={[styles.filterChip, !noteCategory && styles.filterChipActive]}
                onPress={() => setNoteCategory("")}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    !noteCategory && styles.filterChipTextActive
                  ]}
                >
                  General
                </Text>
              </TouchableOpacity>
              {availableReportCategories.map((category) => {
                const value = category.value || category.id || category.label;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.filterChip,
                      noteCategory === value && styles.filterChipActive
                    ]}
                    onPress={() => setNoteCategory(value)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        noteCategory === value && styles.filterChipTextActive
                      ]}
                    >
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={noteDescription}
              onChangeText={setNoteDescription}
              placeholder="Add the latest project context here..."
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={6}
            />

            <MKButton
              title={creatingNote ? "Saving..." : "Save Note"}
              onPress={handleCreateNote}
              loading={creatingNote}
              disabled={creatingNote}
              style={styles.fullWidthButton}
            />
          </ScrollView>
        </View>
      </Modal>
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

const buildFileSource = (file: ProjectFileItem, authHeader?: string) => {
  const path = file.is_image
    ? `/files/${file.file_object_id}/thumbnail?w=200`
    : `/files/${file.file_object_id}/download`;
  const u = new URL(path, api.defaults.baseURL);
  if (authHeader?.startsWith("Bearer ")) {
    const tok = authHeader.slice(7).trim();
    u.searchParams.set("access_token", tok);
  }
  return {
    uri: u.toString(),
    headers: authHeader ? { Authorization: authHeader } : undefined
  };
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
