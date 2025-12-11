import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKCard } from "../../components/MKCard";
import { MKButton } from "../../components/MKButton";
import { getMyTasks, startTask, concludeTask } from "../../services/tasks";
import { toApiError } from "../../services/api";
import type { TaskGroupedResponse, TaskItem } from "../../types/tasks";

type SectionKey = "accepted" | "in_progress" | "done";

interface Section {
  key: SectionKey;
  title: string;
  data: TaskItem[];
}

export const TasksScreen: React.FC = () => {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const grouped = await getMyTasks();
      setSections(toSections(grouped));
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not load tasks", apiError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleQuickAction = async (task: TaskItem) => {
    try {
      let updated: TaskItem | null = null;
      if (task.status === "accepted" && task.permissions.can_start) {
        updated = await startTask(task.id);
      } else if (task.status === "in_progress" && task.permissions.can_conclude) {
        updated = await concludeTask(task.id);
      }
      if (updated) {
        setSections((prev) =>
          toSections(applyTaskUpdate(prev, updated))
        );
      }
    } catch (err) {
      const apiError = toApiError(err);
      Alert.alert("Could not update task", apiError.message);
    }
  };

  const getStatusColors = (status: string): [string, string] => {
    switch (status) {
      case "accepted":
        return ["#FFB020", "#FF9800"];
      case "in_progress":
        return ["#4A90E2", "#357ABD"];
      case "done":
        return ["#50C878", "#3FAF6B"];
      default:
        return ["#E0E0E0", "#C0C0C0"];
    }
  };

  const renderTask = ({ item }: { item: TaskItem }) => {
    const actionLabel =
      item.status === "accepted"
        ? item.permissions.can_start
          ? "Start"
          : ""
        : item.status === "in_progress"
        ? item.permissions.can_conclude
          ? "Mark Done"
          : ""
        : "";

    const statusColors = getStatusColors(item.status);

    return (
      <MKCard style={styles.taskCard}>
        <View style={styles.taskHeader}>
          <Text style={styles.taskTitle}>{item.title}</Text>
          <LinearGradient
            colors={statusColors}
            style={styles.statusBadge}
          >
            <Text style={styles.statusText}>{item.status.replace("_", " ")}</Text>
          </LinearGradient>
        </View>

        {item.project?.name ? (
          <View style={styles.taskMetaRow}>
            <Text style={styles.taskMetaIcon}>📁</Text>
            <Text style={styles.taskMeta}>{item.project.name}</Text>
          </View>
        ) : null}

        {item.due_date ? (
          <View style={styles.taskMetaRow}>
            <Text style={styles.taskMetaIcon}>📅</Text>
            <Text style={styles.taskMeta}>
              Due {new Date(item.due_date).toLocaleDateString()}
            </Text>
          </View>
        ) : null}

        {actionLabel ? (
          <View style={styles.taskAction}>
            <MKButton
              title={actionLabel}
              onPress={() => handleQuickAction(item)}
              variant="secondary"
              style={styles.actionButton}
            />
          </View>
        ) : null}
      </MKCard>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>My Tasks</Text>
          <Text style={styles.subtitle}>Tasks assigned to you</Text>
        </View>

        {loading && sections.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading tasks...</Text>
          </View>
        ) : (
          <FlatList
            data={sections.flatMap((s) =>
              s.data.map((task) => ({ section: s.key, task }))
            )}
            keyExtractor={(row) => row.task.id}
            refreshing={loading}
            onRefresh={loadTasks}
            renderItem={({ item }) => renderTask({ item: item.task })}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyIcon}>✅</Text>
                  <Text style={styles.empty}>No tasks assigned.</Text>
                  <Text style={styles.emptySubtext}>
                    All caught up! Check back later for new tasks.
                  </Text>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </View>
  );
};

const toSections = (grouped: TaskGroupedResponse | Section[]): Section[] => {
  if (Array.isArray(grouped)) {
    return grouped;
  }
  return [
    { key: "accepted", title: "To Do", data: grouped.accepted ?? [] },
    { key: "in_progress", title: "In Progress", data: grouped.in_progress ?? [] },
    { key: "done", title: "Done", data: grouped.done ?? [] }
  ];
};

const applyTaskUpdate = (sections: Section[], updated: TaskItem): TaskGroupedResponse => {
  const out: TaskGroupedResponse = { accepted: [], in_progress: [], done: [] };
  sections.forEach((section) => {
    section.data.forEach((task) => {
      const value = task.id === updated.id ? updated : task;
      const key = value.status as SectionKey;
      if (!out[key]) {
        out[key] = [];
      }
      out[key].push(value);
    });
  });
  return out;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl
  },
  header: {
    marginBottom: spacing.lg
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    letterSpacing: 0.5
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 14
  },
  listContent: {
    paddingBottom: spacing.xxl
  },
  taskCard: {
    marginBottom: spacing.md
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md
  },
  taskTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.textPrimary,
    marginRight: spacing.sm
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12
  },
  statusText: {
    fontSize: 11,
    color: "#ffffff",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  taskMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs
  },
  taskMetaIcon: {
    fontSize: 14,
    marginRight: spacing.xs
  },
  taskMeta: {
    fontSize: 14,
    color: colors.textMuted
  },
  taskAction: {
    marginTop: spacing.md
  },
  actionButton: {
    paddingVertical: spacing.sm
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.md
  },
  empty: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: "center"
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center"
  }
});


