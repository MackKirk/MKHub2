import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { AppBadge, AppButton, uiBorders, uiCx, uiRadius, uiShadows, uiTypography } from '@/components/ui';
import type { Task, TaskStatus } from './types';
import { getStatusBadgeVariant, getStatusLabel, getTaskSourceLabel, priorityDot } from './taskUi';

type Props = {
  task: Task;
  onClick: () => void;
  showActions?: boolean;
};

function plural(n: number, unit: string) {
  return `${n}${unit}`;
}

function timeAgoCompact(iso?: string | null) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return '';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return plural(mins, 'm');
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return plural(hrs, 'h');
  const days = Math.floor(hrs / 24);
  if (days < 14) return plural(days, 'd');
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return plural(weeks, 'w');
  const months = Math.floor(days / 30);
  return plural(months, 'mo');
}

function statusSince(task: Task): string | null {
  if (task.status === 'accepted') return task.created_at;
  if (task.status === 'in_progress') return task.started_at || task.updated_at || task.created_at;
  if (task.status === 'done') return task.concluded_at || task.updated_at || task.created_at;
  return task.updated_at || task.started_at || task.created_at;
}

const statusLeftBorder: Record<TaskStatus, string> = {
  accepted: 'border-l-slate-300',
  in_progress: 'border-l-blue-500',
  blocked: 'border-l-amber-500',
  done: 'border-l-green-500',
};

export default function TaskCard({ task, onClick, showActions = true }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const source = getTaskSourceLabel(task);
  const statusLabel = getStatusLabel(task.status);
  const dotClass = priorityDot[task.priority] || priorityDot.normal;
  const age = useMemo(() => timeAgoCompact(statusSince(task)), [task.status, task.created_at, task.updated_at, task.started_at, task.concluded_at]);
  const leftBorder = statusLeftBorder[task.status] || statusLeftBorder.accepted;

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['tasks'] });
    await qc.invalidateQueries({ queryKey: ['task', task.id] });
    await qc.invalidateQueries({ queryKey: ['tasks', 'archived'] });
  };

  const startMutation = useMutation({
    mutationFn: () => api('POST', `/tasks/${task.id}/start`),
    onSuccess: async () => {
      await invalidate();
      toast.success('Task started');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to start task'),
  });

  const concludeMutation = useMutation({
    mutationFn: () => api('POST', `/tasks/${task.id}/conclude`),
    onSuccess: async () => {
      await invalidate();
      toast.success('Task completed');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to complete task'),
  });

  const blockMutation = useMutation({
    mutationFn: () => api('POST', `/tasks/${task.id}/block`),
    onSuccess: async () => {
      await invalidate();
      toast.success('Task paused');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to pause task'),
  });

  const unblockMutation = useMutation({
    mutationFn: () => api('POST', `/tasks/${task.id}/unblock`),
    onSuccess: async () => {
      await invalidate();
      toast.success('Task resumed');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to resume task'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api('POST', `/tasks/${task.id}/archive`),
    onSuccess: async () => {
      await invalidate();
      toast.success('Task archived');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to archive task'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api('DELETE', `/tasks/${task.id}`),
    onSuccess: async () => {
      await invalidate();
      toast.success('Task deleted');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete task'),
  });

  const isBusy =
    startMutation.isLoading ||
    concludeMutation.isLoading ||
    blockMutation.isLoading ||
    unblockMutation.isLoading ||
    archiveMutation.isLoading ||
    deleteMutation.isLoading;

  const actions: Array<{
    key: string;
    label: string;
    title: string;
    show: boolean;
    onClick: () => void;
  }> = [
    {
      key: 'start',
      label: 'Start',
      title: 'Start task',
      show: task.permissions.can_start === true,
      onClick: () => startMutation.mutate(),
    },
    {
      key: 'done',
      label: 'Done',
      title: 'Mark as done',
      show: task.permissions.can_conclude === true,
      onClick: () => concludeMutation.mutate(),
    },
    {
      key: 'pause',
      label: 'Pause',
      title: 'Pause task',
      show: task.permissions.can_block === true,
      onClick: () => blockMutation.mutate(),
    },
    {
      key: 'resume',
      label: 'Resume',
      title: 'Resume task',
      show: task.permissions.can_unblock === true,
      onClick: () => unblockMutation.mutate(),
    },
    {
      key: 'archive',
      label: 'Archive',
      title: 'Archive task',
      show: task.permissions.can_archive === true,
      onClick: () => archiveMutation.mutate(),
    },
    {
      key: 'delete',
      label: 'Delete',
      title: 'Delete task',
      show: task.permissions.can_delete === true,
      onClick: async () => {
        const result = await confirm({
          title: 'Delete Task',
          message: 'Are you sure you want to delete this task? This action cannot be undone.',
          confirmText: 'Delete',
          cancelText: 'Cancel',
        });
        if (result === 'confirm') {
          deleteMutation.mutate();
        }
      },
    },
  ];

  return (
    <button
      type="button"
      onClick={onClick}
      className={uiCx(
        'relative w-full border-l-4 text-left transition-all duration-200 ease-out hover:-translate-y-0.5',
        uiRadius.control,
        uiBorders.subtle,
        uiShadows.card,
        'bg-white p-4 hover:shadow-md',
        leftBorder,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className={uiCx(uiTypography.sectionTitle, 'min-w-0 flex-1 truncate')} title={task.title}>
              {task.title}
            </div>
            {showActions && (
              <div className="flex shrink-0 items-center gap-1">
                {actions
                  .filter((a) => a.show)
                  .slice(0, 2)
                  .map((a) => (
                    <AppButton
                      key={a.key}
                      variant="secondary"
                      size="sm"
                      type="button"
                      title={a.title}
                      aria-label={a.title}
                      disabled={isBusy}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        a.onClick();
                      }}
                    >
                      {a.label}
                    </AppButton>
                  ))}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className={uiCx(uiTypography.helper, 'font-medium')}>{source}</div>
            <div className="flex shrink-0 items-center gap-3">
              <AppBadge variant={getStatusBadgeVariant(task.status)}>{statusLabel}</AppBadge>
              <span
                className={uiCx('h-2.5 w-2.5 rounded-full', dotClass)}
                title={`Priority: ${task.priority || 'normal'}`}
                aria-label={`Priority: ${task.priority || 'normal'}`}
              />
            </div>
          </div>
          {age && age !== 'now' && (
            <div className={uiCx('mt-2 text-[11px]', uiTypography.helper)}>
              In this status: <span className="font-medium text-gray-700">{age}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
