import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  exportDocumentPdfToCache,
  getProjectDocuments,
  type ProjectDocument
} from "../services/documents";
import { shareLocalFile } from "../services/files";
import { toApiError } from "../services/api";
import { MKCard } from "./MKCard";
import { MKButton } from "./MKButton";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectDocumentsSectionProps {
  projectId: string;
}

const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
};

export const MKProjectDocumentsSection: React.FC<MKProjectDocumentsSectionProps> = ({
  projectId
}) => {
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<ProjectDocument | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [previewFile, setPreviewFile] = useState<Awaited<
    ReturnType<typeof exportDocumentPdfToCache>
  > | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const items = await getProjectDocuments(projectId);
        if (!cancelled) setDocuments(items);
      } catch (err) {
        if (!cancelled) {
          Alert.alert("Could not load documents", toApiError(err).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const openPreview = async (doc: ProjectDocument) => {
    try {
      setPreviewDoc(doc);
      setLoadingPreview(true);
      setPreviewUri(null);
      const file = await exportDocumentPdfToCache(doc.id, doc.title);
      setPreviewFile(file);
      setPreviewUri(file.uri);
    } catch (err) {
      setPreviewDoc(null);
      Alert.alert("Could not open document", toApiError(err).message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewUri(null);
    setPreviewFile(null);
  };

  const handleShare = async () => {
    if (!previewFile) return;
    try {
      setSharing(true);
      await shareLocalFile(previewFile, {
        mimeType: "application/pdf",
        dialogTitle: previewDoc?.title || "Document"
      });
    } catch (err) {
      Alert.alert("Could not share document", toApiError(err).message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.subtitle}>
          Project documents from the document creator. View only on mobile.
        </Text>
      </View>

      <MKCard style={styles.card} elevated>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : documents.length === 0 ? (
          <Text style={styles.emptyText}>No documents yet.</Text>
        ) : (
          documents.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              style={styles.row}
              onPress={() => openPreview(doc)}
              activeOpacity={0.7}
            >
              <View style={styles.iconWrap}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.meta}>
                <Text style={styles.docTitle} numberOfLines={2}>
                  {doc.title || "Untitled document"}
                </Text>
                <Text style={styles.docDate}>
                  Updated {formatDate(doc.updated_at || doc.created_at)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </MKCard>

      <Modal
        visible={!!previewDoc}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePreview}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={2}>
              {previewDoc?.title || "Document"}
            </Text>
            <TouchableOpacity onPress={closePreview}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewArea}>
            {loadingPreview ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Generating PDF preview...</Text>
              </View>
            ) : previewUri ? (
              <WebView source={{ uri: previewUri }} style={styles.webView} />
            ) : null}
          </View>

          <View style={[styles.modalFooter, { paddingBottom: insets.bottom + spacing.md }]}>
            <MKButton
              title={sharing ? "Sharing..." : "Share PDF"}
              onPress={handleShare}
              loading={sharing}
              disabled={!previewFile || sharing}
              style={styles.footerButton}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { gap: spacing.xs },
  title: { ...typography.subtitle },
  subtitle: { ...typography.bodySmall, color: colors.textMuted },
  card: { marginBottom: spacing.md },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm
  },
  emptyText: { ...typography.bodySmall, color: colors.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  meta: { flex: 1 },
  docTitle: { ...typography.bodySmall, marginBottom: spacing.xs },
  docDate: { ...typography.caption },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md
  },
  modalTitle: { ...typography.titleSmall, flex: 1 },
  closeText: { ...typography.body, color: colors.primary },
  previewArea: {
    flex: 1,
    marginHorizontal: spacing.md,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: colors.card
  },
  webView: { flex: 1 },
  loadingText: { ...typography.bodySmall, color: colors.textMuted },
  modalFooter: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  footerButton: { alignSelf: "stretch", width: "100%" }
});
