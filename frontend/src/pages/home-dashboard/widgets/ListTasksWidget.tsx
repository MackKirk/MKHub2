import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { TaskBuckets } from '@/components/tasks/types';
import { sortTasksByPriority } from '@/components/tasks/taskUi';

type ListTasksWidgetProps = {
  config?: { limit?: number };
};

export function ListTasksWidget({ config }: ListTasksWidgetProps) {
  const limit = Math.min(Math.max(1, config?.limit ?? 5), 20);

  const { data, isLoading, error } = useQuery<TaskBuckets>({
    queryKey: ['home-list-tasks'],
    queryFn: () => api('GET', '/tasks'),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="text-sm text-gray-400">Loading…</div>;
  if (error) return <div className="text-sm text-red-500">Failed to load tasks</div>;

  const accepted = data?.accepted ?? [];
  const inProgress = data?.in_progress ?? [];
  const blocked = data?.blocked ?? [];
  const done = data?.done ?? [];
  const all = [...accepted, ...inProgress, ...blocked, ...done];
  const sorted = sortTasksByPriority(all).slice(0, limit);

  return (
    <ul className="space-y-1.5">
      {sorted.length === 0 ? (
        <li className="text-sm text-gray-500">No tasks</li>
      ) : (
        sorted.map((task) => (
          <li key={task.id}>
            <Link
              to={`/tasks?task=${task.id}`}
              className="block text-sm text-gray-800 hover:text-[#7f1010] hover:underline truncate"
            >
              {task.title}
            </Link>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <span className="capitalize">{task.status.replace('_', ' ')}</span>
              {task.priority && task.priority !== 'normal' && (
                <span>· {task.priority}</span>
              )}
            </div>
          </li>
        ))
      )}
      {sorted.length > 0 && (
        <li className="pt-1">
          <Link to="/tasks" className="text-xs text-[#7f1010] hover:underline">
            View all tasks →
          </Link>
        </li>
      )}
    </ul>
  );
}
