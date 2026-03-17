import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { InspectionScheduleForm } from './InspectionNew';
import {
  SCHEDULE_STATUS_LABELS,
  INSPECTION_RESULT_LABELS,
  INSPECTION_RESULT_COLORS,
} from '@/lib/fleetBadges';

type Schedule = {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string;
  scheduled_at: string;
  urgency: string;
  category: string;
  status: string;
  notes?: string;
  created_at?: string;
  body_inspection_id?: string | null;
  mechanical_inspection_id?: string | null;
  body_result?: string | null;
  mechanical_result?: string | null;
};

export default function Inspections() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [showNewInspectionModal, setShowNewInspectionModal] = useState(false);
  const [newInspectionCanSubmit, setNewInspectionCanSubmit] = useState(false);
  const [newInspectionIsPending, setNewInspectionIsPending] = useState(false);

  type SortColumn = 'scheduled_at' | 'asset';
  const validSorts: SortColumn[] = ['scheduled_at', 'asset'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn = (rawSort && validSorts.includes(rawSort as SortColumn)) ? (rawSort as SortColumn) : 'scheduled_at';
  const sortDir = (searchParams.get('dir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const setListSort = (column: SortColumn, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    setSearchParams(params, { replace: true });
  };

  const statusParam = searchParams.get('status') ?? '';
  const fleetAssetIdParam = searchParams.get('fleet_asset_id') ?? '';

  const { data: schedulesRaw = [], isLoading } = useQuery({
    queryKey: ['inspection-schedules', statusParam, fleetAssetIdParam, sortBy, sortDir],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusParam) params.set('status', statusParam);
      if (fleetAssetIdParam) params.set('fleet_asset_id', fleetAssetIdParam);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      return api<Schedule[]>('GET', `/fleet/inspection-schedules?${params.toString()}`);
    },
  });

  const { data: assetsData } = useQuery({
    queryKey: ['fleetAssetsForFilter'],
    queryFn: () => api<{ items: { id: string; name: string; unit_number?: string }[] }>('GET', '/fleet/assets?limit=300'),
  });
  const assetsForFilter = assetsData?.items ?? [];

  const schedules = useMemo(() => {
    const list = schedulesRaw ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (s) =>
        (s.fleet_asset_name && s.fleet_asset_name.toLowerCase().includes(q)) ||
        (s.fleet_asset_id && s.fleet_asset_id.toLowerCase().includes(q))
    );
  }, [schedulesRaw, search]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Fleet Inspections</div>
            <div className="text-xs text-gray-500 mt-0.5">Manage inspection schedules. Open a schedule to start Body or Mechanical inspection.</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => nav('/fleet/calendar')}
              className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              Calendar
            </button>
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by vehicle name or ID…"
                value={search}
                onChange={(e) => {
                  const next = e.target.value;
                  const params = new URLSearchParams(searchParams);
                  if (next) params.set('search', next);
                  else params.delete('search');
                  setSearchParams(params, { replace: true });
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-9 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <select
            value={statusParam}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams);
              const v = e.target.value;
              if (v) params.set('status', v);
              else params.delete('status');
              setSearchParams(params, { replace: true });
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 min-w-[140px]"
          >
            <option value="">All statuses</option>
            {Object.entries(SCHEDULE_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select
            value={fleetAssetIdParam}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams);
              const v = e.target.value;
              if (v) params.set('fleet_asset_id', v);
              else params.delete('fleet_asset_id');
              setSearchParams(params, { replace: true });
            }}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 min-w-[180px]"
          >
            <option value="">All assets</option>
            {assetsForFilter.map((a) => (
              <option key={a.id} value={a.id}>
                {a.unit_number ? `${a.unit_number} — ${a.name}` : a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* List - Schedule inspection button + table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0">
        <button
          type="button"
          onClick={() => setShowNewInspectionModal(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-0"
        >
          <div className="text-lg text-gray-400 mr-2">+</div>
          <div className="font-medium text-xs text-gray-700">Schedule inspection</div>
        </button>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading schedules...</div>
        ) : schedules.length > 0 ? (
          <>
            <div className="overflow-x-auto min-w-0">
              <table className="w-full min-w-0 border-collapse">
                <thead>
                  <tr className="text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left rounded-tl-lg">
                      <button type="button" onClick={() => setListSort('scheduled_at')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Date{sortBy === 'scheduled_at' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('asset')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Vehicle{sortBy === 'asset' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Body</th>
                    <th className="px-3 py-2 text-left">Mechanical</th>
                    <th className="px-3 py-2 text-right rounded-tr-lg">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => {
                    const bodyDone = s.body_result && s.body_result !== 'pending';
                    const mechDone = s.mechanical_result && s.mechanical_result !== 'pending';
                    return (
                      <tr
                        key={s.id}
                        onClick={() => nav(`/fleet/inspection-schedules/${s.id}`)}
                        className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors min-h-[52px] cursor-pointer"
                      >
                        <td className="px-3 py-3 text-xs font-medium text-gray-900 align-top whitespace-nowrap">
                          {s.scheduled_at ? formatDateLocal(new Date(s.scheduled_at)) : '—'}
                        </td>
                        <td className="px-3 py-3 align-top min-w-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              nav(`/fleet/assets/${s.fleet_asset_id}`);
                            }}
                            className="text-xs text-brand-red hover:underline text-left truncate block max-w-[200px]"
                          >
                            {s.fleet_asset_name || s.fleet_asset_id}
                          </button>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                              s.status === 'scheduled'
                                ? 'bg-blue-100 text-blue-800'
                                : s.status === 'in_progress'
                                  ? 'bg-amber-100 text-amber-800'
                                  : s.status === 'completed'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {SCHEDULE_STATUS_LABELS[s.status] ?? s.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top">
                          {s.body_inspection_id ? (
                            bodyDone ? (
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${INSPECTION_RESULT_COLORS[s.body_result!] || 'bg-gray-100 text-gray-800'}`}>
                                {INSPECTION_RESULT_LABELS[s.body_result!] ?? s.body_result}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">Pending</span>
                            )
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {s.mechanical_inspection_id ? (
                            mechDone ? (
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${INSPECTION_RESULT_COLORS[s.mechanical_result!] || 'bg-gray-100 text-gray-800'}`}>
                                {INSPECTION_RESULT_LABELS[s.mechanical_result!] ?? s.mechanical_result}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">Pending</span>
                            )
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              nav(`/fleet/inspection-schedules/${s.id}`);
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-xs text-gray-600">
                Showing 1 to {schedules.length} of {schedules.length} schedules
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-xs text-gray-500">
            No inspection schedules found
          </div>
        )}
      </div>

      {/* New Inspection Modal */}
      {showNewInspectionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setShowNewInspectionModal(false)}
        >
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowNewInspectionModal(false)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Schedule inspection</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create an appointment. Open it from the list to start Body and Mechanical inspections.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <InspectionScheduleForm
                formId="inspection-schedule-form-inspections-modal"
                onSuccess={(data) => {
                  setShowNewInspectionModal(false);
                  queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
                  queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
                  nav('/fleet/inspections');
                }}
                onCancel={() => setShowNewInspectionModal(false)}
                onValidationChange={(canSubmit, isPending) => {
                  setNewInspectionCanSubmit(canSubmit);
                  setNewInspectionIsPending(isPending);
                }}
              />
            </div>
            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowNewInspectionModal(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="inspection-schedule-form-inspections-modal"
                disabled={!newInspectionCanSubmit || newInspectionIsPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {newInspectionIsPending ? 'Scheduling...' : 'Schedule inspection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
