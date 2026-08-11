import {
  LEAK_INVESTIGATION_DIVISION_LABEL,
  PROJECT_DIVISIONS_QUERY_KEY,
  ROOF_ASSESSMENTS_DIVISION_LABEL,
  COMMERCIAL_SERVICE_DIVISION_LABEL,
} from './businessLine';

export { LEAK_INVESTIGATION_DIVISION_LABEL, PROJECT_DIVISIONS_QUERY_KEY, ROOF_ASSESSMENTS_DIVISION_LABEL };

type DivisionNode = {
  id: string;
  label?: string;
  subdivisions?: { id: string; label?: string }[];
};

/** Parent that owns Leak Investigations (Roof Assessments after v2). */
export function findRoofAssessmentsDivisionId(
  divisions: DivisionNode[] | undefined,
): string | undefined {
  if (!Array.isArray(divisions)) return undefined;
  return divisions.find((d) => d.label === ROOF_ASSESSMENTS_DIVISION_LABEL)?.id;
}

/** @deprecated Prefer findRoofAssessmentsDivisionId */
export function findCommercialServiceDivisionId(
  divisions: DivisionNode[] | undefined,
): string | undefined {
  if (!Array.isArray(divisions)) return undefined;
  return (
    divisions.find((d) => d.label === ROOF_ASSESSMENTS_DIVISION_LABEL)?.id ??
    divisions.find((d) => d.label === COMMERCIAL_SERVICE_DIVISION_LABEL)?.id
  );
}

export function findLeakInvestigationDivisionId(
  divisions: DivisionNode[] | undefined,
): string | undefined {
  if (!Array.isArray(divisions)) return undefined;
  const parents = [
    divisions.find((d) => d.label === ROOF_ASSESSMENTS_DIVISION_LABEL),
    divisions.find((d) => d.label === COMMERCIAL_SERVICE_DIVISION_LABEL),
  ].filter(Boolean) as DivisionNode[];
  for (const parent of parents) {
    const id = parent.subdivisions?.find((s) => s.label === LEAK_INVESTIGATION_DIVISION_LABEL)?.id;
    if (id) return id;
  }
  for (const d of divisions) {
    const id = d.subdivisions?.find((s) => s.label === LEAK_INVESTIGATION_DIVISION_LABEL)?.id;
    if (id) return id;
  }
  return undefined;
}

export function projectHasLeakInvestigationDivision(
  project: { project_division_ids?: string[] } | null | undefined,
  divisions: DivisionNode[] | undefined,
): boolean {
  const leakDivId = findLeakInvestigationDivisionId(divisions);
  if (!leakDivId) return false;
  const ids = project?.project_division_ids;
  if (!Array.isArray(ids) || ids.length === 0) return false;
  return ids.includes(leakDivId);
}
