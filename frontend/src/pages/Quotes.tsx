import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import {
  type Quote,
  type QuoteSortKey,
  type QuoteViewMode,
  type QuoteTableColumn,
  SORT_OPTIONS,
  QUOTES_LIST_CAP,
  buildQuotesApiQuery,
  preserveUiParams,
  parseSortKey,
  parseViewMode,
  summarizeQuotes,
  sortQuotes,
  getQuoteValue,
  getQuoteClientName,
  getQuoteDocumentType,
  getEstimatorName,
  formatQuoteCurrency,
  formatQuoteValueDisplay,
  toggleColumnSort,
  sortIndicator,
} from '@/pages/quotesListUtils';

// Helper: Convert filter rules to URL parameters
function convertRulesToParams(rules: FilterRule[]): URLSearchParams {
  const params = new URLSearchParams();

  const fieldsToClear: Record<string, string[]> = {
    client: ['client_id', 'client_id_not'],
    creation_date: ['creation_date_start', 'creation_date_end'],
    update_date: ['update_date_start', 'update_date_end'],
    estimator: ['estimator_id', 'estimator_id_not'],
    value: ['value_min', 'value_max'],
  };

  Object.values(fieldsToClear)
    .flat()
    .forEach((param) => {
      params.delete(param);
    });

  for (const rule of rules) {
    if (!rule.value || (Array.isArray(rule.value) && (!rule.value[0] || !rule.value[1]))) {
      continue;
    }

    switch (rule.field) {
      case 'client':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('client_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('client_id_not', rule.value);
          }
        }
        break;

      case 'creation_date':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('creation_date_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('creation_date_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('creation_date_start', rule.value);
            params.set('creation_date_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('creation_date_start', rule.value[0]);
          params.set('creation_date_end', rule.value[1]);
        }
        break;

      case 'update_date':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('update_date_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('update_date_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('update_date_start', rule.value);
            params.set('update_date_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('update_date_start', rule.value[0]);
          params.set('update_date_end', rule.value[1]);
        }
        break;

      case 'estimator':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('estimator_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('estimator_id_not', rule.value);
          }
        }
        break;

      case 'value':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'greater_than') {
            params.set('value_min', rule.value);
          } else if (rule.operator === 'less_than') {
            params.set('value_max', rule.value);
          } else if (rule.operator === 'is_equal_to') {
            params.set('value_min', rule.value);
            params.set('value_max', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'between') {
          params.set('value_min', rule.value[0]);
          params.set('value_max', rule.value[1]);
        }
        break;
    }
  }

  return params;
}

function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;

  const client = params.get('client_id');
  const clientNot = params.get('client_id_not');
  if (client) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is', value: client });
  } else if (clientNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is_not', value: clientNot });
  }

  const creationDateStart = params.get('creation_date_start');
  const creationDateEnd = params.get('creation_date_end');
  if (creationDateStart && creationDateEnd) {
    if (creationDateStart === creationDateEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'creation_date', operator: 'is', value: creationDateStart });
    } else {
      rules.push({
        id: `rule-${idCounter++}`,
        field: 'creation_date',
        operator: 'is_between',
        value: [creationDateStart, creationDateEnd],
      });
    }
  } else if (creationDateStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'creation_date', operator: 'is_after', value: creationDateStart });
  } else if (creationDateEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'creation_date', operator: 'is_before', value: creationDateEnd });
  }

  const updateDateStart = params.get('update_date_start');
  const updateDateEnd = params.get('update_date_end');
  if (updateDateStart && updateDateEnd) {
    if (updateDateStart === updateDateEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'update_date', operator: 'is', value: updateDateStart });
    } else {
      rules.push({
        id: `rule-${idCounter++}`,
        field: 'update_date',
        operator: 'is_between',
        value: [updateDateStart, updateDateEnd],
      });
    }
  } else if (updateDateStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'update_date', operator: 'is_after', value: updateDateStart });
  } else if (updateDateEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'update_date', operator: 'is_before', value: updateDateEnd });
  }

  const estimator = params.get('estimator_id');
  const estimatorNot = params.get('estimator_id_not');
  if (estimator) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is', value: estimator });
  } else if (estimatorNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is_not', value: estimatorNot });
  }

  const valueMin = params.get('value_min');
  const valueMax = params.get('value_max');
  if (valueMin && valueMax) {
    if (valueMin === valueMax) {
      rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'is_equal_to', value: valueMin });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'between', value: [valueMin, valueMax] });
    }
  } else if (valueMin) {
    rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'greater_than', value: valueMin });
  } else if (valueMax) {
    rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'less_than', value: valueMax });
  }

  return rules;
}

export default function Quotes() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';

  const viewMode = parseViewMode(searchParams.get('view'));
  const sortKey = parseSortKey(searchParams.get('sort'));

  const [q, setQ] = useState(queryParam);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const currentRules = useMemo(() => convertParamsToRules(searchParams), [searchParams]);

  const setViewAndSort = useCallback(
    (next: { view?: QuoteViewMode; sort?: QuoteSortKey }) => {
      const params = new URLSearchParams(searchParams);
      preserveUiParams(params, next.view ?? viewMode, next.sort ?? sortKey);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, viewMode, sortKey]
  );

  const mergeSearchParams = useCallback(
    (base: URLSearchParams) => {
      preserveUiParams(base, viewMode, sortKey);
      return base;
    },
    [searchParams, viewMode, sortKey]
  );

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (q) {
      params.set('q', q);
    } else {
      params.delete('q');
    }
    preserveUiParams(params, viewMode, sortKey);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) setQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const apiQs = useMemo(() => buildQuotesApiQuery(searchParams), [searchParams]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['quotes', apiQs],
    queryFn: () => api<Quote[]>('GET', `/quotes${apiQs}`),
  });

  const isInitialLoading = isLoading && !data;

  useEffect(() => {
    if (hasAnimated) {
      const timer = setTimeout(() => setAnimationComplete(true), 400);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated]);

  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      const timer = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, hasAnimated]);

  const { data: clientsData } = useQuery({
    queryKey: ['clients-for-filter'],
    queryFn: () => api<any>('GET', '/clients?limit=100'),
    staleTime: 300_000,
  });

  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
    staleTime: 300_000,
  });

  const quotes = data || [];

  const clientIds = useMemo(() => {
    const ids = new Set<string>();
    quotes.forEach((quote: Quote) => {
      if (quote.client_id) ids.add(quote.client_id);
    });
    return Array.from(ids);
  }, [quotes]);

  const { data: allClientFiles } = useQuery({
    queryKey: ['clientFilesForQuotes', clientIds.join(',')],
    queryFn: async () => {
      const filesMap: Record<string, any[]> = {};
      await Promise.all(
        clientIds.map(async (clientId) => {
          try {
            const files = await api<any[]>('GET', `/clients/${encodeURIComponent(clientId)}/files`);
            filesMap[clientId] = files || [];
          } catch {
            filesMap[clientId] = [];
          }
        })
      );
      return filesMap;
    },
    enabled: clientIds.length > 0,
    staleTime: 300_000,
  });

  const clients = clientsData?.items || clientsData || [];

  const summary = useMemo(() => summarizeQuotes(quotes), [quotes]);
  const sortedQuotes = useMemo(
    () => sortQuotes(quotes, sortKey, employees),
    [quotes, sortKey, employees]
  );

  const showCapWarning = quotes.length >= QUOTES_LIST_CAP;

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasViewPermission = isAdmin || permissions.has('sales:quotations:read');
  const hasEditPermission = isAdmin || permissions.has('sales:quotations:write');

  const filterFields: FieldConfig[] = useMemo(
    () => [
      {
        id: 'client',
        label: 'Client',
        type: 'select',
        operators: ['is', 'is_not'],
        getOptions: () =>
          clients.map((c: any) => ({
            value: c.id,
            label: c.display_name || c.name || c.code || c.id,
          })),
      },
      {
        id: 'creation_date',
        label: 'Creation Date',
        type: 'date',
        operators: ['is', 'is_before', 'is_after', 'is_between'],
      },
      {
        id: 'update_date',
        label: 'Update Date',
        type: 'date',
        operators: ['is', 'is_before', 'is_after', 'is_between'],
      },
      {
        id: 'estimator',
        label: 'Estimator',
        type: 'select',
        operators: ['is', 'is_not'],
        getOptions: () =>
          (employees || []).map((emp: any) => ({
            value: emp.id,
            label: emp.name || emp.username || emp.id,
          })),
      },
      {
        id: 'value',
        label: 'Value',
        type: 'number',
        operators: ['is_equal_to', 'greater_than', 'less_than', 'between'],
      },
    ],
    [clients, employees]
  );

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = mergeSearchParams(convertRulesToParams(rules));
    if (q) params.set('q', q);
    setSearchParams(params);
    refetch();
  };

  const hasActiveFilters = currentRules.length > 0;

  const formatRuleValue = (rule: FilterRule): string => {
    if (rule.field === 'client') {
      const client = clients.find((c: any) => String(c.id) === rule.value);
      return client?.display_name || client?.name || String(rule.value);
    }
    if (rule.field === 'creation_date' || rule.field === 'update_date') {
      if (Array.isArray(rule.value)) {
        return `${rule.value[0]} → ${rule.value[1]}`;
      }
      return String(rule.value);
    }
    if (rule.field === 'estimator') {
      const emp = (employees || []).find((e: any) => String(e.id) === rule.value);
      return emp?.name || emp?.username || String(rule.value);
    }
    if (rule.field === 'value') {
      if (Array.isArray(rule.value)) {
        return `$${Number(rule.value[0]).toLocaleString()} → $${Number(rule.value[1]).toLocaleString()}`;
      }
      return `$${Number(rule.value).toLocaleString()}`;
    }
    return String(rule.value);
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = filterFields.find((f) => f.id === fieldId);
    return field?.label || fieldId;
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    mergeSearchParams(params);
    setSearchParams(params);
    refetch();
  };

  const removeFilterRule = (ruleId: string) => {
    const updatedRules = currentRules.filter((r) => r.id !== ruleId);
    const params = mergeSearchParams(convertRulesToParams(updatedRules));
    if (q) params.set('q', q);
    setSearchParams(params);
    refetch();
  };

  if (!hasViewPermission) {
    return (
      <div className="text-center py-12 text-gray-500">
        You do not have permission to view quotations.
      </div>
    );
  }

  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Quotations</div>
          <div className="text-sm text-gray-500 font-medium">List, search and manage quotations</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-white">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <input
                  className="w-full border border-gray-200 rounded-md px-4 py-2.5 pl-10 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150"
                  placeholder="Search by quote name, code, or client name..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 whitespace-nowrap"
            >
              + Filters
            </button>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 whitespace-nowrap"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {currentRules.map((rule) => (
            <FilterChip
              key={rule.id}
              rule={rule}
              onRemove={() => removeFilterRule(rule.id)}
              getValueLabel={formatRuleValue}
              getFieldLabel={getFieldLabel}
            />
          ))}
        </div>
      )}

      {!isInitialLoading && (
        <QuotesListToolbar
          summary={summary}
          showCapWarning={showCapWarning}
          viewMode={viewMode}
          sortKey={sortKey}
          onViewChange={(view) => setViewAndSort({ view })}
          onSortChange={(sort) => setViewAndSort({ sort })}
        />
      )}

      <LoadingOverlay isLoading={isInitialLoading} text="Loading quotes...">
        {viewMode === 'table' ? (
          <QuotesTable
            quotes={sortedQuotes}
            employees={employees}
            sortKey={sortKey}
            total={summary.total}
            isLoading={isLoading}
            hasEditPermission={hasEditPermission}
            location={location}
            onColumnSort={(column) => setViewAndSort({ sort: toggleColumnSort(sortKey, column) })}
          />
        ) : (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4"
            style={
              animationComplete
                ? {}
                : {
                    opacity: hasAnimated ? 1 : 0,
                    transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                    transition: 'opacity 400ms ease-out, transform 400ms ease-out',
                  }
            }
          >
            {isLoading && !sortedQuotes.length ? (
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
                ))}
              </>
            ) : (
              <>
                {hasEditPermission && (
                  <Link
                    to="/quotes/new"
                    state={{ backgroundLocation: location }}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[200px]"
                  >
                    <div className="text-4xl text-gray-400 mb-2">+</div>
                    <div className="font-medium text-sm text-gray-700">New Quote</div>
                    <div className="text-xs text-gray-500 mt-1">Add new quote</div>
                  </Link>
                )}
                {sortedQuotes.length > 0 ? (
                  sortedQuotes.map((quote) => (
                    <QuoteListCard
                      key={quote.id}
                      quote={quote}
                      employees={employees}
                      clientFiles={allClientFiles?.[quote.client_id || ''] || []}
                    />
                  ))
                ) : (
                  <div className="col-span-2 p-8 text-center text-gray-500 rounded-xl border bg-white">
                    No quotes found matching your criteria.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </LoadingOverlay>

      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        fields={filterFields}
        getFieldData={() => null}
      />
    </div>
  );
}

function QuotesListToolbar({
  summary,
  showCapWarning,
  viewMode,
  sortKey,
  onViewChange,
  onSortChange,
}: {
  summary: { count: number; total: number; average: number };
  showCapWarning: boolean;
  viewMode: QuoteViewMode;
  sortKey: QuoteSortKey;
  onViewChange: (view: QuoteViewMode) => void;
  onSortChange: (sort: QuoteSortKey) => void;
}) {
  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 sm:px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-gray-900">
              {summary.count} {summary.count === 1 ? 'quotation' : 'quotations'}
            </span>
            <span className="text-gray-500">
              Total quoted{' '}
              <span className="font-semibold text-[#7f1010]">{formatQuoteCurrency(summary.total)}</span>
            </span>
            {summary.count > 0 && (
              <span className="text-gray-500">
                Average <span className="font-medium text-gray-800">{formatQuoteCurrency(summary.average)}</span>
              </span>
            )}
          </div>
          {showCapWarning && (
            <p className="text-xs text-amber-700 mt-1.5">
              Totals reflect up to {QUOTES_LIST_CAP} quotations (newest first from server). Narrow filters for exact
              totals.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => onViewChange('cards')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'cards' ? 'bg-brand-red text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => onViewChange('table')}
              className={`px-3 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
                viewMode === 'table' ? 'bg-brand-red text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Table
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <span className="whitespace-nowrap">Sort</span>
            <select
              value={sortKey}
              onChange={(e) => onSortChange(parseSortKey(e.target.value))}
              className="border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white text-gray-900 min-w-[160px]"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

function SortableTh({
  column,
  label,
  sortKey,
  onSort,
  align = 'left',
}: {
  column: QuoteTableColumn;
  label: string;
  sortKey: QuoteSortKey;
  onSort: (column: QuoteTableColumn) => void;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`px-4 py-3 font-medium text-gray-600 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-0.5 hover:text-gray-900 transition-colors"
      >
        {label}
        <span className="text-brand-red">{sortIndicator(sortKey, column)}</span>
      </button>
    </th>
  );
}

function QuotesTable({
  quotes,
  employees,
  sortKey,
  total,
  isLoading,
  hasEditPermission,
  location,
  onColumnSort,
}: {
  quotes: Quote[];
  employees?: any[];
  sortKey: QuoteSortKey;
  total: number;
  isLoading: boolean;
  hasEditPermission: boolean;
  location: ReturnType<typeof useLocation>;
  onColumnSort: (column: QuoteTableColumn) => void;
}) {
  const navigate = useNavigate();

  if (isLoading && !quotes.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 text-sm">
        Loading quotations…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {hasEditPermission && (
        <div className="px-4 py-3 border-b border-gray-100 flex justify-end">
          <Link
            to="/quotes/new"
            state={{ backgroundLocation: location }}
            className="text-sm font-medium text-brand-red hover:underline"
          >
            + New Quote
          </Link>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <SortableTh column="client" label="Client" sortKey={sortKey} onSort={onColumnSort} />
              <th className="px-4 py-3 text-left font-medium text-gray-600">Document / Code</th>
              <SortableTh column="created" label="Created" sortKey={sortKey} onSort={onColumnSort} />
              <SortableTh column="updated" label="Updated" sortKey={sortKey} onSort={onColumnSort} />
              <SortableTh column="estimator" label="Estimator" sortKey={sortKey} onSort={onColumnSort} />
              <SortableTh column="value" label="Estimated value" sortKey={sortKey} onSort={onColumnSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  No quotes found matching your criteria.
                </td>
              </tr>
            ) : (
              quotes.map((quote, idx) => {
                const value = getQuoteValue(quote);
                const created = (quote.created_at || '').slice(0, 10);
                const updated = (quote.updated_at || '').slice(0, 10);
                return (
                  <tr
                    key={quote.id}
                    onClick={() => navigate(`/quotes/${encodeURIComponent(String(quote.id))}`)}
                    className={`cursor-pointer border-b border-gray-100 hover:bg-red-50/40 transition-colors ${
                      idx % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-900 max-w-[200px] truncate" title={getQuoteClientName(quote)}>
                      {getQuoteClientName(quote) || 'No client'}
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="font-medium text-gray-900">{getQuoteDocumentType(quote)}</div>
                      <div className="text-xs text-gray-500">{quote.code || quote.order_number || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{created || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{updated || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate" title={getEstimatorName(quote, employees)}>
                      {getEstimatorName(quote, employees)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#7f1010] whitespace-nowrap">
                      {formatQuoteValueDisplay(value)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {quotes.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-800">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-bold text-[#7f1010]">{formatQuoteCurrency(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function QuoteListCard({
  quote,
  employees,
  clientFiles: _clientFiles,
}: {
  quote: Quote;
  employees?: any[];
  clientFiles?: any[];
}) {
  const clientName = getQuoteClientName(quote);
  const created = (quote.created_at || '').slice(0, 10);
  const updated = (quote.updated_at || '').slice(0, 10);
  const estimatorName = getEstimatorName(quote, employees);
  const estimatedValue = getQuoteValue(quote);
  const documentType = getQuoteDocumentType(quote);

  return (
    <Link
      to={`/quotes/${encodeURIComponent(String(quote.id))}`}
      className="group rounded-xl border bg-white hover:border-gray-200 hover:shadow-md hover:-translate-y-0.5 block h-full transition-all duration-200 relative"
    >
      <div className="p-4 flex flex-col gap-3">
        <div className="min-w-0">
          <div className="text-xs text-gray-500 truncate min-w-0">{clientName || 'No client'}</div>
          <div className="min-w-0">
            <div className="font-semibold text-base text-gray-900 group-hover:text-[#7f1010] transition-colors whitespace-normal break-words">
              {documentType}
            </div>
            <div className="text-xs text-gray-600 break-words">{quote.code || quote.order_number || '—'}</div>
          </div>
        </div>

        <div className="border-t border-black/5" />

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Created</div>
            <div className="font-medium text-gray-900 truncate">{created || '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Updated</div>
            <div className="font-medium text-gray-900 truncate">{updated || '—'}</div>
          </div>
          <div className="min-w-0 truncate" title={estimatorName}>
            <div className="text-xs text-gray-500">Estimator</div>
            <div className="font-medium text-gray-900 text-xs">{estimatorName}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Estimated Value</div>
            <div className="font-semibold text-[#7f1010] truncate">{formatQuoteValueDisplay(estimatedValue)}</div>
          </div>
        </div>
      </div>
    </Link>
  );
}
