import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import BugReportDescription from './BugReportDescription';
import type { Task, TaskStatus } from './types';
import { getStatusBadgeClass, getStatusBorderColor, getStatusLabel, getTaskSourceLabel, priorityDot } from './taskUi';

type TaskLogEntry = {
  id: string;
  task_id: string;
  type: string;
  message: string;
  actor?: { id?: string | null; name?: string | null } | null;
  created_at?: string | null;
};

type TaskSync = {
  task_updated_at: string | null;
  log_last_created_at: string | null;
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
  const lastTaskSyncRef = useRef<TaskSync | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api<Task>('GET', `/tasks/${taskId}`),
    enabled: open && !!taskId,
    staleTime: 15_000,
  });

  const { data: logEntries = [] } = useQuery({
    queryKey: ['task-log', taskId],
    queryFn: () => api<TaskLogEntry[]>('GET', `/tasks/${taskId}/log`),
    enabled: open && !!taskId,
    staleTime: 15_000,
  });

  // Lightweight polling: keep modal in sync without hammering full task/log endpoints.
  useQuery({
    queryKey: ['task-sync', taskId],
    queryFn: () => api<TaskSync>('GET', `/tasks/${taskId}/sync`),
    enabled: open && !!taskId,
    refetchInterval: open ? 3_000 : false,
    refetchIntervalInBackground: false,
    onSuccess: (next) => {
      const prev = lastTaskSyncRef.current;
      if (!prev) {
        lastTaskSyncRef.current = next;
        return;
      }
      const taskChanged = (next?.task_updated_at || null) !== (prev?.task_updated_at || null);
      const logChanged = (next?.log_last_created_at || null) !== (prev?.log_last_created_at || null);
      if (taskChanged) queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      if (logChanged) queryClient.invalidateQueries({ queryKey: ['task-log', taskId] });
      if (taskChanged || logChanged) queryClient.invalidateQueries({ queryKey: ['tasks'] });
      lastTaskSyncRef.current = next;
    },
  });

  const [titleDraft, setTitleDraft] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    if (task?.title) setTitleDraft(task.title);
  }, [task?.title]);

  useEffect(() => {
    if (!open) return;
    // Scroll to bottom on open / new entries
    const scrollToBottom = () => {
      if (logScrollRef.current) {
        logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
      }
    };
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom);
    });
  }, [open, logEntries.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    if (statusDropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen]);

  // Refetch when window gains focus to sync with other users' changes
  useEffect(() => {
    if (!open || !taskId) return;
    
    const handleFocus = () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task-log', taskId] });
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [open, taskId, queryClient]);

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    if (taskId) queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    if (taskId) queryClient.invalidateQueries({ queryKey: ['task-log', taskId] });
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
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err.message || 'Failed to update task'),
  });

  const addLogMutation = useMutation({
    mutationFn: (message: string) => api<TaskLogEntry>('POST', `/tasks/${taskId}/log`, { message }),
    onSuccess: () => {
      setCommentText('');
      invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to add comment'),
  });

  const startMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/start`, {}),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err.message || 'Failed to start task'),
  });

  const concludeMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/conclude`, {}),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err.message || 'Failed to conclude task'),
  });

  const blockMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/block`, {}),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err.message || 'Failed to pause task'),
  });

  const unblockMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/unblock`, {}),
    onSuccess: () => invalidate(),
    onError: (err: any) => toast.error(err.message || 'Failed to resume task'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api<Task>('POST', `/tasks/${taskId}/archive`, {}),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to archive task'),
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
      if (o.value === current) return { ...o, disabled: false };
      if (current === 'accepted') return { ...o, disabled: o.value !== 'in_progress' };
      if (current === 'in_progress') return { ...o, disabled: !(o.value === 'blocked' || o.value === 'done') };
      if (current === 'blocked') return { ...o, disabled: !(o.value === 'in_progress' || o.value === 'done') };
      return { ...o, disabled: true };
    });
  }, [task?.status]);

  const isBusy =
    isLoading ||
    startMutation.isPending ||
    concludeMutation.isPending ||
    blockMutation.isPending ||
    unblockMutation.isPending ||
    archiveMutation.isPending ||
    updateDescriptionMutation.isPending ||
    addLogMutation.isPending ||
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
        : base
          ? base + '\n'
          : '';
    if ((task.description || '').trim() === final.trim()) return;
    updateDescriptionMutation.mutate(final);
  };

  const setAttachments = async (fileIds: string[]) => {
    if (!taskId || !task) return;
    const base = parsed.description ? parsed.description + '\n\n' : '';
    const block = `${ATTACH_BEGIN}\n${fileIds.map((id) => `file_id: ${id}`).join('\n')}\n${ATTACH_END}`;
    const next = (base + block).trim() + '\n';
    await api<Task>('PATCH', `/tasks/${taskId}/description`, { description: next });
  };

  const setStatus = async (next: TaskStatus) => {
    if (!task) return;
    const current = task.status;
    if (next === current) return;

    if (current === 'accepted' && next === 'in_progress') return startMutation.mutate();
    if (current === 'in_progress' && next === 'blocked') return blockMutation.mutate();
    if (current === 'in_progress' && next === 'done') return concludeMutation.mutate();
    if (current === 'blocked' && next === 'in_progress') return unblockMutation.mutate();
    if (current === 'blocked' && next === 'done') {
      await unblockMutation.mutateAsync();
      return concludeMutation.mutate();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-[75vw] w-full h-[85vh] max-h-[85vh] overflow-hidden flex flex-col shadow-xl border border-gray-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`absolute top-0 left-0 right-0 h-2.5 ${getStatusBorderColor(task?.status)} z-10 rounded-t-xl`} />

        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-5 border-b border-gray-200/60 flex items-center justify-between gap-4 relative flex-shrink-0">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-16 h-16 rounded-xl bg-brand-red/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-brand-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {!isEditingTitle ? (
                  <div
                    className="text-sm font-semibold text-gray-900 truncate cursor-text"
                    onClick={() => {
                      if (isBusy) return;
                      setIsEditingTitle(true);
                      requestAnimationFrame(() => titleInputRef.current?.focus());
                    }}
                    title="Click to edit title"
                  >
                    {titleDraft || (isLoading ? 'Loading…' : 'Task')}
                  </div>
                ) : (
                  <input
                    ref={titleInputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={async () => {
                      setIsEditingTitle(false);
                      await handleSaveTitle();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsEditingTitle(false);
                        setTitleDraft(task?.title || '');
                      }
                    }}
                    disabled={!task || isBusy}
                    className="w-full text-sm font-semibold text-gray-900 bg-white border border-gray-200 focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/30 rounded-lg px-3 py-2"
                  />
                )}
                {task?.priority && (
                  <span
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      priorityDot[task.priority] || priorityDot.normal
                    }`}
                    title={`Priority: ${task.priority}`}
                  />
                )}
              </div>

              {/* Status below title */}
              <div className="mt-2 flex items-center gap-2 min-w-0">
                <div className="relative flex-shrink-0" ref={statusDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen((v) => !v)}
                    disabled={!task || isBusy}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      task ? getStatusBadgeClass(task.status) : 'bg-slate-100 text-slate-600 border-slate-200'
                    } disabled:opacity-60`}
                    title="Change status"
                  >
                    {task?.status ? getStatusLabel(task.status) : '—'}
                  </button>
                  {statusDropdownOpen && task && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
                      <div className="absolute z-20 left-0 mt-2 bg-white border border-gray-200/60 rounded-xl shadow-lg min-w-[170px] overflow-hidden">
                        {statusOptions.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            disabled={o.disabled || isBusy}
                            onClick={async () => {
                              await setStatus(o.value);
                              setStatusDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed ${
                              task.status === o.value ? 'bg-gray-100 font-medium' : ''
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {task && (
                  <div className="text-xs text-gray-600 truncate">
                    Task details and activity
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-shrink-0 mr-12">
              {task?.status === 'accepted' && task.permissions.can_start && (
                <button
                  type="button"
                  onClick={() => startMutation.mutate()}
                  disabled={isBusy}
                  className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition disabled:opacity-60"
                  title="Start task"
                >
                  <svg className="w-10 h-10 text-green-700" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-xs font-semibold mt-1.5">Start</span>
                </button>
              )}

              {task?.status === 'in_progress' && task.permissions.can_block && (
                <button
                  type="button"
                  onClick={() => blockMutation.mutate()}
                  disabled={isBusy}
                  className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition disabled:opacity-60"
                  title="Pause"
                >
                  <svg className="w-10 h-10 text-amber-700" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                  <span className="text-xs font-semibold mt-1.5">Pause</span>
                </button>
              )}

              {task?.status === 'blocked' && task.permissions.can_unblock && (
                <button
                  type="button"
                  onClick={() => unblockMutation.mutate()}
                  disabled={isBusy}
                  className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition disabled:opacity-60"
                  title="Resume"
                >
                  <svg className="w-10 h-10 text-green-700" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span className="text-xs font-semibold mt-1.5">Resume</span>
                </button>
              )}

              {(task?.status === 'in_progress' || task?.status === 'blocked') && (
                <button
                  type="button"
                  onClick={() => setStatus('done')}
                  disabled={isBusy || !task?.permissions.can_conclude}
                  className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition disabled:opacity-60"
                  title="Mark as done"
                >
                  <svg className="w-9 h-9 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs font-semibold mt-1.5">Done</span>
                </button>
              )}

              {task?.status === 'done' && task.permissions.can_archive && (
                <button
                  type="button"
                  onClick={() => archiveMutation.mutate()}
                  disabled={isBusy || archiveMutation.isPending}
                  className="w-20 h-20 rounded-2xl flex flex-col items-center justify-center bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 transition disabled:opacity-60"
                  title="Archive"
                >
                  <svg className="w-9 h-9 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6m16 0v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6m16 0H4m6 4h4" />
                  </svg>
                  <span className="text-xs font-semibold mt-1.5">Archive</span>
                </button>
              )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-2xl font-bold text-gray-400 hover:text-gray-600 leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors absolute top-4 right-4"
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden p-6 bg-white">
          {isLoading ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-2/3" />
                <div className="mt-3 h-3 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ) : !task ? (
            <div className="text-sm text-gray-500">Task not found.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0 overflow-hidden">
              <div className="lg:col-span-2 space-y-6 min-w-0 overflow-y-auto">
                {/* Description */}
                <div className="rounded-xl border border-gray-200/60 bg-gray-50/50 p-5 space-y-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</div>
                  {task.origin?.type === 'bug' ? (
                    <BugReportDescription description={task.description || ''} />
                  ) : (
                    <textarea
                      defaultValue={parsed.description}
                      rows={6}
                      placeholder="Add details…"
                      className="w-full rounded-lg border border-gray-200/60 px-4 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
                      onBlur={(e) => handleSaveDescription(e.target.value)}
                      disabled={isBusy}
                    />
                  )}
                </div>

                {/* Images */}
                <div className="rounded-xl border border-gray-200/60 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">Images</div>
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

                {/* Details */}
                <div className="rounded-xl border border-gray-200/60 bg-white">
                  <div className="px-5 py-4 border-b border-gray-200/60">
                    <div className="text-sm font-semibold text-gray-900">Details</div>
                  </div>
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600">Created</span>
                      <span className="text-gray-900 font-medium">{formatDateTime(task.created_at)}</span>
                    </div>
                    {task.started_at && (
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-600">
                          Started{task.started_by?.name ? ` by ${task.started_by.name}` : ''}
                        </span>
                        <span className="text-gray-900 font-medium">{formatDateTime(task.started_at)}</span>
                      </div>
                    )}
                    {task.concluded_at && (
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-600">
                          Completed{task.concluded_by?.name ? ` by ${task.concluded_by.name}` : ''}
                        </span>
                        <span className="text-gray-900 font-medium">{formatDateTime(task.concluded_at)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600">Source</span>
                      <span className="text-gray-900 font-medium">{getTaskSourceLabel(task)}</span>
                    </div>
                    {task.request?.id && (
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-600">Linked request</span>
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
                </div>
              </div>

              {/* Sidebar log */}
              <div className="lg:col-span-1 min-w-0 flex flex-col min-h-0">
                <div className="rounded-xl border border-gray-200/60 bg-white overflow-hidden flex flex-col flex-1 min-h-0 max-h-full">
                  <div className="px-5 py-4 border-b border-gray-200/60 flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-900">Activity</div>
                  </div>
                  <div ref={logScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 max-h-full">
                    {logEntries.length === 0 ? (
                      <div className="text-sm text-gray-500">No activity yet.</div>
                    ) : (
                      logEntries.map((e) => (
                        <div key={e.id} className="rounded-lg border border-gray-200/60 bg-gray-50/40 p-3">
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span className="font-medium">{e.actor?.name || 'System'}</span>
                            <span>{formatDateTime(e.created_at)}</span>
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">{e.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-4 border-t border-gray-200/60 bg-gray-50/50 space-y-2 flex-shrink-0">
                    <label className="block text-sm font-medium text-gray-700">Add a comment</label>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={2}
                      placeholder="Type your comment…"
                      className="w-full rounded-lg border border-gray-200/60 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 bg-white"
                      disabled={isBusy}
                    />
                    <button
                      type="button"
                      onClick={() => addLogMutation.mutate(commentText)}
                      disabled={addLogMutation.isPending || !commentText.trim()}
                      className="w-full px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-semibold disabled:opacity-60"
                    >
                      {addLogMutation.isPending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

