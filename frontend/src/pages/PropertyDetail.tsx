import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import PropertyHeroBar from '@/components/properties/PropertyHeroBar';
import PropertyLocationMap from '@/components/properties/PropertyLocationMap';
import PropertyFilesTab from '@/components/properties/PropertyFilesTab';
import { formatPropertyAddress } from '@/lib/propertyListUtils';
import {
  canEditProperty,
  canReadPropertyDocuments,
  canReadPropertyPermits,
  canWritePropertyDocuments,
  canWritePropertyPermits,
  type PropertyTab,
} from '@/lib/propertiesPermissions';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  propertyInsuranceQuickInfo,
  propertyLeaseQuickInfo,
  propertyMaintenanceQuickInfo,
  propertyPeopleQuickInfo,
  propertyPermitQuickInfo,
  propertyTaxQuickInfo,
} from '@/lib/formModalQuickInfo';
import { Building2, ClipboardList, Clock, FileText, Receipt, Shield, Users } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppDatePicker,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppPageHeader,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppTabs,
  AppTextarea,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type PropertyDetailData = {
  id: string;
  name: string;
  property_type?: string;
  ownership: string;
  visibility: string;
  status: string;
  address_line1?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  notes?: string;
  image_file_object_id?: string | null;
  owner_summary?: string;
  owners: Array<{
    entity_id: string;
    ownership_percentage?: number;
    entity_display_name?: string;
    entity_legal_name?: string;
  }>;
  ownership_percentage_total?: number;
  access_user_ids?: string[];
};

type Lease = {
  id: string;
  role: string;
  status: string;
  counterparty_name?: string;
  base_rent?: number;
  rent_frequency?: string;
  currency?: string;
  start_date?: string;
  end_date?: string;
  renewal_date?: string;
  notes?: string;
};

type Policy = {
  id: string;
  provider?: string;
  broker?: string;
  policy_number?: string;
  policy_type?: string;
  expiry_date?: string;
  annual_premium?: number;
  notes?: string;
};

type TaxRecord = {
  id: string;
  tax_year: number;
  jurisdiction?: string;
  assessed_value?: number;
  tax_amount?: number;
  due_date?: string;
  paid_date?: string;
  status: string;
  notes?: string;
};

type Permit = {
  id: string;
  title?: string;
  permit_type?: string;
  permit_number?: string;
  authority?: string;
  stage: string;
  issued_date?: string;
  expiry_date?: string;
  compliance_label?: string;
  compliance_status?: string;
  notes?: string;
};

type Responsibility = {
  id: string;
  role: string;
  user_display_name?: string;
  contact_name?: string;
  contact_company?: string;
  contact_phone?: string;
  contact_email?: string;
  notes?: string;
};

type MaintenanceItem = {
  id: string;
  title: string;
  item_type?: string;
  frequency?: string;
  next_due_date?: string;
  last_completed_date?: string;
  status: string;
  notes?: string;
};

const TABS: { id: PropertyTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'leases', label: 'Leases' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'tax', label: 'Tax' },
  { id: 'permits', label: 'Permits' },
  { id: 'people', label: 'People' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'documents', label: 'Files' },
];

const LEASES_GRID = 'grid-cols-[6.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_6.5rem_auto]';
const INSURANCE_GRID = 'grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_7rem_auto]';
const TAX_GRID = 'grid-cols-[5rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_6.5rem_auto]';
const PERMITS_GRID = 'grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_7rem_7rem_auto]';
const PEOPLE_GRID = 'grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]';
const MAINT_GRID = 'grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_7rem_7rem_6.5rem_auto]';

const PEOPLE_ROLES = [
  'electrical',
  'hvac',
  'roof',
  'security',
  'landscaping',
  'property_manager',
  'broker',
  'other',
].map((r) => ({ value: r, label: r.replace(/_/g, ' ') }));

const PERMIT_STAGES = [
  { value: 'identified', label: 'Identified' },
  { value: 'applying', label: 'Applying' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'conditions', label: 'Conditions' },
  { value: 'issued', label: 'Issued' },
  { value: 'closed', label: 'Closed' },
];

const fmtDate = (value?: string) => (value ? formatDateLocal(new Date(value)) : '');

export default function PropertyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as PropertyTab) || 'overview';
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const perms = me?.permissions || [];
  const roles = me?.roles || [];

  const { data: property, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: () => api<PropertyDetailData>('GET', `/properties/${id}`),
    enabled: !!id,
  });

  const canEdit = property ? canEditProperty(property.visibility, perms, roles) : false;
  const canWritePermits = canWritePropertyPermits(perms, roles);
  const canWriteDocs = canWritePropertyDocuments(perms, roles);

  const { data: leases } = useQuery({
    queryKey: ['property-leases', id],
    queryFn: () => api<Lease[]>('GET', `/properties/${id}/leases`),
    enabled: !!id && (tab === 'leases' || tab === 'overview'),
  });

  const { data: policies } = useQuery({
    queryKey: ['property-insurance', id],
    queryFn: () => api<Policy[]>('GET', `/properties/${id}/insurance`),
    enabled: !!id && (tab === 'insurance' || tab === 'overview'),
  });

  const { data: taxRecords } = useQuery({
    queryKey: ['property-tax', id],
    queryFn: () => api<TaxRecord[]>('GET', `/properties/${id}/tax`),
    enabled: !!id && (tab === 'tax' || tab === 'overview'),
  });

  const { data: permits } = useQuery({
    queryKey: ['property-permits', id],
    queryFn: () => api<Permit[]>('GET', `/properties/${id}/permits`),
    enabled: !!id && (tab === 'permits' || tab === 'overview') && canReadPropertyPermits(perms, roles),
  });

  const { data: people } = useQuery({
    queryKey: ['property-people', id],
    queryFn: () => api<Responsibility[]>('GET', `/properties/${id}/responsibilities`),
    enabled: !!id && tab === 'people',
  });

  const { data: maintenance } = useQuery({
    queryKey: ['property-maintenance', id],
    queryFn: () => api<MaintenanceItem[]>('GET', `/properties/${id}/maintenance`),
    enabled: !!id && tab === 'maintenance',
  });

  const activeLease = useMemo(() => leases?.find((l) => l.status === 'active' || l.status === 'expiring'), [leases]);
  const nextTax = useMemo(() => taxRecords?.find((t) => t.status !== 'paid'), [taxRecords]);
  const nextInsurance = useMemo(() => policies?.[0], [policies]);

  const setTab = (t: PropertyTab) => {
    setSearchParams({ tab: t });
  };

  const [editOpen, setEditOpen] = useState(false);
  const [editCoordsTouched, setEditCoordsTouched] = useState(false);
  const [editCoordsFromAutocomplete, setEditCoordsFromAutocomplete] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    property_type: 'office',
    ownership: 'owned',
    visibility: 'company',
    status: 'active',
    address_line1: '',
    city: '',
    province: '',
    postal_code: '',
    country: '',
    lat: '',
    lng: '',
    notes: '',
  });
  const [editOwners, setEditOwners] = useState<Array<{ entity_id: string; ownership_percentage?: number }>>([]);
  const [ownerEntityId, setOwnerEntityId] = useState('');
  const [ownerPct, setOwnerPct] = useState('');

  const { data: entities } = useQuery({
    queryKey: ['property-entities'],
    queryFn: () => api<Array<{ id: string; legal_name: string; display_name?: string }>>('GET', '/properties/entities'),
  });

  const openEditProperty = () => {
    if (!property) return;
    setEditCoordsTouched(false);
    setEditCoordsFromAutocomplete(false);
    setEditForm({
      name: property.name,
      property_type: property.property_type || 'office',
      ownership: property.ownership,
      visibility: property.visibility,
      status: property.status,
      address_line1: property.address_line1 || '',
      city: property.city || '',
      province: property.province || '',
      postal_code: property.postal_code || '',
      country: property.country || '',
      lat: property.lat != null ? String(property.lat) : '',
      lng: property.lng != null ? String(property.lng) : '',
      notes: property.notes || '',
    });
    setEditOwners(
      property.owners.map((o) => ({
        entity_id: o.entity_id,
        ownership_percentage: o.ownership_percentage,
      })),
    );
    setEditOpen(true);
  };

  const saveProperty = async () => {
    if (!id) return;
    try {
      const body: Record<string, unknown> = {
        ...editForm,
        owners: editOwners,
      };
      if (editCoordsTouched || editCoordsFromAutocomplete) {
        body.lat = editForm.lat ? Number(editForm.lat) : null;
        body.lng = editForm.lng ? Number(editForm.lng) : null;
      } else {
        delete body.lat;
        delete body.lng;
      }
      await api('PATCH', `/properties/${id}`, body);
      toast.success('Property updated');
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['property', id] });
      qc.invalidateQueries({ queryKey: ['properties-list'] });
    } catch (e: any) {
      toast.error(e?.message || 'Update failed');
    }
  };

  const deleteProperty = async () => {
    if (!id) return;
    const result = await confirm({
      title: 'Delete property?',
      message: 'This removes the property from the register. Related records remain in the database but the property will be hidden.',
      confirmText: 'Delete',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/properties/${id}`);
      toast.success('Property deleted');
      nav('/properties/list');
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  const deleteRecord = async (path: string, label: string) => {
    const result = await confirm({ title: `Delete ${label}?`, message: 'This cannot be undone.', confirmText: 'Delete' });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', path);
      toast.success('Deleted');
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed');
    }
  };

  const [leaseModal, setLeaseModal] = useState(false);
  const [editingLeaseId, setEditingLeaseId] = useState<string | null>(null);
  const [leaseForm, setLeaseForm] = useState({
    role: 'landlord',
    status: 'active',
    counterparty_name: '',
    base_rent: '',
    rent_frequency: 'monthly',
    start_date: '',
    end_date: '',
    renewal_date: '',
  });

  const saveLease = async () => {
    try {
      const body = {
        ...leaseForm,
        base_rent: leaseForm.base_rent ? Number(leaseForm.base_rent) : null,
        start_date: leaseForm.start_date || null,
        end_date: leaseForm.end_date || null,
        renewal_date: leaseForm.renewal_date || null,
      };
      if (editingLeaseId) {
        await api('PATCH', `/properties/${id}/leases/${editingLeaseId}`, body);
      } else {
        await api('POST', `/properties/${id}/leases`, body);
      }
      toast.success('Lease saved');
      resetLeaseModal();
      qc.invalidateQueries({ queryKey: ['property-leases', id] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const addEditOwner = () => {
    if (!ownerEntityId) return;
    if (editOwners.some((o) => o.entity_id === ownerEntityId)) {
      toast.error('Owner already added');
      return;
    }
    setEditOwners([
      ...editOwners,
      { entity_id: ownerEntityId, ownership_percentage: ownerPct ? Number(ownerPct) : undefined },
    ]);
    setOwnerEntityId('');
    setOwnerPct('');
  };

  const openPolicyEdit = (p: Policy) => {
    setEditingPolicyId(p.id);
    setPolicyForm({
      provider: p.provider || '',
      broker: p.broker || '',
      policy_number: p.policy_number || '',
      policy_type: p.policy_type || '',
      expiry_date: p.expiry_date || '',
      annual_premium: p.annual_premium != null ? String(p.annual_premium) : '',
      notes: p.notes || '',
    });
    setPolicyModal(true);
  };

  const openTaxEdit = (t: TaxRecord) => {
    setEditingTaxId(t.id);
    setTaxForm({
      tax_year: t.tax_year,
      jurisdiction: t.jurisdiction || '',
      assessed_value: t.assessed_value != null ? String(t.assessed_value) : '',
      tax_amount: t.tax_amount != null ? String(t.tax_amount) : '',
      due_date: t.due_date || '',
      paid_date: t.paid_date || '',
      status: t.status || 'upcoming',
      notes: t.notes || '',
    });
    setTaxModal(true);
  };

  const openPersonEdit = (p: Responsibility) => {
    setEditingPersonId(p.id);
    setPeopleForm({
      role: p.role,
      contact_name: p.contact_name || '',
      contact_company: p.contact_company || '',
      contact_phone: p.contact_phone || '',
      contact_email: p.contact_email || '',
      notes: p.notes || '',
    });
    setPeopleModal(true);
  };

  const openMaintEdit = (m: MaintenanceItem) => {
    setEditingMaintId(m.id);
    setMaintForm({
      title: m.title,
      item_type: m.item_type || '',
      frequency: m.frequency || 'annual',
      next_due_date: m.next_due_date || '',
      last_completed_date: m.last_completed_date || '',
      status: m.status || 'scheduled',
      notes: m.notes || '',
    });
    setMaintModal(true);
  };

  const resetLeaseModal = () => {
    setLeaseModal(false);
    setEditingLeaseId(null);
    setLeaseForm({
      role: 'landlord',
      status: 'active',
      counterparty_name: '',
      base_rent: '',
      rent_frequency: 'monthly',
      start_date: '',
      end_date: '',
      renewal_date: '',
    });
  };

  const resetPolicyModal = () => {
    setPolicyModal(false);
    setEditingPolicyId(null);
    setPolicyForm({
      provider: '',
      broker: '',
      policy_number: '',
      policy_type: '',
      expiry_date: '',
      annual_premium: '',
      notes: '',
    });
  };

  const resetTaxModal = () => {
    setTaxModal(false);
    setEditingTaxId(null);
    setTaxForm({
      tax_year: new Date().getFullYear(),
      jurisdiction: '',
      assessed_value: '',
      tax_amount: '',
      due_date: '',
      paid_date: '',
      status: 'upcoming',
      notes: '',
    });
  };

  const resetPeopleModal = () => {
    setPeopleModal(false);
    setEditingPersonId(null);
    setPeopleForm({
      role: 'electrical',
      contact_name: '',
      contact_company: '',
      contact_phone: '',
      contact_email: '',
      notes: '',
    });
  };

  const resetMaintModal = () => {
    setMaintModal(false);
    setEditingMaintId(null);
    setMaintForm({
      title: '',
      item_type: '',
      next_due_date: '',
      last_completed_date: '',
      frequency: 'annual',
      status: 'scheduled',
      notes: '',
    });
  };

  const openLeaseEdit = (l: Lease) => {
    setEditingLeaseId(l.id);
    setLeaseForm({
      role: l.role,
      status: l.status,
      counterparty_name: l.counterparty_name || '',
      base_rent: l.base_rent != null ? String(l.base_rent) : '',
      rent_frequency: l.rent_frequency || 'monthly',
      start_date: l.start_date || '',
      end_date: l.end_date || '',
      renewal_date: l.renewal_date || '',
    });
    setLeaseModal(true);
  };

  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyModal, setPolicyModal] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    provider: '',
    broker: '',
    policy_number: '',
    policy_type: '',
    expiry_date: '',
    annual_premium: '',
    notes: '',
  });

  const savePolicy = async () => {
    try {
      const body = {
        provider: policyForm.provider || null,
        broker: policyForm.broker || null,
        policy_number: policyForm.policy_number || null,
        policy_type: policyForm.policy_type || null,
        annual_premium: policyForm.annual_premium ? Number(policyForm.annual_premium) : null,
        expiry_date: policyForm.expiry_date || null,
        notes: policyForm.notes || null,
      };
      if (editingPolicyId) {
        await api('PATCH', `/properties/${id}/insurance/${editingPolicyId}`, body);
      } else {
        await api('POST', `/properties/${id}/insurance`, body);
      }
      toast.success('Policy saved');
      resetPolicyModal();
      qc.invalidateQueries({ queryKey: ['property-insurance', id] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [taxModal, setTaxModal] = useState(false);
  const [taxForm, setTaxForm] = useState({
    tax_year: new Date().getFullYear(),
    jurisdiction: '',
    assessed_value: '',
    tax_amount: '',
    due_date: '',
    paid_date: '',
    status: 'upcoming',
    notes: '',
  });

  const saveTax = async () => {
    try {
      const body = {
        tax_year: Number(taxForm.tax_year),
        jurisdiction: taxForm.jurisdiction || null,
        assessed_value: taxForm.assessed_value ? Number(taxForm.assessed_value) : null,
        tax_amount: taxForm.tax_amount ? Number(taxForm.tax_amount) : null,
        due_date: taxForm.due_date || null,
        paid_date: taxForm.paid_date || null,
        status: taxForm.status || 'upcoming',
        notes: taxForm.notes || null,
      };
      if (editingTaxId) {
        await api('PATCH', `/properties/${id}/tax/${editingTaxId}`, body);
      } else {
        await api('POST', `/properties/${id}/tax`, body);
      }
      toast.success('Tax record saved');
      resetTaxModal();
      qc.invalidateQueries({ queryKey: ['property-tax', id] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [peopleModal, setPeopleModal] = useState(false);
  const [peopleForm, setPeopleForm] = useState({
    role: 'electrical',
    contact_name: '',
    contact_company: '',
    contact_phone: '',
    contact_email: '',
    notes: '',
  });

  const savePerson = async () => {
    try {
      const body = {
        role: peopleForm.role,
        contact_name: peopleForm.contact_name || null,
        contact_company: peopleForm.contact_company || null,
        contact_phone: peopleForm.contact_phone || null,
        contact_email: peopleForm.contact_email || null,
        notes: peopleForm.notes || null,
      };
      if (editingPersonId) {
        await api('PATCH', `/properties/${id}/responsibilities/${editingPersonId}`, body);
      } else {
        await api('POST', `/properties/${id}/responsibilities`, body);
      }
      toast.success('Responsibility saved');
      resetPeopleModal();
      qc.invalidateQueries({ queryKey: ['property-people', id] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const [editingMaintId, setEditingMaintId] = useState<string | null>(null);
  const [maintModal, setMaintModal] = useState(false);
  const [maintForm, setMaintForm] = useState({
    title: '',
    item_type: '',
    next_due_date: '',
    last_completed_date: '',
    frequency: 'annual',
    status: 'scheduled',
    notes: '',
  });

  const [editingPermitId, setEditingPermitId] = useState<string | null>(null);
  const [permitModal, setPermitModal] = useState(false);
  const [permitForm, setPermitForm] = useState({
    title: '',
    permit_type: 'electrical',
    permit_number: '',
    authority: '',
    stage: 'identified',
    issued_date: '',
    expiry_date: '',
    notes: '',
  });

  const resetPermitModal = () => {
    setPermitModal(false);
    setEditingPermitId(null);
    setPermitForm({
      title: '',
      permit_type: 'electrical',
      permit_number: '',
      authority: '',
      stage: 'identified',
      issued_date: '',
      expiry_date: '',
      notes: '',
    });
  };

  const openPermitEdit = (p: Permit) => {
    setEditingPermitId(p.id);
    setPermitForm({
      title: p.title || '',
      permit_type: p.permit_type || 'electrical',
      permit_number: p.permit_number || '',
      authority: p.authority || '',
      stage: p.stage || 'identified',
      issued_date: p.issued_date || '',
      expiry_date: p.expiry_date || '',
      notes: p.notes || '',
    });
    setPermitModal(true);
  };

  const savePermit = async () => {
    try {
      const body = {
        ...permitForm,
        issued_date: permitForm.issued_date || null,
        expiry_date: permitForm.expiry_date || null,
      };
      if (editingPermitId) {
        await api('PATCH', `/properties/board/permits/${editingPermitId}`, body);
      } else {
        await api('POST', `/properties/${id}/permits`, body);
      }
      toast.success('Permit saved');
      resetPermitModal();
      qc.invalidateQueries({ queryKey: ['property-permits', id] });
      qc.invalidateQueries({ queryKey: ['property-permits-board'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  const saveMaint = async () => {
    try {
      const body = {
        title: maintForm.title,
        item_type: maintForm.item_type || null,
        frequency: maintForm.frequency || null,
        next_due_date: maintForm.next_due_date || null,
        last_completed_date: maintForm.last_completed_date || null,
        status: maintForm.status || 'scheduled',
        notes: maintForm.notes || null,
      };
      if (editingMaintId) {
        await api('PATCH', `/properties/${id}/maintenance/${editingMaintId}`, body);
      } else {
        await api('POST', `/properties/${id}/maintenance`, body);
      }
      toast.success('Maintenance item saved');
      resetMaintModal();
      qc.invalidateQueries({ queryKey: ['property-maintenance', id] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    }
  };

  if (isLoading || !property) {
    return <div className="p-6 text-gray-500">Loading property…</div>;
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={property.name}
        subtitle="Property detail"
        onBack={() => nav('/properties/list')}
        backLabel="Back to list"
        icon={<Building2 className="h-4 w-4" />}
      />

      <PropertyHeroBar
        property={{
          ...property,
          owner_summary: property.owners
            .map((o) => o.entity_display_name || o.entity_legal_name)
            .filter(Boolean)
            .join(', ') || undefined,
        }}
        canEdit={canEdit}
        onEdit={openEditProperty}
        onDelete={deleteProperty}
        onImageUpdated={() => qc.invalidateQueries({ queryKey: ['property', id] })}
      />

      <AppTabs
        tabs={TABS.map((t) => ({ key: t.id, label: t.label }))}
        value={tab}
        onChange={(v) => setTab(v as PropertyTab)}
      />

      {tab === 'overview' && (
        <div className={uiCx(uiSpacing.sectionStack, 'mt-2')}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <AppCard
              className="cursor-pointer transition-colors hover:bg-gray-50"
              onClick={() => setTab('leases')}
            >
              <div className={uiTypography.overline}>Lease</div>
              {activeLease ? (
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold capitalize text-gray-900">{activeLease.role}</span>
                    <AppBadge variant={activeLease.status === 'expired' ? 'danger' : activeLease.status === 'expiring' ? 'warning' : 'neutral'}>
                      {activeLease.status}
                    </AppBadge>
                  </div>
                  {activeLease.end_date ? (
                    <div className={uiTypography.helper}>Ends {fmtDate(activeLease.end_date)}</div>
                  ) : null}
                  {activeLease.base_rent != null ? (
                    <div className="text-sm font-medium text-gray-900">
                      {activeLease.currency || 'CAD'} {activeLease.base_rent}
                      <span className="font-normal text-gray-500">/{activeLease.rent_frequency || 'period'}</span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className={uiCx(uiTypography.helper, 'mt-2')}>No active lease</p>
              )}
            </AppCard>

            <AppCard
              className="cursor-pointer transition-colors hover:bg-gray-50"
              onClick={() => setTab('insurance')}
            >
              <div className={uiTypography.overline}>Insurance</div>
              {nextInsurance ? (
                <div className="mt-2 space-y-1">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {nextInsurance.provider || nextInsurance.policy_number || 'Policy'}
                  </div>
                  {nextInsurance.expiry_date ? (
                    <div className={uiTypography.helper}>Expires {fmtDate(nextInsurance.expiry_date)}</div>
                  ) : (
                    <div className={uiTypography.helper}>No expiry date</div>
                  )}
                </div>
              ) : (
                <p className={uiCx(uiTypography.helper, 'mt-2')}>No policy on file</p>
              )}
            </AppCard>

            <AppCard
              className="cursor-pointer transition-colors hover:bg-gray-50"
              onClick={() => setTab('tax')}
            >
              <div className={uiTypography.overline}>Property tax</div>
              {nextTax ? (
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Year {nextTax.tax_year}</span>
                    <AppBadge variant={nextTax.status === 'overdue' ? 'danger' : nextTax.status === 'due' ? 'warning' : 'neutral'}>
                      {nextTax.status}
                    </AppBadge>
                  </div>
                  {nextTax.due_date ? (
                    <div className={uiTypography.helper}>Due {fmtDate(nextTax.due_date)}</div>
                  ) : null}
                </div>
              ) : (
                <p className={uiCx(uiTypography.helper, 'mt-2')}>No open tax records</p>
              )}
            </AppCard>

            <AppCard
              className="cursor-pointer transition-colors hover:bg-gray-50"
              onClick={() => setTab('permits')}
            >
              <div className={uiTypography.overline}>Permits</div>
              {permits && permits.length > 0 ? (
                <div className="mt-2 space-y-1">
                  <div className="text-sm font-semibold text-gray-900">
                    {permits.length} open
                    {permits.some((p) => p.compliance_status === 'expired') ? (
                      <AppBadge variant="danger" className="ml-2">Expired</AppBadge>
                    ) : permits.some((p) => p.compliance_status === 'warning') ? (
                      <AppBadge variant="warning" className="ml-2">Attention</AppBadge>
                    ) : null}
                  </div>
                  <div className={uiCx(uiTypography.helper, 'truncate')}>
                    {permits[0].title || permits[0].permit_type || 'Permit'} — {permits[0].stage}
                  </div>
                </div>
              ) : (
                <p className={uiCx(uiTypography.helper, 'mt-2')}>No permits listed</p>
              )}
            </AppCard>
          </div>

          <div className={uiLayout.overviewPrimaryRow}>
            <PropertyLocationMap
              lat={property.lat}
              lng={property.lng}
              label={formatPropertyAddress(property)}
              height={380}
              className="h-full min-h-[280px]"
            />
            <div className="flex min-h-0 flex-col gap-2">
              <AppCard className="flex-1">
                <AppSectionHeader
                  title="Owners"
                  description="Legal entities on title."
                  {...appSectionPresetProps('company')}
                />
                <div className="mt-3">
                  {property.owners.length === 0 ? (
                    <p className={uiTypography.helper}>No owners assigned.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {property.owners.map((o) => (
                        <li key={o.entity_id} className="flex items-start justify-between gap-3">
                          <span className="font-medium text-gray-900">
                            {o.entity_display_name || o.entity_legal_name}
                          </span>
                          {o.ownership_percentage != null ? (
                            <span className="shrink-0 text-gray-500">{o.ownership_percentage}%</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {property.ownership_percentage_total != null && property.ownership_percentage_total !== 100 && (
                    <p className="mt-2 text-xs text-amber-600">Total: {property.ownership_percentage_total}%</p>
                  )}
                </div>
              </AppCard>

              <AppCard className="flex-1">
                <AppSectionHeader
                  title="Notes"
                  description="Internal remarks for this property."
                  {...appSectionPresetProps('description')}
                />
                <div className="mt-3">
                  {property.notes?.trim() ? (
                    <p className="whitespace-pre-wrap text-sm text-gray-700">{property.notes}</p>
                  ) : (
                    <p className={uiTypography.helper}>No notes yet.</p>
                  )}
                </div>
              </AppCard>
            </div>
          </div>
        </div>
      )}

      {tab === 'leases' && (
        <div className={uiCx(uiSpacing.sectionStack, 'mt-2')}>
          <AppCard>
            <AppSectionHeader
              title="Leases"
              description="Landlord and tenant agreements for this property."
              {...appSectionPresetProps('documents')}
            />
          </AppCard>

          {!leases ? (
            <AppCard>
              <div className={uiTypography.helper}>Loading leases…</div>
            </AppCard>
          ) : (
            <AppSortableEntityList layout="stack" className="min-w-0">
              {canEdit ? (
                <AppListCreateItem
                  label="Add lease"
                  layout="row"
                  className={uiCx('w-full', 'min-w-[640px]')}
                  onClick={() => {
                    resetLeaseModal();
                    setLeaseModal(true);
                  }}
                />
              ) : null}

              {!leases.length ? (
                <AppEmptyState
                  title="No leases yet"
                  description="Add landlord or tenant agreements to track rent and renewal dates."
                  icon={<FileText className="h-5 w-5" />}
                />
              ) : (
                <>
                  <AppSortableEntityListHeader gridCols={LEASES_GRID} minWidth="min-w-[640px]">
                    <span>Role</span>
                    <span>Counterparty</span>
                    <span>Rent</span>
                    <span>Dates</span>
                    <span>Status</span>
                    <div className="min-w-0 w-20" aria-hidden />
                  </AppSortableEntityListHeader>
                  {leases.map((l) => (
                    <AppSortableEntityListRow
                      key={l.id}
                      as="div"
                      gridCols={LEASES_GRID}
                      minWidth="min-w-[640px]"
                      className="px-4 py-3"
                    >
                      <span className="text-sm font-semibold capitalize text-gray-900">{l.role}</span>
                      <span className="truncate text-xs text-gray-700">{l.counterparty_name || '—'}</span>
                      <span className="truncate text-xs text-gray-700">
                        {l.base_rent != null
                          ? `${l.currency || 'CAD'} ${l.base_rent}${l.rent_frequency ? ` / ${l.rent_frequency}` : ''}`
                          : '—'}
                      </span>
                      <div className="min-w-0 text-xs text-gray-600">
                        <div className="truncate">
                          {l.start_date ? fmtDate(l.start_date) : '—'}
                          {' → '}
                          {l.end_date ? fmtDate(l.end_date) : '—'}
                        </div>
                        {l.renewal_date ? (
                          <div className={uiCx(uiTypography.helper, 'truncate')}>Renewal {fmtDate(l.renewal_date)}</div>
                        ) : null}
                      </div>
                      <AppBadge
                        variant={
                          l.status === 'expired' ? 'danger' : l.status === 'expiring' ? 'warning' : 'neutral'
                        }
                      >
                        {l.status}
                      </AppBadge>
                      <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                        {canEdit ? (
                          <>
                            <AppListRowIconButton
                              preset="edit"
                              label="Edit lease"
                              onClick={() => openLeaseEdit(l)}
                            />
                            <AppListRowIconButton
                              preset="delete"
                              label="Delete lease"
                              onClick={() => deleteRecord(`/properties/${id}/leases/${l.id}`, 'lease')}
                            />
                          </>
                        ) : null}
                      </div>
                    </AppSortableEntityListRow>
                  ))}
                </>
              )}
            </AppSortableEntityList>
          )}
        </div>
      )}

      {tab === 'insurance' && (
        <div className={uiCx(uiSpacing.sectionStack, 'mt-2')}>
          <AppCard>
            <AppSectionHeader
              title="Insurance"
              description="Policies and renewals for this property."
              {...appSectionPresetProps('warranties')}
            />
          </AppCard>

          {!policies ? (
            <AppCard>
              <div className={uiTypography.helper}>Loading policies…</div>
            </AppCard>
          ) : (
            <AppSortableEntityList layout="stack" className="min-w-0">
              {canEdit ? (
                <AppListCreateItem
                  label="Add policy"
                  layout="row"
                  className={uiCx('w-full', 'min-w-[640px]')}
                  onClick={() => {
                    resetPolicyModal();
                    setPolicyModal(true);
                  }}
                />
              ) : null}

              {!policies.length ? (
                <AppEmptyState
                  title="No insurance policies yet"
                  description="Add policies to track providers, premiums, and expiry dates."
                  icon={<Shield className="h-5 w-5" />}
                />
              ) : (
                <>
                  <AppSortableEntityListHeader gridCols={INSURANCE_GRID} minWidth="min-w-[640px]">
                    <span>Provider</span>
                    <span>Policy #</span>
                    <span>Type</span>
                    <span>Expiry</span>
                    <span>Premium</span>
                    <div className="min-w-0 w-20" aria-hidden />
                  </AppSortableEntityListHeader>
                  {policies.map((p) => (
                    <AppSortableEntityListRow
                      key={p.id}
                      as="div"
                      gridCols={INSURANCE_GRID}
                      minWidth="min-w-[640px]"
                      className="px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {p.provider || 'Policy'}
                        </div>
                        {p.broker ? (
                          <div className={uiCx(uiTypography.helper, 'truncate')}>Broker {p.broker}</div>
                        ) : null}
                      </div>
                      <span className="truncate text-xs text-gray-700">{p.policy_number || '—'}</span>
                      <span className="truncate text-xs capitalize text-gray-700">
                        {p.policy_type ? p.policy_type.replace(/_/g, ' ') : '—'}
                      </span>
                      <span className="truncate text-xs text-gray-700">
                        {p.expiry_date ? fmtDate(p.expiry_date) : '—'}
                      </span>
                      <span className="truncate text-xs text-gray-700">
                        {p.annual_premium != null ? `$${p.annual_premium}` : '—'}
                      </span>
                      <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                        {canEdit ? (
                          <>
                            <AppListRowIconButton
                              preset="edit"
                              label="Edit policy"
                              onClick={() => openPolicyEdit(p)}
                            />
                            <AppListRowIconButton
                              preset="delete"
                              label="Delete policy"
                              onClick={() => deleteRecord(`/properties/${id}/insurance/${p.id}`, 'policy')}
                            />
                          </>
                        ) : null}
                      </div>
                    </AppSortableEntityListRow>
                  ))}
                </>
              )}
            </AppSortableEntityList>
          )}
        </div>
      )}

      {tab === 'tax' && (
        <div className={uiCx(uiSpacing.sectionStack, 'mt-2')}>
          <AppCard>
            <AppSectionHeader
              title="Property tax"
              description="Assessment years, amounts due, and payment status for this property."
              {...appSectionPresetProps('billing')}
            />
          </AppCard>

          {!taxRecords ? (
            <AppCard>
              <div className={uiTypography.helper}>Loading tax records…</div>
            </AppCard>
          ) : (
            <AppSortableEntityList layout="stack" className="min-w-0">
              {canEdit ? (
                <AppListCreateItem
                  label="Add tax year"
                  layout="row"
                  className={uiCx('w-full', 'min-w-[720px]')}
                  onClick={() => {
                    resetTaxModal();
                    setTaxModal(true);
                  }}
                />
              ) : null}

              {!taxRecords.length ? (
                <AppEmptyState
                  title="No tax records yet"
                  description="Add tax years to track assessments, amounts due, and payment status."
                  icon={<Receipt className="h-5 w-5" />}
                />
              ) : (
                <>
                  <AppSortableEntityListHeader gridCols={TAX_GRID} minWidth="min-w-[720px]">
                    <span>Year</span>
                    <span>Jurisdiction</span>
                    <span>Assessed</span>
                    <span>Tax</span>
                    <span>Due</span>
                    <span>Status</span>
                    <div className="min-w-0 w-20" aria-hidden />
                  </AppSortableEntityListHeader>
                  {taxRecords.map((t) => (
                    <AppSortableEntityListRow
                      key={t.id}
                      as="div"
                      gridCols={TAX_GRID}
                      minWidth="min-w-[720px]"
                      className="px-4 py-3"
                    >
                      <span className="text-sm font-semibold text-gray-900">{t.tax_year}</span>
                      <span className="truncate text-xs text-gray-700">{t.jurisdiction || '—'}</span>
                      <span className="truncate text-xs text-gray-700">
                        {t.assessed_value != null ? `$${t.assessed_value}` : '—'}
                      </span>
                      <span className="truncate text-xs text-gray-700">
                        {t.tax_amount != null ? `$${t.tax_amount}` : '—'}
                      </span>
                      <span className="truncate text-xs text-gray-700">
                        {t.due_date ? fmtDate(t.due_date) : '—'}
                      </span>
                      <AppBadge
                        variant={
                          t.status === 'overdue' ? 'danger' : t.status === 'due' ? 'warning' : t.status === 'paid' ? 'success' : 'neutral'
                        }
                      >
                        {t.status}
                      </AppBadge>
                      <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                        {canEdit ? (
                          <>
                            <AppListRowIconButton
                              preset="edit"
                              label="Edit tax record"
                              onClick={() => openTaxEdit(t)}
                            />
                            <AppListRowIconButton
                              preset="delete"
                              label="Delete tax record"
                              onClick={() => deleteRecord(`/properties/${id}/tax/${t.id}`, 'tax record')}
                            />
                          </>
                        ) : null}
                      </div>
                    </AppSortableEntityListRow>
                  ))}
                </>
              )}
            </AppSortableEntityList>
          )}
        </div>
      )}

      {tab === 'permits' && (
        <div className={uiCx(uiSpacing.sectionStack, 'mt-2')}>
          <AppCard>
            <AppSectionHeader
              title="Permits"
              description="Approvals and compliance items for this property."
              {...appSectionPresetProps('fieldBrief')}
              action={
                <AppButton variant="secondary" size="sm" onClick={() => nav('/properties/approvals')}>
                  Open approvals board
                </AppButton>
              }
            />
          </AppCard>

          {!permits ? (
            <AppCard>
              <div className={uiTypography.helper}>Loading permits…</div>
            </AppCard>
          ) : (
            <AppSortableEntityList layout="stack" className="min-w-0">
              {canWritePermits ? (
                <AppListCreateItem
                  label="Add permit"
                  layout="row"
                  className={uiCx('w-full', 'min-w-[800px]')}
                  onClick={() => {
                    resetPermitModal();
                    setPermitModal(true);
                  }}
                />
              ) : null}

              {!permits.length ? (
                <AppEmptyState
                  title="No permits yet"
                  description="Add permits to track stages, authorities, and expiry dates."
                  icon={<ClipboardList className="h-5 w-5" />}
                />
              ) : (
                <>
                  <AppSortableEntityListHeader gridCols={PERMITS_GRID} minWidth="min-w-[800px]">
                    <span>Permit</span>
                    <span>Type</span>
                    <span>Permit #</span>
                    <span>Authority</span>
                    <span>Stage</span>
                    <span>Expiry</span>
                    <div className="min-w-0 w-20" aria-hidden />
                  </AppSortableEntityListHeader>
                  {permits.map((p) => (
                    <AppSortableEntityListRow
                      key={p.id}
                      as="div"
                      gridCols={PERMITS_GRID}
                      minWidth="min-w-[800px]"
                      className="px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">
                          {p.title || p.permit_type || 'Permit'}
                        </div>
                        {p.compliance_label ? (
                          <div className="mt-0.5">
                            <AppBadge
                              variant={
                                p.compliance_status === 'expired'
                                  ? 'danger'
                                  : p.compliance_status === 'warning'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {p.compliance_label}
                            </AppBadge>
                          </div>
                        ) : null}
                      </div>
                      <span className="truncate text-xs capitalize text-gray-700">
                        {p.permit_type ? p.permit_type.replace(/_/g, ' ') : '—'}
                      </span>
                      <span className="truncate text-xs text-gray-700">{p.permit_number || '—'}</span>
                      <span className="truncate text-xs text-gray-700">{p.authority || '—'}</span>
                      <AppBadge variant="neutral">{p.stage.replace(/_/g, ' ')}</AppBadge>
                      <span className="truncate text-xs text-gray-700">
                        {p.expiry_date ? fmtDate(p.expiry_date) : '—'}
                      </span>
                      <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                        {canWritePermits ? (
                          <>
                            <AppListRowIconButton
                              preset="edit"
                              label="Edit permit"
                              onClick={() => openPermitEdit(p)}
                            />
                            <AppListRowIconButton
                              preset="delete"
                              label="Delete permit"
                              onClick={() => deleteRecord(`/properties/board/permits/${p.id}`, 'permit')}
                            />
                          </>
                        ) : null}
                      </div>
                    </AppSortableEntityListRow>
                  ))}
                </>
              )}
            </AppSortableEntityList>
          )}
        </div>
      )}

      {tab === 'people' && (
        <div className={uiCx(uiSpacing.sectionStack, 'mt-2')}>
          <AppCard>
            <AppSectionHeader
              title="People"
              description="Contacts responsible for trades and property management on this site."
              {...appSectionPresetProps('team')}
            />
          </AppCard>

          {!people ? (
            <AppCard>
              <div className={uiTypography.helper}>Loading people…</div>
            </AppCard>
          ) : (
            <AppSortableEntityList layout="stack" className="min-w-0">
              {canEdit ? (
                <AppListCreateItem
                  label="Add responsibility"
                  layout="row"
                  className={uiCx('w-full', 'min-w-[640px]')}
                  onClick={() => {
                    resetPeopleModal();
                    setPeopleModal(true);
                  }}
                />
              ) : null}

              {!people.length ? (
                <AppEmptyState
                  title="No responsibilities yet"
                  description="Add trade and management contacts for this property."
                  icon={<Users className="h-5 w-5" />}
                />
              ) : (
                <>
                  <AppSortableEntityListHeader gridCols={PEOPLE_GRID} minWidth="min-w-[640px]">
                    <span>Role</span>
                    <span>Contact</span>
                    <span>Company</span>
                    <span>Phone</span>
                    <div className="min-w-0 w-20" aria-hidden />
                  </AppSortableEntityListHeader>
                  {people.map((p) => (
                    <AppSortableEntityListRow
                      key={p.id}
                      as="div"
                      gridCols={PEOPLE_GRID}
                      minWidth="min-w-[640px]"
                      className="px-4 py-3"
                    >
                      <span className="truncate text-sm font-semibold capitalize text-gray-900">
                        {p.role.replace(/_/g, ' ')}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-gray-900">
                          {p.contact_name || p.user_display_name || '—'}
                        </div>
                        {p.contact_name && p.user_display_name ? (
                          <div className={uiCx(uiTypography.helper, 'truncate')}>{p.user_display_name}</div>
                        ) : p.contact_email ? (
                          <div className={uiCx(uiTypography.helper, 'truncate')}>{p.contact_email}</div>
                        ) : null}
                      </div>
                      <span className="truncate text-xs text-gray-700">{p.contact_company || '—'}</span>
                      <span className="truncate text-xs text-gray-700">{p.contact_phone || '—'}</span>
                      <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                        {canEdit ? (
                          <>
                            <AppListRowIconButton
                              preset="edit"
                              label="Edit responsibility"
                              onClick={() => openPersonEdit(p)}
                            />
                            <AppListRowIconButton
                              preset="delete"
                              label="Delete responsibility"
                              onClick={() =>
                                deleteRecord(`/properties/${id}/responsibilities/${p.id}`, 'responsibility')
                              }
                            />
                          </>
                        ) : null}
                      </div>
                    </AppSortableEntityListRow>
                  ))}
                </>
              )}
            </AppSortableEntityList>
          )}
        </div>
      )}

      {tab === 'maintenance' && (
        <div className={uiCx(uiSpacing.sectionStack, 'mt-2')}>
          <AppCard>
            <AppSectionHeader
              title="Maintenance"
              description="Recurring work and next due dates for this property."
              {...appSectionPresetProps('timesheet')}
            />
          </AppCard>

          {!maintenance ? (
            <AppCard>
              <div className={uiTypography.helper}>Loading maintenance…</div>
            </AppCard>
          ) : (
            <AppSortableEntityList layout="stack" className="min-w-0">
              {canEdit ? (
                <AppListCreateItem
                  label="Add maintenance item"
                  layout="row"
                  className={uiCx('w-full', 'min-w-[720px]')}
                  onClick={() => {
                    resetMaintModal();
                    setMaintModal(true);
                  }}
                />
              ) : null}

              {!maintenance.length ? (
                <AppEmptyState
                  title="No maintenance scheduled"
                  description="Add recurring items to track inspections, service, and next due dates."
                  icon={<Clock className="h-5 w-5" />}
                />
              ) : (
                <>
                  <AppSortableEntityListHeader gridCols={MAINT_GRID} minWidth="min-w-[720px]">
                    <span>Item</span>
                    <span>Type</span>
                    <span>Frequency</span>
                    <span>Next due</span>
                    <span>Status</span>
                    <div className="min-w-0 w-20" aria-hidden />
                  </AppSortableEntityListHeader>
                  {maintenance.map((m) => (
                    <AppSortableEntityListRow
                      key={m.id}
                      as="div"
                      gridCols={MAINT_GRID}
                      minWidth="min-w-[720px]"
                      className="px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">{m.title}</div>
                        {m.last_completed_date ? (
                          <div className={uiCx(uiTypography.helper, 'truncate')}>
                            Last done {fmtDate(m.last_completed_date)}
                          </div>
                        ) : null}
                      </div>
                      <span className="truncate text-xs capitalize text-gray-700">
                        {m.item_type ? m.item_type.replace(/_/g, ' ') : '—'}
                      </span>
                      <span className="truncate text-xs capitalize text-gray-700">
                        {m.frequency || '—'}
                      </span>
                      <span className="truncate text-xs text-gray-700">
                        {m.next_due_date ? fmtDate(m.next_due_date) : '—'}
                      </span>
                      <AppBadge
                        variant={
                          m.status === 'overdue' ? 'danger' : m.status === 'due' ? 'warning' : 'neutral'
                        }
                      >
                        {m.status}
                      </AppBadge>
                      <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                        {canEdit ? (
                          <>
                            <AppListRowIconButton
                              preset="edit"
                              label="Edit maintenance"
                              onClick={() => openMaintEdit(m)}
                            />
                            <AppListRowIconButton
                              preset="delete"
                              label="Delete maintenance"
                              onClick={() =>
                                deleteRecord(`/properties/${id}/maintenance/${m.id}`, 'maintenance item')
                              }
                            />
                          </>
                        ) : null}
                      </div>
                    </AppSortableEntityListRow>
                  ))}
                </>
              )}
            </AppSortableEntityList>
          )}
        </div>
      )}

      {tab === 'documents' && canReadPropertyDocuments(perms, roles) && id && (
        <div className="mt-4">
          <PropertyFilesTab propertyId={id} canEdit={canWriteDocs && canEdit} />
        </div>
      )}

      <AppFormModal
        open={leaseModal}
        onClose={resetLeaseModal}
        title={editingLeaseId ? 'Edit lease' : 'Add lease'}
        description={editingLeaseId ? 'Update terms for this lease agreement.' : 'Record a landlord or tenant agreement for this property.'}
        formWidth="comfortable"
        quickInfo={propertyLeaseQuickInfo(!!editingLeaseId)}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={resetLeaseModal}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={saveLease}>
              Save
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <AppSelect
              label="Role"
              value={leaseForm.role}
              onChange={(e) => setLeaseForm({ ...leaseForm, role: e.target.value })}
              options={[
                { value: 'landlord', label: 'Landlord' },
                { value: 'tenant', label: 'Tenant' },
              ]}
              fieldHint={"Role\n\nWhether this company is the landlord (renting out) or the tenant (leasing in)."}
            />
            <AppSelect
              label="Status"
              value={leaseForm.status}
              onChange={(e) => setLeaseForm({ ...leaseForm, status: e.target.value })}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'active', label: 'Active' },
                { value: 'expiring', label: 'Expiring' },
                { value: 'expired', label: 'Expired' },
                { value: 'terminated', label: 'Terminated' },
              ]}
              fieldHint={"Status\n\nLifecycle of the lease. Expiring and expired feed dashboard alerts."}
            />
          </div>
          <AppInput
            label="Counterparty"
            value={leaseForm.counterparty_name}
            onChange={(e) => setLeaseForm({ ...leaseForm, counterparty_name: e.target.value })}
            fieldHint={"Counterparty\n\nThe other party on the lease (tenant name if you are landlord, or landlord if you are tenant)."}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Base rent"
              type="number"
              value={leaseForm.base_rent}
              onChange={(e) => setLeaseForm({ ...leaseForm, base_rent: e.target.value })}
              fieldHint={"Base rent\n\nRecurring rent amount before extras or taxes."}
            />
            <AppSelect
              label="Frequency"
              value={leaseForm.rent_frequency}
              onChange={(e) => setLeaseForm({ ...leaseForm, rent_frequency: e.target.value })}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'annual', label: 'Annual' },
              ]}
              fieldHint={"Frequency\n\nHow often base rent is due."}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <AppDatePicker
              label="Start"
              value={leaseForm.start_date}
              onChange={(e) => setLeaseForm({ ...leaseForm, start_date: e.target.value })}
              fieldHint={"Start\n\nLease commencement date."}
            />
            <AppDatePicker
              label="End"
              value={leaseForm.end_date}
              onChange={(e) => setLeaseForm({ ...leaseForm, end_date: e.target.value })}
              fieldHint={"End\n\nScheduled end date. Used for expiry alerts."}
            />
            <AppDatePicker
              label="Renewal"
              value={leaseForm.renewal_date}
              onChange={(e) => setLeaseForm({ ...leaseForm, renewal_date: e.target.value })}
              fieldHint={"Renewal\n\nOptional date when renewal notice or option is due."}
            />
          </div>
        </div>
      </AppFormModal>

      <AppFormModal
        open={policyModal}
        onClose={resetPolicyModal}
        title={editingPolicyId ? 'Edit insurance policy' : 'Add insurance policy'}
        description={
          editingPolicyId
            ? 'Update coverage details for this policy.'
            : 'Record a policy so renewals and premiums stay visible on this property.'
        }
        formWidth="comfortable"
        quickInfo={propertyInsuranceQuickInfo(!!editingPolicyId)}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={resetPolicyModal}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={savePolicy}>
              Save
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Provider"
              value={policyForm.provider}
              onChange={(e) => setPolicyForm({ ...policyForm, provider: e.target.value })}
              fieldHint={"Provider\n\nInsurer or carrier name on the policy."}
            />
            <AppInput
              label="Broker"
              value={policyForm.broker}
              onChange={(e) => setPolicyForm({ ...policyForm, broker: e.target.value })}
              fieldHint={"Broker\n\nOptional brokerage or agent that places the coverage."}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Policy #"
              value={policyForm.policy_number}
              onChange={(e) => setPolicyForm({ ...policyForm, policy_number: e.target.value })}
              fieldHint={"Policy #\n\nCarrier policy number used for renewals and claims."}
            />
            <AppInput
              label="Type"
              value={policyForm.policy_type}
              onChange={(e) => setPolicyForm({ ...policyForm, policy_type: e.target.value })}
              placeholder="e.g. property, liability"
              fieldHint={"Type\n\nCoverage category — for example property, liability, or builders risk."}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppDatePicker
              label="Expiry"
              value={policyForm.expiry_date}
              onChange={(e) => setPolicyForm({ ...policyForm, expiry_date: e.target.value })}
              fieldHint={"Expiry\n\nPolicy end date. Used for dashboard and calendar alerts."}
            />
            <AppInput
              label="Annual premium"
              type="number"
              value={policyForm.annual_premium}
              onChange={(e) => setPolicyForm({ ...policyForm, annual_premium: e.target.value })}
              fieldHint={"Annual premium\n\nYearly cost of the policy before tax if tracked separately."}
            />
          </div>
          <AppTextarea
            label="Notes"
            value={policyForm.notes}
            onChange={(e) => setPolicyForm({ ...policyForm, notes: e.target.value })}
            rows={3}
            fieldHint={"Notes\n\nRenewal contacts, deductibles, or other details the team should see."}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={taxModal}
        onClose={resetTaxModal}
        title={editingTaxId ? 'Edit tax record' : 'Add tax record'}
        description={
          editingTaxId
            ? 'Update assessment and payment details for this tax year.'
            : 'Record a tax year so amounts due and payment status stay visible on this property.'
        }
        formWidth="comfortable"
        quickInfo={propertyTaxQuickInfo(!!editingTaxId)}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={resetTaxModal}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={saveTax}>
              Save
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Tax year"
              type="number"
              value={String(taxForm.tax_year)}
              onChange={(e) => setTaxForm({ ...taxForm, tax_year: Number(e.target.value) })}
              fieldHint={"Tax year\n\nAssessment / billing year for this record."}
            />
            <AppSelect
              label="Status"
              value={taxForm.status}
              onChange={(e) => setTaxForm({ ...taxForm, status: e.target.value })}
              options={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'due', label: 'Due' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'paid', label: 'Paid' },
              ]}
              fieldHint={"Status\n\nLifecycle of this tax year. Due and overdue feed dashboard alerts."}
            />
          </div>
          <AppInput
            label="Jurisdiction"
            value={taxForm.jurisdiction}
            onChange={(e) => setTaxForm({ ...taxForm, jurisdiction: e.target.value })}
            placeholder="e.g. City of Calgary"
            fieldHint={"Jurisdiction\n\nMunicipality or authority that bills the tax."}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Assessed value"
              type="number"
              value={taxForm.assessed_value}
              onChange={(e) => setTaxForm({ ...taxForm, assessed_value: e.target.value })}
              fieldHint={"Assessed value\n\nProperty assessment used for the tax calculation."}
            />
            <AppInput
              label="Tax amount"
              type="number"
              value={taxForm.tax_amount}
              onChange={(e) => setTaxForm({ ...taxForm, tax_amount: e.target.value })}
              fieldHint={"Tax amount\n\nTotal property tax due for this year."}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppDatePicker
              label="Due date"
              value={taxForm.due_date}
              onChange={(e) => setTaxForm({ ...taxForm, due_date: e.target.value })}
              fieldHint={"Due date\n\nWhen payment is due. Used for alerts."}
            />
            <AppDatePicker
              label="Paid date"
              value={taxForm.paid_date}
              onChange={(e) => setTaxForm({ ...taxForm, paid_date: e.target.value })}
              fieldHint={"Paid date\n\nOptional date the tax was paid in full."}
            />
          </div>
          <AppTextarea
            label="Notes"
            value={taxForm.notes}
            onChange={(e) => setTaxForm({ ...taxForm, notes: e.target.value })}
            rows={3}
            fieldHint={"Notes\n\nInstallments, account numbers, or other details for the team."}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={peopleModal}
        onClose={resetPeopleModal}
        title={editingPersonId ? 'Edit responsibility' : 'Add responsibility'}
        description={
          editingPersonId
            ? 'Update the contact for this role on the property.'
            : 'Assign a trade or management contact for this property.'
        }
        formWidth="comfortable"
        quickInfo={propertyPeopleQuickInfo(!!editingPersonId)}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={resetPeopleModal}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={savePerson}>
              Save
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <AppSelect
            label="Role"
            value={peopleForm.role}
            onChange={(e) => setPeopleForm({ ...peopleForm, role: e.target.value })}
            options={PEOPLE_ROLES}
            fieldHint={"Role\n\nWhat this person is responsible for (electrical, HVAC, property manager, etc.)."}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Contact name"
              value={peopleForm.contact_name}
              onChange={(e) => setPeopleForm({ ...peopleForm, contact_name: e.target.value })}
              fieldHint={"Contact name\n\nPrimary person to call for this role."}
            />
            <AppInput
              label="Company"
              value={peopleForm.contact_company}
              onChange={(e) => setPeopleForm({ ...peopleForm, contact_company: e.target.value })}
              fieldHint={"Company\n\nVendor or firm associated with this contact."}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Phone"
              value={peopleForm.contact_phone}
              onChange={(e) => setPeopleForm({ ...peopleForm, contact_phone: e.target.value })}
              fieldHint={"Phone\n\nBest number to reach this contact."}
            />
            <AppInput
              label="Email"
              type="email"
              value={peopleForm.contact_email}
              onChange={(e) => setPeopleForm({ ...peopleForm, contact_email: e.target.value })}
              fieldHint={"Email\n\nOptional email for scheduling and follow-up."}
            />
          </div>
          <AppTextarea
            label="Notes"
            value={peopleForm.notes}
            onChange={(e) => setPeopleForm({ ...peopleForm, notes: e.target.value })}
            rows={3}
            fieldHint={"Notes\n\nAccess instructions, preferred hours, or other details for the team."}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={maintModal}
        onClose={resetMaintModal}
        title={editingMaintId ? 'Edit maintenance' : 'Add maintenance'}
        description={
          editingMaintId
            ? 'Update schedule and status for this maintenance item.'
            : 'Schedule recurring work so next due dates stay visible on this property.'
        }
        formWidth="comfortable"
        quickInfo={propertyMaintenanceQuickInfo(!!editingMaintId)}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={resetMaintModal}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={saveMaint}>
              Save
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <AppInput
            label="Title"
            value={maintForm.title}
            onChange={(e) => setMaintForm({ ...maintForm, title: e.target.value })}
            fieldHint={"Title\n\nWhat work needs to be done (e.g. HVAC filter change)."}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Type"
              value={maintForm.item_type}
              onChange={(e) => setMaintForm({ ...maintForm, item_type: e.target.value })}
              placeholder="e.g. inspection, service"
              fieldHint={"Type\n\nCategory of work — inspection, service, seasonal, etc."}
            />
            <AppSelect
              label="Frequency"
              value={maintForm.frequency}
              onChange={(e) => setMaintForm({ ...maintForm, frequency: e.target.value })}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
                { value: 'annual', label: 'Annual' },
              ]}
              fieldHint={"Frequency\n\nHow often this item should repeat."}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppDatePicker
              label="Next due"
              value={maintForm.next_due_date}
              onChange={(e) => setMaintForm({ ...maintForm, next_due_date: e.target.value })}
              fieldHint={"Next due\n\nWhen this item is next scheduled. Used for alerts."}
            />
            <AppDatePicker
              label="Last completed"
              value={maintForm.last_completed_date}
              onChange={(e) => setMaintForm({ ...maintForm, last_completed_date: e.target.value })}
              fieldHint={"Last completed\n\nOptional date this work was last finished."}
            />
          </div>
          <AppSelect
            label="Status"
            value={maintForm.status}
            onChange={(e) => setMaintForm({ ...maintForm, status: e.target.value })}
            options={[
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'due', label: 'Due' },
              { value: 'overdue', label: 'Overdue' },
              { value: 'completed', label: 'Completed' },
            ]}
            fieldHint={"Status\n\nLifecycle of this item. Due and overdue stand out on the list."}
          />
          <AppTextarea
            label="Notes"
            value={maintForm.notes}
            onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })}
            rows={3}
            fieldHint={"Notes\n\nVendor, access details, or other instructions for the team."}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={permitModal}
        onClose={resetPermitModal}
        title={editingPermitId ? 'Edit permit' : 'Add permit'}
        description={
          editingPermitId
            ? 'Update stage and details for this permit.'
            : 'Record a permit so approvals and expiry stay visible on this property.'
        }
        formWidth="comfortable"
        quickInfo={propertyPermitQuickInfo(!!editingPermitId)}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={resetPermitModal}>
              Cancel
            </AppButton>
            <AppButton size="sm" onClick={savePermit}>
              Save
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <AppInput
            label="Title"
            value={permitForm.title}
            onChange={(e) => setPermitForm({ ...permitForm, title: e.target.value })}
            fieldHint={"Title\n\nShort name for this permit (e.g. electrical upgrade)."}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Type"
              value={permitForm.permit_type}
              onChange={(e) => setPermitForm({ ...permitForm, permit_type: e.target.value })}
              fieldHint={"Type\n\nPermit category — for example electrical, building, or occupancy."}
            />
            <AppInput
              label="Permit #"
              value={permitForm.permit_number}
              onChange={(e) => setPermitForm({ ...permitForm, permit_number: e.target.value })}
              fieldHint={"Permit #\n\nNumber issued by the authority."}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Authority"
              value={permitForm.authority}
              onChange={(e) => setPermitForm({ ...permitForm, authority: e.target.value })}
              fieldHint={"Authority\n\nCity, municipality, or agency reviewing the permit."}
            />
            <AppSelect
              label="Stage"
              value={permitForm.stage}
              onChange={(e) => setPermitForm({ ...permitForm, stage: e.target.value })}
              options={PERMIT_STAGES}
              fieldHint={"Stage\n\nWhere this permit sits in the approvals workflow. Also shown on the approvals board."}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppDatePicker
              label="Issued"
              value={permitForm.issued_date}
              onChange={(e) => setPermitForm({ ...permitForm, issued_date: e.target.value })}
              fieldHint={"Issued\n\nDate the permit was issued, if known."}
            />
            <AppDatePicker
              label="Expiry"
              value={permitForm.expiry_date}
              onChange={(e) => setPermitForm({ ...permitForm, expiry_date: e.target.value })}
              fieldHint={"Expiry\n\nWhen the permit expires. Used for compliance alerts."}
            />
          </div>
          <AppTextarea
            label="Notes"
            value={permitForm.notes}
            onChange={(e) => setPermitForm({ ...permitForm, notes: e.target.value })}
            rows={3}
            fieldHint={"Notes\n\nConditions, contacts, or other details for the team."}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit property"
        footer={
          <>
            <AppButton variant="secondary" onClick={() => setEditOpen(false)}>Cancel</AppButton>
            <AppButton onClick={saveProperty}>Save</AppButton>
          </>
        }
      >
        <div className="space-y-4">
          <AppInput label="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppSelect
              label="Type"
              value={editForm.property_type}
              onChange={(e) => setEditForm({ ...editForm, property_type: e.target.value })}
              options={[
                { value: 'office', label: 'Office' },
                { value: 'yard', label: 'Yard' },
                { value: 'warehouse', label: 'Warehouse' },
                { value: 'residential', label: 'Residential' },
                { value: 'investment', label: 'Investment' },
                { value: 'other', label: 'Other' },
              ]}
            />
            <AppSelect
              label="Ownership"
              value={editForm.ownership}
              onChange={(e) => setEditForm({ ...editForm, ownership: e.target.value })}
              options={[
                { value: 'owned', label: 'Owned' },
                { value: 'leased', label: 'Leased' },
              ]}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppSelect
              label="Visibility"
              value={editForm.visibility}
              onChange={(e) => setEditForm({ ...editForm, visibility: e.target.value })}
              options={[
                { value: 'company', label: 'Company' },
                { value: 'family', label: 'Family' },
              ]}
            />
            <AppSelect
              label="Status"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'sold', label: 'Sold' },
              ]}
            />
          </div>
          <AddressAutocomplete
            value={editForm.address_line1}
            onChange={(v) => setEditForm({ ...editForm, address_line1: v })}
            onAddressSelect={(addr) => {
              setEditForm((prev) => ({
                ...prev,
                address_line1: addr.address_line1,
                city: addr.city || prev.city,
                province: addr.province || prev.province,
                postal_code: addr.postal_code || prev.postal_code,
                country: addr.country || prev.country,
                lat: addr.lat != null ? String(addr.lat) : prev.lat,
                lng: addr.lng != null ? String(addr.lng) : prev.lng,
              }));
              if (addr.lat != null && addr.lng != null) setEditCoordsFromAutocomplete(true);
            }}
            placeholder="Search address…"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput label="City" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
            <AppInput label="Province" value={editForm.province} onChange={(e) => setEditForm({ ...editForm, province: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <AppInput label="Postal code" value={editForm.postal_code} onChange={(e) => setEditForm({ ...editForm, postal_code: e.target.value })} />
            <AppInput label="Latitude" type="number" value={editForm.lat} onChange={(e) => { setEditCoordsTouched(true); setEditForm({ ...editForm, lat: e.target.value }); }} />
            <AppInput label="Longitude" type="number" value={editForm.lng} onChange={(e) => { setEditCoordsTouched(true); setEditForm({ ...editForm, lng: e.target.value }); }} />
          </div>
          <p className={uiTypography.helper}>Coordinates update automatically from the address when you save, unless you set latitude/longitude manually.</p>
          <AppTextarea label="Notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className={uiTypography.sectionTitle}>Owners</div>
              <Link to="/settings?section=property-owners" className="text-xs text-brand-red hover:underline">
                Manage owners in Settings
              </Link>
            </div>
            {editOwners.map((o) => {
              const ent = entities?.find((e) => e.id === o.entity_id);
              return (
                <div key={o.entity_id} className="mt-2 flex items-center justify-between text-sm">
                  <span>
                    {ent?.display_name || ent?.legal_name}
                    {o.ownership_percentage != null ? ` (${o.ownership_percentage}%)` : ''}
                  </span>
                  <AppButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditOwners(editOwners.filter((x) => x.entity_id !== o.entity_id))}
                  >
                    Remove
                  </AppButton>
                </div>
              );
            })}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <AppSelect
                label="Entity"
                value={ownerEntityId}
                onChange={(e) => setOwnerEntityId(e.target.value)}
                options={[
                  { value: '', label: 'Select…' },
                  ...(entities || []).map((e) => ({ value: e.id, label: e.display_name || e.legal_name })),
                ]}
              />
              <AppInput label="%" type="number" value={ownerPct} onChange={(e) => setOwnerPct(e.target.value)} />
              <div className="flex items-end">
                <AppButton type="button" variant="secondary" onClick={addEditOwner}>Add</AppButton>
              </div>
            </div>
          </div>
        </div>
      </AppFormModal>
    </div>
  );
}
