import { Link } from 'react-router-dom';
import {
  AppBadge,
  AppEmptyState,
  AppListCreateItem,
  AppSectionHeader,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { withFileAccessTokenIfNeeded } from '@/lib/api';
import { formatAddressDisplay } from '@/lib/addressUtils';

const EM_DASH = '\u2014';

const LIST_MIN_WIDTH = 'min-w-[860px]';
const LIST_GRID_COLS = 'grid-cols-[10fr_5fr_6fr_4fr_4fr_4fr]';

export type SubcontractorWorkerRow = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  is_active: boolean;
  photo_file_id?: string | null;
  job_title?: string | null;
  address_line1?: string | null;
  city?: string | null;
  province?: string | null;
  created_at?: string | null;
};

type WorkerSortColumn = 'name' | 'status' | 'created';

type WorkerListParams = {
  status: 'all' | 'active' | 'inactive';
  sort: WorkerSortColumn;
  dir: 'asc' | 'desc';
};

export function subcontractorCompanyWorkersUrl(
  companyId: string,
  params: WorkerListParams = { status: 'all', sort: 'name', dir: 'asc' },
): string {
  const qs = new URLSearchParams({
    tab: 'workers',
    w_status: params.status,
    w_sort: params.sort,
    w_dir: params.dir,
  });
  return `/business/subcontractors/companies/${companyId}?${qs.toString()}`;
}

function sortIndicator(active: boolean, dir: 'asc' | 'desc') {
  if (!active) return '';
  return dir === 'asc' ? ' ↑' : ' ↓';
}

function formatCreatedAt(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return EM_DASH;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10) || EM_DASH;
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function WorkerListRow({ worker, returnTo }: { worker: SubcontractorWorkerRow; returnTo: string }) {
  const avatarSrc = worker.photo_file_id
    ? withFileAccessTokenIfNeeded(`/files/${worker.photo_file_id}/thumbnail?w=96`) || ''
    : '';
  const locationLine = formatAddressDisplay({
    address_line1: worker.address_line1 ?? undefined,
    city: worker.city ?? undefined,
    province: worker.province ?? undefined,
  });

  return (
    <Link
      to={`/business/subcontractors/workers/${worker.id}`}
      state={{ returnTo }}
      className={uiCx(
        'group block p-4 transition-all duration-200 hover:border-gray-300',
        LIST_MIN_WIDTH,
        uiBorders.subtle,
        uiRadius.card,
        uiColors.surface,
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30',
        !worker.is_active && 'opacity-90',
      )}
    >
      <div className={uiCx('grid items-center gap-2 overflow-hidden sm:gap-3 lg:gap-4', LIST_GRID_COLS)}>
        <div className="flex min-w-0 items-center gap-2">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className={uiCx('h-9 w-9 shrink-0 object-cover', uiRadius.control, 'ring-2 ring-white')}
            />
          ) : (
            <div
              className={uiCx(
                'flex h-9 w-9 shrink-0 items-center justify-center text-xs font-semibold text-gray-600',
                uiRadius.control,
                'bg-gradient-to-br from-gray-100 to-gray-200',
              )}
            >
              {(worker.name || '?').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-gray-900 transition-colors group-hover:text-[#7f1010]">
              {worker.name || EM_DASH}
            </div>
            {locationLine ? (
              <div className="mt-0.5 truncate text-xs text-gray-600">{locationLine}</div>
            ) : null}
          </div>
        </div>
        <div className="min-w-0">
          <span className={uiCx(uiTypography.helper, 'truncate font-semibold text-gray-900')}>
            {worker.job_title || EM_DASH}
          </span>
        </div>
        <div className="min-w-0">
          {worker.email ? (
            <a
              href={`mailto:${worker.email}`}
              onClick={(e) => e.stopPropagation()}
              className={uiCx(uiTypography.helper, 'block truncate text-gray-700 hover:text-brand-red')}
            >
              {worker.email}
            </a>
          ) : (
            <span className={uiCx(uiTypography.helper, 'text-gray-500')}>{EM_DASH}</span>
          )}
        </div>
        <div className="min-w-0">
          {worker.phone ? (
            <a
              href={`tel:${worker.phone}`}
              onClick={(e) => e.stopPropagation()}
              className={uiCx(uiTypography.helper, 'block truncate whitespace-nowrap text-gray-700 hover:text-brand-red')}
            >
              {worker.phone}
            </a>
          ) : (
            <span className={uiCx(uiTypography.helper, 'text-gray-500')}>{EM_DASH}</span>
          )}
        </div>
        <div className="min-w-0 flex items-center">
          <AppBadge variant={worker.is_active ? 'success' : 'warning'} className="max-w-full truncate normal-case tracking-normal">
            {worker.is_active ? 'Active' : 'Inactive'}
          </AppBadge>
        </div>
        <div className="min-w-0">
          <span className={uiCx(uiTypography.helper, 'whitespace-nowrap text-gray-700')}>
            {formatCreatedAt(worker.created_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function SubcontractorWorkersCard({
  companyId,
  workers,
  hasEditPermission,
  workerListParams,
  onWorkerFiltersChange,
  onNewWorker,
  totalWorkers,
  activeWorkerCount,
  inactiveWorkerCount,
}: {
  companyId: string;
  workers: SubcontractorWorkerRow[] | undefined;
  hasEditPermission?: boolean;
  workerListParams: WorkerListParams;
  onWorkerFiltersChange: (patch: Partial<WorkerListParams>) => void;
  onNewWorker: () => void;
  totalWorkers: number;
  activeWorkerCount: number;
  inactiveWorkerCount: number;
}) {
  const workersReturnTo = subcontractorCompanyWorkersUrl(companyId, workerListParams);
  const list = workers || [];
  const hasWorkers = list.length > 0;
  const { sort: sortBy, dir: sortDir } = workerListParams;

  const setListSort = (column: WorkerSortColumn) => {
    const nextDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    onWorkerFiltersChange({ sort: column, dir: nextDir });
  };

  const headerBtnClass =
    'min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none';

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Workers"
        description={
          hasEditPermission
            ? `Click a row to open a worker profile. ${totalWorkers} total · ${activeWorkerCount} active · ${inactiveWorkerCount} inactive.`
            : `People who clock in under this subcontractor. ${totalWorkers} total · ${activeWorkerCount} active · ${inactiveWorkerCount} inactive.`
        }
        {...appSectionPresetProps('employment')}
      />

      <div className="flex flex-col gap-2 overflow-x-auto">
        {hasEditPermission && (
          <AppListCreateItem
            label="New worker"
            layout="row"
            className={uiCx('min-h-[60px]', LIST_MIN_WIDTH)}
            onClick={onNewWorker}
          />
        )}

        {hasWorkers ? (
          <>
            <div
              className={uiCx(
                'grid items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 sm:gap-3 lg:gap-4',
                LIST_MIN_WIDTH,
                LIST_GRID_COLS,
                uiTypography.overline,
                'normal-case tracking-normal text-gray-700',
              )}
              role="row"
            >
              <button
                type="button"
                onClick={() => setListSort('name')}
                className={headerBtnClass}
                title="Sort by worker name"
              >
                Worker{sortIndicator(sortBy === 'name', sortDir)}
              </button>
              <div className="min-w-0" title="Job title or role">
                Job title
              </div>
              <div className="min-w-0" title="Work email">
                Email
              </div>
              <div className="min-w-0" title="Phone number">
                Phone
              </div>
              <button
                type="button"
                onClick={() => setListSort('status')}
                className={headerBtnClass}
                title="Sort by status"
              >
                Status{sortIndicator(sortBy === 'status', sortDir)}
              </button>
              <button
                type="button"
                onClick={() => setListSort('created')}
                className={headerBtnClass}
                title="Sort by date added"
              >
                Added{sortIndicator(sortBy === 'created', sortDir)}
              </button>
            </div>
            {list.map((w) => (
              <WorkerListRow key={w.id} worker={w} returnTo={workersReturnTo} />
            ))}
          </>
        ) : workers ? (
          <AppEmptyState
            className="py-8"
            title="No workers yet"
            description={hasEditPermission ? 'Add the first worker using “New worker” above.' : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}
