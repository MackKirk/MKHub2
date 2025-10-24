import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';

type Client = { id:string, name?:string, display_name?:string, address_line1?:string, city?:string, province?:string, country?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };

export default function ProposalForm({ mode, clientId: clientIdProp, siteId: siteIdProp, projectId: projectIdProp, initial }:{ mode:'new'|'edit', clientId?:string, siteId?:string, projectId?:string, initial?: any }){
  const nav = useNavigate();

  const [clientId] = useState<string>(String(clientIdProp || initial?.client_id || ''));
  const [siteId] = useState<string>(String(siteIdProp || initial?.site_id || ''));
  const [projectId] = useState<string>(String(projectIdProp || initial?.project_id || ''));

  const { data:client } = useQuery({ queryKey:['client', clientId], queryFn: ()=> clientId? api<Client>('GET', `/clients/${clientId}`): Promise.resolve(null) });
  const { data:sites } = useQuery({ queryKey:['sites', clientId], queryFn: ()=> clientId? api<Site[]>('GET', `/clients/${clientId}/sites`): Promise.resolve([]) });
  const site = (sites||[]).find(s=> String(s.id)===String(siteId));
  const { data:nextCode } = useQuery({ queryKey:['proposalCode', clientId], queryFn: ()=> (mode==='new' && clientId)? api<any>('GET', `/proposals/next-code?client_id=${encodeURIComponent(clientId)}`) : Promise.resolve(null) });

  // form state
  const [coverTitle, setCoverTitle] = useState<string>('Proposal');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [createdFor, setCreatedFor] = useState<string>('');
  const [primary, setPrimary] = useState<{ name?:string, phone?:string, email?:string }>({});
  const [typeOfProject, setTypeOfProject] = useState<string>('');
  const [otherNotes, setOtherNotes] = useState<string>('');
  const [projectDescription, setProjectDescription] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  const [bidPrice, setBidPrice] = useState<string>('');
  const [costs, setCosts] = useState<{ label:string, amount:string }[]>([]);
  const total = useMemo(()=>{ const base = Number(bidPrice||'0'); const extra = costs.reduce((a,c)=> a + Number(c.amount||'0'), 0); return (base+extra).toFixed(2); }, [bidPrice, costs]);
  const [terms, setTerms] = useState<string>('');
  const [sections, setSections] = useState<any[]>([]);
  const [coverBlob, setCoverBlob] = useState<Blob|null>(null);
  const [coverFoId, setCoverFoId] = useState<string|undefined>(undefined);
  const [page2Blob, setPage2Blob] = useState<Blob|null>(null);
  const [page2FoId, setPage2FoId] = useState<string|undefined>(undefined);
  const [pickerFor, setPickerFor] = useState<null|'cover'|'page2'>(null);
  const [sectionPicker, setSectionPicker] = useState<{ secId:string, index?: number }|null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [page2Preview, setPage2Preview] = useState<string>('');
  const newImageId = ()=> 'img_'+Math.random().toString(36).slice(2);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [lastSavedHash, setLastSavedHash] = useState<string>('');
  const [lastGeneratedHash, setLastGeneratedHash] = useState<string>('');
  const [isReady, setIsReady] = useState<boolean>(false);

  // prefill from initial (edit)
  useEffect(()=>{
    if (!initial) return;
    const d = initial?.data || {};
    setCoverTitle(String(d.cover_title || initial.title || 'Proposal'));
    setOrderNumber(String(initial.order_number || d.order_number || ''));
    setDate(String(d.date||'').slice(0,10) || new Date().toISOString().slice(0,10));
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
    const loaded = Array.isArray(d.sections)? JSON.parse(JSON.stringify(d.sections)) : [];
    const normalized = loaded.map((sec:any)=>{
      if (sec?.type==='images'){
        const imgs = (sec.images||[]).map((im:any)=> ({ image_id: im.image_id || newImageId(), file_object_id: String(im.file_object_id||''), caption: String(im.caption||'') }));
        return { type:'images', title: String(sec.title||''), images: imgs };
      }
      return { type:'text', title: String(sec.title||''), text: String(sec.text||'') };
    });
    setSections(normalized);
    setCoverFoId(d.cover_file_object_id||undefined);
    setPage2FoId(d.page2_file_object_id||undefined);
    setIsReady(true);
  }, [initial?.id]);

  // When creating new (no initial), mark ready on mount
  useEffect(()=>{ if (mode==='new') setIsReady(true); }, [mode]);

  // derive company fields
  const companyName = (client?.display_name || client?.name || '').slice(0,50);
  const companyAddress = useMemo(()=>{
    if (site) return [site.site_address_line1, site.site_city, site.site_province, site.site_country].filter(Boolean).join(', ').slice(0,50);
    return [client?.address_line1, client?.city, client?.province, client?.country].filter(Boolean).join(', ').slice(0,50);
  }, [client, site]);

  // init order number for new
  useEffect(()=>{ if(mode==='new' && !orderNumber && nextCode?.order_number) setOrderNumber(nextCode.order_number); }, [mode, nextCode]);

  useEffect(()=>{
    if (coverFoId) setCoverPreview(`/files/${coverFoId}/thumbnail?w=600`);
    else if (coverBlob) setCoverPreview(URL.createObjectURL(coverBlob));
    else setCoverPreview('');
    if (page2FoId) setPage2Preview(`/files/${page2FoId}/thumbnail?w=600`);
    else if (page2Blob) setPage2Preview(URL.createObjectURL(page2Blob));
    else setPage2Preview('');
    return ()=>{};
  }, [coverFoId, coverBlob, page2FoId, page2Blob]);

  const sanitizeSections = (arr:any[])=> (arr||[]).map((sec:any)=>{
    if (sec?.type==='images'){
      return {
        type: 'images',
        title: String(sec.title||''),
        images: (sec.images||[]).map((im:any)=> ({ file_object_id: String(im.file_object_id||''), caption: String(im.caption||'') }))
      };
    }
    return { type:'text', title: String(sec?.title||''), text: String(sec?.text||'') };
  });

  const currentFingerprint = useMemo(()=>{
    try{
      const payload = {
        coverTitle,
        orderNumber,
        date,
        createdFor,
        primary,
        typeOfProject,
        otherNotes,
        projectDescription,
        additionalNotes,
        bidPrice,
        costs,
        terms,
        sections: sanitizeSections(sections),
        coverFoId,
        page2FoId,
        clientId,
        siteId,
        projectId,
      };
      return JSON.stringify(payload);
    }catch(_e){ return Math.random().toString(36); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverTitle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, bidPrice, costs, terms, sections, coverFoId, page2FoId, clientId, siteId, projectId]);

  // Initialize saved hash only after fields are populated (isReady)
  useEffect(()=>{ if (isReady && !lastSavedHash) setLastSavedHash(currentFingerprint); }, [isReady, currentFingerprint, lastSavedHash]);

  const handleSave = async()=>{
    try{
      const payload:any = {
        id: mode==='edit'? initial?.id : undefined,
        project_id: projectId||null,
        client_id: clientId||null,
        site_id: siteId||null,
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
        sections: sanitizeSections(sections),
        cover_file_object_id: coverFoId||null,
        page2_file_object_id: page2FoId||null,
      };
      const r:any = await api('POST','/proposals', payload);
      toast.success('Saved');
      const back = projectId? `/projects/${encodeURIComponent(projectId)}` : '/proposals';
      if (r?.id || initial?.id){ nav(back); }
      setLastSavedHash(currentFingerprint);
    }catch(e){ toast.error('Save failed'); }
  };

  const handleGenerate = async()=>{
    try{
      setIsGenerating(true);
      // cleanup previous
      try{ if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(''); } }catch(_e){}
      const form = new FormData();
      form.append('cover_title', coverTitle||'Proposal');
      form.append('order_number', orderNumber||'');
      form.append('company_name', companyName||'');
      form.append('company_address', companyAddress||'');
      form.append('date', date||'');
      form.append('project_name_description', projectDescription||'');
      form.append('proposal_created_for', createdFor||'');
      form.append('primary_contact_name', primary.name||'');
      form.append('primary_contact_phone', primary.phone||'');
      form.append('primary_contact_email', primary.email||'');
      form.append('type_of_project', typeOfProject||'');
      form.append('other_notes', otherNotes||'');
      form.append('additional_project_notes', additionalNotes||'');
      form.append('bid_price', String(Number(bidPrice||'0')));
      form.append('total', String(Number(total||'0')));
      form.append('terms_text', terms||'');
      form.append('additional_costs', JSON.stringify(costs.map(c=> ({ label: c.label, value: Number(c.amount||'0') }))));
      form.append('sections', JSON.stringify(sanitizeSections(sections)));
      if (coverFoId) form.append('cover_file_object_id', coverFoId);
      if (page2FoId) form.append('page2_file_object_id', page2FoId);
      if (coverBlob) form.append('cover_image', coverBlob, 'cover.jpg');
      if (page2Blob) form.append('page2_image', page2Blob, 'page2.jpg');
      const token = localStorage.getItem('user_token');
      const resp = await fetch('/proposals/generate', { method:'POST', headers: token? { Authorization: 'Bearer '+token } : undefined, body: form });
      if (!resp.ok){ toast.error('Generate failed'); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      toast.success('Proposal ready');
      setLastGeneratedHash(currentFingerprint);
    }catch(e){ toast.error('Generate failed'); }
    finally{ setIsGenerating(false); }
  };

  // drag helpers
  const [draggingSection, setDraggingSection] = useState<number|null>(null);
  const [dragOverSection, setDragOverSection] = useState<number|null>(null);
  const onSectionDragStart = (idx:number)=> setDraggingSection(idx);
  const onSectionDragOver = (idx:number)=> setDragOverSection(idx);
  const onSectionDrop = ()=>{
    if (draggingSection===null || dragOverSection===null || draggingSection===dragOverSection) { setDraggingSection(null); setDragOverSection(null); return; }
    setSections(arr=>{
      const next = [...arr];
      const [moved] = next.splice(draggingSection,1);
      next.splice(dragOverSection,0,moved);
      return next;
    });
    setDraggingSection(null); setDragOverSection(null);
  };

  const onImageDragStart = (secIdx:number, imgIdx:number)=> setSectionPicker({ secId: String(secIdx), index: imgIdx });
  const onImageDragOver = (e: React.DragEvent)=> e.preventDefault();
  const onImageDrop = (secIdx:number, targetIdx:number)=>{
    const picked = sectionPicker; setSectionPicker(null);
    if (!picked || typeof picked.index!=='number') return;
    setSections(arr=> arr.map((s:any,i:number)=>{
      if (i!==secIdx) return s;
      const imgs = Array.isArray(s.images)? [...s.images]:[];
      const [moved] = imgs.splice(picked.index,1);
      imgs.splice(targetIdx,0,moved);
      return { ...s, images: imgs };
    }));
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <h2 className="text-xl font-bold mb-3">{mode==='edit'? 'Edit Proposal':'Create Proposal'}</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold mb-2">Company Info</h3>
          <div className="space-y-2 text-sm">
            <div><label className="text-xs text-gray-600">Document Type</label><input className="w-full border rounded px-3 py-2" value={coverTitle} onChange={e=>setCoverTitle(e.target.value)} maxLength={44} /></div>
            <div><label className="text-xs text-gray-600">Order Number</label><input className="w-full border rounded px-3 py-2" value={orderNumber} onChange={e=>setOrderNumber(e.target.value)} placeholder={nextCode?.order_number||''} /></div>
            <div><label className="text-xs text-gray-600">Company Name</label><input className="w-full border rounded px-3 py-2" value={companyName} readOnly /></div>
            <div><label className="text-xs text-gray-600">Company Address</label><input className="w-full border rounded px-3 py-2" value={companyAddress} readOnly /></div>
            <div><label className="text-xs text-gray-600">Date</label><input type="date" className="w-full border rounded px-3 py-2" value={date} onChange={e=>setDate(e.target.value)} /></div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Project Details</h3>
          <div className="space-y-2 text-sm">
            <div><label className="text-xs text-gray-600">Proposal Created For</label><input className="w-full border rounded px-3 py-2" value={createdFor} onChange={e=>setCreatedFor(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-gray-600">Primary Name</label><input className="w-full border rounded px-3 py-2" value={primary.name||''} onChange={e=>setPrimary(p=>({ ...p, name: e.target.value }))} /></div>
              <div><label className="text-xs text-gray-600">Phone</label><input className="w-full border rounded px-3 py-2" value={primary.phone||''} onChange={e=>setPrimary(p=>({ ...p, phone: e.target.value }))} /></div>
              <div><label className="text-xs text-gray-600">Email</label><input className="w-full border rounded px-3 py-2" value={primary.email||''} onChange={e=>setPrimary(p=>({ ...p, email: e.target.value }))} /></div>
            </div>
            <div><label className="text-xs text-gray-600">Type of Project</label><input className="w-full border rounded px-3 py-2" value={typeOfProject} onChange={e=>setTypeOfProject(e.target.value)} /></div>
            <div><label className="text-xs text-gray-600">Other Notes</label><textarea className="w-full border rounded px-3 py-2" value={otherNotes} onChange={e=>setOtherNotes(e.target.value)} /></div>
          </div>
        </div>
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-2">Images</h3>
          <div className="flex items-center gap-3 text-sm">
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
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-2">Sections</h3>
          <div className="space-y-3">
            {sections.map((s:any, idx:number)=> (
              <div key={s.id||idx}
                   className={`border rounded p-3 ${dragOverSection===idx? 'ring-2 ring-brand-red':''}`}
                   draggable
                   onDragStart={()=> onSectionDragStart(idx)}
                   onDragOver={(e)=>{ e.preventDefault(); onSectionDragOver(idx); }}
                   onDrop={onSectionDrop}
              >
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
                        <div key={`${img.image_id||img.file_object_id||''}-${j}`} className="border rounded p-2"
                             draggable
                             onDragStart={()=> onImageDragStart(idx, j)}
                             onDragOver={onImageDragOver}
                             onDrop={()=> onImageDrop(idx, j)}
                        >
                          {img.file_object_id? (<img src={`/files/${img.file_object_id}/thumbnail?w=400`} className="w-full h-24 object-cover rounded" />) : null}
                          <input className="mt-2 w-full border rounded px-2 py-1 text-sm" placeholder="Caption" value={img.caption||''} onChange={e=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, images: (x.images||[]).map((it:any,k:number)=> k===j? { ...it, caption: e.target.value }: it) }: x))} />
                          <div className="mt-2 flex items-center justify-between">
                            <button className="px-2 py-1 rounded bg-gray-100 text-xs" onClick={()=> setSectionPicker({ secId: s.id||String(idx), index: j })}>Replace</button>
                            <button className="px-2 py-1 rounded bg-gray-100 text-xs" onClick={()=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, images: (x.images||[]).filter((_:any,k:number)=> k!==j) }: x))}>Remove</button>
                          </div>
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
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-2">Pricing</h3>
          <div className="text-[12px] text-gray-600 mb-2">If the total is 0, the pricing section will be hidden in the PDF.</div>
          <div className="grid md:grid-cols-3 gap-2 text-sm">
            <div><label className="text-xs text-gray-600">Bid Price</label><input className="w-full border rounded px-3 py-2" value={bidPrice} onChange={e=>setBidPrice(e.target.value)} /></div>
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Total</label><div className="w-full border rounded px-3 py-2 bg-gray-50">${total}</div></div>
          </div>
          <div className="mt-3">
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
        </div>
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-2">Terms</h3>
          <textarea className="w-full border rounded px-3 py-2" value={terms} onChange={e=>setTerms(e.target.value)} />
        </div>
      </div>
      {downloadUrl && (currentFingerprint!==lastGeneratedHash) && (
        <div className="mb-3 p-2 rounded bg-yellow-50 border text-[12px] text-yellow-800">You have made changes since the last PDF was generated. Please click "Generate Proposal" again to update the download.</div>
      )}
      {(isReady && currentFingerprint!==lastSavedHash) && (
        <div className="mb-3 p-2 rounded bg-blue-50 border text-[12px] text-blue-800">There are unsaved changes in this proposal. Click "Save Proposal" to persist.</div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <button className="px-3 py-2 rounded bg-gray-100" onClick={()=> nav(-1)}>Back</button>
        <div className="space-x-2">
          <button className="px-3 py-2 rounded bg-gray-100" onClick={handleSave}>Save Proposal</button>
          <button className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-60" disabled={isGenerating} onClick={handleGenerate}>{isGenerating? 'Generating…' : 'Generate Proposal'}</button>
          {downloadUrl && (
            (currentFingerprint===lastGeneratedHash) ? (
              <a className="px-3 py-2 rounded bg-black text-white" href={downloadUrl} download="ProjectProposal.pdf">Download PDF</a>
            ) : (
              <button className="px-3 py-2 rounded bg-gray-200 text-gray-600 cursor-not-allowed" title="PDF is outdated. Generate again to enable download" disabled>Download PDF</button>
            )
          )}
        </div>
      </div>

      {pickerFor && (
        <ImagePicker isOpen={true} onClose={()=>setPickerFor(null)} clientId={clientId||undefined} targetWidth={pickerFor==='cover'? 566: 540} targetHeight={pickerFor==='cover'? 537: 340} allowEdit={true} onConfirm={async(blob)=>{
          try{
            if (!blob){ toast.error('No image'); setPickerFor(null); return; }
            const cat = pickerFor==='cover'? 'proposal-cover' : 'proposal-page2';
            const uniqueName = `${cat}_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
            const up:any = await api('POST','/files/upload',{ project_id: null, client_id: clientId||null, employee_id: null, category_id: cat, original_name: uniqueName, content_type: 'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            if (pickerFor==='cover'){ setCoverBlob(blob); setCoverFoId(conf.id); }
            else { setPage2Blob(blob); setPage2FoId(conf.id); }
          }catch(e){ toast.error('Upload failed'); }
          setPickerFor(null);
        }} />
      )}
      {sectionPicker && (
        <ImagePicker isOpen={true} onClose={()=>setSectionPicker(null)} clientId={clientId||undefined} targetWidth={260} targetHeight={150} allowEdit={true} onConfirm={async(blob)=>{
          try{
            if (!blob){ toast.error('No image'); return; }
            const uniqueName = `section_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
            const up:any = await api('POST','/files/upload',{ project_id: null, client_id: clientId||null, employee_id: null, category_id:'proposal-section', original_name: uniqueName, content_type: 'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            const fileObjectId = conf.id;
            setSections(arr=> arr.map((x:any, i:number)=>{
              const isTarget = (String(x.id||'')===String(sectionPicker.secId||'')) || (String(sectionPicker.secId||'')===String(i));
              if (!isTarget) return x;
              const imgs = Array.isArray(x.images)? [...x.images] : [];
              if (typeof sectionPicker.index === 'number'){ // replace specific
                const prev = imgs[sectionPicker.index] || {};
                imgs[sectionPicker.index] = { image_id: (prev.image_id||newImageId()), file_object_id: fileObjectId, caption: prev.caption||'' };
                return { ...x, images: imgs };
              }
              return { ...x, images: [...imgs, { image_id: newImageId(), file_object_id: fileObjectId, caption: '' }] };
            }));
          }catch(e){ toast.error('Failed to add image'); }
          setSectionPicker(null);
        }} />
      )}
    </div>
  );
}


