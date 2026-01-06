import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import BugReportDescription from './BugReportDescription';
import type { Task, TaskStatus } from './types';
import { getStatusBadgeClass, getStatusLabel, getTaskSourceLabel, priorityDot } from './taskUi';

type TaskRequestMessage = {
  id: string;
  sender_name?: string | null;
  body: string;
  created_at: string;
};

type TaskRequest = {
  id: string;
  title: string;
  description?: string;
  status: string;
  status_label: string;
  requested_by: { id?: string | null; name?: string | null };
  messages?: TaskRequestMessage[];
  permissions: {
    can_request_info: boolean;
    can_provide_info: boolean;
  };
};

type Props = {
  open: boolean;
  taskId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
};

function formatDateTime(dateStr?: string | null) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

export default function TaskModal({ open, taskId, onClose, onUpdated }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api<Task>('GET', `/tasks/${taskId}`),
    enabled: open && !!taskId,
  });

  const requestId = task?.request?.id || null;
  const { data: request } = useQuery({
    queryKey: ['task-request', requestId],
    queryFn: () => api<TaskRequest>('GET', `/task-requests/${requestId}`),
    enabled: open && !!requestId,
  });

  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    if (task?.title) setTitleDraft(task.title);
  }, [task?.title]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    if (taskId) queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    if (requestId) queryClient.invalidateQueries({ queryKey: ['task-request', requestId] });
    onUpdated?.();
  };

  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => api<Task>('PATCH', `/tasks/${taskId}/title`, { title }),
    onSuccess: () => {
      toast.success('Title updated');
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update title'),
    onSettled: () => setSavingTitle(false),
  });

  const startMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/start`, {}),
    onSuccess: () => {
      toast.success('Task started');
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to start task'),
  });

  const concludeMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/conclude`, {}),
    onSuccess: () => {
      toast.success('Task marked as done');
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to conclude task'),
  });

  const blockMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/block`, {}),
    onSuccess: () => {
      toast.success('Task paused');
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to pause task'),
  });

  const unblockMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/unblock`, {}),
    onSuccess: () => {
      toast.success('Task resumed');
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to resume task'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/archive`, {}),
    onSuccess: () => {
      toast.success('Task archived');
      invalidate();
      onClose(); // Close modal after archiving
    },
    onError: (err: any) => toast.error(err.message || 'Failed to archive task'),
  });

  const sendRequestMessageMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!requestId) throw new Error('No linked request');
      if (request?.permissions.can_provide_info) {
        return await api('POST', `/task-requests/${requestId}/provide-info`, { message: body });
      }
      if (request?.permissions.can_request_info) {
        return await api('POST', `/task-requests/${requestId}/ask-info`, { message: body });
      }
      throw new Error('You do not have permission to comment on this request');
    },
    onSuccess: () => {
      toast.success('Comment sent');
      setCommentText('');
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to send comment'),
  });

  const statusOptions: { value: TaskStatus; label: string; disabled: boolean }[] = useMemo(() => {
    const current = task?.status;
    const base = [
      { value: 'accepted' as const, label: 'To do' },
      { value: 'in_progress' as const, label: 'In progress' },
      { value: 'blocked' as const, label: 'Blocked' },
      { value: 'done' as const, label: 'Done' },
    ];
    if (!current) return base.map((o) => ({ ...o, disabled: true }));

    return base.map((o) => {
      // Allow only realistic transitions via existing endpoints
      if (o.value === current) return { ...o, disabled: false };
      if (current === 'accepted') return { ...o, disabled: o.value !== 'in_progress' };
      if (current === 'in_progress') return { ...o, disabled: !(o.value === 'blocked' || o.value === 'done') };
      if (current === 'blocked') return { ...o, disabled: !(o.value === 'in_progress' || o.value === 'done') };
      return { ...o, disabled: true };
    });
  }, [task?.status]);

  const primaryAction = useMemo(() => {
    const s = task?.status;
    if (s === 'accepted') return { label: 'Start task', kind: 'start' as const };
    if (s === 'in_progress' || s === 'blocked') return { label: 'Mark as done', kind: 'done' as const };
    return null;
  }, [task?.status]);

  const isBusy =
    isLoading ||
    startMutation.isLoading ||
    concludeMutation.isLoading ||
    blockMutation.isLoading ||
    unblockMutation.isLoading ||
    archiveMutation.isLoading ||
    sendRequestMessageMutation.isLoading ||
    savingTitle;

  const handleSaveTitle = async () => {
    if (!taskId || !task) return;
    const next = titleDraft.trim();
    if (!next || next === task.title) return;
    setSavingTitle(true);
    updateTitleMutation.mutate(next);
  };

  const setStatus = async (next: TaskStatus) => {
    if (!task) return;
    const current = task.status;
    if (next === current) return;

    // accepted -> in_progress
    if (current === 'accepted' && next === 'in_progress') return startMutation.mutate();

    // in_progress -> blocked/done
    if (current === 'in_progress' && next === 'blocked') return blockMutation.mutate();
    if (current === 'in_progress' && next === 'done') return concludeMutation.mutate();

    // blocked -> in_progress/done
    if (current === 'blocked' && next === 'in_progress') return unblockMutation.mutate();
    if (current === 'blocked' && next === 'done') {
      // Conclude requires in_progress
      await unblockMutation.mutateAsync();
      return concludeMutation.mutate();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200/60 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</span>
              {task?.status && (
                <span
                  className={`text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border ${getStatusBadgeClass(
                    task.status
                  )}`}
                >
                  {getStatusLabel(task.status)}
                </span>
              )}
              {task?.priority && (
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    priorityDot[task.priority] || priorityDot.normal
                  }`}
                  title={`Priority: ${task.priority}`}
                />
              )}
            </div>

            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              disabled={!task || isBusy}
              className="w-full text-lg font-semibold text-gray-900 bg-transparent border border-transparent focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/20 rounded-lg px-2 py-1 -ml-2"
              placeholder={isLoading ? 'Loading…' : 'Task title'}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-[160px]">
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Status
              </label>
              <select
                value={task?.status || 'accepted'}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                disabled={!task || isBusy}
                className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60"
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-2xl font-bold text-gray-400 hover:text-gray-600 leading-none px-2"
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {isLoading ? (
            <div className="text-sm text-gray-500">Loading task…</div>
          ) : !task ? (
            <div className="text-sm text-gray-500">Task not found.</div>
          ) : (
            <>
              {/* Description */}
              {task.description ? (
                <div className="rounded-xl border border-gray-200/60 bg-gray-50/50 p-4">
                  {task.origin?.type === 'bug' ? (
                    <BugReportDescription description={task.description} />
                  ) : (
                    <>
                      <div className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wide">
                        Description
                      </div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap">{task.description}</div>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200/60 bg-gray-50/50 p-4 text-sm text-gray-600">
                  No description.
                </div>
              )}

              {/* Activity */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Activity</div>
                <div className="rounded-xl border border-gray-200/60 bg-white divide-y">
                  <div className="p-4 text-sm flex items-center justify-between gap-3">
                    <span className="text-gray-800">Created</span>
                    <span className="text-gray-500">{formatDateTime(task.created_at)}</span>
                  </div>
                  {task.started_at && (
                    <div className="p-4 text-sm flex items-center justify-between gap-3">
                      <span className="text-gray-800">
                        Started{task.started_by?.name ? ` by ${task.started_by.name}` : ''}
                      </span>
                      <span className="text-gray-500">{formatDateTime(task.started_at)}</span>
                    </div>
                  )}
                  {task.concluded_at && (
                    <div className="p-4 text-sm flex items-center justify-between gap-3">
                      <span className="text-gray-800">
                        Completed{task.concluded_by?.name ? ` by ${task.concluded_by.name}` : ''}
                      </span>
                      <span className="text-gray-500">{formatDateTime(task.concluded_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Request conversation (if linked) */}
              {requestId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversation</div>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-red hover:text-red-700"
                      onClick={() => navigate('/task-requests', { state: { requestId } })}
                    >
                      Open request
                    </button>
                  </div>

                  <div className="rounded-xl border border-gray-200/60 bg-white">
                    <div className="p-4 border-b border-gray-200/60">
                      <div className="text-sm font-semibold text-gray-900">{request?.title || task.request?.title}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {request?.status_label ? request.status_label : task.request?.status?.replace('_', ' ')}
                      </div>
                    </div>
                    <div className="p-4 space-y-3 max-h-[240px] overflow-y-auto">
                      {request?.messages && request.messages.length > 0 ? (
                        request.messages.map((msg) => (
                          <div key={msg.id} className="rounded-lg border border-gray-200/60 bg-gray-50/40 p-3">
                            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                              <span className="font-medium">{msg.sender_name || 'System'}</span>
                              <span>{formatDateTime(msg.created_at)}</span>
                            </div>
                            <div className="text-sm text-gray-800 whitespace-pre-wrap">{msg.body}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">No messages yet.</div>
                      )}
                    </div>

                    {(request?.permissions.can_provide_info || request?.permissions.can_request_info) && (
                      <div className="p-4 border-t border-gray-200/60 bg-gray-50/50 space-y-2">
                        <label className="block text-sm font-medium text-gray-700">Add a comment</label>
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          rows={2}
                          placeholder="Type your message…"
                          className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => sendRequestMessageMutation.mutate(commentText)}
                          disabled={sendRequestMessageMutation.isLoading || !commentText.trim()}
                          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60"
                        >
                          {sendRequestMessageMutation.isLoading ? 'Sending…' : 'Send'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="rounded-xl border border-gray-200/60 bg-white">
                <button
                  type="button"
                  onClick={() => setMetadataOpen((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-900"
                >
                  <span>Details</span>
                  <span className="text-gray-400">{metadataOpen ? '–' : '+'}</span>
                </button>
                {metadataOpen && (
                  <div className="px-4 pb-4 space-y-2 text-sm text-gray-700">
                    <div>
                      <span className="text-gray-500">Requested by:</span>{' '}
                      <span className="font-medium">{task.requested_by?.name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Source:</span>{' '}
                      <span className="font-medium">{getTaskSourceLabel(task)}</span>
                    </div>
                    {task.request?.id && (
                      <div>
                        <span className="text-gray-500">Linked request:</span>{' '}
                        <button
                          type="button"
                          className="font-medium text-brand-red hover:text-red-700"
                          onClick={() => navigate('/task-requests', { state: { requestId: task.request?.id } })}
                        >
                          {task.request.title}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200/60 px-6 py-4 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {task?.status === 'in_progress' && task.permissions.can_block && (
              <button
                type="button"
                onClick={() => blockMutation.mutate()}
                disabled={isBusy}
                className="px-4 py-2 border border-gray-200/60 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Pause
              </button>
            )}
            {task?.status === 'blocked' && task.permissions.can_unblock && (
              <button
                type="button"
                onClick={() => unblockMutation.mutate()}
                disabled={isBusy}
                className="px-4 py-2 border border-gray-200/60 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Resume
              </button>
            )}
            {task?.status === 'done' && task.permissions.can_archive && (
              <button
                type="button"
                onClick={() => archiveMutation.mutate()}
                disabled={isBusy || archiveMutation.isLoading}
                className="px-4 py-2 border border-gray-200/60 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                {archiveMutation.isLoading ? 'Archiving…' : 'Archive'}
              </button>
            )}
          </div>

          {task && primaryAction && (
            <button
              type="button"
              onClick={() => {
                if (primaryAction.kind === 'start') startMutation.mutate();
                if (primaryAction.kind === 'done') setStatus('done');
              }}
              disabled={isBusy || (primaryAction.kind === 'start' && !task.permissions.can_start)}
              className="px-5 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold disabled:opacity-60"
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

