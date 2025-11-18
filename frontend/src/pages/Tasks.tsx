import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type TaskBasic = {
  id: string;
  title: string;
  description?: string;
  status: 'accepted' | 'in_progress' | 'done';
  priority: string;
  due_date?: string | null;
  requested_by?: { id?: string | null; name?: string | null } | null;
  assigned_to?: { id?: string | null; name?: string | null; division?: string | null } | null;
  project?: { id?: string | null; name?: string | null; code?: string | null } | null;
  origin?: { type?: string; reference?: string | null; id?: string | null } | null;
  request?: { id: string; title: string; status: string } | null;
  created_at: string;
  started_at?: string | null;
  started_by?: { id?: string | null; name?: string | null } | null;
  concluded_at?: string | null;
  concluded_by?: { id?: string | null; name?: string | null } | null;
  permissions: {
    can_start: boolean;
    can_conclude: boolean;
  };
};

type TaskBuckets = {
  accepted: TaskBasic[];
  in_progress: TaskBasic[];
  done: TaskBasic[];
};

const originLabels: Record<string, string> = {
  manual_request: 'Manual request',
  system_order: 'System – Order',
  system_attendance: 'System – Attendance',
};

const priorityDot: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-500',
};

export default function TasksPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<TaskBuckets>('GET', '/tasks'),
    refetchInterval: 30_000,
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    accepted: false,
    in_progress: false,
    done: false,
  });

  const allTasks = useMemo(() => {
    if (!data) return [];
    return [...(data.accepted || []), ...(data.in_progress || []), ...(data.done || [])];
  }, [data]);

  useEffect(() => {
    if (!selectedTaskId && allTasks.length > 0) {
      setSelectedTaskId(allTasks[0].id);
    }
  }, [allTasks, selectedTaskId]);

  const selectedTask = allTasks.find((task) => task.id === selectedTaskId) || null;

  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const startMutation = useMutation({
    mutationFn: (taskId: string) => api('POST', `/tasks/${taskId}/start`, {}),
    onSuccess: () => {
      toast.success('Task started');
      invalidateTasks();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to start task'),
  });

  const concludeMutation = useMutation({
    mutationFn: (taskId: string) => api('POST', `/tasks/${taskId}/conclude`, {}),
    onSuccess: () => {
      toast.success('Task concluded');
      invalidateTasks();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to conclude task'),
  });

  const sections = [
    { key: 'accepted', title: 'To do', description: 'Ready to start' },
    { key: 'in_progress', title: 'In Progress', description: 'Currently being worked on' },
    { key: 'done', title: 'Done', description: 'Completed tasks' },
  ] as const;

  const handleSelectTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    if (window.innerWidth < 1024) {
      setMobileDetail(true);
    }
  };

  const currentDetail = selectedTask;

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Tasks</h1>
          <p className="text-gray-600">Track everything that has been accepted and needs action.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className={`lg:w-1/2 ${mobileDetail ? 'hidden lg:block' : 'block'}`}>
          {sections.map((section) => (
            <div key={section.key} className="mb-4 rounded-xl border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{section.title}</div>
                  <p className="text-sm text-gray-500">{section.description}</p>
                </div>
                <span className="text-sm text-gray-500">
                  {data ? (data[section.key] || []).length : 0} task(s)
                </span>
              </div>
              <div className="divide-y">
                {isLoading ? (
                  <div className="p-4 text-sm text-gray-500">Loading tasks...</div>
                ) : (data?.[section.key] || []).length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">Nothing here yet.</div>
                ) : (
                  <>
                    {(expandedSections[section.key]
                      ? (data?.[section.key] || [])
                      : (data?.[section.key] || []).slice(0, 5)
                    ).map((task) => (
                      <button
                        key={task.id}
                        onClick={() => handleSelectTask(task.id)}
                        className={`w-full text-left p-4 hover:bg-gray-50 flex flex-col gap-2 ${
                          selectedTaskId === task.id ? 'bg-gray-50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-gray-900">{task.title}</div>
                          <span
                            className={`text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border ${
                              task.status === 'done'
                                ? 'bg-green-100 text-green-700 border-green-200'
                                : task.status === 'in_progress'
                                ? 'bg-blue-100 text-blue-700 border-blue-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {section.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                priorityDot[task.priority] || priorityDot.normal
                              }`}
                            />
                            Priority {task.priority}
                          </span>
                          {task.due_date && (
                            <span>Due {new Date(task.due_date).toLocaleDateString()}</span>
                          )}
                          {task.origin?.type && (
                            <span>{originLabels[task.origin.type] || task.origin.type}</span>
                          )}
                        </div>
                      </button>
                    ))}
                    {(data?.[section.key] || []).length > 5 && (
                      <button
                        onClick={() =>
                          setExpandedSections((prev) => ({
                            ...prev,
                            [section.key]: !prev[section.key],
                          }))
                        }
                        className="w-full py-2 text-sm font-medium text-brand-red hover:text-red-700 transition-colors"
                      >
                        {expandedSections[section.key] ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={`lg:w-1/2 ${mobileDetail ? 'block' : 'hidden lg:block'}`}>
          <div className="rounded-xl border bg-white h-full flex flex-col">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">Task details</div>
                <p className="text-sm text-gray-500">
                  {currentDetail ? 'Review status and update progress.' : 'Select a task.'}
                </p>
              </div>
              <button
                className="lg:hidden text-sm text-blue-600"
                onClick={() => setMobileDetail(false)}
              >
                Back to list
              </button>
            </div>
            {isLoading ? (
              <div className="p-6 text-sm text-gray-500">Loading...</div>
            ) : !currentDetail ? (
              <div className="p-6 text-sm text-gray-500">Select a task from the left.</div>
            ) : (
              <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-semibold">{currentDetail.title}</h2>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        currentDetail.status === 'done'
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : currentDetail.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {currentDetail.status.replace('_', ' ')}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border bg-white text-gray-700 flex items-center gap-1`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          priorityDot[currentDetail.priority] || priorityDot.normal
                        }`}
                      />
                      Priority {currentDetail.priority}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 flex flex-wrap gap-4">
                    {currentDetail.requested_by?.name && (
                      <span>
                        Requested by <strong>{currentDetail.requested_by.name}</strong>
                      </span>
                    )}
                    {currentDetail.assigned_to?.name && (
                      <span>
                        Assigned to <strong>{currentDetail.assigned_to.name}</strong>
                      </span>
                    )}
                    {currentDetail.project?.name && (
                      <span>
                        Project{' '}
                        <strong>
                          {currentDetail.project.code ? `${currentDetail.project.code} • ` : ''}
                          {currentDetail.project.name}
                        </strong>
                      </span>
                    )}
                    {currentDetail.due_date && (
                      <span>
                        Due <strong>{new Date(currentDetail.due_date).toLocaleDateString()}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {currentDetail.origin?.type && (
                  <div className="text-xs uppercase tracking-wide text-gray-500">
                    Source:{' '}
                    <span className="font-semibold text-gray-700">
                      {originLabels[currentDetail.origin.type] || currentDetail.origin.type}
                    </span>
                    {currentDetail.origin.reference && (
                      <span className="ml-1 text-gray-500">({currentDetail.origin.reference})</span>
                    )}
                  </div>
                )}

                {currentDetail.request && (
                  <div className="rounded border bg-gray-50 p-3 text-sm text-gray-700">
                    <div className="text-xs text-gray-500 uppercase">Task Request</div>
                    <div className="font-medium text-gray-900">{currentDetail.request.title}</div>
                    <div className="text-xs text-gray-600">
                      Status: {currentDetail.request.status.replace('_', ' ')}
                    </div>
                  </div>
                )}

                {currentDetail.description && (
                  <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap">
                    {currentDetail.description}
                  </div>
                )}

                <div className="space-y-2 text-sm text-gray-600">
                  {currentDetail.started_at && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700">Started:</span>
                      <span>
                        {new Date(currentDetail.started_at).toLocaleString()}{' '}
                        {currentDetail.started_by?.name && `by ${currentDetail.started_by.name}`}
                      </span>
                    </div>
                  )}
                  {currentDetail.concluded_at && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700">Completed:</span>
                      <span>
                        {new Date(currentDetail.concluded_at).toLocaleString()}{' '}
                        {currentDetail.concluded_by?.name && `by ${currentDetail.concluded_by.name}`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {currentDetail.permissions.can_start && (
                    <button
                      onClick={() => startMutation.mutate(currentDetail.id)}
                      disabled={startMutation.isLoading}
                      className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
                    >
                      {startMutation.isLoading ? 'Starting...' : 'Start Task'}
                    </button>
                  )}
                  {currentDetail.permissions.can_conclude && (
                    <button
                      onClick={() => concludeMutation.mutate(currentDetail.id)}
                      disabled={concludeMutation.isLoading}
                      className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-60"
                    >
                      {concludeMutation.isLoading ? 'Finishing...' : 'Conclude Task'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

