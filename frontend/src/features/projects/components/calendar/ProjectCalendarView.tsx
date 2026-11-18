import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Palette } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  AppButton,
  AppEmptyState,
  AppSectionHeader,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';
import { CreateShiftModal } from '@/components/DispatchTab';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { employeesDirectoryQueryKey, fetchEmployeesDirectory } from '@/lib/employeesQuery';
import { jobTypeSelectOptions } from '@/lib/jobTypes';
import {
  hasProjectFeatureWritePermission,
  hasProjectLineWritePermission,
  isAdminRole,
} from '@/lib/projectLinePermissionKeys';
import { useProjectCalendarData } from '../../hooks/useProjectCalendarData';
import {
  useInProgressProjectsForSchedule,
  type ScheduleRailProject,
} from '../../hooks/useInProgressProjectsForSchedule';
import { ProjectCalendarDayPanel } from './ProjectCalendarDayPanel';
import { ProjectCalendarMonthGrid } from './ProjectCalendarMonthGrid';
import { ProjectCalendarProjectModal } from './ProjectCalendarProjectModal';
import {
  ProjectCalendarScheduleRail,
  ProjectDragCard,
  readRailCollapsed,
  writeRailCollapsed,
} from './ProjectCalendarScheduleRail';
import { parseDayDropId, parseProjectDragId } from './projectCalendar.dnd';
import type { ProjectCalendarDayEntry } from './projectCalendar.types';
import {
  collectPrimaryDivisionsFromDays,
  divisionSwatchColor,
} from './projectCalendar.utils';

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
  const location = useLocation();
  const queryClient = useQueryClient();

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
  const [railCollapsed, setRailCollapsed] = useState(() => readRailCollapsed(businessLine));
  const [activeProject, setActiveProject] = useState<ScheduleRailProject | null>(null);
  const [createTarget, setCreateTarget] = useState<{ projectId: string; date: string } | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  useEffect(() => {
    setRailCollapsed(readRailCollapsed(businessLine));
  }, [businessLine]);

  useEffect(() => {
    setLegendOpen(false);
  }, [currentMonth, businessLine]);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 5 * 60 * 1000,
  });
  const isAdmin = isAdminRole(me?.roles);
  const permissions = useMemo(
    () => new Set<string>((me?.permissions || []) as string[]),
    [me?.permissions],
  );
  const canWriteWorkload = hasProjectFeatureWritePermission(
    permissions,
    businessLine,
    'workload',
    isAdmin,
  );
  const canEditOnsiteLeads = hasProjectLineWritePermission(
    permissions,
    businessLine,
    isAdmin,
    location.pathname,
  );

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

  const {
    projects: railProjects,
    isLoading: railLoading,
  } = useInProgressProjectsForSchedule(businessLine, canWriteWorkload);

  const {
    data: createProject,
    isLoading: createProjectLoading,
    isError: createProjectError,
    error: createProjectErr,
  } = useQuery({
    queryKey: ['project', createTarget?.projectId],
    queryFn: () => api<any>('GET', `/projects/${createTarget!.projectId}`),
    enabled: !!createTarget?.projectId,
  });

  useEffect(() => {
    if (!createTarget || !createProjectError) return;
    toast.error(
      createProjectErr instanceof Error
        ? createProjectErr.message
        : 'Could not load project for create shift',
    );
    setCreateTarget(null);
  }, [createTarget, createProjectError, createProjectErr]);

  const { data: employees, isPending: employeesLoading } = useQuery({
    queryKey: employeesDirectoryQueryKey({ limit: 5000 }),
    queryFn: () => fetchEmployeesDirectory({ limit: 5000 }),
    staleTime: 5 * 60 * 1000,
    enabled: !!createTarget,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, any[]>>('GET', '/settings'),
    staleTime: 5 * 60 * 1000,
    enabled: !!createTarget,
  });

  const defaultBreakMin = useMemo(() => {
    if (!settings) return 30;
    const timesheetItems = (settings.timesheet || []) as any[];
    const breakItem = timesheetItems.find((i: any) => i.label === 'default_break_minutes');
    const value = breakItem?.value ? parseInt(breakItem.value, 10) : 30;
    return Number.isNaN(value) ? 30 : value;
  }, [settings]);

  const defaultGeofenceRadius = useMemo(() => {
    if (!settings) return 150;
    const timesheetItems = (settings.timesheet || []) as any[];
    const radiusItem = timesheetItems.find((i: any) => i.label === 'default_geofence_radius_meters');
    const value = radiusItem?.value ? parseInt(radiusItem.value, 10) : 150;
    return Number.isNaN(value) ? 150 : value;
  }, [settings]);

  const jobTypeOptions = useMemo(
    () => jobTypeSelectOptions(settings?.job_types),
    [settings?.job_types],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;
  const daysByKey = data?.days ?? {};
  const dragActive = activeProject != null;
  const divisionLegend = useMemo(
    () => collectPrimaryDivisionsFromDays(daysByKey),
    [daysByKey],
  );

  const goToPreviousMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () =>
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const handleDayClick = (date: Date, entries: ProjectCalendarDayEntry[]) => {
    if (dragActive) return;
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

  const handleRailCollapsedChange = (collapsed: boolean) => {
    setRailCollapsed(collapsed);
    writeRailCollapsed(businessLine, collapsed);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const projectId = parseProjectDragId(event.active.id);
    if (!projectId) return;
    const fromData = event.active.data.current?.project as ScheduleRailProject | undefined;
    const fromList = railProjects.find((p) => p.id === projectId);
    setActiveProject(fromData || fromList || { id: projectId });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const projectId = parseProjectDragId(event.active.id);
    const dayKey = parseDayDropId(event.over?.id);
    setActiveProject(null);
    if (!projectId || !dayKey || !canWriteWorkload) return;
    setCreateTarget({ projectId, date: dayKey });
  };

  const handleDragCancel = () => {
    setActiveProject(null);
  };

  const closeCreateModal = () => setCreateTarget(null);

  const calendarMain = (
    <div className="min-w-0 flex-1">
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
        <div className={uiCx(uiLayout.actionsRow, 'relative flex-wrap justify-end')}>
          {divisionLegend.length > 0 ? (
            <div className="relative">
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setLegendOpen((open) => !open)}
                aria-expanded={legendOpen}
                aria-haspopup="dialog"
              >
                <Palette className="h-3.5 w-3.5" aria-hidden />
                Legend
              </AppButton>
              {legendOpen ? (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10 cursor-default"
                    aria-label="Close legend"
                    onClick={() => setLegendOpen(false)}
                  />
                  <div
                    className={uiCx(
                      'absolute right-0 top-full z-20 mt-1.5 w-64 border bg-white p-3 shadow-lg',
                      uiBorders.subtle,
                      uiRadius.card,
                    )}
                    role="dialog"
                    aria-label="Division color legend"
                  >
                    <div className={uiCx(uiTypography.overline, 'mb-2 text-gray-500')}>Divisions</div>
                    <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                      {divisionLegend.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-sm text-gray-800">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                            style={{
                              backgroundColor: divisionSwatchColor(d.color, d.id),
                            }}
                            aria-hidden
                          />
                          <span className="min-w-0 truncate">{d.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
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
          enableDropTargets={canWriteWorkload}
          dragActive={dragActive}
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
    </div>
  );

  return (
    <>
      <AppSectionHeader
        {...appSectionPresetProps('projects')}
        title="Project calendar"
        description={
          canWriteWorkload
            ? 'Drag an in-progress project onto a day to create a shift. Leadership roles shown on each project; workers from workload shifts.'
            : 'Active projects and scheduled workers by day. Leadership roles shown on each project; workers from workload shifts.'
        }
      />

      {canWriteWorkload ? (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="relative flex gap-3">
            {/* Width spacer only — rail is absolutely sized to the calendar column height. */}
            <div
              className={uiCx('shrink-0', railCollapsed ? 'w-10' : 'w-[260px]')}
              aria-hidden
            />
            <div
              className={uiCx(
                'absolute bottom-0 left-0 top-0 z-[1]',
                railCollapsed ? 'w-10' : 'w-[260px]',
              )}
            >
              <ProjectCalendarScheduleRail
                projects={railProjects}
                isLoading={railLoading}
                activeProjectId={activeProject?.id ?? null}
                collapsed={railCollapsed}
                onCollapsedChange={handleRailCollapsedChange}
              />
            </div>
            {calendarMain}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
            {activeProject ? <ProjectDragCard project={activeProject} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        calendarMain
      )}

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

      {createTarget && createProject && !createProjectLoading ? (
        <CreateShiftModal
          projectId={createTarget.projectId}
          project={createProject}
          employees={Array.isArray(employees) ? employees : []}
          employeesLoading={employeesLoading}
          defaultBreakMin={defaultBreakMin}
          defaultGeofenceRadius={defaultGeofenceRadius}
          designSystem
          jobTypeOptions={jobTypeOptions}
          canEditOnsiteLeads={canEditOnsiteLeads}
          initialDate={createTarget.date}
          onClose={closeCreateModal}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['projects', 'calendar'] });
            closeCreateModal();
          }}
        />
      ) : null}
    </>
  );
}
