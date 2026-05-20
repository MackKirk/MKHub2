import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { api, withFileAccessToken } from '@/lib/api';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppSelect,
  AppTabs,
  AppTextarea,
  AppUserSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import BugReportDescription from './BugReportDescription';
import type { Task, TaskStatus } from './types';
import {
  getPriorityBadgeVariant,
  getPriorityLabel,
  getStatusBadgeVariant,
  getStatusLabel,
  getTaskSourceLabel,
} from './taskUi';

type TaskModalTab = 'description' | 'images' | 'details' | 'activity';

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
  const [activeTab, setActiveTab] = useState<TaskModalTab>('description');
  const [commentText, setCommentText] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editPriority, setEditPriority] = useState('');
  const [editAssignType, setEditAssignType] = useState<'user' | 'division' | 'none'>('none');
  const [editUserId, setEditUserId] = useState('');
  const [editDivisionId, setEditDivisionId] = useState('');
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ divisions?: { id: string; label: string }[] }>('GET', '/settings'),
    enabled: open,
  });
  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id: string; name?: string }>('GET', '/auth/me'),
    enabled: open,
  });
  const divisions: { id: string; label: string }[] = (settings?.divisions || []) as { id: string; label: string }[];

  useEffect(() => {
    if (task?.title) setTitleDraft(task.title);
  }, [task?.title]);

  useEffect(() => {
    if (!open) {
      setIsEditMode(false);
      setActiveTab('description');
    }
  }, [open]);

  useEffect(() => {
    if (!task) return;
    setEditPriority(task.priority || 'normal');
    if (task.assigned_to?.id) {
      setEditAssignType('user');
      setEditUserId(task.assigned_to.id);
      setEditDivisionId('');
    } else if (task.assigned_to?.division) {
      setEditAssignType('division');
      setEditUserId('');
      const div = divisions.find((d) => d.label === task.assigned_to?.division);
      setEditDivisionId(div?.id || '');
    } else {
      setEditAssignType('none');
      setEditUserId('');
      setEditDivisionId('');
    }
  }, [task?.id, task?.priority, task?.assigned_to?.id, task?.assigned_to?.division, divisions]);

  // When settings/divisions load, resolve division label to id
  useEffect(() => {
    if (!task?.assigned_to?.division || divisions.length === 0) return;
    const div = divisions.find((d) => d.label === task.assigned_to!.division);
    if (div) setEditDivisionId(div.id);
  }, [task?.assigned_to?.division, divisions]);

  useEffect(() => {
    if (!open || activeTab !== 'activity') return;
    const scrollToBottom = () => {
      if (logScrollRef.current) {
        logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
      }
    };
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom);
    });
  }, [open, logEntries.length, activeTab]);

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

  const updateTaskMutation = useMutation({
    mutationFn: (payload: { priority?: string; assigned_user_id?: string; assigned_division_id?: string }) =>
      api<Task>('PATCH', `/tasks/${taskId}`, payload),
    onSuccess: () => {
      toast.success('Task updated');
      invalidate();
      setIsEditMode(false);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update task'),
  });

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
  ];

  const handleSaveEdit = () => {
    if (!taskId) return;
    const payload: { priority?: string; assigned_user_id?: string; assigned_division_id?: string } = {};
    if (editPriority !== (task?.priority || 'normal')) {
      payload.priority = editPriority;
    }
    const currentUserId = task?.assigned_to?.id || '';
    const currentDivisionLabel = task?.assigned_to?.division || '';
    const desiredDivisionLabel = editDivisionId ? divisions.find((d) => d.id === editDivisionId)?.label : null;
    const assignChanged =
      (editAssignType === 'user' && editUserId !== currentUserId) ||
      (editAssignType === 'division' && desiredDivisionLabel !== currentDivisionLabel) ||
      (editAssignType === 'none' && (!!currentUserId || !!currentDivisionLabel));
    if (assignChanged) {
      if (editAssignType === 'user') {
        payload.assigned_user_id = editUserId || '';
        payload.assigned_division_id = ''; // clear division when assigning to user
      } else if (editAssignType === 'division') {
        payload.assigned_division_id = editDivisionId || '';
        // do not send assigned_user_id so backend only sets division
      } else {
        // "Unassigned" = assign to current user
        const meId = currentUser?.id != null ? String(currentUser.id) : '';
        payload.assigned_user_id = meId;
        payload.assigned_division_id = '';
      }
    }
    if (!payload.priority && !assignChanged) {
      setIsEditMode(false);
      return;
    }
    updateTaskMutation.mutate(payload);
  };

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
    updateTaskMutation.isPending ||
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

  const uploadImageFiles = async (files: File[]) => {
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
    }
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

  const modalTitle = !isEditingTitle ? (
    <button
      type="button"
      className={uiCx(uiTypography.sectionTitle, 'block max-w-full truncate text-left hover:text-brand-red')}
      onClick={() => {
        if (isBusy || !task) return;
        setIsEditingTitle(true);
        requestAnimationFrame(() => titleInputRef.current?.focus());
      }}
      title="Click to edit title"
    >
      {titleDraft || (isLoading ? 'Loading…' : 'Task')}
    </button>
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
      className={uiCx(
        'w-full bg-white font-semibold text-gray-900 outline-none transition-colors focus:border-gray-400 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gray-400/35 disabled:cursor-not-allowed disabled:bg-gray-100',
        uiSpacing.controlX,
        uiSpacing.controlY,
        uiRadius.control,
        uiBorders.input,
        uiTypography.sectionTitle,
      )}
    />
  );

  const modalFooter = task ? (
    <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-end')}>
      {task.status === 'accepted' && task.permissions.can_start && (
        <AppButton type="button" size="sm" disabled={isBusy} onClick={() => startMutation.mutate()}>
          Start
        </AppButton>
      )}
      {task.status === 'in_progress' && task.permissions.can_block && (
        <AppButton type="button" size="sm" variant="secondary" disabled={isBusy} onClick={() => blockMutation.mutate()}>
          Pause
        </AppButton>
      )}
      {task.status === 'blocked' && task.permissions.can_unblock && (
        <AppButton type="button" size="sm" disabled={isBusy} onClick={() => unblockMutation.mutate()}>
          Resume
        </AppButton>
      )}
      {(task.status === 'in_progress' || task.status === 'blocked') && task.permissions.can_conclude && (
        <AppButton type="button" size="sm" disabled={isBusy} onClick={() => setStatus('done')}>
          Done
        </AppButton>
      )}
      {task.status === 'done' && task.permissions.can_archive && (
        <AppButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={isBusy || archiveMutation.isPending}
          loading={archiveMutation.isPending}
          onClick={() => archiveMutation.mutate()}
        >
          Archive
        </AppButton>
      )}
      <AppButton
        type="button"
        size="sm"
        variant={isEditMode ? 'primary' : 'secondary'}
        disabled={isBusy}
        onClick={() => setIsEditMode((v) => !v)}
      >
        {isEditMode ? 'Done editing' : 'Edit'}
      </AppButton>
    </div>
  ) : null;

  const taskQuickInfo = (
    <>
      <p>Move tasks through To do → In progress → Done. Use Pause when blocked.</p>
      <p>Footer actions match what you can do in the current status.</p>
      <p>Click the status badge below the title to change status when allowed.</p>
      <p>Use the Activity tab to read the log or add a comment.</p>
    </>
  );

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      layout="detail"
      size="lg"
      title={modalTitle}
      description={task ? getTaskSourceLabel(task) : isLoading ? 'Loading task…' : undefined}
      quickInfo={taskQuickInfo}
      footer={modalFooter}
    >
      {isLoading ? (
        <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
          <div className={uiCx(uiRadius.card, uiBorders.subtle, uiSpacing.cardPadding, 'animate-pulse')}>
            <div className="h-4 w-2/3 rounded bg-gray-100" />
            <div className="mt-3 h-3 w-1/3 rounded bg-gray-100" />
          </div>
        </div>
      ) : !task ? (
        <div className={uiSpacing.cardPadding}>
          <AppEmptyState title="Task not found" />
        </div>
      ) : (
        <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center')}>
            <div className="relative" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setStatusDropdownOpen((v) => !v)}
                disabled={isBusy}
                className="disabled:opacity-60"
                title="Change status"
              >
                <AppBadge variant={getStatusBadgeVariant(task.status)}>{getStatusLabel(task.status)}</AppBadge>
              </button>
              {statusDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
                  <div
                    className={uiCx(
                      'absolute left-0 z-20 mt-2 min-w-[10rem] overflow-hidden bg-white',
                      uiRadius.dropdownMenu,
                      uiBorders.subtle,
                      uiShadows.elevated,
                    )}
                  >
                    {statusOptions.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        disabled={o.disabled || isBusy}
                        onClick={async () => {
                          await setStatus(o.value);
                          setStatusDropdownOpen(false);
                        }}
                        className={uiCx(
                          'w-full px-3 py-2 text-left text-xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50',
                          task.status === o.value && 'bg-gray-50 font-medium',
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <AppBadge variant={getPriorityBadgeVariant(task.priority)}>{getPriorityLabel(task.priority)}</AppBadge>
          </div>

          {isEditMode && (
                  <div
                    className={uiCx(
                      uiSpacing.sectionStack,
                      uiRadius.card,
                      uiBorders.subtle,
                      'border-2 border-brand-red/25 bg-brand-red/5',
                      uiSpacing.cardPadding,
                    )}
                  >
                    <h3 className={uiTypography.sectionTitle}>Edit task</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <AppSelect
                        label="Priority"
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        options={priorityOptions}
                        disabled={isBusy}
                      />
                      <div className={uiSpacing.sectionStack}>
                        <span className={uiTypography.controlLabel}>Assign to</span>
                        <div className={uiLayout.actionsRow}>
                          {(['none', 'user', 'division'] as const).map((t) => (
                            <AppButton
                              key={t}
                              type="button"
                              size="sm"
                              variant={editAssignType === t ? 'primary' : 'secondary'}
                              className="min-w-0 flex-1"
                              onClick={() => {
                                setEditAssignType(t);
                                if (t !== 'user') setEditUserId('');
                                if (t !== 'division') setEditDivisionId('');
                              }}
                            >
                              {t === 'none' ? 'Unassigned' : t === 'user' ? 'User' : 'Division'}
                            </AppButton>
                          ))}
                        </div>
                        {editAssignType === 'user' && (
                          <AppUserSelect
                            mode="single"
                            label="User"
                            value={editUserId}
                            onChange={setEditUserId}
                            placeholder="Search or select user…"
                            disabled={isBusy}
                          />
                        )}
                        {editAssignType === 'division' && (
                          <AppSelect
                            value={editDivisionId}
                            onChange={(e) => setEditDivisionId(e.target.value)}
                            disabled={isBusy}
                            placeholder="Select division..."
                            options={divisions.map((d) => ({ value: d.id, label: d.label }))}
                          />
                        )}
                      </div>
                    </div>
                    <div className={uiLayout.actionsRow}>
                      <AppButton
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={isBusy || updateTaskMutation.isPending}
                        loading={updateTaskMutation.isPending}
                      >
                        {updateTaskMutation.isPending ? 'Saving…' : 'Save changes'}
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => setIsEditMode(false)}
                        disabled={updateTaskMutation.isPending}
                      >
                        Cancel
                      </AppButton>
                    </div>
                  </div>
          )}

          <AppTabs
            tabs={[
              { key: 'description', label: 'Description' },
              { key: 'images', label: 'Images', count: parsed.fileIds.length || undefined },
              { key: 'details', label: 'Details' },
              { key: 'activity', label: 'Activity', count: logEntries.length || undefined },
            ]}
            value={activeTab}
            onChange={(key) => setActiveTab(key as TaskModalTab)}
          />

          <div
            className={uiCx(
              uiRadius.card,
              uiBorders.subtle,
              uiColors.surfaceSubtle,
              uiSpacing.compactCardPadding,
              'min-h-[14rem]',
            )}
          >
            {activeTab === 'description' && (
              <div className={uiSpacing.sectionStack}>
                {task.origin?.type === 'bug' ? (
                  <BugReportDescription description={task.description || ''} />
                ) : (
                  <AppTextarea
                    defaultValue={parsed.description}
                    rows={8}
                    placeholder="Add details…"
                    onBlur={(e) => handleSaveDescription(e.target.value)}
                    disabled={isBusy}
                  />
                )}
              </div>
            )}

            {activeTab === 'images' && (
              <div className={uiSpacing.sectionStack}>
                <AppFileUpload
                  mode="multiple"
                  value={[]}
                  onChange={() => {}}
                  accept="image/*"
                  label="Add images"
                  fieldHint="Images\n\nDrag, click, or paste (Ctrl+V). Upload starts when files are added."
                  disabled={isBusy || uploadingImages}
                  onFilesSelected={uploadImageFiles}
                />
                {uploadingImages ? (
                  <p className={uiTypography.helper}>Uploading…</p>
                ) : null}
                {parsed.fileIds.length === 0 ? (
                  <p className={uiCx(uiTypography.helper, 'py-4 text-center')}>No images uploaded yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {parsed.fileIds.map((fid) => (
                      <a
                        key={fid}
                        href={withFileAccessToken(`/files/${fid}/download`)}
                        target="_blank"
                        rel="noreferrer"
                        className={uiCx(
                          'block overflow-hidden bg-white transition hover:opacity-90',
                          uiRadius.control,
                          uiBorders.subtle,
                        )}
                        title="Open image"
                      >
                        <img
                          src={withFileAccessToken(`/files/${fid}/thumbnail?w=480`)}
                          className="h-32 w-full object-cover"
                          alt="Task attachment"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'details' && (
              <dl className={uiSpacing.sectionStack}>
                <div className="flex items-center justify-between gap-3">
                  <dt className={uiTypography.helper}>Created</dt>
                  <dd className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{formatDateTime(task.created_at)}</dd>
                </div>
                {task.started_at && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className={uiTypography.helper}>
                      Started{task.started_by?.name ? ` by ${task.started_by.name}` : ''}
                    </dt>
                    <dd className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{formatDateTime(task.started_at)}</dd>
                  </div>
                )}
                {task.concluded_at && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className={uiTypography.helper}>
                      Completed{task.concluded_by?.name ? ` by ${task.concluded_by.name}` : ''}
                    </dt>
                    <dd className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{formatDateTime(task.concluded_at)}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <dt className={uiTypography.helper}>Source</dt>
                  <dd className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{getTaskSourceLabel(task)}</dd>
                </div>
                {task.request?.id && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className={uiTypography.helper}>Linked request</dt>
                    <dd>
                      <button
                        type="button"
                        className={uiCx(uiTypography.body, 'font-medium text-brand-red hover:text-brand-red/80')}
                        onClick={() => navigate('/task-requests', { state: { requestId: task.request?.id } })}
                      >
                        {task.request.title}
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {activeTab === 'activity' && (
              <div className={uiSpacing.sectionStack}>
                <div
                  ref={logScrollRef}
                  className={uiCx(
                    uiSpacing.sectionStack,
                    'max-h-56 overflow-y-auto',
                  )}
                >
                  {logEntries.length === 0 ? (
                    <p className={uiCx(uiTypography.helper, 'py-6 text-center')}>No activity yet.</p>
                  ) : (
                    logEntries.map((e) => (
                      <div
                        key={e.id}
                        className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, uiSpacing.compactCardPadding)}
                      >
                        <div className={uiCx('mb-2 flex items-center justify-between', uiTypography.overline)}>
                          <span>{e.actor?.name || 'System'}</span>
                          <span>{formatDateTime(e.created_at)}</span>
                        </div>
                        <div className={uiCx(uiTypography.body, 'whitespace-pre-wrap')}>{e.message}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className={uiCx('border-t border-gray-100 pt-3', uiSpacing.sectionStack)}>
                  <AppTextarea
                    label="Add a comment"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={2}
                    placeholder="Type your comment…"
                    disabled={isBusy}
                  />
                  <AppButton
                    type="button"
                    className="w-full"
                    size="sm"
                    onClick={() => addLogMutation.mutate(commentText)}
                    disabled={addLogMutation.isPending || !commentText.trim()}
                    loading={addLogMutation.isPending}
                  >
                    {addLogMutation.isPending ? 'Sending…' : 'Send'}
                  </AppButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppFormModal>
  );
}

