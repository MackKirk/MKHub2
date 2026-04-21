import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
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
import SafetySignaturePad from '@/components/SafetySignaturePad';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import {
  normalizeDefinition,
  validateDynamicFormMissing,
  type SafetyFormDefinition,
} from '@/types/safetyFormTemplate';
import { withSignSessionQuery, type SafetySignSession } from '@/lib/safetySignSessionQuery';
import { imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';

type SafetyInspectionRow = {
  id: string;
  project_id: string;
  inspection_date: string;
  template_version: string;
  status?: string;
  form_payload: Record<string, unknown>;
  form_template_id?: string | null;
  form_definition_snapshot?: SafetyFormDefinition | Record<string, unknown> | null;
  template_name?: string | null;
  template_version_label?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  pdf_attachment_error?: string | null;
  finalized_pdf_file_object_id?: string | null;
  interim_pdf_attachment_error?: string | null;
  interim_pdf_file_object_id?: string | null;
  sign_requests?: Array<{
    id: string;
    signer_user_id: string;
    status: string;
    signed_at?: string | null;
    signer_display_name_snapshot?: string | null;
    signature_file_object_id?: string | null;
    signature_location_label?: string | null;
  }>;
  interim_pdf_client_file_id?: string | null;
  final_pdf_client_file_id?: string | null;
  first_finalized_at?: string | null;
  first_finalized_by_id?: string | null;
  pdf_regeneration_error?: string | null;
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

function formatInspectionSignedAt(iso: string | undefined | null): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Worker + co-signers who completed a drawn signature on this inspection. */
function InspectionSignaturesGallery({
  formPayload,
  signRequests,
}: {
  formPayload: Record<string, unknown>;
  signRequests: SafetyInspectionRow['sign_requests'];
}) {
  const workerFileId =
    typeof formPayload._worker_signature_file_id === 'string' && formPayload._worker_signature_file_id.trim()
      ? formPayload._worker_signature_file_id.trim()
      : null;
  const workerName =
    typeof formPayload._worker_signature_signer_name === 'string' ? formPayload._worker_signature_signer_name.trim() : '';
  const workerSignedAt =
    typeof formPayload._worker_signature_signed_at === 'string' ? formPayload._worker_signature_signed_at : '';
  const workerLoc =
    typeof formPayload._worker_signature_location_label === 'string'
      ? formPayload._worker_signature_location_label.trim()
      : '';

  const additionalSigned = (signRequests ?? [])
    .filter((r) => (r.status || '').toLowerCase() === 'signed' && r.signature_file_object_id)
    .sort((a, b) => {
      const ta = Date.parse(a.signed_at || '') || 0;
      const tb = Date.parse(b.signed_at || '') || 0;
      return ta - tb;
    });

  if (!workerFileId && additionalSigned.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Signatures on this inspection</div>
      <div className="space-y-4">
        {workerFileId && (
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Worker</div>
            <div className="flex flex-wrap gap-4 items-start">
              <a
                href={withFileAccessToken(`/files/${encodeURIComponent(workerFileId)}/thumbnail?w=640`)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 block rounded border border-gray-200 bg-white overflow-hidden"
              >
                <img
                  src={withFileAccessToken(`/files/${encodeURIComponent(workerFileId)}/thumbnail?w=320`)}
                  alt=""
                  className="max-h-28 w-auto max-w-[200px] object-contain"
                />
              </a>
              <div className="text-sm text-gray-800 space-y-1 min-w-0 flex-1">
                <div>
                  <span className="text-gray-500">Signed by: </span>
                  <span className="font-medium">{workerName || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Time: </span>
                  <span>{formatInspectionSignedAt(workerSignedAt)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Location: </span>
                  <span>{workerLoc || 'Not captured'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {additionalSigned.map((r) => (
          <div key={r.id} className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Additional signer</div>
            <div className="flex flex-wrap gap-4 items-start">
              <a
                href={withFileAccessToken(`/files/${encodeURIComponent(r.signature_file_object_id!)}/thumbnail?w=640`)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 block rounded border border-gray-200 bg-white overflow-hidden"
              >
                <img
                  src={withFileAccessToken(`/files/${encodeURIComponent(r.signature_file_object_id!)}/thumbnail?w=320`)}
                  alt=""
                  className="max-h-28 w-auto max-w-[200px] object-contain"
                />
              </a>
              <div className="text-sm text-gray-800 space-y-1 min-w-0 flex-1">
                <div>
                  <span className="text-gray-500">Signed by: </span>
                  <span className="font-medium">{(r.signer_display_name_snapshot || '').trim() || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Time: </span>
                  <span>{formatInspectionSignedAt(r.signed_at)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Location: </span>
                  <span>{(r.signature_location_label || '').trim() || 'Not captured'}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  projectId: string;
  proj: { name?: string; address?: string; address_city?: string; address_province?: string };
  canRead: boolean;
  canWrite: boolean;
  /** From URL ?safety_inspection= — open this inspection when the list loads */
  initialSafetyInspectionId?: string | null;
  /** Parent (e.g. ProjectDetail) calls this before switching away from the Safety tab */
  flushSaveRef?: MutableRefObject<(() => Promise<void>) | undefined>;
  /** Pending signer without project/safety read: skip list, hide back to all inspections */
  signOnlySession?: boolean;
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

  const pushFiles = (list: FileList | File[] | null) => {
    if (!list?.length || disabled || uploading) return;
    const picked = Array.isArray(list) ? list : Array.from(list);
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
      tabIndex={disabled || uploading ? -1 : 0}
      onPaste={(e) => {
        if (disabled || uploading) return;
        const files = imageFilesFromClipboardData(e.clipboardData);
        if (!files.length) return;
        e.preventDefault();
        pushFiles(files);
      }}
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
        <p className="text-xs text-gray-500 mt-2">
          Drag-and-drop images here, choose files, or paste with Ctrl+V (click this area first).
        </p>
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

export default function ProjectSafetyTab({
  projectId,
  proj,
  canRead,
  canWrite,
  initialSafetyInspectionId,
  flushSaveRef,
  signOnlySession = false,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    signOnlySession && initialSafetyInspectionId?.trim() ? initialSafetyInspectionId.trim() : null
  );
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});
  /** JSON snapshot of last committed form_payload (server or after save); null = no baseline yet */
  const [committedJson, setCommittedJson] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pickedTemplateId, setPickedTemplateId] = useState('');
  /** Y/N item keys whose optional comment field is expanded for editing */
  const [ynCommentOpen, setYnCommentOpen] = useState<Record<string, boolean>>({});
  /** Which Y/N row is currently uploading an image (shows inline status). */
  const [ynImageUploadingFor, setYnImageUploadingFor] = useState<string | null>(null);
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false);
  const [extraSignerQuery, setExtraSignerQuery] = useState('');
  const [extraSignerIds, setExtraSignerIds] = useState<string[]>([]);
  /** Field keys (or synthetic worker-signature key) to outline in red after finalize validation fails */
  const [requiredFieldHighlightKeys, setRequiredFieldHighlightKeys] = useState<string[]>([]);

  const listKey = ['projectSafetyInspections', projectId];
  const { data: list = [], isLoading: listLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => api<SafetyInspectionRow[]>('GET', `/projects/${encodeURIComponent(projectId)}/safety-inspections`),
    enabled: canRead && !!projectId && !signOnlySession,
  });

  const signSession: SafetySignSession | null = useMemo(
    () =>
      signOnlySession && selectedId
        ? { projectId, inspectionId: selectedId }
        : null,
    [signOnlySession, projectId, selectedId]
  );

  useEffect(() => {
    const sid = initialSafetyInspectionId?.trim();
    if (!sid) return;
    if (signOnlySession) {
      setSelectedId(sid);
      return;
    }
    if (!list.length) return;
    if (list.some((r) => r.id === sid)) {
      setSelectedId(sid);
    }
  }, [initialSafetyInspectionId, list, signOnlySession]);

  const { data: schedulableTemplates = [] } = useQuery({
    queryKey: ['formTemplatesSchedulable', showCreateModal],
    queryFn: () => api<FormTemplatePick[]>('GET', '/form-templates?schedulable=true'),
    enabled: showCreateModal && canWrite,
  });

  const safetyAccess = canRead || signOnlySession;

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string; username?: string; profile?: { first_name?: string; last_name?: string } }>('GET', '/auth/me'),
    enabled: safetyAccess && !!selectedId,
  });

  const signerDisplayName = useMemo(() => {
    const p = me?.profile;
    if (p && ((p.first_name || '').trim() || (p.last_name || '').trim())) {
      return `${(p.first_name || '').trim()} ${(p.last_name || '').trim()}`.trim();
    }
    return (me?.username || '').trim() || 'User';
  }, [me]);

  const signerUserId = me?.id != null ? String(me.id) : undefined;

  const detailKey = ['projectSafetyInspection', projectId, selectedId];
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: detailKey,
    queryFn: () =>
      api<SafetyInspectionRow>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(selectedId!)}`
      ),
    enabled: safetyAccess && !!projectId && !!selectedId,
  });

  const isDynamicInspection = Boolean(detail?.form_template_id);

  const { data: templateFallback } = useQuery({
    queryKey: ['formTemplate', detail?.form_template_id, signSession?.inspectionId],
    queryFn: () =>
      api<{ definition: SafetyFormDefinition }>(
        'GET',
        withSignSessionQuery(
          `/form-templates/${encodeURIComponent(detail!.form_template_id!)}`,
          signSession
        )
      ),
    enabled:
      safetyAccess &&
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

  const inspectionImmutable =
    detail?.status === 'finalized' || detail?.status === 'pending_signatures';
  const formEditable = !!(canWrite && detail && !inspectionImmutable);

  /** FileObject id for the PDF saved to Project files (final) or interim while awaiting signatures */
  const inspectionPdfFileObjectId = useMemo(() => {
    if (!detail?.status) return null;
    const st = (detail.status || '').toLowerCase();
    const fin = (detail.finalized_pdf_file_object_id || '').trim();
    const interim = (detail.interim_pdf_file_object_id || '').trim();
    if (st === 'finalized' && fin) return fin;
    if (st === 'pending_signatures' && interim) return interim;
    return null;
  }, [detail]);

  const showInspectionPdfAction = useMemo(() => {
    if (!detail?.status || !safetyAccess || !isDynamicInspection) return false;
    const st = (detail.status || '').toLowerCase();
    return st === 'finalized' || st === 'pending_signatures';
  }, [detail?.status, safetyAccess, isDynamicInspection]);

  const canRegenerateInspectionPdf = useMemo(
    () => showInspectionPdfAction && canWrite && !inspectionPdfFileObjectId,
    [showInspectionPdfAction, canWrite, inspectionPdfFileObjectId]
  );

  const [pdfLinkOpening, setPdfLinkOpening] = useState(false);
  const openInspectionPdfInNewTab = useCallback(async () => {
    if (!selectedId || !showInspectionPdfAction) return;
    setPdfLinkOpening(true);
    try {
      let fid = inspectionPdfFileObjectId;
      if (!fid && canRegenerateInspectionPdf) {
        const data = await api<SafetyInspectionRow>(
          'POST',
          `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(selectedId)}/regenerate-pdf`,
          {}
        );
        const regenErr = (data as { pdf_regeneration_error?: string }).pdf_regeneration_error;
        if (regenErr) {
          toast.error(
            regenErr === 'missing_files_write_or_safety_category'
              ? 'Could not save PDF to Project files (missing write access or Safety category not allowed for your role).'
              : regenErr === 'project_missing_client'
                ? 'Could not save PDF because this project has no client record.'
                : regenErr === 'pdf_build_failed' || regenErr === 'pdf_attach_failed'
                  ? 'Could not build or save the inspection PDF.'
                  : 'Could not regenerate the inspection PDF.'
          );
          return;
        }
        const st = (data.status || '').toLowerCase();
        const next =
          st === 'finalized'
            ? (data.finalized_pdf_file_object_id || '').trim()
            : (data.interim_pdf_file_object_id || '').trim();
        if (!next) {
          toast.error('PDF was not created');
          return;
        }
        fid = next;
        qc.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId, selectedId] });
        qc.invalidateQueries({ queryKey: listKey });
        qc.invalidateQueries({ queryKey: ['projectFiles', projectId] });
        toast.success('PDF restored to Project files');
      }
      if (!fid) {
        if (showInspectionPdfAction && !canWrite) {
          toast.error('The PDF is missing from Files. A user with edit permission must open this page to restore it.');
        }
        return;
      }
      const r = await api<{ preview_url?: string; download_url?: string }>(
        'GET',
        withFileAccessToken(`/files/${encodeURIComponent(fid)}/preview`)
      );
      const url = String(r.preview_url || r.download_url || '').trim();
      if (!url) {
        toast.error('PDF preview is not available');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open PDF');
    } finally {
      setPdfLinkOpening(false);
    }
  }, [
    selectedId,
    showInspectionPdfAction,
    inspectionPdfFileObjectId,
    canRegenerateInspectionPdf,
    projectId,
    qc,
    listKey,
  ]);

  const myPendingSignRequest = useMemo(() => {
    if (!detail?.sign_requests || !signerUserId) return null;
    return (
      detail.sign_requests.find(
        (r) => r.signer_user_id === signerUserId && (r.status || '').toLowerCase() === 'pending'
      ) ?? null
    );
  }, [detail?.sign_requests, signerUserId]);

  const completeSignatureMutation = useMutation({
    mutationFn: (body: {
      sign_request_id: string;
      signature_file_object_id: string;
      signed_at?: string;
      location_label?: string;
    }) => {
      if (!selectedId) throw new Error('No inspection');
      return api<SafetyInspectionRow>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(selectedId)}/signatures/complete`,
        body
      );
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId, selectedId] });
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: ['safetyInspections'] });
      qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      qc.invalidateQueries({ queryKey: ['projectFiles', projectId] });
      if (data?.status === 'finalized') {
        toast.success('All signatures collected. Inspection is finalized.');
      } else {
        toast.success('Signature recorded.');
      }
      if ((data as { pdf_attachment_error?: string })?.pdf_attachment_error) {
        toast.error('The final PDF could not be saved to Project files.');
      }
    },
    onError: () => toast.error('Could not submit signature'),
  });

  const inspectionDisplayName = useMemo(() => {
    if (!detail) return '';
    const name = (detail.template_name || '').trim();
    if (name) {
      const vl = (detail.template_version_label || '').trim();
      return vl ? `${name} (${vl})` : name;
    }
    const tv = detail.template_version || '';
    if (tv.startsWith('mki')) return 'MKI Safety Inspection';
    return tv || 'Safety inspection';
  }, [detail]);

  const formPayloadRef = useRef(formPayload);
  const inspectionUsesTemplateRef = useRef(false);
  useEffect(() => {
    formPayloadRef.current = formPayload;
  }, [formPayload]);
  useEffect(() => {
    inspectionUsesTemplateRef.current = Boolean(detail?.form_template_id);
  }, [detail?.form_template_id]);

  useEffect(() => {
    if (!selectedId) {
      setCommittedJson(null);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!detail?.id) return;
    const raw =
      detail.form_payload && typeof detail.form_payload === 'object' && !Array.isArray(detail.form_payload)
        ? { ...detail.form_payload }
        : {};
    setFormPayload(raw);
    setCommittedJson(JSON.stringify(raw));
    setRequiredFieldHighlightKeys([]);
  }, [detail?.id]);

  useEffect(() => {
    if (!dynamicDefinition || requiredFieldHighlightKeys.length === 0) return;
    const stillMissing = validateDynamicFormMissing(dynamicDefinition, formPayload);
    const stillSet = new Set(stillMissing.map((m) => m.key));
    setRequiredFieldHighlightKeys((prev) => {
      const next = prev.filter((k) => stillSet.has(k));
      return next.length === prev.length ? prev : next;
    });
  }, [formPayload, dynamicDefinition, requiredFieldHighlightKeys]);

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
    if (!selectedId || !detail?.id) return;
    if (detail.form_payload && Object.keys(detail.form_payload).length > 0) return;
    setFormPayload((p) => {
      const next = applyProjectPrefill(p);
      setCommittedJson(JSON.stringify(next));
      return next;
    });
  }, [selectedId, detail?.id, detail?.form_payload, applyProjectPrefill]);

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
    mutationFn: async () => {
      const sid = selectedId;
      if (!sid) throw new Error('no id');
      const fp = formPayloadRef.current;
      const body: Record<string, unknown> = {
        form_payload: fp,
      };
      if (!inspectionUsesTemplateRef.current) {
        body.template_version = SAFETY_TEMPLATE_VERSION;
      }
      return api<SafetyInspectionRow>(
        'PUT',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(sid)}`,
        body
      );
    },
    onSuccess: () => {
      setYnCommentOpen({});
      setCommittedJson(JSON.stringify(formPayloadRef.current));
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: ['safetyInspections'] });
      qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId, selectedId] });
      }
    },
    onError: () => toast.error('Could not save'),
  });

  const flushSaveInspection = useCallback(async () => {
    await saveMutation.mutateAsync();
  }, [saveMutation]);

  const { data: userPickOptions = [] } = useQuery({
    queryKey: ['authUsersOptions', extraSignerQuery, finalizeModalOpen],
    queryFn: () =>
      api<Array<{ id: string; name: string; username: string }>>(
        'GET',
        `/auth/users/options?q=${encodeURIComponent(extraSignerQuery)}&limit=80`
      ),
    enabled: finalizeModalOpen,
  });

  const finalizeMutation = useMutation({
    mutationFn: async (additionalSignerUserIds: string[]) => {
      const sid = selectedId;
      if (!sid) throw new Error('no id');
      const fp = formPayloadRef.current;
      if (detail?.form_template_id && dynamicDefinition) {
        const missing = validateDynamicFormMissing(dynamicDefinition, fp);
        if (missing.length) {
          toast.error(
            `Missing required fields: ${missing
              .slice(0, 5)
              .map((m) => m.label)
              .join(', ')}${missing.length > 5 ? '…' : ''}`
          );
          setRequiredFieldHighlightKeys(missing.map((m) => m.key));
          setFinalizeModalOpen(false);
          throw new Error('validation');
        }
      }
      const body: Record<string, unknown> = {
        status: 'finalized',
        form_payload: fp,
        additional_signer_user_ids: additionalSignerUserIds,
      };
      if (!inspectionUsesTemplateRef.current) {
        body.template_version = SAFETY_TEMPLATE_VERSION;
      }
      return api<SafetyInspectionRow>(
        'PUT',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(sid)}`,
        body
      );
    },
    onSuccess: (data) => {
      setFinalizeModalOpen(false);
      setExtraSignerIds([]);
      setExtraSignerQuery('');
      setRequiredFieldHighlightKeys([]);
      setCommittedJson(JSON.stringify(formPayloadRef.current));
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: ['safetyInspections'] });
      qc.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      qc.invalidateQueries({ queryKey: ['projectFiles', projectId] });
      if (selectedId) {
        qc.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId, selectedId] });
      }
      if (data?.status === 'pending_signatures') {
        toast.success('Inspection submitted; additional signatures requested.');
      } else {
        toast.success('Inspection finalized');
      }
      if (data?.pdf_attachment_error) {
        const code = data.pdf_attachment_error;
        toast.error(
          code === 'missing_files_write_or_safety_category'
            ? 'The inspection PDF was not added to Project files (missing write access or the Safety category is not allowed for your role).'
            : code === 'project_missing_client'
              ? 'The inspection PDF was not saved because this project has no client record.'
              : 'The inspection PDF could not be generated or saved to Project files.'
        );
      }
      if (data?.interim_pdf_attachment_error) {
        toast.error(
          'The interim PDF could not be saved to Project files. Signers were still notified if notifications are enabled.'
        );
      }
    },
    onError: (e: Error) => {
      if (e?.message === 'validation') return;
      toast.error('Could not finalize');
    },
  });

  const hasUnsavedChanges = useMemo(() => {
    if (!canWrite || !selectedId || !detail || inspectionImmutable || committedJson === null) return false;
    try {
      return JSON.stringify(formPayload) !== committedJson;
    } catch {
      return true;
    }
  }, [canWrite, selectedId, detail, formPayload, committedJson, inspectionImmutable]);

  const handleGuardDiscard = useCallback(() => {
    try {
      const parsed = committedJson ? (JSON.parse(committedJson) as unknown) : {};
      const obj =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      setFormPayload({ ...obj });
    } catch {
      setFormPayload({});
    }
  }, [committedJson]);

  useUnsavedChangesGuard(hasUnsavedChanges, flushSaveInspection, handleGuardDiscard);

  useEffect(() => {
    if (!flushSaveRef) return;
    flushSaveRef.current = flushSaveInspection;
    return () => {
      flushSaveRef.current = undefined;
    };
  }, [flushSaveRef, flushSaveInspection]);

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
    const w = formEditable;
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
            disabled={!w}
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
            disabled={!w}
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
                  disabled={!w}
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
                disabled={!w}
                onClick={() => setYnStatus(item.key, opt.value)}
                className={`min-w-[3.25rem] min-h-[3.25rem] flex items-center justify-center rounded-xl text-sm font-bold border-2 transition-all disabled:opacity-50 ${
                  yn.status === opt.value ? opt.className + ' scale-105 shadow-md' : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {item.commentsField && w && (
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
        {item.commentsField && w && commentExpanded && (
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
        {item.commentsField && w && !commentExpanded && hasCommentOrMedia && (
          <div className="mt-3 space-y-2">
            {hasComment && <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{yn.comments}</p>}
            <YnCommentImageGrid imageIds={yn.comment_image_ids} />
          </div>
        )}
        {item.commentsField && !w && hasCommentOrMedia && (
          <div className="mt-3 space-y-2">
            {hasComment && <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{yn.comments}</p>}
            <YnCommentImageGrid imageIds={yn.comment_image_ids} />
          </div>
        )}
      </div>
    );
  };

  const formSections = useMemo(() => PROJECT_SAFETY_INSPECTION_TEMPLATE, []);

  if (!canRead && !signOnlySession) {
    return <div className="rounded-xl border bg-white p-6 text-sm text-gray-600">You do not have permission to view safety inspections.</div>;
  }

  if (!selectedId) {
    return (
      <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">Safety inspections</h2>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-0"
            >
              <span className="font-medium text-xs text-gray-700">+ New Inspection</span>
            </button>
          )}
          {listLoading ? (
            <div
              className={`p-8 text-center text-gray-500 text-sm ${canWrite ? 'border-t border-gray-100' : ''}`}
            >
              Loading…
            </div>
          ) : list.length === 0 ? (
            <div
              className={`p-8 text-center text-gray-500 text-sm ${canWrite ? 'border-t border-gray-100' : ''}`}
            >
              No inspections yet. Create one to get started.
            </div>
          ) : (
            <ul className={`divide-y divide-gray-100 ${canWrite ? 'border-t border-gray-100' : ''}`}>
              {list.map((row) => {
                const st =
                  row.status === 'finalized'
                    ? 'finalized'
                    : row.status === 'pending_signatures'
                      ? 'pending_signatures'
                      : 'draft';
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
                          st === 'finalized'
                            ? 'bg-green-100 text-green-800'
                            : st === 'pending_signatures'
                              ? 'bg-sky-100 text-sky-900'
                              : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {st === 'finalized' ? 'Finalized' : st === 'pending_signatures' ? 'Signatures' : 'Draft'}
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
      {!signOnlySession && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void (async () => {
                if (!hasUnsavedChanges) {
                  setSelectedId(null);
                  return;
                }
                const result = await confirm({
                  title: 'Unsaved Changes',
                  message: 'You have unsaved changes. What would you like to do?',
                  confirmText: 'Save and Continue',
                  cancelText: 'Cancel',
                  showDiscard: true,
                  discardText: 'Continue without saving',
                });
                if (result === 'cancel') return;
                if (result === 'confirm') {
                  try {
                    await flushSaveInspection();
                  } catch {
                    return;
                  }
                }
                setSelectedId(null);
              })();
            }}
            className="text-sm text-brand-red hover:underline font-medium"
          >
            ← All inspections
          </button>
        </div>
      )}

      {detailLoading && !detail ? (
        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Inspection</div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate" title={inspectionDisplayName}>
                {inspectionDisplayName || 'Safety inspection'}
              </h2>
            </div>
            {detail && (
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <span className="text-xs text-gray-500">Status</span>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    detail.status === 'finalized'
                      ? 'bg-green-100 text-green-800'
                      : detail.status === 'pending_signatures'
                        ? 'bg-sky-100 text-sky-900'
                        : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {detail.status === 'finalized'
                    ? 'Finalized'
                    : detail.status === 'pending_signatures'
                      ? 'Awaiting signatures'
                      : 'Draft'}
                </span>
                {showInspectionPdfAction && (inspectionPdfFileObjectId || canRegenerateInspectionPdf) ? (
                  <button
                    type="button"
                    disabled={pdfLinkOpening}
                    onClick={() => void openInspectionPdfInNewTab()}
                    title={
                      canRegenerateInspectionPdf && !inspectionPdfFileObjectId
                        ? 'Rebuilds the PDF from the saved inspection and adds it back to Project files'
                        : undefined
                    }
                    className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-300 text-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    {pdfLinkOpening
                      ? inspectionPdfFileObjectId
                        ? 'Opening…'
                        : 'Generating…'
                      : 'Download PDF'}
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {detail?.status === 'pending_signatures' && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
              <p>
                This inspection is waiting for additional signers. The form is read-only so everyone reviews the same content.
                {myPendingSignRequest ? ' Sign at the bottom when you have reviewed the form.' : ''}
              </p>
            </div>
          )}

          {isDynamicInspection && dynamicDefinition ? (
            <DynamicSafetyForm
              definition={dynamicDefinition}
              formPayload={formPayload}
              setFormPayload={setFormPayload}
              canWrite={formEditable}
              projectId={projectId}
              signerDisplayName={signerDisplayName}
              signerUserId={signerUserId}
              signSession={signSession}
              highlightRequiredFieldKeys={requiredFieldHighlightKeys}
            />
          ) : (
            formSections.map((section) => (
              <div key={section.id} className="rounded-xl border border-gray-200 bg-white overflow-visible">
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

          {detail ? (
            <InspectionSignaturesGallery formPayload={formPayload} signRequests={detail.sign_requests} />
          ) : null}

          {formEditable && (
            <div className="flex flex-wrap gap-3 items-center">
              <button
                type="button"
                disabled={finalizeMutation.isPending || saveMutation.isPending}
                onClick={() => {
                  setExtraSignerIds([]);
                  setExtraSignerQuery('');
                  setFinalizeModalOpen(true);
                }}
                className="px-5 py-2.5 border border-green-600 text-green-800 bg-green-50 rounded-lg font-medium text-sm hover:bg-green-100 disabled:opacity-50"
              >
                {finalizeMutation.isPending ? 'Finalizing…' : saveMutation.isPending ? 'Saving…' : 'Finalize inspection'}
              </button>
            </div>
          )}

          {detail?.status === 'pending_signatures' && myPendingSignRequest && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-4 text-sm text-sky-900 space-y-3">
              <p className="text-xs font-medium text-sky-950">Your signature is requested</p>
              <SafetySignaturePad
                projectId={projectId}
                disabled={completeSignatureMutation.isPending}
                fileObjectId={null}
                onFileObjectId={() => {}}
                signerDisplayName={signerDisplayName}
                signerUserId={signerUserId}
                pendingSafetySignInspectionId={detail?.id}
                onSignatureSaved={(fileId, meta) => {
                  completeSignatureMutation.mutate({
                    sign_request_id: myPendingSignRequest.id,
                    signature_file_object_id: fileId,
                    signed_at: meta.signedAt,
                    location_label: meta.locationLabel,
                  });
                }}
              />
            </div>
          )}

          {finalizeModalOpen && (
            <OverlayPortal>
              <div
                className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center overflow-y-auto p-4"
                onClick={() => setFinalizeModalOpen(false)}
                role="presentation"
              >
                <SafetyFormModalLayout
                  widthClass="w-full max-w-lg"
                  titleId="safety-finalize-signers-title"
                  title="Finalize inspection"
                  subtitle="Optional: select users who must sign. If none are selected, a final PDF is generated immediately."
                  onClose={() => setFinalizeModalOpen(false)}
                  footer={
                    <>
                      <button type="button" className={SAFETY_MODAL_BTN_CANCEL} onClick={() => setFinalizeModalOpen(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={finalizeMutation.isPending}
                        onClick={() => finalizeMutation.mutate(extraSignerIds)}
                        className={SAFETY_MODAL_BTN_PRIMARY}
                      >
                        {finalizeMutation.isPending ? 'Submitting…' : 'Submit'}
                      </button>
                    </>
                  }
                >
                  <label className={SAFETY_MODAL_FIELD_LABEL}>Search users</label>
                  <input
                    type="search"
                    value={extraSignerQuery}
                    onChange={(e) => setExtraSignerQuery(e.target.value)}
                    placeholder="Name or email"
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                  <div className="mt-3 max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                    {userPickOptions.map((u) => {
                      const checked = extraSignerIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setExtraSignerIds((prev) =>
                                checked ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                              );
                            }}
                          />
                          <span className="min-w-0">
                            <span className="font-medium text-gray-900">{u.name}</span>
                            <span className="text-xs text-gray-500 block truncate">{u.username}</span>
                          </span>
                        </label>
                      );
                    })}
                    {userPickOptions.length === 0 && (
                      <div className="px-3 py-4 text-xs text-gray-500 text-center">Type to search users.</div>
                    )}
                  </div>
                  {extraSignerIds.length > 0 && (
                    <p className="mt-2 text-xs text-gray-600">{extraSignerIds.length} additional signer(s) selected.</p>
                  )}
                </SafetyFormModalLayout>
              </div>
            </OverlayPortal>
          )}
        </>
      )}
    </div>
  );
}
