import { useParams } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal, getCurrentMonthLocal } from '@/lib/dateUtils';

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
  const { data:user, refetch } = useQuery({ queryKey:['user', id], queryFn: ()=> api<any>('GET', `/users/${id}`) });
  const { data:roles } = useQuery({ queryKey:['rolesAll'], queryFn: ()=> api<any[]>('GET', '/users/roles/all') });
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const [sel, setSel] = useState<string>('');
  const [tab, setTab] = useState<'general'|'timesheet'|'permissions'>('general');
  
  // Check if user can edit permissions (admin or has users:write permission)
  const canEditPermissions = !!(
    (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') || 
    (me?.permissions || []).includes('users:write')
  );
  
  if(!user) return <div className="h-24 bg-gray-100 animate-pulse rounded"/>;
  const save = async()=>{
    try{ await api('PATCH', `/users/${id}`, { roles: user.roles, is_active: user.is_active }); toast.success('Saved'); refetch(); }catch(_e){ toast.error('Failed'); }
  };
  return (
    <div className="max-w-5xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><img src={user.profile_photo_file_id? `/files/${user.profile_photo_file_id}/thumbnail?w=160`:'/ui/assets/login/logo-light.svg'} className="w-16 h-16 rounded-full object-cover"/><h1 className="text-2xl font-bold">{user.name||user.username}</h1></div>
        <div className="flex gap-2">
          {(['general','timesheet', ...(canEditPermissions ? ['permissions'] : [])] as const).map(k=> (<button key={k} onClick={()=>setTab(k)} className={`px-3 py-1.5 rounded-full text-sm ${tab===k?'bg-black text-white':'bg-white border'}`}>{k[0].toUpperCase()+k.slice(1)}</button>))}
        </div>
      </div>

      {tab==='general' && (
        <div className="rounded-xl border bg-white p-4">
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <div><div className="text-gray-600">Username</div><div className="font-medium">{user.username}</div></div>
            <div><div className="text-gray-600">Email</div><div className="font-medium">{user.email||''}</div></div>
            <div className="md:col-span-2"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!user.is_active} onChange={e=>{ user.is_active = e.target.checked; }} /> Active</label></div>
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
                <select className="border rounded px-2 py-1 text-sm" value={sel} onChange={e=>setSel(e.target.value)}><option value="">Add role...</option>{(roles||[]).map((r:any)=> <option key={r.id} value={r.name}>{r.name}</option>)}</select>
                <button onClick={()=>{ if(!sel) return; if(!(user.roles||[]).includes(sel)){ user.roles = [...(user.roles||[]), sel]; } setSel(''); }} className="px-2 py-1 rounded bg-gray-100">Add</button>
              </div>
            </div>
          </div>
          <div className="mt-3 text-right"><button onClick={save} className="px-4 py-2 rounded bg-brand-red text-white">Save</button></div>
        </div>
      )}

      {tab==='timesheet' && (
        <UserTimesheet userId={String(id)} />
      )}

      {tab==='permissions' && canEditPermissions && (
        <UserPermissions userId={String(id)} user={user} />
      )}
    </div>
  );
}

// List of implemented permissions (permissions that are actually checked in the codebase)
const IMPLEMENTED_PERMISSIONS = new Set([
  // Legacy permissions
  "users:read", "users:write",
  "timesheet:read", "timesheet:write", "timesheet:approve", // Legacy, mantido para compatibilidade
  "clients:read", "clients:write",
  "inventory:read", "inventory:write",
  "reviews:read", "reviews:admin",
  // Human Resources permissions
  "hr:access",
  "hr:users:read", "hr:users:write",
  "hr:attendance:read", "hr:attendance:write",
  "hr:community:read", "hr:community:write",
  "hr:reviews:admin",
  "hr:timesheet:read", "hr:timesheet:write", "hr:timesheet:approve", "hr:timesheet:unrestricted_clock",
  // Settings permissions
  "settings:access",
  // Documents permissions
  "documents:access",
  "documents:read", "documents:write", "documents:delete", "documents:move",
  // Fleet & Equipment permissions
  "fleet:access",
]);

function UserPermissions({ userId, user: userProp }:{ userId:string, user?: any }){
  const { data:userFromQuery, refetch: refetchUser } = useQuery({ queryKey:['user', userId], queryFn: ()=> api<any>('GET', `/users/${userId}`) });
  const user = userProp || userFromQuery;
  const { data:permissionsData, refetch } = useQuery({ 
    queryKey:['user-permissions', userId], 
    queryFn: ()=> api<any>('GET', `/permissions/users/${userId}`) 
  });
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Initialize permissions from API data
  useEffect(() => {
    if (permissionsData?.permissions_by_category) {
      const perms: Record<string, boolean> = {};
      permissionsData.permissions_by_category.forEach((cat: any) => {
        cat.permissions.forEach((perm: any) => {
          perms[perm.key] = perm.is_granted;
        });
      });
      setPermissions(perms);
    }
  }, [permissionsData]);

  const handleToggle = (key: string) => {
    setPermissions((prev) => {
      const newPerms = { ...prev };
      const newValue = !prev[key];
      newPerms[key] = newValue;
      
      // Hierarchical logic: if blocking area access, block all sub-permissions
      // Format: area:access (e.g., hr:access)
      if (key.endsWith(':access') && !newValue) {
        const area = key.replace(':access', '');
        // Block all permissions that start with this area prefix
        Object.keys(newPerms).forEach(permKey => {
          if (permKey.startsWith(area + ':') && permKey !== key) {
            newPerms[permKey] = false;
          }
        });
      }
      
      // If enabling a sub-permission, ensure area access is enabled
      if (newValue && key.includes(':')) {
        const parts = key.split(':');
        if (parts.length >= 2) {
          const area = parts[0];
          const areaAccessKey = `${area}:access`;
          // Only auto-enable if area access permission exists
          if (permissionsData?.permissions_by_category?.some((cat: any) => 
            cat.permissions.some((p: any) => p.key === areaAccessKey)
          )) {
            newPerms[areaAccessKey] = true;
          }
        }
      }
      
      return newPerms;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save admin role if changed
      const currentUser = user || userFromQuery;
      if (currentUser) {
        const isAdmin = (currentUser.roles||[]).some((r: string) => String(r || '').toLowerCase() === 'admin');
        const shouldBeAdmin = (document.getElementById('admin-checkbox') as HTMLInputElement)?.checked || false;
        if (isAdmin !== shouldBeAdmin) {
          let newRoles = [...(currentUser.roles||[])];
          if (shouldBeAdmin) {
            if (!newRoles.some((r: string) => String(r || '').toLowerCase() === 'admin')) {
              newRoles.push('admin');
            }
          } else {
            newRoles = newRoles.filter((r: string) => String(r || '').toLowerCase() !== 'admin');
          }
          await api('PATCH', `/users/${userId}`, { roles: newRoles, is_active: currentUser.is_active });
          await refetchUser();
        }
      }
      // Save permissions
      await api('PUT', `/permissions/users/${userId}`, permissions);
      toast.success('Permissions saved');
      await refetch();
    } catch (e: any) {
      toast.error(e?.detail || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (!permissionsData) {
    return <div className="h-24 bg-gray-100 animate-pulse rounded" />;
  }

  const isAdmin = user ? (user.roles||[]).some((r: string) => String(r || '').toLowerCase() === 'admin') : false;

  return (
    <div className="rounded-xl border bg-white p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-1">User Permissions</h3>
          <p className="text-sm text-gray-600">Manage granular permissions for this user. Permissions from roles are combined with these overrides. Permissions marked with [WIP] are not yet implemented in the system.</p>
        </div>

        {/* Admin Access Section */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <label className="inline-flex items-start gap-3 cursor-pointer">
            <input 
              id="admin-checkbox"
              type="checkbox" 
              checked={isAdmin}
              disabled={!user}
              onChange={e=>{ 
                const shouldBeAdmin = e.target.checked;
                const currentUser = user || userFromQuery;
                if (currentUser) {
                  if (shouldBeAdmin) {
                    if (!(currentUser.roles||[]).some((r: string) => String(r || '').toLowerCase() === 'admin')) {
                      currentUser.roles = [...(currentUser.roles||[]), 'admin'];
                    }
                  } else {
                    currentUser.roles = (currentUser.roles||[]).filter((r: string) => String(r || '').toLowerCase() !== 'admin');
                  }
                }
              }} 
              className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex-1">
              <div className="font-semibold text-yellow-900 flex items-center gap-2">
                Administrator Access
                <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
                  System Role
                </span>
              </div>
              <div className="text-xs text-yellow-800 mt-1">
                ⚠️ <strong>Warning:</strong> This user will have access to all areas of the system and will be able to delete sensitive information. Only grant this to trusted users.
              </div>
              {isAdmin && (
                <div className="text-xs text-yellow-700 mt-2 font-medium">
                  ⚠️ When admin is enabled, all permission checks are bypassed. Individual permissions below are ignored.
                </div>
              )}
            </div>
          </label>
        </div>

      <div className="space-y-6">
        {permissionsData.permissions_by_category?.map((cat: any) => {
          // Find area access permission (first permission, ends with :access)
          const areaAccessPerm = cat.permissions.find((p: any) => p.key.endsWith(':access'));
          const subPermissions = cat.permissions.filter((p: any) => !p.key.endsWith(':access'));
          const hasAreaAccess = areaAccessPerm && permissions[areaAccessPerm.key];
          
          return (
            <div key={cat.category.id} className="border rounded-lg p-4">
              {/* Category Header with Access Checkbox */}
              <div className="mb-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasAreaAccess || false}
                    onChange={() => {
                      if (areaAccessPerm) {
                        handleToggle(areaAccessPerm.key, cat.category.id);
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold text-base">{cat.category.label}</h4>
                    {cat.category.description && (
                      <p className="text-xs text-gray-500 mt-1">{cat.category.description}</p>
                    )}
                  </div>
                </label>
              </div>
              
              {/* Sub-permissions (only shown if area access is granted) */}
              {hasAreaAccess && subPermissions.length > 0 && (
                <div className="ml-7 mt-3 space-y-2 border-l-2 border-gray-200 pl-4">
                  {subPermissions.map((perm: any) => (
                    <label
                      key={perm.id}
                      className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={permissions[perm.key] || false}
                        onChange={() => handleToggle(perm.key, cat.category.id)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {perm.label}
                          {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                            <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
                              [WIP]
                            </span>
                          )}
                        </div>
                        {perm.description && (
                          <div className="text-xs text-gray-500 mt-0.5">{perm.description}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              
              {/* Legacy: If no area access permission, show all permissions normally */}
              {!areaAccessPerm && (
                <div className="space-y-2">
                  {cat.permissions.map((perm: any) => (
                    <label
                      key={perm.id}
                      className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={permissions[perm.key] || false}
                        onChange={() => handleToggle(perm.key, cat.category.id)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {perm.label}
                          {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
                            <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
                              [WIP]
                            </span>
                          )}
                        </div>
                        {perm.description && (
                          <div className="text-xs text-gray-500 mt-0.5">{perm.description}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Permissions'}
        </button>
      </div>
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

  const { data:projects } = useQuery({ queryKey:['projects-list'], queryFn: ()=> api<any[]>('GET','/projects') });
  const qs = useMemo(()=>{ const p = new URLSearchParams(); if(month) p.set('month', month); if(userId) p.set('user_id', userId); const s=p.toString(); return s? ('?'+s): ''; }, [month, userId]);
  const { data:entries, refetch } = useQuery({ queryKey:['user-timesheet', projectId, qs], queryFn: ()=> projectId? api<any[]>('GET', `/projects/${projectId}/timesheet${qs}`) : Promise.resolve([]) });

  const submit = async()=>{
    try{
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
            {(projects||[]).map((p:any)=> <option key={p.id} value={p.id}>{p.code? `${p.code} — `:''}{p.name||'Project'}</option>)}
          </select>
        </div>
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
      </div>
      <div className="mt-4 border-t pt-3">
        {(entries||[]).length? (entries||[]).map((e:any)=> (
          <div key={e.id} className="px-2 py-1 text-sm flex items-center gap-3">
            <div className="w-20 text-gray-600">{String(e.work_date).slice(0,10)}</div>
            <div className="w-24 text-gray-700">{formatTime12h(e.start_time)} - {formatTime12h(e.end_time)}</div>
            <div className="w-16 font-medium">{(e.minutes/60).toFixed(2)}h</div>
            <div className="text-gray-600">{e.notes||''}</div>
          </div>
        )) : <div className="text-sm text-gray-600">No entries</div>}
      </div>
    </div>
  );
}


