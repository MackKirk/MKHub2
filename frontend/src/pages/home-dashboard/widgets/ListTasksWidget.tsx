import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { AppBadge } from '@/components/ui';
import { api } from '@/lib/api';
import type { TaskBuckets } from '@/components/tasks/types';
import { sortTasksByPriority } from '@/components/tasks/taskUi';
import {
  HomeWidgetList,
  HomeWidgetListEmpty,
  HomeWidgetListFooter,
  HomeWidgetListRow,
} from '../HomeWidgetList';

type ListTasksWidgetProps = {
  config?: { limit?: number };
};

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  accepted: 'info',
  in_progress: 'warning',
  blocked: 'danger',
  done: 'success',
};

const PRIORITY_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  high: 'danger',
  low: 'neutral',
};

export function ListTasksWidget({ config }: ListTasksWidgetProps) {
  const { ready } = useAnimationReady();
  const limit = Math.min(Math.max(1, config?.limit ?? 5), 20);

  const { data, isLoading, error } = useQuery<TaskBuckets>({
    queryKey: ['home-list-tasks'],
    queryFn: () => api('GET', '/tasks?limit=20'),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="min-h-0 flex-1">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center">
        <div className="text-sm text-red-500">Failed to load tasks</div>
      </div>
    );
  }

  const accepted = data?.accepted ?? [];
  const inProgress = data?.in_progress ?? [];
  const blocked = data?.blocked ?? [];
  const done = data?.done ?? [];
  const all = [...accepted, ...inProgress, ...blocked, ...done];
  const sorted = sortTasksByPriority(all).slice(0, limit);

  return (
    <FadeInOnMount enabled={ready} className="flex h-full min-h-0 w-full flex-col">
      <HomeWidgetList>
        {sorted.length === 0 ? (
          <HomeWidgetListEmpty icon={<ListChecks className="h-5 w-5" />} title="No tasks" />
        ) : (
          sorted.map((task) => {
            const statusVariant = STATUS_VARIANT[task.status] ?? 'neutral';
            const priorityVariant =
              task.priority && task.priority !== 'normal' ? PRIORITY_VARIANT[task.priority] : null;
            return (
              <HomeWidgetListRow
                key={task.id}
                to={`/tasks?task=${task.id}`}
                title={task.title}
                trailing={
                  <>
                    {priorityVariant && (
                      <AppBadge variant={priorityVariant} className="normal-case tracking-normal">
                        {task.priority}
                      </AppBadge>
                    )}
                    <AppBadge variant={statusVariant} className="normal-case tracking-normal capitalize">
                      {task.status.replace('_', ' ')}
                    </AppBadge>
                  </>
                }
              />
            );
          })
        )}
      </HomeWidgetList>
      {sorted.length > 0 && <HomeWidgetListFooter to="/tasks" label="View all tasks →" />}
    </FadeInOnMount>
  );
}
