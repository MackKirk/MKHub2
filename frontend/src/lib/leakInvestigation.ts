import { LEAK_INVESTIGATION_DIVISION_LABEL, PROJECT_DIVISIONS_QUERY_KEY } from './businessLine';

export { LEAK_INVESTIGATION_DIVISION_LABEL, PROJECT_DIVISIONS_QUERY_KEY };

export function findLeakInvestigationDivisionId(
  divisions: { id: string; label?: string }[] | undefined
): string | undefined {
  if (!Array.isArray(divisions)) return undefined;
  return divisions.find((d) => d.label === LEAK_INVESTIGATION_DIVISION_LABEL)?.id;
}

export function projectHasLeakInvestigationDivision(
  project: { project_division_ids?: string[] } | null | undefined,
  divisions: { id: string; label?: string }[] | undefined
): boolean {
  const leakDivId = findLeakInvestigationDivisionId(divisions);
  if (!leakDivId) return false;
  const ids = project?.project_division_ids;
  if (!Array.isArray(ids) || ids.length === 0) return false;
  return ids.includes(leakDivId);
}
