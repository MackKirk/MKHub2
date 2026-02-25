import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';

type WorkOrder = {
  id: string;
  work_order_number: string;
  entity_type: string;
  entity_id: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  assigned_to_user_id?: string;
  assigned_to_name?: string;
  created_at: string;
  updated_at?: string;
  closed_at?: string;
  origin_source?: string;
};

type WorkOrderListResponse = {
  items: WorkOrder[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

const DESC_TRUNCATE = 60;

function buildMetaLine(wo: WorkOrder): string {
  const parts: string[] = [];
  if (wo.entity_type) parts.push(wo.entity_type);
  if (wo.category) parts.push(wo.category.replace(/_/g, ' '));
  if (wo.urgency) parts.push(wo.urgency.replace(/_/g, ' '));
  return parts.join(' • ');
}

// Filter builder: status, urgency, entity_type, category
type FilterField = 'status' | 'urgency' | 'entity_type' | 'category';
type FilterOperator = 'is' | 'is_not';
type FilterRule = { id: string; field: FilterField; operator: FilterOperator; value: string };

function getOperatorsForField(): Array<{ value: FilterOperator; label: string }> {
  return [
    { value: 'is', label: 'Is' },
    { value: 'is_not', label: 'Is not' },
  ];
}

const FILTER_PARAM_KEYS = ['status', 'status_not', 'urgency', 'urgency_not', 'entity_type', 'entity_type_not', 'category', 'category_not'];

function convertRulesToParams(rules: FilterRule[], existing: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(existing);
  if (rules.length === 0) {
    FILTER_PARAM_KEYS.forEach((p) => params.delete(p));
    return params;
  }
  const fieldsSet = new Set(rules.filter((r) => r.value?.trim()).map((r) => r.field));
  if (fieldsSet.has('status')) {
    params.delete('status');
    params.delete('status_not');
  }
  if (fieldsSet.has('urgency')) {
    params.delete('urgency');
    params.delete('urgency_not');
  }
  if (fieldsSet.has('entity_type')) {
    params.delete('entity_type');
    params.delete('entity_type_not');
  }
  if (fieldsSet.has('category')) {
    params.delete('category');
    params.delete('category_not');
  }
  for (const rule of rules) {
    if (!rule.value?.trim()) continue;
    switch (rule.field) {
      case 'status':
        if (rule.operator === 'is') params.set('status', rule.value);
        else params.set('status_not', rule.value);
        break;
      case 'urgency':
        if (rule.operator === 'is') params.set('urgency', rule.value);
        else params.set('urgency_not', rule.value);
        break;
      case 'entity_type':
        if (rule.operator === 'is') params.set('entity_type', rule.value);
        else params.set('entity_type_not', rule.value);
        break;
      case 'category':
        if (rule.operator === 'is') params.set('category', rule.value);
        else params.set('category_not', rule.value);
        break;
    }
  }
  return params;
}

function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;
  const status = params.get('status');
  const statusNot = params.get('status_not');
  if (status) rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is', value: status });
  else if (statusNot) rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is_not', value: statusNot });
  const urgency = params.get('urgency');
  const urgencyNot = params.get('urgency_not');
  if (urgency) rules.push({ id: `rule-${idCounter++}`, field: 'urgency', operator: 'is', value: urgency });
  else if (urgencyNot) rules.push({ id: `rule-${idCounter++}`, field: 'urgency', operator: 'is_not', value: urgencyNot });
  const entityType = params.get('entity_type');
  const entityTypeNot = params.get('entity_type_not');
  if (entityType) rules.push({ id: `rule-${idCounter++}`, field: 'entity_type', operator: 'is', value: entityType });
  else if (entityTypeNot) rules.push({ id: `rule-${idCounter++}`, field: 'entity_type', operator: 'is_not', value: entityTypeNot });
  const category = params.get('category');
  const categoryNot = params.get('category_not');
  if (category) rules.push({ id: `rule-${idCounter++}`, field: 'category', operator: 'is', value: category });
  else if (categoryNot) rules.push({ id: `rule-${idCounter++}`, field: 'category', operator: 'is_not', value: categoryNot });
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
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending_parts', label: 'Pending Parts' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const ENTITY_TYPE_OPTIONS = [
  { value: 'fleet', label: 'Fleet' },
  { value: 'equipment', label: 'Equipment' },
];

const CATEGORY_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];

function WorkOrderFilterRuleRow({
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
    { value: 'status', label: 'Status' },
    { value: 'urgency', label: 'Urgency' },
    { value: 'entity_type', label: 'Entity Type' },
    { value: 'category', label: 'Category' },
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
    const selectClass = "w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white";
    if (rule.field === 'status') {
      return (
        <select className={selectClass} value={rule.value} onChange={(e) => handleValueChange(e.target.value)}>
          <option value="">Select status...</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    if (rule.field === 'urgency') {
      return (
        <select className={selectClass} value={rule.value} onChange={(e) => handleValueChange(e.target.value)}>
          <option value="">Select urgency...</option>
          {URGENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    if (rule.field === 'entity_type') {
      return (
        <select className={selectClass} value={rule.value} onChange={(e) => handleValueChange(e.target.value)}>
          <option value="">Select type...</option>
          {ENTITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }
    if (rule.field === 'category') {
      return (
        <select className={selectClass} value={rule.value} onChange={(e) => handleValueChange(e.target.value)}>
          <option value="">Select category...</option>
          {CATEGORY_OPTIONS.map((opt) => (
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

function WorkOrderFilterBuilderModal({
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
    setRules((prev) => [...prev, { id: `rule-${Date.now()}`, field: 'status', operator: 'is', value: '' }]);
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
                <WorkOrderFilterRuleRow
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
    </div>
  );
}

export default function WorkOrders() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const [page, setPage] = useState(pageParam);
  const limit = 15;

  type SortColumn = 'work_order_number' | 'description' | 'entity_type' | 'category' | 'urgency' | 'status' | 'created_at';
  const validSorts: SortColumn[] = ['work_order_number', 'description', 'entity_type', 'category', 'urgency', 'status', 'created_at'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn = (rawSort && validSorts.includes(rawSort as SortColumn)) ? (rawSort as SortColumn) : 'created_at';
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

  const currentRules = useMemo(() => convertParamsToRules(searchParams), [searchParams]);
  const hasActiveFilters = currentRules.length > 0;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'workOrders',
      search,
      sortBy,
      sortDir,
      page,
      searchParams.get('status'),
      searchParams.get('status_not'),
      searchParams.get('urgency'),
      searchParams.get('urgency_not'),
      searchParams.get('entity_type'),
      searchParams.get('entity_type_not'),
      searchParams.get('category'),
      searchParams.get('category_not'),
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const status = searchParams.get('status');
      const statusNot = searchParams.get('status_not');
      const urgency = searchParams.get('urgency');
      const urgencyNot = searchParams.get('urgency_not');
      const entityType = searchParams.get('entity_type');
      const entityTypeNot = searchParams.get('entity_type_not');
      const category = searchParams.get('category');
      const categoryNot = searchParams.get('category_not');
      if (status) params.set('status', status);
      if (statusNot) params.set('status_not', statusNot);
      if (urgency) params.set('urgency', urgency);
      if (urgencyNot) params.set('urgency_not', urgencyNot);
      if (entityType) params.set('entity_type', entityType);
      if (entityTypeNot) params.set('entity_type_not', entityTypeNot);
      if (category) params.set('category', category);
      if (categoryNot) params.set('category_not', categoryNot);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      params.set('page', String(page));
      params.set('limit', String(limit));
      return api<WorkOrderListResponse>('GET', `/fleet/work-orders?${params.toString()}`);
    },
  });

  const workOrders = data?.items ?? [];
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
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    pending_parts: 'bg-orange-100 text-orange-800',
    closed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const urgencyColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    normal: 'bg-gray-100 text-gray-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Work Orders</div>
            <div className="text-xs text-gray-500 mt-0.5">Unified work order management</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by description or work order #…"
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
              status: 'Status',
              urgency: 'Urgency',
              entity_type: 'Entity Type',
              category: 'Category',
            };
            const fieldLabel = fieldLabels[rule.field];
            let displayValue = rule.value?.replace(/_/g, ' ') ?? rule.value;
            if (rule.field === 'status') displayValue = STATUS_OPTIONS.find((o) => o.value === rule.value)?.label ?? displayValue;
            if (rule.field === 'urgency') displayValue = URGENCY_OPTIONS.find((o) => o.value === rule.value)?.label ?? displayValue;
            if (rule.field === 'entity_type') displayValue = ENTITY_TYPE_OPTIONS.find((o) => o.value === rule.value)?.label ?? displayValue;
            if (rule.field === 'category') displayValue = CATEGORY_OPTIONS.find((o) => o.value === rule.value)?.label ?? displayValue;
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

      {/* List - New Work Order first row + table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0">
        <button
          type="button"
          onClick={() => nav('/fleet/work-orders/new')}
          className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-0"
        >
          <div className="text-lg text-gray-400 mr-2">+</div>
          <div className="font-medium text-xs text-gray-700">New Work Order</div>
        </button>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading work orders...</div>
        ) : workOrders.length > 0 ? (
          <>
            <div className="overflow-x-auto min-w-0">
              <table className="w-full min-w-0 border-collapse">
                <thead>
                  <tr className="text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left rounded-tl-lg">
                      <button type="button" onClick={() => setListSort('work_order_number')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">WO #{sortBy === 'work_order_number' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('description')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Description{sortBy === 'description' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('entity_type')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Type{sortBy === 'entity_type' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('category')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Category{sortBy === 'category' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('urgency')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Urgency{sortBy === 'urgency' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('status')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Status{sortBy === 'status' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left rounded-tr-lg">
                      <button type="button" onClick={() => setListSort('created_at')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Created{sortBy === 'created_at' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map((wo) => {
                    const descLine = (wo.description && wo.description.trim()) || '—';
                    const descDisplay = descLine.length > DESC_TRUNCATE ? `${descLine.slice(0, DESC_TRUNCATE)}…` : descLine;
                    const metaLine = buildMetaLine(wo);
                    return (
                      <tr
                        key={wo.id}
                        className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors min-h-[52px]"
                        onClick={() => nav(`/fleet/work-orders/${wo.id}`)}
                      >
                        <td className="px-3 py-3 text-xs font-medium text-gray-900 align-top whitespace-nowrap">{wo.work_order_number}</td>
                        <td className="px-3 py-3 align-top min-w-0">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-xs text-gray-900 truncate">{descDisplay}</span>
                            {metaLine ? <span className="text-[11px] text-gray-500 truncate">{metaLine}</span> : null}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600 align-top capitalize">{wo.entity_type}</td>
                        <td className="px-3 py-3 text-xs text-gray-600 align-top capitalize">{wo.category?.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-3 align-top">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${urgencyColors[wo.urgency] || 'bg-gray-100 text-gray-800'}`}>
                            {wo.urgency?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[wo.status] || 'bg-gray-100 text-gray-800'}`}>
                            {wo.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600 align-top whitespace-nowrap">
                          {wo.created_at ? formatDateLocal(new Date(wo.created_at)) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {total > 0 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-xs text-gray-600">
                  Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, total)} of {total} work orders
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
          <div className="p-8 text-center text-xs text-gray-500">No work orders found</div>
        )}
      </div>

      <WorkOrderFilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
      />
    </div>
  );
}
