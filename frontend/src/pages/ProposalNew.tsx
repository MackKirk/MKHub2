import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';

type Client = { id:string, name?:string, display_name?:string, address_line1?:string, city?:string, province?:string, country?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };

export default function ProposalNew(){
  const nav = useNavigate();
  const loc = useLocation();
  const qp = new URLSearchParams(loc.search);
  const clientId = qp.get('client_id')||'';
  const siteId = qp.get('site_id')||'';
  const projectId = qp.get('project_id')||'';
  const { data:client } = useQuery({ queryKey:['client', clientId], queryFn: ()=> clientId? api<Client>('GET', `/clients/${clientId}`): Promise.resolve(null) });
  const { data:sites } = useQuery({ queryKey:['sites', clientId], queryFn: ()=> clientId? api<Site[]>('GET', `/clients/${clientId}/sites`): Promise.resolve([]) });
  const site = (sites||[]).find(s=> String(s.id)===String(siteId));
  const { data:nextCode } = useQuery({ queryKey:['proposalCode', clientId], queryFn: ()=> clientId? api<any>('GET', `/proposals/next-code?client_id=${encodeURIComponent(clientId)}`) : Promise.resolve(null) });

  // form state
  const [coverTitle, setCoverTitle] = useState('Proposal');
  const [orderNumber, setOrderNumber] = useState('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [createdFor, setCreatedFor] = useState('');
  const [primary, setPrimary] = useState<{ name?:string, phone?:string, email?:string }>({});
  const [typeOfProject, setTypeOfProject] = useState('');
  const [otherNotes, setOtherNotes] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [bidPrice, setBidPrice] = useState<string>('');
  const [costs, setCosts] = useState<{ label:string, amount:string }[]>([]);
  const total = useMemo(()=>{ const base = Number(bidPrice||'0'); const extra = costs.reduce((a,c)=> a + Number(c.amount||'0'), 0); return (base+extra).toFixed(2); }, [bidPrice, costs]);
  const [terms, setTerms] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [coverBlob, setCoverBlob] = useState<Blob|null>(null);
  const [coverFoId, setCoverFoId] = useState<string|undefined>(undefined);
  const [page2Blob, setPage2Blob] = useState<Blob|null>(null);
  const [page2FoId, setPage2FoId] = useState<string|undefined>(undefined);
  const [pickerFor, setPickerFor] = useState<null|'cover'|'page2'>(null);

  // derive company fields
  const companyName = (client?.display_name || client?.name || '').slice(0,50);
  const companyAddress = useMemo(()=>{
    if (site) return [site.site_address_line1, site.site_city, site.site_province, site.site_country].filter(Boolean).join(', ').slice(0,50);
    return [client?.address_line1, client?.city, client?.province, client?.country].filter(Boolean).join(', ').slice(0,50);
  }, [client, site]);

  // init order number from next-code
  useMemo(()=>{ if(!orderNumber && nextCode?.order_number) setOrderNumber(nextCode.order_number); }, [nextCode]);

  const handleSave = async()=>{
    try{
      const payload:any = {
        id: undefined,
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
        additional_costs: costs,
        sections,
      };
      const r:any = await api('POST','/proposals', payload);
      toast.success('Saved');
      if (r?.id){ nav(`/projects/${encodeURIComponent(projectId)}`); }
    }catch(e){ toast.error('Save failed'); }
  };

  const handleGenerate = async()=>{
    try{
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
      form.append('additional_costs', JSON.stringify(costs.map(c=> ({ label: c.label, amount: Number(c.amount||'0') }))));
      form.append('sections', JSON.stringify(sections));
      if (coverFoId) form.append('cover_file_object_id', coverFoId);
      if (page2FoId) form.append('page2_file_object_id', page2FoId);
      if (coverBlob) form.append('cover_image', coverBlob, 'cover.jpg');
      if (page2Blob) form.append('page2_image', page2Blob, 'page2.jpg');
      const token = localStorage.getItem('user_token');
      const resp = await fetch('/proposals/generate', { method:'POST', headers: token? { Authorization: 'Bearer '+token } : undefined, body: form });
      if (!resp.ok){ toast.error('Generate failed'); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'ProjectProposal.pdf'; a.click(); URL.revokeObjectURL(url);
      toast.success('Generated');
    }catch(e){ toast.error('Generate failed'); }
  };

  return (
    <div>
      <div className="rounded-xl border bg-white p-4">
        <h2 className="text-xl font-bold mb-3">Create Proposal</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold mb-2">Company Info</h3>
            <div className="space-y-2 text-sm">
              <div><label className="text-xs text-gray-600">Document Type</label><input className="w-full border rounded px-3 py-2" value={coverTitle} onChange={e=>setCoverTitle(e.target.value)} maxLength={22} /></div>
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
              </div>
              <div>
                <div className="mb-1">Page 2 Image</div>
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=>setPickerFor('page2')}>Choose</button>
              </div>
            </div>
          </div>
          <div className="md:col-span-2">
            <h3 className="font-semibold mb-2">Pricing</h3>
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
        <div className="mt-4 flex items-center justify-between">
          <button className="px-3 py-2 rounded bg-gray-100" onClick={()=> nav(-1)}>Back</button>
          <div className="space-x-2">
            <button className="px-3 py-2 rounded bg-gray-100" onClick={handleSave}>Save Proposal</button>
            <button className="px-3 py-2 rounded bg-brand-red text-white" onClick={handleGenerate}>Generate Proposal</button>
          </div>
        </div>
      </div>

      {pickerFor && (
        <ImagePicker isOpen={true} onClose={()=>setPickerFor(null)} clientId={clientId||undefined} targetWidth={pickerFor==='cover'? 566: 540} targetHeight={pickerFor==='cover'? 537: 340} allowEdit={true} onConfirm={(blob, originalId)=>{
          if (pickerFor==='cover'){ setCoverBlob(blob); setCoverFoId(originalId); }
          else { setPage2Blob(blob); setPage2FoId(originalId); }
          setPickerFor(null);
        }} />
      )}
    </div>
  );
}


