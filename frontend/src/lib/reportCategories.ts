/** Change Order notes use Proposals — hidden from Notes/History UI. */
export const HIDDEN_REPORT_CATEGORY_VALUE = 'estimate-changes';

export type ReportCategoryLike = {
  value?: string | null;
  label?: string | null;
};

export function isHiddenReportCategory(
  cat: ReportCategoryLike | string | null | undefined
): boolean {
  if (cat == null) return false;
  if (typeof cat === 'string') {
    return String(cat).trim() === HIDDEN_REPORT_CATEGORY_VALUE;
  }
  const value = String(cat.value || '').trim();
  const label = String(cat.label || '').trim();
  return value === HIDDEN_REPORT_CATEGORY_VALUE || label === 'Change Order';
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
