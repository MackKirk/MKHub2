import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getProjectFilePreviewKind } from "../lib/filePreview";
import {
  downloadProjectFileToCache,
  resolvePreviewUrl,
  shareLocalFile
} from "../services/files";
import { toApiError } from "../services/api";
import type { ProjectFileItem } from "../types/projects";
import { MKButton } from "./MKButton";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectFilePreviewModalProps {
  visible: boolean;
  file: ProjectFileItem | null;
  token?: string | null;
  onClose: () => void;
}

export const MKProjectFilePreviewModal: React.FC<MKProjectFilePreviewModalProps> = ({
  visible,
  file,
  token,
  onClose
}) => {
  const insets = useSafeAreaInsets();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"download" | "share" | null>(null);

  const previewKind = file ? getProjectFilePreviewKind(file) : "other";
  const displayName = file?.original_name || file?.key || "File";

  useEffect(() => {
    if (!visible || !file) {
      setPreviewUrl(null);
      setPreviewError(null);
      setLoadingPreview(false);
      return;
    }

    if (previewKind === "other") {
      setPreviewUrl(null);
      setPreviewError(null);
      setLoadingPreview(false);
      return;
    }

    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);

    resolvePreviewUrl(
      file.file_object_id,
      token,
      previewKind === "pdf" ? "pdf" : "image"
    )
      .then((url) => {
        if (!cancelled) {
          setPreviewUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPreviewError(toApiError(err).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPreview(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, file, token, previewKind]);

  const runFileAction = useCallback(
    async (action: "download" | "share") => {
      if (!file) return;

      try {
        setBusyAction(action);
        const localFile = await downloadProjectFileToCache({
          fileObjectId: file.file_object_id,
          originalName: file.original_name,
          token
        });

        await shareLocalFile(localFile, {
          mimeType: file.content_type,
          dialogTitle:
            action === "share" ? displayName : `Save ${displayName}`
        });
      } catch (err) {
        Alert.alert(
          action === "share" ? "Could not share file" : "Could not download file",
          toApiError(err).message
        );
      } finally {
        setBusyAction(null);
      }
    },
    [file, token, displayName]
  );

  if (!file) return null;

  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;
  const previewHeight = screenHeight - insets.top - insets.bottom - 180;
  const imageWidth = screenWidth - spacing.md * 2 - spacing.lg * 2;

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
            {displayName}
          </Text>
          <TouchableOpacity onPress={onClose} disabled={!!busyAction}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.previewArea, { minHeight: previewHeight }]}>
          {loadingPreview ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.stateText}>Loading preview...</Text>
            </View>
          ) : previewError ? (
            <View style={styles.centerState}>
              <Ionicons name="alert-circle-outline" size={36} color={colors.textMuted} />
              <Text style={styles.stateText}>{previewError}</Text>
            </View>
          ) : previewKind === "image" && previewUrl ? (
            <ScrollView
              style={styles.imageScroll}
              contentContainerStyle={styles.imageScrollContent}
              bounces={false}
            >
              <Image
                source={{ uri: previewUrl }}
                style={{
                  width: imageWidth,
                  height: previewHeight - spacing.lg * 2
                }}
                resizeMode="contain"
              />
            </ScrollView>
          ) : previewKind === "pdf" && previewUrl ? (
            <WebView
              source={{ uri: previewUrl }}
              style={styles.webView}
              originWhitelist={["*"]}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              )}
            />
          ) : (
            <View style={styles.centerState}>
              <View style={styles.fileIconWrap}>
                <Ionicons name="document-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.stateTitle}>Preview not available</Text>
              <Text style={styles.stateText}>
                This file type cannot be previewed here. You can still download or
                share it.
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <MKButton
            title={busyAction === "download" ? "Downloading..." : "Download"}
            onPress={() => runFileAction("download")}
            variant="secondary"
            loading={busyAction === "download"}
            disabled={!!busyAction}
            style={styles.footerButton}
          />
          <MKButton
            title={busyAction === "share" ? "Sharing..." : "Share"}
            onPress={() => runFileAction("share")}
            loading={busyAction === "share"}
            disabled={!!busyAction}
            style={styles.footerButton}
          />
        </View>
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
  previewArea: {
    flex: 1,
    marginHorizontal: spacing.md,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: "#111827"
  },
  imageScroll: {
    flex: 1
  },
  imageScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.sm
  },
  webView: {
    flex: 1,
    backgroundColor: colors.card
  },
  webViewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm
  },
  fileIconWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm
  },
  stateTitle: {
    ...typography.subtitle,
    color: colors.card,
    textAlign: "center"
  },
  stateText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md
  },
  footerButton: {
    flex: 1,
    alignSelf: "stretch"
  }
});
