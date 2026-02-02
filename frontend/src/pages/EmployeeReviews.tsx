import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ReviewTemplatesTab from './ReviewTemplatesTab';
import ReviewCyclesTab from './ReviewCyclesTab';
import ReviewsCompare from './ReviewsCompare';

type TabId = 'status' | 'templates' | 'cycles' | 'compare';

export default function EmployeeReviews() {
  const [tab, setTab] = useState<TabId>('status');
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const myUserId = me?.id != null ? String(me.id) : '';
  const { data: cycles } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<any[]>('GET', '/reviews/cycles'),
  });
  const [cycleId, setCycleId] = useState<string>('');
  const { data: hrStatus = [] } = useQuery({
    queryKey: ['review-hr-status', cycleId],
    queryFn: () => api<any[]>('GET', `/reviews/cycles/${cycleId}/hr-status`),
    enabled: !!cycleId,
  });
  const [filter, setFilter] = useState<'all' | 'missing_employee' | 'missing_supervisor' | 'both_done'>('all');

  const filteredRows = useMemo(() => {
    if (filter === 'all') return hrStatus;
    if (filter === 'missing_employee') return hrStatus.filter((r: any) => r.missing_employee);
    if (filter === 'missing_supervisor') return hrStatus.filter((r: any) => r.missing_supervisor);
    if (filter === 'both_done') return hrStatus.filter((r: any) => r.both_done);
    return hrStatus;
  }, [hrStatus, filter]);

  const activeCycles = useMemo(() => (cycles || []).filter((c: any) => c.status === 'active'), [cycles]);
  const myStatusRow = useMemo(
    () => (hrStatus as any[]).find((r: any) => r.user_id === myUserId),
    [hrStatus, myUserId]
  );
  const canStartMyReview = !!myUserId && !!myStatusRow?.both_done;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'status', label: 'Status by employee' },
    { id: 'templates', label: 'Templates' },
    { id: 'cycles', label: 'Cycles' },
    { id: 'compare', label: 'Comparison' },
  ];

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-2 border-b border-gray-200 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-brand-red text-brand-red bg-white'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'status' && (
        <div>
          <h1 className="text-xl font-bold text-gray-900 mb-3">Employee Review Status</h1>
          <p className="text-sm text-gray-600 mb-4">
            Select an active cycle to see who has completed their self-review and who has received their supervisor review.
          </p>
          {canStartMyReview && (
            <div className="mb-4 p-4 rounded-xl border border-green-200 bg-green-50 text-green-800">
              <p className="text-sm font-medium mb-1">Your employee and supervisor reviews are complete.</p>
              <p className="text-sm mb-2">You can start your admin review now.</p>
              <Link
                to="/reviews/my"
                className="inline-block px-3 py-2 rounded-lg bg-brand-red text-white text-sm font-medium hover:opacity-90"
              >
                Start my review
              </Link>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="text-sm font-medium text-gray-700">Cycle</label>
            <select
              className="border rounded px-3 py-2 text-sm"
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
            >
              <option value="">Select cycle...</option>
              {(activeCycles.length ? activeCycles : cycles || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.status === 'active' ? '(active)' : ''}
                </option>
              ))}
            </select>
            {cycleId && (
              <>
                <span className="text-sm text-gray-500">Filter</span>
                <select
                  className="border rounded px-3 py-2 text-sm"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as typeof filter)}
                >
                  <option value="all">All employees</option>
                  <option value="missing_employee">Missing employee review</option>
                  <option value="missing_supervisor">Missing supervisor review</option>
                  <option value="both_done">Both done</option>
                </select>
              </>
            )}
          </div>
          {cycleId ? (
            <div className="rounded-xl border bg-white overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Employee</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Employee did review</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Supervisor did review</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-sm text-gray-500 text-center">
                        No employees in this cycle or no matches for the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r: any) => (
                      <tr key={r.user_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">{r.name || r.user_id}</td>
                        <td className="px-4 py-2 text-sm">{r.employee_self_done ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2 text-sm">{r.supervisor_done ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-2 text-sm">
                          {r.both_done ? (
                            <span className="text-green-600 font-medium">Both done</span>
                          ) : r.missing_employee ? (
                            <span className="text-amber-600">Missing employee</span>
                          ) : r.missing_supervisor ? (
                            <span className="text-amber-600">Missing supervisor</span>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border bg-white p-6 text-gray-500 text-sm">
              Select a cycle to view status.
            </div>
          )}
        </div>
      )}

      {tab === 'templates' && <ReviewTemplatesTab />}
      {tab === 'cycles' && <ReviewCyclesTab />}
      {tab === 'compare' && <ReviewsCompare />}
    </div>
  );
}
