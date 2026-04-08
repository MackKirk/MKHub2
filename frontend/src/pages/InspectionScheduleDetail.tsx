import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import FleetDetailHeader from '@/components/FleetDetailHeader';
import { formatDateLocal } from '@/lib/dateUtils';
import { INSPECTION_RESULT_LABELS, INSPECTION_RESULT_COLORS, SCHEDULE_STATUS_LABELS, CATEGORY_LABELS, URGENCY_LABELS, URGENCY_COLORS } from '@/lib/fleetBadges';
import toast from 'react-hot-toast';

type Schedule = {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string;
  scheduled_at: string;
  urgency: string;
  category: string;
  status: string;
  notes?: string | null;
  created_at?: string;
  body_inspection_id?: string | null;
  mechanical_inspection_id?: string | null;
  body_result?: string | null;
  mechanical_result?: string | null;
};

type InspectionDetail = {
  id: string;
  result: string;
  notes?: string;
  photos?: string[];
  checklist_results?: {
    areas?: Array<{ key: string; condition?: string; issues?: string }>;
    _metadata?: Record<string, string>;
    [key: string]: any;
  };
};

type ChecklistTemplate = {
  areas?: Array<{ key: string; label: string; description?: string }>;
  sections?: Array<{
    id: string;
    title: string;
    items: Array<{ key: string; label: string; category: string }>;
  }>;
};

const CONDITION_STYLES: Record<string, string> = {
  ok: 'bg-green-100 text-green-800',
  damage: 'bg-red-100 text-red-800',
  conditional: 'bg-amber-100 text-amber-800',
};
const CONDITION_LABELS: Record<string, string> = {
  ok: 'OK',
  damage: 'Damage',
  conditional: 'Conditional',
};
const CONDITION_ICONS: Record<string, string> = {
  ok: '✓',
  damage: '✗',
  conditional: '⚠',
};

export default function InspectionScheduleDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: string[] }>('GET', '/auth/me'),
  });
  const isAdmin = (me?.roles ?? []).includes('admin');

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['inspection-schedule', id],
    queryFn: () => api<Schedule>('GET', `/fleet/inspection-schedules/${id}`),
    enabled: !!id,
  });

  const { data: asset } = useQuery({
    queryKey: ['fleetAsset', schedule?.fleet_asset_id],
    queryFn: () =>
      api<{ id: string; name?: string; unit_number?: string; asset_type?: string; photos?: string[] }>(
        'GET',
        `/fleet/assets/${schedule!.fleet_asset_id}`
      ),
    enabled: !!schedule?.fleet_asset_id,
  });

  const assetPhotoUrl = asset?.photos?.[0] ? withFileAccessToken(`/files/${asset.photos[0]}/thumbnail?w=400`) : null;

  const { data: bodyInspection } = useQuery({
    queryKey: ['inspection', schedule?.body_inspection_id],
    queryFn: () => api<InspectionDetail>('GET', `/fleet/inspections/${schedule!.body_inspection_id}`),
    enabled: !!schedule?.body_inspection_id,
  });

  const { data: mechanicalInspection } = useQuery({
    queryKey: ['inspection', schedule?.mechanical_inspection_id],
    queryFn: () => api<InspectionDetail>('GET', `/fleet/inspections/${schedule!.mechanical_inspection_id}`),
    enabled: !!schedule?.mechanical_inspection_id,
  });

  const { data: bodyTemplate } = useQuery({
    queryKey: ['inspectionChecklistTemplate', 'body'],
    queryFn: () => api<ChecklistTemplate>('GET', '/fleet/inspections/checklist-template?type=body'),
    enabled: !!schedule?.body_inspection_id,
  });

  const { data: mechanicalTemplate } = useQuery({
    queryKey: ['inspectionChecklistTemplate', 'mechanical'],
    queryFn: () => api<ChecklistTemplate>('GET', '/fleet/inspections/checklist-template?type=mechanical'),
    enabled: !!schedule?.mechanical_inspection_id,
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: () => api('DELETE', `/fleet/inspection-schedules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
      toast.success('Schedule deleted');
      nav('/fleet/inspections');
    },
    onError: () => toast.error('Failed to delete schedule'),
  });

  if (!id) {
    return (
      <div className="p-4">
        <button type="button" onClick={() => nav('/fleet/inspections')} className="text-brand-red hover:underline">
          Back to inspections
        </button>
        <p className="mt-4 text-gray-500">Invalid schedule ID</p>
      </div>
    );
  }

  if (isLoading || !schedule) {
    return (
      <div className="p-4">
        <div className="animate-pulse rounded-xl border bg-white p-6">Loading…</div>
      </div>
    );
  }

  const bodyPending = !schedule.body_result || schedule.body_result === 'pending';
  const mechPending = !schedule.mechanical_result || schedule.mechanical_result === 'pending';

  const todayLabel = new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <FleetDetailHeader
        onBack={() => nav('/fleet/inspections')}
        title={<span className="text-sm font-semibold text-gray-900">Inspection</span>}
        subtitle={null}
        actions={isAdmin ? (
          <button
            type="button"
            onClick={() => window.confirm('Delete this schedule permanently? Linked inspections will also be removed.') && deleteScheduleMutation.mutate()}
            disabled={deleteScheduleMutation.isPending}
            className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
          >
            {deleteScheduleMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : undefined}
        right={
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        }
      />

      {/* Hero section - same layout as Work Order: asset photo + key info */}
      <div className="rounded-xl border bg-white overflow-hidden p-4">
        <div className="flex gap-4 items-start">
          <div className="w-48 flex-shrink-0">
            <div className="w-48 h-36 rounded-xl border border-gray-200 overflow-hidden bg-gray-100">
              {assetPhotoUrl ? (
                <img src={assetPhotoUrl} alt={asset?.name || 'Vehicle'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1h-1M4 12a2 2 0 110 4m0-4a2 2 0 100 4m0-4v2m0-4V6m16 4a2 2 0 110 4m0-4a2 2 0 100 4m0-4v2m0-4V6" />
                  </svg>
                </div>
              )}
            </div>
            {schedule.fleet_asset_id && (
              <button
                type="button"
                onClick={() => nav(`/fleet/assets/${schedule.fleet_asset_id}`)}
                className="mt-2 text-xs font-medium text-brand-red hover:underline"
              >
                View asset
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Status</span>
              <div className="mt-0.5">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    schedule.status === 'scheduled'
                      ? 'bg-blue-100 text-blue-800'
                      : schedule.status === 'in_progress'
                        ? 'bg-amber-100 text-amber-800'
                        : schedule.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Category</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{CATEGORY_LABELS[schedule.category] ?? schedule.category}</div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Urgency</span>
              <div className="mt-0.5">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${URGENCY_COLORS[schedule.urgency] || 'bg-gray-100 text-gray-800'}`}>
                  {URGENCY_LABELS[schedule.urgency] ?? schedule.urgency}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Vehicle</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5 truncate" title={schedule.fleet_asset_name || schedule.fleet_asset_id}>
                {asset?.unit_number || schedule.fleet_asset_name || schedule.fleet_asset_id || '—'}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Scheduled</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{formatDateLocal(new Date(schedule.scheduled_at))}</div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Created</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{schedule.created_at ? new Date(schedule.created_at).toLocaleDateString() : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Inspections: Review summary with Start/View in each column */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
          <h2 className="text-sm font-semibold text-gray-900">Inspections</h2>
          <p className="text-xs text-gray-500 mt-0.5">Checklist answers, photos, and result for each inspection.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
          {/* Body / Exterior column */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🚗</span>
              <h3 className="font-semibold text-gray-900">Body / Exterior</h3>
            </div>
            {schedule.body_inspection_id ? (
              <button
                type="button"
                onClick={() => nav(`/fleet/inspections/${schedule.body_inspection_id}`)}
                className={`w-full mb-4 px-4 py-3 rounded-xl border-2 font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                  bodyPending
                    ? 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-900'
                }`}
              >
                <span className="text-lg">🚗</span>
                <span>{bodyPending ? 'Start' : 'View'}</span>
                {!bodyPending && (
                  <span className={`text-xs px-2 py-0.5 rounded ${INSPECTION_RESULT_COLORS[schedule.body_result!] || 'bg-gray-200 text-gray-800'}`}>
                    {INSPECTION_RESULT_LABELS[schedule.body_result!] ?? schedule.body_result}
                  </span>
                )}
              </button>
            ) : (
              <div className="mb-4 py-3 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 text-sm text-center">Body not created</div>
            )}
            {schedule.body_inspection_id && bodyInspection && bodyTemplate?.areas ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  {bodyTemplate.areas.map((area) => {
                    const result = bodyInspection.checklist_results?.areas?.find((a: any) => a.key === area.key);
                    const cond = result?.condition ?? '';
                    const issueText = result?.issues ?? '';
                    return (
                      <div key={area.key} className="flex items-start justify-between gap-2 py-2 border-b border-gray-100 last:border-b-0">
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-800">{area.label}</span>
                          {area.description && <div className="text-xs text-gray-500 mt-0.5">{area.description}</div>}
                          {issueText && <div className="text-xs text-gray-600 mt-1">{issueText}</div>}
                        </div>
                        {cond && (
                          <span className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-lg font-bold ${CONDITION_STYLES[cond] || 'bg-gray-100 text-gray-700'}`} title={CONDITION_LABELS[cond] ?? cond}>
                            {CONDITION_ICONS[cond] ?? cond}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {bodyInspection.notes && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Observations</span>
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{bodyInspection.notes}</p>
                  </div>
                )}
                {bodyInspection.photos && bodyInspection.photos.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Photos</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {bodyInspection.photos.map((photoId) => (
                        <a
                          key={photoId}
                          href={withFileAccessToken(`/files/${photoId}/thumbnail?w=800`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red"
                        >
                          <img src={withFileAccessToken(`/files/${photoId}/thumbnail?w=160`)} alt="" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {!bodyPending && (
                  <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Result</span>
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-sm font-medium ${INSPECTION_RESULT_COLORS[bodyInspection.result] || 'bg-gray-100 text-gray-800'}`}>
                      {INSPECTION_RESULT_LABELS[bodyInspection.result] ?? bodyInspection.result}
                    </span>
                  </div>
                )}
              </div>
            ) : schedule.body_inspection_id && bodyPending && (
              <p className="text-sm text-gray-500">Open the inspection to fill the checklist.</p>
            )}
          </div>

          {/* Mechanical column */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🔧</span>
              <h3 className="font-semibold text-gray-900">Mechanical</h3>
            </div>
            {schedule.mechanical_inspection_id ? (
              <button
                type="button"
                onClick={() => nav(`/fleet/inspections/${schedule.mechanical_inspection_id}`)}
                className={`w-full mb-4 px-4 py-3 rounded-xl border-2 font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                  mechPending
                    ? 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-900'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-900'
                }`}
              >
                <span className="text-lg">🔧</span>
                <span>{mechPending ? 'Start' : 'View'}</span>
                {!mechPending && (
                  <span className={`text-xs px-2 py-0.5 rounded ${INSPECTION_RESULT_COLORS[schedule.mechanical_result!] || 'bg-gray-200 text-gray-800'}`}>
                    {INSPECTION_RESULT_LABELS[schedule.mechanical_result!] ?? schedule.mechanical_result}
                  </span>
                )}
              </button>
            ) : (
              <div className="mb-4 py-3 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 text-sm text-center">Mechanical not created</div>
            )}
            {schedule.mechanical_inspection_id && mechanicalInspection && mechanicalTemplate?.sections ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  {mechanicalTemplate.sections.map((section) => (
                    <div key={section.id}>
                      <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{section.title}</h4>
                      <div className="space-y-1.5">
                        {section.items.map((item) => {
                          const val = (mechanicalInspection.checklist_results as any)?.[item.key];
                          const cond = typeof val === 'object' ? (val?.status || val?.condition || '') : (val || '');
                          const norm = cond === 'ok' || cond === 'damage' || cond === 'conditional' ? cond : '';
                          return (
                            <div key={item.key} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded bg-gray-50/80">
                              <span className="text-sm text-gray-800">{item.label}</span>
                              {norm && (
                                <span className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-lg font-bold ${CONDITION_STYLES[norm] || 'bg-gray-100 text-gray-700'}`} title={CONDITION_LABELS[norm] ?? norm}>
                                  {CONDITION_ICONS[norm] ?? norm}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {mechanicalInspection.notes && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Observations</span>
                    <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{mechanicalInspection.notes}</p>
                  </div>
                )}
                {mechanicalInspection.photos && mechanicalInspection.photos.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Photos</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {mechanicalInspection.photos.map((photoId) => (
                        <a
                          key={photoId}
                          href={withFileAccessToken(`/files/${photoId}/thumbnail?w=800`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red"
                        >
                          <img src={withFileAccessToken(`/files/${photoId}/thumbnail?w=160`)} alt="" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {!mechPending && (
                  <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">Result</span>
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-sm font-medium ${INSPECTION_RESULT_COLORS[mechanicalInspection.result] || 'bg-gray-100 text-gray-800'}`}>
                      {INSPECTION_RESULT_LABELS[mechanicalInspection.result] ?? mechanicalInspection.result}
                    </span>
                  </div>
                )}
              </div>
            ) : schedule.mechanical_inspection_id && mechPending && (
              <p className="text-sm text-gray-500">Open the inspection to fill the checklist.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
