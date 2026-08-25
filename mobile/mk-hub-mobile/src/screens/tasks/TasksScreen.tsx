import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  CommonActions,
  useFocusEffect,
  useNavigation,
  type CompositeNavigationProp
} from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenLayout } from "../../components/ScreenLayout";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useTasksBadge } from "../../hooks/useTasksBadge";
import {
  formatDue,
  primaryAction,
  priorityMeta,
  sourceLabel,
  statusMeta
} from "../../lib/taskUi";
import {
  applyTaskUpdate,
  blockTask,
  concludeTask,
  startTask,
  unblockTask
} from "../../services/tasks";
import { toApiError } from "../../services/api";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius, shadows } from "../../theme/radius";
import { typography } from "../../theme/typography";
import type { AppTabParamList, RootStackParamList } from "../../navigation/types";
import type { TaskItem } from "../../types/tasks";

const GLOBE_BG = require("../../../assets/brand/globe.png");
const TASK_TODO_WATERMARK = require("../../../assets/brand/task-todo-watermark.png");
const TASK_PROGRESS_WATERMARK = require("../../../assets/brand/task-progress-watermark.png");
const TASK_DONE_WATERMARK = require("../../../assets/brand/task-done-watermark.png");

type FilterKey = "open" | "accepted" | "in_progress" | "blocked" | "done" | "all";
type TasksNav = CompositeNavigationProp<
  BottomTabNavigationProp<AppTabParamList, "Tasks">,
  NativeStackNavigationProp<RootStackParamList>
>;

const RAIL_WIDTH = 6;
const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
};

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_RANK[(a.priority || "normal").toLowerCase()] ?? 2;
    const pb = PRIORITY_RANK[(b.priority || "normal").toLowerCase()] ?? 2;
    if (pa !== pb) return pa - pb;
    return (a.due_date || "9999").localeCompare(b.due_date || "9999");
  });
}

export const TasksScreen: React.FC = () => {
  const navigation = useNavigation<TasksNav>();
  const { openMenu } = useHubMenu();
  const {
    grouped,
    openCount,
    acceptedCount,
    inProgressCount,
    loading,
    refreshTasks,
    setGroupedFromLocal
  } = useTasksBadge();
  const [filter, setFilter] = useState<FilterKey>("open");
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshTasks();
    }, [refreshTasks])
  );

  const blockedCount = grouped?.blocked?.length ?? 0;
  const doneCount = grouped?.done?.length ?? 0;

  const list = useMemo(() => {
    const data = grouped ?? {
      accepted: [],
      in_progress: [],
      blocked: [],
      done: []
    };
    const buckets: Record<FilterKey, TaskItem[]> = {
      accepted: sortTasks(data.accepted ?? []),
      in_progress: sortTasks(data.in_progress ?? []),
      blocked: sortTasks(data.blocked ?? []),
      done: sortTasks(data.done ?? []),
      open: sortTasks([
        ...(data.accepted ?? []),
        ...(data.in_progress ?? []),
        ...(data.blocked ?? [])
      ]),
      all: sortTasks([
        ...(data.accepted ?? []),
        ...(data.in_progress ?? []),
        ...(data.blocked ?? []),
        ...(data.done ?? [])
      ])
    };
    return buckets[filter];
  }, [grouped, filter]);

  const subtitle = useMemo(() => {
    if (openCount === 0) return "You're all caught up";
    const parts: string[] = [];
    if (acceptedCount > 0) parts.push(`${acceptedCount} to do`);
    if (inProgressCount > 0) parts.push(`${inProgressCount} in progress`);
    if (blockedCount > 0) parts.push(`${blockedCount} paused`);
    return parts.join(" · ");
  }, [openCount, acceptedCount, inProgressCount, blockedCount]);

  const openTask = (task: TaskItem) => {
    navigation.dispatch(
      CommonActions.navigate({
        name: "TaskDetail",
        params: { taskId: task.id, task }
      })
    );
  };

  const runAction = async (task: TaskItem, action: string) => {
    try {
      setActingId(task.id);
      let updated: TaskItem | null = null;
      if (action === "start") updated = await startTask(task.id);
      else if (action === "done") updated = await concludeTask(task.id);
      else if (action === "pause") updated = await blockTask(task.id);
      else if (action === "resume") updated = await unblockTask(task.id);
      if (updated && grouped) {
        setGroupedFromLocal(applyTaskUpdate(grouped, updated));
      } else {
        await refreshTasks();
      }
    } catch (err) {
      Alert.alert("Could not update task", toApiError(err).message);
    } finally {
      setActingId(null);
    }
  };

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "open", label: "Open", count: openCount },
    { key: "accepted", label: "To Do", count: acceptedCount },
    { key: "in_progress", label: "In Progress", count: inProgressCount },
    ...(blockedCount > 0
      ? [{ key: "blocked" as const, label: "Paused", count: blockedCount }]
      : []),
    { key: "done", label: "Done", count: doneCount },
    { key: "all", label: "All", count: openCount + doneCount }
  ];

  return (
    <ScreenLayout scroll={false} style={styles.screen} contentStyle={styles.layout}>
      <Image
        source={GLOBE_BG}
        style={styles.globeBg}
        resizeMode="contain"
        tintColor={colors.textMuted}
        pointerEvents="none"
      />
      <View style={styles.topHeader}>
        <Pressable style={styles.headerIconBtn} onPress={openMenu} hitSlop={8}>
          <Ionicons name="menu" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>My Tasks</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <Pressable
          style={styles.headerIconBtn}
          onPress={() => {
            void refreshTasks();
          }}
          hitSlop={8}
        >
          <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {loading && !grouped ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.homeAccent} />
          <Text style={styles.loadingText}>Loading tasks…</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          style={styles.list}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void refreshTasks().finally(() => setRefreshing(false));
          }}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.statsRow}>
                <StatCard
                  label="To Do"
                  count={acceptedCount}
                  color="#EA580C"
                  bg="#FFEDD5"
                  icon="document-text-outline"
                  watermark={TASK_TODO_WATERMARK}
                  active={filter === "accepted"}
                  onPress={() => setFilter("accepted")}
                />
                <StatCard
                  label="In Progress"
                  count={inProgressCount}
                  color="#2563EB"
                  bg="#DBEAFE"
                  icon="play-circle-outline"
                  watermark={TASK_PROGRESS_WATERMARK}
                  active={filter === "in_progress"}
                  onPress={() => setFilter("in_progress")}
                />
                <StatCard
                  label="Done"
                  count={doneCount}
                  color={colors.homeAccent}
                  bg="#DCFCE7"
                  icon="checkmark-circle-outline"
                  watermark={TASK_DONE_WATERMARK}
                  active={filter === "done"}
                  onPress={() => setFilter("done")}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {filters.map((item) => {
                  const active = filter === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setFilter(item.key)}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active && styles.filterChipTextActive
                        ]}
                      >
                        {item.label}
                      </Text>
                      <View
                        style={[
                          styles.filterCount,
                          active && styles.filterCountActive
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterCountText,
                            active && styles.filterCountTextActive
                          ]}
                        >
                          {item.count}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          }
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              busy={actingId === item.id}
              onPress={() => openTask(item)}
              onAction={(action) => {
                void runAction(item, action);
              }}
            />
          )}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Ionicons
                    name="checkmark-done-outline"
                    size={28}
                    color={colors.homeAccent}
                  />
                </View>
                <Text style={styles.emptyTitle}>No tasks here</Text>
                <Text style={styles.emptyText}>
                  {filter === "done"
                    ? "Finished work will show up here."
                    : "You're all caught up on this list."}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </ScreenLayout>
  );
};

const StatCard: React.FC<{
  label: string;
  count: number;
  color: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
  watermark?: ImageSourcePropType;
  active: boolean;
  onPress: () => void;
}> = ({ label, count, color, bg, icon, watermark, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.statCard, active && styles.statCardActive]}>
    {watermark ? (
      <Image
        source={watermark}
        style={styles.statWatermark}
        resizeMode="contain"
        tintColor={color}
        pointerEvents="none"
      />
    ) : null}
    <View style={[styles.statIcon, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={color} />
    </View>
    <Text style={[styles.statCount, { color }]}>{count}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </Pressable>
);

const TaskCard: React.FC<{
  task: TaskItem;
  busy: boolean;
  onPress: () => void;
  onAction: (action: string) => void;
}> = ({ task, busy, onPress, onAction }) => {
  const status = statusMeta(task.status);
  const priority = priorityMeta(task.priority);
  const due = formatDue(task.due_date);
  const action = primaryAction(task);

  return (
    <Pressable onPress={onPress} style={styles.taskCard}>
      <LinearGradient
        colors={[...status.rail]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.taskRail}
      />
      <View style={styles.taskBody}>
        <View style={styles.taskTop}>
          <Text style={styles.taskTitle} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusChipText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
          <Text style={styles.metaText}>{priority.label}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{sourceLabel(task)}</Text>
          {due ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={[styles.metaText, due.overdue && styles.overdue]}>
                {due.overdue ? `Overdue ${due.label}` : `Due ${due.label}`}
              </Text>
            </>
          ) : null}
        </View>
        {task.project?.name ? (
          <View style={styles.projectRow}>
            <Ionicons name="folder-outline" size={14} color={colors.textMuted} />
            <Text style={styles.projectText} numberOfLines={1}>
              {task.project.name}
            </Text>
          </View>
        ) : null}
        <View style={styles.cardFooter}>
          {action ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                onAction(action.key);
              }}
              disabled={busy}
              style={styles.cardAction}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.homeAccent} />
              ) : (
                <Text style={styles.cardActionText}>{action.label}</Text>
              )}
            </Pressable>
          ) : (
            <View />
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  screen: { backgroundColor: "#fff" },
  layout: {
    flex: 1,
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingBottom: spacing.md,
    overflow: "hidden",
    position: "relative"
  },
  globeBg: {
    position: "absolute",
    width: 640,
    height: 640,
    right: -255,
    bottom: -40,
    opacity: 0.06
  },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
    zIndex: 1
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
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary
  },
  headerSubtitle: {
    marginTop: 1,
    fontSize: 12,
    color: colors.textMuted
  },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", zIndex: 1 },
  list: { flex: 1, zIndex: 1 },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted
  },
  listContent: { paddingBottom: spacing.xxl, flexGrow: 1, gap: spacing.md },
  headerBlock: { gap: spacing.md, marginBottom: spacing.sm },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "flex-start",
    gap: 4,
    overflow: "hidden",
    ...shadows.card
  },
  statCardActive: {
    borderWidth: 1.5,
    borderColor: colors.homeAccent
  },
  statWatermark: {
    position: "absolute",
    right: -26,
    bottom: -18,
    width: 88,
    height: 88,
    opacity: 0.09
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  statCount: {
    fontFamily: typography.button.fontFamily,
    fontSize: 22,
    lineHeight: 26
  },
  statLabel: { fontSize: 11, color: colors.textMuted },
  filterRow: { gap: spacing.sm, paddingRight: spacing.sm },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 7
  },
  filterChipActive: {
    backgroundColor: colors.homeAccent,
    borderColor: colors.homeAccent
  },
  filterChipText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 12,
    color: colors.textBody
  },
  filterChipTextActive: { color: "#fff" },
  filterCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  filterCountText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 11,
    color: colors.textMuted
  },
  filterCountTextActive: { color: "#fff" },
  taskCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    ...shadows.card
  },
  taskRail: { width: RAIL_WIDTH, alignSelf: "stretch" },
  taskBody: { flex: 1, padding: 14, gap: 8 },
  taskTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  taskTitle: {
    flex: 1,
    fontFamily: typography.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary
  },
  statusChip: {
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
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  priorityDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  metaText: { fontSize: 12, color: colors.textMuted },
  metaDot: { marginHorizontal: 6, color: colors.textMuted },
  overdue: { color: "#DC2626", fontFamily: typography.button.fontFamily },
  projectRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  projectText: { flex: 1, fontSize: 12, color: colors.textMuted },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4
  },
  cardAction: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "#ECFDF3",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 88,
    alignItems: "center"
  },
  cardActionText: {
    fontFamily: typography.button.fontFamily,
    fontSize: 13,
    color: colors.homeAccent
  },
  emptyWrap: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center"
  },
  emptyTitle: {
    fontFamily: typography.button.fontFamily,
    fontSize: 16,
    color: colors.textPrimary
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  }
});
