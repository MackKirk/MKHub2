import React from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildAuthenticatedFileUrl,
  isImageContentType
} from "../lib/fileUrls";
import {
  deleteProjectReport,
  type ProjectReport,
  type ReportAttachment
} from "../services/reports";
import { toApiError } from "../services/api";
import { MKButton } from "./MKButton";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectNoteDetailModalProps {
  visible: boolean;
  report: ProjectReport | null;
  projectId: string;
  categoryLabel?: string;
  authorName?: string;
  token?: string | null;
  canDelete?: boolean;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}

const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

const formatCurrency = (value?: number | null): string => {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
};

export const MKProjectNoteDetailModal: React.FC<MKProjectNoteDetailModalProps> = ({
  visible,
  report,
  projectId,
  categoryLabel,
  authorName,
  token,
  canDelete = false,
  onClose,
  onDeleted
}) => {
  const insets = useSafeAreaInsets();
  const [deleting, setDeleting] = React.useState(false);

  if (!report) return null;

  const attachments = report.images?.attachments ?? [];

  const openAttachment = async (attachment: ReportAttachment) => {
    const source = buildAuthenticatedFileUrl(attachment.file_object_id, { token });
    try {
      await Linking.openURL(source.uri);
    } catch {
      Alert.alert("Could not open file", attachment.original_name || "Attachment");
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete note",
      "This note will be permanently removed. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);
              await deleteProjectReport(projectId, report.id);
              await onDeleted();
              onClose();
            } catch (err) {
              Alert.alert("Could not delete note", toApiError(err).message);
            } finally {
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {report.title || "Untitled note"}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        >
          <View style={styles.metaBlock}>
            <Text style={styles.metaText}>
              {categoryLabel || report.category_id || "General"}
            </Text>
            <Text style={styles.metaText}>{formatDate(report.created_at)}</Text>
            {authorName ? <Text style={styles.metaText}>By {authorName}</Text> : null}
          </View>

          {report.financial_value != null ? (
            <View style={styles.financialBlock}>
              <Text style={styles.financialLabel}>Financial value</Text>
              <Text style={styles.financialValue}>
                {formatCurrency(report.financial_value)}
              </Text>
            </View>
          ) : null}

          {report.description ? (
            <Text style={styles.description}>{report.description}</Text>
          ) : (
            <Text style={styles.emptyDescription}>No description.</Text>
          )}

          {attachments.length > 0 ? (
            <View style={styles.attachmentsSection}>
              <Text style={styles.attachmentsTitle}>Attachments</Text>
              {attachments.map((attachment) => {
                const isImage = isImageContentType(
                  attachment.content_type,
                  attachment.original_name
                );
                const source = buildAuthenticatedFileUrl(attachment.file_object_id, {
                  token,
                  variant: isImage ? "thumbnail" : "download"
                });

                return (
                  <TouchableOpacity
                    key={attachment.file_object_id}
                    style={styles.attachmentRow}
                    onPress={() => openAttachment(attachment)}
                  >
                    {isImage ? (
                      <Image source={source} style={styles.attachmentThumb} />
                    ) : (
                      <View style={styles.attachmentIconWrap}>
                        <Ionicons
                          name="document-outline"
                          size={22}
                          color={colors.primary}
                        />
                      </View>
                    )}
                    <Text style={styles.attachmentName} numberOfLines={2}>
                      {attachment.original_name || "Attachment"}
                    </Text>
                    <Ionicons name="open-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {canDelete ? (
            <MKButton
              title={deleting ? "Deleting..." : "Delete Note"}
              onPress={handleDelete}
              loading={deleting}
              disabled={deleting}
              variant="secondary"
              style={styles.deleteButton}
            />
          ) : null}
        </ScrollView>
      </View>
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
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md
  },
  title: {
    ...typography.titleSmall,
    flex: 1
  },
  closeText: {
    ...typography.body,
    color: colors.primary
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl
  },
  metaBlock: {
    gap: spacing.xs,
    marginBottom: spacing.lg
  },
  metaText: {
    ...typography.caption,
    color: colors.textMuted
  },
  financialBlock: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  financialLabel: {
    ...typography.caption,
    marginBottom: spacing.xs
  },
  financialValue: {
    ...typography.subtitle,
    color: colors.primary
  },
  description: {
    ...typography.body,
    lineHeight: 22
  },
  emptyDescription: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  attachmentsSection: {
    marginTop: spacing.xl,
    gap: spacing.sm
  },
  attachmentsTitle: {
    ...typography.subtitle,
    marginBottom: spacing.xs
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  attachmentThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.background
  },
  attachmentIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  attachmentName: {
    ...typography.bodySmall,
    flex: 1
  },
  deleteButton: {
    marginTop: spacing.xl
  }
});
