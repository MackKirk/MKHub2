import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import {
  collectPassFailNaKeysOrdered,
  computePftAggregate,
  isFieldVisible,
  normalizeDefinition,
  type SafetyFormDefinition,
  type SafetyFormField
} from "../lib/safetyFormTemplate";
import {
  getAdditionalComments,
  getGps,
  getPft,
  getSideCommentForField,
  getStr,
  getStrArr,
  getYn,
  mergeAdditionalComments,
  mergeSideComment
} from "../lib/safetyFormPayload";
import {
  employeeDisplayName,
  fetchEmployees,
  sortEmployeesByDisplayName,
  type EmployeeListItem
} from "../services/settings";
import {
  getFleetAssetsForSafety,
  getFormCustomListRuntime,
  type FleetAssetOption
} from "../services/safetySupport";
import {
  CommentToggleButton,
  MKSafetyFieldCommentPanel
} from "./MKSafetyFieldCommentPanel";
import { MKSafetyFileField } from "./MKSafetyFileField";
import { MKSafetySelectModal, type SelectOption } from "./MKSafetySelectModal";
import { MKSafetySignatureBlock } from "./MKSafetySignatureBlock";
import { MKCard } from "./MKCard";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKDynamicSafetyFormProps {
  definition: SafetyFormDefinition | Record<string, unknown> | null | undefined;
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
  projectId: string;
  inspectionId?: string;
  token?: string | null;
  signerDisplayName?: string;
  signerUserId?: string;
  onSupportLoadingChange?: (loading: boolean) => void;
}

const PFNA = [
  { value: "pass", label: "P" },
  { value: "fail", label: "F" },
  { value: "na", label: "NA" }
] as const;

const YNA = [
  { value: "yes", label: "Y" },
  { value: "no", label: "N" },
  { value: "na", label: "NA" }
] as const;

const SCALE = ["1", "2", "3", "4", "5"] as const;

type SelectModalState = {
  fieldKey: string;
  title: string;
  source: "employees" | "fleet" | "options";
  options?: SelectOption[];
  value: string | string[];
  multi: boolean;
};

function sortSelectOptions(options: SelectOption[]): SelectOption[] {
  return [...options].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}

function ChoiceRow({
  options,
  value,
  onSelect,
  disabled,
  trailing
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.choiceWrap}>
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.choiceButton, active && styles.choiceButtonActive]}
              onPress={() => onSelect(option.value)}
              disabled={disabled}
            >
              <Text style={[styles.choiceButtonText, active && styles.choiceButtonTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        {trailing}
      </View>
    </View>
  );
}

function FieldLabel({ field }: { field: SafetyFormField }) {
  if (field.type === "text_info") return null;
  return (
    <Text style={styles.label}>
      {field.label}
      {field.required ? " *" : ""}
    </Text>
  );
}

function SideCommentBlock({
  fieldId,
  fieldKey,
  payload,
  onChange,
  readOnly,
  projectId,
  inspectionId,
  token,
  commentOpen,
  toggleComment,
  sideComment,
  onSideText,
  onSideImages
}: {
  fieldId: string;
  fieldKey: string;
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly: boolean;
  projectId: string;
  inspectionId?: string;
  token?: string | null;
  commentOpen: Record<string, boolean>;
  toggleComment: (fieldId: string) => void;
  sideComment: { text: string; imageIds: string[] };
  onSideText?: (text: string) => void;
  onSideImages?: (updater: (prev: string[]) => string[]) => void;
}) {
  const expanded = commentOpen[fieldId] === true;
  const filled = sideComment.text.trim().length > 0 || sideComment.imageIds.length > 0;

  const updateSideText = (text: string) => {
    if (onSideText) {
      onSideText(text);
      return;
    }
    onChange(mergeSideComment(payload, fieldKey, { ...sideComment, text }));
  };

  const updateSideImages = (updater: (prev: string[]) => string[]) => {
    if (onSideImages) {
      onSideImages(updater);
      return;
    }
    onChange(
      mergeSideComment(payload, fieldKey, {
        ...sideComment,
        imageIds: updater(sideComment.imageIds)
      })
    );
  };

  return (
    <>
      {!readOnly ? (
        <CommentToggleButton
          expanded={expanded}
          hasComment={filled}
          onToggle={() => toggleComment(fieldId)}
        />
      ) : null}
      <MKSafetyFieldCommentPanel
        expanded={readOnly ? filled : expanded}
        disabled={readOnly}
        text={sideComment.text}
        imageIds={sideComment.imageIds}
        onTextChange={updateSideText}
        onImageIdsChange={updateSideImages}
        projectId={projectId}
        inspectionId={inspectionId}
        token={token}
      />
    </>
  );
}

export const MKDynamicSafetyForm: React.FC<MKDynamicSafetyFormProps> = ({
  definition,
  payload,
  onChange,
  readOnly = false,
  projectId,
  inspectionId,
  token,
  signerDisplayName,
  signerUserId,
  onSupportLoadingChange
}) => {
  const normalized = useMemo(() => normalizeDefinition(definition), [definition]);
  const pfKeys = useMemo(() => collectPassFailNaKeysOrdered(normalized), [normalized]);
  const [commentOpen, setCommentOpen] = useState<Record<string, boolean>>({});
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [fleet, setFleet] = useState<FleetAssetOption[]>([]);
  const [customLists, setCustomLists] = useState<
    Record<string, { leaf_options: SelectOption[]; loading: boolean }>
  >({});
  const [selectModal, setSelectModal] = useState<SelectModalState | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingFleet, setLoadingFleet] = useState(false);

  const needEmployees = useMemo(
    () =>
      normalized.sections.some((s) =>
        s.fields.some(
          (f) =>
            isFieldVisible(f, payload) &&
            (f.type === "user_single" || f.type === "user_multi")
        )
      ),
    [normalized, payload]
  );

  const needFleet = useMemo(
    () =>
      normalized.sections.some((s) =>
        s.fields.some(
          (f) =>
            isFieldVisible(f, payload) &&
            (f.type === "equipment_single" || f.type === "equipment_multi")
        )
      ),
    [normalized, payload]
  );

  const customListIds = useMemo(() => {
    const ids = new Set<string>();
    for (const section of normalized.sections) {
      for (const field of section.fields) {
        if (
          (field.type === "dropdown_single" || field.type === "dropdown_multi") &&
          field.optionsSource?.type === "custom_list" &&
          field.optionsSource.customListId
        ) {
          ids.add(field.optionsSource.customListId);
        }
      }
    }
    return [...ids];
  }, [normalized]);

  const needsSupportData =
    needEmployees || needFleet || customListIds.length > 0;
  const [loadingSupport, setLoadingSupport] = useState(needsSupportData);

  useEffect(() => {
    onSupportLoadingChange?.(loadingSupport);
  }, [loadingSupport, onSupportLoadingChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!needEmployees && !needFleet && customListIds.length === 0) return;
      setLoadingSupport(true);
      try {
        if (needEmployees) {
          setLoadingEmployees(true);
          try {
            const rows = await fetchEmployees();
            if (!cancelled) setEmployees(sortEmployeesByDisplayName(rows));
          } finally {
            if (!cancelled) setLoadingEmployees(false);
          }
        }
        if (needFleet) {
          setLoadingFleet(true);
          try {
            const rows = await getFleetAssetsForSafety();
            if (!cancelled) {
              setFleet(
                [...rows].sort((a, b) =>
                  a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
                )
              );
            }
          } finally {
            if (!cancelled) setLoadingFleet(false);
          }
        }
        for (const listId of customListIds) {
          setCustomLists((prev) => ({
            ...prev,
            [listId]: { leaf_options: prev[listId]?.leaf_options ?? [], loading: true }
          }));
          try {
            const detail = await getFormCustomListRuntime(listId);
            if (!cancelled) {
              setCustomLists((prev) => ({
                ...prev,
                [listId]: {
                  loading: false,
                  leaf_options: sortSelectOptions(
                    (detail.leaf_options || []).map((row) => ({
                      value: row.value,
                      label: row.label
                    }))
                  )
                }
              }));
            }
          } catch {
            if (!cancelled) {
              setCustomLists((prev) => ({
                ...prev,
                [listId]: { loading: false, leaf_options: [] }
              }));
            }
          }
        }
      } finally {
        if (!cancelled) setLoadingSupport(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needEmployees, needFleet, customListIds.join("|")]);

  useEffect(() => {
    let patch: Record<string, unknown> | null = null;
    for (const section of normalized.sections) {
      for (const field of section.fields) {
        if (field.type !== "pass_fail_total") continue;
        const agg = computePftAggregate(payload, pfKeys);
        const cur = payload[field.key];
        const same =
          cur &&
          typeof cur === "object" &&
          !Array.isArray(cur) &&
          (cur as { pass?: number }).pass === agg.pass &&
          (cur as { fail?: number }).fail === agg.fail &&
          (cur as { na?: number }).na === agg.na;
        if (!same) {
          patch = { ...(patch ?? payload), [field.key]: agg };
        }
      }
    }
    if (patch) onChange(patch);
  }, [payload, pfKeys, normalized.sections, onChange]);

  const setValue = (key: string, value: unknown) => {
    if (readOnly) return;
    onChange({ ...payload, [key]: value });
  };

  const toggleComment = (fieldId: string) => {
    setCommentOpen((prev) => ({ ...prev, [fieldId]: !prev[fieldId] }));
  };

  const employeeOptions = useMemo(
    () =>
      sortSelectOptions(
        employees.map((emp) => ({
          value: String(emp.id),
          label: employeeDisplayName(emp)
        }))
      ),
    [employees]
  );

  const fleetOptions = useMemo(
    () => sortSelectOptions(fleet.map((item) => ({ value: item.id, label: item.label }))),
    [fleet]
  );

  const resolveDropdownOptions = (field: SafetyFormField): SelectOption[] => {
    const listId =
      field.optionsSource?.type === "custom_list"
        ? field.optionsSource.customListId
        : null;
    if (listId && customLists[listId]?.leaf_options.length) {
      return customLists[listId].leaf_options;
    }
    return sortSelectOptions(
      (field.options || []).map((option) => ({ value: option, label: option }))
    );
  };

  const openSelect = (
    field: SafetyFormField,
    source: SelectModalState["source"],
    options: SelectOption[] | undefined,
    multi: boolean
  ) => {
    setSelectModal({
      fieldKey: field.key,
      title: field.label,
      source,
      options,
      value: multi ? getStrArr(payload, field.key) : getStr(payload, field.key),
      multi
    });
  };

  const activeSelectOptions = useMemo(() => {
    if (!selectModal) return [];
    if (selectModal.source === "employees") return employeeOptions;
    if (selectModal.source === "fleet") return fleetOptions;
    return selectModal.options ?? [];
  }, [selectModal, employeeOptions, fleetOptions]);

  const activeSelectLoading = useMemo(() => {
    if (!selectModal) return false;
    if (selectModal.source === "employees") return loadingEmployees;
    if (selectModal.source === "fleet") return loadingFleet;
    if (selectModal.source === "options") {
      const field = normalized.sections
        .flatMap((s) => s.fields)
        .find((f) => f.key === selectModal.fieldKey);
      const listId =
        field?.optionsSource?.type === "custom_list"
          ? field.optionsSource.customListId
          : undefined;
      if (listId) return customLists[listId]?.loading ?? false;
    }
    return false;
  }, [selectModal, loadingEmployees, loadingFleet, customLists, normalized.sections]);

  const activeSelectLoadingLabel = useMemo(() => {
    if (!selectModal) return "Loading…";
    if (selectModal.source === "employees") return "Loading employees…";
    if (selectModal.source === "fleet") return "Loading equipment…";
    return "Loading options…";
  }, [selectModal]);

  const renderSideComments = (
    field: SafetyFormField,
    sideComment: { text: string; imageIds: string[] },
    ynHandlers?: {
      onSideText: (text: string) => void;
      onSideImages: (updater: (prev: string[]) => string[]) => void;
    }
  ) => (
    <SideCommentBlock
      fieldId={field.id}
      fieldKey={field.key}
      payload={payload}
      onChange={onChange}
      readOnly={readOnly}
      projectId={projectId}
      inspectionId={inspectionId}
      token={token}
      commentOpen={commentOpen}
      toggleComment={toggleComment}
      sideComment={sideComment}
      onSideText={ynHandlers?.onSideText}
      onSideImages={ynHandlers?.onSideImages}
    />
  );

  const renderField = (field: SafetyFormField) => {
    if (!isFieldVisible(field, payload)) return null;
    const k = field.key;
    const value = payload[k];
    const sideComment = getSideCommentForField(payload, k);

    switch (field.type) {
      case "text_info":
        return (
          <View key={field.id} style={styles.field}>
            <Text style={styles.infoText}>{field.label}</Text>
          </View>
        );
      case "short_text":
      case "number":
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <TextInput
              style={styles.input}
              value={value == null ? "" : String(value)}
              onChangeText={(text) => setValue(k, text)}
              placeholder={field.placeholder}
              editable={!readOnly}
              keyboardType={field.type === "number" ? "decimal-pad" : "default"}
            />
            {renderSideComments(field, sideComment)}
          </View>
        );
      case "long_text":
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <TextInput
              style={[styles.input, styles.textArea]}
              value={value == null ? "" : String(value)}
              onChangeText={(text) => setValue(k, text)}
              placeholder={field.placeholder}
              editable={!readOnly}
              multiline
            />
            {renderSideComments(field, sideComment)}
          </View>
        );
      case "date":
      case "time":
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <TextInput
              style={styles.input}
              value={value == null ? "" : String(value)}
              onChangeText={(text) => setValue(k, text)}
              placeholder={field.type === "date" ? "YYYY-MM-DD" : "HH:MM"}
              editable={!readOnly}
            />
            {renderSideComments(field, sideComment)}
          </View>
        );
      case "pass_fail_na":
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <ChoiceRow
              options={PFNA}
              value={typeof value === "string" ? value : ""}
              onSelect={(next) => setValue(k, next)}
              disabled={readOnly}
            />
            {renderSideComments(field, sideComment)}
          </View>
        );
      case "yes_no_na": {
        const yn = getYn(payload, k);
        const ynComment = { text: yn.comments, imageIds: yn.commentImageIds };
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <ChoiceRow
              options={YNA}
              value={yn.status}
              onSelect={(next) =>
                setValue(k, { ...yn, status: next, commentImageIds: yn.commentImageIds })
              }
              disabled={readOnly}
            />
            {renderSideComments(field, ynComment, {
              onSideText: (text) => setValue(k, { ...yn, comments: text }),
              onSideImages: (updater) =>
                setValue(k, {
                  ...yn,
                  commentImageIds: updater(yn.commentImageIds)
                })
            })}
          </View>
        );
      }
      case "scale_1_5":
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <ChoiceRow
              options={SCALE.map((item) => ({ value: item, label: item }))}
              value={typeof value === "string" ? value : ""}
              onSelect={(next) => setValue(k, next)}
              disabled={readOnly}
            />
            {renderSideComments(field, sideComment)}
          </View>
        );
      case "checkbox":
        return (
          <View key={field.id} style={styles.field}>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setValue(k, !Boolean(value))}
              disabled={readOnly}
            >
              <View style={[styles.checkbox, Boolean(value) && styles.checkboxChecked]} />
              <Text style={styles.checkboxLabel}>{field.label}</Text>
            </TouchableOpacity>
            {renderSideComments(field, sideComment)}
          </View>
        );
      case "dropdown_single": {
        const options = resolveDropdownOptions(field);
        const selected = getStr(payload, k);
        const label = options.find((o) => o.value === selected)?.label || "Select…";
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <TouchableOpacity
              style={styles.selectTrigger}
              onPress={() => openSelect(field, "options", options, false)}
              disabled={readOnly || options.length === 0}
            >
              <Text style={styles.selectText}>{label}</Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {renderSideComments(field, sideComment)}
          </View>
        );
      }
      case "dropdown_multi": {
        const options = resolveDropdownOptions(field);
        const selected = getStrArr(payload, k);
        const label =
          selected.length === 0
            ? "Select…"
            : selected
                .map((id) => options.find((o) => o.value === id)?.label || id)
                .join(", ");
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <TouchableOpacity
              style={styles.selectTrigger}
              onPress={() => openSelect(field, "options", options, true)}
              disabled={readOnly || options.length === 0}
            >
              <Text style={styles.selectText} numberOfLines={2}>
                {label}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {renderSideComments(field, sideComment)}
          </View>
        );
      }
      case "user_single":
      case "user_multi": {
        const multi = field.type === "user_multi";
        const selected = multi ? getStrArr(payload, k) : getStr(payload, k);
        const label = multi
          ? (selected as string[]).length === 0
            ? "Select worker…"
            : (selected as string[])
                .map((id) => employeeOptions.find((o) => o.value === id)?.label || id)
                .join(", ")
          : employeeOptions.find((o) => o.value === selected)?.label || "Select worker…";
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <TouchableOpacity
              style={styles.selectTrigger}
              onPress={() => openSelect(field, "employees", undefined, multi)}
              disabled={readOnly}
            >
              <Text style={styles.selectText} numberOfLines={2}>
                {label}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {renderSideComments(field, sideComment)}
          </View>
        );
      }
      case "equipment_single":
      case "equipment_multi": {
        const multi = field.type === "equipment_multi";
        const selected = multi ? getStrArr(payload, k) : getStr(payload, k);
        const label = multi
          ? (selected as string[]).length === 0
            ? "Select equipment…"
            : (selected as string[])
                .map((id) => fleetOptions.find((o) => o.value === id)?.label || id)
                .join(", ")
          : fleetOptions.find((o) => o.value === selected)?.label || "Select equipment…";
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <TouchableOpacity
              style={styles.selectTrigger}
              onPress={() => openSelect(field, "fleet", undefined, multi)}
              disabled={readOnly}
            >
              <Text style={styles.selectText} numberOfLines={2}>
                {label}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {renderSideComments(field, sideComment)}
          </View>
        );
      }
      case "gps": {
        const g = getGps(payload, k);
        const captureLocation = async () => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission needed", "Location permission is required.");
            return;
          }
          const pos = await Location.getCurrentPositionAsync({});
          setValue(k, { lat: pos.coords.latitude, lng: pos.coords.longitude });
        };
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <View style={styles.gpsRow}>
              <TextInput
                style={[styles.input, styles.gpsInput]}
                value={g.lat}
                onChangeText={(lat) => {
                  const ln = parseFloat(g.lng);
                  const la = parseFloat(lat);
                  if (!lat || !g.lng) setValue(k, { lat: null, lng: null });
                  else if (!Number.isNaN(la) && !Number.isNaN(ln))
                    setValue(k, { lat: la, lng: ln });
                }}
                placeholder="Latitude"
                editable={!readOnly}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.gpsInput]}
                value={g.lng}
                onChangeText={(lng) => {
                  const la = parseFloat(g.lat);
                  const ln = parseFloat(lng);
                  if (!g.lat || !lng) setValue(k, { lat: null, lng: null });
                  else if (!Number.isNaN(la) && !Number.isNaN(ln))
                    setValue(k, { lat: la, lng: ln });
                }}
                placeholder="Longitude"
                editable={!readOnly}
                keyboardType="decimal-pad"
              />
            </View>
            {!readOnly ? (
              <TouchableOpacity style={styles.locationBtn} onPress={() => void captureLocation()}>
                <Ionicons name="locate-outline" size={18} color={colors.primary} />
                <Text style={styles.locationBtnText}>Use current location</Text>
              </TouchableOpacity>
            ) : null}
            {renderSideComments(field, sideComment)}
          </View>
        );
      }
      case "pass_fail_total": {
        const pft = getPft(payload, k);
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <Text style={styles.totalText}>
              Pass {pft.pass} · Fail {pft.fail} · NA {pft.na}
            </Text>
          </View>
        );
      }
      case "pdf_view": {
        const attachments =
          (field.settings?.referencePdfAttachments as
            | Array<{ id: string; originalName: string }>
            | undefined) ?? [];
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            {attachments.length === 0 ? (
              <Text style={styles.muted}>No reference PDFs attached.</Text>
            ) : (
              attachments.map((pdf) => (
                <View key={pdf.id} style={styles.pdfRef}>
                  <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                  <Text style={styles.pdfRefText}>{pdf.originalName || "Reference PDF"}</Text>
                </View>
              ))
            )}
            {renderSideComments(field, sideComment)}
          </View>
        );
      }
      case "image_view":
      case "pdf_insert":
        return (
          <View key={field.id} style={styles.field}>
            <FieldLabel field={field} />
            <MKSafetyFileField
              field={field}
              payload={payload}
              onChange={onChange}
              projectId={projectId}
              inspectionId={inspectionId}
              token={token}
              readOnly={readOnly}
            />
            {renderSideComments(field, sideComment)}
          </View>
        );
      default:
        return null;
    }
  };

  const sections = [...normalized.sections].sort((a, b) => a.order - b.order);
  const additionalComments = getAdditionalComments(payload);

  if (loadingSupport) {
    return (
      <View style={styles.fullScreenLoading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTitle}>Loading form options…</Text>
        <Text style={styles.muted}>Please wait before editing.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((section) => (
          <MKCard key={section.id} style={styles.sectionCard} elevated>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {[...section.fields]
              .sort((a, b) => a.order - b.order)
              .map((field) => renderField(field))}
          </MKCard>
        ))}

        <MKCard style={styles.sectionCard} elevated>
          <Text style={styles.sectionTitle}>Additional Comments / Photos</Text>
          <MKSafetyFieldCommentPanel
            expanded={!readOnly}
            disabled={readOnly}
            text={additionalComments.text}
            imageIds={additionalComments.imageIds}
            onTextChange={(text) =>
              onChange(mergeAdditionalComments(payload, { ...additionalComments, text }))
            }
            onImageIdsChange={(updater) =>
              onChange(
                mergeAdditionalComments(payload, {
                  ...additionalComments,
                  imageIds: updater(additionalComments.imageIds)
                })
              )
            }
            projectId={projectId}
            inspectionId={inspectionId}
            token={token}
          />
        </MKCard>

        {normalized.signature_policy?.worker ? (
          <MKCard style={styles.sectionCard} elevated>
            <MKSafetySignatureBlock
              policy={normalized.signature_policy.worker}
              payload={payload}
              onChange={onChange}
              projectId={projectId}
              inspectionId={inspectionId}
              token={token}
              signerDisplayName={signerDisplayName}
              signerUserId={signerUserId}
              readOnly={readOnly}
            />
          </MKCard>
        ) : null}
      </ScrollView>

      {selectModal ? (
        <MKSafetySelectModal
          visible
          title={selectModal.title}
          options={activeSelectOptions}
          value={selectModal.value}
          multi={selectModal.multi}
          loading={activeSelectLoading}
          loadingLabel={activeSelectLoadingLabel}
          onClose={() => setSelectModal(null)}
          onConfirm={(next) => setValue(selectModal.fieldKey, next)}
        />
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.lg },
  fullScreenLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md
  },
  loadingTitle: { ...typography.subtitle, textAlign: "center" },
  sectionCard: { gap: spacing.md },
  sectionTitle: { ...typography.subtitle, marginBottom: spacing.xs },
  field: { gap: spacing.sm, marginBottom: spacing.md },
  label: { ...typography.bodySmall, color: colors.textMuted },
  infoText: { ...typography.body },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body
  },
  textArea: { minHeight: 96, textAlignVertical: "top" },
  choiceWrap: { gap: spacing.sm },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  choiceButton: {
    minWidth: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  choiceButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  choiceButtonText: { ...typography.bodySmall, fontWeight: "700" },
  choiceButtonTextActive: { color: "#fff" },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxLabel: { ...typography.body, flex: 1 },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm
  },
  selectText: { ...typography.body, flex: 1 },
  gpsRow: { flexDirection: "row", gap: spacing.sm },
  gpsInput: { flex: 1 },
  locationBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  locationBtnText: { ...typography.bodySmall, color: colors.primary, fontWeight: "600" },
  totalText: { ...typography.body },
  muted: { ...typography.bodySmall, color: colors.textMuted },
  pdfRef: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  pdfRefText: { ...typography.bodySmall }
});
