export type WorkOrderListScope = 'fleet' | 'equipment';

export const WORK_ORDER_LIST_PATH: Record<WorkOrderListScope, string> = {
  fleet: '/fleet/work-orders',
  equipment: '/company-assets/work-orders',
};

export function workOrderScopeFromEntityType(entityType: string | null | undefined): WorkOrderListScope {
  return (entityType || '').toLowerCase() === 'equipment' ? 'equipment' : 'fleet';
}

export function workOrderListPath(scope: WorkOrderListScope): string {
  return WORK_ORDER_LIST_PATH[scope];
}

export function workOrderDetailPath(scope: WorkOrderListScope, id: string, tab?: string): string {
  const base = `${WORK_ORDER_LIST_PATH[scope]}/${id}`;
  return tab ? `${base}?tab=${tab}` : base;
}

export function workOrderScopeFromPathname(pathname: string): WorkOrderListScope {
  return pathname.startsWith('/company-assets/work-orders') ? 'equipment' : 'fleet';
}
