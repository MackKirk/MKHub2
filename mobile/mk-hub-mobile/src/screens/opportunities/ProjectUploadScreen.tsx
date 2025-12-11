import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { uploadProjectFile } from "../../services/projects";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";

interface ProjectUploadScreenProps {
  project: ProjectListItem;
  onBack: () => void;
}

interface SelectedMedia {
  uri: string;
  name: string;
  type: string;
  uploading?: boolean;
  uploaded?: boolean;
}

type Step = "category" | "capture";

const CATEGORIES = [
  { value: "pictures", label: "Pictures" },
  { value: "drawings", label: "Drawings" },
  { value: "reports", label: "Reports" },
  { value: "other", label: "Other" }
];

export const ProjectUploadScreen: React.FC<ProjectUploadScreenProps> = ({
  project,
  onBack
}) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<string>("");
  const [media, setMedia] = useState<SelectedMedia[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleSelectCategory = (cat: string) => {
    setCategory(cat);
    setStep("capture");
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
      quality: 0.8
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const newMedia: SelectedMedia = {
        uri: asset.uri,
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
      quality: 0.8
    });

    if (!result.canceled && result.assets) {
      const newMedia: SelectedMedia[] = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        type: "image/jpeg"
      }));
      setMedia([...media, ...newMedia]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia(media.filter((_, i) => i !== index));
  };

  const uploadMedia = async (item: SelectedMedia, index: number) => {
    const updated = [...media];
    updated[index] = { ...item, uploading: true };
    setMedia(updated);

    try {
      await uploadProjectFile({
        projectId: project.id,
        category,
        description: "",
        file: item
      });

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
    if (media.length === 0) {
      Alert.alert("No media", "Please add at least one photo.");
      return;
    }

    setUploading(true);
    try {
      for (let i = 0; i < media.length; i++) {
        if (!media[i].uploaded && !media[i].uploading) {
          await uploadMedia(media[i], i);
        }
      }
      Alert.alert("Success", "All photos uploaded successfully!");
      setMedia([]);
      setStep("category");
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Upload failed", apiError.message);
    } finally {
      setUploading(false);
    }
  };

  if (step === "category") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Upload Images</Text>
          <Text style={styles.subtitle}>Select category</Text>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {CATEGORIES.map((cat) => (
            <MKCard
              key={cat.value}
              style={styles.categoryCard}
              onPress={() => handleSelectCategory(cat.value)}
              elevated={true}
            >
              <Text style={styles.categoryText}>{cat.label}</Text>
            </MKCard>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Upload Images</Text>
        <Text style={styles.subtitle}>
          Category: {CATEGORIES.find((c) => c.value === category)?.label}
        </Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.buttonRow}>
          <MKButton
            title="📷 Take Photo"
            onPress={handleTakePhoto}
            style={styles.actionButton}
          />
          <MKButton
            title="🖼️ Choose from Gallery"
            onPress={handlePickFromGallery}
            variant="secondary"
            style={styles.actionButton}
          />
        </View>

        {media.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Selected Photos ({media.length})</Text>
            <View style={styles.mediaGrid}>
              {media.map((item, index) => (
                <MKCard key={index} style={styles.mediaCard} elevated={true}>
                  <Image source={{ uri: item.uri }} style={styles.mediaImage} />
                  <View style={styles.mediaActions}>
                    {item.uploaded ? (
                      <Text style={styles.uploadedText}>✓ Uploaded</Text>
                    ) : item.uploading ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <MKButton
                        title="Upload"
                        onPress={() => uploadMedia(item, index)}
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
                </MKCard>
              ))}
            </View>
            <MKButton
              title={uploading ? "Uploading..." : "Upload All"}
              onPress={uploadAll}
              loading={uploading}
              style={styles.uploadAllButton}
            />
          </>
        )}
      </ScrollView>
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
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.md
  },
  categoryCard: {
    marginBottom: spacing.md,
    padding: spacing.lg
  },
  categoryText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  actionButton: {
    flex: 1
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.md
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg
  },
  mediaCard: {
    width: "48%"
  },
  mediaImage: {
    width: "100%",
    height: 150,
    borderRadius: 8,
    marginBottom: spacing.sm
  },
  mediaActions: {
    gap: spacing.xs
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
  uploadAllButton: {
    marginTop: spacing.md
  }
});

