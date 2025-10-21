import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useState } from 'react';

export default function UserDetail(){
  const { id } = useParams();
  const { data:user, refetch } = useQuery({ queryKey:['user', id], queryFn: ()=> api<any>('GET', `/users/${id}`) });
  const { data:roles } = useQuery({ queryKey:['rolesAll'], queryFn: ()=> api<any[]>('GET', '/users/roles/all') });
  const [sel, setSel] = useState<string>('');
  if(!user) return <div className="h-24 bg-gray-100 animate-pulse rounded"/>;
  const save = async()=>{
    try{ await api('PATCH', `/users/${id}`, { roles: user.roles, is_active: user.is_active }); toast.success('Saved'); refetch(); }catch(_e){ toast.error('Failed'); }
  };
  return (
    <div className="max-w-3xl">
      <div className="mb-3 flex items-center gap-3"><img src={user.profile_photo_file_id? `/files/${user.profile_photo_file_id}/thumbnail?w=160`:'/ui/assets/login/logo-light.svg'} className="w-16 h-16 rounded-full object-cover"/><h1 className="text-2xl font-bold">{user.name||user.username}</h1></div>
      <div className="rounded-xl border bg-white p-4">
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <div><div className="text-gray-600">Username</div><div className="font-medium">{user.username}</div></div>
          <div><div className="text-gray-600">Email</div><div className="font-medium">{user.email||''}</div></div>
          <div className="md:col-span-2"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!user.is_active} onChange={e=>{ user.is_active = e.target.checked; }} /> Active</label></div>
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
    </div>
  );
}


