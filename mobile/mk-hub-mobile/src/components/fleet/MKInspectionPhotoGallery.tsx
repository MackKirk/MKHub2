import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";
import { buildAuthenticatedFileUrl } from "../../lib/fileUrls";
import { pickMediaFromSource } from "../../lib/pickMediaFromSource";
import { MKImageSourcePickerModal } from "../MKImageSourcePickerModal";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius } from "../../theme/radius";
import { typography } from "../../theme/typography";

interface MKInspectionPhotoGalleryProps {
  photoIds: string[];
  onChange?: (photoIds: string[]) => void;
  uploading?: boolean;
  onUpload?: (file: { uri: string; name: string; type: string }) => Promise<void>;
  readOnly?: boolean;
}

export const MKInspectionPhotoGallery: React.FC<MKInspectionPhotoGalleryProps> = ({
  photoIds,
  onChange,
  uploading = false,
  onUpload,
  readOnly = false
}) => {
  const { token } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePick = async (source: "camera" | "gallery") => {
    const files = await pickMediaFromSource(source, { allowMultiple: false });
    const file = files[0];
    if (!file || !onUpload) return;
    await onUpload(file);
  };

  const removePhoto = (photoId: string) => {
    onChange?.(photoIds.filter((id) => id !== photoId));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Photos</Text>
      <View style={styles.grid}>
        {photoIds.map((photoId) => {
          const { uri, headers } = buildAuthenticatedFileUrl(photoId, {
            token,
            variant: "thumbnail",
            thumbnailWidth: 200
          });
          return (
            <View key={photoId} style={styles.thumbWrap}>
              <Image source={{ uri, headers }} style={styles.thumb} />
              {!readOnly && onChange ? (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => removePhoto(photoId)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
        {!readOnly && onUpload ? (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setPickerOpen(true)}
            disabled={uploading}
            activeOpacity={0.75}
          >
            {uploading ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons name="add" size={28} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      <MKImageSourcePickerModal
        visible={pickerOpen}
        title="Add inspection photo"
        mode="image"
        onClose={() => setPickerOpen(false)}
        onSelect={(source) => {
          if (source === "camera" || source === "gallery") {
            void handlePick(source);
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm
  },
  label: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  thumbWrap: {
    position: "relative"
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: radius.control,
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
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center"
  },
  addBtn: {
    width: 80,
    height: 80,
    borderRadius: radius.control,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  }
});
