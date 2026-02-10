import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { TaskBuckets } from '@/components/tasks/types';
import { sortTasksByPriority } from '@/components/tasks/taskUi';

type ListTasksWidgetProps = {
  config?: { limit?: number };
};

const STATUS_BADGE: Record<string, string> = {
  accepted: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  blocked: 'bg-red-100 text-red-800',
  done: 'bg-green-100 text-green-800',
};

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border border-red-200',
  low: 'bg-gray-100 text-gray-600',
  normal: '',
};

export function ListTasksWidget({ config }: ListTasksWidgetProps) {
  const limit = Math.min(Math.max(1, config?.limit ?? 5), 20);

  const { data, isLoading, error } = useQuery<TaskBuckets>({
    queryKey: ['home-list-tasks'],
    queryFn: () => api('GET', '/tasks'),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
          Loading…
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <div className="flex-1 min-h-0 flex items-center justify-center p-3">
          <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm text-red-600">
            Failed to load tasks
          </div>
        </div>
      </div>
    );
  }

  const accepted = data?.accepted ?? [];
  const inProgress = data?.in_progress ?? [];
  const blocked = data?.blocked ?? [];
  const done = data?.done ?? [];
  const all = [...accepted, ...inProgress, ...blocked, ...done];
  const sorted = sortTasksByPriority(all).slice(0, limit);

  const itemStyle = {
    padding: 'clamp(0.375rem, 3cqh, 0.75rem)',
  };
  const titleStyle = { fontSize: 'clamp(0.625rem, 5cqh, 0.875rem)' };
  const badgeStyle = { fontSize: 'clamp(0.5rem, 3.5cqh, 0.625rem)', padding: 'clamp(0.125rem, 1cqh, 0.25rem) 0.375rem' };
  const viewAllStyle = { fontSize: 'clamp(0.5rem, 4cqh, 0.75rem)' };

  return (
    <div className="flex flex-col min-h-0 h-full w-full">
      <ul className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1" style={{ gap: 'clamp(0.25rem, 2cqh, 0.5rem)' }}>
      {sorted.length === 0 ? (
        <li className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 text-center text-gray-500 shrink-0" style={{ ...itemStyle, paddingBlock: 'clamp(0.5rem, 4cqh, 1rem)' }}>
          No tasks
        </li>
      ) : (
        sorted.map((task) => {
          const statusClass = STATUS_BADGE[task.status] ?? 'bg-gray-100 text-gray-700';
          const priorityClass = task.priority && task.priority !== 'normal' ? PRIORITY_BADGE[task.priority] : '';
          return (
            <li key={task.id} className="shrink-0">
              <Link
                to={`/tasks?task=${task.id}`}
                className="block rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:border-brand-red/30 hover:shadow-md hover:bg-gray-50/50"
                style={itemStyle}
              >
                <div className="font-medium text-gray-900 truncate text-sm" style={titleStyle}>{task.title}</div>
                <div className="flex flex-wrap items-center gap-1 shrink-0" style={{ marginTop: 'clamp(0.125rem, 1cqh, 0.375rem)', gap: 'clamp(0.125rem, 1cqh, 0.25rem)' }}>
                  <span className={`inline-flex items-center rounded font-medium capitalize ${statusClass}`} style={badgeStyle}>
                    {task.status.replace('_', ' ')}
                  </span>
                  {task.priority && task.priority !== 'normal' && (
                    <span className={`inline-flex items-center rounded font-medium ${priorityClass}`} style={badgeStyle}>
                      {task.priority}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })
      )}
      {sorted.length > 0 && (
        <li className="pt-0.5 shrink-0">
          <Link to="/tasks" className="inline-block font-medium text-brand-red hover:underline" style={viewAllStyle}>
            View all tasks →
          </Link>
        </li>
      )}
    </ul>
    </div>
  );
}
