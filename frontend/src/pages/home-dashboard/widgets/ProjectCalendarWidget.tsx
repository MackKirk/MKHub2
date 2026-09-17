import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { AppButton, uiCx, uiLayout, uiTypography } from '@/components/ui';
import { formatDateLocal } from '@/lib/dateUtils';
import { api } from '@/lib/api';
import { useProjectCalendarData } from '@/features/projects/hooks/useProjectCalendarData';
import { ProjectCalendarDayPanel } from '@/features/projects/components/calendar/ProjectCalendarDayPanel';
import { ProjectCalendarMonthGrid } from '@/features/projects/components/calendar/ProjectCalendarMonthGrid';
import { ProjectCalendarProjectModal } from '@/features/projects/components/calendar/ProjectCalendarProjectModal';
import type { ProjectCalendarDayEntry } from '@/features/projects/components/calendar/projectCalendar.types';
import { getServicePathsForLine, resolveWidgetBusinessLine } from '../homeBusinessLine';
import type { MeForHomeWidgets } from '../widgetVisibility';

type ProjectCalendarWidgetProps = {
  config?: Record<string, unknown>;
};

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

const EMPTY_SEARCH = new URLSearchParams();

export function ProjectCalendarWidget({ config }: ProjectCalendarWidgetProps) {
  const { ready } = useAnimationReady();
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

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeForHomeWidgets>('GET', '/auth/me'),
  });

  const businessLine = resolveWidgetBusinessLine(config, me);
  const projectsPath = getServicePathsForLine(businessLine).projects;
  const calendarHref = `${projectsPath}?view=calendar`;

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

  const { data, isLoading, isFetching } = useProjectCalendarData(
    EMPTY_SEARCH,
    businessLine,
    startStr,
    endStr,
    Boolean(me),
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

  if (isLoading && !data) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="min-h-0 flex-1">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }

  return (
    <FadeInOnMount enabled={ready} className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={uiCx(uiTypography.sectionTitle, 'truncate text-sm')}>{monthLabel}</span>
          {isLoading || isFetching ? (
            <span className={uiTypography.helper}>Loading…</span>
          ) : data?.meta ? (
            <span className={uiCx(uiTypography.helper, 'truncate')}>
              {data.meta.project_count} project{data.meta.project_count === 1 ? '' : 's'} ·{' '}
              {data.meta.days_with_activity} day{data.meta.days_with_activity === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
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

      <div className="min-h-0 flex-1 overflow-auto">
        <ProjectCalendarMonthGrid
          currentMonth={currentMonth}
          daysByKey={daysByKey}
          onDayClick={handleDayClick}
          onProjectClick={openProjectModal}
          density="widget"
        />
      </div>

      <div className={uiCx(uiLayout.actionsRow, 'mt-1.5 shrink-0 justify-end text-[10px]')}>
        <Link to={calendarHref} className="font-medium text-brand-red hover:underline">
          Open Project calendar →
        </Link>
      </div>

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
        detailBasePath={projectsPath}
        onClose={closeProjectModal}
      />
    </FadeInOnMount>
  );
}
