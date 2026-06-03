import { CATEGORY_LABELS, URGENCY_LABELS, WORK_ORDER_STATUS_LABELS } from '@/lib/fleetBadges';
import { formatDateLocal } from '@/lib/dateUtils';
import { getUrgencyBadgeVariant, getWorkOrderStatusBadgeVariant } from '@/lib/fleetUi';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppSectionHeader,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Search } from 'lucide-react';

const WO_DESC_TABLE_TRUNC = 72;

export type FleetAssetWorkOrderRow = {
  id: string;
  work_order_number: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  created_at: string;
};

export type FleetAssetWorkOrderSortCol =
  | 'work_order_number'
  | 'description'
  | 'category'
  | 'urgency'
  | 'status'
  | 'created_at';

const LIST_GRID_COLS = 'grid-cols-[3fr_8fr_3fr_3fr_3fr_3fr]';
const LIST_MIN_WIDTH = 'min-w-[720px]';

type Props = {
  isLoading: boolean;
  workOrders: FleetAssetWorkOrderRow[] | undefined;
  rows: FleetAssetWorkOrderRow[];
  sortBy: FleetAssetWorkOrderSortCol;
  sortDir: 'asc' | 'desc';
  searchInput: string;
  onSearchChange: (value: string) => void;
  onSort: (column: FleetAssetWorkOrderSortCol) => void;
  onCreateClick: () => void;
  onOpenWorkOrder: (workOrderId: string) => void;
};

export function FleetAssetWorkOrdersTab({
  isLoading,
  workOrders,
  rows,
  sortBy,
  sortDir,
  searchInput,
  onSearchChange,
  onSort,
  onCreateClick,
  onOpenWorkOrder,
}: Props) {
  const totalCount = Array.isArray(workOrders) ? workOrders.length : 0;
  const hasRecords = totalCount > 0;
  const hasFilteredRows = rows.length > 0;
  const searchActive = searchInput.trim().length > 0;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Work Orders"
        description="Create or open a work order for this asset."
        {...appSectionPresetProps('workload')}
      />

      <AppCard className="min-w-0" bodyClassName="!p-0">
        <div className={uiCx(uiSpacing.cardPadding, 'pb-3')}>
          <AppListCreateItem label="New Work Order" layout="row" className="w-full" onClick={onCreateClick} />
        </div>

        {hasRecords && (
          <div className="w-full min-w-0 border-t border-gray-200 bg-gray-50/80 px-3 py-2.5">
            <AppInput
              placeholder="Search work orders…"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search work orders"
            />
          </div>
        )}

        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'border-t border-gray-100 px-4 py-8 text-center')}>Loading…</div>
        ) : !hasRecords ? (
          <div className={uiCx('border-t border-gray-100', uiSpacing.cardPadding)}>
            <AppEmptyState
              title="No work orders yet for this asset."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : !hasFilteredRows ? (
          <div className={uiCx('border-t border-gray-100', uiSpacing.cardPadding)}>
            <AppEmptyState
              title="No work orders match your search."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : (
          <>
            <AppSortableEntityList layout="flat" className="border-t border-gray-100">
              <AppSortableEntityListHeader variant="flat" gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                <AppSortableEntityListSortColumn
                  label="WO #"
                  column="work_order_number"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Description"
                  column="description"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Category"
                  column="category"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Urgency"
                  column="urgency"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Status"
                  column="status"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Created at"
                  column="created_at"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
              </AppSortableEntityListHeader>
              <AppSortableEntityListFlatBody gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                {rows.map((wo) => {
                  const descRaw = wo.description?.trim() || '';
                  const descDisplay =
                    descRaw.length > WO_DESC_TABLE_TRUNC
                      ? `${descRaw.slice(0, WO_DESC_TABLE_TRUNC)}…`
                      : descRaw || '—';
                  const categoryLabel = CATEGORY_LABELS[wo.category] ?? wo.category;
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
                      onClick={() => onOpenWorkOrder(wo.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenWorkOrder(wo.id);
                        }
                      }}
                    >
                      <span className={uiCx(uiTypography.body, 'whitespace-nowrap font-medium text-gray-900')}>
                        {wo.work_order_number}
                      </span>
                      <span
                        className={uiCx(uiTypography.body, 'line-clamp-2 min-w-0 text-gray-600')}
                        title={descRaw || undefined}
                      >
                        {descDisplay}
                      </span>
                      <span className={uiCx(uiTypography.body, 'capitalize text-gray-600')}>{categoryLabel}</span>
                      <div className="min-w-0">
                        <AppBadge variant={getUrgencyBadgeVariant(wo.urgency)}>
                          {URGENCY_LABELS[wo.urgency] ?? wo.urgency}
                        </AppBadge>
                      </div>
                      <div className="min-w-0">
                        <AppBadge variant={getWorkOrderStatusBadgeVariant(wo.status)}>
                          {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status.replace(/_/g, ' ')}
                        </AppBadge>
                      </div>
                      <span className={uiCx(uiTypography.body, 'whitespace-nowrap tabular-nums text-gray-600')}>
                        {wo.created_at ? formatDateLocal(new Date(wo.created_at)) : '—'}
                      </span>
                    </AppSortableEntityListRow>
                  );
                })}
              </AppSortableEntityListFlatBody>
            </AppSortableEntityList>
            <div className={uiCx(uiLayout.actionsRow, 'justify-between border-t border-gray-200 px-4 py-2.5')}>
              <p className={uiTypography.helper}>
                {searchActive
                  ? `Showing ${rows.length} of ${totalCount} work order${totalCount === 1 ? '' : 's'}`
                  : `${rows.length} work order${rows.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </>
        )}
      </AppCard>
    </div>
  );
}
