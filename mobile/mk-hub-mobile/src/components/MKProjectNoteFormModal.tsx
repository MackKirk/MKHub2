import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  categoryKey,
  filterReportCategoriesForProject,
  type ReportCategoryLike
} from "../lib/reportCategories";
import {
  createProjectReport,
  uploadReportAttachment,
  type CreateReportPayload
} from "../services/reports";
import { toApiError } from "../services/api";
import { MKButton } from "./MKButton";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

type UploadDraft = {
  uri: string;
  name: string;
  type: string;
};

interface MKProjectNoteFormModalProps {
  visible: boolean;
  projectId: string;
  isBidding: boolean;
  reportCategories: ReportCategoryLike[];
  isWriteCategoryAllowed?: (categoryId?: string | null) => boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

const GROUP_LABELS: Record<string, string> = {
  commercial: "Commercial",
  production: "Production",
  financial: "Financial"
};

export const MKProjectNoteFormModal: React.FC<MKProjectNoteFormModalProps> = ({
  visible,
  projectId,
  isBidding,
  reportCategories,
  isWriteCategoryAllowed,
  onClose,
  onSuccess
}) => {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [financialValue, setFinancialValue] = useState("");
  const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const writableCategories = useMemo(
    () =>
      filterReportCategoriesForProject(reportCategories, {
        isBidding,
        isCategoryAllowed: isWriteCategoryAllowed
      }),
    [reportCategories, isBidding, isWriteCategoryAllowed]
  );

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, ReportCategoryLike[]>();
    for (const cat of writableCategories) {
      const group = cat.meta?.group || "other";
      const list = groups.get(group) ?? [];
      list.push(cat);
      groups.set(group, list);
    }
    return groups;
  }, [writableCategories]);

  const selectedCategoryLabel = useMemo(() => {
    if (!category) return "General";
    const match = writableCategories.find((cat) => categoryKey(cat) === category);
    return match?.label || category;
  }, [category, writableCategories]);

  const showFinancialValue =
    category === "additional-income" || category === "additional-expense";

  const resetForm = () => {
    setTitle("");
    setCategory("");
    setDescription("");
    setFinancialValue("");
    setUploadDrafts([]);
    setShowCategoryPicker(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
      const next = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg"
      }));
      setUploadDrafts((current) => [...current, ...next]);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Missing information", "Please enter a title.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Missing information", "Please enter a description.");
      return;
    }
    if (category && isWriteCategoryAllowed && !isWriteCategoryAllowed(category)) {
      Alert.alert(
        "Permission denied",
        "You do not have permission to create notes in this category."
      );
      return;
    }
    if (showFinancialValue) {
      const parsed = Number(financialValue);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert("Missing information", "Please enter a valid financial value.");
        return;
      }
    }

    try {
      setSaving(true);
      const attachments = [];
      for (const draft of uploadDrafts) {
        const uploaded = await uploadReportAttachment(projectId, draft);
        attachments.push(uploaded);
      }

      const payload: CreateReportPayload = {
        title: title.trim(),
        description: description.trim(),
        category_id: category || null
      };

      if (attachments.length > 0) {
        payload.images = { attachments };
      }

      if (showFinancialValue) {
        payload.financial_value = Number(financialValue);
        payload.financial_type = category;
      }

      await createProjectReport(projectId, payload);
      resetForm();
      await onSuccess();
      onClose();
    } catch (err) {
      Alert.alert("Could not create note", toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>New Note</Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Daily update, client call, site note..."
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Category</Text>
          <TouchableOpacity
            style={styles.selectField}
            onPress={() => setShowCategoryPicker(true)}
          >
            <Text style={styles.selectValue}>{selectedCategoryLabel}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {showFinancialValue ? (
            <>
              <Text style={styles.label}>Value (USD)</Text>
              <TextInput
                style={styles.input}
                value={financialValue}
                onChangeText={setFinancialValue}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
            </>
          ) : null}

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Add the latest project context here..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={6}
          />

          <Text style={styles.label}>Attachments</Text>
          <View style={styles.attachmentActions}>
            <TouchableOpacity style={styles.attachmentButton} onPress={addCameraPhoto}>
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={styles.attachmentButtonText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachmentButton} onPress={addGalleryFiles}>
              <Ionicons name="images-outline" size={18} color={colors.primary} />
              <Text style={styles.attachmentButtonText}>Gallery</Text>
            </TouchableOpacity>
          </View>

          {uploadDrafts.length > 0 ? (
            <View style={styles.draftList}>
              {uploadDrafts.map((draft, index) => (
                <View key={`${draft.uri}-${index}`} style={styles.draftRow}>
                  <Text style={styles.draftName} numberOfLines={1}>
                    {draft.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setUploadDrafts((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                  >
                    <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          <MKButton
            title={saving ? "Creating..." : "Create Note"}
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveButton}
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
            <Text style={styles.pickerTitle}>Select category</Text>
            <ScrollView style={styles.pickerList}>
              <TouchableOpacity
                style={styles.pickerOption}
                onPress={() => {
                  setCategory("");
                  setShowCategoryPicker(false);
                }}
              >
                <Text style={styles.pickerOptionText}>General</Text>
              </TouchableOpacity>
              {Array.from(groupedCategories.entries()).map(([group, items]) => (
                <View key={group}>
                  <Text style={styles.pickerGroupLabel}>
                    {GROUP_LABELS[group] || group}
                  </Text>
                  {items.map((cat) => {
                    const value = categoryKey(cat);
                    return (
                      <TouchableOpacity
                        key={value}
                        style={styles.pickerOption}
                        onPress={() => {
                          setCategory(value);
                          setShowCategoryPicker(false);
                        }}
                      >
                        <Text style={styles.pickerOptionText}>{cat.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
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
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl
  },
  label: {
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
  attachmentActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  attachmentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card
  },
  attachmentButtonText: {
    ...typography.bodySmall,
    color: colors.primary
  },
  draftList: {
    marginBottom: spacing.lg,
    gap: spacing.xs
  },
  draftRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs
  },
  draftName: {
    ...typography.bodySmall,
    flex: 1,
    marginRight: spacing.sm
  },
  saveButton: {
    marginTop: spacing.sm
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
    maxHeight: "70%",
    padding: spacing.lg
  },
  pickerTitle: {
    ...typography.subtitle,
    marginBottom: spacing.md
  },
  pickerList: {
    maxHeight: 360
  },
  pickerGroupLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  pickerOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  pickerOptionText: {
    ...typography.body
  }
});
