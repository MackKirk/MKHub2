import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { uploadProjectFile } from "../services/projects";
import { toApiError } from "../services/api";
import type { ProjectFileCategory } from "../types/projects";
import { MKButton } from "./MKButton";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

export type FileUploadDraft = {
  uri: string;
  name: string;
  type: string;
  uploading?: boolean;
  uploaded?: boolean;
};

interface MKProjectFileUploadModalProps {
  visible: boolean;
  projectId: string;
  fileCategories: ProjectFileCategory[];
  defaultCategory?: string;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export const MKProjectFileUploadModal: React.FC<MKProjectFileUploadModalProps> = ({
  visible,
  projectId,
  fileCategories,
  defaultCategory,
  onClose,
  onSuccess
}) => {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState(defaultCategory || "pictures");
  const [drafts, setDrafts] = useState<FileUploadDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory(defaultCategory || fileCategories[0]?.id || "pictures");
      setDrafts([]);
      setShowCategoryPicker(false);
    }
  }, [visible, defaultCategory, fileCategories]);

  const categoryLabel = useMemo(() => {
    const match = fileCategories.find((item) => item.id === category);
    return match?.name || category;
  }, [fileCategories, category]);

  const resetAndClose = () => {
    setDrafts([]);
    setShowCategoryPicker(false);
    onClose();
  };

  const appendDrafts = (items: FileUploadDraft[]) => {
    if (items.length === 0) return;
    setDrafts((current) => [...current, ...items]);
  };

  const takePhoto = async () => {
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
      appendDrafts([
        {
          uri: asset.uri,
          name: asset.fileName ?? `photo_${Date.now()}.jpg`,
          type: asset.mimeType || "image/jpeg"
        }
      ]);
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Photo library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8
    });

    if (!result.canceled) {
      appendDrafts(
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? `media_${Date.now()}.jpg`,
          type: asset.mimeType || "image/jpeg"
        }))
      );
    }
  };

  const pickDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      multiple: true,
      copyToCacheDirectory: true
    });

    if (!result.canceled) {
      appendDrafts(
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || "application/octet-stream"
        }))
      );
    }
  };

  const removeDraft = (index: number) => {
    setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleUpload = async () => {
    if (drafts.length === 0) {
      Alert.alert("No files selected", "Add at least one file or photo.");
      return;
    }

    try {
      setUploading(true);
      const filesToUpload = [...drafts];
      for (let index = 0; index < filesToUpload.length; index += 1) {
        setDrafts((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, uploading: true } : item
          )
        );

        await uploadProjectFile({
          projectId,
          category,
          description: "",
          file: filesToUpload[index]
        });

        setDrafts((current) =>
          current.map((item, itemIndex) =>
            itemIndex === index
              ? { ...item, uploading: false, uploaded: true }
              : item
          )
        );
      }

      await onSuccess();
      resetAndClose();
      Alert.alert("Upload complete", "Files added to the project successfully.");
    } catch (err) {
      Alert.alert("Upload failed", toApiError(err).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={resetAndClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Upload Files</Text>
          <TouchableOpacity onPress={resetAndClose} disabled={uploading}>
            <Text style={[styles.closeText, uploading && styles.closeDisabled]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Category</Text>
          <TouchableOpacity
            style={styles.selectField}
            onPress={() => setShowCategoryPicker(true)}
            disabled={uploading}
          >
            <Text style={styles.selectValue}>{categoryLabel}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <Text style={styles.label}>Add files</Text>
          <View style={styles.sourceRow}>
            <TouchableOpacity
              style={styles.sourceButton}
              onPress={takePhoto}
              disabled={uploading}
            >
              <Ionicons name="camera-outline" size={28} color={colors.primary} />
              <Text style={styles.sourceTitle}>Take Photo</Text>
              <Text style={styles.sourceHint}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sourceButton}
              onPress={pickFromGallery}
              disabled={uploading}
            >
              <Ionicons name="images-outline" size={28} color={colors.primary} />
              <Text style={styles.sourceTitle}>Gallery</Text>
              <Text style={styles.sourceHint}>Select multiple</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.documentsButton}
            onPress={pickDocuments}
            disabled={uploading}
          >
            <Ionicons name="document-outline" size={20} color={colors.primary} />
            <Text style={styles.documentsButtonText}>Browse files (PDF, docs…)</Text>
          </TouchableOpacity>

          {drafts.length > 0 ? (
            <View style={styles.queueSection}>
              <Text style={styles.queueTitle}>
                Selected ({drafts.length})
              </Text>
              {drafts.map((item, index) => (
                <View key={`${item.uri}-${index}`} style={styles.queueRow}>
                  <View style={styles.queueInfo}>
                    <Ionicons
                      name={
                        item.type.startsWith("image/")
                          ? "image-outline"
                          : "document-outline"
                      }
                      size={18}
                      color={colors.primary}
                    />
                    <Text numberOfLines={1} style={styles.queueName}>
                      {item.name}
                    </Text>
                  </View>
                  {item.uploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : item.uploaded ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : (
                    <TouchableOpacity onPress={() => removeDraft(index)}>
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>
              Choose photos from the gallery or take new ones. You can add multiple
              files before uploading.
            </Text>
          )}

          <MKButton
            title={uploading ? "Uploading..." : `Upload${drafts.length > 0 ? ` (${drafts.length})` : ""}`}
            onPress={handleUpload}
            loading={uploading}
            disabled={uploading || drafts.length === 0}
            style={styles.uploadButton}
          />
        </ScrollView>
      </View>

      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowCategoryPicker(false)}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>File category</Text>
            <ScrollView style={styles.pickerList}>
              {fileCategories.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    setCategory(item.id);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      category === item.id && styles.pickerOptionActive
                    ]}
                  >
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md
  },
  title: {
    ...typography.titleSmall
  },
  closeText: {
    ...typography.body,
    color: colors.primary
  },
  closeDisabled: {
    opacity: 0.5
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl
  },
  label: {
    ...typography.caption,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  selectField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  selectValue: {
    ...typography.body
  },
  sourceRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md
  },
  sourceButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm
  },
  sourceTitle: {
    ...typography.body,
    fontWeight: "600"
  },
  sourceHint: {
    ...typography.caption,
    color: colors.textMuted
  },
  documentsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.background,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg
  },
  documentsButtonText: {
    ...typography.bodySmall,
    color: colors.primary
  },
  queueSection: {
    marginBottom: spacing.lg,
    gap: spacing.xs
  },
  queueTitle: {
    ...typography.subtitle,
    marginBottom: spacing.sm
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  queueInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
    marginRight: spacing.sm
  },
  queueName: {
    ...typography.bodySmall,
    flex: 1
  },
  emptyHint: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    lineHeight: 20
  },
  uploadButton: {
    alignSelf: "stretch",
    width: "100%"
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: "60%",
    padding: spacing.lg
  },
  pickerTitle: {
    ...typography.subtitle,
    marginBottom: spacing.md
  },
  pickerList: {
    maxHeight: 320
  },
  pickerOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  pickerOptionText: {
    ...typography.body
  },
  pickerOptionActive: {
    color: colors.primary,
    fontWeight: "600"
  }
});
