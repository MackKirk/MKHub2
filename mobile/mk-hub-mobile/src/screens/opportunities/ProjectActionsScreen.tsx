import React from "react";
import {
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
import type { ProjectListItem } from "../../types/projects";

interface ProjectActionsScreenProps {
  project: ProjectListItem;
  onBack: () => void;
  onUploadImages: () => void;
  onViewProposals: () => void;
  onViewWorkload: () => void;
  onViewProposal: () => void;
  onViewEstimate: () => void;
  onViewOrders: () => void;
}

export const ProjectActionsScreen: React.FC<ProjectActionsScreenProps> = ({
  project,
  onBack,
  onUploadImages,
  onViewProposals,
  onViewWorkload,
  onViewProposal,
  onViewEstimate,
  onViewOrders
}) => {
  const insets = useSafeAreaInsets();

  const actionButtons = [
    {
      id: "upload",
      icon: "📸",
      title: "Upload Images",
      subtitle: "Add photos to project",
      onPress: onUploadImages,
      color: colors.primary
    },
    {
      id: "reports",
      icon: "📋",
      title: "Reports",
      subtitle: "View and create reports",
      onPress: onViewProposals,
      color: colors.primary
    },
    {
      id: "workload",
      icon: "⏱️",
      title: "Workload",
      subtitle: "View timesheet entries",
      onPress: onViewWorkload,
      color: colors.textMuted
    },
    {
      id: "proposal",
      icon: "📋",
      title: "Proposal",
      subtitle: "View proposal details",
      onPress: onViewProposal,
      color: colors.textMuted
    },
    {
      id: "estimate",
      icon: "💰",
      title: "Estimate",
      subtitle: "View estimate items and total",
      onPress: onViewEstimate,
      color: colors.textMuted
    },
    {
      id: "orders",
      icon: "📦",
      title: "Orders",
      subtitle: "Create and approve orders",
      onPress: onViewOrders,
      color: colors.primary
    }
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{project.name}</Text>
        {project.code && (
          <Text style={styles.subtitle}>{project.code}</Text>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {actionButtons.map((button) => (
          <MKCard
            key={button.id}
            style={styles.actionCard}
            onPress={button.onPress}
            elevated={true}
          >
            <View style={styles.actionCardContent}>
              <Text style={styles.actionIcon}>{button.icon}</Text>
              <View style={styles.actionTextContainer}>
                <Text style={styles.actionTitle}>{button.title}</Text>
                <Text style={styles.actionSubtitle}>{button.subtitle}</Text>
              </View>
            </View>
          </MKCard>
        ))}
      </ScrollView>
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
    padding: spacing.md,
    gap: spacing.md
  },
  actionCard: {
    marginBottom: spacing.sm
  },
  actionCardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md
  },
  actionIcon: {
    fontSize: 32,
    marginRight: spacing.md
  },
  actionTextContainer: {
    flex: 1
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  actionSubtitle: {
    fontSize: 14,
    color: colors.textMuted
  }
});

