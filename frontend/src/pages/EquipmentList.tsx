import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { api } from '@/lib/api';
import { EquipmentNewForm } from './EquipmentNew';
import { formatDateLocal } from '@/lib/dateUtils';
import OverlayPortal from '@/components/OverlayPortal';

type Equipment = {
  id: string;
  category: string;
  name: string;
  unit_number?: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  value?: number;
  status: string;
  created_at: string;
  warranty_expiry?: string;
  purchase_date?: string;
  notes?: string;
  assigned_to_name?: string;
};

type EquipmentListResponse = {
  items: Equipment[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

const categoryLabels: Record<string, string> = {
  all: 'All Equipment',
  generator: 'Generators',
  tool: 'Tools',
  electronics: 'Electronics',
  small_tool: 'Small Tools',
  safety: 'Safety Equipment',
};

const META_SERIAL_MAX_LEN = 25;

function buildMetaLine(equipment: Equipment): string {
  const parts: string[] = [];
  if (equipment.brand?.trim()) parts.push(equipment.brand.trim());
  if (equipment.model?.trim()) parts.push(equipment.model.trim());
  if (equipment.serial_number?.trim()) {
    const s = equipment.serial_number.trim();
    parts.push(s.length > META_SERIAL_MAX_LEN ? `${s.slice(0, META_SERIAL_MAX_LEN)}…` : s);
  }
  if (parts.length > 0) return parts.join(' • ');
  if (equipment.category) return equipment.category.replace(/_/g, ' ');
  return '';
}

// Filter builder (Equipment: category, status, assignment)
type FilterField = 'category' | 'status' | 'assignment';
type FilterOperator = 'is' | 'is_not';
type FilterRule = { id: string; field: FilterField; operator: FilterOperator; value: string };

function getOperatorsForField(): Array<{ value: FilterOperator; label: string }> {
  return [
    { value: 'is', label: 'Is' },
    { value: 'is_not', label: 'Is not' },
  ];
}

const FILTER_PARAM_KEYS = ['status', 'status_not', 'category', 'category_not', 'assigned'];

function convertRulesToParams(rules: FilterRule[], existing: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(existing);
  if (rules.length === 0) {
    FILTER_PARAM_KEYS.forEach((p) => params.delete(p));
    return params;
  }
  const fieldsSet = new Set(rules.filter((r) => r.value?.trim()).map((r) => r.field));
  if (fieldsSet.has('category')) {
    params.delete('category');
    params.delete('category_not');
  }
  if (fieldsSet.has('status')) {
    params.delete('status');
    params.delete('status_not');
  }
  if (fieldsSet.has('assignment')) {
    params.delete('assigned');
  }
  for (const rule of rules) {
    if (!rule.value?.trim()) continue;
    switch (rule.field) {
      case 'category':
        if (rule.operator === 'is') params.set('category', rule.value);
        else params.set('category_not', rule.value);
        break;
      case 'status':
        if (rule.operator === 'is') params.set('status', rule.value);
        else params.set('status_not', rule.value);
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
  const catVal = params.get('category');
  const catNot = params.get('category_not');
  if (catVal) rules.push({ id: `rule-${idCounter++}`, field: 'category', operator: 'is', value: catVal });
  else if (catNot) rules.push({ id: `rule-${idCounter++}`, field: 'category', operator: 'is_not', value: catNot });
  const status = params.get('status');
  const statusNot = params.get('status_not');
  if (status) rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is', value: status });
  else if (statusNot) rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is_not', value: statusNot });
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

const EQUIPMENT_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'checked_out', label: 'Checked Out' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

const CATEGORY_OPTIONS = [
  { value: 'generator', label: 'Generators' },
  { value: 'tool', label: 'Tools' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'small_tool', label: 'Small Tools' },
  { value: 'safety', label: 'Safety Equipment' },
];

const ASSIGNMENT_OPTIONS = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'available', label: 'Available' },
];

function EquipmentFilterRuleRow({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: FilterRule;
  onUpdate: (r: FilterRule) => void;
  onDelete: () => void;
}) {
  const operators = getOperatorsForField();
  const fieldOptions: Array<{ value: FilterField; label: string }> = [
    { value: 'category', label: 'Category' },
    { value: 'status', label: 'Status' },
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
    if (rule.field === 'category') {
      return (
        <select
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
          value={rule.value}
          onChange={(e) => handleValueChange(e.target.value)}
        >
          <option value="">Select category...</option>
          {CATEGORY_OPTIONS.map((opt) => (
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
          {EQUIPMENT_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
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

function EquipmentFilterBuilderModal({
  isOpen,
  onClose,
  onApply,
  initialRules,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (rules: FilterRule[]) => void;
  initialRules: FilterRule[];
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
    <OverlayPortal><div
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
                <EquipmentFilterRuleRow
                  key={rule.id}
                  rule={rule}
                  onUpdate={handleUpdateRule}
                  onDelete={() => handleDeleteRule(rule.id)}
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
    </div></OverlayPortal>
  );
}

export default function EquipmentList() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [showNewEquipmentModal, setShowNewEquipmentModal] = useState(false);
  const [newEquipmentCanSubmit, setNewEquipmentCanSubmit] = useState(false);
  const [newEquipmentIsPending, setNewEquipmentIsPending] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const categoryFilter = searchParams.get('category') || 'all';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const [page, setPage] = useState(pageParam);
  const limit = 15;

  type SortColumn = 'unit_number' | 'name' | 'category' | 'value' | 'assignment' | 'status';
  const validSorts: SortColumn[] = ['unit_number', 'name', 'category', 'value', 'assignment', 'status'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn = (rawSort && validSorts.includes(rawSort as SortColumn)) ? (rawSort as SortColumn) : 'name';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const setListSort = (column: SortColumn, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    const urlPage = parseInt(searchParams.get('page') || '1', 10);
    if (urlPage !== page) setPage(urlPage);
  }, [searchParams]);

  const handleCategoryChange = (cat: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    setPage(1);
    if (cat === 'all') {
      params.delete('category');
    } else {
      params.set('category', cat);
    }
    setSearchParams(params, { replace: true });
  };

  const currentRules = useMemo(() => convertParamsToRules(searchParams), [searchParams]);
  const hasActiveFilters = currentRules.length > 0;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'equipment',
      categoryFilter,
      search,
      sortBy,
      sortDir,
      page,
      searchParams.get('category'),
      searchParams.get('category_not'),
      searchParams.get('status'),
      searchParams.get('status_not'),
      searchParams.get('assigned'),
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      const status = searchParams.get('status');
      const statusNot = searchParams.get('status_not');
      const categoryNot = searchParams.get('category_not');
      const assigned = searchParams.get('assigned');
      if (status) params.set('status', status);
      if (statusNot) params.set('status_not', statusNot);
      if (categoryNot) params.set('category_not', categoryNot);
      if (assigned === 'true' || assigned === 'false') params.set('assigned', assigned);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      params.set('page', String(page));
      params.set('limit', String(limit));
      return api<EquipmentListResponse>('GET', `/fleet/equipment?${params.toString()}`);
    },
  });

  const equipment = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const currentPage = data?.page ?? 1;

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules, searchParams);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
    setIsFilterModalOpen(false);
  };

  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-800',
    checked_out: 'bg-blue-100 text-blue-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    retired: 'bg-red-100 text-red-800',
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  function renderExpandedPanel(item: Equipment) {
    const detail = (label: string, value: string | number | undefined) =>
      value !== undefined && value !== null && String(value).trim() !== '' ? (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
          <span className="text-xs text-gray-900">{String(value)}</span>
        </div>
      ) : null;

    return (
      <div className="p-4 bg-gray-50/80 border-t border-gray-100 transition-all duration-150">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 text-left">
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Identity</div>
            <div className="space-y-2">
              {detail('Brand', item.brand)}
              {detail('Model', item.model)}
              {detail('Serial', item.serial_number)}
              {detail('Category', item.category ? item.category.replace(/_/g, ' ') : undefined)}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Value & Warranty</div>
            <div className="space-y-2">
              {detail('Value', item.value != null ? `$${item.value.toLocaleString()}` : undefined)}
              {detail('Warranty Expiry', item.warranty_expiry ? formatDateLocal(new Date(item.warranty_expiry)) : undefined)}
              {detail('Purchase Date', item.purchase_date ? formatDateLocal(new Date(item.purchase_date)) : undefined)}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Notes</div>
            <div className="space-y-2">
              {detail('', item.notes)}
            </div>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-200 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); nav(`/company-assets/equipment/${item.id}`); }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity"
          >
            View Details
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!showNewEquipmentModal) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowNewEquipmentModal(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [showNewEquipmentModal]);

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">{categoryLabels[categoryFilter] || 'Equipment'}</div>
            <div className="text-xs text-gray-500 mt-0.5">Manage tools and equipment</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex gap-1 border-b border-gray-200 px-0 pt-0 pb-3 mb-3">
          {(['all', 'generator', 'tool', 'electronics', 'small_tool', 'safety'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
                categoryFilter === cat ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {cat === 'all' ? 'All' : (categoryLabels[cat] || cat).replace(' Equipment', '')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, serial, brand, model, unit #, notes…"
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
              category: 'Category',
              status: 'Status',
              assignment: 'Assignment',
            };
            const fieldLabel = fieldLabels[rule.field];
            let displayValue = rule.value;
            if (rule.field === 'category') {
              const opt = CATEGORY_OPTIONS.find((o) => o.value === rule.value);
              displayValue = opt?.label ?? rule.value.replace(/_/g, ' ');
            } else if (rule.field === 'status') {
              displayValue = rule.value.replace(/_/g, ' ');
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

      {/* List - New Equipment first row + table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0">
        <button
          type="button"
          onClick={() => setShowNewEquipmentModal(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-0"
        >
          <div className="text-lg text-gray-400 mr-2">+</div>
          <div className="font-medium text-xs text-gray-700">New Equipment</div>
        </button>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading equipment...</div>
        ) : equipment.length > 0 ? (
          <>
            <div className="overflow-x-auto min-w-0">
              <table className="w-full min-w-0 border-collapse">
                <thead>
                  <tr className="text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                    <th className="w-10 px-2 py-2 text-left rounded-tl-lg" scope="col" aria-label="Expand row" />
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('unit_number')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Unit #{sortBy === 'unit_number' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('name')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Name{sortBy === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('category')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Category{sortBy === 'category' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">Serial/Brand</th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('value')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Value{sortBy === 'value' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('assignment')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Assignment{sortBy === 'assignment' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left rounded-tr-lg">
                      <button type="button" onClick={() => setListSort('status')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Status{sortBy === 'status' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((item) => {
                    const isExpanded = expandedRowId === item.id;
                    const primaryName = (item.name && item.name.trim()) || [item.brand, item.model].filter(Boolean).join(' ').trim() || '—';
                    const metaLine = buildMetaLine(item);
                    const isAssigned = item.status === 'checked_out' || !!item.assigned_to_name;
                    return (
                      <Fragment key={item.id}>
                        <tr
                          className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors min-h-[52px]"
                          onClick={() => setExpandedRowId((prev) => (prev === item.id ? null : item.id))}
                        >
                          <td className="w-10 px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedRowId((prev) => (prev === item.id ? null : item.id));
                              }}
                              className="p-1 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              {isExpanded ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-600 align-top whitespace-nowrap">{item.unit_number || '—'}</td>
                          <td className="px-3 py-3 align-top min-w-0">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-xs font-medium text-gray-900 truncate">{primaryName}</span>
                              {metaLine ? <span className="text-[11px] text-gray-500 truncate">{metaLine}</span> : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 capitalize">
                              {item.category?.replace(/_/g, ' ') || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-600 align-top truncate max-w-[140px]">
                            {[item.serial_number, item.brand, item.model].filter(Boolean).join(' • ') || '—'}
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-600 align-top">
                            {item.value != null ? `$${item.value.toLocaleString()}` : '—'}
                          </td>
                          <td className="px-3 py-3 align-top min-w-0">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium w-fit ${isAssigned ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                {isAssigned ? 'Assigned' : 'Available'}
                              </span>
                              {isAssigned && item.assigned_to_name ? (
                                <span className="text-[11px] text-gray-500 truncate">{item.assigned_to_name}</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}>
                              {item.status?.replace(/_/g, ' ') || '—'}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50/50">
                            <td colSpan={8} className="p-0 align-top">
                              {renderExpandedPanel(item)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {total > 0 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-xs text-gray-600">
                  Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, total)} of {total} equipment
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newPage = Math.max(1, currentPage - 1);
                      setPage(newPage);
                      const params = new URLSearchParams(searchParams);
                      params.set('page', String(newPage));
                      setSearchParams(params);
                    }}
                    disabled={currentPage <= 1 || isFetching}
                    className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  <div className="text-xs text-gray-700 font-medium">
                    Page {currentPage} of {totalPages}
                  </div>
                  <button
                    onClick={() => {
                      const newPage = Math.min(totalPages, currentPage + 1);
                      setPage(newPage);
                      const params = new URLSearchParams(searchParams);
                      params.set('page', String(newPage));
                      setSearchParams(params);
                    }}
                    disabled={currentPage >= totalPages || isFetching}
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
            No {categoryFilter === 'all' ? 'equipment' : categoryLabels[categoryFilter]?.toLowerCase()} found
          </div>
        )}
      </div>

      <EquipmentFilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
      />

      {showNewEquipmentModal && (
        <OverlayPortal><div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setShowNewEquipmentModal(false)}
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
                    onClick={() => setShowNewEquipmentModal(false)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">New Equipment</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create a new equipment item</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <EquipmentNewForm
                formId="equipment-new-form-modal"
                initialCategory={categoryFilter === 'all' ? 'generator' : categoryFilter}
                onSuccess={(data) => {
                  setShowNewEquipmentModal(false);
                  queryClient.invalidateQueries({ queryKey: ['equipment'] });
                  nav(`/company-assets/equipment/${data.id}`);
                }}
                onCancel={() => setShowNewEquipmentModal(false)}
                onValidationChange={(canSubmit, isPending) => {
                  setNewEquipmentCanSubmit(canSubmit);
                  setNewEquipmentIsPending(isPending);
                }}
              />
            </div>
            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowNewEquipmentModal(false)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="equipment-new-form-modal"
                disabled={!newEquipmentCanSubmit || newEquipmentIsPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {newEquipmentIsPending ? 'Creating...' : 'Create Equipment'}
              </button>
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </div>
  );
}
