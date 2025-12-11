import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKCard } from "../../components/MKCard";
import { getProjectProposals, getProposal } from "../../services/proposals";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";

interface ProjectProposalViewScreenProps {
  project: ProjectListItem;
  onBack: () => void;
}

export const ProjectProposalViewScreen: React.FC<ProjectProposalViewScreenProps> = ({
  project,
  onBack
}) => {
  const insets = useSafeAreaInsets();
  const [proposals, setProposals] = useState<any[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    try {
      setLoading(true);
      const data = await getProjectProposals(project.id);
      setProposals(data);
      if (data.length > 0) {
        const proposalDetail = await getProposal(data[0].id);
        setSelectedProposal(proposalDetail);
      }
    } catch (err) {
      console.error("[ProjectProposalView] Error:", err);
      const apiError = toApiError(err);
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Proposal</Text>
        <Text style={styles.subtitle}>{project.name}</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : selectedProposal ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <MKCard style={styles.proposalCard} elevated={true}>
            <Text style={styles.proposalTitle}>
              {selectedProposal.data?.cover_title || selectedProposal.data?.title || "Proposal"}
            </Text>
            {selectedProposal.order_number && (
              <Text style={styles.proposalCode}>Order: {selectedProposal.order_number}</Text>
            )}
            {selectedProposal.created_at && (
              <Text style={styles.proposalDate}>
                Created: {new Date(selectedProposal.created_at).toLocaleDateString()}
              </Text>
            )}
            {selectedProposal.data && (
              <View style={styles.proposalData}>
                <Text style={styles.dataLabel}>Proposal Data:</Text>
                <Text style={styles.dataText}>
                  {JSON.stringify(selectedProposal.data, null, 2)}
                </Text>
              </View>
            )}
          </MKCard>
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No proposal found</Text>
        </View>
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
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.md
  },
  proposalCard: {
    padding: spacing.md
  },
  proposalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.md
  },
  proposalCode: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  proposalDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.md
  },
  proposalData: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  dataLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  dataText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "monospace"
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted
  }
});

