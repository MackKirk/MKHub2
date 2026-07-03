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
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  createSafetyInspection,
  getProjectSafetyInspections,
  getSchedulableFormTemplates,
  type SafetyInspection
} from "../services/safety";
import { toApiError } from "../services/api";
import type { RootStackParamList } from "../navigation/types";
import { MKButton } from "./MKButton";
import { MKCard } from "./MKCard";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectSafetySectionProps {
  projectId: string;
  canWrite: boolean;
}

type Nav = NativeStackNavigationProp<RootStackParamList, "ProjectDetail">;

const formatInspectionDate = (value?: string | null): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString();
};

function statusLabel(status?: string | null): string {
  if (status === "finalized") return "Finalized";
  if (status === "pending_signatures") return "Signatures";
  return "Draft";
}

function statusColor(status?: string | null) {
  if (status === "finalized") return styles.statusFinalized;
  if (status === "pending_signatures") return styles.statusSignatures;
  return styles.statusDraft;
}

export const MKProjectSafetySection: React.FC<MKProjectSafetySectionProps> = ({
  projectId,
  canWrite
}) => {
  const navigation = useNavigation<Nav>();
  const [inspections, setInspections] = useState<SafetyInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; version_label?: string }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const loadInspections = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await getProjectSafetyInspections(projectId);
      setInspections(rows);
    } catch (err) {
      Alert.alert("Could not load inspections", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      loadInspections();
    }, [loadInspections])
  );

  const openCreateModal = async () => {
    setShowCreateModal(true);
    setSelectedTemplateId("");
    try {
      setLoadingTemplates(true);
      const items = await getSchedulableFormTemplates();
      setTemplates(items);
    } catch (err) {
      Alert.alert("Could not load templates", toApiError(err).message);
      setShowCreateModal(false);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedTemplateId) {
      Alert.alert("Select a template", "Choose a form template to continue.");
      return;
    }
    try {
      setCreating(true);
      const row = await createSafetyInspection(projectId, selectedTemplateId);
      setShowCreateModal(false);
      await loadInspections();
      navigation.navigate("SafetyInspectionDetail", {
        projectId,
        inspectionId: row.id
      });
    } catch (err) {
      Alert.alert("Could not create inspection", toApiError(err).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Safety Inspections</Text>
          <Text style={styles.subtitle}>
            Site safety inspections for this awarded project.
          </Text>
        </View>
        {canWrite ? (
          <MKButton
            title="New Inspection"
            onPress={openCreateModal}
            size="compact"
            style={styles.addButton}
          />
        ) : null}
      </View>

      <MKCard style={styles.card} elevated>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : inspections.length === 0 ? (
          <Text style={styles.emptyText}>No inspections yet.</Text>
        ) : (
          inspections.map((row) => {
            const templateName =
              row.template_name ||
              (row.template_version?.startsWith("mki")
                ? "MKI Safety Inspection"
                : row.template_version || "Inspection");
            return (
              <TouchableOpacity
                key={row.id}
                style={styles.row}
                onPress={() =>
                  navigation.navigate("SafetyInspectionDetail", {
                    projectId,
                    inspectionId: row.id
                  })
                }
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{formatInspectionDate(row.inspection_date)}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {templateName}
                  </Text>
                </View>
                <View style={[styles.statusBadge, statusColor(row.status)]}>
                  <Text style={styles.statusText}>{statusLabel(row.status)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </MKCard>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowCreateModal(false)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Start from template</Text>
            <Text style={styles.sheetSubtitle}>
              Choose an active form template for a new inspection.
            </Text>
            {loadingTemplates ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <ScrollView style={styles.templateList}>
                {templates.map((template) => (
                  <TouchableOpacity
                    key={template.id}
                    style={[
                      styles.templateOption,
                      selectedTemplateId === template.id && styles.templateOptionActive
                    ]}
                    onPress={() => setSelectedTemplateId(template.id)}
                  >
                    <Text style={styles.templateOptionText}>
                      {template.name}
                      {template.version_label ? ` (${template.version_label})` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={styles.sheetActions}>
              <MKButton
                title="Cancel"
                variant="secondary"
                onPress={() => setShowCreateModal(false)}
                style={styles.sheetButton}
              />
              <MKButton
                title={creating ? "Creating..." : "Create"}
                onPress={handleCreate}
                loading={creating}
                disabled={creating || !selectedTemplateId}
                style={styles.sheetButton}
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  headerText: { flex: 1, gap: spacing.xs },
  title: { ...typography.subtitle },
  subtitle: { ...typography.bodySmall, color: colors.textMuted },
  addButton: { minWidth: 128 },
  card: { marginBottom: spacing.md },
  center: { padding: spacing.xl, alignItems: "center" },
  emptyText: { ...typography.bodySmall, color: colors.textMuted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.bodySmall, marginBottom: spacing.xs },
  rowMeta: { ...typography.caption },
  statusBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4
  },
  statusDraft: { backgroundColor: "#FEF3C7" },
  statusSignatures: { backgroundColor: "#E0F2FE" },
  statusFinalized: { backgroundColor: "#DCFCE7" },
  statusText: { ...typography.caption, fontWeight: "600" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.lg,
    maxHeight: "70%"
  },
  sheetTitle: { ...typography.subtitle, marginBottom: spacing.xs },
  sheetSubtitle: { ...typography.bodySmall, color: colors.textMuted, marginBottom: spacing.md },
  templateList: { maxHeight: 280, marginBottom: spacing.md },
  templateOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  templateOptionActive: { backgroundColor: colors.background },
  templateOptionText: { ...typography.body },
  sheetActions: { flexDirection: "row", gap: spacing.sm },
  sheetButton: { flex: 1, alignSelf: "stretch" }
});
