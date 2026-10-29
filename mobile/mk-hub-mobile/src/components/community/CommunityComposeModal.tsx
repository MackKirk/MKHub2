import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MKImageSourcePickerModal } from "../MKImageSourcePickerModal";
import { pickMediaFromSource } from "../../lib/pickMediaFromSource";
import { createCommunityPost, uploadCommunityPhoto } from "../../services/community";
import { toApiError } from "../../services/api";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { PickedMediaFile } from "../../lib/pickMediaFromSource";

function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

interface CommunityComposeModalProps {
  visible: boolean;
  onClose: () => void;
  onPublished: () => void;
}

export const CommunityComposeModal: React.FC<CommunityComposeModalProps> = ({
  visible,
  onClose,
  onPublished
}) => {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<PickedMediaFile | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  const reset = () => {
    setTitle("");
    setMessage("");
    setPhoto(null);
    setPosting(false);
  };

  const close = () => {
    if (posting) return;
    reset();
    onClose();
  };

  const pickPhoto = async (source: "camera" | "gallery" | "pdf") => {
    if (source === "pdf") return;
    const files = await pickMediaFromSource(source, { allowMultiple: false });
    if (files[0]) setPhoto(files[0]);
  };

  const publish = async () => {
    const trimmedTitle = title.trim();
    const trimmedMessage = message.trim();
    if (!trimmedTitle) {
      Alert.alert("Title required", "Add a short title for the post.");
      return;
    }
    if (!trimmedMessage) {
      Alert.alert("Message required", "Write what you want to share.");
      return;
    }
    try {
      setPosting(true);
      const photoFileId = photo ? await uploadCommunityPhoto(photo) : null;
      await createCommunityPost({
        title: trimmedTitle,
        content: plainTextToHtml(trimmedMessage),
        photoFileId
      });
      reset();
      onPublished();
    } catch (err) {
      Alert.alert("Could not publish", toApiError(err).message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <Pressable onPress={close} hitSlop={8} disabled={posting} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>New post</Text>
          <Pressable
            onPress={() => {
              void publish();
            }}
            disabled={posting}
            style={[styles.publishBtn, posting && styles.publishBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Publish"
          >
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.publishText}>Publish</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + spacing.xl }
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What is this about?"
            placeholderTextColor={colors.textMuted}
            style={styles.titleInput}
            maxLength={200}
            editable={!posting}
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Write the update"
            placeholderTextColor={colors.textMuted}
            style={styles.messageInput}
            multiline
            textAlignVertical="top"
            editable={!posting}
          />

          <Text style={styles.label}>Photo</Text>
          {photo ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: photo.uri }} style={styles.preview} />
              <Pressable
                style={styles.removePhoto}
                onPress={() => setPhoto(null)}
                disabled={posting}
                accessibilityLabel="Remove photo"
              >
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.photoBtn}
              onPress={() => setSourceOpen(true)}
              disabled={posting}
              accessibilityRole="button"
              accessibilityLabel="Add photo"
            >
              <Ionicons name="camera-outline" size={22} color={colors.homeAccent} />
              <Text style={styles.photoBtnText}>Add photo</Text>
            </Pressable>
          )}
          <Text style={styles.hint}>Camera or gallery. The post goes to everyone.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <MKImageSourcePickerModal
        visible={sourceOpen}
        title="Add photo"
        mode="image"
        onClose={() => setSourceOpen(false)}
        onSelect={(source) => {
          void pickPhoto(source);
        }}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  headerTitle: {
    flex: 1,
    ...typography.subtitle,
    color: colors.textPrimary
  },
  publishBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.homeAccent,
    alignItems: "center",
    justifyContent: "center"
  },
  publishBtnDisabled: {
    opacity: 0.6
  },
  publishText: {
    ...typography.buttonSmall,
    color: "#fff"
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: spacing.sm
  },
  titleInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  messageInput: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 140
  },
  photoBtn: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  photoBtnText: {
    ...typography.buttonSmall,
    color: colors.homeAccent
  },
  previewWrap: {
    borderRadius: 12,
    overflow: "hidden",
    alignSelf: "flex-start"
  },
  preview: {
    width: 180,
    height: 140,
    backgroundColor: "#F3F4F6"
  },
  removePhoto: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center"
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted
  }
});
