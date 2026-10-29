import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OnboardingDocumentRow, SignatureRequestRow } from "../../types/inbox";
import type { SafetyFollowUp, SafetyInspectionListRow } from "../../services/safety";
import { colors } from "../../theme/colors";
import { shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const ACCENT = "#7C3AED";
const PENDING_WATERMARK = require("../../../assets/brand/task-todo-watermark.png");

function darkenHex(hex: string, amount = 0.28): string {
  const raw = hex.replace("#", "");
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function formatShortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function inspectionStatusLabel(status?: string | null): string {
  if ((status || "").toLowerCase() === "pending_signatures") return "Waiting for signatures";
  return "In progress";
}

function deadlineLabel(doc: OnboardingDocumentRow): string {
  if (doc.remaining_days == null && !doc.deadline_at) return "Waiting for signature";
  if ((doc.remaining_days ?? 1) <= 0) return "Deadline passed";
  if (doc.remaining_days === 1) return "1 day left";
  if (doc.remaining_days != null) return `${doc.remaining_days} days left`;
  return formatShortDate(doc.deadline_at) ? `Due ${formatShortDate(doc.deadline_at)}` : "Waiting for signature";
}

export function pendingSummary(
  signCount: number,
  followUpCount: number,
  inspectionCount: number
): string {
  const parts: string[] = [];
  if (signCount > 0) parts.push(signCount === 1 ? "1 to sign" : `${signCount} to sign`);
  if (followUpCount > 0) {
    parts.push(followUpCount === 1 ? "1 follow-up" : `${followUpCount} follow-ups`);
  }
  if (inspectionCount > 0) {
    parts.push(inspectionCount === 1 ? "1 inspection" : `${inspectionCount} inspections`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Nothing waiting on you";
}

interface HomePendingButtonProps {
  summary: string;
  count: number;
  onPress: () => void;
}

export const HomePendingButton: React.FC<HomePendingButtonProps> = ({
  summary,
  count,
  onPress
}) => (
  <TouchableOpacity
    style={styles.button}
    onPress={onPress}
    activeOpacity={0.75}
    accessibilityRole="button"
    accessibilityLabel={count > 0 ? `Pending, ${summary}` : "Pending, nothing waiting"}
  >
    <LinearGradient
      colors={[darkenHex(ACCENT), ACCENT]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.rail}
    />
    <View style={styles.body}>
      <Image
        source={PENDING_WATERMARK}
        style={styles.watermark}
        resizeMode="contain"
        tintColor={ACCENT}
        pointerEvents="none"
      />
      <View style={styles.buttonIcon}>
        <Ionicons name="alert-circle-outline" size={22} color={ACCENT} />
      </View>
      <View style={styles.buttonCopy}>
        <Text style={styles.buttonTitle}>Pending</Text>
        <Text style={styles.buttonSubtitle} numberOfLines={1}>
          {summary}
        </Text>
      </View>
      {count > 0 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </View>
  </TouchableOpacity>
);

interface HomePendingModalProps {
  visible: boolean;
  loading: boolean;
  signatureRequests: SignatureRequestRow[];
  onboardingDocs: OnboardingDocumentRow[];
  followUps: SafetyFollowUp[];
  inspections: SafetyInspectionListRow[];
  onClose: () => void;
  onOpenSign: () => void;
  onOpenFollowUp: (item: SafetyFollowUp) => void;
  onOpenInspection: (item: SafetyInspectionListRow) => void;
}

export const HomePendingModal: React.FC<HomePendingModalProps> = ({
  visible,
  loading,
  signatureRequests,
  onboardingDocs,
  followUps,
  inspections,
  onClose,
  onOpenSign,
  onOpenFollowUp,
  onOpenInspection
}) => {
  const insets = useSafeAreaInsets();
  const docs = [
    ...onboardingDocs.map((doc) => ({
      key: `onb-${doc.id}`,
      title: doc.document_name || "Document",
      subtitle: [
        doc.required ? "Required" : null,
        doc.subject_label ? `For ${doc.subject_label}` : null,
        deadlineLabel(doc)
      ]
        .filter(Boolean)
        .join(" · ")
    })),
    ...signatureRequests.map((row) => ({
      key: `sig-${row.id}`,
      title: row.display_name || "Document",
      subtitle: [
        row.requested_by_name ? `From ${row.requested_by_name}` : null,
        row.my_role_label,
        "Ready to sign"
      ]
        .filter(Boolean)
        .join(" · ")
    }))
  ];
  const hasAnything = docs.length > 0 || followUps.length > 0 || inspections.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 }
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="alert-circle-outline" size={18} color={ACCENT} />
            <Text style={styles.headerTitle}>Pending</Text>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scroll}
          >
            {loading && !hasAnything ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={ACCENT} />
              </View>
            ) : null}

            {docs.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>To sign</Text>
                {docs.map((doc) => (
                  <TouchableOpacity
                    key={doc.key}
                    style={styles.row}
                    onPress={onOpenSign}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: "#EDE9FE" }]}>
                      <Ionicons name="create-outline" size={16} color="#6D28D9" />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {doc.title}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>
                        {doc.subtitle || "Open on the web to sign"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {followUps.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Follow-ups</Text>
                {followUps.map((item) => {
                  const due = formatShortDate(item.due_date);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.row}
                      onPress={() => onOpenFollowUp(item)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: "#FEF3C7" }]}>
                        <Ionicons name="flag-outline" size={16} color="#B45309" />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={2}>
                          {(item.label || "").trim() || item.template_name || "Follow-up"}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={2}>
                          {[
                            item.project_name || item.project_code || "Project",
                            item.source_field_label_snapshot,
                            due ? `Due ${due}` : null
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {inspections.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Inspections</Text>
                {inspections.map((item) => {
                  const when = formatShortDate(item.inspection_date);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.row}
                      onPress={() => onOpenInspection(item)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.rowIcon, { backgroundColor: "#ECFDF3" }]}>
                        <Ionicons name="clipboard-outline" size={16} color={colors.homeAccent} />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle} numberOfLines={2}>
                          {item.template_name || "Inspection"}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={2}>
                          {[
                            item.project_name || item.project_code || "Project",
                            inspectionStatusLabel(item.status),
                            when
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {!loading && !hasAnything ? (
              <Text style={styles.empty}>You're all caught up.</Text>
            ) : null}
          </ScrollView>
          <TouchableOpacity style={styles.dismiss} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.dismissText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  button: {
    marginTop: 12,
    minHeight: 108,
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  rail: {
    width: 6,
    alignSelf: "stretch"
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 14,
    overflow: "hidden"
  },
  watermark: {
    position: "absolute",
    right: -18,
    bottom: -26,
    width: 128,
    height: 128,
    opacity: 0.09
  },
  buttonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center"
  },
  buttonCopy: {
    flex: 1
  },
  buttonTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary
  },
  buttonSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 2
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: "#C22033",
    alignItems: "center",
    justifyContent: "center"
  },
  countText: {
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 12,
    lineHeight: 14,
    color: "#fff"
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: "rgba(15, 23, 42, 0.45)"
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 22,
    maxHeight: "86%",
    ...shadows.cardElevated
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm
  },
  headerTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    color: colors.textPrimary
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md
  },
  loadingBox: {
    paddingVertical: spacing.lg,
    alignItems: "center"
  },
  block: {
    gap: 2
  },
  blockTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    letterSpacing: 0.4,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 6
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  rowCopy: {
    flex: 1
  },
  rowTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary
  },
  rowMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    marginTop: 2
  },
  empty: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    paddingVertical: spacing.lg
  },
  dismiss: {
    alignItems: "center",
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border
  },
  dismissText: {
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 14,
    color: colors.textMuted
  }
});
