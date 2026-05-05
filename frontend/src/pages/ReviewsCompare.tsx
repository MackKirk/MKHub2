import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';

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

const RATING_LEGEND: { n: number; title: string; desc: string }[] = [
  { n: 5, title: 'Outstanding', desc: 'Goes above and beyond' },
  { n: 4, title: 'Above Average', desc: 'Often exceeds expectations' },
  { n: 3, title: 'Meets Expectations', desc: 'Reliable and consistent' },
  { n: 2, title: 'Needs Improvement', desc: 'Requires closer supervision' },
  { n: 1, title: 'Not Meeting Standards', desc: 'Unsafe or unprofessional' },
];

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

export default function ReviewsCompare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramCycle = searchParams.get('cycle') || '';
  const paramReviewee = searchParams.get('reviewee') || '';
  const { data: cycles } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<any[]>('GET', '/reviews/cycles'),
  });
  const [cycleId, setCycleId] = useState<string>(paramCycle);

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

  const filteredRows = useMemo(() => {
    return (rows || []).filter((r: any) => {
      if (paramReviewee && String(r.reviewee_user_id) !== paramReviewee) return false;
      if (!q.trim()) return true;
      const name = String(r.reviewee_name || '').toLowerCase();
      return name.includes(q.toLowerCase());
    });
  }, [rows, q, paramReviewee]);

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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

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

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 pb-10">
      <div className="bg-gradient-to-br from-slate-100/90 to-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 px-5 sm:px-6 mb-6 shadow-sm">
        <div>
          <div className="text-xl font-bold text-slate-900 tracking-tight">Reviews comparison</div>
          <div className="text-sm text-slate-600 mt-0.5">
            Self vs supervisor side-by-side — pick a cycle, then open an employee for the meeting view.
          </div>
        </div>
        <div className="text-left sm:text-right shrink-0">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Today</div>
          <div className="text-sm font-semibold text-slate-700">{todayLabel}</div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-600">Cycle</span>
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm min-w-[200px]"
            value={cycleId}
            onChange={(e) => setCycleInUrl(e.target.value)}
          >
            <option value="">Select…</option>
            {sortByLabel(cycles || [], (c: any) => (c.name || '').toString()).map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {!paramReviewee ? (
          <>
            <input
              placeholder="Search by name"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm max-w-xs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="text-sm flex items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                checked={onlyDiff}
                onChange={(e) => setOnlyDiff(e.target.checked)}
                className="rounded border-slate-300"
              />
              Only differences
            </label>
            <span className="text-sm text-slate-500">Self</span>
            <select
              className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm"
              value={selfStatus}
              onChange={(e) => setSelfStatus(e.target.value)}
            >
              <option value="">Any</option>
              <option value="submitted">Submitted</option>
              <option value="pending">Pending</option>
            </select>
            <span className="text-sm text-slate-500">Mgr</span>
            <select
              className="rounded-xl border border-slate-300 bg-white px-2 py-2 text-sm"
              value={mgrStatus}
              onChange={(e) => setMgrStatus(e.target.value)}
            >
              <option value="">Any</option>
              <option value="submitted">Submitted</option>
              <option value="pending">Pending</option>
            </select>
          </>
        ) : (
          <button
            type="button"
            onClick={clearReviewee}
            className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
          >
            ← All employees in cycle
          </button>
        )}
      </div>

      {!cycleId ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16 text-center text-slate-500 text-sm">
          Select a review cycle to load comparisons.
        </div>
      ) : paramReviewee && focusRow ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
          <div className="space-y-5 min-w-0">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {focusRow.reviewee_name || focusRow.reviewee_user_id}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Self {focusRow.self_status || '—'} · Manager {focusRow.manager_status || '—'}
              </p>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-sky-50/80 to-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide mb-4">
                Overall scores
              </h2>
              {scaleCount === 0 ? (
                <p className="text-sm text-slate-600">
                  No 1–5 scale questions in this form snapshot — add{' '}
                  <span className="font-medium">scale 1–5</span> fields to see averages here.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm">
                      <div className="text-xs font-medium text-slate-500 mb-1">
                        Employee self-review
                      </div>
                      <div className="text-2xl font-bold tabular-nums text-slate-900">
                        {selfAvg != null ? `${selfAvg.toFixed(2)}` : '—'}
                        <span className="text-base font-semibold text-slate-400">/5.00</span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-500 transition-all"
                          style={{ width: `${selfAvg != null ? (selfAvg / 5) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200/80 p-4 shadow-sm">
                      <div className="text-xs font-medium text-slate-500 mb-1">
                        Supervisor review
                      </div>
                      <div className="text-2xl font-bold tabular-nums text-slate-900">
                        {mgrAvg != null ? `${mgrAvg.toFixed(2)}` : '—'}
                        <span className="text-base font-semibold text-slate-400">/5.00</span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all"
                          style={{ width: `${mgrAvg != null ? (mgrAvg / 5) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  {diffSummary ? (
                    <p className="text-xs text-slate-600 mt-3">{diffSummary}</p>
                  ) : null}
                </>
              )}
            </section>

            {Array.from(scaleRowsBySection.entries()).map(([section, cells]) => (
              <section key={section} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                  {section}
                </h2>
                <ul className="space-y-4">
                  {cells.map((c) => {
                    const selfN = extractNumericScore(c.self);
                    const mgrN = extractNumericScore(c.manager);
                    const diff =
                      selfN != null && mgrN != null && selfN !== mgrN;
                    return (
                      <li key={c.key}>
                        <div className="text-sm font-medium text-slate-900 mb-2">{c.label}</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div
                            className={`rounded-xl border px-3 py-2.5 text-center ${
                              diff ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50/50'
                            }`}
                          >
                            <div className="text-[10px] font-semibold uppercase text-slate-500">Self</div>
                            <div className="text-lg font-semibold tabular-nums text-slate-900">
                              {(selfN ?? formatAnswerForCompare(c.self)) || '—'}
                            </div>
                          </div>
                          <div
                            className={`rounded-xl border px-3 py-2.5 text-center ${
                              diff ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50/50'
                            }`}
                          >
                            <div className="text-[10px] font-semibold uppercase text-slate-500">
                              Supervisor
                            </div>
                            <div className="text-lg font-semibold tabular-nums text-slate-900">
                              {(mgrN ?? formatAnswerForCompare(c.manager)) || '—'}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {otherRows.length > 0 ? (
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOtherOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 text-left text-sm font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100/80"
                >
                  Other responses
                  <span className="text-slate-400">{otherOpen ? '▼' : '▶'}</span>
                </button>
                {otherOpen ? (
                  <div className="p-5 pt-2 space-y-4 border-t border-slate-100">
                    {otherRows.map((c) => {
                      const diff =
                        formatAnswerForCompare(c.self) !== formatAnswerForCompare(c.manager);
                      return (
                        <div
                          key={c.key}
                          className={`rounded-xl border p-3 ${diff ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100'}`}
                        >
                          <div className="text-sm font-medium text-slate-900 mb-2">{c.label}</div>
                          <div className="grid md:grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">
                                Self
                              </div>
                              <div className="whitespace-pre-wrap break-words text-slate-800">
                                {formatAnswerForCompare(c.self) || '—'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-semibold uppercase text-slate-500 mb-1">
                                Supervisor
                              </div>
                              <div className="whitespace-pre-wrap break-words text-slate-800">
                                {formatAnswerForCompare(c.manager) || '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Rating scale
              </h3>
              <table className="w-full text-xs text-left">
                <tbody>
                  {RATING_LEGEND.map((row) => (
                    <tr key={row.n} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-2 font-bold text-indigo-600 tabular-nums w-8">{row.n}</td>
                      <td className="py-1.5">
                        <span className="font-semibold text-slate-800">{row.title}</span>
                        <span className="text-slate-500"> — {row.desc}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="rounded-2xl border border-slate-200 bg-white shadow-sm group" open>
              <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>
                  {directoryCard?.name || focusRow.reviewee_name || 'Employee'} — profile
                </span>
                <span className="text-slate-400 text-xs group-open:hidden">Expand</span>
                <span className="text-slate-400 text-xs hidden group-open:inline">Collapse</span>
              </summary>
              <div className="px-4 pb-4 pt-0 border-t border-slate-100 text-sm space-y-2.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Department</span>
                  <span className="text-slate-900 text-right font-medium">
                    {directoryCard?.department || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Position</span>
                  <span className="text-slate-900 text-right font-medium">
                    {directoryCard?.job_title || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">With MK</span>
                  <span className="text-slate-900 text-right font-medium">
                    {formatTenure(directoryCard?.hire_date) || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Phone</span>
                  <span className="text-slate-900 text-right font-medium break-all">
                    {directoryCard?.phone || directoryCard?.work_phone || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Work email</span>
                  <span className="text-slate-900 text-right text-xs break-all">
                    {directoryCard?.work_email || directoryCard?.email_corporate || '—'}
                  </span>
                </div>
              </div>
            </details>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <svg
                  className="h-5 w-5 shrink-0 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                <h3 className="text-sm font-semibold text-slate-900">Your summary for the meeting</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Private notes on this device — opinions, talking points, or prompts for the conversation. On Windows you can
                use voice typing here with{' '}
                <kbd className="px-1 py-0.5 rounded bg-slate-100 text-[10px] font-sans">Win</kbd>+
                <kbd className="px-1 py-0.5 rounded bg-slate-100 text-[10px] font-sans">H</kbd>.
              </p>
              <textarea
                className="w-full min-h-[140px] rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                placeholder="Your notes and opinions to use in the meeting…"
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
              />
              <button
                type="button"
                onClick={saveMeetingNotes}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-4 4l3 3m0 0l3-3m-3 3V4"
                  />
                </svg>
                Save summary
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Choose an employee to open the side-by-side meeting layout. You can also open one from the cycle{' '}
            <strong>Team progress</strong> table.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(rows || [])
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
              })
              .map((r: any) => {
                const hasDiff = (r.comparison || []).some((c: any) => {
                  return formatAnswerForCompare(c.self) !== formatAnswerForCompare(c.manager);
                });
                return (
                  <div
                    key={r.reviewee_user_id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {r.reviewee_name || r.reviewee_user_id}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span
                            className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                              r.self_status === 'submitted'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            Self: {r.self_status || 'pending'}
                          </span>
                          <span
                            className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                              r.manager_status === 'submitted'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                          >
                            Mgr: {r.manager_status || 'pending'}
                          </span>
                          {hasDiff ? (
                            <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-900">
                              Has differences
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-auto pt-1">
                      <button
                        type="button"
                        onClick={() => openReviewee(String(r.reviewee_user_id))}
                        className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Open meeting view
                      </button>
                      <Link
                        to={`/users/${encodeURIComponent(r.reviewee_user_id)}`}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Profile →
                      </Link>
                    </div>
                  </div>
                );
              })}
          </div>
          {(rows || []).length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">No comparison rows for this cycle.</div>
          ) : null}
        </div>
      )}

      {cycleId && paramReviewee && !focusRow ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Employee not found in this cycle (or still loading).{' '}
          <button type="button" className="font-semibold underline" onClick={clearReviewee}>
            Back to list
          </button>
        </div>
      ) : null}

      {/* Compact multi-employee table for power users when not in meeting view */}
      {cycleId && !paramReviewee && (rows || []).length > 0 ? (
        <div className="mt-10 border-t border-slate-200 pt-8">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Quick table</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="py-2 px-3 font-semibold text-slate-700">Employee</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">Status</th>
                  <th className="py-2 px-3 font-semibold text-slate-700 w-40"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(rows || [])
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
                  })
                  .map((r: any) => (
                    <Fragment key={r.reviewee_user_id}>
                      <tr className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 whitespace-nowrap font-medium text-slate-900">
                          {r.reviewee_name || r.reviewee_user_id}
                        </td>
                        <td className="py-2 px-3 text-xs text-slate-600">
                          Self: {r.self_status || 'pending'} · Mgr: {r.manager_status || 'pending'}
                        </td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() => openReviewee(String(r.reviewee_user_id))}
                            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                          >
                            Meeting view →
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
