import React, { useEffect, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { getProjectProposals } from "../../services/proposals";
import { createProjectReport } from "../../services/reports";
import { toApiError } from "../../services/api";
import { typography } from "../../theme/typography";
import type { ProjectListItem } from "../../types/projects";
import type { Proposal } from "../../services/proposals";

interface ProjectProposalsScreenProps {
  project: ProjectListItem;
  onBack: () => void;
}

export const ProjectProposalsScreen: React.FC<ProjectProposalsScreenProps> = ({
  project,
  onBack
}) => {
  const insets = useSafeAreaInsets();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    try {
      setLoading(true);
      const data = await getProjectProposals(project.id);
      setProposals(data);
    } catch (err) {
      console.error("[ProjectProposals] Error:", err);
      const apiError = toApiError(err);
      Alert.alert("Error", apiError.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreateReport = () => {
    setReportTitle("");
    setReportDescription("");
    setReportModalVisible(true);
  };

  const closeReportModal = () => {
    setReportModalVisible(false);
  };

  const handleSubmitReport = async () => {
    const title = reportTitle.trim();
    if (!title) {
      Alert.alert("Title required", "Please enter a report title.");
      return;
    }
    try {
      setSubmittingReport(true);
      await createProjectReport(project.id, {
        title,
        description: reportDescription.trim()
      });
      Alert.alert("Success", "Report created successfully.");
      closeReportModal();
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not create report", apiError.message);
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Proposals</Text>
        <Text style={styles.subtitle}>{project.name}</Text>
      </View>

      <View style={styles.actionsBar}>
        <MKButton
          title="Create Report"
          onPress={openCreateReport}
          style={styles.createButton}
        />
      </View>

      <Modal
        visible={reportModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeReportModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Report</Text>
            <TouchableOpacity onPress={closeReportModal} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalLabel}>Title *</Text>
            <TextInput
              style={styles.modalInput}
              value={reportTitle}
              onChangeText={setReportTitle}
              placeholder="Report title"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
            />
            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              value={reportDescription}
              onChangeText={setReportDescription}
              placeholder="Optional description"
              placeholderTextColor={colors.textMuted}
              multiline
              numberOfLines={3}
            />
            <MKButton
              title="Create Report"
              onPress={handleSubmitReport}
              loading={submittingReport}
              disabled={submittingReport}
              style={styles.modalSubmit}
            />
          </ScrollView>
        </View>
      </Modal>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {proposals.map((proposal) => (
            <MKCard key={proposal.id} style={styles.proposalCard} elevated={true}>
              <Text style={styles.proposalTitle}>{proposal.title || "Proposal"}</Text>
              {proposal.order_number && (
                <Text style={styles.proposalCode}>Order: {proposal.order_number}</Text>
              )}
              {proposal.created_at && (
                <Text style={styles.proposalDate}>
                  Created: {new Date(proposal.created_at).toLocaleDateString()}
                </Text>
              )}
            </MKCard>
          ))}
          {proposals.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No proposals found</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backButton: {
    marginBottom: spacing.sm
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted
  },
  actionsBar: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  createButton: {
    width: "100%"
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md
  },
  proposalCard: {
    padding: spacing.md
  },
  proposalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  proposalCode: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  proposalDate: {
    fontSize: 12,
    color: colors.textMuted
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: "center"
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xl
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg
  },
  modalTitle: {
    ...typography.titleSmall
  },
  modalClose: {
    padding: spacing.sm
  },
  modalCloseText: {
    ...typography.body,
    color: colors.primary
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: spacing.xl
  },
  modalLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
    textTransform: "uppercase"
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    marginBottom: spacing.lg,
    backgroundColor: colors.card
  },
  modalInputMultiline: {
    minHeight: 80,
    textAlignVertical: "top"
  },
  modalSubmit: {
    marginTop: spacing.sm,
    marginBottom: spacing.xxl
  }
});

