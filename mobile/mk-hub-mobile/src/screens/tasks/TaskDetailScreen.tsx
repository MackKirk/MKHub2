import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MKBugReportBody } from "../../components/tasks/MKBugReportBody";
import { MKFieldActions } from "../../components/MKFieldActions";
import { MKImageSourcePickerModal } from "../../components/MKImageSourcePickerModal";
import { ScreenLayout } from "../../components/ScreenLayout";
import { useAuth } from "../../hooks/useAuth";
import { useTasksBadge } from "../../hooks/useTasksBadge";
import { parseBugReport } from "../../lib/bugReport";
import { buildAuthenticatedFileUrl } from "../../lib/fileUrls";
import { pickMediaFromSource } from "../../lib/pickMediaFromSource";
import {
  descriptionWithAttachments,
  parseTaskDescription
} from "../../lib/taskAttachments";
import {
  formatDateTime,
  formatDue,
  priorityMeta,
  sourceLabel,
  statusMeta,
  taskActions
} from "../../lib/taskUi";
import { getProjectDetail } from "../../services/projects";
import {
  addTaskComment,
  applyTaskUpdate,
  blockTask,
  concludeTask,
  getTask,
  getTaskLog,
  startTask,
  unblockTask,
  updateTaskDescription,
  uploadTaskPhoto
} from "../../services/tasks";
import { toApiError } from "../../services/api";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { typography } from "../../theme/typography";
import type { RootStackParamList } from "../../navigation/types";
import type { TaskItem, TaskLogEntry } from "../../types/tasks";

type TaskDetailRoute = RouteProp<RootStackParamList, "TaskDetail">;
type TaskDetailNav = NativeStackNavigationProp<RootStackParamList, "TaskDetail">;

async function runTaskAction(taskId: string, action: string): Promise<TaskItem> {
  if (action === "start") return startTask(taskId);
  if (action === "done") return concludeTask(taskId);
  if (action === "pause") return blockTask(taskId);
  if (action === "resume") return unblockTask(taskId);
  throw new Error("Unknown action");
}

export const TaskDetailScreen: React.FC = () => {
  const route = useRoute<TaskDetailRoute>();
  const navigation = useNavigation<TaskDetailNav>();
  const { token } = useAuth();
  const { grouped, setGroupedFromLocal, refreshTasks } = useTasksBadge();
  const [task, setTask] = useState<TaskItem | null>(route.params.task ?? null);
  const [log, setLog] = useState<TaskLogEntry[]>([]);
  const [loading, setLoading] = useState(!route.params.task);
  const [acting, setActing] = useState(false);
  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [openingProject, setOpeningProject] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextTask, nextLog] = await Promise.all([
        getTask(route.params.taskId),
        getTaskLog(route.params.taskId).catch(() => [])
      ]);
      setTask(nextTask);
      setLog(nextLog);
    } catch (err) {
      Alert.alert("Could not load task", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [route.params.taskId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onAction = async (action: string) => {
    if (!task) return;
    try {
      setActing(true);
      const updated = await runTaskAction(task.id, action);
      setTask(updated);
      if (grouped) setGroupedFromLocal(applyTaskUpdate(grouped, updated));
      else await refreshTasks();
      const nextLog = await getTaskLog(task.id).catch(() => []);
      setLog(nextLog);
    } catch (err) {
      Alert.alert("Could not update task", toApiError(err).message);
    } finally {
      setActing(false);
    }
  };

  const status = statusMeta(task?.status ?? "accepted");
  const priority = priorityMeta(task?.priority);
  const due = formatDue(task?.due_date);
  const actions = task ? taskActions(task) : [];
  const parsed = useMemo(
    () => parseTaskDescription(task?.description),
    [task?.description]
  );
  const bugReport = useMemo(
    () => parseBugReport(parsed.description),
    [parsed.description]
  );
  const isBugTask =
    (task?.origin?.type || "").toLowerCase() === "bug" || bugReport.isBugReport;

  const sendComment = async () => {
    if (!task) return;
    const message = comment.trim();
    if (!message) return;
    try {
      setSendingComment(true);
      await addTaskComment(task.id, message);
      setComment("");
      const nextLog = await getTaskLog(task.id).catch(() => []);
      setLog(nextLog);
    } catch (err) {
      Alert.alert("Could not add comment", toApiError(err).message);
    } finally {
      setSendingComment(false);
    }
  };

  const addPhoto = async (source: "camera" | "gallery" | "pdf") => {
    if (!task || source === "pdf") return;
    const files = await pickMediaFromSource(source, { allowMultiple: false });
    const file = files[0];
    if (!file) return;
    try {
      setUploadingPhoto(true);
      const fileId = await uploadTaskPhoto(file);
      const nextIds = Array.from(new Set([...parsed.fileIds, fileId]));
      const updated = await updateTaskDescription(
        task.id,
        descriptionWithAttachments(parsed.description, nextIds)
      );
      setTask(updated);
      if (grouped) setGroupedFromLocal(applyTaskUpdate(grouped, updated));
    } catch (err) {
      Alert.alert("Could not add photo", toApiError(err).message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const openProject = async () => {
    const projectId = task?.project?.id;
    if (!projectId) return;
    try {
      setOpeningProject(true);
      const project = await getProjectDetail(projectId);
      navigation.navigate("ProjectDetail", { project });
    } catch (err) {
      Alert.alert("Could not open project", toApiError(err).message);
    } finally {
      setOpeningProject(false);
    }
  };

  return (
    <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
      <View style={styles.topHeader}>
        <Pressable
          style={styles.headerIconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Task
        </Text>
        <View style={styles.headerIconBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      {loading && !task ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.homeAccent} />
          <Text style={styles.loadingText}>Loading task…</Text>
        </View>
      ) : !task ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>Task not found.</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.heroCard}>
              <LinearGradient
                colors={[...status.rail]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.heroRail}
              />
              <View style={styles.heroBody}>
                <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
                  <Ionicons name={status.icon} size={14} color={status.color} />
                  <Text style={[styles.statusChipText, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
                <Text style={styles.title}>{task.title}</Text>
                <View style={styles.metaRow}>
                  <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
                  <Text style={styles.metaText}>{priority.label} priority</Text>
                  {due ? (
                    <>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={[styles.metaText, due.overdue && styles.overdue]}>
                        {due.overdue ? `Overdue ${due.label}` : `Due ${due.label}`}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Description</Text>
              {isBugTask ? (
                <MKBugReportBody report={bugReport} />
              ) : parsed.description ? (
                <Text style={styles.description}>{parsed.description}</Text>
              ) : (
                <Text style={styles.muted}>No description.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Details</Text>
              <InfoRow icon="flag-outline" label="Priority" value={priority.label} />
              <InfoRow
                icon="calendar-outline"
                label="Due date"
                value={due ? (due.overdue ? `Overdue ${due.label}` : due.label) : "None"}
                danger={Boolean(due?.overdue)}
              />
              <InfoRow
                icon="folder-outline"
                label="Project"
                value={task.project?.name || "No project"}
              />
              <InfoRow icon="layers-outline" label="Source" value={sourceLabel(task)} />
              <InfoRow
                icon="person-outline"
                label="Assigned to"
                value={
                  task.assigned_to?.name ||
                  task.assigned_to?.division ||
                  "Unassigned"
                }
              />
              <InfoRow
                icon="person-add-outline"
                label="Requested by"
                value={task.requested_by?.name || "—"}
              />
              <InfoRow
                icon="time-outline"
                label="Created"
                value={formatDateTime(task.created_at) || "—"}
              />
              {task.project?.id ? (
                <MKFieldActions
                  actions={[
                    {
                      key: "project",
                      label: openingProject ? "Opening project…" : "Open project",
                      icon: "folder-open-outline",
                      onPress: () => {
                        void openProject();
                      },
                      disabled: openingProject
                    }
                  ]}
                />
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Photos</Text>
              {parsed.fileIds.length > 0 ? (
                <View style={styles.photoGrid}>
                  {parsed.fileIds.map((fileId) => (
                    <Image
                      key={fileId}
                      source={{
                        uri: buildAuthenticatedFileUrl(fileId, {
                          token,
                          variant: "thumbnail",
                          thumbnailWidth: 240
                        }).uri
                      }}
                      style={styles.photo}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.muted}>No photos yet.</Text>
              )}
              <Pressable
                style={styles.photoBtn}
                onPress={() => setPhotoOpen(true)}
                disabled={uploadingPhoto}
                accessibilityRole="button"
                accessibilityLabel="Add photo"
              >
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color={colors.homeAccent} />
                ) : (
                  <Ionicons name="camera-outline" size={18} color={colors.homeAccent} />
                )}
                <Text style={styles.photoBtnText}>
                  {uploadingPhoto ? "Uploading photo…" : "Add photo"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Activity</Text>
              {log.length === 0 ? (
                <Text style={styles.muted}>No activity yet.</Text>
              ) : (
                log
                  .filter((entry) => entry.message)
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((entry, index) => (
                    <View key={entry.id || String(index)} style={styles.logRow}>
                      <View style={styles.logDot} />
                      <View style={styles.logBody}>
                        <Text style={styles.logMessage}>{entry.message}</Text>
                        <Text style={styles.logMeta}>
                          {[entry.actor?.name, formatDateTime(entry.created_at)]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                    </View>
                  ))
              )}
              <View style={styles.commentRow}>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Write a comment"
                  placeholderTextColor={colors.textMuted}
                  style={styles.commentInput}
                  multiline
                  editable={!sendingComment}
                />
                <Pressable
                  style={[
                    styles.sendBtn,
                    (!comment.trim() || sendingComment) && styles.sendBtnDisabled
                  ]}
                  onPress={() => {
                    void sendComment();
                  }}
                  disabled={!comment.trim() || sendingComment}
                  accessibilityRole="button"
                  accessibilityLabel="Send comment"
                >
                  {sendingComment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={16} color="#fff" />
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {actions.length > 0 ? (
            <View style={styles.footer}>
              {actions.map((action, index) => (
                <Pressable
                  key={action.key}
                  onPress={() => {
                    void onAction(action.key);
                  }}
                  disabled={acting}
                  style={[styles.footerBtn, index === 0 && styles.footerBtnPrimary]}
                >
                  {acting ? (
                    <ActivityIndicator
                      size="small"
                      color={index === 0 ? "#fff" : colors.homeAccent}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.footerBtnText,
                        index === 0 && styles.footerBtnTextPrimary
                      ]}
                    >
                      {action.label}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      )}
      </KeyboardAvoidingView>
      <MKImageSourcePickerModal
        visible={photoOpen}
        title="Add photo"
        mode="image"
        onClose={() => setPhotoOpen(false)}
        onSelect={(source) => {
          void addPhoto(source);
        }}
      />
    </ScreenLayout>
  );
};

const InfoRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  danger?: boolean;
}> = ({ icon, label, value, danger }) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon} size={16} color={colors.textMuted} />
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, danger && styles.overdue]} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { backgroundColor: colors.background },
  layout: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingBottom: spacing.md
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted
  },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  heroCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  heroRail: { width: 6, alignSelf: "stretch" },
  heroBody: { flex: 1, padding: 16, gap: 10 },
  statusChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusChipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11
  },
  title: {
    fontFamily: typography.button.fontFamily,
    fontSize: 22,
    lineHeight: 28,
    color: colors.textPrimary
  },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  priorityDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  metaText: { fontSize: 13, color: colors.textMuted },
  metaDot: { marginHorizontal: 6, color: colors.textMuted },
  overdue: { color: "#DC2626", fontFamily: typography.button.fontFamily },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    ...shadows.card
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
  },
  muted: { fontSize: 14, color: colors.textMuted },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  infoLabel: {
    width: 96,
    fontSize: 13,
    color: colors.textMuted
  },
  infoValue: {
    flex: 1,
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.textPrimary
  },
  logRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 6
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.homeAccent,
    marginTop: 6
  },
  logBody: { flex: 1, gap: 2 },
  logMessage: { fontSize: 14, lineHeight: 20, color: colors.textBody },
  logMeta: { fontSize: 12, color: colors.textMuted },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: "#F3F4F6"
  },
  photoBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8
  },
  photoBtnText: {
    ...typography.buttonSmall,
    color: colors.homeAccent
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 4
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.homeAccent,
    alignItems: "center",
    justifyContent: "center"
  },
  sendBtnDisabled: {
    opacity: 0.45
  },
  footer: {
    gap: 10,
    paddingTop: spacing.md
  },
  footerBtn: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff"
  },
  footerBtnPrimary: {
    backgroundColor: colors.homeAccent,
    borderColor: colors.homeAccent
  },
  footerBtnText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    color: colors.textPrimary
  },
  footerBtnTextPrimary: { color: "#fff" }
});
