import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";
import { buildAuthenticatedFileUrl } from "../../lib/fileUrls";
import { pickMediaFromSource } from "../../lib/pickMediaFromSource";
import {
  attachWorkOrderFile,
  deleteWorkOrderFile,
  listWorkOrderFiles,
  uploadWorkOrderFile
} from "../../services/fleetWorkOrders";
import { toApiError } from "../../services/api";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import { MKImageSourcePickerModal } from "../MKImageSourcePickerModal";
import { MKProjectFilePreviewModal } from "../MKProjectFilePreviewModal";
import type { WorkOrderFileItem } from "../../types/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

const FILE_CATEGORIES = [
  { id: "all", label: "All Files" },
  { id: "orcamentos", label: "Quotes" },
  { id: "photos", label: "Photos" },
  { id: "invoices", label: "Invoices" },
  { id: "outros", label: "Other" }
] as const;

interface MKFleetWorkOrderFilesSectionProps {
  workOrderId: string;
  canEdit: boolean;
}

export const MKFleetWorkOrderFilesSection: React.FC<MKFleetWorkOrderFilesSectionProps> = ({
  workOrderId,
  canEdit
}) => {
  const { token } = useAuth();
  const [files, setFiles] = useState<WorkOrderFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [uploadCategory, setUploadCategory] = useState("outros");
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<WorkOrderFileItem | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const items = await listWorkOrderFiles(workOrderId);
      setFiles(items);
    } catch (err) {
      Alert.alert("Could not load files", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files
      .filter((file) => {
        if (selectedCategory !== "all" && file.category !== selectedCategory) return false;
        if (!q) return true;
        return (file.original_name ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const aTime = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
        const bTime = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
        return bTime - aTime;
      });
  }, [files, query, selectedCategory]);

  const handleUpload = async (source: "camera" | "gallery") => {
    const picked = await pickMediaFromSource(source, { allowMultiple: false });
    const file = picked[0];
    if (!file) return;
    try {
      setUploading(true);
      const fileId = await uploadWorkOrderFile(file);
      await attachWorkOrderFile(workOrderId, {
        file_object_id: fileId,
        category: uploadCategory,
        original_name: file.name
      });
      await load();
    } catch (err) {
      Alert.alert("Upload failed", toApiError(err).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (file: WorkOrderFileItem) => {
    Alert.alert("Delete file", "Remove this file from the work order?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteWorkOrderFile(workOrderId, file);
            await load();
          } catch (err) {
            Alert.alert("Delete failed", toApiError(err).message);
          }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionHeader}>
        <View style={styles.headerText}>
          <Text style={styles.sectionTitle}>Files</Text>
          <Text style={styles.sectionDescription}>
            Quotes, photos, invoices, and other attachments.
          </Text>
        </View>
        {canEdit ? (
          <MKButton
            title="Upload"
            size="compact"
            onPress={() => setPickerOpen(true)}
            loading={uploading}
          />
        ) : null}
      </View>

      {canEdit ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.uploadCats}>
          {FILE_CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, uploadCategory === cat.id && styles.chipActive]}
              onPress={() => setUploadCategory(cat.id)}
            >
              <Text style={[styles.chipText, uploadCategory === cat.id && styles.chipTextActive]}>
                Upload to {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search files"
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILE_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.chip, selectedCategory === cat.id && styles.chipActive]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Text style={[styles.chipText, selectedCategory === cat.id && styles.chipTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filteredFiles.length === 0 ? (
        <MKCard style={styles.emptyCard}>
          <Text style={styles.emptyText}>No files in this category.</Text>
        </MKCard>
      ) : (
        filteredFiles.map((file) => {
          const { uri, headers } = buildAuthenticatedFileUrl(file.file_object_id, {
            token,
            variant: "thumbnail",
            thumbnailWidth: 120
          });
          return (
            <MKCard key={`${file.id}-${file.file_object_id}`} style={styles.fileCard}>
              <TouchableOpacity
                style={styles.fileRow}
                onPress={() => setPreviewFile(file)}
                activeOpacity={0.75}
              >
                {file.is_image ? (
                  <Image source={{ uri, headers }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.fileIcon]}>
                    <Ionicons name="document-outline" size={24} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.fileMeta}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {file.original_name || "Untitled"}
                  </Text>
                  <Text style={styles.fileSub}>
                    {file.category}
                    {file.uploaded_at
                      ? ` · ${new Date(file.uploaded_at).toLocaleDateString()}`
                      : ""}
                    {file.is_legacy ? " · legacy" : ""}
                  </Text>
                </View>
              </TouchableOpacity>
              {canEdit ? (
                <TouchableOpacity onPress={() => handleDelete(file)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </MKCard>
          );
        })
      )}

      <MKImageSourcePickerModal
        visible={pickerOpen}
        title="Upload file"
        mode="image"
        onClose={() => setPickerOpen(false)}
        onSelect={(source) => {
          if (source === "camera" || source === "gallery") {
            void handleUpload(source);
          }
        }}
      />

      <MKProjectFilePreviewModal
        visible={Boolean(previewFile)}
        file={
          previewFile
            ? {
                id: previewFile.id,
                file_object_id: previewFile.file_object_id,
                original_name: previewFile.original_name,
                content_type: previewFile.content_type,
                uploaded_at: previewFile.uploaded_at,
                is_image: previewFile.is_image
              }
            : null
        }
        token={token}
        onClose={() => setPreviewFile(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center"
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  headerText: {
    flex: 1,
    gap: 2
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  sectionDescription: {
    ...typography.caption,
    color: colors.textMuted
  },
  uploadCats: {
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  filterRow: {
    gap: spacing.sm,
    paddingBottom: spacing.xs
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: "#fef2f2"
  },
  chipText: {
    ...typography.caption,
    color: colors.textMuted
  },
  chipTextActive: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.sm
  },
  emptyCard: {
    paddingVertical: spacing.lg,
    alignItems: "center"
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  fileCard: {
    gap: spacing.sm
  },
  fileRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center"
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.control,
    backgroundColor: colors.background
  },
  fileIcon: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border
  },
  fileMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  fileName: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  fileSub: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "capitalize"
  },
  deleteBtn: {
    alignSelf: "flex-start"
  },
  deleteText: {
    ...typography.caption,
    color: "#dc2626",
    fontFamily: typography.button.fontFamily
  }
});
