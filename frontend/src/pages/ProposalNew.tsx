import { useLocation } from 'react-router-dom';
import ProposalForm from '@/components/ProposalForm';

type Client = { id:string, name?:string, display_name?:string, address_line1?:string, city?:string, province?:string, country?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };

export default function ProposalNew(){
  const loc = useLocation();
  const qp = new URLSearchParams(loc.search);
  const clientId = qp.get('client_id')||'';
  const siteId = qp.get('site_id')||'';
  const projectId = qp.get('project_id')||'';

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
  const [sectionPicker, setSectionPicker] = useState<{ secId:string }|null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [page2Preview, setPage2Preview] = useState<string>('');

  // derive company fields
  const companyName = (client?.display_name || client?.name || '').slice(0,50);
  const companyAddress = useMemo(()=>{
    if (site) return [site.site_address_line1, site.site_city, site.site_province, site.site_country].filter(Boolean).join(', ').slice(0,50);
    return [client?.address_line1, client?.city, client?.province, client?.country].filter(Boolean).join(', ').slice(0,50);
  }, [client, site]);

  // init order number from next-code
  useMemo(()=>{ if(!orderNumber && nextCode?.order_number) setOrderNumber(nextCode.order_number); }, [nextCode]);

  useEffect(()=>{
    // build previews for cover/page2
    if (coverFoId) setCoverPreview(`/files/${coverFoId}/thumbnail?w=600`);
    else if (coverBlob) setCoverPreview(URL.createObjectURL(coverBlob));
    else setCoverPreview('');
    if (page2FoId) setPage2Preview(`/files/${page2FoId}/thumbnail?w=600`);
    else if (page2Blob) setPage2Preview(URL.createObjectURL(page2Blob));
    else setPage2Preview('');
    return ()=>{};
  }, [coverFoId, coverBlob, page2FoId, page2Blob]);

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
        additional_costs: costs.map(c=> ({ label: c.label, value: Number(c.amount||'0') })),
        sections,
        cover_file_object_id: coverFoId||null,
        page2_file_object_id: page2FoId||null,
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
      form.append('additional_costs', JSON.stringify(costs.map(c=> ({ label: c.label, value: Number(c.amount||'0') }))));
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

  return (<ProposalForm mode="new" clientId={clientId} siteId={siteId} projectId={projectId} />);
}


