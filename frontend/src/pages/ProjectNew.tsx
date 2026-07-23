import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import NewContactModal from '@/components/NewContactModal';
import NewCustomerModal from '@/components/NewCustomerModal';
import SiteFormModal from '@/components/SiteFormModal';
import { DivisionIcon } from '@/components/DivisionIcon';
import {
  AppButton,
  AppClientSelect,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  AppInput,
  AppSectionHeader,
  AppSelect,
  AppTextarea,
  AppUserSelect,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { useBusinessLine } from '@/context/BusinessLineContext';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE, filterProjectDivisionsForBusinessLine, PROJECT_DIVISIONS_QUERY_KEY } from '@/lib/businessLine';
import { findCommercialServiceDivisionId, findLeakInvestigationDivisionId } from '@/lib/leakInvestigation';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { filterStatusesForProject } from '@/lib/projectStatusVisibility';
import { canEditCustomerRecord } from '@/lib/customerPermissions';
import {
  hasUsableCustomerAddress,
  resolveSiteIdForCustomerAddress,
  SITE_USE_CUSTOMER_ADDRESS,
  SITE_USE_CUSTOMER_ADDRESS_LABEL,
} from '@/lib/clientSiteFromCustomer';

type SiteMode = 'existing' | 'customer_address';

type Client = {
  id: string;
  display_name?: string;
  name?: string;
  city?: string;
  province?: string;
  address_line1?: string;
  address_line2?: string;
  postal_code?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
};
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string, site_postal_code?:string, site_address_line2?:string, site_lat?:number, site_lng?:number, site_notes?:string };

export default function ProjectNew(){
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const businessLine = useBusinessLine();
  const [sp] = useSearchParams();
  const initialClientId = sp.get('client_id')||'';
  const wantsLeakDivision = sp.get('division') === 'leak_investigations';
  const initialIsBidding = sp.get('is_bidding') === 'true';
  const initialSiteIdFromUrl = (sp.get('site_id') || '').trim();
  const initialEstimatorIdFromUrl = (sp.get('estimator_id') || '').trim();

  const [clientId, setClientId] = useState<string>(initialClientId);
  const [name, setName] = useState<string>('');
  const [desc, setDesc] = useState<string>('');
  const [siteId, setSiteId] = useState<string>(initialSiteIdFromUrl);
  const [siteMode, setSiteMode] = useState<SiteMode>(initialSiteIdFromUrl ? 'existing' : 'existing');
  const [newSiteModalOpen, setNewSiteModalOpen] = useState(false);
  const [step, setStep] = useState<number>(1);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [divisionIds, setDivisionIds] = useState<string[]>([]); // Legacy support
  const [projectDivisionIds, setProjectDivisionIds] = useState<string[]>([]); // New project divisions
  const [estimatorId, setEstimatorId] = useState<string>(initialEstimatorIdFromUrl);
  const [leadId, setLeadId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [coverBlob, setCoverBlob] = useState<Blob|null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [hiddenPickerOpen, setHiddenPickerOpen] = useState<boolean>(false);
  const [relatedClientIds, setRelatedClientIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newContactModalOpen, setNewContactModalOpen] = useState(false);
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  const [newCustomerInitialName, setNewCustomerInitialName] = useState('');
  const [newCustomerTarget, setNewCustomerTarget] = useState<'owner' | 'related'>('owner');
  /** Step 2 division picker: expand parents that have subdivisions (same UX as Edit Project Divisions). */
  const [newOppExpandedDivisions, setNewOppExpandedDivisions] = useState<Set<string>>(new Set());
  const { data:sites } = useQuery({ queryKey:['clientSites', clientId], queryFn: ()=> clientId? api<Site[]>('GET', `/clients/${encodeURIComponent(clientId)}/sites`) : Promise.resolve([]), enabled: !!clientId });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=> api<any>('GET','/settings') });
  const { data:projectDivisions, isLoading: divisionsLoading } = useQuery({ queryKey:PROJECT_DIVISIONS_QUERY_KEY, queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const canCreateCustomer = useMemo(() => {
    const isAdmin = (me?.roles || []).includes('admin');
    const permissions = new Set<string>(me?.permissions || []);
    return canEditCustomerRecord(isAdmin, permissions);
  }, [me]);

  const openCreateCustomerFromSearch = useCallback((target: 'owner' | 'related', q: string) => {
    setNewCustomerTarget(target);
    setNewCustomerInitialName(q);
    setNewCustomerModalOpen(true);
  }, []);

  const closeNewCustomerModal = useCallback(() => {
    setNewCustomerModalOpen(false);
    setNewCustomerInitialName('');
  }, []);

  const openCreateContact = useCallback(() => {
    setNewContactModalOpen(true);
  }, []);

  const openCreateNewSite = useCallback(() => {
    setNewSiteModalOpen(true);
  }, []);

  const handleSiteSelectChange = useCallback((e: { target: { value: string } }) => {
    const value = e.target.value;
    if (value === SITE_USE_CUSTOMER_ADDRESS) {
      setSiteMode('customer_address');
      setSiteId(SITE_USE_CUSTOMER_ADDRESS);
      return;
    }
    setSiteMode('existing');
    setSiteId(value);
  }, []);
  const divisionsForPicker = useMemo(
    () => filterProjectDivisionsForBusinessLine(projectDivisions, businessLine),
    [projectDivisions, businessLine]
  );
  const leakDivisionId = useMemo(
    () => findLeakInvestigationDivisionId(divisionsForPicker),
    [divisionsForPicker]
  );
  const commercialServiceDivisionId = useMemo(
    () => findCommercialServiceDivisionId(divisionsForPicker),
    [divisionsForPicker]
  );
  const startedAsOpportunity = initialIsBidding && !wantsLeakDivision;
  const isCreatingLeakInvestigation = !!(
    leakDivisionId && projectDivisionIds.includes(leakDivisionId)
  );
  const isBidding = startedAsOpportunity && !isCreatingLeakInvestigation;

  useEffect(() => {
    if (!wantsLeakDivision || !leakDivisionId) return;
    setProjectDivisionIds((prev) =>
      prev.includes(leakDivisionId) ? prev : [...prev, leakDivisionId]
    );
    if (commercialServiceDivisionId) {
      setNewOppExpandedDivisions((prev) => {
        const next = new Set(prev);
        next.add(commercialServiceDivisionId);
        return next;
      });
    }
  }, [wantsLeakDivision, leakDivisionId, commercialServiceDivisionId]);
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=> api<any[]>('GET','/employees') });

  const ESTIMATOR_DEPARTMENT = 'Sales / Estimating';
  const employeesInEstimatingDept = useMemo(() => {
    const list = employees || [];
    const target = ESTIMATOR_DEPARTMENT.toLowerCase();
    return list.filter((emp: any) => {
      if (Array.isArray(emp.divisions) && emp.divisions.length > 0) {
        return emp.divisions.some((d: any) => String(d?.label || '').trim().toLowerCase() === target);
      }
      const dept = String((emp.department || emp.division || '')).trim();
      return dept.toLowerCase().includes(target);
    });
  }, [employees]);

  const limitEstimatorListToSalesDept = isBidding || isCreatingLeakInvestigation;

  useEffect(() => {
    if (!limitEstimatorListToSalesDept || employees === undefined) return;
    const ids = new Set(employeesInEstimatingDept.map((e: any) => String(e.id)));
    if (estimatorId && !ids.has(estimatorId)) setEstimatorId('');
  }, [limitEstimatorListToSalesDept, employees, employeesInEstimatingDept, estimatorId]);

  const employeesForEstimatorSelect = limitEstimatorListToSalesDept ? employeesInEstimatingDept : employees || [];
  const estimatorUserOptions = useMemo(
    () => employeesForEstimatorSelect.map((emp: any) => mapEmployeeToAppUserSelect(emp)),
    [employeesForEstimatorSelect],
  );
  const { data:contacts } = useQuery({ queryKey:['clientContacts-mini', clientId], queryFn: ()=> clientId? api<any[]>('GET', `/clients/${encodeURIComponent(clientId)}/contacts`) : Promise.resolve([]), enabled: !!clientId });

  const { data: clientById } = useQuery({
    queryKey: ['client-detail-project-new', clientId],
    queryFn: () => api<Client>('GET', `/clients/${encodeURIComponent(String(clientId || '').trim())}`),
    enabled: !!String(clientId || '').trim(),
    staleTime: 60_000,
  });

  const selectedClient = useMemo(() => {
    if (!clientId) return null;
    const c = clientById as Client | undefined;
    if (c && String(c.id) === clientId) return c;
    return null;
  }, [clientId, clientById]);

  const contactSelectOptions = useMemo(
    () =>
      sortByLabel(contacts || [], (c: any) => (c.name || c.email || c.phone || c.id || '').toString()).map((c: any) => ({
        value: String(c.id),
        label: (c.name || c.email || c.phone || c.id || '').toString(),
      })),
    [contacts],
  );

  const siteSelectOptions = useMemo(
    () =>
      sortByLabel(sites || [], (s) => (s.site_name || s.site_address_line1 || String(s.id)).toString()).map((s) => {
        const label = (s.site_name || s.site_address_line1 || String(s.id)).toString();
        const address = [s.site_address_line1, s.site_city, s.site_province].filter(Boolean).join(', ');
        return {
          value: String(s.id),
          label: address && address !== label ? `${label} — ${address}` : label,
        };
      }),
    [sites],
  );

  const siteOptionGroups = useMemo(() => {
    const groups: { label: string; options: { value: string; label: string }[] }[] = [];
    if (hasUsableCustomerAddress(selectedClient)) {
      groups.push({
        label: '',
        options: [{ value: SITE_USE_CUSTOMER_ADDRESS, label: SITE_USE_CUSTOMER_ADDRESS_LABEL }],
      });
    }
    groups.push({
      label: 'Existing sites',
      options: siteSelectOptions,
    });
    return groups;
  }, [selectedClient, siteSelectOptions]);

  const siteSelectValue =
    siteMode === 'customer_address'
      ? SITE_USE_CUSTOMER_ADDRESS
      : siteMode === 'existing'
        ? siteId
        : '';

  const statusSelectOptions = useMemo(
    () =>
      sortByLabel(filterStatusesForProject(settings?.project_statuses || []), (s: any) => (s.label || '').toString()).map(
        (s: any) => ({ value: s.label, label: s.label }),
      ),
    [settings?.project_statuses],
  );

  const leadUserOptions = useMemo(
    () => sortByLabel(employees || [], (emp: any) => (emp.name || emp.username || '').toString()).map((emp: any) => mapEmployeeToAppUserSelect(emp)),
    [employees],
  );

  useEffect(() => {
    if (!initialClientId) return;
    setClientId(initialClientId);
  }, [initialClientId]);

  useEffect(() => {
    if (!clientId) return;
    setRelatedClientIds((prev) => prev.filter((id) => id !== clientId));
  }, [clientId]);

  useEffect(() => {
    if (!clientId) {
      setSiteId('');
      setSiteMode('existing');
      setNewSiteModalOpen(false);
    }
  }, [clientId]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Step 1 → Step 2: only basic details (name, client, site). Divisions are on step 2.
  const canGoToStep2 = useMemo(() => {
    if (!String(name || '').trim()) return false;
    if (!String(clientId || '').trim()) return false;
    if (siteMode === 'customer_address') {
      return hasUsableCustomerAddress(selectedClient);
    }
    if (!String(siteId || '').trim() || siteId === SITE_USE_CUSTOMER_ADDRESS) return false;
    return true;
  }, [name, clientId, siteId, siteMode, selectedClient]);

  // Final submit: for opportunities also require at least one division (chosen on step 2).
  const canSubmit = useMemo(()=>{
    if(!canGoToStep2) return false;
    if(isBidding && projectDivisionIds.length === 0) return false;
    return true;
  }, [canGoToStep2, isBidding, projectDivisionIds.length]);

  const submit = async()=>{
    if(!canSubmit || isSubmitting) return;
    if(isBidding && projectDivisionIds.length === 0) {
      toast.error('Select at least one division for this opportunity');
      return;
    }
    try {
      setIsSubmitting(true);
      let newSiteId = siteId;
      let shouldInvalidateSites = false;

      if (siteMode === 'customer_address') {
        const client = selectedClient;
        if (!client || !hasUsableCustomerAddress(client)) {
          toast.error('Customer address is required to use this site option');
          setIsSubmitting(false);
          return;
        }
        const { siteId: resolvedId, created } = await resolveSiteIdForCustomerAddress(
          client,
          sites || [],
          (payload) => api<{ id: string }>('POST', `/clients/${encodeURIComponent(clientId)}/sites`, payload),
        );
        newSiteId = resolvedId;
        shouldInvalidateSites = created;
      }

      if (shouldInvalidateSites) {
        queryClient.invalidateQueries({ queryKey: ['clientSites', clientId] });
      }
      // For opportunities, status will be automatically set to "Prospecting" by the backend
      const payload:any = { 
        name, 
        description: desc||null, 
        client_id: clientId, 
        site_id: newSiteId||null, 
        status_label: isBidding
          ? null
          : isCreatingLeakInvestigation
            ? 'In Progress'
            : (statusLabel || null),
        division_ids: divisionIds,
        project_division_ids: projectDivisionIds.length > 0 ? projectDivisionIds : null,
        estimator_id: estimatorId||null, 
        onsite_lead_id: leadId||null, 
        contact_id: contactId||null, 
        is_bidding: isBidding,
        related_client_ids: relatedClientIds.length > 0 ? relatedClientIds : null,
        business_line: businessLine,
      };
      const proj:any = await api('POST','/projects', payload);
      if(coverBlob){
        try{
          const up:any = await api('POST','/files/upload',{ project_id: proj?.id||null, client_id: clientId, employee_id:null, category_id:'project-cover-derived', original_name:'project-cover.jpg', content_type:'image/jpeg' });
          await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: coverBlob });
          const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: coverBlob.size, checksum_sha256:'na', content_type:'image/jpeg' });
          await api('POST', `/projects/${encodeURIComponent(String(proj?.id||''))}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`);
        }catch(_e){ /* silent */ }
      }
      toast.success(isBidding ? 'Opportunity created' : 'Project created');
      queryClient.removeQueries({ queryKey: ['opportunities'] });
      queryClient.removeQueries({ queryKey: ['projects'] });
      const newId = String(proj?.id || '');
      if (newId) {
        queryClient.invalidateQueries({ queryKey: ['project', newId] });
        queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', newId] });
      }
      const oppPath = businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-opportunities' : '/opportunities';
      const projPath = businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
      if (isBidding) {
        nav(`${oppPath}/${encodeURIComponent(newId)}`);
      } else {
        nav(`${projPath}/${encodeURIComponent(newId)}`);
      }
      // Don't reset isSubmitting here - let the component unmount handle it
      return; // Exit early to prevent finally from resetting state
    }catch(_e){ 
      toast.error('Failed to create project'); 
      setIsSubmitting(false); // Only reset on error
    }
  };

  const modalTitle = isBidding ? 'New Opportunity' : 'New Project';
  const stepSubtitle =
    step === 1
      ? 'Basic details and site'
      : isBidding
        ? 'Select divisions, then team and cover'
        : 'Options and cover';

  const stepPillClass = (n: number) =>
    uiCx(
      'rounded-full px-2 py-1 text-[10px] font-medium',
      step === n ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600',
    );

  const stepIndicators = (
    <div className={uiCx(uiLayout.actionsRow, uiTypography.helper, 'text-[10px] font-medium')}>
      <span className={stepPillClass(1)}>Step 1</span>
      <span className="text-gray-400">→</span>
      <span className={stepPillClass(2)}>Step 2</span>
    </div>
  );

  const modalFooter = (
    <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
      <span className={uiTypography.helper}>{step === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
      <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
        <AppButton type="button" variant="secondary" size="sm" onClick={() => nav(-1)}>
          Cancel
        </AppButton>
        {step === 1 ? (
          <AppButton type="button" size="sm" disabled={!canGoToStep2} onClick={() => setStep(2)}>
            Next
          </AppButton>
        ) : (
          <>
            <AppButton type="button" variant="secondary" size="sm" disabled={isSubmitting} onClick={() => setStep(1)}>
              Back
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={!canSubmit || isSubmitting}
              loading={isSubmitting}
              onClick={() => void submit()}
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </AppButton>
          </>
        )}
      </div>
    </div>
  );

  const formQuickInfo =
    isBidding ? (
      <>
        <p>Step 1: opportunity name, customer, and site. Step 2: pick at least one division, then estimator and optional cover.</p>
        {isBidding ? <p>Status is set to Prospecting automatically when the opportunity is created.</p> : null}
      </>
    ) : (
      <>
        <p>Step 1: project name, customer, and site. Step 2: divisions, status, team, and cover.</p>
      </>
    );

  return (
    <>
      <AppFormModal
        open
        onClose={() => nav(-1)}
        formWidth="wide"
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        title={modalTitle}
        description={stepSubtitle}
        headerExtra={stepIndicators}
        quickInfo={formQuickInfo}
        footer={modalFooter}
      >
        {step === 1 ? (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Details"
              description="Name, customer, contacts, and site for this record."
            />
            <div className="grid gap-3 md:grid-cols-2">
              <AppInput
                className="md:col-span-2"
                label="Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fieldHint="Name\n\nTitle shown in lists and on the project or opportunity card."
              />
              <div className="md:col-span-2">
                <AppClientSelect
                label="Project Owner / Source *"
                value={clientId}
                onChange={(id) => {
                  setClientId(id);
                  if (!id) setContactId('');
                }}
                placeholder="Search or select customer…"
                emptyMessage="No customers found."
                fieldHint="Project Owner / Source\n\nPrimary customer for this record."
                onCreateNew={
                  canCreateCustomer ? (q) => openCreateCustomerFromSearch('owner', q) : undefined
                }
                />
              </div>
              <div className="md:col-span-2">
                <AppClientSelect
                  mode="multiple"
                  label="Related Customers"
                  value={relatedClientIds}
                  onChange={setRelatedClientIds}
                  excludeClientId={clientId}
                  placeholder="Search or add related customers…"
                  emptyMessage="No customers found."
                  fieldHint="Related Customers\n\nOptional additional customers linked to this record."
                  onCreateNew={
                    canCreateCustomer ? (q) => openCreateCustomerFromSearch('related', q) : undefined
                  }
                />
              </div>
              {!!clientId && (
                <div className="md:col-span-2">
                  <AppSelect
                    label="Customer contact"
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                    options={contactSelectOptions}
                    placeholder="Select contact…"
                    emptyMessage="No contacts found."
                    fieldHint="Customer contact\n\nPrimary contact at the customer for this record."
                    createNewPlacement="footer"
                    onCreateNew={() => openCreateContact()}
                  />
                </div>
              )}
              <AppTextarea
                className="md:col-span-2"
                label="Description"
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                fieldHint="Description\n\nOptional notes about scope or context."
              />
            </div>
            {!!clientId && (
              <div className={uiSpacing.sectionStack}>
                <AppSectionHeader
                  title="Site"
                  description="Pick an existing site, use the customer's address, or create a new site."
                />
                <AppSelect
                  id="project-new-site"
                  label="Site *"
                  value={siteSelectValue}
                  onChange={handleSiteSelectChange}
                  optionGroups={siteOptionGroups}
                  sortOptions={false}
                  placeholder="Select site…"
                  emptyMessage="No sites found."
                  fieldHint={
                    'Site\n\nJob location for this record. Using the customer address reuses an existing matching site or creates one named "Main address".'
                  }
                  createNewPlacement="footer"
                  onCreateNew={openCreateNewSite}
                />
              </div>
            )}
          </div>
        ) : (
          <div className={uiSpacing.sectionStack}>
            <AppSectionHeader
              title="Divisions & team"
              description={
                isBidding
                  ? 'Select at least one division, then assign team and optional cover.'
                  : 'Divisions, status, team, and optional cover.'
              }
            />
            <div className="space-y-3">
              <AppControlLabelRow
                label={
                  <>
                    Project divisions {isBidding ? <span className="text-red-600">*</span> : null}
                  </>
                }
                fieldHint={
                  <AppFieldHint
                    hint={
                      isBidding
                        ? 'Project divisions\n\nSelect at least one division for this opportunity.'
                        : 'Project divisions\n\nOptional divisions for this project.'
                    }
                  />
                }
              />
              {isBidding && projectDivisionIds.length === 0 && (
                <p className="text-xs text-red-600">
                  Select at least one division for this opportunity
                </p>
              )}
              {startedAsOpportunity && isCreatingLeakInvestigation && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Leak Investigations are created as projects, not opportunities.
                </p>
              )}
                  <div className="rounded-lg border border-gray-200 bg-white overflow-hidden divide-y divide-gray-200">
                    {divisionsLoading ? (
                      <div className="text-xs text-gray-500 text-center py-6">Loading project divisions…</div>
                    ) : divisionsForPicker && divisionsForPicker.length > 0 ? (
                        (divisionsForPicker || []).map((div: any) => {
                          const divId = String(div.id);
                          const subdivisions = Array.isArray(div.subdivisions) ? div.subdivisions : [];
                          const hasSubdivisions = subdivisions.length > 0;
                          const isExpanded = newOppExpandedDivisions.has(divId);
                          return (
                            <div key={divId} className="overflow-hidden bg-white">
                              <button
                                type="button"
                                onClick={() => {
                                  if (hasSubdivisions) {
                                    setNewOppExpandedDivisions((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(divId)) next.delete(divId);
                                      else next.add(divId);
                                      return next;
                                    });
                                  } else {
                                    setProjectDivisionIds((prev) =>
                                      prev.includes(divId) ? prev.filter((x) => x !== divId) : [...prev, divId]
                                    );
                                  }
                                }}
                                className={`w-full text-left px-3 py-2.5 text-sm font-medium flex items-center gap-2 transition-colors ${
                                  hasSubdivisions
                                    ? 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                                    : projectDivisionIds.includes(divId)
                                      ? 'bg-indigo-50 text-gray-900 border-l-2 border-l-indigo-500'
                                      : 'bg-white hover:bg-gray-50 text-gray-900'
                                }`}
                              >
                                {hasSubdivisions && (
                                  <span className="text-gray-500 text-xs w-4 flex-shrink-0">
                                    {isExpanded ? '▼' : '▶'}
                                  </span>
                                )}
                                {!hasSubdivisions && <span className="w-4 flex-shrink-0" aria-hidden />}
                                <span className="text-lg flex-shrink-0">
                                  <DivisionIcon label={div.label || ''} size={20} />
                                </span>
                                <span className="min-w-0">{div.label}</span>
                              </button>
                              {hasSubdivisions && isExpanded && (
                                <div className="px-2 pb-2 pt-0 space-y-1 border-t border-gray-100 bg-gray-50/80">
                                  {subdivisions.map((sub: any) => {
                                    const subId = String(sub.id);
                                    const subSelected = projectDivisionIds.includes(subId);
                                    return (
                                      <button
                                        key={subId}
                                        type="button"
                                        onClick={() =>
                                          setProjectDivisionIds((prev) =>
                                            prev.includes(subId) ? prev.filter((x) => x !== subId) : [...prev, subId]
                                          )
                                        }
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                                          subSelected
                                            ? 'bg-indigo-50 text-gray-900 border border-indigo-200'
                                            : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-800'
                                        }`}
                                      >
                                        <span className="text-base flex-shrink-0">
                                          <DivisionIcon label={sub.label || div.label || ''} size={18} />
                                        </span>
                                        <span className="min-w-0">• {sub.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                    ) : (
                      <div className="text-xs text-gray-500 text-center py-6">
                        No project divisions available. Please run the seed script.
                      </div>
                    )}
                  </div>
                  {/* Legacy divisions support (deprecated) — hidden for opportunities and leak investigations */}
                  {!isBidding && !isCreatingLeakInvestigation && settings?.divisions && settings.divisions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <label className="text-xs text-gray-500">Legacy Divisions (deprecated)</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(settings.divisions || []).map((d: any) => {
                          const id = String(d.id || d.label || d.value);
                          const selected = divisionIds.includes(id);
                          const bg = d.meta?.color || '#eef2f7';
                          const ab = d.meta?.abbr || d.label || id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() =>
                                setDivisionIds((prev) =>
                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                )
                              }
                              className={`px-2 py-1 rounded-full border text-xs ${selected ? 'ring-2 ring-brand-red' : ''}`}
                              style={{ backgroundColor: bg }}
                            >
                              {ab}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  </div>

            <div className="grid gap-3 border-t border-gray-200 pt-4 md:grid-cols-2">
              {!isBidding && !isCreatingLeakInvestigation && (
                <AppSelect
                  label="Status"
                  value={statusLabel}
                  onChange={(e) => setStatusLabel(e.target.value)}
                  options={[{ value: '', label: 'Select status…' }, ...statusSelectOptions]}
                  searchable
                  placeholder="Search or select status…"
                  fieldHint="Status\n\nInitial project status after creation."
                />
              )}
              <AppUserSelect
                label="Estimator"
                value={estimatorId}
                onChange={setEstimatorId}
                users={estimatorUserOptions}
                placeholder="Search or select user…"
                showSelectedChip={false}
                emptyMessage={
                  limitEstimatorListToSalesDept ? 'No users in Sales / Estimating.' : 'No estimators found'
                }
                fieldHint={
                  limitEstimatorListToSalesDept
                    ? 'Estimator\n\nUsers from Sales / Estimating department.'
                    : 'Estimator\n\nOptional estimator assigned to this record.'
                }
              />
              {!isBidding && (
                <AppUserSelect
                  label="On-site lead"
                  value={leadId}
                  onChange={setLeadId}
                  users={leadUserOptions}
                  placeholder="Search or select user…"
                  showSelectedChip={false}
                  emptyMessage="No employees found"
                  fieldHint="On-site lead\n\nEmployee leading work on site."
                />
              )}
              <div className="md:col-span-2">
                <AppSectionHeader title="Cover" description="Optional image for cards and headers." />
                <div className={uiCx(uiLayout.actionsRow, 'mt-2 flex-wrap items-center')}>
                  <AppButton type="button" size="sm" onClick={() => setHiddenPickerOpen(true)}>
                    Select cover
                  </AppButton>
                  {coverPreview ? (
                    <img
                      src={coverPreview}
                      className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
                      alt=""
                    />
                  ) : null}
                  {coverPreview ? (
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setCoverBlob(null);
                        setCoverPreview('');
                      }}
                    >
                      Remove cover
                    </AppButton>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </AppFormModal>
    {hiddenPickerOpen && (
      <ImagePicker isOpen={true} onClose={()=> setHiddenPickerOpen(false)} clientId={String(clientId||'')} targetWidth={800} targetHeight={800} allowEdit={true} onConfirm={async(blob)=>{
        try{ setCoverBlob(blob); setCoverPreview(URL.createObjectURL(blob)); }catch(_e){} finally{ setHiddenPickerOpen(false); }
      }} />
    )}
    <NewContactModal
      open={newContactModalOpen}
      onClose={() => setNewContactModalOpen(false)}
      clientId={clientId}
      clientDisplayName={selectedClient?.display_name || selectedClient?.name || ''}
      stackOnTop
      onCreated={(c) => {
        queryClient.invalidateQueries({ queryKey: ['clientContacts-mini', clientId] });
        setContactId(c.id);
      }}
    />
    <SiteFormModal
      open={newSiteModalOpen}
      onClose={() => setNewSiteModalOpen(false)}
      clientId={clientId}
      clientDisplayName={selectedClient?.display_name || selectedClient?.name || ''}
      overlayClassName={uiModalLayer.stacked}
      onCreated={(site) => {
        queryClient.invalidateQueries({ queryKey: ['clientSites', clientId] });
        setSiteMode('existing');
        setSiteId(site.id);
        setNewSiteModalOpen(false);
      }}
    />
    {newCustomerModalOpen ? (
      <NewCustomerModal
        stackOnTop
        initialDisplayName={newCustomerInitialName}
        onClose={closeNewCustomerModal}
        onSuccess={(customerId) => {
          const id = String(customerId || '').trim();
          if (!id) {
            closeNewCustomerModal();
            return;
          }
          queryClient.invalidateQueries({ queryKey: ['app-client-select-catalog'] });
          queryClient.invalidateQueries({ queryKey: ['clients'] });
          if (newCustomerTarget === 'owner') {
            setClientId(id);
            setContactId('');
            queryClient.invalidateQueries({ queryKey: ['client-detail-project-new', id] });
          } else {
            setRelatedClientIds((prev) => {
              if (prev.some((x) => String(x).trim() === id)) return prev;
              return [...prev, id];
            });
          }
          closeNewCustomerModal();
        }}
      />
    ) : null}
    </>
  );
}

