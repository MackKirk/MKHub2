import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MKCard } from "./MKCard";
import { MKBadge } from "./MKBadge";
import { getProjectStatusBadgeVariant } from "../lib/projectUi";
import {
  formatProjectDate,
  formatRelatedCustomers,
  formatSiteDisplay,
  resolveEmployeeName,
  resolveEmployeeNames
} from "../lib/projectDetailUi";
import { resolveFileUrl } from "../lib/fileUrls";
import type { ProjectDetail, ProjectListItem } from "../types/projects";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectGeneralInfoProps {
  project: ProjectDetail | ProjectListItem;
  detail?: ProjectDetail | null;
  token?: string | null;
  employeeLookup?: Map<string, string>;
  variant?: "full" | "compact";
}

const InfoField: React.FC<{
  label: string;
  value: string;
  accent?: boolean;
  multiline?: boolean;
}> = ({ label, value, accent, multiline }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text
      style={[styles.fieldValue, accent && styles.fieldValueAccent]}
      numberOfLines={multiline ? undefined : 3}
    >
      {value || "—"}
    </Text>
  </View>
);

export const MKProjectGeneralInfo: React.FC<MKProjectGeneralInfoProps> = ({
  project,
  detail,
  token,
  employeeLookup = new Map(),
  variant = "full"
}) => {
  const data = detail ?? project;
  const isBidding = Boolean(data.is_bidding);
  const isCompact = variant === "compact";
  const progress = Math.max(0, Math.min(100, Number(data.progress ?? 0)));
  const showProgress = !isBidding && progress > 0;
  const site = formatSiteDisplay(data);
  const coverUri =
    resolveFileUrl(data.cover_image_url, token ?? null) ??
    resolveFileUrl("/ui/assets/placeholders/project.png", null);

  const estimatorIds =
    detail?.estimator_ids ??
    (detail?.estimator_id ? [detail.estimator_id] : undefined);

  return (
    <MKCard style={[styles.card, isCompact && styles.cardCompact]} elevated>
      {!isCompact ? (
        <View style={styles.coverWrap}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Ionicons name="business-outline" size={32} color={colors.textMuted} />
            </View>
          )}
        </View>
      ) : null}

      <View style={[styles.identity, isCompact && styles.identityCompact]}>
        <Text style={[styles.projectName, isCompact && styles.projectNameCompact]}>
          {data.name || "Untitled"}
        </Text>
        <View style={styles.badgeRow}>
          <MKBadge variant="neutral">
            {isBidding ? "Opportunity" : "Project"}
          </MKBadge>
          {data.status_label ? (
            <MKBadge variant={getProjectStatusBadgeVariant(data.status_label)}>
              {data.status_label}
            </MKBadge>
          ) : null}
        </View>
      </View>

      {isCompact ? (
        <>
          <View style={styles.sectionDivider} />
          <View style={styles.compactCodeBlock}>
            <Text style={styles.fieldLabel}>Code</Text>
            <Text style={styles.fieldValue}>{data.code || "—"}</Text>
          </View>
        </>
      ) : (
        <>
          {showProgress ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{Math.round(progress)}% complete</Text>
            </View>
          ) : null}

          <View style={styles.sectionDivider} />
          <Text style={styles.sectionTitle}>General Information</Text>

          <View style={styles.fieldsGrid}>
            <InfoField label="Code" value={data.code || "—"} />

            <InfoField
              label="Project Owner / Source"
              value={
                data.client_display_name || data.client_name || "—"
              }
              accent
            />

            <InfoField
              label="Related Customers"
              value={formatRelatedCustomers(data)}
              multiline
            />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Site</Text>
              <Text style={styles.fieldValue}>{site.title}</Text>
              {site.address ? (
                <Text style={styles.fieldSubvalue}>{site.address}</Text>
              ) : null}
            </View>

            {isBidding || data.lead_source ? (
              <InfoField label="Lead Source" value={data.lead_source || "—"} />
            ) : null}

            {!isBidding ? (
              <>
                <InfoField
                  label="Start Date"
                  value={formatProjectDate(data.date_start)}
                />
                <InfoField
                  label="Awarded Date"
                  value={formatProjectDate(detail?.date_awarded)}
                />
                <InfoField
                  label="End Date"
                  value={formatProjectDate(detail?.date_eta ?? data.date_eta)}
                />
              </>
            ) : null}

            <InfoField
              label="Estimators"
              value={resolveEmployeeNames(estimatorIds, employeeLookup)}
              multiline
            />

            {!isBidding ? (
              <InfoField
                label="Project Admin"
                value={resolveEmployeeName(detail?.project_admin_id, employeeLookup)}
              />
            ) : null}
          </View>

          {detail?.contact_name || detail?.contact_email || detail?.contact_phone ? (
            <>
              <View style={styles.sectionDivider} />
              <Text style={styles.sectionTitle}>Contact</Text>
              <View style={styles.fieldsGrid}>
                {detail.contact_name ? (
                  <InfoField label="Name" value={detail.contact_name} />
                ) : null}
                {detail.contact_email ? (
                  <InfoField label="Email" value={detail.contact_email} />
                ) : null}
                {detail.contact_phone ? (
                  <InfoField label="Phone" value={detail.contact_phone} />
                ) : null}
              </View>
            </>
          ) : null}
        </>
      )}
    </MKCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: "hidden",
    marginBottom: spacing.lg
  },
  cardCompact: {
    marginBottom: spacing.md
  },
  coverWrap: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  cover: {
    width: "100%",
    height: 140,
    backgroundColor: colors.background
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center"
  },
  identity: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm
  },
  identityCompact: {
    paddingTop: spacing.md,
    paddingBottom: 0
  },
  projectName: {
    ...typography.title,
    color: colors.textPrimary
  },
  projectNameCompact: {
    ...typography.subtitle,
    fontSize: 18
  },
  compactCodeBlock: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 4
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  progressBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: radius.pill
  },
  progressLabel: {
    ...typography.caption,
    color: colors.textMuted
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm
  },
  fieldsGrid: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md
  },
  field: {
    gap: 4
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: typography.button.fontFamily
  },
  fieldValue: {
    ...typography.body,
    color: colors.textPrimary
  },
  fieldValueAccent: {
    color: colors.primary,
    fontFamily: typography.button.fontFamily
  },
  fieldSubvalue: {
    ...typography.bodySmall,
    color: colors.textBody,
    marginTop: 2
  }
});
