import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';

export default function ProposalEdit(){
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey:['proposal', id], queryFn: ()=> api<any>('GET', `/proposals/${id}`) });
  const p = data||{};
  const d = p?.data || {};
  const clientId = String(p?.client_id||'');
  const siteId = String(p?.site_id||'');
  const projectId = String(p?.project_id||'');

  const [coverTitle, setCoverTitle] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [date, setDate] = useState('');
  const [createdFor, setCreatedFor] = useState('');
  const [primary, setPrimary] = useState<{ name?:string, phone?:string, email?:string }>({});
  const [typeOfProject, setTypeOfProject] = useState('');
  const [otherNotes, setOtherNotes] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [bidPrice, setBidPrice] = useState<string>('');
  const [costs, setCosts] = useState<{ label:string, amount:string }[]>([]);
  const [terms, setTerms] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [coverFoId, setCoverFoId] = useState<string|undefined>(undefined);
  const [page2FoId, setPage2FoId] = useState<string|undefined>(undefined);
  const [pickerFor, setPickerFor] = useState<null|'cover'|'page2'>(null);
  const [sectionPicker, setSectionPicker] = useState<{ secId:string }|null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [page2Preview, setPage2Preview] = useState<string>('');

  const total = useMemo(()=>{ const base = Number(bidPrice||'0'); const extra = costs.reduce((a,c)=> a + Number(c.amount||'0'), 0); return (base+extra).toFixed(2); }, [bidPrice, costs]);

  useEffect(()=>{
    if (!p?.id) return;
    setCoverTitle(String(d.cover_title||p.title||'Proposal'));
    setOrderNumber(String(p.order_number||d.order_number||''));
    setDate(String(d.date||'').slice(0,10));
    setCreatedFor(String(d.proposal_created_for||''));
    setPrimary({ name: d.primary_contact_name, phone: d.primary_contact_phone, email: d.primary_contact_email });
    setTypeOfProject(String(d.type_of_project||''));
    setOtherNotes(String(d.other_notes||''));
    setProjectDescription(String(d.project_description||''));
    setAdditionalNotes(String(d.additional_project_notes||''));
    setBidPrice(String(d.bid_price ?? ''));
    const dc = Array.isArray(d.additional_costs)? d.additional_costs : [];
    setCosts(dc.map((c:any)=> ({ label: String(c.label||''), amount: String(c.value ?? c.amount ?? '') })));
    setTerms(String(d.terms_text||''));
    setSections(Array.isArray(d.sections)? d.sections : []);
    setCoverFoId(d.cover_file_object_id||undefined);
    setPage2FoId(d.page2_file_object_id||undefined);
  }, [p?.id]);

  useEffect(()=>{
    setCoverPreview(coverFoId? `/files/${coverFoId}/thumbnail?w=600` : '');
    setPage2Preview(page2FoId? `/files/${page2FoId}/thumbnail?w=600` : '');
  }, [coverFoId, page2FoId]);

  const save = async()=>{
    try{
      const payload:any = {
        id,
        project_id: projectId||null,
        client_id: p?.client_id||null,
        site_id: p?.site_id||null,
        cover_title: coverTitle,
        order_number: orderNumber||null,
        date,
        proposal_created_for: createdFor||null,
        primary_contact_name: primary.name||null,
        primary_contact_phone: primary.phone||null,
        primary_contact_email: primary.email||null,
        type_of_project: typeOfProject||null,
        other_notes: otherNotes||null,
        project_description: projectDescription||null,
        additional_project_notes: additionalNotes||null,
        bid_price: Number(bidPrice||'0'),
        total: Number(total||'0'),
        terms_text: terms||'',
        additional_costs: costs.map(c=> ({ label: c.label, value: Number(c.amount||'0') })),
        sections,
        cover_file_object_id: coverFoId||null,
        page2_file_object_id: page2FoId||null,
      };
      await api('POST','/proposals', payload);
      toast.success('Saved');
      if (projectId) nav(`/projects/${encodeURIComponent(projectId)}`);
    }catch(e){ toast.error('Save failed'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Edit Proposal</h1>
      {isLoading? <div className="h-24 bg-gray-100 animate-pulse rounded"/> : (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-600">Document Type</label><input className="w-full border rounded px-3 py-2" value={coverTitle} onChange={e=>setCoverTitle(e.target.value)} /></div>
            <div><label className="text-xs text-gray-600">Order Number</label><input className="w-full border rounded px-3 py-2" value={orderNumber} onChange={e=>setOrderNumber(e.target.value)} /></div>
            <div><label className="text-xs text-gray-600">Date</label><input type="date" className="w-full border rounded px-3 py-2" value={date} onChange={e=>setDate(e.target.value)} /></div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-600">Created For</label><input className="w-full border rounded px-3 py-2" value={createdFor} onChange={e=>setCreatedFor(e.target.value)} /></div>
            <div><label className="text-xs text-gray-600">Primary Name</label><input className="w-full border rounded px-3 py-2" value={primary.name||''} onChange={e=>setPrimary(v=>({ ...v, name: e.target.value }))} /></div>
            <div><label className="text-xs text-gray-600">Phone</label><input className="w-full border rounded px-3 py-2" value={primary.phone||''} onChange={e=>setPrimary(v=>({ ...v, phone: e.target.value }))} /></div>
            <div><label className="text-xs text-gray-600">Email</label><input className="w-full border rounded px-3 py-2" value={primary.email||''} onChange={e=>setPrimary(v=>({ ...v, email: e.target.value }))} /></div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-600">Type</label><input className="w-full border rounded px-3 py-2" value={typeOfProject} onChange={e=>setTypeOfProject(e.target.value)} /></div>
            <div><label className="text-xs text-gray-600">Other Notes</label><input className="w-full border rounded px-3 py-2" value={otherNotes} onChange={e=>setOtherNotes(e.target.value)} /></div>
          </div>
          <div>
            <label className="text-xs text-gray-600">Project Description</label>
            <textarea className="w-full border rounded px-3 py-2" rows={4} value={projectDescription} onChange={e=>setProjectDescription(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Additional Notes</label>
            <textarea className="w-full border rounded px-3 py-2" rows={3} value={additionalNotes} onChange={e=>setAdditionalNotes(e.target.value)} />
          </div>
          <div>
            <h3 className="font-semibold mb-2">Images</h3>
            <div className="flex items-start gap-6 text-sm">
              <div>
                <div className="mb-1">Cover Image</div>
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=>setPickerFor('cover')}>Choose</button>
                {coverPreview && <div className="mt-2"><img src={coverPreview} className="w-48 h-36 object-cover rounded border" /></div>}
              </div>
              <div>
                <div className="mb-1">Page 2 Image</div>
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=>setPickerFor('page2')}>Choose</button>
                {page2Preview && <div className="mt-2"><img src={page2Preview} className="w-48 h-36 object-cover rounded border" /></div>}
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-600">Bid Price</label><input className="w-full border rounded px-3 py-2" value={bidPrice} onChange={e=>setBidPrice(e.target.value)} /></div>
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Total</label><div className="w-full border rounded px-3 py-2 bg-gray-50">${total}</div></div>
          </div>
          <div>
            <div className="text-sm font-semibold mb-1">Additional Costs</div>
            <div className="space-y-2">
              {costs.map((c, i)=> (
                <div key={i} className="grid grid-cols-5 gap-2">
                  <input className="col-span-3 border rounded px-3 py-2" placeholder="Label" value={c.label} onChange={e=>{ const v=e.target.value; setCosts(arr=> arr.map((x,j)=> j===i? { ...x, label:v }: x)); }} />
                  <input className="col-span-1 border rounded px-3 py-2" placeholder="Amount" value={c.amount} onChange={e=>{ const v=e.target.value; setCosts(arr=> arr.map((x,j)=> j===i? { ...x, amount:v }: x)); }} />
                  <button className="col-span-1 px-2 py-2 rounded bg-gray-100" onClick={()=> setCosts(arr=> arr.filter((_,j)=> j!==i))}>Remove</button>
                </div>
              ))}
              <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setCosts(arr=> [...arr, { label:'', amount:'' }])}>+ Add Cost</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600">Terms</label>
            <textarea className="w-full border rounded px-3 py-2" rows={4} value={terms} onChange={e=>setTerms(e.target.value)} />
          </div>
          <div>
            <h3 className="font-semibold mb-2">Sections</h3>
            <div className="space-y-3">
              {sections.map((s:any, idx:number)=> (
                <div key={s.id||idx} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <input className="w-1/2 border rounded px-3 py-2 text-sm" placeholder="Section title" value={s.title||''} onChange={e=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, title: e.target.value }: x))} />
                    <button className="px-2 py-1 rounded bg-gray-100 text-xs" onClick={()=> setSections(arr=> arr.filter((_,i)=> i!==idx))}>Remove</button>
                  </div>
                  {s.type==='text' ? (
                    <textarea className="w-full border rounded px-3 py-2 text-sm" rows={5} placeholder="Section text" value={s.text||''} onChange={e=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, text: e.target.value }: x))} />
                  ) : (
                    <div>
                      <div className="mb-2"><button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setSectionPicker({ secId: s.id||String(idx) })}>+ Add Image</button></div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(s.images||[]).map((img:any, j:number)=> (
                          <div key={(img.file_object_id||'')+j} className="border rounded p-2">
                            {img.file_object_id? (<img src={`/files/${img.file_object_id}/thumbnail?w=400`} className="w-full h-24 object-cover rounded" />) : null}
                            <input className="mt-2 w-full border rounded px-2 py-1 text-sm" placeholder="Caption" value={img.caption||''} onChange={e=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, images: (x.images||[]).map((it:any,k:number)=> k===j? { ...it, caption: e.target.value }: it) }: x))} />
                            <div className="mt-2 text-right"><button className="px-2 py-1 rounded bg-gray-100 text-xs" onClick={()=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, images: (x.images||[]).filter((_:any,k:number)=> k!==j) }: x))}>Remove</button></div>
                          </div>
                        ))}
                        {!(s.images||[]).length && <div className="text-sm text-gray-600">No images</div>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setSections(arr=> [...arr, { id: 'sec_'+Math.random().toString(36).slice(2), type:'text', title:'', text:'' }])}>+ Text Section</button>
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setSections(arr=> [...arr, { id: 'sec_'+Math.random().toString(36).slice(2), type:'images', title:'', images: [] }])}>+ Images Section</button>
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button className="px-3 py-2 rounded bg-gray-100" onClick={()=> nav(-1)}>Back</button>
            <button className="px-3 py-2 rounded bg-brand-red text-white" onClick={save}>Save</button>
          </div>
        </div>
      )}
      {pickerFor && (
        <ImagePicker isOpen={true} onClose={()=>setPickerFor(null)} clientId={clientId||undefined} targetWidth={pickerFor==='cover'? 566: 540} targetHeight={pickerFor==='cover'? 537: 340} allowEdit={true} onConfirm={async(blob)=>{
          try{
            if (!blob){ toast.error('No image'); setPickerFor(null); return; }
            const cat = pickerFor==='cover'? 'proposal-cover' : 'proposal-page2';
            const up:any = await api('POST','/files/upload',{ project_id: null, client_id: clientId||null, employee_id: null, category_id: cat, original_name: `${cat}.jpg`, content_type: 'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            if (pickerFor==='cover'){ setCoverFoId(conf.id); }
            else { setPage2FoId(conf.id); }
          }catch(e){ toast.error('Upload failed'); }
          setPickerFor(null);
        }} />
      )}
      {sectionPicker && (
        <ImagePicker isOpen={true} onClose={()=>setSectionPicker(null)} clientId={clientId||undefined} targetWidth={260} targetHeight={150} allowEdit={true} onConfirm={async(blob)=>{
          try{
            if (!blob){ toast.error('No image'); return; }
            const up:any = await api('POST','/files/upload',{ project_id: null, client_id: clientId||null, employee_id: null, category_id:'proposal-section', original_name:'section.jpg', content_type: 'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            const fileObjectId = conf.id;
            setSections(arr=> arr.map((x:any)=>{
              if ((x.id||'')===(sectionPicker.secId||'')){
                const imgs = Array.isArray(x.images)? x.images : [];
                return { ...x, images: [...imgs, { file_object_id: fileObjectId, caption: '' }] };
              }
              return x;
            }));
          }catch(e){ toast.error('Failed to add image'); }
          setSectionPicker(null);
        }} />
      )}
    </div>
  );
}


