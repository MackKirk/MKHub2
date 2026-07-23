import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import { Archive, ArrowLeft, ClipboardList } from 'lucide-react';
import TaskCard from '@/components/tasks/TaskCard';
import TaskModal from '@/components/tasks/TaskModal';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import ArchivedTasksModal from '@/components/tasks/ArchivedTasksModal';
import type { TaskBuckets } from '@/components/tasks/types';
import { sortTasksByPriority } from '@/components/tasks/taskUi';
import LoadingOverlay from '@/components/LoadingOverlay';
import {
  AppButton,
  AppCard,
  AppListCreateItem,
  AppPageHeader,
  AppSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type SortBy = 'high-to-low' | 'low-to-high';

const prioritySortOptions = [
  { value: 'high-to-low', label: '↑ Priority' },
  { value: 'low-to-high', label: '↓ Priority' },
] as const;

const TASK_COLUMN_SCROLL_MAX = 'max-h-[calc(4*140px)]';

function useCountUp(end: number, duration: number = 500, enabled: boolean = true): number {
  const [count, setCount] = useState(0);
  const startTimeRef = useMemo(() => ({ current: null as number | null }), []);
  const animationFrameRef = useMemo(() => ({ current: null as number | null }), []);
  const prevEndRef = useMemo(() => ({ current: end }), []);

  useEffect(() => {
    if (!enabled) {
      setCount(end);
      return;
    }
    if (end === 0) {
      setCount(0);
      return;
    }

    if (prevEndRef.current !== end) {
      setCount(0);
      prevEndRef.current = end;
    }

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) startTimeRef.current = currentTime;
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(end * eased));
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      startTimeRef.current = null;
    };
  }, [end, duration, enabled, startTimeRef, animationFrameRef, prevEndRef]);

  return count;
}

function PrioritySortSelect({
  value,
  onChange,
}: {
  value: SortBy;
  onChange: (value: SortBy) => void;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <AppSelect
        value={value}
        onChange={(e) => onChange(e.target.value as SortBy)}
        options={[...prioritySortOptions]}
        triggerClassName="!w-auto min-w-[7.5rem] !py-1.5 text-[11px] font-medium"
        aria-label="Sort by priority"
      />
    </div>
  );
}

function TaskColumnSkeleton() {
  return (
    <div className={uiSpacing.sectionStack}>
      {[0, 1, 2].map((i) => (
        <div key={i} className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, uiSpacing.cardPadding, 'animate-pulse')}>
          <div className="h-4 w-2/3 rounded bg-gray-100" />
          <div className="mt-3 flex items-center justify-between">
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="flex items-center gap-3">
              <div className="h-4 w-14 rounded-full bg-gray-100" />
              <div className="h-3 w-3 rounded-full bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  const navigateBackToOverview = useNavigateBack('/overview');
  const queryClient = useQueryClient();
  const lastTasksSyncRef = useMemo(() => ({ current: null as string | null }), []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api<TaskBuckets>('GET', '/tasks?limit=300');
      if (res && typeof res === 'object') {
        return {
          accepted: Array.isArray(res.accepted) ? res.accepted : [],
          in_progress: Array.isArray(res.in_progress) ? res.in_progress : [],
          blocked: Array.isArray((res as any).blocked) ? (res as any).blocked : [],
          done: Array.isArray(res.done) ? res.done : [],
        };
      }
      return { accepted: [], in_progress: [], blocked: [], done: [] };
    },
    staleTime: 15_000,
  });

  useQuery({
    queryKey: ['tasks-sync'],
    queryFn: () => api<{ latest_task_updated_at: string | null }>('GET', '/tasks/sync'),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    enabled: true,
    onSuccess: (res) => {
      const next = res?.latest_task_updated_at || null;
      const prev = lastTasksSyncRef.current;
      if (prev === null) {
        lastTasksSyncRef.current = next;
        return;
      }
      if (next && next !== prev) {
        lastTasksSyncRef.current = next;
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      }
    },
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [archivedModalOpen, setArchivedModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [prioritySortTodo, setPrioritySortTodo] = useState<SortBy>('high-to-low');
  const [prioritySortInProgress, setPrioritySortInProgress] = useState<SortBy>('high-to-low');
  const [prioritySortDone, setPrioritySortDone] = useState<SortBy>('high-to-low');

  const rawTodo = data?.accepted || [];
  const rawInProgress = useMemo(
    () => [...(data?.in_progress || []), ...((data as any)?.blocked || [])],
    [data],
  );
  const rawDone = data?.done || [];

  const tasksTodo = useMemo(
    () => sortTasksByPriority(rawTodo, prioritySortTodo),
    [rawTodo, prioritySortTodo],
  );
  const tasksInProgress = useMemo(
    () => sortTasksByPriority(rawInProgress, prioritySortInProgress),
    [rawInProgress, prioritySortInProgress],
  );
  const tasksDone = useMemo(
    () => sortTasksByPriority(rawDone, prioritySortDone),
    [rawDone, prioritySortDone],
  );

  const isInitialLoading = isLoading && !data;

  const inProgressCount = useCountUp(tasksInProgress.length, 550, !isInitialLoading);
  const todoCount = useCountUp(tasksTodo.length, 550, !isInitialLoading);
  const doneCount = useCountUp(tasksDone.length, 550, !isInitialLoading);

  return (
    <LoadingOverlay isLoading={isInitialLoading} text="Loading tasks...">
      <main className={uiCx('min-w-0 bg-gray-50', uiSpacing.pageStack)}>
        <AppPageHeader
          title="Tasks"
          subtitle="A simple checklist of what to do next."
          icon={<ClipboardList className="h-4 w-4" />}
        />

        {isError && (
          <AppCard
            className="border-red-200 bg-red-50"
            bodyClassName={uiCx(uiSpacing.cardPadding, 'flex flex-wrap items-center justify-between gap-3')}
          >
            <p className={uiCx(uiTypography.body, 'text-red-800')}>
              Failed to load tasks. {(error as Error)?.message || 'Please try again.'}
            </p>
            <AppButton variant="danger" size="sm" type="button" onClick={() => refetch()}>
              Retry
            </AppButton>
          </AppCard>
        )}

        <div className={uiLayout.sectionGrid3}>
          <AppCard className={uiCx(uiShadows.card, 'transition-shadow hover:shadow-md')} bodyClassName={uiSpacing.cardPadding}>
            <div className={uiTypography.overline}>In Progress</div>
            <div className={uiCx('mt-1 text-2xl font-bold', uiTypography.pageTitle)}>{inProgressCount}</div>
            <div className={uiCx(uiTypography.overline, 'mt-1 font-normal normal-case tracking-normal')}>
              Including blocked
            </div>
          </AppCard>
          <AppCard className={uiCx(uiShadows.card, 'transition-shadow hover:shadow-md')} bodyClassName={uiSpacing.cardPadding}>
            <div className={uiTypography.overline}>To Do</div>
            <div className={uiCx('mt-1 text-2xl font-bold', uiTypography.pageTitle)}>{todoCount}</div>
            <div className={uiCx(uiTypography.overline, 'mt-1 font-normal normal-case tracking-normal')}>
              Ready to start
            </div>
          </AppCard>
          <AppCard className={uiCx(uiShadows.card, 'transition-shadow hover:shadow-md')} bodyClassName={uiSpacing.cardPadding}>
            <div className={uiTypography.overline}>Done</div>
            <div className={uiCx('mt-1 text-2xl font-bold', uiTypography.pageTitle)}>{doneCount}</div>
            <div className={uiCx(uiTypography.overline, 'mt-1 font-normal normal-case tracking-normal')}>
              Archive to keep list small
            </div>
          </AppCard>
        </div>

        {fromHome && (
          <div className="flex items-center justify-between">
            <AppButton
              variant="secondary"
              size="sm"
              type="button"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={navigateBackToOverview}
              title="Back"
            >
              Back
            </AppButton>
          </div>
        )}

        <div className={uiLayout.pageTwoColumn}>
          <AppCard
            className="min-h-0 overflow-hidden"
            title="To Do"
            subtitle="Ready to start."
            actions={
              <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                <PrioritySortSelect value={prioritySortTodo} onChange={setPrioritySortTodo} />
                <span className={uiTypography.helper}>{tasksTodo.length} task(s)</span>
              </div>
            }
            bodyClassName={uiCx(uiSpacing.sectionStack, TASK_COLUMN_SCROLL_MAX, 'overflow-y-auto')}
          >
            {isLoading ? (
              <TaskColumnSkeleton />
            ) : (
              <>
                <AppListCreateItem label="New Task" layout="row" className="w-full" onClick={() => setCreateOpen(true)} />
                {tasksTodo.length === 0 ? (
                  <p className={uiTypography.helper}>Nothing to do right now.</p>
                ) : (
                  tasksTodo.map((t) => (
                    <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
                  ))
                )}
              </>
            )}
          </AppCard>

          <AppCard
            className="min-h-0 overflow-hidden"
            title="In Progress"
            subtitle="Work that's currently underway."
            actions={
              <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                <PrioritySortSelect value={prioritySortInProgress} onChange={setPrioritySortInProgress} />
                <span className={uiTypography.helper}>{tasksInProgress.length} task(s)</span>
              </div>
            }
            bodyClassName={uiCx(uiSpacing.sectionStack, TASK_COLUMN_SCROLL_MAX, 'overflow-y-auto')}
          >
            {isLoading ? (
              <TaskColumnSkeleton />
            ) : tasksInProgress.length === 0 ? (
              <p className={uiTypography.helper}>
                Nothing in progress. Pick a task from <span className="font-medium text-gray-800">To Do</span> and click{' '}
                <span className="font-medium text-gray-800">Start task</span>.
              </p>
            ) : (
              tasksInProgress.map((t) => (
                <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
              ))
            )}
          </AppCard>
        </div>

        <AppCard
          className="min-h-0 overflow-hidden"
          title="Done"
          subtitle="Completed tasks."
          actions={
            <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
              <PrioritySortSelect value={prioritySortDone} onChange={setPrioritySortDone} />
              <span className={uiTypography.helper}>{tasksDone.length} task(s)</span>
              <AppButton variant="ghost" size="sm" type="button" onClick={() => setDoneExpanded((v) => !v)}>
                {doneExpanded ? 'Hide' : 'Show'}
              </AppButton>
            </div>
          }
          bodyClassName={
            doneExpanded
              ? uiCx(uiSpacing.sectionStack, TASK_COLUMN_SCROLL_MAX, 'overflow-y-auto')
              : 'hidden'
          }
        >
          {doneExpanded &&
            (isLoading ? (
              <TaskColumnSkeleton />
            ) : tasksDone.length === 0 ? (
              <p className={uiTypography.helper}>No completed tasks yet.</p>
            ) : (
              tasksDone.map((t) => (
                <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
              ))
            ))}
        </AppCard>

        <div className="flex justify-center">
          <AppButton
            variant="secondary"
            size="sm"
            type="button"
            leftIcon={<Archive className="h-4 w-4" />}
            onClick={() => setArchivedModalOpen(true)}
          >
            View archived tasks
          </AppButton>
        </div>

        <TaskModal
          open={!!selectedTaskId}
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={() => queryClient.invalidateQueries({ queryKey: ['tasks'] })}
        />

        <CreateTaskModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(t) => {
            setCreateOpen(false);
            setSelectedTaskId(t.id);
          }}
        />

        <ArchivedTasksModal open={archivedModalOpen} onClose={() => setArchivedModalOpen(false)} />
      </main>
    </LoadingOverlay>
  );
}
