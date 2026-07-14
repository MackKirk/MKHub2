import { INSPECTION_RESULT_LABELS } from '@/lib/fleetBadges';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  getInspectionResultBadgeVariant,
  getInspectionTypeBadgeVariant,
  inspectionTypeLabel,
} from '@/lib/fleetUi';
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

export type FleetAssetInspectionRow = {
  id: string;
  inspection_date: string;
  inspection_type?: string;
  inspection_schedule_id?: string;
  result: string;
  created_at: string;
};

export type FleetAssetInspectionSortCol = 'inspection_date' | 'inspection_type' | 'result' | 'created_at';

const LIST_GRID_COLS = 'grid-cols-[4fr_3fr_3fr_3fr]';
const LIST_MIN_WIDTH = 'min-w-[560px]';

type Props = {
  isLoading: boolean;
  inspections: FleetAssetInspectionRow[] | undefined;
  rows: FleetAssetInspectionRow[];
  sortBy: FleetAssetInspectionSortCol;
  sortDir: 'asc' | 'desc';
  searchInput: string;
  onSearchChange: (value: string) => void;
  onSort: (column: FleetAssetInspectionSortCol) => void;
  canEdit?: boolean;
  onScheduleClick: () => void;
  onOpenInspection: (inspection: FleetAssetInspectionRow) => void;
};

export function FleetAssetInspectionsTab({
  isLoading,
  inspections,
  rows,
  sortBy,
  sortDir,
  searchInput,
  onSearchChange,
  onSort,
  canEdit = true,
  onScheduleClick,
  onOpenInspection,
}: Props) {
  const totalCount = Array.isArray(inspections) ? inspections.length : 0;
  const hasRecords = totalCount > 0;
  const hasFilteredRows = rows.length > 0;
  const searchActive = searchInput.trim().length > 0;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Inspections"
        description="Schedule an inspection for this asset."
        {...appSectionPresetProps('documents')}
      />

      <AppCard className="min-w-0" bodyClassName="!p-0">
        {canEdit ? (
          <div className={uiCx(uiSpacing.cardPadding, 'pb-3')}>
            <AppListCreateItem label="Schedule inspection" layout="row" className="w-full" onClick={onScheduleClick} />
          </div>
        ) : null}

        {hasRecords && (
          <div className="w-full min-w-0 border-t border-gray-200 bg-gray-50/80 px-3 py-2.5">
            <AppInput
              placeholder="Search inspections…"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search inspections"
            />
          </div>
        )}

        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'border-t border-gray-100 px-4 py-8 text-center')}>Loading…</div>
        ) : !hasRecords ? (
          <div className={uiCx('border-t border-gray-100', uiSpacing.cardPadding)}>
            <AppEmptyState
              title="No inspections recorded for this asset yet."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : !hasFilteredRows ? (
          <div className={uiCx('border-t border-gray-100', uiSpacing.cardPadding)}>
            <AppEmptyState
              title="No inspections match your search."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : (
          <>
            <AppSortableEntityList layout="flat" className="border-t border-gray-100">
              <AppSortableEntityListHeader variant="flat" gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                <AppSortableEntityListSortColumn
                  label="Date of Inspection"
                  column="inspection_date"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Type"
                  column="inspection_type"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Result"
                  column="result"
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
                {rows.map((inspection) => {
                  const resultKey = (inspection.result || 'pending').toLowerCase();
                  const resultLabel = INSPECTION_RESULT_LABELS[resultKey] ?? inspection.result;
                  const resultVariant = getInspectionResultBadgeVariant(resultKey);
                  return (
                    <AppSortableEntityListRow
                      key={inspection.id}
                      variant="flat"
                      as="div"
                      role="button"
                      tabIndex={0}
                      gridCols={LIST_GRID_COLS}
                      minWidth={LIST_MIN_WIDTH}
                      className="cursor-pointer"
                      onClick={() => onOpenInspection(inspection)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenInspection(inspection);
                        }
                      }}
                    >
                      <time
                        dateTime={inspection.inspection_date}
                        className={uiCx(uiTypography.body, 'whitespace-nowrap font-medium tabular-nums text-gray-900')}
                      >
                        {formatDateLocal(new Date(inspection.inspection_date))}
                      </time>
                      <div className="min-w-0">
                        <AppBadge variant={getInspectionTypeBadgeVariant(inspection.inspection_type)}>
                          {inspectionTypeLabel(inspection.inspection_type)}
                        </AppBadge>
                      </div>
                      <div className="min-w-0">
                        <AppBadge variant={resultVariant}>{resultLabel}</AppBadge>
                      </div>
                      <span className={uiCx(uiTypography.body, 'whitespace-nowrap tabular-nums text-gray-600')}>
                        {inspection.created_at ? formatDateLocal(new Date(inspection.created_at)) : '—'}
                      </span>
                    </AppSortableEntityListRow>
                  );
                })}
              </AppSortableEntityListFlatBody>
            </AppSortableEntityList>
            <div className={uiCx(uiLayout.actionsRow, 'justify-between border-t border-gray-200 px-4 py-2.5')}>
              <p className={uiTypography.helper}>
                {searchActive
                  ? `Showing ${rows.length} of ${totalCount} inspection${totalCount === 1 ? '' : 's'}`
                  : `${rows.length} inspection${rows.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </>
        )}
      </AppCard>
    </div>
  );
}
