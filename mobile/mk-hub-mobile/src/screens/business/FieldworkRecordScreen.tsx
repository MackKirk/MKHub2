import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenLayout } from "../../components/ScreenLayout";
import { MKPageHeader } from "../../components/MKPageHeader";
import { MKButton } from "../../components/MKButton";
import { MKDynamicForm } from "../../components/MKDynamicForm";
import { MKImageSourcePickerModal, type ImageSourceChoice } from "../../components/MKImageSourcePickerModal";
import { pickMediaFromSource } from "../../lib/pickMediaFromSource";
import { normalizeDefinition, validateRequiredFields } from "../../lib/safetyFormTemplate";
import { resolveFileUrl } from "../../lib/fileUrls";
import {
  clearFieldworkDraft,
  loadFieldworkDraft,
  newClientMutationId,
  newPendingPhotoId,
  saveFieldworkDraft,
  type FieldworkLocalDraft
} from "../../lib/fieldworkDraftStore";
import {
  createFieldworkPhoto,
  getFieldworkPhraseCatalogs,
  getFieldworkRecord,
  getPhraseLeafOptions,
  isEditableFieldworkStatus,
  kindLabel,
  patchFieldworkPhoto,
  patchFieldworkRecord,
  statusLabel,
  submitFieldworkRecord
} from "../../services/fieldwork";
import { uploadFieldworkPhotoFile } from "../../services/fieldworkUpload";
import { getApiErrorRowVersion, toApiError } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import type { RootStackParamList } from "../../navigation/types";
import type {
  FieldworkEntryType,
  FieldworkPendingPhoto,
  FieldworkPhraseOption,
  FieldworkPhoto,
  FieldworkRecord
} from "../../types/fieldwork";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius } from "../../theme/radius";
import { typography } from "../../theme/typography";

type Route = RouteProp<RootStackParamList, "FieldworkRecordDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList, "FieldworkRecordDetail">;

function entryTypeLabel(t: string): string {
  return t === "work_performed" ? "Work Performed" : "Observed Conditions";
}

export const FieldworkRecordScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { projectId, recordId, canWrite = true } = route.params;
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [record, setRecord] = useState<FieldworkRecord | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [finalComments, setFinalComments] = useState("");
  const [rowVersion, setRowVersion] = useState(1);
  const [pendingPhotos, setPendingPhotos] = useState<FieldworkPendingPhoto[]>([]);
  const [lastPhraseByEntryType, setLastPhraseByEntryType] = useState<
    Partial<Record<FieldworkEntryType, string>>
  >({});
  const [entryType, setEntryType] = useState<FieldworkEntryType>("observation");
  const [phraseOptions, setPhraseOptions] = useState<Record<FieldworkEntryType, FieldworkPhraseOption[]>>({
    observation: [],
    work_performed: []
  });
  const [phraseSearch, setPhraseSearch] = useState("");
  const [selectedPhraseId, setSelectedPhraseId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [batchTargetIds, setBatchTargetIds] = useState<string[]>([]);
  const [conflictHold, setConflictHold] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadingRef = useRef(false);

  const editable = !!record && isEditableFieldworkStatus(record.status) && canWrite;
  const definition = useMemo(
    () => normalizeDefinition(record?.form_definition_snapshot),
    [record?.form_definition_snapshot]
  );
  const settings = useMemo(() => {
    const s =
      record?.settings_snapshot && typeof record.settings_snapshot === "object"
        ? record.settings_snapshot
        : {};
    return {
      require_final_comments: Boolean((s as { require_final_comments?: boolean }).require_final_comments),
      require_min_photos: Number((s as { require_min_photos?: number }).require_min_photos || 0),
      default_pictures_folder: String(
        (s as { default_pictures_folder?: string }).default_pictures_folder || "Proposal Photos"
      )
    };
  }, [record?.settings_snapshot]);

  const serverPhotos: FieldworkPhoto[] = Array.isArray(record?.photos) ? record!.photos! : [];
  const incompleteUploads = pendingPhotos.filter((p) => p.status !== "linked");
  const hasIncompleteUploads = incompleteUploads.some((p) => p.status !== "failed") ||
    pendingPhotos.some((p) => p.status === "uploading" || p.status === "queued");

  const persistLocal = useCallback(
    async (next?: Partial<FieldworkLocalDraft>) => {
      const draft: FieldworkLocalDraft = {
        recordId,
        projectId,
        formPayload: next?.formPayload ?? payload,
        finalComments: next?.finalComments ?? finalComments,
        pendingPhotos: next?.pendingPhotos ?? pendingPhotos,
        lastPhraseByEntryType: next?.lastPhraseByEntryType ?? lastPhraseByEntryType,
        updatedAt: new Date().toISOString()
      };
      await saveFieldworkDraft(draft);
    },
    [finalComments, lastPhraseByEntryType, payload, pendingPhotos, projectId, recordId]
  );

  const applyRecord = useCallback((row: FieldworkRecord, preserveLocal: boolean) => {
    setRecord(row);
    setRowVersion(Number(row.row_version || 1));
    if (!preserveLocal) {
      setPayload(row.form_payload && typeof row.form_payload === "object" ? { ...row.form_payload } : {});
      setFinalComments(row.final_comments || "");
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [row, draft, catalogs] = await Promise.all([
        getFieldworkRecord(projectId, recordId),
        loadFieldworkDraft(projectId, recordId),
        getFieldworkPhraseCatalogs()
      ]);
      const obsId = catalogs.observation?.list_id;
      const workId = catalogs.work_performed?.list_id;
      const [obsLeaves, workLeaves] = await Promise.all([
        obsId ? getPhraseLeafOptions(obsId) : Promise.resolve([]),
        workId ? getPhraseLeafOptions(workId) : Promise.resolve([])
      ]);
      setPhraseOptions({ observation: obsLeaves, work_performed: workLeaves });

      const preserve =
        !!draft &&
        (JSON.stringify(draft.formPayload) !== JSON.stringify(row.form_payload || {}) ||
          (draft.finalComments || "") !== (row.final_comments || "") ||
          (draft.pendingPhotos || []).some((p) => p.status !== "linked"));

      applyRecord(row, preserve);
      if (draft) {
        if (preserve) {
          setPayload(draft.formPayload || {});
          setFinalComments(draft.finalComments || "");
        }
        setPendingPhotos((draft.pendingPhotos || []).filter((p) => p.status !== "linked"));
        setLastPhraseByEntryType(draft.lastPhraseByEntryType || {});
      }
    } catch (err) {
      Alert.alert("Could not load report", toApiError(err).message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [applyRecord, navigation, projectId, recordId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Autosave draft locally + soft debounce to server when editable
  useEffect(() => {
    if (!editable || loading) return;
    void persistLocal();
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          setSaving(true);
          const row = await patchFieldworkRecord(projectId, recordId, {
            form_payload: payload,
            final_comments: finalComments,
            expected_row_version: rowVersion
          });
          setConflictHold(false);
          applyRecord(row, true);
          setRowVersion(Number(row.row_version || rowVersion));
        } catch (err) {
          if (toApiError(err).status === 409) {
            const rv = getApiErrorRowVersion(err);
            if (rv != null) setRowVersion(rv);
            setConflictHold(true);
          }
        } finally {
          setSaving(false);
        }
      })();
    }, 1600);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [editable, loading, payload, finalComments]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredPhrases = useMemo(() => {
    const q = phraseSearch.trim().toLowerCase();
    const list = phraseOptions[entryType] || [];
    if (!q) return list;
    return list.filter((o) => (o.label || "").toLowerCase().includes(q));
  }, [entryType, phraseOptions, phraseSearch]);

  const processQueue = useCallback(
    async (queue: FieldworkPendingPhoto[]) => {
      if (uploadingRef.current) return;
      uploadingRef.current = true;
      let currentRowVersion = rowVersion;
      let working = [...queue];
      try {
        for (let i = 0; i < working.length; i++) {
          const item = working[i];
          if (item.status === "linked") continue;
          if (!item.phraseItemId) {
            // Stay queued — do not mark failed; user can classify and retry without alarm noise.
            working[i] = { ...item, status: "queued", error: "Classification required" };
            setPendingPhotos([...working]);
            await persistLocal({ pendingPhotos: working });
            continue;
          }
          working[i] = { ...item, status: "uploading", error: undefined };
          setPendingPhotos([...working]);
          try {
            let fileObjectId = item.fileObjectId;
            let clientFileId = item.clientFileId || null;
            if (!fileObjectId) {
              const uploaded = await uploadFieldworkPhotoFile({
                projectId,
                file: { uri: item.uri, name: item.name, type: item.type },
                category: settings.default_pictures_folder
              });
              fileObjectId = uploaded.fileObjectId;
              clientFileId = uploaded.clientFileId;
              // Persist FileObject id immediately so a crash/retry does not re-upload bytes.
              working[i] = {
                ...working[i],
                fileObjectId,
                clientFileId: clientFileId || undefined,
                status: "uploading"
              };
              setPendingPhotos([...working]);
              await persistLocal({ pendingPhotos: working });
            }
            await createFieldworkPhoto(projectId, recordId, {
              file_object_id: fileObjectId!,
              client_file_id: clientFileId,
              entry_type: item.entryType,
              phrase_item_id: item.phraseItemId,
              classification_item_id: item.classificationItemId || null,
              extra_notes: item.extraNotes || null,
              client_mutation_id: item.clientMutationId,
              expected_row_version: currentRowVersion
            });
            currentRowVersion += 1;
            working[i] = {
              ...working[i],
              status: "linked",
              fileObjectId,
              clientFileId: clientFileId || undefined,
              error: undefined
            };
            setPendingPhotos([...working]);
            setLastPhraseByEntryType((prev) => ({
              ...prev,
              [item.entryType]: item.phraseItemId || prev[item.entryType]
            }));
          } catch (err) {
            if (toApiError(err).status === 409) {
              const rv = getApiErrorRowVersion(err);
              if (rv != null) currentRowVersion = rv;
              setConflictHold(true);
            }
            // Keep any FileObject/ClientFile already obtained so retry is idempotent.
            working[i] = {
              ...working[i],
              status: "failed",
              error: toApiError(err).message
            };
            setPendingPhotos([...working]);
          }
          await persistLocal({ pendingPhotos: working });
        }
        setRowVersion(currentRowVersion);
        // Refresh server photos; keep failed/queued locals
        const fresh = await getFieldworkRecord(projectId, recordId);
        applyRecord(fresh, true);
        setRowVersion(Number(fresh.row_version || currentRowVersion));
        const still = working.filter((p) => p.status !== "linked");
        setPendingPhotos(still);
        await persistLocal({ pendingPhotos: still });
      } finally {
        uploadingRef.current = false;
      }
    },
    [applyRecord, persistLocal, projectId, recordId, rowVersion, settings.default_pictures_folder]
  );

  const enqueuePickedFiles = async (files: { uri: string; name: string; type: string }[]) => {
    if (!files.length) return;
    const phrase = selectedPhraseId || lastPhraseByEntryType[entryType] || null;
    const added: FieldworkPendingPhoto[] = files.map((f) => ({
      localId: newPendingPhotoId(),
      clientMutationId: newClientMutationId(),
      uri: f.uri,
      name: f.name,
      type: f.type,
      entryType,
      phraseItemId: phrase,
      status: phrase ? "queued" : "queued",
      createdAt: new Date().toISOString()
    }));
    const next = [...pendingPhotos, ...added];
    setPendingPhotos(next);
    await persistLocal({ pendingPhotos: next });
    if (phrase) {
      void processQueue(next);
    } else {
      setBatchTargetIds(added.map((a) => a.localId));
      setClassifyOpen(true);
    }
  };

  const onPickSource = async (source: ImageSourceChoice) => {
    setPickerOpen(false);
    if (source === "pdf") {
      Alert.alert("Photos only", "Fieldwork photo observations accept images.");
      return;
    }
    const files = await pickMediaFromSource(source, { allowMultiple: true });
    const images = files.filter((f) => (f.type || "").startsWith("image/"));
    await enqueuePickedFiles(images);
  };

  const applyPhraseToTargets = async (phraseId: string) => {
    const targets = new Set(batchTargetIds);
    const next = pendingPhotos.map((p) =>
      targets.size === 0 || targets.has(p.localId)
        ? { ...p, phraseItemId: phraseId, status: p.status === "failed" ? "queued" : p.status }
        : p
    );
    // Also allow reclassify selected server photos
    if (targets.size === 0 && serverPhotos.length && editable) {
      // no-op for empty selection
    }
    setSelectedPhraseId(phraseId);
    setLastPhraseByEntryType((prev) => ({ ...prev, [entryType]: phraseId }));
    setPendingPhotos(next);
    setClassifyOpen(false);
    await persistLocal({
      pendingPhotos: next,
      lastPhraseByEntryType: { ...lastPhraseByEntryType, [entryType]: phraseId }
    });
    void processQueue(next);

    // Batch patch already-linked server photos if selected via photoId keys
    for (const id of batchTargetIds) {
      if (!id.startsWith("srv_")) continue;
      const photoId = id.slice(4);
      try {
        await patchFieldworkPhoto(projectId, recordId, photoId, {
          entry_type: entryType,
          phrase_item_id: phraseId,
          expected_row_version: rowVersion
        });
        const fresh = await getFieldworkRecord(projectId, recordId);
        applyRecord(fresh, true);
        setRowVersion(Number(fresh.row_version || rowVersion));
      } catch (err) {
        if (toApiError(err).status === 409) {
          const rv = getApiErrorRowVersion(err);
          if (rv != null) setRowVersion(rv);
          setConflictHold(true);
        }
      }
    }
  };

  const handleSubmit = async () => {
    if (!record || !editable) return;
    if (hasIncompleteUploads || pendingPhotos.some((p) => p.status === "failed" || p.status === "queued")) {
      Alert.alert(
        "Uploads incomplete",
        "Finish classifying and uploading all photos before submitting."
      );
      return;
    }
    const missing = validateRequiredFields(definition, payload);
    if (missing.length) {
      Alert.alert("Missing required fields", missing.join("\n"));
      return;
    }
    if (settings.require_final_comments && !finalComments.trim()) {
      Alert.alert("Final comments required", "Please add final comments before submit.");
      return;
    }
    const photoCount = serverPhotos.length;
    if (settings.require_min_photos > 0 && photoCount < settings.require_min_photos) {
      Alert.alert(
        "More photos needed",
        `This template requires at least ${settings.require_min_photos} classified photo(s).`
      );
      return;
    }
    const unclassified = serverPhotos.filter((p) => !(p.phrase_text_snapshot || "").trim());
    if (unclassified.length) {
      Alert.alert("Unclassified photos", "Every photo needs an approved phrase before submit.");
      return;
    }

    try {
      setSubmitting(true);
      // Flush latest draft first
      const saved = await patchFieldworkRecord(projectId, recordId, {
        form_payload: payload,
        final_comments: finalComments,
        expected_row_version: rowVersion
      });
      const row = await submitFieldworkRecord(projectId, recordId, {
        final_comments: finalComments,
        expected_row_version: Number(saved.row_version || rowVersion)
      });
      applyRecord(row, false);
      await clearFieldworkDraft(projectId, recordId);
      setPendingPhotos([]);
      setConflictHold(false);
      Alert.alert("Submitted", "Report sent for review.");
    } catch (err) {
      if (toApiError(err).status === 409) {
        const rv = getApiErrorRowVersion(err);
        if (rv != null) setRowVersion(rv);
        setConflictHold(true);
        Alert.alert(
          "Edit conflict",
          "Someone else changed this report. Your local edits are still here — save/submit again after reviewing."
        );
      } else {
        Alert.alert("Could not submit", toApiError(err).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const discardLocalReload = async () => {
    setConflictHold(false);
    await clearFieldworkDraft(projectId, recordId);
    setPendingPhotos([]);
    await load();
  };

  if (loading || !record) {
    return (
      <ScreenLayout>
        <MKPageHeader title="Field report" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <MKPageHeader
        title={kindLabel(record.kind)}
        subtitle={`${statusLabel(record.status)}${saving ? " · Saving…" : ""}`}
        onBack={() => navigation.goBack()}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
      >
        {conflictHold ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Edit conflict</Text>
            <Text style={styles.bannerBody}>
              Your unsaved edits are still on this screen. Retry save/submit, or discard and reload the server version.
            </Text>
            <View style={styles.bannerActions}>
              <MKButton title="Keep mine" size="compact" onPress={() => setConflictHold(false)} />
              <MKButton title="Discard & reload" variant="secondary" size="compact" onPress={discardLocalReload} />
            </View>
          </View>
        ) : null}

        {record.status === "changes_requested" && record.review_note ? (
          <View style={[styles.banner, styles.bannerWarn]}>
            <Text style={styles.bannerTitle}>Changes requested</Text>
            <Text style={styles.bannerBody}>{record.review_note}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Form</Text>
        <MKDynamicForm
          definition={definition}
          payload={payload}
          onChange={setPayload}
          readOnly={!editable}
          projectId={projectId}
          token={token || ""}
        />

        <Text style={styles.sectionTitle}>Final comments</Text>
        <TextInput
          style={[styles.comments, !editable && styles.commentsReadonly]}
          multiline
          editable={editable}
          value={finalComments}
          onChangeText={setFinalComments}
          placeholder={settings.require_final_comments ? "Required before submit" : "Optional notes"}
          placeholderTextColor={colors.textMuted}
        />

        <View style={styles.photosHeader}>
          <Text style={styles.sectionTitle}>Photo observations</Text>
          {editable ? (
            <MKButton title="Add photos" size="compact" onPress={() => setPickerOpen(true)} />
          ) : null}
        </View>
        <Text style={styles.hint}>
          Classify with Observed Conditions or Work Performed. Uploads use the shared Files storage path.
        </Text>

        <View style={styles.kindRow}>
          {(["observation", "work_performed"] as FieldworkEntryType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.kindChip, entryType === t && styles.kindChipActive]}
              onPress={() => setEntryType(t)}
              disabled={!editable}
            >
              <Text style={[styles.kindChipText, entryType === t && styles.kindChipTextActive]}>
                {entryTypeLabel(t)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {editable ? (
          <View style={styles.quickRow}>
            <MKButton
              title="Classify / last phrase"
              variant="secondary"
              size="compact"
              onPress={() => {
                setBatchTargetIds([]);
                setClassifyOpen(true);
              }}
            />
            {lastPhraseByEntryType[entryType] ? (
              <MKButton
                title="Reuse last phrase"
                size="compact"
                onPress={() => {
                  const pid = lastPhraseByEntryType[entryType];
                  if (pid) void applyPhraseToTargets(pid);
                }}
              />
            ) : null}
          </View>
        ) : null}

        {incompleteUploads.length > 0 ? (
          <View style={styles.pendingBox}>
            <Text style={styles.bannerTitle}>Uploads</Text>
            {incompleteUploads.map((p) => (
              <View key={p.localId} style={styles.pendingRow}>
                <Image source={{ uri: p.uri }} style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{entryTypeLabel(p.entryType)}</Text>
                  <Text style={styles.rowMeta}>
                    {p.status}
                    {p.phraseItemId ? "" : " · needs classification"}
                    {p.error ? ` · ${p.error}` : ""}
                  </Text>
                </View>
                {p.status === "failed" || !p.phraseItemId ? (
                  <TouchableOpacity
                    onPress={() => {
                      setBatchTargetIds([p.localId]);
                      setEntryType(p.entryType);
                      setClassifyOpen(true);
                    }}
                  >
                    <Text style={styles.link}>Classify</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {pendingPhotos.some((p) => p.status === "failed" && p.phraseItemId) ? (
              <MKButton
                title="Retry failed uploads"
                size="compact"
                onPress={() => {
                  const next = pendingPhotos.map((p) =>
                    p.status === "failed" && p.phraseItemId ? { ...p, status: "queued" as const, error: undefined } : p
                  );
                  setPendingPhotos(next);
                  void processQueue(next);
                }}
              />
            ) : null}
          </View>
        ) : null}

        {serverPhotos.length === 0 && pendingPhotos.length === 0 ? (
          <Text style={styles.empty}>No photographs yet.</Text>
        ) : (
          <View style={styles.photoGrid}>
            {serverPhotos.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.photoCard}
                disabled={!editable}
                onLongPress={() => {
                  if (!editable) return;
                  setBatchTargetIds([`srv_${p.id}`]);
                  setEntryType((p.entry_type as FieldworkEntryType) || "observation");
                  setClassifyOpen(true);
                }}
              >
                <Image
                  source={{
                    uri:
                      resolveFileUrl(`/files/${p.file_object_id}/thumbnail?w=360`, token) ||
                      undefined
                  }}
                  style={styles.photoImg}
                />
                <Text style={styles.photoPhrase} numberOfLines={2}>
                  {p.phrase_text_snapshot || "Unclassified"}
                </Text>
                <Text style={styles.rowMeta}>{entryTypeLabel(String(p.entry_type || ""))}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {editable ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <MKButton
            title={submitting ? "Submitting…" : "Submit for review"}
            onPress={handleSubmit}
            disabled={submitting || hasIncompleteUploads}
          />
        </View>
      ) : null}

      <MKImageSourcePickerModal
        visible={pickerOpen}
        mode="image"
        onClose={() => setPickerOpen(false)}
        onSelect={onPickSource}
      />

      <Modal visible={classifyOpen} transparent animationType="slide" onRequestClose={() => setClassifyOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.md }]}>
            <Text style={styles.sectionTitle}>Select phrase · {entryTypeLabel(entryType)}</Text>
            <TextInput
              style={styles.search}
              value={phraseSearch}
              onChangeText={setPhraseSearch}
              placeholder="Search phrases…"
              placeholderTextColor={colors.textMuted}
            />
            <ScrollView style={{ maxHeight: 360 }}>
              {filteredPhrases.length === 0 ? (
                <Text style={styles.empty}>No phrases in this catalog yet. Ask R&amp;M to add them.</Text>
              ) : (
                filteredPhrases.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.phraseRow}
                    onPress={() => void applyPhraseToTargets(opt.value)}
                  >
                    <Text style={styles.phraseLabel}>{opt.label}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <MKButton title="Cancel" variant="secondary" onPress={() => setClassifyOpen(false)} />
          </View>
        </View>
      </Modal>
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  sectionTitle: { ...typography.subtitle, marginTop: spacing.sm },
  hint: { ...typography.caption, color: colors.textMuted },
  comments: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...typography.body,
    textAlignVertical: "top",
    backgroundColor: colors.card
  },
  commentsReadonly: { backgroundColor: colors.iconMutedBg },
  photosHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm
  },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kindChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  kindChipActive: { borderColor: colors.primary, backgroundColor: colors.drawerActiveBg },
  kindChipText: { ...typography.caption, color: colors.textBody },
  kindChipTextActive: { color: colors.primary, fontWeight: "700" },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pendingBox: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.card
  },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.iconMutedBg },
  rowTitle: { ...typography.bodySmall, fontFamily: typography.subtitle.fontFamily },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  link: { ...typography.caption, color: colors.primary, fontWeight: "700" },
  empty: { ...typography.bodySmall, color: colors.textMuted, textAlign: "center", padding: spacing.md },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoCard: {
    width: "47%",
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  photoImg: { width: "100%", height: 120, backgroundColor: colors.iconMutedBg },
  photoPhrase: { ...typography.caption, color: colors.textPrimary, padding: spacing.xs },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  banner: {
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.drawerActiveBg,
    gap: spacing.xs
  },
  bannerWarn: { backgroundColor: "#fff7ed" },
  bannerTitle: { ...typography.bodySmall, fontFamily: typography.subtitle.fontFamily },
  bannerBody: { ...typography.caption, color: colors.textBody },
  bannerActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)"
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm
  },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...typography.body
  },
  phraseRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  phraseLabel: { ...typography.bodySmall }
});
