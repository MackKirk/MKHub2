import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildAuthenticatedFileUrl } from "../lib/fileUrls";
import { pickMediaFromSource } from "../lib/pickMediaFromSource";
import { uploadSafetyFormFile } from "../services/safetyUpload";
import { MKImageSourcePickerModal } from "./MKImageSourcePickerModal";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

const MAX_IMAGES = 8;

interface MKSafetyFieldCommentPanelProps {
  expanded: boolean;
  disabled: boolean;
  text: string;
  imageIds: string[];
  onTextChange: (text: string) => void;
  onImageIdsChange: (updater: (prev: string[]) => string[]) => void;
  projectId: string;
  inspectionId?: string;
  token?: string | null;
}

export const MKSafetyFieldCommentPanel: React.FC<MKSafetyFieldCommentPanelProps> = ({
  expanded,
  disabled,
  text,
  imageIds,
  onTextChange,
  onImageIdsChange,
  projectId,
  inspectionId,
  token
}) => {
  const [busy, setBusy] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const hasContent = text.trim().length > 0 || imageIds.length > 0;

  const uploadFiles = useCallback(
    async (files: Array<{ uri: string; name: string; type: string }>) => {
      for (const file of files) {
        if (imageIds.length >= MAX_IMAGES) {
          Alert.alert("Limit reached", `You can attach at most ${MAX_IMAGES} images.`);
          break;
        }
        const id = await uploadSafetyFormFile({
          projectId,
          inspectionId,
          file
        });
        onImageIdsChange((prev) => {
          if (prev.length >= MAX_IMAGES) return prev;
          if (prev.includes(id)) return prev;
          return [...prev, id].slice(0, MAX_IMAGES);
        });
      }
    },
    [projectId, inspectionId, imageIds.length, onImageIdsChange]
  );

  const handleSourceSelect = async (source: "camera" | "gallery" | "pdf") => {
    if (source === "pdf") return;
    try {
      setBusy(true);
      const files = await pickMediaFromSource(source, { allowMultiple: true });
      if (files.length === 0) return;
      await uploadFiles(files);
    } catch {
      Alert.alert("Upload failed", "Could not upload image.");
    } finally {
      setBusy(false);
    }
  };

  if (!disabled && expanded) {
    return (
      <>
        <View style={styles.panel}>
          <TextInput
            style={styles.textArea}
            value={text}
            onChangeText={onTextChange}
            placeholder="Comments / details (optional)"
            multiline
            editable={!disabled}
          />
          <View style={styles.attachRow}>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={() => setShowSourcePicker(true)}
              disabled={disabled || busy || !projectId}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={18} color={colors.primary} />
                  <Text style={styles.attachText}>Add photos</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.countText}>
              {imageIds.length}/{MAX_IMAGES}
            </Text>
          </View>
          {imageIds.length > 0 ? (
            <View style={styles.thumbRow}>
              {imageIds.map((id) => (
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
                  {!disabled ? (
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => onImageIdsChange((prev) => prev.filter((x) => x !== id))}
                    >
                      <Text style={styles.removeBtnText}>×</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <MKImageSourcePickerModal
          visible={showSourcePicker}
          title="Add photo"
          onClose={() => setShowSourcePicker(false)}
          onSelect={(source) => void handleSourceSelect(source)}
        />
      </>
    );
  }

  if (hasContent) {
    return (
      <View style={styles.panel}>
        {text.trim() ? <Text style={styles.savedText}>{text}</Text> : null}
        {imageIds.length > 0 ? (
          <View style={styles.thumbRow}>
            {imageIds.map((id) => (
              <Image
                key={id}
                source={{
                  uri: buildAuthenticatedFileUrl(id, {
                    token,
                    variant: "thumbnail",
                    thumbnailWidth: 240
                  }).uri
                }}
                style={styles.thumb}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  return null;
};

export function CommentToggleButton({
  expanded,
  hasComment,
  onToggle,
  disabled
}: {
  expanded: boolean;
  hasComment: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.commentToggle,
        (expanded || hasComment) && styles.commentToggleActive
      ]}
      onPress={onToggle}
      disabled={disabled}
    >
      <Ionicons
        name="chatbubble-ellipses-outline"
        size={20}
        color={expanded || hasComment ? colors.primary : colors.textMuted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm, marginTop: spacing.sm },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 88,
    textAlignVertical: "top",
    ...typography.body
  },
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  attachButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  attachText: { ...typography.bodySmall, color: colors.primary, fontWeight: "600" },
  countText: { ...typography.caption, color: colors.textMuted },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumbWrap: { position: "relative" },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
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
  savedText: { ...typography.bodySmall, color: colors.textMuted },
  commentToggle: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  commentToggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.background
  }
});
