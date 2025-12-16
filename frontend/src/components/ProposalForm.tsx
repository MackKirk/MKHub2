import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';

type Client = { id:string, name?:string, display_name?:string, address_line1?:string, city?:string, province?:string, country?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_address_line2?:string, site_city?:string, site_province?:string, site_postal_code?:string, site_country?:string };

export default function ProposalForm({ mode, clientId: clientIdProp, siteId: siteIdProp, projectId: projectIdProp, initial, disabled, onSave }: { mode:'new'|'edit', clientId?:string, siteId?:string, projectId?:string, initial?: any, disabled?: boolean, onSave?: ()=>void }){
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const [clientId] = useState<string>(String(clientIdProp || initial?.client_id || ''));
  const [siteId] = useState<string>(String(siteIdProp || initial?.site_id || ''));
  // projectId should be preserved even if empty string, but we need to check for actual value
  const [projectId] = useState<string>(() => {
    const pid = projectIdProp || initial?.project_id;
    return pid ? String(pid) : '';
  });

  const { data:client } = useQuery({ queryKey:['client', clientId], queryFn: ()=> clientId? api<Client>('GET', `/clients/${clientId}`): Promise.resolve(null) });
  const { data:sites } = useQuery({ queryKey:['sites', clientId], queryFn: ()=> clientId? api<Site[]>('GET', `/clients/${clientId}/sites`): Promise.resolve([]) });
  const site = (sites||[]).find(s=> String(s.id)===String(siteId));
  const { data:nextCode } = useQuery({ queryKey:['proposalCode', clientId], queryFn: ()=> (mode==='new' && clientId)? api<any>('GET', `/proposals/next-code?client_id=${encodeURIComponent(clientId)}`) : Promise.resolve(null) });

  // form state
  const [coverTitle, setCoverTitle] = useState<string>('Proposal');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayLocal());
  const [createdFor, setCreatedFor] = useState<string>('');
  const [primary, setPrimary] = useState<{ name?:string, phone?:string, email?:string }>({});
  const [typeOfProject, setTypeOfProject] = useState<string>('');
  const [otherNotes, setOtherNotes] = useState<string>('');
  const [projectDescription, setProjectDescription] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  const [pricingItems, setPricingItems] = useState<{ name:string, price:string }[]>([]);
  const [optionalServices, setOptionalServices] = useState<{ service:string, price:string }[]>([]);
  const [showTotalInPdf, setShowTotalInPdf] = useState<boolean>(true);
  const [terms, setTerms] = useState<string>('');
  const [sections, setSections] = useState<any[]>([]);
  const [coverBlob, setCoverBlob] = useState<Blob|null>(null);
  const [coverFoId, setCoverFoId] = useState<string|undefined>(undefined);
  const [page2Blob, setPage2Blob] = useState<Blob|null>(null);
  const [page2FoId, setPage2FoId] = useState<string|undefined>(undefined);
  const [pickerFor, setPickerFor] = useState<null|'cover'|'page2'>(null);
  const [sectionPicker, setSectionPicker] = useState<{ secId:string, index?: number, fileObjectId?: string }|null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [page2Preview, setPage2Preview] = useState<string>('');
  const newImageId = ()=> 'img_'+Math.random().toString(36).slice(2);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [lastSavedHash, setLastSavedHash] = useState<string>('');
  const [lastGeneratedHash, setLastGeneratedHash] = useState<string>('');
  const [isReady, setIsReady] = useState<boolean>(false);
  const [focusTarget, setFocusTarget] = useState<{ type:'title'|'caption', sectionIndex:number, imageIndex?: number }|null>(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(-1);
  const confirm = useConfirm();
  const { setHasUnsavedChanges: setGlobalUnsavedChanges } = useUnsavedChanges();
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoSavingRef = useRef<boolean>(false);
  const lastAutoSaveRef = useRef<number>(0);
  const proposalIdRef = useRef<string | undefined>(mode === 'edit' ? initial?.id : undefined);
  const handleSaveRef = useRef<() => Promise<void>>();

  // --- Helpers declared early so effects can safely reference them
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

  // Format number to accounting format (1,234.56)
  const formatAccounting = (value: string | number): string => {
    if (!value && value !== 0) return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) || 0 : value;
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Parse accounting format back to number string
  const parseAccounting = (value: string): string => {
    if (!value) return '';
    // Remove commas and keep only digits and decimal point
    const cleaned = value.replace(/,/g, '');
    // Allow only numbers and one decimal point
    const match = cleaned.match(/^-?\d*\.?\d*$/);
    if (!match) {
      // If invalid, try to extract valid number part
      const numMatch = cleaned.match(/^-?\d+\.?\d*/);
      return numMatch ? numMatch[0] : '';
    }
    return cleaned;
  };

  const total = useMemo(()=>{ 
    const sum = pricingItems.reduce((a,c)=> a + Number(parseAccounting(c.price)||'0'), 0); 
    return formatAccounting(sum); 
  }, [pricingItems]);

  const computeFingerprint = ()=>{
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
        pricingItems,
        optionalServices,
        showTotalInPdf,
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
  };

  // prefill from initial (edit)
  useEffect(()=>{
    if (!initial) return;
    const d = initial?.data || {};
    setCoverTitle(String(d.cover_title || initial.title || 'Proposal'));
    setOrderNumber(String(initial.order_number || d.order_number || ''));
    setDate(String(d.date||'').slice(0,10) || getTodayLocal());
    setCreatedFor(String(d.proposal_created_for||''));
    setPrimary({ name: d.primary_contact_name, phone: d.primary_contact_phone, email: d.primary_contact_email });
    setTypeOfProject(String(d.type_of_project||''));
    setOtherNotes(String(d.other_notes||''));
    setProjectDescription(String(d.project_description||''));
    setAdditionalNotes(String(d.additional_project_notes||''));
    // Load pricing items from bid_price and additional_costs (legacy support)
    const legacyBidPrice = d.bid_price ?? 0;
    const dc = Array.isArray(d.additional_costs)? d.additional_costs : [];
    const loadedItems: { name:string, price:string }[] = [];
    if (legacyBidPrice && Number(legacyBidPrice) > 0) {
      loadedItems.push({ name: 'Bid Price', price: formatAccounting(legacyBidPrice) });
    }
    dc.forEach((c:any)=> {
      const label = String(c.label||'');
      const value = c.value ?? c.amount ?? '';
      if (label && Number(value) > 0) {
        loadedItems.push({ name: label, price: formatAccounting(value) });
      }
    });
    setPricingItems(loadedItems);
    const os = Array.isArray(d.optional_services)? d.optional_services : [];
    setOptionalServices(os.map((s:any)=> ({ service: String(s.service||''), price: formatAccounting(s.price ?? '') })));
    setShowTotalInPdf(d.show_total_in_pdf !== undefined ? Boolean(d.show_total_in_pdf) : true);
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
    // Update proposal ID ref for auto-save
    if (initial?.id) {
      proposalIdRef.current = initial.id;
    }
    setIsReady(true);
  }, [initial?.id]);

  // When creating new (no initial), mark ready on mount
  useEffect(()=>{ if (mode==='new') setIsReady(true); }, [mode]);

  // Focus management
  useEffect(()=>{
    if (!focusTarget) return;
    const { type, sectionIndex, imageIndex } = focusTarget;
    setTimeout(()=>{
      try{
        if (type==='title'){
          const el = document.querySelector<HTMLInputElement>(`input[data-role="section-title"][data-sec="${sectionIndex}"]`);
          el?.focus(); el?.select();
        } else {
          let idx = imageIndex ?? -1;
          if (idx===-1){
            const imgs = (sections[sectionIndex]?.images||[]) as any[];
            idx = Math.max(0, imgs.length-1);
          }
          const el = document.querySelector<HTMLInputElement>(`input[data-role="img-caption"][data-sec="${sectionIndex}"][data-img="${idx}"]`);
          el?.focus(); el?.select();
        }
      }catch(_e){}
      setFocusTarget(null);
    }, 0);
  }, [focusTarget, sections]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!isReady) return false;
    const fp = computeFingerprint();
    return fp !== lastSavedHash;
  }, [isReady, lastSavedHash, coverTitle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingItems, optionalServices, showTotalInPdf, terms, sections, coverFoId, page2FoId, clientId, siteId, projectId]);

  // Update global unsaved changes state
  useEffect(() => {
    setGlobalUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges, setGlobalUnsavedChanges]);

  const location = useLocation();
  
  // Intercept React Router navigation by intercepting link clicks
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if clicking on a link (NavLink, Link, or anchor with href)
      const link = target.closest('a[href]');
      if (!link) return;
      
      // Skip if it's an external link, download link, or same page anchor
      const href = link.getAttribute('href');
      if (!href || 
          href.startsWith('http') || 
          href.startsWith('mailto:') || 
          href.startsWith('tel:') || 
          href.startsWith('#') ||
          link.hasAttribute('download') ||
          link.hasAttribute('target')) {
        return;
      }
      
      // Skip if it's the same route
      if (href === location.pathname || href === window.location.pathname) {
        return;
      }
      
      // Prevent default navigation
      e.preventDefault();
      e.stopPropagation();
      
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        confirmText: 'Save and Leave',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });
      
      if (result === 'confirm') {
        if (handleSaveRef.current) {
          await handleSaveRef.current();
        }
        // Navigate after save
        nav(href);
      } else if (result === 'discard') {
        // Navigate without saving
        nav(href);
      }
      // If cancelled, do nothing
    };

    // Use capture phase to intercept before React Router
    document.addEventListener('click', handleClick, true);
    
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [hasUnsavedChanges, location.pathname, nav, confirm]);

  // Prevent navigation away from page if there are unsaved changes
  useEffect(() => {
    const hasUnsaved = hasUnsavedChanges;
    
    // Intercept keyboard shortcuts for reload (F5, Ctrl+R, Ctrl+Shift+R)
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!hasUnsaved) return;
      
      // F5 or Ctrl+R or Ctrl+Shift+R
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.shiftKey && e.key === 'R')) {
        e.preventDefault();
        const result = await confirm({
          title: 'Reload Site?',
          message: 'You have unsaved changes. What would you like to do?',
          confirmText: 'Save and Reload',
          cancelText: 'Cancel',
          showDiscard: true,
          discardText: 'Discard Changes'
        });
        
        if (result === 'confirm') {
          if (handleSaveRef.current) {
            await handleSaveRef.current();
          }
          window.location.reload();
        } else if (result === 'discard') {
          window.location.reload();
        }
        // If cancelled, do nothing
      }
    };

    // Handle beforeunload (for browser close/refresh via UI button)
    // Note: This can only show the browser's default dialog, not a custom modal
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        // Modern browsers ignore custom messages and show their own
        // But we still need to set returnValue to trigger the dialog
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    // Intercept browser back button
    const handlePopState = async (e: PopStateEvent) => {
      if (!hasUnsaved) return;
      
      // Push state back to prevent navigation
      window.history.pushState(null, '', window.location.href);
      
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        confirmText: 'Save and Leave',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });
      
      if (result === 'confirm') {
        if (handleSaveRef.current) {
          await handleSaveRef.current();
        }
        window.history.back();
      } else if (result === 'discard') {
        window.history.back();
      }
      // If cancelled, do nothing (already pushed state back)
    };

    // Push a state to enable popstate detection
    if (hasUnsaved) {
      window.history.pushState(null, '', window.location.href);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedChanges, confirm]);

  // derive company fields
  const companyName = (client?.display_name || client?.name || '').slice(0,50);
  const companyAddress = useMemo(()=>{
    // Helper: normalize province/state to a short code when possible
    const normalizeProvince = (prov?: string): string | undefined => {
      if (!prov) return undefined;
      const trimmed = prov.trim();
      if (!trimmed) return undefined;
      const map: Record<string, string> = {
        'british columbia': 'BC',
        'alberta': 'AB',
        'saskatchewan': 'SK',
        'manitoba': 'MB',
        'ontario': 'ON',
        'quebec': 'QC',
        'new brunswick': 'NB',
        'nova scotia': 'NS',
        'prince edward island': 'PE',
        'newfoundland and labrador': 'NL',
        'yukon': 'YT',
        'northwest territories': 'NT',
        'nunavut': 'NU',
      };
      const lower = trimmed.toLowerCase();
      if (map[lower]) return map[lower];
      // If already looks like a short code (2-3 letters), keep as is
      if (/^[A-Za-z]{2,3}$/.test(trimmed)) return trimmed;
      return trimmed;
    };

    const formatAddress = (
      fullAddressLine1: string | undefined,
      city: string | undefined,
      province: string | undefined
    ): string => {
      if (!fullAddressLine1) return '';

      // Street: everything before the first comma (ignores postal code / country that Google may append)
      const street = fullAddressLine1.split(',')[0].trim();
      const cityPart = (city || '').trim();
      const provPart = normalizeProvince(province);

      return [street, cityPart, provPart].filter(Boolean).join(', ');
    };

    if (site) {
      return formatAddress(site.site_address_line1, site.site_city, site.site_province);
    }
    return formatAddress(client?.address_line1, client?.city, client?.province);
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

  

  

  // Initialize saved hash only after fields are populated (isReady)
  useEffect(()=>{ 
    if (isReady && !lastSavedHash) {
      setLastSavedHash(computeFingerprint());
      // Update lastAutoSaveRef when proposal is loaded to prevent immediate auto-save
      lastAutoSaveRef.current = Date.now();
    }
      }, [isReady, lastSavedHash, coverTitle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingItems, optionalServices, showTotalInPdf, terms, sections, coverFoId, page2FoId, clientId, siteId, projectId, computeFingerprint]);

  const handleSave = useCallback(async()=>{
    if (disabled || isSaving) {
      if (disabled) toast.error('Editing is restricted for this project status');
      return;
    }
    try{
      setIsSaving(true);
      // When in project context, ALWAYS check if proposal already exists for this project
      // This ensures we update the existing proposal instead of creating duplicates
      let proposalId = mode==='edit'? initial?.id : undefined;
      
      // Always check for existing proposal when we have a projectId (even if mode is 'edit', 
      // we want to ensure we're using the correct proposal for this project)
      if (projectId && projectId.trim() !== '') {
        try {
          const existingProposals = await api<any[]>('GET', `/proposals?project_id=${encodeURIComponent(String(projectId))}`);
          if (Array.isArray(existingProposals) && existingProposals.length > 0) {
            // Use the first (and only) proposal for this project
            proposalId = existingProposals[0]?.id;
            console.log('Found existing proposal for project:', projectId, 'proposal ID:', proposalId);
          } else {
            console.log('No existing proposal found for project:', projectId, 'will create new');
          }
        } catch (e) {
          // If check fails, continue without ID (will create new)
          console.warn('Failed to check for existing proposal:', e);
        }
      }
      
      // Ensure project_id is properly set when we have a projectId
      const finalProjectId = (projectId && projectId.trim() !== '') ? projectId : null;
      
      const payload:any = {
        id: proposalId,
        project_id: finalProjectId,
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
        bid_price: 0, // Legacy field
        total: Number(parseAccounting(total)||'0'),
        terms_text: terms||'',
        show_total_in_pdf: showTotalInPdf,
        additional_costs: pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0') })),
        optional_services: optionalServices.map(s=> ({ service: s.service, price: Number(parseAccounting(s.price)||'0') })),
        sections: sanitizeSections(sections),
        cover_file_object_id: coverFoId||null,
        page2_file_object_id: page2FoId||null,
      };
      console.log('Saving proposal with payload:', { id: proposalId, project_id: projectId, client_id: clientId });
      const r:any = await api('POST','/proposals', payload);
      console.log('Proposal saved, response:', r);
      toast.success('Saved');
      // Stay on page after save; update saved fingerprint so warnings clear
      setLastSavedHash(computeFingerprint());
      
      // Update proposal ID ref for auto-save
      if (r?.id) {
        proposalIdRef.current = r.id;
      }
      
      // Invalidate queries to refresh data - especially important for project proposals
      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['projectProposals', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectProposals'] });
      queryClient.invalidateQueries({ queryKey: ['proposal', r?.id] });
      
      // Call onSave callback if provided (for inline editing in project context)
      if (onSave) {
        onSave();
      }
      
      // If this was a new proposal and now has id, navigate to edit page (only if not in project context)
      // Check if we're in a project context by checking if projectId is set and we're not in a standalone proposal page
      const isInProjectContext = projectId && !window.location.pathname.includes('/proposals/');
      if (mode === 'new' && r?.id && !isInProjectContext) {
        // Navigate to edit page only if not embedded in project detail
        nav(`/proposals/${encodeURIComponent(r.id)}/edit`);
      }
      lastAutoSaveRef.current = Date.now();
    }catch(e){ toast.error('Save failed'); }
    finally{ setIsSaving(false); }
  }, [disabled, isSaving, mode, initial?.id, projectId, clientId, siteId, coverTitle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, total, showTotalInPdf, terms, pricingItems, optionalServices, sections, coverFoId, page2FoId, nav, queryClient, onSave, computeFingerprint, sanitizeSections, parseAccounting]);

  // Update ref when handleSave changes
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Clear proposal function - clears all fields except orderNumber, companyName, and companyAddress
  const handleClearProposal = useCallback(async () => {
    if (disabled) {
      toast.error('Editing is restricted for this project status');
      return;
    }
    
    const result = await confirm({
      title: 'Clear Proposal',
      message: 'Are you sure you want to clear all proposal data? All fields will be reset. This action cannot be undone.',
      confirmText: 'Clear All Data',
      cancelText: 'Cancel'
    });
    
    if (result !== 'confirm') return;
    
    try {
      // Preserve orderNumber, companyName, and companyAddress (these are derived/readonly anyway)
      // Clear all other fields
      setCoverTitle('Proposal');
      // orderNumber is preserved
      setDate(getTodayLocal());
      setCreatedFor('');
      setPrimary({});
      setTypeOfProject('');
      setOtherNotes('');
      setProjectDescription('');
      setAdditionalNotes('');
      setPricingItems([]);
      setOptionalServices([]);
      setShowTotalInPdf(true);
      setTerms('');
      setSections([]);
      setCoverBlob(null);
      setCoverFoId(undefined);
      setPage2Blob(null);
      setPage2FoId(undefined);
      setDownloadUrl('');
      setLastGeneratedHash('');
      
      toast.success('Proposal cleared');
    } catch (e) {
      toast.error('Failed to clear proposal');
    }
  }, [disabled, confirm]);

  // Auto-save function (silent save without toast)
  const autoSave = useCallback(async () => {
    // Don't auto-save if already saving or if no clientId
    if (isAutoSavingRef.current || !clientId) return;
    
    // Don't auto-save if less than 3 seconds since last save
    const now = Date.now();
    if (now - lastAutoSaveRef.current < 3000) return;

    try {
      isAutoSavingRef.current = true;
      const payload:any = {
        id: proposalIdRef.current || (mode==='edit'? initial?.id : undefined),
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
        bid_price: 0, // Legacy field
        total: Number(parseAccounting(total)||'0'),
        terms_text: terms||'',
        show_total_in_pdf: showTotalInPdf,
        additional_costs: pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0') })),
        optional_services: optionalServices.map(s=> ({ service: s.service, price: Number(parseAccounting(s.price)||'0') })),
        sections: sanitizeSections(sections),
        cover_file_object_id: coverFoId||null,
        page2_file_object_id: page2FoId||null,
      };
      const r:any = await api('POST','/proposals', payload);
      
      // Update proposal ID ref for auto-save
      if (r?.id) {
        proposalIdRef.current = r.id;
      }
      
      // If this was a new proposal and now has id, update mode to edit
      if (mode === 'new' && r?.id) {
        queryClient.invalidateQueries({ queryKey: ['proposals'] });
      } else if (mode === 'edit') {
        queryClient.invalidateQueries({ queryKey: ['proposals'] });
      }
      
      setLastSavedHash(computeFingerprint());
      lastAutoSaveRef.current = Date.now();
    } catch (e) {
      // Silent fail for auto-save
    } finally {
      isAutoSavingRef.current = false;
    }
    }, [clientId, projectId, siteId, coverTitle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingItems, optionalServices, showTotalInPdf, total, terms, sections, coverFoId, page2FoId, mode, initial, queryClient, sanitizeSections, computeFingerprint, parseAccounting]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    // Only auto-save if proposal is ready
    if (!isReady || !clientId) return;

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set new timeout for auto-save (2 seconds after last change)
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 2000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
    }, [isReady, clientId, coverTitle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingItems, optionalServices, showTotalInPdf, terms, sections, coverFoId, page2FoId, autoSave]);

  // Periodic auto-save (every 30 seconds)
  useEffect(() => {
    if (!isReady || !clientId) return;

    const interval = setInterval(() => {
      autoSave();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isReady, clientId, autoSave]);

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
      form.append('bid_price', String(0)); // Legacy field
      form.append('total', String(Number(parseAccounting(total)||'0')));
      form.append('show_total_in_pdf', String(showTotalInPdf));
      form.append('terms_text', terms||'');
      form.append('additional_costs', JSON.stringify(pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0') }))));
      form.append('optional_services', JSON.stringify(optionalServices.map(s=> ({ service: s.service, price: Number(parseAccounting(s.price)||'0') }))));
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
      setLastGeneratedHash(computeFingerprint());
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

  const renderFingerprint = computeFingerprint();
  return (
    <div className="rounded-xl border bg-white p-4" onKeyDown={!disabled ? (e)=>{
      const tgt = e.target as HTMLElement;
      if (!e.altKey) return;
      if (e.key==='ArrowUp' || e.key==='ArrowDown'){
        e.preventDefault();
        const dir = e.key==='ArrowUp'? -1 : 1;
        // If in caption input, reorder images
        if (tgt && tgt.getAttribute('data-role')==='img-caption'){
          const sec = parseInt(tgt.getAttribute('data-sec')||'-1');
          const img = parseInt(tgt.getAttribute('data-img')||'-1');
          if (sec>=0 && img>=0){
            setSections(arr=> arr.map((s:any,i:number)=>{
              if (i!==sec) return s;
              const imgs = Array.isArray(s.images)? [...s.images]:[];
              const ni = img + dir; if (ni<0 || ni>=imgs.length) return s;
              const tmp = imgs[img]; imgs[img]=imgs[ni]; imgs[ni]=tmp;
              setTimeout(()=> setFocusTarget({ type:'caption', sectionIndex: sec, imageIndex: ni }), 0);
              return { ...s, images: imgs };
            }));
          }
          return;
        }
        // If in section title, reorder sections
        if (tgt && tgt.getAttribute('data-role')==='section-title'){
          const sec = parseInt(tgt.getAttribute('data-sec')||'-1');
          if (sec>=0){
            setSections(arr=>{
              const next=[...arr];
              const ni = sec + dir; if (ni<0 || ni>=next.length) return arr;
              const tmp = next[sec]; next[sec]=next[ni]; next[ni]=tmp;
              setTimeout(()=> setFocusTarget({ type:'title', sectionIndex: ni }), 0);
              return next;
            });
          }
        }
      }
    } : undefined}>
      <h2 className="text-xl font-bold mb-3">{mode==='edit'? 'Edit Proposal':'Create Proposal'}</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold mb-2">Company Info</h3>
          <div className="space-y-2 text-sm">
            <div>
              <label className="text-xs text-gray-600">Document Type</label>
              <input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={coverTitle} onChange={e=>setCoverTitle(e.target.value)} maxLength={44} aria-label="Document Type" disabled={disabled} readOnly={disabled} />
              <div className="mt-1 text-[11px] text-gray-500">{coverTitle.length}/44 characters</div>
            </div>
            <div><label className="text-xs text-gray-600">Order Number</label><input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={orderNumber} onChange={e=>setOrderNumber(e.target.value)} placeholder={nextCode?.order_number||''} disabled={disabled} readOnly={disabled} /></div>
            <div><label className="text-xs text-gray-600">Company Name</label><input className="w-full border rounded px-3 py-2" value={companyName} readOnly /></div>
            <div><label className="text-xs text-gray-600">Company Address</label><input className="w-full border rounded px-3 py-2" value={companyAddress || ''} readOnly title={companyAddress || ''} /></div>
            <div><label className="text-xs text-gray-600">Date</label><input type="date" className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={date} onChange={e=>setDate(e.target.value)} disabled={disabled} readOnly={disabled} /></div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Project Details</h3>
          <div className="space-y-2 text-sm">
            <div><label className="text-xs text-gray-600">Proposal Created For</label><input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={createdFor} onChange={e=>setCreatedFor(e.target.value)} disabled={disabled} readOnly={disabled} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs text-gray-600">Primary Name</label><input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={primary.name||''} onChange={e=>setPrimary(p=>({ ...p, name: e.target.value }))} disabled={disabled} readOnly={disabled} /></div>
              <div><label className="text-xs text-gray-600">Phone</label><input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={primary.phone||''} onChange={e=>setPrimary(p=>({ ...p, phone: e.target.value }))} disabled={disabled} readOnly={disabled} /></div>
              <div><label className="text-xs text-gray-600">Email</label><input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={primary.email||''} onChange={e=>setPrimary(p=>({ ...p, email: e.target.value }))} disabled={disabled} readOnly={disabled} /></div>
            </div>
            <div><label className="text-xs text-gray-600">Type of Project</label><input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={typeOfProject} onChange={e=>setTypeOfProject(e.target.value)} disabled={disabled} readOnly={disabled} /></div>
            <div><label className="text-xs text-gray-600">Other Notes</label><textarea className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={otherNotes} onChange={e=>setOtherNotes(e.target.value)} disabled={disabled} readOnly={disabled} /></div>
          </div>
        </div>
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-2">Images</h3>
          <div className="flex items-center gap-3 text-sm">
            <div>
              <div className="mb-1">Cover Image</div>
              {!disabled && (
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=>setPickerFor('cover')}>Choose</button>
              )}
              {coverPreview && <div className="mt-2"><img src={coverPreview} className="w-48 h-36 object-cover rounded border" /></div>}
            </div>
            <div>
              <div className="mb-1">Page 2 Image</div>
              {!disabled && (
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=>setPickerFor('page2')}>Choose</button>
              )}
              {page2Preview && <div className="mt-2"><img src={page2Preview} className="w-48 h-36 object-cover rounded border" /></div>}
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-2">Sections</h3>
          <div className="space-y-3">
            {sections.map((s:any, idx:number)=> (
              <div key={s.id||idx}
                   className={`border rounded p-3 ${dragOverSection===idx && !disabled? 'ring-2 ring-brand-red':''}`}
                   onDragOver={!disabled ? (e)=>{ e.preventDefault(); onSectionDragOver(idx); } : undefined}
                   onDrop={!disabled ? onSectionDrop : undefined}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 w-full">
                    {!disabled && (
                      <span 
                        className="inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing" 
                        title="Drag to reorder section" 
                        aria-label="Drag section handle"
                        draggable
                        onDragStart={() => {
                          onSectionDragStart(idx);
                        }}
                        onDragEnd={() => {
                          if (draggingSection === idx) {
                            setDraggingSection(null);
                            setDragOverSection(null);
                          }
                        }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <circle cx="6" cy="6" r="1.5"></circle>
                          <circle cx="10" cy="6" r="1.5"></circle>
                          <circle cx="14" cy="6" r="1.5"></circle>
                          <circle cx="6" cy="10" r="1.5"></circle>
                          <circle cx="10" cy="10" r="1.5"></circle>
                          <circle cx="14" cy="10" r="1.5"></circle>
                        </svg>
                      </span>
                    )}
                    <input data-role="section-title" data-sec={idx} onFocus={()=> setActiveSectionIndex(idx)} className={`flex-1 min-w-[240px] border rounded px-3 py-2 text-sm ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Section title" value={s.title||''} onChange={e=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, title: e.target.value }: x))} disabled={disabled} readOnly={disabled} />
                  </div>
                  {!disabled && (
                    <div className="flex items-center gap-1">
                      <button className="px-2 py-1 rounded text-gray-500 hover:text-gray-700" title="Duplicate section" onClick={()=>{
                        setSections(arr=>{
                          const copy = JSON.parse(JSON.stringify(arr[idx]||{}));
                          copy.id = 'sec_'+Math.random().toString(36).slice(2);
                          if (Array.isArray(copy.images)) copy.images = copy.images.map((im:any)=> ({ ...im, image_id: 'img_'+Math.random().toString(36).slice(2) }));
                          const next=[...arr]; next.splice(idx+1,0,copy);
                          setTimeout(()=> setFocusTarget({ type:'title', sectionIndex: idx+1 }), 0);
                          return next;
                        });
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v10H7V7Zm-2 2v10h10v2H5a2 2 0 0 1-2-2V9h2Zm6-6h8a2 2 0 0 1 2 2v8h-2V5H11V3Z"></path></svg>
                      </button>
                      <button className="px-2 py-1 rounded text-gray-500 hover:text-red-600" title="Remove section" onClick={async()=>{
                        const result = await confirm({ title:'Remove section', message:'Are you sure you want to remove this section?' });
                        if (result !== 'confirm') return;
                        setSections(arr=> arr.filter((_,i)=> i!==idx));
                      }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3h6a1 1 0 0 1 1 1v2h4v2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8H4V6h4V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-2 2 1 12h8l1-12H8Z"></path></svg>
                      </button>
                    </div>
                  )}
                </div>
                {s.type==='text' ? (
                  <textarea 
                    className={`w-full border rounded px-3 py-2 text-sm ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    rows={5} 
                    placeholder="Section text" 
                    value={s.text||''} 
                    onChange={e=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, text: e.target.value }: x))}
                    disabled={disabled}
                    readOnly={disabled}
                    onKeyDown={!disabled ? (e)=>{
                      // Handle Tab key to insert indentation (4 spaces)
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const textarea = e.currentTarget;
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const value = textarea.value;
                        
                        // Insert 4 spaces at cursor position
                        const newValue = value.substring(0, start) + '    ' + value.substring(end);
                        setSections(arr=> arr.map((x,i)=> i===idx? { ...x, text: newValue }: x));
                        
                        // Restore cursor position after the inserted spaces
                        setTimeout(() => {
                          textarea.selectionStart = textarea.selectionEnd = start + 4;
                        }, 0);
                      }
                    } : undefined}
                  />
                ) : (
                  <div>
                    {!disabled && (
                      <div className="mb-2"><button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setSectionPicker({ secId: s.id||String(idx) })}>+ Add Image</button></div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {(s.images||[]).map((img:any, j:number)=> (
                        <div key={`${img.image_id||img.file_object_id||''}-${j}`} className="border rounded p-2 flex flex-col items-center"
                             onDragOver={!disabled ? onImageDragOver : undefined}
                             onDrop={!disabled ? ()=> onImageDrop(idx, j) : undefined}
                        >
                          <div className="flex items-center justify-between mb-1">
                            {!disabled && (
                              <span className="inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing" title="Drag to reorder image" aria-label="Drag image handle" draggable onDragStart={()=> onImageDragStart(idx, j)}>
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                  <circle cx="6" cy="6" r="1.5"></circle>
                                  <circle cx="10" cy="6" r="1.5"></circle>
                                  <circle cx="14" cy="6" r="1.5"></circle>
                                  <circle cx="6" cy="10" r="1.5"></circle>
                                  <circle cx="10" cy="10" r="1.5"></circle>
                                  <circle cx="14" cy="10" r="1.5"></circle>
                                </svg>
                              </span>
                            )}
                            {!disabled && (
                              <div className="ml-auto flex items-center gap-2">
                                <button className="px-2 py-1 rounded bg-gray-100 text-xs" title="Edit image" onClick={()=> setSectionPicker({ secId: s.id||String(idx), index: j, fileObjectId: img.file_object_id })}>Edit</button>
                                <button className="px-2 py-1 rounded bg-gray-100 text-xs" title="Duplicate image" onClick={()=>{
                                  setSections(arr=> arr.map((x,i)=>{
                                    if (i!==idx) return x;
                                    const imgs = Array.isArray(x.images)? [...x.images]:[];
                                    const clone = { ...(imgs[j]||{}), image_id: 'img_'+Math.random().toString(36).slice(2) };
                                    imgs.splice(j+1,0,clone);
                                    setTimeout(()=> setFocusTarget({ type:'caption', sectionIndex: idx, imageIndex: j+1 }), 0);
                                    return { ...x, images: imgs };
                                  }));
                                }}>Duplicate</button>
                                <button className="px-2 py-1 rounded text-gray-500 hover:text-red-600" title="Remove image" onClick={async()=>{
                                  const result = await confirm({ title:'Remove image', message:'Are you sure you want to remove this image?' });
                                  if (result !== 'confirm') return;
                                  setSections(arr=> arr.map((x,i)=> i===idx? { ...x, images: (x.images||[]).filter((_:any,k:number)=> k!==j) }: x));
                                }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3h6a1 1 0 0 1 1 1v2h4v2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8H4V6h4V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-2 2 1 12h8l1-12H8Z"></path></svg>
                                </button>
                              </div>
                            )}
                          </div>
                          {img.file_object_id? (
                            <img
                              src={`/files/${img.file_object_id}/thumbnail?w=520`}
                              className="w-[260px] h-[150px] object-cover rounded"
                            />
                          ) : null}
                          <input data-role="img-caption" data-sec={idx} data-img={j} className={`mt-2 w-full border rounded px-2 py-1 text-sm ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Caption" value={img.caption||''} onChange={e=> setSections(arr=> arr.map((x,i)=> i===idx? { ...x, images: (x.images||[]).map((it:any,k:number)=> k===j? { ...it, caption: e.target.value }: it) }: x))} disabled={disabled} readOnly={disabled} />
                        </div>
                      ))}
                      {!(s.images||[]).length && <div className="text-sm text-gray-600">No images</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!disabled && (
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setSections(arr=> [...arr, { id: 'sec_'+Math.random().toString(36).slice(2), type:'text', title:'', text:'' }])}>+ Text Section</button>
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setSections(arr=> [...arr, { id: 'sec_'+Math.random().toString(36).slice(2), type:'images', title:'', images: [] }])}>+ Images Section</button>
              </div>
            )}
          </div>
        </div>
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-2">Pricing</h3>
          <div className="text-[12px] text-gray-600 mb-2">If no pricing items are added, the "Pricing Table" section will be hidden in the PDF.</div>
          <div className="space-y-2">
            {pricingItems.map((c, i)=> (
              <div key={i} className="grid grid-cols-5 gap-2">
                <input className={`col-span-3 border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Name" value={c.name} onChange={e=>{ const v=e.target.value; setPricingItems(arr=> arr.map((x,j)=> j===i? { ...x, name:v }: x)); }} disabled={disabled} readOnly={disabled} />
                <input type="text" className={`col-span-1 border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Price" value={c.price} onChange={e=>{ const v = parseAccounting(e.target.value); setPricingItems(arr=> arr.map((x,j)=> j===i? { ...x, price:v }: x)); }} onBlur={!disabled ? ()=> setPricingItems(arr=> arr.map((x,j)=> j===i? { ...x, price: formatAccounting(x.price) }: x)) : undefined} disabled={disabled} readOnly={disabled} />
                {!disabled && (
                  <button className="col-span-1 px-2 py-2 rounded bg-gray-100" onClick={()=> setPricingItems(arr=> arr.filter((_,j)=> j!==i))}>Remove</button>
                )}
              </div>
            ))}
            {!disabled && (
              <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setPricingItems(arr=> [...arr, { name:'', price:'' }])}>+ Add Cost</button>
            )}
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">Total: <span className="text-gray-600">${total}</span></div>
              <label className={`flex items-center gap-1 text-sm text-gray-600 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input 
                  type="checkbox" 
                  checked={showTotalInPdf} 
                  onChange={e=> setShowTotalInPdf(e.target.checked)}
                  className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                  disabled={disabled}
                />
                <span>Show Total in PDF</span>
              </label>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-sm font-semibold mb-1">Optional Services</div>
            <div className="text-[12px] text-gray-600 mb-2">If no services are added, the "Optional Services" section will be hidden in the PDF.</div>
            <div className="space-y-2">
              {optionalServices.map((s, i)=> (
                <div key={i} className="grid grid-cols-5 gap-2">
                  <input className={`col-span-3 border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Service" value={s.service} onChange={e=>{ const v=e.target.value; setOptionalServices(arr=> arr.map((x,j)=> j===i? { ...x, service:v }: x)); }} disabled={disabled} readOnly={disabled} />
                  <input type="text" className={`col-span-1 border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Price" value={s.price} onChange={e=>{ const v = parseAccounting(e.target.value); setOptionalServices(arr=> arr.map((x,j)=> j===i? { ...x, price:v }: x)); }} onBlur={!disabled ? ()=> setOptionalServices(arr=> arr.map((x,j)=> j===i? { ...x, price: formatAccounting(x.price) }: x)) : undefined} disabled={disabled} readOnly={disabled} />
                  {!disabled && (
                    <button className="col-span-1 px-2 py-2 rounded bg-gray-100" onClick={()=> setOptionalServices(arr=> arr.filter((_,j)=> j!==i))}>Remove</button>
                  )}
                </div>
              ))}
              {!disabled && (
                <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=> setOptionalServices(arr=> [...arr, { service:'', price:'' }])}>+ Add Service</button>
              )}
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          <h3 className="font-semibold mb-2">Terms</h3>
          <textarea className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={terms} onChange={e=>setTerms(e.target.value)} disabled={disabled} readOnly={disabled} />
        </div>
      </div>
      {downloadUrl && (renderFingerprint!==lastGeneratedHash) && (
        <div className="mb-3 p-2 rounded bg-yellow-50 border text-[12px] text-yellow-800">You have made changes since the last PDF was generated. Please click "Generate Proposal" again to update the download.</div>
      )}
      {(isReady && renderFingerprint!==lastSavedHash) && (
        <div className="mb-3 p-2 rounded bg-blue-50 border text-[12px] text-blue-800">There are unsaved changes in this proposal. Click "Save Proposal" to persist.</div>
      )}
      <div className="mt-2 flex items-center justify-between">
        {/* Only show Back button when not in project context */}
        {(!projectId || window.location.pathname.includes('/proposals/')) && (
          <button className="px-3 py-2 rounded bg-gray-100" onClick={async ()=>{
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
                await handleSave();
                nav(-1);
              } else if (result === 'discard') {
                nav(-1);
              }
              // If cancelled, do nothing
            } else {
              nav(-1);
            }
          }}>Back</button>
        )}
        {projectId && !window.location.pathname.includes('/proposals/') && <div />}
        <div className="space-x-2">
          {/* Show Clear Proposal button when in project context, Delete Proposal when in standalone /proposals route */}
          {!disabled && projectId && !window.location.pathname.includes('/proposals/') && (
            <button 
              className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50" 
              onClick={handleClearProposal}
              disabled={disabled}
            >
              Clear Proposal
            </button>
          )}
          {!disabled && mode === 'edit' && (!projectId || window.location.pathname.includes('/proposals/')) && (
            <button 
              className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700" 
              onClick={async () => {
                const result = await confirm({ 
                  title: 'Delete Proposal', 
                  message: 'Are you sure you want to delete this proposal? This action cannot be undone.' 
                });
                if (result !== 'confirm') return;
                try {
                  if (initial?.id) {
                    await api('DELETE', `/proposals/${encodeURIComponent(initial.id)}`);
                    toast.success('Proposal deleted');
                    queryClient.invalidateQueries({ queryKey: ['proposals'] });
                    queryClient.invalidateQueries({ queryKey: ['projectProposals'] });
                    // Only navigate back if not in project context
                    if (!projectId || window.location.pathname.includes('/proposals/')) {
                      nav(-1);
                    }
                  }
                } catch (e: any) {
                  console.error('Failed to delete proposal:', e);
                  toast.error(e?.response?.data?.detail || 'Failed to delete proposal');
                }
              }}
            >
              Delete Proposal
            </button>
          )}
          {!disabled && (
            <button className="px-3 py-2 rounded bg-gray-100" onClick={handleSave} disabled={disabled || isSaving}>
              {isSaving ? 'Saving...' : 'Save Proposal'}
            </button>
          )}
          <button className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-60" disabled={isGenerating} onClick={handleGenerate}>{isGenerating? 'Generating…' : 'Generate Proposal'}</button>
          {downloadUrl && (
            (renderFingerprint===lastGeneratedHash) ? (
              <a className="px-3 py-2 rounded bg-black text-white" href={downloadUrl} download="ProjectProposal.pdf">Download PDF</a>
            ) : (
              <button className="px-3 py-2 rounded bg-gray-200 text-gray-600 cursor-not-allowed" title="PDF is outdated. Generate again to enable download" disabled>Download PDF</button>
            )
          )}
        </div>
      </div>

      {pickerFor && (
        <ImagePicker isOpen={true} onClose={()=>setPickerFor(null)} clientId={clientId||undefined} targetWidth={pickerFor==='cover'? 566: 540} targetHeight={pickerFor==='cover'? 537: 340} allowEdit={true} exportScale={2} fileObjectId={pickerFor==='cover'? coverFoId: page2FoId} editorScaleFactor={pickerFor==='cover'? undefined: 1} hideEditButton={pickerFor==='cover'} onConfirm={async(blob)=>{ 
          try{
            if (!blob){ toast.error('No image'); setPickerFor(null); return; }
            const cat = pickerFor==='cover'? 'proposal-cover-derived' : 'proposal-page2-derived';
            const uniqueName = `${cat}_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
            // Use upload-proxy to avoid CORS issues
            const formData = new FormData();
            formData.append('file', blob, uniqueName);
            formData.append('original_name', uniqueName);
            formData.append('content_type', 'image/jpeg');
            formData.append('project_id', '');
            formData.append('client_id', clientId||'');
            formData.append('employee_id', '');
            formData.append('category_id', cat);
            const conf:any = await api('POST','/files/upload-proxy', formData);
            if (pickerFor==='cover'){ setCoverBlob(blob); setCoverFoId(conf.id); }
            else { setPage2Blob(blob); setPage2FoId(conf.id); }
          }catch(e){ toast.error('Upload failed'); }
          setPickerFor(null);
        }} />
      )}
      {sectionPicker && (
        <ImagePicker isOpen={true} onClose={()=>setSectionPicker(null)} clientId={clientId||undefined} targetWidth={260} targetHeight={150} allowEdit={true} exportScale={2} fileObjectId={sectionPicker.fileObjectId} editorScaleFactor={3} onConfirm={async(blob)=>{ 
          try{
            if (!blob){ toast.error('No image'); return; }
            const uniqueName = `section_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
            // Use upload-proxy to avoid CORS issues
            const formData = new FormData();
            formData.append('file', blob, uniqueName);
            formData.append('original_name', uniqueName);
            formData.append('content_type', 'image/jpeg');
            formData.append('project_id', '');
            formData.append('client_id', clientId||'');
            formData.append('employee_id', '');
            formData.append('category_id', 'proposal-section-derived');
            const conf:any = await api('POST','/files/upload-proxy', formData);
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


