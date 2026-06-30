import React, { useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ProjectListAdvancedFilters } from "../lib/listFilters";
import {
  clientDisplayName,
  employeeDisplayName,
  type ClientListItem,
  type EmployeeListItem,
  type ProjectDivision,
  type ProjectStatus
} from "../services/settings";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

type PickerField = "status" | "division" | "client" | "estimator";

interface MKProjectFiltersModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: ProjectListAdvancedFilters) => void;
  initialFilters: ProjectListAdvancedFilters;
  statuses: ProjectStatus[];
  divisions: ProjectDivision[];
  clients: ClientListItem[];
  estimators: EmployeeListItem[];
}

interface FilterRowProps {
  label: string;
  value?: string;
  onPress: () => void;
}

const FilterRow: React.FC<FilterRowProps> = ({ label, value, onPress }) => (
  <TouchableOpacity style={styles.filterRow} onPress={onPress}>
    <Text style={styles.filterLabel}>{label}</Text>
    <View style={styles.filterValueWrap}>
      <Text style={styles.filterValue} numberOfLines={1}>
        {value || "Any"}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </View>
  </TouchableOpacity>
);

export const MKProjectFiltersModal: React.FC<MKProjectFiltersModalProps> = ({
  visible,
  onClose,
  onApply,
  initialFilters,
  statuses,
  divisions,
  clients,
  estimators
}) => {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ProjectListAdvancedFilters>(initialFilters);
  const [pickerField, setPickerField] = useState<PickerField | null>(null);

  React.useEffect(() => {
    if (visible) {
      setDraft(initialFilters);
      setPickerField(null);
    }
  }, [visible, initialFilters]);

  const divisionOptions = useMemo(() => {
    const out: Array<{ id: string; label: string }> = [];
    for (const div of divisions) {
      out.push({ id: String(div.id), label: div.label });
      for (const sub of div.subdivisions || []) {
        out.push({
          id: String(sub.id),
          label: `${div.label} - ${sub.label}`
        });
      }
    }
    return out;
  }, [divisions]);

  const statusLabel = statuses.find((s) => String(s.id) === draft.statusId)?.label;
  const divisionLabel = divisionOptions.find((d) => d.id === draft.divisionId)?.label;
  const clientLabel = clients.find((c) => String(c.id) === draft.clientId);
  const estimatorLabel = estimators.find((e) => String(e.id) === draft.estimatorId);

  const pickerOptions = useMemo(() => {
    if (pickerField === "status") {
      return statuses.map((s) => ({
        id: String(s.id),
        label: s.label || "Unknown"
      }));
    }
    if (pickerField === "division") return divisionOptions;
    if (pickerField === "client") {
      return clients.map((c) => ({
        id: String(c.id),
        label: clientDisplayName(c)
      }));
    }
    if (pickerField === "estimator") {
      return estimators.map((e) => ({
        id: String(e.id),
        label: employeeDisplayName(e)
      }));
    }
    return [];
  }, [pickerField, statuses, divisionOptions, clients, estimators]);

  const pickerTitle =
    pickerField === "status"
      ? "Status"
      : pickerField === "division"
        ? "Division"
        : pickerField === "client"
          ? "Client"
          : pickerField === "estimator"
            ? "Estimator"
            : "";

  const selectedPickerId =
    pickerField === "status"
      ? draft.statusId
      : pickerField === "division"
        ? draft.divisionId
        : pickerField === "client"
          ? draft.clientId
          : pickerField === "estimator"
            ? draft.estimatorId
            : undefined;

  const setPickerValue = (id: string | undefined) => {
    if (pickerField === "status") setDraft((d) => ({ ...d, statusId: id }));
    else if (pickerField === "division")
      setDraft((d) => ({ ...d, divisionId: id }));
    else if (pickerField === "client") setDraft((d) => ({ ...d, clientId: id }));
    else if (pickerField === "estimator")
      setDraft((d) => ({ ...d, estimatorId: id }));
    setPickerField(null);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {pickerField ? (
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setPickerField(null)}
            >
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtn} />
          )}
          <Text style={styles.title}>
            {pickerField ? pickerTitle : "Filters"}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {pickerField ? (
            <>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setPickerValue(undefined)}
              >
                <Text style={styles.optionText}>Any</Text>
                {!selectedPickerId ? (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
              {pickerOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={styles.optionRow}
                  onPress={() => setPickerValue(opt.id)}
                >
                  <Text style={styles.optionText} numberOfLines={2}>
                    {opt.label}
                  </Text>
                  {selectedPickerId === opt.id ? (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={colors.primary}
                    />
                  ) : null}
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.description}>
                Show only the items that match what you need.
              </Text>
              <FilterRow
                label="Status"
                value={statusLabel}
                onPress={() => setPickerField("status")}
              />
              <FilterRow
                label="Division"
                value={divisionLabel}
                onPress={() => setPickerField("division")}
              />
              <FilterRow
                label="Client"
                value={clientLabel ? clientDisplayName(clientLabel) : undefined}
                onPress={() => setPickerField("client")}
              />
              <FilterRow
                label="Estimator"
                value={
                  estimatorLabel
                    ? employeeDisplayName(estimatorLabel)
                    : undefined
                }
                onPress={() => setPickerField("estimator")}
              />
            </>
          )}
        </ScrollView>

        {!pickerField ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) }
            ]}
          >
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => setDraft({})}
            >
              <Text style={styles.clearText}>Clear All</Text>
            </TouchableOpacity>
            <View style={styles.footerActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => {
                  onApply(draft);
                  onClose();
                }}
              >
                <Text style={styles.applyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    flex: 1,
    textAlign: "center",
    ...typography.subtitle,
    color: colors.textPrimary
  },
  body: {
    flex: 1
  },
  bodyContent: {
    padding: spacing.lg,
    gap: spacing.sm
  },
  description: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.sm
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md
  },
  filterLabel: {
    ...typography.body,
    color: colors.textPrimary
  },
  filterValueWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
    minWidth: 0
  },
  filterValue: {
    ...typography.bodySmall,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: "right"
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md
  },
  optionText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md
  },
  clearBtn: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs
  },
  clearText: {
    ...typography.bodySmall,
    color: colors.primary
  },
  footerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.card
  },
  cancelText: {
    ...typography.buttonSmall,
    color: colors.textBody
  },
  applyBtn: {
    borderRadius: radius.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary
  },
  applyText: {
    ...typography.buttonSmall,
    color: "#fff"
  }
});
