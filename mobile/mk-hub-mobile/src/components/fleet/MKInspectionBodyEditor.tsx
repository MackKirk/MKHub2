import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  buildBodyChecklistPayload,
  buildBodyFormFromInspection,
  computeResultFromConditions,
  inspectionServerSyncKey,
  isBodyChecklistComplete,
  resolveBodyResultForSubmit,
  type BodyFormState,
  type FleetAssetFormContext,
  type FleetInspectionRecord
} from "../../lib/fleetInspectionForm";
import { INSPECTION_RESULT_LABELS } from "../../lib/fleetLabels";
import { updateFleetInspection, uploadInspectionPhoto } from "../../services/fleetInspections";
import { toApiError } from "../../services/api";
import { MKButton } from "../MKButton";
import { MKCard } from "../MKCard";
import { MKInspectionConditionPicker } from "./MKInspectionConditionPicker";
import { MKInspectionFinishConfirmModal } from "./MKInspectionFinishConfirmModal";
import { MKInspectionPhotoGallery } from "./MKInspectionPhotoGallery";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";

interface MKInspectionBodyEditorProps {
  inspectionId: string;
  inspection: FleetInspectionRecord & { result: string; photos?: string[] | null };
  templateAreas: Array<{ key: string; label: string; description?: string }>;
  fleetAsset?: FleetAssetFormContext;
  onSaved: () => void;
  onCancel: () => void;
}

export const MKInspectionBodyEditor: React.FC<MKInspectionBodyEditorProps> = ({
  inspectionId,
  inspection,
  templateAreas,
  fleetAsset,
  onSaved,
  onCancel
}) => {
  const [bodyForm, setBodyForm] = useState<BodyFormState | null>(null);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState<{
    result: string;
    resultLabel: string;
  } | null>(null);

  const serverSyncKey = useMemo(() => inspectionServerSyncKey(inspection), [inspection]);

  useEffect(() => {
    setBodyForm(buildBodyFormFromInspection(inspection, templateAreas, fleetAsset));
    setPhotoIds(Array.isArray(inspection.photos) ? inspection.photos : []);
  }, [serverSyncKey, templateAreas, fleetAsset, inspection]);

  const setBodyArea = (index: number, value: string) => {
    setBodyForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, areas: [...prev.areas] };
      next.areas[index] = { ...next.areas[index], condition: value };
      return next;
    });
  };

  const handleUploadPhoto = async (file: { uri: string; name: string; type: string }) => {
    try {
      setPhotoUploading(true);
      const id = await uploadInspectionPhoto(file);
      setPhotoIds((prev) => [...prev, id]);
    } catch (err) {
      Alert.alert("Upload failed", toApiError(err).message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const save = async (finish: boolean) => {
    if (!bodyForm) return;
    const resolved = resolveBodyResultForSubmit(finish ? "finish" : "draft", bodyForm.areas);
    if (!resolved.ok) {
      Alert.alert("Incomplete checklist", resolved.message);
      return;
    }
    if (finish) {
      const resultLabel =
        INSPECTION_RESULT_LABELS[resolved.result] ??
        resolved.result.charAt(0).toUpperCase() + resolved.result.slice(1);
      setFinishConfirm({ result: resolved.result, resultLabel });
      return;
    }
    await performSave(resolved.result, finish);
  };

  const performSave = async (result: string, finish: boolean) => {
    if (!bodyForm) return;
    try {
      setSaving(true);
      await updateFleetInspection(inspectionId, {
        checklist_results: buildBodyChecklistPayload(bodyForm, fleetAsset),
        result,
        notes: bodyForm.notes.trim() || undefined,
        photos: photoIds.length ? photoIds : undefined
      });
      setFinishConfirm(null);
      onSaved();
    } catch (err) {
      Alert.alert("Could not save inspection", toApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  if (!bodyForm) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading form…</Text>
      </View>
    );
  }

  const bodyComplete = isBodyChecklistComplete(bodyForm.areas);
  const computedFinalResult = bodyComplete
    ? computeResultFromConditions(bodyForm.areas)
    : null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {fleetAsset ? (
          <MKCard style={styles.vehicleCard}>
            <Text style={styles.sectionTitle}>Vehicle</Text>
            <View style={styles.vehicleGrid}>
              <VehicleStat label="Unit #" value={fleetAsset.unit_number || fleetAsset.name || "—"} />
              <VehicleStat label="Name" value={fleetAsset.name || "—"} />
              <VehicleStat
                label="KM"
                value={
                  fleetAsset.odometer_current != null
                    ? fleetAsset.odometer_current.toLocaleString()
                    : "—"
                }
              />
              <VehicleStat
                label="Date"
                value={
                  inspection.inspection_date
                    ? new Date(inspection.inspection_date).toLocaleDateString()
                    : new Date().toLocaleDateString()
                }
              />
            </View>
          </MKCard>
        ) : null}

        <MKCard style={styles.checklistCard}>
          <Text style={styles.sectionTitle}>Body / Exterior areas</Text>
          {templateAreas.map((area, index) => (
            <View key={area.key} style={styles.checklistRow}>
              <View style={styles.checklistText}>
                <Text style={styles.areaLabel}>{area.label}</Text>
                {area.description ? (
                  <Text style={styles.areaDescription}>{area.description}</Text>
                ) : null}
              </View>
              <MKInspectionConditionPicker
                value={bodyForm.areas[index]?.condition ?? ""}
                onChange={(value) => setBodyArea(index, value)}
              />
            </View>
          ))}
        </MKCard>

        <MKCard style={styles.notesCard}>
          <Text style={styles.sectionTitle}>Observations</Text>
          <TextInput
            style={styles.notesInput}
            value={bodyForm.notes}
            onChangeText={(text) => setBodyForm((p) => (p ? { ...p, notes: text } : p))}
            placeholder="Notes, damage description, or other observations..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </MKCard>

        <MKCard style={styles.photosCard}>
          <MKInspectionPhotoGallery
            photoIds={photoIds}
            onChange={setPhotoIds}
            uploading={photoUploading}
            onUpload={handleUploadPhoto}
          />
        </MKCard>

        <MKCard
          style={
            bodyComplete
              ? { ...styles.resultCard, ...styles.resultCardComplete }
              : styles.resultCard
          }
        >
          <Text style={styles.resultLabel}>Inspection result</Text>
          <Text style={styles.resultValue}>
            {!bodyComplete
              ? "Draft"
              : computedFinalResult === "fail"
                ? "Fail"
                : computedFinalResult === "conditional"
                  ? "Conditional"
                  : "Pass"}
          </Text>
          {!bodyComplete ? (
            <Text style={styles.resultHint}>
              Answer every area, then Finish to submit Pass / Conditional / Fail.
            </Text>
          ) : null}
        </MKCard>

        <View style={styles.actions}>
          <MKButton title="Finish inspection" onPress={() => save(true)} loading={saving} />
          <MKButton
            title="Save draft"
            variant="secondary"
            onPress={() => save(false)}
            loading={saving}
          />
          <MKButton title="Cancel" variant="secondary" onPress={onCancel} disabled={saving} />
        </View>
      </ScrollView>

      <MKInspectionFinishConfirmModal
        visible={!!finishConfirm}
        inspectionLabel="Body / Exterior"
        resultLabel={finishConfirm?.resultLabel ?? ""}
        result={finishConfirm?.result ?? ""}
        loading={saving}
        onCancel={() => setFinishConfirm(null)}
        onConfirm={() => {
          if (finishConfirm) void performSave(finishConfirm.result, true);
        }}
      />
    </>
  );
};

function VehicleStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.vehicleStat}>
      <Text style={styles.vehicleStatLabel}>{label}</Text>
      <Text style={styles.vehicleStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl
  },
  loading: {
    paddingVertical: spacing.lg,
    alignItems: "center"
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  vehicleCard: {
    gap: spacing.sm
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  vehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  vehicleStat: {
    minWidth: "40%",
    gap: 2
  },
  vehicleStatLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  vehicleStatValue: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  checklistCard: {
    padding: 0,
    overflow: "hidden",
    gap: 0
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  checklistText: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  areaLabel: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  areaDescription: {
    ...typography.caption,
    color: colors.textMuted
  },
  notesCard: {
    gap: spacing.sm
  },
  notesInput: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: spacing.md,
    backgroundColor: colors.background
  },
  photosCard: {
    gap: spacing.sm
  },
  resultCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  resultCardComplete: {
    borderStyle: "solid",
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0"
  },
  resultLabel: {
    ...typography.bodySmall,
    color: colors.textPrimary
  },
  resultValue: {
    ...typography.subtitle,
    color: colors.textPrimary
  },
  resultHint: {
    ...typography.caption,
    color: colors.textMuted,
    width: "100%"
  },
  actions: {
    gap: spacing.sm
  }
});
