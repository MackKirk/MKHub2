import type { FleetAssetHistoryItem } from '@/components/fleet/FleetAssetLogsTab';

const ACTOR_MATCH_SECONDS = 300;

function parseTime(iso: string | null | undefined): number | null {
  if (!iso?.trim()) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function timesClose(a: number | null, b: number | null, windowSec: number): boolean {
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= windowSec * 1000;
}

/** Prefer row actor; fall back to matching audit / fleet_log rows for the same assignment. */
export function resolveFleetHistoryActor(
  item: FleetAssetHistoryItem,
  allItems: FleetAssetHistoryItem[],
): string | null {
  const direct = item.actor_name?.trim();
  if (direct) return direct;

  const assignmentId =
    item.assignment_id ||
    (item.entity_type === 'asset_assignment' ? item.entity_id : null) ||
    null;

  if (assignmentId) {
    for (const other of allItems) {
      if (other.source !== 'audit' || other.entity_type !== 'asset_assignment') continue;
      if (other.entity_id !== assignmentId) continue;
      const name = other.actor_name?.trim();
      if (!name) continue;
      if (item.source === 'assignment') {
        const wantCreate = item.log_subtype === 'assign' || item.kind === 'checkout';
        const wantUpdate = item.log_subtype === 'return' || item.kind === 'return';
        if (wantCreate && other.audit_action === 'CREATE') return name;
        if (wantUpdate && other.audit_action === 'UPDATE') return name;
      }
      return name;
    }
  }

  const itemTime = parseTime(item.occurred_at);
  if (itemTime !== null) {
    for (const other of allItems) {
      if (other.source !== 'fleet_log') continue;
      const logType =
        item.log_subtype === 'return' || item.kind === 'return' ? 'return' : 'assignment';
      if (other.kind !== logType && other.title?.toLowerCase() !== logType) continue;
      if (!timesClose(parseTime(other.occurred_at), itemTime, ACTOR_MATCH_SECONDS)) continue;
      const name = other.actor_name?.trim();
      if (name) return name;
    }
  }

  return null;
}

export function formatFleetHistoryPerformedBy(actorName: string | null | undefined): string {
  const n = actorName?.trim();
  return n || '—';
}
