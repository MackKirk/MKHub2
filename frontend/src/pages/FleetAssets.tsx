import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import NewFleetAssetModal from '@/components/fleet/NewFleetAssetModal';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  AppQuickFilterRow,
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
import { Search, SlidersHorizontal, Truck, List, Table2 } from 'lucide-react';
import { canEditFleetAssetRecord } from '@/lib/fleetPermissions';
import {
  formatFleetAssetStatus,
  getFleetAssetStatusVariant,
  getFleetDueStatusBadgeVariant,
} from '@/lib/fleetUi';
import { listPageSizeSelectOptions, parseListPageLimit } from '@/lib/listPagination';
import FleetAssetsSpreadsheetView from '@/components/fleet/FleetAssetsSpreadsheetView';

const FLEET_ASSETS_VIEW_STORAGE_KEY = 'fleet-assets-view-mode';
type FleetAssetsViewMode = 'list' | 'spreadsheet';

function resolveInitialFleetAssetsViewMode(urlView: string | null): FleetAssetsViewMode {
  // Spreadsheet is the default landing view; only explicit ?view=list keeps list.
  if (urlView === 'list') return 'list';
  return 'spreadsheet';
}

type FleetComplianceTypeStatus = {
  label: string;
  expiry_date?: string;
};

type FleetAsset = {
  id: string;
  asset_type: string;
  name: string;
  unit_number?: string;
  vin?: string;
  license_plate?: string;
  make?: string;
  model?: string;
  year?: number;
  condition?: string;
  body_style?: string;
  division_id?: string;
  status: string;
  odometer_current?: number;
  odometer_last_service?: number;
  odometer_next_due_at?: number;
  odometer_noted_issues?: string;
  hours_current?: number;
  hours_last_service?: number;
  hours_next_due_at?: number;
  hours_noted_issues?: string;
  driver_id?: string;
  driver_name?: string;
  assigned_to_name?: string | null;
  driver_contact_phone?: string;
  department?: string | null;
  fuel_type?: string;
  vehicle_type?: string;
  yard_location?: string;
  icbc_registration_no?: string;
  vancouver_decals?: string[];
  ferry_length?: string;
  gvw_kg?: number;
  gvw_value?: number;
  gvw_unit?: string;
  equipment_type_label?: string;
  created_at: string;
  compliance_by_type?: Record<string, FleetComplianceTypeStatus>;
};

const COMPLIANCE_TYPE_ORDER = ['CVIP', 'NDT', 'CRANE', 'PROPANE'] as const;

type FleetAssetsResponse = {
  items: FleetAsset[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  fuel_type_options: string[];
};

type FleetAssetsCountsResponse = {
  types: Record<string, number>;
  statuses: Record<string, number>;
  assigned: Record<string, number>;
};

const META_YARD_MAX_LEN = 30;

function buildMetaLine(asset: FleetAsset): string {
  const parts: string[] = [];
  if (asset.fuel_type?.trim()) parts.push(asset.fuel_type.trim());
  if (asset.vehicle_type?.trim()) parts.push(asset.vehicle_type.trim());
  if (asset.yard_location?.trim()) {
    const loc = asset.yard_location.trim();
    parts.push(loc.length > META_YARD_MAX_LEN ? `${loc.slice(0, META_YARD_MAX_LEN)}…` : loc);
  }
  if (parts.length > 0) return parts.join(' • ');
  const makeModel = [asset.make, asset.model].filter(Boolean).join(' ').trim();
  if (makeModel) return makeModel;
  if (asset.division_id) return `Division ${String(asset.division_id).slice(0, 8)}…`;
  return '';
}

function ruleValueStr(rule: FilterRule): string {
  return typeof rule.value === 'string' ? rule.value : (Array.isArray(rule.value) ? rule.value[0] ?? '' : '');
}

const FILTER_PARAM_KEYS = [
  'status', 'status_not', 'division_id', 'division_id_not', 'fuel_type', 'fuel_type_not',
  'type', 'type_not', 'year', 'year_not', 'assigned',
];

function convertRulesToParams(rules: FilterRule[], existing: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(existing);
  if (rules.length === 0) {
    FILTER_PARAM_KEYS.forEach((p) => params.delete(p));
    return params;
  }
  const fieldsSet = new Set(rules.filter((r) => ruleValueStr(r)?.trim()).map((r) => r.field));
  if (fieldsSet.has('type')) {
    params.delete('type');
    params.delete('type_not');
  }
  if (fieldsSet.has('status')) {
    params.delete('status');
    params.delete('status_not');
  }
  if (fieldsSet.has('division')) {
    params.delete('division_id');
    params.delete('division_id_not');
  }
  if (fieldsSet.has('fuel_type')) {
    params.delete('fuel_type');
    params.delete('fuel_type_not');
  }
  if (fieldsSet.has('year')) {
    params.delete('year');
    params.delete('year_not');
  }
  if (fieldsSet.has('assignment')) {
    params.delete('assigned');
  }
  for (const rule of rules) {
    const v = ruleValueStr(rule);
    if (!v?.trim()) continue;
    switch (rule.field) {
      case 'type':
        if (rule.operator === 'is') params.set('type', v);
        else params.set('type_not', v);
        break;
      case 'status':
        if (rule.operator === 'is') params.set('status', v);
        else params.set('status_not', v);
        break;
      case 'division':
        if (rule.operator === 'is') params.set('division_id', v);
        else params.set('division_id_not', v);
        break;
      case 'fuel_type':
        if (rule.operator === 'is') params.set('fuel_type', v);
        else params.set('fuel_type_not', v);
        break;
      case 'year':
        if (rule.operator === 'is') params.set('year', v);
        else params.set('year_not', v);
        break;
      case 'assignment':
        const wantAssigned = v === 'assigned';
        params.set('assigned', rule.operator === 'is_not' ? (!wantAssigned).toString() : wantAssigned.toString());
        break;
    }
  }
  return params;
}

function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;
  const typeVal = params.get('type');
  const typeNot = params.get('type_not');
  if (typeVal) rules.push({ id: `rule-${idCounter++}`, field: 'type', operator: 'is', value: typeVal });
  else if (typeNot) rules.push({ id: `rule-${idCounter++}`, field: 'type', operator: 'is_not', value: typeNot });
  const status = params.get('status');
  const statusNot = params.get('status_not');
  if (status) rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is', value: status });
  else if (statusNot) rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is_not', value: statusNot });
  const divisionId = params.get('division_id');
  const divisionIdNot = params.get('division_id_not');
  if (divisionId) rules.push({ id: `rule-${idCounter++}`, field: 'division', operator: 'is', value: divisionId });
  else if (divisionIdNot) rules.push({ id: `rule-${idCounter++}`, field: 'division', operator: 'is_not', value: divisionIdNot });
  const fuelType = params.get('fuel_type');
  const fuelTypeNot = params.get('fuel_type_not');
  if (fuelType) rules.push({ id: `rule-${idCounter++}`, field: 'fuel_type', operator: 'is', value: fuelType });
  else if (fuelTypeNot) rules.push({ id: `rule-${idCounter++}`, field: 'fuel_type', operator: 'is_not', value: fuelTypeNot });
  const year = params.get('year');
  const yearNot = params.get('year_not');
  if (year) rules.push({ id: `rule-${idCounter++}`, field: 'year', operator: 'is', value: year });
  else if (yearNot) rules.push({ id: `rule-${idCounter++}`, field: 'year', operator: 'is_not', value: yearNot });
  const assigned = params.get('assigned');
  if (assigned === 'true') rules.push({ id: `rule-${idCounter++}`, field: 'assignment', operator: 'is', value: 'assigned' });
  else if (assigned === 'false') rules.push({ id: `rule-${idCounter++}`, field: 'assignment', operator: 'is', value: 'available' });
  return rules;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

const TYPE_OPTIONS = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'heavy_machinery', label: 'Heavy Machinery' },
  { value: 'other', label: 'Other' },
];

const TYPE_QUICK_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'vehicle', label: 'Vehicles' },
  { value: 'heavy_machinery', label: 'Heavy Machinery' },
  { value: 'other', label: 'Other Assets' },
];

const ASSIGNMENT_OPTIONS = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'available', label: 'Available' },
];

function buildFleetAssetsApiParams(
  searchParams: URLSearchParams,
  typeFilter: string,
  sortBy: string,
  sortDir: string,
  page: number,
  limit: number,
  search: string,
  opts?: {
    omitQuickFilters?: boolean;
    page?: number;
    limit?: number;
    includeFuelTypes?: boolean;
    countsOnly?: boolean;
  },
): URLSearchParams {
  const params = new URLSearchParams();
  if (search) params.append('search', search);

  if (!opts?.omitQuickFilters && !opts?.countsOnly) {
    const typeVal = searchParams.get('type');
    const typeNot = searchParams.get('type_not');
    if (typeVal) params.append('asset_type', typeVal);
    else if (typeFilter !== 'all' && !typeNot) params.append('asset_type', typeFilter);
    if (typeNot) params.append('asset_type_not', typeNot);
    const status = searchParams.get('status');
    const statusNot = searchParams.get('status_not');
    const assigned = searchParams.get('assigned');
    if (status) params.append('status', status);
    if (statusNot) params.append('status_not', statusNot);
    if (assigned === 'true' || assigned === 'false') params.append('assigned', assigned);
  }

  const divisionId = searchParams.get('division_id');
  const divisionIdNot = searchParams.get('division_id_not');
  const fuelType = searchParams.get('fuel_type');
  const fuelTypeNot = searchParams.get('fuel_type_not');
  const year = searchParams.get('year');
  const yearNot = searchParams.get('year_not');
  if (divisionId) params.append('division_id', divisionId);
  if (divisionIdNot) params.append('division_id_not', divisionIdNot);
  if (fuelType) params.append('fuel_type', fuelType);
  if (fuelTypeNot) params.append('fuel_type_not', fuelTypeNot);
  if (year) params.append('year', year);
  if (yearNot) params.append('year_not', yearNot);

  if (!opts?.countsOnly) {
    params.set('sort', sortBy);
    params.set('dir', sortDir);
    params.set('page', String(opts?.page ?? page));
    params.set('limit', String(opts?.limit ?? limit));
    if (opts?.includeFuelTypes) params.set('include_fuel_types', 'true');
  }
  return params;
}

function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 30 }, (_, i) => {
    const y = currentYear - i;
    return { value: String(y), label: String(y) };
  });
}

function buildFleetFilterFields(
  fuelTypeOptions: string[],
  divisions: { id?: string; label?: string }[],
): FieldConfig[] {
  const sortedDivisions = [...divisions]
    .sort((a, b) => (a?.label || '').localeCompare(b?.label || '', undefined, { sensitivity: 'base' }))
    .map((d) => ({ value: String(d?.id ?? ''), label: d?.label ?? String(d?.id ?? '') }))
    .filter((d) => d.value);

  return [
    { id: 'type', label: 'Type', type: 'select', operators: ['is', 'is_not'], getOptions: () => TYPE_OPTIONS },
    { id: 'status', label: 'Status', type: 'select', operators: ['is', 'is_not'], getOptions: () => STATUS_OPTIONS },
    { id: 'division', label: 'Division', type: 'select', operators: ['is', 'is_not'], getOptions: () => sortedDivisions },
    {
      id: 'fuel_type',
      label: 'Fuel type',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => fuelTypeOptions.map((ft) => ({ value: ft, label: ft })),
    },
    { id: 'year', label: 'Year', type: 'select', operators: ['is', 'is_not'], getOptions: buildYearOptions },
    { id: 'assignment', label: 'Assignment', type: 'select', operators: ['is', 'is_not'], getOptions: () => ASSIGNMENT_OPTIONS },
  ];
}

function getFleetFieldLabel(fieldId: string): string {
  const labels: Record<string, string> = {
    type: 'Type',
    status: 'Status',
    division: 'Division',
    fuel_type: 'Fuel type',
    year: 'Year',
    assignment: 'Assignment',
  };
  return labels[fieldId] ?? fieldId;
}

const FLEET_VALUE_LABELS: Record<string, Record<string, string>> = {
  type: Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, o.label])),
  status: Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label])),
  assignment: Object.fromEntries(ASSIGNMENT_OPTIONS.map((o) => [o.value, o.label])),
};

function getFleetValueLabel(rule: FilterRule, divisions: { id?: string; label?: string }[]): string {
  const v = ruleValueStr(rule);
  if (rule.field === 'division') {
    const div = divisions.find((d) => String(d?.id) === v);
    return (div as { label?: string })?.label ?? v;
  }
  const map = FLEET_VALUE_LABELS[rule.field];
  return (map && map[v]) ?? v ?? '';
}

function getFleetAssetTypeLabel(assetType: string): string {
  if (assetType === 'vehicle') return 'Vehicle';
  if (assetType === 'heavy_machinery') return 'Heavy Machinery';
  return 'Other';
}

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  title,
  className,
}: {
  label: string;
  column: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (column: string) => void;
  title: string;
  className?: string;
}) {
  const active = sortBy === column;
  const arrow = sortDir === 'asc' ? '↑' : '↓';
  return (
    <th className={className}>
      <AppButton
        type="button"
        variant="ghost"
        size="sm"
        className={uiCx('h-auto inline-flex items-center gap-1 px-0 font-semibold text-gray-700 hover:text-gray-900')}
        onClick={() => onSort(column)}
        title={title}
      >
        <span>{label}</span>
        {/* Reserve arrow width so activating sort does not resize columns */}
        <span className={uiCx('inline-block w-3 shrink-0 text-center', active ? undefined : 'invisible')} aria-hidden={!active}>
          {active ? arrow : '↑'}
        </span>
      </AppButton>
    </th>
  );
}

export default function FleetAssets() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFromUrl = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [debouncedSearch, setDebouncedSearch] = useState(searchFromUrl);
  const [showNewAssetModal, setShowNewAssetModal] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<FleetAssetsViewMode>(() =>
    resolveInitialFleetAssetsViewMode(searchParams.get('view')),
  );
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const canCreateAsset = canEditFleetAssetRecord(isAdmin, permissions);
  
  // Get initial type from URL or path
  const getInitialType = () => {
    const pathname = window.location.pathname;
    if (pathname.includes('/vehicles')) return 'vehicle';
    if (pathname.includes('/heavy-machinery')) return 'heavy_machinery';
    if (pathname.includes('/other-assets')) return 'other';
    const urlType = searchParams.get('type');
    return urlType || 'all';
  };
  
  const [typeFilter, setTypeFilter] = useState<string>(getInitialType());

  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const [page, setPage] = useState(pageParam);
  const limit = parseListPageLimit(searchParams.get('limit'));
  const listPageSizeOptions = useMemo(() => listPageSizeSelectOptions(), []);
  const currentListPageSize = String(limit);

  // List sort (only columns that remain in the table)
  type SortColumn = 'unit_number' | 'name' | 'type' | 'year' | 'plate_vin' | 'assignment' | 'compliance' | 'status';
  const validSorts: SortColumn[] = ['unit_number', 'name', 'type', 'year', 'plate_vin', 'assignment', 'compliance', 'status'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn = (rawSort && validSorts.includes(rawSort as SortColumn)) ? (rawSort as SortColumn) : 'unit_number';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const setListSort = (column: SortColumn, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1'); // always go to page 1 when sort changes (affects all pages)
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  // Debounce search before syncing to URL (avoids refetch on every keystroke)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const currentSearch = params.get('search') || '';
    if (debouncedSearch === currentSearch) return;
    if (debouncedSearch) params.set('search', debouncedSearch);
    else params.delete('search');
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Sync search input when URL changes (e.g. back/forward navigation)
  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    if (urlSearch !== searchInput) setSearchInput(urlSearch);
    if (urlSearch !== debouncedSearch) setDebouncedSearch(urlSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (viewMode === 'list') {
          if (params.get('view') === 'list') return prev;
          params.set('view', 'list');
        } else {
          // Spreadsheet is the default — keep URL clean
          if (!params.has('view')) return prev;
          params.delete('view');
        }
        return params;
      },
      { replace: true },
    );
    localStorage.setItem(FLEET_ASSETS_VIEW_STORAGE_KEY, viewMode);
  }, [viewMode, setSearchParams]);

  // Update type filter and page when URL params change
  useEffect(() => {
    const urlType = searchParams.get('type');
    const pathname = window.location.pathname;
    const urlPage = parseInt(searchParams.get('page') || '1', 10);
    let newType = 'all';

    if (urlType) newType = urlType;
    else if (pathname.includes('/vehicles')) newType = 'vehicle';
    else if (pathname.includes('/heavy-machinery')) newType = 'heavy_machinery';
    else if (pathname.includes('/other-assets')) newType = 'other';

    setTypeFilter(prev => prev !== newType ? newType : prev);
    if (urlPage !== page) setPage(urlPage);
  }, [searchParams]);

  const search = searchFromUrl;
  
  // Update URL when type filter changes (reset page to 1)
  const handleTypeFilterChange = (type: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', '1');
    setPage(1);
    if (type === 'all') {
      newParams.delete('type');
      const currentPath = window.location.pathname;
      if (currentPath !== '/fleet/assets' && !currentPath.includes('/fleet/assets/')) {
        nav('/fleet/assets');
        setTimeout(() => setTypeFilter(type), 0);
        return;
      }
    } else {
      newParams.set('type', type);
    }
    setTypeFilter(type);
    setSearchParams(newParams, { replace: true });
  };

  const currentRules = useMemo(() => convertParamsToRules(searchParams), [searchParams]);
  const hasActiveFilters = currentRules.length > 0;

  const toggleStatusQuickFilter = (statusValue: string) => {
    const params = new URLSearchParams(searchParams);
    if (params.get('status') === statusValue) {
      params.delete('status');
    } else {
      params.delete('status_not');
      params.set('status', statusValue);
    }
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const toggleAssignedQuickFilter = (assignedValue: 'true' | 'false') => {
    const params = new URLSearchParams(searchParams);
    if (params.get('assigned') === assignedValue) {
      params.delete('assigned');
    } else {
      params.set('assigned', assignedValue);
    }
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const quickFilterSegments = useMemo(
    () => [
      ...TYPE_QUICK_FILTER_OPTIONS.map((opt) => ({
        key: `type:${opt.value}`,
        label: opt.label,
        active: typeFilter === opt.value,
        onClick: () => handleTypeFilterChange(opt.value),
      })),
      ...STATUS_OPTIONS.map((opt) => ({
        key: `status:${opt.value}`,
        label: opt.label,
        active: searchParams.get('status') === opt.value,
        onClick: () => toggleStatusQuickFilter(opt.value),
      })),
      {
        key: 'assigned:true',
        label: 'Assigned',
        active: searchParams.get('assigned') === 'true',
        onClick: () => toggleAssignedQuickFilter('true'),
      },
      {
        key: 'assigned:false',
        label: 'Available',
        active: searchParams.get('assigned') === 'false',
        onClick: () => toggleAssignedQuickFilter('false'),
      },
    ],
    [searchParams, typeFilter],
  );

  const quickFilterCountBaseQs = useMemo(
    () =>
      buildFleetAssetsApiParams(searchParams, typeFilter, 'unit_number', 'asc', 1, 1, search, {
        countsOnly: true,
      }).toString(),
    // Counts ignore sort/pagination/quick filters — exclude them so sorting does not refetch counts
    [
      search,
      searchParams.get('division_id'),
      searchParams.get('division_id_not'),
      searchParams.get('fuel_type'),
      searchParams.get('fuel_type_not'),
      searchParams.get('year'),
      searchParams.get('year_not'),
    ],
  );

  const { data: quickFilterCountsData } = useQuery({
    queryKey: ['fleetAssets', 'counts', quickFilterCountBaseQs],
    queryFn: () =>
      api<FleetAssetsCountsResponse>('GET', `/fleet/assets/counts?${quickFilterCountBaseQs}`),
    staleTime: 60_000,
  });

  const quickFilterCountsByKey = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!quickFilterCountsData) return counts;
    for (const [key, value] of Object.entries(quickFilterCountsData.types || {})) {
      if (typeof value === 'number') counts[`type:${key}`] = value;
    }
    for (const [key, value] of Object.entries(quickFilterCountsData.statuses || {})) {
      if (typeof value === 'number') counts[`status:${key}`] = value;
    }
    for (const [key, value] of Object.entries(quickFilterCountsData.assigned || {})) {
      if (typeof value === 'number') counts[`assigned:${key}`] = value;
    }
    return counts;
  }, [quickFilterCountsData]);

  const quickFilterSegmentsWithCounts = useMemo(
    () =>
      quickFilterSegments.map((segment) => ({
        ...segment,
        count: quickFilterCountsByKey[segment.key],
      })),
    [quickFilterSegments, quickFilterCountsByKey],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'fleetAssets',
      typeFilter,
      search,
      sortBy,
      sortDir,
      page,
      limit,
      searchParams.get('type'),
      searchParams.get('type_not'),
      searchParams.get('status'),
      searchParams.get('status_not'),
      searchParams.get('division_id'),
      searchParams.get('division_id_not'),
      searchParams.get('fuel_type'),
      searchParams.get('fuel_type_not'),
      searchParams.get('year'),
      searchParams.get('year_not'),
      searchParams.get('assigned'),
    ],
    queryFn: () => {
      const params = buildFleetAssetsApiParams(
        searchParams,
        typeFilter,
        sortBy,
        sortDir,
        page,
        limit,
        search,
      );
      return api<FleetAssetsResponse>('GET', `/fleet/assets?${params.toString()}`);
    },
    placeholderData: keepPreviousData,
  });

  const assets = data?.items ?? [];
  const isInitialLoading = isLoading && !data;

  const { data: fuelTypesData } = useQuery({
    queryKey: ['fleetAssets', 'fuel-type-options'],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', '1');
      params.set('include_fuel_types', 'true');
      return api<FleetAssetsResponse>('GET', `/fleet/assets?${params.toString()}`);
    },
    staleTime: 5 * 60_000,
    select: (res) => res.fuel_type_options ?? [],
  });
  const fuelTypeOptions = fuelTypesData ?? [];

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
  });
  const divisions = Array.isArray(settings?.divisions) ? settings.divisions : [];

  const filterFields = useMemo(
    () => buildFleetFilterFields(fuelTypeOptions, divisions),
    [fuelTypeOptions, divisions],
  );

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules, searchParams);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
    setIsFilterModalOpen(false);
  };

  const typeLabels: Record<string, string> = {
    vehicle: 'Vehicles',
    heavy_machinery: 'Heavy Machinery',
    other: 'Other Assets',
    all: 'All Fleet Assets',
  };

  const getTypeLabel = (type: string) => {
    return typeLabels[type] || type;
  };



  const emptyListTitle =
    typeFilter === 'all' ? 'No assets found' : `No ${getTypeLabel(typeFilter).toLowerCase()} found`;

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Fleet Assets"
        subtitle="Manage fleet assets"
        icon={<Truck className="h-4 w-4" />}

      />

      <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className={uiCx('flex shrink-0 items-stretch overflow-hidden', uiRadius.control, uiBorders.subtle)}>
            <AppButton
              type="button"
              variant={viewMode === 'spreadsheet' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !px-2.5"
              onClick={() => setViewMode('spreadsheet')}
              title="Spreadsheet view"
              aria-label="Spreadsheet view"
              aria-pressed={viewMode === 'spreadsheet'}
            >
              <Table2 className="h-4 w-4" />
            </AppButton>
            <AppButton
              type="button"
              variant={viewMode === 'list' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !border-l-0 !px-2.5"
              onClick={() => setViewMode('list')}
              title="List view"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List className="h-4 w-4" />
            </AppButton>
          </div>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search unit #, plate, VIN, or name (unit:6, plate:ABC…)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search fleet assets"
            />
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal className="h-4 w-4" />}
            onClick={() => setIsFilterModalOpen(true)}
          >
            Filters
          </AppButton>
          {hasActiveFilters ? (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const params = convertRulesToParams([], searchParams);
                params.set('page', '1');
                setPage(1);
                setSearchParams(params, { replace: true });
              }}
            >
              Clear
            </AppButton>
          ) : null}
        </div>
        <AppQuickFilterRow segments={quickFilterSegmentsWithCounts} />
      </AppCard>

      {hasActiveFilters ? (
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
          {currentRules.map((rule) => (
            <FilterChip
              key={rule.id}
              rule={rule}
              onRemove={() => {
                const updated = currentRules.filter((r) => r.id !== rule.id);
                const params = convertRulesToParams(updated, searchParams);
                params.set('page', '1');
                setPage(1);
                setSearchParams(params, { replace: true });
              }}
              getFieldLabel={getFleetFieldLabel}
              getValueLabel={(r) => getFleetValueLabel(r, divisions)}
            />
          ))}
        </div>
      ) : null}

      <AppCard
        className={uiShadows.card}
        bodyClassName="!p-0"
        footer={
          data && data.total > 0 ? (
            <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
              <p className={uiTypography.helper}>
                Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of{' '}
                {data.total} assets
              </p>
              <div className={uiCx(uiLayout.actionsRow, 'items-center flex-wrap gap-3')}>
                <div className="flex items-center gap-2">
                  <span className={uiTypography.helper}>Rows per page</span>
                  <AppSelect
                    size="sm"
                    value={currentListPageSize}
                    onChange={(e) => {
                      const params = new URLSearchParams(searchParams);
                      params.set('limit', e.target.value);
                      params.set('page', '1');
                      setPage(1);
                      setSearchParams(params);
                    }}
                    options={listPageSizeOptions}
                    sortOptions={false}
                    className="w-20"
                  />
                </div>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={data.page <= 1 || isFetching}
                  onClick={() => {
                    const newPage = Math.max(1, data.page - 1);
                    setPage(newPage);
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(newPage));
                    setSearchParams(params);
                  }}
                >
                  Previous
                </AppButton>
                <span className={uiTypography.helper}>
                  Page {data.page} of {data.total_pages}
                </span>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={data.page >= data.total_pages || isFetching}
                  onClick={() => {
                    const newPage = Math.min(data.total_pages, data.page + 1);
                    setPage(newPage);
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(newPage));
                    setSearchParams(params);
                  }}
                >
                  Next
                </AppButton>
              </div>
            </div>
          ) : undefined
        }
      >
        {canCreateAsset ? (
          <div className={uiSpacing.cardPadding}>
            <AppListCreateItem label="New Asset" layout="row" className="w-full" onClick={() => setShowNewAssetModal(true)} />
          </div>
        ) : null}
        {isInitialLoading ? (
          <div className={uiCx(uiSpacing.cardPadding, 'text-center')}>
            <p className={uiTypography.helper}>Loading assets...</p>
          </div>
        ) : assets.length > 0 ? (
          viewMode === 'spreadsheet' ? (
            <FleetAssetsSpreadsheetView
              assets={assets}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={setListSort}
              onRowNavigate={(id) => nav(`/fleet/assets/${id}`)}
              isFetching={isFetching}
            />
          ) : (
          <div
            className={uiCx(
              'overflow-x-auto min-w-0',
              isFetching && assets.length > 0 ? 'opacity-60 pointer-events-none' : undefined,
            )}
          >
            <table className={uiCx('w-full min-w-[1100px] table-fixed border-collapse', uiBorders.subtle)}>
              <colgroup>
                <col className="w-[7%]" />
                <col className="w-[20%]" />
                <col className="w-[11%]" />
                <col className="w-[7%]" />
                <col className="w-[11%]" />
                <col className="w-[13%]" />
                <col className="w-[18%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr className={uiCx(uiColors.surfaceSubtle, 'border-b border-gray-200')}>
                  <SortHeader
                    label="Unit #"
                    column="unit_number"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={(col) => setListSort(col as SortColumn)}
                    title="Sort by unit number"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Name"
                    column="name"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={(col) => setListSort(col as SortColumn)}
                    title="Sort by name"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Type"
                    column="type"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={(col) => setListSort(col as SortColumn)}
                    title="Sort by type"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Year"
                    column="year"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={(col) => setListSort(col as SortColumn)}
                    title="Sort by year"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Plate/VIN"
                    column="plate_vin"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={(col) => setListSort(col as SortColumn)}
                    title="Sort by plate/VIN"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Assignment"
                    column="assignment"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={(col) => setListSort(col as SortColumn)}
                    title="Sort by assignment"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Compliance"
                    column="compliance"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={(col) => setListSort(col as SortColumn)}
                    title="Sort by compliance status"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                  <SortHeader
                    label="Status"
                    column="status"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={(col) => setListSort(col as SortColumn)}
                    title="Sort by status"
                    className={uiCx('px-3 py-2 text-left', uiTypography.controlLabel)}
                  />
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const primaryName =
                    (asset.name && asset.name.trim()) ||
                    [asset.make, asset.model].filter(Boolean).join(' ').trim() ||
                    '—';
                  const metaLine = buildMetaLine(asset);
                  return (
                    <tr
                      key={asset.id}
                      className="cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 min-h-[52px]"
                      onClick={() => nav(`/fleet/assets/${asset.id}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          nav(`/fleet/assets/${asset.id}`);
                        }
                      }}
                    >
                      <td className={uiCx('px-3 py-3 align-top whitespace-nowrap', uiTypography.helper)}>
                        {asset.unit_number || '—'}
                      </td>
                      <td className="min-w-0 px-3 py-3 align-top">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className={uiCx('truncate font-medium', uiTypography.helper, uiColors.textStrong)}>
                            {primaryName}
                          </span>
                          {metaLine ? (
                            <span className={uiCx('truncate', uiTypography.helper)}>{metaLine}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <AppBadge variant="info">{getFleetAssetTypeLabel(asset.asset_type)}</AppBadge>
                      </td>
                      <td className={uiCx('px-3 py-3 align-top', uiTypography.helper)}>{asset.year ?? '—'}</td>
                      <td className={uiCx('min-w-0 truncate px-3 py-3 align-top', uiTypography.helper)}>
                        {asset.license_plate || asset.vin || '—'}
                      </td>
                      <td className="min-w-0 px-3 py-3 align-top">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <AppBadge variant={asset.driver_id ? 'warning' : 'success'} className="w-fit">
                            {asset.driver_id ? 'Assigned' : 'Available'}
                          </AppBadge>
                          {asset.driver_id && asset.driver_name ? (
                            <span className={uiCx('truncate', uiTypography.helper)}>{asset.driver_name}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="min-w-0 px-3 py-3 align-top">
                        {(() => {
                          const byType = asset.compliance_by_type || {};
                          const entries = COMPLIANCE_TYPE_ORDER.filter((t) => byType[t]).map((t) => [t, byType[t]] as const);
                          if (entries.length === 0) {
                            return <span className={uiTypography.helper}>—</span>;
                          }
                          return (
                            <div className="flex flex-wrap gap-1">
                              {entries.map(([type, s]) => (
                                <span key={type} title={`${type} expires ${s.expiry_date || '—'}`}>
                                  <AppBadge variant={getFleetDueStatusBadgeVariant(s.label)}>
                                    {type}: {s.label}
                                  </AppBadge>
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <AppBadge variant={getFleetAssetStatusVariant(asset.status)}>
                          {formatFleetAssetStatus(asset.status)}
                        </AppBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )
        ) : (
          <div className={uiCx(uiSpacing.cardPadding, 'pb-10')}>
            <AppEmptyState title={emptyListTitle} className="border-0 bg-transparent p-0 shadow-none" />
          </div>
        )}
      </AppCard>

      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        fields={filterFields}
        getFieldData={() => null}
      />

      <NewFleetAssetModal
        open={canCreateAsset && showNewAssetModal}
        onClose={() => setShowNewAssetModal(false)}
        initialAssetType={typeFilter === 'all' ? 'vehicle' : typeFilter}
        onSuccess={(data) => {
          setShowNewAssetModal(false);
          queryClient.invalidateQueries({ queryKey: ['fleetAssets'] });
          nav(`/fleet/assets/${data.id}`);
        }}
      />
    </div>
  );
}

