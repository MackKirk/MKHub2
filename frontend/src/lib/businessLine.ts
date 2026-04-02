/** Align with backend app.services.business_line */
export const BUSINESS_LINE_CONSTRUCTION = 'construction';
export const BUSINESS_LINE_REPAIRS_MAINTENANCE = 'repairs_maintenance';

const RM_LABEL = 'Repairs & Maintenance';

/** Filter project_divisions tree for list/detail pickers */
export function filterProjectDivisionsForBusinessLine<T extends { label?: string; subdivisions?: T[] }>(
  divisions: T[] | undefined,
  line: string
): T[] {
  if (!Array.isArray(divisions)) return [];
  if (line === BUSINESS_LINE_REPAIRS_MAINTENANCE) {
    // Only Repairs & Maintenance and its subdivisions (subcategories)
    return divisions.filter((d) => (d.label || '') === RM_LABEL);
  }
  return divisions
    .filter((d) => (d.label || '') !== RM_LABEL)
    .map((d) => ({
      ...d,
      subdivisions: Array.isArray(d.subdivisions)
        ? d.subdivisions.filter((s) => (s.label || '') !== RM_LABEL)
        : d.subdivisions,
    }));
}
