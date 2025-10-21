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
              {tab==='personal' && <SectionGrid p={p} keys={['preferred_name','phone','mobile_phone','gender','marital_status','date_of_birth','nationality','address_line1','address_line2','city','province','postal_code','country']} />}
              {tab==='job' && <SectionGrid p={p} keys={['hire_date','termination_date','job_title','division','work_email','work_phone','manager_user_id','pay_rate','pay_type','employment_type']} />}
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

function SectionGrid({p, keys}:{p:any, keys:string[]}){
  const label: Record<string,string> = {
    preferred_name:'Preferred name', phone:'Phone', mobile_phone:'Mobile phone', gender:'Gender', marital_status:'Marital status', date_of_birth:'Date of birth', nationality:'Nationality', address_line1:'Address line 1', address_line2:'Address line 2', city:'City', province:'Province/State', postal_code:'Postal code', country:'Country', hire_date:'Hire date', termination_date:'Termination date', job_title:'Job title', division:'Division', work_email:'Work email', work_phone:'Work phone', manager_user_id:'Manager user id', pay_rate:'Pay rate', pay_type:'Pay type', employment_type:'Employment type', sin_number:'SIN/SSN', work_permit_status:'Work permit status', visa_status:'Visa status', emergency_contact_name:'Emergency contact name', emergency_contact_relationship:'Emergency contact relationship', emergency_contact_phone:'Emergency contact phone'
  };
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {keys.map(k=> <LabelVal key={k} label={label[k]||k} value={p[k]} />)}
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
  const { data:entries, refetch } = useQuery({ queryKey:['user-timesheet-view', projectId, qs], queryFn: ()=> projectId? api<any[]>('GET', `/projects/${projectId}/timesheet${qs}`) : Promise.resolve([]) });

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
          {(projects||[]).map((p:any)=> <option key={p.id} value={p.id}>{p.code? `${p.code} — `:''}{p.name||'Project'}</option>)}
        </select>
        <button onClick={()=>setShowModal(true)} className="ml-auto px-3 py-2 rounded bg-brand-red text-white">Register time</button>
      </div>
      <div className="mt-3 border rounded-lg divide-y">
        {(entries||[]).length? (entries||[]).map((e:any)=> (
          <div key={e.id} className="px-3 py-2 text-sm flex items-center gap-3">
            <div className="w-24 text-gray-600">{String(e.work_date).slice(0,10)}</div>
            <div className="w-28 text-gray-700">{(e.start_time||'--:--')} - {(e.end_time||'--:--')}</div>
            <div className="w-16 font-medium">{(e.minutes/60).toFixed(2)}h</div>
            <div className="text-gray-600">{e.notes||''}</div>
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


