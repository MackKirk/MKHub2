import { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import ImagePicker from '@/components/ImagePicker';
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

type PublishMode = 'now' | 'scheduled' | 'draft';

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
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('<p></p>');
  const [priority, setPriority] = useState<string>('normal');
  const [requiresReadConfirmation, setRequiresReadConfirmation] = useState(false);
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [documentFileId, setDocumentFileId] = useState<string | null>(null);
  const [documentFileName, setDocumentFileName] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<'all' | 'divisions'>('all');
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
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

  const { data: settings } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<any>('GET', '/settings'),
  });

  const divisions = (settings?.divisions || []) as Array<{ id: string; label: string; meta?: { abbr?: string; color?: string } }>;

  const { data: existingPost, isLoading: loadingExisting } = useQuery({
    queryKey: ['community-post-one', postId],
    queryFn: () => api<any>('GET', `/community/posts/${postId}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (!existingPost || !isEdit) return;
    setTitle(existingPost.title || '');
    const raw = existingPost.content || '';
    setContent(communityContentLooksLikeHtml(raw) ? raw : legacyPlainToEditorHtml(raw));
    setEditorSession((s) => s + 1);
    setPriority(existingPost.priority || 'normal');
    setRequiresReadConfirmation(!!existingPost.requires_read_confirmation);
    setRelatedArea(existingPost.related_area || 'general');

    const doc = existingPost.document_file_id;
    setDocumentFileId(doc ? String(doc) : null);
    setDocumentFileName(existingPost.document_original_name || null);

    let pId: string | null = null;
    if (existingPost.photo_url) {
      const m = String(existingPost.photo_url).match(/\/files\/([a-f0-9-]{36})\//i);
      if (m) pId = m[1];
    }
    setPhotoFileId(pId);

    setTargetType(existingPost.target_type === 'divisions' ? 'divisions' : 'all');
    setSelectedDivisions(
      Array.isArray(existingPost.target_division_ids) ? existingPost.target_division_ids.map(String) : []
    );

    const st = existingPost.status as string | undefined;
    if (st === 'draft') setPublishMode('draft');
    else if (st === 'scheduled') {
      setPublishMode('scheduled');
      if (existingPost.publish_at) {
        const d = new Date(existingPost.publish_at);
        const pad = (n: number) => String(n).padStart(2, '0');
        setScheduledAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      }
    } else setPublishMode('now');
  }, [existingPost, isEdit]);

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
        photo_file_id: photoFileId || undefined,
        document_file_id: documentFileId || undefined,
        target_type: targetType,
        target_division_ids: targetType === 'divisions' ? selectedDivisions : undefined,
        priority,
        related_area: relatedArea,
        mentions: extractMentionsFromEditor(editorRef.current),
      };

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
      photoFileId,
      documentFileId,
      targetType,
      selectedDivisions,
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
      if (!isEdit && mode === 'scheduled' && !scheduledAt) {
        return { ok: false as const, message: 'Choose a date and time for the scheduled post' };
      }
      if (isEdit && mode === 'scheduled' && !scheduledAt) {
        return { ok: false as const, message: 'Choose a date and time for the scheduled post' };
      }
      return { ok: true as const };
    },
    [title, content, targetType, selectedDivisions, isEdit, publishMode, scheduledAt],
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

  const handleImageConfirm = async (blob: Blob, originalFileObjectId?: string) => {
    if (originalFileObjectId) {
      setPhotoFileId(originalFileObjectId);
      setImagePickerOpen(false);
      toast.success('Image added successfully');
      return;
    }

    try {
      const file = new File([blob], 'community-photo.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('original_name', file.name);
      formData.append('content_type', 'image/jpeg');
      formData.append('project_id', '');
      formData.append('client_id', '');
      formData.append('employee_id', '');
      formData.append('category_id', 'community-photo');

      const conf = await api('POST', '/files/upload-proxy', formData);

      if (!conf || !conf.id) {
        throw new Error('Invalid upload response');
      }

      setPhotoFileId(conf.id);
      setImagePickerOpen(false);
      toast.success('Image added successfully');
    } catch (error: any) {
      console.error('Failed to upload image:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to upload image';
      toast.error(errorMessage);
    }
  };

  const uploadPdfFile = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please use a PDF file');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('original_name', file.name);
    formData.append('content_type', 'application/pdf');
    formData.append('project_id', '');
    formData.append('client_id', '');
    formData.append('employee_id', '');
    formData.append('category_id', 'community-document');

    const conf = await api('POST', '/files/upload-proxy', formData);

    if (!conf || !conf.id) {
      throw new Error('Invalid upload response');
    }

    setDocumentFileId(conf.id);
    setDocumentFileName(file.name);
    toast.success('Document added');
  };

  const uploadImageFileQuick = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Drop a PDF or an image file');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const maxW = 1200;
      const maxH = 800;
      let w = bitmap.width;
      let h = bitmap.height;
      const scale = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not prepare image');
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/jpeg', 0.88);
      });
      await handleImageConfirm(blob);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Could not process image — try “Edit & crop”');
    }
  };

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadPdfFile(file);
    } catch (error: any) {
      console.error('Failed to upload document:', error);
      toast.error(error?.response?.data?.detail || error?.message || 'Failed to upload document');
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (photoFileId || documentFileId) {
      toast.error('Remove the current attachment before adding another');
      return;
    }
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        await uploadPdfFile(file);
      } else if (file.type.startsWith('image/')) {
        await uploadImageFileQuick(file);
      } else {
        toast.error('Drop a PDF or an image');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error?.message || 'Upload failed');
    }
  };

  const handleRemovePhoto = () => setPhotoFileId(null);
  const handleRemoveDocument = () => {
    setDocumentFileId(null);
    setDocumentFileName(null);
  };

  const toggleDivision = (divisionId: string) => {
    setSelectedDivisions((prev) =>
      prev.includes(divisionId) ? prev.filter((id) => id !== divisionId) : [...prev, divisionId]
    );
  };

  const busy = createPostMutation.isLoading || patchPostMutation.isLoading;

  const audienceSummary =
    targetType === 'all'
      ? 'All employees'
      : selectedDivisions.length === 0
        ? 'No divisions selected yet'
        : `${selectedDivisions.length} division${selectedDivisions.length === 1 ? '' : 's'}`;

  const divisionError = triedSubmit && targetType === 'divisions' && selectedDivisions.length === 0;
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
    <div className={`p-5 sm:p-6 space-y-5 ${sectionCardClass()}`}>
      <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Compose</h2>
          <p className="text-xs text-gray-500 mt-0.5">Title and message body</p>
        </div>
      </div>

      <div>
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

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <label htmlFor="content" className="text-sm font-medium text-gray-800">
            Announcement <span className="text-red-500">*</span>
          </label>
          <span
            className={`text-xs tabular-nums ${plainBodyLen > CONTENT_SOFT_MAX ? 'text-amber-600 font-medium' : 'text-gray-400'}`}
          >
            {plainBodyLen.toLocaleString()} chars
          </span>
        </div>
        <CommunityPostRichTextEditor
          editorKey={`${postId || 'new'}-${editorSession}`}
          initialHtml={content || '<p></p>'}
          onChangeHtml={setContent}
          onEditorReady={(ed) => {
            editorRef.current = ed;
          }}
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm font-medium text-gray-800">Media & documents</span>
          <span className="text-xs text-gray-500">One attachment · PDF or image</span>
        </div>

        {photoFileId && (
          <div className="relative inline-block max-w-full mb-3">
            <img
              src={withFileAccessToken(`/files/${photoFileId}/thumbnail?w=560`)}
              alt="Attachment preview"
              className="max-w-full h-auto rounded-lg border border-gray-200 max-h-56 object-contain"
            />
            <button
              type="button"
              onClick={handleRemovePhoto}
              className="absolute top-2 right-2 rounded-md bg-gray-900/85 px-2 py-1 text-xs font-medium text-white hover:bg-gray-900"
            >
              Remove
            </button>
          </div>
        )}

        {documentFileId && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/80 mb-3 max-w-md">
            <svg className="w-8 h-8 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="flex-1 text-sm text-gray-800 truncate">{documentFileName || 'PDF document'}</span>
            <button
              type="button"
              onClick={handleRemoveDocument}
              className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        )}

        {!photoFileId && !documentFileId && (
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
            <p className="text-sm font-medium text-gray-800">Drop a PDF or image here</p>
            <p className="text-xs text-gray-500 mt-1">or choose how to add a file</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setImagePickerOpen(true)}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
              >
                Edit & crop image
              </button>
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
              >
                Choose PDF
              </button>
            </div>
            <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" onChange={handleDocumentUpload} className="hidden" />
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
              onChange={() => setTargetType('divisions')}
              className="h-4 w-4 border-gray-300 text-brand-red focus:ring-brand-red"
            />
            <div>
              <div className="text-sm font-medium text-gray-900">Specific divisions</div>
              <div className="text-xs text-gray-500">Limit to selected teams</div>
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
      </div>

      <div className={`p-5 sm:p-6 ${sectionCardClass()}`}>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id="read-confirmation"
            type="checkbox"
            checked={requiresReadConfirmation}
            onChange={(e) => setRequiresReadConfirmation(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
          />
          <div>
            <span className="text-sm font-medium text-gray-900">Request read confirmation</span>
            <p className="text-xs text-gray-500 mt-0.5">Recipients must acknowledge they have read this post.</p>
          </div>
        </label>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-28">
      <CommunityPageHeader
        title={isEdit ? 'Edit announcement' : 'New announcement'}
        subtitle="Compose once, control audience and timing, then publish to the community feed."
        onBack={() => navigate('/community')}
        actions={
          <>
            <Link
              to="/community?myAnnouncements=1"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              My announcements
            </Link>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Preview
            </button>
          </>
        }
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

        <div className="hidden lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
          <div className="lg:col-span-8 space-y-6">{composerBlock}</div>
          <div className="lg:col-span-4 space-y-4">{sidebarBlock}</div>
        </div>
      </form>

      <ImagePicker
        isOpen={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        onConfirm={handleImageConfirm}
        clientId={undefined}
        targetWidth={1200}
        targetHeight={800}
        allowEdit={true}
      />

      <CommunityNewPostPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={title}
        content={content}
        priority={priority}
        relatedArea={relatedArea}
        requiresReadConfirmation={requiresReadConfirmation}
        photoFileId={photoFileId}
        documentFileId={documentFileId}
        documentFileName={documentFileName}
        targetType={targetType}
        divisionCount={selectedDivisions.length}
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
