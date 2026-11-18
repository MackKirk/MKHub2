import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { buildAuthenticatedFileUrl } from "../lib/fileUrls";
import { pickMediaFromSource } from "../lib/pickMediaFromSource";
import { uploadSafetyFormFile } from "../services/safetyUpload";
import { MKButton } from "./MKButton";
import {
  MKFieldworkPhraseLibraryPanel,
  type MKFieldworkPhraseLibraryPanelHandle
} from "./MKFieldworkPhraseLibraryPanel";
import { MKImageSourcePickerModal } from "./MKImageSourcePickerModal";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

const MAX_IMAGES = 8;

export type FieldworkNoteModalMode = "comment" | "images";

type Props = {
  visible: boolean;
  mode: FieldworkNoteModalMode;
  fieldLabel: string;
  disabled?: boolean;
  text: string;
  imageIds: string[];
  onTextChange: (text: string) => void;
  onImageIdsChange: (updater: (prev: string[]) => string[]) => void;
  projectId: string;
  inspectionId?: string;
  token?: string | null;
  onClose: () => void;
};

export const MKFieldworkFieldNoteModal: React.FC<Props> = ({
  visible,
  mode,
  fieldLabel,
  disabled = false,
  text,
  imageIds,
  onTextChange,
  onImageIdsChange,
  projectId,
  inspectionId,
  token,
  onClose
}) => {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [draftText, setDraftText] = useState(text);
  const [selectedPhraseCount, setSelectedPhraseCount] = useState(0);
  const draftTextRef = useRef(text);
  const libraryRef = useRef<MKFieldworkPhraseLibraryPanelHandle>(null);

  useEffect(() => {
    if (visible) {
      setDraftText(text);
      draftTextRef.current = text;
      setSelectedPhraseCount(0);
    }
  }, [visible, text]);

  const title = useMemo(() => {
    const base = fieldLabel || "Field note";
    return mode === "images" ? `${base} · Images` : `${base} · Comment`;
  }, [fieldLabel, mode]);

  const insertPhrase = (phrase: string) => {
    const current = draftTextRef.current || "";
    const needsPad = current.length > 0 && !/\s$/.test(current);
    const next = `${current}${needsPad ? "\n" : ""}${phrase}`;
    draftTextRef.current = next;
    setDraftText(next);
    onTextChange(next);
  };

  const handleSourceSelect = async (source: "camera" | "gallery" | "pdf") => {
    if (source === "pdf") return;
    try {
      setBusy(true);
      const files = await pickMediaFromSource(source, { allowMultiple: true });
      if (!files.length) return;
      for (const file of files) {
        if (imageIds.length >= MAX_IMAGES) {
          Alert.alert("Limit reached", `You can attach at most ${MAX_IMAGES} images.`);
          break;
        }
        const id = await uploadSafetyFormFile({ projectId, inspectionId, file });
        onImageIdsChange((prev) => {
          if (prev.length >= MAX_IMAGES || prev.includes(id)) return prev;
          return [...prev, id].slice(0, MAX_IMAGES);
        });
      }
    } catch {
      Alert.alert("Upload failed", "Could not upload image.");
    } finally {
      setBusy(false);
    }
  };

  const discardClose = () => {
    if (mode === "comment" && draftTextRef.current !== text) {
      onTextChange(draftTextRef.current);
    }
    onClose();
  };

  const handleDone = () => {
    if (mode === "comment" && !disabled) {
      libraryRef.current?.commitSelection();
    } else if (mode === "comment" && draftTextRef.current !== text) {
      onTextChange(draftTextRef.current);
    }
    onClose();
  };

  const doneTitle =
    mode === "comment" && selectedPhraseCount > 0
      ? `Done · insert ${selectedPhraseCount} phrase${selectedPhraseCount === 1 ? "" : "s"}`
      : "Done";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleDone}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.subtitle}>
              {mode === "images"
                ? "Attach photos for this field item."
                : "Write a short note or pick phrases below, then tap Done."}
            </Text>
          </View>
          <TouchableOpacity onPress={discardClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textBody} />
          </TouchableOpacity>
        </View>

        {mode === "comment" ? (
          <View style={styles.commentBody}>
            <Text style={styles.label}>Comment</Text>
            <TextInput
              style={styles.textArea}
              value={draftText}
              onChangeText={(v) => {
                draftTextRef.current = v;
                setDraftText(v);
                onTextChange(v);
              }}
              placeholder="Short note or inserted phrase library text…"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!disabled}
              textAlignVertical="top"
            />
            <Text style={[styles.label, { marginTop: spacing.sm }]}>Phrase library</Text>
            <View style={styles.libraryWrap}>
              <MKFieldworkPhraseLibraryPanel
                ref={libraryRef}
                active={visible}
                disabled={disabled}
                onInsert={insertPhrase}
                onSelectionCountChange={setSelectedPhraseCount}
              />
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.imagesBody}>
            <TouchableOpacity
              style={styles.uploadCard}
              disabled={disabled || busy || !projectId}
              onPress={() => setShowSourcePicker(true)}
            >
              {busy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={28} color={colors.primary} />
                  <Text style={styles.uploadTitle}>Attach images</Text>
                  <Text style={styles.uploadHint}>Camera or gallery · {imageIds.length}/{MAX_IMAGES}</Text>
                </>
              )}
            </TouchableOpacity>
            {imageIds.length ? (
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
            ) : (
              <Text style={styles.empty}>No images attached yet.</Text>
            )}
          </ScrollView>
        )}

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <MKButton title={doneTitle} onPress={handleDone} style={styles.doneBtn} />
        </View>
      </View>

      <MKImageSourcePickerModal
        visible={showSourcePicker}
        title="Add photo"
        onClose={() => setShowSourcePicker(false)}
        onSelect={(source) => void handleSourceSelect(source)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  title: { ...typography.subtitle, color: colors.textBody },
  subtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  commentBody: { flex: 1, padding: spacing.md, gap: spacing.xs },
  label: { ...typography.caption, fontWeight: "700", color: colors.textBody },
  textArea: {
    minHeight: 72,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body
  },
  libraryWrap: { flex: 1, minHeight: 340 },
  imagesBody: { padding: spacing.md, gap: spacing.md },
  uploadCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingVertical: spacing.xl,
    alignItems: "center",
    gap: spacing.xs
  },
  uploadTitle: { ...typography.body, fontWeight: "700", color: colors.textBody },
  uploadHint: { ...typography.caption, color: colors.textMuted },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumbWrap: { position: "relative" },
  thumb: {
    width: 88,
    height: 88,
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
  empty: { ...typography.caption, color: colors.textMuted },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background
  },
  doneBtn: {
    width: "100%",
    alignSelf: "stretch"
  }
});
