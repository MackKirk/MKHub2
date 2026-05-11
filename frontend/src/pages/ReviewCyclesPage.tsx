import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatReviewPeriodRange } from '@/lib/dateUtils';
import CreateReviewCycleWizardModal from '@/components/CreateReviewCycleWizardModal';
import OverlayPortal from '@/components/OverlayPortal';

function CalendarCyclesIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function statusLabel(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase();
  if (!s) return 'Unknown';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ReviewCyclesPage() {
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [listQ, setListQ] = useState('');
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<'all' | 'active' | 'draft' | 'archived'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'archived'>('all');

  const { data: templates = [] } = useQuery({
    queryKey: ['form-templates', 'employee_review'],
    queryFn: () =>
      api<any[]>('GET', '/form-templates?category=employee_review&sort=name&sort_dir=asc'),
  });
  const { data: cycles = [] } = useQuery({
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

  /** Same dashed “New …” pattern as Form templates / Opportunities. */
  const newReviewCycleButton = (
    <button
      type="button"
      onClick={() => setWizardOpen(true)}
      className="w-full border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all bg-white flex items-center justify-center min-h-[60px]"
    >
      <span className="text-lg text-gray-400 mr-2 leading-none" aria-hidden>
        +
      </span>
      <span className="font-medium text-xs text-gray-700">New review cycle</span>
    </button>
  );

  return (
    <div className="space-y-4 pb-8">
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
              <CalendarCyclesIcon className="w-5 h-5 text-purple-700" />
            </div>
            <div className="min-w-0">
              <h5 className="text-sm font-semibold text-purple-900">Review cycles</h5>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                Each cycle is a review period: assign forms, track self- and supervisor reviews, and director 1:1s.
                {totalCount > 0 ? ` You have ${totalCount} cycle${totalCount === 1 ? '' : 's'} in total.` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-end shrink-0">
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="sr-only" htmlFor="review-cycles-search">
          Search cycles
        </label>
        <div className="relative max-w-xl">
          <input
            id="review-cycles-search"
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            placeholder="Search by name, form, or dates…"
            value={listQ}
            onChange={(e) => setListQ(e.target.value)}
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setStatusDraft(statusFilter);
              setFilterModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-colors whitespace-nowrap"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-2 border-b border-gray-100 bg-white">{newReviewCycleButton}</div>
        <div className="flex flex-col">
          {visibleCount > 0 ? (
            <ul>
              {filteredCycles.map((c: any) => {
                const nPeople = (c.participant_scope?.user_ids || []).length;
                const nDepts = (c.participant_scope?.department_ids || []).length;
                const nDivs = (c.participant_scope?.project_division_ids || []).length;
                const deptMaps = c.template_by_department ? Object.keys(c.template_by_department).length : 0;
                const scopeLine =
                  c.participant_scope?.mode === 'explicit'
                    ? [
                        nPeople ? `${nPeople} participant${nPeople === 1 ? '' : 's'}` : null,
                        nDepts ? `${nDepts} department${nDepts === 1 ? '' : 's'}` : null,
                        nDivs ? `${nDivs} project division${nDivs === 1 ? '' : 's'}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Custom scope (empty selection)'
                    : 'Everyone in the company';

                return (
                  <li key={c.id} className="border-b border-gray-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => navigate(`/reviews/cycles/${c.id}`)}
                      className="w-full text-left px-4 py-4 sm:px-5 sm:py-4 hover:bg-gray-50/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300"
                    >
                      <div className="flex flex-wrap items-center gap-2 gap-y-1">
                        <span className="text-sm font-semibold text-gray-900">{c.name || 'Untitled cycle'}</span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${
                            c.status === 'active'
                              ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                              : c.status === 'draft'
                                ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-100'
                                : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200/80'
                          }`}
                        >
                          {statusLabel(c.status)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-start gap-2 text-sm text-gray-600">
                        <svg
                          className="w-4 h-4 text-gray-400 shrink-0 mt-0.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span className="leading-snug">{formatReviewPeriodRange(c.period_start, c.period_end)}</span>
                      </div>
                      <div className="mt-2 text-xs text-gray-600">
                        <span className="text-gray-500">Form template</span>{' '}
                        <span className="font-medium text-gray-900">{templateLabel(c.form_template_id)}</span>
                        {deptMaps > 0 ? (
                          <span className="text-gray-500">
                            {' '}
                            · {deptMaps} department-specific form{deptMaps === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                        <span className="text-gray-500">Who is included</span> — {scopeLine}
                      </div>
                      <div className="mt-2 text-xs font-medium text-brand-red">Open cycle</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : totalCount > 0 ? (
            <div className="p-10 text-center text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
              No cycles match your search or filters. Try clearing filters or changing your search.
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
              You have not created a review cycle yet. Tap <span className="font-semibold text-gray-800">New review cycle</span>{' '}
              at the top of this list to run the setup wizard.
            </div>
          )}
        </div>

        {totalCount > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
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
              className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                <h2 id="cycle-filters-title" className="text-sm font-semibold text-gray-900">
                  Filters
                </h2>
              </div>
              <div className="p-4">
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Status</div>
                <div className="flex flex-col gap-2 mb-4">
                  {(['all', 'active', 'draft', 'archived'] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer text-xs text-gray-800">
                      <input
                        type="radio"
                        name="cycleStatusFilter"
                        className="border-gray-300"
                        checked={statusDraft === v}
                        onChange={() => setStatusDraft(v)}
                      />
                      {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setFilterModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter(statusDraft);
                      setFilterModalOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-red text-white transition-colors hover:bg-[#aa1212]"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
