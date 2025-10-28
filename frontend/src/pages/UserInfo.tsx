import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import GeoSelect from '@/components/GeoSelect';

function UserLabel({ id, fallback }:{ id:string, fallback:string }){
  const { data } = useQuery({ queryKey:['user-prof-opt', id], queryFn: ()=> api<any>('GET', `/auth/users/${id}/profile`), enabled: !!id });
  const fn = data?.profile?.preferred_name || data?.profile?.first_name || '';
  const ln = data?.profile?.last_name || '';
  const label = `${fn} ${ln}`.trim() || fallback;
  return <>{label}</>;
}

export default function UserInfo(){
  const { userId } = useParams();
  const [sp] = useSearchParams();
  const tabParam = sp.get('tab') as ('personal'|'job'|'emergency'|'docs'|'timesheet') | null;
  const [tab, setTab] = useState<typeof tabParam | 'personal'>(tabParam || 'personal');

  const { data, isLoading } = useQuery({ queryKey:['userProfile', userId], queryFn: ()=> api<any>('GET', `/auth/users/${userId}/profile`) });
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=> api<any>('GET','/settings') });
  const canEdit = !!(me?.roles?.includes('admin') || (me?.permissions||[]).includes('users:write'));
  const canSelfEdit = me && userId && String(me.id) === String(userId);
  const p = data?.profile || {};
  const u = data?.user || {};
  const [pending, setPending] = useState<any>({});
  const [dirty, setDirty] = useState<boolean>(false);
  const { data:usersOptions } = useQuery({ queryKey:['users-options'], queryFn: ()=> api<any[]>('GET','/auth/users/options') });
  const { data: supervisorProfile } = useQuery({
    queryKey: ['supervisor-profile', p?.manager_user_id],
    queryFn: ()=> api<any>('GET', `/auth/users/${p.manager_user_id}/profile`),
    enabled: !!p?.manager_user_id,
  });
  const supervisorName = useMemo(()=>{
    if (supervisorProfile?.profile) {
      const fn = supervisorProfile.profile.first_name||'';
      const ln = supervisorProfile.profile.last_name||'';
      const full = `${fn} ${ln}`.trim();
      if (full) return full;
    }
    if(!p?.manager_user_id) return '';
    const row = (usersOptions||[]).find((x:any)=> String(x.id)===String(p.manager_user_id));
    return row? (row.username || row.email) : '';
  }, [usersOptions, p?.manager_user_id, supervisorProfile]);

  

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
              <div className="text-sm opacity-90 mt-1">{p.job_title||u?.email||''}{p.division? ` — ${p.division}`:''}</div>
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
          <div className="mt-4 flex items-center gap-2">
            {['personal','job','emergency','docs','timesheet'].map((k)=> (
              <button
                key={k}
                onClick={()=>setTab(k as any)}
                className={`px-4 py-2 rounded-lg shadow-sm ${tab===k? 'bg-black text-white' : 'bg-white text-black border'}`}
              >
                {String(k).replace(/^./,s=>s.toUpperCase())}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              {tab==='personal' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Basic information</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Core personal details.</div>
                    <EditableGrid p={p} editable={canEdit} selfEdit={!!canSelfEdit} userId={String(userId)} collectChanges={collectChanges} inlineSave={false} fields={[['First name','first_name'],['Last name','last_name'],['Preferred name','preferred_name'],['Gender','gender'],['Marital status','marital_status'],['Date of birth','date_of_birth'],['Nationality','nationality']]} />
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
                    <JobSection type="employment" p={p} editable={canEdit} userId={String(userId)} collectChanges={collectChanges} usersOptions={usersOptions||[]} settings={settings} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Organization</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Reporting and work contacts.</div>
                    <JobSection type="organization" p={p} editable={canEdit} userId={String(userId)} collectChanges={collectChanges} usersOptions={usersOptions||[]} settings={settings} />
                  </div>
                </div>
              )}
              {tab==='emergency' && <EmergencyGrid p={p} keys={['sin_number','work_permit_status','visa_status','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone']} />}
              {tab==='docs' && <UserDocuments userId={String(userId)} canEdit={canEdit} />}
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

function JobSection({ type, p, editable, userId, collectChanges, usersOptions, settings }:{ type:'employment'|'organization', p:any, editable:boolean, userId:string, collectChanges: (kv:Record<string,any>)=>void, usersOptions:any[], settings:any }){
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
          {isEditable? (
            (settings?.employment_types?.length ? (
              <select className="w-full rounded-lg border px-3 py-2" value={form.employment_type} onChange={e=>onField('employment_type', e.target.value)}>
                <option value="">Select...</option>
                {settings.employment_types.map((it:any)=> <option key={it.id} value={it.label}>{it.label}</option>)}
              </select>
            ) : (
              <input className="w-full rounded-lg border px-3 py-2" value={form.employment_type} onChange={e=>onField('employment_type', e.target.value)} />
            ))
          ) : <div className="font-medium">{String(p.employment_type||'')}</div>}
        </div>
        <div>
          <div className="text-sm text-gray-600">Pay type</div>
          {isEditable? (
            (settings?.pay_types?.length ? (
              <select className="w-full rounded-lg border px-3 py-2" value={form.pay_type} onChange={e=>onField('pay_type', e.target.value)}>
                <option value="">Select...</option>
                {settings.pay_types.map((it:any)=> <option key={it.id} value={it.label}>{it.label}</option>)}
              </select>
            ) : (
              <input className="w-full rounded-lg border px-3 py-2" value={form.pay_type} onChange={e=>onField('pay_type', e.target.value)} />
            ))
          ) : <div className="font-medium">{String(p.pay_type||'')}</div>}
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
        {isEditable? (
          (settings?.divisions?.length ? (
            <select className="w-full rounded-lg border px-3 py-2" value={form.division} onChange={e=>onField('division', e.target.value)}>
              <option value="">Select...</option>
              {settings.divisions.map((it:any)=> <option key={it.id} value={it.label}>{it.label}</option>)}
            </select>
          ) : (
            <input className="w-full rounded-lg border px-3 py-2" value={form.division} onChange={e=>onField('division', e.target.value)} />
          ))
        ) : <div className="font-medium">{String(p.division||'')}</div>}
      </div>
      <div>
        <div className="text-sm text-gray-600">Supervisor</div>
        {isEditable? (
          <select className="w-full rounded-lg border px-3 py-2" value={form.manager_user_id} onChange={e=>onField('manager_user_id', e.target.value)}>
            <option value="">Select...</option>
            {(usersOptions||[]).map((u:any)=> (
              <option key={u.id} value={u.id}><UserLabel id={u.id} fallback={u.username||u.email} /></option>
            ))}
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
  const [projectId, setProjectId] = useState<string>('_all_');
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


function UserDocuments({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const { data:folders, refetch: refetchFolders } = useQuery({ queryKey:['user-folders', userId], queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/folders`) });
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const { data:docs, refetch } = useQuery({ queryKey:['user-docs', userId, activeFolderId], queryFn: ()=> {
    const qs = activeFolderId!=='all'? (`?folder_id=${encodeURIComponent(activeFolderId)}`): '';
    return api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/documents${qs}`);
  }});
  const [showUpload, setShowUpload] = useState(false);
  const [fileObj, setFileObj] = useState<File|null>(null);
  const [title, setTitle] = useState<string>('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string| null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [renameFolder, setRenameFolder] = useState<{id:string, name:string}|null>(null);
  const [moveDoc, setMoveDoc] = useState<{id:string}|null>(null);
  const [renameDoc, setRenameDoc] = useState<{id:string, title:string}|null>(null);
  const [inlineRenameFolderId, setInlineRenameFolderId] = useState<string| null>(null);
  const [inlineRenameFolderName, setInlineRenameFolderName] = useState<string>('');
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  const upload = async()=>{
    try{
      if(!fileObj){ toast.error('Select a file'); return; }
      if(activeFolderId==='all'){ toast.error('Select a folder first'); return; }
      const name = fileObj.name; const type = fileObj.type || 'application/octet-stream';
      const up = await api('POST','/files/upload',{ original_name: name, content_type: type, project_id: null, client_id: null, category_id: userId });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type }, body: fileObj });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: fileObj.size, content_type: type });
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, { folder_id: activeFolderId, title: title || name, file_id: conf.id });
      toast.success('Uploaded'); setShowUpload(false); setFileObj(null); setTitle(''); await refetch();
    }catch(_e){ toast.error('Upload failed'); }
  };

  const uploadToFolder = async(folderId:string, file: File)=>{
    try{
      const name = file.name; const type = file.type || 'application/octet-stream';
      const up = await api('POST','/files/upload',{ original_name: name, content_type: type, project_id: null, client_id: null, category_id: userId });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type }, body: file });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, content_type: type });
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, { folder_id: folderId, title: name, file_id: conf.id });
    }catch(_e){ /* noop per-file */ }
  };

  const del = async(id:string)=>{ try{ await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(id)}`); await refetch(); }catch(_e){ toast.error('Delete failed'); } };
  const createFolder = async()=>{
    try{
      const name = newFolderName.trim(); if(!name){ toast.error('Folder name required'); return; }
      const body:any = { name };
      if(newFolderParentId) body.parent_id = newFolderParentId;
      const r = await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, body);
      toast.success('Folder created'); setShowNewFolder(false); setNewFolderName(''); setNewFolderParentId(null); await refetchFolders(); setActiveFolderId(r.id);
    }catch(_e){ toast.error('Failed to create folder'); }
  };

  const doRenameFolder = async()=>{
    try{
      if(!renameFolder) return; const nm = (renameFolder.name||'').trim(); if(!nm){ toast.error('Folder name required'); return; }
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(renameFolder.id)}`, { name: nm });
      toast.success('Renamed'); setRenameFolder(null); await refetchFolders();
    }catch(_e){ toast.error('Failed to rename'); }
  };

  const removeFolder = async(id:string)=>{
    try{ await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(id)}`); toast.success('Folder deleted'); if(activeFolderId===id) setActiveFolderId('all'); await refetchFolders(); }
    catch(e:any){ toast.error(e?.detail||'Cannot delete folder'); }
  };

  const doMoveDoc = async()=>{
    try{
      if(!moveDoc) return; if(activeFolderId==='all'){ toast.error('Open a folder to move into another'); return; }
      const target = (document.getElementById('move-target') as HTMLSelectElement)?.value || '';
      if(!target){ toast.error('Select destination folder'); return; }
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(moveDoc.id)}`, { folder_id: target });
      setMoveDoc(null); await refetch();
    }catch(_e){ toast.error('Failed to move'); }
  };

  const doRenameDoc = async()=>{
    try{
      if(!renameDoc) return; const t = (renameDoc.title||'').trim(); if(!t){ toast.error('Title required'); return; }
      await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(renameDoc.id)}`, { title: t });
      toast.success('Renamed'); setRenameDoc(null); await refetch();
    }catch(_e){ toast.error('Failed to rename'); }
  };

  const topFolders = useMemo(()=> (folders||[]).filter((f:any)=> !f.parent_id), [folders]);
  const childFolders = useMemo(()=> (folders||[]).filter((f:any)=> f.parent_id===activeFolderId), [folders, activeFolderId]);
  const breadcrumb = useMemo(()=>{
    if(activeFolderId==='all') return [] as any[];
    const map = new Map<string, any>(); (folders||[]).forEach((f:any)=> map.set(f.id, f));
    const path: any[] = []; let cur = map.get(activeFolderId);
    while(cur){ path.unshift(cur); cur = cur.parent_id? map.get(cur.parent_id): null; }
    return path;
  }, [folders, activeFolderId]);

  return (
    <div>
      {activeFolderId==='all' ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="text-sm font-semibold">Folders</div>
            {canEdit && <button onClick={()=> { setNewFolderParentId(null); setShowNewFolder(true); }} className="ml-auto px-3 py-2 rounded-lg border">New folder</button>}
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            {topFolders.map((f:any)=> (
              <div key={f.id}
                   className="rounded-lg border p-4 bg-white hover:bg-gray-50 select-none group"
                   onClick={(e)=>{
                     // avoid triggering when clicking action buttons
                     const target = e.target as HTMLElement; if(target.closest('.folder-actions')) return; setActiveFolderId(f.id);
                   }}
                   onDragOver={(e)=>{ e.preventDefault(); }}
                   onDrop={async(e)=>{ e.preventDefault();
                     const movedDocId = e.dataTransfer.getData('application/x-mkhub-doc');
                     if(movedDocId){
                       try{ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(movedDocId)}`, { folder_id: f.id }); toast.success('Moved'); if(activeFolderId===f.id){ await refetch(); } else { setActiveFolderId(f.id); } }
                       catch(_e){ toast.error('Failed to move'); }
                       return;
                     }
                     if(e.dataTransfer.files?.length){ const arr=Array.from(e.dataTransfer.files); for(const file of arr){ await uploadToFolder(f.id, file); } toast.success('Uploaded'); }
                   }}>
                <div className="text-3xl">📁</div>
                <div className="mt-2 font-medium truncate" title={f.name}>
                  {inlineRenameFolderId===f.id ? (
                    <input autoFocus className="border rounded px-2 py-1 w-full"
                           value={inlineRenameFolderName}
                           onChange={e=> setInlineRenameFolderName(e.target.value)}
                           onBlur={async()=>{ if(inlineRenameFolderName.trim()){ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(f.id)}`, { name: inlineRenameFolderName.trim() }); await refetchFolders(); } setInlineRenameFolderId(null); }}
                           onKeyDown={async(e)=>{ if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } if(e.key==='Escape'){ setInlineRenameFolderId(null); } }}
                    />
                  ) : f.name}
                </div>
                {canEdit && (
                  <div className="folder-actions opacity-0 group-hover:opacity-100 transition-opacity mt-2 flex gap-2">
                    <button className="text-xs px-2 py-1 rounded border" onClick={()=> { setInlineRenameFolderId(f.id); setInlineRenameFolderName(f.name); }}>Rename</button>
                    <button className="text-xs px-2 py-1 rounded border text-red-600" onClick={()=> removeFolder(f.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
            {!topFolders.length && <div className="text-sm text-gray-600">No folders yet</div>}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button onClick={()=> setActiveFolderId('all')} className="px-3 py-2 rounded-lg border">← All folders</button>
            <div className="text-sm font-semibold flex gap-2 items-center">
              {breadcrumb.map((f:any, idx:number)=> (
                <span key={f.id} className="flex items-center gap-2">
                  {idx>0 && <span className="opacity-60">/</span>}
                  <button className="underline" onClick={()=> setActiveFolderId(f.id)}>{f.name}</button>
                </span>
              ))}
            </div>
            {canEdit && <>
              <button onClick={()=> { setNewFolderParentId(activeFolderId); setShowNewFolder(true); }} className="ml-auto px-3 py-2 rounded-lg border">New subfolder</button>
              <button onClick={()=> setShowUpload(true)} className="px-3 py-2 rounded-lg bg-brand-red text-white">Add file</button>
            </>}
          </div>
          {childFolders.length>0 && (
            <div className="mb-3">
              <div className="text-xs text-gray-600 mb-1">Subfolders</div>
              <div className="grid md:grid-cols-4 gap-3">
                {childFolders.map((f:any)=> (
                  <div key={f.id}
                       className="rounded-lg border p-4 bg-white hover:bg-gray-50 select-none group"
                       onClick={(e)=>{ const t=e.target as HTMLElement; if(t.closest('.folder-actions')) return; setActiveFolderId(f.id); }}
                       onDragOver={(e)=>{ e.preventDefault(); }}
                       onDrop={async(e)=>{ e.preventDefault();
                         const movedDocId = e.dataTransfer.getData('application/x-mkhub-doc');
                         if(movedDocId){
                           try{ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(movedDocId)}`, { folder_id: f.id }); toast.success('Moved'); if(activeFolderId===f.id){ await refetch(); } else { setActiveFolderId(f.id); } }
                           catch(_e){ toast.error('Failed to move'); }
                           return;
                         }
                         if(e.dataTransfer.files?.length){ const arr=Array.from(e.dataTransfer.files); for(const file of arr){ await uploadToFolder(f.id, file); } toast.success('Uploaded'); }
                       }}>
                    <div className="text-3xl">📁</div>
                    <div className="mt-2 font-medium truncate" title={f.name}>
                      {inlineRenameFolderId===f.id ? (
                        <input autoFocus className="border rounded px-2 py-1 w-full"
                               value={inlineRenameFolderName}
                               onChange={e=> setInlineRenameFolderName(e.target.value)}
                               onBlur={async()=>{ if(inlineRenameFolderName.trim()){ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/folders/${encodeURIComponent(f.id)}`, { name: inlineRenameFolderName.trim() }); await refetchFolders(); } setInlineRenameFolderId(null); }}
                               onKeyDown={async(e)=>{ if(e.key==='Enter'){ (e.target as HTMLInputElement).blur(); } if(e.key==='Escape'){ setInlineRenameFolderId(null); } }}
                        />
                      ) : f.name}
                    </div>
                    {canEdit && (
                      <div className="folder-actions opacity-0 group-hover:opacity-100 transition-opacity mt-2 flex gap-2">
                        <button className="text-xs px-2 py-1 rounded border" onClick={()=> { setInlineRenameFolderId(f.id); setInlineRenameFolderName(f.name); }}>Rename</button>
                        <button className="text-xs px-2 py-1 rounded border text-red-600" onClick={()=> removeFolder(f.id)}>Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div
            className={`rounded-lg border p-4 ${isDragging? 'ring-2 ring-brand-red':''}`}
            onDragEnter={(e)=>{ e.preventDefault(); setIsDragging(true); }}
            onDragOver={(e)=>{ e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e)=>{ e.preventDefault(); setIsDragging(false); }}
            onDrop={async(e)=>{ e.preventDefault(); setIsDragging(false); const files = Array.from(e.dataTransfer.files||[]); if(!files.length) return; for(const file of files){ await uploadToFolder(activeFolderId, file as File); } toast.success('Uploaded'); await refetch(); }}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="text-xs text-gray-600">Drag & drop files here to upload into this folder</div>
              {canEdit && <button className="ml-auto text-sm px-3 py-1.5 rounded border" onClick={()=> { setSelectMode(s=> !s); if(selectMode) setSelectedDocIds(new Set()); }}>{selectMode? 'Done':'Select'}</button>}
            </div>
            {selectMode && selectedDocIds.size>0 && (
              <div className="mb-3 flex items-center gap-2">
                <div className="text-sm">{selectedDocIds.size} selected</div>
                <select id="bulk-move-target" className="border rounded px-2 py-1">
                  <option value="" disabled selected>Select destination</option>
                  {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button className="px-3 py-1.5 rounded bg-brand-red text-white" onClick={async()=>{
                  const sel = (document.getElementById('bulk-move-target') as HTMLSelectElement);
                  const dest = sel?.value || '';
                  if(!dest){ toast.error('Select destination folder'); return; }
                  try{
                    for(const id of Array.from(selectedDocIds)){ await api('PUT', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(id)}`, { folder_id: dest }); }
                    toast.success('Moved'); setSelectedDocIds(new Set()); await refetch();
                  }catch(_e){ toast.error('Failed'); }
                }}>Move</button>
                <button className="px-3 py-1.5 rounded border" onClick={()=> setSelectedDocIds(new Set())}>Clear</button>
              </div>
            )}
            <div className="grid md:grid-cols-3 gap-3">
              {(docs||[]).map((d:any)=> (
                <div key={d.id} className={`rounded-lg border p-3 flex items-center gap-3 ${selectMode && selectedDocIds.has(d.id)? 'ring-2 ring-brand-red':''}`} draggable={canEdit}
                     onDragStart={(e)=>{ try{ e.dataTransfer.setData('application/x-mkhub-doc', d.id); e.dataTransfer.effectAllowed='move'; }catch(_){} }}>
                  {selectMode && (
                    <input type="checkbox" className="mr-2" checked={selectedDocIds.has(d.id)} onChange={(e)=>{
                      setSelectedDocIds(prev=>{ const next = new Set(prev); if(e.target.checked) next.add(d.id); else next.delete(d.id); return next; });
                    }} />
                  )}
                  <img className="w-12 h-12 rounded object-cover border" src={d.file_id? `/files/${d.file_id}/thumbnail?w=96`:'/ui/assets/login/logo-light.svg'} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{d.title||'Document'}</div>
                    <div className="text-xs text-gray-600 truncate">{(folders||[]).find((x:any)=>x.id===d.folder_id)?.name || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a className="text-sm underline" href={`/files/${d.file_id}/download`} target="_blank">Download</a>
                    {canEdit && <>
                      <button onClick={()=> setRenameDoc({ id: d.id, title: d.title||'' })} className="text-sm">Rename</button>
                      <button onClick={()=> setMoveDoc({ id: d.id })} className="text-sm">Move</button>
                      <button onClick={()=>del(d.id)} className="text-sm text-red-600">Delete</button>
                    </>}
                  </div>
                </div>
              ))}
              {!(docs||[]).length && <div className="text-sm text-gray-600">No documents in this folder</div>}
            </div>
          </div>
        </>
      )}

      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2">Add file</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600">Folder</div>
                <select className="border rounded px-3 py-2 w-full" value={activeFolderId==='all'? '': activeFolderId} onChange={e=> setActiveFolderId(e.target.value||'all')}>
                  <option value="">Select a folder</option>
                  {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-600">Title</div>
                <input className="border rounded px-3 py-2 w-full" value={title} onChange={e=> setTitle(e.target.value)} placeholder="Optional title" />
              </div>
              <div>
                <div className="text-xs text-gray-600">File</div>
                <input type="file" onChange={e=> setFileObj(e.target.files?.[0]||null)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowUpload(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={upload} className="px-3 py-2 rounded bg-brand-red text-white">Upload</button>
            </div>
          </div>
        </div>
      )}

      {showNewFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">{newFolderParentId? 'New subfolder':'New folder'}</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input className="border rounded px-3 py-2 w-full" value={newFolderName} onChange={e=> setNewFolderName(e.target.value)} placeholder="e.g., Hiring pack" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowNewFolder(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={createFolder} className="px-3 py-2 rounded bg-brand-red text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {renameFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Rename folder</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input className="border rounded px-3 py-2 w-full" value={renameFolder.name} onChange={e=> setRenameFolder({ id: renameFolder.id, name: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setRenameFolder(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={doRenameFolder} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {moveDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Move file</div>
            <div>
              <div className="text-xs text-gray-600">Destination folder</div>
              <select id="move-target" className="border rounded px-3 py-2 w-full" defaultValue="">
                <option value="" disabled>Select...</option>
                {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setMoveDoc(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={doMoveDoc} className="px-3 py-2 rounded bg-brand-red text-white">Move</button>
            </div>
          </div>
        </div>
      )}

      {renameDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Rename file</div>
            <div>
              <div className="text-xs text-gray-600">Title</div>
              <input className="border rounded px-3 py-2 w-full" value={renameDoc.title} onChange={e=> setRenameDoc({ id: renameDoc.id, title: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setRenameDoc(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={doRenameDoc} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

