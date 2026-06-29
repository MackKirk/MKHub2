import { useParams, useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatDateLocal, getCurrentMonthLocal } from '@/lib/dateUtils';
import UserLoans from '@/components/UserLoans';
import OverlayPortal from '@/components/OverlayPortal';
import { UserEmployeeReviewsSection } from '@/components/users/UserEmployeeReviewsTabEnhanced';
import { UserPermissionsSection } from '@/components/users/UserPermissionsTabEnhanced';

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

export default function UserDetail(){
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data:user, refetch } = useQuery({ queryKey:['user', id], queryFn: ()=> api<any>('GET', `/users/${id}`) });
  const { data:roles } = useQuery({ queryKey:['rolesAll'], queryFn: ()=> api<any[]>('GET', '/users/roles/all') });
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const [sel, setSel] = useState<string>('');
  const [tab, setTab] = useState<'general'|'timesheet'|'loans'|'permissions'|'reviews'>('general');
  const [deletingUser, setDeletingUser] = useState(false);
  const isAdministrator = !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  const isSelfProfile = !!(me && id && String(me.id) === String(id));
  
  // Check permissions for each tab
  // Note: hr:users:read alone is NOT enough - need specific view permissions
  const canViewGeneral = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('hr:users:view:general') ||
    (me?.permissions || []).includes('users:read') // Legacy
  );
  
  const canEditGeneral = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('hr:users:write') ||
    (me?.permissions || []).includes('hr:users:edit:general') ||
    (me?.permissions || []).includes('users:write')
  );
  
  const canViewTimesheet = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('hr:users:view:timesheet') ||
    (me?.permissions || []).includes('users:read') // Legacy
  );
  
  const canViewLoans = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('hr:users:view:general') ||
    (me?.permissions || []).includes('users:read') // Legacy
  );
  
  const canEditLoans = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('hr:users:write') ||
    (me?.permissions || []).includes('users:write')
  );
  
  const canViewPermissions = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('hr:users:view:permissions') ||
    (me?.permissions || []).includes('users:read') // Legacy
  );
  
  const canEditPermissions = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('hr:users:write') ||
    (me?.permissions || []).includes('hr:users:edit:permissions') ||
    (me?.permissions || []).includes('users:write')
  );

  const canViewReviews = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') ||
    (me?.permissions || []).includes('reviews:read') ||
    (me?.permissions || []).includes('reviews:admin') ||
    (me?.permissions || []).includes('hr:reviews:admin')
  );

  if(!user) return <div className="h-24 bg-gray-100 animate-pulse rounded"/>;
  
  // If user doesn't have permission to view anything, show error
  if (!canViewGeneral && !canViewTimesheet && !canViewLoans && !canViewPermissions) {
    return (
      <div className="max-w-5xl">
        <div className="rounded-xl border bg-white p-8 text-center">
          <div className="text-red-600 font-semibold mb-2">Access Denied</div>
          <div className="text-gray-600">You don't have permission to view this user's information.</div>
        </div>
      </div>
    );
  }
  const save = async()=>{
    try{ await api('PATCH', `/users/${id}`, { roles: user.roles, is_active: user.is_active }); toast.success('Saved'); refetch(); }catch(_e){ toast.error('Failed'); }
  };
  return (
    <div className="max-w-5xl">
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3"><img src={user.profile_photo_file_id? withFileAccessToken(`/files/${user.profile_photo_file_id}/thumbnail?w=160`):'/ui/assets/placeholders/user.png'} className="w-16 h-16 rounded-full object-cover"/><h1 className="text-2xl font-bold">{user.name||user.username}</h1></div>
        <div className="flex gap-2 items-center flex-wrap">
          {isAdministrator && !isSelfProfile && (
            <button
              type="button"
              disabled={deletingUser}
              onClick={async () => {
                if (!id || deletingUser) return;
                const choice = await confirm({
                  title: 'Delete user',
                  message: `Permanently delete ${user.username || String(id)}? This cannot be undone.`,
                  confirmText: 'Delete user',
                  cancelText: 'Cancel',
                });
                if (choice !== 'confirm') return;
                setDeletingUser(true);
                try {
                  await api('DELETE', `/users/${encodeURIComponent(String(id))}`);
                  toast.success('User deleted');
                  navigate('/users');
                } catch (_e: any) {
                  toast.error(_e?.message || _e?.detail || 'Failed to delete user');
                } finally {
                  setDeletingUser(false);
                }
              }}
              className="px-3 py-1.5 rounded-full text-sm border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingUser ? 'Deleting…' : 'Delete user'}
            </button>
          )}
          {([
            ...(canViewGeneral ? ['general'] : []),
            ...(canViewTimesheet ? ['timesheet'] : []),
            ...(canViewLoans ? ['loans'] : []),
            ...(canViewPermissions ? ['permissions'] : []),
            ...(canViewReviews ? ['reviews'] : []),
          ] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-full text-sm ${tab === k ? 'bg-black text-white' : 'bg-white border'}`}
            >
              {k === 'reviews' ? 'Reviews' : k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab==='general' && canViewGeneral && (
        <div className="rounded-xl border bg-white p-4">
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div><div className="text-gray-600">Username</div><div className="font-medium">{user.username}</div></div>
            <div><div className="text-gray-600">Email</div><div className="font-medium">{user.email||''}</div></div>
            {canEditGeneral && (
              <div className="md:col-span-2"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!user.is_active} onChange={e=>{ user.is_active = e.target.checked; }} /> Active</label></div>
            )}
            {!canEditGeneral && (
              <div className="md:col-span-2"><div className="text-gray-600">Status</div><div className="font-medium">{user.is_active ? 'Active' : 'Inactive'}</div></div>
            )}
            {canEditGeneral && (
              <>
                <div className="md:col-span-2">
                  <div className="mb-2 text-gray-600">Admin Access</div>
                  <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <label className="inline-flex items-start gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={(user.roles||[]).some((r: string) => String(r || '').toLowerCase() === 'admin')} 
                        onChange={e=>{ 
                          const isAdmin = e.target.checked;
                          if (isAdmin) {
                            if (!(user.roles||[]).some((r: string) => String(r || '').toLowerCase() === 'admin')) {
                              user.roles = [...(user.roles||[]), 'admin'];
                            }
                          } else {
                            user.roles = (user.roles||[]).filter((r: string) => String(r || '').toLowerCase() !== 'admin');
                          }
                        }} 
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-yellow-900">Grant Administrator Access</div>
                        <div className="text-xs text-yellow-800 mt-1">
                          ⚠️ <strong>Warning:</strong> This user will have access to all areas of the system and will be able to delete sensitive information. Only grant this to trusted users.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-2 text-gray-600">Roles</div>
                  <div className="flex flex-wrap gap-2 mb-2">{(user.roles||[]).map((r:string)=> <span key={r} className="px-2 py-1 rounded-full border text-xs">{r} <button className="ml-1" onClick={()=>{ user.roles = (user.roles||[]).filter((x:string)=>x!==r); }}>✕</button></span>)}</div>
                  <div className="flex items-center gap-2">
                    <select className="border rounded px-2 py-1 text-sm" value={sel} onChange={e=>setSel(e.target.value)}><option value="">Add role...</option>{sortByLabel(roles||[], (r:any)=> (r.name||'').toString()).map((r:any)=> <option key={r.id} value={r.name}>{r.name}</option>)}</select>
                    <button onClick={()=>{ if(!sel) return; if(!(user.roles||[]).includes(sel)){ user.roles = [...(user.roles||[]), sel]; } setSel(''); }} className="px-2 py-1 rounded bg-gray-100">Add</button>
                  </div>
                </div>
                <div className="mt-3 text-right"><button onClick={save} className="px-4 py-2 rounded bg-brand-red text-white">Save</button></div>
              </>
            )}
            {!canEditGeneral && (
              <>
                <div className="md:col-span-2">
                  <div className="mb-2 text-gray-600">Admin Access</div>
                  <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="font-medium text-yellow-900">
                      {(user.roles||[]).some((r: string) => String(r || '').toLowerCase() === 'admin') ? 'Yes' : 'No'}
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-2 text-gray-600">Roles</div>
                  <div className="flex flex-wrap gap-2">{(user.roles||[]).map((r:string)=> <span key={r} className="px-2 py-1 rounded-full border text-xs">{r}</span>)}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab==='timesheet' && canViewTimesheet && (
        <UserTimesheet userId={String(id)} />
      )}

      {tab==='loans' && canViewLoans && (
        <UserLoans userId={String(id)} canEdit={canEditLoans} />
      )}

      {tab==='permissions' && canViewPermissions && (
        <UserPermissionsSection userId={String(id)} user={user} canEdit={canEditPermissions} inlineSave />
      )}

      {tab === 'reviews' && canViewReviews && id && (
        <div className="rounded-xl border bg-white p-4">
          <UserEmployeeReviewsSection userId={String(id)} enabled={tab === 'reviews'} />
        </div>
      )}
    </div>
  );
}

function UserTimesheet({ userId }:{ userId:string }){
  const [month, setMonth] = useState<string>(getCurrentMonthLocal());
  const [projectId, setProjectId] = useState<string>('');
  const [workDate, setWorkDate] = useState<string>(formatDateLocal(new Date()));
  const [start, setStart] = useState<string>('');
  const [end, setEnd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  const perms = new Set<string>(me?.permissions || []);
  const canEditAttendance = isAdmin || perms.has('hr:attendance:write') || perms.has('hr:users:edit:timesheet') || perms.has('users:write');

  const { data:projects } = useQuery({ queryKey:['projects-list'], queryFn: ()=> api<any[]>('GET','/projects') });
  const qs = useMemo(()=>{ const p = new URLSearchParams(); if(month) p.set('month', month); if(userId) p.set('user_id', userId); const s=p.toString(); return s? ('?'+s): ''; }, [month, userId]);
  const { data:entries, refetch } = useQuery({ queryKey:['user-timesheet', projectId, qs], queryFn: ()=> projectId? api<any[]>('GET', `/projects/${projectId}/timesheet${qs}`) : Promise.resolve([]) });

  const submit = async()=>{
    try{
      if(!canEditAttendance){ toast.error('You do not have permission to edit attendance records'); return; }
      if(!projectId){ toast.error('Select a project'); return; }
      if(!workDate || !start || !end){ toast.error('Date, start and end required'); return; }
      if(!notes.trim()){ toast.error('Notes required'); return; }
      const [sh,sm] = start.split(':').map(Number); const [eh,em] = end.split(':').map(Number);
      const minutes = Math.max(0,(eh*60+em)-(sh*60+sm));
      await api('POST', `/projects/${encodeURIComponent(projectId)}/timesheet`, { work_date: workDate, start_time: start, end_time: end, minutes, notes, user_id: userId });
      toast.success('Added'); setNotes(''); setEnd(''); await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <div className="md:col-span-3 flex items-center gap-2">
          <label className="text-xs text-gray-600">Month</label>
          <input type="month" className="border rounded px-2 py-1" value={month} onChange={e=>setMonth(e.target.value)} />
          <label className="text-xs text-gray-600 ml-3">Project</label>
          <select className="border rounded px-2 py-1 flex-1" value={projectId} onChange={e=>setProjectId(e.target.value)}>
            <option value="">Select...</option>
            {sortByLabel(projects||[], (p:any)=> (p.name||p.code||p.id||'').toString()).map((p:any)=> <option key={p.id} value={p.id}>{p.code? `${p.code} — `:''}{p.name||'Project'}</option>)}
          </select>
        </div>
        {canEditAttendance && (
          <>
            <div>
              <label className="text-xs text-gray-600">Date</label>
              <input type="date" className="w-full border rounded px-3 py-2" value={workDate} onChange={e=>setWorkDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-gray-600">Start</label><input type="time" className="w-full border rounded px-3 py-2" value={start} onChange={e=>setStart(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">End</label><input type="time" className="w-full border rounded px-3 py-2" value={end} onChange={e=>setEnd(e.target.value)} /></div>
            </div>
            <div className="md:col-span-3">
              <label className="text-xs text-gray-600">Notes</label>
              <input className="w-full border rounded px-3 py-2" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Justification" />
            </div>
            <div className="md:col-span-3 text-right">
              <button onClick={submit} className="px-3 py-2 rounded bg-brand-red text-white">Add Entry</button>
            </div>
          </>
        )}
      </div>
      <div className="mt-4 border-t pt-3">
        {(entries||[]).length? (entries||[]).map((e:any)=> (
          <div key={e.id} className="px-2 py-1 text-sm flex items-center gap-3">
            <div className="w-20 text-gray-600">{String(e.work_date).slice(0,10)}</div>
            <div className="w-24 text-gray-700">{formatTime12h(e.start_time)} - {formatTime12h(e.end_time)}</div>
            <div className="w-16 font-medium">{(e.minutes/60).toFixed(2)}h</div>
            <div className="text-gray-600 flex items-center gap-1">
              <span className="truncate">{e.notes||''}</span>
              {e.shift_deleted && (
                <span
                  className="text-yellow-600"
                  title={e.shift_deleted_by ? `The shift related to this attendance was deleted by ${e.shift_deleted_by}${e.shift_deleted_at ? ` on ${new Date(e.shift_deleted_at).toLocaleDateString()}` : ''}` : 'The shift related to this attendance was deleted'}
                >
                  <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </span>
              )}
            </div>
          </div>
        )) : <div className="text-sm text-gray-600">No entries</div>}
      </div>
    </div>
  );
}


