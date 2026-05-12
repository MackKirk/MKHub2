import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import NewSubcontractorWorkerModal from '@/components/NewSubcontractorWorkerModal';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import LoadingOverlay from '@/components/LoadingOverlay';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatAddressDisplay } from '@/lib/addressUtils';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import SubcontractorContactsCard from '@/components/SubcontractorContactsCard';
import { SubcontractorCompanyFilesTabEnhanced } from '@/pages/SubcontractorCompanyFilesTabEnhanced';
import type { ClientFileForFiles } from '@/pages/CustomerFilesTabEnhanced';

type Company = Record<string, unknown> & {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_active: boolean;
  notes?: string | null;
  document_attachment_ids?: string[];
  created_at?: string | null;
};

type Worker = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  is_active: boolean;
  photo_file_id?: string | null;
  job_title?: string | null;
  address_line1?: string | null;
  city?: string | null;
  province?: string | null;
  created_at?: string | null;
};

type ContactRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
};

/** null = Overview (no tab in URL), same convention as CustomerDetail */
type SubcontractorCompanyTab = null | 'general' | 'contacts' | 'files' | 'workers';

const VALID_TABS = new Set(['general', 'contacts', 'files', 'workers']);

function tabFromSearchParams(sp: URLSearchParams): SubcontractorCompanyTab {
  const raw = (sp.get('tab') || '').trim().toLowerCase();
  if (!raw || raw === 'overview') return null;
  if (VALID_TABS.has(raw)) return raw as Exclude<SubcontractorCompanyTab, null>;
  return null;
}

function companyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.trim().slice(0, 2) || '?').toUpperCase();
}

type GeneralForm = {
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  notes: string;
  is_active: boolean;
};

function companyToGeneralForm(c: Company): GeneralForm {
  return {
    name: c.name || '',
    address_line1: (c.address_line1 as string) || '',
    address_line2: (c.address_line2 as string) || '',
    city: (c.city as string) || '',
    province: (c.province as string) || '',
    postal_code: (c.postal_code as string) || '',
    country: (c.country as string) || '',
    notes: (c.notes as string) || '',
    is_active: !!c.is_active,
  };
}

export default function SubcontractorCompanyPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const tab = useMemo(() => tabFromSearchParams(searchParams), [searchParams]);

  const workerListParams = useMemo(() => {
    const rs = (searchParams.get('w_status') || 'all').toLowerCase();
    const st = ['all', 'active', 'inactive'].includes(rs) ? rs : 'all';
    const ro = (searchParams.get('w_sort') || 'name').toLowerCase();
    const so = ['name', 'status', 'created'].includes(ro) ? ro : 'name';
    const rd = (searchParams.get('w_dir') || 'asc').toLowerCase();
    const di = rd === 'desc' ? 'desc' : 'asc';
    return { status: st as 'all' | 'active' | 'inactive', sort: so as 'name' | 'status' | 'created', dir: di as 'asc' | 'desc' };
  }, [searchParams]);

  useEffect(() => {
    if (tab !== 'workers' || !id) return;
    if (searchParams.get('w_status') && searchParams.get('w_sort') && searchParams.get('w_dir')) return;
    const n = new URLSearchParams(searchParams);
    n.set('tab', 'workers');
    if (!n.get('w_status')) n.set('w_status', 'all');
    if (!n.get('w_sort')) n.set('w_sort', 'name');
    if (!n.get('w_dir')) n.set('w_dir', 'asc');
    setSearchParams(n, { replace: true });
  }, [tab, id, searchParams, setSearchParams]);

  const workersListUrl = useMemo(() => {
    if (!id) return '';
    const p = new URLSearchParams();
    p.set('include_inactive', 'true');
    if (workerListParams.status === 'active') p.set('status', 'active');
    else if (workerListParams.status === 'inactive') p.set('status', 'inactive');
    p.set('sort', workerListParams.sort);
    p.set('dir', workerListParams.dir);
    return `/subcontractors/companies/${id}/workers?${p.toString()}`;
  }, [id, workerListParams]);

  const setWorkerFilters = (patch: Partial<{ status: typeof workerListParams.status; sort: typeof workerListParams.sort; dir: typeof workerListParams.dir }>) => {
    const merged = { ...workerListParams, ...patch };
    const n = new URLSearchParams(searchParams);
    n.set('tab', 'workers');
    n.set('w_status', merged.status);
    n.set('w_sort', merged.sort);
    n.set('w_dir', merged.dir);
    setSearchParams(n, { replace: true });
  };

  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false);
  const [isEditingGeneral, setIsEditingGeneral] = useState(false);
  const [generalForm, setGeneralForm] = useState<GeneralForm | null>(null);
  const [generalDirty, setGeneralDirty] = useState(false);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  useEffect(() => {
    if (tab === null) setIsHeroCollapsed(false);
    else setIsHeroCollapsed(true);
  }, [tab]);

  const { data: company, isLoading } = useQuery({
    queryKey: ['subcontractor-company', id],
    queryFn: () => api<Company>('GET', `/subcontractors/companies/${id}`),
    enabled: !!id,
  });

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const hasEditPermission =
    (me?.roles || []).includes('admin') || (me?.permissions || []).includes('business:customers:write');

  const { data: contactRows } = useQuery({
    queryKey: ['subcontractor-company-contacts', id],
    queryFn: () => api<ContactRow[]>('GET', `/subcontractors/companies/${id}/contacts`),
    enabled: !!id,
  });

  const { data: companyFiles } = useQuery({
    queryKey: ['subcontractor-company-files', id],
    queryFn: () => api<ClientFileForFiles[]>('GET', `/subcontractors/companies/${id}/files`),
    enabled: !!id,
  });

  const refetchCompanyFiles = () => {
    if (!id) return;
    qc.invalidateQueries({ queryKey: ['subcontractor-company-files', id] });
    qc.invalidateQueries({ queryKey: ['subcontractor-company', id] });
  };

  const { data: workers } = useQuery({
    queryKey: ['subcontractor-workers', id, workerListParams.status, workerListParams.sort, workerListParams.dir],
    queryFn: () => api<Worker[]>('GET', workersListUrl),
    enabled: !!id && !!workersListUrl,
  });

  const activeWorkerCount = useMemo(() => (workers || []).filter((w) => w.is_active).length, [workers]);
  const inactiveWorkerCount = useMemo(() => (workers || []).filter((w) => !w.is_active).length, [workers]);
  const totalWorkers = workers?.length ?? 0;

  const docIds = useMemo(() => {
    const raw = company?.document_attachment_ids;
    return Array.isArray(raw) ? raw.map(String) : [];
  }, [company?.document_attachment_ids]);

  const documentCount = companyFiles != null ? companyFiles.length : docIds.length;

  const basePath = useMemo(() => `/business/subcontractors/companies/${id}`, [id]);

  const goTab = (next: SubcontractorCompanyTab) => {
    if (!id) return;
    if (next === null) nav(basePath, { replace: true });
    else nav(`${basePath}?tab=${next}`, { replace: true });
  };

  const handleTabClick = (key: 'overview' | Exclude<SubcontractorCompanyTab, null>) => {
    if (key === 'overview') goTab(null);
    else goTab(key);
  };

  const getPageTitle = (activeTab: SubcontractorCompanyTab): string => {
    if (!activeTab) return 'Subcontractor company';
    const labels: Record<string, string> = {
      general: 'General',
      contacts: 'Contacts',
      files: 'Files',
      workers: 'Workers',
    };
    return `Subcontractor company • ${labels[activeTab] || activeTab}`;
  };

  const getPageDescription = (activeTab: SubcontractorCompanyTab): string => {
    if (!activeTab) return 'Summary, workers, and documents for this third-party company.';
    const d: Record<string, string> = {
      general: 'Legal name, address, notes, and active status.',
      contacts: 'People at this company — create, edit, and reorder contacts.',
      files: 'Insurance, contracts, and other attachments.',
      workers: 'People who clock in under this subcontractor.',
    };
    return d[activeTab] || '';
  };

  const beginGeneralEdit = () => {
    if (!company) return;
    setGeneralForm(companyToGeneralForm(company));
    setGeneralDirty(false);
    setIsEditingGeneral(true);
  };

  const discardGeneralEdit = () => {
    setIsEditingGeneral(false);
    setGeneralForm(null);
    setGeneralDirty(false);
  };

  const saveGeneral = async () => {
    if (!company || !generalForm || !id || isSavingGeneral) return;
    const nextActive = generalForm.is_active;
    if (company.is_active && !nextActive && activeWorkerCount > 0) {
      const ok = await confirm({
        title: 'Deactivate company',
        message: `This company has ${activeWorkerCount} active worker(s). Deactivate the company anyway? Workers can remain in the system but you should review their status separately.`,
      });
      if (!ok) return;
    }
    setIsSavingGeneral(true);
    try {
      await api('PATCH', `/subcontractors/companies/${id}`, {
        name: generalForm.name.trim(),
        address_line1: generalForm.address_line1.trim() || null,
        address_line2: generalForm.address_line2.trim() || null,
        city: generalForm.city.trim() || null,
        province: generalForm.province.trim() || null,
        postal_code: generalForm.postal_code.trim() || null,
        country: generalForm.country.trim() || null,
        notes: generalForm.notes.trim() || null,
        is_active: nextActive,
      });
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['subcontractor-company', id] });
      qc.invalidateQueries({ queryKey: ['subcontractor-companies'] });
      discardGeneralEdit();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  useUnsavedChangesGuard(isEditingGeneral && generalDirty, saveGeneral, discardGeneralEdit);

  if (!id) return null;

  const initialLoad = isLoading || !company;
  const addressLine = company
    ? formatAddressDisplay({
        address_line1: company.address_line1,
        address_line2: company.address_line2,
        city: company.city,
        province: company.province,
        postal_code: company.postal_code,
        country: company.country,
      })
    : '—';

  const primaryContactLine = useMemo(() => {
    if (contactRows && contactRows.length > 0) {
      const p = contactRows.find((c) => c.is_primary) || contactRows[0];
      const line = [p.name, p.email || p.phone].filter(Boolean).join(' · ');
      if (line) return line;
    }
    if (!company) return '—';
    return [company.contact_name, company.email || company.phone].filter(Boolean).join(' · ') || '—';
  }, [company, contactRows]);

  const tabStripKeys = ['overview', 'general', 'contacts', 'files', 'workers'] as const;
  const tabConfig: Record<(typeof tabStripKeys)[number], { label: string; icon: string }> = {
    overview: { label: 'Overview', icon: '📊' },
    general: { label: 'General', icon: '📋' },
    contacts: { label: 'Contacts', icon: '👤' },
    files: { label: 'Files', icon: '📁' },
    workers: { label: 'Workers', icon: '👷' },
  };

  return (
    <div>
      <LoadingOverlay isLoading={initialLoad} text="Loading company…">
        {company && (
          <>
            <div className="rounded-xl border bg-white p-4 mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (tab !== null) goTab(null);
                      else nav('/business/subcontractors');
                    }}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
                    title={tab !== null ? 'Back to overview' : 'Back to list'}
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{getPageTitle(tab)}</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{getPageDescription(tab)}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
                  <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
                </div>
              </div>
            </div>

            {/* Hero — CustomerDetail-style expanded / collapsed */}
            <div className={`relative mb-4 transition-all duration-[1200ms] ease-in-out ${isHeroCollapsed ? 'min-h-[72px]' : ''}`}>
              <div
                className={`rounded-xl border bg-white overflow-hidden transition-all ${isHeroCollapsed ? 'duration-[1200ms]' : 'duration-[1800ms]'} ease-in-out relative ${
                  isHeroCollapsed ? 'opacity-0 max-h-0 pointer-events-none' : 'opacity-100 max-h-[2000px] pointer-events-auto'
                }`}
                style={{
                  transitionProperty: 'max-height, opacity',
                  transitionDuration: isHeroCollapsed ? '1200ms, 300ms' : '1800ms, 300ms',
                  transitionTimingFunction: 'ease-in-out, ease-in-out',
                }}
              >
                <div className="p-3 overflow-visible">
                  <div className="text-xs text-gray-500 mb-2">
                    <Link to="/business/subcontractors" className="text-[#7f1010] hover:underline">
                      Subcontractors
                    </Link>
                    <span className="text-gray-400"> / </span>
                    <span className="text-gray-800">{company.name}</span>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-48 flex-shrink-0">
                      <div className="w-48 h-36 rounded-xl border border-gray-200 bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-600">
                        {companyInitials(company.name)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2 justify-between">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{company.name}</h3>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                            company.is_active ? 'border-green-200 text-green-800 bg-green-50' : 'border-amber-200 text-amber-800 bg-amber-50'
                          }`}
                        >
                          {company.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-2 gap-y-1.5">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">ID</span>
                          <div className="text-xs font-semibold text-gray-900 mt-0.5 truncate">{company.id.slice(0, 8)}…</div>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Address</span>
                          <div className="text-xs font-semibold text-gray-900 mt-0.5 truncate" title={addressLine}>
                            {addressLine}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Primary contact</span>
                          <div className="text-xs font-semibold text-gray-900 mt-0.5 truncate" title={primaryContactLine}>
                            {primaryContactLine}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Workers</span>
                          <div className="text-xs font-semibold text-gray-900 mt-0.5">
                            {totalWorkers} total · {activeWorkerCount} active · {inactiveWorkerCount} inactive
                          </div>
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Created</span>
                          <div className="text-xs font-semibold text-gray-900 mt-0.5">
                            {company.created_at ? new Date(company.created_at).toLocaleDateString() : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHeroCollapsed(true)}
                  className="absolute bottom-2 right-2 p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                  title="Collapse"
                >
                  <svg className="w-3 h-3 transition-transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <div
                className={`rounded-xl border bg-white overflow-hidden transition-all absolute top-0 left-0 right-0 ${
                  isHeroCollapsed ? 'opacity-100 min-h-[60px] max-h-[200px] pointer-events-auto z-10' : 'opacity-0 max-h-0 pointer-events-none z-0'
                }`}
                style={{
                  transitionProperty: 'max-height, opacity',
                  transitionDuration: isHeroCollapsed ? '1200ms, 300ms' : '1800ms, 300ms',
                  transitionTimingFunction: 'ease-in-out, ease-in-out',
                }}
              >
                <div className="px-3 py-3 pr-10 min-h-[60px] flex items-center justify-between gap-4">
                  <div className="min-w-0 flex items-center gap-2 flex-1">
                    <div className="w-9 h-9 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
                      {companyInitials(company.name)}
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 truncate">{company.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-500 font-medium">{company.id.slice(0, 8)}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        company.is_active ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {company.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHeroCollapsed(false)}
                  className="absolute bottom-2 right-2 p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                  title="Expand"
                >
                  <svg className="w-3 h-3 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className={`mb-4 transition-all duration-[1200ms] ease-in-out ${isHeroCollapsed ? 'mt-16' : 'mt-0'}`}>
              <div className="rounded-xl border bg-white p-3">
                <div className="flex flex-wrap gap-2">
                  {tabStripKeys.map((tabKey) => {
                    const config = tabConfig[tabKey];
                    const isActive = (tab === null && tabKey === 'overview') || tab === tabKey;
                    return (
                      <button
                        key={tabKey}
                        type="button"
                        onClick={() => handleTabClick(tabKey === 'overview' ? 'overview' : tabKey)}
                        className={`flex-1 min-w-[100px] px-3 py-1.5 text-sm font-bold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                          isActive
                            ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 hover:border-red-400'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                        }`}
                      >
                        <span className="text-xs leading-none">{config.icon}</span>
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-white p-5 mb-4">
              {tab === null && (
                <div className="space-y-6">
                  <p className="text-sm text-gray-600">Quick summary of this subcontractor company. Open a tab below for full details.</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Workers</div>
                      <div className="text-lg font-semibold text-gray-900 tabular-nums mt-1">{totalWorkers}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Active</div>
                      <div className="text-lg font-semibold text-gray-900 tabular-nums mt-1">{activeWorkerCount}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Inactive</div>
                      <div className="text-lg font-semibold text-gray-900 tabular-nums mt-1">{inactiveWorkerCount}</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Documents</div>
                      <div className="text-lg font-semibold text-gray-900 tabular-nums mt-1">{documentCount}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => goTab('workers')}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Go to Workers
                    </button>
                    <button
                      type="button"
                      onClick={() => goTab('files')}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Go to Files
                    </button>
                    <button
                      type="button"
                      onClick={() => goTab('general')}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Edit company
                    </button>
                  </div>
                </div>
              )}

              {tab === 'general' && (
                <div className="space-y-6 pb-24">
                  <div className="rounded-xl border bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <h5 className="text-sm font-semibold text-blue-900">Company</h5>
                      </div>
                      {!isEditingGeneral && hasEditPermission && (
                        <button
                          type="button"
                          onClick={beginGeneralEdit}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
                          title="Edit company"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="text-xs text-gray-500 mb-2">Legal and trading identity for this subcontractor.</div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <Field label={<>Company name <span className="text-red-600">*</span></>} tooltip="Shown on projects, safety forms, and reports.">
                          {isEditingGeneral && generalForm ? (
                            <>
                              <input
                                className={`w-full border rounded px-3 py-2 ${!generalForm.name.trim() ? 'border-red-500' : ''}`}
                                value={generalForm.name}
                                onChange={(e) => {
                                  setGeneralForm((f) => (f ? { ...f, name: e.target.value } : f));
                                  setGeneralDirty(true);
                                }}
                              />
                              {!generalForm.name.trim() && <div className="text-[11px] text-red-600 mt-1">Required</div>}
                            </>
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{company.name || '—'}</div>
                          )}
                        </Field>
                        <Field label="Status" tooltip="Inactive companies are hidden from most pickers; workers may still exist.">
                          {isEditingGeneral && generalForm ? (
                            <label className="inline-flex items-center gap-2 text-sm text-gray-800">
                              <input
                                type="checkbox"
                                checked={generalForm.is_active}
                                onChange={(e) => {
                                  setGeneralForm((f) => (f ? { ...f, is_active: e.target.checked } : f));
                                  setGeneralDirty(true);
                                }}
                              />
                              Active
                            </label>
                          ) : (
                            <div className="text-gray-900 font-medium py-1">{company.is_active ? 'Active' : 'Inactive'}</div>
                          )}
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <h5 className="text-sm font-semibold text-green-900">Address</h5>
                      </div>
                      {!isEditingGeneral && hasEditPermission && (
                        <button
                          type="button"
                          onClick={beginGeneralEdit}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
                          title="Edit address"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="text-xs text-gray-500 mb-2">Primary mailing and location address.</div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <Field label="Address 1" tooltip="Street address.">
                          {isEditingGeneral && generalForm ? (
                            <AddressAutocomplete
                              value={generalForm.address_line1}
                              onChange={(v) => {
                                setGeneralForm((f) => (f ? { ...f, address_line1: v } : f));
                                setGeneralDirty(true);
                              }}
                              onAddressSelect={(a) =>
                                setGeneralForm((f) =>
                                  f
                                    ? {
                                        ...f,
                                        address_line1: a.address_line1 || f.address_line1,
                                        address_line2: a.address_line2 ?? f.address_line2,
                                        city: a.city ?? f.city,
                                        province: a.province ?? f.province,
                                        postal_code: a.postal_code ?? f.postal_code,
                                        country: a.country ?? f.country,
                                      }
                                    : f
                                )
                              }
                              className="w-full border rounded px-3 py-2 text-sm bg-white"
                            />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(company.address_line1 || '') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Address 2">
                          {isEditingGeneral && generalForm ? (
                            <input
                              className="w-full border rounded px-3 py-2"
                              value={generalForm.address_line2}
                              onChange={(e) => {
                                setGeneralForm((f) => (f ? { ...f, address_line2: e.target.value } : f));
                                setGeneralDirty(true);
                              }}
                            />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(company.address_line2 || '') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Country">
                          {isEditingGeneral && generalForm ? (
                            <input
                              className="w-full border rounded px-3 py-2"
                              value={generalForm.country}
                              onChange={(e) => {
                                setGeneralForm((f) => (f ? { ...f, country: e.target.value } : f));
                                setGeneralDirty(true);
                              }}
                            />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(company.country || '') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Province/State">
                          {isEditingGeneral && generalForm ? (
                            <input
                              className="w-full border rounded px-3 py-2"
                              value={generalForm.province}
                              onChange={(e) => {
                                setGeneralForm((f) => (f ? { ...f, province: e.target.value } : f));
                                setGeneralDirty(true);
                              }}
                            />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(company.province || '') || '—'}</div>
                          )}
                        </Field>
                        <Field label="City">
                          {isEditingGeneral && generalForm ? (
                            <input
                              className="w-full border rounded px-3 py-2"
                              value={generalForm.city}
                              onChange={(e) => {
                                setGeneralForm((f) => (f ? { ...f, city: e.target.value } : f));
                                setGeneralDirty(true);
                              }}
                            />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(company.city || '') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Postal code">
                          {isEditingGeneral && generalForm ? (
                            <input
                              className="w-full border rounded px-3 py-2"
                              value={generalForm.postal_code}
                              onChange={(e) => {
                                setGeneralForm((f) => (f ? { ...f, postal_code: e.target.value } : f));
                                setGeneralDirty(true);
                              }}
                            />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(company.postal_code || '') || '—'}</div>
                          )}
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h5 className="text-sm font-semibold text-gray-900">Notes</h5>
                      </div>
                      {!isEditingGeneral && hasEditPermission && (
                        <button
                          type="button"
                          onClick={beginGeneralEdit}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
                          title="Edit notes"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="text-xs text-gray-500 mb-2">Internal notes about this subcontractor company.</div>
                      <Field label="Notes">
                        {isEditingGeneral && generalForm ? (
                          <textarea
                            rows={6}
                            className="w-full border rounded px-3 py-2 resize-y"
                            value={generalForm.notes}
                            onChange={(e) => {
                              setGeneralForm((f) => (f ? { ...f, notes: e.target.value } : f));
                              setGeneralDirty(true);
                            }}
                          />
                        ) : (
                          <div className="text-gray-900 font-medium py-1 break-words whitespace-pre-wrap">{String(company.notes || '') || '—'}</div>
                        )}
                      </Field>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'general' && isEditingGeneral && generalForm && (
                <div className="fixed bottom-0 left-0 right-0 z-40">
                  <div className="max-w-[1400px] mx-auto px-4">
                    <div className="mb-3 rounded-xl border bg-white shadow-lg p-3 flex items-center gap-3 flex-wrap">
                      <div className={`text-sm ${generalDirty ? 'text-amber-700' : 'text-green-700'}`}>
                        {generalDirty ? 'You have unsaved changes' : 'All changes saved'}
                      </div>
                      <div className="flex gap-3 ml-auto">
                        <button type="button" onClick={() => discardGeneralEdit()} className="px-4 py-2 rounded border bg-white text-gray-700 hover:bg-gray-50 text-sm">
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSavingGeneral || !generalForm.name.trim()}
                          onClick={() => void saveGeneral()}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {isSavingGeneral ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'contacts' && id && (
                <SubcontractorContactsCard companyId={id} companyDisplayName={company.name} hasEditPermission={hasEditPermission} />
              )}

              {tab === 'files' && id && (
                <SubcontractorCompanyFilesTabEnhanced
                  companyId={id}
                  files={companyFiles || []}
                  onRefresh={refetchCompanyFiles}
                  hasEditPermission={hasEditPermission}
                />
              )}

              {tab === 'workers' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Workers</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {totalWorkers} total · {activeWorkerCount} active · {inactiveWorkerCount} inactive
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Show</label>
                      <select
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        value={workerListParams.status}
                        onChange={(e) => setWorkerFilters({ status: e.target.value as typeof workerListParams.status })}
                      >
                        <option value="all">All</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide ml-1">Sort</label>
                      <select
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        value={workerListParams.sort}
                        onChange={(e) => setWorkerFilters({ sort: e.target.value as typeof workerListParams.sort })}
                      >
                        <option value="name">Name</option>
                        <option value="status">Status</option>
                        <option value="created">Created</option>
                      </select>
                      <select
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                        value={workerListParams.dir}
                        onChange={(e) => setWorkerFilters({ dir: e.target.value as typeof workerListParams.dir })}
                        title="Sort direction"
                      >
                        <option value="asc">A → Z / Active first / Oldest</option>
                        <option value="desc">Z → A / Inactive first / Newest</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {hasEditPermission && (
                      <button
                        type="button"
                        onClick={() => setAddWorkerOpen(true)}
                        className="rounded-xl border-2 border-dashed border-gray-300 p-4 hover:border-[#7f1010] hover:bg-gray-50 transition-all bg-white flex items-center justify-center min-h-[120px]"
                      >
                        <div className="text-lg text-gray-400 mr-2">+</div>
                        <div className="font-medium text-xs text-gray-700">New worker</div>
                      </button>
                    )}
                    {(workers || []).map((w) => {
                      const photo = w.photo_file_id ? withFileAccessTokenIfNeeded(`/files/${w.photo_file_id}/thumbnail?w=160`) : null;
                      const addrSnippet = formatAddressDisplay({
                        address_line1: w.address_line1 ?? undefined,
                        city: w.city ?? undefined,
                        province: w.province ?? undefined,
                      });
                      return (
                        <div key={w.id} className="rounded-xl border bg-white overflow-hidden flex">
                          <div className="w-28 bg-gray-100 flex items-center justify-center flex-shrink-0">
                            {photo ? (
                              <img className="w-20 h-20 object-cover rounded border" src={photo} alt="" />
                            ) : (
                              <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">
                                {(w.name || '?').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 p-3 text-sm min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <Link to={`/business/subcontractors/workers/${w.id}`} className="font-semibold text-[#7f1010] hover:underline truncate">
                                {w.name}
                              </Link>
                              <span
                                className={`flex-shrink-0 inline-flex px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                                  w.is_active ? 'border-green-200 text-green-800 bg-green-50' : 'border-amber-200 text-amber-800 bg-amber-50'
                                }`}
                              >
                                {w.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            {w.job_title && <div className="text-xs text-gray-600 mt-0.5 truncate">{w.job_title}</div>}
                            <div className="text-gray-600 text-xs mt-2 break-all">{w.email || w.phone || '—'}</div>
                            {addrSnippet && <div className="text-[11px] text-gray-500 mt-1 truncate">{addrSnippet}</div>}
                            <div className="mt-2">
                              <Link to={`/business/subcontractors/workers/${w.id}`} className="text-xs text-[#7f1010] hover:underline">
                                Open profile
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {workers && !workers.length && !hasEditPermission && (
                    <div className="text-sm text-gray-600 mt-4 text-center">No workers yet.</div>
                  )}
                  {workers && !workers.length && hasEditPermission && (
                    <div className="text-xs text-gray-500 mt-4 text-center">Use “New worker” to add the first person.</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </LoadingOverlay>

      {id && (
        <NewSubcontractorWorkerModal
          open={addWorkerOpen}
          onClose={() => setAddWorkerOpen(false)}
          companyId={id}
        />
      )}
    </div>
  );
}

function Field({ label, tooltip, children }: { label: ReactNode; tooltip?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600 flex items-center gap-1">
        <span>{label}</span>
        {tooltip && (
          <span className="relative group inline-block ml-0.5">
            <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="absolute left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block whitespace-nowrap bg-black text-white text-xs px-2 py-1 rounded shadow z-20">
              {tooltip}
            </span>
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
