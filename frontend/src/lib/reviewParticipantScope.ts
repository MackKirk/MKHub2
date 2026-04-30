/** Shared with CreateReviewCycleWizardModal and ReviewCycleDetailPage — must match backend participant_scope. */

export type ReviewParticipantEmp = {
  id: string;
  divisions?: { id?: string; label?: string }[];
  department?: string | null;
  project_division_ids?: string[];
};

export function employeeMatchesParticipantScope(
  emp: ReviewParticipantEmp,
  userIds: Set<string>,
  deptIds: Set<string>,
  projIds: Set<string>
): boolean {
  if (userIds.has(emp.id)) return true;
  if (deptIds.size && (emp.divisions || []).some((d) => deptIds.has(String(d.id || '')))) return true;
  if (projIds.size && (emp.project_division_ids || []).some((pid) => projIds.has(String(pid)))) return true;
  return false;
}

export function employeeDivisionKeys(emp: {
  divisions?: { label?: string }[];
  department?: string | null;
}): string[] {
  const keys: string[] = [];
  for (const d of emp.divisions || []) {
    const lab = (d.label || '').trim();
    if (lab) keys.push(lab);
  }
  const dept = (emp.department || '').trim();
  if (dept) {
    for (const part of dept.split(',')) {
      const t = part.trim();
      if (t) keys.push(t);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export type ParticipantScopeLike = {
  mode?: string;
  user_ids?: string[];
  department_ids?: string[];
  project_division_ids?: string[];
} | null | undefined;

/** Count employees in /employees that match explicit scope (same as wizard). Company-wide returns null count. */
export function countEmployeesMatchingCycleScope(
  employees: ReviewParticipantEmp[],
  participant_scope: ParticipantScopeLike
): { mode: 'all'; directoryTotal: number } | { mode: 'explicit'; count: number; emptyCriteria: boolean } {
  const rows = employees || [];
  const ps = participant_scope;
  if (!ps || String(ps.mode || '').toLowerCase() !== 'explicit') {
    return { mode: 'all', directoryTotal: rows.length };
  }
  const u = new Set(ps.user_ids || []);
  const d = new Set(ps.department_ids || []);
  const p = new Set(ps.project_division_ids || []);
  if (u.size === 0 && d.size === 0 && p.size === 0) {
    return { mode: 'explicit', count: 0, emptyCriteria: true };
  }
  const count = rows.filter((emp) => employeeMatchesParticipantScope(emp, u, d, p)).length;
  return { mode: 'explicit', count, emptyCriteria: false };
}
