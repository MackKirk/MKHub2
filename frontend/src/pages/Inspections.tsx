import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { InspectionScheduleForm } from './InspectionNew';

type Inspection = {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string;
  inspection_date: string;
  inspection_type?: string; // 'body' | 'mechanical'
  inspection_schedule_id?: string;
  inspector_user_id?: string;
  inspector_name?: string;
  result: string;
  auto_generated_work_order_id?: string;
  created_at: string;
};

// Filter builder: result only (same pattern as Work Orders)
type FilterField = 'result';
type FilterOperator = 'is' | 'is_not';
type FilterRule = { id: string; field: FilterField; operator: FilterOperator; value: string };

const FILTER_PARAM_KEYS = ['result', 'result_not'];

function convertRulesToParams(rules: FilterRule[], existing: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(existing);
  FILTER_PARAM_KEYS.forEach((p) => params.delete(p));
  for (const rule of rules) {
    if (!rule.value?.trim()) continue;
    if (rule.field === 'result') {
      if (rule.operator === 'is') params.set('result', rule.value);
      else params.set('result_not', rule.value);
    }
  }
  return params;
}

function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;
  const result = params.get('result');
  const resultNot = params.get('result_not');
  if (result) rules.push({ id: `rule-${idCounter++}`, field: 'result', operator: 'is', value: result });
  else if (resultNot) rules.push({ id: `rule-${idCounter++}`, field: 'result', operator: 'is_not', value: resultNot });
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

const RESULT_OPTIONS = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'conditional', label: 'Conditional' },
];

function InspectionFilterRuleRow({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: FilterRule;
  onUpdate: (r: FilterRule) => void;
  onDelete: () => void;
}) {
  const operators: Array<{ value: FilterOperator; label: string }> = [
    { value: 'is', label: 'Is' },
    { value: 'is_not', label: 'Is not' },
  ];
  const selectClass = "w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white";
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700 w-24 shrink-0">Result</span>
      <select
        className="w-36 border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50/50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white"
        value={rule.operator}
        onChange={(e) => onUpdate({ ...rule, operator: e.target.value as FilterOperator })}
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>
      <select
        className={selectClass}
        value={rule.value}
        onChange={(e) => onUpdate({ ...rule, value: e.target.value })}
      >
        <option value="">Select result...</option>
        {RESULT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
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

function InspectionFilterBuilderModal({
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
    setRules((prev) => [...prev, { id: `rule-${Date.now()}`, field: 'result', operator: 'is', value: '' }]);
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
                <InspectionFilterRuleRow
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

const resultColors: Record<string, string> = {
  pass: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-800',
  conditional: 'bg-yellow-100 text-yellow-800',
};

export default function Inspections() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [showNewInspectionModal, setShowNewInspectionModal] = useState(false);

  type SortColumn = 'inspection_date' | 'asset' | 'result';
  const validSorts: SortColumn[] = ['inspection_date', 'asset', 'result'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn = (rawSort && validSorts.includes(rawSort as SortColumn)) ? (rawSort as SortColumn) : 'inspection_date';
  const sortDir = (searchParams.get('dir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const setListSort = (column: SortColumn, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    setSearchParams(params, { replace: true });
  };

  const currentRules = useMemo(() => convertParamsToRules(searchParams), [searchParams]);
  const hasActiveFilters = currentRules.length > 0;

  const inspectionTab = (searchParams.get('type') === 'body' ? 'body' : 'mechanical') as 'mechanical' | 'body';

  const { data: inspectionsRaw, isLoading } = useQuery({
    queryKey: [
      'inspections',
      inspectionTab,
      searchParams.get('result'),
      searchParams.get('result_not'),
      sortBy,
      sortDir,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('inspection_type', inspectionTab);
      const result = searchParams.get('result');
      const resultNot = searchParams.get('result_not');
      if (result) params.set('result', result);
      if (resultNot) params.set('result_not', resultNot);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      return api<Inspection[]>('GET', `/fleet/inspections?${params.toString()}`);
    },
  });

  const inspections = useMemo(() => {
    const list = inspectionsRaw ?? [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (i) =>
        (i.fleet_asset_name && i.fleet_asset_name.toLowerCase().includes(q)) ||
        (i.fleet_asset_id && i.fleet_asset_id.toLowerCase().includes(q))
    );
  }, [inspectionsRaw, search]);

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules, searchParams);
    setSearchParams(params, { replace: true });
    setIsFilterModalOpen(false);
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
            <div className="text-sm font-semibold text-gray-900">Fleet Inspections</div>
            <div className="text-xs text-gray-500 mt-0.5">Manage fleet inspections</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => nav('/fleet/calendar?view=list')}
              className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              Schedules
            </button>
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs: Mechanical | Body */}
      <div className="flex gap-3 mb-4">
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams);
            params.set('type', 'mechanical');
            setSearchParams(params, { replace: true });
          }}
          className={`flex-1 min-w-0 rounded-xl border-2 p-4 flex items-center justify-center gap-3 transition-all ${
            inspectionTab === 'mechanical'
              ? 'border-gray-800 bg-gray-800 text-white shadow-md'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <span className="text-2xl">🔧</span>
          <span className="font-semibold text-sm">Mechanical</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams);
            params.set('type', 'body');
            setSearchParams(params, { replace: true });
          }}
          className={`flex-1 min-w-0 rounded-xl border-2 p-4 flex items-center justify-center gap-3 transition-all ${
            inspectionTab === 'body'
              ? 'border-blue-600 bg-blue-600 text-white shadow-md'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <span className="text-2xl">🚗</span>
          <span className="font-semibold text-sm">Body</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by asset name or ID…"
                value={search}
                onChange={(e) => {
                  const next = e.target.value;
                  const params = new URLSearchParams(searchParams);
                  if (next) params.set('search', next);
                  else params.delete('search');
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
            const displayValue = RESULT_OPTIONS.find((o) => o.value === rule.value)?.label ?? rule.value;
            const label = rule.operator === 'is_not' ? 'Result is not' : 'Result';
            return (
              <FilterChip
                key={rule.id}
                label={label}
                value={displayValue}
                onRemove={() => {
                  const updated = currentRules.filter((r) => r.id !== rule.id);
                  const params = convertRulesToParams(updated, searchParams);
                  setSearchParams(params, { replace: true });
                }}
              />
            );
          })}
        </div>
      )}

      {/* List - New Inspection first row + table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden min-w-0">
        <button
          type="button"
          onClick={() => setShowNewInspectionModal(true)}
          className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-0"
        >
          <div className="text-lg text-gray-400 mr-2">+</div>
          <div className="font-medium text-xs text-gray-700">Schedule inspection</div>
        </button>
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading inspections...</div>
        ) : inspections.length > 0 ? (
          <>
            <div className="overflow-x-auto min-w-0">
              <table className="w-full min-w-0 border-collapse">
                <thead>
                  <tr className="text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 text-left rounded-tl-lg">
                      <button type="button" onClick={() => setListSort('inspection_date')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Date{sortBy === 'inspection_date' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('asset')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Asset{sortBy === 'asset' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button type="button" onClick={() => setListSort('result')} className="flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none">Result{sortBy === 'result' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                    </th>
                    <th className="px-3 py-2 text-left">Work Order</th>
                    <th className="px-3 py-2 text-left">Inspector</th>
                    <th className="px-3 py-2 text-right rounded-tr-lg">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((inspection) => (
                    <tr
                      key={inspection.id}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors min-h-[52px]"
                    >
                      <td className="px-3 py-3 text-xs font-medium text-gray-900 align-top whitespace-nowrap">
                        {inspection.inspection_date ? formatDateLocal(new Date(inspection.inspection_date)) : '—'}
                      </td>
                      <td className="px-3 py-3 align-top min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            nav(`/fleet/assets/${inspection.fleet_asset_id}`);
                          }}
                          className="text-xs text-brand-red hover:underline text-left truncate block max-w-[200px]"
                        >
                          {inspection.fleet_asset_name || inspection.fleet_asset_id}
                        </button>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${resultColors[inspection.result] || 'bg-gray-100 text-gray-800'}`}>
                          {inspection.result}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {inspection.auto_generated_work_order_id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              nav(`/fleet/work-orders/${inspection.auto_generated_work_order_id}`);
                            }}
                            className="text-brand-red hover:underline text-xs font-medium"
                          >
                            View WO
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 align-top">
                        {inspection.inspector_name || inspection.inspector_user_id || '—'}
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            nav(`/fleet/inspections/${inspection.id}`);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-xs text-gray-600">
                Showing 1 to {inspections.length} of {inspections.length} inspections
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-xs text-gray-500">
            No {inspectionTab === 'body' ? 'body' : 'mechanical'} inspections found
          </div>
        )}
      </div>

      <InspectionFilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
      />

      {/* New Inspection Modal */}
      {showNewInspectionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setShowNewInspectionModal(false)}
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
                    onClick={() => setShowNewInspectionModal(false)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Schedule inspection</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create an appointment. Start it from Schedules to open Body and Mechanical inspections.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <InspectionScheduleForm
                onSuccess={(data) => {
                  setShowNewInspectionModal(false);
                  queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
                  queryClient.invalidateQueries({ queryKey: ['inspections'] });
                  nav('/fleet/calendar?view=list');
                }}
                onCancel={() => setShowNewInspectionModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
