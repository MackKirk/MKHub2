import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { subcontractorCompanyWorkersUrl } from '@/components/SubcontractorWorkersCard';
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
import { EmployeeTrainingSection } from './UserInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppControlLabelRow,
  AppEmptyState,
  AppFieldHint,
  AppFormModal,
  AppHeroEditButton,
  AppInput,
  AppModal,
  AppPageHeader,
  AppSectionHeader,
  AppSelect,
  AppTabs,
  AppTextarea,
  appSectionPresetProps,
  type AppSectionPresetKey,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { ChevronDown, ChevronUp, UserRound } from 'lucide-react';

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

/** North American phone mask: (000) 000-0000 */
function formatWorkerPhone(v: string): string {
  const d = String(v || '')
    .replace(/\D+/g, '')
    .slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
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
const EM_DASH = '\u2014';

const controlInputClass = uiCx('w-full text-sm', uiRadius.control, uiBorders.input, 'px-3 py-2');

type PersonalTone = 'blue' | 'green' | 'yellow' | 'orange' | 'slate' | 'red' | 'purple' | 'indigo';

const PERSONAL_SECTION_PRESET: Record<PersonalTone, AppSectionPresetKey> = {
  blue: 'basicInformation',
  yellow: 'contact',
  green: 'address',
  orange: 'emergency',
  slate: 'description',
  red: 'documents',
  purple: 'company',
  indigo: 'education',
};

function HeroField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className={uiTypography.overline}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'mt-0.5 break-words font-semibold text-gray-900')}>{children}</div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty =
    value === '' ||
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '');
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words whitespace-pre-wrap font-medium text-gray-900')}>
        {isEmpty ? EM_DASH : value}
      </div>
    </div>
  );
}

function PersonalUserSection({
  tone,
  heading,
  description,
  children,
  showPencil,
  onEditClick,
}: {
  tone: PersonalTone;
  heading: string;
  description: string;
  children: ReactNode;
  showPencil?: boolean;
  onEditClick?: () => void;
}) {
  return (
    <AppCard>
      <AppSectionHeader
        title={heading}
        description={description}
        {...appSectionPresetProps(PERSONAL_SECTION_PRESET[tone])}
        action={
          showPencil && onEditClick ? (
            <AppHeroEditButton onClick={onEditClick} title={`Edit ${heading}`} />
          ) : undefined
        }
      />
      <div className={uiCx('mt-4', uiSpacing.sectionStack)}>{children}</div>
    </AppCard>
  );
}

function WorkerStatusBadge({
  active,
  pending,
  onClick,
}: {
  active: boolean;
  pending?: boolean;
  onClick?: () => void;
}) {
  const badge = (
    <AppBadge variant={active ? 'success' : 'warning'} className="normal-case tracking-normal">
      {pending ? 'Saving…' : active ? 'Active' : 'Inactive'}
    </AppBadge>
  );
  if (!onClick) return badge;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title="Change worker status"
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30 disabled:opacity-50"
    >
      {badge}
    </button>
  );
}

type WorkerPageLocationState = { returnTo?: string };

export default function SubcontractorWorkerPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const location = useLocation();
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
    return withFileAccessTokenIfNeeded(`/files/${data.worker.photo_file_id}/thumbnail?w=320`) || null;
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

  const backHref = useMemo(() => {
    const companyId = data?.worker?.company_id;
    if (!companyId) return '/business/subcontractors';
    const returnTo = (location.state as WorkerPageLocationState | null)?.returnTo;
    if (returnTo && returnTo.includes(`/business/subcontractors/companies/${companyId}`)) {
      return returnTo;
    }
    return subcontractorCompanyWorkersUrl(companyId);
  }, [data?.worker?.company_id, location.state]);

  if (!id) return null;

  const pageTitle = data ? workerDisplayHeroName(data.worker) : 'Subcontractor worker';

  return (
    <div className={uiCx('min-h-full w-full bg-gray-50', uiSpacing.pageStack)}>
      <AppPageHeader
        title={pageTitle}
        subtitle="Personal details, employer, documents, and site attendance"
        icon={<UserRound className="h-4 w-4" />}
        onBack={() => nav(backHref)}
        backLabel={data?.worker?.company_id ? 'Back to company' : 'Back to subcontractors'}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <LoadingOverlay isLoading={isLoading || !data} text="Loading worker…">
        {data && (
          <div className={uiSpacing.pageStack}>
            <AppCard bodyClassName="p-3 relative">
              {isEmployeeCardMinimized ? (
                <div className="flex gap-2 items-center pr-8">
                  <div
                    className={uiCx(
                      'group relative h-10 w-10 shrink-0 overflow-hidden rounded-lg',
                      uiBorders.subtle,
                    )}
                  >
                    <img
                      className="h-full w-full object-cover"
                      src={thumbSm || WORKER_PHOTO_PLACEHOLDER}
                      alt=""
                    />
                    {hasEditPermission && (
                      <button
                        type="button"
                        onClick={() => setWorkerPhotoPickerOpen(true)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        Change
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
                        <WorkerStatusBadge
                          active={data.worker.is_active}
                          pending={patchWorkerStatusMut.isPending}
                          onClick={hasEditPermission ? openWorkerStatusModal : undefined}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="group relative h-32 w-32 shrink-0 overflow-hidden rounded-xl border-2 border-gray-200">
                    <img
                      className="h-full w-full object-cover"
                      src={thumbLg || WORKER_PHOTO_PLACEHOLDER}
                      alt=""
                    />
                    {hasEditPermission && (
                      <button
                        type="button"
                        onClick={() => setWorkerPhotoPickerOpen(true)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        Change
                      </button>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2">
                      <h1 className="text-sm font-bold text-gray-900">{workerDisplayHeroName(data.worker)}</h1>
                      <div className="mt-0.5 text-xs text-gray-600">{data.company?.name || '—'}</div>
                    </div>
                    <div className="grid gap-x-3 md:grid-cols-3">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <HeroField label="Phone">{displayWorkerPhone(data.worker.phone) || EM_DASH}</HeroField>
                        <HeroField label="Status">
                          <WorkerStatusBadge
                            active={data.worker.is_active}
                            pending={patchWorkerStatusMut.isPending}
                            onClick={hasEditPermission ? openWorkerStatusModal : undefined}
                          />
                        </HeroField>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <HeroField label="Email">{data.worker.email || EM_DASH}</HeroField>
                        <HeroField label="On file since">
                          {data.worker.created_at ? String(data.worker.created_at).slice(0, 10) : EM_DASH}
                        </HeroField>
                      </div>
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <HeroField label="Address">
                          {formatAddressDisplay({
                            address_line1: data.worker.address_line1,
                            address_line2: data.worker.address_line2,
                            city: data.worker.city,
                            province: data.worker.province,
                            postal_code: data.worker.postal_code,
                            country: data.worker.country,
                          })}
                        </HeroField>
                        <HeroField label="Open attendance">
                          {data.open_attendance
                            ? `${data.open_attendance.project_name || 'Project'} · in`
                            : EM_DASH}
                        </HeroField>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                className="absolute bottom-2 right-2 p-1"
                onClick={() => setIsEmployeeCardMinimized(!isEmployeeCardMinimized)}
                title={isEmployeeCardMinimized ? 'Expand' : 'Minimize'}
                aria-label={isEmployeeCardMinimized ? 'Expand' : 'Minimize'}
              >
                {isEmployeeCardMinimized ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </AppButton>
            </AppCard>

            <AppCard bodyClassName="p-2.5">
              <AppTabs
                tabs={tabStrip.map((t) => ({ key: t.key, label: t.label }))}
                value={activeTab}
                onChange={(key) => setTab(key as WorkerSubTab)}
              />
            </AppCard>

            <AppCard bodyClassName="p-5">
            {activeTab === 'personal' && (
              <div className={`space-y-6 ${personalEditSection ? 'relative pb-2' : ''}`}>
                <div className="space-y-6">
                    <PersonalUserSection
                      tone="blue"
                      heading="Basic Information"
                      description="Legal name and identity fields for this worker."
                      showPencil={hasEditPermission && personalEditSection !== 'basic'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('basic') : undefined}
                    >
                      {personalEditSection === 'basic' ? (
                      <div className="grid md:grid-cols-2 gap-4">
                        <AppInput
                          label="First name"
                          value={wf.first_name}
                          onChange={(e) => setWf((s) => ({ ...s, first_name: e.target.value }))}
                          fieldHint="First name\n\nGiven name on file for reports and badges."
                        />
                        <AppInput
                          label="Last name"
                          value={wf.last_name}
                          onChange={(e) => setWf((s) => ({ ...s, last_name: e.target.value }))}
                          fieldHint="Last name\n\nFamily name on file for reports and badges."
                        />
                        <AppInput
                          label="Middle name"
                          value={wf.middle_name}
                          onChange={(e) => setWf((s) => ({ ...s, middle_name: e.target.value }))}
                          fieldHint="Middle name\n\nOptional middle name or initial."
                        />
                        <AppInput
                          label="Preferred name"
                          value={wf.preferred_name}
                          onChange={(e) => setWf((s) => ({ ...s, preferred_name: e.target.value }))}
                          fieldHint="Preferred name\n\nShown on the profile hero when set; overrides composed legal name."
                        />
                        <AppSelect
                          label="Gender"
                          value={wf.gender}
                          onChange={(e) => setWf((s) => ({ ...s, gender: e.target.value }))}
                          fieldHint="Gender\n\nOptional; used for HR and reporting only."
                          options={[
                            { value: '', label: EM_DASH },
                            ...WORKER_GENDER_OPTIONS.map((g) => ({ value: g, label: g })),
                          ]}
                        />
                      </div>
                      ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        <ReadOnlyField label="First name" value={data.worker.first_name || ''} />
                        <ReadOnlyField label="Last name" value={data.worker.last_name || ''} />
                        <ReadOnlyField label="Middle name" value={data.worker.middle_name || ''} />
                        <ReadOnlyField label="Preferred name" value={data.worker.preferred_name || ''} />
                        <ReadOnlyField label="Gender" value={data.worker.gender || ''} />
                      </div>
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="yellow"
                      heading="Contact"
                      description="Email and phone for site coordination and reports."
                      showPencil={hasEditPermission && personalEditSection !== 'contact'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('contact') : undefined}
                    >
                      {personalEditSection === 'contact' ? (
                      <div className="grid md:grid-cols-2 gap-4">
                        <AppInput
                          label="Email"
                          type="email"
                          value={wf.email}
                          onChange={(e) => setWf((s) => ({ ...s, email: e.target.value }))}
                          fieldHint="Email\n\nUsed on QR badges and internal contact lists."
                        />
                        <AppInput
                          label="Phone"
                          value={wf.phone}
                          onChange={(e) => setWf((s) => ({ ...s, phone: formatWorkerPhone(e.target.value) }))}
                          fieldHint="Phone\n\nNorth American format; shown on the clock-in QR badge."
                        />
                      </div>
                      ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        <ReadOnlyField label="Email" value={data.worker.email || ''} />
                        <ReadOnlyField label="Phone" value={displayWorkerPhone(data.worker.phone)} />
                      </div>
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="green"
                      heading="Address"
                      description="Home or mailing address for this worker."
                      showPencil={hasEditPermission && personalEditSection !== 'address'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('address') : undefined}
                    >
                      {personalEditSection === 'address' ? (
                      <div className={uiSpacing.sectionStack}>
                        <div className="space-y-1.5">
                          <AppControlLabelRow
                            label="Address line 1"
                            fieldHint={<AppFieldHint hint="Address line 1\n\nStreet address. Suggestions appear as you type." />}
                          />
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
                            className={controlInputClass}
                          />
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <AppInput
                              label="Address line 2"
                              value={wf.address_line2}
                              onChange={(e) => setWf((s) => ({ ...s, address_line2: e.target.value }))}
                              fieldHint="Address line 2\n\nSuite, unit, or building (optional)."
                            />
                          </div>
                          <AppInput
                            label="City"
                            value={wf.city}
                            onChange={(e) => setWf((s) => ({ ...s, city: e.target.value }))}
                            fieldHint="City\n\nFilled automatically when you pick an address suggestion."
                          />
                          <AppInput
                            label="Province"
                            value={wf.province}
                            onChange={(e) => setWf((s) => ({ ...s, province: e.target.value }))}
                            fieldHint="Province/State\n\nProvince or state for mailing and site context."
                          />
                          <AppInput
                            label="Postal code"
                            value={wf.postal_code}
                            onChange={(e) => setWf((s) => ({ ...s, postal_code: e.target.value }))}
                            fieldHint="Postal code\n\nZIP or postal code."
                          />
                          <AppInput
                            label="Country"
                            value={wf.country}
                            onChange={(e) => setWf((s) => ({ ...s, country: e.target.value }))}
                            fieldHint="Country\n\nCountry for mailing address."
                          />
                        </div>
                      </div>
                      ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        <ReadOnlyField label="Address line 1" value={data.worker.address_line1 || ''} />
                        <ReadOnlyField label="Address line 2" value={data.worker.address_line2 || ''} />
                        <ReadOnlyField label="City" value={data.worker.city || ''} />
                        <ReadOnlyField label="Province" value={data.worker.province || ''} />
                        <ReadOnlyField label="Country" value={data.worker.country || ''} />
                        <ReadOnlyField label="Postal code" value={data.worker.postal_code || ''} />
                      </div>
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="orange"
                      heading="Emergency Contacts"
                      description="Person to contact if something happens on site."
                      showPencil={hasEditPermission && personalEditSection !== 'emergency'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('emergency') : undefined}
                    >
                      {personalEditSection === 'emergency' ? (
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <AppInput
                            label="Name"
                            value={wf.emergency_contact_name}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_name: e.target.value }))}
                            fieldHint="Name\n\nFull name of the emergency contact."
                          />
                        </div>
                        <AppInput
                          label="Relationship"
                          value={wf.emergency_contact_relationship}
                          onChange={(e) => setWf((s) => ({ ...s, emergency_contact_relationship: e.target.value }))}
                          fieldHint="Relationship\n\ne.g. Spouse, parent, or friend."
                        />
                        <AppInput
                          label="Mobile phone"
                          value={wf.emergency_contact_phone}
                          onChange={(e) =>
                            setWf((s) => ({ ...s, emergency_contact_phone: formatWorkerPhone(e.target.value) }))
                          }
                          fieldHint="Mobile phone\n\nPrimary number to reach this contact."
                        />
                        <AppInput
                          label="Home phone"
                          value={wf.emergency_contact_home_phone}
                          onChange={(e) =>
                            setWf((s) => ({ ...s, emergency_contact_home_phone: formatWorkerPhone(e.target.value) }))
                          }
                          fieldHint="Home phone\n\nOptional home line."
                        />
                        <AppInput
                          label="Work phone"
                          value={wf.emergency_contact_work_phone}
                          onChange={(e) =>
                            setWf((s) => ({ ...s, emergency_contact_work_phone: formatWorkerPhone(e.target.value) }))
                          }
                          fieldHint="Work phone\n\nOptional work line."
                        />
                        <div className="md:col-span-2">
                          <AppInput
                            label="Email"
                            type="email"
                            value={wf.emergency_contact_email}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_email: e.target.value }))}
                            fieldHint="Email\n\nOptional email for the emergency contact."
                          />
                        </div>
                        <div className="md:col-span-2">
                          <AppTextarea
                            label="Address"
                            rows={3}
                            value={wf.emergency_contact_address}
                            onChange={(e) => setWf((s) => ({ ...s, emergency_contact_address: e.target.value }))}
                            fieldHint="Address\n\nMailing address for the emergency contact (optional)."
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
                      description="Internal notes visible to staff with subcontractor access."
                      showPencil={hasEditPermission && personalEditSection !== 'notes'}
                      onEditClick={hasEditPermission ? () => beginPersonalEditSection('notes') : undefined}
                    >
                      {personalEditSection === 'notes' ? (
                      <AppTextarea
                        label="Internal notes"
                        rows={4}
                        value={wf.notes}
                        onChange={(e) => setWf((s) => ({ ...s, notes: e.target.value }))}
                        fieldHint="Internal notes\n\nOptional; not shown to the worker on site."
                      />
                      ) : (
                      <ReadOnlyField label="Internal notes" value={data.worker.notes || ''} />
                      )}
                    </PersonalUserSection>

                    <PersonalUserSection
                      tone="red"
                      heading="Clock-in QR"
                      description="Site QR for clock-in/out via the subcontractor scan flow (same role as kiosk access on Users)."
                    >
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
                    <div
                      className={uiCx(
                        'sticky bottom-0 z-10 -mx-5 mt-2 flex flex-wrap items-center justify-end gap-2 border-t bg-white px-5 py-3',
                        uiBorders.subtle,
                      )}
                    >
                      <AppButton type="button" variant="secondary" size="sm" onClick={cancelPersonalEdit}>
                        Cancel
                      </AppButton>
                      <AppButton
                        type="button"
                        size="sm"
                        disabled={patchWorker.isPending}
                        loading={patchWorker.isPending}
                        onClick={() => patchWorker.mutate()}
                      >
                        Save changes
                      </AppButton>
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
                    description="Job title and employer subcontractor company."
                    showPencil={hasEditPermission}
                    onEditClick={beginJobEdit}
                  >
                    <div className="grid md:grid-cols-2 gap-4">
                      <ReadOnlyField label="Job title" value={data.worker.job_title || ''} />
                      <ReadOnlyField
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
                      description="Job title and employer subcontractor company."
                    >
                      <div className="grid md:grid-cols-2 gap-4">
                        <AppInput
                          label="Job title"
                          value={wf.job_title}
                          onChange={(e) => setWf((s) => ({ ...s, job_title: e.target.value }))}
                          placeholder="e.g. Site labourer"
                          fieldHint="Job title\n\nRole on site (e.g. labourer, foreman)."
                        />
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

                    <div
                      className={uiCx(
                        'sticky bottom-0 z-10 -mx-5 mt-2 flex flex-wrap items-center justify-end gap-2 border-t bg-white px-5 py-3',
                        uiBorders.subtle,
                      )}
                    >
                      <AppButton type="button" variant="secondary" size="sm" onClick={cancelJobEdit}>
                        Cancel
                      </AppButton>
                      <AppButton
                        type="button"
                        size="sm"
                        disabled={patchWorker.isPending}
                        loading={patchWorker.isPending}
                        onClick={() => patchWorker.mutate()}
                      >
                        Save changes
                      </AppButton>
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
              <div className="pb-24">
                <EmployeeTrainingSection variant="worker" workerId={id} canEdit={canEditTraining} />
              </div>
            )}

            {activeTab === 'reports' && id && canViewReports && (
              <UserReports variant="worker" workerId={id} canEdit={canEditReports} />
            )}

            {activeTab === 'activity' && (
              <div className="pb-24">
                <PersonalUserSection
                  tone="slate"
                  heading="Activity"
                  description="Clock events, documents, and profile updates for this worker."
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
                      <AppEmptyState title="No activity yet" className="py-6" />
                    )}
                  </div>
                </PersonalUserSection>
              </div>
            )}
            </AppCard>
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
              <AppModal
                open
                onClose={() => setQrModalOpen(false)}
                title="Clock-in QR badge"
                description="Site QR for this worker — opens the subcontractor scan flow for clock-in/out."
                footer={
                  <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-center')}>
                    <AppButton
                      type="button"
                      disabled={qrCardExporting}
                      loading={qrCardExporting}
                      onClick={() => void downloadQrCard()}
                    >
                      {qrCardExporting ? 'Preparing…' : 'Download PNG'}
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="secondary"
                      disabled={qrCardExporting}
                      onClick={() => void printQrCard()}
                    >
                      Print
                    </AppButton>
                    <AppButton type="button" variant="secondary" onClick={() => setQrModalOpen(false)}>
                      Close
                    </AppButton>
                  </div>
                }
              >
                <div className="flex flex-col items-center">
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
              </AppModal>
            )}

            {workerStatusModalOpen && (
              <AppFormModal
                open
                onClose={() => {
                  if (!patchWorkerStatusMut.isPending) setWorkerStatusModalOpen(false);
                }}
                title="Worker status"
                description="Active workers can clock in when their employer company is active."
                formWidth="comfortable"
                footer={
                  <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={patchWorkerStatusMut.isPending}
                      onClick={() => setWorkerStatusModalOpen(false)}
                    >
                      Cancel
                    </AppButton>
                    <AppButton
                      type="button"
                      size="sm"
                      disabled={patchWorkerStatusMut.isPending}
                      loading={patchWorkerStatusMut.isPending}
                      onClick={() => saveWorkerStatusFromModal()}
                    >
                      Save
                    </AppButton>
                  </div>
                }
              >
                <p className={uiTypography.helper}>
                  Controls whether this worker can be used for subcontractor site attendance and clock-in/out when their
                  employer company is active. This is separate from editing name or contact in Basic information.
                </p>
                <fieldset className={uiCx(uiSpacing.sectionStack, 'mt-3')}>
                  <legend className="sr-only">Worker status</legend>
                  <label
                    className={uiCx(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                      workerStatusDraft ? 'border-green-300 bg-green-50/60' : uiBorders.subtle,
                    )}
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
                      <span className={uiTypography.sectionTitle}>Active</span>
                      <span className={uiCx(uiTypography.helper, 'mt-0.5 block')}>
                        Eligible for timesheet and site clock-in (subject to company).
                      </span>
                    </span>
                  </label>
                  <label
                    className={uiCx(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                      !workerStatusDraft ? 'border-red-300 bg-red-50/60' : uiBorders.subtle,
                    )}
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
                      <span className={uiTypography.sectionTitle}>Inactive</span>
                      <span className={uiCx(uiTypography.helper, 'mt-0.5 block')}>
                        Not eligible for new clock-ins until set active again.
                      </span>
                    </span>
                  </label>
                </fieldset>
              </AppFormModal>
            )}
          </div>
        )}
      </LoadingOverlay>
    </div>
  );
}
