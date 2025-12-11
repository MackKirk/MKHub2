import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKCard } from "../../components/MKCard";
import { searchProjects } from "../../services/projects";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";
import { ProjectActionsScreen } from "../opportunities/ProjectActionsScreen";
import { ProjectUploadScreen } from "../opportunities/ProjectUploadScreen";
import { ProjectReportsScreen } from "../opportunities/ProjectReportsScreen";
import { ProjectWorkloadScreen } from "../opportunities/ProjectWorkloadScreen";
import { ProjectProposalViewScreen } from "../opportunities/ProjectProposalViewScreen";
import { ProjectEstimateScreen } from "../opportunities/ProjectEstimateScreen";
import { ProjectOrdersScreen } from "../opportunities/ProjectOrdersScreen";

type Screen =
  | "list"
  | "actions"
  | "upload"
  | "proposals"
  | "workload"
  | "proposal"
  | "estimate"
  | "orders";

type ProjectType = "all" | "opportunity" | "project";
type ProjectStatus = "all" | string;

export const BusinessScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [currentScreen, setCurrentScreen] = useState<Screen>("list");
  const [selectedProject, setSelectedProject] = useState<ProjectListItem | null>(null);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<ProjectListItem[]>([]);
  const [projectType, setProjectType] = useState<ProjectType>("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus>("all");
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async (searchQuery?: string) => {
    try {
      setLoading(true);
      const results = await searchProjects(searchQuery || "");
      setProjects(results);
      applyFilters(results, projectType, statusFilter);
    } catch (err) {
      console.error("[BusinessScreen] Error loading projects:", err);
      const apiError = toApiError(err);
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [projectType, statusFilter]);

  const applyFilters = (
    projectList: ProjectListItem[],
    type: ProjectType,
    status: ProjectStatus
  ) => {
    let filtered = [...projectList];

    // Filter by type (opportunity vs project)
    if (type === "opportunity") {
      filtered = filtered.filter((p) => p.is_bidding === true);
    } else if (type === "project") {
      filtered = filtered.filter((p) => p.is_bidding === false || !p.is_bidding);
    }

    // Filter by status
    if (status !== "all") {
      filtered = filtered.filter((p) => p.status_label === status);
    }

    setFilteredProjects(filtered);
  };

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    applyFilters(projects, projectType, statusFilter);
  }, [projectType, statusFilter, projects]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (query.trim()) {
      searchTimeoutRef.current = setTimeout(() => {
        loadProjects(query.trim());
      }, 500);
    } else {
      loadProjects();
    }
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, loadProjects]);

  const handleSelectProject = (project: ProjectListItem) => {
    setSelectedProject(project);
    setCurrentScreen("actions");
  };

  const handleBack = () => {
    if (currentScreen === "actions") {
      setCurrentScreen("list");
      setSelectedProject(null);
    } else {
      setCurrentScreen("actions");
    }
  };

  // Get unique statuses from projects
  const uniqueStatuses = Array.from(
    new Set(projects.map((p) => p.status_label).filter(Boolean))
  ).sort();

  if (currentScreen !== "list" && selectedProject) {
    switch (currentScreen) {
      case "actions":
        return (
          <ProjectActionsScreen
            project={selectedProject}
            onBack={handleBack}
            onUploadImages={() => setCurrentScreen("upload")}
            onViewProposals={() => setCurrentScreen("proposals")}
            onViewWorkload={() => setCurrentScreen("workload")}
            onViewProposal={() => setCurrentScreen("proposal")}
            onViewEstimate={() => setCurrentScreen("estimate")}
            onViewOrders={() => setCurrentScreen("orders")}
          />
        );
      case "upload":
        return (
          <ProjectUploadScreen project={selectedProject} onBack={handleBack} />
        );
      case "proposals":
        return (
          <ProjectReportsScreen project={selectedProject} onBack={handleBack} />
        );
      case "workload":
        return (
          <ProjectWorkloadScreen project={selectedProject} onBack={handleBack} />
        );
      case "proposal":
        return (
          <ProjectProposalViewScreen project={selectedProject} onBack={handleBack} />
        );
      case "estimate":
        return (
          <ProjectEstimateScreen project={selectedProject} onBack={handleBack} />
        );
      case "orders":
        return (
          <ProjectOrdersScreen project={selectedProject} onBack={handleBack} />
        );
      default:
        break;
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Business</Text>
        <Text style={styles.subtitle}>Manage projects and opportunities</Text>
      </View>

      {/* Quick Filters */}
      <View style={styles.filtersContainer}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Type:</Text>
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
          <Text style={styles.filterLabel}>Status:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.statusScroll}
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

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or code..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => setQuery("")}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Projects List */}
      {loading && filteredProjects.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading projects...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {filteredProjects.map((project) => (
            <MKCard
              key={project.id}
              style={styles.projectCard}
              onPress={() => handleSelectProject(project)}
              elevated={true}
            >
              <View style={styles.projectCardContent}>
                <View style={styles.projectHeader}>
                  <Text style={styles.projectName}>{project.name}</Text>
                  {project.code && (
                    <Text style={styles.projectCode}>{project.code}</Text>
                  )}
                </View>
                <View style={styles.projectMeta}>
                  {project.status_label && (
                    <Text style={styles.projectStatus}>
                      {project.status_label}
                    </Text>
                  )}
                  {(project.is_bidding === true || project.is_bidding === false) && (
                    <Text style={styles.projectType}>
                      {project.is_bidding ? "Opportunity" : "Project"}
                    </Text>
                  )}
                </View>
                {project.client_display_name && (
                  <Text style={styles.projectClient}>
                    Client: {project.client_display_name}
                  </Text>
                )}
              </View>
            </MKCard>
          ))}
          {!loading && filteredProjects.length === 0 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No projects found</Text>
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
  filtersContainer: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  filterRow: {
    marginBottom: spacing.md
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.sm
  },
  filterButtons: {
    flexDirection: "row",
    gap: spacing.sm
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  filterButtonText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: "600"
  },
  filterButtonTextActive: {
    color: "white"
  },
  statusScroll: {
    maxHeight: 40
  },
  statusScrollContent: {
    gap: spacing.sm
  },
  statusButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginRight: spacing.sm
  },
  statusButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  statusButtonText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: "600"
  },
  statusButtonTextActive: {
    color: "white"
  },
  searchContainer: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md
  },
  searchIcon: {
    fontSize: 18,
    marginRight: spacing.sm
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary
  },
  clearButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.xs
  },
  clearButtonText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: "700"
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.md
  },
  projectCard: {
    marginBottom: spacing.sm
  },
  projectCardContent: {
    padding: spacing.md
  },
  projectHeader: {
    marginBottom: spacing.xs
  },
  projectName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.xs
  },
  projectCode: {
    fontSize: 14,
    color: colors.textMuted
  },
  projectMeta: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs
  },
  projectStatus: {
    fontSize: 12,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: 4
  },
  projectType: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "600"
  },
  projectClient: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textMuted
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

