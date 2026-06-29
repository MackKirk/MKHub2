import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  daysInRange,
  formatStatusLabel,
  type PersonalCalendarEvent,
} from '@/lib/trainingPersonalUtils';
import type { useMyTrainingData } from '@/hooks/useMyTrainingData';
import {
  AppBadge,
  AppButton,
  AppCalendarBase,
  type AppCalendarDay,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  AppTable,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type Props = {
  data: ReturnType<typeof useMyTrainingData>;
  onGoToTab: (tab: string) => void;
};

function trainingStatusVariant(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  const s = status.toLowerCase();
  if (s === 'completed') return 'success';
  if (s === 'in_progress') return 'warning';
  if (s === 'scheduled') return 'info';
  return 'neutral';
}

function urgencyVariant(urgency: string): 'success' | 'warning' | 'danger' {
  if (urgency === 'green') return 'success';
  if (urgency === 'yellow') return 'warning';
  return 'danger';
}

function SummaryCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="flex flex-col gap-1">
      <span className={uiTypography.helper}>{label}</span>
      <span className="text-2xl font-bold text-gray-900">{value}</span>
      {hint ? <span className={uiTypography.helper}>{hint}</span> : null}
    </div>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
      >
        {inner}
      </button>
    );
  }
  return <div className="rounded-xl border border-gray-200 bg-white p-4">{inner}</div>;
}

export default function TrainingOverviewTab({ data, onGoToTab }: Props) {
  const todayStr = formatDateLocal(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string>(todayStr);

  const { summaryCounts, calendarEvents, expiringAlerts, upcomingRecords } = data;

  const monthStart = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
    [currentMonth],
  );
  const monthEnd = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0),
    [currentMonth],
  );
  const startStr = formatDateLocal(monthStart);
  const endStr = formatDateLocal(monthEnd);

  const eventsByDay = useMemo(() => {
    const map: Record<string, PersonalCalendarEvent[]> = {};
    calendarEvents.forEach((ev) => {
      const days = daysInRange(ev.event_start.slice(0, 10), ev.event_end.slice(0, 10));
      days.forEach((day) => {
        if (day >= startStr && day <= endStr) {
          if (!map[day]) map[day] = [];
          map[day].push(ev);
        }
      });
    });
    Object.keys(map).forEach((day) => {
      map[day].sort((a, b) => `${a.event_start}${a.title}`.localeCompare(`${b.event_start}${b.title}`));
    });
    return map;
  }, [calendarEvents, startStr, endStr]);

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

  const expiringRows = useMemo(
    () =>
      expiringAlerts.slice(0, 8).map((a) => [
        <AppBadge key={`u-${a.id}`} variant={urgencyVariant(a.urgency)}>
          {a.days_until_expiry < 0 ? 'Expired' : `${a.days_until_expiry}d`}
        </AppBadge>,
        a.title,
        a.expiry_date.slice(0, 10),
        a.source === 'lms' ? (
          <Link key={`l-${a.id}`} to={`/training/${a.course_id}`} className="text-brand-red hover:underline">
            Renew course
          </Link>
        ) : (
          <button
            key={`r-${a.id}`}
            type="button"
            className="text-brand-red hover:underline"
            onClick={() => onGoToTab('records')}
          >
            View record
          </button>
        ),
      ]),
    [expiringAlerts, onGoToTab],
  );

  return (
    <div className={uiSpacing.sectionStack}>
      <div className={uiCx('grid gap-3 sm:grid-cols-2 lg:grid-cols-4')}>
        <SummaryCard
          label="Required courses"
          value={summaryCounts.required}
          hint="Pending LMS assignments"
          onClick={() => onGoToTab('courses')}
        />
        <SummaryCard
          label="In progress"
          value={summaryCounts.inProgress}
          onClick={() => onGoToTab('courses')}
        />
        <SummaryCard
          label="Upcoming sessions"
          value={summaryCounts.upcoming}
          hint="Scheduled or in progress"
          onClick={() => onGoToTab('records')}
        />
        <SummaryCard
          label="Valid certificates"
          value={summaryCounts.validCertificates}
          onClick={() => onGoToTab('certificates')}
        />
      </div>

      <div className={uiCx(uiLayout.pageTwoColumn, 'items-start')}>
        <AppCard bodyClassName={uiSpacing.sectionStack}>
          <AppSectionHeader
            title="My training calendar"
            description="Scheduled, in progress, and completed HR training sessions."
            {...appSectionPresetProps('education')}
            action={
              <AppButton type="button" variant="ghost" size="sm" onClick={() => onGoToTab('records')}>
                All records
              </AppButton>
            }
          />
          <AppCalendarBase
            bare
            monthLabel={`${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`}
            days={appCalendarDays}
            onPrevious={() =>
              setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
            }
            onNext={() =>
              setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
            }
            headerExtra={
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const t = new Date();
                  setCurrentMonth(new Date(t.getFullYear(), t.getMonth(), 1));
                  setSelectedCalendarDay(formatDateLocal(t));
                }}
              >
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
              <AppEmptyState title="No training on this day" className="border-0 bg-transparent p-4 shadow-none" />
            ) : (
              <ul className="space-y-2">
                {selectedDayEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{ev.title}</div>
                      {ev.provider ? (
                        <div className={uiTypography.helper}>{ev.provider}</div>
                      ) : null}
                    </div>
                    <AppBadge variant={trainingStatusVariant(ev.status)}>{formatStatusLabel(ev.status)}</AppBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AppCard>

        <div className={uiSpacing.sectionStack}>
          <AppCard bodyClassName={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Upcoming"
              description="Next scheduled or in-progress sessions."
              {...appSectionPresetProps('timesheet')}
            />
            {upcomingRecords.length === 0 ? (
              <AppEmptyState
                title="No upcoming sessions"
                description="Scheduled trainings appear here when HR adds them to your profile."
                className="border-0 bg-transparent p-4 shadow-none"
              />
            ) : (
              <ul className="space-y-2">
                {upcomingRecords.map((r) => (
                  <li key={r.id} className="rounded-lg border border-gray-100 px-3 py-2">
                    <div className="text-sm font-semibold text-gray-900">{r.title}</div>
                    <div className={uiTypography.helper}>
                      {(r.start_date || '').slice(0, 10)}
                      {r.session_time ? ` · ${r.session_time}` : ''}
                      {r.location ? ` · ${r.location}` : ''}
                    </div>
                    <AppBadge variant={trainingStatusVariant(r.status || '')} className="mt-1">
                      {formatStatusLabel(r.status)}
                    </AppBadge>
                  </li>
                ))}
              </ul>
            )}
          </AppCard>

          <AppCard bodyClassName={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Expiring soon"
              description="LMS certificates and HR records expiring within 90 days."
              {...appSectionPresetProps('documents')}
            />
            {expiringAlerts.length === 0 ? (
              <AppEmptyState
                title="Nothing expiring soon"
                className="border-0 bg-transparent p-4 shadow-none"
              />
            ) : (
              <AppTable columns={['Urgency', 'Title', 'Expires', 'Action']} rows={expiringRows} />
            )}
          </AppCard>
        </div>
      </div>
    </div>
  );
}
