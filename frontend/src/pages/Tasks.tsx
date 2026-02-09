import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useNavigate, useLocation } from 'react-router-dom';
import TaskCard from '@/components/tasks/TaskCard';
import TaskModal from '@/components/tasks/TaskModal';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import ArchivedTasksModal from '@/components/tasks/ArchivedTasksModal';
import type { TaskBuckets } from '@/components/tasks/types';
import { sortTasksByPriority } from '@/components/tasks/taskUi';
import LoadingOverlay from '@/components/LoadingOverlay';

type SortBy = 'high-to-low' | 'low-to-high';

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

export default function TasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  const queryClient = useQueryClient();
  const lastTasksSyncRef = useMemo(() => ({ current: null as string | null }), []);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<TaskBuckets>('GET', '/tasks'),
    staleTime: 15_000,
  });

  // Lightweight polling: only refetch full /tasks when something actually changed server-side.
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
    [data]
  );
  const rawDone = data?.done || [];

  const tasksTodo = useMemo(
    () => sortTasksByPriority(rawTodo, prioritySortTodo),
    [rawTodo, prioritySortTodo]
  );
  const tasksInProgress = useMemo(
    () => sortTasksByPriority(rawInProgress, prioritySortInProgress),
    [rawInProgress, prioritySortInProgress]
  );
  const tasksDone = useMemo(
    () => sortTasksByPriority(rawDone, prioritySortDone),
    [rawDone, prioritySortDone]
  );

  // Check if we're still loading initial data (only show overlay if no data yet)
  const isInitialLoading = isLoading && !data;
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  // Track when animation completes to remove inline styles for hover to work
  useEffect(() => {
    if (hasAnimated) {
      const timer = setTimeout(() => setAnimationComplete(true), 400);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated]);

  // Track when initial data is loaded to trigger entry animations
  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, hasAnimated]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const inProgressCount = useCountUp(tasksInProgress.length, 550, !isInitialLoading);
  const todoCount = useCountUp(tasksTodo.length, 550, !isInitialLoading);
  const doneCount = useCountUp(tasksDone.length, 550, !isInitialLoading);

  const sectionCardStyle = (delayMs: number) =>
    animationComplete
      ? {}
      : {
          opacity: hasAnimated ? 1 : 0,
          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
          transition: `opacity 420ms ease-out ${delayMs}ms, transform 420ms ease-out ${delayMs}ms`,
        };

  const skeletonCards = (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-2/3" />
          <div className="mt-3 flex items-center justify-between">
            <div className="h-3 bg-gray-100 rounded w-24" />
            <div className="flex items-center gap-3">
              <div className="h-4 w-14 bg-gray-100 rounded-full" />
              <div className="h-3 w-3 bg-gray-100 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <LoadingOverlay isLoading={isInitialLoading} text="Loading tasks...">
      <div className="space-y-4">
        {/* Title Bar - same layout and font sizes as Projects / Customers */}
        <div className="rounded-xl border bg-white p-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div>
                <div className="text-sm font-semibold text-gray-900">Tasks</div>
                <div className="text-xs text-gray-500 mt-0.5">A simple checklist of what to do next.</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
          </div>
        </div>
        
        {/* Quick stats (dashboard-style) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            className="rounded-xl border border-gray-200 bg-white p-4 transition-all duration-200 ease-out hover:shadow-md"
            style={sectionCardStyle(0)}
          >
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">In Progress</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{inProgressCount}</div>
            <div className="text-[10px] text-gray-500 mt-1">Including blocked</div>
          </div>
          <div
            className="rounded-xl border border-gray-200 bg-white p-4 transition-all duration-200 ease-out hover:shadow-md"
            style={sectionCardStyle(60)}
          >
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">To Do</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{todoCount}</div>
            <div className="text-[10px] text-gray-500 mt-1">Ready to start</div>
          </div>
          <div
            className="rounded-xl border border-gray-200 bg-white p-4 transition-all duration-200 ease-out hover:shadow-md"
            style={sectionCardStyle(120)}
          >
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Done</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{doneCount}</div>
            <div className="text-[10px] text-gray-500 mt-1">Archive to keep list small</div>
          </div>
        </div>

        {fromHome && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/overview')}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-2"
              title="Back to Overview"
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="text-xs font-medium text-gray-700">Back to Overview</span>
            </button>
          </div>
        )}

        {/* Two-column layout for In Progress + To Do (Done below) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* To Do (left) */}
          <section
            className="rounded-xl border border-gray-200 bg-white overflow-hidden transition-all duration-200 ease-out hover:shadow-md"
            style={sectionCardStyle(180)}
          >
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-gray-900">To Do</div>
                <div className="text-xs text-gray-500">Ready to start.</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={prioritySortTodo}
                    onChange={(e) => setPrioritySortTodo(e.target.value as SortBy)}
                    onClick={(e) => e.stopPropagation()}
                    className="tasks-priority-select appearance-none rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2 py-1.5 pr-7 text-[11px] font-medium text-gray-600 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                    title="Sort by priority"
                  >
                    <option value="high-to-low">↑ Priority</option>
                    <option value="low-to-high">↓ Priority</option>
                  </select>
                  <svg
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <span className="text-xs text-gray-500">{tasksTodo.length} task(s)</span>
              </div>
            </div>
            <div className="p-4 space-y-3 max-h-[calc(4*140px)] overflow-y-auto">
              {isLoading ? (
                skeletonCards
              ) : (
                <>
                  {/* New Task Card - First position */}
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="w-full border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px]"
                  >
                    <div className="text-lg text-gray-400 mr-2">+</div>
                    <div className="font-medium text-xs text-gray-700">New Task</div>
                  </button>
                  {tasksTodo.length === 0 ? (
                    <div className="text-xs text-gray-500">Nothing to do right now.</div>
                  ) : (
                    tasksTodo.map((t) => (
                      <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
                    ))
                  )}
                </>
              )}
            </div>
          </section>

          {/* In Progress (right) */}
          <section
            className="rounded-xl border border-gray-200 bg-white overflow-hidden transition-all duration-200 ease-out hover:shadow-md"
            style={sectionCardStyle(240)}
          >
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-gray-900">In Progress</div>
                <div className="text-xs text-gray-500">Work that's currently underway.</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <select
                    value={prioritySortInProgress}
                    onChange={(e) => setPrioritySortInProgress(e.target.value as SortBy)}
                    onClick={(e) => e.stopPropagation()}
                    className="tasks-priority-select appearance-none rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2 py-1.5 pr-7 text-[11px] font-medium text-gray-600 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                    title="Sort by priority"
                  >
                    <option value="high-to-low">↑ Priority</option>
                    <option value="low-to-high">↓ Priority</option>
                  </select>
                  <svg
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <span className="text-xs text-gray-500">{tasksInProgress.length} task(s)</span>
              </div>
            </div>
            <div className="p-4 space-y-3 max-h-[calc(4*140px)] overflow-y-auto">
              {isLoading ? (
                skeletonCards
              ) : tasksInProgress.length === 0 ? (
                <div className="text-xs text-gray-500">
                  Nothing in progress. Pick a task from <span className="font-medium">To Do</span> and click{' '}
                  <span className="font-medium">Start task</span>.
                </div>
              ) : (
                tasksInProgress.map((t) => (
                  <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
                ))
              )}
            </div>
          </section>
        </div>

        {/* Done (full-width below) */}
        <section
          className="rounded-xl border border-gray-200 bg-white overflow-hidden transition-all duration-200 ease-out hover:shadow-md"
          style={sectionCardStyle(300)}
        >
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setDoneExpanded((v) => !v)}
              className="flex-1 text-left min-w-0"
            >
              <div>
                <div className="text-sm font-semibold text-gray-900">Done</div>
                <div className="text-xs text-gray-500">Completed tasks.</div>
              </div>
            </button>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={prioritySortDone}
                  onChange={(e) => setPrioritySortDone(e.target.value as SortBy)}
                  onClick={(e) => e.stopPropagation()}
                  className="tasks-priority-select appearance-none rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-2 py-1.5 pr-7 text-[11px] font-medium text-gray-600 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                  title="Sort by priority"
                >
                  <option value="high-to-low">↑ Priority</option>
                  <option value="low-to-high">↓ Priority</option>
                </select>
                <svg
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <span className="text-xs text-gray-500">{tasksDone.length} task(s)</span>
              <button
                type="button"
                onClick={() => setDoneExpanded((v) => !v)}
                className="text-xs font-medium text-brand-red"
              >
                {doneExpanded ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {doneExpanded && (
            <div className="p-4 space-y-3 max-h-[calc(4*140px)] overflow-y-auto">
              {isLoading ? (
                skeletonCards
              ) : tasksDone.length === 0 ? (
                <div className="text-xs text-gray-500">No completed tasks yet.</div>
              ) : (
                tasksDone.map((t) => (
                  <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
                ))
              )}
            </div>
          )}
        </section>

        {/* View Archived Button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setArchivedModalOpen(true)}
            className="rounded-lg px-3 py-2 border border-gray-200 hover:bg-gray-50 transition-colors text-xs font-medium text-gray-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            View archived tasks
          </button>
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

        <ArchivedTasksModal
          open={archivedModalOpen}
          onClose={() => setArchivedModalOpen(false)}
        />
      </div>
    </LoadingOverlay>
  );
}
