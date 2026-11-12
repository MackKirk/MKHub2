import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  createFieldworkRecord,
  kindLabel,
  listFieldworkRecords,
  listFieldworkTemplates,
  statusLabel
} from "../services/fieldwork";
import { toApiError } from "../services/api";
import type { RootStackParamList } from "../navigation/types";
import type { FieldworkRecord, FieldworkRecordKind, FieldworkTemplatePick } from "../types/fieldwork";
import { MKButton } from "./MKButton";
import { MKCard } from "./MKCard";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

type Nav = NativeStackNavigationProp<RootStackParamList, "ProjectDetail">;

interface Props {
  projectId: string;
  isOpportunity: boolean;
  canWrite: boolean;
}

export const MKProjectFieldworkSection: React.FC<Props> = ({
  projectId,
  isOpportunity,
  canWrite
}) => {
  const navigation = useNavigation<Nav>();
  const preferredKind: FieldworkRecordKind = isOpportunity ? "site_assessment" : "work_report";
  const [rows, setRows] = useState<FieldworkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<FieldworkRecordKind>(preferredKind);
  const [templates, setTemplates] = useState<FieldworkTemplatePick[]>([]);
  const [pickedTemplateId, setPickedTemplateId] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRows(await listFieldworkRecords(projectId));
    } catch (err) {
      Alert.alert("Could not load field reports", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const openCreate = async () => {
    setCreateKind(preferredKind);
    setPickedTemplateId("");
    setCreateOpen(true);
    try {
      setLoadingTemplates(true);
      const all = await listFieldworkTemplates();
      setTemplates(all);
    } catch (err) {
      Alert.alert("Could not load templates", toApiError(err).message);
      setCreateOpen(false);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const templatesForKind = templates.filter(
    (t) => (t.category || "").toLowerCase() === createKind
  );

  const handleCreate = async () => {
    if (!pickedTemplateId) {
      Alert.alert("Select a template", "Choose an active Fieldwork template.");
      return;
    }
    try {
      setCreating(true);
      const row = await createFieldworkRecord(projectId, {
        kind: createKind,
        form_template_id: pickedTemplateId
      });
      setCreateOpen(false);
      await load();
      navigation.navigate("FieldworkRecordDetail", {
        projectId,
        recordId: row.id,
        canWrite
      });
    } catch (err) {
      Alert.alert("Could not create report", toApiError(err).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Field reports</Text>
          <Text style={styles.subtitle}>
            {isOpportunity
              ? "Site Assessments for quoting. Reports stay available after award."
              : "Work Reports plus any Site Assessments from the opportunity."}
          </Text>
        </View>
        {canWrite ? (
          <MKButton title="New report" onPress={openCreate} size="compact" style={styles.addButton} />
        ) : null}
      </View>

      <MKCard style={styles.card} elevated>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No field reports yet.</Text>
        ) : (
          rows.map((row) => {
            const photos = Number(row.photo_count || 0);
            return (
              <TouchableOpacity
                key={row.id}
                style={styles.row}
                onPress={() =>
                  navigation.navigate("FieldworkRecordDetail", {
                    projectId,
                    recordId: row.id,
                    canWrite
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{kindLabel(row.kind)}</Text>
                  <Text style={styles.rowMeta}>
                    {statusLabel(row.status)}
                    {row.pending_review ? " · Review pending" : ""}
                    {photos > 0 ? ` · ${photos} photo${photos === 1 ? "" : "s"}` : ""}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {row.created_by_name || "—"}
                    {row.updated_at
                      ? ` · ${new Date(row.updated_at).toLocaleString()}`
                      : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </MKCard>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New field report</Text>
            <Text style={styles.modalHint}>Report type</Text>
            <View style={styles.kindRow}>
              {(["site_assessment", "work_report"] as FieldworkRecordKind[]).map((k) => (
                <TouchableOpacity
                  key={k}
                  style={[styles.kindChip, createKind === k && styles.kindChipActive]}
                  onPress={() => {
                    setCreateKind(k);
                    setPickedTemplateId("");
                  }}
                >
                  <Text style={[styles.kindChipText, createKind === k && styles.kindChipTextActive]}>
                    {kindLabel(k)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalHint}>Template</Text>
            {loadingTemplates ? (
              <ActivityIndicator color={colors.primary} />
            ) : templatesForKind.length === 0 ? (
              <Text style={styles.empty}>No active templates for this type.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 220 }}>
                {templatesForKind.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.templateRow, pickedTemplateId === t.id && styles.templateRowActive]}
                    onPress={() => setPickedTemplateId(t.id)}
                  >
                    <Text style={styles.templateName}>
                      {t.name}
                      {t.version_label ? ` (${t.version_label})` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <MKButton title="Cancel" variant="secondary" onPress={() => setCreateOpen(false)} size="compact" />
              <MKButton
                title="Create"
                onPress={handleCreate}
                size="compact"
                disabled={!pickedTemplateId || creating}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  headerText: { flex: 1, gap: 4 },
  title: { ...typography.subtitle },
  subtitle: { ...typography.caption, color: colors.textMuted },
  addButton: { alignSelf: "flex-start" },
  card: { padding: 0, overflow: "hidden" },
  empty: { ...typography.body, color: colors.textMuted, padding: spacing.lg, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontFamily: typography.subtitle.fontFamily },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: spacing.lg
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm
  },
  modalTitle: { ...typography.subtitle },
  modalHint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
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
  kindChipTextActive: { color: colors.primary, fontWeight: "600" },
  templateRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md
  },
  templateRowActive: { backgroundColor: colors.drawerActiveBg },
  templateName: { ...typography.body },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md
  }
});
