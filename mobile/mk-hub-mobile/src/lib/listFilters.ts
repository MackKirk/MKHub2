import type { ProjectListKind } from "../types/projects";

export type ListQuickStatusFilter = {
  key: string;
  label: string;
  statusId: string;
};

function statusIdByLabel(
  statuses: unknown[] | undefined,
  label: string
): string | undefined {
  const t = label.toLowerCase().trim();
  for (const s of statuses || []) {
    const row = s as { id?: unknown; label?: unknown };
    if (String(row.label || "").toLowerCase().trim() === t && row.id != null) {
      return String(row.id);
    }
  }
  return undefined;
}

function statusIdByLabels(
  statuses: unknown[] | undefined,
  ...labels: string[]
): string | undefined {
  for (const label of labels) {
    const id = statusIdByLabel(statuses, label);
    if (id) return id;
  }
  return undefined;
}

function resolveQuickStatusFilters(
  statuses: unknown[] | undefined,
  specs: Array<{ key: string; label: string; labels: string[] }>
): ListQuickStatusFilter[] {
  const out: ListQuickStatusFilter[] = [];
  for (const spec of specs) {
    const statusId = statusIdByLabels(statuses, ...spec.labels);
    if (statusId) out.push({ key: spec.key, label: spec.label, statusId });
  }
  return out;
}

export function resolveProjectQuickStatusFilters(
  statuses: unknown[] | undefined
): ListQuickStatusFilter[] {
  return resolveQuickStatusFilters(statuses, [
    { key: "in_progress", label: "In Progress", labels: ["in progress", "on progress"] },
    { key: "on_hold", label: "On Hold", labels: ["on hold"] },
    { key: "finished", label: "Finished", labels: ["finished"] },
    { key: "cancelled", label: "Cancelled", labels: ["cancelled", "canceled"] },
    { key: "conflict", label: "Conflict", labels: ["conflict", "schedule conflict"] }
  ]);
}

export function resolveOpportunityQuickStatusFilters(
  statuses: unknown[] | undefined
): ListQuickStatusFilter[] {
  return resolveQuickStatusFilters(statuses, [
    { key: "prospecting", label: "Prospecting", labels: ["prospecting"] },
    { key: "refused", label: "Refused", labels: ["refused"] },
    { key: "cancelled", label: "Cancelled", labels: ["cancelled", "canceled"] },
    {
      key: "sent_to_customer",
      label: "Sent to Customer",
      labels: ["sent to customer"]
    },
    { key: "conflict", label: "Conflict", labels: ["conflict", "schedule conflict"] },
    {
      key: "low_and_awarded",
      label: "Low & Awarded",
      labels: ["low & awarded", "lost & awarded", "lost and awarded"]
    }
  ]);
}

export function resolveQuickStatusFiltersForListKind(
  listKind: ProjectListKind,
  statuses: unknown[] | undefined
): ListQuickStatusFilter[] {
  if (listKind === "projects") {
    return resolveProjectQuickStatusFilters(statuses);
  }
  return resolveOpportunityQuickStatusFilters(statuses);
}

export interface ProjectListAdvancedFilters {
  statusId?: string;
  divisionId?: string;
  clientId?: string;
  estimatorId?: string;
}

export function hasAdvancedFilters(
  filters: ProjectListAdvancedFilters
): boolean {
  return Boolean(
    filters.statusId ||
      filters.divisionId ||
      filters.clientId ||
      filters.estimatorId
  );
}
