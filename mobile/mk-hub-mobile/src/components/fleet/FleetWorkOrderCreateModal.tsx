import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { MKButton } from "../MKButton";
import { MKSafetySelectModal, type SelectOption } from "../MKSafetySelectModal";
import {
  equipmentLabel,
  fleetAssetLabel,
  listEquipment,
  listFleetAssets
} from "../../services/fleet";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";
import { CATEGORY_LABELS, URGENCY_LABELS } from "../../lib/fleetLabels";
import type { WorkOrderCreateRequest, WorkOrderEntityType } from "../../types/fleet";

interface FleetWorkOrderCreateModalProps {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: WorkOrderCreateRequest) => void;
}

const ENTITY_OPTIONS: SelectOption[] = [
  { value: "fleet", label: "Fleet asset" },
  { value: "equipment", label: "Equipment" }
];

const CATEGORY_OPTIONS: SelectOption[] = Object.entries(CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label })
);

const URGENCY_OPTIONS: SelectOption[] = Object.entries(URGENCY_LABELS).map(
  ([value, label]) => ({ value, label })
);

export const FleetWorkOrderCreateModal: React.FC<FleetWorkOrderCreateModalProps> = ({
  visible,
  loading = false,
  onClose,
  onSubmit
}) => {
  const [entityType, setEntityType] = useState<WorkOrderEntityType>("fleet");
  const [entityId, setEntityId] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("maintenance");
  const [urgency, setUrgency] = useState("normal");
  const [bodyRepair, setBodyRepair] = useState(false);
  const [newStickers, setNewStickers] = useState(false);
  const [entityOptions, setEntityOptions] = useState<SelectOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [selectKind, setSelectKind] = useState<
    "entityType" | "entity" | "category" | "urgency" | null
  >(null);

  useEffect(() => {
    if (!visible) return;
    setEntityType("fleet");
    setEntityId("");
    setDescription("");
    setCategory("maintenance");
    setUrgency("normal");
    setBodyRepair(false);
    setNewStickers(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoadingEntities(true);
        if (entityType === "fleet") {
          const result = await listFleetAssets({ limit: 100 });
          if (cancelled) return;
          setEntityOptions(
            result.items.map((item) => ({
              value: item.id,
              label: fleetAssetLabel(item)
            }))
          );
        } else {
          const result = await listEquipment({ limit: 100 });
          if (cancelled) return;
          setEntityOptions(
            result.items.map((item) => ({
              value: item.id,
              label: equipmentLabel(item)
            }))
          );
        }
      } finally {
        if (!cancelled) setLoadingEntities(false);
      }
    };

    load();
    setEntityId("");
    return () => {
      cancelled = true;
    };
  }, [visible, entityType]);

  const selectedEntityLabel = useMemo(
    () => entityOptions.find((option) => option.value === entityId)?.label ?? "",
    [entityId, entityOptions]
  );

  const handleSubmit = () => {
    if (!entityId.trim()) return;
    if (!description.trim()) return;
    onSubmit({
      entity_type: entityType,
      entity_id: entityId,
      description: description.trim(),
      category,
      urgency,
      status: "open",
      origin_source: "manual",
      body_repair_required: entityType === "fleet" ? bodyRepair : false,
      new_stickers_applied: entityType === "fleet" ? newStickers : false
    });
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={styles.container}>
          <Text style={styles.title}>New work order</Text>
          <Text style={styles.subtitle}>Create a shop work order for fleet or equipment.</Text>

          <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
            <FieldButton
              label="Entity type"
              value={ENTITY_OPTIONS.find((option) => option.value === entityType)?.label ?? ""}
              onPress={() => setSelectKind("entityType")}
            />

            <FieldButton
              label={entityType === "fleet" ? "Fleet asset" : "Equipment"}
              value={selectedEntityLabel || "Select item"}
              onPress={() => setSelectKind("entity")}
              loading={loadingEntities}
            />

            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the work needed"
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

            <FieldButton
              label="Category"
              value={CATEGORY_LABELS[category] ?? category}
              onPress={() => setSelectKind("category")}
            />

            <FieldButton
              label="Urgency"
              value={URGENCY_LABELS[urgency] ?? urgency}
              onPress={() => setSelectKind("urgency")}
            />

            {entityType === "fleet" ? (
              <>
                <ToggleRow
                  label="Body repair required"
                  value={bodyRepair}
                  onValueChange={setBodyRepair}
                />
                <ToggleRow
                  label="New stickers applied"
                  value={newStickers}
                  onValueChange={setNewStickers}
                />
              </>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <MKButton title="Cancel" variant="secondary" onPress={onClose} disabled={loading} />
            <MKButton title="Create work order" onPress={handleSubmit} loading={loading} />
          </View>
        </View>
      </Modal>

      <MKSafetySelectModal
        visible={selectKind === "entityType"}
        title="Entity type"
        options={ENTITY_OPTIONS}
        value={entityType}
        onClose={() => setSelectKind(null)}
        onConfirm={(value) => {
          setEntityType(value as WorkOrderEntityType);
          setSelectKind(null);
        }}
      />

      <MKSafetySelectModal
        visible={selectKind === "entity"}
        title={entityType === "fleet" ? "Fleet asset" : "Equipment"}
        options={entityOptions}
        value={entityId}
        loading={loadingEntities}
        onClose={() => setSelectKind(null)}
        onConfirm={(value) => {
          setEntityId(String(value));
          setSelectKind(null);
        }}
      />

      <MKSafetySelectModal
        visible={selectKind === "category"}
        title="Category"
        options={CATEGORY_OPTIONS}
        value={category}
        onClose={() => setSelectKind(null)}
        onConfirm={(value) => {
          setCategory(String(value));
          setSelectKind(null);
        }}
      />

      <MKSafetySelectModal
        visible={selectKind === "urgency"}
        title="Urgency"
        options={URGENCY_OPTIONS}
        value={urgency}
        onClose={() => setSelectKind(null)}
        onConfirm={(value) => {
          setUrgency(String(value));
          setSelectKind(null);
        }}
      />
    </>
  );
};

function FieldButton({
  label,
  value,
  onPress,
  loading
}: {
  label: string;
  value: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.selectButton} onPress={onPress} activeOpacity={0.75}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.selectButtonText} numberOfLines={1}>
            {value}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange
}: {
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingTop: spacing.xxl
  },
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg
  },
  form: {
    flex: 1
  },
  field: {
    marginBottom: spacing.md
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  selectButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
    justifyContent: "center"
  },
  selectButtonText: {
    ...typography.body,
    color: colors.textPrimary
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    gap: spacing.md
  },
  toggleLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1
  },
  actions: {
    gap: spacing.sm,
    paddingTop: spacing.md
  }
});
