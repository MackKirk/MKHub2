import {
  COMMERCIAL_SERVICE_DIVISION_LABEL,
  LEAK_INVESTIGATION_DIVISION_LABEL,
  PROJECT_DIVISIONS_QUERY_KEY,
} from './businessLine';

export { LEAK_INVESTIGATION_DIVISION_LABEL, PROJECT_DIVISIONS_QUERY_KEY };

type DivisionNode = {
  id: string;
  label?: string;
  subdivisions?: { id: string; label?: string }[];
};

export function findCommercialServiceDivisionId(
  divisions: DivisionNode[] | undefined,
): string | undefined {
  if (!Array.isArray(divisions)) return undefined;
  return divisions.find((d) => d.label === COMMERCIAL_SERVICE_DIVISION_LABEL)?.id;
}

export function findLeakInvestigationDivisionId(
  divisions: DivisionNode[] | undefined,
): string | undefined {
  if (!Array.isArray(divisions)) return undefined;
  const commercialService = divisions.find((d) => d.label === COMMERCIAL_SERVICE_DIVISION_LABEL);
  if (!commercialService?.subdivisions?.length) return undefined;
  return commercialService.subdivisions.find((s) => s.label === LEAK_INVESTIGATION_DIVISION_LABEL)?.id;
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
