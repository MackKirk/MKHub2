import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, ExternalLink, Settings } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import SignatureTemplateEditor from '@/components/SignatureTemplateEditor';
import { onboardingDocPreferencesQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppControlLabelRow,
  AppEmptyState,
  AppFieldHint,
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppModal,
  AppMultiSelect,
  AppPageHeader,
  AppSectionHeader,
  AppSelect,
  AppTable,
  AppTabs,
  AppTextarea,
  AppTooltip,
  AppUserSelect,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiCx,
  uiDropdown,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
  type AppUserSelectUser,
} from '@/components/ui';

type UserPickerRow = { id: string; name?: string | null; username?: string; email?: string };

type BaseDoc = {
  id: string;
  name: string;
  file_id: string;
  default_deadline_days: number;
  sign_placement?: Record<string, number>;
  assignee_type?: string;
  assignee_user_id?: string | null;
  assignee_user_ids?: string[];
  required?: boolean;
  employee_visible?: boolean;
  display_name?: string | null;
  notification_message?: string | null;
  delivery_mode?: string;
  delivery_amount?: number | null;
  delivery_unit?: string | null;
  delivery_direction?: string | null;
  requires_signature?: boolean;
  notification_policy?: Record<string, unknown> | null;
  signing_deadline_days?: number;
  signature_template?: { version: number; fields: unknown[] } | null;
};

type Tab = 'docs' | 'monitor';

function userDisplayName(u: { name?: string | null; username?: string; email?: string }): string {
  return (u.name || '').trim() || u.username || u.email || 'User';
}

function mapUserPickerRow(u: UserPickerRow): AppUserSelectUser {
  return {
    id: u.id,
    name: (u.name || u.email || u.username || '').trim() || undefined,
    username: u.username,
  };
}

function displayNameFromPdfFile(file: File): string {
  const base = file.name.replace(/\.pdf$/i, '').trim();
  return base.replace(/[_]+/g, ' ').replace(/-/g, ' ').trim() || 'Document';
}

/** Only real PDF uploads: .pdf + MIME + %PDF header */
function isPdfFileCandidate(f: File): boolean {
  const name = f.name.trim().toLowerCase();
  if (!name.endsWith('.pdf')) return false;
  const ct = (f.type || '').toLowerCase();
  if (ct === 'application/pdf') return true;
  if (ct === '' || ct === 'application/octet-stream') return true;
  return false;
}

async function fileStartsWithPdfMagic(file: File): Promise<boolean> {
  try {
    const buf = await file.slice(0, 5).arrayBuffer();
    return new TextDecoder().decode(buf).startsWith('%PDF');
  } catch {
    return false;
  }
}

/** Same PDF badge as Project / Opportunities Files tab (ProjectDetail iconFor pdf) */
function PdfFileBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`w-8 h-10 rounded-lg bg-red-500 text-white flex items-center justify-center text-[10px] font-extrabold select-none flex-shrink-0 ${className}`}
      aria-hidden
    >
      PDF
    </div>
  );
}

/** First-page PNG from API (Bearer); fallback to PDF badge */
function BaseDocPageThumb({ docId, w = 260 }: { docId: string; w?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const t = getToken();
        const r = await fetch(`/onboarding/base-documents/${docId}/thumbnail?w=${w}`, {
          headers: { Authorization: `Bearer ${t || ''}` },
        });
        if (cancelled) return;
        if (!r.ok) {
          setState('err');
          return;
        }
        const blob = await r.blob();
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setState('ok');
      } catch {
        if (!cancelled) setState('err');
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId, w]);
  if (state === 'loading') {
    return (
      <div className="w-full h-full min-h-[6rem] flex items-center justify-center bg-gray-100 rounded-md">
        <div className="h-8 w-16 bg-gray-200/80 rounded animate-pulse" />
      </div>
    );
  }
  if (state === 'err' || !url) {
    return (
      <div className="w-full h-full min-h-[6rem] flex items-center justify-center bg-gray-50 rounded-md">
        <PdfFileBadge className="w-7 h-10 text-[9px]" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="w-full h-full min-h-[6rem] max-h-[7.5rem] object-contain object-top bg-white"
      draggable={false}
    />
  );
}

const NOTIFICATION_PRESETS = [
  { value: 'soon_after_available', label: 'Soon after document is available' },
  { value: 'placeholder', label: 'Default (notifications not sent yet)' },
];

export default function OnboardingAdmin() {
  const qc = useQueryClient();
  const askConfirm = useConfirm();
  const [tab, setTab] = useState<Tab>('docs');
  const [resendModalOpen, setResendModalOpen] = useState(false);
  const { data: baseDocs = [], refetch: refetchDocs } = useQuery({
    queryKey: ['onb-base-docs'],
    queryFn: () => api<BaseDoc[]>('GET', '/onboarding/base-documents'),
  });
  const { data: onbSettings } = useQuery({
    queryKey: ['onboarding-settings'],
    queryFn: () => api<{ document_delivery_enabled: boolean }>('GET', '/onboarding/settings'),
  });
  const [deliveryTogglePending, setDeliveryTogglePending] = useState(false);
  const { data: userPickerList = [], isLoading: usersPickerLoading } = useQuery({
    queryKey: ['onb-users-picker'],
    queryFn: async () => {
      const limit = 2000;
      let page = 1;
      const out: UserPickerRow[] = [];
      for (;;) {
        const res = await api<{ items: UserPickerRow[]; total_pages: number }>('GET', `/users?page=${page}&limit=${limit}`);
        const items = res?.items ?? [];
        out.push(...items);
        if (!res?.total_pages || page >= res.total_pages) break;
        page += 1;
      }
      return out.sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b)));
    },
    enabled: tab === 'docs' || resendModalOpen,
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ['onb-assignments'],
    queryFn: () => api<any[]>('GET', '/onboarding/assignments'),
    enabled: tab === 'monitor',
  });

  /** Same entry + hover pattern as BusinessDashboard cards */
  const [uploading, setUploading] = useState(false);
  const [baseDocPreview, setBaseDocPreview] = useState<{ url: string; name: string } | null>(null);
  const [baseDocPreviewLoading, setBaseDocPreviewLoading] = useState(false);
  const baseDocPreviewUrlRef = useRef<string | null>(null);
  const baseDocPreviewAbortRef = useRef<AbortController | null>(null);

  const closeBaseDocPreview = () => {
    baseDocPreviewAbortRef.current?.abort();
    baseDocPreviewAbortRef.current = null;
    if (baseDocPreviewUrlRef.current) {
      URL.revokeObjectURL(baseDocPreviewUrlRef.current);
      baseDocPreviewUrlRef.current = null;
    }
    setBaseDocPreview(null);
    setBaseDocPreviewLoading(false);
  };

  useEffect(() => {
    return () => {
      if (baseDocPreviewUrlRef.current) {
        URL.revokeObjectURL(baseDocPreviewUrlRef.current);
        baseDocPreviewUrlRef.current = null;
      }
    };
  }, []);
  const [resendDocIds, setResendDocIds] = useState<Set<string>>(() => new Set());
  const [resendSelectedIds, setResendSelectedIds] = useState<Set<string>>(() => new Set());

  const [prefsDoc, setPrefsDoc] = useState<BaseDoc | null>(null);
  const [docMenuOpenId, setDocMenuOpenId] = useState<string | null>(null);
  const [docMenuAnchor, setDocMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const docMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const docMenuMenuRef = useRef<HTMLDivElement | null>(null);
  const [templateDoc, setTemplateDoc] = useState<BaseDoc | null>(null);
  const [pfAssigneeType, setPfAssigneeType] = useState<'employee' | 'user'>('employee');
  const [pfAssigneeUserIds, setPfAssigneeUserIds] = useState<Set<string>>(() => new Set());
  const [pfRequired, setPfRequired] = useState(true);
  const [pfEmployeeVisible, setPfEmployeeVisible] = useState(true);
  const [pfDisplayName, setPfDisplayName] = useState('');
  const [pfMessage, setPfMessage] = useState('');
  const [pfDelivery, setPfDelivery] = useState<'none' | 'on_hire' | 'custom'>('on_hire');
  const [pfAmt, setPfAmt] = useState(1);
  const [pfUnit, setPfUnit] = useState<'days' | 'weeks' | 'months'>('months');
  const [pfDir, setPfDir] = useState<'before' | 'after'>('after');
  const [pfNotifTiming, setPfNotifTiming] = useState('placeholder');
  const [pfReqSig, setPfReqSig] = useState(true);
  const [pfSigningDays, setPfSigningDays] = useState(7);
  const [pfSaving, setPfSaving] = useState(false);

  useEffect(() => {
    if (!prefsDoc) return;
    setPfAssigneeType((prefsDoc.assignee_type || 'employee').toLowerCase() === 'user' ? 'user' : 'employee');
    const ids =
      prefsDoc.assignee_user_ids && prefsDoc.assignee_user_ids.length > 0
        ? prefsDoc.assignee_user_ids
        : prefsDoc.assignee_user_id
          ? [prefsDoc.assignee_user_id]
          : [];
    setPfAssigneeUserIds(new Set(ids));
    setPfRequired(prefsDoc.required !== false);
    setPfEmployeeVisible(prefsDoc.employee_visible !== false);
    setPfDisplayName(prefsDoc.display_name || '');
    setPfMessage(prefsDoc.notification_message || '');
    const mode = (prefsDoc.delivery_mode || 'on_hire').toLowerCase();
    if (mode === 'none') setPfDelivery('none');
    else if (mode === 'custom') setPfDelivery('custom');
    else setPfDelivery('on_hire');
    setPfAmt(prefsDoc.delivery_amount || 1);
    setPfUnit((prefsDoc.delivery_unit as 'days' | 'weeks' | 'months') || 'months');
    setPfDir((prefsDoc.delivery_direction as 'before' | 'after') || 'after');
    setPfReqSig(prefsDoc.requires_signature !== false);
    const pol = prefsDoc.notification_policy as { timing?: string } | null;
    setPfNotifTiming(pol?.timing || 'placeholder');
    setPfSigningDays(Math.max(1, Number(prefsDoc.signing_deadline_days) || 7));
  }, [prefsDoc]);

  const setTabAndCollapse = (t: Tab) => {
    if (t !== 'docs') closeBaseDocPreview();
    setDocMenuOpenId(null);
    setDocMenuAnchor(null);
    setPrefsDoc(null);
    setResendModalOpen(false);
    setTab(t);
  };

  useEffect(() => {
    if (!docMenuOpenId) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (docMenuButtonRef.current?.contains(target) || docMenuMenuRef.current?.contains(target)) return;
      setDocMenuOpenId(null);
      setDocMenuAnchor(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDocMenuOpenId(null);
        setDocMenuAnchor(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [docMenuOpenId]);

  const openDocPreferences = (d: BaseDoc) => {
    setPrefsDoc(d);
    setDocMenuOpenId(null);
  };

  const saveDocPreferences = async () => {
    if (!prefsDoc) return;
    if (pfAssigneeType === 'user' && pfAssigneeUserIds.size === 0) {
      toast.error('Select at least one user for this document');
      return;
    }
    const mode = pfDelivery;
    const payload: Record<string, unknown> = {
      assignee_type: pfAssigneeType,
      assignee_user_id: null,
      assignee_user_ids: pfAssigneeType === 'user' ? Array.from(pfAssigneeUserIds) : null,
      required: pfRequired,
      employee_visible: pfEmployeeVisible,
      display_name: pfDisplayName.trim() || null,
      notification_message: pfMessage.trim() || null,
      delivery_mode: mode,
      requires_signature: pfReqSig,
      notification_policy: { timing: pfNotifTiming },
      signing_deadline_days: Math.max(1, pfSigningDays),
    };
    if (mode === 'custom') {
      payload.delivery_amount = pfAmt;
      payload.delivery_unit = pfUnit;
      payload.delivery_direction = pfDir;
    } else {
      payload.delivery_amount = null;
      payload.delivery_unit = null;
      payload.delivery_direction = null;
    }
    setPfSaving(true);
    try {
      await api('PUT', `/onboarding/base-documents/${prefsDoc.id}`, payload);
      toast.success('Saved');
      setPrefsDoc(null);
      refetchDocs();
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setPfSaving(false);
    }
  };

  const uploadOneBasePdf = async (file: File, docName: string) => {
    const type = file.type || 'application/pdf';
    const up = await api<any>('POST', '/files/upload', {
      original_name: file.name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: 'onboarding-base',
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });
    const conf = await api<any>('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: type,
    });
    await api('POST', '/onboarding/base-documents', {
      name: docName,
      file_id: conf.id,
    });
  };

  const processPdfFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const rejected = files.filter((f) => !isPdfFileCandidate(f));
    const candidates = files.filter((f) => isPdfFileCandidate(f));

    if (candidates.length === 0) {
      toast.error(
        rejected.length > 1
          ? 'Only PDF files (.pdf) are accepted.'
          : `Only PDF files are accepted — "${rejected[0]?.name || 'file'}" is not a PDF.`
      );
      return;
    }
    if (rejected.length > 0) {
      toast(`${rejected.length} non-PDF file(s) ignored — only .pdf is accepted.`, { icon: 'ℹ️' });
    }

    const pdfs: File[] = [];
    for (const file of candidates) {
      if (await fileStartsWithPdfMagic(file)) pdfs.push(file);
      else toast.error(`"${file.name}" is not a valid PDF file.`);
    }
    if (pdfs.length === 0) return;

    setUploading(true);
    let ok = 0;
    for (const file of pdfs) {
      try {
        await uploadOneBasePdf(file, displayNameFromPdfFile(file));
        ok++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message || 'failed'}`);
      }
    }
    setUploading(false);
    await refetchDocs();
    if (ok > 0) toast.success(`${ok} document(s) added`);
  };

  const openBaseDocPreview = async (docId: string, name: string) => {
    baseDocPreviewAbortRef.current?.abort();
    if (baseDocPreviewUrlRef.current) {
      URL.revokeObjectURL(baseDocPreviewUrlRef.current);
      baseDocPreviewUrlRef.current = null;
    }
    setBaseDocPreview(null);
    const ac = new AbortController();
    baseDocPreviewAbortRef.current = ac;
    const t = getToken();
    setBaseDocPreviewLoading(true);
    try {
      const r = await fetch(`/onboarding/base-documents/${docId}/preview`, {
        headers: { Authorization: `Bearer ${t || ''}` },
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || r.statusText);
      }
      const blob = await r.blob();
      if (ac.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (baseDocPreviewUrlRef.current) URL.revokeObjectURL(baseDocPreviewUrlRef.current);
      baseDocPreviewUrlRef.current = url;
      setBaseDocPreview({ url, name });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      toast.error(e?.message || 'Could not open PDF');
    } finally {
      if (!ac.signal.aborted) setBaseDocPreviewLoading(false);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'docs', label: 'Documents' },
    { id: 'monitor', label: 'Monitoring' },
  ];

  const tabItems = useMemo(() => tabs.map(({ id, label }) => ({ key: id, label })), [tabs]);

  const userPickerUsers = useMemo(() => userPickerList.map(mapUserPickerRow), [userPickerList]);

  const docMultiOptions = useMemo(
    () => baseDocs.map((d) => ({ value: d.id, label: d.name })),
    [baseDocs],
  );

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  const pageHeaderToday = (
    <div className="text-right">
      <div className={uiTypography.overline}>Today</div>
      <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
    </div>
  );

  const docMenuDoc = docMenuOpenId ? baseDocs.find((x) => x.id === docMenuOpenId) : null;

  const documentDeliveryEnabled = onbSettings?.document_delivery_enabled !== false;

  const setDocumentDeliveryEnabled = async (enabled: boolean) => {
    setDeliveryTogglePending(true);
    try {
      await api('PATCH', '/onboarding/settings', { document_delivery_enabled: enabled });
      await qc.invalidateQueries({ queryKey: ['onboarding-settings'] });
      toast.success(
        enabled
          ? 'New hires will receive onboarding documents for signature.'
          : 'Automatic document delivery is off. New hires will not be assigned signing tasks.',
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update settings');
    } finally {
      setDeliveryTogglePending(false);
    }
  };

  const assignmentTableRows = useMemo(
    () =>
      assignments.map((a) => [
        <span key={`${a.id}-user`} className={uiTypography.sectionTitle}>
          {a.username}
        </span>,
        <span key={`${a.id}-pkg`}>{a.package_name}</span>,
        <span key={`${a.id}-pending`} className="tabular-nums">
          {a.items_pending}
        </span>,
        <span key={`${a.id}-assigned`}>{a.assigned_at?.slice(0, 10)}</span>,
        <div key={`${a.id}-action`} className="text-right">
          <AppButton
            type="button"
            size="sm"
            variant="secondary"
            disabled={Number(a.items_pending ?? 0) < 1}
            onClick={async () => {
              const result = await askConfirm({
                title: 'Cancel pending documents',
                message:
                  'Remove all documents that are waiting for signature (pending or scheduled) for this assignment? Signed documents are not affected.',
                confirmText: 'Cancel pending',
                cancelText: 'Back',
              });
              if (result !== 'confirm') return;
              try {
                const r = await api<{ cancelled: number; assignment_removed: boolean }>(
                  'POST',
                  `/onboarding/assignments/${a.id}/cancel-pending`,
                  {},
                );
                if (r.cancelled === 0) {
                  toast.error('Nothing to cancel');
                } else {
                  toast.success(
                    r.assignment_removed
                      ? `Cancelled ${r.cancelled} item(s); assignment removed (no items left).`
                      : `Cancelled ${r.cancelled} pending item(s).`,
                  );
                }
                void qc.invalidateQueries({ queryKey: ['onb-assignments'] });
                void qc.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
                void qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
                void qc.invalidateQueries({ queryKey: ['notifications-recent'] });
                void qc.invalidateQueries({ queryKey: ['notifications-all'] });
                void qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Request failed');
              }
            }}
          >
            Cancel pending
          </AppButton>
        </div>,
      ]),
    [assignments, askConfirm, qc],
  );

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      {docMenuDoc &&
        docMenuAnchor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={docMenuMenuRef}
            className={uiCx(uiDropdown.menu, 'min-w-[13rem] py-1 z-[9999]')}
            style={{ top: docMenuAnchor.top, right: docMenuAnchor.right }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className={uiDropdown.option}
              onClick={() => {
                setDocMenuOpenId(null);
                setDocMenuAnchor(null);
                openDocPreferences(docMenuDoc);
              }}
            >
              Preferences
            </button>
            <button
              type="button"
              role="menuitem"
              className={uiDropdown.option}
              onClick={() => {
                setDocMenuOpenId(null);
                setDocMenuAnchor(null);
                setTemplateDoc(docMenuDoc);
              }}
            >
              Edit Signature Template
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              type="button"
              role="menuitem"
              className={uiCx(uiDropdown.option, 'text-red-600 hover:bg-red-50')}
              onClick={async () => {
                setDocMenuOpenId(null);
                setDocMenuAnchor(null);
                const result = await askConfirm({
                  title: 'Delete document',
                  message: `Delete "${docMenuDoc.name}"? Pending assignments may block this.`,
                  confirmText: 'Delete',
                  cancelText: 'Cancel',
                });
                if (result !== 'confirm') return;
                try {
                  await api('DELETE', `/onboarding/base-documents/${docMenuDoc.id}`);
                  refetchDocs();
                } catch (err: any) {
                  toast.error((err as any)?.message || 'Delete failed');
                }
              }}
            >
              Delete
            </button>
          </div>,
          document.body,
        )}

      <AppPageHeader
        title="HR Onboarding"
        subtitle="Onboarding documents and registration assignments"
        icon={<ClipboardList className="h-4 w-4" />}
        actions={pageHeaderToday}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
          <AppTabs tabs={tabItems} value={tab} onChange={(key) => setTabAndCollapse(key as Tab)} />
          <label className={uiCx(uiLayout.actionsRow, 'shrink-0 cursor-pointer select-none gap-2.5')}>
            <span className={uiTypography.body}>Send documents for signature</span>
            <button
              type="button"
              role="switch"
              aria-checked={documentDeliveryEnabled}
              aria-label="Send documents for signature"
              disabled={deliveryTogglePending || onbSettings === undefined}
              onClick={() => setDocumentDeliveryEnabled(!documentDeliveryEnabled)}
              className={uiCx(
                'relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 disabled:opacity-50',
                documentDeliveryEnabled ? 'border-gray-900 bg-gray-900' : 'border-gray-300 bg-gray-200',
              )}
            >
              <span
                className={uiCx(
                  'pointer-events-none mt-0.5 inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                  documentDeliveryEnabled ? 'ml-0.5 translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
          </label>
        </div>
      </AppCard>

      {tab === 'docs' && (
        <div className={uiSpacing.sectionStack}>
          <AppCard bodyClassName={uiSpacing.cardPadding}>
            <AppSectionHeader title="Base documents (PDF)" />
            <div className="mt-4">
              <AppFileUpload
                mode="multiple"
                accept=".pdf,application/pdf"
                label=""
                value={[]}
                onChange={() => undefined}
                disabled={uploading}
                onFilesSelected={(files) => processPdfFiles(files)}
                helperText={
                  uploading
                    ? 'Uploading…'
                    : 'Drag-and-drop your document here or choose files from your computer.'
                }
              />
            </div>
          </AppCard>

          {baseDocs.length === 0 ? (
            <AppEmptyState title="No base documents yet." description="Upload PDFs above." />
          ) : (
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-10">
              {baseDocs.map((d) => (
                <div
                  key={d.id}
                  className={uiCx(
                    'group relative flex min-h-[132px] min-w-0 flex-col px-2 py-4 pt-3 transition-all duration-200 ease-out hover:-translate-y-0.5',
                    uiRadius.card,
                    'border border-gray-200 bg-white hover:border-gray-300',
                  )}
                >
                  <div className="absolute right-1 top-1 z-50 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <AppTooltip content="Document actions">
                      <AppButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-auto min-h-0 p-1"
                        aria-haspopup="menu"
                        aria-expanded={docMenuOpenId === d.id}
                        aria-label="Document actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          const btn = e.currentTarget as HTMLButtonElement;
                          if (docMenuOpenId === d.id) {
                            setDocMenuOpenId(null);
                            setDocMenuAnchor(null);
                          } else {
                            docMenuButtonRef.current = btn;
                            const rect = btn.getBoundingClientRect();
                            setDocMenuAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            setDocMenuOpenId(d.id);
                          }
                        }}
                      >
                        <Settings className="h-3.5 w-3.5" aria-hidden />
                      </AppButton>
                    </AppTooltip>
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !uploading && void openBaseDocPreview(d.id, d.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!uploading) void openBaseDocPreview(d.id, d.name);
                      }
                    }}
                    className="flex min-h-0 flex-1 cursor-pointer flex-col items-stretch gap-1.5 rounded-lg text-center outline-none"
                  >
                    <div className={uiCx('w-full overflow-hidden bg-white', uiRadius.control)}>
                      <BaseDocPageThumb docId={d.id} w={280} />
                    </div>
                    <div className={uiCx(uiTypography.controlLabel, 'line-clamp-2 w-full px-0.5 pt-0.5 font-semibold text-gray-900')}>
                      {d.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AppFormModal
        open={!!prefsDoc}
        onClose={() => setPrefsDoc(null)}
        title="Document preferences"
        description={
          prefsDoc ? (
            <>
              <span className="block truncate" title={prefsDoc.name}>
                {prefsDoc.name}
              </span>
              <span className="block">Applied when a new user completes the profile onboarding steps.</span>
            </>
          ) : null
        }
        formWidth="wide"
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        quickInfo={onboardingDocPreferencesQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setPrefsDoc(null)}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={pfSaving}
              disabled={pfSaving}
              onClick={() => void saveDocPreferences()}
            >
              Save
            </AppButton>
          </div>
        }
      >
        {prefsDoc ? (
          <div className={uiSpacing.sectionStack}>
            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader title="Assignment" />
              <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                <div>
                  <AppControlLabelRow
                    label="Send to"
                    fieldHint={
                      <AppFieldHint hint="Send to\n\nEmployee = the new hire receives this document. Specific users = selected users each get a copy to sign with context about the new hire. After signing, the PDF is always saved in the new hire's HR documents folder (including when a specific user signs)." />
                    }
                  />
                  <fieldset className={uiCx('mt-2', uiSpacing.sectionStack)}>
                    <legend className="sr-only">Send to</legend>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfAssignee"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfAssigneeType === 'employee'}
                        onChange={() => {
                          setPfAssigneeType('employee');
                          setPfAssigneeUserIds(new Set());
                        }}
                      />
                      Employee (new hire)
                    </label>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfAssignee"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfAssigneeType === 'user'}
                        onChange={() => setPfAssigneeType('user')}
                      />
                      Specific users
                    </label>
                  </fieldset>
                  {pfAssigneeType === 'user' ? (
                    <div className={uiCx('relative z-[1] mt-3', uiSpacing.sectionStack)}>
                      <AppUserSelect
                        mode="multiple"
                        label="Choose signers"
                        users={userPickerUsers}
                        value={Array.from(pfAssigneeUserIds)}
                        onChange={(ids) => setPfAssigneeUserIds(new Set(ids))}
                        disabled={usersPickerLoading || userPickerList.length === 0}
                        placeholder="Search users to add…"
                        fieldHint="Choose signers\n\nSearch and select one or more users. Each selected user receives a copy to sign; selections appear as chips below the field."
                      />
                      <p className={uiTypography.helper}>
                        {userPickerList.length} user{userPickerList.length === 1 ? '' : 's'} in directory
                      </p>
                      {usersPickerLoading ? <p className={uiTypography.helper}>Loading users…</p> : null}
                      {!usersPickerLoading && userPickerList.length === 0 ? (
                        <p className="text-xs text-amber-800">No users found.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className={uiCx('grid grid-cols-1 gap-4 border-t border-gray-100 pt-2 sm:grid-cols-2')}>
                  <AppCheckbox
                    label="Required"
                    checked={pfRequired}
                    onChange={setPfRequired}
                    fieldHint="Required\n\nWhen checked, this document must be signed before onboarding can complete (when delivery is enabled)."
                  />
                  <AppCheckbox
                    label="Active"
                    checked={pfEmployeeVisible}
                    onChange={setPfEmployeeVisible}
                    fieldHint="Active\n\nInactive documents are not assigned during onboarding."
                  />
                </div>
              </div>
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader title="Signing and deadlines" />
              <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                <AppInput
                  type="number"
                  min={1}
                  label="Days to sign after available"
                  value={pfSigningDays}
                  onChange={(e) => setPfSigningDays(Math.max(1, +e.target.value || 7))}
                  fieldHint="Days to sign after available\n\nAfter this window with pending required documents, the app may block access until signing is completed."
                />
                <AppCheckbox
                  label="Require e-signature (PDF)"
                  checked={pfReqSig}
                  onChange={setPfReqSig}
                  className="border-t border-gray-100 pt-1"
                  fieldHint="Require e-signature (PDF)\n\nWhen enabled, the signer must apply an e-signature on the PDF."
                />
              </div>
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader title="Availability and notifications" />
              <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                <div>
                  <AppControlLabelRow
                    label="Available for signature"
                    fieldHint={
                      <AppFieldHint hint="Available for signature\n\nControls when the document is assigned: manual only (use Resend), on the hire date, or a custom offset before or after the hire date." />
                    }
                  />
                  <fieldset className={uiCx('mt-2', uiSpacing.sectionStack)}>
                    <legend className="sr-only">Available for signature</legend>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfDel"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfDelivery === 'none'}
                        onChange={() => setPfDelivery('none')}
                      />
                      Manual only (use Resend)
                    </label>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfDel"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfDelivery === 'on_hire'}
                        onChange={() => setPfDelivery('on_hire')}
                      />
                      On hire date
                    </label>
                    <label className={uiCx('flex cursor-pointer items-center gap-2', uiTypography.body)}>
                      <input
                        type="radio"
                        name="pfDel"
                        className="text-brand-red focus:ring-brand-red"
                        checked={pfDelivery === 'custom'}
                        onChange={() => setPfDelivery('custom')}
                      />
                      Custom relative to hire date
                    </label>
                  </fieldset>
                  {pfDelivery === 'custom' ? (
                    <div className={uiCx('mt-3 flex flex-wrap items-end gap-2 pl-1')}>
                      <AppInput
                        type="number"
                        min={1}
                        label="Amount"
                        value={pfAmt}
                        onChange={(e) => setPfAmt(+e.target.value || 1)}
                        className="w-20"
                        fieldHint="Amount\n\nNumber of days, weeks, or months relative to the hire date."
                      />
                      <AppSelect
                        label="Unit"
                        value={pfUnit}
                        onChange={(e) => setPfUnit(e.target.value as 'days' | 'weeks' | 'months')}
                        options={[
                          { value: 'days', label: 'Days' },
                          { value: 'weeks', label: 'Weeks' },
                          { value: 'months', label: 'Months' },
                        ]}
                        triggerClassName="min-w-[7rem]"
                        fieldHint="Unit\n\nTime unit for the custom offset from the hire date."
                      />
                      <AppSelect
                        label="Direction"
                        value={pfDir}
                        onChange={(e) => setPfDir(e.target.value as 'before' | 'after')}
                        options={[
                          { value: 'after', label: 'after' },
                          { value: 'before', label: 'before' },
                        ]}
                        triggerClassName="min-w-[6rem]"
                        fieldHint="Direction\n\nWhether the offset is before or after the hire date."
                      />
                      <span className={uiCx(uiTypography.body, 'pb-2')}>hire date</span>
                    </div>
                  ) : null}
                </div>
                <AppSelect
                  label="When to notify"
                  value={pfNotifTiming}
                  onChange={(e) => setPfNotifTiming(e.target.value)}
                  options={NOTIFICATION_PRESETS}
                  fieldHint="When to notify\n\nControls when a notification may be sent after the document becomes available."
                />
              </div>
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader title="Display and messaging" />
              <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
                <AppInput
                  label="Display name"
                  value={pfDisplayName}
                  onChange={(e) => setPfDisplayName(e.target.value)}
                  placeholder={prefsDoc.name}
                  fieldHint="Display name\n\nOptional label shown to the employee instead of the uploaded file name."
                />
                <AppTextarea
                  label="Message (notifications)"
                  value={pfMessage}
                  onChange={(e) => setPfMessage(e.target.value)}
                  placeholder="Shown when notifications are enabled"
                  rows={4}
                  fieldHint="Message (notifications)\n\nOptional text included when notifications are sent for this document."
                />
              </div>
            </AppCard>
          </div>
        ) : null}
      </AppFormModal>

      {tab === 'monitor' && (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Assignments"
            description="Users with onboarding assignments"
            action={
              <AppButton type="button" size="sm" onClick={() => setResendModalOpen(true)}>
                Resend
              </AppButton>
            }
          />
          <div className="mt-4">
            <AppTable
              columns={['User', 'Package', 'Pending', 'Assigned', 'Actions']}
              rows={assignmentTableRows}
              emptyState="No assignments yet."
              className="border-0 shadow-none [&_td:last-child]:text-right"
            />
          </div>
        </AppCard>
      )}

      <AppFormModal
        open={resendModalOpen}
        onClose={() => setResendModalOpen(false)}
        title="Resend document(s)"
        description="Choose one or more base documents and users. Each document is sent to each selected user."
        footer={
          <>
            <AppButton type="button" variant="secondary" onClick={() => setResendModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              onClick={async () => {
                const userIds = Array.from(resendSelectedIds);
                const docIds = Array.from(resendDocIds);
                if (docIds.length === 0 || userIds.length === 0) {
                  toast.error('Select at least one document and one user');
                  return;
                }
                try {
                  let created = 0;
                  for (const docId of docIds) {
                    const r = await api<{ created: number }>('POST', `/onboarding/base-documents/${docId}/resend`, {
                      user_ids: userIds,
                    });
                    created += r.created;
                  }
                  toast.success(`Created ${created} pending item(s)`);
                  setResendSelectedIds(new Set());
                  setResendDocIds(new Set());
                  qc.invalidateQueries({ queryKey: ['onb-assignments'] });
                  qc.invalidateQueries({ queryKey: ['me-onboarding-docs'] });
                  qc.invalidateQueries({ queryKey: ['me-onboarding-status'] });
                  qc.invalidateQueries({ queryKey: ['notifications-recent'] });
                  qc.invalidateQueries({ queryKey: ['notifications-all'] });
                  qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
                } catch (e: any) {
                  toast.error(e?.message || 'Failed');
                }
              }}
            >
              Resend
            </AppButton>
          </>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppMultiSelect
            searchable
            label="Base document(s)"
            options={docMultiOptions}
            value={Array.from(resendDocIds)}
            onChange={(ids) => setResendDocIds(new Set(ids))}
            disabled={baseDocs.length === 0}
            placeholder="Search document name…"
            helperText="Signing deadline for resend uses each base document's default (7 days), not the per-package setting."
          />
          <AppUserSelect
            mode="multiple"
            label="Users"
            users={userPickerUsers}
            value={Array.from(resendSelectedIds)}
            onChange={(ids) => setResendSelectedIds(new Set(ids))}
            disabled={usersPickerLoading || userPickerList.length === 0}
            placeholder="Search name, username, email…"
          />
          {usersPickerLoading ? <p className={uiTypography.helper}>Loading users…</p> : null}
          {!usersPickerLoading && userPickerList.length === 0 ? (
            <p className="text-xs text-amber-800">No users found.</p>
          ) : null}
        </div>
      </AppFormModal>

      <AppModal
        open={baseDocPreviewLoading && !baseDocPreview}
        onClose={() => undefined}
        title="Loading PDF…"
        size="sm"
        overlayClassName="pointer-events-none"
      >
        <p className={uiTypography.body}>Please wait while the document loads.</p>
      </AppModal>

      <AppModal
        open={!!baseDocPreview}
        onClose={closeBaseDocPreview}
        title={baseDocPreview?.name}
        size="lg"
        dialogClassName="!max-w-[95vw] !h-[95vh]"
        bodyClassName="!p-0 flex min-h-0 flex-1 flex-col"
        bodyFill
        headerActions={
          baseDocPreview ? (
            <AppTooltip content="Open in new tab">
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Open in new tab"
                onClick={() => window.open(baseDocPreview.url, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-4 w-4" />
              </AppButton>
            </AppTooltip>
          ) : null
        }
      >
        {baseDocPreview ? (
          <iframe
            src={baseDocPreview.url}
            className="min-h-[70vh] w-full flex-1 border-0"
            title={baseDocPreview.name}
          />
        ) : null}
      </AppModal>

      {templateDoc && (
        <SignatureTemplateEditor
          docId={templateDoc.id}
          docName={templateDoc.name}
          initialTemplate={
            templateDoc.signature_template as Parameters<typeof SignatureTemplateEditor>[0]['initialTemplate']
          }
          onClose={() => setTemplateDoc(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ['onb-base-docs'] });
            toast.success('Signature template saved');
          }}
        />
      )}
    </div>
  );
}
