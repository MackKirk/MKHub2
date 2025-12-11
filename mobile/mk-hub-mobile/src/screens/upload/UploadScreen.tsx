import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { searchProjects, uploadProjectFile } from "../../services/projects";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";

type Category = "pictures" | "drawings" | "reports" | "other";

const CATEGORY_OPTIONS: { id: Category; label: string }[] = [
  { id: "pictures", label: "Pictures" },
  { id: "drawings", label: "Drawings" },
  { id: "reports", label: "Reports" },
  { id: "other", label: "Other" }
];

interface SelectedMedia {
  uri: string;
  name: string;
  type: string;
  uploading?: boolean;
  uploaded?: boolean;
}

type Step = "project" | "category" | "capture";

export const UploadScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("project");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectResults, setProjectResults] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);
  const [category, setCategory] = useState<Category>("pictures");
  const [media, setMedia] = useState<SelectedMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async (query?: string) => {
    try {
      setLoadingProjects(true);
      const results = await searchProjects(query || "");
      setProjectResults(results);
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load projects", apiError.message);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  // Load projects automatically when step is "project"
  useEffect(() => {
    if (step === "project" && projectResults.length === 0 && !loadingProjects) {
      loadProjects();
    }
  }, [step, loadProjects]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleSearchProjects = useCallback(async () => {
    await loadProjects(projectQuery.trim() || undefined);
  }, [projectQuery, loadProjects]);

  const handleSelectProject = (project: ProjectListItem) => {
    setSelectedProject(project);
    setProjectQuery(project.name);
    setStep("category");
  };

  const handleSelectCategory = (cat: Category) => {
    setCategory(cat);
    setStep("capture");
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8
    });
    if (!result.canceled) {
      const newMedia: SelectedMedia[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        type: "image/jpeg"
      }));
      setMedia([...media, ...newMedia]);
    }
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const newMedia: SelectedMedia = {
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        type: "image/jpeg"
      };
      setMedia([...media, newMedia]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia(media.filter((_, i) => i !== index));
  };

  const uploadMedia = async (item: SelectedMedia, index: number) => {
    if (!selectedProject) return;

    // Mark as uploading
    const updated = [...media];
    updated[index] = { ...item, uploading: true };
    setMedia(updated);

    try {
      await uploadProjectFile({
        projectId: selectedProject.id,
        category,
        description: "",
        file: item
      });

      // Mark as uploaded
      updated[index] = { ...item, uploading: false, uploaded: true };
      setMedia(updated);
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Upload failed", apiError.message);
      updated[index] = { ...item, uploading: false };
      setMedia(updated);
    }
  };

  const uploadAll = async () => {
    if (!selectedProject) return;
    if (media.length === 0) {
      Alert.alert("No photos", "Please take or select at least one photo.");
      return;
    }

    setUploading(true);
    try {
      for (let i = 0; i < media.length; i++) {
        if (!media[i].uploaded) {
          await uploadMedia(media[i], i);
        }
      }
      Alert.alert("Success", "All photos uploaded successfully!");
      // Reset
      setMedia([]);
      setStep("project");
      setSelectedProject(null);
      setProjectQuery("");
    } catch (err) {
      // Error already handled in uploadMedia
    } finally {
      setUploading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case "project":
        return (
          <View>
            <Text style={styles.stepTitle}>Step 1: Select Project</Text>
            <Text style={styles.stepSubtitle}>Search and select the project</Text>

            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={projectQuery}
                onChangeText={(text) => {
                  setProjectQuery(text);
                  // Clear existing timeout
                  if (searchTimeoutRef.current) {
                    clearTimeout(searchTimeoutRef.current);
                  }
                  // Auto-search as user types (debounced)
                  if (text.trim()) {
                    searchTimeoutRef.current = setTimeout(() => {
                      loadProjects(text.trim());
                    }, 500);
                  } else {
                    loadProjects();
                  }
                }}
                placeholder="Search by name or code"
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={handleSearchProjects}
              />
              <MKButton
                title="Search"
                onPress={handleSearchProjects}
                style={styles.searchButton}
                loading={loadingProjects}
              />
            </View>

            {loadingProjects && projectResults.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading projects...</Text>
              </View>
            ) : projectResults.length > 0 ? (
              <View style={styles.projectsGrid}>
                {projectResults.map((item) => (
                  <MKCard
                    key={item.id}
                    style={styles.projectCard}
                    onPress={() => handleSelectProject(item)}
                    elevated={true}
                  >
                    <View style={styles.projectCardHeader}>
                      <View style={styles.projectCardTitleSection}>
                        <Text style={styles.projectCardName} numberOfLines={2}>
                          {item.name}
                        </Text>
                        {item.code && (
                          <Text style={styles.projectCardCode}>{item.code}</Text>
                        )}
                      </View>
                      {item.status_label && (
                        <View style={styles.statusBadge}>
                          <Text style={styles.statusText}>{item.status_label}</Text>
                        </View>
                      )}
                    </View>

                    {item.progress !== undefined && item.progress !== null && (
                      <View style={styles.progressSection}>
                        <View style={styles.progressBar}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${Math.min(100, Math.max(0, item.progress))}%` }
                            ]}
                          />
                        </View>
                        <Text style={styles.progressText}>
                          {Math.round(item.progress)}%
                        </Text>
                      </View>
                    )}

                    <View style={styles.projectCardMeta}>
                      {item.date_start && (
                        <View style={styles.metaRow}>
                          <Text style={styles.metaLabel}>Start:</Text>
                          <Text style={styles.metaValue}>
                            {new Date(item.date_start).toLocaleDateString()}
                          </Text>
                        </View>
                      )}
                      {item.date_end && (
                        <View style={styles.metaRow}>
                          <Text style={styles.metaLabel}>End:</Text>
                          <Text style={styles.metaValue}>
                            {new Date(item.date_end).toLocaleDateString()}
                          </Text>
                        </View>
                      )}
                    </View>
                  </MKCard>
                ))}
              </View>
            ) : (
              <MKCard style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📁</Text>
                <Text style={styles.emptyText}>No projects found</Text>
                <Text style={styles.emptySubtext}>
                  Try a different search term or check your connection.
                </Text>
              </MKCard>
            )}

            {selectedProject && (
              <MKCard style={styles.selectedProject}>
                <Text style={styles.selectedLabel}>Selected:</Text>
                <Text style={styles.selectedName}>{selectedProject.name}</Text>
                {selectedProject.code && (
                  <Text style={styles.selectedCode}>{selectedProject.code}</Text>
                )}
                <MKButton
                  title="Continue"
                  onPress={() => setStep("category")}
                  style={styles.continueButton}
                />
              </MKCard>
            )}
          </View>
        );

      case "category":
        return (
          <View>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setStep("project");
                setSelectedProject(null);
                setProjectQuery("");
              }}
            >
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.stepTitle}>Step 2: Select Category</Text>
            <Text style={styles.stepSubtitle}>Choose the file category</Text>

            <View style={styles.categoryGrid}>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryCard,
                    category === cat.id && styles.categoryCardSelected
                  ]}
                  onPress={() => handleSelectCategory(cat.id)}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      category === cat.id && styles.categoryTextSelected
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <MKButton
              title="Continue to Capture"
              onPress={() => setStep("capture")}
              style={styles.continueButton}
            />
          </View>
        );

      case "capture":
        return (
          <View>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep("category")}
            >
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.stepTitle}>Step 3: Capture Photos</Text>
            <Text style={styles.stepSubtitle}>
              Take photos or select from gallery
            </Text>

            {selectedProject && (
              <MKCard style={styles.infoCard}>
                <Text style={styles.infoLabel}>Project:</Text>
                <Text style={styles.infoValue}>{selectedProject.name}</Text>
                <Text style={styles.infoLabel}>Category:</Text>
                <Text style={styles.infoValue}>
                  {CATEGORY_OPTIONS.find((c) => c.id === category)?.label}
                </Text>
              </MKCard>
            )}

            <View style={styles.captureButtons}>
              <MKButton
                title="📷 Take Photo"
                onPress={pickFromCamera}
                style={styles.captureButton}
              />
              <MKButton
                title="🖼️ Choose from Gallery"
                onPress={pickFromLibrary}
                variant="secondary"
                style={styles.captureButton}
              />
            </View>

            {media.length > 0 && (
              <View style={styles.mediaSection}>
                <Text style={styles.mediaTitle}>
                  Photos ({media.length}) - Tap to upload individually
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {media.map((item, index) => (
                    <View key={index} style={styles.mediaItem}>
                      <Image source={{ uri: item.uri }} style={styles.mediaImage} />
                      {item.uploading ? (
                        <View style={styles.mediaOverlay}>
                          <ActivityIndicator color="#ffffff" />
                          <Text style={styles.mediaStatus}>Uploading...</Text>
                        </View>
                      ) : item.uploaded ? (
                        <View style={[styles.mediaOverlay, styles.mediaOverlaySuccess]}>
                          <Text style={styles.mediaStatus}>✓ Uploaded</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.mediaOverlay}
                          onPress={() => uploadMedia(item, index)}
                        >
                          <Text style={styles.mediaStatus}>Tap to upload</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => removeMedia(index)}
                      >
                        <Text style={styles.removeText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>

                <MKButton
                  title={
                    uploading
                      ? "Uploading..."
                      : `Upload All (${media.filter((m) => !m.uploaded).length} remaining)`
                  }
                  onPress={uploadAll}
                  loading={uploading}
                  disabled={uploading || media.every((m) => m.uploaded)}
                  style={styles.uploadAllButton}
                />
              </View>
            )}
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Upload to Project</Text>
        {renderStep()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollView: {
    flex: 1
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.xl,
    letterSpacing: 0.5
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  stepSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.lg
  },
  backButton: {
    marginBottom: spacing.md
  },
  backText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600"
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.card
  },
  flex: {
    flex: 1,
    marginRight: spacing.sm
  },
  searchButton: {
    minWidth: 80
  },
  projectsGrid: {
    marginTop: spacing.md,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  projectCard: {
    width: "100%",
    marginBottom: spacing.md
  },
  projectCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md
  },
  projectCardTitleSection: {
    flex: 1,
    marginRight: spacing.sm
  },
  projectCardName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  projectCardCode: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "500"
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignSelf: "flex-start"
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase"
  },
  progressSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: "hidden",
    marginRight: spacing.sm
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 3
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
    minWidth: 40,
    textAlign: "right"
  },
  projectCardMeta: {
    marginTop: spacing.xs
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: spacing.xs
  },
  metaLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginRight: spacing.xs,
    fontWeight: "500"
  },
  metaValue: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: "500"
  },
  selectedProject: {
    marginTop: spacing.md,
    backgroundColor: "#f0f7ff"
  },
  selectedLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    fontWeight: "600"
  },
  selectedName: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  selectedCode: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: spacing.lg
  },
  categoryCard: {
    width: "48%",
    marginRight: "2%",
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center"
  },
  categoryCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  categoryText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary
  },
  categoryTextSelected: {
    color: "#ffffff"
  },
  continueButton: {
    marginTop: spacing.md
  },
  infoCard: {
    marginBottom: spacing.lg,
    backgroundColor: "#f9fafb"
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    fontWeight: "600"
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.sm
  },
  captureButtons: {
    marginBottom: spacing.xl
  },
  captureButton: {
    marginBottom: spacing.md
  },
  mediaSection: {
    marginTop: spacing.lg
  },
  mediaTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.md
  },
  mediaItem: {
    width: 120,
    height: 120,
    marginRight: spacing.md,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative"
  },
  mediaImage: {
    width: "100%",
    height: "100%"
  },
  mediaOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: spacing.xs,
    alignItems: "center"
  },
  mediaOverlaySuccess: {
    backgroundColor: "rgba(20, 143, 60, 0.9)"
  },
  mediaStatus: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600"
  },
  removeButton: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(211, 47, 47, 0.9)",
    alignItems: "center",
    justifyContent: "center"
  },
  removeText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20
  },
  uploadAllButton: {
    marginTop: spacing.lg
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    marginTop: spacing.lg
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 14
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    marginTop: spacing.lg
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center"
  }
});

