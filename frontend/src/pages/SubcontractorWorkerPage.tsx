import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import SubcontractorWorkerTimesheetBlock from '@/components/SubcontractorWorkerTimesheetBlock';
import UserReports from '@/components/UserReports';
import LoadingOverlay from '@/components/LoadingOverlay';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { formatAddressDisplay } from '@/lib/addressUtils';
import { formatDecimalHoursAsHMin } from '@/lib/dateUtils';
import { SubcontractorWorkerFilesTabEnhanced } from '@/pages/SubcontractorWorkerFilesTabEnhanced';
import type { ClientFileForFiles } from '@/pages/SubcontractorCompanyFilesTabEnhanced';
import ImagePicker from '@/components/ImagePicker';
import OverlayPortal from '@/components/OverlayPortal';
import { EmployeeTrainingSection } from './UserInfo';

type WorkerBundle = {
  worker: {
    id: string;
    name: string;
    first_name?: string | null;
    last_name?: string | null;
    middle_name?: string | null;
    preferred_name?: string | null;
    gender?: string | null;
    phone?: string;
    email?: string;
    photo_file_id?: string | null;
    is_active: boolean;
    notes?: string;
    qr_token?: string;
    company_id: string;
    job_title?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    province?: string | null;
    postal_code?: string | null;
    country?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null;
    emergency_contact_phone?: string | null;
    emergency_contact_home_phone?: string | null;
    emergency_contact_work_phone?: string | null;
    emergency_contact_email?: string | null;
    emergency_contact_address?: string | null;
    created_at?: string | null;
  };
  company: { id: string; name: string; is_active: boolean } | null;
  open_attendance: { id: string; project_id: string; project_name?: string | null; clock_in_time?: string | null } | null;
};

const WORKER_GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'] as const;

function workerDisplayHeroName(w: WorkerBundle['worker']): string {
  const pref = (w.preferred_name || '').trim();
  if (pref) return pref;
  const parts = [(w.first_name || '').trim(), (w.middle_name || '').trim(), (w.last_name || '').trim()].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return (w.name || '').trim() || '—';
}

function composeWorkerNameFromWf(wf: {
  name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  preferred_name: string;
}): string {
  const pref = wf.preferred_name.trim();
  if (pref) return pref;
  const parts = [wf.first_name.trim(), wf.middle_name.trim(), wf.last_name.trim()].filter(Boolean);
  if (parts.length) return parts.join(' ');
  const n = wf.name.trim();
  return n || 'Worker';
}

/** North American phone mask: (000) 000 - 0000 */
function formatWorkerPhone(v: string): string {
  const d = String(v || '')
    .replace(/\D+/g, '')
    .slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)} - ${d.slice(6)}`;
}

function displayWorkerPhone(phone: string | undefined | null): string {
  if (!phone?.trim()) return '';
  return formatWorkerPhone(phone);
}

const MKHUB_LOGO_LIGHT = '/ui/assets/login/logo-light.svg';

async function waitForImages(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve, reject) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load badge image'));
        }),
    ),
  );
}

/** Capture the on-screen badge card so PNG matches the modal exactly. */
async function captureQrBadgePng(el: HTMLElement): Promise<string> {
  await waitForImages(el);
  return toPng(el, { cacheBust: true, pixelRatio: 2 });
}

/** Print PNG without window.open (avoids popup blockers). */
function printPngDataUrl(pngDataUrl: string, docTitle: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument ?? win?.document;
  if (!doc || !win) {
    iframe.remove();
    throw new Error('Print frame unavailable');
  }

  const safeTitle = docTitle.replace(/[<>&]/g, '');
  doc.open();
  doc.write(
    `<!DOCTYPE html><html><head><title>${safeTitle}</title><style>
      @page { size: auto; margin: 8mm; }
      html, body { margin: 0; padding: 0; height: auto; }
      body {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 4mm 0;
        background: #fff;
      }
      img {
        display: block;
        width: 68mm;
        max-width: calc(100% - 4mm);
        height: auto;
        max-height: 99mm;
        object-fit: contain;
        page-break-inside: avoid;
      }
    </style></head><body><img id="print-img" src="${pngDataUrl}" alt="QR badge" /></body></html>`,
  );
  doc.close();

  const cleanup = () => {
    win.removeEventListener('afterprint', cleanup);
    iframe.remove();
  };
  win.addEventListener('afterprint', cleanup);

  const runPrint = () => {
    win.focus();
    win.print();
  };

  const img = doc.getElementById('print-img') as HTMLImageElement | null;
  if (img?.complete) {
    runPrint();
  } else {
    img?.addEventListener('load', runPrint, { once: true });
    img?.addEventListener(
      'error',
      () => {
        cleanup();
        throw new Error('Failed to load print image');
      },
      { once: true },
    );
  }
}

const WorkerQrBadgeCard = forwardRef<
  HTMLDivElement,
  {
    workerName: string;
    companyName: string;
    phone: string;
    qrDataUrl: string;
    variant?: 'preview' | 'full';
    className?: string;
  }
>(function WorkerQrBadgeCard(
  { workerName, companyName, phone, qrDataUrl, variant = 'full', className = '' },
  ref,
) {
  const isPreview = variant === 'preview';
  return (
    <div ref={ref} className={`relative overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5 ${className}`}>
      <div className="relative bg-gradient-to-br from-brand-red via-[#e01e1e] to-[#b91c1c] px-4 py-3.5 flex items-start justify-between gap-3">
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -left-4 bottom-0 h-16 w-16 rounded-full bg-white/5" />
        <div className="min-w-0">
          <p className={`font-semibold text-white ${isPreview ? 'text-[10px]' : 'text-xs'}`}>Site clock-in badge</p>
          <p className={`text-white/70 ${isPreview ? 'text-[9px]' : 'text-[10px]'}`}>Subcontractor worker</p>
        </div>
        <img
          src={MKHUB_LOGO_LIGHT}
          alt="MK Hub"
          className={`shrink-0 object-contain object-right ${isPreview ? 'h-5 max-w-[72px]' : 'h-7 max-w-[100px]'}`}
        />
      </div>
      <div className={`bg-white text-center ${isPreview ? 'px-3 pb-3 pt-4' : 'px-6 pb-6 pt-5'}`}>
        <div
          className={`mx-auto w-fit rounded-xl border-2 border-gray-100 bg-white shadow-inner ${
            isPreview ? 'p-1.5' : 'p-3'
          }`}
        >
          <img
            src={qrDataUrl}
            alt="Worker clock-in QR code"
            className={`object-contain ${isPreview ? 'h-[88px] w-[88px]' : 'h-[200px] w-[200px]'}`}
          />
        </div>
        <div className={`space-y-0.5 ${isPreview ? 'mt-2.5' : 'mt-4'}`}>
          <p className={`font-bold text-gray-900 leading-tight ${isPreview ? 'text-xs' : 'text-lg'}`}>{workerName}</p>
          {companyName ? (
            <p className={`text-gray-600 ${isPreview ? 'text-[10px]' : 'text-sm'}`}>{companyName}</p>
          ) : null}
          {phone ? (
            <p className={`font-medium text-gray-500 tabular-nums ${isPreview ? 'text-[10px]' : 'text-sm'}`}>{phone}</p>
          ) : null}
        </div>
        {!isPreview ? (
          <p className="mt-4 text-[11px] text-gray-400">Scan to clock in or out on site</p>
        ) : null}
      </div>
    </div>
  );
});

type WorkerSubTab = 'personal' | 'job' | 'docs' | 'timesheet' | 'training' | 'reports' | 'activity';

/** Which Personal-tab card is in edit mode (only one at a time). */
type PersonalEditSection = 'basic' | 'contact' | 'address' | 'emergency' | 'notes';

const WORKER_VALID_TABS = new Set<string>(['personal', 'job', 'docs', 'timesheet', 'training', 'reports', 'activity']);

function workerTabFromSearchParams(sp: URLSearchParams): WorkerSubTab {
  const raw = (sp.get('tab') || 'personal').trim().toLowerCase();
  if (WORKER_VALID_TABS.has(raw)) return raw as WorkerSubTab;
  return 'personal';
}

type ActivityFeedItem = {
  type: string;
  at: string;
  title: string;
  subtitle?: string | null;
  project_id?: string;
  attendance_id?: string;
  total_hours?: number | null;
  worker_file_id?: string;
  file_object_id?: string;
  by_user_id?: string | null;
  by_username?: string | null;
  audit_id?: string;
  audit_action?: string;
  detail_lines?: string[];
};

const WORKER_PHOTO_PLACEHOLDER = '/ui/assets/placeholders/user.png';

/** Same pencil glyph as `PersonalPencil` (Basic Information edit). */
function PersonalPencilSvg({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="text-xs font-semibold text-gray-900 mt-0.5 break-words">{children}</div>
    </div>
  );
}

type PersonalTone = 'blue' | 'green' | 'yellow' | 'orange' | 'slate' | 'red' | 'purple' | 'indigo';

const PERSONAL_TONE: Record<PersonalTone, { iconBg: string; title: string }> = {
  blue: { iconBg: 'bg-blue-100', title: 'text-blue-900' },
  green: { iconBg: 'bg-green-100', title: 'text-green-900' },
  yellow: { iconBg: 'bg-yellow-100', title: 'text-yellow-900' },
  orange: { iconBg: 'bg-orange-100', title: 'text-orange-900' },
  slate: { iconBg: 'bg-slate-100', title: 'text-slate-900' },
  red: { iconBg: 'bg-red-100', title: 'text-red-900' },
  purple: { iconBg: 'bg-purple-100', title: 'text-purple-900' },
  indigo: { iconBg: 'bg-indigo-100', title: 'text-indigo-900' },
};

function PersonalPencil({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors" title={title}>
      <PersonalPencilSvg className="w-4 h-4" />
    </button>
  );
}

/** Read-only field row — matches UserInfo `EditableGrid` display (label + value). */
function StaticWorkerField({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty =
    value === '' ||
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '');
  return (
    <div>
      <div className="text-xs font-medium text-gray-600 mb-1.5">{label}</div>
      <div className="text-sm font-semibold text-gray-900 break-words whitespace-pre-wrap">{isEmpty ? '—' : value}</div>
    </div>
  );
}

/** Section shell — matches UserInfo `BasicInformationSection` / `AddressSectionCard` cards. */
function PersonalUserSection({
  tone,
  icon,
  heading,
  children,
  showPencil,
  onEditClick,
}: {
  tone: PersonalTone;
  icon: ReactNode;
  heading: string;
  children: ReactNode;
  showPencil?: boolean;
  onEditClick?: () => void;
}) {
  const t = PERSONAL_TONE[tone];
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded ${t.iconBg} flex items-center justify-center`}>{icon}</div>
          <h5 className={`text-sm font-semibold ${t.title}`}>{heading}</h5>
        </div>
        {showPencil && onEditClick && <PersonalPencil title={`Edit ${heading}`} onClick={onEditClick} />}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

const userInputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400';

export default function SubcontractorWorkerPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(() => workerTabFromSearchParams(searchParams), [searchParams]);

  const setTab = (next: WorkerSubTab) => {
    const n = new URLSearchParams(searchParams);
    n.set('tab', next);
    setSearchParams(n, { replace: true });
  };

  const qc = useQueryClient();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrCardExporting, setQrCardExporting] = useState(false);
  const qrCardPngCacheRef = useRef<string | null>(null);
  const qrBadgeExportRef = useRef<HTMLDivElement>(null);
  const [personalEditSection, setPersonalEditSection] = useState<PersonalEditSection | null>(null);
  const [editingJob, setEditingJob] = useState(false);
  const [isEmployeeCardMinimized, setIsEmployeeCardMinimized] = useState(false);
  const [workerPhotoPickerOpen, setWorkerPhotoPickerOpen] = useState(false);
  const [workerStatusModalOpen, setWorkerStatusModalOpen] = useState(false);
  const [workerStatusDraft, setWorkerStatusDraft] = useState(true);
  const [wf, setWf] = useState({
    name: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    preferred_name: '',
    gender: '',
    phone: '',
    email: '',
    notes: '',
    is_active: true,
    job_title: '',
    address_line1: '',
    address_line2: '',
    city: '',
    province: '',
    postal_code: '',
    country: '',
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
    emergency_contact_home_phone: '',
    emergency_contact_work_phone: '',
    emergency_contact_email: '',
    emergency_contact_address: '',
  });

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const hasEditPermission =
    (me?.roles || []).includes('admin') || (me?.permissions || []).includes('business:customers:write');

  const canViewTraining = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return (
      perms.includes('business:customers:read') ||
      perms.includes('business:construction:projects:read') ||
      perms.includes('business:rm:projects:read') ||
      perms.includes('hr:attendance:read') ||
      perms.includes('hr:attendance:write') ||
      perms.includes('hr:users:view:general') ||
      perms.includes('users:read')
    );
  }, [me]);

  const canEditTraining = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return hasEditPermission || perms.includes('users:write') || perms.includes('hr:users:edit:general');
  }, [me, hasEditPermission]);

  const canViewReports = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:general') || perms.includes('users:read');
  }, [me]);

  const canEditReports = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return hasEditPermission || perms.includes('hr:users:write') || perms.includes('users:write');
  }, [me, hasEditPermission]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subcontractor-worker', id],
    queryFn: () => api<WorkerBundle>('GET', `/subcontractors/workers/${id}`),
    enabled: !!id,
  });

  const { data: workerFiles, refetch: refetchWorkerFiles } = useQuery({
    queryKey: ['subcontractor-worker-files', id],
    queryFn: () => api<ClientFileForFiles[]>('GET', `/subcontractors/workers/${id}/files`),
    enabled: !!id,
  });

  const { data: activityFeed } = useQuery({
    queryKey: ['subcontractor-worker-activity', id],
    queryFn: () => api<ActivityFeedItem[]>('GET', `/subcontractors/workers/${id}/activity-feed`),
    enabled: !!id && activeTab === 'activity',
  });

  const scanUrl = useMemo(() => {
    if (!data?.worker?.qr_token) return '';
    return `${window.location.origin}/business/subcontractors/scan?t=${data.worker.qr_token}`;
  }, [data?.worker?.qr_token]);

  useEffect(() => {
    if (!scanUrl) return;
    let cancelled = false;
    QRCode.toDataURL(scanUrl, { width: 280, margin: 2, errorCorrectionLevel: 'M' }).then((u) => {
      if (!cancelled) setQrDataUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [scanUrl]);

  useEffect(() => {
    if (data?.worker) {
      const w = data.worker;
      setWf({
        name: w.name,
        first_name: w.first_name || '',
        middle_name: w.middle_name || '',
        last_name: w.last_name || '',
        preferred_name: w.preferred_name || '',
        gender: w.gender || '',
        phone: formatWorkerPhone(w.phone || ''),
        email: w.email || '',
        notes: w.notes || '',
        is_active: w.is_active,
        job_title: w.job_title || '',
        address_line1: w.address_line1 || '',
        address_line2: w.address_line2 || '',
        city: w.city || '',
        province: w.province || '',
        postal_code: w.postal_code || '',
        country: w.country || '',
        emergency_contact_name: w.emergency_contact_name || '',
        emergency_contact_relationship: w.emergency_contact_relationship || '',
        emergency_contact_phone: formatWorkerPhone(w.emergency_contact_phone || ''),
        emergency_contact_home_phone: formatWorkerPhone(w.emergency_contact_home_phone || ''),
        emergency_contact_work_phone: formatWorkerPhone(w.emergency_contact_work_phone || ''),
        emergency_contact_email: w.emergency_contact_email || '',
        emergency_contact_address: w.emergency_contact_address || '',
      });
    }
  }, [data?.worker]);

  const patchWorker = useMutation({
    mutationFn: () =>
      api('PATCH', `/subcontractors/workers/${id}`, {
        name: composeWorkerNameFromWf(wf).trim() || undefined,
        first_name: wf.first_name.trim() || undefined,
        middle_name: wf.middle_name.trim() || undefined,
        last_name: wf.last_name.trim() || undefined,
        preferred_name: wf.preferred_name.trim() || undefined,
        gender: wf.gender.trim() || undefined,
        phone: wf.phone || undefined,
        email: wf.email || undefined,
        notes: wf.notes || undefined,
        is_active: wf.is_active,
        job_title: wf.job_title.trim() || undefined,
        address_line1: wf.address_line1 || undefined,
        address_line2: wf.address_line2 || undefined,
        city: wf.city || undefined,
        province: wf.province || undefined,
        postal_code: wf.postal_code || undefined,
        country: wf.country || undefined,
        emergency_contact_name: wf.emergency_contact_name.trim() || undefined,
        emergency_contact_relationship: wf.emergency_contact_relationship.trim() || undefined,
        emergency_contact_phone: wf.emergency_contact_phone.trim() || undefined,
        emergency_contact_home_phone: wf.emergency_contact_home_phone.trim() || undefined,
        emergency_contact_work_phone: wf.emergency_contact_work_phone.trim() || undefined,
        emergency_contact_email: wf.emergency_contact_email.trim() || undefined,
        emergency_contact_address: wf.emergency_contact_address.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Worker updated');
      qc.invalidateQueries({ queryKey: ['subcontractor-worker', id] });
      qc.invalidateQueries({ queryKey: ['subcontractor-workers'] });
      qc.invalidateQueries({ queryKey: ['subcontractor-worker-activity', id] });
      setPersonalEditSection(null);
      setEditingJob(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchWorkerStatusMut = useMutation({
    mutationFn: (is_active: boolean) => api('PATCH', `/subcontractors/workers/${id}`, { is_active }),
    onSuccess: (_, is_active) => {
      toast.success(is_active ? 'Worker activated' : 'Worker deactivated');
      setWorkerStatusModalOpen(false);
      qc.invalidateQueries({ queryKey: ['subcontractor-worker', id] });
      qc.invalidateQueries({ queryKey: ['subcontractor-workers'] });
      qc.invalidateQueries({ queryKey: ['subcontractor-worker-activity', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openWorkerStatusModal = () => {
    setWorkerStatusDraft(!!data?.worker?.is_active);
    setWorkerStatusModalOpen(true);
  };

  const saveWorkerStatusFromModal = () => {
    if (!data?.worker || !id) return;
    const current = !!data.worker.is_active;
    if (workerStatusDraft === current) {
      setWorkerStatusModalOpen(false);
      return;
    }
    patchWorkerStatusMut.mutate(workerStatusDraft);
  };

  const qrCardInfo = useMemo(() => {
    if (!data?.worker) return null;
    return {
      workerName: workerDisplayHeroName(data.worker),
      companyName: data.company?.name || '',
      phone: displayWorkerPhone(data.worker.phone),
    };
  }, [data?.worker, data?.company?.name]);

  useEffect(() => {
    qrCardPngCacheRef.current = null;
  }, [qrDataUrl, qrCardInfo]);

  useEffect(() => {
    if (!qrModalOpen || !qrDataUrl || !qrCardInfo) {
      if (!qrModalOpen) qrCardPngCacheRef.current = null;
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const el = qrBadgeExportRef.current;
      if (!el || cancelled) return;
      captureQrBadgePng(el)
        .then((png) => {
          if (!cancelled) qrCardPngCacheRef.current = png;
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [qrModalOpen, qrDataUrl, qrCardInfo]);

  const getQrCardPng = useCallback(async (): Promise<string> => {
    if (!qrDataUrl || !qrCardInfo) throw new Error('QR not ready');
    if (qrCardPngCacheRef.current) return qrCardPngCacheRef.current;
    const el = qrBadgeExportRef.current;
    if (!el) throw new Error('QR badge not visible');
    const png = await captureQrBadgePng(el);
    qrCardPngCacheRef.current = png;
    return png;
  }, [qrDataUrl, qrCardInfo]);

  const downloadQrCard = useCallback(async () => {
    if (!qrDataUrl || !qrCardInfo) return;
    const el = qrBadgeExportRef.current;
    if (!el) {
      toast.error('Open the QR badge modal to download');
      return;
    }
    setQrCardExporting(true);
    try {
      const png = await captureQrBadgePng(el);
      qrCardPngCacheRef.current = png;
      const a = document.createElement('a');
      a.href = png;
      a.download = `clock-in-qr-${qrCardInfo.workerName.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error('Could not export QR badge');
    } finally {
      setQrCardExporting(false);
    }
  }, [qrDataUrl, qrCardInfo]);

  const printQrCard = useCallback(() => {
    if (!qrDataUrl || !qrCardInfo) return;
    const cached = qrCardPngCacheRef.current;
    if (cached) {
      try {
        printPngDataUrl(cached, `Print QR — ${qrCardInfo.workerName}`);
      } catch {
        toast.error('Could not print QR badge');
      }
      return;
    }
    setQrCardExporting(true);
    getQrCardPng()
      .then((png) => printPngDataUrl(png, `Print QR — ${qrCardInfo.workerName}`))
      .catch(() => toast.error('Could not print QR badge'))
      .finally(() => setQrCardExporting(false));
  }, [qrDataUrl, qrCardInfo, getQrCardPng]);

  const resetWfFromWorker = useCallback(() => {
    const w = data?.worker;
    if (!w) return;
    setWf({
      name: w.name,
      first_name: w.first_name || '',
      middle_name: w.middle_name || '',
      last_name: w.last_name || '',
      preferred_name: w.preferred_name || '',
      gender: w.gender || '',
      phone: formatWorkerPhone(w.phone || ''),
      email: w.email || '',
      notes: w.notes || '',
      is_active: w.is_active,
      job_title: w.job_title || '',
      address_line1: w.address_line1 || '',
      address_line2: w.address_line2 || '',
      city: w.city || '',
      province: w.province || '',
      postal_code: w.postal_code || '',
      country: w.country || '',
      emergency_contact_name: w.emergency_contact_name || '',
      emergency_contact_relationship: w.emergency_contact_relationship || '',
      emergency_contact_phone: formatWorkerPhone(w.emergency_contact_phone || ''),
      emergency_contact_home_phone: formatWorkerPhone(w.emergency_contact_home_phone || ''),
      emergency_contact_work_phone: formatWorkerPhone(w.emergency_contact_work_phone || ''),
      emergency_contact_email: w.emergency_contact_email || '',
      emergency_contact_address: w.emergency_contact_address || '',
    });
  }, [data?.worker]);

  const beginPersonalEditSection = useCallback((section: PersonalEditSection) => {
    setEditingJob(false);
    resetWfFromWorker();
    setPersonalEditSection(section);
  }, [resetWfFromWorker]);

  const cancelPersonalEdit = useCallback(() => {
    resetWfFromWorker();
    setPersonalEditSection(null);
  }, [resetWfFromWorker]);

  const beginJobEdit = useCallback(() => {
    setPersonalEditSection(null);
    resetWfFromWorker();
    setEditingJob(true);
  }, [resetWfFromWorker]);

  const cancelJobEdit = useCallback(() => {
    resetWfFromWorker();
    setEditingJob(false);
  }, [resetWfFromWorker]);

  const uploadWorkerPhotoBlob = async (blob: Blob) => {
    const fd = new FormData();
    fd.append('file', blob, 'worker-photo.jpg');
    fd.append('original_name', 'worker-photo.jpg');
    fd.append('content_type', blob.type || 'image/jpeg');
    fd.append('project_id', '');
    fd.append('client_id', '');
    fd.append('employee_id', '');
    fd.append('category_id', 'files');
    try {
      const res = await api<{ id: string }>('POST', '/files/upload-proxy', fd);
      await api('PATCH', `/subcontractors/workers/${id}`, { photo_file_id: res.id });
      toast.success('Photo updated');
      setWorkerPhotoPickerOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ['subcontractor-worker-files', id] });
      qc.invalidateQueries({ queryKey: ['subcontractor-worker-activity', id] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const thumbSm = useMemo(() => {
    if (!data?.worker?.photo_file_id) return null;
    return withFileAccessTokenIfNeeded(`/files/${data.worker.photo_file_id}/thumbnail?w=80`) || null;
  }, [data?.worker?.photo_file_id]);

  const thumbLg = useMemo(() => {
    if (!data?.worker?.photo_file_id) return null;
    return withFileAccessTokenIfNeeded(`/files/${data.worker.photo_file_id}/thumbnail?w=240`) || null;
  }, [data?.worker?.photo_file_id]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const tabStrip: { key: WorkerSubTab; label: string }[] = useMemo(
    () =>
      [
        { key: 'personal', label: 'Personal' },
        { key: 'job', label: 'Job' },
        { key: 'docs', label: 'Docs' },
        { key: 'timesheet', label: 'Timesheet' },
        ...(canViewTraining ? ([{ key: 'training', label: 'Training' }] as const) : []),
        ...(canViewReports ? ([{ key: 'reports', label: 'Reports' }] as const) : []),
        { key: 'activity', label: 'Activity' },
      ] as { key: WorkerSubTab; label: string }[],
    [canViewTraining, canViewReports],
  );

  useEffect(() => {
    if (activeTab === 'training' && !canViewTraining) setTab('personal');
  }, [activeTab, canViewTraining]);

  useEffect(() => {
    if (activeTab === 'reports' && !canViewReports) setTab('personal');
  }, [activeTab, canViewReports]);

  if (!id) return null;

  const backHref = data?.worker?.company_id
    ? `/business/subcontractors/companies/${data.worker.company_id}`
    : '/business/subcontractors';

  return (
    <div>
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => nav(backHref)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center flex-shrink-0"
              title={data?.worker?.company_id ? 'Back to company' : 'Back to subcontractors'}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h5 className="text-sm font-semibold text-blue-900">Subcontractor worker</h5>
              <p className="text-xs text-gray-600 mt-0.5">
                Personal details, employer, documents, and site attendance — same layout as Users, adapted for third-party workers.
              </p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2 shrink-0">
            {data?.worker?.company_id && (
              <Link
                to={`/business/subcontractors/companies/${data.worker.company_id}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] shadow-sm hover:opacity-95 border border-transparent"
              >
                Open company
              </Link>
            )}
            <div>
              <div className="text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700">{todayLabel}</div>
            </div>
          </div>
        </div>
      </div>

      <LoadingOverlay isLoading={isLoading || !data} text="Loading worker…">
        {data && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-white p-3 relative">
              {isEmployeeCardMinimized ? (
                <div className="flex gap-2 items-center pr-8">
                  <div className="relative flex-shrink-0">
                    <img
                      className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                      src={thumbSm || WORKER_PHOTO_PLACEHOLDER}
                      alt=""
                    />
                    {hasEditPermission && (
                      <button
                        type="button"
                        onClick={() => setWorkerPhotoPickerOpen(true)}
                        className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded p-0.5 text-gray-700 hover:text-brand-red hover:bg-black/10 transition-colors"
                        title="Change photo"
                        aria-label="Change photo"
                      >
                        <PersonalPencilSvg className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{workerDisplayHeroName(data.worker)}</div>
                        <div className="text-[10px] text-gray-600 truncate mt-0.5">{data.company?.name || '—'}</div>
                      </div>
                      <div className="flex-shrink-0">
                        {hasEditPermission ? (
                          <button
                            type="button"
                            disabled={patchWorkerStatusMut.isPending}
                            onClick={openWorkerStatusModal}
                            title="Change worker status"
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-transparent transition-shadow hover:ring-2 hover:ring-offset-1 hover:ring-brand-red/40 disabled:opacity-50 disabled:cursor-not-allowed ${
                              data.worker.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {patchWorkerStatusMut.isPending ? 'Saving…' : data.worker.is_active ? 'Active' : 'Inactive'}
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                              data.worker.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {data.worker.is_active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-start">
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <div className="relative">
                      <img
                        className="w-24 h-24 object-cover rounded-xl border-2 border-gray-200"
                        src={thumbLg || WORKER_PHOTO_PLACEHOLDER}
                        alt=""
                      />
                      {hasEditPermission && (
                        <button
                          type="button"
                          onClick={() => setWorkerPhotoPickerOpen(true)}
                          className="absolute top-0.5 right-0.5 flex items-center justify-center rounded p-1 text-gray-700 hover:text-brand-red hover:bg-black/10 transition-colors"
                          title="Change photo"
                          aria-label="Change photo"
                        >
                          <PersonalPencilSvg className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-col items-center w-full max-w-[9rem]">
                      {hasEditPermission ? (
                        <button
                          type="button"
                          disabled={patchWorkerStatusMut.isPending}
                          onClick={openWorkerStatusModal}
                          title="Change worker status"
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-medium w-full border border-transparent transition-shadow hover:ring-2 hover:ring-offset-1 hover:ring-brand-red/40 disabled:opacity-50 disabled:cursor-not-allowed ${
                            data.worker.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {patchWorkerStatusMut.isPending ? 'Saving…' : data.worker.is_active ? 'Active' : 'Inactive'}
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-medium w-full ${
                            data.worker.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {data.worker.is_active ? 'Active' : 'Inactive'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-2">
                      <h1 className="text-sm font-bold text-gray-900">{workerDisplayHeroName(data.worker)}</h1>
                      <div className="text-xs text-gray-600 mt-0.5">{data.company?.name || '—'}</div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-x-3 gap-y-1.5">
                      <Field label="Phone">{displayWorkerPhone(data.worker.phone) || '—'}</Field>
                      <Field label="Email">{data.worker.email || '—'}</Field>
                      <Field label="Address">
                        {formatAddressDisplay({
                          address_line1: data.worker.address_line1,
                          address_line2: data.worker.address_line2,
                          city: data.worker.city,
                          province: data.worker.province,
                          postal_code: data.worker.postal_code,
                          country: data.worker.country,
                        })}
                      </Field>
                      <Field label="On file since">
                        {data.worker.created_at ? String(data.worker.created_at).slice(0, 10) : '—'}
                      </Field>
                      <Field label="Open attendance">
                        {data.open_attendance
                          ? `${data.open_attendance.project_name || 'Project'} · in`
                          : '—'}
                      </Field>
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsEmployeeCardMinimized(!isEmployeeCardMinimized)}
                className="absolute bottom-2 right-2 p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                title={isEmployeeCardMinimized ? 'Expand' : 'Minimize'}
              >
                <svg
                  className={`w-3 h-3 transition-transform ${isEmployeeCardMinimized ? '' : 'rotate-180'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            <div className="rounded-xl border bg-white p-3">
              <div className="flex flex-wrap gap-2">
                {tabStrip.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      activeTab === t.key
                        ? 'bg-brand-red text-white border-brand-red'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-white">
              <div className="p-5">
            {activeTab === 'personal' && (
              <div className={`space-y-6 ${personalEditSection ? 'relative pb-2' : ''}`}>
                <div className="space-y-6">
                    <PersonalUserSection
                      tone="blue"
                      heading="Basic Information"
                      showPencil={hasEditPermission && personalEditSection !== 'basic'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('basic') : undefined}
                      icon={
                        <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      }
                    >
                      {personalEditSection === 'basic' ? (
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">First name</div>
                          <input
                            className={userInputClass}
                            value={wf.first_name}
                            onChange={(e) => setWf((s) => ({ ...s, first_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Last name</div>
                          <input
                            className={userInputClass}
                            value={wf.last_name}
                            onChange={(e) => setWf((s) => ({ ...s, last_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Middle name</div>
                          <input
                            className={userInputClass}
                            value={wf.middle_name}
                            onChange={(e) => setWf((s) => ({ ...s, middle_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Preferred name</div>
                          <input
                            className={userInputClass}
                            value={wf.preferred_name}
                            onChange={(e) => setWf((s) => ({ ...s, preferred_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Gender</div>
                          <select
                            className={userInputClass}
                            value={wf.gender}
                            onChange={(e) => setWf((s) => ({ ...s, gender: e.target.value }))}
                          >
                            <option value="">—</option>
                            {WORKER_GENDER_OPTIONS.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        <StaticWorkerField label="First name" value={data.worker.first_name || ''} />
                        <StaticWorkerField label="Last name" value={data.worker.last_name || ''} />
                        <StaticWorkerField label="Middle name" value={data.worker.middle_name || ''} />
                        <StaticWorkerField label="Preferred name" value={data.worker.preferred_name || ''} />
                        <StaticWorkerField label="Gender" value={data.worker.gender || ''} />
                      </div>
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="yellow"
                      heading="Contact"
                      showPencil={hasEditPermission && personalEditSection !== 'contact'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('contact') : undefined}
                      icon={
                        <svg className="w-5 h-5 text-yellow-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                          />
                        </svg>
                      }
                    >
                      {personalEditSection === 'contact' ? (
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Email</div>
                          <input
                            className={userInputClass}
                            value={wf.email}
                            onChange={(e) => setWf((s) => ({ ...s, email: e.target.value }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Phone</div>
                          <input
                            className={userInputClass}
                            value={wf.phone}
                            onChange={(e) => setWf((s) => ({ ...s, phone: formatWorkerPhone(e.target.value) }))}
                          />
                        </div>
                      </div>
                      ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        <StaticWorkerField label="Email" value={data.worker.email || ''} />
                        <StaticWorkerField label="Phone" value={displayWorkerPhone(data.worker.phone)} />
                      </div>
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="green"
                      heading="Address"
                      showPencil={hasEditPermission && personalEditSection !== 'address'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('address') : undefined}
                      icon={
                        <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      }
                    >
                      {personalEditSection === 'address' ? (
                      <div className="space-y-4">
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Address line 1</div>
                          <AddressAutocomplete
                            value={wf.address_line1}
                            onChange={(v) => setWf((s) => ({ ...s, address_line1: v }))}
                            onAddressSelect={(a) =>
                              setWf((s) => ({
                                ...s,
                                address_line1: a.address_line1 || '',
                                address_line2: a.address_line2 || '',
                                city: a.city || '',
                                province: a.province || '',
                                postal_code: a.postal_code || '',
                                country: a.country || '',
                              }))
                            }
                            placeholder="Start typing an address…"
                            className={userInputClass}
                          />
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <div className="text-xs font-medium text-gray-600 mb-1.5">Address line 2</div>
                            <input
                              className={userInputClass}
                              value={wf.address_line2}
                              onChange={(e) => setWf((s) => ({ ...s, address_line2: e.target.value }))}
                            />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600 mb-1.5">City</div>
                            <input className={userInputClass} value={wf.city} onChange={(e) => setWf((s) => ({ ...s, city: e.target.value }))} />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600 mb-1.5">Province</div>
                            <input
                              className={userInputClass}
                              value={wf.province}
                              onChange={(e) => setWf((s) => ({ ...s, province: e.target.value }))}
                            />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600 mb-1.5">Postal code</div>
                            <input
                              className={userInputClass}
                              value={wf.postal_code}
                              onChange={(e) => setWf((s) => ({ ...s, postal_code: e.target.value }))}
                            />
                          </div>
                          <div>
                            <div className="text-xs font-medium text-gray-600 mb-1.5">Country</div>
                            <input
                              className={userInputClass}
                              value={wf.country}
                              onChange={(e) => setWf((s) => ({ ...s, country: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>
                      ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        <StaticWorkerField label="Address line 1" value={data.worker.address_line1 || ''} />
                        <StaticWorkerField label="Address line 2" value={data.worker.address_line2 || ''} />
                        <StaticWorkerField label="City" value={data.worker.city || ''} />
                        <StaticWorkerField label="Province" value={data.worker.province || ''} />
                        <StaticWorkerField label="Country" value={data.worker.country || ''} />
                        <StaticWorkerField label="Postal code" value={data.worker.postal_code || ''} />
                      </div>
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="orange"
                      heading="Emergency Contacts"
                      showPencil={hasEditPermission && personalEditSection !== 'emergency'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('emergency') : undefined}
                      icon={
                        <svg className="w-5 h-5 text-orange-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      }
                    >
                      {personalEditSection === 'emergency' ? (
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Name</div>
                          <input
                            className={userInputClass}
                            value={wf.emergency_contact_name}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Relationship</div>
                          <input
                            className={userInputClass}
                            value={wf.emergency_contact_relationship}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_relationship: e.target.value }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Mobile phone</div>
                          <input
                            className={userInputClass}
                            value={wf.emergency_contact_phone}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_phone: formatWorkerPhone(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Home phone</div>
                          <input
                            className={userInputClass}
                            value={wf.emergency_contact_home_phone}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_home_phone: formatWorkerPhone(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Work phone</div>
                          <input
                            className={userInputClass}
                            value={wf.emergency_contact_work_phone}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_work_phone: formatWorkerPhone(e.target.value) }))}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Email</div>
                          <input
                            type="email"
                            className={userInputClass}
                            value={wf.emergency_contact_email}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_email: e.target.value }))}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Address</div>
                          <textarea
                            className={`${userInputClass} min-h-[72px]`}
                            rows={3}
                            value={wf.emergency_contact_address}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_address: e.target.value }))}
                          />
                        </div>
                      </div>
                      ) : (
                      <>
                      {data.worker.emergency_contact_name ||
                      data.worker.emergency_contact_phone ||
                      data.worker.emergency_contact_home_phone ||
                      data.worker.emergency_contact_work_phone ||
                      data.worker.emergency_contact_email ||
                      data.worker.emergency_contact_address ||
                      data.worker.emergency_contact_relationship ? (
                        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex max-w-2xl">
                          <div className="w-24 sm:w-28 bg-gray-100 flex items-center justify-center shrink-0">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded bg-gray-200 grid place-items-center text-base sm:text-lg font-bold text-gray-600">
                              {(data.worker.emergency_contact_name || '?').slice(0, 2).toUpperCase()}
                            </div>
                          </div>
                          <div className="flex-1 p-3 text-sm min-w-0">
                            <div className="font-semibold text-gray-900">{data.worker.emergency_contact_name || '—'}</div>
                            {data.worker.emergency_contact_relationship && (
                              <div className="text-gray-600 text-xs mt-1">{data.worker.emergency_contact_relationship}</div>
                            )}
                            <div className="mt-2 space-y-1">
                              {data.worker.emergency_contact_phone && (
                                <div>
                                  <div className="text-[11px] uppercase text-gray-500">Mobile</div>
                                  <div className="text-gray-700">{displayWorkerPhone(data.worker.emergency_contact_phone)}</div>
                                </div>
                              )}
                              {data.worker.emergency_contact_home_phone && (
                                <div>
                                  <div className="text-[11px] uppercase text-gray-500">Home</div>
                                  <div className="text-gray-700">{displayWorkerPhone(data.worker.emergency_contact_home_phone)}</div>
                                </div>
                              )}
                              {data.worker.emergency_contact_work_phone && (
                                <div>
                                  <div className="text-[11px] uppercase text-gray-500">Work</div>
                                  <div className="text-gray-700">{displayWorkerPhone(data.worker.emergency_contact_work_phone)}</div>
                                </div>
                              )}
                              {data.worker.emergency_contact_email && (
                                <div>
                                  <div className="text-[11px] uppercase text-gray-500">Email</div>
                                  <div className="text-gray-700 break-all">{data.worker.emergency_contact_email}</div>
                                </div>
                              )}
                              {data.worker.emergency_contact_address && (
                                <div>
                                  <div className="text-[11px] uppercase text-gray-500">Address</div>
                                  <div className="text-gray-700 whitespace-pre-wrap">{data.worker.emergency_contact_address}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">No emergency contact on file.</p>
                      )}
                      </>
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="slate"
                      heading="Notes"
                      showPencil={hasEditPermission && personalEditSection !== 'notes'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('notes') : undefined}
                      icon={
                        <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      }
                    >
                      {personalEditSection === 'notes' ? (
                      <div>
                        <div className="text-xs font-medium text-gray-600 mb-1.5">Internal notes</div>
                        <textarea
                          className={`${userInputClass} min-h-[100px]`}
                          rows={4}
                          value={wf.notes}
                          onChange={(e) => setWf((s) => ({ ...s, notes: e.target.value }))}
                        />
                      </div>
                      ) : (
                      <StaticWorkerField label="Internal notes" value={data.worker.notes || ''} />
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="red"
                      heading="Clock-in QR"
                      icon={
                        <svg className="w-5 h-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                          />
                        </svg>
                      }
                    >
                      <p className="text-xs text-gray-600 -mt-1 mb-3">
                        Site QR for this worker (same role as kiosk access on Users — opens the subcontractor scan flow for clock-in/out).
                      </p>
                      {qrDataUrl && qrCardInfo ? (
                        <button
                          type="button"
                          onClick={() => setQrModalOpen(true)}
                          className="group text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-[0.99]"
                          title="View QR badge"
                        >
                          <WorkerQrBadgeCard
                            variant="preview"
                            workerName={qrCardInfo.workerName}
                            companyName={qrCardInfo.companyName}
                            phone={qrCardInfo.phone}
                            qrDataUrl={qrDataUrl}
                            className="w-[168px] cursor-pointer group-hover:shadow-xl transition-shadow"
                          />
                        </button>
                      ) : null}
                    </PersonalUserSection>

                    {personalEditSection && (
                    <div className="sticky bottom-0 z-10 -mx-5 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50"
                        onClick={cancelPersonalEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] shadow-sm hover:opacity-95 disabled:opacity-50"
                        disabled={patchWorker.isPending}
                        onClick={() => patchWorker.mutate()}
                      >
                        Save changes
                      </button>
                    </div>
                    )}
                  </div>
              </div>
            )}

            {activeTab === 'job' && (
              <div className={`space-y-6 ${editingJob ? 'relative pb-2' : ''}`}>
                {!hasEditPermission || !editingJob ? (
                  <PersonalUserSection
                    tone="purple"
                    heading="Organization"
                    showPencil={hasEditPermission}
                    onEditClick={beginJobEdit}
                    icon={
                      <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                    }
                  >
                    <div className="grid md:grid-cols-2 gap-4">
                      <StaticWorkerField label="Job title" value={data.worker.job_title || ''} />
                      <StaticWorkerField
                        label="Employer"
                        value={
                          data.worker.company_id && data.company?.name ? (
                            <Link
                              to={`/business/subcontractors/companies/${data.worker.company_id}`}
                              className="text-brand-red hover:underline font-semibold"
                            >
                              {data.company.name}
                            </Link>
                          ) : (
                            data.company?.name || ''
                          )
                        }
                      />
                    </div>
                    {data.company && !data.company.is_active && (
                      <p className="text-xs font-medium text-amber-700">Company is inactive — clock-in may be restricted.</p>
                    )}
                  </PersonalUserSection>
                ) : (
                  <div className="space-y-6">
                    <PersonalUserSection
                      tone="purple"
                      heading="Organization"
                      icon={
                        <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                        </svg>
                      }
                    >
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Job title</div>
                          <input
                            className={userInputClass}
                            value={wf.job_title}
                            onChange={(e) => setWf((s) => ({ ...s, job_title: e.target.value }))}
                            placeholder="e.g. Site labourer"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-600 mb-1.5">Employer (subcontractor)</div>
                          {data.worker.company_id && data.company?.name ? (
                            <Link
                              to={`/business/subcontractors/companies/${data.worker.company_id}`}
                              className="text-sm font-semibold text-brand-red hover:underline"
                            >
                              {data.company.name}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-gray-900">{data.company?.name || '—'}</span>
                          )}
                          {data.company && !data.company.is_active && (
                            <p className="text-xs font-medium text-amber-700 mt-1.5">Company is inactive — clock-in may be restricted.</p>
                          )}
                        </div>
                      </div>
                    </PersonalUserSection>

                    <div className="sticky bottom-0 z-10 -mx-5 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50"
                        onClick={cancelJobEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] shadow-sm hover:opacity-95 disabled:opacity-50"
                        disabled={patchWorker.isPending}
                        onClick={() => patchWorker.mutate()}
                      >
                        Save changes
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'docs' && id && (
              <div className="pb-24">
                <SubcontractorWorkerFilesTabEnhanced
                  workerId={id}
                  files={workerFiles || []}
                  onRefresh={() => {
                    void refetchWorkerFiles();
                    qc.invalidateQueries({ queryKey: ['subcontractor-worker-activity', id] });
                  }}
                  hasEditPermission={hasEditPermission}
                />
              </div>
            )}

            {activeTab === 'timesheet' && id && (
              <SubcontractorWorkerTimesheetBlock
                workerId={id}
                openAttendance={data.open_attendance}
                canEdit={hasEditPermission}
                onBundleInvalidate={() => {
                  void refetch();
                  qc.invalidateQueries({ queryKey: ['subcontractor-worker-activity', id] });
                  qc.invalidateQueries({ queryKey: ['reports', 'worker', id] });
                  qc.invalidateQueries({ queryKey: ['settings-attendance'] });
                  qc.invalidateQueries({ queryKey: ['sc-worker-attendance'], exact: false });
                }}
              />
            )}

            {activeTab === 'training' && id && canViewTraining && (
              <div className="space-y-6 pb-24">
                <EmployeeTrainingSection variant="worker" workerId={id} canEdit={canEditTraining} />
              </div>
            )}

            {activeTab === 'reports' && id && canViewReports && (
              <UserReports variant="worker" workerId={id} canEdit={canEditReports} />
            )}

            {activeTab === 'activity' && (
              <div className="space-y-6 pb-24">
                <PersonalUserSection
                  tone="slate"
                  heading="Activity"
                  icon={
                    <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  }
                >
                  <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                    {(activityFeed || []).length ? (
                      <div className="divide-y divide-gray-100">
                        {(activityFeed || []).map((ev, i) => (
                          <div
                            key={`${ev.type}-${ev.at}-${ev.audit_id ?? ev.attendance_id ?? ev.worker_file_id ?? i}`}
                            className="px-3 py-2.5 hover:bg-gray-50/90 grid grid-cols-1 md:grid-cols-12 gap-2 text-xs"
                          >
                            <div className="md:col-span-2 text-gray-500 tabular-nums whitespace-nowrap shrink-0">
                              {new Date(ev.at).toLocaleString()}
                            </div>
                            <div className="md:col-span-7 min-w-0">
                              <div className="font-semibold text-gray-900">{ev.title}</div>
                              {ev.subtitle ? (
                                <div className="text-gray-600 mt-0.5 break-words">{ev.subtitle}</div>
                              ) : null}
                              {ev.type === 'clock_out' && ev.total_hours != null ? (
                                <div className="text-gray-600 mt-1 tabular-nums">
                                  {formatDecimalHoursAsHMin(ev.total_hours)}
                                </div>
                              ) : null}
                              {ev.detail_lines && ev.detail_lines.length > 0 ? (
                                <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-gray-600 border-l-2 border-gray-200 pl-2 max-h-40 overflow-y-auto">
                                  {ev.detail_lines.map((line, j) => (
                                    <li key={j} className="break-words">
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                            <div className="md:col-span-3 text-gray-500 md:text-right">
                              {ev.by_username ? (
                                <span>
                                  By <span className="font-medium text-gray-800">{ev.by_username}</span>
                                </span>
                              ) : ev.by_user_id ? (
                                <span className="font-mono text-[10px] text-gray-500" title={ev.by_user_id}>
                                  By user {ev.by_user_id.slice(0, 8)}…
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-gray-500 text-sm py-6 px-3">No activity yet.</div>
                    )}
                  </div>
                </PersonalUserSection>
              </div>
            )}
              </div>
            </div>
            {workerPhotoPickerOpen && (
              <ImagePicker
                isOpen
                onClose={() => setWorkerPhotoPickerOpen(false)}
                onConfirm={(blob) => void uploadWorkerPhotoBlob(blob)}
                targetWidth={512}
                targetHeight={512}
                allowEdit
                hideEditButton
                fileObjectId={data.worker.photo_file_id || undefined}
              />
            )}

            {qrModalOpen && qrDataUrl && qrCardInfo && (
              <OverlayPortal>
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
                  onClick={() => setQrModalOpen(false)}
                >
                  <div
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-labelledby="worker-qr-modal-title"
                    aria-modal="true"
                  >
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
                      <h2 id="worker-qr-modal-title" className="text-sm font-semibold text-gray-900">
                        Clock-in QR badge
                      </h2>
                      <button
                        type="button"
                        className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 text-lg leading-none"
                        aria-label="Close"
                        onClick={() => setQrModalOpen(false)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="p-5 flex flex-col items-center">
                      <WorkerQrBadgeCard
                        ref={qrBadgeExportRef}
                        variant="full"
                        workerName={qrCardInfo.workerName}
                        companyName={qrCardInfo.companyName}
                        phone={qrCardInfo.phone}
                        qrDataUrl={qrDataUrl}
                        className="w-full max-w-[320px]"
                      />
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        disabled={qrCardExporting}
                        onClick={() => void downloadQrCard()}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] shadow-sm hover:opacity-95 disabled:opacity-50"
                      >
                        {qrCardExporting ? 'Preparing…' : 'Download PNG'}
                      </button>
                      <button
                        type="button"
                        disabled={qrCardExporting}
                        onClick={() => void printQrCard()}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrModalOpen(false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </OverlayPortal>
            )}

            {workerStatusModalOpen && (
              <OverlayPortal>
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                  onClick={() => {
                    if (!patchWorkerStatusMut.isPending) setWorkerStatusModalOpen(false);
                  }}
                >
                  <div
                    className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-labelledby="worker-status-modal-title"
                    aria-modal="true"
                  >
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <h2 id="worker-status-modal-title" className="text-sm font-semibold text-gray-900">
                        Worker status
                      </h2>
                      <button
                        type="button"
                        disabled={patchWorkerStatusMut.isPending}
                        className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 text-lg leading-none disabled:opacity-40 disabled:pointer-events-none"
                        aria-label="Close"
                        onClick={() => setWorkerStatusModalOpen(false)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      <p className="text-xs text-gray-600">
                        Controls whether this worker can be used for subcontractor site attendance and clock-in/out when
                        their employer company is active. This is separate from editing name or contact in Basic
                        information.
                      </p>
                      <fieldset className="space-y-2">
                        <legend className="sr-only">Worker status</legend>
                        <label
                          className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 ${
                            workerStatusDraft ? 'border-green-300 bg-green-50/60' : 'border-gray-200 hover:bg-gray-50/80'
                          }`}
                        >
                          <input
                            type="radio"
                            name="worker-status"
                            className="mt-0.5 text-brand-red focus:ring-brand-red"
                            checked={workerStatusDraft === true}
                            disabled={patchWorkerStatusMut.isPending}
                            onChange={() => setWorkerStatusDraft(true)}
                          />
                          <span>
                            <span className="block text-sm font-medium text-gray-900">Active</span>
                            <span className="block text-xs text-gray-600 mt-0.5">
                              Eligible for timesheet and site clock-in (subject to company).
                            </span>
                          </span>
                        </label>
                        <label
                          className={`flex items-start gap-3 cursor-pointer rounded-lg border p-3 ${
                            !workerStatusDraft ? 'border-red-300 bg-red-50/60' : 'border-gray-200 hover:bg-gray-50/80'
                          }`}
                        >
                          <input
                            type="radio"
                            name="worker-status"
                            className="mt-0.5 text-brand-red focus:ring-brand-red"
                            checked={workerStatusDraft === false}
                            disabled={patchWorkerStatusMut.isPending}
                            onChange={() => setWorkerStatusDraft(false)}
                          />
                          <span>
                            <span className="block text-sm font-medium text-gray-900">Inactive</span>
                            <span className="block text-xs text-gray-600 mt-0.5">
                              Not eligible for new clock-ins until set active again.
                            </span>
                          </span>
                        </label>
                      </fieldset>
                    </div>
                    <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={patchWorkerStatusMut.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => setWorkerStatusModalOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={patchWorkerStatusMut.isPending}
                        onClick={() => saveWorkerStatusFromModal()}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] shadow-sm hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {patchWorkerStatusMut.isPending ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </OverlayPortal>
            )}
          </div>
        )}
      </LoadingOverlay>
    </div>
  );
}
