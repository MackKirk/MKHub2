import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
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
import { normalizeDefinition, validateRequiredFields } from "../../lib/safetyFormTemplate";
import {
  clearFieldworkDraft,
  loadFieldworkDraft,
  saveFieldworkDraft,
  type FieldworkLocalDraft
} from "../../lib/fieldworkDraftStore";
import {
  getFieldworkRecord,
  isEditableFieldworkStatus,
  kindLabel,
  patchFieldworkRecord,
  statusLabel,
  submitFieldworkRecord
} from "../../services/fieldwork";
import { getApiErrorRowVersion, toApiError } from "../../services/api";
import { useAuth } from "../../hooks/useAuth";
import type { RootStackParamList } from "../../navigation/types";
import type { FieldworkRecord } from "../../types/fieldwork";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius } from "../../theme/radius";
import { typography } from "../../theme/typography";

type Route = RouteProp<RootStackParamList, "FieldworkRecordDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList, "FieldworkRecordDetail">;

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
  const [conflictHold, setConflictHold] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editable = !!record && isEditableFieldworkStatus(record.status) && canWrite;
  const definition = useMemo(
    () => normalizeDefinition(record?.form_definition_snapshot),
    [record?.form_definition_snapshot]
  );

  const persistLocal = useCallback(
    async (next?: Partial<FieldworkLocalDraft>) => {
      const draft: FieldworkLocalDraft = {
        recordId,
        projectId,
        formPayload: next?.formPayload ?? payload,
        finalComments: next?.finalComments ?? finalComments,
        pendingPhotos: next?.pendingPhotos ?? [],
        updatedAt: new Date().toISOString()
      };
      await saveFieldworkDraft(draft);
    },
    [finalComments, payload, projectId, recordId]
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
      const [row, draft] = await Promise.all([
        getFieldworkRecord(projectId, recordId),
        loadFieldworkDraft(projectId, recordId)
      ]);

      const preserve =
        !!draft &&
        JSON.stringify(draft.formPayload) !== JSON.stringify(row.form_payload || {});

      applyRecord(row, preserve);
      if (draft && preserve) {
        setPayload(draft.formPayload || {});
        setFinalComments(draft.finalComments || "");
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

  const handleSubmit = async () => {
    if (!record || !editable) return;
    const missing = validateRequiredFields(definition, payload);
    if (missing.length) {
      Alert.alert("Missing required fields", missing.join("\n"));
      return;
    }

    try {
      setSubmitting(true);
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
              Your unsaved edits are still on this screen. Retry save/submit, or discard and reload the
              server version.
            </Text>
            <View style={styles.bannerActions}>
              <MKButton title="Keep mine" size="compact" onPress={() => setConflictHold(false)} />
              <MKButton
                title="Discard & reload"
                variant="secondary"
                size="compact"
                onPress={discardLocalReload}
              />
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
          enableFieldworkPhraseInsert={editable}
        />
      </ScrollView>

      {editable ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <MKButton
            title={submitting ? "Submitting…" : "Submit for review"}
            onPress={handleSubmit}
            disabled={submitting}
          />
        </View>
      ) : null}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm },
  sectionTitle: { ...typography.subtitle, marginTop: spacing.sm },
  banner: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.xs
  },
  bannerWarn: { borderColor: "#F59E0B", backgroundColor: "#FFFBEB" },
  bannerTitle: { ...typography.body, fontWeight: "700", color: colors.textBody },
  bannerBody: { ...typography.bodySmall, color: colors.textMuted },
  bannerActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.background
  }
});
