import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKBadge } from "../MKBadge";
import { MKCard } from "../MKCard";
import { getProjectStatusBadgeVariant } from "../../lib/projectUi";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type {
  CustomerProjectParticipation,
  CustomerRelatedMembership
} from "../../types/customers";

interface MKCustomerProjectsSectionProps {
  rollup: CustomerProjectParticipation[];
  relatedMemberships: CustomerRelatedMembership[];
  loading: boolean;
  onOpenProject: (project: CustomerProjectParticipation) => void;
}

export const MKCustomerProjectsSection: React.FC<MKCustomerProjectsSectionProps> = ({
  rollup,
  relatedMemberships,
  loading,
  onOpenProject
}) => {
  const opportunities = useMemo(() => rollup.filter((item) => item.is_bidding), [rollup]);
  const projects = useMemo(() => rollup.filter((item) => !item.is_bidding), [rollup]);

  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.sectionTitle}>Projects & Opportunities</Text>
        <Text style={styles.sectionSubtitle}>
          {loading ? "Loading related work..." : `${rollup.length} related records`}
        </Text>
      </View>

      <ProjectGroup title="Opportunities" items={opportunities} onOpenProject={onOpenProject} />
      <ProjectGroup title="Projects" items={projects} onOpenProject={onOpenProject} />

      {relatedMemberships.length > 0 ? (
        <MKCard style={styles.card}>
          <Text style={styles.groupTitle}>Related memberships</Text>
          {relatedMemberships.map((item) => (
            <View key={item.id} style={styles.relatedRow}>
              <View style={styles.relatedIcon}>
                <Ionicons name="git-branch-outline" size={16} color={colors.textMuted} />
              </View>
              <View style={styles.relatedTextWrap}>
                <Text style={styles.projectName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.projectMeta}>
                  {item.is_bidding ? "Opportunity" : "Project"}
                  {item.is_awarded_related ? " - awarded related" : ""}
                </Text>
              </View>
            </View>
          ))}
        </MKCard>
      ) : null}
    </View>
  );
};

function ProjectGroup({
  title,
  items,
  onOpenProject
}: {
  title: string;
  items: CustomerProjectParticipation[];
  onOpenProject: (project: CustomerProjectParticipation) => void;
}) {
  return (
    <MKCard style={styles.card}>
      <Text style={styles.groupTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>No {title.toLowerCase()} found.</Text>
      ) : (
        items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.projectRow}
            onPress={() => onOpenProject(item)}
            activeOpacity={0.75}
          >
            <View style={styles.projectTextWrap}>
              <Text style={styles.projectName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.projectMeta} numberOfLines={1}>
                {[item.code, item.participation].filter(Boolean).join(" - ") || "Related"}
              </Text>
            </View>
            {item.status_label ? (
              <MKBadge variant={getProjectStatusBadgeVariant(item.status_label)}>
                {item.status_label}
              </MKBadge>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ))
      )}
    </MKCard>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md
  },
  sectionTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textMuted
  },
  card: {
    gap: spacing.sm
  },
  groupTitle: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  projectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm
  },
  projectTextWrap: {
    flex: 1,
    minWidth: 0
  },
  projectName: {
    ...typography.bodySmall,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  projectMeta: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "capitalize"
  },
  relatedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm
  },
  relatedIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  },
  relatedTextWrap: {
    flex: 1,
    minWidth: 0
  }
});
