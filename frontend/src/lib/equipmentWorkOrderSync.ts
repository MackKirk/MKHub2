import type { QueryClient } from '@tanstack/react-query';

/** Refresh equipment list/detail after work-order-driven status sync. */
export function invalidateEquipmentAfterWorkOrderChange(
  queryClient: QueryClient,
  equipmentId?: string | null,
) {
  queryClient.invalidateQueries({ queryKey: ['equipment'] });
  if (equipmentId) {
    queryClient.invalidateQueries({ queryKey: ['equipment', equipmentId] });
  }
}
