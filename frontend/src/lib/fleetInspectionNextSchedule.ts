import { api } from '@/lib/api';
import { localDateInputToIso } from '@/lib/dateUtils';
import type { FinishInspectionNextSchedule } from '@/components/fleet/FinishInspectionModal';

export async function createNextInspectionSchedule(args: {
  fleetAssetId: string;
  next: FinishInspectionNextSchedule;
  notes?: string | null;
}): Promise<{ id: string }> {
  return api<{ id: string }>('POST', '/fleet/inspection-schedules', {
    fleet_asset_id: args.fleetAssetId,
    scheduled_at: localDateInputToIso(args.next.scheduled_at),
    urgency: args.next.urgency || 'normal',
    category: args.next.category || 'inspection',
    notes: args.notes?.trim() || null,
  });
}
