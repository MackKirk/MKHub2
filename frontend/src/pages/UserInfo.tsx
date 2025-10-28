import { useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function UserInfo(){
  const { userId } = useParams();
  const [sp] = useSearchParams();
  const tabParam = sp.get('tab') as ('personal'|'job'|'emergency'|'docs'|'timesheet') | null;
  const [tab, setTab] = useState<typeof tabParam | 'personal'>(tabParam || 'personal');

  const { data, isLoading } = useQuery({ queryKey:['userProfile', userId], queryFn: ()=> api<any>('GET', `/auth/users/${userId}/profile`) });
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const canEdit = !!(me?.roles?.includes('admin') || (me?.permissions||[]).includes('users:write'));
  const canSelfEdit = me && userId && String(me.id) === String(userId);
  const p = data?.profile || {};

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <img className="w-10 h-10 rounded-full border-2 border-brand-red object-cover" src={p.profile_photo_file_id? `/files/${p.profile_photo_file_id}/thumbnail?w=64`:'/ui/assets/login/logo-light.svg'} />
        <h2 className="text-xl font-extrabold">User Information</h2>
      </div>
      <div className="rounded-xl border shadow-hero bg-white">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] rounded-t-xl p-5 text-white">
          <div className="flex gap-4 items-center">
            <img className="w-[120px] h-[120px] object-cover rounded-xl border-2 border-brand-red" src={p.profile_photo_file_id? `/files/${p.profile_photo_file_id}/thumbnail?w=240`:'/ui/assets/login/logo-light.svg'} />
            <div className="flex-1">
              <div className="text-3xl font-extrabold">{p.first_name||data?.user?.username} {p.last_name||''}</div>
              <div className="text-sm opacity-90 mt-1">{p.job_title||data?.user?.email||''}</div>
            </div>
            <div className="flex gap-2">
              {['personal','job','emergency','docs','timesheet'].map((k)=> (
                <button key={k} onClick={()=>setTab(k as any)} className={`px-4 py-2 rounded-full ${tab===k?'bg-black text-white':'bg-white text-black'}`}>{String(k).replace(/^./,s=>s.toUpperCase())}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-5">
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              {tab==='personal' && <EditableGrid p={p} editable={canEdit} selfEdit={!!canSelfEdit} userId={String(userId)} fields={[['Preferred name','preferred_name'],['Phone','phone'],['Mobile phone','mobile_phone'],['Gender','gender'],['Marital status','marital_status'],['Date of birth','date_of_birth'],['Nationality','nationality'],['Address line 1','address_line1'],['Address line 2','address_line2'],['City','city'],['Province/State','province'],['Postal code','postal_code'],['Country','country']]} />}
              {tab==='job' && <EditableGrid p={p} editable={canEdit} selfEdit={false} userId={String(userId)} fields={[['Hire date','hire_date'],['Termination date','termination_date'],['Job title','job_title'],['Division','division'],['Work email','work_email'],['Work phone','work_phone'],['Manager user id','manager_user_id'],['Pay rate','pay_rate'],['Pay type','pay_type'],['Employment type','employment_type']]} />}
              {tab==='emergency' && <SectionGrid p={p} keys={['sin_number','work_permit_status','visa_status','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone']} />}
              {tab==='docs' && <div className="text-sm text-gray-600">Documents section coming soon.</div>}
              {tab==='timesheet' && <TimesheetBlock userId={String(userId)} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LabelVal({label, value}:{label:string, value:any}){
  return (
    <div>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="font-medium break-words">{String(value??'')}</div>
    </div>
  );
}

function EditableGrid({p, fields, editable, selfEdit, userId}:{p:any, fields:[string,string][], editable:boolean, selfEdit:boolean, userId:string}){
  const [form, setForm] = useState<any>(()=>({ ...p }));
  const save = async()=>{
    try{
      if (editable) {
        await api('PUT', `/auth/users/${encodeURIComponent(userId)}/profile`, form);
      } else if (selfEdit) {
        await api('PUT', `/auth/me/profile`, form);
      } else {
        throw new Error('Not allowed');
      }
      toast.success('Saved');
    }catch(_e){ toast.error('Failed to save'); }
  };
  const isEditable = !!(editable || selfEdit);
  return (
    <div>
      <div className="grid md:grid-cols-2 gap-4">
        {fields.map(([label,key])=> (
          <div key={key}>
            <div className="text-sm text-gray-600">{label}</div>
            {isEditable ? (
              <input value={form[key]||''} onChange={e=> setForm((s:any)=>({ ...s, [key]: e.target.value }))} className="w-full rounded-lg border px-3 py-2"/>
            ) : (
              <div className="font-medium break-words">{String(p[key]??'')}</div>
            )}
          </div>
        ))}
      </div>
      {isEditable && (
        <div className="mt-4 text-right">
          <button onClick={save} className="px-4 py-2 rounded bg-brand-red text-white">Save</button>
        </div>
      )}
    </div>
  );
}

function TimesheetBlock({ userId }:{ userId:string }){
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0,7));
  const [projectId, setProjectId] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [workDate, setWorkDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [start, setStart] = useState<string>('');
  const [end, setEnd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const { data:projects } = useQuery({ queryKey:['projects-all'], queryFn: ()=> api<any[]>('GET','/projects') });
  const qs = useMemo(()=>{ const p = new URLSearchParams(); if(month) p.set('month', month); if(userId) p.set('user_id', userId); const s=p.toString(); return s? ('?'+s): ''; }, [month, userId]);
  const { data:entries, refetch } = useQuery({
    queryKey:['user-timesheet-view', projectId, qs],
    queryFn: ()=> {
      if(projectId==='_all_') return api<any[]>('GET', `/projects/timesheet/user${qs}`);
      if(projectId) return api<any[]>('GET', `/projects/${projectId}/timesheet${qs}`);
      return Promise.resolve([]);
    }
  });
  const canApprove = !!(me?.roles?.includes('admin') || (me?.permissions||[]).includes('timesheet:approve'));

  const submit = async()=>{
    try{
      if(!projectId){ toast.error('Select a project'); return; }
      if(!workDate || !start || !end){ toast.error('Date, start and end required'); return; }
      if(!notes.trim()){ toast.error('Notes required'); return; }
      const [sh,sm] = start.split(':').map(Number); const [eh,em] = end.split(':').map(Number);
      const minutes = Math.max(0,(eh*60+em)-(sh*60+sm));
      await api('POST', `/projects/${encodeURIComponent(projectId)}/timesheet`, { work_date: workDate, start_time: start, end_time: end, minutes, notes, user_id: userId });
      toast.success('Added'); setShowModal(false); setNotes(''); setEnd(''); await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600">Month</label>
        <input type="month" className="border rounded px-2 py-1" value={month} onChange={e=>setMonth(e.target.value)} />
        <label className="text-xs text-gray-600 ml-3">Project</label>
        <select className="border rounded px-2 py-1" value={projectId} onChange={e=>setProjectId(e.target.value)}>
          <option value="">Select...</option>
          <option value="_all_">All projects</option>
          {(projects||[]).map((p:any)=> <option key={p.id} value={p.id}>{p.code? `${p.code} — `:''}{p.name||'Project'}</option>)}
        </select>
        <button onClick={()=>setShowModal(true)} className="ml-auto px-3 py-2 rounded bg-brand-red text-white">Register time</button>
      </div>
      <div className="mt-3 border rounded-lg divide-y">
        {(entries||[]).length? (entries||[]).map((e:any)=> (
          <div key={e.id} className="px-3 py-2 text-sm flex items-center gap-3">
            <div className="w-24 text-gray-600">{String(e.work_date).slice(0,10)}</div>
            <div className="w-28 text-gray-700">{(e.start_time||'--:--')} - {(e.end_time||'--:--')}</div>
            <div className="w-20 font-medium">{(e.minutes/60).toFixed(2)}h</div>
            <div className="flex-1 text-gray-600 truncate">{e.project_code? `${e.project_code} — `:''}{e.project_name||''} {e.notes? '· '+e.notes:''}</div>
            <div className="flex items-center gap-2">
              <div title={e.is_approved? 'Approved':'Pending'} className="text-lg">{e.is_approved? '✅':'⚪'}</div>
              {canApprove && (
                <button onClick={async()=>{
                  try{
                    const pid = e.project_id || projectId;
                    await api('PATCH', `/projects/${encodeURIComponent(pid)}/timesheet/${encodeURIComponent(e.id)}/approve?approved=${String(!e.is_approved)}`);
                    await refetch();
                  }catch(_err){ toast.error('Failed to toggle approval'); }
                }} className="px-2 py-1 rounded border text-xs">{e.is_approved? 'Unapprove':'Approve'}</button>
              )}
            </div>
          </div>
        )) : <div className="px-3 py-3 text-sm text-gray-600">No entries</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2">Register time</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600">Project</div>
                <select className="border rounded px-2 py-2 w-full" value={projectId} onChange={e=>setProjectId(e.target.value)}>
                  <option value="">Select...</option>
                  {(projects||[]).map((p:any)=> <option key={p.id} value={p.id}>{p.code? `${p.code} — `:''}{p.name||'Project'}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-600">Date</div>
                <input type="date" className="border rounded px-3 py-2 w-full" value={workDate} onChange={e=>setWorkDate(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-600">Start</div>
                  <input type="time" className="border rounded px-3 py-2 w-full" value={start} onChange={e=>setStart(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs text-gray-600">End</div>
                  <input type="time" className="border rounded px-3 py-2 w-full" value={end} onChange={e=>setEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Notes</div>
                <input className="border rounded px-3 py-2 w-full" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Justification" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowModal(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={submit} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


