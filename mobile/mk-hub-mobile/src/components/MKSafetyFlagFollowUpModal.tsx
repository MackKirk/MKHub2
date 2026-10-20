import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  createInspectionFollowUp,
  getFollowUpFormTemplates,
  getFormTemplate,
  type SafetyFollowUp
} from "../services/safety";
import { normalizeDefinition, validateRequiredFields } from "../lib/safetyFormTemplate";
import {
  employeeDisplayName,
  fetchEmployees,
  sortEmployeesByDisplayName,
  type EmployeeListItem
} from "../services/settings";
import { toApiError } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { MKButton } from "./MKButton";
import { MKDynamicSafetyForm } from "./MKDynamicSafetyForm";
import { MKSafetySelectModal } from "./MKSafetySelectModal";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

export type FollowUpProjectInfo = {
  name?: string;
  address?: string;
  address_city?: string;
  address_province?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  projectId: string;
  inspectionId: string;
  fieldKey: string;
  fieldLabel?: string;
  fieldRequired?: boolean;
  existingFollowUps: SafetyFollowUp[];
  canWrite: boolean;
  token?: string | null;
  projectInfo?: FollowUpProjectInfo;
  sourceInspectionDate?: string | null;
  sourceTemplateName?: string | null;
  initialFollowUpId?: string | null;
  onChanged: () => void;
};

type Step = "pick" | "compose" | "view";

function formatWhen(iso?: string | null): string {
  if (!iso) return new Date().toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function locationLine(info?: FollowUpProjectInfo, row?: SafetyFollowUp | null): string {
  const parts = [
    info?.address || row?.project_address,
    info?.address_city || row?.project_address_city,
    info?.address_province || row?.project_address_province
  ].filter((x) => (x || "").trim());
  return parts.join(", ") || "—";
}

function withRequiredWorkerSignature<T extends ReturnType<typeof normalizeDefinition>>(def: T): T {
  return {
    ...def,
    signature_policy: {
      ...def.signature_policy,
      worker: {
        mode: def.signature_policy?.worker?.mode || "drawn",
        required: true
      }
    }
  };
}

const InformationBlock: React.FC<{
  projectName: string;
  location: string;
  whenIso?: string | null;
}> = ({ projectName, location, whenIso }) => (
  <View style={styles.infoCard}>
    <Text style={styles.blockEyebrow}>Information</Text>
    <View style={styles.infoRow}>
      <Ionicons name="business-outline" size={16} color={colors.textMuted} />
      <Text style={styles.infoText}>{projectName || "—"}</Text>
    </View>
    <View style={styles.infoRow}>
      <Ionicons name="location-outline" size={16} color={colors.textMuted} />
      <Text style={styles.infoText}>{location}</Text>
    </View>
    <View style={styles.infoRow}>
      <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
      <Text style={styles.infoText}>{formatWhen(whenIso)}</Text>
    </View>
  </View>
);

const FlaggedBlock: React.FC<{
  fieldLabel: string;
  required?: boolean;
  displayValue?: string;
  sourceTemplateName?: string | null;
  sourceInspectionDate?: string | null;
}> = ({ fieldLabel, required, displayValue, sourceTemplateName, sourceInspectionDate }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.flaggedBox}>
      <TouchableOpacity style={styles.flaggedHeader} onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.flaggedTitle}>Flagged Form Item</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#92400E" />
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.flaggedBodyWrap}>
          <Text style={styles.flaggedBody}>{fieldLabel}</Text>
          {required ? <Text style={styles.requiredHint}>*Required</Text> : null}
          {displayValue ? <Text style={styles.flaggedDisplay}>{displayValue}</Text> : null}
          {sourceTemplateName ? <Text style={styles.flaggedMeta}>{sourceTemplateName}</Text> : null}
          {sourceInspectionDate ? (
            <Text style={styles.flaggedMeta}>{formatWhen(sourceInspectionDate)}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

export const MKSafetyFlagFollowUpModal: React.FC<Props> = ({
  visible,
  onClose,
  projectId,
  inspectionId,
  fieldKey,
  fieldLabel,
  fieldRequired,
  existingFollowUps,
  canWrite,
  token,
  projectInfo,
  sourceInspectionDate,
  sourceTemplateName,
  initialFollowUpId,
  onChanged
}) => {
  const { user } = useAuth();
  const signerDisplayName = useMemo(() => {
    const parts = [user?.first_name, user?.last_name].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return user?.username || user?.email || "";
  }, [user]);

  const [step, setStep] = useState<Step>("pick");
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; version_label?: string }>>(
    []
  );
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [pickedTemplateId, setPickedTemplateId] = useState("");
  const [composeDef, setComposeDef] = useState<ReturnType<typeof normalizeDefinition> | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [dueDate, setDueDate] = useState("");
  const [followUpLabel, setFollowUpLabel] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeLabel, setAssigneeLabel] = useState("");
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [assigneeModalOpen, setAssigneeModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<SafetyFollowUp | null>(null);
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);
  const [existingGateConsumed, setExistingGateConsumed] = useState(false);

  const fieldFollowUps = useMemo(
    () => existingFollowUps.filter((f) => f.source_field_key === fieldKey),
    [existingFollowUps, fieldKey]
  );

  const filteredTemplates = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return templates;
    return templates.filter((t) => (t.name || "").toLowerCase().includes(s));
  }, [templates, search]);

  const employeeOptions = useMemo(
    () =>
      sortEmployeesByDisplayName(employees).map((emp) => ({
        value: emp.id,
        label: employeeDisplayName(emp)
      })),
    [employees]
  );

  useEffect(() => {
    if (!visible) {
      setDeepLinkConsumed(false);
      setExistingGateConsumed(false);
      return;
    }
    setStep("pick");
    setSearch("");
    setPickedTemplateId("");
    setComposeDef(null);
    setPayload({});
    setDueDate("");
    setFollowUpLabel("");
    setAssigneeId("");
    setAssigneeLabel("");
    setViewing(null);
    let cancelled = false;
    (async () => {
      if (fieldFollowUps.length > 0) return;
      try {
        setLoadingTemplates(true);
        const rows = await getFollowUpFormTemplates();
        if (!cancelled) setTemplates(rows);
      } catch (err) {
        if (!cancelled) Alert.alert("Could not load follow-up types", toApiError(err).message);
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-run when modal opens/closes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || deepLinkConsumed || !initialFollowUpId) return;
    const match = existingFollowUps.find((f) => f.id === initialFollowUpId);
    if (!match) return;
    setViewing(match);
    setFollowUpLabel((match.label || "").trim());
    setStep("view");
    setDeepLinkConsumed(true);
    setExistingGateConsumed(true);
  }, [visible, initialFollowUpId, existingFollowUps, deepLinkConsumed]);

  useEffect(() => {
    if (!visible || existingGateConsumed || deepLinkConsumed) return;
    if (fieldFollowUps.length === 0) return;
    const first = fieldFollowUps[0];
    setViewing(first);
    setFollowUpLabel((first.label || "").trim());
    setStep("view");
    setExistingGateConsumed(true);
  }, [visible, fieldFollowUps, existingGateConsumed, deepLinkConsumed]);

  const openCompose = async (templateId: string) => {
    try {
      setPickedTemplateId(templateId);
      const tpl = await getFormTemplate(templateId);
      setComposeDef(withRequiredWorkerSignature(normalizeDefinition(tpl.definition)));
      setPayload({});
      setFollowUpLabel("");
      setAssigneeId("");
      setAssigneeLabel("");
      setStep("compose");
      setLoadingEmployees(true);
      try {
        const rows = await fetchEmployees();
        setEmployees(rows);
      } catch {
        setEmployees([]);
      } finally {
        setLoadingEmployees(false);
      }
    } catch (err) {
      Alert.alert("Could not open template", toApiError(err).message);
    }
  };

  const save = async () => {
    if (!pickedTemplateId || !composeDef) return;
    if (!assigneeId.trim()) {
      Alert.alert("Assign required", "Select a worker to assign.");
      return;
    }
    const missing = validateRequiredFields(composeDef, payload);
    if (missing.length > 0) {
      Alert.alert("Incomplete", `Complete required fields: ${missing.join(", ")}`);
      return;
    }
    try {
      setSaving(true);
      await createInspectionFollowUp(projectId, inspectionId, {
        field_key: fieldKey,
        form_template_id: pickedTemplateId,
        assigned_user_id: assigneeId,
        due_date: dueDate || null,
        label: followUpLabel.trim() || null,
        form_payload: payload,
        status: "completed"
      });
      onChanged();
      onClose();
    } catch (err) {
      Alert.alert("Could not save follow-up", toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  const infoName = projectInfo?.name || viewing?.project_name || "—";
  const infoLocation = locationLine(projectInfo, viewing);
  const hasExisting = fieldFollowUps.length > 0;

  const labelBlock = (editable: boolean) => (
    <View style={styles.labelCard}>
      <View style={styles.labelHeader}>
        <Ionicons name="pricetag-outline" size={16} color="#0284C7" />
        <Text style={styles.blockEyebrow}>Label</Text>
      </View>
      {editable ? (
        <TextInput
          style={styles.search}
          placeholder="Type your Label"
          placeholderTextColor={colors.textMuted}
          value={followUpLabel}
          onChangeText={setFollowUpLabel}
        />
      ) : (
        <Text style={styles.infoText}>{followUpLabel.trim() || "—"}</Text>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {step === "pick"
                ? "Flag & Follow-up"
                : step === "view"
                  ? viewing?.template_name || "Follow-up"
                  : "Follow-up"}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {step === "pick" && !hasExisting ? (
            <ScrollView style={styles.body}>
              <InformationBlock projectName={infoName} location={infoLocation} whenIso={null} />
              <FlaggedBlock
                fieldLabel={fieldLabel || fieldKey}
                required={fieldRequired}
                sourceTemplateName={sourceTemplateName}
                sourceInspectionDate={sourceInspectionDate}
              />

              {canWrite ? (
                <View style={styles.section}>
                  <TextInput
                    style={styles.search}
                    placeholder="Search follow-up types…"
                    placeholderTextColor={colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {loadingTemplates ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : filteredTemplates.length === 0 ? (
                    <Text style={styles.empty}>
                      No follow-up templates. Set a form template type to Follow-up in the web editor.
                    </Text>
                  ) : (
                    filteredTemplates.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={styles.option}
                        onPress={() => void openCompose(t.id)}
                      >
                        <Text style={styles.optionTitle}>
                          {t.name}
                          {t.version_label ? ` (${t.version_label})` : ""}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              ) : (
                <Text style={styles.empty}>No follow-ups on this field.</Text>
              )}
            </ScrollView>
          ) : null}

          {step === "compose" && composeDef ? (
            <ScrollView style={styles.body}>
              <InformationBlock projectName={infoName} location={infoLocation} whenIso={null} />
              {labelBlock(canWrite)}
              <FlaggedBlock
                fieldLabel={fieldLabel || fieldKey}
                required={fieldRequired}
                sourceTemplateName={sourceTemplateName}
                sourceInspectionDate={sourceInspectionDate}
              />
              <Text style={styles.label}>Assign to worker *</Text>
              <TouchableOpacity
                style={styles.search}
                onPress={() => setAssigneeModalOpen(true)}
              >
                <Text style={assigneeLabel ? styles.optionTitle : styles.placeholder}>
                  {assigneeLabel || "Search workers…"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.label}>Due date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.search}
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="2026-10-20"
                placeholderTextColor={colors.textMuted}
              />
              <MKDynamicSafetyForm
                definition={composeDef}
                payload={payload}
                onChange={setPayload}
                projectId={projectId}
                inspectionId={inspectionId}
                token={token}
                signerDisplayName={signerDisplayName}
                signerUserId={user?.id}
                readOnly={false}
              />
            </ScrollView>
          ) : null}

          {step === "view" && viewing ? (
            <ScrollView style={styles.body}>
              <InformationBlock
                projectName={infoName}
                location={infoLocation}
                whenIso={viewing.created_at}
              />
              {labelBlock(false)}
              <FlaggedBlock
                fieldLabel={
                  viewing.source_field_label_snapshot || viewing.source_field_key || fieldKey
                }
                required={Boolean(viewing.source_value_snapshot?.required)}
                displayValue={
                  typeof viewing.source_value_snapshot?.display === "string"
                    ? viewing.source_value_snapshot.display
                    : undefined
                }
                sourceTemplateName={viewing.source_template_name || sourceTemplateName}
                sourceInspectionDate={viewing.source_inspection_date || sourceInspectionDate}
              />
              <Text style={styles.optionMeta}>
                {(viewing.status || "").toLowerCase() === "completed" ? "Completed" : "Pending"}
                {viewing.worker_name ? ` · Assigned to ${viewing.worker_name}` : ""}
                {viewing.due_date ? ` · due ${viewing.due_date}` : ""}
              </Text>
              <MKDynamicSafetyForm
                definition={normalizeDefinition(viewing.form_definition_snapshot)}
                payload={viewing.form_payload || {}}
                onChange={() => {}}
                projectId={projectId}
                inspectionId={inspectionId}
                token={token}
                readOnly
              />
            </ScrollView>
          ) : null}

          <View style={styles.footer}>
            {step === "compose" ? (
              <MKButton
                title="Back"
                variant="secondary"
                onPress={() => {
                  setStep("pick");
                  setComposeDef(null);
                  setFollowUpLabel("");
                  setAssigneeId("");
                  setAssigneeLabel("");
                }}
                style={styles.footerBtn}
              />
            ) : (
              <MKButton title="Close" variant="secondary" onPress={onClose} style={styles.footerBtn} />
            )}
            {step === "compose" && canWrite ? (
              <MKButton
                title="Complete"
                onPress={() => void save()}
                loading={saving}
                disabled={saving}
                style={styles.footerBtn}
              />
            ) : null}
          </View>
        </View>
      </View>

      <MKSafetySelectModal
        visible={assigneeModalOpen}
        title="Assign to worker"
        options={employeeOptions}
        value={assigneeId}
        multi={false}
        loading={loadingEmployees}
        onClose={() => setAssigneeModalOpen(false)}
        onConfirm={(next) => {
          const id = typeof next === "string" ? next : "";
          setAssigneeId(id);
          const emp = employees.find((e) => e.id === id);
          setAssigneeLabel(emp ? employeeDisplayName(emp) : "");
          setAssigneeModalOpen(false);
        }}
      />
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
    maxHeight: "92%",
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingBottom: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md
  },
  title: { ...typography.subtitle, color: colors.text },
  body: { paddingHorizontal: spacing.md, marginTop: spacing.sm },
  section: { marginBottom: spacing.md, gap: spacing.xs },
  blockEyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.4
  },
  infoCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.card
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  infoText: { ...typography.bodySmall, color: colors.text, flex: 1 },
  labelCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.card
  },
  labelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs
  },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    color: colors.text,
    marginBottom: spacing.sm
  },
  placeholder: { ...typography.body, color: colors.textMuted },
  option: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  optionTitle: { ...typography.body, color: colors.text, fontWeight: "600" },
  optionMeta: { ...typography.bodySmall, color: colors.textMuted, marginTop: 2 },
  empty: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.lg
  },
  flaggedBox: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FCD34D",
    borderWidth: 1,
    borderRadius: radius.card,
    marginBottom: spacing.sm,
    overflow: "hidden"
  },
  flaggedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  flaggedTitle: { ...typography.caption, color: "#92400E", fontWeight: "700" },
  flaggedBodyWrap: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: 2 },
  flaggedBody: { ...typography.body, color: "#78350F", fontWeight: "600" },
  requiredHint: { ...typography.bodySmall, color: "#92400E", fontStyle: "italic" },
  flaggedDisplay: { ...typography.bodySmall, color: "#78350F", marginTop: 2 },
  flaggedMeta: { ...typography.bodySmall, color: "#92400E", opacity: 0.85 },
  label: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xs },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm
  },
  footerBtn: { flexGrow: 1, minWidth: "30%" }
});
