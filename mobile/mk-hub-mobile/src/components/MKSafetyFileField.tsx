import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getFileIds, setFileIds } from "../lib/safetyFormPayload";
import { buildAuthenticatedFileUrl } from "../lib/fileUrls";
import { pickMediaFromSource } from "../lib/pickMediaFromSource";
import type { SafetyFormField } from "../lib/safetyFormTemplate";
import { uploadSafetyFormFile } from "../services/safetyUpload";
import { MKImageSourcePickerModal } from "./MKImageSourcePickerModal";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKSafetyFileFieldProps {
  field: SafetyFormField;
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  projectId: string;
  inspectionId?: string;
  token?: string | null;
  readOnly?: boolean;
  trailing?: React.ReactNode;
}

export const MKSafetyFileField: React.FC<MKSafetyFileFieldProps> = ({
  field,
  payload,
  onChange,
  projectId,
  inspectionId,
  token,
  readOnly = false,
  trailing
}) => {
  const key = field.key;
  const ids = getFileIds(payload, key);
  const isImage = field.type === "image_view";
  const multi =
    field.type === "image_view"
      ? field.settings?.allowMultipleFiles !== false
      : field.settings?.allowMultipleFiles === true;
  const defaultMax = isImage ? 8 : 12;
  const max =
    typeof field.settings?.maxFiles === "number"
      ? field.settings.maxFiles
      : multi
        ? defaultMax
        : 1;
  const [busy, setBusy] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  const setIds = (nextIds: string[]) => {
    onChange({ ...payload, [key]: setFileIds(multi, nextIds.slice(0, max)) });
  };

  const uploadFiles = async (files: Array<{ uri: string; name: string; type: string }>) => {
    let nextIds = [...ids];
    for (const file of files) {
      if (nextIds.length >= max) break;
      const id = await uploadSafetyFormFile({ projectId, inspectionId, file });
      nextIds = multi ? [...nextIds, id] : [id];
    }
    setIds(nextIds);
  };

  const handleSourceSelect = async (source: "camera" | "gallery" | "pdf") => {
    try {
      setBusy(true);
      const files = await pickMediaFromSource(source, { allowMultiple: multi });
      if (files.length === 0) return;
      await uploadFiles(files);
    } catch {
      Alert.alert("Upload failed", isImage ? "Could not upload image." : "Could not upload PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.wrap}>
        <View style={styles.toolbar}>
          {!readOnly ? (
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => setShowSourcePicker(true)}
              disabled={busy || !projectId || ids.length >= max}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons
                    name={isImage ? "image-outline" : "document-outline"}
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.uploadText}>
                    {isImage ? "Add images" : "Add PDF"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          {trailing}
        </View>
        <Text style={styles.meta}>
          {ids.length}/{max} {isImage ? "photos" : "files"}
        </Text>
        <View style={styles.thumbRow}>
          {ids.map((id) =>
            isImage ? (
              <View key={id} style={styles.thumbWrap}>
                <Image
                  source={{
                    uri: buildAuthenticatedFileUrl(id, {
                      token,
                      variant: "thumbnail",
                      thumbnailWidth: 240
                    }).uri
                  }}
                  style={styles.thumb}
                />
                {!readOnly ? (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => setIds(ids.filter((x) => x !== id))}
                  >
                    <Text style={styles.removeBtnText}>×</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View key={id} style={styles.pdfChip}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                <Text style={styles.pdfText}>PDF attached</Text>
                {!readOnly ? (
                  <TouchableOpacity onPress={() => setIds(ids.filter((x) => x !== id))}>
                    <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )
          )}
        </View>
      </View>

      <MKImageSourcePickerModal
        visible={showSourcePicker}
        title={isImage ? "Add photo" : "Add PDF"}
        mode={isImage ? "image" : "pdf"}
        onClose={() => setShowSourcePicker(false)}
        onSelect={(source) => void handleSourceSelect(source)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  uploadText: { ...typography.bodySmall, color: colors.primary, fontWeight: "600" },
  meta: { ...typography.caption, color: colors.textMuted },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumbWrap: { position: "relative" },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center"
  },
  removeBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  pdfChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  pdfText: { ...typography.caption }
});
