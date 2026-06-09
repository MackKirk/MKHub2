import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  AppBadge,
  AppButton,
  AppCalendarBase,
  type AppCalendarDay,
  AppCard,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppSectionHeader,
  AppTable,
  AppTabs,
  AppTooltip,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

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
  alerts: Array<Row & { urgency: string; days_until_expiry: number; expiry_date: string | null }>;
  expired: Array<Row & { days_since_expiry: number }>;
};

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

const PAGE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'schedule', label: 'Training schedule' },
  { key: 'matrix', label: 'Training matrix' },
] as const;

type PageTab = (typeof PAGE_TABS)[number]['key'];

const MONTH_NAMES = [
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

function fmt(s: string | null | undefined) {
  return s ? String(s).slice(0, 10) : '—';
}

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

function trainingStatusVariant(status: string | null | undefined): 'success' | 'warning' | 'info' | 'neutral' {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return 'success';
  if (s === 'in_progress') return 'warning';
  if (s === 'scheduled') return 'info';
  return 'neutral';
}

function TrainingStatusBadge({ status }: { status: string | null | undefined }) {
  return <AppBadge variant={trainingStatusVariant(status)}>{formatStatusLabel(status)}</AppBadge>;
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const variant = urgency === 'green' ? 'success' : urgency === 'yellow' ? 'warning' : 'danger';
  return <AppBadge variant={variant}>{urgency}</AppBadge>;
}

function EmployeeTrainingLink({ userId, label }: { userId: string; label: string }) {
  return (
    <Link
      to={`/users/${encodeURIComponent(userId)}?tab=training`}
      className="text-xs font-medium text-brand-red hover:underline"
    >
      {label}
    </Link>
  );
}

function MatrixCellDot({ cell, userId }: { cell: MatrixCellPayload | undefined; userId: string }) {
  const c = cell;
  const taken = c?.date_taken || c?.completion_date || '';
  const exp = c?.expiry_date || '';
  const tooltip = [`Date taken: ${taken ? taken.slice(0, 10) : '—'}`, `Expires: ${exp ? exp.slice(0, 10) : '—'}`].join('\n');

  if (!c?.tone) {
    return <span className="inline-flex h-8 w-10 select-none items-center justify-center text-xs text-gray-300">—</span>;
  }

  const bgClass =
    c.tone === 'green'
      ? 'bg-emerald-500 shadow-emerald-500/30'
      : c.tone === 'yellow'
        ? 'bg-amber-400 shadow-amber-400/35'
        : 'bg-red-500 shadow-red-500/30';

  return (
    <AppTooltip content={tooltip} wrap>
      <Link
        to={`/users/${encodeURIComponent(userId)}?tab=training`}
        className="inline-flex h-9 w-10 items-center justify-center rounded-full hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-1"
        aria-label={`Training — ${tooltip.replace(/\n/g, '. ')}`}
      >
        <span className={`h-3.5 w-3.5 rounded-full ${bgClass} shadow-md ring-1 ring-black/5`} />
      </Link>
    </AppTooltip>
  );
}

function CalendarLegend() {
  return (
    <div className={uiCx('mt-3 flex flex-wrap gap-3 border-t border-gray-100 pt-3', uiTypography.helper)}>
      <span className="flex items-center gap-1.5">
        <AppBadge variant="info">Scheduled</AppBadge>
      </span>
      <span className="flex items-center gap-1.5">
        <AppBadge variant="warning">In progress</AppBadge>
      </span>
      <span className="flex items-center gap-1.5">
        <AppBadge variant="success">Completed</AppBadge>
      </span>
      <span className="flex items-center gap-1.5">
        <AppBadge variant="neutral">Expired</AppBadge>
      </span>
    </div>
  );
}

/**
 * Training & Learning team dashboard — Overview, Training schedule, and Training matrix (company checklist).
 */
export default function TrainingLearningDashboard() {
  const todayStr = formatDateLocal(new Date());
  const [pageTab, setPageTab] = useState<PageTab>('overview');
  const [scheduleYear, setScheduleYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string>(todayStr);

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

  const goToPreviousMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => {
    const t = new Date();
    setCurrentMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedCalendarDay(formatDateLocal(t));
  };

  const appCalendarDays: AppCalendarDay[] = useMemo(
    () =>
      calendarDays.map((date) => {
        if (!date) return { dateLabel: '', isMuted: true };
        const dayStr = formatDateLocal(date);
        const dayEvents = eventsByDay[dayStr] || [];
        const dayIsToday = dayStr === todayStr;
        return {
          dateLabel: String(date.getDate()),
          isToday: dayIsToday,
          isSelected: selectedCalendarDay === dayStr,
          hasMarker: dayEvents.length > 0,
          onClick: () => setSelectedCalendarDay(dayStr),
          title:
            dayEvents.length > 0
              ? `${dayEvents.length} training event${dayEvents.length === 1 ? '' : 's'}`
              : dayIsToday
                ? 'Today'
                : undefined,
        };
      }),
    [calendarDays, eventsByDay, selectedCalendarDay, todayStr],
  );

  const selectedDayEvents = eventsByDay[selectedCalendarDay] || [];

  const recentTableRows = useMemo(
    () =>
      recentRows.map((r) => [
        fmt((r.updated_at as string) || (r.created_at as string)),
        <EmployeeTrainingLink
          key={`emp-${String(r.id)}`}
          userId={String(r.user_id)}
          label={String(r.employee_name || r.user_id || '—')}
        />,
        String(r.title || '—'),
        <TrainingStatusBadge key={`status-${String(r.id)}`} status={r.status as string} />,
      ]),
    [recentRows],
  );

  const expiringAlertRows = useMemo(
    () =>
      (expiring?.alerts || []).map((r) => [
        <UrgencyBadge key={`urg-${String(r.id)}`} urgency={r.urgency} />,
        <EmployeeTrainingLink
          key={`emp-${String(r.id)}`}
          userId={String(r.user_id)}
          label={String(r.employee_name || r.user_id)}
        />,
        String(r.title),
        fmt(r.expiry_date),
        String(r.days_until_expiry),
      ]),
    [expiring?.alerts],
  );

  const expiredRows = useMemo(
    () =>
      (expiring?.expired || []).map((r) => [
        <EmployeeTrainingLink
          key={`emp-ex-${String(r.id)}`}
          userId={String(r.user_id)}
          label={String(r.employee_name || r.user_id)}
        />,
        String(r.title),
        fmt(r.expiry_date as string),
        String(r.days_since_expiry),
      ]),
    [expiring?.expired],
  );

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        icon={<GraduationCap className="h-4 w-4" />}
        title="Training & Learning"
        subtitle="Team dashboard — overview, schedule, and the standard training matrix from each employee profile (Training tab)."
      />

      <AppCard bodyClassName="!py-3">
        <AppTabs
          tabs={[...PAGE_TABS]}
          value={pageTab}
          onChange={(key) => setPageTab(key as PageTab)}
        />
      </AppCard>

      {pageTab === 'overview' && (
        <>
          <div className={uiCx(uiLayout.pageTwoColumn, 'items-start')}>
            <AppCard bodyClassName={uiSpacing.sectionStack}>
              <AppSectionHeader
                title="Training calendar"
                description="This month — scheduled, in progress, and completed. Click a day to see events."
                {...appSectionPresetProps('education')}
                action={
                  calLoading ? <span className={uiTypography.helper}>Loading…</span> : undefined
                }
              />
              <AppCalendarBase
                bare
                monthLabel={`${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`}
                days={appCalendarDays}
                onPrevious={goToPreviousMonth}
                onNext={goToNextMonth}
                headerExtra={
                  <AppButton type="button" variant="ghost" size="sm" onClick={goToToday}>
                    Today
                  </AppButton>
                }
              />
              <div className={uiSpacing.sectionStack}>
                <div className={uiTypography.sectionTitle}>
                  {selectedCalendarDay
                    ? new Date(`${selectedCalendarDay}T12:00:00`).toLocaleDateString('en-CA', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Select a day'}
                </div>
                {selectedDayEvents.length === 0 ? (
                  <AppEmptyState
                    title="No training on this day"
                    className="border-0 bg-transparent p-4 shadow-none"
                  />
                ) : (
                  <div className={uiSpacing.sectionStack}>
                    {selectedDayEvents.map((ev) => (
                      <Link
                        key={`${ev.id}-${selectedCalendarDay}`}
                        to={`/users/${encodeURIComponent(ev.user_id)}?tab=training`}
                        className={uiCx(
                          uiBorders.subtle,
                          uiRadius.card,
                          uiColors.surface,
                          'block p-2 transition-colors hover:bg-gray-50',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <TrainingStatusBadge status={ev.status} />
                          <span className={uiCx(uiTypography.body, 'font-semibold text-gray-900')}>{ev.title}</span>
                        </div>
                        <div className={uiTypography.helper}>{ev.employee_name}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <CalendarLegend />
            </AppCard>

            <AppCard className="flex max-h-[720px] flex-col xl:max-h-none xl:min-h-[320px]" bodyClassName="flex min-h-0 flex-1 flex-col p-0">
              <div className={uiSpacing.cardPadding}>
                <AppSectionHeader
                  title="Latest entries"
                  description={`Most recently added or updated records (${recentRows.length} shown)`}
                  {...appSectionPresetProps('documents')}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
                {recentLoading ? (
                  <div className={uiCx('p-4', uiTypography.helper)}>Loading…</div>
                ) : (
                  <AppTable
                    className="border-0 shadow-none"
                    columns={['When', 'Employee', 'Title', 'Status']}
                    rows={recentTableRows}
                    emptyState={
                      <AppEmptyState title="No records yet." className="border-0 bg-transparent p-4 shadow-none" />
                    }
                  />
                )}
              </div>
            </AppCard>
          </div>

          <div id="expiring">
            <AppCard bodyClassName="p-0">
            <div className={uiSpacing.cardPadding}>
              <AppSectionHeader
                title="Certificate expiry"
                description="Manual records with an expiry date · Green 61–90d · Yellow 31–60d · Red 1–30d"
                {...appSectionPresetProps('documents')}
              />
            </div>
            <div className={uiCx(uiLayout.pageTwoColumn, 'gap-2 border-t border-gray-100 p-2')}>
              <div className={uiCx(uiBorders.subtle, uiRadius.card, 'overflow-hidden')}>
                <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100')}>
                  <AppSectionHeader title="Expiring within 90 days" />
                </div>
                {expLoading ? (
                  <div className={uiCx('p-4', uiTypography.helper)}>Loading…</div>
                ) : (
                  <div className="max-h-[320px] overflow-auto p-2">
                    <AppTable
                      className="border-0 shadow-none"
                      columns={[' ', 'Employee', 'Title', 'Expires', 'Days']}
                      rows={expiringAlertRows}
                      emptyState={
                        <AppEmptyState
                          title="No items in the 1–90 day window."
                          className="border-0 bg-transparent p-4 shadow-none"
                        />
                      }
                    />
                  </div>
                )}
              </div>

              <div className={uiCx(uiBorders.subtle, uiRadius.card, 'overflow-hidden')}>
                <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100')}>
                  <AppSectionHeader title="Recently expired (last 365 days)" />
                </div>
                <div className="max-h-[320px] overflow-auto p-2">
                  {expLoading ? (
                    <div className={uiCx('p-4', uiTypography.helper)}>Loading…</div>
                  ) : (
                    <AppTable
                      className="border-0 shadow-none"
                      columns={['Employee', 'Title', 'Expired', 'Days ago']}
                      rows={expiredRows}
                      emptyState={
                        <AppEmptyState
                          title="None in the last year."
                          className="border-0 bg-transparent p-4 shadow-none"
                        />
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          </AppCard>
          </div>
        </>
      )}

      {pageTab === 'schedule' && (
        <AppCard bodyClassName="p-0">
          <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100')}>
            <AppSectionHeader
              title="Training schedule (full list)"
              description="Same columns as the Safety Review & Training Schedule workbook: one row per person per training. Fill Crew, Time, and Location on the employee's Training tab when adding a record."
              {...appSectionPresetProps('education')}
              action={
                <div className={uiCx(uiLayout.actionsRow, 'items-end gap-2')}>
                  <AppInput
                    label="Year"
                    type="number"
                    min={1990}
                    max={2100}
                    value={String(scheduleYear)}
                    onChange={(e) => setScheduleYear(Number(e.target.value) || new Date().getFullYear())}
                    className="w-28"
                  />
                  {scheduleLoading ? <span className={uiTypography.helper}>Loading…</span> : null}
                </div>
              }
            />
          </div>
          <div className="overflow-x-auto p-2">
            {scheduleRows.length === 0 && !scheduleLoading ? (
              <AppEmptyState
                title={`No rows for ${scheduleYear}.`}
                description="Add training on an employee profile or pick another year."
              />
            ) : (
              <div className={uiCx('overflow-x-auto', uiBorders.subtle, uiRadius.card)}>
                <table className="min-w-[1000px] w-full text-sm">
                  <thead className={uiCx(uiColors.surfaceSubtle, 'sticky top-0 z-10 border-b border-gray-200')}>
                    <tr>
                      {[
                        '#',
                        'Training title',
                        'Crew',
                        'Training / facilitator',
                        'Date',
                        'Time',
                        'Location',
                        'Attendees',
                        'Status',
                        'Notes',
                      ].map((col) => (
                        <th
                          key={col}
                          className={uiCx('px-2 py-2 text-left', uiTypography.controlLabel, col === '#' && 'w-10')}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {scheduleRows.map((r, idx) => (
                      <tr key={String(r.id)} className="align-top hover:bg-gray-50">
                        <td className="px-2 py-2 text-xs text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-2 text-xs font-medium text-gray-900">{String(r.title || '—')}</td>
                        <td className="max-w-[120px] px-2 py-2 text-xs text-gray-800">{r.crew || '—'}</td>
                        <td className="max-w-[160px] px-2 py-2 text-xs text-gray-800">{r.provider || '—'}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-800">{formatScheduleDate(r)}</td>
                        <td className="max-w-[100px] px-2 py-2 text-xs text-gray-800">{r.session_time || '—'}</td>
                        <td className="max-w-[180px] px-2 py-2 text-xs text-gray-800">{r.location || '—'}</td>
                        <td className="px-2 py-2 text-xs">
                          <EmployeeTrainingLink
                            userId={String(r.user_id)}
                            label={String(r.employee_name || r.user_id || '—')}
                          />
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <TrainingStatusBadge status={r.status as string} />
                        </td>
                        <td className="max-w-[220px] px-2 py-2 text-xs text-gray-600">
                          {r.notes ? (
                            <span className="line-clamp-3" title={String(r.notes)}>
                              {String(r.notes)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </AppCard>
      )}

      {pageTab === 'matrix' && (
        <AppCard bodyClassName="p-0">
          <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100')}>
            <AppSectionHeader
              title="Training matrix"
              description={
                <>
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
                </>
              }
              {...appSectionPresetProps('education')}
            />
          </div>
          <div className="p-2">
            {matrixLoading ? (
              <div className={uiCx('p-6', uiTypography.helper)}>Loading…</div>
            ) : matrixColumns.length === 0 ? (
              <AppEmptyState title="Could not load matrix catalog." className="border-0 bg-transparent p-6 shadow-none" />
            ) : (matrixReport?.groups ?? []).length === 0 ? (
              <AppEmptyState
                title="No active employees in range, or no data yet."
                className="border-0 bg-transparent p-6 shadow-none"
              />
            ) : (
              <div className={uiCx('overflow-x-auto', uiBorders.subtle, uiRadius.card)}>
                <table className="min-w-[960px] w-full border-collapse text-sm">
                  <thead className={uiCx(uiColors.surfaceSubtle, 'sticky top-0 z-10 border-b border-gray-200 shadow-sm')}>
                    <tr>
                      <th className={uiCx('min-w-[160px] whitespace-nowrap px-3 py-3 text-left', uiTypography.controlLabel)}>
                        Employee
                      </th>
                      {matrixColumns.map((col) => (
                        <th
                          key={col.id}
                          title={col.label}
                          className={uiCx(
                            'w-12 min-w-[3rem] px-1 py-3 text-center align-bottom',
                            uiTypography.controlLabel,
                          )}
                        >
                          <span className="inline-block max-w-[4.5rem] line-clamp-4 leading-tight">{col.label}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(matrixReport?.groups ?? []).map((group, gi) => (
                      <Fragment key={`${group.team_label}-${gi}`}>
                        <tr className="border-y border-emerald-100 bg-emerald-50/80">
                          <td
                            colSpan={1 + matrixColumns.length}
                            className={uiCx('px-3 py-2', uiTypography.controlLabel, 'font-bold text-emerald-950')}
                          >
                            {group.team_label}
                          </td>
                        </tr>
                        {group.rows.map((row) => (
                          <tr key={row.user_id} className="border-b border-gray-100 align-middle hover:bg-gray-50">
                            <td className="border-r border-gray-100/80 px-3 py-2.5 text-sm font-medium text-gray-900">
                              <EmployeeTrainingLink userId={row.user_id} label={row.employee || '—'} />
                            </td>
                            {matrixColumns.map((col) => (
                              <td key={col.id} className="px-0.5 py-1.5 text-center align-middle">
                                <MatrixCellDot cell={row.cells[col.id]} userId={row.user_id} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </AppCard>
      )}
    </div>
  );
}
