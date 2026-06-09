import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { formatReviewPeriodRange } from '@/lib/dateUtils';
import CreateReviewCycleWizardModal from '@/components/CreateReviewCycleWizardModal';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppModal,
  AppPageHeader,
  AppSelect,
  uiColors,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

function cycleStatusVariant(status: string | null | undefined): 'success' | 'warning' | 'neutral' {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'success';
  if (s === 'draft') return 'warning';
  return 'neutral';
}

function statusLabel(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase();
  if (!s) return 'Unknown';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
] as const;

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

  const pageSubtitle =
    totalCount > 0
      ? `Each cycle is a review period: assign forms, track self- and supervisor reviews, and director 1:1s. You have ${totalCount} cycle${totalCount === 1 ? '' : 's'} in total.`
      : 'Each cycle is a review period: assign forms, track self- and supervisor reviews, and director 1:1s.';

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Review cycles"
        subtitle={pageSubtitle}
        icon={<Calendar className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              id="review-cycles-search"
              placeholder="Search by name, form, or dates…"
              value={listQ}
              onChange={(e) => setListQ(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search cycles"
            />
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal className="h-4 w-4" />}
            onClick={() => {
              setStatusDraft(statusFilter);
              setFilterModalOpen(true);
            }}
          >
            Filters
          </AppButton>
          {hasActiveFilters ? (
            <AppButton type="button" variant="ghost" size="sm" onClick={() => setStatusFilter('all')}>
              Clear filters
            </AppButton>
          ) : null}
        </div>
      </AppCard>

      <AppCard className={uiShadows.card} bodyClassName="!p-0">
        <div className="flex flex-col">
          <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100 pb-2 pt-2')}>
            <AppListCreateItem layout="row" label="New review cycle" className="w-full" onClick={() => setWizardOpen(true)} />
          </div>
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
                        className="w-full px-4 py-4 text-left transition-colors hover:bg-gray-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300 sm:px-5 sm:py-4"
                      >
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                          <span className={uiTypography.sectionTitle}>{c.name || 'Untitled cycle'}</span>
                          <AppBadge variant={cycleStatusVariant(c.status)}>{statusLabel(c.status)}</AppBadge>
                        </div>
                        <div className="mt-2 flex items-start gap-2 text-sm text-gray-600">
                          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                          <span className="leading-snug">{formatReviewPeriodRange(c.period_start, c.period_end)}</span>
                        </div>
                        <div className={uiCx('mt-2', uiTypography.helper)}>
                          <span className="text-gray-500">Form template</span>{' '}
                          <span className={uiColors.textStrong}>{templateLabel(c.form_template_id)}</span>
                          {deptMaps > 0 ? (
                            <span className="text-gray-500">
                              {' '}
                              · {deptMaps} department-specific form{deptMaps === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </div>
                        <div className={uiCx('mt-1.5 leading-relaxed', uiTypography.helper)}>
                          <span className="text-gray-500">Who is included</span> — {scopeLine}
                        </div>
                        <div className={uiCx('mt-2 font-medium text-brand-red', uiTypography.helper)}>Open cycle</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : totalCount > 0 ? (
              <div className={uiCx(uiSpacing.cardPadding, 'pb-10')}>
                <AppEmptyState
                  title="No matching cycles"
                  description="No cycles match your search or filters. Try clearing filters or changing your search."
                />
              </div>
            ) : (
              <div className={uiCx(uiSpacing.cardPadding, 'pb-10')}>
                <AppEmptyState
                  title="No review cycles yet"
                  description={
                    <>
                      You have not created a review cycle yet. Tap{' '}
                      <span className={uiColors.textStrong}>New review cycle</span> at the top of this list to run the
                      setup wizard.
                    </>
                  }
                />
              </div>
            )}
          </div>

          {totalCount > 0 && (
            <div className={uiCx('flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-4 py-3', uiTypography.helper)}>
              <div className="text-gray-600">
                {visibleCount === totalCount
                  ? `${totalCount} review cycle${totalCount === 1 ? '' : 's'}`
                  : `Showing ${visibleCount} of ${totalCount} cycles`}
              </div>
            </div>
          )}
        </div>
      </AppCard>

      <CreateReviewCycleWizardModal open={wizardOpen} onClose={() => setWizardOpen(false)} />

      <AppModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        title="Filters"
        size="sm"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton variant="secondary" onClick={() => setFilterModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton
              onClick={() => {
                setStatusFilter(statusDraft);
                setFilterModalOpen(false);
              }}
            >
              Apply
            </AppButton>
          </div>
        }
      >
        <AppSelect
          label="Status"
          value={statusDraft}
          onChange={(e) => setStatusDraft(e.target.value as typeof statusDraft)}
          options={[...STATUS_FILTER_OPTIONS]}
        />
      </AppModal>
    </div>
  );
}
