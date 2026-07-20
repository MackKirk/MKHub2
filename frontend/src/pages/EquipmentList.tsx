import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { Search, SlidersHorizontal, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import {
  EQUIPMENT_STATUS_OPTIONS,
  formatEquipmentStatus,
  getEquipmentAssignmentBadgeVariant,
  getEquipmentStatusBadgeVariant,
} from '@/lib/equipmentUi';
import EquipmentListNewModal from '@/components/fleet/EquipmentListNewModal';
import { canEditEquipmentRecord } from '@/lib/companyAssetsPermissions';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import LoadingOverlay from '@/components/LoadingOverlay';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  AppQuickFilterRow,
  uiBorders,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

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

const FILTER_PARAM_KEYS = ['status', 'status_not', 'category', 'category_not', 'assigned'];

function ruleValueStr(rule: FilterRule): string {
  return typeof rule.value === 'string' ? rule.value : (Array.isArray(rule.value) ? rule.value[0] ?? '' : '');
}

function convertRulesToParams(rules: FilterRule[], existing: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(existing);
  if (rules.length === 0) {
    FILTER_PARAM_KEYS.forEach((p) => params.delete(p));
    return params;
  }
  const fieldsSet = new Set(rules.filter((r) => ruleValueStr(r)?.trim()).map((r) => r.field));
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
    const v = ruleValueStr(rule);
    if (!v?.trim()) continue;
    switch (rule.field) {
      case 'category':
        if (rule.operator === 'is') params.set('category', v);
        else params.set('category_not', v);
        break;
      case 'status':
        if (rule.operator === 'is') params.set('status', v);
        else params.set('status_not', v);
        break;
      case 'assignment': {
        const wantAssigned = v === 'assigned';
        params.set('assigned', rule.operator === 'is_not' ? String(!wantAssigned) : String(wantAssigned));
        break;
      }
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

const CATEGORY_OPTIONS = [
  { value: 'generator', label: 'Generators' },
  { value: 'tool', label: 'Tools' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'small_tool', label: 'Small Tools' },
  { value: 'safety', label: 'Safety Equipment' },
];

const CATEGORY_QUICK_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  ...CATEGORY_OPTIONS,
];

const ASSIGNMENT_OPTIONS = [
  { value: 'assigned', label: 'Assigned' },
  { value: 'available', label: 'Available' },
];

function buildEquipmentApiParams(
  searchParams: URLSearchParams,
  categoryFilter: string,
  sortBy: SortColumn,
  sortDir: 'asc' | 'desc',
  page: number,
  limit: number,
  search: string,
  opts?: { omitQuickFilters?: boolean; page?: number; limit?: number },
): URLSearchParams {
  const params = new URLSearchParams();
  if (search) params.set('search', search);

  if (!opts?.omitQuickFilters) {
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    const status = searchParams.get('status');
    const statusNot = searchParams.get('status_not');
    const assigned = searchParams.get('assigned');
    if (status) params.set('status', status);
    if (statusNot) params.set('status_not', statusNot);
    if (assigned === 'true' || assigned === 'false') params.set('assigned', assigned);
  }

  const categoryNot = searchParams.get('category_not');
  if (categoryNot) params.set('category_not', categoryNot);
  params.set('sort', sortBy);
  params.set('dir', sortDir);
  params.set('page', String(opts?.page ?? page));
  params.set('limit', String(opts?.limit ?? limit));
  return params;
}

const EQUIPMENT_FILTER_FIELDS: FieldConfig[] = [
  { id: 'category', label: 'Category', type: 'select', operators: ['is', 'is_not'], getOptions: () => CATEGORY_OPTIONS },
  { id: 'status', label: 'Status', type: 'select', operators: ['is', 'is_not'], getOptions: () => EQUIPMENT_STATUS_OPTIONS },
  { id: 'assignment', label: 'Assignment', type: 'select', operators: ['is', 'is_not'], getOptions: () => ASSIGNMENT_OPTIONS },
];

const EQUIPMENT_VALUE_LABELS: Record<string, Record<string, string>> = {
  category: Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.value, o.label])),
  status: Object.fromEntries(EQUIPMENT_STATUS_OPTIONS.map((o) => [o.value, o.label])),
  assignment: Object.fromEntries(ASSIGNMENT_OPTIONS.map((o) => [o.value, o.label])),
};

function getEquipmentFieldLabel(fieldId: string): string {
  const f = EQUIPMENT_FILTER_FIELDS.find((x) => x.id === fieldId);
  return f?.label ?? fieldId;
}

function getEquipmentValueLabel(rule: FilterRule): string {
  const v = ruleValueStr(rule);
  const map = EQUIPMENT_VALUE_LABELS[rule.field];
  return (map && map[v]) ?? v ?? '';
}

type SortColumn = 'unit_number' | 'name' | 'category' | 'value' | 'assignment' | 'status';

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
}) {
  const active = sortBy === column;
  return (
    <th className="px-3 py-2 text-left" scope="col">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={uiCx(
          uiTypography.controlLabel,
          'flex items-center gap-1 rounded py-0.5 hover:text-gray-900 focus:outline-none',
        )}
      >
        {label}
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
      </button>
    </th>
  );
}

export default function EquipmentList() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [showNewEquipmentModal, setShowNewEquipmentModal] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const canCreateEquipment = canEditEquipmentRecord(isAdmin, permissions);

  const categoryFilter = searchParams.get('category') || 'all';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const [page, setPage] = useState(pageParam);
  const limit = 15;

  const validSorts: SortColumn[] = ['unit_number', 'name', 'category', 'value', 'assignment', 'status'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn =
    rawSort && validSorts.includes(rawSort as SortColumn) ? (rawSort as SortColumn) : 'name';
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
      ...CATEGORY_QUICK_FILTER_OPTIONS.map((opt) => ({
        key: `category:${opt.value}`,
        label: opt.label,
        active: categoryFilter === opt.value,
        onClick: () => handleCategoryChange(opt.value),
      })),
      ...EQUIPMENT_STATUS_OPTIONS.map((opt) => ({
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
    [searchParams, categoryFilter],
  );

  const quickFilterCountBaseQs = useMemo(
    () =>
      buildEquipmentApiParams(searchParams, categoryFilter, sortBy, sortDir, page, limit, search, {
        omitQuickFilters: true,
        page: 1,
        limit: 1,
      }).toString(),
    [searchParams, categoryFilter, sortBy, sortDir, page, limit, search],
  );

  const quickFilterCountTargets = useMemo(() => {
    const targets: Array<{ key: string; qs: string }> = [];
    for (const opt of CATEGORY_QUICK_FILTER_OPTIONS) {
      const p = new URLSearchParams(quickFilterCountBaseQs);
      if (opt.value !== 'all') p.set('category', opt.value);
      targets.push({ key: `category:${opt.value}`, qs: p.toString() });
    }
    for (const opt of EQUIPMENT_STATUS_OPTIONS) {
      const p = new URLSearchParams(quickFilterCountBaseQs);
      p.set('status', opt.value);
      targets.push({ key: `status:${opt.value}`, qs: p.toString() });
    }
    for (const assignedValue of ['true', 'false'] as const) {
      const p = new URLSearchParams(quickFilterCountBaseQs);
      p.set('assigned', assignedValue);
      targets.push({ key: `assigned:${assignedValue}`, qs: p.toString() });
    }
    return targets;
  }, [quickFilterCountBaseQs]);

  const quickFilterCountQueries = useQueries({
    queries: quickFilterCountTargets.map((target) => ({
      queryKey: ['equipment', 'quick-filter-count', target.key, target.qs],
      queryFn: () => api<EquipmentListResponse>('GET', `/fleet/equipment?${target.qs}`).then((r) => r.total),
      staleTime: 60_000,
    })),
  });

  const quickFilterCountsByKey = useMemo(() => {
    const counts: Record<string, number> = {};
    quickFilterCountTargets.forEach((target, index) => {
      const total = quickFilterCountQueries[index]?.data;
      if (typeof total === 'number') counts[target.key] = total;
    });
    return counts;
  }, [quickFilterCountTargets, quickFilterCountQueries]);

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
      const params = buildEquipmentApiParams(
        searchParams,
        categoryFilter,
        sortBy,
        sortDir,
        page,
        limit,
        search,
      );
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

  const handleSearchChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('search', value);
    else params.delete('search');
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const showEmptyList = !isLoading && equipment.length === 0;
  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Equipment"
        subtitle="Manage tools and equipment"
        icon={<Wrench className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by name, serial, brand, model, unit #, notes…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search equipment"
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
              getValueLabel={getEquipmentValueLabel}
              getFieldLabel={getEquipmentFieldLabel}
            />
          ))}
        </div>
      ) : null}

      <LoadingOverlay isLoading={isLoading} text="Loading equipment…">
        <AppCard className={uiShadows.card} bodyClassName="!p-0">
          <div className="flex flex-col">
            {showEmptyList ? (
              <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack, 'min-h-[12rem] pb-10')}>
                {canCreateEquipment ? (
                  <AppListCreateItem
                    label="New Equipment"
                    layout="row"
                    className="w-full"
                    onClick={() => setShowNewEquipmentModal(true)}
                  />
                ) : null}
                <AppEmptyState
                  title={`No ${categoryFilter === 'all' ? 'equipment' : categoryLabels[categoryFilter]?.toLowerCase()} found`}
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </div>
            ) : (
              <>
                {canCreateEquipment ? (
                  <div className={uiCx(uiSpacing.cardPadding, equipment.length === 0 ? 'pb-10' : 'pb-3')}>
                    <AppListCreateItem
                      label="New Equipment"
                      layout="row"
                      className="w-full"
                      onClick={() => setShowNewEquipmentModal(true)}
                    />
                  </div>
                ) : null}
                {equipment.length > 0 ? (
                  <div className="min-w-0 overflow-x-auto border-t border-gray-100">
                    <table className="w-full min-w-0 border-collapse">
                      <thead className={uiCx(uiBorders.subtle, 'border-b bg-gray-50')}>
                        <tr>
                          <SortHeader label="Unit #" column="unit_number" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                          <SortHeader label="Name" column="name" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                          <SortHeader label="Category" column="category" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                          <th className={uiCx(uiTypography.controlLabel, 'px-3 py-2 text-left')} scope="col">
                            Serial/Brand
                          </th>
                          <SortHeader label="Value" column="value" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                          <SortHeader label="Assignment" column="assignment" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                          <SortHeader label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} />
                        </tr>
                      </thead>
                      <tbody>
                        {equipment.map((item) => {
                          const primaryName =
                            (item.name && item.name.trim()) ||
                            [item.brand, item.model].filter(Boolean).join(' ').trim() ||
                            '—';
                          const metaLine = buildMetaLine(item);
                          const isAssigned = !!item.assigned_to_name;

                          return (
                            <tr
                              key={item.id}
                              className="min-h-[52px] cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
                              onClick={() => nav(`/company-assets/equipment/${item.id}`)}
                              role="link"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  nav(`/company-assets/equipment/${item.id}`);
                                }
                              }}
                            >
                              <td className={uiCx(uiTypography.body, 'whitespace-nowrap px-3 py-3 align-top text-gray-600')}>
                                {item.unit_number || '—'}
                              </td>
                              <td className="min-w-0 px-3 py-3 align-top">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <span className={uiCx(uiTypography.body, 'truncate font-medium text-gray-900')}>
                                    {primaryName}
                                  </span>
                                  {metaLine ? (
                                    <span className={uiCx(uiTypography.helper, 'truncate')}>{metaLine}</span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <AppBadge variant="info" className="!normal-case">
                                  {item.category?.replace(/_/g, ' ') || '—'}
                                </AppBadge>
                              </td>
                              <td className={uiCx(uiTypography.body, 'max-w-[140px] truncate px-3 py-3 align-top text-gray-600')}>
                                {[item.serial_number, item.brand, item.model].filter(Boolean).join(' • ') || '—'}
                              </td>
                              <td className={uiCx(uiTypography.body, 'px-3 py-3 align-top text-gray-600')}>
                                {item.value != null ? `$${item.value.toLocaleString()}` : '—'}
                              </td>
                              <td className="min-w-0 px-3 py-3 align-top">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <AppBadge variant={getEquipmentAssignmentBadgeVariant(isAssigned)} className="w-fit !normal-case">
                                    {isAssigned ? 'Assigned' : 'Available'}
                                  </AppBadge>
                                  {isAssigned && item.assigned_to_name ? (
                                    <span className={uiCx(uiTypography.helper, 'truncate')}>{item.assigned_to_name}</span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <AppBadge variant={getEquipmentStatusBadgeVariant(item.status)} className="!normal-case">
                                  {formatEquipmentStatus(item.status || '—')}
                                </AppBadge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </div>
          {total > 0 ? (
            <div className={uiCx(uiLayout.actionsRow, 'flex-wrap justify-between gap-3 border-t border-gray-200 p-4')}>
              <p className={uiTypography.helper}>
                Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, total)} of {total} equipment
              </p>
              <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1 || isFetching}
                  onClick={() => {
                    const newPage = Math.max(1, currentPage - 1);
                    setPage(newPage);
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(newPage));
                    setSearchParams(params);
                  }}
                >
                  Previous
                </AppButton>
                <span className={uiTypography.helper}>
                  Page {currentPage} of {totalPages}
                </span>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages || isFetching}
                  onClick={() => {
                    const newPage = Math.min(totalPages, currentPage + 1);
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
          ) : null}
        </AppCard>
      </LoadingOverlay>

      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        fields={EQUIPMENT_FILTER_FIELDS}
        getFieldData={() => null}
      />

      <EquipmentListNewModal
        open={canCreateEquipment && showNewEquipmentModal}
        onClose={() => setShowNewEquipmentModal(false)}
        initialCategory={categoryFilter === 'all' ? 'generator' : categoryFilter}
        onCreated={(data) => {
          setShowNewEquipmentModal(false);
          queryClient.invalidateQueries({ queryKey: ['equipment'] });
          nav(`/company-assets/equipment/${data.id}`);
        }}
      />
    </div>
  );
}
