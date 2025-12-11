import React, { useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { getProjectReports, createProjectReport } from "../../services/reports";
import { uploadProjectFile } from "../../services/projects";
import { api } from "../../services/api";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";
import type { ProjectReport, CreateReportPayload } from "../../services/reports";

interface ProjectReportsScreenProps {
  project: ProjectListItem;
  onBack: () => void;
}

interface SelectedMedia {
  uri: string;
  name: string;
  type: string;
  uploading?: boolean;
  uploaded?: boolean;
  fileObjectId?: string;
}

export const ProjectReportsScreen: React.FC<ProjectReportsScreenProps> = ({
  project,
  onBack
}) => {
  const insets = useSafeAreaInsets();
  const [reports, setReports] = useState<ProjectReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  
  // Report form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [media, setMedia] = useState<SelectedMedia[]>([]);
  const [reportCategories, setReportCategories] = useState<any[]>([]);

  useEffect(() => {
    loadReports();
    loadReportCategories();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await getProjectReports(project.id);
      setReports(data);
    } catch (err) {
      console.error("[ProjectReports] Error:", err);
      const apiError = toApiError(err);
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const loadReportCategories = async () => {
    try {
      const response = await api.get<any>("/settings");
      const categories = response.data?.report_categories || [];
      setReportCategories(categories);
    } catch (err) {
      console.error("[ProjectReports] Error loading categories:", err);
    }
  };

  // Resize image if too large (max 1920px on longest side)
  const resizeImageIfNeeded = async (uri: string): Promise<string> => {
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1920 } }], // Resize to max 1920px width, maintaining aspect ratio
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      return manipResult.uri;
    } catch (err) {
      console.warn("Failed to resize image, using original:", err);
      return uri; // Return original if resize fails
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1 // Use full quality, we'll compress during resize
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const resizedUri = await resizeImageIfNeeded(asset.uri);
      const newMedia: SelectedMedia = {
        uri: resizedUri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        type: "image/jpeg"
      };
      setMedia([...media, newMedia]);
    }
  };

  const handlePickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Gallery permission is required to select photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1 // Use full quality, we'll compress during resize
    });

    if (!result.canceled && result.assets) {
      const newMedia: SelectedMedia[] = [];
      for (const asset of result.assets) {
        const resizedUri = await resizeImageIfNeeded(asset.uri);
        newMedia.push({
          uri: resizedUri,
          name: asset.fileName ?? `photo_${Date.now()}.jpg`,
          type: "image/jpeg"
        });
      }
      setMedia([...media, ...newMedia]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia(media.filter((_, i) => i !== index));
  };

  const uploadMediaItem = async (item: SelectedMedia, index: number): Promise<string | null> => {
    const updated = [...media];
    updated[index] = { ...item, uploading: true };
    setMedia(updated);

    try {
      // Upload file using upload-proxy endpoint
      const form = new FormData();
      form.append("file", {
        uri: item.uri,
        name: item.name,
        type: item.type
      } as any);
      form.append("original_name", item.name);
      form.append("content_type", item.type);
      form.append("project_id", project.id);
      form.append("client_id", project.client_id || "");
      form.append("employee_id", "");
      form.append("category_id", "report"); // Changed from "project-report" to "report"

      const uploadResp = await api.post<{ id: string; key: string }>(
        "/files/upload-proxy",
        form,
        {
          headers: {
            "Content-Type": "multipart/form-data"
          }
        }
      );

      const fileObjectId = uploadResp.data.id;
      
      // Attach file to project (this also creates ClientFile with category "report")
      // The endpoint expects query parameters
      await api.post(`/projects/${project.id}/files?file_object_id=${fileObjectId}&category=report&original_name=${encodeURIComponent(item.name)}`);

      updated[index] = { ...item, uploading: false, uploaded: true, fileObjectId };
      setMedia(updated);
      return fileObjectId;
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Upload failed", apiError.message);
      updated[index] = { ...item, uploading: false };
      setMedia(updated);
      return null;
    }
  };

  const handleCreateReport = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Error", "Please enter a description");
      return;
    }

    try {
      setCreating(true);

      // Upload all media first
      const attachments: Array<{
        file_object_id: string;
        original_name: string;
        content_type: string;
      }> = [];

      for (let i = 0; i < media.length; i++) {
        let fileObjectId = media[i].fileObjectId;
        if (!fileObjectId && !media[i].uploaded) {
          fileObjectId = await uploadMediaItem(media[i], i) || undefined;
        }
        if (fileObjectId) {
          attachments.push({
            file_object_id: fileObjectId,
            original_name: media[i].name,
            content_type: media[i].type
          });
        }
      }

      const payload: CreateReportPayload = {
        title: title.trim(),
        description: description.trim(),
        category_id: category || undefined,
        images: attachments.length > 0 ? { attachments } : undefined
      };

      await createProjectReport(project.id, payload);
      
      Alert.alert("Success", "Report created successfully");
      setShowCreateModal(false);
      setTitle("");
      setDescription("");
      setCategory("");
      setMedia([]);
      loadReports();
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Error", apiError.message);
    } finally {
      setCreating(false);
    }
  };

  // Filter categories based on project type
  const isBidding = project.is_bidding === true;
  const commercialCategories = reportCategories.filter(
    (cat) => cat.meta?.group === "commercial"
  );
  const productionCategories = reportCategories.filter(
    (cat) => cat.meta?.group === "production"
  );
  const availableCategories = isBidding ? commercialCategories : [...commercialCategories, ...productionCategories];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>{project.name}</Text>
      </View>

      <View style={styles.actionsBar}>
        <MKButton
          title="📋 Create Report"
          onPress={() => setShowCreateModal(true)}
          style={styles.createButton}
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {reports.map((report) => (
            <MKCard key={report.id} style={styles.reportCard} elevated={true}>
              <Text style={styles.reportTitle}>{report.title || "Report"}</Text>
              {report.category_id && (
                <Text style={styles.reportCategory}>
                  {reportCategories.find((c) => c.value === report.category_id)?.label || report.category_id}
                </Text>
              )}
              {report.description && (
                <Text style={styles.reportDescription} numberOfLines={3}>
                  {report.description}
                </Text>
              )}
              {report.created_at && (
                <Text style={styles.reportDate}>
                  {new Date(report.created_at).toLocaleDateString()}
                </Text>
              )}
            </MKCard>
          ))}
          {reports.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No reports found</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Create Report Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlayTouchable}
            activeOpacity={1}
            onPress={() => setShowCreateModal(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Report</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.modalScroll} 
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
            >
              <View style={styles.formGroup}>
                <Text style={styles.label}>Title *</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Enter report title..."
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                >
                  <TouchableOpacity
                    style={[styles.categoryButton, !category && styles.categoryButtonActive]}
                    onPress={() => setCategory("")}
                  >
                    <Text
                      style={[
                        styles.categoryButtonText,
                        !category && styles.categoryButtonTextActive
                      ]}
                    >
                      None
                    </Text>
                  </TouchableOpacity>
                  {availableCategories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id || cat.value}
                      style={[
                        styles.categoryButton,
                        category === (cat.value || cat.label) && styles.categoryButtonActive
                      ]}
                      onPress={() => setCategory(cat.value || cat.label)}
                    >
                      <Text
                        style={[
                          styles.categoryButtonText,
                          category === (cat.value || cat.label) && styles.categoryButtonTextActive
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe what happened, how the day went, or any events on site..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={6}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Images (optional - multiple allowed)</Text>
                <View style={styles.mediaButtons}>
                  <MKButton
                    title="📷 Take Photo"
                    onPress={handleTakePhoto}
                    variant="secondary"
                    style={styles.mediaButton}
                  />
                  <MKButton
                    title="🖼️ Choose from Gallery"
                    onPress={handlePickFromGallery}
                    variant="secondary"
                    style={styles.mediaButton}
                  />
                </View>
                {media.length > 0 && (
                  <View style={styles.mediaGrid}>
                    {media.map((item, index) => (
                      <View key={index} style={styles.mediaItem}>
                        <Image source={{ uri: item.uri }} style={styles.mediaImage} />
                        {item.uploaded ? (
                          <Text style={styles.uploadedText}>✓ Uploaded</Text>
                        ) : item.uploading ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <MKButton
                            title="Upload"
                            onPress={() => uploadMediaItem(item, index)}
                            style={styles.uploadButton}
                          />
                        )}
                        <TouchableOpacity
                          onPress={() => removeMedia(index)}
                          style={styles.removeButton}
                        >
                          <Text style={styles.removeButtonText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <MKButton
                title="Cancel"
                onPress={() => setShowCreateModal(false)}
                variant="secondary"
                style={styles.modalButton}
              />
              <MKButton
                title={creating ? "Creating..." : "Create Report"}
                onPress={handleCreateReport}
                loading={creating}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backButton: {
    marginBottom: spacing.sm
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted
  },
  actionsBar: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  createButton: {
    width: "100%"
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md
  },
  reportCard: {
    padding: spacing.md
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  reportCategory: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600",
    marginBottom: spacing.xs
  },
  reportDescription: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  reportDate: {
    fontSize: 12,
    color: colors.textMuted
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: "center"
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  modalOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)"
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "85%",
    flexDirection: "column"
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary
  },
  modalClose: {
    fontSize: 24,
    color: colors.textMuted
  },
  modalScroll: {
    flex: 1
  },
  modalScrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl
  },
  formGroup: {
    marginBottom: spacing.lg
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.sm
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.card
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top"
  },
  categoryScroll: {
    maxHeight: 50
  },
  categoryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginRight: spacing.sm
  },
  categoryButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  categoryButtonText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: "600"
  },
  categoryButtonTextActive: {
    color: "white"
  },
  mediaButtons: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md
  },
  mediaButton: {
    flex: 1
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  mediaItem: {
    width: "48%"
  },
  mediaImage: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    marginBottom: spacing.sm
  },
  uploadButton: {
    paddingVertical: spacing.xs
  },
  uploadedText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center"
  },
  removeButton: {
    paddingVertical: spacing.xs
  },
  removeButtonText: {
    color: colors.error,
    fontSize: 12,
    textAlign: "center"
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card
  },
  modalButton: {
    flex: 1
  }
});

