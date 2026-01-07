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
import SupplierSelect from '@/components/SupplierSelect';
import NewSupplierModal from '@/components/NewSupplierModal';
type Client = { id:string, name?:string, display_name?:string, address_line1?:string, city?:string, province?:string, country?:string };
type Material = { id:number, name:string, supplier_name?:string, category?:string, unit?:string, price?:number, last_updated?:string, unit_type?:string, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number, description?:string, image_base64?:string, technical_manual_url?:string };

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
  // Template style is always 'Mack Kirk Metals' for quotations
  const templateStyle = 'Mack Kirk Metals';
  const [coverTitle, setCoverTitle] = useState<string>('Quotation');
  const [orderNumber, setOrderNumber] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayLocal());
  const [createdFor, setCreatedFor] = useState<string>('');
  const [primary, setPrimary] = useState<{ name?:string, phone?:string, email?:string }>({});
  const [typeOfProject, setTypeOfProject] = useState<string>('');
  const [otherNotes, setOtherNotes] = useState<string>('');
  const [projectDescription, setProjectDescription] = useState<string>('');
  const [additionalNotes, setAdditionalNotes] = useState<string>('');
  // Pricing sections structure: array of sections, each with its own items and rates
  type PricingSection = {
    id: string;
    items: { name:string, price:string, quantity?:string, pst?:boolean, gst?:boolean, productId?:number, productImage?:string }[];
    pstRate: number;
    gstRate: number;
    markup: number;
    showTotalInPdf: boolean;
  };
  const [pricingSections, setPricingSections] = useState<PricingSection[]>([
    { id: 'section_1', items: [], pstRate: 7, gstRate: 5, markup: 0, showTotalInPdf: true }
  ]);
  const [productSearchModalOpen, setProductSearchModalOpen] = useState<{ sectionIndex: number, itemIndex: number } | null>(null);
  const [optionalServices, setOptionalServices] = useState<{ service:string, price:string }[]>([]);
  // Pricing type is always 'pricing' (manual) for quotations
  const [pricingType] = useState<'pricing'|'estimate'>('pricing');
  const [profitRate, setProfitRate] = useState<number>(0);
  
  // Legacy state for backward compatibility (will be removed after migration)
  const [pricingItems] = useState<{ name:string, price:string, quantity?:string, pst?:boolean, gst?:boolean, productId?:number }[]>([]);
  const [showTotalInPdf] = useState<boolean>(true);
  const [markup] = useState<number>(0);
  const [pstRate] = useState<number>(7);
  const [gstRate] = useState<number>(5);
  
  // Estimate values are not used for quotations (only manual pricing is supported)
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
  const lastPrefilledQuoteIdRef = useRef<string | null>(null);
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

  // Helper function to calculate section totals
  const calculateSectionTotals = (section: PricingSection) => {
    const totalNum = section.items.reduce((a, c) => {
      const price = Number(parseAccounting(c.price)||'0');
      const qty = Number(c.quantity || '1');
      return a + (price * qty);
    }, 0);
    
    const totalForPst = section.items
      .filter(c => c.pst === true)
      .reduce((a, c) => {
        const price = Number(parseAccounting(c.price)||'0');
        const qty = Number(c.quantity || '1');
        return a + (price * qty);
      }, 0);
    
    const totalForGst = section.items
      .filter(c => c.gst === true)
      .reduce((a, c) => {
        const price = Number(parseAccounting(c.price)||'0');
        const qty = Number(c.quantity || '1');
        return a + (price * qty);
      }, 0);
    
    const pst = totalForPst * (section.pstRate / 100);
    const subtotal = totalNum + pst;
    const gst = totalForGst * (section.gstRate / 100);
    const grandTotal = subtotal + gst;
    
    const showPstInPdf = section.items.some(item => item.pst === true);
    const showGstInPdf = section.items.some(item => item.gst === true);
    
    return { totalNum, totalForPst, totalForGst, pst, subtotal, gst, grandTotal, showPstInPdf, showGstInPdf };
  };

  // Calculate totals for all sections (for overall display if needed)
  const allSectionsTotals = useMemo(() => {
    return pricingSections.map(section => calculateSectionTotals(section));
  }, [pricingSections]);


  // Legacy calculations (kept for backward compatibility during transition)
  const totalNum = useMemo(()=>{ 
    return pricingItems.reduce((a,c)=> {
      const price = Number(parseAccounting(c.price)||'0');
      const qty = Number(c.quantity || '1');
      return a + (price * qty);
    }, 0); 
  }, [pricingItems]);

  const totalForPst = useMemo(() => {
    return pricingItems
      .filter(c => c.pst === true)
      .reduce((a, c) => {
        const price = Number(parseAccounting(c.price)||'0');
        const qty = Number(c.quantity || '1');
        return a + (price * qty);
      }, 0);
  }, [pricingItems]);

  const totalForGst = useMemo(() => {
    return pricingItems
      .filter(c => c.gst === true)
      .reduce((a, c) => {
        const price = Number(parseAccounting(c.price)||'0');
        const qty = Number(c.quantity || '1');
        return a + (price * qty);
      }, 0);
  }, [pricingItems]);

  const totalWithMarkup = useMemo(() => {
    return totalNum * (1 + (markup / 100));
  }, [totalNum, markup]);

  const markupValue = useMemo(() => {
    return totalWithMarkup - totalNum;
  }, [totalWithMarkup, totalNum]);

  const pst = useMemo(() => {
    return totalForPst * (pstRate / 100);
  }, [totalForPst, pstRate]);

  const subtotal = useMemo(() => {
    return totalNum + pst;
  }, [totalNum, pst]);

  const gst = useMemo(() => {
    return totalForGst * (gstRate / 100);
  }, [totalForGst, gstRate]);

  const grandTotal = useMemo(() => {
    return subtotal + gst;
  }, [subtotal, gst]);

  const displayTotal = useMemo(() => {
    return grandTotal;
  }, [grandTotal]);

  const displayPst = useMemo(() => {
    return pst;
  }, [pst]);

  const displayGst = useMemo(() => {
    return gst;
  }, [gst]);

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
        pricingSections, // New structure
        pricingItems, // Legacy - kept for backward compatibility
        optionalServices,
        showTotalInPdf,
        showPstInPdf,
        showGstInPdf,
        pricingType,
        displayTotal: undefined, // Not used for manual pricing
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
    if (!initial || !initial.id) return;
    const incomingId = String(initial.id);
    // Avoid clobbering local edits when React Query refetches the same quote.
    // Only prefill once per quote id, or when not ready yet.
    if (isReady && lastPrefilledQuoteIdRef.current === incomingId) return;
    const d = initial?.data || {};
    setCoverTitle(String(d.cover_title || initial.title || 'Quotation'));
    // Template style is always 'Mack Kirk Metals' for quotations
    const savedOrderNumber = String(initial.order_number || d.order_number || initial.code || '');
    setOrderNumber(savedOrderNumber);
    setDate(String(d.date||'').slice(0,10) || getTodayLocal());
    setCreatedFor(String(d.proposal_created_for||''));
    setPrimary({ name: d.primary_contact_name, phone: d.primary_contact_phone, email: d.primary_contact_email });
    setTypeOfProject(String(d.type_of_project||''));
    setOtherNotes(String(d.other_notes||''));
    setProjectDescription(String(d.project_description||''));
    setAdditionalNotes(String(d.additional_project_notes||''));
    // Load pricing sections - check for new format first, then fallback to legacy
    if (d.pricing_sections && Array.isArray(d.pricing_sections) && d.pricing_sections.length > 0) {
      // New format: multiple pricing sections
      const loadedSections: PricingSection[] = d.pricing_sections.map((sec: any, idx: number) => ({
        id: sec.id || `section_${idx + 1}`,
        items: (sec.items || []).map((item: any) => ({
          name: String(item.name || ''),
          price: formatAccounting(item.price || '0'),
          quantity: item.quantity || '1',
          pst: item.pst === true || item.pst === 'true' || item.pst === 1,
          gst: item.gst === true || item.gst === 'true' || item.gst === 1,
          productId: item.productId || item.product_id || undefined,
          productImage: item.productImage || undefined
        })),
        pstRate: sec.pstRate !== undefined && sec.pstRate !== null ? Number(sec.pstRate) : (d.pst_rate !== undefined && d.pst_rate !== null ? Number(d.pst_rate) : 7),
        gstRate: sec.gstRate !== undefined && sec.gstRate !== null ? Number(sec.gstRate) : (d.gst_rate !== undefined && d.gst_rate !== null ? Number(d.gst_rate) : 5),
        markup: sec.markup !== undefined && sec.markup !== null ? Number(sec.markup) : (d.markup !== undefined && d.markup !== null ? Number(d.markup) : 0),
        showTotalInPdf: sec.showTotalInPdf !== undefined ? Boolean(sec.showTotalInPdf) : (d.show_total_in_pdf !== undefined ? Boolean(d.show_total_in_pdf) : true)
      }));
      setPricingSections(loadedSections);
    } else {
      // Legacy format: convert single pricing section from pricingItems/additional_costs
      const legacyBidPrice = d.bid_price ?? 0;
      const dc = Array.isArray(d.additional_costs)? d.additional_costs : [];
      const loadedItems: { name:string, price:string, quantity?:string, pst?:boolean, gst?:boolean, productId?:number, productImage?:string }[] = [];
      if (legacyBidPrice && Number(legacyBidPrice) > 0) {
        loadedItems.push({ name: 'Bid Price', price: formatAccounting(legacyBidPrice), quantity: '1', pst: false, gst: false });
      }
      dc.forEach((c:any)=> {
        const label = String(c.label||'');
        const value = c.value ?? c.amount ?? '';
        if (label) {
          loadedItems.push({ 
            name: label, 
            price: formatAccounting(value || '0'),
            quantity: c.quantity || '1',
            pst: c.pst === true || c.pst === 'true' || c.pst === 1,
            gst: c.gst === true || c.gst === 'true' || c.gst === 1,
            productId: c.product_id || c.productId || undefined,
            productImage: c.productImage || undefined
          });
        }
      });
      // Convert to single section format
      setPricingSections([{
        id: 'section_1',
        items: loadedItems,
        pstRate: d.pst_rate !== undefined && d.pst_rate !== null ? Number(d.pst_rate) : 7,
        gstRate: d.gst_rate !== undefined && d.gst_rate !== null ? Number(d.gst_rate) : 5,
        markup: d.markup !== undefined && d.markup !== null ? Number(d.markup) : 0,
        showTotalInPdf: d.show_total_in_pdf !== undefined ? Boolean(d.show_total_in_pdf) : true
      }]);
    }
    const os = Array.isArray(d.optional_services)? d.optional_services : [];
    setOptionalServices(os.map((s:any)=> ({ service: String(s.service||''), price: formatAccounting(s.price ?? '') })));
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
    lastPrefilledQuoteIdRef.current = incomingId;
    setIsReady(true);
  }, [initial?.id, isReady]);

  // When creating new (no initial), mark ready on mount
  useEffect(()=>{ if (mode==='new') setIsReady(true); }, [mode]);

  // Fetch product images for items that have productId but no productImage
  useEffect(() => {
    if (!isReady || pricingSections.length === 0) return;
    
    const itemsNeedingImages = pricingSections.flatMap((section, sectionIdx) =>
      section.items
        .map((item, itemIdx) => ({ item, sectionIdx, itemIdx }))
        .filter(({ item }) => item.productId && !item.productImage)
    );

    if (itemsNeedingImages.length === 0) return;

    // Fetch products for items that need images by searching with product name
    const fetchProductImages = async () => {
      const updates: Array<{ sectionIdx: number; itemIdx: number; image: string }> = [];
      
      await Promise.all(
        itemsNeedingImages.map(async ({ item, sectionIdx, itemIdx }) => {
          if (!item.productId || !item.name) return;
          
          try {
            // Search for the product by name to get its image
            const results = await api<Material[]>(`GET`, `/estimate/products/search?q=${encodeURIComponent(item.name)}`);
            const product = results.find(p => p.id === item.productId);
            if (product && product.image_base64) {
              const productImage = product.image_base64.startsWith('data:') 
                ? product.image_base64 
                : `data:image/jpeg;base64,${product.image_base64}`;
              updates.push({ sectionIdx, itemIdx, image: productImage });
            }
          } catch (e) {
            // Ignore errors
          }
        })
      );

      // Apply updates if any
      if (updates.length > 0) {
        setPricingSections(arr =>
          arr.map((s, sectionIdx) => {
            const sectionUpdates = updates.filter(u => u.sectionIdx === sectionIdx);
            if (sectionUpdates.length === 0) return s;
            
            return {
              ...s,
              items: s.items.map((item, itemIdx) => {
                const update = sectionUpdates.find(u => u.itemIdx === itemIdx);
                return update ? { ...item, productImage: update.image } : item;
              })
            };
          })
        );
      }
    };

    fetchProductImages();
  }, [isReady, pricingSections]);

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
  }, [isReady, lastSavedHash, coverTitle, templateStyle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingSections, pricingItems, optionalServices, showTotalInPdf, showPstInPdf, showGstInPdf, markup, pstRate, gstRate, profitRate, terms, sections, coverFoId, clientId, computeFingerprint]);
  
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
      }, [isReady, lastSavedHash, coverTitle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingSections, pricingItems, optionalServices, showTotalInPdf, terms, sections, coverFoId, clientId, computeFingerprint]);

  const handleSave = useCallback(async()=>{
    if (disabled || isSaving) {
      return;
    }
    
    try{
      setIsSaving(true);
      
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
        total: totalNum, // Legacy - kept for backward compatibility
        display_total: displayTotal, // Save the final total (grandTotal) for display in cards
        terms_text: terms||'',
        show_total_in_pdf: showTotalInPdf, // Legacy
        show_pst_in_pdf: showPstInPdf, // Legacy
        show_gst_in_pdf: showGstInPdf, // Legacy
        // New format: pricing sections
        pricing_sections: pricingSections.map(section => ({
          id: section.id,
          items: section.items.map(c => ({ 
            name: c.name, 
            price: Number(parseAccounting(c.price)||'0'), 
            quantity: c.quantity || '1', 
            pst: c.pst === true, 
            gst: c.gst === true, 
            productId: c.productId,
            productImage: c.productImage // Save product image
          })),
          pstRate: section.pstRate,
          gstRate: section.gstRate,
          markup: section.markup,
          showTotalInPdf: section.showTotalInPdf
        })),
        // Legacy format: kept for backward compatibility
        additional_costs: pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0'), quantity: c.quantity || '1', pst: c.pst === true, gst: c.gst === true, product_id: c.productId })),
        optional_services: optionalServices.map(s=> ({ service: s.service, price: Number(parseAccounting(s.price)||'0') })),
        pricing_type: pricingType,
        markup: markup, // Legacy
        pst_rate: pstRate, // Legacy
        gst_rate: gstRate, // Legacy
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
  }, [disabled, isSaving, mode, initial?.id, clientId, coverTitle, templateStyle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, totalNum, displayTotal, showTotalInPdf, showPstInPdf, showGstInPdf, markup, pstRate, gstRate, profitRate, terms, pricingSections, pricingItems, optionalServices, sections, coverFoId, nav, queryClient, onSave, computeFingerprint, sanitizeSections, parseAccounting]);

  // Update ref when handleSave changes
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Clear quote function - clears all fields except orderNumber, companyName, and companyAddress
  const handleClearQuote = useCallback(async () => {
    if (disabled) {
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
      setDate(getTodayLocal());
      setCreatedFor('');
      setPrimary({});
      setTypeOfProject('');
      setOtherNotes('');
      setProjectDescription('');
      setAdditionalNotes('');
      setPricingSections([{ id: 'section_1', items: [], pstRate: 7, gstRate: 5, markup: 0, showTotalInPdf: true }]);
      setOptionalServices([]);
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
    if (disabled || isAutoSavingRef.current || !clientId) return;
    // Don't auto-save if nothing changed
    if (!hasUnsavedChanges) return;
    
    // Don't auto-save if less than 3 seconds since last save
    const now = Date.now();
    if (now - lastAutoSaveRef.current < 3000) return;

    try {
      isAutoSavingRef.current = true;
      
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
        total: totalNum, // Legacy
        display_total: displayTotal, // Save the final total (grandTotal) for display in cards
        terms_text: terms||'',
        show_total_in_pdf: showTotalInPdf, // Legacy
        show_pst_in_pdf: showPstInPdf, // Legacy
        show_gst_in_pdf: showGstInPdf, // Legacy
        // New format: pricing sections
        pricing_sections: pricingSections.map(section => ({
          id: section.id,
          items: section.items.map(c => ({ 
            name: c.name, 
            price: Number(parseAccounting(c.price)||'0'), 
            quantity: c.quantity || '1', 
            pst: c.pst === true, 
            gst: c.gst === true, 
            productId: c.productId,
            productImage: c.productImage // Save product image
          })),
          pstRate: section.pstRate,
          gstRate: section.gstRate,
          markup: section.markup,
          showTotalInPdf: section.showTotalInPdf
        })),
        // Legacy format: kept for backward compatibility
        additional_costs: pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0'), quantity: c.quantity || '1', pst: c.pst === true, gst: c.gst === true, product_id: c.productId })),
        optional_services: optionalServices.map(s=> ({ service: s.service, price: Number(parseAccounting(s.price)||'0') })),
        pricing_type: pricingType,
        markup: markup, // Legacy
        pst_rate: pstRate, // Legacy
        gst_rate: gstRate, // Legacy
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
    }, [disabled, hasUnsavedChanges, clientId, coverTitle, templateStyle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingSections, pricingItems, optionalServices, showTotalInPdf, showPstInPdf, showGstInPdf, markup, pstRate, gstRate, profitRate, totalNum, displayTotal, terms, sections, coverFoId, mode, initial, queryClient, sanitizeSections, computeFingerprint, parseAccounting]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    // Only auto-save if quote is ready
    if (!isReady || !clientId) return;
    if (!hasUnsavedChanges) return;

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
    }, [isReady, clientId, hasUnsavedChanges, coverTitle, templateStyle, orderNumber, date, createdFor, primary, typeOfProject, otherNotes, projectDescription, additionalNotes, pricingSections, pricingItems, optionalServices, showTotalInPdf, showPstInPdf, showGstInPdf, terms, sections, coverFoId, pricingType, displayTotal, autoSave]);

  // Periodic auto-save (every 30 seconds)
  useEffect(() => {
    if (!isReady || !clientId) return;

    const interval = setInterval(() => {
      // Only attempt periodic saves if there are unsaved changes.
      if (hasUnsavedChanges) autoSave();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isReady, clientId, hasUnsavedChanges, autoSave]);

  const handleGenerate = async()=>{
    try{
      // Validate required images
      if (!coverFoId && !coverBlob) {
        toast.error('Cannot generate PDF: Front Cover Image is required');
        return;
      }
      
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
      form.append('total', String(displayTotal)); // Legacy
      form.append('show_total_in_pdf', String(showTotalInPdf)); // Legacy
      form.append('show_pst_in_pdf', String(showPstInPdf)); // Legacy
      form.append('show_gst_in_pdf', String(showGstInPdf)); // Legacy
      form.append('pst_value', String(displayPst)); // Legacy
      form.append('gst_value', String(displayGst)); // Legacy
      // Estimate total is not used for quotations (only manual pricing)
      form.append('estimate_total_estimate', '0');
      form.append('terms_text', terms||'');
      form.append('pricing_type', pricingType);
      form.append('markup', String(markup)); // Legacy
      form.append('pst_rate', String(pstRate)); // Legacy
      form.append('gst_rate', String(gstRate)); // Legacy
      form.append('profit_rate', String(profitRate));
      // New format: pricing sections
      form.append('pricing_sections', JSON.stringify(pricingSections.map(section => {
        // Calculate section totals for PST and GST inline
        const totalNum = section.items.reduce((a, c) => {
          const price = Number(parseAccounting(c.price)||'0');
          const qty = Number(c.quantity || '1');
          return a + (price * qty);
        }, 0);
        
        const totalForPst = section.items
          .filter(c => c.pst === true)
          .reduce((a, c) => {
            const price = Number(parseAccounting(c.price)||'0');
            const qty = Number(c.quantity || '1');
            return a + (price * qty);
          }, 0);
        
        const totalForGst = section.items
          .filter(c => c.gst === true)
          .reduce((a, c) => {
            const price = Number(parseAccounting(c.price)||'0');
            const qty = Number(c.quantity || '1');
            return a + (price * qty);
          }, 0);
        
        const pst = totalForPst * (section.pstRate / 100);
        const gst = totalForGst * (section.gstRate / 100);
        const subtotal = totalNum + pst;
        const grandTotal = subtotal + gst;
        
        const showPstInPdf = section.items.some(item => item.pst === true);
        const showGstInPdf = section.items.some(item => item.gst === true);
        
        return {
          id: section.id,
          items: section.items.map(c => ({ 
            name: c.name, 
            price: Number(parseAccounting(c.price)||'0'), 
            quantity: c.quantity || '1', 
            pst: c.pst === true, 
            gst: c.gst === true, 
            product_id: c.productId, // Use product_id for backend compatibility
            productId: c.productId, // Keep both for compatibility
            productImage: c.productImage // Include product image for PDF generation
          })),
          pstRate: section.pstRate,
          gstRate: section.gstRate,
          markup: section.markup,
          showTotalInPdf: section.showTotalInPdf,
          showPstInPdf: showPstInPdf,
          showGstInPdf: showGstInPdf,
          // Calculate and include actual PST and GST values for PDF
          pstValue: pst,
          gstValue: gst,
          total: grandTotal, // Final total with GST
          totalDirectCosts: totalNum // Total before taxes
        };
      })));
      // Legacy format: kept for backward compatibility
      form.append('additional_costs', JSON.stringify(pricingItems.map(c=> ({ label: c.name, value: Number(parseAccounting(c.price)||'0'), quantity: c.quantity || '1', pst: c.pst === true, gst: c.gst === true, product_id: c.productId }))));
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
          <div className="p-3 sm:p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1 - Left side: Document info, Contact, and Other Notes */}
              <div className="space-y-2 text-sm">
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              </div>
              {/* Card 2 - Right side: Front Cover Image only */}
              <div className="space-y-2 text-sm">
                <div className="max-w-[50%]">
                  <div className="mb-1 text-sm text-gray-600">Front Cover Image</div>
                  {!disabled && (
                    <button className="px-3 py-1.5 rounded bg-gray-100" onClick={()=>{ if (!disabled) setPickerFor('cover'); }}>Choose</button>
                  )}
                  {coverPreview && <div className="mt-2"><img src={coverPreview} className="w-full rounded border" style={{ aspectRatio: '566/537', objectFit: 'contain' }} /></div>}
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
          <div className="p-3 sm:p-4">
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

        {/* Pricing Block - Multiple Sections */}
        {pricingSections.map((section, sectionIndex) => {
          const sectionTotals = calculateSectionTotals(section);
          const sectionNumber = pricingSections.length > 1 ? ` #${sectionIndex + 1}` : '';
          
          return (
            <div key={section.id} className="rounded-xl border bg-white overflow-hidden mb-4">
              <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-3 text-white font-semibold flex items-center justify-between">
                <span>Pricing{sectionNumber}</span>
                <div className="flex items-center gap-2">
                  {!disabled && sectionIndex === 0 && (
                    <button
                      onClick={() => {
                        if (pricingSections.length < 5) {
                          const newSection: PricingSection = {
                            id: `section_${Date.now()}`,
                            items: [],
                            pstRate: section.pstRate,
                            gstRate: section.gstRate,
                            markup: section.markup,
                            showTotalInPdf: section.showTotalInPdf
                          };
                          setPricingSections([...pricingSections, newSection]);
                        }
                      }}
                      disabled={pricingSections.length >= 5}
                      className="p-1.5 rounded hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Click here to add another Pricing section"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </button>
                  )}
                  {!disabled && sectionIndex > 0 && (
                    <button
                      onClick={async () => {
                        const result = await confirm({ title: 'Remove Pricing Section', message: 'Are you sure you want to remove this pricing section?' });
                        if (result === 'confirm') {
                          setPricingSections(arr => arr.filter((_, idx) => idx !== sectionIndex));
                        }
                      }}
                      className="p-1.5 rounded hover:bg-white/20 transition-colors"
                      title="Remove this Pricing section"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4">
                <div className="text-[12px] text-gray-600 mb-2">If no pricing items are added, the "Pricing Table{sectionNumber}" section will be hidden in the PDF.</div>
                {!disabled && (
                  <div className="sticky top-0 z-30 bg-white/95 backdrop-blur mb-3 py-3 border-b">
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={()=> setProductSearchModalOpen({ sectionIndex, itemIndex: -1 })}
                        disabled={disabled}
                        className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-base">
                        + Add Pricing Item
                      </button>
                      <div className="ml-auto flex items-center gap-3 text-sm">
                        <label className="text-sm">PST (%)</label>
                        <input 
                          type="number" 
                          className="border rounded px-2 py-1 w-20" 
                          value={section.pstRate} 
                          min={0} 
                          step={1} 
                          onChange={e=>setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, pstRate: Number(e.target.value||0) }: s))} 
                          disabled={disabled}
                        />
                        <label className="text-sm">GST (%)</label>
                        <input 
                          type="number" 
                          className="border rounded px-2 py-1 w-20" 
                          value={section.gstRate} 
                          min={0} 
                          step={1} 
                          onChange={e=>setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, gstRate: Number(e.target.value||0) }: s))} 
                          disabled={disabled}
                        />
                      </div>
                      {pricingSections.length > 1 && !disabled && (
                        <button
                          onClick={async () => {
                            const result = await confirm({ title: 'Remove Pricing Section', message: 'Are you sure you want to remove this pricing section?' });
                            if (result === 'confirm') {
                              setPricingSections(arr => arr.filter((_, idx) => idx !== sectionIndex));
                            }
                          }}
                          className="px-2 py-1 rounded text-gray-500 hover:text-red-600"
                          title="Remove section"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 3h6a1 1 0 0 1 1 1v2h4v2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8H4V6h4V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-2 2 1 12h8l1-12H8Z"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Pricing items list */}
                <div className="space-y-2">
                  {section.items.map((c, i)=> {
                    // Calculate line total: price × quantity
                    const priceNum = parseFloat(parseAccounting(c.price || '0').replace(/,/g, '')) || 0;
                    const qtyNum = parseFloat(c.quantity || '1') || 1;
                    const lineTotal = priceNum * qtyNum;
                    
                    return (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="col-span-1 sm:col-span-6 flex items-center gap-2 relative">
                          {/* Product Image - show placeholder if no image */}
                          <div className="flex-shrink-0 w-10 h-10 rounded border overflow-hidden bg-gray-100">
                            {c.productImage ? (
                              <img 
                                src={c.productImage} 
                                alt={c.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback to placeholder on error
                                  (e.target as HTMLImageElement).src = '/ui/assets/image placeholders/no_image.png';
                                }}
                              />
                            ) : (
                              <img 
                                src="/ui/assets/image placeholders/no_image.png" 
                                alt="No image"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <input 
                            className={`flex-1 border rounded px-3 py-2 ${disabled || c.productId ? 'bg-gray-50 cursor-not-allowed' : ''}`} 
                            placeholder="Name" 
                            value={c.name} 
                            onChange={e=>{ 
                              const v=e.target.value; 
                              setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.map((x,j)=> j===i? { ...x, name:v }: x) }: s)); 
                            }}
                            disabled={disabled || !!c.productId} 
                            readOnly={disabled || !!c.productId} 
                          />
                          {!disabled && (
                            <button
                              onClick={() => setProductSearchModalOpen({ sectionIndex, itemIndex: i })}
                              className="p-1 text-gray-500 hover:text-gray-700 flex-shrink-0"
                              title="Browse Products by Supplier"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="M21 21l-4.35-4.35"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                        <input type="text" className={`col-span-1 sm:col-span-1 border rounded px-2 sm:px-3 py-2 text-sm ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Price" value={c.price} onChange={e=>{ const v = parseAccounting(e.target.value); setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.map((x,j)=> j===i? { ...x, price:v }: x) }: s)); }} onBlur={!disabled ? ()=> setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.map((x,j)=> j===i? { ...x, price: formatAccounting(x.price) }: x) }: s)) : undefined} disabled={disabled} readOnly={disabled} />
                        <div className="col-span-1 sm:col-span-1 flex items-center border rounded overflow-hidden">
                          <input 
                            type="number" 
                            min="1"
                            step="1"
                            className={`flex-1 min-w-0 border-0 rounded-none px-2 sm:px-3 py-2 text-sm appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} 
                            placeholder="Qty" 
                            value={c.quantity || '1'} 
                            onChange={e=>{ 
                              const v = e.target.value;
                              const num = parseInt(v) || 1;
                              const finalValue = num < 1 ? '1' : String(num);
                              setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.map((x,j)=> j===i? { ...x, quantity: finalValue }: x) }: s)); 
                            }} 
                            disabled={disabled} 
                            readOnly={disabled} 
                          />
                          {!disabled && (
                            <div className="flex flex-col flex-none border-l bg-white w-6">
                              <button
                                type="button"
                                onClick={() => {
                                  const currentQty = parseInt(c.quantity || '1') || 1;
                                  const newQty = currentQty + 1;
                                  setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.map((x,j)=> j===i? { ...x, quantity: String(newQty) }: x) }: s));
                                }}
                                className="px-0.5 py-0 text-[9px] leading-tight border-b hover:bg-gray-100 flex items-center justify-center flex-1"
                                title="Increase"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const currentQty = parseInt(c.quantity || '1') || 1;
                                  const newQty = Math.max(1, currentQty - 1);
                                  setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.map((x,j)=> j===i? { ...x, quantity: String(newQty) }: x) }: s));
                                }}
                                className="px-0.5 py-0 text-[9px] leading-tight hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center flex-1"
                                title="Decrease"
                                disabled={parseInt(c.quantity || '1') <= 1}
                              >
                                ▼
                              </button>
                            </div>
                          )}
                        </div>
                        <div className={`col-span-1 sm:col-span-1 border rounded px-2 sm:px-3 py-2 bg-gray-50 ${disabled ? 'cursor-not-allowed' : ''}`}>
                          <div className="text-xs sm:text-sm font-medium text-gray-700 text-right">
                            ${formatAccounting(lineTotal)}
                          </div>
                        </div>
                        <div className="col-span-1 sm:col-span-2 flex items-center gap-2 sm:gap-3 flex-wrap">
                          <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Apply for this item:</span>
                          <label className={`flex items-center gap-1 text-xs sm:text-sm ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <input 
                              type="checkbox" 
                              checked={c.pst === true}
                              onChange={e=> setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.map((x,j)=> j===i? { ...x, pst: e.target.checked }: x) }: s))}
                              className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                              disabled={disabled}
                            />
                            <span className="text-gray-700">PST</span>
                          </label>
                          <label className={`flex items-center gap-1 text-xs sm:text-sm ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <input 
                              type="checkbox" 
                              checked={c.gst === true}
                              onChange={e=> setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.map((x,j)=> j===i? { ...x, gst: e.target.checked }: x) }: s))}
                              className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                              disabled={disabled}
                            />
                            <span className="text-gray-700">GST</span>
                          </label>
                        </div>
                        {!disabled && (
                          <button className="col-span-1 sm:col-span-1 px-2 py-2 rounded bg-gray-100 text-xs sm:text-sm whitespace-nowrap" onClick={()=> setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, items: s.items.filter((_,j)=> j!==i) }: s))}>Remove</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Show PST, GST fields even when disabled (read-only view) */}
                {disabled && (
                  <div className="mt-4 flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <span>PST (%)</span>
                      <input 
                        type="number" 
                        className="border rounded px-2 py-1 w-20 bg-gray-100 cursor-not-allowed" 
                        value={section.pstRate} 
                        disabled={true}
                        readOnly={true}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <span>GST (%)</span>
                      <input 
                        type="number" 
                        className="border rounded px-2 py-1 w-20 bg-gray-100 cursor-not-allowed" 
                        value={section.gstRate} 
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
                            <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Total Direct Costs</span><span className="font-bold">${sectionTotals.totalNum.toFixed(2)}</span></div>
                            {sectionTotals.showPstInPdf && sectionTotals.pst > 0 && (
                              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>PST ({section.pstRate}%)</span><span>${sectionTotals.pst.toFixed(2)}</span></div>
                            )}
                            <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Sub-total</span><span className="font-bold">${sectionTotals.subtotal.toFixed(2)}</span></div>
                          </div>
                        </div>
                        {/* Right Card */}
                        <div className="rounded-xl border bg-white p-4">
                          <div className="space-y-1 text-sm">
                            {sectionTotals.showGstInPdf && sectionTotals.gst > 0 && (
                              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>GST ({section.gstRate}%)</span><span>${sectionTotals.gst.toFixed(2)}</span></div>
                            )}
                            <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1 text-lg"><span className="font-bold">Final Total (with GST)</span><span className="font-bold">${sectionTotals.grandTotal.toFixed(2)}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Total with Show in PDF checkbox */}
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">Total: <span className="text-gray-600">${formatAccounting(sectionTotals.grandTotal)}</span></div>
                    <label className={`flex items-center gap-1 text-sm text-gray-600 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input 
                        type="checkbox" 
                        checked={section.showTotalInPdf} 
                        onChange={e=> setPricingSections(arr=> arr.map((s,idx)=> idx===sectionIndex? { ...s, showTotalInPdf: e.target.checked }: s))}
                        className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                        disabled={disabled}
                      />
                      <span>Show Total in PDF</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Optional Services Block */}
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-3 text-white font-semibold">
            Optional Services
          </div>
          <div className="p-3 sm:p-4">
          <div className="text-[12px] text-gray-600 mb-2">If no services are added, the "Optional Services" section will be hidden in the PDF.</div>
            <div className="space-y-2">
              {optionalServices.map((s, i)=> (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <input className={`col-span-1 sm:col-span-3 border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Service" value={s.service} onChange={e=>{ const v=e.target.value; setOptionalServices(arr=> arr.map((x,j)=> j===i? { ...x, service:v }: x)); }} disabled={disabled} readOnly={disabled} />
                  <input type="text" className={`col-span-1 sm:col-span-1 border rounded px-3 py-2 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} placeholder="Price" value={s.price} onChange={e=>{ const v = parseAccounting(e.target.value); setOptionalServices(arr=> arr.map((x,j)=> j===i? { ...x, price:v }: x)); }} onBlur={!disabled ? ()=> setOptionalServices(arr=> arr.map((x,j)=> j===i? { ...x, price: formatAccounting(x.price) }: x)) : undefined} disabled={disabled} readOnly={disabled} />
                  {!disabled && (
                    <button className="col-span-1 sm:col-span-1 px-2 py-2 rounded bg-gray-100" onClick={()=> setOptionalServices(arr=> arr.filter((_,j)=> j!==i))}>Remove</button>
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
          <div className="p-3 sm:p-4">
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
        
        {/* Spacer to prevent fixed bar from overlapping content - only needed when footer is visible */}
        {!disabled && <div className="h-24" />}
      </div>
      
      {/* Fixed footer bar - hidden when disabled (view-only mode) */}
      {!disabled && (
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
              {!disabled && (
                <>
                  <div className="w-px h-5 bg-gray-300"></div>
                  <button 
                    className="px-4 py-2 rounded-lg bg-gray-400 hover:bg-gray-500 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors" 
                    disabled={isGenerating} 
                    onClick={handleGenerate}
                  >
                    {isGenerating ? 'Generating…' : 'Generate Quote'}
                  </button>
                </>
              )}
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
      )}

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
            <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-start">
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
              <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
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

      {/* Add Product Modal - Opens when clicking Add Pricing Item */}
      {productSearchModalOpen !== null && (
        <AddProductModalForQuote
          open={true}
          onClose={() => setProductSearchModalOpen(null)}
          onSelect={(product: Material) => {
            const { sectionIndex, itemIndex } = productSearchModalOpen;
            // Prepare product image URL from base64
            let productImage: string | undefined = undefined;
            if (product.image_base64) {
              productImage = product.image_base64.startsWith('data:') 
                ? product.image_base64 
                : `data:image/jpeg;base64,${product.image_base64}`;
            }
            
            if (itemIndex === -1) {
              // Adding new item - append to the end of the section
              setPricingSections(arr => arr.map((s, idx) => 
                idx === sectionIndex
                  ? {
                      ...s,
                      items: [...s.items, {
                        name: product.name,
                        price: formatAccounting(String(product.price || 0)),
                        quantity: '1',
                        pst: false,
                        gst: false,
                        productId: product.id,
                        productImage: productImage
                      }]
                    }
                  : s
              ));
            } else {
              // Updating existing item
              setPricingSections(arr => arr.map((s, idx) => 
                idx === sectionIndex
                  ? {
                      ...s,
                      items: s.items.map((x, j) => 
                        j === itemIndex 
                          ? { 
                              ...x, 
                              name: product.name, 
                              price: formatAccounting(String(product.price || 0)),
                              quantity: x.quantity || '1',
                              productId: product.id,
                              productImage: productImage
                            }
                          : x
                      )
                    }
                  : s
              ));
            }
            setProductSearchModalOpen(null);
          }}
        />
      )}

    </div>
  );
}

// Product Search Modal Component - Based on EstimateBuilder's AddProductModal
function AddProductModalForQuote({ open, onClose, onSelect }: { open: boolean, onClose: () => void, onSelect: (product: Material) => void }) {
  const [q, setQ] = useState('');
  const [selection, setSelection] = useState<Material | null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [newProductModalOpen, setNewProductModalOpen] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(5);
  
  const { data, isLoading } = useQuery({ 
    queryKey: ['mat-search-quote', q], 
    queryFn: async () => {
      if (!q.trim()) return [];
      const params = new URLSearchParams(); 
      params.set('q', q);
      return await api<Material[]>('GET', `/estimate/products/search?${params.toString()}`);
    },
    enabled: !!q.trim() && open
  });
  
  const allResults = data || [];
  const list = allResults.slice(0, displayedCount);
  const hasMore = allResults.length > displayedCount;
  const hasNoResults = q.trim().length >= 2 && !isLoading && allResults.length === 0;

  useEffect(() => {
    if (!open) {
      setQ('');
      setSelection(null);
      setDisplayedCount(5);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') onClose(); 
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <div className="w-[720px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
          <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
            <div className="font-semibold text-lg text-white">Add Product</div>
            <button 
              onClick={onClose} 
              className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" 
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-600">Search Product:</label>
                <input 
                  className="w-full border rounded px-3 py-2" 
                  placeholder="Type product name..." 
                  value={q} 
                  onChange={e => setQ(e.target.value)}
                  autoFocus
                />
              </div>
              <button
                onClick={() => setSupplierModalOpen(true)}
                className="px-2 py-1 rounded text-gray-500 hover:text-blue-600 mt-6"
                title="Browse by supplier"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="M21 21l-4.35-4.35"></path>
                </svg>
              </button>
            </div>
            {q.trim() && list.length > 0 && (
              <div className="max-h-64 overflow-auto rounded border divide-y">
                {list.map(p => (
                  <button 
                    key={p.id} 
                    onClick={() => setSelection(p)} 
                    className={`w-full text-left px-3 py-2 bg-white hover:bg-gray-50 ${selection?.id === p.id ? 'ring-2 ring-brand-red' : ''}`}
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">
                      {p.supplier_name || ''} · {p.unit || ''} · ${Number(p.price || 0).toFixed(2)}
                    </div>
                  </button>
                ))}
                {hasMore && (
                  <button
                    onClick={() => setDisplayedCount(prev => prev + 5)}
                    className="w-full text-center px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm text-gray-600 border-t"
                  >
                    Load more ({allResults.length - displayedCount} remaining)
                  </button>
                )}
              </div>
            )}
            {hasNoResults && (
              <div className="border rounded p-4 bg-gray-50">
                <div className="text-sm text-gray-600 mb-3">
                  No products found matching "{q}"
                </div>
                <button
                  onClick={() => {
                    setNewProductModalOpen(true);
                  }}
                  className="w-full px-4 py-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium text-sm"
                >
                  + Create new product: "{q}"
                </button>
              </div>
            )}
            {selection && (
              <div className="border rounded p-3 bg-gray-50 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-24 h-24 relative">
                    {selection.image_base64 ? (
                      <img 
                        src={selection.image_base64.startsWith('data:') ? selection.image_base64 : `data:image/jpeg;base64,${selection.image_base64}`}
                        alt={selection.name}
                        className="w-full h-full object-contain rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const placeholder = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <img 
                      src="/ui/assets/image placeholders/no_image.png" 
                      alt="No image"
                      className={`w-full h-full object-contain rounded ${selection.image_base64 ? 'hidden' : ''}`}
                      style={{ display: selection.image_base64 ? 'none' : 'block' }}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{selection.name}</div>
                      <button
                        onClick={() => setCompareModalOpen(true)}
                        className="px-3 py-1.5 rounded bg-gray-700 text-white hover:bg-gray-800 text-sm"
                      >
                        Compare
                      </button>
                    </div>
                    <div className="text-sm text-gray-600">Supplier: {selection.supplier_name || 'N/A'}</div>
                    <div className="text-sm text-gray-600">Unit: {selection.unit || '-'} · Price: ${Number(selection.price || 0).toFixed(2)}</div>
                    {selection.unit_type === 'coverage' && (
                      <div className="text-xs text-gray-600 mt-1">
                        Coverage: {selection.coverage_sqs ? `${selection.coverage_sqs} SQS · ` : ''}{selection.coverage_ft2 ? `${selection.coverage_ft2} ft² · ` : ''}{selection.coverage_m2 ? `${selection.coverage_m2} m²` : ''}
                      </div>
                    )}
                    {selection.unit_type === 'multiple' && selection.units_per_package && (
                      <div className="text-xs text-gray-600 mt-1">
                        {selection.units_per_package} units per package
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="text-right">
              <button 
                onClick={() => {
                  if (!selection) { 
                    toast.error('Select a product first'); 
                    return; 
                  }
                  onSelect(selection);
                }} 
                className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      </div>
      {supplierModalOpen && (
        <SupplierProductModalForQuote
          open={supplierModalOpen}
          onClose={() => setSupplierModalOpen(false)}
          onSelect={(product) => {
            setSelection(product);
            setSupplierModalOpen(false);
          }}
        />
      )}
      {compareModalOpen && selection && (
        <CompareProductsModalForQuote
          open={compareModalOpen}
          onClose={() => setCompareModalOpen(false)}
          selectedProduct={selection}
          onSelect={(product) => {
            setSelection(product);
            setCompareModalOpen(false);
          }}
        />
      )}
      {newProductModalOpen && (
        <NewProductModalForQuote
          open={true}
          onClose={() => setNewProductModalOpen(false)}
          initialName={q.trim()}
          onProductCreated={(product: Material) => {
            setSelection(product);
            setNewProductModalOpen(false);
            // Pre-fill the search query with the new product name
            setQ(product.name);
            // Automatically select the product so user can click "Add Item"
            // The product is already set in selection, so it will show in the preview
          }}
        />
      )}
    </>
  );
}

// New Product Modal for Quote
function NewProductModalForQuote({ open, onClose, onProductCreated, initialSupplier, initialName }: { open: boolean, onClose: () => void, onProductCreated: (product: Material) => void, initialSupplier?: string, initialName?: string }) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [duplicateError, setDuplicateError] = useState(false);
  const [newSupplier, setNewSupplier] = useState('');
  const [supplierError, setSupplierError] = useState(false);
  const [newSupplierModalOpen, setNewSupplierModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState<string>('');
  const [priceDisplay, setPriceDisplay] = useState<string>('');
  const [priceFocused, setPriceFocused] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [desc, setDesc] = useState('');
  const [unitType, setUnitType] = useState<'unitary'|'multiple'|'coverage'>('unitary');
  const [unitsPerPackage, setUnitsPerPackage] = useState<string>('');
  const [covSqs, setCovSqs] = useState<string>('');
  const [covFt2, setCovFt2] = useState<string>('');
  const [covM2, setCovM2] = useState<string>('');
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [technicalManualUrl, setTechnicalManualUrl] = useState<string>('');

  const queryClient = useQueryClient();
  const { data: supplierOptions } = useQuery({ queryKey:['invSuppliersOptions-quote'], queryFn: ()=> api<any[]>('GET','/inventory/suppliers') });
  
  // Check for duplicate products (same name and supplier)
  const { data: existingProducts } = useQuery({
    queryKey: ['product-duplicate-check-quote', name.trim(), newSupplier],
    queryFn: async () => {
      if (!name.trim()) return [];
      const params = new URLSearchParams();
      params.set('q', name.trim());
      if (newSupplier) {
        params.set('supplier', newSupplier);
      }
      return await api<Material[]>('GET', `/estimate/products/search?${params.toString()}`);
    },
    enabled: !!name.trim() && !!newSupplier && open,
  });

  // Check for duplicates when name or supplier changes
  useEffect(() => {
    if (name.trim() && newSupplier && existingProducts) {
      // Check if any product has the exact same name and supplier (case-insensitive)
      const duplicate = existingProducts.find(
        (p: Material) => 
          p.name.toLowerCase().trim() === name.toLowerCase().trim() && 
          p.supplier_name?.toLowerCase().trim() === newSupplier.toLowerCase().trim()
      );
      if (duplicate) {
        setDuplicateError(true);
      } else {
        setDuplicateError(false);
      }
    } else {
      setDuplicateError(false);
    }
  }, [name, newSupplier, existingProducts]);

  const formatCurrency = (value: string): string => {
    if (!value) return '';
    const numericValue = value.replace(/[^0-9.]/g, '');
    if (!numericValue) return '';
    const num = parseFloat(numericValue);
    if (isNaN(num)) return numericValue;
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const parseCurrency = (value: string): string => {
    const parsed = value.replace(/[^0-9.]/g, '');
    const parts = parsed.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    return parsed;
  };

  const onCoverageChange = (which: 'sqs'|'ft2'|'m2', val: string) => {
    if (!val) { setCovSqs(''); setCovFt2(''); setCovM2(''); return; }
    const num = parseFloat(val) || 0;
    if (which === 'sqs') {
      setCovSqs(val);
      setCovFt2(String((num * 100).toFixed(2)));
      setCovM2(String((num * 9.29).toFixed(2)));
    } else if (which === 'ft2') {
      setCovFt2(val);
      setCovSqs(String((num / 100).toFixed(2)));
      setCovM2(String((num * 0.0929).toFixed(2)));
    } else if (which === 'm2') {
      setCovM2(val);
      setCovSqs(String((num / 9.29).toFixed(2)));
      setCovFt2(String((num * 10.764).toFixed(2)));
    }
  };

  useEffect(() => {
    if (!open) {
      setName('');
      setNameError(false);
      setDuplicateError(false);
      setNewSupplier(initialSupplier || '');
      setNewCategory('');
      setUnit('');
      setPrice('');
      setPriceDisplay('');
      setPriceFocused(false);
      setPriceError(false);
      setDesc('');
      setUnitsPerPackage('');
      setCovSqs('');
      setCovFt2('');
      setCovM2('');
      setUnitType('unitary');
      setImageDataUrl('');
      setTechnicalManualUrl('');
    } else if (open) {
      if (initialSupplier) {
        setNewSupplier(initialSupplier);
      }
      if (initialName) {
        setName(initialName);
      }
    }
  }, [open, initialSupplier, initialName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') onClose(); 
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
        <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
          <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
            <div className="font-semibold text-lg text-white">New Product</div>
            <button 
              onClick={onClose} 
              className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" 
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700">
                  Name <span className="text-red-600">*</span>
                </label>
                <input 
                  className={`w-full border rounded px-3 py-2 mt-1 ${(nameError && !name.trim()) || duplicateError ? 'border-red-500' : ''}`}
                  value={name} 
                  onChange={e=>{
                    setName(e.target.value);
                    if (nameError) setNameError(false);
                    // Clear duplicate error when user starts typing
                    if (duplicateError) setDuplicateError(false);
                  }} 
                />
                {nameError && !name.trim() && (
                  <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                )}
                {duplicateError && (
                  <div className="text-[11px] text-red-600 mt-1">
                    A product with this name already exists for supplier "{newSupplier}". Please use a different name or select a different supplier.
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Supplier <span className="text-red-600">*</span>
                </label>
                <div className="mt-1">
                  <SupplierSelect
                    value={newSupplier}
                    onChange={(value) => {
                      setNewSupplier(value);
                      if (supplierError) setSupplierError(false);
                      // Clear duplicate error when supplier changes
                      if (duplicateError) setDuplicateError(false);
                    }}
                    onOpenNewSupplierModal={() => setNewSupplierModalOpen(true)}
                    error={(supplierError && !newSupplier.trim()) || duplicateError}
                    placeholder="Select a supplier"
                  />
                </div>
                {supplierError && !newSupplier.trim() && (
                  <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                )}
              </div>
              <div><label className="text-xs font-semibold text-gray-700">Category</label><input className="w-full border rounded px-3 py-2 mt-1" value={newCategory} onChange={e=>setNewCategory(e.target.value)} /></div>
              <div><label className="text-xs font-semibold text-gray-700">Sell Unit</label><input className="w-full border rounded px-3 py-2 mt-1" placeholder="e.g., Roll, Pail (20L), Box" value={unit} onChange={e=>setUnit(e.target.value)} /></div>
              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Price ($) <span className="text-red-600">*</span>
                </label>
                <input 
                  type="text" 
                  className={`w-full border rounded px-3 py-2 mt-1 ${priceError && (!price || !price.trim() || Number(parseCurrency(price)) <= 0) ? 'border-red-500' : ''}`}
                  placeholder="$0.00"
                  value={priceFocused ? priceDisplay : (price ? formatCurrency(price) : '')}
                  onFocus={() => {
                    setPriceFocused(true);
                    setPriceDisplay(price || '');
                  }}
                  onBlur={() => {
                    setPriceFocused(false);
                    const parsed = parseCurrency(priceDisplay);
                    setPrice(parsed);
                    setPriceDisplay(parsed);
                    if (priceError && parsed && Number(parsed) > 0) setPriceError(false);
                  }}
                  onChange={e => {
                    const raw = e.target.value;
                    setPriceDisplay(raw);
                  }}
                />
                {priceError && (!price || !price.trim() || Number(parseCurrency(price)) <= 0) && (
                  <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                )}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700">Unit Type</label>
                <div className="flex items-center gap-6 mt-1">
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type-quote" checked={unitType==='unitary'} onChange={()=>{ setUnitType('unitary'); setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Unitary</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type-quote" checked={unitType==='multiple'} onChange={()=>{ setUnitType('multiple'); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Multiple</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type-quote" checked={unitType==='coverage'} onChange={()=>{ setUnitType('coverage'); setUnitsPerPackage(''); }} /> Coverage</label>
                </div>
              </div>
              {unitType==='multiple' && (
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Units per Package</label>
                  <input type="number" step="0.01" className="w-full border rounded px-3 py-2 mt-1" value={unitsPerPackage} onChange={e=>setUnitsPerPackage(e.target.value)} />
                </div>
              )}
              {unitType==='coverage' && (
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Coverage Area</label>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 flex items-center gap-1">
                      <input 
                        className="w-full border rounded px-3 py-2" 
                        placeholder="0" 
                        value={covSqs} 
                        onChange={e=> onCoverageChange('sqs', e.target.value)} 
                      />
                      <span className="text-sm text-gray-600 whitespace-nowrap">SQS</span>
                    </div>
                    <span className="text-gray-400">=</span>
                    <div className="flex-1 flex items-center gap-1">
                      <input 
                        className="w-full border rounded px-3 py-2" 
                        placeholder="0" 
                        value={covFt2} 
                        onChange={e=> onCoverageChange('ft2', e.target.value)} 
                      />
                      <span className="text-sm text-gray-600 whitespace-nowrap">ft²</span>
                    </div>
                    <span className="text-gray-400">=</span>
                    <div className="flex-1 flex items-center gap-1">
                      <input 
                        className="w-full border rounded px-3 py-2" 
                        placeholder="0" 
                        value={covM2} 
                        onChange={e=> onCoverageChange('m2', e.target.value)} 
                      />
                      <span className="text-sm text-gray-600 whitespace-nowrap">m²</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="col-span-2"><label className="text-xs font-semibold text-gray-700">Description / Notes</label><textarea className="w-full border rounded px-3 py-2 mt-1" rows={3} value={desc} onChange={e=>setDesc(e.target.value)} /></div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700">Technical Manual URL</label>
                <input 
                  className="w-full border rounded px-3 py-2 mt-1" 
                  type="url"
                  placeholder="https://supplier.com/manual/product"
                  value={technicalManualUrl} 
                  onChange={e=>setTechnicalManualUrl(e.target.value)} 
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700">Product Image</label>
                <div className="mt-1 space-y-2">
                  <button
                    type="button"
                    onClick={() => setImagePickerOpen(true)}
                    className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm">
                    {imageDataUrl ? 'Change Image' : 'Select Image'}
                  </button>
                  {imageDataUrl && (
                    <div className="mt-2">
                      <img src={imageDataUrl} className="w-32 h-32 object-contain border rounded" alt="Preview" />
                      <button
                        type="button"
                        onClick={() => setImageDataUrl('')}
                        className="mt-2 px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200">
                        Remove Image
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
            <button 
              onClick={async()=>{
                if(isSavingProduct) return;
                
                if(!name.trim()){
                  setNameError(true);
                  toast.error('Name is required');
                  return;
                }
                
                if(!newSupplier.trim()){
                  setSupplierError(true);
                  toast.error('Supplier is required');
                  return;
                }
                
                // Check for duplicate before creating
                if (name.trim() && newSupplier) {
                  try {
                    const params = new URLSearchParams();
                    params.set('q', name.trim());
                    params.set('supplier', newSupplier);
                    const duplicateCheck = await api<Material[]>('GET', `/estimate/products/search?${params.toString()}`);
                    const duplicate = duplicateCheck.find(
                      (p: Material) => 
                        p.name.toLowerCase().trim() === name.toLowerCase().trim() && 
                        p.supplier_name?.toLowerCase().trim() === newSupplier.toLowerCase().trim()
                    );
                    if (duplicate) {
                      setDuplicateError(true);
                      toast.error(`A product with the name "${name.trim()}" already exists for supplier "${newSupplier}". Please use a different name or select a different supplier.`);
                      return;
                    }
                  } catch (e) {
                    // If check fails, continue (server will validate anyway)
                    console.error('Error checking for duplicate:', e);
                  }
                }
                
                const priceValue = parseCurrency(price);
                if(!priceValue || !priceValue.trim() || Number(priceValue) <= 0){
                  setPriceError(true);
                  toast.error('Price is required');
                  return;
                }
                
                try{
                  setIsSavingProduct(true);
                  const payload = {
                    name: name.trim(),
                    supplier_name: newSupplier||null,
                    category: newCategory||null,
                    unit: unit||null,
                    price: Number(parseCurrency(price)),
                    description: desc||null,
                    unit_type: unitType,
                    units_per_package: unitType==='multiple'? (unitsPerPackage? Number(unitsPerPackage): null) : null,
                    coverage_sqs: unitType==='coverage'? (covSqs? Number(covSqs): null) : null,
                    coverage_ft2: unitType==='coverage'? (covFt2? Number(covFt2): null) : null,
                    coverage_m2: unitType==='coverage'? (covM2? Number(covM2): null) : null,
                    image_base64: imageDataUrl || null,
                    technical_manual_url: technicalManualUrl || null,
                  };
                  const created = await api<Material>('POST','/estimate/products', payload);
                  toast.success('Product created');
                  onProductCreated(created);
                }catch(_e){ 
                  toast.error('Failed to create product'); 
                }
                finally{ 
                  setIsSavingProduct(false); 
                }
              }} 
              disabled={isSavingProduct} 
              className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingProduct ? 'Creating...' : 'Create Product'}
            </button>
          </div>
        </div>
      </div>
      {imagePickerOpen && (
        <ImagePicker
          isOpen={true}
          onClose={() => setImagePickerOpen(false)}
          onConfirm={(blob) => {
            const reader = new FileReader();
            reader.onload = () => {
              setImageDataUrl(String(reader.result || ''));
              setImagePickerOpen(false);
            };
            reader.readAsDataURL(blob);
          }}
          targetWidth={800}
          targetHeight={800}
        />
      )}
      {newSupplierModalOpen && (
        <NewSupplierModal
          open={true}
          onClose={() => setNewSupplierModalOpen(false)}
          onSupplierCreated={(supplierName: string) => {
            setNewSupplier(supplierName);
            setNewSupplierModalOpen(false);
            // Invalidate supplier options to refresh the list
            queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions-quote'] });
            queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions-select'] });
          }}
        />
      )}
    </>
  );
}


// Supplier Product Modal for Quote - Same as EstimateBuilder
function SupplierProductModalForQuote({ open, onClose, onSelect }: { open: boolean, onClose: () => void, onSelect: (product: Material) => void }) {
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [displayedProductCount, setDisplayedProductCount] = useState(20);
  const [newProductModalOpen, setNewProductModalOpen] = useState(false);
  
  const { data: suppliers } = useQuery({ 
    queryKey: ['suppliers-quote'], 
    queryFn: async () => {
      const suppliers = await api<{id: string, name: string}[]>('GET', '/inventory/suppliers');
      return suppliers;
    },
    enabled: open
  });
  
  const { data: allProducts } = useQuery({
    queryKey: ['all-products-quote'],
    queryFn: async () => {
      return await api<Material[]>('GET', '/estimate/products');
    },
    enabled: open
  });

  const allProductsForSupplier = useMemo(() => {
    if (!selectedSupplier || !allProducts) return [];
    const selectedSupplierName = suppliers?.find(s => s.id === selectedSupplier)?.name;
    if (!selectedSupplierName) return [];
    return allProducts.filter(p => p.supplier_name === selectedSupplierName);
  }, [allProducts, selectedSupplier, suppliers]);

  const products = useMemo(() => {
    return allProductsForSupplier.slice(0, displayedProductCount);
  }, [allProductsForSupplier, displayedProductCount]);

  const hasMoreProducts = allProductsForSupplier.length > displayedProductCount;

  useEffect(() => {
    if (selectedSupplier) {
      setDisplayedProductCount(20);
    }
  }, [selectedSupplier]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-2 sm:p-4">
      <div className="w-[1000px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-4 sm:p-6 flex items-center gap-4 sm:gap-6 relative flex-shrink-0">
          <div className="font-semibold text-base sm:text-lg text-white">Browse Products by Supplier</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
          {/* Left: Suppliers List */}
          <div className="w-full sm:w-64 border-r sm:border-r border-b sm:border-b-0 overflow-y-auto bg-gray-50 flex-shrink-0 sm:flex-shrink">
            <div className="p-4">
              <div className="font-semibold mb-3 text-sm text-gray-700">Suppliers</div>
              <div className="space-y-2">
                {(suppliers || []).map(supplier => (
                  <button
                    key={supplier.id}
                    onClick={() => setSelectedSupplier(supplier.id)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedSupplier === supplier.id
                        ? 'text-white bg-gradient-to-br from-[#7f1010] to-[#a31414]'
                        : 'bg-white hover:bg-gray-100 text-gray-700'
                    }`}>
                    {supplier.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* Right: Products Grid */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {!selectedSupplier ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a supplier to view products
              </div>
            ) : (
              <div>
                <div className="font-semibold mb-4 text-gray-700">
                  Products from {suppliers?.find(s => s.id === selectedSupplier)?.name || 'Supplier'}
                </div>
                {products && products.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {/* New Product Card - First position */}
                      <button
                        onClick={() => setNewProductModalOpen(true)}
                        className="border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[200px]">
                        <div className="text-4xl text-gray-400 mb-2">+</div>
                        <div className="font-medium text-sm text-gray-700">New Product</div>
                        <div className="text-xs text-gray-500 mt-1">Add new product to {suppliers?.find(s => s.id === selectedSupplier)?.name || 'supplier'}</div>
                      </button>
                      {products.map(product => (
                      <button
                        key={product.id}
                        onClick={() => onSelect(product)}
                        className="border rounded-lg p-3 hover:border-brand-red hover:shadow-md transition-all text-left bg-white flex flex-col">
                        <div className="w-full h-24 mb-2 relative">
                          {product.image_base64 ? (
                            <img 
                              src={product.image_base64.startsWith('data:') ? product.image_base64 : `data:image/jpeg;base64,${product.image_base64}`}
                              alt={product.name}
                              className="w-full h-full object-contain rounded"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                const placeholder = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                                if (placeholder) placeholder.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <img 
                            src="/ui/assets/image placeholders/no_image.png" 
                            alt="No image"
                            className={`w-full h-full object-contain rounded ${product.image_base64 ? 'hidden' : ''}`}
                            style={{ display: product.image_base64 ? 'none' : 'block' }}
                          />
                        </div>
                        <div className="font-medium text-sm mb-1 line-clamp-2">{product.name}</div>
                        {product.category && (
                          <div className="text-xs text-gray-500 mb-1">{product.category}</div>
                        )}
                        <div className="text-sm font-semibold text-brand-red">${Number(product.price || 0).toFixed(2)}</div>
                      </button>
                      ))}
                    </div>
                    {hasMoreProducts && (
                      <button
                        onClick={() => setDisplayedProductCount(prev => prev + 20)}
                        className="mt-4 w-full text-center px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-600">
                        Load more ({allProductsForSupplier.length - displayedProductCount} remaining)
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-500 mb-4">No products found for this supplier</div>
                    <button
                      onClick={() => setNewProductModalOpen(true)}
                      className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center mx-auto w-64">
                      <div className="text-4xl text-gray-400 mb-2">+</div>
                      <div className="font-medium text-sm text-gray-700">New Product</div>
                      <div className="text-xs text-gray-500 mt-1">Add new product to {suppliers?.find(s => s.id === selectedSupplier)?.name || 'supplier'}</div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      {newProductModalOpen && selectedSupplier && (
        <NewProductModalForQuote
          open={true}
          onClose={() => setNewProductModalOpen(false)}
          initialSupplier={suppliers?.find(s => s.id === selectedSupplier)?.name || ''}
          onProductCreated={(product: Material) => {
            onSelect(product);
            setNewProductModalOpen(false);
          }}
        />
      )}
    </>
  );
}

// Compare Products Modal for Quote (simplified version)
function CompareProductsModalForQuote({ open, onClose, selectedProduct, onSelect }: { open: boolean, onClose: () => void, selectedProduct: Material, onSelect: (product: Material) => void }) {
  const { data: similarProducts } = useQuery({
    queryKey: ['similar-products-quote', selectedProduct.name],
    queryFn: async () => {
      if (!selectedProduct.name) return [];
      const params = new URLSearchParams();
      params.set('q', selectedProduct.name);
      const results = await api<Material[]>('GET', `/estimate/products/search?${params.toString()}`);
      return results.filter(p => p.id !== selectedProduct.id).slice(0, 5);
    },
    enabled: open && !!selectedProduct.name
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center">
      <div className="w-[720px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Compare Products</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="border rounded p-3 bg-gray-50">
            <div className="font-medium mb-2">Selected: {selectedProduct.name}</div>
            <div className="text-sm text-gray-600">${Number(selectedProduct.price || 0).toFixed(2)} · {selectedProduct.supplier_name || 'N/A'}</div>
          </div>
          {(similarProducts || []).length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Similar Products:</div>
              <div className="max-h-64 overflow-auto rounded border divide-y">
                {(similarProducts || []).map(p => (
                  <button key={p.id} onClick={() => onSelect(p)} className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.supplier_name || ''} · ${Number(p.price || 0).toFixed(2)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


