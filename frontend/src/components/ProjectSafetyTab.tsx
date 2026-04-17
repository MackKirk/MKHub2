import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import {
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SafetyFormModalLayout,
} from '@/components/safety/SafetyModalChrome';
import {
  PROJECT_SAFETY_INSPECTION_TEMPLATE,
  SAFETY_TEMPLATE_VERSION,
  type SafetyTemplateItem,
  type YesNoNa,
} from '@/data/projectSafetyInspectionTemplate';
import DynamicSafetyForm from '@/components/DynamicSafetyForm';
import { normalizeDefinition, validateDynamicForm, type SafetyFormDefinition } from '@/types/safetyFormTemplate';

type SafetyInspectionRow = {
  id: string;
  project_id: string;
  inspection_date: string;
  template_version: string;
  status?: string;
  form_payload: Record<string, unknown>;
  form_template_id?: string | null;
  form_definition_snapshot?: SafetyFormDefinition | Record<string, unknown> | null;
  assigned_user_id?: string | null;
  template_name?: string | null;
  template_version_label?: string | null;
  worker_name?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

type FormTemplatePick = {
  id: string;
  name: string;
  version_label: string;
};

const YNA_OPTIONS: {
  value: YesNoNa;
  label: string;
  title: string;
  className: string;
}[] = [
  { value: 'yes', label: 'Y', title: 'Yes', className: 'bg-green-100 text-green-800 border-green-400 hover:bg-green-200' },
  { value: 'no', label: 'N', title: 'No', className: 'bg-red-100 text-red-800 border-red-400 hover:bg-red-200' },
  { value: 'na', label: 'NA', title: 'N/A', className: 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200' },
];

const MAX_YN_COMMENT_IMAGES = 12;
const YN_COMMENT_IMAGE_CATEGORY = 'project-photos';

function guessImageMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

function isLikelyImageFile(file: File): boolean {
  const ct = file.type || '';
  if (ct.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
}

function resolveImageContentType(file: File): string {
  const ct = file.type || '';
  if (ct.startsWith('image/')) return ct;
  return guessImageMimeFromName(file.name);
}

function isYesNoEntry(v: unknown): v is { status?: string; comments?: string; comment_image_ids?: unknown } {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function getTextValue(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  return typeof v === 'string' ? v : '';
}

function getCheckboxValues(payload: Record<string, unknown>, key: string): string[] {
  const v = payload[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function getYnRaw(
  payload: Record<string, unknown>,
  key: string
): { status: YesNoNa | ''; comments: string; comment_image_ids: string[] } {
  const v = payload[key];
  if (!isYesNoEntry(v)) return { status: '', comments: '', comment_image_ids: [] };
  const s = v.status;
  const status = s === 'yes' || s === 'no' || s === 'na' ? s : '';
  const comments = typeof v.comments === 'string' ? v.comments : '';
  const raw = v.comment_image_ids;
  const comment_image_ids = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  return { status, comments, comment_image_ids };
}

type Props = {
  projectId: string;
  proj: { name?: string; address?: string; address_city?: string; address_province?: string };
  canRead: boolean;
  canWrite: boolean;
  /** From URL ?safety_inspection= — open this inspection when the list loads */
  initialSafetyInspectionId?: string | null;
};

function YnCommentImageGrid({
  imageIds,
  canRemove,
  onRemove,
}: {
  imageIds: string[];
  canRemove?: boolean;
  onRemove?: (fileObjectId: string) => void;
}) {
  if (imageIds.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {imageIds.map((id) => (
        <div key={id} className="relative w-24 h-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 shrink-0">
          <a
            href={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=1200`)}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full h-full"
            title="Open image"
          >
            <img
              src={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=240`)}
              alt=""
              className="w-full h-full object-cover"
            />
          </a>
          {canRemove && onRemove && (
            <button
              type="button"
              title="Remove image"
              onClick={(e) => {
                e.preventDefault();
                onRemove(id);
              }}
              className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white text-lg leading-none flex items-center justify-center hover:bg-black/80"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

/** Dashed drop zone + hidden file input (same pattern as OnboardingAdmin). One instance per Y/N comment row. */
function YnCommentPhotoDropzone({
  disabled,
  uploading,
  onFiles,
}: {
  disabled: boolean;
  uploading: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);

  const pushFiles = (list: FileList | null) => {
    if (!list?.length || disabled || uploading) return;
    const picked = Array.from(list);
    const images = picked.filter((f) => isLikelyImageFile(f));
    if (images.length < picked.length) {
      toast.error('Some files were skipped — only images are allowed.');
    }
    if (images.length) onFiles(images);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      className="w-full"
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current += 1;
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragActive(false);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const items = [...(e.dataTransfer?.items || [])].filter((i) => i.kind === 'file');
        const allClearlyNonImage =
          items.length > 0 &&
          items.every((i) => {
            const t = (i.type || '').toLowerCase();
            return t !== '' && !t.startsWith('image/');
          });
        e.dataTransfer.dropEffect = allClearlyNonImage ? 'none' : 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragActive(false);
        if (disabled || uploading) return;
        pushFiles(e.dataTransfer.files);
      }}
    >
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className={`w-full rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
          dragActive ? 'border-brand-red bg-red-50/40' : 'border-gray-300 bg-gray-50/30 hover:border-gray-400'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <p className="text-sm font-medium text-gray-800">
          {uploading ? 'Uploading…' : 'Drag photos here or click to choose'}
        </p>
        <p className="text-xs text-gray-500 mt-2">Drag-and-drop images here or choose files from your computer.</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => pushFiles(e.target.files)}
      />
    </div>
  );
}

export default function ProjectSafetyTab({ projectId, proj, canRead, canWrite, initialSafetyInspectionId }: Props) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspectionDate, setInspectionDate] = useState<string>('');
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pickedTemplateId, setPickedTemplateId] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  /** Y/N item keys whose optional comment field is expanded for editing */
  const [ynCommentOpen, setYnCommentOpen] = useState<Record<string, boolean>>({});
  /** Which Y/N row is currently uploading an image (shows inline status). */
  const [ynImageUploadingFor, setYnImageUploadingFor] = useState<string | null>(null);

  const listKey = ['projectSafetyInspections', projectId];
  const { data: list = [], isLoading: listLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => api<SafetyInspectionRow[]>('GET', `/projects/${encodeURIComponent(projectId)}/safety-inspections`),
    enabled: canRead && !!projectId,
  });

  useEffect(() => {
    const sid = initialSafetyInspectionId?.trim();
    if (!sid || !list.length) return;
    if (list.some((r) => r.id === sid)) {
      setSelectedId(sid);
    }
  }, [initialSafetyInspectionId, list]);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-project-safety-tab'],
    queryFn: () => api<{ id: string; name: string; username?: string }[]>('GET', '/employees'),
    enabled: canRead && !!projectId,
  });

  const { data: schedulableTemplates = [] } = useQuery({
    queryKey: ['formTemplatesSchedulable', showCreateModal],
    queryFn: () => api<FormTemplatePick[]>('GET', '/form-templates?schedulable=true'),
    enabled: showCreateModal && canWrite,
  });

  const detailKey = ['projectSafetyInspection', projectId, selectedId];
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () =>
      api<SafetyInspectionRow>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(selectedId!)}`
      ),
    enabled: canRead && !!projectId && !!selectedId,
  });

  const isDynamicInspection = Boolean(detail?.form_template_id);

  const { data: templateFallback } = useQuery({
    queryKey: ['formTemplate', detail?.form_template_id],
    queryFn: () =>
      api<{ definition: SafetyFormDefinition }>('GET', `/form-templates/${encodeURIComponent(detail!.form_template_id!)}`),
    enabled:
      canRead &&
      !!detail?.form_template_id &&
      (!detail?.form_definition_snapshot ||
        (typeof detail.form_definition_snapshot === 'object' &&
          !Array.isArray(detail.form_definition_snapshot) &&
          !('sections' in (detail.form_definition_snapshot as object)))),
  });

  const dynamicDefinition: SafetyFormDefinition | null = useMemo(() => {
    const snap = detail?.form_definition_snapshot;
    if (snap && typeof snap === 'object' && !Array.isArray(snap) && 'sections' in snap) {
      return normalizeDefinition(snap as SafetyFormDefinition);
    }
    const fd = templateFallback?.definition;
    if (fd && typeof fd === 'object' && !Array.isArray(fd) && 'sections' in fd) {
      return normalizeDefinition(fd as SafetyFormDefinition);
    }
    return null;
  }, [detail?.form_definition_snapshot, templateFallback?.definition]);

  useEffect(() => {
    if (!detail) return;
    const d = new Date(detail.inspection_date);
    const local = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
    setInspectionDate(local);
    setFormPayload(
      detail.form_payload && typeof detail.form_payload === 'object' && !Array.isArray(detail.form_payload)
        ? { ...detail.form_payload }
        : {}
    );
    setAssignedUserId(detail.assigned_user_id || '');
  }, [detail?.id, detail?.inspection_date, detail?.form_payload, detail?.assigned_user_id]);

  useEffect(() => {
    setYnCommentOpen({});
  }, [detail?.id]);

  const applyProjectPrefill = useCallback(
    (payload: Record<string, unknown>) => {
      const next = { ...payload };
      const loc = [proj.address, proj.address_city, proj.address_province].filter(Boolean).join(', ');
      if (proj.name && !getTextValue(next, 'project_name')) next.project_name = proj.name;
      if (loc && !getTextValue(next, 'project_location')) next.project_location = loc;
      return next;
    },
    [proj.address, proj.address_city, proj.address_province, proj.name]
  );

  useEffect(() => {
    if (!selectedId || !detail) return;
    if (detail.form_payload && Object.keys(detail.form_payload).length > 0) return;
    setFormPayload((p) => applyProjectPrefill(p));
  }, [selectedId, detail, applyProjectPrefill]);

  const createLegacyMutation = useMutation({
    mutationFn: () =>
      api<SafetyInspectionRow>('POST', `/projects/${encodeURIComponent(projectId)}/safety-inspections`, {
        template_version: SAFETY_TEMPLATE_VERSION,
        form_payload: applyProjectPrefill({}),
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: ['safetyInspections'] });
      qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      setSelectedId(row.id);
      setShowCreateModal(false);
      toast.success('Inspection created');
    },
    onError: () => toast.error('Could not create inspection'),
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: () => {
      if (!pickedTemplateId) throw new Error('Pick a template');
      return api<SafetyInspectionRow>('POST', `/projects/${encodeURIComponent(projectId)}/safety-inspections`, {
        form_template_id: pickedTemplateId,
        form_payload: {},
        inspection_date: new Date().toISOString(),
      });
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: ['safetyInspections'] });
      qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      setSelectedId(row.id);
      setShowCreateModal(false);
      setPickedTemplateId('');
      toast.success('Inspection created');
    },
    onError: () => toast.error('Could not create inspection'),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no id');
      let iso: string;
      if (inspectionDate) {
        const t = new Date(inspectionDate);
        iso = Number.isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
      } else {
        iso = new Date().toISOString();
      }
      const body: Record<string, unknown> = {
        inspection_date: iso,
        form_payload: formPayload,
        assigned_user_id: assignedUserId || null,
      };
      if (!detail?.form_template_id) {
        body.template_version = SAFETY_TEMPLATE_VERSION;
      }
      return api<SafetyInspectionRow>(
        'PUT',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(selectedId)}`,
        body
      );
    },
    onSuccess: () => {
      setYnCommentOpen({});
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: ['safetyInspections'] });
      qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId, selectedId] });
      }
      toast.success('Saved');
    },
    onError: () => toast.error('Could not save'),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error('no id');
      if (detail?.form_template_id && dynamicDefinition) {
        const missing = validateDynamicForm(dynamicDefinition, formPayload);
        if (missing.length) {
          toast.error(`Missing required fields: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
          throw new Error('validation');
        }
      }
      return api<SafetyInspectionRow>(
        'PUT',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(selectedId)}`,
        { status: 'finalized' }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: ['safetyInspections'] });
      qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId, selectedId] });
      }
      toast.success('Inspection finalized');
    },
    onError: (e: Error) => {
      if (e?.message === 'validation') return;
      toast.error('Could not finalize');
    },
  });

  const setTextField = (key: string, value: string) => {
    setFormPayload((p) => ({ ...p, [key]: value }));
  };

  const setYnStatus = (key: string, status: YesNoNa) => {
    setFormPayload((p) => {
      const cur = getYnRaw(p, key);
      return { ...p, [key]: { ...cur, status } };
    });
  };

  const setYnComments = (key: string, comments: string) => {
    setFormPayload((p) => {
      const cur = getYnRaw(p, key);
      return { ...p, [key]: { ...cur, comments } };
    });
  };

  const removeYnCommentImage = (key: string, fileObjectId: string) => {
    setFormPayload((p) => {
      const cur = getYnRaw(p, key);
      return {
        ...p,
        [key]: {
          ...cur,
          comment_image_ids: cur.comment_image_ids.filter((x) => x !== fileObjectId),
        },
      };
    });
  };

  /** Server-side proxy upload (avoids browser PUT/CORS issues with blob URLs). */
  const uploadYnCommentImage = useCallback(
    async (file: File): Promise<string | null> => {
      if (!isLikelyImageFile(file)) {
        toast.error('Please choose an image file');
        return null;
      }
      const ct = resolveImageContentType(file);
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('original_name', file.name);
        form.append('content_type', ct);
        form.append('project_id', projectId);
        form.append('client_id', '');
        form.append('employee_id', '');
        form.append('category_id', YN_COMMENT_IMAGE_CATEGORY);

        const res = await api<{ id: string; key: string }>('POST', '/files/upload-proxy', form);
        await api(
          'POST',
          `/projects/${encodeURIComponent(projectId)}/files?file_object_id=${encodeURIComponent(res.id)}&category=${encodeURIComponent(YN_COMMENT_IMAGE_CATEGORY)}&original_name=${encodeURIComponent(file.name)}`
        );
        return res.id;
      } catch {
        toast.error('Image upload failed');
        return null;
      }
    },
    [projectId]
  );

  const processYnCommentImages = useCallback(
    async (key: string, files: File[]) => {
      if (!canWrite || !files.length) return;
      for (const file of files) {
        let atLimit = false;
        setFormPayload((p) => {
          const cur = getYnRaw(p, key);
          atLimit = cur.comment_image_ids.length >= MAX_YN_COMMENT_IMAGES;
          return p;
        });
        if (atLimit) {
          toast.error(`You can add at most ${MAX_YN_COMMENT_IMAGES} images per comment.`);
          break;
        }

        setYnImageUploadingFor(key);
        const id = await uploadYnCommentImage(file);
        setYnImageUploadingFor(null);
        if (!id) continue;

        setFormPayload((p) => {
          const cur = getYnRaw(p, key);
          if (cur.comment_image_ids.length >= MAX_YN_COMMENT_IMAGES) return p;
          if (cur.comment_image_ids.includes(id)) return p;
          return {
            ...p,
            [key]: { ...cur, comment_image_ids: [...cur.comment_image_ids, id] },
          };
        });
      }
    },
    [canWrite, uploadYnCommentImage]
  );

  const toggleCheckbox = (key: string, option: string) => {
    setFormPayload((p) => {
      const cur = getCheckboxValues(p, key);
      const has = cur.includes(option);
      const next = has ? cur.filter((x) => x !== option) : [...cur, option];
      return { ...p, [key]: next };
    });
  };

  const renderItem = (item: SafetyTemplateItem, idx: number, zebra: boolean) => {
    const rowBg = zebra ? (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/80') : '';
    if (item.kind === 'subheading') {
      return (
        <div key={item.id} className="px-4 py-2.5 bg-slate-100/90 border-y border-slate-200/80">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{item.label}</h4>
        </div>
      );
    }
    if (item.kind === 'hint') {
      return (
        <div key={item.id} className="p-4 bg-amber-50/60 border-b border-amber-100/80">
          <p className="text-xs text-gray-700 leading-relaxed">{item.text}</p>
        </div>
      );
    }
    if (item.kind === 'text') {
      return (
        <div key={item.key} className={`p-4 ${rowBg}`}>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{item.label}</label>
          <input
            type="text"
            value={getTextValue(formPayload, item.key)}
            onChange={(e) => setTextField(item.key, e.target.value)}
            disabled={!canWrite}
            placeholder={item.placeholder}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      );
    }
    if (item.kind === 'textarea') {
      return (
        <div key={item.key} className={`p-4 ${rowBg}`}>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{item.label}</label>
          <textarea
            value={getTextValue(formPayload, item.key)}
            onChange={(e) => setTextField(item.key, e.target.value)}
            disabled={!canWrite}
            placeholder={item.placeholder}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      );
    }
    if (item.kind === 'checkboxes') {
      const selected = getCheckboxValues(formPayload, item.key);
      return (
        <div key={item.key} className={`p-4 ${rowBg}`}>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{item.label}</div>
          <div className="flex flex-wrap gap-3">
            {item.options.map((opt) => (
              <label key={opt} className="inline-flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  disabled={!canWrite}
                  onChange={() => toggleCheckbox(item.key, opt)}
                  className="rounded border-gray-300"
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    }
    if (item.kind !== 'yes_no_na') {
      return null;
    }
    const yn = getYnRaw(formPayload, item.key);
    const commentExpanded = ynCommentOpen[item.key] === true;
    const commentText = yn.comments.trim();
    const hasComment = commentText.length > 0;
    const hasImages = yn.comment_image_ids.length > 0;
    const hasCommentOrMedia = hasComment || hasImages;
    const atImageLimit = yn.comment_image_ids.length >= MAX_YN_COMMENT_IMAGES;
    const uploadingImages = ynImageUploadingFor === item.key;

    return (
      <div key={item.key} className={`p-4 transition-colors ${rowBg}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 text-sm">{item.label}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {YNA_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                title={opt.title}
                disabled={!canWrite}
                onClick={() => setYnStatus(item.key, opt.value)}
                className={`min-w-[3.25rem] min-h-[3.25rem] flex items-center justify-center rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50 ${
                  yn.status === opt.value ? opt.className + ' scale-105 shadow-md' : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {item.commentsField && canWrite && (
              <button
                type="button"
                title={commentExpanded ? 'Close comment' : hasCommentOrMedia ? 'Edit comment' : 'Add comment'}
                aria-expanded={commentExpanded}
                aria-label={commentExpanded ? 'Close comment' : hasCommentOrMedia ? 'Edit comment' : 'Add comment'}
                onClick={() =>
                  setYnCommentOpen((prev) => ({
                    ...prev,
                    [item.key]: !prev[item.key],
                  }))
                }
                className={`min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center rounded-xl border-2 transition-all ${
                  commentExpanded || hasCommentOrMedia
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'
                }`}
              >
                <ChatBubbleIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        {item.commentsField && canWrite && commentExpanded && (
          <div className="mt-3 space-y-3">
            <textarea
              value={yn.comments}
              onChange={(e) => setYnComments(item.key, e.target.value)}
              placeholder="Comments / details"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y"
            />
            <div className="space-y-2">
              <YnCommentPhotoDropzone
                disabled={atImageLimit}
                uploading={uploadingImages}
                onFiles={(files) => void processYnCommentImages(item.key, files)}
              />
              <p className="text-xs text-gray-500 text-center">
                {yn.comment_image_ids.length}/{MAX_YN_COMMENT_IMAGES} photos
              </p>
            </div>
            <YnCommentImageGrid
              imageIds={yn.comment_image_ids}
              canRemove
              onRemove={(id) => removeYnCommentImage(item.key, id)}
            />
          </div>
        )}
        {item.commentsField && canWrite && !commentExpanded && hasCommentOrMedia && (
          <div className="mt-3 space-y-2">
            {hasComment && <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{yn.comments}</p>}
            <YnCommentImageGrid imageIds={yn.comment_image_ids} />
          </div>
        )}
        {item.commentsField && !canWrite && hasCommentOrMedia && (
          <div className="mt-3 space-y-2">
            {hasComment && <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{yn.comments}</p>}
            <YnCommentImageGrid imageIds={yn.comment_image_ids} />
          </div>
        )}
      </div>
    );
  };

  const formSections = useMemo(() => PROJECT_SAFETY_INSPECTION_TEMPLATE, []);

  if (!canRead) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">You do not have permission to view safety inspections.</div>;
  }

  if (!selectedId) {
    return (
      <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Safety inspections</h2>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={createLegacyMutation.isPending}
                onClick={() => createLegacyMutation.mutate()}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                New (MKI)
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                New from template…
              </button>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {listLoading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No inspections yet. Create one to get started.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((row) => {
                const st = row.status === 'finalized' ? 'finalized' : 'draft';
                const tmpl =
                  row.template_name ||
                  (row.template_version?.startsWith('mki') ? 'MKI Safety Inspection' : row.template_version || '—');
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-medium text-gray-900">
                          {row.inspection_date
                            ? new Date(row.inspection_date).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : '—'}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate mt-0.5">{tmpl}</div>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          st === 'finalized' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {st === 'finalized' ? 'Finalized' : 'Draft'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {showCreateModal && canWrite && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center overflow-y-auto p-4"
            onClick={() => {
              setShowCreateModal(false);
              setPickedTemplateId('');
            }}
            role="presentation"
          >
            <SafetyFormModalLayout
              widthClass="w-full max-w-md"
              titleId="safety-start-template-title"
              title="Start from template"
              subtitle="Choose an active form template for a new inspection."
              onClose={() => {
                setShowCreateModal(false);
                setPickedTemplateId('');
              }}
              footer={
                <>
                  <button
                    type="button"
                    className={SAFETY_MODAL_BTN_CANCEL}
                    onClick={() => {
                      setShowCreateModal(false);
                      setPickedTemplateId('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!pickedTemplateId || createFromTemplateMutation.isPending}
                    onClick={() => createFromTemplateMutation.mutate()}
                    className={SAFETY_MODAL_BTN_PRIMARY}
                  >
                    {createFromTemplateMutation.isPending ? 'Creating…' : 'Create'}
                  </button>
                </>
              }
            >
              <label className={SAFETY_MODAL_FIELD_LABEL}>Form template</label>
              <select
                value={pickedTemplateId}
                onChange={(e) => setPickedTemplateId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
              >
                <option value="">— Select template —</option>
                {schedulableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {(t.version_label || '').trim() ? ` (${(t.version_label || '').trim()})` : ''}
                  </option>
                ))}
              </select>
            </SafetyFormModalLayout>
          </div>
        </OverlayPortal>
      )}
      </>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
          }}
          className="text-sm text-brand-red hover:underline font-medium"
        >
          ← All inspections
        </button>
      </div>

      {detailLoading && !detail ? (
        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-[200px] flex-1">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Inspection date & time</label>
              <input
                type="datetime-local"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                disabled={!canWrite}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
              />
            </div>
            {detail && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Status</span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      detail.status === 'finalized' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {detail.status === 'finalized' ? 'Finalized' : 'Draft'}
                  </span>
                </div>
                {detail.template_name && (
                  <span className="text-[10px] text-gray-500 max-w-[14rem] text-right truncate" title={detail.template_name}>
                    {detail.template_name}
                    {(detail.template_version_label || '').trim()
                      ? ` · ${(detail.template_version_label || '').trim()}`
                      : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Assigned worker</label>
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              disabled={!canWrite || detail?.status === 'finalized'}
              className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50"
            >
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || e.username}
                </option>
              ))}
            </select>
          </div>

          {isDynamicInspection && dynamicDefinition ? (
            <DynamicSafetyForm
              definition={dynamicDefinition}
              formPayload={formPayload}
              setFormPayload={setFormPayload}
              canWrite={canWrite && detail?.status !== 'finalized'}
              projectId={projectId}
            />
          ) : (
            formSections.map((section) => (
              <div key={section.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                  <h3 className="text-sm font-semibold text-gray-800">{section.title}</h3>
                  {section.subtitle && <p className="text-xs text-gray-500 mt-1">{section.subtitle}</p>}
                </div>
                <div className="divide-y divide-gray-100">
                  {section.items.map((item, idx) => renderItem(item, idx, true))}
                </div>
              </div>
            ))
          )}

          {canWrite && (
            <div className="flex flex-wrap gap-3 items-center">
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save inspection'}
              </button>
              {detail?.status !== 'finalized' && (
                <button
                  type="button"
                  disabled={finalizeMutation.isPending}
                  onClick={() => finalizeMutation.mutate()}
                  className="px-5 py-2.5 border border-green-600 text-green-800 bg-green-50 rounded-lg font-medium text-sm hover:bg-green-100 disabled:opacity-50"
                >
                  {finalizeMutation.isPending ? 'Finalizing…' : 'Finalize inspection'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
