import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getToken } from '@/lib/api';
import InspectionScheduleDetail from './InspectionScheduleDetail';
import InspectionDetail from './InspectionDetail';

/** GET JSON; returns null on 404. Re-throws auth and other errors. */
async function getJsonOr404<T>(path: string): Promise<T | null> {
  const h: Record<string, string> = { Accept: 'application/json' };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  const r = await fetch(path, { method: 'GET', headers: h });
  if (r.status === 401) {
    localStorage.removeItem('user_token');
    window.location.replace('/login');
    throw new Error('Unauthorized');
  }
  if (r.status === 404) return null;
  if (!r.ok) {
    let msg = `HTTP ${r.status}: ${r.statusText}`;
    try {
      const err = await r.json();
      msg = err.detail || err.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const ct = r.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return (await r.json()) as T;
  return null;
}

/** Minimal shape from GET /fleet/inspections/:id for routing decisions. */
export type FleetInspectionRouteResolve = {
  id: string;
  inspection_schedule_id?: string | null;
  inspection_type?: string | null;
};

function focusFromInspectionType(inspectionType: string | null | undefined): 'body' | 'mechanical' {
  const t = (inspectionType || '').toLowerCase();
  return t === 'body' ? 'body' : 'mechanical';
}

/**
 * Same path `/fleet/inspections/:id` can be a schedule UUID (aggregated overview)
 * or a single inspection UUID. Schedule takes precedence if both matched (unexpected).
 * FleetInspection rows that belong to a schedule redirect to the schedule URL with ?focus=.
 */
export default function FleetInspectionsIdGate() {
  const { id } = useParams<{ id: string }>();

  const { data: schedule, isFetched: scheduleFetched } = useQuery({
    queryKey: ['fleet-inspection-route-schedule-resolve', id],
    queryFn: () => getJsonOr404<unknown>(`/fleet/inspection-schedules/${id}`),
    enabled: !!id && id !== 'new',
    staleTime: 30_000,
  });

  const { data: inspection, isFetched: inspectionFetched } = useQuery({
    queryKey: ['fleet-inspection-route-inspection-resolve', id],
    queryFn: () => getJsonOr404<FleetInspectionRouteResolve>(`/fleet/inspections/${id}`),
    enabled: !!id && id !== 'new',
    staleTime: 30_000,
  });

  const scheduleIdFromInspection =
    inspection && !schedule && inspection.inspection_schedule_id
      ? String(inspection.inspection_schedule_id)
      : null;

  const needParentSchedule = Boolean(scheduleIdFromInspection);

  const { data: parentSchedule, isPending: parentPending } = useQuery({
    queryKey: ['fleet-inspection-route-parent-schedule-resolve', scheduleIdFromInspection],
    queryFn: () => getJsonOr404<unknown>(`/fleet/inspection-schedules/${scheduleIdFromInspection}`),
    enabled: !!scheduleIdFromInspection && scheduleFetched && inspectionFetched && !schedule && !!inspection,
    staleTime: 30_000,
  });

  if (!id || id === 'new') {
    return <div className="p-4 text-gray-500">Invalid inspection ID</div>;
  }

  const loadingInitial =
    !scheduleFetched || !inspectionFetched || (needParentSchedule && parentPending);

  if (loadingInitial) {
    return (
      <div className="p-4">
        <div className="animate-pulse rounded-xl border bg-white p-6">Loading…</div>
      </div>
    );
  }

  if (schedule) {
    return <InspectionScheduleDetail />;
  }

  if (inspection) {
    if (scheduleIdFromInspection) {
      if (parentSchedule) {
        const focus = focusFromInspectionType(inspection.inspection_type);
        return (
          <Navigate
            to={`/fleet/inspections/${scheduleIdFromInspection}?focus=${focus}`}
            replace
          />
        );
      }
      return <InspectionDetail />;
    }
    return <InspectionDetail />;
  }

  return <div className="p-4 text-gray-500">Inspection or schedule not found</div>;
}

/** Bookmark compatibility: `/fleet/inspection-schedules/:id` → `/fleet/inspections/:id` */
export function FleetInspectionScheduleLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/fleet/inspections" replace />;
  return <Navigate to={`/fleet/inspections/${id}`} replace />;
}
