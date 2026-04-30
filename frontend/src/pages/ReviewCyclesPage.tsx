import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import CreateReviewCycleWizardModal from '@/components/CreateReviewCycleWizardModal';
import OverlayPortal from '@/components/OverlayPortal';

export default function ReviewCyclesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expandedCycleId, setExpandedCycleId] = useState<string>('');
  const [listQ, setListQ] = useState('');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<'all' | 'active' | 'draft' | 'archived'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'archived'>('all');

  const { data: templates = [] } = useQuery({
    queryKey: ['form-templates', 'employee_review'],
    queryFn: () =>
      api<any[]>('GET', '/form-templates?category=employee_review&sort=name&sort_dir=asc'),
  });
  const { data: cycles = [], refetch: refetchCycles } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<any[]>('GET', '/reviews/cycles'),
  });

  const sortedCycles = useMemo(() => {
    const arr = [...(cycles as any[])];
    arr.sort((a, b) => {
      const ta = a.period_start ? new Date(a.period_start).getTime() : 0;
      const tb = b.period_start ? new Date(b.period_start).getTime() : 0;
      return tb - ta;
    });
    return arr;
  }, [cycles]);

  const templateLabel = (id: string | null | undefined) => {
    if (!id) return 'Not set';
    const t = (templates as any[]).find((x: any) => String(x.id) === String(id));
    if (!t) return id.length > 8 ? `${id.slice(0, 8)}…` : id;
    const vl = (t.version_label || '').trim();
    return vl ? `${t.name} — ${vl}` : t.name;
  };

  const filteredCycles = useMemo(() => {
    const q = listQ.trim().toLowerCase();
    let rows = sortedCycles;
    if (q) {
      rows = rows.filter((c: any) => {
        const name = (c.name || '').toLowerCase();
        const ps = (c.period_start || '').toLowerCase();
        const pe = (c.period_end || '').toLowerCase();
        const form = templateLabel(c.form_template_id).toLowerCase();
        return name.includes(q) || ps.includes(q) || pe.includes(q) || form.includes(q);
      });
    }
    if (statusFilter !== 'all') {
      rows = rows.filter((c: any) => String(c.status || '').toLowerCase() === statusFilter);
    }
    return rows;
  }, [sortedCycles, listQ, statusFilter, templates]);

  const hasActiveFilters = statusFilter !== 'all';

  const { data: hrStatus = [] } = useQuery({
    queryKey: ['review-hr-status', expandedCycleId],
    queryFn: () => api<any[]>('GET', `/reviews/cycles/${expandedCycleId}/hr-status`),
    enabled: !!expandedCycleId,
  });

  const hrSummary = useMemo(() => {
    const rows = hrStatus as any[];
    if (!rows.length) return null;
    const both = rows.filter((r) => r.both_done).length;
    const missE = rows.filter((r) => r.missing_employee).length;
    const missS = rows.filter((r) => r.missing_supervisor).length;
    return { total: rows.length, both, missE, missS };
  }, [hrStatus]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const totalCount = sortedCycles.length;
  const visibleCount = filteredCycles.length;

  return (
    <div>
      {/* Title bar — Customers-style (title + Today) */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/reviews/admin')}
              className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center shrink-0"
              title="Back to status board"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Review cycles</div>
              <div className="text-xs text-gray-500 mt-0.5">
                History of review periods; generate assignments and track progress per cycle.
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Search + Filters — same bar as Customers */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-9 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150"
                placeholder="Search by cycle name, dates, or form template…"
                value={listQ}
                onChange={(e) => setListQ(e.target.value)}
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatusDraft(statusFilter);
              setFilterModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 transition-colors duration-150 whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors duration-150 whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* List card — Customers layout: dashed create + rows */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-col gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] w-full min-w-0 shrink-0"
          >
            <span className="text-lg text-gray-400 mr-2">+</span>
            <span className="font-medium text-xs text-gray-700">New review cycle</span>
          </button>

          {visibleCount > 0 ? (
            <ul className="divide-y divide-gray-100 border-t border-gray-100">
              {filteredCycles.map((c: any) => (
                <li key={c.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between">
                    <button
                      type="button"
                      onClick={() => navigate(`/reviews/cycles/${c.id}`)}
                      className="min-w-0 flex-1 text-left rounded-lg px-2 py-2 -mx-2 hover:bg-gray-100/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{c.name}</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            c.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : c.status === 'draft'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {c.status}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">Open details →</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {c.period_start || '—'} → {c.period_end || '—'}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        Form: <span className="font-medium text-gray-800">{templateLabel(c.form_template_id)}</span>
                        {c.template_by_department && Object.keys(c.template_by_department).length > 0 && (
                          <span className="text-gray-500">
                            {' '}
                            · {Object.keys(c.template_by_department).length} dept. mapping(s)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        {c.participant_scope?.mode === 'explicit' ? (
                          <>
                            Scope: {(c.participant_scope.user_ids || []).length} people ·{' '}
                            {(c.participant_scope.department_ids || []).length} HR dept. ·{' '}
                            {(c.participant_scope.project_division_ids || []).length} project div.
                          </>
                        ) : (
                          <>Participants: entire company</>
                        )}
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2 shrink-0 items-center lg:pl-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await api('POST', `/reviews/cycles/${c.id}/assign`, {});
                            toast.success('Review tasks created');
                            await refetchCycles();
                            await queryClient.invalidateQueries({ queryKey: ['review-hr-status', c.id] });
                          } catch {
                            toast.error('Could not create review tasks');
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-800 bg-white hover:bg-gray-50"
                      >
                        Create review tasks
                      </button>
                      <Link
                        to={`/reviews/compare?cycle=${encodeURIComponent(c.id)}`}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-800 bg-white hover:bg-gray-50 inline-block text-center"
                      >
                        Comparison
                      </Link>
                      <button
                        type="button"
                        onClick={() => setExpandedCycleId((v) => (v === c.id ? '' : c.id))}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800"
                      >
                        {expandedCycleId === c.id ? 'Hide progress' : 'Progress'}
                      </button>
                    </div>
                  </div>
                  {expandedCycleId === c.id && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
                      {hrSummary ? (
                        <p className="text-gray-700 mb-2">
                          <span className="font-semibold">{hrSummary.total}</span> reviewees with tasks ·{' '}
                          <span className="text-green-700">{hrSummary.both} both done</span>
                          {' · '}
                          <span className="text-amber-700">{hrSummary.missE} missing self</span>
                          {' · '}
                          <span className="text-amber-700">{hrSummary.missS} missing supervisor</span>
                        </p>
                      ) : (
                        <p className="text-gray-500">Loading…</p>
                      )}
                      <Link to="/reviews/admin" className="text-brand-red text-xs font-medium hover:underline">
                        Open full status table
                      </Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : totalCount > 0 ? (
            <div className="p-8 text-center text-xs text-gray-500 border-t border-gray-100">
              No cycles match your search or filters.
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-gray-500 border-t border-gray-100">
              No review cycles yet. Use the button above to create one.
            </div>
          )}
        </div>

        {totalCount > 0 && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-600">
              {visibleCount === totalCount
                ? `${totalCount} review cycle${totalCount === 1 ? '' : 's'}`
                : `Showing ${visibleCount} of ${totalCount} cycles`}
            </div>
          </div>
        )}
      </div>

      <CreateReviewCycleWizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} />

      {filterModalOpen && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cycle-filters-title"
            onClick={() => setFilterModalOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="cycle-filters-title" className="text-sm font-semibold text-gray-900 mb-3">
                Filters
              </h2>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Status</div>
              <div className="flex flex-col gap-2 mb-4">
                {(['all', 'active', 'draft', 'archived'] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer text-sm text-gray-800">
                    <input
                      type="radio"
                      name="cycleStatusFilter"
                      checked={statusDraft === v}
                      onChange={() => setStatusDraft(v)}
                    />
                    {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFilterModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter(statusDraft);
                    setFilterModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-red text-white hover:bg-[#aa1212]"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
