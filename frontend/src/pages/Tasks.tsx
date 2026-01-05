import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useNavigate, useLocation } from 'react-router-dom';
import TaskCard from '@/components/tasks/TaskCard';
import TaskModal from '@/components/tasks/TaskModal';
import CreateTaskModal from '@/components/tasks/CreateTaskModal';
import ArchivedTasksModal from '@/components/tasks/ArchivedTasksModal';
import type { TaskBuckets } from '@/components/tasks/types';

export default function TasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<TaskBuckets>('GET', '/tasks'),
    refetchInterval: 30_000,
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [archivedModalOpen, setArchivedModalOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const tasksInProgress = useMemo(
    () => [...(data?.in_progress || []), ...((data as any)?.blocked || [])],
    [data]
  );
  const tasksTodo = data?.accepted || [];
  const tasksDone = data?.done || [];

  return (
    <div className="space-y-6">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1.5">Tasks</h1>
          <p className="text-sm text-gray-600 font-medium">A simple checklist of what to do next.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm shadow-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New task
        </button>
      </div>
      
      {fromHome && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/home')}
            className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center gap-2"
            title="Back to Home"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm text-gray-700 font-medium">Back to Home</span>
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* In Progress */}
        <section className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200/60 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">In Progress</div>
              <div className="text-sm text-gray-500">Work that’s currently underway.</div>
            </div>
            <div className="text-sm text-gray-500">{tasksInProgress.length} task(s)</div>
          </div>
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : tasksInProgress.length === 0 ? (
              <div className="text-sm text-gray-500">Nothing in progress.</div>
            ) : (
              tasksInProgress.map((t) => (
                <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
              ))
            )}
          </div>
        </section>

        {/* To Do */}
        <section className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200/60 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">To Do</div>
              <div className="text-sm text-gray-500">Ready to start.</div>
            </div>
            <div className="text-sm text-gray-500">{tasksTodo.length} task(s)</div>
          </div>
          <div className="p-4 space-y-3">
            {isLoading ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : tasksTodo.length === 0 ? (
              <div className="text-sm text-gray-500">Nothing to do right now.</div>
            ) : (
              tasksTodo.map((t) => (
                <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
              ))
            )}
          </div>
        </section>

        {/* Done (collapsed) */}
        <section className="bg-white rounded-lg border border-gray-200/60 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setDoneExpanded((v) => !v)}
            className="w-full px-6 py-4 border-b border-gray-200/60 flex items-center justify-between gap-3 text-left"
          >
            <div>
              <div className="font-semibold text-gray-900">Done</div>
              <div className="text-sm text-gray-500">Completed tasks.</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-500">{tasksDone.length} task(s)</div>
              <div className="text-sm font-medium text-brand-red">{doneExpanded ? 'Hide' : 'Show'}</div>
            </div>
          </button>
          {doneExpanded && (
            <div className="p-4 space-y-3">
              {isLoading ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : tasksDone.length === 0 ? (
                <div className="text-sm text-gray-500">No completed tasks yet.</div>
              ) : (
                tasksDone.map((t) => (
                  <TaskCard key={t.id} task={t as any} onClick={() => setSelectedTaskId(t.id)} />
                ))
              )}
            </div>
          )}
        </section>
      </div>

      {/* View Archived Button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setArchivedModalOpen(true)}
          className="px-4 py-2 border border-gray-200/60 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 flex items-center gap-2"
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
  );
}

