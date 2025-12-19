import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import EstimateBuilder, { EstimateBuilderRef } from '@/components/EstimateBuilder';
type Client = { id:string, name?:string, display_name?:string, address_line1?:string, city?:string, province?:string, country?:string };

export default function QuoteForm({ mode, clientId: clientIdProp, initial, disabled, onSave, showRestrictionWarning, restrictionMessage }: { mode:'new'|'edit', clientId?:string, initial?: any, disabled?: boolean, onSave?: ()=>void, showRestrictionWarning?: boolean, restrictionMessage?: string }){
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const [clientId] = useState<string>(String(clientIdProp || initial?.client_id || ''));
  
  const { data:client } = useQuery({ queryKey:['client', clientId], queryFn: ()=> clientId? api<Client>('GET', `/clients/${clientId}`): Promise.resolve(null) });
  const { data:nextCode } = useQuery({ queryKey:['quoteCode', clientId], queryFn: ()=> (mode==='new' && clientId)? api<any>('GET', `/quotes/next-code?client_id=${encodeURIComponent(clientId)}`) : Promise.resolve(null) });
  const { data:contacts, refetch: refetchContacts } = useQuery({ queryKey:['clientContacts', clientId], queryFn: ()=> clientId? api<any[]>('GET', `/clients/${clientId}/contacts`): Promise.resolve([]), enabled: !!clientId });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });

  // form state
  const [templateStyle, setTemplateStyle] = useState<string>('Mack Kirk');
  const [coverTitle, setCoverTitle] = useState<string>('Quotation');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayLocal());
  const [createdFor, setCreatedFor] = useState<string>('');
  const [primary, setPrimary] = useState<{ name?:string, phone?:string, email?:string }>({});
  const [typeOfProject, setTypeOfProject] = useState<string>('');
  const [otherNotes, setOtherNotes] = useState<string>('');
  const [projectDescription, setProjectDescription] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  const [pricingItems, setPricingItems] = useState<{ name:string, price:string, pst?:boolean, gst?:boolean }[]>([]);
  const [optionalServices, setOptionalServices] = useState<{ service:string, price:string }[]>([]);
  const [showTotalInPdf, setShowTotalInPdf] = useState<boolean>(true);
  const [pricingType, setPricingType] = useState<'pricing'|'estimate'>('pricing');
  const [markup, setMarkup] = useState<number>(0);
  const [pstRate, setPstRate] = useState<number>(7);
  const [gstRate, setGstRate] = useState<number>(5);
  const [profitRate, setProfitRate] = useState<number>(0);
  
  // Estimate values for when pricingType === 'estimate'
  const [estimateGrandTotal, setEstimateGrandTotal] = useState<number>(0);
  const [estimateTotalEstimate, setEstimateTotalEstimate] = useState<number>(0); // Total Estimate (before GST)
  const [estimatePst, setEstimatePst] = useState<number>(0);
  const [estimateGst, setEstimateGst] = useState<number>(0);
  
  // Update estimate values periodically when using estimate pricing
  useEffect(() => {
    if (pricingType === 'estimate' && estimateBuilderRef.current) {
      const interval = setInterval(() => {
        const total = estimateBuilderRef.current?.getGrandTotal() || 0;
        const totalEstimate = estimateBuilderRef.current?.getTotalEstimate() || 0; // Total Estimate (before GST)
        const pstValue = estimateBuilderRef.current?.getPst() || 0;
        const gstValue = estimateBuilderRef.current?.getGst() || 0;
        setEstimateGrandTotal(total);
        setEstimateTotalEstimate(totalEstimate);
        setEstimatePst(pstValue);
        setEstimateGst(gstValue);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setEstimateGrandTotal(0);
      setEstimateTotalEstimate(0);
      setEstimatePst(0);
      setEstimateGst(0);
    }
  }, [pricingType]);
  const defaultTermsText = '';

  const [terms, setTerms] = useState<string>(mode === 'new' ? defaultTermsText : '');
  const [sections, setSections] = useState<any[]>([]);
  const [coverBlob, setCoverBlob] = useState<Blob|null>(null);
  const [coverFoId, setCoverFoId] = useState<string|undefined>(undefined);
  const [pickerFor, setPickerFor] = useState<null|'cover'>(null);
  const [sectionPicker, setSectionPicker] = useState<{ secId:string, index?: number, fileObjectId?: string }|null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const newImageId = ()=> 'img_'+Math.random().toString(36).slice(2);
  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [lastSavedHash, setLastSavedHash] = useState<string>('');
  const [lastGeneratedHash, setLastGeneratedHash] = useState<string>('');
  const [isReady, setIsReady] = useState<boolean>(false);
  const [focusTarget, setFocusTarget] = useState<{ type:'title'|'caption', sectionIndex:number, imageIndex?: number }|null>(null);
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(-1);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRole, setNewContactRole] = useState('');
  const [newContactDept, setNewContactDept] = useState('');
  const [newContactPrimary, setNewContactPrimary] = useState('false');
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [contactNameError, setContactNameError] = useState(false);
  const [contactPhotoBlob, setContactPhotoBlob] = useState<Blob|null>(null);
  const [pickerForContact, setPickerForContact] = useState<string|null>(null);
  const confirm = useConfirm();
  const { setHasUnsavedChanges: setGlobalUnsavedChanges } = useUnsavedChanges();
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoSavingRef = useRef<boolean>(false);
  const lastAutoSaveRef = useRef<number>(0);
  const quoteIdRef = useRef<string | undefined>(mode === 'edit' ? initial?.id : undefined);
  const handleSaveRef = useRef<() => Promise<void>>();
  const estimateBuilderRef = useRef<EstimateBuilderRef | null>(null);

  // --- Helpers declared early so effects can safely reference them
  const sanitizeSections = (arr:any[])=> (arr||[]).map((sec:any)=>{
    if (sec?.type==='images'){
      return {
        type: 'images',
        title: String(sec.title||''),
        images: (sec.images||[]).map((im:any)=> ({ file_object_id: String(im.file_object_id||''), caption: String(im.caption||'') }))
      };
    }
    // Filter out estimate sections - they're now handled in pricing area
    if (sec?.type==='estimate'){
      return null;
    }
    return { type:'text', title: String(sec?.title||''), text: String(sec?.text||'') };
  }).filter((sec:any)=> sec !== null);

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

  const totalNum = useMemo(()=>{ 
    return pricingItems.reduce((a,c)=> a + Number(parseAccounting(c.price)||'0'), 0); 
  }, [pricingItems]);

  // Calculate PST only on items marked for PST
  const totalForPst = useMemo(() => {
    return pricingItems
      .filter(c => c.pst === true)
      .reduce((a, c) => a + Number(parseAccounting(c.price)||'0'), 0);
  }, [pricingItems]);

  // Calculate GST only on items marked for GST
  const totalForGst = useMemo(() => {
    return pricingItems
      .filter(c => c.gst === true)
      .reduce((a, c) => a + Number(parseAccounting(c.price)||'0'), 0);
  }, [pricingItems]);

  // Calculate Summary values for manual pricing
  const totalWithMarkup = useMemo(() => {
    return totalNum * (1 + (markup / 100));
  }, [totalNum, markup]);

  const markupValue = useMemo(() => {
    return totalWithMarkup - totalNum;
  }, [totalWithMarkup, totalNum]);

  const pst = useMemo(() => {
    // PST is calculated only on items marked for PST (applied to direct costs)
    return totalForPst * (pstRate / 100);
  }, [totalForPst, pstRate]);

  const subtotal = useMemo(() => {
    // Sub-total = Total Direct Costs + PST
    return totalNum + pst;
  }, [totalNum, pst]);

  const gst = useMemo(() => {
    // GST is calculated only on items marked for GST (applied directly to direct costs, independent of PST)
    return totalForGst * (gstRate / 100);
  }, [totalForGst, gstRate]);

  const grandTotal = useMemo(() => {
    // Final Total = Sub-total + GST
    return subtotal + gst;
  }, [subtotal, gst]);

  // Use estimate values when pricingType === 'estimate', otherwise use manual pricing
  const displayTotal = useMemo(() => {
    return pricingType === 'estimate' ? estimateGrandTotal : grandTotal;
  }, [pricingType, estimateGrandTotal, grandTotal]);

  const displayPst = useMemo(() => {
    return pricingType === 'estimate' ? estimatePst : pst;
  }, [pricingType, estimatePst, pst]);

  const displayGst = useMemo(() => {
    return pricingType === 'estimate' ? estimateGst : gst;
  }, [pricingType, estimateGst, gst]);

  // Calculate if PST/GST should be shown in PDF based on items
  const showPstInPdf = useMemo(() => {
    return pricingItems.some(item => item.pst === true);
  }, [pricingItems]);

  const showGstInPdf = useMemo(() => {
    return pricingItems.some(item => item.gst === true);
  }, [pricingItems]);

  const computeFingerprint = ()=>{
    try{
      const payload = {
        coverTitle,
        templateStyle,
        orderNumber: orderNumber,
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
        showPstInPdf,
        showGstInPdf,
        pricingType,
        // Include displayTotal when using estimate pricing to trigger auto-save on estimate changes
        displayTotal: pricingType === 'estimate' ? displayTotal : undefined,
        markup,
        pstRate,
        gstRate,
        profitRate,
        terms,
        sections: sanitizeSections(sections),
        coverFoId,
        clientId,
      };
      return JSON.stringify(payload);
    }catch(_e){ return Math.random().toString(36); }
  };

  // prefill from initial (edit)
  useEffect(()=>{
    if (!initial) return;
    const d = initial?.data || {};
    setCoverTitle(String(d.cover_title || initial.title || 'Quotation'));
    setTemplateStyle(String(d.template_style || 'Mack Kirk'));
    const savedOrderNumber = String(initial.order_number || d.order_number || initial.code || '');
    setOrderNumber(savedOrderNumber);
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
    const loadedItems: { name:string, price:string, pst?:boolean, gst?:boolean }[] = [];
    if (legacyBidPrice && Number(legacyBidPrice) > 0) {
      loadedItems.push({ name: 'Bid Price', price: formatAccounting(legacyBidPrice), pst: false, gst: false });
    }
    dc.forEach((c:any)=> {
      const label = String(c.label||'');
      const value = c.value ?? c.amount ?? '';
      if (label && Number(value) > 0) {
        loadedItems.push({ 
          name: label, 
          price: formatAccounting(value),
          pst: c.pst === true || c.pst === 'true' || c.pst === 1,
          gst: c.gst === true || c.gst === 'true' || c.gst === 1
        });
      }
    });
    setPricingItems(loadedItems);
    const os = Array.isArray(d.optional_services)? d.optional_services : [];
    setOptionalServices(os.map((s:any)=> ({ service: String(s.service||''), price: formatAccounting(s.price ?? '') })));
    setShowTotalInPdf(d.show_total_in_pdf !== undefined ? Boolean(d.show_total_in_pdf) : true);
    // Load pricing type (pricing or estimate)
    const savedPricingType = d.pricing_type || 'pricing';
    setPricingType(savedPricingType === 'estimate' ? 'estimate' : 'pricing');
    setMarkup(d.markup !== undefined && d.markup !== null ? Number(d.markup) : 5);
    setPstRate(d.pst_rate !== undefined && d.pst_rate !== null ? Number(d.pst_rate) : 7);
    setGstRate(d.gst_rate !== undefined && d.gst_rate !== null ? Number(d.gst_rate) : 5);
    setProfitRate(d.profit_rate !== undefined && d.profit_rate !== null ? Number(d.profit_rate) : 0);
    setTerms(String(d.terms_text||defaultTermsText));
    const loaded = Array.isArray(d.sections)? JSON.parse(JSON.stringify(d.sections)) : [];
    const normalized = loaded.map((sec:any)=>{
      if (sec?.type==='images'){
        const imgs = (sec.images||[]).map((im:any)=> ({ image_id: im.image_id || newImageId(), file_object_id: String(im.file_object_id||''), caption: String(im.caption||'') }));
        return { type:'images', title: String(sec.title||''), images: imgs };
      }
      // Remove estimate sections - they're now handled in pricing area
      if (sec?.type==='estimate'){
        return null;
      }
      return { type:'text', title: String(sec.title||''), text: String(sec.text||'') };
    }).filter((sec:any)=> sec !== null);
    setSections(normalized);
    setCoverFoId(d.cover_file_object_id||undefined);
    // Update quote ID ref for auto-save
    if (initial?.id) {
      quoteIdRef.current = initial.id;
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
  }, [isReady, lastSavedHash, coverTitle, templateStyle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingItems, optionalServices, showTotalInPdf, showPstInPdf, showGstInPdf, markup, pstRate, gstRate, profitRate, terms, sections, coverFoId, clientId, computeFingerprint]);
  
  // Sync selected contact when contacts are loaded or createdFor changes (only on initial load)
  useEffect(() => {
    if (!isReady || !contacts) return;
    // Only sync if we don't have a selected contact yet and createdFor matches a contact
    if (!selectedContactId && createdFor) {
      const matchedContact = contacts.find(c => c.name === createdFor);
      if (matchedContact) {
        setSelectedContactId(String(matchedContact.id));
      }
    }
  }, [contacts, createdFor, isReady, selectedContactId]);
  
  // Handle ESC key to close contact modal
  useEffect(() => {
    if (!contactModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContactModalOpen(false);
        setNewContactName('');
        setNewContactEmail('');
        setNewContactPhone('');
        setNewContactRole('');
        setNewContactDept('');
        setNewContactPrimary('false');
        setContactNameError(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contactModalOpen]);

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

    return formatAddress(client?.address_line1, client?.city, client?.province);
  }, [client]);

  // Sync orderNumber with quote code when available
  useEffect(()=>{ 
    if (mode==='new' && nextCode?.order_number && !orderNumber) {
      setOrderNumber(nextCode.order_number);
    }
  }, [nextCode, mode, orderNumber]);

  useEffect(()=>{
    if (coverFoId) setCoverPreview(`/files/${coverFoId}/thumbnail?w=600`);
    else if (coverBlob) setCoverPreview(URL.createObjectURL(coverBlob));
    else setCoverPreview('');
    return ()=>{};
  }, [coverFoId, coverBlob]);

  

  

  // Initialize saved hash only after fields are populated (isReady)
  useEffect(()=>{ 
    if (isReady && !lastSavedHash) {
      setLastSavedHash(computeFingerprint());
      // Update lastAutoSaveRef when quote is loaded to prevent immediate auto-save
      lastAutoSaveRef.current = Date.now();
    }
      }, [isReady, lastSavedHash, coverTitle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingItems, optionalServices, showTotalInPdf, terms, sections, coverFoId, clientId, computeFingerprint]);

  const handleSave = useCallback(async()=>{
    if (disabled || isSaving) {
      if (disabled) toast.error('Editing is restricted');
      return;
    }
    try{
      setIsSaving(true);
      
      // If using estimate pricing, save the estimate first
      if (pricingType === 'estimate' && estimateBuilderRef.current) {
        try {
          const estimateSaved = await estimateBuilderRef.current.save();
          if (!estimateSaved) {
            toast.error('Failed to save estimate');
            setIsSaving(false);
            return;
          }
        } catch (e) {
          console.error('Error saving estimate:', e);
          toast.error('Failed to save estimate');
          setIsSaving(false);
          return;
        }
      }
      
      const quoteId = mode==='edit'? initial?.id : undefined;
      
      const payload:any = {
        id: quoteId,
        client_id: clientId||null,
        code: orderNumber||null,
        order_number: orderNumber||null,
        cover_title: coverTitle,
        template_style: templateStyle,
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
        total: totalNum,
        display_total: displayTotal, // Save the final total (grandTotal) for display in cards
        terms_text: terms||'',
        show_total_in_pdf: showTotalInPdf,
        show_pst_in_pdf: showPstInPdf,
        show_gst_in_pdf: showGstInPdf,
        additional_costs: pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0'), pst: c.pst === true, gst: c.gst === true })),
        optional_services: optionalServices.map(s=> ({ service: s.service, price: Number(parseAccounting(s.price)||'0') })),
        pricing_type: pricingType,
        markup: markup,
        pst_rate: pstRate,
        gst_rate: gstRate,
        profit_rate: profitRate,
        sections: sanitizeSections(sections),
        cover_file_object_id: coverFoId||null,
      };
      const r:any = await api('POST','/quotes', payload);
      toast.success('Saved');
      setLastSavedHash(computeFingerprint());
      
      if (r?.id) {
        quoteIdRef.current = r.id;
      }
      
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote', r?.id] });
      queryClient.invalidateQueries({ queryKey: ['clientQuotes', clientId] });
      
      if (onSave) {
        onSave();
      }
      
      lastAutoSaveRef.current = Date.now();
    }catch(e){ toast.error('Save failed'); }
    finally{ setIsSaving(false); }
  }, [disabled, isSaving, mode, initial?.id, clientId, coverTitle, templateStyle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, totalNum, showTotalInPdf, showPstInPdf, showGstInPdf, markup, pstRate, gstRate, profitRate, terms, pricingItems, optionalServices, sections, coverFoId, nav, queryClient, onSave, computeFingerprint, sanitizeSections, parseAccounting]);

  // Update ref when handleSave changes
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Clear quote function - clears all fields except orderNumber, companyName, and companyAddress
  const handleClearQuote = useCallback(async () => {
    if (disabled) {
      toast.error('Editing is restricted');
      return;
    }
    
    const result = await confirm({
      title: 'Clear Quote',
      message: 'Are you sure you want to clear all quote data? All fields will be reset. This action cannot be undone.',
      confirmText: 'Clear All Data',
      cancelText: 'Cancel'
    });
    
    if (result !== 'confirm') return;
    
    try {
      setCoverTitle('Quotation');
      setPricingType('pricing');
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
      setMarkup(5);
      setPstRate(7);
      setGstRate(5);
      setProfitRate(0);
      setTerms('');
      setSections([]);
      setCoverBlob(null);
      setCoverFoId(undefined);
      setDownloadUrl('');
      setLastGeneratedHash('');
      
      toast.success('Quote cleared');
    } catch (e) {
      toast.error('Failed to clear quote');
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
      
      // If using estimate pricing, save the estimate first
      if (pricingType === 'estimate' && estimateBuilderRef.current) {
        try {
          await estimateBuilderRef.current.save();
        } catch (e) {
          console.error('Error saving estimate in auto-save:', e);
          // Continue with quote save even if estimate save fails
        }
      }
      
      const payload:any = {
        id: quoteIdRef.current || (mode==='edit'? initial?.id : undefined),
        client_id: clientId||null,
        code: orderNumber||null,
        order_number: orderNumber||null,
        cover_title: coverTitle,
        template_style: templateStyle,
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
        total: totalNum,
        display_total: displayTotal, // Save the final total (grandTotal) for display in cards
        terms_text: terms||'',
        show_total_in_pdf: showTotalInPdf,
        show_pst_in_pdf: showPstInPdf,
        show_gst_in_pdf: showGstInPdf,
        additional_costs: pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0'), pst: c.pst === true, gst: c.gst === true })),
        optional_services: optionalServices.map(s=> ({ service: s.service, price: Number(parseAccounting(s.price)||'0') })),
        pricing_type: pricingType,
        markup: markup,
        pst_rate: pstRate,
        gst_rate: gstRate,
        profit_rate: profitRate,
        sections: sanitizeSections(sections),
        cover_file_object_id: coverFoId||null,
      };
      const r:any = await api('POST','/quotes', payload);
      
      // Update quote ID ref for auto-save
      if (r?.id) {
        quoteIdRef.current = r.id;
      }
      
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote', r?.id] });
      queryClient.invalidateQueries({ queryKey: ['clientQuotes', clientId] });
      
      setLastSavedHash(computeFingerprint());
      lastAutoSaveRef.current = Date.now();
    } catch (e) {
      // Silent fail for auto-save
    } finally {
      isAutoSavingRef.current = false;
    }
    }, [clientId, coverTitle, templateStyle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingItems, optionalServices, showTotalInPdf, showPstInPdf, showGstInPdf, markup, pstRate, gstRate, profitRate, totalNum, terms, sections, coverFoId, mode, initial, queryClient, sanitizeSections, computeFingerprint, parseAccounting]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    // Only auto-save if quote is ready
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
    }, [isReady, clientId, coverTitle, templateStyle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingItems, optionalServices, showTotalInPdf, showPstInPdf, showGstInPdf, terms, sections, coverFoId, pricingType, displayTotal, autoSave]);

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
      form.append('cover_title', coverTitle||'Quotation');
      form.append('template_style', templateStyle||'Mack Kirk');
      form.append('order_number', orderNumber||'');
      form.append('company_name', companyName||'');
      form.append('company_address', companyAddress||'');
      form.append('date', date||'');
      form.append('project_name_description', projectDescription||'');
      // For quotes, we don't have project or site
      form.append('project_name', '');
      form.append('site_address', '');
      // Client name
      const clientName = client?.display_name || client?.name || '';
      form.append('client_name', clientName);
      form.append('proposal_created_for', createdFor||'');
      form.append('primary_contact_name', primary.name||'');
      form.append('primary_contact_phone', primary.phone||'');
      form.append('primary_contact_email', primary.email||'');
      form.append('type_of_project', typeOfProject||'');
      form.append('other_notes', otherNotes||'');
      form.append('additional_project_notes', additionalNotes||'');
      form.append('bid_price', String(0)); // Legacy field
      form.append('total', String(displayTotal));
      form.append('show_total_in_pdf', String(showTotalInPdf));
      form.append('show_pst_in_pdf', String(showPstInPdf));
      form.append('show_gst_in_pdf', String(showGstInPdf));
      form.append('pst_value', String(displayPst));
      form.append('gst_value', String(displayGst));
      // For estimate pricing, use the Total Estimate (before GST) from summary table; otherwise use 0
      const estimateTotal = pricingType === 'estimate' ? estimateTotalEstimate : 0;
      form.append('estimate_total_estimate', String(estimateTotal));
      form.append('terms_text', terms||'');
      form.append('pricing_type', pricingType);
      form.append('markup', String(markup));
      form.append('pst_rate', String(pstRate));
      form.append('gst_rate', String(gstRate));
      form.append('profit_rate', String(profitRate));
      form.append('additional_costs', JSON.stringify(pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0') }))));
      form.append('optional_services', JSON.stringify(optionalServices.map(s=> ({ service: s.service, price: Number(parseAccounting(s.price)||'0') }))));
      form.append('sections', JSON.stringify(sanitizeSections(sections)));
      if (coverFoId) form.append('cover_file_object_id', coverFoId);
      if (coverBlob) form.append('cover_image', coverBlob, 'cover.jpg');
      const token = localStorage.getItem('user_token');
      const resp = await fetch('/quotes/generate', { method:'POST', headers: token? { Authorization: 'Bearer '+token } : undefined, body: form });
      if (!resp.ok){ toast.error('Generate failed'); return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      toast.success('Quote ready');
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
    <div onKeyDown={!disabled ? (e)=>{
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
      {/* Restriction Warning - appears before blocks */}
      {showRestrictionWarning && restrictionMessage && (
        <div className="mb-4">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            <strong>Editing Restricted:</strong> {restrictionMessage}
          </div>
        </div>
      )}
      
      <div className="space-y-6">
        {/* General Information Block */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-3 text-white font-semibold">
            General Information
          </div>
          <div className="p-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Card 1 */}
              <div className="space-y-2 text-sm">
                <div>
                  <label className="text-sm text-gray-600">Template Style</label>
                  <select 
                    className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    value={templateStyle}
                    onChange={e=>setTemplateStyle(e.target.value)}
                    disabled={disabled}
                  >
                    <option value="Mack Kirk">Mack Kirk</option>
                    <option value="Mack Kirk Metals">Mack Kirk Metals</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Document Type (Shown on cover page)</label>
                  <input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={coverTitle} onChange={e=>setCoverTitle(e.target.value)} maxLength={44} aria-label="Document Type" disabled={disabled} readOnly={disabled} />
                  <div className="mt-1 text-[11px] text-gray-500">{coverTitle.length}/44 characters</div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Type of Quotation</label>
                  <input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={typeOfProject} onChange={e=>setTypeOfProject(e.target.value)} disabled={disabled} readOnly={disabled} />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Date</label>
                  <input type="date" className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={date} onChange={e=>setDate(e.target.value)} disabled={disabled} readOnly={disabled} />
                </div>
              </div>
              {/* Card 2 */}
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-sm text-gray-600">Primary Contact Name</label>
                    <select 
                      className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      value={contactModalOpen ? '__new__' : selectedContactId}
                      onChange={e=>{
                        const contactId = e.target.value;
                        if (contactId === '__new__') {
                          setContactModalOpen(true);
                        } else {
                          setSelectedContactId(contactId);
                          if (contactId && contacts) {
                            const contact = contacts.find(c => String(c.id) === contactId);
                            if (contact) {
                              setCreatedFor(contact.name || '');
                              setPrimary({
                                name: contact.name || '',
                                phone: contact.phone || '',
                                email: contact.email || ''
                              });
                            }
                          } else {
                            setCreatedFor('');
                            setPrimary({ name: '', phone: '', email: '' });
                          }
                        }
                      }}
                      disabled={disabled}
                    >
                      <option value="">-- Select Contact --</option>
                      {(contacts||[]).map(contact => (
                        <option key={contact.id} value={String(contact.id)}>
                          {contact.name || 'Unnamed Contact'}
                        </option>
                      ))}
                      {!disabled && (
                        <option value="__new__">+ New Contact</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Primary Contact Phone</label>
                    <input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={primary.phone||''} onChange={e=>setPrimary(p=>({ ...p, phone: e.target.value }))} disabled={disabled} readOnly={disabled} />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Primary Contact Email</label>
                    <input className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={primary.email||''} onChange={e=>setPrimary(p=>({ ...p, email: e.target.value }))} disabled={disabled} readOnly={disabled} />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Other Notes</label>
                  <textarea className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={otherNotes} onChange={e=>setOtherNotes(e.target.value)} maxLength={250} disabled={disabled} readOnly={disabled} />
                  <div className="mt-1 text-[11px] text-gray-500">{otherNotes.length}/250 characters</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="mb-1 text-sm text-gray-600">Front Cover Image</div>
                    {!disabled && (
                      <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=>setPickerFor('cover')}>Choose</button>
                    )}
                    {coverPreview && <div className="mt-2"><img src={coverPreview} className="w-full rounded border" style={{ aspectRatio: '566/537', objectFit: 'contain' }} /></div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Sections Block */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-3 text-white font-semibold">
            Sections
          </div>
          <div className="p-4">
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
                <button className="px-3 py-1.5 rounded bg-gray-100 text-base" onClick={()=> setSections(arr=> [...arr, { id: 'sec_'+Math.random().toString(36).slice(2), type:'text', title:'', text:'' }])}>+ Text Section</button>
                <button className="px-3 py-1.5 rounded bg-gray-100 text-base" onClick={()=> setSections(arr=> [...arr, { id: 'sec_'+Math.random().toString(36).slice(2), type:'images', title:'', images: [] }])}>+ Images Section</button>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Pricing Block */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-3 text-white font-semibold">
            Pricing
          </div>
          <div className="p-4">
          {!disabled && (
            <div className="mb-3">
              <select
                value={pricingType}
                onChange={(e) => setPricingType(e.target.value as 'pricing' | 'estimate')}
                className="border rounded px-3 py-1.5 text-sm text-gray-700 cursor-pointer"
                disabled={disabled}
              >
                <option value="pricing">Insert Pricing manually</option>
                <option value="estimate">Insert Pricing via Estimate</option>
              </select>
            </div>
          )}
          <div className="text-[12px] text-gray-600 mb-2">If no pricing items are added, the "Pricing Table" section will be hidden in the PDF.</div>
          {pricingType === 'pricing' ? (
            <>
              {!disabled && (
                <div className="sticky top-0 z-30 bg-white/95 backdrop-blur mb-3 py-3 border-b">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={()=> setPricingItems(arr=> [...arr, { name:'', price:'', pst: false, gst: false }])}
                      disabled={disabled}
                      className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-base">
                      + Add Pricing Item
                    </button>
                    <div className="ml-auto flex items-center gap-3 text-sm">
                      <label className="text-sm">PST (%)</label>
                      <input 
                        type="number" 
                        className="border rounded px-2 py-1 w-20" 
                        value={pstRate} 
                        min={0} 
                        step={1} 
                        onChange={e=>setPstRate(Number(e.target.value||0))} 
                        disabled={disabled}
                      />
                      <label className="text-sm">GST (%)</label>
                      <input 
                        type="number" 
                        className="border rounded px-2 py-1 w-20" 
                        value={gstRate} 
                        min={0} 
                        step={1} 
                        onChange={e=>setGstRate(Number(e.target.value||0))} 
                        disabled={disabled}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {/* Pricing items list - below the gray line */}
              <div className="space-y-2">
                {pricingItems.map((c, i)=> (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input className={`col-span-6 border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Name" value={c.name} onChange={e=>{ const v=e.target.value; setPricingItems(arr=> arr.map((x,j)=> j===i? { ...x, name:v }: x)); }} disabled={disabled} readOnly={disabled} />
                    <input type="text" className={`col-span-2 border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Price" value={c.price} onChange={e=>{ const v = parseAccounting(e.target.value); setPricingItems(arr=> arr.map((x,j)=> j===i? { ...x, price:v }: x)); }} onBlur={!disabled ? ()=> setPricingItems(arr=> arr.map((x,j)=> j===i? { ...x, price: formatAccounting(x.price) }: x)) : undefined} disabled={disabled} readOnly={disabled} />
                    <div className="col-span-2 flex items-center gap-3">
                      <span className="text-sm text-gray-600 whitespace-nowrap">Apply for this item:</span>
                      <label className={`flex items-center gap-1 text-sm ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          checked={c.pst === true}
                          onChange={e=> setPricingItems(arr=> arr.map((x,j)=> j===i? { ...x, pst: e.target.checked }: x))}
                          className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                          disabled={disabled}
                        />
                        <span className="text-gray-700">PST</span>
                      </label>
                      <label className={`flex items-center gap-1 text-sm ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                        <input 
                          type="checkbox" 
                          checked={c.gst === true}
                          onChange={e=> setPricingItems(arr=> arr.map((x,j)=> j===i? { ...x, gst: e.target.checked }: x))}
                          className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                          disabled={disabled}
                        />
                        <span className="text-gray-700">GST</span>
                      </label>
                    </div>
                    {!disabled && (
                      <button className="col-span-2 px-2 py-2 rounded bg-gray-100" onClick={()=> setPricingItems(arr=> arr.filter((_,j)=> j!==i))}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Show PST, GST fields even when disabled (read-only view) */}
              {disabled && (
                <div className="mt-4 flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <span>PST (%)</span>
                    <input 
                      type="number" 
                      className="border rounded px-2 py-1 w-20 bg-gray-100 cursor-not-allowed" 
                      value={pstRate} 
                      disabled={true}
                      readOnly={true}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <span>GST (%)</span>
                    <input 
                      type="number" 
                      className="border rounded px-2 py-1 w-20 bg-gray-100 cursor-not-allowed" 
                      value={gstRate} 
                      disabled={true}
                      readOnly={true}
                    />
                  </label>
                </div>
              )}

              {/* Summary Section */}
              <div className="mt-6">
                <div className="rounded-xl border bg-white overflow-hidden">
                  {/* Summary Header - Gray */}
                  <div className="bg-gray-500 p-3 text-white font-semibold">
                    Summary
                  </div>
                  
                  {/* Two Cards Grid - inside Summary card */}
                  <div className="p-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Left Card */}
                      <div className="rounded-xl border bg-white p-4">
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Total Direct Costs</span><span className="font-bold">${totalNum.toFixed(2)}</span></div>
                          <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>PST ({pstRate}%)</span><span>${pst.toFixed(2)}</span></div>
                          <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Sub-total</span><span className="font-bold">${subtotal.toFixed(2)}</span></div>
                        </div>
                      </div>
                      {/* Right Card */}
                      <div className="rounded-xl border bg-white p-4">
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>GST ({gstRate}%)</span><span>${gst.toFixed(2)}</span></div>
                          <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1 text-lg"><span className="font-bold">Final Total (with GST)</span><span className="font-bold">${grandTotal.toFixed(2)}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </>
          ) : (
            <div>
              {/* For quotes, use quoteId as projectId to make estimate independent but still saveable */}
              {quoteIdRef.current ? (
                <EstimateBuilder 
                  ref={estimateBuilderRef}
                  projectId={quoteIdRef.current}
                  statusLabel=""
                  settings={settings||{}} 
                  isBidding={false}
                  canEdit={true}
                  hideFooter={true}
                />
              ) : (
                <div className="text-sm text-gray-600 p-4 border rounded bg-gray-50">
                  Please save the quotation first to use Estimate pricing.
                </div>
              )}
            </div>
          )}

          {/* Total with Show in PDF checkbox - PST/GST shown in PDF automatically based on items marked */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">Total: <span className="text-gray-600">${formatAccounting(displayTotal)}</span></div>
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
          </div>
        </div>

        {/* Optional Services Block */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-3 text-white font-semibold">
            Optional Services
          </div>
          <div className="p-4">
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
                <button className="px-3 py-1.5 rounded bg-gray-100 text-base" onClick={()=> setOptionalServices(arr=> [...arr, { service:'', price:'' }])}>+ Add Service</button>
              )}
            </div>
          </div>
        </div>

        {/* Terms Block */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-3 text-white font-semibold">
            Terms
          </div>
          <div className="p-4">
            <textarea 
              className={`w-full border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} 
              value={terms} 
              onChange={e=>setTerms(e.target.value)} 
              disabled={disabled} 
              readOnly={disabled}
              rows={12}
              style={{ minHeight: '250px' }}
            />
          </div>
        </div>
        
        {downloadUrl && (renderFingerprint!==lastGeneratedHash) && (
          <div className="mb-3 p-2 rounded bg-yellow-50 border text-[12px] text-yellow-800">You have made changes since the last PDF was generated. Please click "Generate Quote" again to update the download.</div>
        )}
        
        {/* Spacer to prevent fixed bar from overlapping content */}
        <div className="h-24" />
      </div>
      
      {/* Fixed footer bar */}
      <div className="fixed left-60 right-0 bottom-0 z-40">
        <div className="px-4">
          <div className="mx-auto max-w-[1400px] rounded-t-xl border bg-white/95 backdrop-blur p-4 flex items-center justify-between shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
            {/* Left: Status indicator */}
            {hasUnsavedChanges ? (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 font-medium">
                Unsaved changes
              </div>
            ) : (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1.5 font-medium">
                All changes saved
              </div>
            )}
            
            {/* Center: Empty space */}
            <div className="flex-1"></div>
            
            {/* Right: Action buttons */}
            <div className="flex items-center gap-2">
              {!disabled && (
                <button 
                  className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors" 
                  onClick={handleClearQuote}
                  disabled={disabled}
                >
                  Clear Quote
                </button>
              )}
              {!disabled && mode === 'edit' && (
                <>
                  <button 
                    className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors" 
                    onClick={async () => {
                      const result = await confirm({ 
                        title: 'Delete Quote', 
                        message: 'Are you sure you want to delete this quote? This action cannot be undone.' 
                      });
                      if (result !== 'confirm') return;
                      try {
                        if (initial?.id) {
                          await api('DELETE', `/quotes/${encodeURIComponent(initial.id)}`);
                          toast.success('Quote deleted');
                          queryClient.invalidateQueries({ queryKey: ['quotes'] });
                          queryClient.invalidateQueries({ queryKey: ['clientQuotes', clientId] });
                          
                          // Determine redirect based on where user came from
                          // Check location state first (if passed during navigation)
                          const state = location.state as any;
                          const cameFromCustomer = state?.fromCustomer || false;
                          
                          // Fallback: check referrer if state is not available
                          const referrer = document.referrer || '';
                          const referrerIndicatesCustomer = referrer.includes('/customers/') && clientId;
                          
                          if ((cameFromCustomer || referrerIndicatesCustomer) && clientId) {
                            // Redirect to customer's quotes tab
                            nav(`/customers/${encodeURIComponent(clientId)}?tab=quotes`);
                          } else {
                            // Redirect to main quotations page
                            nav('/quotes');
                          }
                        }
                      } catch (e: any) {
                        console.error('Failed to delete quote:', e);
                        toast.error(e?.response?.data?.detail || 'Failed to delete quote');
                      }
                    }}
                  >
                    Delete Quote
                  </button>
                  <div className="w-px h-5 bg-gray-300"></div>
                </>
              )}
              {!disabled && (
                <button 
                  className={`px-5 py-2 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm ${
                    hasUnsavedChanges
                      ? 'bg-gradient-to-r from-brand-red to-[#ee2b2b] hover:from-red-700 hover:to-red-800' 
                      : 'bg-gray-400 hover:bg-gray-500'
                  }`}
                  onClick={handleSave} 
                  disabled={disabled || isSaving || !hasUnsavedChanges}
                >
                  {isSaving ? 'Saving...' : 'Save Quote'}
                </button>
              )}
              <div className="w-px h-5 bg-gray-300"></div>
              <button 
                className="px-4 py-2 rounded-lg bg-gray-400 hover:bg-gray-500 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors" 
                disabled={isGenerating} 
                onClick={handleGenerate}
              >
                {isGenerating ? 'Generating…' : 'Generate Quote'}
              </button>
              {downloadUrl && (
                <>
                  <div className="w-px h-5 bg-gray-300"></div>
                  {(renderFingerprint===lastGeneratedHash) ? (
                    <a className="px-4 py-2 rounded-lg bg-gray-400 hover:bg-gray-500 text-white font-medium transition-colors" href={downloadUrl} download="Quote.pdf">Download PDF</a>
                  ) : (
                    <button className="px-4 py-2 rounded-lg bg-gray-200 text-gray-600 cursor-not-allowed font-medium" title="PDF is outdated. Generate again to enable download" disabled>Download PDF</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      

      {pickerFor && (
        <ImagePicker isOpen={true} onClose={()=>setPickerFor(null)} clientId={clientId||undefined} targetWidth={566} targetHeight={537} allowEdit={true} exportScale={2} fileObjectId={coverFoId} hideEditButton={true} onConfirm={async(blob)=>{ 
          try{
            if (!blob){ toast.error('No image'); setPickerFor(null); return; }
            const cat = 'quote-cover-derived';
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
            formData.append('category_id', 'quote-section-derived');
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
      
      {/* New Contact Modal */}
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-br from-[#7f1010] to-[#a31414] flex items-center justify-between">
              <div className="font-semibold text-white">New Contact</div>
              <button 
                onClick={() => {
                  setContactModalOpen(false);
                  setNewContactName('');
                  setNewContactEmail('');
                  setNewContactPhone('');
                  setNewContactRole('');
                  setNewContactDept('');
                  setNewContactPrimary('false');
                  setContactNameError(false);
                  setContactPhotoBlob(null);
                }} 
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" 
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4 grid md:grid-cols-5 gap-3 items-start">
              <div className="md:col-span-2">
                <div className="text-[11px] uppercase text-gray-500 mb-1">Contact Photo</div>
                <button 
                  onClick={() => {
                    setContactPhotoBlob(new Blob());
                    setPickerForContact('__new__');
                  }} 
                  className="w-full h-40 border rounded grid place-items-center bg-gray-50"
                >
                  Select Photo
                </button>
              </div>
              <div className="md:col-span-3 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">
                    Name <span className="text-red-600">*</span>
                  </label>
                  <input 
                    className={`border rounded px-3 py-2 w-full ${contactNameError && !newContactName.trim() ? 'border-red-500' : ''}`} 
                    value={newContactName} 
                    onChange={e => {
                      setNewContactName(e.target.value);
                      if (contactNameError) setContactNameError(false);
                    }} 
                  />
                  {contactNameError && !newContactName.trim() && (
                    <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-600">Role/Title</label>
                  <input 
                    className="border rounded px-3 py-2 w-full" 
                    value={newContactRole} 
                    onChange={e => setNewContactRole(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Department</label>
                  <input 
                    className="border rounded px-3 py-2 w-full" 
                    value={newContactDept} 
                    onChange={e => setNewContactDept(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Email</label>
                  <input 
                    className="border rounded px-3 py-2 w-full" 
                    value={newContactEmail} 
                    onChange={e => setNewContactEmail(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Phone</label>
                  <input 
                    className="border rounded px-3 py-2 w-full" 
                    value={newContactPhone} 
                    onChange={e => setNewContactPhone(formatPhone(e.target.value))} 
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Primary</label>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={(!contacts || contacts.length === 0) || newContactPrimary === 'true'}
                      onChange={e => setNewContactPrimary(e.target.checked ? 'true' : 'false')}
                      disabled={!contacts || contacts.length === 0}
                      className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-xs text-gray-600">
                      {(!contacts || contacts.length === 0) ? 'Primary contact' : 'Set as primary contact'}
                    </span>
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <button 
                    onClick={async () => {
                      if (isCreatingContact) return;
                      if (!newContactName.trim()) {
                        setContactNameError(true);
                        toast.error('Name is required');
                        return;
                      }
                      if (!clientId) {
                        toast.error('Client ID is required');
                        return;
                      }
                      try {
                        setIsCreatingContact(true);
                        // If this is the first contact, automatically set as primary
                        const isFirstContact = !contacts || contacts.length === 0;
                        const willBePrimary = isFirstContact || newContactPrimary === 'true';
                        
                        // If setting as primary, first unset any existing primary contacts
                        if (willBePrimary && contacts && contacts.length > 0) {
                          const primaryContact = contacts.find((c: any) => c.is_primary);
                          if (primaryContact) {
                            await api('PATCH', `/clients/${clientId}/contacts/${primaryContact.id}`, {
                              is_primary: false
                            });
                          }
                        }
                        
                        const payload: any = {
                          name: newContactName,
                          email: newContactEmail,
                          phone: newContactPhone,
                          role_title: newContactRole,
                          department: newContactDept,
                          is_primary: willBePrimary
                        };
                        const created: any = await api('POST', `/clients/${clientId}/contacts`, payload);
                        // If photo selected, upload it now
                        if (contactPhotoBlob && created.id) {
                          try {
                            const up: any = await api('POST', '/files/upload', { 
                              project_id: null, 
                              client_id: clientId, 
                              employee_id: null, 
                              category_id: 'contact-photo', 
                              original_name: `contact-${created.id}.jpg`, 
                              content_type: 'image/jpeg' 
                            });
                            await fetch(up.upload_url, { 
                              method: 'PUT', 
                              headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' }, 
                              body: contactPhotoBlob 
                            });
                            const conf: any = await api('POST', '/files/confirm', { 
                              key: up.key, 
                              size_bytes: contactPhotoBlob.size, 
                              checksum_sha256: 'na', 
                              content_type: 'image/jpeg' 
                            });
                            await api('POST', `/clients/${clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent('contact-photo-' + created.id)}&original_name=${encodeURIComponent('contact-' + created.id + '.jpg')}`);
                          } catch (e) {
                            console.error('Failed to upload contact photo:', e);
                            // Don't fail the whole operation if photo upload fails
                          }
                        }
                        setNewContactName('');
                        setNewContactEmail('');
                        setNewContactPhone('');
                        setNewContactRole('');
                        setNewContactDept('');
                        setNewContactPrimary('false');
                        setContactNameError(false);
                        setContactPhotoBlob(null);
                        setContactModalOpen(false);
                        // Refresh contacts list
                        await refetchContacts();
                        // Select the newly created contact
                        setSelectedContactId(String(created.id));
                        setCreatedFor(created.name || '');
                        setPrimary({
                          name: created.name || '',
                          phone: created.phone || '',
                          email: created.email || ''
                        });
                      } catch (e) {
                        toast.error('Failed to create contact');
                        setIsCreatingContact(false);
                      }
                    }} 
                    disabled={isCreatingContact} 
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingContact ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {pickerForContact && (
        <ImagePicker 
          isOpen={true} 
          onClose={() => setPickerForContact(null)} 
          clientId={clientId || undefined} 
          targetWidth={400} 
          targetHeight={400} 
          allowEdit={true} 
          onConfirm={async (blob) => {
            try {
              if (pickerForContact === '__new__') {
                // We don't yet have the new contact id here; the simple flow is to upload the photo now and let user reassign later.
                // For now, just keep it in memory not supported; instead, we will upload after contact is created via another round.
                setContactPhotoBlob(blob);
              } else {
                const up: any = await api('POST', '/files/upload', { 
                  project_id: null, 
                  client_id: clientId, 
                  employee_id: null, 
                  category_id: 'contact-photo', 
                  original_name: `contact-${pickerForContact}.jpg`, 
                  content_type: 'image/jpeg' 
                });
                await fetch(up.upload_url, { 
                  method: 'PUT', 
                  headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' }, 
                  body: blob 
                });
                const conf: any = await api('POST', '/files/confirm', { 
                  key: up.key, 
                  size_bytes: blob.size, 
                  checksum_sha256: 'na', 
                  content_type: 'image/jpeg' 
                });
                await api('POST', `/clients/${clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent('contact-photo-' + pickerForContact)}&original_name=${encodeURIComponent('contact-' + pickerForContact + '.jpg')}`);
                toast.success('Contact photo updated');
                await refetchContacts();
              }
            } catch (e) {
              toast.error('Failed to update contact photo');
            } finally {
              setPickerForContact(null);
            }
          }} 
        />
      )}
    </div>
  );
}


