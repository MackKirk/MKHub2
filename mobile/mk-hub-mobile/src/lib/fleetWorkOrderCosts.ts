import type { WorkOrderCostItem, WorkOrderCosts } from "../types/fleet";

export type WorkOrderCostCategory = "labor" | "parts" | "other";

export function normalizeCostItems(
  value: number | WorkOrderCostItem[] | undefined
): WorkOrderCostItem[] {
  if (!value) return [];
  if (typeof value === "number") {
    return value > 0 ? [{ description: "Legacy cost", amount: value, invoice_files: [] }] : [];
  }
  return value;
}

export function getCostCategoryTotal(
  costs: WorkOrderCosts | undefined,
  category: WorkOrderCostCategory
): number {
  return normalizeCostItems(costs?.[category]).reduce((sum, item) => sum + (item.amount || 0), 0);
}

export function getWorkOrderCostsTotal(costs: WorkOrderCosts | undefined): number {
  if (costs?.total != null && Number.isFinite(costs.total)) {
    return costs.total;
  }
  return (
    getCostCategoryTotal(costs, "labor") +
    getCostCategoryTotal(costs, "parts") +
    getCostCategoryTotal(costs, "other")
  );
}

export function buildUpdatedCosts(
  current: WorkOrderCosts | undefined,
  category: WorkOrderCostCategory,
  updater: (items: WorkOrderCostItem[]) => WorkOrderCostItem[]
): WorkOrderCosts {
  const next: WorkOrderCosts = {
    labor: normalizeCostItems(current?.labor),
    parts: normalizeCostItems(current?.parts),
    other: normalizeCostItems(current?.other)
  };
  next[category] = updater(normalizeCostItems(current?.[category]));
  next.total =
    getCostCategoryTotal(next, "labor") +
    getCostCategoryTotal(next, "parts") +
    getCostCategoryTotal(next, "other");
  return next;
}
