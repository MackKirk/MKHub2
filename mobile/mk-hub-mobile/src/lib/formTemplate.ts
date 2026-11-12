/**
 * Shared Form Engine types (alias of safetyFormTemplate).
 */
export * from "./safetyFormTemplate";

export const FORM_TEMPLATE_CATEGORIES = {
  inspection: "inspection",
  follow_up: "follow_up",
  employee_review: "employee_review",
  site_assessment: "site_assessment",
  work_report: "work_report"
} as const;

export const FIELDWORK_TEMPLATE_CATEGORIES = new Set<string>([
  FORM_TEMPLATE_CATEGORIES.site_assessment,
  FORM_TEMPLATE_CATEGORIES.work_report
]);
