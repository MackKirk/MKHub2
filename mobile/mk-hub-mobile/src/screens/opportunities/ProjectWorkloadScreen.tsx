import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKCard } from "../../components/MKCard";
import { getProjectTimesheet } from "../../services/workload";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";
import type { TimesheetEntry } from "../../services/workload";

interface ProjectWorkloadScreenProps {
  project: ProjectListItem;
  onBack: () => void;
}

export const ProjectWorkloadScreen: React.FC<ProjectWorkloadScreenProps> = ({
  project,
  onBack
}) => {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkload();
  }, []);

  const loadWorkload = async () => {
    try {
      setLoading(true);
      const data = await getProjectTimesheet(project.id);
      setEntries(data);
    } catch (err) {
      console.error("[ProjectWorkload] Error:", err);
      const apiError = toApiError(err);
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return "—";
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return timeStr;
    }
  };

  const formatMinutes = (minutes?: number) => {
    if (!minutes) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Workload</Text>
        <Text style={styles.subtitle}>{project.name}</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {entries.map((entry) => (
            <MKCard key={entry.id} style={styles.entryCard} elevated={true}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryUser}>{entry.user_name || "Unknown"}</Text>
                {entry.is_approved && (
                  <Text style={styles.approvedBadge}>✓ Approved</Text>
                )}
              </View>
              {entry.work_date && (
                <Text style={styles.entryDate}>
                  {new Date(entry.work_date).toLocaleDateString()}
                </Text>
              )}
              <View style={styles.entryTimes}>
                <Text style={styles.entryTime}>
                  {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                </Text>
                <Text style={styles.entryDuration}>{formatMinutes(entry.minutes)}</Text>
              </View>
              {entry.notes && (
                <Text style={styles.entryNotes}>{entry.notes}</Text>
              )}
            </MKCard>
          ))}
          {entries.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No timesheet entries found</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  backButton: {
    marginBottom: spacing.sm
  },
  backButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md
  },
  entryCard: {
    padding: spacing.md
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs
  },
  entryUser: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary
  },
  approvedBadge: {
    fontSize: 12,
    color: colors.success,
    fontWeight: "600"
  },
  entryDate: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.xs
  },
  entryTimes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs
  },
  entryTime: {
    fontSize: 14,
    color: colors.textPrimary
  },
  entryDuration: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary
  },
  entryNotes: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: "italic"
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: "center"
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted
  }
});

