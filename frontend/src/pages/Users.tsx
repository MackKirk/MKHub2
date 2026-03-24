import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link, useSearchParams } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import InviteUserModal from '@/components/InviteUserModal';
import toast from 'react-hot-toast';

type User = { id:string, username:string, email?:string, name?:string, roles?:string[], is_active?:boolean, profile_photo_file_id?:string, job_title?:string, phone?:string, mobile_phone?:string };
type UsersResponse = { items: User[], total: number, page: number, limit: number, total_pages: number };

export default function Users(){
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 24; // 4 columns * 6 rows = 24 items per page
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'list' || urlView === 'cards') return urlView;
    const saved = localStorage.getItem('users-view-mode');
    return saved === 'list' || saved === 'cards' ? saved : 'cards';
  });

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (viewMode === 'list') {
      params.set('view', 'list');
    } else {
      params.delete('view');
    }
    setSearchParams(params, { replace: true });
    localStorage.setItem('users-view-mode', viewMode);
  }, [viewMode, searchParams, setSearchParams]);
  
  // Build query params
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    return params.toString();
  }, [page, limit, searchQuery]);
  
  const { data, isLoading } = useQuery<UsersResponse>({ 
    queryKey:['users', page, searchQuery], 
    queryFn: ()=>api<UsersResponse>('GET',`/users?${queryParams}`)
  });
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  
  // System admin only (role admin) - for BambooHR sync buttons
  const isSystemAdmin = useMemo(() => {
    if (!me) return false;
    return (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  }, [me]);

  // Check if user has Administrator Access (users:write permission)
  const hasAdministratorAccess = useMemo(() => {
    if (!me) return false;
    if (isSystemAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('users:write');
  }, [me, isSystemAdmin]);
  
  // Check if user has permission to invite users
  const canInviteUser = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:write') || perms.includes('users:write'); // Legacy permission
  }, [me]);
  
  // Check if user has any view permissions to open user details
  const canViewUserDetails = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('hr:users:view:general') || 
           perms.includes('hr:users:view:timesheet') || 
           perms.includes('hr:users:view:permissions') ||
           perms.includes('users:read'); // Legacy permission
  }, [me]);
  
  const users = data?.items || [];
  const totalPages = data?.total_pages || 0;
  const total = data?.total || 0;
  
  // Reset to page 1 when search changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  // Sync all from BambooHR (updates everyone)
  const handleSyncBambooHR = async () => {
    if (!confirm('Sync all contacts from BambooHR? This may take a few minutes.')) {
      return;
    }
    setIsSyncing(true);
    try {
      await api('POST', '/users/sync-bamboohr-all', {
        update_existing: true,
        include_photos: true,
        force_update_photos: false
      });
      toast.success('Sync started. Check server logs for details.');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] });
      }, 2000);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync from BambooHR');
    } finally {
      setIsSyncing(false);
    }
  };

  // Import only new users from BambooHR (does not update existing)
  const handleImportNewOnly = async () => {
    if (!confirm('Import only users that do not exist in MKHub yet? Existing users will not be changed.')) {
      return;
    }
    setIsSyncing(true);
    try {
      await api('POST', '/users/sync-bamboohr-all', {
        update_existing: false,
        include_photos: true,
        force_update_photos: false
      });
      toast.success('Import started. Check server logs for details.');
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] });
      }, 2000);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to import from BambooHR');
    } finally {
      setIsSyncing(false);
    }
  };
  
  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <h5 className="text-sm font-semibold text-purple-900">Users</h5>
              <p className="text-xs text-gray-600 mt-0.5">Manage employees, roles, and access{total > 0 && ` (${total} total)`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* BambooHR sync buttons - system admin only */}
            {isSystemAdmin && (
              <>
                <button
                  onClick={handleImportNewOnly}
                  disabled={isSyncing}
                  className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Import only users that do not exist in MKHub yet"
                >
                  {isSyncing ? 'Importing...' : 'Import new only'}
                </button>
                <button
                  onClick={handleSyncBambooHR}
                  disabled={isSyncing}
                  className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Sync all contacts from BambooHR (updates everyone)"
                >
                  {isSyncing ? 'Syncing...' : 'Sync BambooHR'}
                </button>
              </>
            )}
            {canInviteUser && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-brand-red text-white font-medium transition-colors hover:bg-[#aa1212]"
              >
                <span className="text-sm leading-none">+</span>
                Invite User
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Search + view toggle */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2.5 text-sm font-medium transition-colors duration-150 ${
                viewMode === 'list'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 bg-white'
              }`}
              title="List view"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-2.5 text-sm font-medium transition-colors duration-150 border-l border-gray-200 ${
                viewMode === 'cards'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 bg-white'
              }`}
              title="Card view"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
            </button>
          </div>
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by name, username, or email..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full max-w-md rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
          </div>
        </div>
      </div>
      
      {/* Users: cards or list */}
      {isLoading ? (
        viewMode === 'list' ? (
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="animate-pulse divide-y divide-gray-100">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-100 rounded w-1/3" />
                    <div className="h-2 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </div>
        )
      ) : users.length === 0 ? (
        <div className="rounded-xl border bg-white p-6">
          <div className="text-center text-xs text-gray-500">
            {searchQuery ? 'No users found matching your search.' : 'No users found.'}
          </div>
        </div>
      ) : (
        <>
          {viewMode === 'list' ? (
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4 hidden sm:table-cell">Job title</th>
                    <th className="py-3 px-4 hidden md:table-cell">Email</th>
                    <th className="py-3 px-4 w-32">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((u) => {
                    const isAdmin = (u.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
                    const avatar = u.profile_photo_file_id ? (
                      <img
                        src={`/files/${u.profile_photo_file_id}/thumbnail?w=80`}
                        className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                        loading="lazy"
                        alt=""
                      />
                    ) : (
                      <img
                        src="/ui/assets/placeholders/user.png"
                        className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0"
                        loading="lazy"
                        alt=""
                      />
                    );
                    const nameBlock = (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          {avatar}
                          {isAdmin && (
                            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center border border-white">
                              <svg className="w-2.5 h-2.5 text-yellow-800 fill-yellow-800" viewBox="0 0 24 24">
                                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{u.name || u.username}</div>
                          <div className="text-xs text-gray-500 truncate md:hidden">{u.email || '—'}</div>
                        </div>
                      </div>
                    );
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-4 align-middle">
                          {canViewUserDetails ? (
                            <Link to={`/users/${encodeURIComponent(u.id)}`} className="block min-w-0 hover:opacity-90">
                              {nameBlock}
                            </Link>
                          ) : (
                            nameBlock
                          )}
                        </td>
                        <td className="py-3 px-4 align-middle text-gray-600 hidden sm:table-cell">
                          {u.job_title || '—'}
                        </td>
                        <td className="py-3 px-4 align-middle text-gray-600 hidden md:table-cell truncate max-w-[220px]">
                          {u.email || '—'}
                        </td>
                        <td className="py-3 px-4 align-middle">
                          {!u.is_active ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
                              Inactive
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-800">
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          ) : (
          <div className="grid md:grid-cols-4 gap-3">
            {users.map((u) => {
              const isAdmin = (u.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
              const cardContent = (
                <div className="flex flex-col items-center text-center gap-2 w-full">
                  <div className="relative">
                    {u.profile_photo_file_id ? (
                      <img
                        src={`/files/${u.profile_photo_file_id}/thumbnail?w=120`}
                        className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                        loading="lazy"
                        alt=""
                      />
                    ) : (
                      <img
                        src="/ui/assets/placeholders/user.png"
                        className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                        loading="lazy"
                        alt=""
                      />
                    )}
                    {isAdmin && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center border-2 border-white">
                        <svg className="w-3 h-3 text-yellow-800 fill-yellow-800" viewBox="0 0 24 24">
                          <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="w-full min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate flex items-center justify-center gap-1">
                      {u.name || u.username}
                    </div>
                    {u.job_title && <div className="text-[10px] text-gray-500 truncate mt-0.5">{u.job_title}</div>}
                    <div className="text-[10px] text-gray-600 truncate mt-0.5">{u.email || ''}</div>
                    {!u.is_active && (
                      <div className="mt-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800">
                          Inactive
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );

              if (canViewUserDetails) {
                return (
                  <Link
                    key={u.id}
                    to={`/users/${encodeURIComponent(u.id)}`}
                    className="rounded-xl border bg-white p-4 hover:shadow-lg hover:border-gray-300 transition-all relative"
                  >
                    {cardContent}
                  </Link>
                );
              }
              return (
                <div key={u.id} className="rounded-xl border bg-white p-4 relative opacity-75">
                  {cardContent}
                </div>
              );
            })}
          </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-xs text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      
      <InviteUserModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />
    </div>
  );
}


