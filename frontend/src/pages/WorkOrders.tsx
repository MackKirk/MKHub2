import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { ClipboardList, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  CATEGORY_LABELS,
  URGENCY_LABELS,
  WORK_ORDER_STATUS_LABELS,
} from '@/lib/fleetBadges';
import { getUrgencyBadgeVariant, getWorkOrderStatusBadgeVariant } from '@/lib/fleetUi';
import WorkOrderListNewModal from '@/components/fleet/WorkOrderListNewModal';
import { canAssignFleetWorkOrder, canEditFleetWorkOrderRecord } from '@/lib/fleetPermissions';
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
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

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
  scheduled_start_at?: string | null;
};

type WorkOrderListResponse = {
  items: WorkOrder[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

const DESC_TRUNCATE = 60;

const LIST_GRID_COLS = 'grid-cols-[2fr_5fr_2fr_2fr_2fr_2fr_2fr_2fr]';
const LIST_MIN_WIDTH = 'min-w-[960px]';

type SortColumn =
  | 'work_order_number'
  | 'description'
  | 'entity_type'
  | 'category'
  | 'urgency'
  | 'status'
  | 'created_at'
  | 'scheduled_start_at';

function buildMetaLine(wo: WorkOrder): string {
  const parts: string[] = [];
  if (wo.entity_type) parts.push(wo.entity_type);
  if (wo.category) parts.push(wo.category.replace(/_/g, ' '));
  if (wo.urgency) parts.push(wo.urgency.replace(/_/g, ' '));
  return parts.join(' • ');
}

const FILTER_PARAM_KEYS = ['status', 'status_not', 'urgency', 'urgency_not', 'entity_type', 'entity_type_not', 'category', 'category_not'];

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
  if (fieldsSet.has('status')) { params.delete('status'); params.delete('status_not'); }
  if (fieldsSet.has('urgency')) { params.delete('urgency'); params.delete('urgency_not'); }
  if (fieldsSet.has('entity_type')) { params.delete('entity_type'); params.delete('entity_type_not'); }
  if (fieldsSet.has('category')) { params.delete('category'); params.delete('category_not'); }
  for (const rule of rules) {
    const v = ruleValueStr(rule);
    if (!v?.trim()) continue;
    switch (rule.field) {
      case 'status':
        if (rule.operator === 'is') params.set('status', v);
        else params.set('status_not', v);
        break;
      case 'urgency':
        if (rule.operator === 'is') params.set('urgency', v);
        else params.set('urgency_not', v);
        break;
      case 'entity_type':
        if (rule.operator === 'is') params.set('entity_type', v);
        else params.set('entity_type_not', v);
        break;
      case 'category':
        if (rule.operator === 'is') params.set('category', v);
        else params.set('category_not', v);
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

const STATUS_OPTIONS = [
  { value: 'open', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'pending_parts', label: 'Awaiting parts' },
  { value: 'closed', label: 'Finished' },
  { value: 'not_approved', label: 'Not approved' },
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

const WORK_ORDER_FILTER_FIELDS: FieldConfig[] = [
  { id: 'status', label: 'Status', type: 'select', operators: ['is', 'is_not'], getOptions: () => STATUS_OPTIONS },
  { id: 'urgency', label: 'Urgency', type: 'select', operators: ['is', 'is_not'], getOptions: () => URGENCY_OPTIONS },
  { id: 'entity_type', label: 'Entity Type', type: 'select', operators: ['is', 'is_not'], getOptions: () => ENTITY_TYPE_OPTIONS },
  { id: 'category', label: 'Category', type: 'select', operators: ['is', 'is_not'], getOptions: () => CATEGORY_OPTIONS },
];

function getWorkOrderFieldLabel(fieldId: string): string {
  const f = WORK_ORDER_FILTER_FIELDS.find((x) => x.id === fieldId);
  return f?.label ?? fieldId;
}

const WO_VALUE_LABELS: Record<string, Record<string, string>> = {
  status: Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label])),
  urgency: Object.fromEntries(URGENCY_OPTIONS.map((o) => [o.value, o.label])),
  entity_type: Object.fromEntries(ENTITY_TYPE_OPTIONS.map((o) => [o.value, o.label])),
  category: Object.fromEntries(CATEGORY_OPTIONS.map((o) => [o.value, o.label])),
};

function getWorkOrderValueLabel(rule: FilterRule): string {
  const v = ruleValueStr(rule);
  const map = WO_VALUE_LABELS[rule.field];
  return (map && map[v]) ?? v ?? '';
}

export default function WorkOrders() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [showNewWorkOrderModal, setShowNewWorkOrderModal] = useState(false);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const canCreateWorkOrder = canEditFleetWorkOrderRecord(isAdmin, permissions);
  const canAssign = canAssignFleetWorkOrder(isAdmin, permissions);

  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const [page, setPage] = useState(pageParam);
  const limit = 15;

  const validSorts: SortColumn[] = [
    'work_order_number',
    'description',
    'entity_type',
    'category',
    'urgency',
    'status',
    'created_at',
    'scheduled_start_at',
  ];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn =
    rawSort && validSorts.includes(rawSort as SortColumn) ? (rawSort as SortColumn) : 'created_at';
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

  const showEmptyList = !isLoading && workOrders.length === 0;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Work Orders"
        subtitle="Unified work order management"
        icon={<ClipboardList className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by description or work order #…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              fieldHint="Search\n\nMatches work order description or work order number."
              aria-label="Search work orders"
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
          )}
        </div>
      </AppCard>

      {hasActiveFilters && (
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
              getValueLabel={getWorkOrderValueLabel}
              getFieldLabel={getWorkOrderFieldLabel}
            />
          ))}
        </div>
      )}

      <LoadingOverlay isLoading={isLoading} text="Loading work orders...">
        <AppCard
          className={uiShadows.card}
          bodyClassName="!p-0"
          footer={
            total > 0 ? (
              <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
                <p className={uiTypography.helper}>
                  Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, total)} of {total}{' '}
                  work orders
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
            ) : undefined
          }
        >
          <div className="flex flex-col">
            {showEmptyList ? (
              <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack, 'min-h-[12rem] pb-10')}>
                {canCreateWorkOrder ? (
                  <AppListCreateItem
                    label="New Work Order"
                    layout="row"
                    className="w-full"
                    onClick={() => setShowNewWorkOrderModal(true)}
                  />
                ) : null}
                <AppEmptyState
                  title="No work orders found"
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </div>
            ) : (
              <>
                {canCreateWorkOrder ? (
                  <div className={uiCx(uiSpacing.cardPadding, workOrders.length === 0 ? 'pb-10' : 'pb-3')}>
                    <AppListCreateItem
                      label="New Work Order"
                      layout="row"
                      className="w-full"
                      onClick={() => setShowNewWorkOrderModal(true)}
                    />
                  </div>
                ) : null}
                {workOrders.length > 0 ? (
                  <AppSortableEntityList layout="flat" className="border-t border-gray-100">
                    <AppSortableEntityListHeader variant="flat" gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                      <AppSortableEntityListSortColumn
                        label="WO #"
                        column="work_order_number"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Description"
                        column="description"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Type"
                        column="entity_type"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Category"
                        column="category"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Urgency"
                        column="urgency"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Status"
                        column="status"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Scheduled"
                        column="scheduled_start_at"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                      <AppSortableEntityListSortColumn
                        label="Created"
                        column="created_at"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                      />
                    </AppSortableEntityListHeader>
                    <AppSortableEntityListFlatBody gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                      {workOrders.map((wo) => {
                        const descLine = (wo.description && wo.description.trim()) || '—';
                        const descDisplay =
                          descLine.length > DESC_TRUNCATE ? `${descLine.slice(0, DESC_TRUNCATE)}…` : descLine;
                        const metaLine = buildMetaLine(wo);
                        const categoryLabel = CATEGORY_LABELS[wo.category] ?? wo.category?.replace(/_/g, ' ');
                        return (
                          <AppSortableEntityListRow
                            key={wo.id}
                            variant="flat"
                            as="div"
                            role="button"
                            tabIndex={0}
                            gridCols={LIST_GRID_COLS}
                            minWidth={LIST_MIN_WIDTH}
                            className="cursor-pointer"
                            onClick={() => nav(`/fleet/work-orders/${wo.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                nav(`/fleet/work-orders/${wo.id}`);
                              }
                            }}
                          >
                            <span className={uiCx(uiTypography.body, 'whitespace-nowrap font-medium text-gray-900')}>
                              {wo.work_order_number}
                            </span>
                            <div className="min-w-0">
                              <span className={uiCx(uiTypography.body, 'block truncate text-gray-900')} title={descLine}>
                                {descDisplay}
                              </span>
                              {metaLine ? (
                                <span className={uiCx(uiTypography.helper, 'block truncate')}>{metaLine}</span>
                              ) : null}
                            </div>
                            <span className={uiCx(uiTypography.body, 'capitalize text-gray-600')}>{wo.entity_type}</span>
                            <span className={uiCx(uiTypography.body, 'capitalize text-gray-600')}>{categoryLabel}</span>
                            <div className="min-w-0">
                              <AppBadge variant={getUrgencyBadgeVariant(wo.urgency)}>
                                {URGENCY_LABELS[wo.urgency] ?? wo.urgency?.replace(/_/g, ' ')}
                              </AppBadge>
                            </div>
                            <div className="min-w-0">
                              <AppBadge variant={getWorkOrderStatusBadgeVariant(wo.status)}>
                                {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status?.replace(/_/g, ' ')}
                              </AppBadge>
                            </div>
                            <span className={uiCx(uiTypography.body, 'whitespace-nowrap tabular-nums text-gray-600')}>
                              {wo.scheduled_start_at ? formatDateLocal(new Date(wo.scheduled_start_at)) : '—'}
                            </span>
                            <span className={uiCx(uiTypography.body, 'whitespace-nowrap tabular-nums text-gray-600')}>
                              {wo.created_at ? formatDateLocal(new Date(wo.created_at)) : '—'}
                            </span>
                          </AppSortableEntityListRow>
                        );
                      })}
                    </AppSortableEntityListFlatBody>
                  </AppSortableEntityList>
                ) : null}
              </>
            )}
          </div>
        </AppCard>
      </LoadingOverlay>

      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        fields={WORK_ORDER_FILTER_FIELDS}
        getFieldData={() => null}
      />

      <WorkOrderListNewModal
        open={canCreateWorkOrder && showNewWorkOrderModal}
        canAssign={canAssign}
        onClose={() => setShowNewWorkOrderModal(false)}
        onCreated={(data) => {
          setShowNewWorkOrderModal(false);
          queryClient.invalidateQueries({ queryKey: ['workOrders'] });
          queryClient.invalidateQueries({ queryKey: ['fleet-work-orders-calendar'] });
          nav(`/fleet/work-orders/${data.id}`);
        }}
      />
    </div>
  );
}
