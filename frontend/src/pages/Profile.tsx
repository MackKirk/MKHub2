import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

type ProfileResp = { user:{ username:string, email:string }, profile?: any };

export default function Profile(){
  const { data, isLoading } = useQuery({ queryKey:['meProfile'], queryFn: ()=>api<ProfileResp>('GET','/auth/me/profile') });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const p = data?.profile || {};
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
              <div className="text-3xl font-extrabold">{p.first_name||data?.user?.username} {p.last_name||''}</div>
              <div className="text-sm opacity-90 mt-1">{p.job_title||data?.user?.email||''}</div>
              <div className="mt-auto flex gap-3">
                <a className="px-4 py-2 rounded-full bg-white text-black" href="#">Personal</a>
                <a className="px-4 py-2 rounded-full bg-white text-black" href="#">Job</a>
                <a className="px-4 py-2 rounded-full bg-white text-black" href="#">Emergency</a>
                <a className="px-4 py-2 rounded-full bg-white text-black" href="#">Documents</a>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-gray-600">Preferred name</label>
                <input className="w-full rounded-lg border px-3 py-2" defaultValue={p.preferred_name||''} />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-gray-600">Phone</label>
                <input className="w-full rounded-lg border px-3 py-2" defaultValue={p.phone||''} />
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}


