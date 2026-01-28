import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState, useRef, ReactNode } from 'react';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';
import AddressAutocomplete from '@/components/AddressAutocomplete';

type Site = {
  id:string,
  site_name?:string,
  site_address_line1?:string,
  site_address_line1_complement?:string,
  site_address_line2?:string,
  site_address_line2_complement?:string,
  site_address_line3?:string,
  site_address_line3_complement?:string,
  site_city?:string,
  site_province?:string,
  site_postal_code?:string,
  site_country?:string,
  site_lat?:number,
  site_lng?:number,
  site_notes?:string
};
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, site_id?:string, category?:string, uploaded_at?:string };
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string };

export default function SiteDetail(){
  const { customerId, siteId } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles||[]).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasEditPermission = isAdmin || permissions.has('business:customers:write');
  const { data:sites } = useQuery({ queryKey:['clientSites', customerId], queryFn: ()=>api<Site[]>('GET', `/clients/${customerId}/sites`) });
  const { data:files } = useQuery({ queryKey:['clientFilesForSiteHeader', customerId], queryFn: ()=> api<ClientFile[]>('GET', `/clients/${customerId}/files`), enabled: !!customerId });
  const s = useMemo(()=> (sites||[]).find(x=> String(x.id)===String(siteId)) || null, [sites, siteId]);
  const [form, setForm] = useState<any>(()=> s? { ...s } : { site_name:'', site_address_line1:'', site_address_line1_complement:'', site_address_line2:'', site_address_line2_complement:'', site_address_line3:'', site_address_line3_complement:'', site_city:'', site_province:'', site_postal_code:'', site_country:'', site_lat:null, site_lng:null, site_notes:'' });
  const [initialForm, setInitialForm] = useState<any>(()=> s? { ...s } : { site_name:'', site_address_line1:'', site_address_line1_complement:'', site_address_line2:'', site_address_line2_complement:'', site_address_line3:'', site_address_line3_complement:'', site_city:'', site_province:'', site_postal_code:'', site_country:'', site_lat:null, site_lng:null, site_notes:'' });
  const setField = (k:string, v:any)=> setForm((prev:any)=> ({ ...prev, [k]: v }));
  const qc = useQueryClient();
  const isNew = String(siteId||'') === 'new' || !(s && (s as any).id);

  // keep form in sync only when an existing site loads/changes
  useEffect(()=>{ 
    if(s && (s as any).id){ 
      const siteData = { ...s };
      setForm(siteData);
      setInitialForm(siteData);
      // Show address 2 and 3 if they have data
      setShowAddress2(!!(siteData.site_address_line2 || siteData.site_address_line2_complement));
      setShowAddress3(!!(siteData.site_address_line3 || siteData.site_address_line3_complement));
    } else {
      // Reset when creating new site
      setShowAddress2(false);
      setShowAddress3(false);
      setSiteNameError(false);
    }
  }, [s && (s as any).id]);

  // ESC to close
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{ if (e.key==='Escape'){ nav(-1); } };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [nav]);

  const previewSrc = useMemo(()=>{
    const arr = (files||[]).filter(f=> String(f.site_id||'')===String(siteId));
    const cover = arr.find(f=> String(f.category||'')==='site-cover-derived');
    const img = cover || arr.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
    return img? `/files/${img.file_object_id}/thumbnail?w=600` : '/ui/assets/login/logo-light.svg';
  }, [files, siteId]);

  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showAddress2, setShowAddress2] = useState(false);
  const [showAddress3, setShowAddress3] = useState(false);
  const [siteNameError, setSiteNameError] = useState(false);
  // View-only mode for existing site; Edit button switches to edit mode. New site has no view mode.
  const [isEditMode, setIsEditMode] = useState(false);
  const isViewMode = !isNew && !isEditMode;

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleClose = async () => {
    const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(initialForm);
    if (hasUnsavedChanges) {
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        confirmText: 'Save and Leave',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });
      if (result === 'confirm') {
        try {
          if (isNew) {
            await api('POST', `/clients/${encodeURIComponent(String(customerId||''))}/sites`, form);
          } else {
            await api('PATCH', `/clients/${encodeURIComponent(String(customerId||''))}/sites/${encodeURIComponent(String(siteId||''))}`, form);
          }
          setInitialForm({ ...form });
          try{ await qc.invalidateQueries({ queryKey:['clientSites', customerId] }); }catch(_e){}
          nav(-1);
        } catch(_e) { toast.error('Save failed'); }
      } else if (result === 'discard') {
        setForm({ ...initialForm });
        nav(-1);
      }
    } else {
      nav(-1);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4">
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl">
        {/* Title bar - same style as New Opportunity (ProjectNew) */}
        <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={()=> isViewMode ? nav(-1) : handleClose()}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                title="Close"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {isViewMode ? (form.site_name || 'Construction Site') : (isNew ? 'New Site' : 'Edit Site')}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {isViewMode ? 'View details' : 'Address and details'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* View mode: read-only display */}
        {isViewMode && (
          <>
            <div className="overflow-y-auto flex-1 p-4">
              <div className="rounded-xl border bg-white overflow-hidden flex flex-col sm:flex-row relative">
                {hasEditPermission && (
                  <button
                    onClick={()=> setIsEditMode(true)}
                    className="absolute top-3 right-3 z-10 p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Edit"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                <div className="sm:w-64 bg-gray-100 flex-shrink-0 flex items-center justify-center relative min-h-[200px] sm:min-h-0 sm:min-h-[240px]">
                  <img src={previewSrc} className="w-full h-full object-cover" alt={form.site_name||'Site'} />
                </div>
                <div className="flex-1 p-4 sm:p-6 space-y-4">
                  <div>
                    <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Site name</div>
                    <div className="text-sm font-semibold text-gray-900">{form.site_name || '—'}</div>
                  </div>
                  {(form.site_address_line1 || form.site_city || form.site_province || form.site_country) && (
                    <div>
                      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Address</div>
                      <div className="text-sm text-gray-700">
                        {[form.site_address_line1, form.site_address_line1_complement, form.site_city, form.site_province, form.site_postal_code, form.site_country].filter(Boolean).join(', ') || '—'}
                      </div>
                    </div>
                  )}
                  {(form.site_address_line2 || form.site_address_line2_complement) && (
                    <div>
                      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Address 2</div>
                      <div className="text-sm text-gray-700">{[form.site_address_line2, form.site_address_line2_complement].filter(Boolean).join(', ') || '—'}</div>
                    </div>
                  )}
                  {(form.site_address_line3 || form.site_address_line3_complement) && (
                    <div>
                      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Address 3</div>
                      <div className="text-sm text-gray-700">{[form.site_address_line3, form.site_address_line3_complement].filter(Boolean).join(', ') || '—'}</div>
                    </div>
                  )}
                  {form.site_notes && (
                    <div>
                      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</div>
                      <div className="text-sm text-gray-700 whitespace-pre-wrap">{form.site_notes}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button onClick={()=> nav(-1)} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-700">Close</button>
            </div>
          </>
        )}

        {/* Edit mode / New site: form (same visual as New Opportunity) */}
        {!isViewMode && (
        <>
        <div className="overflow-y-auto flex-1 p-4">
          <div className="rounded-xl border bg-white p-4 grid md:grid-cols-2 gap-4 items-start">
            <div className="md:col-span-2">
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Cover <span className="opacity-60">(optional)</span></label>
              <div className="mt-1 flex items-center gap-3">
                <button type="button" onClick={()=> setCoverPickerOpen(true)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800">Select Cover</button>
                {previewSrc && previewSrc !== '/ui/assets/login/logo-light.svg' && <img src={previewSrc} className="w-20 h-20 rounded-lg border border-gray-200 object-cover" alt="" />}
              </div>
            </div>
            <div className="md:col-span-2">
              <Field label={<><span>Site name</span> <span className="text-red-600">*</span></>}>
            <input 
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${siteNameError && !form.site_name?.trim() ? 'border-red-500 focus:ring-red-500' : 'focus:ring-gray-300 focus:border-gray-300'} ${!hasEditPermission ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  value={form.site_name||''} 
                  onChange={e=>{
                    setField('site_name', e.target.value);
                    if(siteNameError) setSiteNameError(false);
                  }}
                  disabled={!hasEditPermission}
                  readOnly={!hasEditPermission}
                />
                {siteNameError && !form.site_name?.trim() && (
                  <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                )}
              </Field>
            </div>
            <Field label="Address">
              <AddressAutocomplete
                value={form.site_address_line1||''}
                onChange={(value) => setField('site_address_line1', value)}
                disabled={!hasEditPermission}
                onAddressSelect={(address) => {
                  console.log('onAddressSelect called with:', address);
                  // Update all address fields at once using setForm directly
                  setForm((prev: any) => ({
                    ...prev,
                    site_address_line1: address.address_line1 || prev.site_address_line1,
                    site_address_line2: address.address_line2 !== undefined ? address.address_line2 : prev.site_address_line2,
                    site_city: address.city !== undefined ? address.city : prev.site_city,
                    site_province: address.province !== undefined ? address.province : prev.site_province,
                    site_country: address.country !== undefined ? address.country : prev.site_country,
                    site_postal_code: address.postal_code !== undefined ? address.postal_code : prev.site_postal_code,
                    site_lat: address.lat !== undefined ? address.lat : prev.site_lat,
                    site_lng: address.lng !== undefined ? address.lng : prev.site_lng,
                  }));
                }}
                placeholder="Enter address"
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${!hasEditPermission ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-gray-300 focus:border-gray-300'}`}
              />
            </Field>
            <Field label="Complement">
              <input
                className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${!hasEditPermission ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-gray-300 focus:border-gray-300'}`}
                value={form.site_address_line1_complement||''}
                onChange={e=>setField('site_address_line1_complement', e.target.value)}
                placeholder="Apartment, Unit, Block, etc (Optional)"
                disabled={!hasEditPermission}
                readOnly={!hasEditPermission}
              />
            </Field>
            {!showAddress2 && hasEditPermission && (
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddress2(true);
                  }}
                  className="text-sm text-brand-red hover:underline flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add another Address
                </button>
              </div>
            )}
            {showAddress2 && (
              <>
                <Field label="Address 2">
                  <AddressAutocomplete
                    value={form.site_address_line2||''}
                    onChange={(value) => setField('site_address_line2', value)}
                    disabled={!hasEditPermission}
                    onAddressSelect={(address) => {
                      setForm((prev: any) => ({
                        ...prev,
                        site_address_line2: address.address_line1 || prev.site_address_line2,
                        // Note: address 2 and 3 don't affect global fields (city, province, country, postal_code)
                      }));
                    }}
                    placeholder="Enter address"
                    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${!hasEditPermission ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-gray-300 focus:border-gray-300'}`}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Complement">
                      <input
                        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${!hasEditPermission ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-gray-300 focus:border-gray-300'}`}
                        value={form.site_address_line2_complement||''}
                        onChange={e=>setField('site_address_line2_complement', e.target.value)}
                        placeholder="Apartment, Unit, Block, etc (Optional)"
                        disabled={!hasEditPermission}
                        readOnly={!hasEditPermission}
                      />
                    </Field>
                  </div>
                  {hasEditPermission && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddress2(false);
                      setField('site_address_line2', '');
                      setField('site_address_line2_complement', '');
                      // If address 3 exists, move it to address 2
                      if (showAddress3) {
                        setField('site_address_line2', form.site_address_line3 || '');
                        setField('site_address_line2_complement', form.site_address_line3_complement || '');
                        setField('site_address_line3', '');
                        setField('site_address_line3_complement', '');
                        setShowAddress3(false);
                      }
                    }}
                    className="mb-2 px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                    title="Remove Address 2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  )}
                </div>
                {!showAddress3 && hasEditPermission && (
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddress3(true);
                      }}
                      className="text-sm text-brand-red hover:underline flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add another Address
                    </button>
                  </div>
                )}
              </>
            )}
            {showAddress3 && (
              <>
                <Field label="Address 3">
                  <AddressAutocomplete
                    value={form.site_address_line3||''}
                    onChange={(value) => setField('site_address_line3', value)}
                    disabled={!hasEditPermission}
                    onAddressSelect={(address) => {
                      setForm((prev: any) => ({
                        ...prev,
                        site_address_line3: address.address_line1 || prev.site_address_line3,
                        // Note: address 2 and 3 don't affect global fields (city, province, country, postal_code)
                      }));
                    }}
                    placeholder="Enter address"
                    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${!hasEditPermission ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-gray-300 focus:border-gray-300'}`}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Complement">
                      <input
                        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${!hasEditPermission ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-gray-300 focus:border-gray-300'}`}
                        value={form.site_address_line3_complement||''}
                        onChange={e=>setField('site_address_line3_complement', e.target.value)}
                        placeholder="Apartment, Unit, Block, etc (Optional)"
                        disabled={!hasEditPermission}
                        readOnly={!hasEditPermission}
                      />
                    </Field>
                  </div>
                  {hasEditPermission && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddress3(false);
                      setField('site_address_line3', '');
                      setField('site_address_line3_complement', '');
                    }}
                    className="mb-2 px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                    title="Remove Address 3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  )}
                </div>
              </>
            )}
            <Field label="Country">
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 cursor-not-allowed" 
                value={form.site_country||''} 
                readOnly
                placeholder="Auto-filled from address"
              />
            </Field>
            <Field label="Province/State">
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 cursor-not-allowed" 
                value={form.site_province||''} 
                readOnly
                placeholder="Auto-filled from address"
              />
            </Field>
            <Field label="City">
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 cursor-not-allowed" 
                value={form.site_city||''} 
                readOnly
                placeholder="Auto-filled from address"
              />
            </Field>
            <Field label="Postal code">
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 cursor-not-allowed" 
                value={form.site_postal_code||''} 
                readOnly
                placeholder="Auto-filled from address"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Notes">
                <textarea 
                  rows={4} 
                  className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${!hasEditPermission ? 'bg-gray-100 cursor-not-allowed' : 'focus:ring-gray-300 focus:border-gray-300'}`} 
                  value={form.site_notes||''} 
                  onChange={e=>setField('site_notes', e.target.value)}
                  disabled={!hasEditPermission}
                  readOnly={!hasEditPermission}
                />
              </Field>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3 rounded-b-xl">
          <div>
            {!isNew && hasEditPermission && (
              <button onClick={async()=>{
                const ok = await confirm({ 
                  title: 'Delete Site', 
                  message: `Are you sure you want to delete "${form.site_name||'this site'}"? This action cannot be undone.`,
                  confirmText: 'Delete',
                  cancelText: 'Cancel'
                });
                if (!ok) return;
                try{
                  await api('DELETE', `/clients/${encodeURIComponent(String(customerId||''))}/sites/${encodeURIComponent(String(siteId||''))}`);
                  toast.success('Site deleted');
                  try{ await qc.invalidateQueries({ queryKey:['clientSites', customerId] }); }catch(_e){}
                  nav(-1);
                }catch(_e){ toast.error('Failed to delete site'); }
              }} className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50">Delete Site</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleClose} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50">Close</button>
            {hasEditPermission && (
            <button 
              onClick={async()=>{
                if (isCreating) return;
                if (!form.site_name?.trim()) {
                  setSiteNameError(true);
                  toast.error('Site name is required');
                  return;
                }
                try{
                  setIsCreating(true);
                  if(isNew){
                    await api('POST', `/clients/${encodeURIComponent(String(customerId||''))}/sites`, form);
                    toast.success('Created');
                    setInitialForm({ ...form });
                    try{ await qc.invalidateQueries({ queryKey:['clientSites', customerId] }); }catch(_e){}
                    nav(-1);
                  } else {
                    await api('PATCH', `/clients/${encodeURIComponent(String(customerId||''))}/sites/${encodeURIComponent(String(siteId||''))}`, form);
                    toast.success('Saved');
                    setInitialForm({ ...form });
                    try{ await qc.invalidateQueries({ queryKey:['clientSites', customerId] }); }catch(_e){}
                    nav(-1);
                  }
                }catch(_e){ 
                  toast.error('Save failed'); 
                } finally {
                  setIsCreating(false);
                }
              }} 
              disabled={isCreating}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (isNew ? 'Creating...' : 'Saving...') : (isNew ? 'Create' : 'Save')}
            </button>
            )}
          </div>
        </div>
        </>
        )}
      </div>
    </div>
    {coverPickerOpen && (
      <ImagePicker isOpen={true} onClose={()=>setCoverPickerOpen(false)} clientId={String(customerId)} targetWidth={800} targetHeight={800} allowEdit={true} onConfirm={async(blob)=>{
        try{
          const up:any = await api('POST','/files/upload',{ project_id:null, client_id:customerId, employee_id:null, category_id:'site-cover-derived', original_name:'site-cover.jpg', content_type:'image/jpeg' });
          await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
          const conf:any = await api('POST','/files/confirm',{ key:up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
          await api('POST', `/clients/${customerId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-cover-derived&original_name=site-cover.jpg&site_id=${encodeURIComponent(String(siteId||''))}`);
          toast.success('Cover updated');
          try{ await qc.invalidateQueries({ queryKey:['clientFilesForSiteHeader', customerId] }); }catch(_e){}
          setCoverPickerOpen(false);
        }catch(e){ toast.error('Failed to update cover'); setCoverPickerOpen(false); }
      }} />
    )}
    </>
  );
}

function Field({label, children}:{label:ReactNode, children:any}){
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  );
}

