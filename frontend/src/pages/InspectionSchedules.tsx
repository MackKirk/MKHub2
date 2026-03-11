import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { SCHEDULE_STATUS_LABELS, URGENCY_LABELS, CATEGORY_LABELS, INSPECTION_RESULT_LABELS } from '@/lib/fleetBadges';

type Schedule = {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string;
  scheduled_at: string;
  urgency: string;
  category: string;
  status: string;
  notes?: string;
  created_at: string;
  body_inspection_id?: string | null;
  mechanical_inspection_id?: string | null;
  body_result?: string | null;
  mechanical_result?: string | null;
};

export default function InspectionSchedules() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['inspection-schedules', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const list = await api<Schedule[]>('GET', `/fleet/inspection-schedules?${params.toString()}`);
      return list;
    },
  });

  const startBodyMutation = useMutation({
    mutationFn: (scheduleId: string) =>
      api<{ body_inspection_id: string }>('POST', `/fleet/inspection-schedules/${scheduleId}/start-body`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      nav(`/fleet/inspections/${data.body_inspection_id}`);
    },
    onError: () => {
      toast.error('Failed to open body inspection');
    },
  });

  const startMechanicalMutation = useMutation({
    mutationFn: (scheduleId: string) =>
      api<{ mechanical_inspection_id: string }>('POST', `/fleet/inspection-schedules/${scheduleId}/start-mechanical`),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      nav(`/fleet/inspections/${data.mechanical_inspection_id}`);
    },
    onError: () => {
      toast.error('Failed to open mechanical inspection');
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (scheduleId: string) => api('DELETE', `/fleet/inspection-schedules/${scheduleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
      toast.success('Schedule deleted');
    },
    onError: () => toast.error('Failed to delete schedule'),
  });

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-900">Inspection schedules</div>
            <div className="text-xs text-gray-500 mt-0.5">Each schedule has Body and Mechanical inspections (created when you add the schedule). Open them to fill the checklist. If result is Fail, a work order is generated.</div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
            >
              <option value="">All statuses</option>
              {Object.entries(SCHEDULE_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button
              onClick={() => nav('/fleet/inspections/new')}
              className="px-3 py-2 text-sm font-medium text-white bg-brand-red rounded-lg hover:bg-red-700 transition-colors"
            >
              New schedule
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading schedules...</div>
        ) : schedules.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Vehicle</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Urgency</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Progress</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schedules.map((s) => {
                  const bodyDone = s.body_result && s.body_result !== 'pending';
                  const mechDone = s.mechanical_result && s.mechanical_result !== 'pending';
                  return (
                    <tr key={s.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-900">{formatDateLocal(new Date(s.scheduled_at))}</td>
                      <td className="px-4 py-3 text-gray-900">{s.fleet_asset_name || s.fleet_asset_id}</td>
                      <td className="px-4 py-3 text-gray-600">{CATEGORY_LABELS[s.category] ?? s.category}</td>
                      <td className="px-4 py-3 text-gray-600">{URGENCY_LABELS[s.urgency] ?? s.urgency}</td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <span className="mr-2">Body: {s.body_inspection_id ? (bodyDone ? INSPECTION_RESULT_LABELS[s.body_result!] ?? s.body_result : 'Pending') : '—'}</span>
                        <span>Mech: {s.mechanical_inspection_id ? (mechDone ? INSPECTION_RESULT_LABELS[s.mechanical_result!] ?? s.mechanical_result : 'Pending') : '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {(s.status === 'scheduled' || s.status === 'in_progress') && (
                            <>
                              {s.body_inspection_id ? (
                                <button
                                  type="button"
                                  onClick={() => nav(`/fleet/inspections/${s.body_inspection_id}`)}
                                  className="px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                                >
                                  Open Body
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startBodyMutation.mutate(s.id)}
                                  disabled={startBodyMutation.isPending || startMechanicalMutation.isPending}
                                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {startBodyMutation.isPending ? 'Opening...' : 'Body / Exterior'}
                                </button>
                              )}
                              {s.mechanical_inspection_id ? (
                                <button
                                  type="button"
                                  onClick={() => nav(`/fleet/inspections/${s.mechanical_inspection_id}`)}
                                  className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                  Open Mechanical
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startMechanicalMutation.mutate(s.id)}
                                  disabled={startBodyMutation.isPending || startMechanicalMutation.isPending}
                                  className="px-3 py-1.5 text-sm font-medium text-white bg-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                                >
                                  {startMechanicalMutation.isPending ? 'Opening...' : 'Mechanical'}
                                </button>
                              )}
                            </>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => window.confirm('Delete this schedule permanently? Linked inspections will also be removed.') && deleteScheduleMutation.mutate(s.id)}
                              disabled={deleteScheduleMutation.isPending}
                              className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                            >
                              {deleteScheduleMutation.isPending ? 'Deleting…' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">No inspection schedules found. Create one from Inspections or the button above.</div>
        )}
      </div>
    </div>
  );
}
