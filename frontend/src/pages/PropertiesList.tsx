import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Building2, LayoutGrid, List, MapPin, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { api, withFileAccessToken } from '@/lib/api';
import { canEditProperty } from '@/lib/propertiesPermissions';
import {
  formatPropertyAddress,
  PROPERTY_PLACEHOLDER_COVER,
  type PropertyListRow,
} from '@/lib/propertyListUtils';
import { resolveInitialListViewMode, type ProjectViewMode } from '@/lib/listPagination';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppPageHeader,
  AppSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const PropertyMapView = lazy(() => import('@/features/properties/components/PropertyMapView'));

type PropertyOwner = { entity_id: string; ownership_percentage?: number };
type PropertyEntity = { id: string; legal_name: string; display_name?: string };
type ListResponse = { items: PropertyListRow[]; total: number; page: number; total_pages: number };

const OWNERSHIP_OPTIONS = [
  { value: 'owned', label: 'Owned' },
  { value: 'leased', label: 'Leased' },
  { value: 'managed', label: 'Managed' },
  { value: 'other', label: 'Other' },
];

const VISIBILITY_OPTIONS = [
  { value: 'company', label: 'Company' },
  { value: 'family', label: 'Family' },
];

function PropertyListCard({ property, onClick }: { property: PropertyListRow; onClick: () => void }) {
  const cover = property.image_file_object_id
    ? withFileAccessToken(`/files/${property.image_file_object_id}/thumbnail?w=400`)
    : PROPERTY_PLACEHOLDER_COVER;
  const address = formatPropertyAddress(property);

  return (
    <button
      type="button"
      onClick={onClick}
      className={uiCx(
        'group relative block h-full w-full text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md',
        uiBorders.subtle,
        uiRadius.card,
        uiColors.surface,
      )}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex gap-4">
          <div className="h-20 w-24 shrink-0">
            <div className={uiCx('relative h-full w-full overflow-hidden bg-gray-100', uiRadius.control)}>
              <img className="h-full w-full object-cover" src={cover} alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className={uiCx(uiTypography.overline, 'truncate')}>
              {[property.property_type, property.ownership].filter(Boolean).join(' · ') || 'Property'}
            </div>
            <div className="mt-0.5 text-sm font-bold text-gray-900 transition-colors group-hover:text-[#7f1010] break-words">
              {property.name}
            </div>
            <div className={uiCx(uiTypography.helper, 'mt-1 line-clamp-2')}>{address || 'No address'}</div>
          </div>
        </div>

        <div className="border-t border-black/5" />

        <div className="flex flex-wrap items-center gap-1.5">
          <AppBadge variant={property.visibility === 'family' ? 'warning' : 'info'}>{property.visibility}</AppBadge>
          <AppBadge variant="neutral">{property.ownership}</AppBadge>
          {property.property_type ? <AppBadge variant="neutral">{property.property_type}</AppBadge> : null}
        </div>

        {property.owner_summary ? (
          <div className="min-w-0">
            <div className={uiCx(uiTypography.overline, 'mb-0.5')}>Owners</div>
            <div className="truncate text-xs font-semibold text-gray-900">{property.owner_summary}</div>
          </div>
        ) : null}
      </div>
    </button>
  );
}

function PropertyListRowItem({ property, onClick }: { property: PropertyListRow; onClick: () => void }) {
  const cover = property.image_file_object_id
    ? withFileAccessToken(`/files/${property.image_file_object_id}/thumbnail?w=120`)
    : PROPERTY_PLACEHOLDER_COVER;

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full cursor-pointer grid-cols-[3rem_minmax(0,2fr)_minmax(0,2fr)_auto] items-center gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-0 hover:bg-gray-50"
    >
      <div className={uiCx('h-10 w-12 overflow-hidden bg-gray-100', uiRadius.control)}>
        <img src={cover} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-gray-900">{property.name}</div>
        <div className={uiCx(uiTypography.helper, 'truncate')}>{property.owner_summary || '—'}</div>
      </div>
      <div className={uiCx(uiTypography.helper, 'min-w-0 truncate')}>{formatPropertyAddress(property) || '—'}</div>
      <div className="flex flex-wrap justify-end gap-1">
        <AppBadge variant="neutral">{property.ownership}</AppBadge>
        <AppBadge variant={property.visibility === 'family' ? 'warning' : 'info'}>{property.visibility}</AppBadge>
      </div>
    </button>
  );
}

export default function PropertiesList() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const perms = me?.permissions || [];
  const roles = me?.roles || [];

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [visibility, setVisibility] = useState(searchParams.get('visibility') || '');
  const [viewMode, setViewMode] = useState<ProjectViewMode>(() =>
    resolveInitialListViewMode(searchParams.get('view'), 'properties-view-mode', 'cards'),
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    property_type: 'office',
    ownership: 'owned',
    visibility: 'company',
    city: '',
    province: '',
    postal_code: '',
    country: '',
    address_line1: '',
    lat: '',
    lng: '',
  });
  const [coordsFromAutocomplete, setCoordsFromAutocomplete] = useState(false);
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [ownerEntityId, setOwnerEntityId] = useState('');
  const [ownerPct, setOwnerPct] = useState('');

  useEffect(() => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (viewMode === 'list') p.set('view', 'list');
      else if (viewMode === 'map') p.set('view', 'map');
      else p.delete('view');
      return p;
    }, { replace: true });
    if (viewMode === 'list' || viewMode === 'cards') {
      localStorage.setItem('properties-view-mode', viewMode);
    }
  }, [viewMode, setSearchParams]);

  const queryKey = ['properties-list', search, visibility, viewMode];
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (visibility) qs.set('visibility', visibility);
      qs.set('limit', viewMode === 'map' ? '100' : '50');
      return api<ListResponse>('GET', `/properties?${qs.toString()}`);
    },
    enabled: viewMode !== 'map',
  });

  const { data: entities } = useQuery({
    queryKey: ['property-entities'],
    queryFn: () => api<PropertyEntity[]>('GET', '/properties/entities'),
  });

  const canCreateCompany = canEditProperty('company', perms, roles);
  const canCreateFamily = canEditProperty('family', perms, roles);

  const addOwner = () => {
    if (!ownerEntityId) return;
    if (owners.some((o) => o.entity_id === ownerEntityId)) {
      toast.error('Entity already added');
      return;
    }
    setOwners([
      ...owners,
      { entity_id: ownerEntityId, ownership_percentage: ownerPct ? Number(ownerPct) : undefined },
    ]);
    setOwnerEntityId('');
    setOwnerPct('');
  };

  const submitCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (form.visibility === 'company' && !canCreateCompany) {
      toast.error('No permission to create company properties');
      return;
    }
    if (form.visibility === 'family' && !canCreateFamily) {
      toast.error('No permission to create family properties');
      return;
    }
    try {
      const payload: Record<string, unknown> = { ...form, owners };
      if (coordsFromAutocomplete) {
        payload.lat = form.lat ? Number(form.lat) : null;
        payload.lng = form.lng ? Number(form.lng) : null;
      } else {
        delete payload.lat;
        delete payload.lng;
      }
      const created = await api<{ id: string }>('POST', '/properties', payload);
      toast.success('Property created');
      setCreateOpen(false);
      setCoordsFromAutocomplete(false);
      qc.invalidateQueries({ queryKey: ['properties-list'] });
      nav(`/properties/${created.id}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create property');
    }
  };

  const openProperty = (id: string) => nav(`/properties/${id}`);

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Properties"
        subtitle="Mack Kirk and family portfolio"
        icon={<Building2 className="h-4 w-4" />}
        actions={
          (canCreateCompany || canCreateFamily) ? (
            <AppButton leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              New property
            </AppButton>
          ) : undefined
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className={uiCx('flex shrink-0 items-stretch overflow-hidden', uiRadius.control, uiBorders.subtle)}>
            <AppButton
              type="button"
              variant={viewMode === 'list' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !px-2.5"
              onClick={() => setViewMode('list')}
              title="List view"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List className="h-4 w-4" />
            </AppButton>
            <AppButton
              type="button"
              variant={viewMode === 'cards' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !border-l-0 !px-2.5"
              onClick={() => setViewMode('cards')}
              title="Card view"
              aria-label="Card view"
              aria-pressed={viewMode === 'cards'}
            >
              <LayoutGrid className="h-4 w-4" />
            </AppButton>
            <AppButton
              type="button"
              variant={viewMode === 'map' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !border-l-0 !px-2.5"
              onClick={() => setViewMode('map')}
              title="Map view"
              aria-label="Map view"
              aria-pressed={viewMode === 'map'}
            >
              <MapPin className="h-4 w-4" />
            </AppButton>
          </div>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by name, address, or owner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search properties"
            />
          </div>
          <AppSelect
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            options={[{ value: '', label: 'All visibility' }, ...VISIBILITY_OPTIONS]}
            className="w-44"
            aria-label="Visibility filter"
          />
        </div>
      </AppCard>

      {viewMode === 'map' ? (
        <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
          <Suspense fallback={<div className={uiTypography.helper}>Loading map…</div>}>
            <PropertyMapView search={search} visibility={visibility} />
          </Suspense>
        </AppCard>
      ) : isLoading ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className={uiTypography.helper}>Loading properties…</div>
        </AppCard>
      ) : isError ? (
        <AppEmptyState title="Could not load properties" description={(error as Error)?.message} />
      ) : !data?.items?.length ? (
        <AppEmptyState
          title="No properties yet"
          description="Create a property to start the register."
          action={
            (canCreateCompany || canCreateFamily) ? (
              <AppButton leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                New property
              </AppButton>
            ) : undefined
          }
        />
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <PropertyListCard key={p.id} property={p} onClick={() => openProperty(p.id)} />
          ))}
        </div>
      ) : (
        <AppCard className={uiCx(uiShadows.card, 'overflow-hidden')} bodyClassName="!p-0">
          <div className="grid grid-cols-[3rem_minmax(0,2fr)_minmax(0,2fr)_auto] gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2">
            <span />
            <span className={uiTypography.overline}>Property</span>
            <span className={uiTypography.overline}>Address</span>
            <span className={uiCx(uiTypography.overline, 'text-right')}>Tags</span>
          </div>
          {data.items.map((p) => (
            <PropertyListRowItem key={p.id} property={p} onClick={() => openProperty(p.id)} />
          ))}
        </AppCard>
      )}

      <AppFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New property"
        formWidth="wide"
        footer={
          <>
            <AppButton variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</AppButton>
            <AppButton onClick={submitCreate}>Create</AppButton>
          </>
        }
      >
        <div className="space-y-4">
          <AppInput label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppSelect
              label="Type"
              value={form.property_type}
              onChange={(e) => setForm({ ...form, property_type: e.target.value })}
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
              value={form.ownership}
              onChange={(e) => setForm({ ...form, ownership: e.target.value })}
              options={OWNERSHIP_OPTIONS}
            />
          </div>
          <AppSelect
            label="Visibility"
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            options={VISIBILITY_OPTIONS}
          />
          <div>
            <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Address</div>
            <AddressAutocomplete
              value={form.address_line1}
              onChange={(v) => setForm({ ...form, address_line1: v })}
              onAddressSelect={(addr) => {
                setForm((prev) => ({
                  ...prev,
                  address_line1: addr.address_line1,
                  city: addr.city || prev.city,
                  province: addr.province || prev.province,
                  postal_code: addr.postal_code || prev.postal_code,
                  country: addr.country || prev.country,
                  lat: addr.lat != null ? String(addr.lat) : prev.lat,
                  lng: addr.lng != null ? String(addr.lng) : prev.lng,
                }));
                if (addr.lat != null && addr.lng != null) setCoordsFromAutocomplete(true);
              }}
              placeholder="Search address…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <AppInput label="Province" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className={uiTypography.sectionTitle}>Owners</div>
              <Link to="/settings?section=property-owners" className="text-xs text-brand-red hover:underline">
                Manage owners in Settings
              </Link>
            </div>
            {owners.map((o) => {
              const ent = entities?.find((e) => e.id === o.entity_id);
              return (
                <div key={o.entity_id} className="mt-2 flex items-center justify-between text-sm">
                  <span>{ent?.display_name || ent?.legal_name}</span>
                  <AppButton variant="ghost" size="sm" onClick={() => setOwners(owners.filter((x) => x.entity_id !== o.entity_id))}>
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
                <AppButton type="button" variant="secondary" onClick={addOwner}>Add</AppButton>
              </div>
            </div>
          </div>
        </div>
      </AppFormModal>
    </div>
  );
}
