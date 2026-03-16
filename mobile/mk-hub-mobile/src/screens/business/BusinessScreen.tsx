import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { radius } from "../../theme/radius";
import { MKCard } from "../../components/MKCard";
import { ScreenLayout } from "../../components/ScreenLayout";
import { searchProjects } from "../../services/projects";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";
import type { HomeStackParamList } from "../../navigation/tabs/AppTabs";

type ProjectType = "all" | "opportunity" | "project";
type ProjectStatus = "all" | string;
type BusinessNavProp = NativeStackNavigationProp<HomeStackParamList, "Business">;

export const BusinessScreen: React.FC = () => {
  const navigation = useNavigation<BusinessNavProp>();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectType, setProjectType] = useState<ProjectType>("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>("all");
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async (searchQuery?: string) => {
    try {
      setLoading(true);
      const results = await searchProjects(searchQuery || "");
      setProjects(results);
    } catch (err) {
      console.error("[BusinessScreen] Error loading projects:", err);
      const apiError = toApiError(err);
      console.warn(apiError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      loadProjects(query.trim());
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, loadProjects]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (projectType === "opportunity" && !project.is_bidding) {
        return false;
      }
      if (projectType === "project" && project.is_bidding) {
        return false;
      }
      if (statusFilter !== "all" && project.status_label !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [projects, projectType, statusFilter]);

  const uniqueStatuses = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status_label).filter(Boolean))).sort(),
    [projects]
  );

  const handleSelectProject = (project: ProjectListItem) => {
    navigation.navigate("ProjectDetail", { project });
  };

  return (
    <ScreenLayout title="Business" scroll={false}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>

      <View style={styles.filtersContainer}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Type</Text>
          <View style={styles.filterButtons}>
            {(["all", "opportunity", "project"] as ProjectType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterButton,
                  projectType === type && styles.filterButtonActive
                ]}
                onPress={() => setProjectType(type)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    projectType === type && styles.filterButtonTextActive
                  ]}
                >
                  {type === "all"
                    ? "All"
                    : type === "opportunity"
                    ? "Opportunities"
                    : "Projects"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Status</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.statusScrollContent}
          >
            <TouchableOpacity
              style={[
                styles.statusButton,
                statusFilter === "all" && styles.statusButtonActive
              ]}
              onPress={() => setStatusFilter("all")}
            >
              <Text
                style={[
                  styles.statusButtonText,
                  statusFilter === "all" && styles.statusButtonTextActive
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {uniqueStatuses.map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.statusButton,
                  statusFilter === status && styles.statusButtonActive
                ]}
                onPress={() => setStatusFilter(status)}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    statusFilter === status && styles.statusButtonTextActive
                  ]}
                >
                  {status}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setQuery("")}
            >
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading && filteredProjects.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading projects...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {filteredProjects.map((project) => (
            <MKCard
              key={project.id}
              style={styles.projectCard}
              onPress={() => handleSelectProject(project)}
              elevated={true}
            >
              <View style={styles.projectHeader}>
                <View style={styles.projectHeaderMain}>
                  <Text style={styles.projectName}>{project.name}</Text>
                  {project.code ? (
                    <Text style={styles.projectCode}>{project.code}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>

              <View style={styles.projectMeta}>
                {project.status_label ? (
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusBadgeText}>{project.status_label}</Text>
                  </View>
                ) : null}
                <Text style={styles.projectType}>
                  {project.is_bidding ? "Opportunity" : "Project"}
                </Text>
              </View>

              {project.client_display_name ? (
                <Text style={styles.projectClient}>
                  Client: {project.client_display_name}
                </Text>
              ) : null}
            </MKCard>
          ))}

          {!loading && filteredProjects.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No projects found</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  backButton: {
    marginBottom: spacing.md
  },
  backButtonText: {
    ...typography.body,
    color: colors.primary
  },
  filtersContainer: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    marginBottom: spacing.md
  },
  filterRow: {
    marginBottom: spacing.md
  },
  filterLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
    textTransform: "uppercase"
  },
  filterButtons: {
    flexDirection: "row",
    gap: spacing.sm
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterButtonText: {
    ...typography.bodySmall
  },
  filterButtonTextActive: {
    color: colors.card
  },
  statusScrollContent: {
    gap: spacing.sm,
    paddingRight: spacing.sm
  },
  statusButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  statusButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  statusButtonText: {
    ...typography.bodySmall
  },
  statusButtonTextActive: {
    color: colors.card
  },
  searchContainer: {
    marginBottom: spacing.md
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md
  },
  searchIcon: {
    marginRight: spacing.sm
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body
  },
  clearButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center"
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: spacing.xxl
  },
  projectCard: {
    marginBottom: spacing.md
  },
  projectHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  projectHeaderMain: {
    flex: 1,
    marginRight: spacing.sm
  },
  projectName: {
    ...typography.subtitle,
    marginBottom: spacing.xs
  },
  projectCode: {
    ...typography.caption
  },
  projectMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border
  },
  statusBadgeText: {
    ...typography.caption,
    color: colors.textPrimary
  },
  projectType: {
    ...typography.bodySmall,
    color: colors.primary
  },
  projectClient: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted
  },
  emptyContainer: {
    paddingVertical: spacing.xxl,
    alignItems: "center"
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted
  }
});

