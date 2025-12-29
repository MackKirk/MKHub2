import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import InviteUserModal from '@/components/InviteUserModal';
import toast from 'react-hot-toast';

type User = { id:string, username:string, email?:string, name?:string, roles?:string[], is_active?:boolean, profile_photo_file_id?:string, job_title?:string, phone?:string, mobile_phone?:string };
type UsersResponse = { items: User[], total: number, page: number, limit: number, total_pages: number };

export default function Users(){
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 48; // 4 columns * 12 rows = 48 items per page
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  
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
  
  // Check if user has Administrator Access (users:write permission)
  const hasAdministratorAccess = useMemo(() => {
    if (!me) return false;
    const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const perms = me?.permissions || [];
    return perms.includes('users:write');
  }, [me]);
  
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

  // TEMPORARY: Sync all from BambooHR
  const handleSyncBambooHR = async () => {
    if (!confirm('Tem certeza que deseja sincronizar todos os contatos do BambooHR? Isso pode levar alguns minutos.')) {
      return;
    }
    
    setIsSyncing(true);
    try {
      await api('POST', '/users/sync-bamboohr-all', {
        update_existing: true,
        include_photos: true,
        force_update_photos: false
      });
      toast.success('Sincronização iniciada! Verifique os logs do servidor para detalhes.');
      // Refresh users list after a delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['users'] });
      }, 2000);
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao sincronizar contatos do BambooHR');
    } finally {
      setIsSyncing(false);
    }
  };
  
  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Users</div>
          <div className="text-sm opacity-90">Manage employees, roles, and access. {total > 0 && `(${total} total)`}</div>
        </div>
        <div className="flex items-center gap-2">
          {/* TEMPORARY: Sync from BambooHR button - only for Administrator Access */}
          {hasAdministratorAccess && (
            <button
              onClick={handleSyncBambooHR}
              disabled={isSyncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sincronizar todos os contatos do BambooHR (temporário)"
            >
              {isSyncing ? 'Sincronizando...' : '🔄 Sync BambooHR'}
            </button>
          )}
          {canInviteUser && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-white text-[#d11616] rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              + Invite User
            </button>
          )}
        </div>
      </div>
      
      {/* Search Bar */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name, username, or email..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full max-w-md px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7f1010]"
        />
      </div>
      
      {/* Users Grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {searchQuery ? 'No users found matching your search.' : 'No users found.'}
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-4 gap-4">
            {users.map(u=> {
              const isAdmin = (u.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
              const cardContent = (
                <>
                  {u.profile_photo_file_id? (
                    <img src={`/files/${u.profile_photo_file_id}/thumbnail?w=96`} className="w-12 h-12 rounded-full object-cover flex-shrink-0"/>
                  ) : (
                    <img src="/ui/assets/placeholders/user.png" className="w-12 h-12 rounded-full object-cover flex-shrink-0"/>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate flex items-center gap-1">
                      {u.name||u.username}
                      {isAdmin && (
                        <svg className="w-4 h-4 text-yellow-500 fill-yellow-500" viewBox="0 0 24 24">
                          <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 truncate">{u.email||''}</div>
                    {u.job_title && (
                      <div className="text-[11px] text-gray-700 truncate">{u.job_title}</div>
                    )}
                    {(u.phone || u.mobile_phone) && (
                      <div className="text-[11px] text-gray-500 truncate">
                        {[u.phone, u.mobile_phone].filter(Boolean).join(' / ')}
                      </div>
                    )}
                  </div>
                </>
              );
              
              if (canViewUserDetails) {
                return (
                  <Link key={u.id} to={`/users/${encodeURIComponent(u.id)}`} className="rounded-xl border bg-white p-4 flex items-center gap-3 hover:shadow-md transition-shadow relative">
                    {cardContent}
                  </Link>
                );
              } else {
                return (
                  <div key={u.id} className="rounded-xl border bg-white p-4 flex items-center gap-3 relative opacity-75">
                    {cardContent}
                  </div>
                );
              }
            })}
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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


