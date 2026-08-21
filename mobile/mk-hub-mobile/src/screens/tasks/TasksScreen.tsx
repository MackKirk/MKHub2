import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { radius } from "../../theme/radius";
import { MKBadge } from "../../components/MKBadge";
import { MKCard } from "../../components/MKCard";
import { MKButton } from "../../components/MKButton";
import { MKHomeStyleHeader } from "../../components/MKHomeStyleHeader";
import { ScreenLayout } from "../../components/ScreenLayout";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { useTasksBadge } from "../../hooks/useTasksBadge";
import { typography } from "../../theme/typography";
import { concludeTask, startTask } from "../../services/tasks";
import { toApiError } from "../../services/api";
import type { TaskGroupedResponse, TaskItem } from "../../types/tasks";
import type { ProjectStatusBadgeVariant } from "../../lib/projectUi";

type FilterKey = "open" | "accepted" | "in_progress" | "done" | "all";

type ListRow =
  | { type: "header"; key: string; title: string; count: number }
  | { type: "task"; key: string; task: TaskItem };

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "open", label: "Open" },
  { key: "accepted", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" }
];

function statusBadgeVariant(status: string): ProjectStatusBadgeVariant {
  if (status === "accepted") return "warning";
  if (status === "in_progress") return "info";
  if (status === "done") return "success";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "accepted") return "To Do";
  if (status === "in_progress") return "In Progress";
  if (status === "done") return "Done";
  return status.replace("_", " ");
}

function applyTaskUpdate(
  grouped: TaskGroupedResponse,
  updated: TaskItem
): TaskGroupedResponse {
  const next: TaskGroupedResponse = {
    accepted: [],
    in_progress: [],
    done: []
  };
  const all = [
    ...(grouped.accepted ?? []),
    ...(grouped.in_progress ?? []),
    ...(grouped.done ?? [])
  ];
  let found = false;
  for (const task of all) {
    const value = task.id === updated.id ? updated : task;
    if (task.id === updated.id) found = true;
    const bucket = value.status as keyof TaskGroupedResponse;
    if (!next[bucket]) next[bucket] = [];
    next[bucket].push(value);
  }
  if (!found) {
    const bucket = updated.status as keyof TaskGroupedResponse;
    if (!next[bucket]) next[bucket] = [];
    next[bucket].push(updated);
  }
  return next;
}

export const TasksScreen: React.FC = () => {
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

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshTasks();
    setRefreshing(false);
  };

  const handleQuickAction = async (task: TaskItem) => {
    try {
      setActingId(task.id);
      let updated: TaskItem | null = null;
      if (task.status === "accepted" && task.permissions.can_start) {
        updated = await startTask(task.id);
      } else if (task.status === "in_progress" && task.permissions.can_conclude) {
        updated = await concludeTask(task.id);
      }
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

  const listRows = useMemo((): ListRow[] => {
    const data = grouped ?? { accepted: [], in_progress: [], done: [] };
    if (filter === "accepted") {
      return buildRows([
        { key: "accepted", title: "To Do", data: data.accepted ?? [] }
      ]);
    }
    if (filter === "in_progress") {
      return buildRows([
        {
          key: "in_progress",
          title: "In Progress",
          data: data.in_progress ?? []
        }
      ]);
    }
    if (filter === "done") {
      return buildRows([{ key: "done", title: "Done", data: data.done ?? [] }]);
    }
    if (filter === "open") {
      return buildRows([
        { key: "accepted", title: "To Do", data: data.accepted ?? [] },
        {
          key: "in_progress",
          title: "In Progress",
          data: data.in_progress ?? []
        }
      ]);
    }
    return buildRows([
      { key: "accepted", title: "To Do", data: data.accepted ?? [] },
      {
        key: "in_progress",
        title: "In Progress",
        data: data.in_progress ?? []
      },
      { key: "done", title: "Done", data: data.done ?? [] }
    ]);
  }, [grouped, filter]);

  const subtitle = useMemo(() => {
    if (openCount === 0) return "No open tasks";
    const parts: string[] = [];
    if (acceptedCount > 0) parts.push(`${acceptedCount} to do`);
    if (inProgressCount > 0) parts.push(`${inProgressCount} in progress`);
    return parts.join(" · ");
  }, [openCount, acceptedCount, inProgressCount]);

  const renderTask = (task: TaskItem) => {
    const actionLabel =
      task.status === "accepted" && task.permissions.can_start
        ? "Start"
        : task.status === "in_progress" && task.permissions.can_conclude
          ? "Mark Done"
          : "";

    return (
      <MKCard style={styles.taskCard}>
        <View style={styles.taskHeader}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <MKBadge variant={statusBadgeVariant(task.status)}>
            {statusLabel(task.status)}
          </MKBadge>
        </View>

        {task.description ? (
          <Text style={styles.taskDescription} numberOfLines={2}>
            {task.description}
          </Text>
        ) : null}

        <View style={styles.metaBlock}>
          {task.project?.name ? (
            <View style={styles.metaRow}>
              <Ionicons name="folder-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>
                {task.project.name}
              </Text>
            </View>
          ) : null}
          {task.due_date ? (
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>
                Due {new Date(task.due_date).toLocaleDateString()}
              </Text>
            </View>
          ) : null}
          {task.priority ? (
            <View style={styles.metaRow}>
              <Ionicons name="flag-outline" size={14} color={colors.textMuted} />
              <Text style={styles.metaText}>{task.priority}</Text>
            </View>
          ) : null}
        </View>

        {actionLabel ? (
          <View style={styles.taskAction}>
            <MKButton
              title={actionLabel}
              onPress={() => handleQuickAction(task)}
              loading={actingId === task.id}
              disabled={actingId === task.id}
              variant={task.status === "in_progress" ? "primary" : "secondary"}
              style={styles.actionButton}
            />
          </View>
        ) : null}
      </MKCard>
    );
  };

  return (
    <ScreenLayout scroll={false}>
      <MKHomeStyleHeader
        title="My Tasks"
        subtitle={subtitle}
        onLeftPress={openMenu}
      />

      <View style={styles.summaryRow}>
        <SummaryPill
          label="To Do"
          count={acceptedCount}
          tone="warning"
          active={filter === "accepted"}
          onPress={() => setFilter("accepted")}
        />
        <SummaryPill
          label="In Progress"
          count={inProgressCount}
          tone="info"
          active={filter === "in_progress"}
          onPress={() => setFilter("in_progress")}
        />
        <SummaryPill
          label="Open"
          count={openCount}
          tone="danger"
          active={filter === "open"}
          onPress={() => setFilter("open")}
        />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text
                style={[styles.filterChipText, active && styles.filterChipTextActive]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && !grouped ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading tasks…</Text>
        </View>
      ) : (
        <FlatList
          data={listRows}
          keyExtractor={(row) => row.key}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{item.title}</Text>
                  <Text style={styles.sectionCount}>{item.count}</Text>
                </View>
              );
            }
            return renderTask(item.task);
          }}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={56}
                  color={colors.textMuted}
                />
                <Text style={styles.empty}>No tasks here</Text>
                <Text style={styles.emptySubtext}>
                  {filter === "open" || filter === "accepted" || filter === "in_progress"
                    ? "You're all caught up on open work."
                    : "Nothing to show for this filter."}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </ScreenLayout>
  );
};

function buildRows(
  sections: Array<{ key: string; title: string; data: TaskItem[] }>
): ListRow[] {
  const rows: ListRow[] = [];
  for (const section of sections) {
    if (section.data.length === 0) continue;
    rows.push({
      type: "header",
      key: `header-${section.key}`,
      title: section.title,
      count: section.data.length
    });
    for (const task of section.data) {
      rows.push({ type: "task", key: task.id, task });
    }
  }
  return rows;
}

const SummaryPill: React.FC<{
  label: string;
  count: number;
  tone: "warning" | "info" | "danger";
  active: boolean;
  onPress: () => void;
}> = ({ label, count, tone, active, onPress }) => {
  const toneColor =
    tone === "warning" ? "#a16207" : tone === "info" ? "#1d4ed8" : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.summaryPill, active && styles.summaryPillActive]}
    >
      <Text style={[styles.summaryCount, { color: toneColor }]}>{count}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md
  },
  summaryPill: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    gap: 2
  },
  summaryPillActive: {
    borderColor: colors.primary,
    backgroundColor: "#fef2f2"
  },
  summaryCount: {
    fontFamily: typography.title.fontFamily,
    fontSize: 22,
    lineHeight: 28
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.md
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card
  },
  filterChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  filterChipText: {
    ...typography.caption,
    color: colors.textBody,
    fontFamily: typography.button.fontFamily
  },
  filterChipTextActive: {
    color: "#fff"
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted
  },
  listContent: {
    paddingBottom: spacing.xxl,
    flexGrow: 1
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.sm
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
    fontFamily: typography.button.fontFamily,
    letterSpacing: 0.6
  },
  sectionCount: {
    ...typography.caption,
    color: colors.textMuted
  },
  taskCard: {
    marginBottom: spacing.md,
    gap: spacing.sm
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  taskTitle: {
    flex: 1,
    ...typography.subtitle
  },
  taskDescription: {
    ...typography.bodySmall,
    color: colors.textBody
  },
  metaBlock: {
    gap: spacing.xs
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  metaText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    flex: 1
  },
  taskAction: {
    marginTop: spacing.xs
  },
  actionButton: {
    paddingVertical: spacing.sm
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm
  },
  empty: {
    ...typography.subtitle,
    textAlign: "center"
  },
  emptySubtext: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center"
  }
});
