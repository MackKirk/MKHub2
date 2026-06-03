import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { ChevronDown, ChevronRight, Search, SlidersHorizontal, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  formatEquipmentStatus,
  getEquipmentAssignmentBadgeVariant,
  getEquipmentStatusBadgeVariant,
} from '@/lib/equipmentUi';
import EquipmentListNewModal from '@/components/fleet/EquipmentListNewModal';
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
  AppSectionHeader,
  AppTabs,
  uiBorders,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
  type AppTabItem,
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

const CATEGORY_TAB_ITEMS: AppTabItem[] = [
  { key: 'all', label: 'All' },
  { key: 'generator', label: 'Generators' },
  { key: 'tool', label: 'Tools' },
  { key: 'electronics', label: 'Electronics' },
  { key: 'small_tool', label: 'Small Tools' },
  { key: 'safety', label: 'Safety' },
];

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

function ExpandedEquipmentPanel({ item, onViewDetails }: { item: Equipment; onViewDetails: () => void }) {
  const detail = (label: string, value: string | number | undefined) =>
    value !== undefined && value !== null && String(value).trim() !== '' ? (
      <div className="flex flex-col gap-0.5">
        <span className={uiTypography.overline}>{label}</span>
        <span className={uiTypography.body}>{String(value)}</span>
      </div>
    ) : null;

  return (
    <div className={uiCx('border-t border-gray-100 bg-gray-50/80 p-4', uiSpacing.sectionStack)}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-left md:grid-cols-3">
        <div className={uiSpacing.sectionStack}>
          <AppSectionHeader title="Identity" className="!mb-0" />
          <div className="space-y-2">
            {detail('Brand', item.brand)}
            {detail('Model', item.model)}
            {detail('Serial', item.serial_number)}
            {detail('Category', item.category ? item.category.replace(/_/g, ' ') : undefined)}
          </div>
        </div>
        <div className={uiSpacing.sectionStack}>
          <AppSectionHeader title="Value & Warranty" className="!mb-0" />
          <div className="space-y-2">
            {detail('Value', item.value != null ? `$${item.value.toLocaleString()}` : undefined)}
            {detail('Warranty Expiry', item.warranty_expiry ? formatDateLocal(new Date(item.warranty_expiry)) : undefined)}
            {detail('Purchase Date', item.purchase_date ? formatDateLocal(new Date(item.purchase_date)) : undefined)}
          </div>
        </div>
        <div className={uiSpacing.sectionStack}>
          <AppSectionHeader title="Notes" className="!mb-0" />
          <div className="space-y-2">{detail('Notes', item.notes)}</div>
        </div>
      </div>
      <div className={uiCx('flex items-center gap-2 border-t border-gray-200 pt-3')}>
        <AppButton type="button" size="sm" onClick={onViewDetails}>
          View Details
        </AppButton>
      </div>
    </div>
  );
}

export default function EquipmentList() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [showNewEquipmentModal, setShowNewEquipmentModal] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

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
  const pageTitle = categoryLabels[categoryFilter] || 'Equipment';

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={pageTitle}
        subtitle="Manage tools and equipment"
        icon={<Wrench className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppTabs
          tabs={CATEGORY_TAB_ITEMS}
          value={categoryFilter}
          onChange={handleCategoryChange}
          className="mb-3"
        />
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
                <AppListCreateItem
                  label="New Equipment"
                  layout="row"
                  className="w-full"
                  onClick={() => setShowNewEquipmentModal(true)}
                />
                <AppEmptyState
                  title={`No ${categoryFilter === 'all' ? 'equipment' : categoryLabels[categoryFilter]?.toLowerCase()} found`}
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </div>
            ) : (
              <>
                <div className={uiCx(uiSpacing.cardPadding, equipment.length === 0 ? 'pb-10' : 'pb-3')}>
                  <AppListCreateItem
                    label="New Equipment"
                    layout="row"
                    className="w-full"
                    onClick={() => setShowNewEquipmentModal(true)}
                  />
                </div>
                {equipment.length > 0 ? (
                  <div className="min-w-0 overflow-x-auto border-t border-gray-100">
                    <table className="w-full min-w-0 border-collapse">
                      <thead className={uiCx(uiBorders.subtle, 'border-b bg-gray-50')}>
                        <tr>
                          <th className="w-10 rounded-tl-lg px-2 py-2 text-left" scope="col" aria-label="Expand row" />
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
                          const isExpanded = expandedRowId === item.id;
                          const primaryName =
                            (item.name && item.name.trim()) ||
                            [item.brand, item.model].filter(Boolean).join(' ').trim() ||
                            '—';
                          const metaLine = buildMetaLine(item);
                          const isAssigned = item.status === 'checked_out' || !!item.assigned_to_name;

                          return (
                            <Fragment key={item.id}>
                              <tr
                                className="min-h-[52px] cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
                                onClick={() => setExpandedRowId((prev) => (prev === item.id ? null : item.id))}
                              >
                                <td className="w-10 px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                                  <AppButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 px-0"
                                    aria-expanded={isExpanded}
                                    aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedRowId((prev) => (prev === item.id ? null : item.id));
                                    }}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4" aria-hidden />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" aria-hidden />
                                    )}
                                  </AppButton>
                                </td>
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
                              {isExpanded ? (
                                <tr className="bg-gray-50/50">
                                  <td colSpan={8} className="p-0 align-top">
                                    <ExpandedEquipmentPanel
                                      item={item}
                                      onViewDetails={() => nav(`/company-assets/equipment/${item.id}`)}
                                    />
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
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
        open={showNewEquipmentModal}
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
