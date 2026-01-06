import type { Task, TaskStatus } from './types';

export const priorityDot: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  normal: 'bg-blue-500',
  low: 'bg-gray-500',
};

const originLabels: Record<string, string> = {
  manual_request: 'Manual',
  system_order: 'System',
  system_attendance: 'System',
  bug: 'Bug',
};

export function getTaskSourceLabel(task: Pick<Task, 'origin' | 'request'>): string {
  const originType = task.origin?.type || '';
  if (originType === 'bug') return 'Bug';
  if (originType.startsWith('system_')) return 'System';
  if (task.request?.id) return 'Request';
  if (originType) return originLabels[originType] || originType;
  return 'Manual';
}

export function getStatusLabel(status: TaskStatus): string {
  if (status === 'accepted') return 'To do';
  if (status === 'in_progress') return 'In progress';
  if (status === 'blocked') return 'Blocked';
  return 'Done';
}

export function getStatusBadgeClass(status: TaskStatus): string {
  if (status === 'done') return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (status === 'blocked') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

