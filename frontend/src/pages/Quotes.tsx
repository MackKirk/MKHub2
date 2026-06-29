import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { FileText, LayoutGrid, Plus, Search, SlidersHorizontal, Table } from 'lucide-react';
import LoadingOverlay from '@/components/LoadingOverlay';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  getListCreateItemClassName,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiListCreateItem,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
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
} from '@/pages/quotesListUtils';

const QUOTES_TABLE_GRID = 'grid-cols-[minmax(120px,1.2fr)_minmax(130px,1.3fr)_minmax(80px,0.7fr)_minmax(80px,0.7fr)_minmax(100px,1fr)_minmax(90px,0.8fr)]';
const QUOTES_TABLE_MIN_WIDTH = 'min-w-[720px]';

function quoteSortParts(sortKey: QuoteSortKey): {
  column: QuoteTableColumn | null;
  dir: 'asc' | 'desc';
} {
  const entries: [string, QuoteTableColumn][] = [
    ['created_', 'created'],
    ['updated_', 'updated'],
    ['client_', 'client'],
    ['value_', 'value'],
    ['estimator_', 'estimator'],
  ];
  for (const [prefix, column] of entries) {
    if (sortKey.startsWith(prefix)) {
      return { column, dir: sortKey.endsWith('_asc') ? 'asc' : 'desc' };
    }
  }
  return { column: null, dir: 'desc' };
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';

  const viewMode = parseViewMode(searchParams.get('view'));
  const sortKey = parseSortKey(searchParams.get('sort'));
  const { column: sortColumn, dir: sortDir } = quoteSortParts(sortKey);

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

  const listCardAnimClass = animationComplete
    ? undefined
    : uiCx(
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]',
      );

  const handleColumnSort = (column: QuoteTableColumn) => {
    setViewAndSort({ sort: toggleColumnSort(sortKey, column) });
  };

  if (!hasViewPermission) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppEmptyState title="You do not have permission to view quotations." className="py-12" />
      </div>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Quotations"
        subtitle="List, search and manage quotations"
        icon={<FileText className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className={uiCx('flex shrink-0 items-stretch overflow-hidden', uiRadius.control, uiBorders.subtle)}>
            <AppButton
              type="button"
              variant={viewMode === 'cards' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !px-2.5"
              onClick={() => setViewAndSort({ view: 'cards' })}
              title="Cards view"
              aria-label="Cards view"
            >
              <LayoutGrid className="h-4 w-4" />
            </AppButton>
            <AppButton
              type="button"
              variant={viewMode === 'table' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !border-l-0 !px-2.5"
              onClick={() => setViewAndSort({ view: 'table' })}
              title="Table view"
              aria-label="Table view"
            >
              <Table className="h-4 w-4" />
            </AppButton>
          </div>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by quote name, code, or client name..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search quotations"
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
          {hasActiveFilters && (
            <AppButton type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </AppButton>
          )}
        </div>

        {!isInitialLoading && (
          <div
            className={uiCx(
              'mt-3 border-t border-gray-100 pt-3',
              uiLayout.actionsRow,
              'flex-wrap items-center justify-between gap-3',
            )}
          >
            <div className="min-w-0">
              <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-baseline gap-x-4 gap-y-1')}>
                <span className={uiTypography.sectionTitle}>
                  {summary.count} {summary.count === 1 ? 'quotation' : 'quotations'}
                </span>
                <span className={uiTypography.helper}>
                  Total quoted{' '}
                  <span className="font-semibold text-brand-red">{formatQuoteCurrency(summary.total)}</span>
                </span>
                {summary.count > 0 && (
                  <span className={uiTypography.helper}>
                    Average{' '}
                    <span className="font-medium text-gray-800">{formatQuoteCurrency(summary.average)}</span>
                  </span>
                )}
              </div>
              {showCapWarning && (
                <p className="mt-1.5 text-xs text-amber-700">
                  Totals reflect up to {QUOTES_LIST_CAP} quotations (newest first from server). Narrow filters for
                  exact totals.
                </p>
              )}
            </div>
            <div className="w-full sm:w-auto sm:min-w-[180px]">
              <AppSelect
                label="Sort"
                options={SORT_OPTIONS}
                value={sortKey}
                onChange={(e) => setViewAndSort({ sort: parseSortKey(e.target.value) })}
              />
            </div>
          </div>
        )}
      </AppCard>

      {hasActiveFilters && (
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
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

      <LoadingOverlay isLoading={isInitialLoading} text="Loading quotes...">
        <AppCard className={uiCx(uiShadows.card, listCardAnimClass)} bodyClassName={viewMode === 'table' ? '!p-0' : uiSpacing.cardPadding}>
          {viewMode === 'table' ? (
            <QuotesTableView
              quotes={sortedQuotes}
              employees={employees}
              sortColumn={sortColumn}
              sortDir={sortDir}
              total={summary.total}
              isLoading={isLoading}
              hasEditPermission={hasEditPermission}
              location={location}
              onColumnSort={handleColumnSort}
            />
          ) : (
            <QuotesCardsView
              quotes={sortedQuotes}
              employees={employees}
              clientFiles={allClientFiles}
              isLoading={isLoading}
              hasEditPermission={hasEditPermission}
              location={location}
              listCardAnimClass={listCardAnimClass}
            />
          )}
        </AppCard>
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

function QuotesTableView({
  quotes,
  employees,
  sortColumn,
  sortDir,
  total,
  isLoading,
  hasEditPermission,
  location,
  onColumnSort,
}: {
  quotes: Quote[];
  employees?: any[];
  sortColumn: QuoteTableColumn | null;
  sortDir: 'asc' | 'desc';
  total: number;
  isLoading: boolean;
  hasEditPermission: boolean;
  location: ReturnType<typeof useLocation>;
  onColumnSort: (column: QuoteTableColumn) => void;
}) {
  if (isLoading && !quotes.length) {
    return (
      <div className={uiCx(uiSpacing.cardPadding, 'text-center', uiTypography.helper)}>
        Loading quotations…
      </div>
    );
  }

  const sortBy = sortColumn ?? 'created';

  return (
    <div className="flex flex-col">
      {hasEditPermission && (
        <div className={uiSpacing.cardPadding}>
          <Link
            to="/quotes/new"
            state={{ backgroundLocation: location }}
            className={getListCreateItemClassName('row', uiCx(QUOTES_TABLE_MIN_WIDTH, 'w-full'))}
          >
            <Plus className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            <span className={uiListCreateItem.label}>New Quote</span>
          </Link>
        </div>
      )}

      {quotes.length === 0 ? (
        <div className={uiCx(uiSpacing.cardPadding, 'pb-10')}>
          <AppEmptyState
            title="No quotes found matching your criteria."
            className="border-0 bg-transparent p-0 shadow-none"
          />
        </div>
      ) : (
        <AppSortableEntityList layout="flat">
          <AppSortableEntityListHeader
            variant="flat"
            gridCols={QUOTES_TABLE_GRID}
            minWidth={QUOTES_TABLE_MIN_WIDTH}
          >
            <AppSortableEntityListSortColumn
              label="Client"
              column="client"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onColumnSort}
              title="Sort by client"
            />
            <div className={uiCx('min-w-0', uiTypography.controlLabel)}>Document / Code</div>
            <AppSortableEntityListSortColumn
              label="Created"
              column="created"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onColumnSort}
              title="Sort by created date"
            />
            <AppSortableEntityListSortColumn
              label="Updated"
              column="updated"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onColumnSort}
              title="Sort by updated date"
            />
            <AppSortableEntityListSortColumn
              label="Estimator"
              column="estimator"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onColumnSort}
              title="Sort by estimator"
            />
            <AppSortableEntityListSortColumn
              label="Estimated value"
              column="value"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onColumnSort}
              title="Sort by estimated value"
              className="justify-end text-right"
            />
          </AppSortableEntityListHeader>

          <AppSortableEntityListFlatBody gridCols={QUOTES_TABLE_GRID} minWidth={QUOTES_TABLE_MIN_WIDTH}>
            {quotes.map((quote) => {
              const value = getQuoteValue(quote);
              const created = (quote.created_at || '').slice(0, 10);
              const updated = (quote.updated_at || '').slice(0, 10);
              const clientName = getQuoteClientName(quote) || 'No client';
              const documentType = getQuoteDocumentType(quote);
              const estimatorName = getEstimatorName(quote, employees);

              return (
                <AppSortableEntityListRow
                  key={quote.id}
                  as="link"
                  to={`/quotes/${encodeURIComponent(String(quote.id))}`}
                  variant="flat"
                  gridCols={QUOTES_TABLE_GRID}
                  minWidth={QUOTES_TABLE_MIN_WIDTH}
                >
                  <div className={uiCx('min-w-0 truncate', uiTypography.body)} title={clientName}>
                    {clientName}
                  </div>
                  <div className="min-w-0">
                    <div className={uiTypography.sectionTitle}>{documentType}</div>
                    <div className={uiTypography.helper}>{quote.code || quote.order_number || '—'}</div>
                  </div>
                  <div className={uiCx('min-w-0 whitespace-nowrap', uiTypography.body)}>{created || '—'}</div>
                  <div className={uiCx('min-w-0 whitespace-nowrap', uiTypography.body)}>{updated || '—'}</div>
                  <div className={uiCx('min-w-0 truncate', uiTypography.body)} title={estimatorName}>
                    {estimatorName}
                  </div>
                  <div className={uiCx('min-w-0 text-right font-semibold text-brand-red whitespace-nowrap', uiTypography.body)}>
                    {formatQuoteValueDisplay(value)}
                  </div>
                </AppSortableEntityListRow>
              );
            })}
          </AppSortableEntityListFlatBody>

          <div
            className={uiCx(
              QUOTES_TABLE_MIN_WIDTH,
              'grid w-full items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:gap-3 lg:gap-4',
              QUOTES_TABLE_GRID,
            )}
          >
            <div className="col-span-5 text-right font-semibold text-gray-800">Total</div>
            <div className="text-right font-bold text-brand-red">{formatQuoteCurrency(total)}</div>
          </div>
        </AppSortableEntityList>
      )}
    </div>
  );
}

function QuotesCardsView({
  quotes,
  employees,
  clientFiles,
  isLoading,
  hasEditPermission,
  location,
  listCardAnimClass,
}: {
  quotes: Quote[];
  employees?: any[];
  clientFiles?: Record<string, any[]>;
  isLoading: boolean;
  hasEditPermission: boolean;
  location: ReturnType<typeof useLocation>;
  listCardAnimClass?: string;
}) {
  if (isLoading && !quotes.length) {
    return (
      <div className={uiCx('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4', listCardAnimClass)}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={uiCx('h-64 animate-pulse bg-gray-100', uiRadius.card)} />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={uiCx('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4', listCardAnimClass)}>
        {hasEditPermission && (
          <Link
            to="/quotes/new"
            state={{ backgroundLocation: location }}
            className={getListCreateItemClassName('card', 'min-h-[200px]')}
          >
            <Plus className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
            <span className={uiListCreateItem.label}>New Quote</span>
          </Link>
        )}
        {quotes.map((quote) => (
          <QuoteListCard
            key={quote.id}
            quote={quote}
            employees={employees}
            clientFiles={clientFiles?.[quote.client_id || ''] || []}
          />
        ))}
      </div>
      {!isLoading && quotes.length === 0 && (
        <AppEmptyState
          className="mt-4 py-8"
          title="No quotes found matching your criteria."
        />
      )}
    </>
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
      className={uiCx(
        'group relative block h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300',
        uiBorders.subtle,
        uiRadius.card,
        uiColors.surface,
        'hover:shadow-md',
      )}
    >
      <div className={uiCx('flex flex-col gap-3', uiSpacing.cardPadding)}>
        <div className="min-w-0">
          <div className={uiCx(uiTypography.helper, 'truncate')}>{clientName || 'No client'}</div>
          <div className="min-w-0">
            <div
              className={uiCx(
                uiTypography.sectionTitle,
                'whitespace-normal break-words transition-colors group-hover:text-brand-red',
              )}
            >
              {documentType}
            </div>
            <div className={uiCx(uiTypography.helper, 'break-words')}>
              {quote.code || quote.order_number || '—'}
            </div>
          </div>
        </div>

        <div className="border-t border-black/5" />

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className={uiTypography.helper}>Created</div>
            <div className={uiCx(uiTypography.sectionTitle, 'truncate text-xs')}>{created || '—'}</div>
          </div>
          <div className="min-w-0">
            <div className={uiTypography.helper}>Updated</div>
            <div className={uiCx(uiTypography.sectionTitle, 'truncate text-xs')}>{updated || '—'}</div>
          </div>
          <div className="min-w-0 truncate" title={estimatorName}>
            <div className={uiTypography.helper}>Estimator</div>
            <div className={uiCx(uiTypography.sectionTitle, 'truncate text-xs')}>{estimatorName}</div>
          </div>
          <div className="min-w-0">
            <div className={uiTypography.helper}>Estimated Value</div>
            <div className={uiCx('truncate font-semibold text-brand-red', uiTypography.body)}>
              {formatQuoteValueDisplay(estimatedValue)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
