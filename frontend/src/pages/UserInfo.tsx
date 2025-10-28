import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import GeoSelect from '@/components/GeoSelect';

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
  const u = data?.user || {};
  const [pending, setPending] = useState<any>({});
  const [dirty, setDirty] = useState<boolean>(false);
  const { data:usersOptions } = useQuery({ queryKey:['users-options'], queryFn: ()=> api<any[]>('GET','/auth/users/options') });
  const supervisorName = useMemo(()=>{
    if(!p?.manager_user_id) return '';
    const row = (usersOptions||[]).find((x:any)=> String(x.id)===String(p.manager_user_id));
    return row? (row.username || row.email) : '';
  }, [usersOptions, p?.manager_user_id]);

  function calcAge(dob?: string){
    if(!dob) return '';
    try{ const d = new Date(dob); const now = new Date(); let a = now.getFullYear()-d.getFullYear(); const m = now.getMonth()-d.getMonth(); if(m<0 || (m===0 && now.getDate()<d.getDate())) a--; return a>0? `${a}y` : '—'; }catch{ return ''; }
  }
  function tenure(from?: string){
    if(!from) return '';
    try{ const s=new Date(from); const now=new Date(); let months=(now.getFullYear()-s.getFullYear())*12+(now.getMonth()-s.getMonth()); if(now.getDate()<s.getDate()) months--; const y=Math.floor(months/12); const m=months%12; return y>0? `${y}y ${m}m` : `${m}m`; }catch{ return ''; }
  }

  useEffect(()=>{ setPending({}); setDirty(false); }, [userId, data?.profile]);

  

  const collectChanges = (kv: Record<string, any>) => {
    setPending((s:any)=> ({ ...s, ...kv }));
    setDirty(true);
  };

  const saveAll = async()=>{
    try{
      if(!dirty) return;
      if (canEdit) {
        await api('PUT', `/auth/users/${encodeURIComponent(String(userId||''))}/profile`, pending);
      } else if (canSelfEdit) {
        await api('PUT', `/auth/me/profile`, pending);
      } else {
        throw new Error('Not allowed');
      }
      toast.success('Saved');
      setDirty(false);
      setPending({});
    }catch(_e){ toast.error('Failed to save'); }
  };

  const EmergencyGrid = ({ p, keys }:{ p:any, keys:string[] }) => (
    <div className="grid md:grid-cols-2 gap-4">
      {keys.map((k)=> (
        <div key={k}>
          <div className="text-sm text-gray-600">{k.replace(/_/g,' ').replace(/^./,s=>s.toUpperCase())}</div>
          <div className="font-medium break-words">{String((k==='date_of_birth'||k==='hire_date'||k==='termination_date')? (p[k]||'').slice(0,10) : (p[k]||''))}</div>
        </div>
      ))}
    </div>
  );

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
              <div className="text-3xl font-extrabold">{p.first_name||u?.username} {p.last_name||''}</div>
              <div className="text-sm opacity-90 mt-1">{p.job_title||u?.email||''}</div>
              <div className="grid md:grid-cols-3 gap-2 text-xs mt-3">
                <div><span className="opacity-80">Phone:</span> <span className="font-semibold">{p.phone||'—'}</span></div>
                <div><span className="opacity-80">Work email:</span> <span className="font-semibold">{p.work_email||'—'}</span></div>
                <div><span className="opacity-80">Status:</span> <span className="font-semibold">{u?.is_active? 'Active':'Terminated'}</span></div>
                <div><span className="opacity-80">Hire date:</span> <span className="font-semibold">{p.hire_date? String(p.hire_date).slice(0,10):'—'}{p.hire_date? ` (${tenure(p.hire_date)})`:''}</span></div>
                <div><span className="opacity-80">Supervisor:</span> <span className="font-semibold">{supervisorName||'—'}</span></div>
                <div><span className="opacity-80">Age:</span> <span className="font-semibold">{calcAge(p.date_of_birth)||'—'}</span></div>
              </div>
            </div>
            <div className="flex gap-2"></div>
          </div>
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-center gap-2">
            {['personal','job','emergency','docs','timesheet'].map((k)=> (
              <button key={k} onClick={()=>setTab(k as any)} className={`px-4 py-2 rounded-full ${tab===k?'bg-black text-white':'bg-white text-black border'}`}>{String(k).replace(/^./,s=>s.toUpperCase())}</button>
            ))}
          </div>
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              {tab==='personal' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Basic information</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Core personal details.</div>
                    <EditableGrid p={p} editable={canEdit} selfEdit={!!canSelfEdit} userId={String(userId)} collectChanges={collectChanges} inlineSave={false} fields={[['Preferred name','preferred_name'],['Gender','gender'],['Marital status','marital_status'],['Date of birth','date_of_birth'],['Nationality','nationality']]} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Address</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Home address for contact and records.</div>
                    <AddressSection p={p} editable={canEdit} selfEdit={!!canSelfEdit} userId={String(userId)} collectChanges={collectChanges} inlineSave={false} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Contact</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">How we can reach you.</div>
                    <EditableGrid p={p} editable={canEdit} selfEdit={!!canSelfEdit} userId={String(userId)} collectChanges={collectChanges} inlineSave={false} fields={[['Phone','phone'],['Mobile phone','mobile_phone'],['Emergency contact name','emergency_contact_name'],['Emergency contact relationship','emergency_contact_relationship'],['Emergency contact phone','emergency_contact_phone']]} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Education</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Academic history.</div>
                    <EducationSection userId={String(userId)} canEdit={canEdit} />
                  </div>
                </div>
              )}
              {tab==='job' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Employment Details</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Dates and employment attributes.</div>
                    <JobSection type="employment" p={p} editable={canEdit} userId={String(userId)} collectChanges={collectChanges} usersOptions={usersOptions||[]} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Organization</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Reporting and work contacts.</div>
                    <JobSection type="organization" p={p} editable={canEdit} userId={String(userId)} collectChanges={collectChanges} usersOptions={usersOptions||[]} />
                  </div>
                </div>
              )}
              {tab==='emergency' && <EmergencyGrid p={p} keys={['sin_number','work_permit_status','visa_status','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone']} />}
              {tab==='docs' && <div className="text-sm text-gray-600">Documents section coming soon.</div>}
              {tab==='timesheet' && <TimesheetBlock userId={String(userId)} />}
            </>
          )}
        </div>
      </div>
      {(canEdit || canSelfEdit) && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-[1200px] mx-auto px-4">
            <div className="mb-3 rounded-xl border bg-white shadow-hero p-3 flex items-center gap-3">
              <div className={`text-sm ${dirty? 'text-amber-700':'text-green-700'}`}>{dirty? 'You have unsaved changes':'All changes saved'}</div>
              <button onClick={saveAll} disabled={!dirty} className={`ml-auto px-4 py-2 rounded text-white ${dirty? 'bg-gradient-to-r from-brand-red to-[#ee2b2b]':'bg-gray-400 cursor-not-allowed'}`}>Save</button>
            </div>
          </div>
        </div>
      )}
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

function EditableGrid({p, fields, editable, selfEdit, userId, collectChanges, inlineSave=true}:{p:any, fields:[string,string][], editable:boolean, selfEdit:boolean, userId:string, collectChanges?: (kv:Record<string,any>)=>void, inlineSave?: boolean}){
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
              (key==='date_of_birth' || key==='hire_date' || key==='termination_date') ? (
                <input type="date" value={(form[key]||'').slice(0,10)} onChange={e=> { setForm((s:any)=>({ ...s, [key]: e.target.value })); collectChanges && collectChanges({ [key]: e.target.value }); }} className="w-full rounded-lg border px-3 py-2"/>
              ) : (
                <input value={form[key]||''} onChange={e=> { setForm((s:any)=>({ ...s, [key]: e.target.value })); collectChanges && collectChanges({ [key]: e.target.value }); }} className="w-full rounded-lg border px-3 py-2"/>
              )
            ) : (
              <div className="font-medium break-words">{(key==='date_of_birth' || key==='hire_date' || key==='termination_date')? String(p[key]??'').slice(0,10) : String(p[key]??'')}</div>
            )}
          </div>
        ))}
      </div>
      {isEditable && inlineSave && (
        <div className="mt-4 text-right">
          <button onClick={save} className="px-4 py-2 rounded bg-brand-red text-white">Save</button>
        </div>
      )}
    </div>
  );
}

function AddressSection({ p, editable, selfEdit, userId, collectChanges, inlineSave=true }:{ p:any, editable:boolean, selfEdit:boolean, userId:string, collectChanges?: (kv:Record<string,any>)=>void, inlineSave?: boolean }){
  const [form, setForm] = useState<any>(()=>({
    address_line1: p.address_line1||'',
    address_line2: p.address_line2||'',
    city: p.city||'',
    province: p.province||'',
    postal_code: p.postal_code||'',
    country: p.country||'',
  }));
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
        <div>
          <div className="text-sm text-gray-600">Address line 1</div>
          {isEditable? (
            <input value={form.address_line1} onChange={e=> { setForm((s:any)=>({ ...s, address_line1: e.target.value })); collectChanges && collectChanges({ address_line1: e.target.value }); }} className="w-full rounded-lg border px-3 py-2"/>
          ) : (
            <div className="font-medium break-words">{String(p.address_line1||'')}</div>
          )}
        </div>
        <div>
          <div className="text-sm text-gray-600">Address line 2</div>
          {isEditable? (
            <input value={form.address_line2} onChange={e=> { setForm((s:any)=>({ ...s, address_line2: e.target.value })); collectChanges && collectChanges({ address_line2: e.target.value }); }} className="w-full rounded-lg border px-3 py-2"/>
          ) : (
            <div className="font-medium break-words">{String(p.address_line2||'')}</div>
          )}
        </div>
        <div className="md:col-span-2">
          {isEditable ? (
            <GeoSelect
              country={form.country}
              state={form.province}
              city={form.city}
              onChange={(v)=> { setForm((s:any)=> ({...s, country: v.country??s.country, province: v.state??s.province, city: v.city??s.city })); collectChanges && collectChanges({ country: v.country, province: v.state, city: v.city }); }}
              labels={{ country:'Country', state:'Province/State', city:'City' }}
            />
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600">Country</div>
                <div className="font-medium">{String(p.country||'')}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Province/State</div>
                <div className="font-medium">{String(p.province||'')}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">City</div>
                <div className="font-medium">{String(p.city||'')}</div>
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="text-sm text-gray-600">Postal code</div>
          {isEditable? (
            <input value={form.postal_code} onChange={e=> { setForm((s:any)=>({ ...s, postal_code: e.target.value })); collectChanges && collectChanges({ postal_code: e.target.value }); }} className="w-full rounded-lg border px-3 py-2"/>
          ) : (
            <div className="font-medium break-words">{String(p.postal_code||'')}</div>
          )}
        </div>
      </div>
      {isEditable && inlineSave && (
        <div className="mt-4 text-right">
          <button onClick={save} className="px-4 py-2 rounded bg-brand-red text-white">Save</button>
        </div>
      )}
    </div>
  );
}

function SectionGrid({ p, keys }:{ p:any, keys:string[] }){
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {keys.map((k)=> (
        <div key={k}>
          <div className="text-sm text-gray-600">{k.replace(/_/g,' ').replace(/^./,s=>s.toUpperCase())}</div>
          <div className="font-medium break-words">{String((k==='date_of_birth'||k==='hire_date'||k==='termination_date')? (p[k]||'').slice(0,10) : (p[k]||''))}</div>
        </div>
      ))}
    </div>
  );
}

function EducationSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const { data:rows, refetch, isLoading } = useQuery({ queryKey:['education', userId], queryFn: ()=> api<any[]>( 'GET', `/auth/users/${encodeURIComponent(userId)}/education`) });
  const [showAdd, setShowAdd] = useState(false);
  const [inst, setInst] = useState('');
  const [degree, setDegree] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const add = async()=>{
    try{
      if(!inst.trim()){ toast.error('Institution required'); return; }
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/education`, { college_institution: inst, degree, start_date:start||null, end_date:end||null });
      toast.success('Added'); setShowAdd(false); setInst(''); setDegree(''); setStart(''); setEnd(''); await refetch();
    }catch(_e){ toast.error('Failed'); }
  };
  const del = async(id:string)=>{
    try{ await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/education/${encodeURIComponent(id)}`); await refetch(); }catch(_e){ toast.error('Failed'); }
  };
  return (
    <div>
      <div className="border rounded-lg divide-y">
        {isLoading? <div className="p-3 text-sm text-gray-600">Loading...</div> : (rows||[]).length? (rows||[]).map((e:any)=> (
          <div key={e.id} className="p-3 text-sm flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium">{e.college_institution||'Institution'}</div>
              <div className="text-gray-600">{e.degree||''} {e.major_specialization? `· ${e.major_specialization}`:''}</div>
              <div className="text-gray-500 text-xs">{e.start_date? String(e.start_date).slice(0,10):''}{(e.start_date||e.end_date)? ' — ':''}{e.end_date? String(e.end_date).slice(0,10):''}</div>
            </div>
            {canEdit && <button onClick={()=>del(e.id)} className="px-2 py-1 rounded border text-xs">Delete</button>}
          </div>
        )) : <div className="p-3 text-sm text-gray-600">No education records</div>}
      </div>
      {canEdit && (
        <div className="mt-3">
          {!showAdd ? (
            <button onClick={()=>setShowAdd(true)} className="px-3 py-2 rounded bg-brand-red text-white">Add education</button>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-600">Institution</div>
                <input className="w-full rounded-lg border px-3 py-2" value={inst} onChange={e=>setInst(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-gray-600">Degree</div>
                <input className="w-full rounded-lg border px-3 py-2" value={degree} onChange={e=>setDegree(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-gray-600">Start date</div>
                <input type="date" className="w-full rounded-lg border px-3 py-2" value={start} onChange={e=>setStart(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-gray-600">End date</div>
                <input type="date" className="w-full rounded-lg border px-3 py-2" value={end} onChange={e=>setEnd(e.target.value)} />
              </div>
              <div className="md:col-span-2 text-right">
                <button onClick={()=>setShowAdd(false)} className="px-3 py-2 rounded border mr-2">Cancel</button>
                <button onClick={add} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JobSection({ type, p, editable, userId, collectChanges, usersOptions }:{ type:'employment'|'organization', p:any, editable:boolean, userId:string, collectChanges: (kv:Record<string,any>)=>void, usersOptions:any[] }){
  const isEditable = !!editable;
  const [form, setForm] = useState<any>(()=>({
    hire_date: p.hire_date||'',
    termination_date: p.termination_date||'',
    job_title: p.job_title||'',
    division: p.division||'',
    work_email: p.work_email||'',
    work_phone: p.work_phone||'',
    manager_user_id: p.manager_user_id||'',
    pay_rate: p.pay_rate||'',
    pay_type: p.pay_type||'',
    employment_type: p.employment_type||'',
  }));
  const onField = (key:string, value:any)=>{ setForm((s:any)=>({ ...s, [key]: value })); collectChanges({ [key]: value }); };
  if (type==='employment'){
    return (
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-sm text-gray-600">Hire date</div>
          {isEditable? <input type="date" className="w-full rounded-lg border px-3 py-2" value={(form.hire_date||'').slice(0,10)} onChange={e=>onField('hire_date', e.target.value)} /> : <div className="font-medium">{String(p.hire_date||'').slice(0,10)}</div>}
        </div>
        <div>
          <div className="text-sm text-gray-600">Termination date</div>
          {isEditable? <input type="date" className="w-full rounded-lg border px-3 py-2" value={(form.termination_date||'').slice(0,10)} onChange={e=>onField('termination_date', e.target.value)} /> : <div className="font-medium">{String(p.termination_date||'').slice(0,10)}</div>}
        </div>
        <div>
          <div className="text-sm text-gray-600">Employment type</div>
          {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.employment_type} onChange={e=>onField('employment_type', e.target.value)} /> : <div className="font-medium">{String(p.employment_type||'')}</div>}
        </div>
        <div>
          <div className="text-sm text-gray-600">Pay type</div>
          {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.pay_type} onChange={e=>onField('pay_type', e.target.value)} /> : <div className="font-medium">{String(p.pay_type||'')}</div>}
        </div>
        <div>
          <div className="text-sm text-gray-600">Pay rate</div>
          {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.pay_rate} onChange={e=>onField('pay_rate', e.target.value)} /> : <div className="font-medium">{String(p.pay_rate||'')}</div>}
        </div>
        <div>
          <div className="text-sm text-gray-600">Job title</div>
          {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.job_title} onChange={e=>onField('job_title', e.target.value)} /> : <div className="font-medium">{String(p.job_title||'')}</div>}
        </div>
      </div>
    );
  }
  // organization
  const supervisor = useMemo(()=>{
    if(!p?.manager_user_id) return '';
    const row = (usersOptions||[]).find((x:any)=> String(x.id)===String(p.manager_user_id));
    return row? (row.username || row.email) : '';
  }, [usersOptions, p?.manager_user_id]);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div>
        <div className="text-sm text-gray-600">Division</div>
        {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.division} onChange={e=>onField('division', e.target.value)} /> : <div className="font-medium">{String(p.division||'')}</div>}
      </div>
      <div>
        <div className="text-sm text-gray-600">Supervisor</div>
        {isEditable? (
          <select className="w-full rounded-lg border px-3 py-2" value={form.manager_user_id} onChange={e=>onField('manager_user_id', e.target.value)}>
            <option value="">Select...</option>
            {(usersOptions||[]).map((u:any)=> <option key={u.id} value={u.id}>{u.username||u.email}</option>)}
          </select>
        ) : (
          <div className="font-medium">{supervisor||'—'}</div>
        )}
      </div>
      <div>
        <div className="text-sm text-gray-600">Work email</div>
        {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.work_email} onChange={e=>onField('work_email', e.target.value)} /> : <div className="font-medium">{String(p.work_email||'')}</div>}
      </div>
      <div>
        <div className="text-sm text-gray-600">Work phone</div>
        {isEditable? <input className="w-full rounded-lg border px-3 py-2" value={form.work_phone} onChange={e=>onField('work_phone', e.target.value)} /> : <div className="font-medium">{String(p.work_phone||'')}</div>}
      </div>
    </div>
  );
}

function TimesheetBlock({ userId }:{ userId:string }){
  const { data:meSelf } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
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
  const canApprove = !!(meSelf?.roles?.includes('admin') || (meSelf?.permissions||[]).includes('timesheet:approve'));

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


