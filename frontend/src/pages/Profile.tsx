import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useRef, useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import NationalitySelect from '@/components/NationalitySelect';
import AddressAutocomplete from '@/components/AddressAutocomplete';

type ProfileResp = { user:{ username:string, email:string, first_name?:string, last_name?:string, divisions?: Array<{id:string, label:string}> }, profile?: any };

export default function Profile(){
  const { data, isLoading } = useQuery({ queryKey:['meProfile'], queryFn: ()=>api<ProfileResp>('GET','/auth/me/profile') });
  const p = data?.profile || {};
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<'personal'|'job'|'docs'>('personal');
  // Get current user ID for components
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const userId = me?.id ? String(me.id) : '';
  
  // Local form state
  const [form, setForm] = useState<any>({});
  useMemo(()=>{ if (data){ setForm({
    first_name: p.first_name||'',
    last_name: p.last_name||'',
    middle_name: p.middle_name||'',
    prefered_name: p.prefered_name||'',
    phone: p.phone||'', mobile_phone: p.mobile_phone||'',
    gender: p.gender||'', marital_status: p.marital_status||'',
    date_of_birth: p.date_of_birth||'', nationality: p.nationality||'',
    address_line1: p.address_line1||'', address_line1_complement: p.address_line1_complement||'',
    address_line2: p.address_line2||'', address_line2_complement: p.address_line2_complement||'',
    city: p.city||'', province: p.province||'', postal_code: p.postal_code||'', country: p.country||'',
    hire_date: p.hire_date||'', termination_date: p.termination_date||'',
    job_title: p.job_title||'', division: p.division||'', work_email: p.work_email||'', work_phone: p.work_phone||'',
    manager_user_id: p.manager_user_id||'', pay_rate: p.pay_rate||'', pay_type: p.pay_type||'', employment_type: p.employment_type||'',
    sin_number: p.sin_number||'',
    emergency_contact_name: p.emergency_contact_name||'', emergency_contact_relationship: p.emergency_contact_relationship||'', emergency_contact_phone: p.emergency_contact_phone||''
  }); } }, [data]);
  const set = (k:string, v:any)=> setForm((s:any)=>({ ...s, [k]: v }));

  // Missing required indicators by category
  const reqPersonal = ['gender','date_of_birth','marital_status','nationality','phone','address_line1','city','province','postal_code','country','sin_number'];
  const missingPersonal = reqPersonal.filter(k => !String((form as any)[k]||'').trim());
  
  // Check if at least one emergency contact exists
  const { data: emergencyContactsData } = useQuery({ 
    queryKey:['emergency-contacts', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`),
    enabled: !!userId
  });
  const hasEmergencyContact = emergencyContactsData && emergencyContactsData.length > 0;
  const missingPersonalWithContact = [...missingPersonal];
  if (!hasEmergencyContact && userId) {
    missingPersonalWithContact.push('emergency_contact');
  }
  
  const totalMissing = missingPersonalWithContact.length;
  
  // Phone formatting function (same as in emergency contacts)
  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };
  
  const labelMap: Record<string,string> = {
    gender:'Gender', date_of_birth:'Date of birth', marital_status:'Marital status', nationality:'Nationality',
    phone:'Phone 1', address_line1:'Address line 1', city:'City', province:'Province/State', postal_code:'Postal code', country:'Country',
    sin_number:'SIN/SSN',
    emergency_contact:'At least one emergency contact'
  };
  return (
    <div>
      {/* Title above hero */}
      <div className="mb-3 flex items-center gap-3">
        <img className="w-10 h-10 rounded-full border-2 border-brand-red object-cover" src={p.profile_photo_file_id? `/files/${p.profile_photo_file_id}/thumbnail?w=64`:'/ui/assets/login/logo-light.svg'} />
        <h2 className="text-xl font-extrabold">My Information</h2>
        {totalMissing>0 && <span className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-full px-2 py-0.5">Missing {totalMissing}</span>}
      </div>
      <p className="text-sm text-gray-600 mb-2">Please complete your profile. Fields marked with <span className="text-red-600">*</span> are required.</p>
      <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="rounded-xl border shadow-hero bg-white pb-24">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] rounded-t-xl p-5 text-white">
          <div className="flex gap-4 items-stretch min-h-[180px]">
            <div className="w-[220px] relative group">
              <img className="w-full h-full object-cover rounded-xl border-2 border-brand-red" src={p.profile_photo_file_id? `/files/${p.profile_photo_file_id}/thumbnail?w=240`:'/ui/assets/login/logo-light.svg'} />
              <button onClick={()=>fileRef.current?.click()} className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">✏️ Change</button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e)=>{/* preview handled by server after save */}} />
            </div>
            <div className="flex-1 flex flex-col justify-start">
              <div className="text-3xl font-extrabold">{p.first_name || data?.user?.first_name || data?.user?.username} {p.last_name || data?.user?.last_name || ''}</div>
              <div className="text-sm opacity-90 mt-1">{p.job_title||data?.user?.email||''}</div>
              <div className="mt-auto flex gap-3">
                <button onClick={()=>setTab('personal')} className={`px-4 py-2 rounded-full ${tab==='personal'?'bg-black text-white':'bg-white text-black'}`}>
                  Personal {missingPersonalWithContact.length>0 && <span className="ml-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2">{missingPersonalWithContact.length}</span>}
                </button>
                <button onClick={()=>setTab('job')} className={`px-4 py-2 rounded-full ${tab==='job'?'bg-black text-white':'bg-white text-black'}`}>Job</button>
                <button onClick={()=>setTab('docs')} className={`px-4 py-2 rounded-full ${tab==='docs'?'bg-black text-white':'bg-white text-black'}`}>Documents</button>
              </div>
            </div>
            <div className="flex items-center">
              <button disabled={uploading} onClick={async()=>{
                const f = fileRef.current?.files?.[0]; if(!f) return;
                try{
                  setUploading(true);
                  const up:any = await api('POST','/files/upload',{ project_id:null, client_id:null, employee_id:null, category_id:'profile-photo', original_name:f.name, content_type: f.type||'image/jpeg' });
                  const put = await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': f.type||'image/jpeg', 'x-ms-blob-type': 'BlockBlob' }, body: f });
                  if(!put.ok) throw new Error('upload failed');
                  const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: f.size, checksum_sha256:'na', content_type: f.type||'image/jpeg' });
                  await api('PUT','/auth/me/profile',{ profile_photo_file_id: conf.id });
                  await queryClient.invalidateQueries({ queryKey:['meProfile'] });
                  toast.success('Profile photo updated');
                }catch(e){ console.error(e); }
                finally{ setUploading(false); if(fileRef.current) fileRef.current.value=''; }
              }} className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] font-bold disabled:opacity-60">{uploading? 'Saving...' : 'Save Photo'}</button>
            </div>
          </div>
        </div>
        <div className="p-5">
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              {tab==='personal' && (
                <div className="space-y-6 pb-24">
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Basic information</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Core personal details.</div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Field label="First name" required invalid={false}><input type="text" value={form.first_name || ''} onChange={e=>set('first_name', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                      <Field label="Last name" required invalid={false}><input type="text" value={form.last_name || ''} onChange={e=>set('last_name', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                      <Field label="Middle name" required={false} invalid={false}><input type="text" value={form.middle_name || ''} onChange={e=>set('middle_name', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                      <Field label="Prefered name" required={false} invalid={false}><input type="text" value={form.prefered_name || ''} onChange={e=>set('prefered_name', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                      <Field label="Gender" required invalid={missingPersonal.includes('gender')}>
                        <select value={form.gender || ''} onChange={e=>set('gender', e.target.value)} className="w-full rounded-lg border px-3 py-2">
                          <option value="">Select...</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </Field>
                      <Field label="Marital status" required invalid={missingPersonal.includes('marital_status')}>
                        <select value={form.marital_status || ''} onChange={e=>set('marital_status', e.target.value)} className="w-full rounded-lg border px-3 py-2">
                          <option value="">Select...</option>
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                          <option value="Common-law">Common-law</option>
                          <option value="Divorced">Divorced</option>
                          <option value="Widowed">Widowed</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </Field>
                      <Field label="Date of birth" required invalid={missingPersonal.includes('date_of_birth')}><input type="date" value={form.date_of_birth ? String(form.date_of_birth).slice(0,10) : ''} onChange={e=>set('date_of_birth', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                      <Field label="Nationality" required invalid={missingPersonal.includes('nationality')}>
                        <NationalitySelect value={form.nationality || ''} onChange={v=>set('nationality', v)} />
                      </Field>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Address</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Home address for contact and records.</div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Field label="Address line 1" required invalid={missingPersonal.includes('address_line1')}>
                        <AddressAutocomplete
                          value={form.address_line1 || ''}
                          onChange={(value) => set('address_line1', value)}
                          onAddressSelect={(address) => {
                            set('address_line1', address.address_line1 || form.address_line1);
                            if (address.city !== undefined) set('city', address.city);
                            if (address.province !== undefined) set('province', address.province);
                            if (address.postal_code !== undefined) set('postal_code', address.postal_code);
                            if (address.country !== undefined) set('country', address.country);
                          }}
                          placeholder="Start typing an address..."
                          className="w-full rounded-lg border px-3 py-2"
                        />
                      </Field>
                      <Field label="Complement (e.g., Apt, Unit, Basement)">
                        <input type="text" value={form.address_line1_complement || ''} onChange={e=>set('address_line1_complement', e.target.value)} placeholder="Apt 101, Unit 2, Basement, etc." className="w-full rounded-lg border px-3 py-2"/>
                      </Field>
                      <Field label="Address line 2">
                        <AddressAutocomplete
                          value={form.address_line2 || ''}
                          onChange={(value) => set('address_line2', value)}
                          placeholder="Start typing an address..."
                          className="w-full rounded-lg border px-3 py-2"
                        />
                      </Field>
                      <Field label="Complement (e.g., Apt, Unit, Basement)">
                        <input type="text" value={form.address_line2_complement || ''} onChange={e=>set('address_line2_complement', e.target.value)} placeholder="Apt 101, Unit 2, Basement, etc." className="w-full rounded-lg border px-3 py-2"/>
                      </Field>
                      <Field label="City" required invalid={missingPersonal.includes('city')}><input type="text" value={form.city || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50 cursor-not-allowed"/></Field>
                      <Field label="Province/State" required invalid={missingPersonal.includes('province')}><input type="text" value={form.province || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50 cursor-not-allowed"/></Field>
                      <Field label="Postal code" required invalid={missingPersonal.includes('postal_code')}><input type="text" value={form.postal_code || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50 cursor-not-allowed"/></Field>
                      <Field label="Country" required invalid={missingPersonal.includes('country')}><input type="text" value={form.country || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50 cursor-not-allowed"/></Field>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Contact</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">How we can reach you.</div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Field label="Phone 1" required invalid={missingPersonal.includes('phone')}><input type="text" value={form.phone || ''} onChange={e=>set('phone', formatPhone(e.target.value))} className="w-full rounded-lg border px-3 py-2"/></Field>
                      <Field label="Phone 2"><input type="text" value={form.mobile_phone || ''} onChange={e=>set('mobile_phone', formatPhone(e.target.value))} className="w-full rounded-lg border px-3 py-2"/></Field>
                    </div>
                  </div>
                  {userId && (
                    <>
                      <div>
                        <div className="flex items-center gap-2"><h4 className="font-semibold">Education</h4></div>
                        <div className="text-xs text-gray-500 mt-0.5 mb-2">Academic history.</div>
                        <EducationSection userId={userId} canEdit={true} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2"><h4 className="font-semibold">Legal & Documents</h4></div>
                        <div className="text-xs text-gray-500 mt-0.5 mb-2">Legal status and identification.</div>
                        <div className="grid md:grid-cols-2 gap-4 mb-4">
                          <Field label="SIN/SSN" required invalid={missingPersonal.includes('sin_number')}><input value={form.sin_number || ''} onChange={e=>set('sin_number', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                        </div>
                        <VisaInformationSection userId={userId} canEdit={true} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2"><h4 className="font-semibold">Emergency Contacts</h4></div>
                        <div className="text-xs text-gray-500 mt-0.5 mb-2">People to contact in case of emergency.</div>
                        <EmergencyContactsSection userId={userId} canEdit={true} />
                      </div>
                    </>
                  )}
                  {totalMissing > 0 && (
                    <div className="mt-6">
                      <div className="bg-red-50 border border-red-200 rounded p-3">
                        <div className="text-sm text-gray-700">
                          <div className="font-semibold text-red-700 mb-1">Missing required fields</div>
                          <ul className="list-disc pl-5 text-red-700">
                            {missingPersonalWithContact.map(k=> (<li key={k}>{labelMap[k]||k}</li>))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {tab==='job' && (
                <div className="space-y-6 pb-24">
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Employment Details</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Dates and employment attributes.</div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Field label="Hire date"><input type="date" value={form.hire_date ? String(form.hire_date).slice(0,10) : ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                      <Field label="Termination date"><input type="date" value={form.termination_date ? String(form.termination_date).slice(0,10) : ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                      <Field label="Job title"><input value={form.job_title || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                      <Field label="Employment type"><input value={form.employment_type || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                      <Field label="Pay type"><input value={form.pay_type || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                      <Field label="Pay rate"><input value={form.pay_rate || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h4 className="font-semibold">Organization</h4></div>
                    <div className="text-xs text-gray-500 mt-0.5 mb-2">Reporting and work contacts.</div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <Field label="Department">
                        <div className="w-full rounded-lg border px-3 py-2 bg-gray-50 min-h-[42px] flex items-center">
                          {data?.user?.divisions && data.user.divisions.length > 0
                            ? data.user.divisions.map((d: any) => d.label).join(', ')
                            : (form.division || '—')}
                        </div>
                      </Field>
                      <Field label="Work email"><input type="email" value={form.work_email || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                      <Field label="Work phone"><input value={form.work_phone || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                      <Field label="Manager"><input value={form.manager_user_id || ''} readOnly className="w-full rounded-lg border px-3 py-2 bg-gray-50"/></Field>
                    </div>
                  </div>
                  {userId && (
                    <div>
                      <div className="flex items-center gap-2"><h4 className="font-semibold">Time Off</h4></div>
                      <div className="text-xs text-gray-500 mt-0.5 mb-2">Request time off and view your balance.</div>
                      <TimeOffSection userId={userId} canEdit={true} />
                    </div>
                  )}
                </div>
              )}
              {tab==='docs' && (
                userId ? <UserDocuments userId={userId} canEdit={true} /> : <div className="text-sm text-gray-600">Loading...</div>
              )}
            </>
          )}
        </div>
      </motion.div>
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <div className="max-w-[1200px] mx-auto px-4">
          <div className="mb-3 rounded-xl border bg-white shadow-hero p-3 flex items-center gap-3">
            <div className={`text-sm ${totalMissing > 0 ? 'text-amber-700' : 'text-green-700'}`}>
              {totalMissing > 0 ? (
                <>
                  Missing {totalMissing} required field{totalMissing > 1 ? 's' : ''}
                </>
              ) : (
                'All required fields completed'
              )}
            </div>
            <div className="flex gap-3 ml-auto">
              <button 
                disabled={totalMissing > 0} 
                onClick={async()=>{
                  if (totalMissing > 0){ toast.error('Please complete required fields'); return; }
                  try{
                    await api('PUT','/auth/me/profile', form);
                    toast.success('Profile saved');
                    await queryClient.invalidateQueries({ queryKey:['meProfile'] });
                  }catch(e){ toast.error('Failed to save'); }
                }} 
                className={`px-4 py-2 rounded text-white ${totalMissing > 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-brand-red to-[#ee2b2b]'}`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({label, children, required, invalid}:{label:string, children:any, required?:boolean, invalid?:boolean}){
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600">{label} {required && <span className="text-red-600">*</span>}</label>
      <div className={invalid? 'ring-2 ring-red-400 rounded-lg p-0.5':'p-0'}>
        {children}
      </div>
      {invalid && <div className="text-xs text-red-600">Required</div>}
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

function TimeOffSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const { data:balances, refetch:refetchBalances } = useQuery({ 
    queryKey:['time-off-balance', userId], 
    queryFn: ()=> api<any[]>('GET', `/employees/${userId}/time-off/balance`) 
  });
  const { data:requests, refetch:refetchRequests } = useQuery({ 
    queryKey:['time-off-requests', userId], 
    queryFn: ()=> api<any[]>('GET', `/employees/${userId}/time-off/requests`) 
  });
  const { data:history, refetch:refetchHistory } = useQuery({ 
    queryKey:['time-off-history', userId], 
    queryFn: ()=> api<any[]>('GET', `/employees/${userId}/time-off/history`) 
  });
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [policyName, setPolicyName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  
  const calculateHours = () => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      setHours(String(days * 8));
    }
  };
  
  useEffect(() => {
    calculateHours();
  }, [startDate, endDate]);
  
  const handleSync = async () => {
    setSyncing(true);
    try {
      await api('POST', `/employees/${userId}/time-off/balance/sync`);
      toast.success('Time off balance synced from BambooHR');
      refetchBalances();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync balance');
    } finally {
      setSyncing(false);
    }
  };
  
  const handleSyncHistory = async () => {
    setSyncingHistory(true);
    try {
      await api('POST', `/employees/${userId}/time-off/history/sync`);
      toast.success('Time off history synced from BambooHR');
      refetchHistory();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to sync history');
    } finally {
      setSyncingHistory(false);
    }
  };
  
  const handleSubmit = async () => {
    if (!policyName || !startDate || !endDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    setSubmitting(true);
    try {
      await api('POST', `/employees/${userId}/time-off/requests`, {
        policy_name: policyName,
        start_date: startDate,
        end_date: endDate,
        hours: hours ? parseFloat(hours) : undefined,
        notes: notes
      });
      toast.success('Time off request submitted');
      setShowRequestForm(false);
      setPolicyName('');
      setStartDate('');
      setEndDate('');
      setHours('');
      setNotes('');
      refetchRequests();
      refetchBalances();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleCancel = async (requestId: string) => {
    try {
      await api('PATCH', `/employees/${userId}/time-off/requests/${requestId}`, {
        status: 'cancelled'
      });
      toast.success('Request cancelled');
      refetchRequests();
      refetchBalances();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to cancel request');
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };
  
  const availablePolicies = balances?.map((b: any) => b.policy_name) || [];
  const pendingRequests = requests?.filter((r: any) => r.status === 'pending') || [];
  const upcomingRequests = requests?.filter((r: any) => {
    if (r.status !== 'approved') return false;
    const endDate = new Date(r.end_date);
    return endDate >= new Date();
  }) || [];
  const historyRequests = requests?.filter((r: any) => {
    if (r.status !== 'pending') return false;
    const endDate = new Date(r.end_date);
    return endDate < new Date() || r.status !== 'approved';
  }) || [];
  
  const hoursToDays = (hours: number) => {
    return (hours / 8).toFixed(1);
  };
  
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-semibold flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Available Balance
            </h5>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 rounded border text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
          {balances && balances.length > 0 ? (
            <div className="space-y-3">
              {balances.map((b: any) => {
                const balanceDays = hoursToDays(b.balance_hours);
                const isNegative = b.balance_hours < 0;
                return (
                  <div key={b.id} className="p-3 bg-gray-50 rounded-lg border">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-sm">{b.policy_name}</div>
                      <div className={`text-lg font-bold ${isNegative ? 'text-red-600' : 'text-brand-red'}`}>
                        {isNegative ? '-' : ''}{balanceDays} Days
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">
                      {b.policy_name} Available
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-600 py-4 text-center">
              No balance found. Click "Sync" to load from BambooHR.
            </div>
          )}
        </div>
        
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-semibold flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Upcoming Time Off
            </h5>
            {availablePolicies.length > 0 && (
              <button
                onClick={() => setShowRequestForm(true)}
                className="px-3 py-1.5 rounded bg-brand-red text-white text-sm hover:bg-red-700"
              >
                Request Time Off
              </button>
            )}
          </div>
          {upcomingRequests.length > 0 || pendingRequests.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...pendingRequests, ...upcomingRequests].slice(0, 5).map((r: any) => (
                <div key={r.id} className="p-2 border rounded text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.policy_name}</div>
                      <div className="text-xs text-gray-600">
                        {new Date(r.start_date).toLocaleDateString()} - {new Date(r.end_date).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(r.status)}`}>
                      {r.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-600 py-8 text-center">
              <div className="text-4xl mb-2">🏖️</div>
              <div>No upcoming time off.</div>
              <div className="text-xs text-gray-500 mt-1">Do you need to get away?</div>
            </div>
          )}
        </div>
      </div>
      
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="font-semibold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            History
          </h5>
          <button
            onClick={handleSyncHistory}
            disabled={syncingHistory}
            className="px-3 py-1.5 rounded border text-sm disabled:opacity-50 hover:bg-gray-50"
          >
            {syncingHistory ? 'Syncing...' : 'Sync History'}
          </button>
        </div>
        {history && history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-semibold">Date</th>
                  <th className="text-left py-2 px-2 font-semibold">Description</th>
                  <th className="text-right py-2 px-2 font-semibold">Used Days (-)</th>
                  <th className="text-right py-2 px-2 font-semibold">Earned Days (+)</th>
                  <th className="text-right py-2 px-2 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h: any) => (
                  <tr key={h.id} className="border-b">
                    <td className="py-2 px-2">{new Date(h.transaction_date).toLocaleDateString()}</td>
                    <td className="py-2 px-2">{h.description || 'Time off transaction'}</td>
                    <td className="py-2 px-2 text-right">
                      {h.used_days ? `-${parseFloat(h.used_days).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {h.earned_days ? `+${parseFloat(h.earned_days).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {parseFloat(h.balance_after).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : historyRequests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-semibold">Date</th>
                  <th className="text-left py-2 px-2 font-semibold">Description</th>
                  <th className="text-right py-2 px-2 font-semibold">Used Days (-)</th>
                  <th className="text-right py-2 px-2 font-semibold">Earned Days (+)</th>
                  <th className="text-right py-2 px-2 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {historyRequests.map((r: any) => {
                  const days = hoursToDays(r.hours);
                  return (
                    <tr key={r.id} className="border-b">
                      <td className="py-2 px-2">{new Date(r.requested_at).toLocaleDateString()}</td>
                      <td className="py-2 px-2">
                        {r.policy_name} - {r.status}
                        {r.notes && <div className="text-xs text-gray-500">{r.notes}</div>}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {r.status === 'approved' ? `-${days}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-gray-600 py-4 text-center">
            No history available. Click "Sync History" to load from BambooHR.
          </div>
        )}
      </div>
      
      {showRequestForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-4">Request Time Off</div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-600">Policy</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                >
                  <option value="">Select policy...</option>
                  {availablePolicies.map((p: string) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600">Start Date</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">End Date</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Hours (auto-calculated)</label>
                <input
                  type="number"
                  step="0.5"
                  className="w-full border rounded px-3 py-2"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Notes (optional)</label>
                <textarea
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reason for time off..."
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowRequestForm(false);
                  setPolicyName('');
                  setStartDate('');
                  setEndDate('');
                  setHours('');
                  setNotes('');
                }}
                className="px-3 py-2 rounded border"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !policyName || !startDate || !endDate}
                className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmergencyContactsSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const { data, refetch } = useQuery({ 
    queryKey:['emergency-contacts', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`) 
  });
  const [editId, setEditId] = useState<string|null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressProvince, setAddressProvince] = useState('');
  const [addressPostalCode, setAddressPostalCode] = useState('');
  const [addressCountry, setAddressCountry] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [eName, setEName] = useState('');
  const [eRelationship, setERelationship] = useState('');
  const [eMobilePhone, setEMobilePhone] = useState('');
  const [eWorkPhone, setEWorkPhone] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [eAddress, setEAddress] = useState('');
  const [eAddressCity, setEAddressCity] = useState('');
  const [eAddressProvince, setEAddressProvince] = useState('');
  const [eAddressPostalCode, setEAddressPostalCode] = useState('');
  const [eAddressCountry, setEAddressCountry] = useState('');
  const [eIsPrimary, setEIsPrimary] = useState(false);
  const confirm = useConfirm();
  
  // Check if this is the first contact (no contacts exist)
  const isFirstContact = !data || data.length === 0;
  
  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };
  
  const beginEdit = (c:any)=>{
    setEditId(c.id);
    setEName(c.name||'');
    setERelationship(c.relationship||'');
    setEMobilePhone(c.mobile_phone||'');
    setEWorkPhone(c.work_phone||'');
    setEEmail(c.email||'');
    setEAddress(c.address||'');
    setEAddressCity(c.address_city||'');
    setEAddressProvince(c.address_province||'');
    setEAddressPostalCode(c.address_postal_code||'');
    setEAddressCountry(c.address_country||'');
    setEIsPrimary(c.is_primary||false);
  };
  
  const cancelEdit = ()=>{
    setEditId(null);
  };
  
  const handleCreate = async () => {
    // Validate required fields
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!relationship.trim()) {
      toast.error('Relationship is required');
      return;
    }
    if (!mobilePhone.trim()) {
      toast.error('Mobile Phone is required');
      return;
    }
    
    try {
      // If this is the first contact, automatically set as primary
      const willBePrimary = isFirstContact || isPrimary;
      
      // If setting as primary, first unset any existing primary contacts
      if (willBePrimary && data && data.length > 0) {
        const primaryContact = data.find((c: any) => c.is_primary);
        if (primaryContact) {
          await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${primaryContact.id}`, {
            is_primary: false
          });
        }
      }
      
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`, {
        name,
        relationship,
        mobile_phone: mobilePhone,
        work_phone: workPhone,
        email,
        address,
        address_city: addressCity,
        address_province: addressProvince,
        address_postal_code: addressPostalCode,
        address_country: addressCountry,
        is_primary: willBePrimary
      });
      toast.success('Emergency contact created');
      setName('');
      setRelationship('');
      setMobilePhone('');
      setWorkPhone('');
      setEmail('');
      setAddress('');
      setAddressCity('');
      setAddressProvince('');
      setAddressPostalCode('');
      setAddressCountry('');
      setIsPrimary(false);
      setCreateOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create contact');
    }
  };
  
  const handleUpdate = async (contactId: string) => {
    // Validate required fields
    if (!eName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!eRelationship.trim()) {
      toast.error('Relationship is required');
      return;
    }
    if (!eMobilePhone.trim()) {
      toast.error('Mobile Phone is required');
      return;
    }
    
    try {
      // If setting as primary, first unset any existing primary contacts
      if (eIsPrimary && data && data.length > 0) {
        const primaryContact = data.find((c: any) => c.is_primary && c.id !== contactId);
        if (primaryContact) {
          await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${primaryContact.id}`, {
            is_primary: false
          });
        }
      }
      
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`, {
        name: eName,
        relationship: eRelationship,
        mobile_phone: eMobilePhone,
        work_phone: eWorkPhone,
        email: eEmail,
        address: eAddress,
        address_city: eAddressCity,
        address_province: eAddressProvince,
        address_postal_code: eAddressPostalCode,
        address_country: eAddressCountry,
        is_primary: eIsPrimary
      });
      toast.success('Emergency contact updated');
      setEditId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update contact');
    }
  };
  
  const handleDelete = async (contactId: string) => {
    const result = await confirm({ title:'Delete emergency contact', message:'Are you sure you want to delete this emergency contact? This action cannot be undone.', confirmText:'Delete', cancelText:'Cancel' });
    if(result !== 'confirm') return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`);
      toast.success('Emergency contact deleted');
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete contact');
    }
  };
  
  const handleSetPrimary = async (contactId: string) => {
    try {
      // First unset any existing primary contacts
      if (data && data.length > 0) {
        const primaryContact = data.find((c: any) => c.is_primary && c.id !== contactId);
        if (primaryContact) {
          await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${primaryContact.id}`, {
            is_primary: false
          });
        }
      }
      
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`, {
        is_primary: true
      });
      toast.success('Primary contact updated');
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update contact');
    }
  };
  
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div></div>
        {canEdit && (
          <button 
            onClick={() => setCreateOpen(true)} 
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold"
          >
            New Contact
          </button>
        )}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {(data||[]).map((c: any) => (
          <div key={c.id} className="rounded-xl border bg-white overflow-hidden flex">
            <div className="w-28 bg-gray-100 flex items-center justify-center">
              <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">
                {(c.name||'?').slice(0,2).toUpperCase()}
              </div>
            </div>
            <div className="flex-1 p-3 text-sm">
              {editId === c.id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Edit contact</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Primary</label>
                      <input 
                        type="checkbox" 
                        checked={eIsPrimary} 
                        onChange={e => setEIsPrimary(e.target.checked)}
                        disabled={data && data.length === 1 && eIsPrimary}
                        className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Name *</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eName} 
                        onChange={e => setEName(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Relationship *</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eRelationship} 
                        onChange={e => setERelationship(e.target.value)} 
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Primary</label>
                      <input 
                        type="checkbox" 
                        checked={eIsPrimary} 
                        onChange={e => setEIsPrimary(e.target.checked)}
                        disabled={data && data.length === 1 && eIsPrimary}
                        className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Phone *</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eMobilePhone} 
                        onChange={e => setEMobilePhone(formatPhone(e.target.value))} 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Work Phone</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        value={eWorkPhone} 
                        onChange={e => setEWorkPhone(formatPhone(e.target.value))} 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Email</label>
                      <input 
                        className="border rounded px-2 py-1 w-full" 
                        type="email"
                        value={eEmail} 
                        onChange={e => setEEmail(e.target.value)} 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Address</label>
                      <AddressAutocomplete
                        value={eAddress || ''}
                        onChange={(value) => setEAddress(value)}
                        onAddressSelect={(address) => {
                          setEAddress(address.address_line1 || '');
                          if (address.city !== undefined) setEAddressCity(address.city);
                          if (address.province !== undefined) setEAddressProvince(address.province);
                          if (address.postal_code !== undefined) setEAddressPostalCode(address.postal_code);
                          if (address.country !== undefined) setEAddressCountry(address.country);
                        }}
                        placeholder="Start typing an address..."
                        className="w-full rounded border px-2 py-1"
                      />
                    </div>
                  </div>
                  <div className="text-right space-x-2">
                    <button onClick={cancelEdit} className="px-2 py-1 rounded bg-gray-100">Cancel</button>
                    <button onClick={() => handleUpdate(c.id)} className="px-2 py-1 rounded bg-brand-red text-white">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.name}</div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        {c.is_primary && <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2">Primary</span>}
                        {!c.is_primary && (
                          <button 
                            onClick={() => handleSetPrimary(c.id)} 
                            className="px-2 py-1 rounded bg-gray-100 text-xs"
                          >
                            Set Primary
                          </button>
                        )}
                        <button onClick={() => beginEdit(c)} className="px-2 py-1 rounded bg-gray-100 text-xs">Edit</button>
                        <button onClick={() => handleDelete(c.id)} className="px-2 py-1 rounded bg-gray-100 text-xs">Delete</button>
                      </div>
                    )}
                  </div>
                  {c.relationship && (
                    <div className="text-gray-600 text-xs mt-1">{c.relationship}</div>
                  )}
                  <div className="mt-2 space-y-1">
                    {c.mobile_phone && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Mobile</div>
                        <div className="text-gray-700">{c.mobile_phone}</div>
                      </div>
                    )}
                    {c.work_phone && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Work</div>
                        <div className="text-gray-700">{c.work_phone}</div>
                      </div>
                    )}
                    {c.email && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Email</div>
                        <div className="text-gray-700">{c.email}</div>
                      </div>
                    )}
                    {c.address && (
                      <div>
                        <div className="text-[11px] uppercase text-gray-500">Address</div>
                        <div className="text-gray-700">{c.address}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {(!data || !data.length) && (
          <div className="text-sm text-gray-600 col-span-2 py-8 text-center">
            No emergency contacts. {canEdit && 'Click "New Contact" to add one.'}
          </div>
        )}
      </div>
      
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">New Emergency Contact</div>
              <button 
                onClick={() => { setCreateOpen(false); }} 
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="p-4 grid md:grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Name *</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Relationship *</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={relationship} 
                  onChange={e => setRelationship(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Primary</label>
                <div className="flex items-center gap-2 mt-2">
                  <input 
                    type="checkbox" 
                    checked={isFirstContact || isPrimary} 
                    onChange={e => setIsPrimary(e.target.checked)}
                    disabled={isFirstContact}
                    className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-gray-600">
                    {isFirstContact ? 'Primary contact' : 'Set as primary contact'}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Phone *</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={mobilePhone} 
                  onChange={e => setMobilePhone(formatPhone(e.target.value))} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Work Phone</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={workPhone} 
                  onChange={e => setWorkPhone(formatPhone(e.target.value))} 
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Email</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  type="email"
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Address</label>
                <AddressAutocomplete
                  value={address || ''}
                  onChange={(value) => setAddress(value)}
                  onAddressSelect={(address) => {
                    setAddress(address.address_line1 || '');
                    if (address.city !== undefined) setAddressCity(address.city);
                    if (address.province !== undefined) setAddressProvince(address.province);
                    if (address.postal_code !== undefined) setAddressPostalCode(address.postal_code);
                    if (address.country !== undefined) setAddressCountry(address.country);
                  }}
                  placeholder="Start typing an address..."
                  className="w-full rounded border px-3 py-2"
                />
              </div>
              <div className="col-span-2 text-right">
                <button 
                  onClick={handleCreate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VisaInformationSection({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const { data, refetch } = useQuery({ 
    queryKey:['employee-visas', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/visas`) 
  });
  const [editId, setEditId] = useState<string|null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [visaType, setVisaType] = useState('');
  const [visaNumber, setVisaNumber] = useState('');
  const [issuingCountry, setIssuingCountry] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [status, setStatus] = useState('Active');
  const [notes, setNotes] = useState('');
  const [eVisaType, setEVisaType] = useState('');
  const [eVisaNumber, setEVisaNumber] = useState('');
  const [eIssuingCountry, setEIssuingCountry] = useState('');
  const [eIssuedDate, setEIssuedDate] = useState('');
  const [eExpiryDate, setEExpiryDate] = useState('');
  const [eStatus, setEStatus] = useState('Active');
  const [eNotes, setENotes] = useState('');
  const confirm = useConfirm();
  
  const getStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const s = status.toLowerCase();
    if (s.includes('current') || s.includes('active')) return 'bg-green-100 text-green-800';
    if (s.includes('expired')) return 'bg-red-100 text-red-800';
    if (s.includes('pending')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };
  
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };
  
  const getDateForInput = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };
  
  const beginEdit = (v:any)=>{
    setEditId(v.id);
    setEVisaType(v.visa_type||'');
    setEVisaNumber(v.visa_number||'');
    setEIssuingCountry(v.issuing_country||'');
    setEIssuedDate(getDateForInput(v.issued_date));
    setEExpiryDate(getDateForInput(v.expiry_date));
    setEStatus(v.status||'Active');
    setENotes(v.notes||'');
  };
  
  const cancelEdit = ()=>{
    setEditId(null);
  };
  
  const handleCreate = async () => {
    if (!visaType.trim()) {
      toast.error('Visa type is required');
      return;
    }
    try {
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/visas`, {
        visa_type: visaType,
        visa_number: visaNumber,
        issuing_country: issuingCountry,
        issued_date: issuedDate || null,
        expiry_date: expiryDate || null,
        status: status,
        notes: notes
      });
      toast.success('Visa entry created');
      setVisaType('');
      setVisaNumber('');
      setIssuingCountry('');
      setIssuedDate('');
      setExpiryDate('');
      setStatus('Active');
      setNotes('');
      setCreateOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create visa entry');
    }
  };
  
  const handleUpdate = async (visaId: string) => {
    if (!eVisaType.trim()) {
      toast.error('Visa type is required');
      return;
    }
    try {
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/visas/${visaId}`, {
        visa_type: eVisaType,
        visa_number: eVisaNumber,
        issuing_country: eIssuingCountry,
        issued_date: eIssuedDate || null,
        expiry_date: eExpiryDate || null,
        status: eStatus,
        notes: eNotes
      });
      toast.success('Visa entry updated');
      setEditId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update visa entry');
    }
  };
  
  const handleDelete = async (visaId: string) => {
    const ok = await confirm({ title:'Delete visa', message:'Are you sure you want to delete this visa entry?' });
    if(!ok) return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/visas/${visaId}`);
      toast.success('Visa entry deleted');
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete visa entry');
    }
  };
  
  const getEffectiveStatus = (v: any) => {
    if (v.status) return v.status;
    if (v.expiry_date) {
      const expiry = new Date(v.expiry_date);
      const now = new Date();
      return expiry < now ? 'EXPIRED' : 'CURRENT';
    }
    return 'CURRENT';
  };
  
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
            </svg>
          </div>
          <h5 className="font-semibold text-amber-900">Visa Information</h5>
        </div>
        {canEdit && (
          <button 
            onClick={() => setCreateOpen(true)} 
            className="px-3 py-1.5 rounded border border-amber-300 text-amber-700 text-sm font-medium hover:bg-amber-50"
          >
            Add Entry
          </button>
        )}
      </div>
      
      {data && data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-600">Date</th>
                <th className="pb-2 font-medium text-gray-600">Visa</th>
                <th className="pb-2 font-medium text-gray-600">Issuing Country</th>
                <th className="pb-2 font-medium text-gray-600">Issued</th>
                <th className="pb-2 font-medium text-gray-600">Expiration</th>
                <th className="pb-2 font-medium text-gray-600">Status</th>
                <th className="pb-2 font-medium text-gray-600">Note</th>
                {canEdit && <th className="pb-2 font-medium text-gray-600">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((v: any) => {
                const effectiveStatus = getEffectiveStatus(v);
                const isEditing = editId === v.id;
                return isEditing ? (
                  <tr key={v.id} className="border-b">
                    <td colSpan={canEdit ? 8 : 7} className="py-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-600">Visa Type *</label>
                          <input 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eVisaType} 
                            onChange={e => setEVisaType(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Visa Number</label>
                          <input 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eVisaNumber} 
                            onChange={e => setEVisaNumber(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Issuing Country</label>
                          <input 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eIssuingCountry} 
                            onChange={e => setEIssuingCountry(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Status</label>
                          <select 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eStatus} 
                            onChange={e => setEStatus(e.target.value)}
                          >
                            <option value="CURRENT">CURRENT</option>
                            <option value="EXPIRED">EXPIRED</option>
                            <option value="PENDING">PENDING</option>
                            <option value="Active">Active</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Issued Date</label>
                          <input 
                            type="date"
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eIssuedDate} 
                            onChange={e => setEIssuedDate(e.target.value)} 
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">Expiry Date</label>
                          <input 
                            type="date"
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eExpiryDate} 
                            onChange={e => setEExpiryDate(e.target.value)} 
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-gray-600">Notes</label>
                          <input 
                            className="border rounded px-2 py-1 w-full text-sm" 
                            value={eNotes} 
                            onChange={e => setENotes(e.target.value)} 
                          />
                        </div>
                        <div className="col-span-2 text-right space-x-2">
                          <button onClick={cancelEdit} className="px-2 py-1 rounded bg-gray-100 text-xs">Cancel</button>
                          <button onClick={() => handleUpdate(v.id)} className="px-2 py-1 rounded bg-brand-red text-white text-xs">Save</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={v.id} className="border-b hover:bg-gray-50">
                    <td className="py-2">{formatDate(v.issued_date)}</td>
                    <td className="py-2 font-medium">{v.visa_type || '—'}</td>
                    <td className="py-2">{v.issuing_country || '—'}</td>
                    <td className="py-2">{formatDate(v.issued_date)}</td>
                    <td className="py-2">{formatDate(v.expiry_date)}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(effectiveStatus)}`}>
                        {effectiveStatus}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">{v.notes || '—'}</td>
                    {canEdit && (
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => beginEdit(v)} className="px-2 py-1 rounded bg-gray-100 text-xs">Edit</button>
                          <button onClick={() => handleDelete(v.id)} className="px-2 py-1 rounded bg-gray-100 text-xs text-red-600">Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-gray-600 py-8 text-center">
          No visa information. {canEdit && 'Click "Add Entry" to add one.'}
        </div>
      )}
      
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Add Visa Entry</div>
              <button 
                onClick={() => { setCreateOpen(false); }} 
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Visa Type *</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={visaType} 
                  onChange={e => setVisaType(e.target.value)} 
                  placeholder="e.g., Work Permit"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Visa Number</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={visaNumber} 
                  onChange={e => setVisaNumber(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Issuing Country</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={issuingCountry} 
                  onChange={e => setIssuingCountry(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Issued Date</label>
                <input 
                  type="date"
                  className="border rounded px-3 py-2 w-full" 
                  value={issuedDate} 
                  onChange={e => setIssuedDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Expiry Date</label>
                <input 
                  type="date"
                  className="border rounded px-3 py-2 w-full" 
                  value={expiryDate} 
                  onChange={e => setExpiryDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">Status</label>
                <select 
                  className="border rounded px-3 py-2 w-full" 
                  value={status} 
                  onChange={e => setStatus(e.target.value)}
                >
                  <option value="CURRENT">CURRENT</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="PENDING">PENDING</option>
                  <option value="Active">Active</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Notes</label>
                <input 
                  className="border rounded px-3 py-2 w-full" 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  placeholder="e.g., LMIA #9164748, Roofer"
                />
              </div>
              <div className="col-span-2 text-right">
                <button 
                  onClick={handleCreate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserDocuments({ userId, canEdit }:{ userId:string, canEdit:boolean }){
  const confirm = useConfirm();
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
  const [preview, setPreview] = useState<{ url:string, title:string, ext:string }|null>(null);

  const fileExt = (name?:string)=>{
    const n = String(name||'').toLowerCase();
    const m = n.match(/\.([a-z0-9]+)$/); return m? m[1] : '';
  };
  const extStyle = (ext:string)=>{
    const e = ext.toLowerCase();
    if(e==='pdf') return { bg:'bg-[#e74c3c]', txt:'text-white' };
    if(['xls','xlsx','csv'].includes(e)) return { bg:'bg-[#27ae60]', txt:'text-white' };
    if(['doc','docx','odt','rtf'].includes(e)) return { bg:'bg-[#2980b9]', txt:'text-white' };
    if(['ppt','pptx','key'].includes(e)) return { bg:'bg-[#d35400]', txt:'text-white' };
    if(['png','jpg','jpeg','webp','gif','bmp','svg','heic','heif'].includes(e)) return { bg:'bg-[#8e44ad]', txt:'text-white' };
    if(['zip','rar','7z','tar','gz'].includes(e)) return { bg:'bg-[#34495e]', txt:'text-white' };
    if(['txt','md','json','xml','yaml','yml'].includes(e)) return { bg:'bg-[#16a085]', txt:'text-white' };
    return { bg:'bg-gray-300', txt:'text-gray-800' };
  };

  const upload = async()=>{
    try{
      if(!fileObj){ toast.error('Select a file'); return; }
      if(activeFolderId==='all'){ toast.error('Select a folder first'); return; }
      const name = fileObj.name; const type = fileObj.type || 'application/octet-stream';
      const up = await api('POST','/files/upload',{ original_name: name, content_type: type, employee_id: userId, project_id: null, client_id: null, category_id: userId });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: fileObj });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: fileObj.size, checksum_sha256: 'na', content_type: type });
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, { folder_id: activeFolderId, title: title || name, file_id: conf.id });
      toast.success('Uploaded'); setShowUpload(false); setFileObj(null); setTitle(''); await refetch();
    }catch(_e){ toast.error('Upload failed'); }
  };

  const uploadToFolder = async(folderId:string, file: File)=>{
    try{
      const name = file.name; const type = file.type || 'application/octet-stream';
      const up = await api('POST','/files/upload',{ original_name: name, content_type: type, employee_id: userId, project_id: null, client_id: null, category_id: userId });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: file });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256: 'na', content_type: type });
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, { folder_id: folderId, title: name, file_id: conf.id });
    }catch(_e){ /* noop per-file */ }
  };

  const del = async(id:string, title?:string)=>{
    const ok = await confirm({ title:'Delete file', message:`Are you sure you want to delete "${title||'file'}"?` });
    if(!ok) return;
    try{ await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(id)}`); await refetch(); }
    catch(_e){ toast.error('Delete failed'); }
  };
  const createFolder = async()=>{
    try{
      const name = newFolderName.trim(); if(!name){ toast.error('Folder name required'); return; }
      const body:any = { name };
      if(newFolderParentId) body.parent_id = newFolderParentId;
      const r = await api('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, body);
      toast.success('Folder created'); setShowNewFolder(false); setNewFolderName(''); setNewFolderParentId(null); await refetchFolders();
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {topFolders.map((f:any)=> (
              <div key={f.id}
                   className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center"
                   onClick={(e)=>{
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
                 <div className="text-4xl">📁</div>
                 <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>
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
                  <div className="folder-actions absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button title="Rename" className="p-1 rounded hover:bg-gray-100" onClick={()=> { setInlineRenameFolderId(f.id); setInlineRenameFolderName(f.name); }}>✏️</button>
                    <button title="Delete" className="p-1 rounded hover:bg-gray-100 text-red-600" onClick={()=> removeFolder(f.id)}>🗑️</button>
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
            <button title="Home" onClick={()=> setActiveFolderId('all')} className="px-2 py-2 rounded-lg border">🏠</button>
            <button
              title="Up one level"
              onClick={()=>{
                if (breadcrumb.length>1){ setActiveFolderId(breadcrumb[breadcrumb.length-2].id); } else { setActiveFolderId('all'); }
              }}
              className="px-2 py-2 rounded-lg border"
            >⬆️</button>
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
          <div
            className={`rounded-lg border ${isDragging? 'ring-2 ring-brand-red':''}`}
            onDragEnter={(e)=>{ e.preventDefault(); setIsDragging(true); }}
            onDragOver={(e)=>{ e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e)=>{ e.preventDefault(); setIsDragging(false); }}
            onDrop={async(e)=>{ e.preventDefault(); setIsDragging(false); const files = Array.from(e.dataTransfer.files||[]); if(!files.length) return; for(const file of files){ await uploadToFolder(activeFolderId, file as File); } toast.success('Uploaded'); await refetch(); }}
          >
            <div className="p-4">
              {childFolders.length>0 && (
                <div className="mb-3">
                  <div className="text-xs text-gray-600 mb-1">Subfolders</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {childFolders.map((f:any)=> (
                      <div key={f.id}
                           className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center"
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
                        <div className="text-4xl">📁</div>
                        <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>
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
                          <div className="folder-actions absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button title="Rename" className="p-1 rounded hover:bg-gray-100" onClick={()=> { setInlineRenameFolderId(f.id); setInlineRenameFolderName(f.name); }}>✏️</button>
                            <button title="Delete" className="p-1 rounded hover:bg-gray-100 text-red-600" onClick={()=> removeFolder(f.id)}>🗑️</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mb-3 flex items-center gap-2">
                <div className="text-xs text-gray-600">Drag & drop files anywhere below to upload into this folder</div>
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
              <div className="rounded-lg border overflow-hidden bg-white">
                {(docs||[]).map((d:any)=> (
                  <div key={d.id} className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 ${selectMode && selectedDocIds.has(d.id)? 'bg-red-50':''}`} draggable={canEdit}
                       onDragStart={(e)=>{ try{ e.dataTransfer.setData('application/x-mkhub-doc', d.id); e.dataTransfer.effectAllowed='move'; }catch(_){} }}>
                    {selectMode && (
                      <input type="checkbox" className="mr-1" checked={selectedDocIds.has(d.id)} onChange={(e)=>{
                        setSelectedDocIds(prev=>{ const next = new Set(prev); if(e.target.checked) next.add(d.id); else next.delete(d.id); return next; });
                      }} />
                    )}
                    {(()=>{ const ext=fileExt(d.title).toUpperCase(); const s=extStyle(ext);
                      return (
                        <div className={`w-10 h-12 rounded-lg ${s.bg} ${s.txt} flex items-center justify-center text-[10px] font-extrabold select-none`}>{ext||'FILE'}</div>
                      ); })()}
                    <div className="flex-1 min-w-0" onClick={async()=>{
                      try{
                        const r:any = await api('GET', `/files/${encodeURIComponent(d.file_id)}/download`);
                        const ext = fileExt(d.title);
                        setPreview({ url: r.download_url||'', title: d.title||'Preview', ext });
                      }catch(_e){ toast.error('Preview not available'); }
                    }}>
                      <div className="font-medium truncate cursor-pointer hover:underline">{d.title||'Document'}</div>
                      <div className="text-[11px] text-gray-600 truncate">Uploaded {String(d.created_at||'').slice(0,10)}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <a title="Download" className="p-2 rounded hover:bg-gray-100" href={`/files/${d.file_id}/download`} target="_blank">⬇️</a>
                      {canEdit && <>
                        <button title="Rename" onClick={()=> setRenameDoc({ id: d.id, title: d.title||'' })} className="p-2 rounded hover:bg-gray-100">✏️</button>
                        <button title="Move" onClick={()=> setMoveDoc({ id: d.id })} className="p-2 rounded hover:bg-gray-100">📁</button>
                        <button title="Delete" onClick={()=>del(d.id, d.title)} className="p-2 rounded hover:bg-gray-100 text-red-600">🗑️</button>
                      </>}
                    </div>
                  </div>
                ))}
                {!(docs||[]).length && <div className="px-3 py-3 text-sm text-gray-600">No documents in this folder</div>}
              </div>
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

      {preview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={()=> setPreview(null)}>
          <div className="bg-white rounded-xl w-[92vw] h-[88vh] p-3 relative" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold truncate mr-4">{preview.title}</div>
              <button onClick={()=> setPreview(null)} className="px-3 py-1.5 rounded border">Close</button>
            </div>
            <div className="w-full h-[calc(100%-40px)] border rounded overflow-hidden bg-gray-50">
              {['png','jpg','jpeg','webp','gif','bmp','svg'].includes(preview.ext) ? (
                <img src={preview.url} className="w-full h-full object-contain" />
              ) : preview.ext==='pdf' ? (
                <iframe src={preview.url} className="w-full h-full" />
              ) : (
                <div className="p-6 text-sm text-gray-600">Preview not available. <a className="underline" href={preview.url} target="_blank">Download</a></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


