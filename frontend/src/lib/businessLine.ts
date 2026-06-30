/** Align with backend app.services.business_line */
export const BUSINESS_LINE_CONSTRUCTION = 'construction';
export const BUSINESS_LINE_REPAIRS_MAINTENANCE = 'repairs_maintenance';

export const RM_PROJECT_DIVISION_LABELS = [
  'Commercial Service',
  'Warranty Repairs',
  'Leak Investigations',
  'Roof Assessments',
  'Preventive Maintenance',
] as const;

const LEGACY_RM_LABEL = 'Repairs & Maintenance';
const RM_LABELS = new Set<string>([LEGACY_RM_LABEL, ...RM_PROJECT_DIVISION_LABELS]);

/** Bump when project_divisions seed structure changes (invalidates React Query cache). */
export const PROJECT_DIVISIONS_QUERY_KEY = ['project-divisions', 'rm-tree-v1'] as const;

/** Filter project_divisions tree for list/detail pickers */
export function filterProjectDivisionsForBusinessLine<T extends { label?: string; subdivisions?: T[] }>(
  divisions: T[] | undefined,
  line: string
): T[] {
  if (!Array.isArray(divisions)) return [];
  if (line === BUSINESS_LINE_REPAIRS_MAINTENANCE) {
    const rmSet = new Set<string>(RM_PROJECT_DIVISION_LABELS);
    return divisions.filter((d) => rmSet.has(d.label || ''));
  }
  return divisions.filter((d) => !RM_LABELS.has(d.label || ''));
}
