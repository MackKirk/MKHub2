import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { clampOverflowScrollAncestors, findScrollableAncestor } from '@/lib/clampScroll';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import EstimateBuilder, { EstimateBuilderRef } from '@/components/EstimateBuilder';
import SupplierSelect from '@/components/SupplierSelect';
import NewSupplierModal from '@/components/NewSupplierModal';
import {
  AppButton,
  AppCheckbox,
  AppCheckboxControl,
  AppControlLabel,
  AppControlLabelRow,
  AppDatePicker,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppModal,
  AppSelect,
  AppTextarea,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  PROPOSAL_SECTION_IMAGE_EXPORT_SCALE,
  PROPOSAL_SECTION_IMAGE_MAX_EXPORT_LONG_SIDE,
  PROPOSAL_SECTION_IMAGE_TARGET_HEIGHT,
  PROPOSAL_SECTION_IMAGE_TARGET_WIDTH,
  normalizeProposalSectionImageOrientation,
  type ProposalSectionImageOrientation,
} from '@/constants/proposalSectionImage';
import SectionImageLightbox from '@/components/proposal/SectionImageLightbox';
import SectionImagePreview from '@/components/proposal/SectionImagePreview';

/** Quote form — `fieldHint` for App* controls (`Title\n\nBody`). */
const QUOTE_FIELD_HINTS = {
  documentType: 'Document Type\n\nShown on the quotation cover page (max 44 characters).',
  typeOfProject: 'Type of Quotation\n\nBrief scope label on the quotation (e.g. roof replacement).',
  date: 'Date\n\nQuotation date printed on the cover and headers.',
  primaryContact: 'Primary Contact Name\n\nClient contact shown as Created for on the quotation.',
  primaryPhone: 'Primary Contact Phone\n\nPrinted on the quotation; editable after selecting a contact.',
  primaryEmail: 'Primary Contact Email\n\nPrinted on the quotation; editable after selecting a contact.',
  otherNotes: 'Other Notes\n\nShort note on the cover (max 250 characters).',
  frontCover: 'Front Cover Image\n\nMain cover photo. Cropped to 566×537 px in the PDF.',
  sectionTitle: 'Section title\n\nHeading for this section in the generated PDF.',
  sectionText: 'Section text\n\nBody copy for a text section. Press Tab to indent with four spaces.',
  imageCaption: 'Caption\n\nCaption printed under the image in the PDF.',
  pricingName: 'Item name\n\nLine item description in the pricing table.',
  pricingPrice: 'Price\n\nLine price before tax; formatted when you leave the field.',
  optionalService: 'Service\n\nOptional line the client may accept; does not change the quotation total.',
  optionalPrice: 'Price\n\nPrice shown for this optional service.',
  termsTemplate: 'Terms template\n\nLoad standard terms from settings; you can still edit the text below.',
  termsText: 'Terms text\n\nContract terms printed at the end of the quotation PDF.',
  pst: 'PST\n\nInclude PST for this line in totals and the PDF when enabled.',
  gst: 'GST\n\nInclude GST for this line in totals and the PDF when enabled.',
  showTotalInPdf: 'Show total in PDF\n\nWhen off, the quotation total is hidden in the generated PDF.',
  contactName: 'Name\n\nContact name saved on the client record.',
  contactRole: 'Role/Title\n\nJob title on contact lists and documents.',
  contactDept: 'Department\n\nOptional department for this contact.',
  contactEmail: 'Email\n\nContact email address.',
  contactPhone: 'Phone\n\nContact phone; formatted as you type.',
  contactPrimary: 'Primary contact\n\nPrimary contacts are suggested first on quotations.',
  contactPhoto: 'Contact Photo\n\nOptional photo for this client contact.',
  pricingQty: 'Quantity\n\nNumber of units for this line item (minimum 1).',
  pricingLineTotal: 'Line total\n\nPrice multiplied by quantity for this row.',
} as const;

const QUOTE_INLINE_CONTROL_H = 'h-8';
const QUOTE_INLINE_LABEL_ROW = 'mb-1 h-3.5 shrink-0';

function ProposalInlineLabelRow({ label, fieldHint }: { label: string; fieldHint?: string }) {
  return (
    <div className={QUOTE_INLINE_LABEL_ROW}>
      {fieldHint ? (
        <AppControlLabelRow label={label} fieldHint={<AppFieldHint hint={fieldHint} />} />
      ) : (
        <AppControlLabel label={label} />
      )}
    </div>
  );
}

function ProposalInlineInput({
  label,
  fieldHint,
  className,
  inputClassName,
  ...props
}: { label: string; fieldHint: string; inputClassName?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={uiCx('min-w-0', className)}>
      <ProposalInlineLabelRow label={label} fieldHint={fieldHint} />
      <input
        className={uiCx(
          'box-border w-full bg-white text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gray-400/35 disabled:cursor-not-allowed disabled:bg-gray-100',
          uiSpacing.controlX,
          QUOTE_INLINE_CONTROL_H,
          'py-0',
          uiRadius.control,
          uiBorders.input,
          inputClassName,
        )}
        {...props}
      />
    </div>
  );
}

function ProposalInlineCheckbox({
  label,
  fieldHint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  fieldHint: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col">
      <ProposalInlineLabelRow label={label} fieldHint={fieldHint} />
      <AppCheckboxControl
        checked={checked}
        disabled={disabled || !onChange}
        onClick={onChange ? () => onChange(!checked) : undefined}
        aria-label={label}
        className={QUOTE_INLINE_CONTROL_H}
      />
    </div>
  );
}

function ProposalInlineControlSpacer({
  children,
  className,
  label,
  fieldHint,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  fieldHint?: string;
}) {
  return (
    <div className={uiCx('flex shrink-0 flex-col', className)}>
      {label ? (
        <ProposalInlineLabelRow label={label} fieldHint={fieldHint} />
      ) : (
        <div className={QUOTE_INLINE_LABEL_ROW} aria-hidden />
      )}
      <div className={uiCx('flex items-center', QUOTE_INLINE_CONTROL_H)}>{children}</div>
    </div>
  );
}

type Client = { id:string, name?:string, display_name?:string, address_line1?:string, city?:string, province?:string, country?:string };
type Material = { id:number, name:string, supplier_name?:string, category?:string, unit?:string, price?:number, last_updated?:string, unit_type?:string, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number, description?:string, image_base64?:string, technical_manual_url?:string };

export default function QuoteForm({ mode, clientId: clientIdProp, initial, disabled, onSave, showRestrictionWarning, restrictionMessage, disableHistoryGuard = false }: { mode:'new'|'edit', clientId?:string, initial?: any, disabled?: boolean, onSave?: ()=>void, showRestrictionWarning?: boolean, restrictionMessage?: string, disableHistoryGuard?: boolean }){
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
  const [selectedTermsTemplateId, setSelectedTermsTemplateId] = useState<string>('');
  const [sections, setSections] = useState<any[]>([]);
  
  // Get terms templates from settings
  const termsTemplates = useMemo(() => {
    return (settings?.['terms-templates'] || []) as Array<{ id: string; label: string; meta?: { description?: string } }>;
  }, [settings]);
  const [coverBlob, setCoverBlob] = useState<Blob|null>(null);
  const [coverFoId, setCoverFoId] = useState<string|undefined>(undefined);
  const [pickerFor, setPickerFor] = useState<null|'cover'>(null);
  const [sectionPicker, setSectionPicker] = useState<{
    secId: string;
    index?: number;
    fileObjectId?: string;
    orientation?: ProposalSectionImageOrientation;
  }|null>(null);
  const [sectionImageLightbox, setSectionImageLightbox] = useState<{
    fileObjectId: string;
    orientation?: string | null;
  } | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const newImageId = ()=> 'img_'+Math.random().toString(36).slice(2);
  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };
  const resetContactModal = () => {
    setContactModalOpen(false);
    setNewContactName('');
    setNewContactEmail('');
    setNewContactPhone('');
    setNewContactRole('');
    setNewContactDept('');
    setNewContactPrimary('false');
    setContactNameError(false);
    setContactPhotoBlob(null);
  };
  const handleContactSelectChange = (contactId: string) => {
    if (contactId === '__new__') {
      setContactModalOpen(true);
    } else {
      setSelectedContactId(contactId);
      if (contactId && contacts) {
        const contact = contacts.find((c) => String(c.id) === contactId);
        if (contact) {
          setCreatedFor(contact.name || '');
          setPrimary({
            name: contact.name || '',
            phone: contact.phone || '',
            email: contact.email || '',
          });
        }
      } else {
        setCreatedFor('');
        setPrimary({ name: '', phone: '', email: '' });
      }
    }
  };
  const handleCreateNewContact = async () => {
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
      const isFirstContact = !contacts || contacts.length === 0;
      const willBePrimary = isFirstContact || newContactPrimary === 'true';
      if (willBePrimary && contacts && contacts.length > 0) {
        const primaryContact = contacts.find((c: any) => c.is_primary);
        if (primaryContact) {
          await api('PATCH', `/clients/${clientId}/contacts/${primaryContact.id}`, {
            is_primary: false,
          });
        }
      }
      const payload: any = {
        name: newContactName,
        email: newContactEmail,
        phone: newContactPhone,
        role_title: newContactRole,
        department: newContactDept,
        is_primary: willBePrimary,
      };
      const created: any = await api('POST', `/clients/${clientId}/contacts`, payload);
      if (contactPhotoBlob && created.id) {
        try {
          const up: any = await api('POST', '/files/upload', {
            project_id: null,
            client_id: clientId,
            employee_id: null,
            category_id: 'contact-photo',
            original_name: `contact-${created.id}.jpg`,
            content_type: 'image/jpeg',
          });
          await fetch(up.upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
            body: contactPhotoBlob,
          });
          const conf: any = await api('POST', '/files/confirm', {
            key: up.key,
            size_bytes: contactPhotoBlob.size,
            checksum_sha256: 'na',
            content_type: 'image/jpeg',
          });
          await api(
            'POST',
            `/clients/${clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent('contact-photo-' + created.id)}&original_name=${encodeURIComponent('contact-' + created.id + '.jpg')}`,
          );
        } catch (e) {
          console.error('Failed to upload contact photo:', e);
        }
      }
      resetContactModal();
      await refetchContacts();
      setSelectedContactId(String(created.id));
      setCreatedFor(created.name || '');
      setPrimary({
        name: created.name || '',
        phone: created.phone || '',
        email: created.email || '',
      });
    } catch (e) {
      toast.error('Failed to create contact');
      setIsCreatingContact(false);
    }
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
  const [footerVisible, setFooterVisible] = useState<boolean>(false);
  const [sectionsExpanded, setSectionsExpanded] = useState<Record<string, boolean>>({
    generalInfo: true,
    sections: false,
    pricing: false,
    optionalServices: false,
    terms: false,
  });
  const confirm = useConfirm();
  const { setHasUnsavedChanges: setGlobalUnsavedChanges } = useUnsavedChanges();
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoSavingRef = useRef<boolean>(false);
  const lastAutoSaveRef = useRef<number>(0);
  const quoteIdRef = useRef<string | undefined>(mode === 'edit' ? initial?.id : undefined);
  const lastPrefilledQuoteIdRef = useRef<string | null>(null);
  const handleSaveRef = useRef<() => Promise<void>>();
  const estimateBuilderRef = useRef<EstimateBuilderRef | null>(null);
  const formRootRef = useRef<HTMLDivElement>(null);
  const preservedScrollTopRef = useRef<number | null>(null);

  const captureScrollForPricingUpdate = useCallback(() => {
    const scrollEl = findScrollableAncestor(formRootRef.current);
    preservedScrollTopRef.current = scrollEl?.scrollTop ?? null;
  }, []);

  const setPricingItemTax = useCallback(
    (sectionIndex: number, itemIndex: number, field: 'pst' | 'gst', checked: boolean) => {
      captureScrollForPricingUpdate();
      setPricingSections((arr) =>
        arr.map((s, idx) =>
          idx === sectionIndex
            ? { ...s, items: s.items.map((x, j) => (j === itemIndex ? { ...x, [field]: checked } : x)) }
            : s,
        ),
      );
    },
    [captureScrollForPricingUpdate],
  );

  // --- Helpers declared early so effects can safely reference them
  const sanitizeSections = (arr:any[])=> (arr||[]).map((sec:any)=>{
    if (sec?.type==='images'){
      return {
        type: 'images',
        title: String(sec.title||''),
        images: (sec.images||[]).map((im:any)=> ({
          file_object_id: String(im.file_object_id||''),
          caption: String(im.caption||''),
          orientation: normalizeProposalSectionImageOrientation(im.orientation),
        }))
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
        const imgs = (sec.images||[]).map((im:any)=> ({
          image_id: im.image_id || newImageId(),
          file_object_id: String(im.file_object_id||''),
          caption: String(im.caption||''),
          orientation: normalizeProposalSectionImageOrientation(im.orientation),
        }));
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

  // Pricing tax toggles can shrink the summary block; clamp scroll so the page does not stay stuck past content.
  useLayoutEffect(() => {
    const scrollEl = findScrollableAncestor(formRootRef.current);
    const saved = preservedScrollTopRef.current;
    if (scrollEl != null && saved != null) {
      scrollEl.scrollTop = saved;
      preservedScrollTopRef.current = null;
    }
    clampOverflowScrollAncestors(formRootRef.current);
  }, [pricingSections]);

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
        resetContactModal();
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

    // Intercept browser back button (skip when parent handles in-app navigation)
    const handlePopState = async (_e: PopStateEvent) => {
      if (disableHistoryGuard || !hasUnsaved) return;
      
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
    if (!disableHistoryGuard && hasUnsaved) {
      window.history.pushState(null, '', window.location.href);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    if (!disableHistoryGuard) {
      window.addEventListener('popstate', handlePopState);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (!disableHistoryGuard) {
        window.removeEventListener('popstate', handlePopState);
      }
    };
  }, [hasUnsavedChanges, confirm, disableHistoryGuard]);

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
    if (coverFoId) setCoverPreview(withFileAccessToken(`/files/${coverFoId}/thumbnail?w=600`));
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
      // Open PDF in new tab automatically for preview
      window.open(url, '_blank');
      toast.success('Quote ready');
      setLastGeneratedHash(computeFingerprint());
    }catch(e){ toast.error('Generate failed'); }
    finally{ setIsGenerating(false); }
  };

  // drag helpers
  const [draggingSection, setDraggingSection] = useState<number|null>(null);
  const [dragOverSection, setDragOverSection] = useState<number|null>(null);
  const [dragInsertPosition, setDragInsertPosition] = useState<'above'|'below'|null>(null); // Track where to insert
  const onSectionDragStart = (idx:number)=> setDraggingSection(idx);
  const onSectionDragOver = (idx:number, e: React.DragEvent)=> {
    if (draggingSection === null || draggingSection === idx) return;
    setDragOverSection(idx);
    // Determine if inserting above or below based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY;
    const sectionMiddle = rect.top + rect.height / 2;
    setDragInsertPosition(mouseY < sectionMiddle ? 'above' : 'below');
  };
  const onSectionDrop = ()=>{
    if (draggingSection===null || dragOverSection===null || draggingSection===dragOverSection) { 
      setDraggingSection(null); 
      setDragOverSection(null);
      setDragInsertPosition(null);
      return; 
    }
    setSections(arr=>{
      const next = [...arr];
      const [moved] = next.splice(draggingSection,1);
      // Adjust insertion index based on whether we're moving up or down
      let insertIdx = dragOverSection;
      if (draggingSection < dragOverSection) {
        // Moving down: adjust index since we removed an item before
        insertIdx = dragInsertPosition === 'above' ? dragOverSection : dragOverSection + 1;
      } else {
        // Moving up: insert at the target position
        insertIdx = dragInsertPosition === 'above' ? dragOverSection : dragOverSection + 1;
      }
      next.splice(insertIdx, 0, moved);
      return next;
    });
    setDraggingSection(null);
    setDragOverSection(null);
    setDragInsertPosition(null);
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
  const dsSectionShell = uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, 'overflow-hidden');
  const dsSectionHeader = uiCx(
    'flex w-full cursor-pointer items-center justify-between border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50/80',
    uiTypography.sectionTitle,
  );
  const dsSectionBodyPad = uiSpacing.cardPadding;
  const dsSectionBodyPadLg = uiSpacing.cardPadding;
  const dsFieldLabelClass = undefined;
  const dsReadonlyClass = uiTypography.sectionTitle;
  return (
    <div ref={formRootRef} onKeyDown={!disabled ? (e)=>{
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
          <div className={uiCx(uiRadius.card, 'border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800')}>
            <strong>Editing Restricted:</strong> {restrictionMessage}
          </div>
        </div>
      )}
      
      <div className="space-y-4">
        {/* General Information Block */}
        <div className={dsSectionShell}>
          <div 
            className={dsSectionHeader}
            onClick={() => setSectionsExpanded(prev => ({ ...prev, generalInfo: !prev.generalInfo }))}
          >
            <span>General Information</span>
            <svg 
              className={`w-5 h-5 transition-transform duration-200 ${sectionsExpanded.generalInfo ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {sectionsExpanded.generalInfo && (
          <div className={dsSectionBodyPad}>
            <div className="grid md:grid-cols-2 gap-3">
              {/* Card 1 - Left side: Document info, Contact, and Other Notes */}
              <div className="space-y-3">
                <div>
                  {disabled ? (
                    <>
                      <div className={dsFieldLabelClass ?? uiTypography.controlLabel}>Document Type (Shown on cover page)</div>
                      <div className={dsReadonlyClass}>{coverTitle || '-'}</div>
                    </>
                  ) : (
                    <AppInput
                      label="Document Type (Shown on cover page)"
                      value={coverTitle}
                      onChange={(e) => setCoverTitle(e.target.value)}
                      maxLength={44}
                      fieldHint={QUOTE_FIELD_HINTS.documentType}
                    />
                  )}
                </div>
                <div>
                  {disabled ? (
                    <>
                      <div className={dsFieldLabelClass ?? uiTypography.controlLabel}>Type of Quotation</div>
                      <div className={dsReadonlyClass}>{typeOfProject || '-'}</div>
                    </>
                  ) : (
                    <AppInput
                      label="Type of Quotation"
                      value={typeOfProject}
                      onChange={(e) => setTypeOfProject(e.target.value)}
                      fieldHint={QUOTE_FIELD_HINTS.typeOfProject}
                    />
                  )}
                </div>
                <div>
                  {disabled ? (
                    <>
                      <div className={dsFieldLabelClass ?? uiTypography.controlLabel}>Date</div>
                      <div className={dsReadonlyClass}>{date || '-'}</div>
                    </>
                  ) : (
                    <AppDatePicker
                      label="Date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      fieldHint={QUOTE_FIELD_HINTS.date}
                    />
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    {disabled ? (
                      <>
                        <div className={dsFieldLabelClass ?? uiTypography.controlLabel}>Primary Contact Name</div>
                        <div className={dsReadonlyClass}>{createdFor || '-'}</div>
                      </>
                    ) : (
                      <AppSelect
                        label="Primary Contact Name"
                        value={contactModalOpen ? '__new__' : selectedContactId}
                        options={[
                          { value: '', label: '-- Select Contact --' },
                          ...(contacts || []).map((contact) => ({
                            value: String(contact.id),
                            label: contact.name || 'Unnamed Contact',
                          })),
                          { value: '__new__', label: '+ New Contact' },
                        ]}
                        onChange={(e) => handleContactSelectChange(e.target.value)}
                        fieldHint={QUOTE_FIELD_HINTS.primaryContact}
                      />
                    )}
                  </div>
                  <div>
                    {disabled ? (
                      <>
                        <div className={dsFieldLabelClass ?? uiTypography.controlLabel}>Primary Contact Phone</div>
                        <div className={dsReadonlyClass}>{primary.phone || '-'}</div>
                      </>
                    ) : (
                      <AppInput
                        label="Primary Contact Phone"
                        value={primary.phone || ''}
                        onChange={(e) => setPrimary((p) => ({ ...p, phone: e.target.value }))}
                        fieldHint={QUOTE_FIELD_HINTS.primaryPhone}
                      />
                    )}
                  </div>
                  <div>
                    {disabled ? (
                      <>
                        <div className={dsFieldLabelClass ?? uiTypography.controlLabel}>Primary Contact Email</div>
                        <div className={dsReadonlyClass}>{primary.email || '-'}</div>
                      </>
                    ) : (
                      <AppInput
                        label="Primary Contact Email"
                        value={primary.email || ''}
                        onChange={(e) => setPrimary((p) => ({ ...p, email: e.target.value }))}
                        fieldHint={QUOTE_FIELD_HINTS.primaryEmail}
                      />
                    )}
                  </div>
                </div>
                <div>
                  {disabled ? (
                    <>
                      <div className={dsFieldLabelClass ?? uiTypography.controlLabel}>Other Notes</div>
                      <div className={dsReadonlyClass}>{otherNotes || '-'}</div>
                    </>
                  ) : (
                    <AppTextarea
                      label="Other Notes"
                      value={otherNotes}
                      onChange={(e) => setOtherNotes(e.target.value)}
                      maxLength={250}
                      fieldHint={QUOTE_FIELD_HINTS.otherNotes}
                    />
                  )}
                </div>
              </div>
              {/* Card 2 - Right side: Front Cover Image only */}
              <div className="space-y-3">
                <div className="max-w-[50%]">
                  <AppControlLabelRow
                    label="Front Cover Image"
                    fieldHint={<AppFieldHint hint={QUOTE_FIELD_HINTS.frontCover} />}
                  />
                  {!disabled && (
                    <AppButton type="button" variant="secondary" size="sm" onClick={() => setPickerFor('cover')}>
                      Choose
                    </AppButton>
                  )}
                  {coverPreview && (
                    <div className="mt-2">
                      <img
                        src={coverPreview}
                        className={uiCx('w-full rounded border', uiBorders.subtle)}
                        style={{ aspectRatio: '566/537', objectFit: 'contain' }}
                        alt=""
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
        
        {/* Sections Block */}
        <div className={dsSectionShell}>
          <div 
            className={dsSectionHeader}
            onClick={() => setSectionsExpanded(prev => ({ ...prev, sections: !prev.sections }))}
          >
            <span>Sections</span>
            <svg 
              className={`w-5 h-5 transition-transform duration-200 ${sectionsExpanded.sections ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {sectionsExpanded.sections && (
          <div className={dsSectionBodyPadLg}>
          <div className="space-y-3">
            {sections.map((s:any, idx:number)=> (
              <div key={s.id||idx} className="relative">
                {/* Insertion line indicator - shown above the section when dragging */}
                {!disabled && dragOverSection === idx && dragInsertPosition === 'above' && draggingSection !== null && draggingSection !== idx && (
                  <div className="absolute -top-2 left-0 right-0 h-0.5 bg-brand-red rounded-full z-10 shadow-lg" style={{boxShadow: '0 0 8px rgba(214, 32, 40, 0.6)'}}></div>
                )}
                <div
                   className={`border rounded p-3 transition-all ${
                     draggingSection === idx ? 'opacity-50 scale-95' : ''
                   } ${
                     dragOverSection === idx && !disabled && draggingSection !== idx 
                       ? 'ring-2 ring-brand-red ring-opacity-50 bg-red-50/30' 
                       : ''
                   }`}
                   onDragOver={!disabled ? (e)=>{ e.preventDefault(); onSectionDragOver(idx, e); } : undefined}
                   onDragLeave={!disabled ? (e)=>{
                     // Only clear if we're actually leaving the section (not just moving to a child element)
                     const rect = e.currentTarget.getBoundingClientRect();
                     const x = e.clientX;
                     const y = e.clientY;
                     if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                       if (dragOverSection === idx) {
                         setDragOverSection(null);
                         setDragInsertPosition(null);
                       }
                     }
                   } : undefined}
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
                            setDragInsertPosition(null);
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
                    <AppInput
                      className="min-w-[240px] flex-1"
                      label="Section title"
                      data-role="section-title"
                      data-sec={idx}
                      onFocus={() => setActiveSectionIndex(idx)}
                      placeholder="Section title"
                      value={s.title || ''}
                      onChange={(e) => setSections((arr) => arr.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
                      disabled={disabled}
                      readOnly={disabled}
                      fieldHint={QUOTE_FIELD_HINTS.sectionTitle}
                    />
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
                  <AppTextarea
                    label="Section text"
                    rows={5}
                    placeholder="Section text"
                    value={s.text || ''}
                    onChange={(e) => setSections((arr) => arr.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)))}
                    disabled={disabled}
                    readOnly={disabled}
                    fieldHint={QUOTE_FIELD_HINTS.sectionText}
                    onKeyDown={
                      !disabled
                        ? (e) => {
                            if (e.key === 'Tab') {
                              e.preventDefault();
                              const textarea = e.currentTarget;
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const value = textarea.value;
                              const newValue = value.substring(0, start) + '    ' + value.substring(end);
                              setSections((arr) => arr.map((x, i) => (i === idx ? { ...x, text: newValue } : x)));
                              setTimeout(() => {
                                textarea.selectionStart = textarea.selectionEnd = start + 4;
                              }, 0);
                            }
                          }
                        : undefined
                    }
                  />
                ) : (
                  <div>
                    {!disabled && (
                      <div className="mb-2">
                        <AppButton type="button" variant="secondary" size="sm" onClick={() => setSectionPicker({ secId: s.id || String(idx) })}>
                          + Add Image
                        </AppButton>
                      </div>
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
                                <AppButton type="button" variant="secondary" size="sm" title="Edit image" onClick={() => setSectionPicker({
                                  secId: s.id || String(idx),
                                  index: j,
                                  fileObjectId: img.file_object_id,
                                  orientation: normalizeProposalSectionImageOrientation(img.orientation),
                                })}>
                                  Edit
                                </AppButton>
                                <AppButton
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  title="Duplicate image"
                                  onClick={() => {
                                    setSections((arr) =>
                                      arr.map((x, i) => {
                                        if (i !== idx) return x;
                                        const imgs = Array.isArray(x.images) ? [...x.images] : [];
                                        const clone = { ...(imgs[j] || {}), image_id: 'img_' + Math.random().toString(36).slice(2) };
                                        imgs.splice(j + 1, 0, clone);
                                        setTimeout(() => setFocusTarget({ type: 'caption', sectionIndex: idx, imageIndex: j + 1 }), 0);
                                        return { ...x, images: imgs };
                                      }),
                                    );
                                  }}
                                >
                                  Duplicate
                                </AppButton>
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
                          {img.file_object_id ? (
                            <SectionImagePreview
                              fileObjectId={String(img.file_object_id)}
                              orientation={img.orientation}
                              onClick={() =>
                                setSectionImageLightbox({
                                  fileObjectId: String(img.file_object_id),
                                  orientation: img.orientation,
                                })
                              }
                            />
                          ) : null}
                          <AppInput
                            className="mt-2"
                            label="Caption"
                            data-role="img-caption"
                            data-sec={idx}
                            data-img={j}
                            placeholder="Caption"
                            value={img.caption || ''}
                            onChange={(e) =>
                              setSections((arr) =>
                                arr.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        images: (x.images || []).map((it: any, k: number) =>
                                          k === j ? { ...it, caption: e.target.value } : it,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                            disabled={disabled}
                            readOnly={disabled}
                            fieldHint={QUOTE_FIELD_HINTS.imageCaption}
                          />
                        </div>
                      ))}
                      {!(s.images||[]).length && <div className="text-sm text-gray-600">No images</div>}
                    </div>
                  </div>
                )}
              </div>
                {/* Insertion line indicator - shown below the section when dragging */}
                {!disabled && dragOverSection === idx && dragInsertPosition === 'below' && draggingSection !== null && draggingSection !== idx && (
                  <div className="absolute -bottom-2 left-0 right-0 h-0.5 bg-brand-red rounded-full z-10 shadow-lg" style={{boxShadow: '0 0 8px rgba(214, 32, 40, 0.6)'}}></div>
                )}
            </div>
            ))}
            {!disabled && (
              <div className="flex items-center gap-2">
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSections((arr) => [...arr, { id: 'sec_' + Math.random().toString(36).slice(2), type: 'text', title: '', text: '' }])}
                >
                  + Text Section
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSections((arr) => [...arr, { id: 'sec_' + Math.random().toString(36).slice(2), type: 'images', title: '', images: [] }])}
                >
                  + Images Section
                </AppButton>
              </div>
            )}
          </div>
          </div>
          )}
        </div>

        {/* Pricing Block - Multiple Sections */}
        {pricingSections.map((section, sectionIndex) => {
          const sectionTotals = calculateSectionTotals(section);
          const sectionNumber = pricingSections.length > 1 ? ` #${sectionIndex + 1}` : '';
          
          return (
            <div key={section.id} className={uiCx(dsSectionShell, 'mb-4')}>
              <div 
                className={dsSectionHeader}
                onClick={() => setSectionsExpanded(prev => ({ ...prev, pricing: !prev.pricing }))}
              >
                <span>Pricing{sectionNumber}</span>
                <div className="flex items-center gap-2">
                  {!disabled && sectionIndex === 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
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
                      className="rounded p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const result = await confirm({ title: 'Remove Pricing Section', message: 'Are you sure you want to remove this pricing section?' });
                        if (result === 'confirm') {
                          setPricingSections(arr => arr.filter((_, idx) => idx !== sectionIndex));
                        }
                      }}
                      className="rounded p-1.5 transition-colors hover:bg-gray-100"
                      title="Remove this Pricing section"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                      </svg>
                    </button>
                  )}
                  <svg 
                    className={`h-5 w-5 transition-transform duration-200 ${sectionsExpanded.pricing ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {sectionsExpanded.pricing && (
              <div className={dsSectionBodyPad}>
                <div className="text-[12px] text-gray-600 mb-2">If no pricing items are added, the "Pricing Table{sectionNumber}" section will be hidden in the PDF.</div>
                {!disabled && (
                  <div className="mb-3 border-b bg-white py-2">
                    <div className="flex items-center gap-2">
                      <div className="ml-auto flex items-center gap-3">
                        <AppInput
                          className="w-24"
                          label="PST (%)"
                          type="number"
                          value={String(section.pstRate)}
                          min={0}
                          step={1}
                          onChange={(e) =>
                            setPricingSections((arr) =>
                              arr.map((s, idx) => (idx === sectionIndex ? { ...s, pstRate: Number(e.target.value || 0) } : s)),
                            )
                          }
                          disabled={disabled}
                        />
                        <AppInput
                          className="w-24"
                          label="GST (%)"
                          type="number"
                          value={String(section.gstRate)}
                          min={0}
                          step={1}
                          onChange={(e) =>
                            setPricingSections((arr) =>
                              arr.map((s, idx) => (idx === sectionIndex ? { ...s, gstRate: Number(e.target.value || 0) } : s)),
                            )
                          }
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
                <div className="space-y-2 [overflow-anchor:none]">
                  {section.items.map((c, i)=> {
                    // Calculate line total: price × quantity
                    const priceNum = parseFloat(parseAccounting(c.price || '0').replace(/,/g, '')) || 0;
                    const qtyNum = parseFloat(c.quantity || '1') || 1;
                    const lineTotal = priceNum * qtyNum;
                    
                    return (
                      <div key={i} className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start">
                        <ProposalInlineControlSpacer>
                          <div className="h-8 w-10 overflow-hidden rounded border bg-gray-100">
                            {c.productImage ? (
                              <img
                                src={c.productImage}
                                alt={c.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/ui/assets/image placeholders/no_image.png';
                                }}
                              />
                            ) : (
                              <img src="/ui/assets/image placeholders/no_image.png" alt="No image" className="h-full w-full object-cover" />
                            )}
                          </div>
                        </ProposalInlineControlSpacer>
                        <div className="relative min-w-0 flex-1">
                          <ProposalInlineInput
                            className="w-full"
                            label="Name"
                            placeholder="Name"
                            value={c.name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setPricingSections((arr) =>
                                arr.map((s, idx) =>
                                  idx === sectionIndex ? { ...s, items: s.items.map((x, j) => (j === i ? { ...x, name: v } : x)) } : s,
                                ),
                              );
                            }}
                            disabled={disabled || !!c.productId}
                            readOnly={disabled || !!c.productId}
                            fieldHint={QUOTE_FIELD_HINTS.pricingName}
                          />
                          {!disabled && (
                            <button
                              type="button"
                              onClick={() => setProductSearchModalOpen({ sectionIndex, itemIndex: i })}
                              className="absolute right-0 top-[calc(100%-1.75rem)] p-1 text-gray-500 hover:text-gray-700"
                              title="Browse Products by Supplier"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="M21 21l-4.35-4.35"></path>
                              </svg>
                            </button>
                          )}
                        </div>
                        <ProposalInlineInput
                          className="min-w-[100px] max-w-[140px] flex-1"
                          label="Price"
                          placeholder="Price"
                          value={c.price}
                          onChange={(e) => {
                            const v = parseAccounting(e.target.value);
                            setPricingSections((arr) =>
                              arr.map((s, idx) =>
                                idx === sectionIndex ? { ...s, items: s.items.map((x, j) => (j === i ? { ...x, price: v } : x)) } : s,
                              ),
                            );
                          }}
                          onBlur={
                            !disabled
                              ? () =>
                                  setPricingSections((arr) =>
                                    arr.map((s, idx) =>
                                      idx === sectionIndex
                                        ? { ...s, items: s.items.map((x, j) => (j === i ? { ...x, price: formatAccounting(x.price) } : x)) }
                                        : s,
                                    ),
                                  )
                              : undefined
                          }
                          disabled={disabled}
                          readOnly={disabled}
                          fieldHint={QUOTE_FIELD_HINTS.pricingPrice}
                        />
                        <div className="min-w-[80px] max-w-[120px] shrink-0">
                          <ProposalInlineLabelRow label="Qty" fieldHint={QUOTE_FIELD_HINTS.pricingQty} />
                          <div className={uiCx('flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white', QUOTE_INLINE_CONTROL_H)}>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className={uiCx(
                                'min-w-0 flex-1 appearance-none border-0 bg-transparent px-2 text-xs text-gray-900 [-moz-appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                                disabled && 'cursor-not-allowed bg-gray-100',
                                QUOTE_INLINE_CONTROL_H,
                                'py-0',
                              )}
                              placeholder="Qty"
                              value={c.quantity || '1'}
                              onChange={(e) => {
                                const v = e.target.value;
                                const num = parseInt(v) || 1;
                                const finalValue = num < 1 ? '1' : String(num);
                                setPricingSections((arr) =>
                                  arr.map((s, idx) =>
                                    idx === sectionIndex ? { ...s, items: s.items.map((x, j) => (j === i ? { ...x, quantity: finalValue } : x)) } : s,
                                  ),
                                );
                              }}
                              disabled={disabled}
                              readOnly={disabled}
                            />
                            {!disabled && (
                              <div className="flex w-6 shrink-0 flex-col border-l border-gray-200 bg-white">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentQty = parseInt(c.quantity || '1') || 1;
                                    setPricingSections((arr) =>
                                      arr.map((s, idx) =>
                                        idx === sectionIndex
                                          ? { ...s, items: s.items.map((x, j) => (j === i ? { ...x, quantity: String(currentQty + 1) } : x)) }
                                          : s,
                                      ),
                                    );
                                  }}
                                  className="flex flex-1 items-center justify-center border-b border-gray-200 px-0.5 py-0 text-[9px] leading-tight hover:bg-gray-100"
                                  title="Increase"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentQty = parseInt(c.quantity || '1') || 1;
                                    setPricingSections((arr) =>
                                      arr.map((s, idx) =>
                                        idx === sectionIndex
                                          ? { ...s, items: s.items.map((x, j) => (j === i ? { ...x, quantity: String(Math.max(1, currentQty - 1)) } : x)) }
                                          : s,
                                      ),
                                    );
                                  }}
                                  className="flex flex-1 items-center justify-center px-0.5 py-0 text-[9px] leading-tight hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  title="Decrease"
                                  disabled={parseInt(c.quantity || '1') <= 1}
                                >
                                  ▼
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <ProposalInlineControlSpacer className="min-w-[100px] max-w-[140px]" label="Line total" fieldHint={QUOTE_FIELD_HINTS.pricingLineTotal}>
                          <div className="overflow-hidden whitespace-nowrap text-right text-xs font-medium text-gray-700">
                            ${formatAccounting(lineTotal)}
                          </div>
                        </ProposalInlineControlSpacer>
                        <div className={uiCx('flex shrink-0 gap-1.5', 'items-start')}>
                          <ProposalInlineCheckbox
                            label="PST"
                            fieldHint={QUOTE_FIELD_HINTS.pst}
                            checked={c.pst === true}
                            onChange={(checked) => setPricingItemTax(sectionIndex, i, 'pst', checked)}
                            disabled={disabled}
                          />
                          <ProposalInlineCheckbox
                            label="GST"
                            fieldHint={QUOTE_FIELD_HINTS.gst}
                            checked={c.gst === true}
                            onChange={(checked) => setPricingItemTax(sectionIndex, i, 'gst', checked)}
                            disabled={disabled}
                          />
                        </div>
                        {!disabled && (
                          <ProposalInlineControlSpacer>
                            <button
                              type="button"
                              className={uiCx(
                                'flex w-8 shrink-0 items-center justify-center rounded bg-red-100 transition-colors hover:bg-red-200',
                                QUOTE_INLINE_CONTROL_H,
                              )}
                              onClick={() =>
                                setPricingSections((arr) =>
                                  arr.map((s, idx) => (idx === sectionIndex ? { ...s, items: s.items.filter((_, j) => j !== i) } : s)),
                                )
                              }
                              title="Remove"
                            >
                              <svg className="h-4 w-4 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </ProposalInlineControlSpacer>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!disabled && (
                  <AppButton
                    type="button"
                    variant="secondary"
                    className="mt-3 flex min-h-[60px] w-full items-center justify-center border-2 border-dashed"
                    onClick={() => setProductSearchModalOpen({ sectionIndex, itemIndex: -1 })}
                    disabled={disabled}
                  >
                    + Add Pricing Item
                  </AppButton>
                )}
                
                {/* Show PST, GST fields even when disabled (read-only view) */}
                {disabled && (
                  <div className="mt-4 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={uiTypography.controlLabel}>PST (%)</div>
                      <div className={dsReadonlyClass}>{section.pstRate}%</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={uiTypography.controlLabel}>GST (%)</div>
                      <div className={dsReadonlyClass}>{section.gstRate}%</div>
                    </div>
                  </div>
                )}

                {/* Summary Section */}
                <div className="mt-6 [overflow-anchor:none]">
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
                            <div
                              className={uiCx(
                                'flex items-center justify-between rounded px-1 py-1 -mx-1 hover:bg-gray-50',
                                !(sectionTotals.showPstInPdf && sectionTotals.pst > 0) && 'invisible min-h-[1.5rem]',
                              )}
                            >
                              <span>PST ({section.pstRate}%)</span>
                              <span>${sectionTotals.pst.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Sub-total</span><span className="font-bold">${sectionTotals.subtotal.toFixed(2)}</span></div>
                          </div>
                        </div>
                        {/* Right Card */}
                        <div className="rounded-xl border bg-white p-4">
                          <div className="space-y-1 text-sm">
                            <div
                              className={uiCx(
                                'flex items-center justify-between rounded px-1 py-1 -mx-1 hover:bg-gray-50',
                                !(sectionTotals.showGstInPdf && sectionTotals.gst > 0) && 'invisible min-h-[1.5rem]',
                              )}
                            >
                              <span>GST ({section.gstRate}%)</span>
                              <span>${sectionTotals.gst.toFixed(2)}</span>
                            </div>
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
                    <div className="text-xs font-semibold">Total: <span className="text-gray-600">${formatAccounting(sectionTotals.grandTotal)}</span></div>
                    <AppCheckbox
                      label="Show Total in PDF"
                      checked={section.showTotalInPdf}
                      onChange={(checked) =>
                        setPricingSections((arr) =>
                          arr.map((s, idx) => (idx === sectionIndex ? { ...s, showTotalInPdf: checked } : s)),
                        )
                      }
                      disabled={disabled}
                      fieldHint={QUOTE_FIELD_HINTS.showTotalInPdf}
                      className="text-xs"
                    />
                  </div>
                </div>
              </div>
              )}
            </div>
          );
        })}

        {/* Optional Services Block */}
        <div className={dsSectionShell}>
          <div 
            className={dsSectionHeader}
            onClick={() => setSectionsExpanded(prev => ({ ...prev, optionalServices: !prev.optionalServices }))}
          >
            <span>Optional Services</span>
            <svg 
              className={`w-5 h-5 transition-transform duration-200 ${sectionsExpanded.optionalServices ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {sectionsExpanded.optionalServices && (
          <div className={dsSectionBodyPad}>
          <div className="text-[10px] text-gray-600 mb-2">If no services are added, the "Optional Services" section will be hidden in the PDF.</div>
            <div className="space-y-2">
              {optionalServices.map((s, i)=> (
                <div key={i} className={uiCx('grid grid-cols-5 gap-2', 'items-start')}>
                  <ProposalInlineInput
                    className="col-span-3"
                    label="Service"
                    placeholder="Service"
                    value={s.service}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOptionalServices((arr) => arr.map((x, j) => (j === i ? { ...x, service: v } : x)));
                    }}
                    disabled={disabled}
                    readOnly={disabled}
                    fieldHint={QUOTE_FIELD_HINTS.optionalService}
                  />
                  <ProposalInlineInput
                    className="col-span-1"
                    label="Price"
                    placeholder="Price"
                    value={s.price}
                    onChange={(e) => {
                      const v = parseAccounting(e.target.value);
                      setOptionalServices((arr) => arr.map((x, j) => (j === i ? { ...x, price: v } : x)));
                    }}
                    onBlur={
                      !disabled
                        ? () =>
                            setOptionalServices((arr) =>
                              arr.map((x, j) => (j === i ? { ...x, price: formatAccounting(x.price) } : x)),
                            )
                        : undefined
                    }
                    disabled={disabled}
                    readOnly={disabled}
                    fieldHint={QUOTE_FIELD_HINTS.optionalPrice}
                  />
                  {!disabled && (
                    <ProposalInlineControlSpacer className="col-span-1">
                      <AppButton type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setOptionalServices((arr) => arr.filter((_, j) => j !== i))}>
                        Remove
                      </AppButton>
                    </ProposalInlineControlSpacer>
                  )}
                </div>
              ))}
              {!disabled && (
                <AppButton type="button" variant="secondary" size="sm" onClick={() => setOptionalServices((arr) => [...arr, { service: '', price: '' }])}>
                  + Add Service
                </AppButton>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Terms Block */}
        <div className={dsSectionShell}>
          <div 
            className={dsSectionHeader}
            onClick={() => setSectionsExpanded(prev => ({ ...prev, terms: !prev.terms }))}
          >
            <span>Terms</span>
            <svg 
              className={`w-5 h-5 transition-transform duration-200 ${sectionsExpanded.terms ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {sectionsExpanded.terms && (
          <div className={uiCx(dsSectionBodyPad, 'space-y-2')}>
            {termsTemplates.length > 0 && (
              <div>
                {disabled ? (
                  <>
                    <div className={dsFieldLabelClass ?? uiTypography.controlLabel}>Select Terms Template (optional)</div>
                    <div className={dsReadonlyClass}>
                      {selectedTermsTemplateId
                        ? termsTemplates.find((t) => t.id === selectedTermsTemplateId)?.label || '-'
                        : '-'}
                    </div>
                  </>
                ) : (
                  <AppSelect
                    label="Select Terms Template (optional)"
                    value={selectedTermsTemplateId}
                    options={[
                      { value: '', label: 'Custom / No template' },
                      ...termsTemplates.map((template) => ({
                        value: template.id,
                        label: template.label,
                      })),
                    ]}
                    onChange={(e) => {
                      const templateId = e.target.value;
                      setSelectedTermsTemplateId(templateId);
                      if (templateId) {
                        const template = termsTemplates.find((t) => t.id === templateId);
                        if (template?.meta?.description) {
                          setTerms(template.meta.description);
                        }
                      }
                    }}
                    fieldHint={QUOTE_FIELD_HINTS.termsTemplate}
                  />
                )}
              </div>
            )}
            <div>
              {disabled ? (
                <div className={uiCx(dsReadonlyClass, 'whitespace-pre-wrap')}>{terms || '-'}</div>
              ) : (
                <AppTextarea
                  label="Terms Text"
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={12}
                  className="min-h-[250px]"
                  fieldHint={QUOTE_FIELD_HINTS.termsText}
                />
              )}
            </div>
          </div>
          )}
        </div>
        
        {downloadUrl && (renderFingerprint!==lastGeneratedHash) && (
          <div className="mb-3 p-2 rounded bg-yellow-50 border text-[12px] text-yellow-800">You have made changes since the last PDF was generated. Please click "Generate Quote" again to update the download.</div>
        )}
        
        {/* Spacer to prevent fixed bar from overlapping content - only needed when footer is visible */}
        {!disabled && <div className="h-12" />}
      </div>
      
      {/* Footer hover trigger area - always visible at bottom */}
      {!disabled && (
        <div 
          className="fixed left-60 right-0 bottom-0 z-40 h-3 cursor-pointer transition-all duration-300"
          onMouseEnter={() => setFooterVisible(true)}
          onMouseLeave={() => setFooterVisible(false)}
        >
          {/* Arrow indicator when footer is hidden */}
          {!footerVisible && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center justify-center gap-1 px-3 py-1 bg-white/90 backdrop-blur-sm border-t border-x rounded-t-lg shadow-sm text-xs text-gray-600 font-medium">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Actions
            </div>
          )}
        </div>
      )}
      
      {/* Fixed footer bar - hidden when disabled (view-only mode) */}
      {!disabled && (
        <div 
          className={`fixed left-60 right-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
            footerVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
          onMouseEnter={() => setFooterVisible(true)}
          onMouseLeave={() => setFooterVisible(false)}
        >
          <div className="px-4">
            <div className={uiCx(
              uiRadius.card,
              uiBorders.subtle,
              uiColors.surface,
              'mx-auto flex max-w-[1400px] items-center justify-between rounded-t-xl border-t bg-white/95 p-2.5 shadow-[0_-6px_16px_rgba(0,0,0,0.08)] backdrop-blur',
            )}>
            {/* Left: Status indicator */}
            {hasUnsavedChanges ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 font-medium">
                Unsaved changes
              </div>
            ) : (
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 font-medium">
                All changes saved
              </div>
            )}
            
            {/* Center: Empty space */}
            <div className="flex-1"></div>
            
            {/* Right: Action buttons */}
            <div className="flex items-center gap-1.5">
              {!disabled && (
                <AppButton type="button" variant="secondary" size="sm" onClick={handleClearQuote} disabled={disabled}>
                  Clear Quote
                </AppButton>
              )}
              {!disabled && mode === 'edit' && (
                <>
                  <AppButton
                    type="button"
                    variant="ghost"
                    size="sm"
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
                          
                          const state = location.state as any;
                          const cameFromCustomer = state?.fromCustomer || false;
                          
                          const referrer = document.referrer || '';
                          const referrerIndicatesCustomer = referrer.includes('/customers/') && clientId;
                          
                          if ((cameFromCustomer || referrerIndicatesCustomer) && clientId) {
                            nav(`/customers/${encodeURIComponent(clientId)}?tab=quotes`);
                          } else {
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
                  </AppButton>
                  <div className="w-px h-4 bg-gray-300"></div>
                </>
              )}
              {!disabled && (
                <AppButton
                  size="sm"
                  onClick={handleSave}
                  disabled={disabled || isSaving || !hasUnsavedChanges}
                  loading={isSaving}
                >
                  Save Quote
                </AppButton>
              )}
              {!disabled && (
                <>
                  <div className="w-px h-4 bg-gray-300"></div>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isGenerating}
                    loading={isGenerating}
                    onClick={handleGenerate}
                  >
                    Generate Quote
                  </AppButton>
                </>
              )}
              {downloadUrl && (
                <>
                  <div className="w-px h-4 bg-gray-300"></div>
                  {(renderFingerprint===lastGeneratedHash) ? (
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = downloadUrl;
                        a.download = 'Quote.pdf';
                        a.click();
                      }}
                    >
                      Download PDF
                    </AppButton>
                  ) : (
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled
                      title="PDF is outdated. Generate again to enable download"
                    >
                      Download PDF
                    </AppButton>
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
        <ImagePicker isOpen={true} onClose={()=>setSectionPicker(null)} clientId={clientId||undefined} targetWidth={PROPOSAL_SECTION_IMAGE_TARGET_WIDTH} targetHeight={PROPOSAL_SECTION_IMAGE_TARGET_HEIGHT} allowEdit={true} exportScale={PROPOSAL_SECTION_IMAGE_EXPORT_SCALE} maxExportLongSide={PROPOSAL_SECTION_IMAGE_MAX_EXPORT_LONG_SIDE} fileObjectId={sectionPicker.fileObjectId} editorScaleFactor={3} allowOrientationToggle initialOrientation={sectionPicker.orientation ?? 'landscape'} onConfirm={async(blob, meta)=>{ 
          try{
            if (!blob){ toast.error('No image'); return; }
            const orientation = meta?.orientation ?? 'landscape';
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
                imgs[sectionPicker.index] = { image_id: (prev.image_id||newImageId()), file_object_id: fileObjectId, caption: prev.caption||'', orientation };
                return { ...x, images: imgs };
              }
              return { ...x, images: [...imgs, { image_id: newImageId(), file_object_id: fileObjectId, caption: '', orientation }] };
            }));
          }catch(e){ toast.error('Failed to add image'); }
          setSectionPicker(null);
        }} />
      )}
      
      {/* New Contact Modal */}
      {contactModalOpen && (
        <AppFormModal
          open
          onClose={resetContactModal}
          title="New Contact"
          formWidth="comfortable"
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={resetContactModal} disabled={isCreatingContact}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={handleCreateNewContact} disabled={isCreatingContact} loading={isCreatingContact}>
                {isCreatingContact ? 'Creating...' : 'Create'}
              </AppButton>
            </div>
          }
        >
          <div className="grid items-start gap-3 md:grid-cols-5">
            <div className="md:col-span-2">
              <AppControlLabelRow
                label="Contact Photo"
                fieldHint={<AppFieldHint hint={QUOTE_FIELD_HINTS.contactPhoto} />}
              />
              <AppButton
                type="button"
                variant="secondary"
                className="mt-1.5 grid h-40 w-full place-items-center"
                onClick={() => {
                  setContactPhotoBlob(new Blob());
                  setPickerForContact('__new__');
                }}
              >
                Select Photo
              </AppButton>
            </div>
            <div className="grid grid-cols-2 gap-3 md:col-span-3">
              <AppInput
                className="col-span-2"
                label="Name *"
                value={newContactName}
                error={contactNameError && !newContactName.trim() ? 'This field is required' : undefined}
                fieldHint={QUOTE_FIELD_HINTS.contactName}
                onChange={(e) => {
                  setNewContactName(e.target.value);
                  if (contactNameError) setContactNameError(false);
                }}
              />
              <AppInput
                label="Role/Title"
                value={newContactRole}
                onChange={(e) => setNewContactRole(e.target.value)}
                fieldHint={QUOTE_FIELD_HINTS.contactRole}
              />
              <AppInput
                label="Department"
                value={newContactDept}
                onChange={(e) => setNewContactDept(e.target.value)}
                fieldHint={QUOTE_FIELD_HINTS.contactDept}
              />
              <AppInput
                label="Email"
                value={newContactEmail}
                onChange={(e) => setNewContactEmail(e.target.value)}
                fieldHint={QUOTE_FIELD_HINTS.contactEmail}
              />
              <AppInput
                label="Phone"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(formatPhone(e.target.value))}
                fieldHint={QUOTE_FIELD_HINTS.contactPhone}
              />
              <AppCheckbox
                className="col-span-2"
                label={(!contacts || contacts.length === 0) ? 'Primary contact' : 'Set as primary contact'}
                checked={(!contacts || contacts.length === 0) || newContactPrimary === 'true'}
                onChange={(checked) => setNewContactPrimary(checked ? 'true' : 'false')}
                disabled={!contacts || contacts.length === 0}
                fieldHint={QUOTE_FIELD_HINTS.contactPrimary}
              />
            </div>
          </div>
        </AppFormModal>
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

      {sectionImageLightbox && (
        <SectionImageLightbox
          fileObjectId={sectionImageLightbox.fileObjectId}
          orientation={sectionImageLightbox.orientation}
          onClose={() => setSectionImageLightbox(null)}
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
      <AppFormModal
        open={open}
        onClose={onClose}
        title="Add Product"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              onClick={() => {
                if (!selection) {
                  toast.error('Select a product first');
                  return;
                }
                onSelect(selection);
              }}
            >
              Add Item
            </AppButton>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <AppInput
              className="flex-1"
              label="Search Product"
              placeholder="Type product name..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setSupplierModalOpen(true)}
              title="Browse by supplier"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
            </AppButton>
          </div>
          {q.trim() && list.length > 0 && (
            <div className={uiCx('max-h-64 divide-y overflow-auto rounded border', uiBorders.subtle)}>
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelection(p)}
                  className={uiCx(
                    'w-full bg-white px-3 py-2 text-left hover:bg-gray-50',
                    selection?.id === p.id && 'ring-2 ring-brand-red ring-inset',
                  )}
                >
                  <div className="font-medium">{p.name}</div>
                  <div className={uiTypography.helper}>
                    {p.supplier_name || ''} · {p.unit || ''} · ${Number(p.price || 0).toFixed(2)}
                  </div>
                </button>
              ))}
              {hasMore && (
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full border-t"
                  onClick={() => setDisplayedCount((prev) => prev + 5)}
                >
                  Load more ({allResults.length - displayedCount} remaining)
                </AppButton>
              )}
            </div>
          )}
          {hasNoResults && (
            <div className={uiCx('rounded border bg-gray-50 p-4', uiBorders.subtle)}>
              <div className={uiCx(uiTypography.helper, 'mb-3')}>No products found matching &quot;{q}&quot;</div>
              <AppButton type="button" variant="secondary" size="sm" className="w-full" onClick={() => setNewProductModalOpen(true)}>
                + Create new product: &quot;{q}&quot;
              </AppButton>
            </div>
          )}
          {selection && (
            <div className={uiCx('space-y-2 rounded border bg-gray-50 p-3', uiBorders.subtle)}>
              <div className="flex items-start gap-3">
                <div className="relative h-24 w-24 shrink-0">
                  {selection.image_base64 ? (
                    <img
                      src={selection.image_base64.startsWith('data:') ? selection.image_base64 : `data:image/jpeg;base64,${selection.image_base64}`}
                      alt={selection.name}
                      className="h-full w-full rounded object-contain"
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
                    className={uiCx('h-full w-full rounded object-contain', selection.image_base64 ? 'hidden' : '')}
                    style={{ display: selection.image_base64 ? 'none' : 'block' }}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{selection.name}</div>
                    <AppButton type="button" variant="secondary" size="sm" onClick={() => setCompareModalOpen(true)}>
                      Compare
                    </AppButton>
                  </div>
                  <div className={uiTypography.helper}>Supplier: {selection.supplier_name || 'N/A'}</div>
                  <div className={uiTypography.helper}>
                    Unit: {selection.unit || '-'} · Price: ${Number(selection.price || 0).toFixed(2)}
                  </div>
                  {selection.unit_type === 'coverage' && (
                    <div className={uiTypography.helper}>
                      Coverage: {selection.coverage_sqs ? `${selection.coverage_sqs} SQS · ` : ''}
                      {selection.coverage_ft2 ? `${selection.coverage_ft2} ft² · ` : ''}
                      {selection.coverage_m2 ? `${selection.coverage_m2} m²` : ''}
                    </div>
                  )}
                  {selection.unit_type === 'multiple' && selection.units_per_package && (
                    <div className={uiTypography.helper}>{selection.units_per_package} units per package</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </AppFormModal>
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

  const handleSaveProduct = async () => {
    if (isSavingProduct) return;

    if (!name.trim()) {
      setNameError(true);
      toast.error('Name is required');
      return;
    }

    if (!newSupplier.trim()) {
      setSupplierError(true);
      toast.error('Supplier is required');
      return;
    }

    if (name.trim() && newSupplier) {
      try {
        const params = new URLSearchParams();
        params.set('q', name.trim());
        params.set('supplier', newSupplier);
        const duplicateCheck = await api<Material[]>('GET', `/estimate/products/search?${params.toString()}`);
        const duplicate = duplicateCheck.find(
          (p: Material) =>
            p.name.toLowerCase().trim() === name.toLowerCase().trim() &&
            p.supplier_name?.toLowerCase().trim() === newSupplier.toLowerCase().trim(),
        );
        if (duplicate) {
          setDuplicateError(true);
          toast.error(
            `A product with the name "${name.trim()}" already exists for supplier "${newSupplier}". Please use a different name or select a different supplier.`,
          );
          return;
        }
      } catch (e) {
        console.error('Error checking for duplicate:', e);
      }
    }

    const priceValue = parseCurrency(price);
    if (!priceValue || !priceValue.trim() || Number(priceValue) <= 0) {
      setPriceError(true);
      toast.error('Price is required');
      return;
    }

    try {
      setIsSavingProduct(true);
      const payload = {
        name: name.trim(),
        supplier_name: newSupplier || null,
        category: newCategory || null,
        unit: unit || null,
        price: Number(parseCurrency(price)),
        description: desc || null,
        unit_type: unitType,
        units_per_package: unitType === 'multiple' ? (unitsPerPackage ? Number(unitsPerPackage) : null) : null,
        coverage_sqs: unitType === 'coverage' ? (covSqs ? Number(covSqs) : null) : null,
        coverage_ft2: unitType === 'coverage' ? (covFt2 ? Number(covFt2) : null) : null,
        coverage_m2: unitType === 'coverage' ? (covM2 ? Number(covM2) : null) : null,
        image_base64: imageDataUrl || null,
        technical_manual_url: technicalManualUrl || null,
      };
      const created = await api<Material>('POST', '/estimate/products', payload);
      toast.success('Product created');
      onProductCreated(created);
    } catch (_e) {
      toast.error('Failed to create product');
    } finally {
      setIsSavingProduct(false);
    }
  };

  return (
    <>
      <AppFormModal
        open={open}
        onClose={onClose}
        title="New Product"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSavingProduct}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSaveProduct} disabled={isSavingProduct} loading={isSavingProduct}>
              {isSavingProduct ? 'Creating...' : 'Create Product'}
            </AppButton>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput
            className="col-span-2"
            label="Name *"
            value={name}
            error={
              nameError && !name.trim()
                ? 'This field is required'
                : duplicateError
                  ? `A product with this name already exists for supplier "${newSupplier}".`
                  : undefined
            }
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(false);
              if (duplicateError) setDuplicateError(false);
            }}
          />
          <div>
            <AppControlLabel label="Supplier *" />
            <div className="mt-1.5">
              <SupplierSelect
                value={newSupplier}
                onChange={(value) => {
                  setNewSupplier(value);
                  if (supplierError) setSupplierError(false);
                  if (duplicateError) setDuplicateError(false);
                }}
                onOpenNewSupplierModal={() => setNewSupplierModalOpen(true)}
                error={(supplierError && !newSupplier.trim()) || duplicateError}
                placeholder="Select a supplier"
              />
            </div>
            {supplierError && !newSupplier.trim() && (
              <div className="mt-1 text-[11px] text-red-600">This field is required</div>
            )}
          </div>
          <AppInput label="Category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <AppInput label="Sell Unit" placeholder="e.g., Roll, Pail (20L), Box" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <AppInput
            label="Price ($) *"
            placeholder="$0.00"
            value={priceFocused ? priceDisplay : price ? formatCurrency(price) : ''}
            error={priceError && (!price || !price.trim() || Number(parseCurrency(price)) <= 0) ? 'This field is required' : undefined}
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
            onChange={(e) => setPriceDisplay(e.target.value)}
          />
          <div className="col-span-2">
            <AppControlLabel label="Unit Type" />
            <div className="mt-1.5 flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="unit-type-quote" checked={unitType === 'unitary'} onChange={() => { setUnitType('unitary'); setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Unitary
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="unit-type-quote" checked={unitType === 'multiple'} onChange={() => { setUnitType('multiple'); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Multiple
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="unit-type-quote" checked={unitType === 'coverage'} onChange={() => { setUnitType('coverage'); setUnitsPerPackage(''); }} /> Coverage
              </label>
            </div>
          </div>
          {unitType === 'multiple' && (
            <AppInput
              className="col-span-2"
              label="Units per Package"
              type="number"
              step="0.01"
              value={unitsPerPackage}
              onChange={(e) => setUnitsPerPackage(e.target.value)}
            />
          )}
          {unitType === 'coverage' && (
            <div className="col-span-2">
              <AppControlLabel label="Coverage Area" />
              <div className="mt-1.5 flex items-center gap-2">
                <AppInput placeholder="0" value={covSqs} onChange={(e) => onCoverageChange('sqs', e.target.value)} />
                <span className={uiTypography.helper}>SQS</span>
                <span className="text-gray-400">=</span>
                <AppInput placeholder="0" value={covFt2} onChange={(e) => onCoverageChange('ft2', e.target.value)} />
                <span className={uiTypography.helper}>ft²</span>
                <span className="text-gray-400">=</span>
                <AppInput placeholder="0" value={covM2} onChange={(e) => onCoverageChange('m2', e.target.value)} />
                <span className={uiTypography.helper}>m²</span>
              </div>
            </div>
          )}
          <AppTextarea className="col-span-2" label="Description / Notes" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <AppInput
            className="col-span-2"
            label="Technical Manual URL"
            type="url"
            placeholder="https://supplier.com/manual/product"
            value={technicalManualUrl}
            onChange={(e) => setTechnicalManualUrl(e.target.value)}
          />
          <div className="col-span-2">
            <AppControlLabel label="Product Image" />
            <div className="mt-1.5 space-y-2">
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setImagePickerOpen(true)}>
                {imageDataUrl ? 'Change Image' : 'Select Image'}
              </AppButton>
              {imageDataUrl && (
                <div>
                  <img src={imageDataUrl} className={uiCx('h-32 w-32 rounded border object-contain', uiBorders.subtle)} alt="Preview" />
                  <AppButton type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setImageDataUrl('')}>
                    Remove Image
                  </AppButton>
                </div>
              )}
            </div>
          </div>
        </div>
      </AppFormModal>
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

  const supplierBody = (
    <div className="flex max-h-[70vh] flex-col overflow-hidden sm:flex-row">
      <div className={uiCx('w-full shrink-0 overflow-y-auto border-b bg-gray-50 sm:w-64 sm:border-b-0 sm:border-r', uiBorders.subtle)}>
        <div className="p-4">
          <div className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Suppliers</div>
          <div className="space-y-2">
            {(suppliers || []).map((supplier) => (
              <button
                key={supplier.id}
                type="button"
                onClick={() => setSelectedSupplier(supplier.id)}
                className={uiCx(
                  'w-full rounded px-3 py-2 text-left text-sm transition-colors',
                  selectedSupplier === supplier.id
                    ? 'bg-brand-red text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100',
                )}
              >
                {supplier.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        {!selectedSupplier ? (
          <div className="flex h-full items-center justify-center text-gray-500">Select a supplier to view products</div>
        ) : (
          <div>
            <div className={uiCx(uiTypography.sectionTitle, 'mb-4')}>
              Products from {suppliers?.find((s) => s.id === selectedSupplier)?.name || 'Supplier'}
            </div>
            {products && products.length > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setNewProductModalOpen(true)}
                    className={uiCx(
                      'flex min-h-[200px] flex-col items-center justify-center rounded-lg border-2 border-dashed bg-white p-3 text-center transition-all hover:border-brand-red hover:bg-gray-50',
                      uiBorders.subtle,
                    )}
                  >
                    <div className="mb-2 text-4xl text-gray-400">+</div>
                    <div className="text-sm font-medium text-gray-700">New Product</div>
                    <div className={uiCx(uiTypography.helper, 'mt-1')}>
                      Add new product to {suppliers?.find((s) => s.id === selectedSupplier)?.name || 'supplier'}
                    </div>
                  </button>
                  {products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => onSelect(product)}
                      className={uiCx(
                        'flex flex-col rounded-lg border bg-white p-3 text-left transition-all hover:border-brand-red hover:shadow-md',
                        uiBorders.subtle,
                      )}
                    >
                      <div className="relative mb-2 h-24 w-full">
                        {product.image_base64 ? (
                          <img
                            src={product.image_base64.startsWith('data:') ? product.image_base64 : `data:image/jpeg;base64,${product.image_base64}`}
                            alt={product.name}
                            className="h-full w-full rounded object-contain"
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
                          className={uiCx('h-full w-full rounded object-contain', product.image_base64 ? 'hidden' : '')}
                          style={{ display: product.image_base64 ? 'none' : 'block' }}
                        />
                      </div>
                      <div className="mb-1 line-clamp-2 text-sm font-medium">{product.name}</div>
                      {product.category && <div className={uiTypography.helper}>{product.category}</div>}
                      <div className="text-sm font-semibold text-brand-red">${Number(product.price || 0).toFixed(2)}</div>
                    </button>
                  ))}
                </div>
                {hasMoreProducts && (
                  <AppButton type="button" variant="secondary" size="sm" className="mt-4 w-full" onClick={() => setDisplayedProductCount((prev) => prev + 20)}>
                    Load more ({allProductsForSupplier.length - displayedProductCount} remaining)
                  </AppButton>
                )}
              </>
            ) : (
              <div className="py-8 text-center">
                <div className="mb-4 text-gray-500">No products found for this supplier</div>
                <AppButton type="button" variant="secondary" onClick={() => setNewProductModalOpen(true)}>
                  + New Product
                </AppButton>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <AppModal open={open} onClose={onClose} title="Browse Products by Supplier" size="xl">
        {supplierBody}
      </AppModal>
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
    <AppModal open={open} onClose={onClose} title="Compare Products" size="md">
      <div className="space-y-3">
        <div className={uiCx('rounded border bg-gray-50 p-3', uiBorders.subtle)}>
          <div className="mb-2 font-medium">Selected: {selectedProduct.name}</div>
          <div className={uiTypography.helper}>
            ${Number(selectedProduct.price || 0).toFixed(2)} · {selectedProduct.supplier_name || 'N/A'}
          </div>
        </div>
        {(similarProducts || []).length > 0 && (
          <div className="space-y-2">
            <div className={uiTypography.sectionTitle}>Similar Products</div>
            <div className={uiCx('max-h-64 divide-y overflow-auto rounded border', uiBorders.subtle)}>
              {(similarProducts || []).map((p) => (
                <button key={p.id} type="button" onClick={() => onSelect(p)} className="w-full bg-white px-3 py-2 text-left hover:bg-gray-50">
                  <div className="font-medium">{p.name}</div>
                  <div className={uiTypography.helper}>
                    {p.supplier_name || ''} · ${Number(p.price || 0).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppModal>
  );
}


