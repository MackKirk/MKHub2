import { formatDateLocal } from '@/lib/dateUtils';
import { getFleetDueStatusBadgeVariant } from '@/lib/fleetUi';
import {
  AppBadge,
  AppCard,
  AppListRowIconButton,
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
import type { FleetComplianceRecord } from '@/components/fleet/FleetComplianceModal';
import { Search } from 'lucide-react';

const COMP_NOTES_TABLE_TRUNC = 72;

export type FleetAssetComplianceRow = FleetComplianceRecord;

export type FleetAssetComplianceSortCol =
  | 'record_type'
  | 'facility'
  | 'annual_inspection_date'
  | 'expiry_date'
  | 'notes';

const LIST_GRID_COLS = 'grid-cols-[2fr_3fr_3fr_3fr_2fr_4fr_2fr]';
const LIST_MIN_WIDTH = 'min-w-[880px]';

function complianceExpiryStatus(rec: FleetAssetComplianceRow): {
  label: string;
  variant: ReturnType<typeof getFleetDueStatusBadgeVariant>;
} {
  if (!rec.expiry_date?.trim()) {
    return { label: 'No expiry', variant: 'neutral' };
  }
  const exp = new Date(rec.expiry_date.slice(0, 10));
  const now = new Date();
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { label: 'Overdue', variant: 'danger' };
  if (daysLeft <= 30) return { label: 'Due soon', variant: 'warning' };
  return { label: 'OK', variant: 'success' };
}

type Props = {
  isLoading: boolean;
  complianceRecords: FleetAssetComplianceRow[] | undefined;
  rows: FleetAssetComplianceRow[];
  sortBy: FleetAssetComplianceSortCol;
  sortDir: 'asc' | 'desc';
  searchInput: string;
  onSearchChange: (value: string) => void;
  onSort: (column: FleetAssetComplianceSortCol) => void;
  canEdit?: boolean;
  onCreateClick: () => void;
  onEditRecord: (recordId: string) => void;
  onDeleteRecord: (record: FleetAssetComplianceRow) => void;
};

export function FleetAssetComplianceTab({
  isLoading,
  complianceRecords,
  rows,
  sortBy,
  sortDir,
  searchInput,
  onSearchChange,
  onSort,
  canEdit = true,
  onCreateClick,
  onEditRecord,
  onDeleteRecord,
}: Props) {
  const totalCount = Array.isArray(complianceRecords) ? complianceRecords.length : 0;
  const hasRecords = totalCount > 0;
  const hasFilteredRows = rows.length > 0;
  const searchActive = searchInput.trim().length > 0;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Compliance"
        description="CVIP, CRANE, NDT, PROPANE, and other certification records for this asset."
        {...appSectionPresetProps('workload')}
      />

      <AppCard className="min-w-0" bodyClassName="!p-0">
        {canEdit ? (
          <div className={uiCx(uiSpacing.cardPadding, 'pb-3')}>
            <AppListCreateItem
              label="Add compliance record"
              layout="row"
              className="w-full"
              onClick={onCreateClick}
            />
          </div>
        ) : null}

        {hasRecords && (
          <div className="w-full min-w-0 border-t border-gray-200 bg-gray-50/80 px-3 py-2.5">
            <AppInput
              placeholder="Search compliance records…"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search compliance records"
            />
          </div>
        )}

        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'border-t border-gray-100 px-4 py-8 text-center')}>
            Loading…
          </div>
        ) : !hasRecords ? (
          <div className={uiCx('border-t border-gray-100', uiSpacing.cardPadding)}>
            <AppEmptyState
              title="No compliance records yet for this asset."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : !hasFilteredRows ? (
          <div className={uiCx('border-t border-gray-100', uiSpacing.cardPadding)}>
            <AppEmptyState
              title="No records match your search."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : (
          <>
            <AppSortableEntityList layout="flat" className="border-t border-gray-100">
              <AppSortableEntityListHeader variant="flat" gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                <AppSortableEntityListSortColumn
                  label="Type"
                  column="record_type"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Facility"
                  column="facility"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Annual inspection"
                  column="annual_inspection_date"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Expiry"
                  column="expiry_date"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label="Status"
                  column="record_type"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                  sortable={false}
                />
                <AppSortableEntityListSortColumn
                  label="Notes"
                  column="notes"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                />
                <AppSortableEntityListSortColumn
                  label=" "
                  column="notes"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={onSort}
                  sortable={false}
                />
              </AppSortableEntityListHeader>
              <AppSortableEntityListFlatBody gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
                {rows.map((rec) => {
                  const status = complianceExpiryStatus(rec);
                  const notesRaw = rec.notes?.trim() || '';
                  const notesDisplay =
                    notesRaw.length > COMP_NOTES_TABLE_TRUNC
                      ? `${notesRaw.slice(0, COMP_NOTES_TABLE_TRUNC)}…`
                      : notesRaw || '—';
                  return (
                    <AppSortableEntityListRow
                      key={rec.id}
                      variant="flat"
                      as="div"
                      role={canEdit ? 'button' : undefined}
                      tabIndex={canEdit ? 0 : undefined}
                      gridCols={LIST_GRID_COLS}
                      minWidth={LIST_MIN_WIDTH}
                      className={canEdit ? 'cursor-pointer' : undefined}
                      onClick={canEdit ? () => onEditRecord(rec.id) : undefined}
                      onKeyDown={
                        canEdit
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onEditRecord(rec.id);
                              }
                            }
                          : undefined
                      }
                    >
                      <span className={uiCx(uiTypography.body, 'whitespace-nowrap font-medium text-gray-900')}>
                        {rec.record_type}
                      </span>
                      <span
                        className={uiCx(uiTypography.body, 'line-clamp-2 min-w-0 text-gray-700')}
                        title={rec.facility?.trim() || undefined}
                      >
                        {rec.facility?.trim() || '—'}
                      </span>
                      <span className={uiCx(uiTypography.body, 'whitespace-nowrap tabular-nums text-gray-600')}>
                        {rec.annual_inspection_date
                          ? formatDateLocal(new Date(rec.annual_inspection_date.slice(0, 10)))
                          : '—'}
                      </span>
                      <span className={uiCx(uiTypography.body, 'whitespace-nowrap tabular-nums text-gray-600')}>
                        {rec.expiry_date
                          ? formatDateLocal(new Date(rec.expiry_date.slice(0, 10)))
                          : '—'}
                      </span>
                      <div className="min-w-0">
                        <AppBadge variant={status.variant}>{status.label}</AppBadge>
                      </div>
                      <span
                        className={uiCx(uiTypography.body, 'line-clamp-2 min-w-0 text-gray-600')}
                        title={notesRaw || undefined}
                      >
                        {notesDisplay}
                      </span>
                      <div className="flex items-center justify-end">
                        {canEdit ? (
                          <AppListRowIconButton
                            preset="delete"
                            label={`Delete ${rec.record_type}${rec.facility?.trim() ? ` · ${rec.facility.trim()}` : ''}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onDeleteRecord(rec);
                            }}
                          />
                        ) : null}
                      </div>
                    </AppSortableEntityListRow>
                  );
                })}
              </AppSortableEntityListFlatBody>
            </AppSortableEntityList>
            <div className={uiCx(uiLayout.actionsRow, 'justify-between border-t border-gray-200 px-4 py-2.5')}>
              <p className={uiTypography.helper}>
                {searchActive
                  ? `Showing ${rows.length} of ${totalCount} record${totalCount === 1 ? '' : 's'}`
                  : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </>
        )}
      </AppCard>
    </div>
  );
}
