import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

export type ImageSourceChoice = "camera" | "gallery" | "pdf";

interface MKImageSourcePickerModalProps {
  visible: boolean;
  title?: string;
  /** image = camera + gallery; pdf = browse PDF only */
  mode?: "image" | "pdf";
  onClose: () => void;
  onSelect: (source: ImageSourceChoice) => void;
}

export const MKImageSourcePickerModal: React.FC<MKImageSourcePickerModalProps> = ({
  visible,
  title = "Add photo",
  mode = "image",
  onClose,
  onSelect
}) => {
  const insets = useSafeAreaInsets();

  const handleSelect = (source: ImageSourceChoice) => {
    onClose();
    onSelect(source);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          onPress={() => undefined}
        >
          <Text style={styles.title}>{title}</Text>
          {mode === "image" ? (
            <View style={styles.sourceRow}>
              <TouchableOpacity
                style={styles.sourceButton}
                onPress={() => handleSelect("camera")}
              >
                <Ionicons name="camera-outline" size={28} color={colors.primary} />
                <Text style={styles.sourceTitle}>Take Photo</Text>
                <Text style={styles.sourceHint}>Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sourceButton}
                onPress={() => handleSelect("gallery")}
              >
                <Ionicons name="images-outline" size={28} color={colors.primary} />
                <Text style={styles.sourceTitle}>Gallery</Text>
                <Text style={styles.sourceHint}>Select multiple</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.documentsButton}
              onPress={() => handleSelect("pdf")}
            >
              <Ionicons name="document-outline" size={20} color={colors.primary} />
              <Text style={styles.documentsButtonText}>Browse PDF</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg
  },
  title: {
    ...typography.subtitle,
    marginBottom: spacing.md,
    textAlign: "center"
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
    backgroundColor: colors.background,
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
    marginBottom: spacing.md
  },
  documentsButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "600"
  },
  cancelButton: {
    alignItems: "center",
    paddingVertical: spacing.md
  },
  cancelText: {
    ...typography.body,
    color: colors.textMuted
  }
});
