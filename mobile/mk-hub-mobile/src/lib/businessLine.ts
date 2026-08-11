export const BUSINESS_LINE_CONSTRUCTION = "construction";
export const BUSINESS_LINE_REPAIRS = "repairs_maintenance";

export const RM_PROJECT_DIVISION_LABELS = [
  "Roof Maintenance",
  "Roof Repairs",
  "Warranty Repairs",
  "Roof Assessments",
] as const;

const LEGACY_RM_LABEL = "Repairs & Maintenance";
const LEGACY_COMMERCIAL_SERVICE = "Commercial Service";
const RM_LABELS = new Set<string>([
  LEGACY_RM_LABEL,
  LEGACY_COMMERCIAL_SERVICE,
  ...RM_PROJECT_DIVISION_LABELS,
]);

export function filterProjectDivisionsForBusinessLine<
  T extends { label?: string; subdivisions?: T[] }
>(divisions: T[] | undefined, line: string): T[] {
  if (!Array.isArray(divisions)) return [];
  if (line === BUSINESS_LINE_REPAIRS) {
    const rmSet = new Set<string>(RM_PROJECT_DIVISION_LABELS);
    const order = new Map(RM_PROJECT_DIVISION_LABELS.map((label, index) => [label, index]));
    return divisions
      .filter((d) => rmSet.has(d.label || ""))
      .sort((a, b) => (order.get(a.label || "") ?? 0) - (order.get(b.label || "") ?? 0));
  }
  return divisions
    .filter((d) => !RM_LABELS.has(d.label || ""))
    .map((d) => ({
      ...d,
      subdivisions: Array.isArray(d.subdivisions)
        ? d.subdivisions.filter((s) => !RM_LABELS.has(s.label || ""))
        : d.subdivisions,
    }));
}
