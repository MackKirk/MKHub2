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
import { BLAIR_HOURS_PHOTO, BLAIR_HOURS_TITLE } from "../../lib/blairHoursJoke";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { TaskItem } from "../../types/tasks";
import type { OnboardingDocumentRow, SignatureRequestRow } from "../../types/inbox";
import type { SafetyFollowUp, SafetyInspectionListRow } from "../../services/safety";
import { colors } from "../../theme/colors";
import { radius, shadows } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const ACCENT = colors.homeAccent;
const WARNING = "#B45309";

export type PendingHours = {
  label: string;
  date: string;
  joke?: boolean;
};

export type PendingSignTarget = {
  source: "onboarding" | "document_builder";
  id: string;
  title?: string;
};

type PendingItemsModalProps = {
  visible: boolean;
  loading?: boolean;
  hours?: PendingHours | null;
  tasks?: TaskItem[];
  otherOpenTaskCount?: number;
  signatureRequests?: SignatureRequestRow[];
  onboardingDocs?: OnboardingDocumentRow[];
  followUps?: SafetyFollowUp[];
  inspections?: SafetyInspectionListRow[];
  onDismiss: () => void;
  onLogHours?: () => void;
  onOpenTasks?: () => void;
  onOpenSign: (item?: PendingSignTarget) => void;
  onOpenFollowUp?: (item: SafetyFollowUp) => void;
  onOpenInspection?: (item: SafetyInspectionListRow) => void;
};

function formatDue(iso: string | null | undefined): string {
  if (!iso) return "No due date";
  const due = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(due);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return diff === -1 ? "Overdue yesterday" : `Overdue by ${Math.abs(diff)} days`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
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

function formatDeadline(doc: OnboardingDocumentRow): string {
  if (doc.remaining_days == null && !doc.deadline_at) return "Waiting for signature";
  if ((doc.remaining_days ?? 1) <= 0) return "Deadline passed";
  if (doc.remaining_days === 1) return "1 day left";
  if (doc.remaining_days != null) return `${doc.remaining_days} days left`;
  return formatDue(doc.deadline_at);
}

function inspectionStatusLabel(status?: string | null): string {
  if ((status || "").toLowerCase() === "pending_signatures") return "Waiting for signatures";
  return "In progress";
}

export const PendingItemsModal: React.FC<PendingItemsModalProps> = ({
  visible,
  loading = false,
  hours = null,
  tasks = [],
  otherOpenTaskCount = 0,
  signatureRequests = [],
  onboardingDocs = [],
  followUps = [],
  inspections = [],
  onDismiss,
  onLogHours,
  onOpenTasks,
  onOpenSign,
  onOpenFollowUp,
  onOpenInspection
}) => {
  const insets = useSafeAreaInsets();
  const docs = [
    ...onboardingDocs.map((doc) => ({
      key: `onb-${doc.id}`,
      source: "onboarding" as const,
      id: doc.id,
      title: doc.document_name || "Document",
      subtitle: [
        doc.required ? "Required" : null,
        doc.subject_label ? `For ${doc.subject_label}` : null,
        formatDeadline(doc)
      ]
        .filter(Boolean)
        .join(" · ")
    })),
    ...signatureRequests.map((row) => ({
      key: `sig-${row.id}`,
      source: "document_builder" as const,
      id: row.id,
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
  const hasAnything =
    !!hours ||
    tasks.length > 0 ||
    otherOpenTaskCount > 0 ||
    docs.length > 0 ||
    followUps.length > 0 ||
    inspections.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View
          style={[
            styles.card,
            { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 }
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Ionicons name="checkbox-outline" size={18} color={ACCENT} />
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

            {hours && onLogHours ? (
              <TouchableOpacity
                style={styles.hoursBanner}
                onPress={onLogHours}
                activeOpacity={0.85}
              >
                {hours.joke ? (
                  <Image
                    source={BLAIR_HOURS_PHOTO}
                    style={styles.jokePhoto}
                    resizeMode="cover"
                    accessibilityLabel="Blair"
                  />
                ) : null}
                <View style={styles.hoursTop}>
                  {hours.joke ? null : (
                    <View style={[styles.rowIcon, { backgroundColor: "#FEF3C7" }]}>
                      <Ionicons name="time-outline" size={18} color={WARNING} />
                    </View>
                  )}
                  <View style={styles.hoursCopy}>
                    <Text style={[styles.hoursTitle, hours.joke ? styles.jokeTitle : null]}>
                      {hours.joke ? BLAIR_HOURS_TITLE : "Hours not logged"}
                    </Text>
                    {hours.joke ? null : (
                      <Text style={styles.hoursBody}>
                        You haven't logged hours for {hours.label}.
                      </Text>
                    )}
                  </View>
                </View>
                <View style={[styles.hoursCta, hours.joke ? styles.jokeCta : null]}>
                  <Text style={styles.hoursCtaText}>Log hours</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {(tasks.length > 0 || otherOpenTaskCount > 0) && onOpenTasks ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Tasks</Text>
                {tasks.map((task) => (
                  <TouchableOpacity
                    key={task.id}
                    style={styles.row}
                    onPress={onOpenTasks}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: "#FFEDD5" }]}>
                      <Ionicons name="checkbox-outline" size={16} color="#EA580C" />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {task.title}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {formatDue(task.due_date)}
                        {task.project?.name ? ` · ${task.project.name}` : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
                {otherOpenTaskCount > 0 ? (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={onOpenTasks}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: "#ECFDF3" }]}>
                      <Ionicons name="list-outline" size={16} color={ACCENT} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>
                        {otherOpenTaskCount === 1
                          ? tasks.length > 0
                            ? "1 more open task"
                            : "1 open task"
                          : tasks.length > 0
                            ? `${otherOpenTaskCount} more open tasks`
                            : `${otherOpenTaskCount} open tasks`}
                      </Text>
                      <Text style={styles.rowMeta}>View all tasks</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {docs.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Documents to sign</Text>
                {docs.map((doc) => (
                  <TouchableOpacity
                    key={doc.key}
                    style={styles.row}
                    onPress={() =>
                      onOpenSign({
                        source: doc.source,
                        id: doc.id,
                        title: doc.title
                      })
                    }
                    activeOpacity={0.75}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: "#ECFDF3" }]}>
                      <Ionicons name="create-outline" size={16} color={ACCENT} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {doc.title}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>
                        {doc.subtitle || "Tap to review and sign"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {followUps.length > 0 && onOpenFollowUp ? (
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
                        <Ionicons name="flag-outline" size={16} color={WARNING} />
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

            {inspections.length > 0 && onOpenInspection ? (
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
                        <Ionicons name="clipboard-outline" size={16} color={ACCENT} />
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
          <TouchableOpacity style={styles.dismiss} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.dismissText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
  hoursBanner: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm
  },
  jokePhoto: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: "#FDE68A"
  },
  jokeTitle: {
    textAlign: "center"
  },
  jokeCta: {
    alignSelf: "center"
  },
  hoursTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  hoursCopy: {
    flex: 1,
    gap: 4
  },
  hoursTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  hoursBody: {
    ...typography.bodySmall,
    color: colors.textBody
  },
  hoursCta: {
    alignSelf: "flex-start",
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  hoursCtaText: {
    fontFamily: typography.buttonSmall.fontFamily,
    fontSize: 13,
    color: "#fff"
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
