import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { LayoutGrid, List, Search, Star, Users as UsersIcon } from 'lucide-react';
import InviteUserModal from '@/components/InviteUserModal';
import toast from 'react-hot-toast';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppModal,
  AppPageHeader,
  AppSectionHeader,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTooltip,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type User = { id:string, username:string, email?:string, name?:string, roles?:string[], is_active?:boolean, profile_photo_file_id?:string, job_title?:string, phone?:string, mobile_phone?:string };
type UsersResponse = { items: User[], total: number, page: number, limit: number, total_pages: number };
type UserSortColumn = 'user' | 'job_title' | 'email' | 'status';

const USER_LIST_GRID_COLS = 'grid-cols-[30fr_20fr_28fr_22fr]';
const USER_LIST_MIN_WIDTH = 'min-w-[640px]';

function UserStatusBadge({ isActive }: { isActive?: boolean }) {
  const active = isActive !== false;
  return (
    <AppBadge
      variant={active ? 'success' : 'danger'}
      className="w-fit shrink-0 normal-case !tracking-normal"
    >
      {active ? 'Active' : 'Inactive'}
    </AppBadge>
  );
}

/** Fixed height for user grid cards (avatar + text lines); shared by UserCard and Invite User. */
const userGridCardClass = uiCx(
  'box-border flex h-[10.5rem] w-full flex-col items-center justify-center gap-2 text-center',
  uiRadius.card,
  uiSpacing.cardPadding,
  uiShadows.card,
);

const USER_SORT_COLUMNS: UserSortColumn[] = ['user', 'job_title', 'email', 'status'];

/** Card grid uses 4 columns; reserve one slot for Invite User so rows stay full. */
const USERS_PAGE_LIMIT = 24;

export default function Users(){
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const pageParam = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const [searchQuery, setSearchQuery] = useState(queryParam);
  const [page, setPage] = useState(pageParam);
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [bambooSyncModal, setBambooSyncModal] = useState<'photos' | 'documents' | null>(null);
  const [bambooForceReplace, setBambooForceReplace] = useState(false);

  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'list' || urlView === 'cards') return urlView;
    const saved = localStorage.getItem('users-view-mode');
    return saved === 'list' || saved === 'cards' ? saved : 'cards';
  });

  useEffect(() => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (viewMode === 'list') params.set('view', 'list');
      else params.delete('view');
      return params;
    }, { replace: true });
    localStorage.setItem('users-view-mode', viewMode);
  }, [viewMode, setSearchParams]);

  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    const urlPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    if (urlQ !== searchQuery) setSearchQuery(urlQ);
    if (urlPage !== page) setPage(urlPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // List sort (URL + API; order applies to full result set before pagination)
  const sortBy = (
    USER_SORT_COLUMNS.includes(searchParams.get('sort') as UserSortColumn)
      ? searchParams.get('sort')
      : 'user'
  ) as UserSortColumn;
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const setListSort = (column: UserSortColumn, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });

  const canInviteUser = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:write') || perms.includes('users:write');
  }, [me]);

  const pageLimit = useMemo(() => {
    if (viewMode === 'cards' && canInviteUser) {
      return USERS_PAGE_LIMIT - 1;
    }
    return USERS_PAGE_LIMIT;
  }, [viewMode, canInviteUser]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    params.set('page', String(page));
    params.set('limit', String(pageLimit));
    params.set('sort', sortBy);
    params.set('dir', sortDir);
    return params.toString();
  }, [page, pageLimit, searchQuery, sortBy, sortDir]);

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ['users', queryParams],
    queryFn: () => api<UsersResponse>('GET', `/users?${queryParams}`),
  });

  const [showInviteModal, setShowInviteModal] = useState(false);

  const isSystemAdmin = useMemo(() => {
    if (!me) return false;
    return (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  }, [me]);

  const canViewUserDetails = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:general') ||
           perms.includes('hr:users:view:timesheet') ||
           perms.includes('hr:users:view:permissions') ||
           perms.includes('hr:users:view:activity') ||
           perms.includes('users:read');
  }, [me]);

  const users = data?.items || [];
  const totalPages = data?.total_pages || 0;
  const total = data?.total || 0;

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (value) params.set('q', value);
    else params.delete('q');
    params.set('page', '1');
    params.set('sort', sortBy);
    params.set('dir', sortDir);
    setSearchParams(params, { replace: true });
  };

  const setListPage = (nextPage: number) => {
    setPage(nextPage);
    const params = new URLSearchParams(searchParams);
    params.set('page', String(nextPage));
    setSearchParams(params, { replace: true });
  };

  const handleSyncBambooHR = async () => {
    if (
      !confirm(
        'Run full BambooHR sync? This updates every matched user (profile fields, photos, visas, emergency contacts) and may take several minutes.'
      )
    ) {
      return;
    }
    setIsSyncing(true);
    try {
      const res = await api<{ message?: string }>('POST', '/users/sync-bamboohr-all', {
        mode: 'full',
        update_existing: true,
        include_photos: true,
        force_update_photos: false,
      });
      toast.success(res?.message || 'Full sync completed. Check server logs for details.');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] });
      }, 2000);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync from BambooHR');
    } finally {
      setIsSyncing(false);
    }
  };

  const openBambooModal = (kind: 'photos' | 'documents') => {
    setBambooForceReplace(false);
    setBambooSyncModal(kind);
  };

  const confirmBambooSync = async () => {
    const kind = bambooSyncModal;
    if (!kind) return;
    const force = bambooForceReplace;
    setBambooSyncModal(null);
    setIsSyncing(true);
    try {
      const body =
        kind === 'photos'
          ? { mode: 'photos' as const, force_update_photos: force }
          : { mode: 'documents' as const, force_update_documents: force };
      const res = await api<{ message?: string }>('POST', '/users/sync-bamboohr-all', body);
      toast.success(
        res?.message ||
          (kind === 'photos'
            ? 'Photo sync completed. Check server logs for details.'
            : 'Document sync completed. Check server logs for details.')
      );
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] });
      }, 2000);
    } catch (error: any) {
      toast.error(
        error?.message ||
          (kind === 'photos' ? 'Failed to sync photos from BambooHR' : 'Failed to sync documents from BambooHR')
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportNewOnly = async () => {
    if (!confirm('Import only users that do not exist in MKHub yet? Existing users will not be changed.')) {
      return;
    }
    setIsSyncing(true);
    try {
      const res = await api<{ message?: string }>('POST', '/users/sync-bamboohr-all', {
        mode: 'full',
        update_existing: false,
        include_photos: true,
        force_update_photos: false,
      });
      toast.success(res?.message || 'Import completed. Check server logs for details.');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] });
      }, 2000);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to import from BambooHR');
    } finally {
      setIsSyncing(false);
    }
  };



  const subtitle = `Manage employees, roles, and access${total > 0 ? ` (${total} total)` : ''}`;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Users"
        subtitle={subtitle}
        icon={<UsersIcon className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className={uiCx('flex shrink-0 items-stretch overflow-hidden', uiRadius.control, uiBorders.subtle)}>
            <AppButton
              type="button"
              variant={viewMode === 'list' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !px-2.5"
              onClick={() => setViewMode('list')}
              title="List view"
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </AppButton>
            <AppButton
              type="button"
              variant={viewMode === 'cards' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !border-l-0 !px-2.5"
              onClick={() => setViewMode('cards')}
              title="Card view"
              aria-label="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </AppButton>
          </div>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by name, username, or email..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search users"
            />
          </div>
        </div>
      </AppCard>

      <AppCard
        className={uiShadows.card}
        bodyClassName={viewMode === 'list' && !isLoading && users.length > 0 ? '!p-0' : uiSpacing.cardPadding}
        footer={
          totalPages > 1 ? (
            <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
              <p className={uiTypography.helper}>
                Showing {((page - 1) * pageLimit) + 1} to {Math.min(page * pageLimit, total)} of {total} users
              </p>
              <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setListPage(Math.max(1, page - 1))}
                >
                  Previous
                </AppButton>
                <span className={uiTypography.helper}>
                  Page {page} of {totalPages}
                </span>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setListPage(Math.min(totalPages, page + 1))}
                >
                  Next
                </AppButton>
              </div>
            </div>
          ) : undefined
        }
      >
        {isLoading ? (
          viewMode === 'list' ? (
            <div className="animate-pulse divide-y divide-gray-100">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className={uiCx('h-10 w-10 rounded-full bg-gray-100')} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 rounded bg-gray-100" />
                    <div className="h-2 w-1/2 rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className={uiCx('h-20 animate-pulse bg-gray-100', uiRadius.card)} />
              ))}
            </div>
          )
        ) : users.length === 0 ? (
          <div className={uiSpacing.sectionStack}>
            {canInviteUser ? (
              <AppListCreateItem
                label="Invite User"
                layout="row"
                className="w-full"
                onClick={() => setShowInviteModal(true)}
              />
            ) : null}
            <AppEmptyState
              title={searchQuery ? 'No users found matching your search.' : 'No users found.'}
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : viewMode === 'list' ? (
          <div className="flex flex-col">
            {canInviteUser ? (
              <div className={uiSpacing.cardPadding}>
                <AppListCreateItem
                  label="Invite User"
                  layout="row"
                  className="w-full"
                  onClick={() => setShowInviteModal(true)}
                />
              </div>
            ) : null}
            <AppSortableEntityList layout="flat">
              <AppSortableEntityListHeader
                variant="flat"
                gridCols={USER_LIST_GRID_COLS}
                minWidth={USER_LIST_MIN_WIDTH}
              >
                <AppSortableEntityListSortColumn
                  label="User"
                  column="user"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setListSort}
                  title="Sort by user name"
                />
                <AppSortableEntityListSortColumn
                  label="Job title"
                  column="job_title"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setListSort}
                  title="Sort by job title"
                />
                <AppSortableEntityListSortColumn
                  label="Email"
                  column="email"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setListSort}
                  title="Sort by email"
                />
                <AppSortableEntityListSortColumn
                  label="Status"
                  column="status"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setListSort}
                  title="Sort by status"
                />
              </AppSortableEntityListHeader>
              <AppSortableEntityListFlatBody gridCols={USER_LIST_GRID_COLS} minWidth={USER_LIST_MIN_WIDTH}>
                {users.map((u) => (
                  <UserListRow key={u.id} user={u} canViewUserDetails={canViewUserDetails} />
                ))}
              </AppSortableEntityListFlatBody>
            </AppSortableEntityList>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
            {canInviteUser ? (
              <AppListCreateItem
                label="Invite User"
                layout="card"
                className={uiCx(userGridCardClass, '!min-h-0 flex-col')}
                onClick={() => setShowInviteModal(true)}
              />
            ) : null}
            {users.map((u) => (
              <UserCard key={u.id} user={u} canViewUserDetails={canViewUserDetails} />
            ))}
          </div>
        )}
      </AppCard>

      {isSystemAdmin && (
        <AppCard className={uiCx(uiBorders.subtle, 'border-red-200 bg-red-50')}>
          <AppSectionHeader
            title="Danger Zone"
            description="BambooHR sync operations — system administrators only. These actions can update or overwrite user data across MKHub."
          />
          <div className={uiCx(uiLayout.actionsRow, 'mt-3 flex-wrap')}>
            <AppTooltip content="Import only users that do not exist in MKHub yet">
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-100"
                onClick={handleImportNewOnly}
                disabled={isSyncing}
                loading={isSyncing}
              >
                Import new only
              </AppButton>
            </AppTooltip>
            <AppTooltip content="Profile photos only — walks the BambooHR directory; does not update profile fields or import file cabinet documents">
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => openBambooModal('photos')}
                disabled={isSyncing}
              >
                Sync photos
              </AppButton>
            </AppTooltip>
            <AppTooltip content="BambooHR file cabinet documents only — no profile photo or field updates">
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => openBambooModal('documents')}
                disabled={isSyncing}
              >
                Sync documents
              </AppButton>
            </AppTooltip>
            <AppTooltip content="Full employee sync: profile fields, photos, visas, and emergency contacts">
              <AppButton
                type="button"
                variant="danger"
                size="sm"
                onClick={handleSyncBambooHR}
                disabled={isSyncing}
                loading={isSyncing}
              >
                Sync BambooHR
              </AppButton>
            </AppTooltip>
          </div>
        </AppCard>
      )}

      <InviteUserModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />

      <AppModal
        open={!!bambooSyncModal}
        onClose={() => setBambooSyncModal(null)}
        size="sm"
        title={bambooSyncModal === 'photos' ? 'Sync photos from BambooHR' : 'Sync documents from BambooHR'}
        description={
          bambooSyncModal === 'photos'
            ? 'Runs through every employee in the BambooHR directory and updates MKHub profile photos where a user is matched. This can take several minutes.'
            : 'Imports file cabinet documents from BambooHR for each matched user. New files are added; existing imports are skipped unless you choose to replace them below.'
        }
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setBambooSyncModal(null)}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={isSyncing}
              loading={isSyncing}
              onClick={() => void confirmBambooSync()}
            >
              Start sync
            </AppButton>
          </div>
        }
      >
        <AppCheckbox
          checked={bambooForceReplace}
          onChange={setBambooForceReplace}
          label={
            bambooSyncModal === 'photos' ? (
              <>
                <span className="font-medium">Replace existing profile photos</span>
                <span className={uiCx(uiTypography.helper, 'mt-0.5 block')}>
                  When unchecked, users who already have a photo are skipped. When checked, photos are re-downloaded from BambooHR and overwritten.
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">Replace documents already imported</span>
                <span className={uiCx(uiTypography.helper, 'mt-0.5 block')}>
                  When unchecked, each Bamboo file ID is imported at most once. When checked, existing imports are removed and re-downloaded from BambooHR.
                </span>
              </>
            )
          }
        />
      </AppModal>
    </div>
  );
}

function UserListRow({
  user: u,
  canViewUserDetails,
}: {
  user: User;
  canViewUserDetails: boolean;
}) {
  const navigate = useNavigate();
  const isAdmin = (u.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  const detailPath = `/users/${encodeURIComponent(u.id)}`;

  const openDetail = () => {
    if (canViewUserDetails) navigate(detailPath);
  };

  return (
    <AppSortableEntityListRow
      as="div"
      variant="flat"
      gridCols={USER_LIST_GRID_COLS}
      minWidth={USER_LIST_MIN_WIDTH}
      role={canViewUserDetails ? 'button' : undefined}
      tabIndex={canViewUserDetails ? 0 : undefined}
      onClick={canViewUserDetails ? openDetail : undefined}
      onKeyDown={
        canViewUserDetails
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openDetail();
              }
            }
          : undefined
      }
      className={uiCx(
        '!overflow-visible',
        canViewUserDetails ? undefined : 'cursor-default hover:bg-transparent',
      )}
    >
      <div className="flex min-w-0 items-center gap-3 overflow-hidden">
        <div className="relative shrink-0">
          {u.profile_photo_file_id ? (
            <img
              src={withFileAccessToken(`/files/${u.profile_photo_file_id}/thumbnail?w=80`)}
              className={uiCx('h-10 w-10 shrink-0 object-cover', uiRadius.badge, uiBorders.subtle)}
              loading="lazy"
              alt=""
            />
          ) : (
            <img
              src="/ui/assets/placeholders/user.png"
              className={uiCx('h-10 w-10 shrink-0 object-cover', uiRadius.badge, uiBorders.subtle)}
              loading="lazy"
              alt=""
            />
          )}
          {isAdmin && (
            <AppTooltip content="Administrator">
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-yellow-400">
                <Star className="h-2.5 w-2.5 fill-yellow-800 text-yellow-800" />
              </span>
            </AppTooltip>
          )}
        </div>
        <div className="min-w-0">
          <div className={uiCx(uiTypography.sectionTitle, 'truncate text-xs')}>{u.name || u.username}</div>
          <div className={uiCx(uiTypography.helper, 'truncate sm:hidden')}>{u.email || '—'}</div>
        </div>
      </div>
      <div className="flex min-w-0 items-center overflow-hidden">
        <span className={uiCx(uiTypography.body, 'truncate text-xs')}>{u.job_title || '—'}</span>
      </div>
      <div className="flex min-w-0 items-center overflow-hidden">
        <span className={uiCx(uiTypography.helper, 'truncate text-xs')}>{u.email || '—'}</span>
      </div>
      <div className="flex min-w-0 items-center">
        <UserStatusBadge isActive={u.is_active} />
      </div>
    </AppSortableEntityListRow>
  );
}

function UserCard({
  user: u,
  canViewUserDetails,
}: {
  user: User;
  canViewUserDetails: boolean;
}) {
  const isAdmin = (u.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  const cardContent = (
    <div className="flex h-full w-full min-h-0 flex-col items-center justify-center gap-2 text-center">
      <div className="relative shrink-0">
        {u.profile_photo_file_id ? (
          <img
            src={withFileAccessToken(`/files/${u.profile_photo_file_id}/thumbnail?w=120`)}
            className={uiCx('h-16 w-16 object-cover', uiRadius.badge, 'border-2 border-gray-200')}
            loading="lazy"
            alt=""
          />
        ) : (
          <img
            src="/ui/assets/placeholders/user.png"
            className={uiCx('h-16 w-16 object-cover', uiRadius.badge, 'border-2 border-gray-200')}
            loading="lazy"
            alt=""
          />
        )}
        {isAdmin && (
          <AppTooltip content="Administrator">
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-yellow-400">
              <Star className="h-3 w-3 fill-yellow-800 text-yellow-800" />
            </span>
          </AppTooltip>
        )}
      </div>
      <div className="w-full min-w-0">
        <div className={uiCx(uiTypography.sectionTitle, 'flex items-center justify-center gap-1 truncate text-xs')}>
          {u.name || u.username}
        </div>
        {u.job_title ? (
          <div className={uiCx(uiTypography.helper, 'mt-0.5 truncate text-[10px]')}>{u.job_title}</div>
        ) : null}
        <div className={uiCx(uiTypography.helper, 'mt-0.5 truncate text-[10px]')}>{u.email || ''}</div>
        {u.is_active === false ? (
          <div className="mt-1">
            <UserStatusBadge isActive={false} />
          </div>
        ) : null}
      </div>
    </div>
  );

  const cardClassName = uiCx(
    userGridCardClass,
    uiBorders.subtle,
    uiColors.surface,
    'relative overflow-hidden transition-all hover:border-gray-300',
    canViewUserDetails ? 'hover:shadow-lg' : 'opacity-75',
  );

  if (canViewUserDetails) {
    return (
      <Link to={`/users/${encodeURIComponent(u.id)}`} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return <div className={cardClassName}>{cardContent}</div>;
}
