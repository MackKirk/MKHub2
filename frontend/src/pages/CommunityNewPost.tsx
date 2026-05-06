import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Editor } from '@tiptap/core';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import CommunityPostRichTextEditor from '@/components/community/CommunityPostRichTextEditor';
import { CommunityPageHeader } from '@/components/community/CommunityPageHeader';
import { CommunityNewPostPreviewModal } from '@/components/community/CommunityNewPostPreviewModal';
import {
  communityContentLooksLikeHtml,
  isCommunityEditorHtmlEmpty,
  legacyPlainToEditorHtml,
  sanitizeCommunityPostHtml,
  stripHtmlToPlain,
} from '@/lib/communityPostHtml';
import { extractMentionsFromEditor } from '@/lib/communityPostEditorUtils';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';

const RELATED_AREAS: { value: string; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'projects', label: 'Projects' },
  { value: 'opportunities', label: 'Opportunities' },
  { value: 'repairs_maintenance', label: 'Repairs & Maintenance' },
  { value: 'safety', label: 'Safety' },
  { value: 'fleet', label: 'Fleet' },
  { value: 'hr', label: 'HR' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'training', label: 'Training' },
];

const PRIORITIES: { value: string; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'important', label: 'Important' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'critical', label: 'Critical' },
];

const TITLE_SOFT_MAX = 200;
const CONTENT_SOFT_MAX = 20000;

/** Hero/cover image is deprecated; downloadable files (stored as attachment_files JSON + legacy document_file_id = first). */
const ATTACHMENT_MAX_BYTES = 45 * 1024 * 1024;
const MAX_COMMUNITY_ATTACHMENTS = 30;
const ALLOWED_ATTACHMENT_NAME = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|zip|7z|rar|png|jpe?g|gif|webp|svg|mp3|wav|mp4|mov|webm|json|xml)$/i;

type CommunityPostLocalAttachment = { fileId: string; name: string };

function isAllowedCommunityAttachment(file: File): boolean {
  if (file.size > ATTACHMENT_MAX_BYTES) return false;
  return ALLOWED_ATTACHMENT_NAME.test(file.name);
}

type PublishMode = 'now' | 'scheduled' | 'draft';

type AudienceEmployee = { id: string; name: string };

type AudienceTargetType = 'all' | 'divisions' | 'users' | 'groups';

const MAX_AUDIENCE_EMPLOYEES = 400;

type CommunityPostFormBaseline = {
  title: string;
  content: string;
  priority: string;
  requiresReadConfirmation: boolean;
  attachments: CommunityPostLocalAttachment[];
  targetType: AudienceTargetType;
  selectedDivisions: string[];
  selectedAudienceUsers: AudienceEmployee[];
  selectedCommunityGroupIds: string[];
  publishMode: PublishMode;
  scheduledAt: string;
  relatedArea: string;
};

const NEW_POST_FORM_BASELINE: CommunityPostFormBaseline = {
  title: '',
  content: '<p></p>',
  priority: 'normal',
  requiresReadConfirmation: false,
  attachments: [],
  targetType: 'all',
  selectedDivisions: [],
  selectedAudienceUsers: [],
  selectedCommunityGroupIds: [],
  publishMode: 'now',
  scheduledAt: '',
  relatedArea: 'general',
};

function serializeCommunityPostFormBaseline(b: CommunityPostFormBaseline): string {
  const divs = [...b.selectedDivisions].map(String).sort();
  const groups = [...b.selectedCommunityGroupIds].map(String).sort();
  const users = [...b.selectedAudienceUsers]
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, c) => a.id.localeCompare(c.id));
  const atts = [...b.attachments]
    .map((a) => ({ fileId: a.fileId, name: a.name }))
    .sort((a, c) => a.fileId.localeCompare(c.fileId));
  const sanitizedBody = sanitizeCommunityPostHtml(b.content);
  const contentKey = isCommunityEditorHtmlEmpty(sanitizedBody) ? '' : sanitizedBody;
  return JSON.stringify({
    title: (b.title || '').trim(),
    content: contentKey,
    priority: b.priority,
    requiresReadConfirmation: b.requiresReadConfirmation,
    relatedArea: b.relatedArea,
    targetType: b.targetType,
    divisions: divs,
    groups,
    users,
    attachments: atts,
    publishMode: b.publishMode,
    scheduledAt: b.scheduledAt,
  });
}

function deriveBaselineFromExistingPost(existingPost: Record<string, unknown>): CommunityPostFormBaseline {
  const title = String(existingPost.title || '');
  const raw = String(existingPost.content || '');
  const content = communityContentLooksLikeHtml(raw) ? raw : legacyPlainToEditorHtml(raw);
  const priority = String(existingPost.priority || 'normal');
  const requiresReadConfirmation = !!existingPost.requires_read_confirmation;
  const relatedArea = String(existingPost.related_area || 'general');

  let attachments: CommunityPostLocalAttachment[] = [];
  const fromApi: CommunityPostLocalAttachment[] = Array.isArray(existingPost.attachments)
    ? (existingPost.attachments as { file_id?: string; original_name?: string }[]).map((a) => ({
        fileId: String(a.file_id || ''),
        name: String(a.original_name || 'Attachment'),
      }))
    : [];
  const dedup = fromApi.filter((a) => a.fileId);
  if (dedup.length > 0) {
    attachments = dedup;
  } else if (existingPost.document_file_id) {
    attachments = [
      {
        fileId: String(existingPost.document_file_id),
        name: String(existingPost.document_original_name || 'Attachment'),
      },
    ];
  }

  const tt = String(existingPost.target_type || 'all');
  const targetType: AudienceTargetType =
    tt === 'divisions' ? 'divisions' : tt === 'users' ? 'users' : 'all';

  const selectedDivisions = Array.isArray(existingPost.target_division_ids)
    ? (existingPost.target_division_ids as unknown[]).map(String)
    : [];

  const fromPreview = Array.isArray(existingPost.target_users_preview)
    ? (existingPost.target_users_preview as { id?: string; name?: string }[]).map((x) => ({
        id: String(x.id || ''),
        name: String(x.name || 'Unknown'),
      }))
    : [];
  const fromIds = Array.isArray(existingPost.target_user_ids)
    ? (existingPost.target_user_ids as string[]).map((id) => ({
        id: String(id),
        name: 'Employee',
      }))
    : [];
  const selectedAudienceUsers =
    fromPreview.length > 0 ? fromPreview.filter((x) => x.id) : fromIds.filter((x) => x.id);

  let publishMode: PublishMode = 'now';
  let scheduledAt = '';
  const st = existingPost.status as string | undefined;
  if (st === 'draft') publishMode = 'draft';
  else if (st === 'scheduled') {
    publishMode = 'scheduled';
    if (existingPost.publish_at) {
      const d = new Date(String(existingPost.publish_at));
      const pad = (n: number) => String(n).padStart(2, '0');
      scheduledAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  return {
    title,
    content,
    priority,
    requiresReadConfirmation,
    attachments,
    targetType,
    selectedDivisions,
    selectedAudienceUsers,
    selectedCommunityGroupIds: [],
    publishMode,
    scheduledAt,
    relatedArea,
  };
}

function sectionCardClass() {
  return 'rounded-xl border border-gray-200/80 bg-white shadow-sm';
}

function priorityPillClass(value: string, active: boolean) {
  const base =
    'flex-1 min-w-[4.5rem] px-2 py-2 rounded-lg text-xs font-semibold border transition text-center';
  if (!active) return `${base} border-gray-200 bg-gray-50/80 text-gray-600 hover:border-gray-300`;
  if (value === 'critical') return `${base} border-red-900 bg-red-900 text-white`;
  if (value === 'urgent') return `${base} border-red-400 bg-red-50 text-red-900`;
  if (value === 'important') return `${base} border-amber-300 bg-amber-50 text-amber-900`;
  return `${base} border-gray-300 bg-white text-gray-900`;
}

export default function CommunityNewPost() {
  const navigate = useNavigate();
  const { postId } = useParams<{ postId?: string }>();
  const isEdit = Boolean(postId);
  const queryClient = useQueryClient();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('<p></p>');
  const [priority, setPriority] = useState<string>('normal');
  const [requiresReadConfirmation, setRequiresReadConfirmation] = useState(false);
  const [attachments, setAttachments] = useState<CommunityPostLocalAttachment[]>([]);
  const [targetType, setTargetType] = useState<AudienceTargetType>('all');
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [selectedAudienceUsers, setSelectedAudienceUsers] = useState<AudienceEmployee[]>([]);
  const [selectedCommunityGroupIds, setSelectedCommunityGroupIds] = useState<string[]>([]);
  const [employeeSearchInput, setEmployeeSearchInput] = useState('');
  const [debouncedEmployeeQ, setDebouncedEmployeeQ] = useState('');
  const [employeeAudienceOpen, setEmployeeAudienceOpen] = useState(false);
  const employeeAudienceRef = useRef<HTMLDivElement>(null);
  const [publishMode, setPublishMode] = useState<PublishMode>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [relatedArea, setRelatedArea] = useState('general');
  const [editorSession, setEditorSession] = useState(0);
  const editorRef = useRef<Editor | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [mobileComposerOpen, setMobileComposerOpen] = useState(true);
  const [mobileAudienceOpen, setMobileAudienceOpen] = useState(false);
  const [savedFormSnapshot, setSavedFormSnapshot] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<any>('GET', '/settings'),
  });

  const divisions = (settings?.divisions || []) as Array<{ id: string; label: string; meta?: { abbr?: string; color?: string } }>;

  const { data: communityGroupsRaw } = useQuery({
    queryKey: ['community-groups'],
    queryFn: () => api<any>('GET', '/community/groups').catch(() => []),
  });

  const communityGroups = useMemo(() => {
    const rows = Array.isArray(communityGroupsRaw) ? [...communityGroupsRaw] : [];
    rows.sort((a, b) =>
      String(a.name || '')
        .trim()
        .toLocaleLowerCase()
        .localeCompare(String(b.name || '').trim().toLocaleLowerCase(), undefined, { sensitivity: 'base' })
    );
    return rows as Array<{ id: string; name: string; member_count?: number }>;
  }, [communityGroupsRaw]);

  const approxGroupAudienceMembers = useMemo(() => {
    if (targetType !== 'groups') return 0;
    let n = 0;
    for (const id of selectedCommunityGroupIds) {
      const g = communityGroups.find((x) => x.id === id);
      if (g?.member_count != null) n += Number(g.member_count);
    }
    return n;
  }, [targetType, selectedCommunityGroupIds, communityGroups]);

  useEffect(() => {
    if (!employeeAudienceOpen) return;
    const q = employeeSearchInput.trim();
    const delay = q.length === 0 ? 0 : 300;
    const t = setTimeout(() => setDebouncedEmployeeQ(q), delay);
    return () => clearTimeout(t);
  }, [employeeSearchInput, employeeAudienceOpen]);

  useEffect(() => {
    if (targetType !== 'users') {
      setEmployeeAudienceOpen(false);
    }
  }, [targetType]);

  useEffect(() => {
    if (!employeeAudienceOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (employeeAudienceRef.current && !employeeAudienceRef.current.contains(e.target as Node)) {
        setEmployeeAudienceOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [employeeAudienceOpen]);

  const { data: employeeSearchRows = [] } = useQuery({
    queryKey: ['employees-audience', debouncedEmployeeQ],
    queryFn: () => {
      const q = debouncedEmployeeQ.trim();
      if (q.length >= 2) {
        return api<any[]>('GET', `/employees?q=${encodeURIComponent(q)}`);
      }
      return api<any[]>('GET', '/employees');
    },
    enabled: employeeAudienceOpen,
  });

  const employeesSortedAlphabetically = useMemo(() => {
    const rows = Array.isArray(employeeSearchRows) ? [...employeeSearchRows] : [];
    const sortKey = (r: { name?: string; username?: string }) =>
      String(r.name || r.username || '').trim().toLocaleLowerCase();
    rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b), undefined, { sensitivity: 'base' }));
    return rows;
  }, [employeeSearchRows]);

  const { data: existingPost, isLoading: loadingExisting } = useQuery({
    queryKey: ['community-post-one', postId],
    queryFn: () => api<any>('GET', `/community/posts/${postId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!isEdit) return;
    if (loadingExisting || !existingPost) {
      setSavedFormSnapshot(null);
      return;
    }
    const b = deriveBaselineFromExistingPost(existingPost as Record<string, unknown>);
    setTitle(b.title);
    setContent(b.content);
    setEditorSession((s) => s + 1);
    setPriority(b.priority);
    setRequiresReadConfirmation(b.requiresReadConfirmation);
    setRelatedArea(b.relatedArea);
    setAttachments(b.attachments);
    setTargetType(b.targetType);
    setSelectedDivisions(b.selectedDivisions);
    setSelectedAudienceUsers(b.selectedAudienceUsers);
    setSelectedCommunityGroupIds(b.selectedCommunityGroupIds);
    setPublishMode(b.publishMode);
    setScheduledAt(b.scheduledAt);
    setSavedFormSnapshot(serializeCommunityPostFormBaseline(b));
  }, [isEdit, existingPost, loadingExisting]);

  useEffect(() => {
    if (isEdit) return;
    setSavedFormSnapshot(serializeCommunityPostFormBaseline(NEW_POST_FORM_BASELINE));
  }, [isEdit]);

  const createPostMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api('POST', '/community/posts', payload),
    onSuccess: () => {
      toast.success('Announcement saved successfully!');
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
      navigate('/community');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to save announcement');
    },
  });

  const patchPostMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api('PATCH', `/community/posts/${postId}`, payload),
    onSuccess: () => {
      toast.success('Announcement updated!');
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['my-community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-post-one', postId] });
      navigate('/community');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update announcement');
    },
  });

  const buildPayload = useCallback(
    (opts?: { publishModeOverride?: PublishMode }): Record<string, unknown> => {
      const mode = opts?.publishModeOverride ?? publishMode;
      const isUrgent = priority === 'urgent' || priority === 'critical';
      const base: Record<string, unknown> = {
        title: title.trim(),
        content: sanitizeCommunityPostHtml(content),
        is_urgent: isUrgent,
        requires_read_confirmation: requiresReadConfirmation,
        /* Cover/hero image removed — always clear legacy photo_file_id when saving from this form */
        photo_file_id: null,
        document_file_id: null,
        attachments: attachments.map((a) => ({ file_id: a.fileId, name: a.name })),
        target_type: targetType === 'groups' ? 'users' : targetType,
        target_division_ids: targetType === 'divisions' ? selectedDivisions : [],
        priority,
        related_area: relatedArea,
        mentions: extractMentionsFromEditor(editorRef.current),
      };
      if (targetType === 'users') {
        base.target_user_ids = selectedAudienceUsers.map((u) => u.id);
      } else if (targetType === 'groups') {
        base.target_community_group_ids = [...selectedCommunityGroupIds];
      }

      if (!isEdit) {
        base.publish_mode = mode;
        if (mode === 'scheduled') {
          const iso = scheduledAt ? new Date(scheduledAt).toISOString() : '';
          base.publish_at = iso;
        }
      } else {
        if (mode === 'draft') base.publish_mode = 'draft';
        else if (mode === 'scheduled') {
          base.publish_mode = 'scheduled';
          base.publish_at = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
        } else {
          base.publish_mode = 'now';
        }
      }

      return base;
    },
    [
      isEdit,
      title,
      content,
      priority,
      requiresReadConfirmation,
      attachments,
      targetType,
      selectedDivisions,
      selectedAudienceUsers,
      selectedCommunityGroupIds,
      relatedArea,
      publishMode,
      scheduledAt,
    ]
  );

  const validate = useCallback(
    (modeOverride?: PublishMode) => {
      const mode = modeOverride ?? publishMode;
      if (!title.trim()) return { ok: false as const, message: 'Title is required' };
      if (isCommunityEditorHtmlEmpty(content)) return { ok: false as const, message: 'Content is required' };
      if (targetType === 'divisions' && selectedDivisions.length === 0) {
        return { ok: false as const, message: 'Select at least one division' };
      }
      if (targetType === 'users' && selectedAudienceUsers.length === 0) {
        return { ok: false as const, message: 'Select at least one employee' };
      }
      if (targetType === 'groups' && selectedCommunityGroupIds.length === 0) {
        return { ok: false as const, message: 'Select at least one community group' };
      }
      if (!isEdit && mode === 'scheduled' && !scheduledAt) {
        return { ok: false as const, message: 'Choose a date and time for the scheduled post' };
      }
      if (isEdit && mode === 'scheduled' && !scheduledAt) {
        return { ok: false as const, message: 'Choose a date and time for the scheduled post' };
      }
      return { ok: true as const };
    },
    [title, content, targetType, selectedDivisions, selectedAudienceUsers, selectedCommunityGroupIds, isEdit, publishMode, scheduledAt],
  );

  const submitPayload = (opts?: { publishModeOverride?: PublishMode }) => {
    const v = validate(opts?.publishModeOverride);
    if (!v.ok) {
      setTriedSubmit(true);
      toast.error(v.message);
      return;
    }
    const payload = buildPayload(opts);
    if (isEdit) {
      patchPostMutation.mutate(payload);
    } else {
      createPostMutation.mutate(payload);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);
    submitPayload();
  };

  const handleSaveAsDraft = () => {
    setTriedSubmit(true);
    submitPayload({ publishModeOverride: 'draft' });
  };

  const appendUploadedAttachment = async (file: File): Promise<boolean> => {
    if (!isAllowedCommunityAttachment(file)) {
      toast.error(
        `Unsupported or too large file (max ${Math.round(ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB). Use common office/media types (PDF, Office, ZIP, images, etc.).`
      );
      return false;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('original_name', file.name);
    formData.append('content_type', file.type || 'application/octet-stream');
    formData.append('project_id', '');
    formData.append('client_id', '');
    formData.append('employee_id', '');
    formData.append('category_id', 'community-attachment');

    const conf = await api<{ id: string }>('POST', '/files/upload-proxy', formData);

    if (!conf || !conf.id) {
      throw new Error('Invalid upload response');
    }
    const id = String(conf.id);
    let added = false;
    setAttachments((prev) => {
      if (prev.length >= MAX_COMMUNITY_ATTACHMENTS) return prev;
      if (prev.some((p) => p.fileId === id)) return prev;
      added = true;
      return [...prev, { fileId: id, name: file.name }];
    });
    return added;
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    let ok = 0;
    try {
      for (const file of files) {
        if (await appendUploadedAttachment(file)) ok += 1;
      }
      if (ok > 0) toast.success(ok === 1 ? 'Attachment added' : `${ok} attachments added`);
    } catch (error: unknown) {
      console.error('Failed to upload attachment:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload attachment');
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    let ok = 0;
    try {
      for (const file of files) {
        if (await appendUploadedAttachment(file)) ok += 1;
      }
      if (ok > 0) toast.success(ok === 1 ? 'Attachment added' : `${ok} attachments added`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  const removeAttachment = (fileId: string) => {
    setAttachments((prev) => prev.filter((a) => a.fileId !== fileId));
  };

  const toggleDivision = (divisionId: string) => {
    setSelectedDivisions((prev) =>
      prev.includes(divisionId) ? prev.filter((id) => id !== divisionId) : [...prev, divisionId]
    );
  };

  const toggleCommunityGroup = (groupId: string) => {
    setSelectedCommunityGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const toggleAudienceUserRow = (row: { id: string; name?: string; username?: string }) => {
    const id = String(row.id);
    const name = String(row.name || row.username || 'Employee');
    setSelectedAudienceUsers((prev) => {
      if (prev.some((p) => p.id === id)) {
        return prev.filter((p) => p.id !== id);
      }
      if (prev.length >= MAX_AUDIENCE_EMPLOYEES) return prev;
      return [...prev, { id, name }];
    });
  };

  const removeAudienceUser = (id: string) => {
    setSelectedAudienceUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const busy = createPostMutation.isLoading || patchPostMutation.isLoading;

  const currentFormSnapshot = useMemo(
    () =>
      serializeCommunityPostFormBaseline({
        title,
        content,
        priority,
        requiresReadConfirmation,
        attachments,
        targetType,
        selectedDivisions,
        selectedAudienceUsers,
        selectedCommunityGroupIds,
        publishMode,
        scheduledAt,
        relatedArea,
      }),
    [
      title,
      content,
      priority,
      requiresReadConfirmation,
      attachments,
      targetType,
      selectedDivisions,
      selectedAudienceUsers,
      selectedCommunityGroupIds,
      publishMode,
      scheduledAt,
      relatedArea,
    ]
  );

  const hasUnsavedFormChanges = savedFormSnapshot !== null && currentFormSnapshot !== savedFormSnapshot;

  const handleGuardDiscard = useCallback(() => {
    setTriedSubmit(false);
    const b =
      isEdit && existingPost
        ? deriveBaselineFromExistingPost(existingPost as Record<string, unknown>)
        : NEW_POST_FORM_BASELINE;
    setTitle(b.title);
    setContent(b.content);
    setEditorSession((s) => s + 1);
    setPriority(b.priority);
    setRequiresReadConfirmation(b.requiresReadConfirmation);
    setRelatedArea(b.relatedArea);
    setAttachments(b.attachments);
    setTargetType(b.targetType);
    setSelectedDivisions(b.selectedDivisions);
    setSelectedAudienceUsers(b.selectedAudienceUsers);
    setSelectedCommunityGroupIds(b.selectedCommunityGroupIds);
    setPublishMode(b.publishMode);
    setScheduledAt(b.scheduledAt);
  }, [isEdit, existingPost]);

  const guardFlushSave = useCallback(async () => {
    // Leaving mid-compose: never auto-publish a new announcement (Save and Leave / Save and Reload).
    if (!isEdit) {
      const v = validate('draft');
      if (!v.ok) {
        toast.error(v.message);
        throw new Error(v.message);
      }
      const payload = buildPayload({ publishModeOverride: 'draft' });
      await createPostMutation.mutateAsync(payload);
      return;
    }
    const v = validate();
    if (!v.ok) {
      toast.error(v.message);
      throw new Error(v.message);
    }
    const payload = buildPayload();
    await patchPostMutation.mutateAsync(payload);
  }, [validate, buildPayload, isEdit, patchPostMutation, createPostMutation]);

  useUnsavedChangesGuard(hasUnsavedFormChanges, guardFlushSave, handleGuardDiscard);

  const audienceSummary =
    targetType === 'all'
      ? 'All employees'
      : targetType === 'users'
        ? selectedAudienceUsers.length === 0
          ? 'No employees selected yet'
          : `${selectedAudienceUsers.length} employee${selectedAudienceUsers.length === 1 ? '' : 's'}`
        : targetType === 'groups'
          ? selectedCommunityGroupIds.length === 0
            ? 'No community groups selected yet'
            : `${selectedCommunityGroupIds.length} group${selectedCommunityGroupIds.length === 1 ? '' : 's'}${
                approxGroupAudienceMembers > 0
                  ? ` (~${approxGroupAudienceMembers} member${approxGroupAudienceMembers === 1 ? '' : 's'}, approximate)`
                  : ''
              }`
          : selectedDivisions.length === 0
            ? 'No divisions selected yet'
            : `${selectedDivisions.length} division${selectedDivisions.length === 1 ? '' : 's'}`;

  const divisionError = triedSubmit && targetType === 'divisions' && selectedDivisions.length === 0;
  const usersAudienceError = triedSubmit && targetType === 'users' && selectedAudienceUsers.length === 0;
  const groupsAudienceError = triedSubmit && targetType === 'groups' && selectedCommunityGroupIds.length === 0;
  const scheduleError =
    triedSubmit &&
    publishMode === 'scheduled' &&
    !scheduledAt &&
    (!isEdit || (existingPost && ['draft', 'scheduled'].includes(existingPost.status)));

  const showPublicationControls =
    !isEdit || (existingPost && ['draft', 'scheduled', 'cancelled'].includes(existingPost.status));

  const canPublishViaSave =
    isEdit &&
    publishMode === 'now' &&
    existingPost &&
    ['draft', 'scheduled', 'cancelled'].includes(String(existingPost.status || ''));

  const primaryLabel = busy
    ? 'Saving…'
    : canPublishViaSave
      ? 'Save & publish'
    : isEdit
      ? 'Save changes'
      : publishMode === 'draft'
        ? 'Save draft'
        : publishMode === 'scheduled'
          ? 'Schedule announcement'
          : 'Send announcement';

  const plainBodyLen = stripHtmlToPlain(content).length;

  const formDisabled =
    busy ||
    !title.trim() ||
    isCommunityEditorHtmlEmpty(content) ||
    (targetType === 'divisions' && selectedDivisions.length === 0) ||
    (targetType === 'users' && selectedAudienceUsers.length === 0) ||
    (targetType === 'groups' && selectedCommunityGroupIds.length === 0) ||
    (!isEdit && publishMode === 'scheduled' && !scheduledAt) ||
    (isEdit && publishMode === 'scheduled' && !scheduledAt && showPublicationControls);

  if (isEdit && loadingExisting) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="rounded-xl border bg-white h-16" />
        <div className="rounded-xl border bg-white h-96" />
      </div>
    );
  }

  const composerBlock = (
    <div
      className={`flex flex-col gap-5 p-5 sm:p-6 lg:min-h-0 lg:flex-1 ${sectionCardClass()}`}
    >
      <div className="shrink-0">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <label htmlFor="title" className="text-sm font-medium text-gray-800">
            Title <span className="text-red-500">*</span>
          </label>
          <span
            className={`text-xs tabular-nums ${title.length > TITLE_SOFT_MAX ? 'text-amber-600 font-medium' : 'text-gray-400'}`}
          >
            {title.length} / {TITLE_SOFT_MAX}
          </span>
        </div>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Clear, specific headline…"
          maxLength={280}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
          required
        />
      </div>

      <div className="flex min-h-[18rem] flex-1 flex-col gap-2 lg:min-h-0">
        <div className="flex shrink-0 items-baseline justify-between gap-2">
          <label htmlFor="content" className="text-sm font-medium text-gray-800">
            Announcement <span className="text-red-500">*</span>
          </label>
          <span
            className={`text-xs tabular-nums ${plainBodyLen > CONTENT_SOFT_MAX ? 'text-amber-600 font-medium' : 'text-gray-400'}`}
          >
            {plainBodyLen.toLocaleString()} chars
          </span>
        </div>
        <div className="min-h-0 flex-1">
          <CommunityPostRichTextEditor
            editorKey={`${postId || 'new'}-${editorSession}`}
            initialHtml={content || '<p></p>'}
            onChangeHtml={setContent}
            fillHeight
            className="h-full min-h-0"
            onEditorReady={(ed) => {
              editorRef.current = ed;
            }}
          />
        </div>
      </div>

      <div className="shrink-0">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between mb-2">
          <span className="text-sm font-medium text-gray-800">Attachments (optional)</span>
          <span className="text-xs text-gray-500">
            Up to {MAX_COMMUNITY_ATTACHMENTS} files 
          </span>
        </div>

        {attachments.length > 0 && (
          <ul className="space-y-2 mb-3">
            {attachments.map((a) => (
              <li
                key={a.fileId}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/80 max-w-2xl"
              >
                <svg className="w-7 h-7 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="flex-1 text-sm text-gray-800 truncate" title={a.name}>
                  {a.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.fileId)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 flex-shrink-0"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {attachments.length < MAX_COMMUNITY_ATTACHMENTS && (
          <div
            ref={dropRef}
            onDragEnter={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(e) => {
              if (!dropRef.current?.contains(e.relatedTarget as Node)) setDropActive(false);
            }}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
              dropActive ? 'border-brand-red bg-red-50/40' : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
            }`}
          >
            <p className="text-sm font-medium text-gray-800">Drop files here to attach</p>
            <p className="text-xs text-gray-500 mt-1 max-w-lg mx-auto">
              You can drop or select multiple files at once (max{' '}
              {Math.round(ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB each).
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
              >
                Choose files
              </button>
            </div>
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.7z,.rar,.png,.jpg,.jpeg,.gif,.webp,.svg,.mp3,.wav,.mp4,.mov,.webm,.json,.xml"
              onChange={handleAttachmentUpload}
              className="hidden"
            />
          </div>
        )}
      </div>
    </div>
  );

  const sidebarBlock = (
    <div className="space-y-4">
      {showPublicationControls && (
        <div className={`p-5 sm:p-6 space-y-4 ${sectionCardClass()}`}>
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-sm font-semibold text-gray-900">When to publish</h2>
            <p className="text-xs text-gray-500 mt-0.5">Control timing before anyone sees this</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { id: 'now' as const, label: 'Now', sub: 'Live immediately' },
                { id: 'scheduled' as const, label: 'Schedule', sub: 'Pick date & time' },
                { id: 'draft' as const, label: 'Draft', sub: 'Save for later' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPublishMode(opt.id)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  publishMode === opt.id
                    ? 'border-brand-red bg-red-50/60 ring-1 ring-brand-red/25'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-xs font-semibold text-gray-900">{opt.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{opt.sub}</div>
              </button>
            ))}
          </div>
          {publishMode === 'scheduled' && (
            <div>
              <label htmlFor="scheduled-at" className="block text-xs font-medium text-gray-600 mb-1.5">
                Date & time (local)
              </label>
              <input
                id="scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red ${
                  scheduleError ? 'border-red-400 bg-red-50/30' : 'border-gray-200'
                }`}
              />
              {scheduleError && <p className="text-xs text-red-600 mt-1">Select a valid schedule time.</p>}
            </div>
          )}
        </div>
      )}

      <div className={`flex items-center p-5 sm:p-6 ${sectionCardClass()}`}>
        <label htmlFor="read-confirmation" className="group flex w-full cursor-pointer items-center gap-3">
          <input
            id="read-confirmation"
            type="checkbox"
            className="peer sr-only"
            checked={requiresReadConfirmation}
            onChange={(e) => setRequiresReadConfirmation(e.target.checked)}
          />
          <span
            aria-hidden
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 shadow-sm transition-all duration-200 ease-out outline-none ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-red/40 group-hover:border-gray-400 ${
              requiresReadConfirmation
                ? 'border-brand-red bg-brand-red shadow-md'
                : 'border-gray-300 bg-white'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              className={`h-3 w-3 text-white transition duration-200 ease-out ${
                requiresReadConfirmation ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
              }`}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-900">Request read confirmation</span>
            <p className="text-xs text-gray-500 mt-0.5">Recipients must acknowledge they have read this post.</p>
          </div>
        </label>
      </div>

      <div className={`p-5 sm:p-6 space-y-4 ${sectionCardClass()}`}>
        <div className="border-b border-gray-100 pb-3">
          <h2 className="text-sm font-semibold text-gray-900">Priority & topic</h2>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Priority</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className={priorityPillClass(p.value, priority === p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="related-area" className="block text-xs font-medium text-gray-600 mb-1.5">
            Related area
          </label>
          <select
            id="related-area"
            value={relatedArea}
            onChange={(e) => setRelatedArea(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red bg-white"
          >
            {RELATED_AREAS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`p-5 sm:p-6 space-y-4 ${sectionCardClass()}`}>
        <div className="border-b border-gray-100 pb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Audience</h2>
            <p className="text-xs text-gray-500 mt-0.5">{audienceSummary}</p>
          </div>
        </div>

        <div className="space-y-3">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
              targetType === 'all' ? 'border-brand-red/40 bg-red-50/30' : 'border-gray-200 hover:bg-gray-50/80'
            }`}
          >
            <input
              type="radio"
              name="target"
              checked={targetType === 'all'}
              onChange={() => {
                setTargetType('all');
                setSelectedDivisions([]);
                setSelectedAudienceUsers([]);
                setSelectedCommunityGroupIds([]);
              }}
              className="h-4 w-4 border-gray-300 text-brand-red focus:ring-brand-red"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">All employees</div>
              <div className="text-xs text-gray-500">Company-wide visibility</div>
            </div>
          </label>
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
              targetType === 'divisions' ? 'border-brand-red/40 bg-red-50/30' : 'border-gray-200 hover:bg-gray-50/80'
            }`}
          >
            <input
              type="radio"
              name="target"
              checked={targetType === 'divisions'}
              onChange={() => {
                setTargetType('divisions');
                setSelectedAudienceUsers([]);
                setSelectedCommunityGroupIds([]);
              }}
              className="h-4 w-4 border-gray-300 text-brand-red focus:ring-brand-red"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Specific divisions</div>
              <div className="text-xs text-gray-500">Limit to selected teams</div>
            </div>
          </label>
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
              targetType === 'users' ? 'border-brand-red/40 bg-red-50/30' : 'border-gray-200 hover:bg-gray-50/80'
            }`}
          >
            <input
              type="radio"
              name="target"
              checked={targetType === 'users'}
              onChange={() => {
                setTargetType('users');
                setSelectedDivisions([]);
                setSelectedCommunityGroupIds([]);
              }}
              className="h-4 w-4 border-gray-300 text-brand-red focus:ring-brand-red"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Specific employees</div>
              <div className="text-xs text-gray-500">Only selected people see this in the feed</div>
            </div>
          </label>
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
              targetType === 'groups' ? 'border-brand-red/40 bg-red-50/30' : 'border-gray-200 hover:bg-gray-50/80'
            }`}
          >
            <input
              type="radio"
              name="target"
              checked={targetType === 'groups'}
              onChange={() => {
                setTargetType('groups');
                setSelectedDivisions([]);
                setSelectedAudienceUsers([]);
              }}
              className="h-4 w-4 border-gray-300 text-brand-red focus:ring-brand-red"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Community groups</div>
              <div className="text-xs text-gray-500">Everyone in the selected groups</div>
            </div>
          </label>
        </div>

        {targetType === 'divisions' && (
          <div
            className={`rounded-lg border p-3 ${divisionError ? 'border-red-300 bg-red-50/20' : 'border-gray-100 bg-gray-50/80'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-gray-600">Divisions</span>
              {divisions.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedDivisions(divisions.map((d) => d.id))}
                    className="text-xs font-medium text-brand-red hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDivisions([])}
                    className="text-xs font-medium text-gray-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            {divisions.length === 0 ? (
              <p className="text-xs text-gray-500">
                No divisions configured.{' '}
                <a href="/settings" className="font-medium text-brand-red underline">
                  System Settings
                </a>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {divisions.map((div) => {
                  const isSelected = selectedDivisions.includes(div.id);
                  const bgColor = div.meta?.color || '#eef2f7';
                  return (
                    <button
                      key={div.id}
                      type="button"
                      onClick={() => toggleDivision(div.id)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? 'border-brand-red bg-white text-brand-red shadow-sm'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: bgColor }} />
                      {div.meta?.abbr || div.label}
                    </button>
                  );
                })}
              </div>
            )}
            {divisionError && <p className="text-xs text-red-600 mt-2">Select at least one division.</p>}
          </div>
        )}

        {targetType === 'users' && (
          <div
            className={`rounded-lg border p-3 ${usersAudienceError ? 'border-red-300 bg-red-50/20' : 'border-gray-100 bg-gray-50/80'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-gray-600">Employees</span>
              {selectedAudienceUsers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedAudienceUsers([])}
                  className="text-xs font-medium text-gray-600 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="relative" ref={employeeAudienceRef}>
              <button
                type="button"
                id="audience-employee-dropdown-trigger"
                aria-expanded={employeeAudienceOpen}
                aria-haspopup="listbox"
                aria-controls="audience-employee-dropdown-panel"
                onClick={() => {
                  setEmployeeAudienceOpen((o) => {
                    if (!o) setDebouncedEmployeeQ(employeeSearchInput.trim());
                    return !o;
                  });
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
              >
                <span className={selectedAudienceUsers.length === 0 ? 'text-gray-500' : 'text-gray-900 font-medium'}>
                  {selectedAudienceUsers.length === 0
                    ? 'Select employees…'
                    : `${selectedAudienceUsers.length} selected`}
                </span>
                <svg
                  className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${employeeAudienceOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {employeeAudienceOpen && (
                <div
                  id="audience-employee-dropdown-panel"
                  role="listbox"
                  aria-multiselectable="true"
                  className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
                >
                  <div className="border-b border-gray-100 p-2">
                    <label htmlFor="audience-employee-search" className="sr-only">
                      Search employees
                    </label>
                    <input
                      id="audience-employee-search"
                      type="search"
                      value={employeeSearchInput}
                      onChange={(e) => setEmployeeSearchInput(e.target.value)}
                      placeholder="Search by name…"
                      autoComplete="off"
                      className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-sm focus:border-brand-red focus:outline-none focus:ring-1 focus:ring-brand-red/30"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <ul className="max-h-56 overflow-y-auto py-1">
                    {employeesSortedAlphabetically.length === 0 ? (
                      <li className="px-3 py-3 text-xs text-gray-500">No employees found.</li>
                    ) : (
                      employeesSortedAlphabetically.slice(0, 200).map((row: { id: string; name?: string; username?: string }) => {
                        const id = String(row.id);
                        const label = String(row.name || row.username || 'Employee');
                        const checked = selectedAudienceUsers.some((s) => s.id === id);
                        const atCap = selectedAudienceUsers.length >= MAX_AUDIENCE_EMPLOYEES && !checked;
                        return (
                          <li key={id} role="option" aria-selected={checked}>
                            <label
                              className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${
                                atCap ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={atCap}
                                onChange={() => toggleAudienceUserRow(row)}
                                className="h-4 w-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="font-medium text-gray-900">{label}</span>
                                {row.username && row.name ? (
                                  <span className="block truncate text-xs text-gray-500">{row.username}</span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })
                    )}
                  </ul>
                  <div className="border-t border-gray-100 px-2 py-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setEmployeeAudienceOpen(false)}
                      className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {selectedAudienceUsers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAudienceUsers.map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white pl-2.5 pr-1 py-1 text-xs font-medium text-gray-800"
                  >
                    <span className="max-w-[10rem] truncate" title={u.name}>
                      {u.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAudienceUser(u.id)}
                      className="rounded-full p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                      aria-label={`Remove ${u.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-500 mt-2">
              Open the list, search, tick several people, then Done. Up to {MAX_AUDIENCE_EMPLOYEES} recipients.
            </p>
            {usersAudienceError && <p className="text-xs text-red-600 mt-2">Select at least one employee.</p>}
          </div>
        )}

        {targetType === 'groups' && (
          <div
            className={`rounded-lg border p-3 ${groupsAudienceError ? 'border-red-300 bg-red-50/20' : 'border-gray-100 bg-gray-50/80'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-gray-600">Groups</span>
              <div className="flex flex-wrap items-center gap-2">
                {communityGroups.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCommunityGroupIds(communityGroups.map((g) => g.id))}
                      className="text-xs font-medium text-brand-red hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedCommunityGroupIds([])}
                      className="text-xs font-medium text-gray-600 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
                <Link
                  to="/community/groups"
                  className="text-xs font-medium text-brand-red hover:underline"
                >
                  Manage groups
                </Link>
              </div>
            </div>
            {communityGroups.length === 0 ? (
              <p className="text-xs text-gray-500">
                No community groups yet.{' '}
                <Link to="/community/groups" className="font-medium text-brand-red underline">
                  Create a group
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {communityGroups.map((g) => {
                  const isSelected = selectedCommunityGroupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleCommunityGroup(g.id)}
                      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? 'border-brand-red bg-white text-brand-red shadow-sm'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                      title={g.name}
                    >
                      <span className="truncate">{g.name}</span>
                      {g.member_count != null ? (
                        <span className="shrink-0 text-[10px] font-normal text-gray-500">({g.member_count})</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-gray-500 mt-2">
              Recipients are fixed when you publish (up to {MAX_AUDIENCE_EMPLOYEES} active members across selected groups).
            </p>
            {groupsAudienceError && <p className="text-xs text-red-600 mt-2">Select at least one community group.</p>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-28">
      <CommunityPageHeader
        title={isEdit ? 'Edit announcement' : 'New announcement'}
        subtitle="Compose once, control audience and timing, then publish to the community feed."
        onBack={() => navigate('/community')}
      />

      <form id="community-post-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="lg:hidden space-y-3">
          <button
            type="button"
            onClick={() => setMobileComposerOpen((o) => !o)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
              mobileComposerOpen ? 'border-brand-red/30 bg-red-50/40' : 'border-gray-200 bg-white'
            }`}
          >
            Compose
            <span className="text-gray-400">{mobileComposerOpen ? '−' : '+'}</span>
          </button>
          {mobileComposerOpen && composerBlock}

          <button
            type="button"
            onClick={() => setMobileAudienceOpen((o) => !o)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
              mobileAudienceOpen ? 'border-brand-red/30 bg-red-50/40' : 'border-gray-200 bg-white'
            }`}
          >
            Publish & audience
            <span className="text-gray-400">{mobileAudienceOpen ? '−' : '+'}</span>
          </button>
          {mobileAudienceOpen && sidebarBlock}
        </div>

        <div className="hidden lg:grid lg:grid-cols-12 lg:items-stretch lg:gap-6">
          <div className="flex min-h-0 flex-col lg:col-span-8">{composerBlock}</div>
          <div className="flex min-h-0 flex-col lg:col-span-4">{sidebarBlock}</div>
        </div>
      </form>

      <CommunityNewPostPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={title}
        content={content}
        priority={priority}
        relatedArea={relatedArea}
        requiresReadConfirmation={requiresReadConfirmation}
        attachments={attachments}
        targetType={targetType}
        divisionCount={selectedDivisions.length}
        selectedEmployeeCount={selectedAudienceUsers.length}
        selectedGroupCount={selectedCommunityGroupIds.length}
        groupAudienceHint={
          targetType === 'groups' && approxGroupAudienceMembers > 0
            ? `~${approxGroupAudienceMembers} members in groups, approximate`
            : undefined
        }
        publishMode={publishMode}
      />

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200/80 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate('/community')}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
          >
            Preview
          </button>
          {!isEdit && publishMode !== 'draft' && (
            <button
              type="button"
              disabled={busy || !title.trim() || isCommunityEditorHtmlEmpty(content)}
              onClick={handleSaveAsDraft}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save as draft
            </button>
          )}
          <button
            type="submit"
            form="community-post-form"
            disabled={formDisabled}
            className="rounded-lg bg-brand-red px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
