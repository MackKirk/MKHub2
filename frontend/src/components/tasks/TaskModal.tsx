import { useEffect, useMemo, useRef, useState } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    if (task?.title) setTitleDraft(task.title);
  }, [task?.title]);

  const ATTACH_BEGIN = '[MKHUB_ATTACHMENTS]';
  const ATTACH_END = '[/MKHUB_ATTACHMENTS]';

  const parsed = useMemo(() => {
    const raw = task?.description || '';
    const startIdx = raw.indexOf(ATTACH_BEGIN);
    const endIdx = raw.indexOf(ATTACH_END);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      return { description: raw.trim(), fileIds: [] as string[] };
    }
    const before = raw.slice(0, startIdx).trim();
    const block = raw.slice(startIdx + ATTACH_BEGIN.length, endIdx);
    const fileIds = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.toLowerCase().startsWith('file_id:'))
      .map((l) => l.split(':').slice(1).join(':').trim())
      .filter(Boolean);
    return { description: before, fileIds };
  }, [task?.description]);

  const setAttachments = async (fileIds: string[]) => {
    if (!taskId || !task) return;
    const base = parsed.description ? parsed.description + '\n\n' : '';
    const block = `${ATTACH_BEGIN}\n${fileIds.map((id) => `file_id: ${id}`).join('\n')}\n${ATTACH_END}`;
    const next = (base + block).trim() + '\n';
    await api<Task>('PATCH', `/tasks/${taskId}/description`, { description: next });
  };

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

  const updateDescriptionMutation = useMutation({
    mutationFn: (description: string) => api<Task>('PATCH', `/tasks/${taskId}/description`, { description }),
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update task'),
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

  const handleSaveDescription = async (nextDescription: string) => {
    if (!taskId || !task) return;
    const base = nextDescription.trim();
    const fileIds = parsed.fileIds;
    const final =
      fileIds.length > 0
        ? `${base}\n\n${ATTACH_BEGIN}\n${fileIds.map((id) => `file_id: ${id}`).join('\n')}\n${ATTACH_END}\n`
        : (base ? base + '\n' : '');
    if ((task.description || '').trim() === final.trim()) return;
    updateDescriptionMutation.mutate(final);
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
<<<<<<< HEAD
        <div className="sticky top-0 bg-gradient-to-br from-[#7f1010] to-[#a31414] px-6 py-5 flex items-start justify-between gap-4">
=======
        <div className="flex-shrink-0 bg-white border-b border-gray-200/60 px-6 py-4 flex items-start justify-between gap-4">
>>>>>>> abe260dc3406d447679083efa753c6e271b99c6e
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">Task</span>
              {task?.status && (
                <span
                  className={`text-[10px] uppercase font-semibold tracking-wide px-2 py-0.5 rounded-full border bg-white/10 text-white border-white/20`}
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
              className="w-full text-lg font-semibold text-white bg-white/10 border border-white/10 focus:border-white/30 focus:ring-2 focus:ring-white/20 rounded-lg px-3 py-2"
              placeholder={isLoading ? 'Loading…' : 'Task title'}
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="min-w-[160px]">
              <label className="block text-[11px] font-semibold text-white/80 uppercase tracking-wide mb-1">
                Status
              </label>
              <select
                value={task?.status || 'accepted'}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                disabled={!task || isBusy}
                className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm bg-white/10 text-white focus:ring-2 focus:ring-white/20 focus:border-white/30"
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
              className="text-2xl font-bold text-white/80 hover:text-white leading-none w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10"
              aria-label="Close"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-white">
          {isLoading ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-2/3" />
                <div className="mt-3 h-3 bg-gray-100 rounded w-1/3" />
              </div>
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/2" />
                <div className="mt-3 h-3 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          ) : !task ? (
            <div className="text-sm text-gray-500">Task not found.</div>
          ) : (
            <>
              {/* Description + Images */}
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 space-y-4">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</div>
                {task.origin?.type === 'bug' ? (
                  <BugReportDescription description={task.description || ''} />
                ) : (
                  <textarea
                    defaultValue={parsed.description}
                    rows={5}
                    placeholder="Add details…"
                    className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red/50"
                    onBlur={(e) => handleSaveDescription(e.target.value)}
                    disabled={isBusy}
                  />
                )}

                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Images</div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (!taskId || files.length === 0) return;
                          setUploadingImages(true);
                          try {
                            const newIds: string[] = [];
                            for (const f of files) {
                              const up: any = await api('POST', '/files/upload', {
                                project_id: null,
                                client_id: null,
                                employee_id: null,
                                category_id: 'tasks',
                                original_name: f.name,
                                content_type: f.type || 'application/octet-stream',
                              });
                              await fetch(up.upload_url, {
                                method: 'PUT',
                                headers: {
                                  'Content-Type': f.type || 'application/octet-stream',
                                  'x-ms-blob-type': 'BlockBlob',
                                },
                                body: f,
                              });
                              const conf: any = await api('POST', '/files/confirm', {
                                key: up.key,
                                size_bytes: f.size,
                                checksum_sha256: 'na',
                                content_type: f.type || 'application/octet-stream',
                              });
                              if (conf?.id) newIds.push(String(conf.id));
                            }
                            if (newIds.length > 0) {
                              const merged = Array.from(new Set([...parsed.fileIds, ...newIds]));
                              await setAttachments(merged);
                              toast.success('Image(s) added');
                              invalidate();
                            }
                          } catch (err: any) {
                            toast.error(err.message || 'Failed to upload image');
                          } finally {
                            setUploadingImages(false);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isBusy || uploadingImages}
                        className="px-3 py-2 rounded-lg border border-gray-200/60 hover:bg-gray-50 text-sm font-medium disabled:opacity-60"
                      >
                        {uploadingImages ? 'Uploading…' : 'Add images'}
                      </button>
                    </div>
                  </div>

                  {parsed.fileIds.length === 0 ? (
                    <div className="text-sm text-gray-500">No images yet.</div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {parsed.fileIds.map((fid) => (
                        <a
                          key={fid}
                          href={`/files/${fid}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg border border-gray-200/60 overflow-hidden bg-gray-50 hover:shadow-sm transition"
                          title="Open image"
                        >
                          <img
                            src={`/files/${fid}/thumbnail?w=480`}
                            className="w-full h-28 object-cover"
                            alt="Task attachment"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Activity */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Activity</div>
                <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y">
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
              <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
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

