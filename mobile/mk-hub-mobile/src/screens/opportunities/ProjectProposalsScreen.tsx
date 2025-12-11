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
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { getProjectProposals } from "../../services/proposals";
import { toApiError } from "../../services/api";
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
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = () => {
    // TODO: Navigate to report creation wizard
    console.log("Create report for project:", project.id);
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
          title="📋 Create Report"
          onPress={handleCreateReport}
          style={styles.createButton}
        />
      </View>

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
  }
});

