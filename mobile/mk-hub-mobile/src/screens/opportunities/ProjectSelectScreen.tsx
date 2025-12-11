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
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MKButton } from "../../components/MKButton";
import { MKCard } from "../../components/MKCard";
import { searchProjects } from "../../services/projects";
import { toApiError } from "../../services/api";
import type { ProjectListItem } from "../../types/projects";

interface ProjectSelectScreenProps {
  onSelectProject: (project: ProjectListItem) => void;
}

export const ProjectSelectScreen: React.FC<ProjectSelectScreenProps> = ({
  onSelectProject
}) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async (searchQuery?: string) => {
    try {
      setLoading(true);
      const results = await searchProjects(searchQuery || "");
      setProjects(results);
    } catch (err) {
      console.error("[ProjectSelect] Error loading projects:", err);
      const apiError = toApiError(err);
      // Silently fail - user can try again
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load all projects on mount
    loadProjects();
  }, [loadProjects]);

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Project</Text>
        <Text style={styles.subtitle}>Choose a project to manage</Text>
      </View>

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

      {loading && projects.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading projects...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {projects.map((project) => (
            <MKCard
              key={project.id}
              style={styles.projectCard}
              onPress={() => onSelectProject(project)}
              elevated={true}
            >
              <View style={styles.projectCardContent}>
                <View style={styles.projectHeader}>
                  <Text style={styles.projectName}>{project.name}</Text>
                  {project.code && (
                    <Text style={styles.projectCode}>{project.code}</Text>
                  )}
                </View>
                {project.status_label && (
                  <Text style={styles.projectStatus}>
                    Status: {project.status_label}
                  </Text>
                )}
                {project.client_display_name && (
                  <Text style={styles.projectClient}>
                    Client: {project.client_display_name}
                  </Text>
                )}
              </View>
            </MKCard>
          ))}
          {!loading && projects.length === 0 && (
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
  projectStatus: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs
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

