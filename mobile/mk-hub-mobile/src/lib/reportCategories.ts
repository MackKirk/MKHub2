export const HIDDEN_REPORT_CATEGORY_VALUE = "estimate-changes";

export type ReportCategoryLike = {
  value?: string | null;
  label?: string | null;
  meta?: { group?: string } | null;
  sort_index?: number;
  id?: string;
};

export function isHiddenReportCategory(
  cat: ReportCategoryLike | string | null | undefined
): boolean {
  if (cat == null) return false;
  if (typeof cat === "string") {
    return String(cat).trim() === HIDDEN_REPORT_CATEGORY_VALUE;
  }
  const value = String(cat.value || "").trim();
  const label = String(cat.label || "").trim();
  return value === HIDDEN_REPORT_CATEGORY_VALUE || label === "Change Order";
}

export function isHiddenReportNote(report: {
  category_id?: string | null;
  financial_type?: string | null;
}): boolean {
  return (
    isHiddenReportCategory(report.category_id) ||
    report.financial_type === HIDDEN_REPORT_CATEGORY_VALUE
  );
}

export function categoryKey(cat: ReportCategoryLike): string {
  return String(cat.value || cat.label || cat.id || "");
}

export function filterReportCategoriesForProject(
  categories: ReportCategoryLike[],
  options: {
    isBidding: boolean;
    isCategoryAllowed?: (categoryId?: string | null) => boolean;
  }
): ReportCategoryLike[] {
  const allowed = options.isCategoryAllowed ?? (() => true);
  const groups = options.isBidding
    ? ["commercial"]
    : ["commercial", "production", "financial"];

  return categories
    .filter((cat) => {
      const group = cat.meta?.group;
      if (!group || !groups.includes(group)) return false;
      if (isHiddenReportCategory(cat)) return false;
      return allowed(categoryKey(cat));
    })
    .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
}
