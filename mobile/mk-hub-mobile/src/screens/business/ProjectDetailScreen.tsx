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
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { api, toApiError } from "../../services/api";
import {
  getProjectDetail,
  getProjectFileCategories,
  getProjectFiles,
  uploadProjectFile
} from "../../services/projects";
import { getProjectReports, createProjectReport } from "../../services/reports";
import { getProjectAuditLogs } from "../../services/audit";
import { getProjectProposals, getProposal } from "../../services/proposals";
import { getEstimateItems, getProjectEstimates } from "../../services/estimates";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { HomeStackParamList } from "../../navigation/tabs/AppTabs";
import type {
  ProjectAuditLogEntry,
  ProjectDetail,
  ProjectFileCategory,
  ProjectFileItem,
  ProjectListItem
} from "../../types/projects";
import type { CreateReportPayload, ProjectReport } from "../../services/reports";
import type { EstimateItem } from "../../services/estimates";
import type { Proposal } from "../../services/proposals";

type ProjectDetailRoute = RouteProp<HomeStackParamList, "ProjectDetail">;
type ProjectDetailNav = NativeStackNavigationProp<HomeStackParamList, "ProjectDetail">;
type DetailTabKey = "overview" | "notes" | "files" | "proposal";

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

  const [activeTab, setActiveTab] = useState<DetailTabKey>("overview");
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [reportCategories, setReportCategories] = useState<ReportCategory[]>([]);
  const [auditLogs, setAuditLogs] = useState<ProjectAuditLogEntry[]>([]);

  const [files, setFiles] = useState<ProjectFileItem[]>([]);
  const [fileCategories, setFileCategories] = useState<ProjectFileCategory[]>([]);
  const [selectedFileCategory, setSelectedFileCategory] = useState<string>("all");
  const [uploadCategory, setUploadCategory] = useState<string>("pictures");
  const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const [proposalData, setProposalData] = useState<ProposalDetailSummary | null>(null);
  const [loadingProposalData, setLoadingProposalData] = useState(false);

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteDescription, setNoteDescription] = useState("");
  const [noteCategory, setNoteCategory] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);

  const projectId = initialProject.id;

  const loadCoreData = useCallback(async () => {
    try {
      setLoading(true);
      const [projectDetail, reportItems, fileItems, logItems, fileCats] =
        await Promise.all([
          getProjectDetail(projectId),
          getProjectReports(projectId),
          getProjectFiles(projectId),
          getProjectAuditLogs(projectId, { limit: 8 }),
          getProjectFileCategories()
        ]);
      setProject(projectDetail);
      setReports(reportItems);
      setFiles(fileItems);
      setAuditLogs(logItems);
      setFileCategories(fileCats);
      if (fileCats.length > 0 && !fileCats.some((item) => item.id === uploadCategory)) {
        setUploadCategory(fileCats[0].id);
      }
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load project", apiError.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, uploadCategory]);

  const loadSettingsData = useCallback(async () => {
    try {
      const response = await api.get<{ report_categories?: ReportCategory[] }>("/settings");
      setReportCategories(response.data?.report_categories || []);
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

  const authHeader = useMemo(() => {
    const value = api.defaults.headers.common.Authorization;
    return typeof value === "string" ? value : undefined;
  }, []);

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
            <MKCard style={styles.sectionCard} elevated={true}>
              <Text style={styles.sectionTitle}>Project snapshot</Text>
              <View style={styles.statsGrid}>
                <InfoPill
                  label="Type"
                  value={displayedProject.is_bidding ? "Opportunity" : "Project"}
                />
                <InfoPill label="Status" value={displayedProject.status_label || "Unknown"} />
                <InfoPill label="Client" value={displayedProject.client_display_name || "-"} />
                <InfoPill label="Progress" value={formatPercent(displayedProject.progress)} />
              </View>
            </MKCard>

            <MKCard style={styles.sectionCard} elevated={true}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <InfoRow label="Code" value={displayedProject.code || "-"} />
              <InfoRow label="Site" value={project?.site_name || "-"} />
              <InfoRow label="Contact" value={project?.contact_name || "-"} />
              <InfoRow label="End Date" value={formatDate(project?.date_eta)} />
              <InfoRow label="Start date" value={formatDate(displayedProject.date_start)} />
              <InfoRow label="End date" value={formatDate(displayedProject.date_end)} />
              <InfoRow label="Address" value={buildAddress(project)} />
            </MKCard>

            <MKCard style={styles.sectionCard} elevated={true}>
              <Text style={styles.sectionTitle}>Commercial summary</Text>
              <InfoRow label="Service value" value={formatCurrency(project?.service_value)} />
              <InfoRow label="Estimated cost" value={formatCurrency(project?.cost_estimated)} />
              <InfoRow label="Actual cost" value={formatCurrency(project?.cost_actual)} />
              <InfoRow label="Lead source" value={project?.lead_source || "-"} />
            </MKCard>

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

            <MKCard style={styles.sectionCard} elevated={true}>
              <Text style={styles.sectionTitle}>Recent activity</Text>
              {auditLogs.length === 0 ? (
                <Text style={styles.emptySectionText}>No recent activity.</Text>
              ) : (
                auditLogs.map((item) => (
                  <View key={item.id} style={styles.activityItem}>
                    <Text style={styles.activityTitle}>
                      {item.actor_name || "Someone"} {formatAction(item.action)} {item.entity_type || "item"}
                    </Text>
                    <Text style={styles.activityMeta}>{formatDate(item.timestamp)}</Text>
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
    <ScreenLayout scroll={false}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back to Sales</Text>
        </TouchableOpacity>

        <MKCard style={styles.heroCard} elevated={true}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroTitle}>{displayedProject.name}</Text>
              <Text style={styles.heroCode}>{displayedProject.code || "No code"}</Text>
            </View>
            <View style={styles.heroBadges}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>
                  {displayedProject.is_bidding ? "Opportunity" : "Project"}
                </Text>
              </View>
              {displayedProject.status_label ? (
                <View style={styles.heroStatusBadge}>
                  <Text style={styles.heroStatusText}>{displayedProject.status_label}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={styles.heroSubtitle}>
            {displayedProject.client_display_name || "No client linked"}
          </Text>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(6, Math.min(displayedProject.progress || 0, 100))}%` }
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            Progress {formatPercent(displayedProject.progress)}
          </Text>

          <View style={styles.heroMetaGrid}>
            <InfoPill label="Site" value={project?.site_name || "-"} />
            <InfoPill label="Contact" value={project?.contact_name || "-"} />
            <InfoPill label="Start" value={formatDate(displayedProject.date_start)} />
            <InfoPill label="End Date" value={formatDate(project?.date_eta)} />
          </View>
        </MKCard>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
          style={styles.tabsScroll}
        >
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={activeTab === tab.key ? colors.card : colors.textMuted}
              />
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === tab.key && styles.tabButtonTextActive
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {renderTabContent()}
      </ScrollView>

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

const InfoPill: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoPill}>
    <Text style={styles.infoPillLabel}>{label}</Text>
    <Text style={styles.infoPillValue} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoRowLabel}>{label}</Text>
    <Text style={styles.infoRowValue}>{value}</Text>
  </View>
);

const buildAddress = (project: ProjectDetail | null): string => {
  if (!project) {
    return "-";
  }

  const parts = [
    project.site_address_line1 || project.address,
    project.site_city || project.address_city,
    project.site_province || project.address_province,
    project.site_country || project.address_country,
    project.site_postal_code || project.address_postal_code
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : "-";
};

const formatDate = (value?: string | null): string => {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
};

const formatPercent = (value?: number | null): string => {
  if (value === undefined || value === null) {
    return "-";
  }
  return `${Math.round(value)}%`;
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

const formatAction = (value?: string | null): string => {
  if (!value) {
    return "updated";
  }
  return value.toLowerCase().replaceAll("_", " ");
};

const buildFileSource = (file: ProjectFileItem, authHeader?: string) => ({
  uri: `${api.defaults.baseURL}/files/${file.file_object_id}/${file.is_image ? "thumbnail" : "download"}`,
  headers: authHeader ? { Authorization: authHeader } : undefined
});

const styles = StyleSheet.create({
  scrollView: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: spacing.xxl
  },
  backButton: {
    marginBottom: spacing.md
  },
  backButtonText: {
    ...typography.body,
    color: colors.primary
  },
  heroCard: {
    marginBottom: spacing.lg
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.sm
  },
  heroTitleWrap: {
    flex: 1,
    marginRight: spacing.md
  },
  heroTitle: {
    ...typography.title,
    marginBottom: spacing.xs
  },
  heroCode: {
    ...typography.caption
  },
  heroBadges: {
    alignItems: "flex-end",
    gap: spacing.sm
  },
  heroBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border
  },
  heroBadgeText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  heroStatusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.primary
  },
  heroStatusText: {
    ...typography.caption,
    color: colors.card
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.xl,
    backgroundColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.xs
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.xl,
    backgroundColor: colors.primary
  },
  progressLabel: {
    ...typography.caption,
    marginBottom: spacing.md
  },
  heroMetaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  infoPill: {
    minWidth: "47%",
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border
  },
  infoPillLabel: {
    ...typography.caption,
    marginBottom: spacing.xs
  },
  infoPillValue: {
    ...typography.bodySmall
  },
  tabsScroll: {
    marginBottom: spacing.lg
  },
  tabsScrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  tabButtonText: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  tabButtonTextActive: {
    color: colors.card
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
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
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
  activityItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  activityTitle: {
    ...typography.bodySmall,
    marginBottom: spacing.xs
  },
  activityMeta: {
    ...typography.caption
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
