import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  categoryKey,
  filterReportCategoriesForProject,
  isHiddenReportNote,
  type ReportCategoryLike
} from "../lib/reportCategories";
import { isAdminRole } from "../lib/permissions";
import {
  getReportCategoryPermissions,
  type ProjectReport
} from "../services/reports";
import { MKCard } from "./MKCard";
import { MKButton } from "./MKButton";
import { MKProjectNoteDetailModal } from "./MKProjectNoteDetailModal";
import { MKProjectNoteFormModal } from "./MKProjectNoteFormModal";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { radius } from "../theme/radius";
import { typography } from "../theme/typography";

interface MKProjectNotesSectionProps {
  projectId: string;
  reports: ProjectReport[];
  reportCategories: ReportCategoryLike[];
  isBidding: boolean;
  businessLine?: string;
  employeeLookup: Map<string, string>;
  token?: string | null;
  permissions: string[];
  roles: string[];
  onRefresh: () => Promise<void>;
}

const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
};

const getPreviewText = (text: string, maxLength = 140): string => {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trim()}…`;
};

function normalizeCategoryId(categoryId?: string | null): string {
  return String(categoryId ?? "").trim();
}

function canWriteProjectReports(
  permissions: Set<string>,
  roles: string[],
  businessLine?: string
): boolean {
  if (isAdminRole(roles)) return true;
  const line = businessLine || "construction";
  if (line === "repairs_maintenance" || line === "repairs") {
    return (
      permissions.has("business:rm:projects:write") ||
      permissions.has("business:projects:write")
    );
  }
  return (
    permissions.has("business:construction:projects:write") ||
    permissions.has("business:projects:write")
  );
}

export const MKProjectNotesSection: React.FC<MKProjectNotesSectionProps> = ({
  projectId,
  reports,
  reportCategories,
  isBidding,
  businessLine,
  employeeLookup,
  token,
  permissions,
  roles,
  onRefresh
}) => {
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const isAdmin = isAdminRole(roles);
  const canWriteReports = canWriteProjectReports(permissionsSet, roles, businessLine);

  const [readAllowList, setReadAllowList] = useState<string[] | null>(null);
  const [writeAllowList, setWriteAllowList] = useState<string[] | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("");
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const line = businessLine || "construction";
    getReportCategoryPermissions(line)
      .then((perms) => {
        if (cancelled) return;
        setReadAllowList(
          Array.isArray(perms.read_categories) ? perms.read_categories : null
        );
        setWriteAllowList(
          Array.isArray(perms.write_categories) ? perms.write_categories : null
        );
      })
      .catch(() => {
        if (!cancelled) {
          setReadAllowList(null);
          setWriteAllowList(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [businessLine]);

  const isReadCategoryAllowed = useCallback(
    (categoryId?: string | null) => {
      if (isAdmin) return true;
      const key = normalizeCategoryId(categoryId);
      return readAllowList === null ? true : readAllowList.includes(key);
    },
    [isAdmin, readAllowList]
  );

  const isWriteCategoryAllowed = useCallback(
    (categoryId?: string | null) => {
      if (isAdmin) return true;
      if (!canWriteReports) return false;
      const key = normalizeCategoryId(categoryId);
      return writeAllowList === null ? true : writeAllowList.includes(key);
    },
    [isAdmin, canWriteReports, writeAllowList]
  );

  const visibleCategories = useMemo(
    () =>
      filterReportCategoriesForProject(reportCategories, {
        isBidding,
        isCategoryAllowed: isReadCategoryAllowed
      }),
    [reportCategories, isBidding, isReadCategoryAllowed]
  );

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of reportCategories) {
      map.set(categoryKey(cat), cat.label || categoryKey(cat));
    }
    return map;
  }, [reportCategories]);

  const filterOptions = useMemo(() => {
    const options = [{ value: "", label: "All categories" }];
    for (const cat of visibleCategories) {
      options.push({ value: categoryKey(cat), label: cat.label || categoryKey(cat) });
    }
    return options;
  }, [visibleCategories]);

  const selectedFilterLabel = useMemo(() => {
    const match = filterOptions.find((item) => item.value === selectedCategoryFilter);
    return match?.label || "All categories";
  }, [filterOptions, selectedCategoryFilter]);

  const visibleReports = useMemo(() => {
    return reports
      .filter((report) => !isHiddenReportNote(report))
      .filter((report) => isReadCategoryAllowed(report.category_id))
      .filter((report) => {
        if (!selectedCategoryFilter) return true;
        return normalizeCategoryId(report.category_id) === selectedCategoryFilter;
      })
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
  }, [reports, isReadCategoryAllowed, selectedCategoryFilter]);

  const selectedReport = useMemo(
    () => visibleReports.find((report) => report.id === selectedReportId) ?? null,
    [visibleReports, selectedReportId]
  );

  const canCreateNote =
    canWriteReports &&
    filterReportCategoriesForProject(reportCategories, {
      isBidding,
      isCategoryAllowed: isWriteCategoryAllowed
    }).length > 0;

  const canDeleteSelected =
    !!selectedReport &&
    canWriteReports &&
    isWriteCategoryAllowed(selectedReport.category_id);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Notes / History</Text>
          <Text style={styles.subtitle}>
            {isBidding
              ? "Commercial updates for this opportunity."
              : "Commercial, production, and financial updates for this project."}
          </Text>
        </View>
        {canCreateNote ? (
          <MKButton
            title="Add Note"
            onPress={() => setShowCreateModal(true)}
            size="compact"
            style={styles.addButton}
          />
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.filterField}
        onPress={() => setShowFilterPicker(true)}
      >
        <Text style={styles.filterLabel}>Category</Text>
        <View style={styles.filterValueWrap}>
          <Text style={styles.filterValue} numberOfLines={1}>
            {selectedFilterLabel}
          </Text>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </View>
      </TouchableOpacity>

      <MKCard style={styles.card} elevated>
        {visibleReports.length === 0 ? (
          <Text style={styles.emptyText}>No notes yet.</Text>
        ) : (
          visibleReports.map((report) => {
            const categoryLabel = report.category_id
              ? categoryLookup.get(report.category_id) || report.category_id
              : "General";
            const authorName = report.created_by
              ? employeeLookup.get(String(report.created_by))
              : undefined;

            return (
              <TouchableOpacity
                key={report.id}
                style={styles.noteRow}
                onPress={() => setSelectedReportId(report.id)}
              >
                <View style={styles.noteMarker} />
                <View style={styles.noteBody}>
                  <Text style={styles.noteTitle}>{report.title || "Untitled note"}</Text>
                  <Text style={styles.noteMeta}>
                    {categoryLabel}
                    {" · "}
                    {formatDate(report.created_at)}
                    {authorName ? ` · ${authorName}` : ""}
                  </Text>
                  {report.description ? (
                    <Text style={styles.notePreview}>
                      {getPreviewText(report.description)}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </MKCard>

      <MKProjectNoteFormModal
        visible={showCreateModal}
        projectId={projectId}
        isBidding={isBidding}
        reportCategories={reportCategories}
        isWriteCategoryAllowed={isWriteCategoryAllowed}
        onClose={() => setShowCreateModal(false)}
        onSuccess={onRefresh}
      />

      <MKProjectNoteDetailModal
        visible={!!selectedReport}
        report={selectedReport}
        projectId={projectId}
        categoryLabel={
          selectedReport?.category_id
            ? categoryLookup.get(selectedReport.category_id) || selectedReport.category_id
            : "General"
        }
        authorName={
          selectedReport?.created_by
            ? employeeLookup.get(String(selectedReport.created_by))
            : undefined
        }
        token={token}
        canDelete={canDeleteSelected}
        onClose={() => setSelectedReportId(null)}
        onDeleted={onRefresh}
      />

      <Modal
        visible={showFilterPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterPicker(false)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterPicker(false)}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Filter by category</Text>
            <ScrollView style={styles.pickerList}>
              {filterOptions.map((option) => (
                <TouchableOpacity
                  key={option.value || "all"}
                  style={styles.pickerOption}
                  onPress={() => {
                    setSelectedCategoryFilter(option.value);
                    setShowFilterPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      selectedCategoryFilter === option.value && styles.pickerOptionActive
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.md
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md
  },
  headerText: {
    flex: 1,
    gap: spacing.xs
  },
  addButton: {
    minWidth: 110
  },
  card: {
    marginBottom: spacing.md
  },
  title: {
    ...typography.subtitle
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  filterField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  filterLabel: {
    ...typography.caption,
    marginBottom: spacing.xs
  },
  filterValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  filterValue: {
    ...typography.body,
    flex: 1
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm
  },
  noteMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 8
  },
  noteBody: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.md
  },
  noteTitle: {
    ...typography.subtitle,
    marginBottom: spacing.xs
  },
  noteMeta: {
    ...typography.caption,
    marginBottom: spacing.xs
  },
  notePreview: {
    ...typography.bodySmall,
    color: colors.textMuted
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  pickerSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    maxHeight: "60%",
    padding: spacing.lg
  },
  pickerTitle: {
    ...typography.subtitle,
    marginBottom: spacing.md
  },
  pickerList: {
    maxHeight: 320
  },
  pickerOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  pickerOptionText: {
    ...typography.body
  },
  pickerOptionActive: {
    color: colors.primary,
    fontWeight: "600"
  }
});
