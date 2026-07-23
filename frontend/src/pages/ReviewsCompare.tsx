import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, GitCompare, PenLine, Save, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppSectionHeader,
  AppSelect,
  AppTable,
  AppTextarea,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { useNavigateBack } from '@/hooks/useNavigateBack';

/** Answers may be strings/scalars or composite objects (e.g. yes_no_na `{ status, comments }`). */
function formatAnswerForCompare(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (typeof o.status === 'string') {
      const parts = [o.status];
      const c = o.comments;
      if (typeof c === 'string' && c.trim()) parts.push(c.trim());
      return parts.join(' · ');
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '[value]';
    }
  }
  if (Array.isArray(value)) return value.map((x) => formatAnswerForCompare(x)).filter(Boolean).join(', ');
  return String(value);
}

function extractNumericScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '1' || s === '2' || s === '3' || s === '4' || s === '5') return parseInt(s, 10);
  }
  return null;
}

function formatTenure(hireDateIso: string | null | undefined): string | null {
  if (!hireDateIso) return null;
  const d = new Date(hireDateIso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const m = months % 12;
  if (years <= 0) return `${m} mo`;
  return `${years} yrs ${m} m`;
}

function submissionStatusVariant(status: string | null | undefined): 'success' | 'neutral' {
  return String(status || '').toLowerCase() === 'submitted' ? 'success' : 'neutral';
}

const RATING_LEGEND: { n: number; title: string; desc: string }[] = [
  { n: 5, title: 'Outstanding', desc: 'Goes above and beyond' },
  { n: 4, title: 'Above Average', desc: 'Often exceeds expectations' },
  { n: 3, title: 'Meets Expectations', desc: 'Reliable and consistent' },
  { n: 2, title: 'Needs Improvement', desc: 'Requires closer supervision' },
  { n: 1, title: 'Not Meeting Standards', desc: 'Unsafe or unprofessional' },
];

const SUBMISSION_STATUS_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'pending', label: 'Pending' },
] as const;

type CompareCell = {
  key: string;
  label: string;
  field_type?: string;
  section_title?: string;
  self: unknown;
  manager: unknown;
};

function meetingNotesStorageKey(cycleId: string, revieweeId: string) {
  return `reviews-compare-meeting:${cycleId}:${revieweeId}`;
}

function averageScaleBlock(comparison: CompareCell[]) {
  const selfScores: number[] = [];
  const mgrScores: number[] = [];
  for (const c of comparison) {
    if (c.field_type !== 'scale_1_5') continue;
    const s = extractNumericScore(c.self);
    const m = extractNumericScore(c.manager);
    if (s != null) selfScores.push(s);
    if (m != null) mgrScores.push(m);
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return {
    selfAvg: avg(selfScores),
    mgrAvg: avg(mgrScores),
    scaleCount: Math.max(selfScores.length, mgrScores.length),
  };
}

function compareAnswerCellClass(diff: boolean) {
  return uiCx(
    uiRadius.card,
    'border px-3 py-2.5 text-center',
    diff ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-gray-50/50',
  );
}

export default function ReviewsCompare() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramCycle = searchParams.get('cycle') || '';
  const paramReviewee = searchParams.get('reviewee') || '';
  const { data: cycles } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<any[]>('GET', '/reviews/cycles'),
  });
  const [cycleId, setCycleId] = useState<string>(paramCycle);

  const compareBackFallback = useMemo(
    () =>
      cycleId
        ? `/reviews/cycles/${encodeURIComponent(cycleId)}`
        : '/reviews/cycles',
    [cycleId],
  );
  const navigateBackFromCompare = useNavigateBack(compareBackFallback);

  useEffect(() => {
    const c = searchParams.get('cycle') || '';
    if (c) setCycleId(c);
  }, [searchParams]);

  const { data: rows } = useQuery({
    queryKey: ['review-compare', cycleId],
    queryFn: () =>
      cycleId ? api<any[]>('GET', `/reviews/cycles/${cycleId}/compare`) : Promise.resolve([]),
  });

  const [q, setQ] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [selfStatus, setSelfStatus] = useState<string>('');
  const [mgrStatus, setMgrStatus] = useState<string>('');
  const [otherOpen, setOtherOpen] = useState(true);

  const cycleOptions = useMemo(
    () => [
      { value: '', label: 'Select…' },
      ...sortByLabel(cycles || [], (c: any) => (c.name || '').toString()).map((c: any) => ({
        value: String(c.id),
        label: String(c.name || c.id),
      })),
    ],
    [cycles],
  );

  const filteredRows = useMemo(() => {
    return (rows || []).filter((r: any) => {
      if (paramReviewee && String(r.reviewee_user_id) !== paramReviewee) return false;
      if (!q.trim()) return true;
      const name = String(r.reviewee_name || '').toLowerCase();
      return name.includes(q.toLowerCase());
    });
  }, [rows, q, paramReviewee]);

  const visibleCompareRows = useMemo(() => {
    return (rows || [])
      .filter((r: any) => {
        if (!q.trim()) return true;
        const name = String(r.reviewee_name || '').toLowerCase();
        return name.includes(q.toLowerCase());
      })
      .filter((r: any) => {
        const hasDiff = (r.comparison || []).some((c: any) => {
          return formatAnswerForCompare(c.self) !== formatAnswerForCompare(c.manager);
        });
        if (onlyDiff && !hasDiff) return false;
        if (selfStatus && (r.self_status || 'pending') !== selfStatus) return false;
        if (mgrStatus && (r.manager_status || 'pending') !== mgrStatus) return false;
        return true;
      });
  }, [rows, q, onlyDiff, selfStatus, mgrStatus]);

  const focusRow = useMemo(() => {
    if (!paramReviewee || !filteredRows.length) return null;
    return filteredRows.find((r: any) => String(r.reviewee_user_id) === paramReviewee) || null;
  }, [paramReviewee, filteredRows]);

  const { data: directoryCard } = useQuery({
    queryKey: ['employee-directory-card', paramReviewee],
    queryFn: () => api<any>('GET', `/employees/${encodeURIComponent(paramReviewee)}/directory-card`),
    enabled: Boolean(paramReviewee && cycleId),
  });

  const [meetingNotes, setMeetingNotes] = useState('');

  useEffect(() => {
    if (!cycleId || !paramReviewee) {
      setMeetingNotes('');
      return;
    }
    try {
      const raw = localStorage.getItem(meetingNotesStorageKey(cycleId, paramReviewee));
      setMeetingNotes(raw || '');
    } catch {
      setMeetingNotes('');
    }
  }, [cycleId, paramReviewee]);

  const saveMeetingNotes = useCallback(() => {
    if (!cycleId || !paramReviewee) return;
    try {
      localStorage.setItem(meetingNotesStorageKey(cycleId, paramReviewee), meetingNotes);
    } catch {
      /* ignore */
    }
  }, [cycleId, paramReviewee, meetingNotes]);



  const setCycleInUrl = (id: string) => {
    setCycleId(id);
    if (id) {
      const next = new URLSearchParams();
      next.set('cycle', id);
      if (paramReviewee) next.set('reviewee', paramReviewee);
      setSearchParams(next, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const openReviewee = (uid: string) => {
    const next = new URLSearchParams();
    if (cycleId) next.set('cycle', cycleId);
    next.set('reviewee', uid);
    setSearchParams(next, { replace: true });
  };

  const clearReviewee = () => {
    const next = new URLSearchParams();
    if (cycleId) next.set('cycle', cycleId);
    setSearchParams(next, { replace: true });
  };

  const handlePageBack = () => {
    if (paramReviewee) {
      clearReviewee();
      return;
    }
    navigateBackFromCompare();
  };

  const comparison: CompareCell[] = focusRow?.comparison || [];
  const { selfAvg, mgrAvg, scaleCount } = useMemo(
    () => averageScaleBlock(comparison),
    [comparison],
  );

  const scaleRowsBySection = useMemo(() => {
    const map = new Map<string, CompareCell[]>();
    for (const c of comparison) {
      if (c.field_type !== 'scale_1_5') continue;
      const sec = (c.section_title || 'Work standards').trim() || 'Work standards';
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(c);
    }
    return map;
  }, [comparison]);

  const otherRows = useMemo(
    () => comparison.filter((c) => c.field_type !== 'scale_1_5'),
    [comparison],
  );

  const diffSummary = useMemo(() => {
    if (selfAvg == null || mgrAvg == null) return null;
    const d = selfAvg - mgrAvg;
    if (Math.abs(d) < 0.001) return 'Self and supervisor averages match.';
    if (d > 0)
      return `Difference: Employee scored ${d.toFixed(2)} point${d === 1 ? '' : 's'} higher`;
    return `Difference: Supervisor scored ${Math.abs(d).toFixed(2)} point${Math.abs(d) === 1 ? '' : 's'} higher`;
  }, [selfAvg, mgrAvg]);

  const ratingLegendRows = useMemo(
    () =>
      RATING_LEGEND.map((row) => [
        <span key={`n-${row.n}`} className="font-bold tabular-nums text-brand-red">
          {row.n}
        </span>,
        <span key={`t-${row.n}`}>
          <span className={uiCx('font-semibold', uiColors.textStrong)}>{row.title}</span>
          <span className="text-gray-500"> — {row.desc}</span>
        </span>,
      ]),
    [],
  );

  const quickTableRows = useMemo(
    () =>
      visibleCompareRows.map((r: any) => [
        <span key={`${r.reviewee_user_id}-name`} className={uiCx('font-medium', uiColors.textStrong)}>
          {r.reviewee_name || r.reviewee_user_id}
        </span>,
        <span key={`${r.reviewee_user_id}-status`} className={uiTypography.helper}>
          Self: {r.self_status || 'pending'} · Mgr: {r.manager_status || 'pending'}
        </span>,
        <AppButton
          key={`${r.reviewee_user_id}-open`}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => openReviewee(String(r.reviewee_user_id))}
        >
          Meeting view →
        </AppButton>,
      ]),
    [visibleCompareRows],
  );

  const pageTitle = paramReviewee && focusRow
    ? focusRow.reviewee_name || focusRow.reviewee_user_id
    : 'Reviews comparison';

  const pageSubtitle = paramReviewee && focusRow
    ? `Self ${focusRow.self_status || '—'} · Manager ${focusRow.manager_status || '—'}`
    : 'Self vs supervisor side-by-side — pick a cycle, then open an employee for the meeting view.';

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        onBack={handlePageBack}
        backLabel={paramReviewee ? 'All employees in cycle' : 'Back'}
        icon={<GitCompare className="h-4 w-4" />}
        title={pageTitle}
        subtitle={pageSubtitle}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <span className={uiCx(uiTypography.overline, 'shrink-0 leading-none')}>Cycle</span>
            <AppSelect
              value={cycleId}
              onChange={(e) => setCycleInUrl(e.target.value)}
              options={cycleOptions}
              triggerClassName="min-w-[12rem]"
            />
          </div>
          {!paramReviewee ? (
            <>
              <div className="min-w-0 flex-1 basis-48">
                <AppInput
                  placeholder="Search by name"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  leftIcon={<Search className="h-4 w-4" />}
                  aria-label="Search by name"
                />
              </div>
              <AppCheckbox
                label="Only differences"
                checked={onlyDiff}
                onChange={setOnlyDiff}
                className="!items-center shrink-0"
              />
              <div className="flex items-center gap-2">
                <span className={uiCx(uiTypography.overline, 'shrink-0 leading-none')}>Self</span>
                <AppSelect
                  value={selfStatus}
                  onChange={(e) => setSelfStatus(e.target.value)}
                  options={[...SUBMISSION_STATUS_OPTIONS]}
                  triggerClassName="min-w-[8rem]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className={uiCx(uiTypography.overline, 'shrink-0 leading-none')}>Mgr</span>
                <AppSelect
                  value={mgrStatus}
                  onChange={(e) => setMgrStatus(e.target.value)}
                  options={[...SUBMISSION_STATUS_OPTIONS]}
                  triggerClassName="min-w-[8rem]"
                />
              </div>
            </>
          ) : null}
        </div>
      </AppCard>

      {!cycleId ? (
        <AppEmptyState
          title="Select a review cycle"
          description="Select a review cycle to load comparisons."
        />
      ) : paramReviewee && focusRow ? (
        <div className={uiCx(uiLayout.pageTwoColumn, 'items-start gap-6')}>
          <div className={uiCx('min-w-0', uiSpacing.sectionStack)}>
            <AppCard className="bg-gradient-to-br from-sky-50/80 to-white" bodyClassName={uiSpacing.sectionStack}>
              <AppSectionHeader title="Overall scores" />
              {scaleCount === 0 ? (
                <p className={uiTypography.body}>
                  No 1–5 scale questions in this form snapshot — add{' '}
                  <span className="font-medium">scale 1–5</span> fields to see averages here.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AppCard bodyClassName={uiSpacing.cardPadding}>
                      <div className={uiTypography.helper}>Employee self-review</div>
                      <div className={uiCx('text-2xl font-bold tabular-nums', uiColors.textStrong)}>
                        {selfAvg != null ? `${selfAvg.toFixed(2)}` : '—'}
                        <span className="text-base font-semibold text-gray-400">/5.00</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-sky-500 transition-all"
                          style={{ width: `${selfAvg != null ? (selfAvg / 5) * 100 : 0}%` }}
                        />
                      </div>
                    </AppCard>
                    <AppCard bodyClassName={uiSpacing.cardPadding}>
                      <div className={uiTypography.helper}>Supervisor review</div>
                      <div className={uiCx('text-2xl font-bold tabular-nums', uiColors.textStrong)}>
                        {mgrAvg != null ? `${mgrAvg.toFixed(2)}` : '—'}
                        <span className="text-base font-semibold text-gray-400">/5.00</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all"
                          style={{ width: `${mgrAvg != null ? (mgrAvg / 5) * 100 : 0}%` }}
                        />
                      </div>
                    </AppCard>
                  </div>
                  {diffSummary ? <p className={uiTypography.helper}>{diffSummary}</p> : null}
                </>
              )}
            </AppCard>

            {Array.from(scaleRowsBySection.entries()).map(([section, cells]) => (
              <AppCard key={section} bodyClassName={uiSpacing.sectionStack}>
                <AppSectionHeader title={section} />
                <ul className={uiSpacing.sectionStack}>
                  {cells.map((c) => {
                    const selfN = extractNumericScore(c.self);
                    const mgrN = extractNumericScore(c.manager);
                    const diff = selfN != null && mgrN != null && selfN !== mgrN;
                    return (
                      <li key={c.key}>
                        <div className={uiCx(uiTypography.body, 'mb-2 font-medium', uiColors.textStrong)}>
                          {c.label}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className={compareAnswerCellClass(diff)}>
                            <div className={uiTypography.overline}>Self</div>
                            <div className={uiCx('text-lg font-semibold tabular-nums', uiColors.textStrong)}>
                              {(selfN ?? formatAnswerForCompare(c.self)) || '—'}
                            </div>
                          </div>
                          <div className={compareAnswerCellClass(diff)}>
                            <div className={uiTypography.overline}>Supervisor</div>
                            <div className={uiCx('text-lg font-semibold tabular-nums', uiColors.textStrong)}>
                              {(mgrN ?? formatAnswerForCompare(c.manager)) || '—'}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </AppCard>
            ))}

            {otherRows.length > 0 ? (
              <AppCard bodyClassName="!p-0">
                <button
                  type="button"
                  onClick={() => setOtherOpen((v) => !v)}
                  className={uiCx(
                    'flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50',
                    uiTypography.body,
                    'font-semibold',
                    uiColors.textStrong,
                  )}
                >
                  Other responses
                  {otherOpen ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden />
                  )}
                </button>
                {otherOpen ? (
                  <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack, 'border-t border-gray-100')}>
                    {otherRows.map((c) => {
                      const diff =
                        formatAnswerForCompare(c.self) !== formatAnswerForCompare(c.manager);
                      return (
                        <div
                          key={c.key}
                          className={uiCx(
                            uiRadius.card,
                            'border p-3',
                            diff ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100',
                          )}
                        >
                          <div className={uiCx(uiTypography.body, 'mb-2 font-medium', uiColors.textStrong)}>
                            {c.label}
                          </div>
                          <div className="grid gap-3 text-sm md:grid-cols-2">
                            <div>
                              <div className={uiCx(uiTypography.overline, 'mb-1')}>Self</div>
                              <div className="whitespace-pre-wrap break-words text-gray-800">
                                {formatAnswerForCompare(c.self) || '—'}
                              </div>
                            </div>
                            <div>
                              <div className={uiCx(uiTypography.overline, 'mb-1')}>Supervisor</div>
                              <div className="whitespace-pre-wrap break-words text-gray-800">
                                {formatAnswerForCompare(c.manager) || '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </AppCard>
            ) : null}
          </div>

          <aside className={uiCx(uiSpacing.sectionStack, 'lg:sticky lg:top-4')}>
            <AppCard bodyClassName={uiSpacing.sectionStack}>
              <AppSectionHeader title="Rating scale" />
              <AppTable columns={['#', 'Meaning']} rows={ratingLegendRows} className="border-0 shadow-none" />
            </AppCard>

            <details className={uiCx(uiRadius.card, uiShadows.card, 'group overflow-hidden border border-gray-200 bg-white')} open>
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-gray-900">
                <span>{directoryCard?.name || focusRow.reviewee_name || 'Employee'} — profile</span>
                <span className="text-xs text-gray-400 group-open:hidden">Expand</span>
                <span className="hidden text-xs text-gray-400 group-open:inline">Collapse</span>
              </summary>
              <div className={uiCx(uiSpacing.cardPadding, 'space-y-2.5 border-t border-gray-100 pt-0', uiTypography.body)}>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Department</span>
                  <span className={uiCx('text-right font-medium', uiColors.textStrong)}>
                    {directoryCard?.department || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Position</span>
                  <span className={uiCx('text-right font-medium', uiColors.textStrong)}>
                    {directoryCard?.job_title || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">With MK</span>
                  <span className={uiCx('text-right font-medium', uiColors.textStrong)}>
                    {formatTenure(directoryCard?.hire_date) || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Phone</span>
                  <span className={uiCx('break-all text-right font-medium', uiColors.textStrong)}>
                    {directoryCard?.phone || directoryCard?.work_phone || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Work email</span>
                  <span className="break-all text-right text-xs text-gray-900">
                    {directoryCard?.work_email || directoryCard?.email_corporate || '—'}
                  </span>
                </div>
              </div>
            </details>

            <AppCard bodyClassName={uiSpacing.sectionStack}>
              <AppSectionHeader
                title="Your summary for the meeting"
                icon={<PenLine className="h-4 w-4" />}
                iconClassName="bg-brand-red/10 text-brand-red"
                description={
                  <>
                    Private notes on this device — opinions, talking points, or prompts for the conversation. On Windows
                    you can use voice typing here with{' '}
                    <kbd className="rounded bg-gray-100 px-1 py-0.5 font-sans text-[10px]">Win</kbd>+
                    <kbd className="rounded bg-gray-100 px-1 py-0.5 font-sans text-[10px]">H</kbd>.
                  </>
                }
              />
              <AppTextarea
                placeholder="Your notes and opinions to use in the meeting…"
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
                rows={6}
              />
              <AppButton type="button" className="w-full" leftIcon={<Save className="h-4 w-4" />} onClick={saveMeetingNotes}>
                Save summary
              </AppButton>
            </AppCard>
          </aside>
        </div>
      ) : (
        <div className={uiSpacing.sectionStack}>
          <p className={uiTypography.body}>
            Choose an employee to open the side-by-side meeting layout. You can also open one from the cycle{' '}
            <strong>Team progress</strong> table.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCompareRows.map((r: any) => {
              const hasDiff = (r.comparison || []).some((c: any) => {
                return formatAnswerForCompare(c.self) !== formatAnswerForCompare(c.manager);
              });
              return (
                <AppCard key={r.reviewee_user_id} className={uiShadows.card} bodyClassName={uiCx(uiSpacing.cardPadding, 'flex flex-col gap-3')}>
                  <div className="min-w-0">
                    <div className={uiCx(uiTypography.sectionTitle, 'truncate')}>
                      {r.reviewee_name || r.reviewee_user_id}
                    </div>
                    <div className={uiCx(uiLayout.actionsRow, 'mt-2 flex-wrap')}>
                      <AppBadge variant={submissionStatusVariant(r.self_status)}>
                        Self: {r.self_status || 'pending'}
                      </AppBadge>
                      <AppBadge variant={submissionStatusVariant(r.manager_status)}>
                        Mgr: {r.manager_status || 'pending'}
                      </AppBadge>
                      {hasDiff ? <AppBadge variant="warning">Has differences</AppBadge> : null}
                    </div>
                  </div>
                  <div className={uiCx(uiLayout.actionsRow, 'mt-auto flex-wrap pt-1')}>
                    <AppButton type="button" size="sm" onClick={() => openReviewee(String(r.reviewee_user_id))}>
                      Open meeting view
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/users/${encodeURIComponent(r.reviewee_user_id)}`)}
                    >
                      Profile →
                    </AppButton>
                  </div>
                </AppCard>
              );
            })}
          </div>
          {(rows || []).length === 0 ? (
            <AppEmptyState title="No comparison rows for this cycle." />
          ) : visibleCompareRows.length === 0 ? (
            <AppEmptyState title="No employees match your filters." />
          ) : null}
        </div>
      )}

      {cycleId && paramReviewee && !focusRow ? (
        <AppCard className="border-amber-200 bg-amber-50" bodyClassName={uiSpacing.cardPadding}>
          <p className="text-sm text-amber-900">
            Employee not found in this cycle (or still loading).{' '}
            <AppButton type="button" variant="ghost" size="sm" className="!px-1 !py-0 align-baseline" onClick={clearReviewee}>
              Back to list
            </AppButton>
          </p>
        </AppCard>
      ) : null}

      {cycleId && !paramReviewee && (rows || []).length > 0 ? (
        <AppCard bodyClassName={uiSpacing.sectionStack}>
          <AppSectionHeader title="Quick table" />
          <AppTable
            columns={['Employee', 'Status', ' ']}
            rows={quickTableRows}
            emptyState="No employees match your filters."
          />
        </AppCard>
      ) : null}
    </div>
  );
}
