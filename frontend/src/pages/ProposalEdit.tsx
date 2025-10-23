import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import ProposalForm from '@/components/ProposalForm';

export default function ProposalEdit(){
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey:['proposal', id], queryFn: ()=> api<any>('GET', `/proposals/${id}`) });
  const p = data||{};
  const d = p?.data || {};
  const clientId = String(p?.client_id||'');
  const siteId = String(p?.site_id||'');
  const projectId = String(p?.project_id||'');
  type Client = { id:string, name?:string, display_name?:string, address_line1?:string, city?:string, province?:string, country?:string };
  type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };
  const { data:client } = useQuery({ queryKey:['client', clientId], queryFn: ()=> clientId? api<Client>('GET', `/clients/${clientId}`): Promise.resolve(null) });
  const { data:sites } = useQuery({ queryKey:['sites', clientId], queryFn: ()=> clientId? api<Site[]>('GET', `/clients/${clientId}/sites`): Promise.resolve([]) });
  const site = (sites||[]).find(s=> String(s.id)===String(siteId));

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
        <ProposalForm mode="edit" clientId={String(p?.client_id||'')} siteId={String(p?.site_id||'')} projectId={String(p?.project_id||'')} initial={p} />
      )}
      {/* Image pickers handled inside ProposalForm */}
    </div>
  );
}


