import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MKCard } from "./MKCard";
import { MKBadge } from "./MKBadge";
import type { ProjectMember } from "../services/projectTeam";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectTeamSectionProps {
  members: ProjectMember[];
  scheduledWorkerIds: string[];
  employeeLookup: Map<string, string>;
  loading?: boolean;
}

function memberLabel(member: ProjectMember): string {
  return member.name || member.username || "User";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <View style={styles.avatar}>
    <Text style={styles.avatarText}>{initials(name)}</Text>
  </View>
);

export const MKProjectTeamSection: React.FC<MKProjectTeamSectionProps> = ({
  members,
  scheduledWorkerIds,
  employeeLookup,
  loading
}) => {
  const scheduledWorkers = useMemo(
    () =>
      scheduledWorkerIds.map((id) => ({
        id,
        name: employeeLookup.get(id) || "Unknown"
      })),
    [scheduledWorkerIds, employeeLookup]
  );

  return (
    <MKCard style={styles.card} elevated>
      <Text style={styles.title}>Project Team</Text>
      <Text style={styles.subtitle}>
        Members with project access and workers scheduled on shifts.
      </Text>

      {loading ? (
        <Text style={styles.empty}>Loading team...</Text>
      ) : members.length === 0 ? (
        <Text style={styles.empty}>No team members yet.</Text>
      ) : (
        <View style={styles.memberList}>
          {members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <Avatar name={memberLabel(member)} />
              <View style={styles.memberBody}>
                <Text style={styles.memberName} numberOfLines={1}>
                  {memberLabel(member)}
                </Text>
                <MKBadge variant={member.is_creator ? "info" : "neutral"}>
                  {member.is_creator
                    ? "Creator"
                    : member.member_role || "Member"}
                </MKBadge>
              </View>
            </View>
          ))}
        </View>
      )}

      {scheduledWorkers.length > 0 ? (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Scheduled workers</Text>
          <View style={styles.chipRow}>
            {scheduledWorkers.map((worker) => (
              <View key={worker.id} style={styles.chip}>
                <Avatar name={worker.name} />
                <Text style={styles.chipText} numberOfLines={1}>
                  {worker.name}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </MKCard>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.md
  },
  empty: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  memberList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    overflow: "hidden"
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card
  },
  memberBody: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  memberName: {
    ...typography.body,
    color: colors.textPrimary
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    ...typography.caption,
    color: "#fff",
    fontFamily: typography.button.fontFamily
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: typography.button.fontFamily,
    marginBottom: spacing.sm
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    maxWidth: "100%",
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.textBody,
    flexShrink: 1
  }
});
