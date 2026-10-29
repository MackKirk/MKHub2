import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { BugReportView } from "../../lib/bugReport";
import { colors } from "../../theme/colors";
import { radius } from "../../theme/radius";
import { typography } from "../../theme/typography";

function severityStyle(severity: string): { color: string; bg: string } {
  if (severity === "High") return { color: "#B91C1C", bg: "#FEE2E2" };
  if (severity === "Medium") return { color: "#B45309", bg: "#FEF3C7" };
  if (severity === "Low") return { color: "#166534", bg: "#DCFCE7" };
  return { color: colors.textMuted, bg: "#F3F4F6" };
}

function openPage(url: string) {
  const target = url.trim();
  if (!target) return;
  void Linking.openURL(target).catch(() => undefined);
}

export const MKBugReportBody: React.FC<{ report: BugReportView }> = ({ report }) => {
  const severity = severityStyle(report.severity);
  const hasDetails = Boolean(
    report.severity || report.pageUrl || report.screen || report.reportedBy || report.userAgent
  );

  return (
    <View style={styles.wrap}>
      {report.description ? (
        <Text style={styles.description}>{report.description}</Text>
      ) : (
        <Text style={styles.muted}>No description.</Text>
      )}

      {hasDetails ? (
        <View style={styles.details}>
          <Text style={styles.detailsTitle}>Bug report</Text>
          {report.severity ? (
            <View style={styles.row}>
              <Text style={styles.label}>Severity</Text>
              <View style={[styles.chip, { backgroundColor: severity.bg }]}>
                <Text style={[styles.chipText, { color: severity.color }]}>{report.severity}</Text>
              </View>
            </View>
          ) : null}
          {report.pageUrl ? (
            <View style={styles.row}>
              <Text style={styles.label}>Page</Text>
              <Pressable onPress={() => openPage(report.pageUrl)} style={styles.valueWrap}>
                <Text style={styles.link}>{report.pageUrl}</Text>
              </Pressable>
            </View>
          ) : null}
          {report.screen ? (
            <View style={styles.row}>
              <Text style={styles.label}>Screen</Text>
              <Text style={styles.value}>{report.screen}</Text>
            </View>
          ) : null}
          {report.reportedBy ? (
            <View style={styles.row}>
              <Text style={styles.label}>Reported by</Text>
              <Text style={styles.value}>{report.reportedBy}</Text>
            </View>
          ) : null}
          {report.userAgent ? (
            <View style={styles.browserBlock}>
              <Text style={styles.label}>Browser</Text>
              <Text style={styles.browser}>{report.userAgent}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 14
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textBody
  },
  muted: {
    fontSize: 14,
    color: colors.textMuted
  },
  details: {
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 12
  },
  detailsTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.textMuted
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  label: {
    width: 92,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textMuted
  },
  valueWrap: {
    flex: 1
  },
  value: {
    flex: 1,
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary
  },
  link: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.homeAccent
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  chipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    lineHeight: 16
  },
  browserBlock: {
    gap: 6
  },
  browser: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 10
  }
});
