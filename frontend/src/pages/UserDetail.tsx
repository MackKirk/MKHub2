import { useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function UserDetail(){
  const { id } = useParams();
  const { data:user, refetch } = useQuery({ queryKey:['user', id], queryFn: ()=> api<any>('GET', `/users/${id}`) });
  const { data:roles } = useQuery({ queryKey:['rolesAll'], queryFn: ()=> api<any[]>('GET', '/users/roles/all') });
  const [sel, setSel] = useState<string>('');
  const [tab, setTab] = useState<'general'|'timesheet'>('general');
  if(!user) return <div className="h-24 bg-gray-100 animate-pulse rounded"/>;
  const save = async()=>{
    try{ await api('PATCH', `/users/${id}`, { roles: user.roles, is_active: user.is_active }); toast.success('Saved'); refetch(); }catch(_e){ toast.error('Failed'); }
  };
  return (
    <div className="max-w-5xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3"><img src={user.profile_photo_file_id? `/files/${user.profile_photo_file_id}/thumbnail?w=160`:'/ui/assets/login/logo-light.svg'} className="w-16 h-16 rounded-full object-cover"/><h1 className="text-2xl font-bold">{user.name||user.username}</h1></div>
        <div className="flex gap-2">
          {(['general','timesheet'] as const).map(k=> (<button key={k} onClick={()=>setTab(k)} className={`px-3 py-1.5 rounded-full text-sm ${tab===k?'bg-black text-white':'bg-white border'}`}>{k[0].toUpperCase()+k.slice(1)}</button>))}
        </div>
      </div>

      {tab==='general' && (
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
      )}

      {tab==='timesheet' && (
        <UserTimesheet userId={String(id)} />
      )}
    </div>
  );
}

function UserTimesheet({ userId }:{ userId:string }){
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0,7));
  const [projectId, setProjectId] = useState<string>('');
  const [workDate, setWorkDate] = useState<string>(new Date().toISOString().slice(0,10));
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
            <div className="w-24 text-gray-700">{(e.start_time||'--:--')} - {(e.end_time||'--:--')}</div>
            <div className="w-16 font-medium">{(e.minutes/60).toFixed(2)}h</div>
            <div className="text-gray-600">{e.notes||''}</div>
          </div>
        )) : <div className="text-sm text-gray-600">No entries</div>}
      </div>
    </div>
  );
}


