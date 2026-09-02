import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  AppButton,
  AppEmptyState,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';
import { formatDateLocal } from '@/lib/dateUtils';
import { useProjectCalendarData } from '../../hooks/useProjectCalendarData';
import { ProjectCalendarDayPanel } from './ProjectCalendarDayPanel';
import { ProjectCalendarMonthGrid } from './ProjectCalendarMonthGrid';
import { ProjectCalendarProjectModal } from './ProjectCalendarProjectModal';
import type { ProjectCalendarDayEntry } from './projectCalendar.types';

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

type Props = {
  searchParams: URLSearchParams;
  businessLine: string;
  detailBasePath: string;
};

export default function ProjectCalendarView({ searchParams, businessLine, detailBasePath }: Props) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dayPanelDate, setDayPanelDate] = useState<Date | null>(null);
  const [dayPanelEntries, setDayPanelEntries] = useState<ProjectCalendarDayEntry[]>([]);
  const [projectModalEntry, setProjectModalEntry] = useState<ProjectCalendarDayEntry | null>(null);
  const [projectModalDate, setProjectModalDate] = useState<Date | null>(null);

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

  const { data, isLoading, isError, error, isFetching } = useProjectCalendarData(
    searchParams,
    businessLine,
    startStr,
    endStr,
    true,
  );

  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  const daysByKey = data?.days ?? {};

  const goToPreviousMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const handleDayClick = (date: Date, entries: ProjectCalendarDayEntry[]) => {
    if (entries.length === 0) return;
    setDayPanelDate(date);
    setDayPanelEntries(entries);
  };

  const openProjectModal = (entry: ProjectCalendarDayEntry, date: Date) => {
    setProjectModalEntry(entry);
    setProjectModalDate(date);
  };

  const closeProjectModal = () => {
    setProjectModalEntry(null);
    setProjectModalDate(null);
  };

  const handleDayPanelProjectClick = (entry: ProjectCalendarDayEntry) => {
    if (!dayPanelDate) return;
    openProjectModal(entry, dayPanelDate);
  };

  return (
    <>
      <AppSectionHeader
        {...appSectionPresetProps('projects')}
        title="Project calendar"
        description="Active projects and scheduled workers by day. Leadership roles shown on each project; workers from workload shifts."
      />

      <div className={uiCx('mb-4 flex flex-wrap items-center justify-between gap-3')}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={uiTypography.sectionTitle}>{monthLabel}</span>
          {isLoading || isFetching ? (
            <span className={uiTypography.helper}>Loading…</span>
          ) : data?.meta ? (
            <span className={uiTypography.helper}>
              {data.meta.project_count} project{data.meta.project_count === 1 ? '' : 's'} ·{' '}
              {data.meta.days_with_activity} active day{data.meta.days_with_activity === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={goToPreviousMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </AppButton>
          <AppButton type="button" variant="secondary" size="sm" onClick={goToToday}>
            Today
          </AppButton>
          <AppButton type="button" variant="secondary" size="sm" onClick={goToNextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </AppButton>
        </div>
      </div>

      {isError ? (
        <AppEmptyState
          title="Could not load calendar"
          description={error instanceof Error ? error.message : 'Please try again.'}
        />
      ) : isLoading && !data ? (
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-[120px] animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <ProjectCalendarMonthGrid
          currentMonth={currentMonth}
          daysByKey={daysByKey}
          onDayClick={handleDayClick}
          onProjectClick={openProjectModal}
        />
      )}

      {!isLoading && data && data.meta.days_with_activity === 0 ? (
        <div className="mt-4">
          <AppEmptyState
            title="No projects in this month"
            description="Try another month or adjust your filters. Projects appear on days within their active date range or when workers are scheduled."
          />
        </div>
      ) : null}

      <ProjectCalendarDayPanel
        open={dayPanelDate != null}
        date={dayPanelDate}
        entries={dayPanelEntries}
        onClose={() => {
          setDayPanelDate(null);
          setDayPanelEntries([]);
        }}
        onProjectClick={handleDayPanelProjectClick}
      />

      <ProjectCalendarProjectModal
        open={projectModalEntry != null}
        entry={projectModalEntry}
        date={projectModalDate}
        detailBasePath={detailBasePath}
        onClose={closeProjectModal}
      />
    </>
  );
}
