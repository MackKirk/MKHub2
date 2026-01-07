import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import type { Task, TaskStatus } from './types';
import { getStatusBadgeClass, getStatusLabel, getTaskSourceLabel, priorityDot } from './taskUi';

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
  // blocked
  return task.updated_at || task.started_at || task.created_at;
}

export default function TaskCard({ task, onClick, showActions = true }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const source = getTaskSourceLabel(task);
  const statusLabel = getStatusLabel(task.status);
  const dotClass = priorityDot[task.priority] || priorityDot.normal;
  const age = useMemo(() => timeAgoCompact(statusSince(task)), [task.status, task.created_at, task.updated_at, task.started_at, task.concluded_at]);
  const leftBorder =
    task.status === 'in_progress'
      ? 'border-l-blue-500'
      : task.status === 'blocked'
        ? 'border-l-amber-500'
        : task.status === 'done'
          ? 'border-l-green-500'
          : 'border-l-slate-300';

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
      className={`w-full text-left rounded-lg border border-gray-200 bg-white shadow-sm p-4 border-l-4 ${leftBorder} transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md relative`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900 truncate">{task.title}</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-600 font-medium">{source}</div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className={`text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border ${getStatusBadgeClass(
                  task.status
                )}`}
              >
                {statusLabel}
              </span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${dotClass}`}
                title={`Priority: ${task.priority || 'normal'}`}
                aria-label={`Priority: ${task.priority || 'normal'}`}
              />
            </div>
          </div>
          {age && age !== 'now' && (
            <div className="mt-2 text-[11px] text-gray-500">
              In this status: <span className="font-medium text-gray-700">{age}</span>
            </div>
          )}
        </div>
      </div>

      {showActions && (
        <div className="absolute top-3 right-3 flex items-center gap-1">
          {actions
            .filter((a) => a.show)
            .slice(0, 2)
            .map((a) => (
              <button
                key={a.key}
                type="button"
                title={a.title}
                aria-label={a.title}
                disabled={isBusy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  a.onClick();
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-gray-200/60 bg-white hover:bg-gray-50 disabled:opacity-60"
              >
                {a.label}
              </button>
            ))}
        </div>
      )}
    </button>
  );
}

