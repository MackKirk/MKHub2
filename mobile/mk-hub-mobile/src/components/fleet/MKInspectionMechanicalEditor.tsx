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
  buildMechanicalChecklistPayload,
  buildMechanicalFormFromInspection,
  computeResultFromConditions,
  inspectionServerSyncKey,
  isMechanicalChecklistComplete,
  resolveMechanicalResultForSubmit,
  type FleetAssetFormContext,
  type FleetInspectionRecord,
  type MechanicalFormState
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

interface MKInspectionMechanicalEditorProps {
  inspectionId: string;
  inspection: FleetInspectionRecord & { result: string; photos?: string[] | null };
  templateSections: Array<{
    id: string;
    title: string;
    items: Array<{ key: string; label: string; category: string }>;
  }>;
  fleetAsset?: FleetAssetFormContext;
  onSaved: () => void;
  onCancel: () => void;
}

export const MKInspectionMechanicalEditor: React.FC<MKInspectionMechanicalEditorProps> = ({
  inspectionId,
  inspection,
  templateSections,
  fleetAsset,
  onSaved,
  onCancel
}) => {
  const [mechanicalForm, setMechanicalForm] = useState<MechanicalFormState | null>(null);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState<{
    result: string;
    resultLabel: string;
  } | null>(null);

  const flatItems = useMemo(
    () => templateSections.flatMap((section) => section.items),
    [templateSections]
  );

  const serverSyncKey = useMemo(() => inspectionServerSyncKey(inspection), [inspection]);

  useEffect(() => {
    setMechanicalForm(
      buildMechanicalFormFromInspection(inspection, templateSections, fleetAsset)
    );
    setPhotoIds(Array.isArray(inspection.photos) ? inspection.photos : []);
  }, [serverSyncKey, templateSections, fleetAsset, inspection]);

  const setMechanicalItem = (itemIndex: number, value: string) => {
    setMechanicalForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, items: [...prev.items] };
      next.items[itemIndex] = { ...next.items[itemIndex], condition: value };
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
    if (!mechanicalForm) return;
    const resolved = resolveMechanicalResultForSubmit(
      finish ? "finish" : "draft",
      mechanicalForm.items
    );
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
    if (!mechanicalForm) return;
    try {
      setSaving(true);
      await updateFleetInspection(inspectionId, {
        checklist_results: buildMechanicalChecklistPayload(mechanicalForm, fleetAsset),
        result,
        notes: mechanicalForm.notes.trim() || undefined,
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

  if (!mechanicalForm) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading form…</Text>
      </View>
    );
  }

  const mechComplete = isMechanicalChecklistComplete(mechanicalForm.items);
  const computedFinalResult = mechComplete
    ? computeResultFromConditions(mechanicalForm.items)
    : null;

  let itemIndex = 0;

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
                label="Hours"
                value={
                  fleetAsset.hours_current != null
                    ? fleetAsset.hours_current.toLocaleString()
                    : "—"
                }
              />
            </View>
          </MKCard>
        ) : null}

        {templateSections.map((section) => (
          <MKCard key={section.id} style={styles.checklistCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => {
              const currentIndex = itemIndex;
              itemIndex += 1;
              return (
                <View key={item.key} style={styles.checklistRow}>
                  <View style={styles.checklistText}>
                    <Text style={styles.areaLabel}>{item.label}</Text>
                    <Text style={styles.areaDescription}>{item.category}</Text>
                  </View>
                  <MKInspectionConditionPicker
                    value={mechanicalForm.items[currentIndex]?.condition ?? ""}
                    onChange={(value) => setMechanicalItem(currentIndex, value)}
                  />
                </View>
              );
            })}
          </MKCard>
        ))}

        <MKCard style={styles.notesCard}>
          <Text style={styles.sectionTitle}>Observations</Text>
          <TextInput
            style={styles.notesInput}
            value={mechanicalForm.notes}
            onChangeText={(text) =>
              setMechanicalForm((p) => (p ? { ...p, notes: text } : p))
            }
            placeholder="Notes or other observations..."
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
            mechComplete
              ? { ...styles.resultCard, ...styles.resultCardComplete }
              : styles.resultCard
          }
        >
          <Text style={styles.resultLabel}>Inspection result</Text>
          <Text style={styles.resultValue}>
            {!mechComplete
              ? "Draft"
              : computedFinalResult === "fail"
                ? "Fail"
                : computedFinalResult === "conditional"
                  ? "Conditional"
                  : "Pass"}
          </Text>
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
        inspectionLabel="Mechanical"
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
  actions: {
    gap: spacing.sm
  }
});
