import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildAuthenticatedFileUrl } from "../lib/fileUrls";
import type { ProjectFileCategory, ProjectFileItem } from "../types/projects";
import { MKButton } from "./MKButton";
import { MKCard } from "./MKCard";
import { MKProjectFileUploadModal } from "./MKProjectFileUploadModal";
import { MKProjectFilePreviewModal } from "./MKProjectFilePreviewModal";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectFilesSectionProps {
  projectId: string;
  files: ProjectFileItem[];
  fileCategories: ProjectFileCategory[];
  token?: string | null;
  onRefresh: () => Promise<void>;
}

const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
};

export const MKProjectFilesSection: React.FC<MKProjectFilesSectionProps> = ({
  projectId,
  files,
  fileCategories,
  token,
  onRefresh
}) => {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectFileItem | null>(null);

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of fileCategories) {
      map.set(category.id, category.name);
    }
    return map;
  }, [fileCategories]);

  const filterOptions = useMemo(() => {
    const options = [{ value: "all", label: "All categories" }];
    for (const category of fileCategories) {
      options.push({ value: category.id, label: category.name });
    }
    return options;
  }, [fileCategories]);

  const selectedFilterLabel = useMemo(() => {
    const match = filterOptions.find((item) => item.value === selectedCategory);
    return match?.label || "All categories";
  }, [filterOptions, selectedCategory]);

  const filteredFiles = useMemo(() => {
    const visible = files.filter((file) => {
      if (selectedCategory === "all") return true;
      return file.category === selectedCategory;
    });
    return visible.sort((a, b) => {
      const aTime = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
      const bTime = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [files, selectedCategory]);

  const defaultUploadCategory = useMemo(() => {
    if (selectedCategory !== "all") return selectedCategory;
    return fileCategories[0]?.id || "pictures";
  }, [selectedCategory, fileCategories]);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Project Files</Text>
          <Text style={styles.subtitle}>
            Photos, drawings, and documents attached to this project.
          </Text>
        </View>
        <MKButton
          title="Upload File"
          onPress={() => setShowUploadModal(true)}
          size="compact"
          style={styles.uploadButton}
        />
      </View>

      <TouchableOpacity
        style={styles.filterField}
        onPress={() => setShowFilterPicker(true)}
      >
        <Text style={styles.filterLabel}>Category</Text>
        <View style={styles.filterValueWrap}>
          <Text style={styles.filterValue} numberOfLines={1}>
            {selectedFilterLabel}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>

      <MKCard style={styles.card} elevated>
        {filteredFiles.length === 0 ? (
          <Text style={styles.emptyText}>No files in this category.</Text>
        ) : (
          filteredFiles.map((file) => {
            const thumbSource = file.is_image
              ? buildAuthenticatedFileUrl(file.file_object_id, {
                  token,
                  variant: "thumbnail",
                  thumbnailWidth: 200
                })
              : null;

            return (
              <TouchableOpacity
                key={file.id}
                style={styles.fileRow}
                onPress={() => setPreviewFile(file)}
                activeOpacity={0.7}
              >
                {thumbSource ? (
                  <Image source={thumbSource} style={styles.fileThumb} />
                ) : (
                  <View style={styles.fileThumbPlaceholder}>
                    <Ionicons
                      name="document-text-outline"
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                )}
                <View style={styles.fileMeta}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.original_name || file.key || "Untitled file"}
                  </Text>
                  <Text style={styles.fileCategory}>
                    {(file.category && categoryLookup.get(file.category)) ||
                      file.category ||
                      "Uncategorized"}
                  </Text>
                </View>
                <Text style={styles.fileDate}>{formatDate(file.uploaded_at)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </MKCard>

      <MKProjectFilePreviewModal
        visible={!!previewFile}
        file={previewFile}
        token={token}
        onClose={() => setPreviewFile(null)}
      />

      <MKProjectFileUploadModal
        visible={showUploadModal}
        projectId={projectId}
        fileCategories={fileCategories}
        defaultCategory={defaultUploadCategory}
        onClose={() => setShowUploadModal(false)}
        onSuccess={onRefresh}
      />

      <Modal
        visible={showFilterPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterPicker(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterPicker(false)}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Filter by category</Text>
            <ScrollView style={styles.pickerList}>
              {filterOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.pickerOption}
                  onPress={() => {
                    setSelectedCategory(option.value);
                    setShowFilterPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      selectedCategory === option.value && styles.pickerOptionActive
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  headerText: {
    flex: 1,
    gap: spacing.xs
  },
  title: {
    ...typography.subtitle
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  uploadButton: {
    minWidth: 118
  },
  filterField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  filterLabel: {
    ...typography.caption,
    marginBottom: spacing.xs
  },
  filterValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  filterValue: {
    ...typography.body,
    flex: 1
  },
  card: {
    marginBottom: spacing.md
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
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
    textAlign: "right",
    minWidth: 72
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
