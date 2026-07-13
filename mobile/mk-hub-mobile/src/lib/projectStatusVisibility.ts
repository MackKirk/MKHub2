export type ProjectStatusRow = {
  label?: string;
  meta?: Record<string, unknown> | null;
};

const LEGACY_PROJECT_EXCLUDED = new Set([
  "prospecting",
  "sent to customer",
  "refused"
]);

const LEGACY_OPPORTUNITY_ALLOWED = new Set([
  "prospecting",
  "sent to customer",
  "refused",
  "conflict",
  "schedule conflict",
  "low & awarded",
  "lost & awarded",
  "lost and awarded",
  "lost",
  "awarded",
  "cancelled",
  "canceled"
]);

function normLabel(label: unknown): string {
  return String(label || "")
    .toLowerCase()
    .trim();
}

function legacyShowInProject(label: unknown): boolean {
  return !LEGACY_PROJECT_EXCLUDED.has(normLabel(label));
}

function legacyShowInOpportunity(label: unknown): boolean {
  return LEGACY_OPPORTUNITY_ALLOWED.has(normLabel(label));
}

function effectiveShowInProject(status: ProjectStatusRow): boolean {
  const v = status.meta?.show_in_project;
  if (v === true || v === false) return v;
  return legacyShowInProject(status.label);
}

function effectiveShowInOpportunity(status: ProjectStatusRow): boolean {
  const v = status.meta?.show_in_opportunity;
  if (v === true || v === false) return v;
  return legacyShowInOpportunity(status.label);
}

export function filterStatusesForProject<T extends ProjectStatusRow>(
  statuses: T[]
): T[] {
  return (statuses || []).filter((s) => effectiveShowInProject(s));
}

export function filterStatusesForOpportunity<T extends ProjectStatusRow>(
  statuses: T[]
): T[] {
  return (statuses || []).filter((s) => effectiveShowInOpportunity(s));
}
