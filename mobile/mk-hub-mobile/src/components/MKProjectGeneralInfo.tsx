import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { MKBadge } from "./MKBadge";
import {
  getProjectStatusBadgeVariant,
  resolveProjectCoverPath
} from "../lib/projectUi";
import {
  formatRelatedCustomers,
  formatSiteDisplay,
  resolveEmployeeName,
  resolveEmployeeNames
} from "../lib/projectDetailUi";
import { resolveFileUrl } from "../lib/fileUrls";
import type { ProjectDetail, ProjectListItem } from "../types/projects";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius, shadows } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectGeneralInfoProps {
  project: ProjectDetail | ProjectListItem;
  detail?: ProjectDetail | null;
  token?: string | null;
  employeeLookup?: Map<string, string>;
  variant?: "full" | "compact";
}

function formatShortDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatMoney(value?: number | null): string | null {
  if (value == null || Number.isNaN(Number(value)) || Number(value) === 0) {
    return null;
  }
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

const InfoRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  subvalue?: string;
}> = ({ icon, label, value, subvalue }) => (
  <View style={styles.infoRow}>
    <View style={styles.infoIcon}>
      <Ionicons name={icon} size={16} color={colors.textMuted} />
    </View>
    <View style={styles.infoCopy}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      {subvalue ? <Text style={styles.infoSub}>{subvalue}</Text> : null}
    </View>
  </View>
);

export const MKProjectGeneralInfo: React.FC<MKProjectGeneralInfoProps> = ({
  project,
  detail,
  token,
  employeeLookup = new Map(),
  variant = "full"
}) => {
  const data = { ...project, ...(detail ?? {}) } as ProjectDetail;
  const isBidding = Boolean(data.is_bidding);
  const isCompact = variant === "compact";
  const progress = Math.max(0, Math.min(100, Number(data.progress ?? 0)));
  const showProgress = !isBidding && progress > 0;
  const site = formatSiteDisplay(data);
  const coverPath = resolveProjectCoverPath(data);
  const coverUri = resolveFileUrl(coverPath, token ?? null);
  const clientName = data.client_display_name || data.client_name || "";
  const related = formatRelatedCustomers(data);
  const estimators = resolveEmployeeNames(
    detail?.estimator_ids ??
      (detail?.estimator_id ? [detail.estimator_id] : undefined),
    employeeLookup
  );
  const admin = resolveEmployeeName(detail?.project_admin_id, employeeLookup);
  const value = formatMoney(data.service_value);
  const start = formatShortDate(data.date_start);
  const awarded = formatShortDate(detail?.date_awarded);
  const eta = formatShortDate(detail?.date_eta ?? data.date_eta);

  return (
    <View style={[styles.wrap, isCompact && styles.wrapCompact]}>
      <View style={styles.hero}>
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={[styles.cover, isCompact && styles.coverCompact]}
          />
        ) : (
          <View
            style={[
              styles.cover,
              isCompact && styles.coverCompact,
              styles.coverFallback
            ]}
          >
            <Ionicons
              name={isBidding ? "document-text-outline" : "folder-open-outline"}
              size={36}
              color="rgba(255,255,255,0.85)"
            />
          </View>
        )}
        <LinearGradient
          colors={["rgba(15,23,42,0.05)", "rgba(15,23,42,0.82)"]}
          style={styles.heroOverlay}
        >
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
          <Text style={styles.heroName} numberOfLines={isCompact ? 1 : 3}>
            {data.name || "Untitled"}
          </Text>
          {clientName ? (
            <Text style={styles.heroClient} numberOfLines={1}>
              {clientName}
            </Text>
          ) : null}
        </LinearGradient>
      </View>

      {isCompact ? (
        data.code ? (
          <View style={styles.compactCode}>
            <Text style={styles.infoLabel}>Code</Text>
            <Text style={styles.infoValue}>{data.code}</Text>
          </View>
        ) : null
      ) : (
        <View style={styles.details}>
          {showProgress ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{Math.round(progress)}% complete</Text>
            </View>
          ) : null}

          {data.code ? (
            <InfoRow icon="pricetag-outline" label="Code" value={data.code} />
          ) : null}
          {clientName ? (
            <InfoRow
              icon="business-outline"
              label="Customer"
              value={clientName}
            />
          ) : null}
          {related !== "—" ? (
            <InfoRow
              icon="people-outline"
              label="Related customers"
              value={related}
            />
          ) : null}
          {site.title !== "—" ? (
            <InfoRow
              icon="location-outline"
              label="Site"
              value={site.title}
              subvalue={site.address}
            />
          ) : null}
          {data.lead_source ? (
            <InfoRow
              icon="navigate-outline"
              label="Lead source"
              value={data.lead_source}
            />
          ) : null}
          {value ? (
            <InfoRow icon="cash-outline" label="Value" value={value} />
          ) : null}
          {start ? (
            <InfoRow icon="calendar-outline" label="Start" value={start} />
          ) : null}
          {awarded ? (
            <InfoRow icon="ribbon-outline" label="Awarded" value={awarded} />
          ) : null}
          {eta ? (
            <InfoRow icon="flag-outline" label="ETA" value={eta} />
          ) : null}
          {estimators !== "—" ? (
            <InfoRow
              icon="person-outline"
              label="Estimators"
              value={estimators}
            />
          ) : null}
          {!isBidding && admin !== "—" ? (
            <InfoRow
              icon="shield-outline"
              label="Project admin"
              value={admin}
            />
          ) : null}

          {detail?.contact_name || detail?.contact_email || detail?.contact_phone ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Contact</Text>
              {detail.contact_name ? (
                <InfoRow
                  icon="person-circle-outline"
                  label="Name"
                  value={detail.contact_name}
                />
              ) : null}
              {detail.contact_email ? (
                <InfoRow
                  icon="mail-outline"
                  label="Email"
                  value={detail.contact_email}
                />
              ) : null}
              {detail.contact_phone ? (
                <InfoRow
                  icon="call-outline"
                  label="Phone"
                  value={detail.contact_phone}
                />
              ) : null}
            </>
          ) : null}

          {detail?.description ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.description}>{detail.description}</Text>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: spacing.md,
    ...shadows.card
  },
  wrapCompact: {
    marginBottom: spacing.md
  },
  hero: {
    position: "relative"
  },
  cover: {
    width: "100%",
    height: 210,
    backgroundColor: "#1F2937"
  },
  coverCompact: { height: 128 },
  coverFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#147D36"
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 16,
    gap: 6
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  heroName: {
    fontFamily: typography.button.fontFamily,
    fontSize: 22,
    lineHeight: 28,
    color: "#fff"
  },
  heroClient: {
    fontSize: 13,
    color: "rgba(255,255,255,0.86)"
  },
  compactCode: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2
  },
  details: {
    padding: 16,
    gap: 12
  },
  progressBlock: {
    gap: 6,
    marginBottom: 4
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: "#E5E7EB",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.homeAccent,
    borderRadius: radius.pill
  },
  progressLabel: {
    fontSize: 12,
    color: colors.textMuted
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1
  },
  infoCopy: { flex: 1, minWidth: 0, gap: 1 },
  infoLabel: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.textMuted
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary
  },
  infoSub: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 2
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4
  },
  sectionLabel: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.textMuted
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textBody
  }
});
