import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import NewSubcontractorWorkerModal from '@/components/NewSubcontractorWorkerModal';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import LoadingOverlay from '@/components/LoadingOverlay';
import { formatAddressDisplay } from '@/lib/addressUtils';
import SubcontractorContactsCard from '@/components/SubcontractorContactsCard';
import SubcontractorWorkersCard from '@/components/SubcontractorWorkersCard';
import EditSubcontractorCompanyGeneralModal, {
  type SubcontractorGeneralEditSection,
} from '@/components/EditSubcontractorCompanyGeneralModal';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import { SubcontractorCompanyFilesTabEnhanced } from '@/pages/SubcontractorCompanyFilesTabEnhanced';
import { SubcontractorCompanyOverviewTab } from '@/components/subcontractor/overview/SubcontractorCompanyOverviewTab';
import type { ClientFileForFiles } from '@/pages/CustomerFilesTabEnhanced';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppHeroEditButton,
  AppPageHeader,
  AppSectionHeader,
  AppTabs,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const EM_DASH = '\u2014';
const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden transition-[max-height,opacity]';
const HERO_EXPAND_DURATION = 'duration-[1400ms]';
const HERO_COLLAPSE_DURATION = 'duration-[650ms]';

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

export default function SubcontractorCompanyPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const navigateBackToSubcontractors = useNavigateBack('/business/subcontractors');
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generalEditSection, setGeneralEditSection] = useState<SubcontractorGeneralEditSection | null>(null);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);



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
    qc.invalidateQueries({ queryKey: ['subcontractor-company-activity', id] });
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

  const companyLogoRec = useMemo(
    () => (companyFiles || []).find((f) => String(f.category || '').toLowerCase() === 'subcontractor-company-logo-derived'),
    [companyFiles],
  );
  const companyAvatarLarge = companyLogoRec
    ? withFileAccessToken(`/files/${companyLogoRec.file_object_id}/thumbnail?w=800`)
    : '/ui/assets/placeholders/customer.png';

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

  const activeTabKey = tab === null ? 'overview' : tab;
  const appTabItems = useMemo(
    () =>
      (['overview', 'general', 'contacts', 'files', 'workers'] as const).map((tabKey) => ({
        key: tabKey,
        label:
          tabKey === 'overview'
            ? 'Overview'
            : tabKey === 'general'
              ? 'General'
              : tabKey === 'contacts'
                ? 'Contacts'
                : tabKey === 'files'
                  ? 'Files'
                  : 'Workers',
      })),
    [],
  );

  const handlePageBack = () => {
    if (tab !== null) goTab(null);
    else navigateBackToSubcontractors();
  };

  const companyStatusBadge = (active: boolean) => (
    <AppBadge variant={active ? 'success' : 'warning'} className="normal-case tracking-normal">
      {active ? 'Active' : 'Inactive'}
    </AppBadge>
  );

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <LoadingOverlay isLoading={initialLoad} text="Loading company…">
          {company && (
            <>
              <div className={uiCx('flex flex-col', isHeroCollapsed ? 'gap-1.5' : 'gap-2')}>
                <AppPageHeader
          title={getPageTitle(tab)}
          subtitle={getPageDescription(tab)}
          icon={<Briefcase className="h-4 w-4" />}
          onBack={handlePageBack}
          backLabel={tab !== null ? 'Back to overview' : 'Back'}
                />

                <AppCard className={uiCx('transition-[margin]', HERO_PANEL_EASE)} bodyClassName="relative overflow-hidden p-0">
          <div
            className={uiCx(
              HERO_PANEL_TRANSITION_BASE,
              HERO_PANEL_EASE,
              isHeroCollapsed
                ? uiCx(HERO_COLLAPSE_DURATION, 'max-h-0 opacity-0')
                : uiCx(HERO_EXPAND_DURATION, 'max-h-[320px] opacity-100'),
            )}
            aria-hidden={isHeroCollapsed}
          >
            <div className="relative p-3 pr-10">
              <div className="flex items-start gap-3">
                <div className="w-48 shrink-0">
                  <div className={uiCx('group relative h-36 w-48 overflow-hidden', uiRadius.control, uiBorders.subtle)}>
                    <img src={companyAvatarLarge} className="h-full w-full object-cover" alt="" />
                    {hasEditPermission && (
                      <button
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={uiCx(uiTypography.sectionTitle, 'mb-2 truncate')}>{company.name}</h3>
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="min-w-0">
                      <div className={uiTypography.overline}>Address</div>
                      <div
                        className={uiCx(uiTypography.helper, 'mt-0.5 break-words font-semibold text-gray-900')}
                        title={addressLine}
                      >
                        {addressLine}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className={uiTypography.overline}>Primary contact</div>
                      <div
                        className={uiCx(uiTypography.helper, 'mt-0.5 break-words font-semibold text-gray-900')}
                        title={primaryContactLine}
                      >
                        {primaryContactLine}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className={uiTypography.overline}>Status</div>
                      <div className="mt-0.5">{companyStatusBadge(company.is_active)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={uiCx(
              HERO_PANEL_TRANSITION_BASE,
              HERO_PANEL_EASE,
              isHeroCollapsed
                ? uiCx(HERO_EXPAND_DURATION, 'max-h-[32px] opacity-100')
                : uiCx(HERO_COLLAPSE_DURATION, 'max-h-0 opacity-0'),
            )}
            aria-hidden={!isHeroCollapsed}
          >
            <div className="flex h-8 items-center justify-between gap-2 px-2.5 py-0">
              <h3 className={uiCx(uiTypography.sectionTitle, 'min-w-0 flex-1 truncate leading-none')}>{company.name}</h3>
              <div className="flex shrink-0 items-center gap-1">
                {companyStatusBadge(company.is_active)}
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-0.5 shrink-0 p-0.5"
                  onClick={() => setIsHeroCollapsed(false)}
                  title="Expand"
                  aria-label="Expand"
                >
                  <ChevronDown className="h-3 w-3" />
                </AppButton>
              </div>
            </div>
          </div>

          {!isHeroCollapsed ? (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="absolute bottom-2 right-2 z-20 p-1"
              onClick={() => setIsHeroCollapsed(true)}
              title="Collapse"
              aria-label="Collapse"
            >
              <ChevronUp className="h-3 w-3" />
            </AppButton>
          ) : null}
                </AppCard>

                <div className={!isHeroCollapsed ? '-mt-0.5' : undefined}>
                  <AppCard bodyClassName={isHeroCollapsed ? 'p-2.5' : 'p-3'}>
                    <AppTabs
                      tabs={appTabItems}
                      value={activeTabKey}
                      onChange={(key) =>
                        handleTabClick(key === 'overview' ? 'overview' : (key as Exclude<SubcontractorCompanyTab, null>))
                      }
                    />
                  </AppCard>
                </div>
              </div>

              <AppCard bodyClassName="p-5">
              {tab === null && company && (
                <SubcontractorCompanyOverviewTab
                  companyId={id}
                  company={company}
                  contacts={contactRows || []}
                  documentCount={documentCount}
                  onTabChange={(t) => goTab(t)}
                />
              )}

              {tab === 'general' && (
                <div className="space-y-6">
                  <AppCard>
                    <AppSectionHeader
                      title="Company"
                      description="Legal and trading identity for this subcontractor."
                      {...appSectionPresetProps('company')}
                      action={
                        hasEditPermission ? (
                          <AppHeroEditButton onClick={() => setGeneralEditSection('company')} title="Edit company" />
                        ) : null
                      }
                    />
                    <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
                      <ReadOnlyField label="Company name *" value={company.name} />
                      <ReadOnlyField label="Status" value={company.is_active ? 'Active' : 'Inactive'} />
                    </div>
                  </AppCard>
                  <AppCard>
                    <AppSectionHeader
                      title="Address"
                      description="Primary mailing and location address."
                      {...appSectionPresetProps('address')}
                      action={
                        hasEditPermission ? (
                          <AppHeroEditButton onClick={() => setGeneralEditSection('address')} title="Edit address" />
                        ) : null
                      }
                    />
                    <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
                      <ReadOnlyField label="Address 1" value={company.address_line1 as string} />
                      <ReadOnlyField label="Address 2" value={company.address_line2 as string} />
                      <ReadOnlyField label="Country" value={company.country as string} />
                      <ReadOnlyField label="Province/State" value={company.province as string} />
                      <ReadOnlyField label="City" value={company.city as string} />
                      <ReadOnlyField label="Postal code" value={company.postal_code as string} />
                    </div>
                  </AppCard>
                  <AppCard>
                    <AppSectionHeader
                      title="Notes"
                      description="Internal notes about this subcontractor company."
                      {...appSectionPresetProps('description')}
                      action={
                        hasEditPermission ? (
                          <AppHeroEditButton onClick={() => setGeneralEditSection('notes')} title="Edit notes" />
                        ) : null
                      }
                    />
                    <div className="mt-4">
                      <div className={uiCx(uiTypography.helper, 'whitespace-pre-wrap break-words font-medium text-gray-900')}>
                        {String(company.notes || '') || EM_DASH}
                      </div>
                    </div>
                  </AppCard>
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
                <SubcontractorWorkersCard
                  companyId={id}
                  workers={workers}
                  hasEditPermission={hasEditPermission}
                  workerListParams={workerListParams}
                  onWorkerFiltersChange={setWorkerFilters}
                  onNewWorker={() => setAddWorkerOpen(true)}
                  totalWorkers={totalWorkers}
                  activeWorkerCount={activeWorkerCount}
                  inactiveWorkerCount={inactiveWorkerCount}
                />
              )}
              </AppCard>
            </>
          )}
        </LoadingOverlay>

        {id && hasEditPermission && (
        <ImagePicker
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          targetWidth={800}
          targetHeight={600}
          allowEdit={true}
          onConfirm={async (blob) => {
            if (!id) return;
            try {
              const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
                project_id: null,
                client_id: null,
                employee_id: null,
                category_id: 'subcontractor-company-logo-derived',
                original_name: 'company-logo.jpg',
                content_type: 'image/jpeg',
              });
              await fetch(up.upload_url, {
                method: 'PUT',
                headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
                body: blob,
              });
              const conf: { id: string } = await api('POST', '/files/confirm', {
                key: up.key,
                size_bytes: blob.size,
                checksum_sha256: 'na',
                content_type: 'image/jpeg',
              });
              await api(
                'POST',
                `/subcontractors/companies/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=subcontractor-company-logo-derived&original_name=company-logo.jpg`,
              );
              toast.success('Logo updated');
              refetchCompanyFiles();
            } catch {
              toast.error('Failed to update logo');
            } finally {
              setPickerOpen(false);
            }
          }}
        />
      )}

      {id && (
        <NewSubcontractorWorkerModal
          open={addWorkerOpen}
          onClose={() => setAddWorkerOpen(false)}
          companyId={id}
          companyName={company?.name}
        />
      )}

      {id && company && (
        <EditSubcontractorCompanyGeneralModal
          open={generalEditSection !== null}
          section={generalEditSection}
          onClose={() => setGeneralEditSection(null)}
          companyId={id}
          company={company}
          companyDisplayName={company.name}
          activeWorkerCount={activeWorkerCount}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['subcontractor-company', id] });
            qc.invalidateQueries({ queryKey: ['subcontractor-companies'] });
          }}
        />
      )}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: ReactNode; value?: string | null }) {
  const display = String(value ?? '').trim();
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>
        {display || EM_DASH}
      </div>
    </div>
  );
}
