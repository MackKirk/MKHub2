import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDraggable } from '@dnd-kit/core';
import { ChevronDown, ChevronLeft, ChevronRight, GripVertical, Loader2, Search } from 'lucide-react';
import {
  AppInput,
  AppTooltip,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiTypography,
} from '@/components/ui';
import { api } from '@/lib/api';
import {
  filterProjectDivisionsForBusinessLine,
  PROJECT_DIVISIONS_QUERY_KEY,
} from '@/lib/businessLine';
import type { ScheduleRailProject } from '../../hooks/useInProgressProjectsForSchedule';
import { projectDragId } from './projectCalendar.dnd';
import { divisionSwatchColor } from './projectCalendar.utils';
import {
  flattenDivisionCatalog,
  groupProjectsByDivisionSections,
  readSectionCollapsedMap,
  writeSectionCollapsedMap,
  type RailDivisionNode,
} from './projectCalendarRail.utils';

const STORAGE_PREFIX = 'mkhub.projectCalendar.scheduleRail.collapsed.';

export function readRailCollapsed(businessLine: string): boolean {
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${businessLine}`) === '1';
  } catch {
    return false;
  }
}

export function writeRailCollapsed(businessLine: string, collapsed: boolean) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${businessLine}`, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function ProjectDragCard({
  project,
  isOverlay = false,
}: {
  project: ScheduleRailProject;
  isOverlay?: boolean;
}) {
  const title = project.name || 'Project';
  const code = project.code?.trim() || null;
  const card = (
    <div
      className={uiCx(
        'flex items-start gap-2 border bg-white px-2.5 py-2',
        uiRadius.control,
        isOverlay
          ? 'scale-[1.04] rotate-[1.5deg] border-gray-200 shadow-xl opacity-95'
          : 'border-gray-200 shadow-sm',
      )}
    >
      <GripVertical
        className={uiCx('mt-0.5 h-4 w-4 shrink-0', isOverlay ? 'text-gray-400' : 'text-gray-300')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {code ? (
          <div className={uiCx(uiTypography.helper, 'truncate font-semibold text-gray-500')}>{code}</div>
        ) : null}
        <div className="truncate text-sm font-semibold text-gray-900">{title}</div>
      </div>
    </div>
  );

  if (isOverlay) return card;

  return (
    <AppTooltip
      wrap
      constrain
      content={
        <div className="max-w-xs space-y-0.5 text-left">
          {code ? <div className="font-semibold">{code}</div> : null}
          <div className="font-normal whitespace-pre-wrap">{title}</div>
        </div>
      }
      placement="top"
    >
      {card}
    </AppTooltip>
  );
}

function DraggableRailItem({
  project,
  sectionKey,
  isActive,
}: {
  project: ScheduleRailProject;
  sectionKey: string;
  isActive: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: projectDragId(project.id, sectionKey),
    data: { project },
  });
  const faded = isDragging || isActive;

  return (
    <div
      ref={setNodeRef}
      className={uiCx(
        'relative touch-none',
        faded && 'opacity-40 scale-[0.98]',
        'transition-[opacity,transform] duration-150',
      )}
    >
      {faded ? (
        <div
          className={uiCx(
            'pointer-events-none absolute inset-0 border border-dashed border-gray-300 bg-gray-50/80',
            uiRadius.control,
          )}
          aria-hidden
        />
      ) : null}
      <button
        type="button"
        className={uiCx(
          'w-full cursor-grab text-left active:cursor-grabbing',
          faded && 'invisible',
        )}
        {...listeners}
        {...attributes}
      >
        <ProjectDragCard project={project} />
      </button>
    </div>
  );
}

type Props = {
  projects: ScheduleRailProject[];
  isLoading: boolean;
  activeProjectId: string | null;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  businessLine: string;
};

export function ProjectCalendarScheduleRail({
  projects,
  isLoading,
  activeProjectId,
  collapsed,
  onCollapsedChange,
  businessLine,
}: Props) {
  const [search, setSearch] = useState('');
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>(() =>
    readSectionCollapsedMap(businessLine),
  );

  useEffect(() => {
    setSectionCollapsed(readSectionCollapsedMap(businessLine));
  }, [businessLine]);

  const { data: divisionTree, isLoading: divisionsLoading } = useQuery({
    queryKey: PROJECT_DIVISIONS_QUERY_KEY,
    queryFn: () => api<RailDivisionNode[]>('GET', '/settings/project-divisions'),
    staleTime: 300_000,
  });

  const catalog = useMemo(() => {
    const filtered = filterProjectDivisionsForBusinessLine(divisionTree || [], businessLine);
    return flattenDivisionCatalog(filtered as RailDivisionNode[]);
  }, [divisionTree, businessLine]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const hay = `${p.code || ''} ${p.name || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [projects, search]);

  const sections = useMemo(
    () => groupProjectsByDivisionSections(filtered, catalog),
    [filtered, catalog],
  );

  const toggleSection = (sectionId: string) => {
    setSectionCollapsed((prev) => {
      // Default collapsed when key is missing
      const currentlyCollapsed = prev[sectionId] ?? true;
      const next = { ...prev, [sectionId]: !currentlyCollapsed };
      writeSectionCollapsedMap(businessLine, next);
      return next;
    });
  };

  if (collapsed) {
    return (
      <aside
        className={uiCx(
          'flex h-full min-h-0 w-full flex-col items-center overflow-hidden border bg-white py-2',
          uiBorders.subtle,
          uiRadius.card,
        )}
      >
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="Expand schedule rail"
          title="Schedule projects"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <div
          className="mt-3 writing-mode-vertical text-[11px] font-semibold uppercase tracking-wide text-gray-500"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Schedule
        </div>
        {projects.length > 0 ? (
          <span className="mt-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
            {projects.length}
          </span>
        ) : null}
      </aside>
    );
  }

  const listLoading = isLoading || divisionsLoading;

  return (
    <aside
      className={uiCx(
        'flex h-full min-h-0 w-full flex-col overflow-hidden border bg-white',
        uiBorders.subtle,
        uiColors.surface,
        uiRadius.card,
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">Schedule</div>
          <div className={uiCx(uiTypography.helper, 'text-gray-500')}>
            In progress · {projects.length}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="Collapse schedule rail"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </header>

      <div className="shrink-0 border-b border-gray-100 px-3 py-2">
        <AppInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects…"
          leftIcon={<Search className="h-3.5 w-3.5" aria-hidden />}
          aria-label="Search in-progress projects"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {listLoading ? (
          <p className={uiCx(uiTypography.helper, 'flex items-center gap-2 px-1 py-4 text-gray-500')}>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading projects…
          </p>
        ) : filtered.length === 0 ? (
          <p className={uiCx(uiTypography.helper, 'px-1 py-4 text-gray-500')}>
            {projects.length === 0
              ? 'No in-progress projects.'
              : 'No projects match your search.'}
          </p>
        ) : (
          sections.map((section) => {
            // While searching, expand every section that still has matches
            const isSectionCollapsed = search.trim()
              ? false
              : (sectionCollapsed[section.id] ?? true);
            return (
              <div key={section.id} className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className={uiCx(
                    'flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-gray-50',
                  )}
                  aria-expanded={!isSectionCollapsed}
                >
                  <ChevronDown
                    className={uiCx(
                      'h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform',
                      isSectionCollapsed && '-rotate-90',
                    )}
                    aria-hidden
                  />
                  <span
                    className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{
                      backgroundColor: divisionSwatchColor(section.color, section.id),
                    }}
                    aria-hidden
                  />
                  <span className={uiCx('min-w-0 flex-1 truncate', uiTypography.controlLabel)}>
                    {section.label}
                  </span>
                  <span className={uiCx(uiTypography.helper, 'shrink-0 tabular-nums text-gray-500')}>
                    {section.projects.length}
                  </span>
                </button>
                {!isSectionCollapsed ? (
                  <div className="space-y-2 pl-1">
                    {section.projects.map((project) => (
                      <DraggableRailItem
                        key={`${section.id}:${project.id}`}
                        project={project}
                        sectionKey={section.id}
                        isActive={activeProjectId === project.id}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <footer className={uiCx(uiTypography.helper, 'shrink-0 border-t border-gray-100 px-3 py-2 text-gray-500')}>
        Drag a project onto a day to create a shift.
      </footer>
    </aside>
  );
}
