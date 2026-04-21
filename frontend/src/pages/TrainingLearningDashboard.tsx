import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';

type CalendarEvent = {
  id: string;
  user_id: string;
  employee_name: string;
  title: string;
  status: string;
  event_start: string;
  event_end: string;
  provider?: string | null;
  category?: string | null;
};

type Row = Record<string, unknown> & {
  employee_name?: string;
  title?: string;
  provider?: string | null;
  crew?: string | null;
  location?: string | null;
  session_time?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  completion_date?: string | null;
  status?: string | null;
  notes?: string | null;
};

type ExpiringPayload = {
  alerts: Array<
    Row & { urgency: string; days_until_expiry: number; expiry_date: string | null }
  >;
  expired: Array<Row & { days_since_expiry: number }>;
};

function daysInRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const start = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  if (end < start) return [startStr];
  const d = new Date(start);
  while (d <= end) {
    out.push(formatDateLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (s === 'in_progress') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (s === 'scheduled') return 'bg-sky-50 text-sky-900 border-sky-200';
  if (s === 'expired') return 'bg-gray-100 text-gray-700 border-gray-200';
  return 'bg-gray-50 text-gray-800 border-gray-200';
}

function fmt(s: string | null | undefined) {
  return s ? String(s).slice(0, 10) : '—';
}

/** Date column aligned with the spreadsheet (range when start ≠ end). */
function formatScheduleDate(r: Row): string {
  const s = r.start_date ? String(r.start_date).slice(0, 10) : '';
  const e = r.end_date ? String(r.end_date).slice(0, 10) : '';
  const c = r.completion_date ? String(r.completion_date).slice(0, 10) : '';
  if (s && e && s !== e) return `${s} – ${e}`;
  if (s) return s;
  if (c) return c;
  return '—';
}

function formatStatusLabel(status: string | null | undefined): string {
  const t = (status || '').replace(/_/g, ' ');
  return t ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
}

/**
 * Training & Learning team dashboard — Overview, Training schedule, and Training matrix (company checklist).
 */

type MatrixCatalogItem = { id: string; label: string; cell_kind?: string };

type MatrixCellPayload = {
  tone: 'green' | 'yellow' | 'red' | null;
  record_id: string | null;
  completion_date: string | null;
  expiry_date: string | null;
  date_taken: string | null;
  display: string;
};

type MatrixRowPayload = {
  user_id: string;
  employee: string;
  cells: Record<string, MatrixCellPayload>;
};

type MatrixGroupPayload = {
  team_label: string;
  rows: MatrixRowPayload[];
};

function MatrixCellDot({ cell, userId }: { cell: MatrixCellPayload | undefined; userId: string }) {
  const c = cell;
  const taken = c?.date_taken || c?.completion_date || '';
  const exp = c?.expiry_date || '';
  const tooltipLines = [`Date taken: ${taken ? taken.slice(0, 10) : '—'}`, `Expires: ${exp ? exp.slice(0, 10) : '—'}`];
  const tooltip = tooltipLines.join('\n');

  if (!c?.tone) {
    return (
      <span className="inline-flex h-8 w-10 items-center justify-center text-xs text-slate-300 select-none">—</span>
    );
  }

  const bgClass =
    c.tone === 'green'
      ? 'bg-emerald-500 shadow-emerald-500/30'
      : c.tone === 'yellow'
        ? 'bg-amber-400 shadow-amber-400/35'
        : 'bg-red-500 shadow-red-500/30';

  return (
    <Link
      to={`/users/${encodeURIComponent(userId)}?tab=training`}
      title={tooltip}
      className="inline-flex h-9 w-10 items-center justify-center rounded-full text-white/0 hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010] focus-visible:ring-offset-1"
      aria-label={`Training — ${tooltip.replace(/\n/g, '. ')}`}
    >
      <span className={`h-3.5 w-3.5 rounded-full ${bgClass} shadow-md ring-1 ring-black/5`} />
    </Link>
  );
}

export default function TrainingLearningDashboard() {
  const [pageTab, setPageTab] = useState<'overview' | 'schedule' | 'matrix'>('overview');
  const [scheduleYear, setScheduleYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const monthStart = useMemo(() => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1), [currentMonth]);
  const monthEnd = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0),
    [currentMonth],
  );
  const startStr = formatDateLocal(monthStart);
  const endStr = formatDateLocal(monthEnd);

  const { data: calEvents = [], isLoading: calLoading } = useQuery({
    queryKey: ['training-hr-calendar', startStr, endStr],
    queryFn: () =>
      api<CalendarEvent[]>('GET', `/auth/training-records/calendar?start=${startStr}&end=${endStr}`),
    enabled: pageTab === 'overview',
  });

  const { data: recentRows = [], isLoading: recentLoading } = useQuery({
    queryKey: ['training-hr-recent'],
    queryFn: () => api<Row[]>('GET', '/auth/training-records/summary/recent?limit=25'),
    enabled: pageTab === 'overview',
  });

  const { data: scheduleRows = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ['training-hr-schedule', scheduleYear],
    queryFn: () =>
      api<Row[]>('GET', `/auth/training-records/summary/schedule?year=${scheduleYear}`),
    enabled: pageTab === 'schedule',
  });

  const { data: expiring, isLoading: expLoading } = useQuery({
    queryKey: ['training-hr-expiring'],
    queryFn: () => api<ExpiringPayload>('GET', '/auth/training-records/summary/expiring'),
    enabled: pageTab === 'overview',
  });

  const { data: matrixCatalog } = useQuery({
    queryKey: ['training-matrix-catalog'],
    queryFn: () => api<{ items: MatrixCatalogItem[] }>('GET', '/auth/training-records/matrix-catalog'),
    enabled: pageTab === 'matrix',
    staleTime: 60 * 60 * 1000,
  });

  const { data: matrixReport, isLoading: matrixLoading } = useQuery({
    queryKey: ['training-hr-matrix-report'],
    queryFn: () =>
      api<{ groups: MatrixGroupPayload[] }>('GET', '/auth/training-records/matrix-report?format=json'),
    enabled: pageTab === 'matrix',
  });

  const matrixColumns = matrixCatalog?.items ?? [];

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    const monthStartStr = startStr;
    const monthEndStr = endStr;
    calEvents.forEach((ev) => {
      const days = daysInRange(ev.event_start.slice(0, 10), ev.event_end.slice(0, 10));
      days.forEach((day) => {
        if (day >= monthStartStr && day <= monthEndStr) {
          if (!map[day]) map[day] = [];
          map[day].push(ev);
        }
      });
    });
    Object.keys(map).forEach((day) => {
      map[day].sort((a, b) =>
        `${a.event_start}${a.employee_name}`.localeCompare(`${b.event_start}${b.employee_name}`),
      );
    });
    return map;
  }, [calEvents, startStr, endStr]);

  const calendarDays = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) days.push(new Date(y, m, day));
    return days;
  }, [currentMonth]);

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const goToPreviousMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => {
    const t = new Date();
    setCurrentMonth(new Date(t.getFullYear(), t.getMonth(), 1));
  };
  const today = new Date();
  const isToday = (date: Date | null) => date && date.toDateString() === today.toDateString();
  const getDayEvents = (date: Date | null) => (date ? eventsByDay[formatDateLocal(date)] || [] : []);

  return (
    <div className="-mx-5 w-[calc(100%+2.5rem)] max-w-none space-y-5 pb-10 px-3 sm:px-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-4 sm:px-6">
        <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Training & Learning</div>
        <div className="text-sm text-gray-500 font-medium">
          Team dashboard — overview, schedule, and the standard training matrix from each employee profile (Training
          tab).
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {(
          [
            ['overview', 'Overview'],
            ['schedule', 'Training schedule'],
            ['matrix', 'Training matrix'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPageTab(id)}
            className={`px-4 py-2 rounded-t-lg text-sm font-semibold border-b-2 transition-colors ${
              pageTab === id
                ? 'border-[#7f1010] text-[#7f1010] bg-white'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {pageTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <section className="xl:col-span-7 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-gray-900 tracking-tight">Training calendar</h2>
                  <p className="text-xs text-gray-500 mt-0.5">This month — scheduled, in progress, and completed</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={goToPreviousMonth}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-gray-600"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={goToToday}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-gray-600"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={goToNextMonth}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-gray-600"
                  >
                    →
                  </button>
                </div>
              </div>
              <div className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-base font-bold text-[#7f1010]">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </span>
                  {calLoading && <span className="text-xs text-gray-400">Loading…</span>}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {dayNames.map((d) => (
                    <div key={d} className="text-center text-[10px] font-bold text-gray-500 py-1.5 uppercase">
                      {d}
                    </div>
                  ))}
                  {calendarDays.map((date, index) => {
                    if (!date) {
                      return <div key={`empty-${index}`} className="min-h-[88px] xl:min-h-[100px]" />;
                    }
                    const dayEvents = getDayEvents(date);
                    const dayIsToday = isToday(date);
                    return (
                      <div
                        key={date.toISOString()}
                        className={`min-h-[88px] xl:min-h-[100px] border rounded-lg p-1.5 flex flex-col ${
                          dayIsToday ? 'border-2 border-[#7f1010] bg-red-50/40' : 'border-slate-200'
                        }`}
                      >
                        <span
                          className={`text-xs font-semibold ${dayIsToday ? 'text-[#7f1010]' : 'text-gray-700'}`}
                        >
                          {date.getDate()}
                        </span>
                        <div className="mt-1 space-y-1 flex-1 overflow-auto">
                          {dayEvents.slice(0, 4).map((ev) => (
                            <Link
                              key={`${ev.id}-${formatDateLocal(date)}`}
                              to={`/users/${encodeURIComponent(ev.user_id)}?tab=training`}
                              className={`w-full text-left text-[10px] px-1.5 py-1 rounded border truncate block shadow-sm ${statusBadgeClass(ev.status)}`}
                              title={`${ev.title} — ${ev.employee_name}`}
                            >
                              <span className="font-medium block truncate">{ev.title}</span>
                              <span className="opacity-80 block truncate">{ev.employee_name}</span>
                            </Link>
                          ))}
                          {dayEvents.length > 4 && (
                            <span className="text-[10px] text-gray-500">+{dayEvents.length - 4} more</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-3 text-[10px] text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded border bg-sky-50 border-sky-200" /> Scheduled
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded border bg-amber-50 border-amber-200" /> In progress
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded border bg-emerald-50 border-emerald-200" /> Completed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded border bg-gray-100 border-gray-200" /> Expired
                  </span>
                </div>
              </div>
            </section>

            <section className="xl:col-span-5 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col max-h-[720px] xl:max-h-[none] xl:min-h-[320px]">
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
                <h2 className="text-sm font-bold text-gray-900 tracking-tight">Latest entries</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Most recently added or updated records ({recentRows.length} shown)
                </p>
              </div>
              <div className="overflow-auto flex-1 p-2">
                {recentLoading ? (
                  <p className="p-4 text-sm text-gray-400">Loading…</p>
                ) : (
                  <table className="w-full text-sm min-w-[300px]">
                    <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">When</th>
                        <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Employee</th>
                        <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Title</th>
                        <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-gray-500 text-sm">
                            No records yet.
                          </td>
                        </tr>
                      ) : (
                        recentRows.map((r) => (
                          <tr key={String(r.id)} className="border-b border-slate-100 hover:bg-slate-50/80">
                            <td className="py-2 px-2 text-[11px] text-gray-600 whitespace-nowrap">
                              {fmt((r.updated_at as string) || (r.created_at as string))}
                            </td>
                            <td className="py-2 px-2 align-top">
                              <Link
                                to={`/users/${encodeURIComponent(String(r.user_id))}?tab=training`}
                                className="text-[#7f1010] hover:underline font-medium text-xs leading-snug"
                              >
                                {String(r.employee_name || r.user_id || '—')}
                              </Link>
                            </td>
                            <td className="py-2 px-2 text-xs text-gray-900">{String(r.title || '—')}</td>
                            <td className="py-2 px-2 text-[11px] capitalize text-gray-700">
                              {String(r.status || '—').replace(/_/g, ' ')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>

          <section id="expiring" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">Certificate expiry</h2>
              <p className="text-xs text-gray-500">
                Manual records with an expiry date · Green 61–90d · Yellow 31–60d · Red 1–30d
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                  <h3 className="text-sm font-bold text-gray-900">Expiring within 90 days</h3>
                </div>
                {expLoading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-3 font-semibold text-xs"> </th>
                        <th className="text-left py-2 px-3 font-semibold text-xs">Employee</th>
                        <th className="text-left py-2 px-3 font-semibold text-xs">Title</th>
                        <th className="text-left py-2 px-3 font-semibold text-xs">Expires</th>
                        <th className="text-left py-2 px-3 font-semibold text-xs">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!expLoading && (expiring?.alerts?.length ?? 0) === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-gray-500 text-sm">
                            No items in the 1–90 day window.
                          </td>
                        </tr>
                      ) : (
                        (expiring?.alerts || []).map((r) => (
                          <tr key={String(r.id)} className="border-b border-slate-100 hover:bg-slate-50/80">
                            <td className="py-2 px-3">
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                                  r.urgency === 'green'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : r.urgency === 'yellow'
                                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                                      : 'bg-red-50 text-red-800 border-red-200'
                                }`}
                              >
                                {r.urgency}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <Link
                                to={`/users/${encodeURIComponent(String(r.user_id))}?tab=training`}
                                className="text-[#7f1010] hover:underline text-xs"
                              >
                                {String(r.employee_name || r.user_id)}
                              </Link>
                            </td>
                            <td className="py-2 px-3 text-xs">{String(r.title)}</td>
                            <td className="py-2 px-3 text-xs whitespace-nowrap">{fmt(r.expiry_date)}</td>
                            <td className="py-2 px-3 text-xs">{r.days_until_expiry}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                  <h3 className="text-sm font-bold text-gray-900">Recently expired (last 365 days)</h3>
                </div>
                <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-2 px-3 font-semibold text-xs">Employee</th>
                        <th className="text-left py-2 px-3 font-semibold text-xs">Title</th>
                        <th className="text-left py-2 px-3 font-semibold text-xs">Expired</th>
                        <th className="text-left py-2 px-3 font-semibold text-xs">Days ago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!expLoading && (expiring?.expired?.length ?? 0) === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-gray-500 text-sm">
                            None in the last year.
                          </td>
                        </tr>
                      ) : (
                        (expiring?.expired || []).map((r) => (
                          <tr key={`ex-${String(r.id)}`} className="border-b border-slate-100 hover:bg-slate-50/80">
                            <td className="py-2 px-3">
                              <Link
                                to={`/users/${encodeURIComponent(String(r.user_id))}?tab=training`}
                                className="text-[#7f1010] hover:underline text-xs"
                              >
                                {String(r.employee_name || r.user_id)}
                              </Link>
                            </td>
                            <td className="py-2 px-3 text-xs">{String(r.title)}</td>
                            <td className="py-2 px-3 text-xs whitespace-nowrap">{fmt(r.expiry_date as string)}</td>
                            <td className="py-2 px-3 text-xs">{r.days_since_expiry}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {pageTab === 'schedule' && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900 tracking-tight">Training schedule (full list)</h2>
              <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
                Same columns as the Safety Review & Training Schedule workbook: one row per person per training. Fill
                Crew, Time, and Location on the employee&apos;s Training tab when adding a record.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Year</label>
              <input
                type="number"
                min={1990}
                max={2100}
                value={scheduleYear}
                onChange={(e) => setScheduleYear(Number(e.target.value) || new Date().getFullYear())}
                className="border border-slate-200 rounded-lg px-3 py-1.5 w-28 text-sm font-medium"
              />
              {scheduleLoading && <span className="text-xs text-gray-400">Loading…</span>}
            </div>
          </div>
          <div className="overflow-x-auto p-2">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600 w-10">#</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Training title</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Crew</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Training / facilitator</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Date</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Time</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Location</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Attendees</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Status</th>
                  <th className="text-left py-2 px-2 font-semibold text-[11px] text-gray-600">Notes</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.length === 0 && !scheduleLoading ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-gray-500 text-sm">
                      No rows for {scheduleYear}. Add training on an employee profile or pick another year.
                    </td>
                  </tr>
                ) : (
                  scheduleRows.map((r, idx) => (
                    <tr key={String(r.id)} className="border-b border-slate-100 hover:bg-slate-50/80 align-top">
                      <td className="py-2 px-2 text-xs text-gray-500">{idx + 1}</td>
                      <td className="py-2 px-2 text-xs font-medium text-gray-900">{String(r.title || '—')}</td>
                      <td className="py-2 px-2 text-xs text-gray-800 max-w-[120px]">{r.crew || '—'}</td>
                      <td className="py-2 px-2 text-xs text-gray-800 max-w-[160px]">{r.provider || '—'}</td>
                      <td className="py-2 px-2 text-xs text-gray-800 whitespace-nowrap">{formatScheduleDate(r)}</td>
                      <td className="py-2 px-2 text-xs text-gray-800 max-w-[100px]">{r.session_time || '—'}</td>
                      <td className="py-2 px-2 text-xs text-gray-800 max-w-[180px]">{r.location || '—'}</td>
                      <td className="py-2 px-2 text-xs">
                        <Link
                          to={`/users/${encodeURIComponent(String(r.user_id))}?tab=training`}
                          className="text-[#7f1010] hover:underline font-medium"
                        >
                          {String(r.employee_name || r.user_id || '—')}
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-xs">{formatStatusLabel(r.status as string)}</td>
                      <td className="py-2 px-2 text-xs text-gray-600 max-w-[220px]">
                        {r.notes ? (
                          <span className="line-clamp-3" title={String(r.notes)}>
                            {String(r.notes)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pageTab === 'matrix' && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
            <h2 className="text-sm font-bold text-gray-900 tracking-tight">Training matrix</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
              Employees grouped by team ·{' '}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> OK / more than 6 mo.
              </span>{' '}
              ·{' '}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Expiring within 6 mo.
              </span>{' '}
              ·{' '}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Expired
              </span>{' '}
              · Hover a dot for dates; click opens the employee Training tab.
            </p>
          </div>
          <div className="p-2">
            {matrixLoading ? (
              <p className="p-6 text-sm text-gray-400">Loading…</p>
            ) : matrixColumns.length === 0 ? (
              <p className="p-6 text-sm text-gray-500">Could not load matrix catalog.</p>
            ) : (
              <table className="w-full text-sm border-collapse min-w-[960px]">
                <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-3 font-semibold text-[10px] uppercase tracking-wide text-gray-600 whitespace-nowrap min-w-[160px]">
                      Employee
                    </th>
                    {matrixColumns.map((col) => (
                      <th
                        key={col.id}
                        title={col.label}
                        className="text-center py-3 px-1 font-semibold text-[10px] uppercase tracking-wide text-gray-600 align-bottom w-12 min-w-[3rem]"
                      >
                        <span className="line-clamp-4 leading-tight inline-block max-w-[4.5rem]">{col.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(matrixReport?.groups ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={1 + matrixColumns.length} className="py-10 text-center text-gray-500 text-sm">
                        No active employees in range, or no data yet.
                      </td>
                    </tr>
                  ) : (
                    (matrixReport?.groups ?? []).map((group, gi) => (
                      <Fragment key={`${group.team_label}-${gi}`}>
                        <tr className="bg-emerald-50/80 border-y border-emerald-100">
                          <td
                            colSpan={1 + matrixColumns.length}
                            className="py-2 px-3 text-xs font-bold text-emerald-950 uppercase tracking-wide"
                          >
                            {group.team_label}
                          </td>
                        </tr>
                        {group.rows.map((row) => (
                          <tr
                            key={row.user_id}
                            className="border-b border-slate-100 hover:bg-slate-50/80 align-middle"
                          >
                            <td className="py-2.5 px-3 text-sm text-gray-900 font-medium border-r border-slate-100/80">
                              <Link
                                to={`/users/${encodeURIComponent(row.user_id)}?tab=training`}
                                className="text-[#7f1010] hover:underline"
                              >
                                {row.employee || '—'}
                              </Link>
                            </td>
                            {matrixColumns.map((col) => (
                              <td key={col.id} className="py-1.5 px-0.5 text-center align-middle">
                                <MatrixCellDot cell={row.cells[col.id]} userId={row.user_id} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
