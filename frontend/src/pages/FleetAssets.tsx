import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { api } from '@/lib/api';
import { FleetAssetNewForm } from './FleetAssetNew';

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
  driver_contact_phone?: string;
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
};

type FleetAssetsResponse = {
  items: FleetAsset[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  fuel_type_options: string[];
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

// Filter builder (Opportunities-style)
type FilterField = 'type' | 'status' | 'division' | 'fuel_type' | 'year' | 'assignment';
type FilterOperator = 'is' | 'is_not';
type FilterRule = { id: string; field: FilterField; operator: FilterOperator; value: string };

function getOperatorsForField(): Array<{ value: FilterOperator; label: string }> {
  return [
    { value: 'is', label: 'Is' },
    { value: 'is_not', label: 'Is not' },
  ];
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
  const fieldsSet = new Set(rules.filter((r) => r.value?.trim()).map((r) => r.field));
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
    if (!rule.value?.trim()) continue;
    switch (rule.field) {
      case 'type':
        if (rule.operator === 'is') params.set('type', rule.value);
        else params.set('type_not', rule.value);
        break;
      case 'status':
        if (rule.operator === 'is') params.set('status', rule.value);
        else params.set('status_not', rule.value);
        break;
      case 'division':
        if (rule.operator === 'is') params.set('division_id', rule.value);
        else params.set('division_id_not', rule.value);
        break;
      case 'fuel_type':
        if (rule.operator === 'is') params.set('fuel_type', rule.value);
        else params.set('fuel_type_not', rule.value);
        break;
      case 'year':
        if (rule.operator === 'is') params.set('year', rule.value);
        else params.set('year_not', rule.value);
        break;
      case 'assignment':
        const wantAssigned = rule.value === 'assigned';
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

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-sm text-gray-800 transition-all duration-200 ease-out">
      <span className="font-medium text-gray-600">{label}:</span>
      <span>{value}</span>
      <button
        type="button"
        onClick={onRemove}
        className="w-5 h-5 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors duration-150"
        aria-label={`Remove ${label} filter`}
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
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

const ASSIGNMENT_OPTIONS = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'available', label: 'Available' },
];

function FleetFilterRuleRow({
  rule,
  onUpdate,
  onDelete,
  fuelTypeOptions,
  divisions,
}: {
  rule: FilterRule;
  onUpdate: (r: FilterRule) => void;
  onDelete: () => void;
  fuelTypeOptions: string[];
  divisions: { id?: string; label?: string }[];
}) {
  const operators = getOperatorsForField();
  const fieldOptions: Array<{ value: FilterField; label: string }> = [
    { value: 'type', label: 'Type' },
    { value: 'status', label: 'Status' },
    { value: 'division', label: 'Division' },
    { value: 'fuel_type', label: 'Fuel type' },
    { value: 'year', label: 'Year' },
    { value: 'assignment', label: 'Assignment' },
  ];

  const handleFieldChange = (newField: FilterField) => {
    onUpdate({ ...rule, field: newField, operator: 'is', value: '' });
  };

  const handleOperatorChange = (newOp: FilterOperator) => {
    onUpdate({ ...rule, operator: newOp });
  };

  const handleValueChange = (value: string) => {
    onUpdate({ ...rule, value });
  };

  const renderValueInput = () => {
    if (rule.field === 'type') {
      return (
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={rule.value}
          onChange={(e) => handleValueChange(e.target.value)}
        >
          <option value="">Select type...</option>
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    if (rule.field === 'status') {
      return (
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={rule.value}
          onChange={(e) => handleValueChange(e.target.value)}
        >
          <option value="">Select status...</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    if (rule.field === 'division') {
      const sorted = [...divisions].sort((a, b) => (a?.label || '').localeCompare(b?.label || '', undefined, { sensitivity: 'base' }));
      return (
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={rule.value}
          onChange={(e) => handleValueChange(e.target.value)}
        >
          <option value="">Select division...</option>
          {sorted.map((d) => (
            <option key={d?.id} value={d?.id}>{d?.label ?? d?.id}</option>
          ))}
        </select>
      );
    }
    if (rule.field === 'fuel_type') {
      return (
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={rule.value}
          onChange={(e) => handleValueChange(e.target.value)}
        >
          <option value="">Select fuel type...</option>
          {fuelTypeOptions.length === 0 ? (
            <option value="" disabled>No options (filter by Vehicles or All to see fuel types)</option>
          ) : (
            fuelTypeOptions.map((ft) => (
              <option key={ft} value={ft}>{ft}</option>
            ))
          )}
        </select>
      );
    }
    if (rule.field === 'year') {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: 30 }, (_, i) => currentYear - i);
      return (
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={rule.value}
          onChange={(e) => handleValueChange(e.target.value)}
        >
          <option value="">Select year...</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      );
    }
    if (rule.field === 'assignment') {
      return (
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={rule.value}
          onChange={(e) => handleValueChange(e.target.value)}
        >
          <option value="">Select...</option>
          {ASSIGNMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    return null;
  };

  return (
    <div className="flex items-center gap-3">
      <select
        className="w-40 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
        value={rule.field}
        onChange={(e) => handleFieldChange(e.target.value as FilterField)}
      >
        {fieldOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <select
        className="w-36 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
        value={rule.operator}
        onChange={(e) => handleOperatorChange(e.target.value as FilterOperator)}
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>
      <div className="flex-1 min-w-0">{renderValueInput()}</div>
      <button
        type="button"
        onClick={onDelete}
        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors duration-150 shrink-0"
        aria-label="Delete rule"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

function FleetFilterBuilderModal({
  isOpen,
  onClose,
  onApply,
  initialRules,
  fuelTypeOptions,
  divisions,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (rules: FilterRule[]) => void;
  initialRules: FilterRule[];
  fuelTypeOptions: string[];
  divisions: { id?: string; label?: string }[];
}) {
  const [rules, setRules] = useState<FilterRule[]>(initialRules);

  useEffect(() => {
    if (isOpen) setRules(initialRules);
  }, [isOpen, initialRules]);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  const handleAddRule = () => {
    setRules((prev) => [
      ...prev,
      { id: `rule-${Date.now()}`, field: 'status', operator: 'is', value: '' },
    ]);
  };

  const handleUpdateRule = (updated: FilterRule) => {
    setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleDeleteRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleApply = () => {
    onApply(rules);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200 ease-out"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-[720px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">No filters applied. Add a filter to get started.</div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <FleetFilterRuleRow
                  key={rule.id}
                  rule={rule}
                  onUpdate={handleUpdateRule}
                  onDelete={() => handleDeleteRule(rule.id)}
                  fuelTypeOptions={fuelTypeOptions}
                  divisions={divisions}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={handleAddRule}
            className="mt-4 w-full px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md hover:bg-gray-50 transition-all duration-150"
          >
            + Add filter
          </button>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <div>
            {rules.length > 0 && (
              <button type="button" onClick={() => setRules([])} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Clear All
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
              Cancel
            </button>
            <button type="button" onClick={handleApply} className="px-4 py-2 text-sm font-medium text-white bg-brand-red hover:bg-brand-red/90 rounded-md">
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FleetAssets() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [showNewAssetModal, setShowNewAssetModal] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  
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
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const [page, setPage] = useState(pageParam);
  const limit = 15;

  // List sort (only columns that remain in the table)
  type SortColumn = 'unit_number' | 'name' | 'type' | 'year' | 'plate_vin' | 'assignment' | 'status';
  const validSorts: SortColumn[] = ['unit_number', 'name', 'type', 'year', 'plate_vin', 'assignment', 'status'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn = (rawSort && validSorts.includes(rawSort as SortColumn)) ? (rawSort as SortColumn) : 'name';
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

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'fleetAssets',
      typeFilter,
      search,
      sortBy,
      sortDir,
      page,
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
      const params = new URLSearchParams();
      const typeVal = searchParams.get('type');
      const typeNot = searchParams.get('type_not');
      if (typeVal) params.append('asset_type', typeVal);
      else if (typeFilter !== 'all' && !typeNot) params.append('asset_type', typeFilter);
      if (typeNot) params.append('asset_type_not', typeNot);
      if (search) params.append('search', search);
      const status = searchParams.get('status');
      const statusNot = searchParams.get('status_not');
      const divisionId = searchParams.get('division_id');
      const divisionIdNot = searchParams.get('division_id_not');
      const fuelType = searchParams.get('fuel_type');
      const fuelTypeNot = searchParams.get('fuel_type_not');
      const year = searchParams.get('year');
      const yearNot = searchParams.get('year_not');
      const assigned = searchParams.get('assigned');
      if (status) params.append('status', status);
      if (statusNot) params.append('status_not', statusNot);
      if (divisionId) params.append('division_id', divisionId);
      if (divisionIdNot) params.append('division_id_not', divisionIdNot);
      if (fuelType) params.append('fuel_type', fuelType);
      if (fuelTypeNot) params.append('fuel_type_not', fuelTypeNot);
      if (year) params.append('year', year);
      if (yearNot) params.append('year_not', yearNot);
      if (assigned === 'true' || assigned === 'false') params.append('assigned', assigned);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      params.set('page', String(page));
      params.set('limit', String(limit));
      return api<FleetAssetsResponse>('GET', `/fleet/assets?${params.toString()}`);
    },
  });

  const assets = data?.items ?? [];
  const fuelTypeOptions = data?.fuel_type_options ?? [];

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
  });
  const divisions = Array.isArray(settings?.divisions) ? settings.divisions : [];

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules, searchParams);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
    setIsFilterModalOpen(false);
  };

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    retired: 'bg-red-100 text-red-800',
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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  function renderExpandedPanel(asset: FleetAsset) {
    const detail = (label: string, value: string | number | undefined) =>
      value !== undefined && value !== null && String(value).trim() !== '' ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
          <span className="text-xs text-gray-900">{Array.isArray(value) ? (value as string[]).join(', ') : String(value)}</span>
        </div>
      ) : null;

    const gvwDisplay = asset.gvw_value != null
      ? `${asset.gvw_value}${asset.gvw_unit ? ` ${asset.gvw_unit}` : ''}`
      : asset.gvw_kg != null ? `${asset.gvw_kg} kg` : undefined;

    return (
      <div className="p-4 bg-gray-50/80 border-t border-gray-100 transition-all duration-150">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-left">
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Identity</div>
            <div className="space-y-2">
              {detail('Make', asset.make)}
              {detail('Model', asset.model)}
              {detail('VIN/Serial', asset.vin)}
              {detail('Division', asset.division_id)}
              {detail('Condition', asset.condition)}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Registration / Compliance</div>
            <div className="space-y-2">
              {detail('ICBC Registration No.', asset.icbc_registration_no)}
              {detail('Vancouver Decal(s)', Array.isArray(asset.vancouver_decals) ? asset.vancouver_decals.join(', ') : undefined)}
              {detail('Ferry Length', asset.ferry_length)}
              {detail('GVW', gvwDisplay)}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Maintenance</div>
            <div className="space-y-2">
              {detail('Current Odometer', asset.odometer_current)}
              {detail('Last Service Odometer', asset.odometer_last_service)}
              {detail('Odometer Next Due At', asset.odometer_next_due_at)}
              {detail('Odometer Noted Issues', asset.odometer_noted_issues)}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Location / Contact</div>
            <div className="space-y-2">
              {detail('Yard Location', asset.yard_location)}
              {detail('Driver Contact Phone', asset.driver_contact_phone)}
            </div>
          </div>
          {asset.asset_type === 'heavy_machinery' && (
            <div className="space-y-3">
              <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Hours</div>
              <div className="space-y-2">
                {detail('Current Hours', asset.hours_current)}
                {detail('Hours Next Due At', asset.hours_next_due_at)}
                {detail('Hours Noted Issues', asset.hours_noted_issues)}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 pt-3 border-t border-gray-200 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); nav(`/fleet/assets/${asset.id}`); }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity"
          >
            View Details
          </button>
        </div>
      </div>
    );
  }

  // When New Asset modal is open: prevent body scroll and ESC to close
  useEffect(() => {
    if (!showNewAssetModal) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowNewAssetModal(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [showNewAssetModal]);

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">{getTypeLabel(typeFilter)}</div>
              <div className="text-xs text-gray-500 mt-0.5">Manage fleet assets</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar - same layout as Customers */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex gap-1 border-b border-gray-200 px-0 pt-0 pb-3 mb-3">
          <button
            onClick={() => handleTypeFilterChange('all')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              typeFilter === 'all' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleTypeFilterChange('vehicle')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              typeFilter === 'vehicle' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Vehicles
          </button>
          <button
            onClick={() => handleTypeFilterChange('heavy_machinery')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              typeFilter === 'heavy_machinery' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Heavy Machinery
          </button>
          <button
            onClick={() => handleTypeFilterChange('other')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              typeFilter === 'other' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Other Assets
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, VIN, plate, model, fuel type, type (SUV…), address, assigned user…"
                value={search}
                onChange={(e) => {
                  const next = e.target.value;
                  const params = new URLSearchParams(searchParams);
                  if (next) params.set('search', next);
                  else params.delete('search');
                  params.set('page', '1');
                  setPage(1);
                  setSearchParams(params, { replace: true });
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-9 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsFilterModalOpen(true)}
            className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 transition-colors duration-150 whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                const params = convertRulesToParams([], searchParams);
                params.set('page', '1');
                setPage(1);
                setSearchParams(params, { replace: true });
              }}
              className="px-3 py-1.5 rounded-full text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors duration-150 whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      {hasActiveFilters && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {currentRules.map((rule) => {
            const fieldLabels: Record<FilterField, string> = {
              type: 'Type',
              status: 'Status',
              division: 'Division',
              fuel_type: 'Fuel type',
              year: 'Year',
              assignment: 'Assignment',
            };
            const fieldLabel = fieldLabels[rule.field];
            let displayValue = rule.value;
            if (rule.field === 'type') {
              const opt = TYPE_OPTIONS.find((o) => o.value === rule.value);
              displayValue = opt?.label ?? rule.value;
            } else if (rule.field === 'status') {
              displayValue = rule.value.charAt(0).toUpperCase() + rule.value.slice(1);
            } else if (rule.field === 'division') {
              const div = divisions.find((d: { id?: string }) => String(d?.id) === rule.value);
              displayValue = (div as { label?: string })?.label ?? rule.value;
            } else if (rule.field === 'assignment') {
              displayValue = rule.value === 'assigned' ? 'Assigned' : 'Available';
            }
            const operatorLabel = rule.operator === 'is_not' ? 'Is not' : '';
            const label = operatorLabel ? `${fieldLabel} ${operatorLabel}` : fieldLabel;
            return (
              <FilterChip
                key={rule.id}
                label={label}
                value={displayValue}
                onRemove={() => {
                  const updated = currentRules.filter((r) => r.id !== rule.id);
                  const params = convertRulesToParams(updated, searchParams);
                  params.set('page', '1');
                  setPage(1);
                  setSearchParams(params, { replace: true });
                }}
              />
            );
          })}
        </div>
      )}

      {/* List - New Asset first row (same pattern as Opportunities) + table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0">
        <button
          type="button"
          onClick={() => setShowNewAssetModal(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-0"
        >
          <div className="text-lg text-gray-400 mr-2">+</div>
          <div className="font-medium text-xs text-gray-700">New Asset</div>
        </button>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading assets...</div>
        ) : (assets.length > 0 ? (
          <>
            <div className="overflow-x-auto min-w-0">
              <table className="w-full min-w-0 border-collapse">
                <thead>
                  <tr className="text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                    <th className="w-10 px-2 py-2 text-left rounded-tl-lg" scope="col" aria-label="Expand row" />
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('unit_number')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by unit number">Unit #{sortBy === 'unit_number' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('name')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by name">Name{sortBy === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('type')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by type">Type{sortBy === 'type' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('year')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by year">Year{sortBy === 'year' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('plate_vin')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by plate/VIN">Plate/VIN{sortBy === 'plate_vin' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('assignment')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by assignment">Assignment{sortBy === 'assignment' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left rounded-tr-lg">
                      <button type="button" onClick={() => setListSort('status')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by status">Status{sortBy === 'status' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => {
                    const isExpanded = expandedRowId === asset.id;
                    const primaryName = (asset.name && asset.name.trim()) || [asset.make, asset.model].filter(Boolean).join(' ').trim() || '—';
                    const metaLine = buildMetaLine(asset);
                    return (
                      <Fragment key={asset.id}>
                        <tr
                          key={asset.id}
                          className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors min-h-[52px]"
                          onClick={() => setExpandedRowId((prev) => (prev === asset.id ? null : asset.id))}
                        >
                          <td className="w-10 px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRowId((prev) => (prev === asset.id ? null : asset.id));
                              }}
                              className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              {isExpanded ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-600 align-top whitespace-nowrap">{asset.unit_number || '—'}</td>
                          <td className="px-3 py-3 align-top min-w-0">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-xs font-medium text-gray-900 truncate">{primaryName}</span>
                              {metaLine ? <span className="text-[11px] text-gray-500 truncate">{metaLine}</span> : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                              {asset.asset_type === 'vehicle' ? 'Vehicle' : asset.asset_type === 'heavy_machinery' ? 'Heavy Machinery' : 'Other'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-600 align-top">{asset.year ?? '—'}</td>
                          <td className="px-3 py-3 text-xs text-gray-600 align-top truncate max-w-[120px]">{asset.license_plate || asset.vin || '—'}</td>
                          <td className="px-3 py-3 align-top min-w-0">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium w-fit ${asset.driver_id ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                {asset.driver_id ? 'Assigned' : 'Available'}
                              </span>
                              {asset.driver_id && asset.driver_name ? (
                                <span className="text-[11px] text-gray-500 truncate">{asset.driver_name}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[asset.status] || 'bg-gray-100 text-gray-800'}`}>
                              {asset.status}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50/50">
                            <td colSpan={8} className="p-0 align-top">
                              {renderExpandedPanel(asset)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {data && data.total > 0 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-xs text-gray-600">
                  Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of {data.total} assets
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newPage = Math.max(1, data.page - 1);
                      setPage(newPage);
                      const params = new URLSearchParams(searchParams);
                      params.set('page', String(newPage));
                      setSearchParams(params);
                    }}
                    disabled={data.page <= 1 || isFetching}
                    className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  <div className="text-xs text-gray-700 font-medium">
                    Page {data.page} of {data.total_pages}
                  </div>
                  <button
                    onClick={() => {
                      const newPage = Math.min(data.total_pages, data.page + 1);
                      setPage(newPage);
                      const params = new URLSearchParams(searchParams);
                      params.set('page', String(newPage));
                      setSearchParams(params);
                    }}
                    disabled={data.page >= data.total_pages || isFetching}
                    className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-8 text-center text-xs text-gray-500">
            No {typeFilter === 'all' ? 'assets' : getTypeLabel(typeFilter).toLowerCase()} found
          </div>
        ))}
      </div>

      <FleetFilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        fuelTypeOptions={fuelTypeOptions}
        divisions={divisions}
      />

      {/* New Asset Modal - same visual as New Site (SiteDetail) */}
      {showNewAssetModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setShowNewAssetModal(false)}
        >
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowNewAssetModal(false)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">New Asset</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create a new fleet asset</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <FleetAssetNewForm
                initialAssetType={typeFilter === 'all' ? 'vehicle' : typeFilter}
                onSuccess={(data) => {
                  setShowNewAssetModal(false);
                  queryClient.invalidateQueries({ queryKey: ['fleetAssets'] });
                  nav(`/fleet/assets/${data.id}`);
                }}
                onCancel={() => setShowNewAssetModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

