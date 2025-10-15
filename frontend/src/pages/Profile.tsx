import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

type ProfileResp = { user:{ username:string, email:string, first_name?:string, last_name?:string }, profile?: any };

export default function Profile(){
  const { data, isLoading } = useQuery({ queryKey:['meProfile'], queryFn: ()=>api<ProfileResp>('GET','/auth/me/profile') });
  const p = data?.profile || {};
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<'personal'|'job'|'emergency'|'docs'>('personal');
  // Local form state
  const [form, setForm] = useState<any>({});
  useMemo(()=>{ if (data){ setForm({
    preferred_name: p.preferred_name||'',
    phone: p.phone||'', mobile_phone: p.mobile_phone||'',
    gender: p.gender||'', marital_status: p.marital_status||'',
    date_of_birth: p.date_of_birth||'', nationality: p.nationality||'',
    address_line1: p.address_line1||'', address_line2: p.address_line2||'',
    city: p.city||'', province: p.province||'', postal_code: p.postal_code||'', country: p.country||'',
    hire_date: p.hire_date||'', termination_date: p.termination_date||'',
    job_title: p.job_title||'', division: p.division||'', work_email: p.work_email||'', work_phone: p.work_phone||'',
    manager_user_id: p.manager_user_id||'', pay_rate: p.pay_rate||'', pay_type: p.pay_type||'', employment_type: p.employment_type||'',
    sin_number: p.sin_number||'', work_permit_status: p.work_permit_status||'', visa_status: p.visa_status||'',
    emergency_contact_name: p.emergency_contact_name||'', emergency_contact_relationship: p.emergency_contact_relationship||'', emergency_contact_phone: p.emergency_contact_phone||''
  }); } }, [data]);
  const set = (k:string, v:any)=> setForm((s:any)=>({ ...s, [k]: v }));
  return (
    <div>
      <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="rounded-xl border shadow-hero bg-white">
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
                <button onClick={()=>setTab('personal')} className={`px-4 py-2 rounded-full ${tab==='personal'?'bg-black text-white':'bg-white text-black'}`}>Personal</button>
                <button onClick={()=>setTab('job')} className={`px-4 py-2 rounded-full ${tab==='job'?'bg-black text-white':'bg-white text-black'}`}>Job</button>
                <button onClick={()=>setTab('emergency')} className={`px-4 py-2 rounded-full ${tab==='emergency'?'bg-black text-white':'bg-white text-black'}`}>Emergency</button>
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
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Preferred name"><input value={form.preferred_name} onChange={e=>set('preferred_name', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Phone"><input value={form.phone} onChange={e=>set('phone', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Mobile phone"><input value={form.mobile_phone} onChange={e=>set('mobile_phone', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Gender"><input value={form.gender} onChange={e=>set('gender', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Marital status"><input value={form.marital_status} onChange={e=>set('marital_status', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Date of birth (YYYY-MM-DD)"><input value={form.date_of_birth} onChange={e=>set('date_of_birth', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Nationality"><input value={form.nationality} onChange={e=>set('nationality', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Address line 1"><input value={form.address_line1} onChange={e=>set('address_line1', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Address line 2"><input value={form.address_line2} onChange={e=>set('address_line2', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="City"><input value={form.city} onChange={e=>set('city', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Province/State"><input value={form.province} onChange={e=>set('province', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Postal code"><input value={form.postal_code} onChange={e=>set('postal_code', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Country"><input value={form.country} onChange={e=>set('country', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                </div>
              )}
              {tab==='job' && (
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Hire date (YYYY-MM-DD)"><input value={form.hire_date} onChange={e=>set('hire_date', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Termination date (YYYY-MM-DD)"><input value={form.termination_date} onChange={e=>set('termination_date', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Job title"><input value={form.job_title} onChange={e=>set('job_title', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Division"><input value={form.division} onChange={e=>set('division', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Work email"><input value={form.work_email} onChange={e=>set('work_email', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Work phone"><input value={form.work_phone} onChange={e=>set('work_phone', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Manager user id"><input value={form.manager_user_id} onChange={e=>set('manager_user_id', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Pay rate"><input value={form.pay_rate} onChange={e=>set('pay_rate', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Pay type"><input value={form.pay_type} onChange={e=>set('pay_type', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Employment type"><input value={form.employment_type} onChange={e=>set('employment_type', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                </div>
              )}
              {tab==='emergency' && (
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="SIN/SSN"><input value={form.sin_number} onChange={e=>set('sin_number', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Work permit status"><input value={form.work_permit_status} onChange={e=>set('work_permit_status', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Visa status"><input value={form.visa_status} onChange={e=>set('visa_status', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Emergency contact name"><input value={form.emergency_contact_name} onChange={e=>set('emergency_contact_name', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Emergency contact relationship"><input value={form.emergency_contact_relationship} onChange={e=>set('emergency_contact_relationship', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                  <Field label="Emergency contact phone"><input value={form.emergency_contact_phone} onChange={e=>set('emergency_contact_phone', e.target.value)} className="w-full rounded-lg border px-3 py-2"/></Field>
                </div>
              )}
              {tab==='docs' && (
                <div className="text-sm text-gray-600">Documents section coming soon.</div>
              )}
              <div className="flex justify-end mt-6">
                <button onClick={async()=>{
                  try{
                    await api('PUT','/auth/me/profile', form);
                    toast.success('Profile saved');
                    await queryClient.invalidateQueries({ queryKey:['meProfile'] });
                  }catch(e){ toast.error('Failed to save'); }
                }} className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] font-bold">Save</button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Field({label, children}:{label:string, children:any}){
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600">{label}</label>
      {children}
    </div>
  );
}


