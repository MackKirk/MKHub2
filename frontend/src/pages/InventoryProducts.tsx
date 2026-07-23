import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import ImagePicker from '@/components/ImagePicker';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Package, Search, SlidersHorizontal } from 'lucide-react';
import SupplierSelect from '@/components/SupplierSelect';
import NewSupplierModal from '@/components/NewSupplierModal';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import LoadingOverlay from '@/components/LoadingOverlay';
import { inventoryNewProductQuickInfo, productDetailQuickInfo } from '@/lib/formModalQuickInfo';
import {
  canAccessProductList,
  canEditProductRecord,
  canReadProductTab,
  canWriteProductTab,
  type ProductTab,
} from '@/lib/productPermissions';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppControlLabelRow,
  AppEmptyState,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  AppTabs,
  AppTextarea,
  uiBorders,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Material = { id:number, name:string, supplier_name?:string, category?:string, unit?:string, price?:number, last_updated?:string, unit_type?:string, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number, description?:string, image_base64?:string, technical_manual_url?:string };

// Helper functions for currency formatting (CAD)
const formatCurrency = (value: string): string => {
  if (!value) return '';
  // Remove all non-numeric characters except decimal point
  const numericValue = value.replace(/[^0-9.]/g, '');
  if (!numericValue) return '';
  
  const num = parseFloat(numericValue);
  if (isNaN(num)) return numericValue; // Return raw if can't parse
  
  // Format with Canadian locale
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const parseCurrency = (value: string): string => {
  // Remove currency symbols and keep only numbers and decimal point
  const parsed = value.replace(/[^0-9.]/g, '');
  // Handle multiple decimal points - keep only the first one
  const parts = parsed.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }
  return parsed;
};

// Helper: Convert filter rules to URL parameters
function convertRulesToParams(rules: FilterRule[]): URLSearchParams {
  const params = new URLSearchParams();
  
  // Clear all potential conflicting parameters first
  params.delete('supplier');
  params.delete('supplier_not');
  params.delete('category');
  params.delete('category_not');
  params.delete('price_min');
  params.delete('price_max');
  params.delete('unit_type');
  params.delete('unit_type_not');
  
  for (const rule of rules) {
    if (!rule.value || (Array.isArray(rule.value) && (!rule.value[0] || !rule.value[1]))) {
      continue; // Skip empty rules
    }
    
    switch (rule.field) {
      case 'supplier':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('supplier', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('supplier_not', rule.value);
          }
        }
        break;
      
      case 'category':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('category', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('category_not', rule.value);
          }
        }
        break;
      
      case 'price':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'greater_than') {
            params.set('price_min', rule.value);
          } else if (rule.operator === 'less_than') {
            params.set('price_max', rule.value);
          } else if (rule.operator === 'is_equal_to') {
            params.set('price_min', rule.value);
            params.set('price_max', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'between') {
          params.set('price_min', rule.value[0]);
          params.set('price_max', rule.value[1]);
        }
        break;
      
      case 'unit_type':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('unit_type', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('unit_type_not', rule.value);
          }
        }
        break;
    }
  }
  
  return params;
}

// Helper: Convert URL parameters to filter rules
function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;
  
  // Supplier
  const supplier = params.get('supplier');
  const supplierNot = params.get('supplier_not');
  if (supplier) {
    rules.push({ id: `rule-${idCounter++}`, field: 'supplier', operator: 'is', value: supplier });
  } else if (supplierNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'supplier', operator: 'is_not', value: supplierNot });
  }
  
  // Category
  const category = params.get('category');
  const categoryNot = params.get('category_not');
  if (category) {
    rules.push({ id: `rule-${idCounter++}`, field: 'category', operator: 'is', value: category });
  } else if (categoryNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'category', operator: 'is_not', value: categoryNot });
  }
  
  // Price range
  const priceMin = params.get('price_min');
  const priceMax = params.get('price_max');
  if (priceMin && priceMax) {
    if (priceMin === priceMax) {
      rules.push({ id: `rule-${idCounter++}`, field: 'price', operator: 'is_equal_to', value: priceMin });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'price', operator: 'between', value: [priceMin, priceMax] });
    }
  } else if (priceMin) {
    rules.push({ id: `rule-${idCounter++}`, field: 'price', operator: 'greater_than', value: priceMin });
  } else if (priceMax) {
    rules.push({ id: `rule-${idCounter++}`, field: 'price', operator: 'less_than', value: priceMax });
  }
  
  // Unit Type
  const unitType = params.get('unit_type');
  const unitTypeNot = params.get('unit_type_not');
  if (unitType) {
    rules.push({ id: `rule-${idCounter++}`, field: 'unit_type', operator: 'is', value: unitType });
  } else if (unitTypeNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'unit_type', operator: 'is_not', value: unitTypeNot });
  }
  
  return rules;
}

export default function InventoryProducts(){
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const canViewProducts = canAccessProductList(isAdmin, permissions);
  const canEditProducts = canEditProductRecord(isAdmin, permissions);
  const canEditProductDetails = canWriteProductTab(isAdmin, permissions, 'details');
  const canEditProductRelated = canWriteProductTab(isAdmin, permissions, 'related');
  const [q, setQ] = useState('');
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const hasLoadedDataRef = useRef(false);

  // Get current date formatted (same as Dashboard)


  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!meLoading && me !== undefined && !canViewProducts) {
      toast.error('You do not have permission to view products');
      navigate('/home');
    }
  }, [meLoading, me, canViewProducts, navigate]);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  
  // Get filter params from URL
  const [searchParams, setSearchParams] = useState(() => {
    const params = new URLSearchParams();
    // Initialize from current URL if available
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.forEach((value, key) => {
        if (key !== 'q') params.set(key, value);
      });
    }
    return params;
  });
  
  // Convert current URL params to rules for modal
  const currentRules = useMemo(() => {
    return convertParamsToRules(searchParams);
  }, [searchParams]);
  
  // Build query params from searchParams
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    searchParams.forEach((value, key) => {
      if (key !== 'q') params.set(key, value);
    });
    return params;
  }, [q, searchParams]);
  
  const { data, refetch, isLoading, isFetching } = useQuery({
    queryKey:['estimateProducts', queryParams.toString()],
    queryFn: async ()=>{
      const path = queryParams.toString()? `/estimate/products/search?${queryParams.toString()}` : '/estimate/products';
      return await api<Material[]>('GET', path);
    }
  });

  // Auto-apply filters when they change
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams]);
  const rawRows = data||[];
  const suppliers = useMemo(()=> Array.from(new Set(rawRows.map(r=> r.supplier_name||'').filter(Boolean))), [rawRows]);
  const categories = useMemo(()=> Array.from(new Set(rawRows.map(r=> r.category||'').filter(Boolean))), [rawRows]);
  
  // Get all suppliers from API for filter options
  const { data: supplierOptions } = useQuery({ 
    queryKey:['invSuppliersOptions'], 
    queryFn: ()=> api<any[]>('GET','/inventory/suppliers') 
  });
  
  // Filter Builder Configuration
  const filterFields: FieldConfig[] = useMemo(() => [
    {
      id: 'supplier',
      label: 'Supplier',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => {
        // Use supplier names from current data, or from API
        const supplierNames = suppliers.length > 0 ? suppliers : (supplierOptions?.map((s: any) => s.name) || []);
        return supplierNames.map((name: string) => ({ value: name, label: name }));
      },
    },
    {
      id: 'category',
      label: 'Category',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => categories.map((cat: string) => ({ value: cat, label: cat })),
    },
    {
      id: 'price',
      label: 'Price',
      type: 'number',
      operators: ['greater_than', 'less_than', 'is_equal_to', 'between'],
    },
    {
      id: 'unit_type',
      label: 'Unit Type',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => [
        { value: 'unitary', label: 'Unitary' },
        { value: 'multiple', label: 'Multiple' },
        { value: 'coverage', label: 'Coverage' },
      ],
    },
  ], [suppliers, categories, supplierOptions]);

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    if (q) params.set('q', q);
    setSearchParams(params);
    refetch();
  };

  const hasActiveFilters = currentRules.length > 0;

  // Helper to format rule value for display
  const formatRuleValue = (rule: FilterRule): string => {
    if (rule.field === 'supplier') {
      return String(rule.value);
    }
    if (rule.field === 'category') {
      return String(rule.value);
    }
    if (rule.field === 'price') {
      if (Array.isArray(rule.value)) {
        return `$${Number(rule.value[0]).toLocaleString()} → $${Number(rule.value[1]).toLocaleString()}`;
      }
      return `$${Number(rule.value).toLocaleString()}`;
    }
    if (rule.field === 'unit_type') {
      const labels: Record<string, string> = {
        'unitary': 'Unitary',
        'multiple': 'Multiple',
        'coverage': 'Coverage',
      };
      return labels[String(rule.value)] || String(rule.value);
    }
    return String(rule.value);
  };

  // Helper to get field label
  const getFieldLabel = (fieldId: string): string => {
    const field = filterFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const sortedRows = useMemo(() => {
    const sorted = [...rawRows];
    
    sorted.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof Material];
      let bVal: any = b[sortColumn as keyof Material];
      
      // Convert to string for comparison
      aVal = aVal?.toString() || '';
      bVal = bVal?.toString() || '';
      
      // Primary sort
      let comparison = aVal.localeCompare(bVal);
      
      // If equal, secondary sort by name
      if (comparison === 0) {
        const aName = a.name?.toString() || '';
        const bName = b.name?.toString() || '';
        comparison = aName.localeCompare(bName);
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [rawRows, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const rows = sortedRows;

  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Material|null>(null);
  const [editing, setEditing] = useState<Material|null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
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

  const [relatedList, setRelatedList] = useState<any[]>([]);
  const [addRelatedOpen, setAddRelatedOpen] = useState(false);
  const [addRelatedTarget, setAddRelatedTarget] = useState<number|null>(null);
  const [addRelatedSearch, setAddRelatedSearch] = useState('');
  const [addRelatedResults, setAddRelatedResults] = useState<any[]>([]);
  const [relatedCounts, setRelatedCounts] = useState<Record<number, number>>({});
  const [productTab, setProductTab] = useState<'details'|'usage'|'related'>('details');
  const [productUsage, setProductUsage] = useState<any[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const qc = useQueryClient();
  const productIds = useMemo(()=> rows.map(p=> p.id).join(','), [rows]);
  const { data: relCounts } = useQuery({ queryKey:['related-counts', productIds], queryFn: async()=> productIds? await api<Record<string, number>>('GET', `/estimate/related/count?ids=${productIds}`) : {}, enabled: !!productIds });
  useEffect(()=> { if(relCounts) setRelatedCounts(relCounts); }, [relCounts]);

  const onCoverageChange = (which: 'sqs'|'ft2'|'m2', val: string)=>{
    if(!val){ setCovSqs(''); setCovFt2(''); setCovM2(''); return; }
    const num = Number(val);
    if(Number.isNaN(num)){ return; }
    const SQS_TO_FT2 = 100;
    const FT2_TO_M2 = 0.09290304;
    if(which==='sqs'){
      const ft2 = num * SQS_TO_FT2;
      const m2 = ft2 * FT2_TO_M2;
      // Preserve decimals: allow up to 2 decimal places for all fields
      setCovSqs(String(num)); 
      setCovFt2(String(Number(ft2.toFixed(2)))); 
      setCovM2(String(Number(m2.toFixed(2))));
    }else if(which==='ft2'){
      const sqs = num / SQS_TO_FT2;
      const m2 = num * FT2_TO_M2;
      // Preserve decimals: allow up to 2 decimal places for all fields
      setCovSqs(String(Number(sqs.toFixed(2)))); 
      setCovFt2(String(num)); 
      setCovM2(String(Number(m2.toFixed(2))));
    }else{
      const ft2 = num / FT2_TO_M2;
      const sqs = ft2 / SQS_TO_FT2;
      // Preserve decimals: allow up to 2 decimal places for all fields
      setCovSqs(String(Number(sqs.toFixed(2)))); 
      setCovFt2(String(Number(ft2.toFixed(2)))); 
      setCovM2(String(num));
    }
  };

  const onFileChange = async (f: File|null)=>{
    if(!f){ setImageDataUrl(''); return; }
    const reader = new FileReader();
    reader.onload = ()=> setImageDataUrl(String(reader.result||''));
    reader.readAsDataURL(f);
  };

  const handleImagePickerConfirm = async (blob: Blob) => {
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result || ''));
      setImagePickerOpen(false);
    };
    reader.readAsDataURL(blob);
  };

  const openViewModal = (p: Material) => {
    setViewing(p);
    setOpen(true);
    setProductTab('details');
    setProductUsage([]);
    setRelatedList([]);
    // Load usage data when opening modal
    if (p.id) {
      loadProductUsage(p.id);
    }
  };

  const loadProductUsage = async (productId: number) => {
    setLoadingUsage(true);
    try {
      const usage = await api<any[]>('GET', `/estimate/products/${productId}/usage`);
      setProductUsage(usage || []);
    } catch (e) {
      console.error('Failed to load product usage:', e);
      setProductUsage([]);
    } finally {
      setLoadingUsage(false);
    }
  };

  const openEditModal = () => {
    if (!viewing) return;
    setEditing(viewing);
    setName(viewing.name);
    setNameError(false);
    setNewSupplier(viewing.supplier_name||'');
    setNewCategory(viewing.category||'');
    setUnit(viewing.unit||'');
    setPrice(viewing.price?.toString()||'');
    setPriceDisplay(viewing.price?.toString()||'');
    setPriceFocused(false);
    setPriceError(false);
    setDesc(viewing.description||'');
    setUnitType((viewing.unit_type as any)||'unitary');
    setUnitsPerPackage(viewing.units_per_package?.toString()||'');
    setCovSqs(viewing.coverage_sqs?.toString()||'');
    setCovFt2(viewing.coverage_ft2?.toString()||'');
    setCovM2(viewing.coverage_m2?.toString()||'');
    setImageDataUrl(viewing.image_base64||'');
    setTechnicalManualUrl(viewing.technical_manual_url||'');
    setViewing(null);
  };

  // Legacy handleEdit - not used anymore, keeping for compatibility
  const handleEdit = (p: Material)=>{
    openViewModal(p);
    openEditModal();
  };

  const handleDelete = async (id: number)=>{
    const ok = await confirm({ 
      title: 'Delete product', 
      message: 'Are you sure you want to delete this product? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    try{
      await api('DELETE', `/estimate/products/${id}`);
      toast.success('Deleted');
      resetModal(); // Close modal after deletion
      await queryClient.invalidateQueries({ queryKey: ['estimateProducts'] });
      await refetch();
    }catch(e: any){ 
      const errorMessage = e?.message || 'Failed to delete product';
      toast.error(errorMessage);
    }
  };

  const handleViewRelated = async (id: number)=>{ 
    try{
      const rels = await api<any[]>('GET', `/estimate/related/${id}`);
      setRelatedList(rels);
    }catch(_e){ toast.error('Failed to load related'); }
  };

  const handleAddRelated = async (targetId: number)=>{
    setAddRelatedTarget(targetId);
    setAddRelatedOpen(true);
    setAddRelatedSearch('');
    setAddRelatedResults([]);
  };

  const resetModal = ()=>{  
    setEditing(null);
    setViewing(null);
    setOpen(false);
    setName(''); setNameError(false); setNewSupplier(''); setSupplierError(false); setNewCategory(''); setUnit(''); setPrice(''); setPriceDisplay(''); setPriceFocused(false); setPriceError(false); setDesc('');
    setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); setUnitType('unitary');     setImageDataUrl('');
    setTechnicalManualUrl(''); setImagePickerOpen(false);
    setProductTab('details');
    setProductUsage([]);
    setRelatedList([]);
  };

  const searchRelatedProducts = async (txt: string)=>{
    setAddRelatedSearch(txt);
    // Auto-complete search as user types
    try{
      const params = new URLSearchParams();
      if(txt.trim()){ params.set('q', txt); }
      const results = await api<any[]>('GET', `/estimate/products/search?${params.toString()}`);
      // Filter out the current product and products already related
      const filtered = results.filter(r=> r.id !== addRelatedTarget && r.id !== viewing?.id);
      setAddRelatedResults(filtered);
    }catch(_e){ setAddRelatedResults([]); }
  };

  const createRelation = async (productA: number, productB: number)=>{
    try{
      await api('POST', `/estimate/related/${productA}`, { related_id: productB });
      toast.success('Relation created');
      setAddRelatedOpen(false);
      // Update the current viewing product's related list
      if(viewing){
        const updatedRels = await api<any[]>('GET', `/estimate/related/${viewing.id}`);
        setRelatedList(updatedRels);
        // Update related counts
        const counts = await api<Record<string, number>>('GET', `/estimate/related/count?ids=${productIds}`);
        if(counts) setRelatedCounts(counts);
      }
      await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  const deleteRelation = async (a: number, b: number)=>{
    const ok = await confirm({ 
      title: 'Remove relation', 
      message: 'Are you sure you want to remove this relation between products?',
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    try{
      await api('DELETE', `/estimate/related/${a}/${b}`);
      toast.success('Relation removed');
      // Update related counts
      const counts = await api<Record<string, number>>('GET', `/estimate/related/count?ids=${productIds}`);
      if(counts) setRelatedCounts(counts);
      // Reload the related list if viewing
      if(viewing) handleViewRelated(viewing.id);
      await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  // Track if we've loaded data at least once
  useEffect(() => {
    if (data) {
      hasLoadedDataRef.current = true;
    }
  }, [data]);

  // Check if we're still loading initial data (only show overlay if no data yet and we haven't loaded before)
  const isInitialLoading = (isLoading && !data) && !hasLoadedDataRef.current;

  // Track when animation completes to remove inline styles for hover to work
  useEffect(() => {
    if (hasAnimated) {
      const timer = setTimeout(() => setAnimationComplete(true), 400);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated]);

  // Track when initial data is loaded to trigger entry animations
  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, hasAnimated]);

  const productTabItems = useMemo(() => {
    const items = [
      { key: 'details', label: 'Details' },
      { key: 'usage', label: productUsage.length > 0 ? `Usage (${productUsage.length})` : 'Usage' },
    ];
    if (viewing) {
      const count = relatedCounts[viewing.id];
      items.push({ key: 'related', label: count ? `Related (${count})` : 'Related' });
    }
    return items.filter((t) => canReadProductTab(isAdmin, permissions, t.key as ProductTab));
  }, [isAdmin, permissions, viewing, productUsage.length, relatedCounts]);

  useEffect(() => {
    if (productTabItems.length === 0) return;
    if (!productTabItems.some((t) => t.key === productTab)) {
      setProductTab(productTabItems[0].key as typeof productTab);
    }
  }, [productTabItems, productTab]);

  const listCardAnimClass = animationComplete
    ? undefined
    : uiCx(
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]',
      );

  const closeProductModal = () => resetModal();

  const handleProductModalClose = () => {
    if (editing) {
      setViewing(editing);
      setEditing(null);
      setName('');
      setNameError(false);
      setNewSupplier('');
      setSupplierError(false);
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
    } else {
      closeProductModal();
    }
  };

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
        supplier_name: newSupplier.trim(),
        category: newCategory || null,
        unit: unit || null,
        price: Number(parseCurrency(price)),
        description: desc || null,
        unit_type: unitType,
        units_per_package:
          unitType === 'multiple' ? (unitsPerPackage ? Number(unitsPerPackage) : null) : null,
        coverage_sqs: unitType === 'coverage' ? (covSqs ? Number(covSqs) : null) : null,
        coverage_ft2: unitType === 'coverage' ? (covFt2 ? Number(covFt2) : null) : null,
        coverage_m2: unitType === 'coverage' ? (covM2 ? Number(covM2) : null) : null,
        image_base64: imageDataUrl || null,
        technical_manual_url: technicalManualUrl || null,
      };
      if (editing) {
        await api('PUT', `/estimate/products/${editing.id}`, payload);
        toast.success('Updated');
      } else {
        await api('POST', '/estimate/products', payload);
        toast.success('Created');
      }
      resetModal();
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    } finally {
      setIsSavingProduct(false);
    }
  };

  // Don't render if still loading or user doesn't have permission
  if (meLoading || !canViewProducts) {
    return null;
  }

  const showEmptyList = !isLoading && rows.length === 0;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Products"
        subtitle="Catalog of materials and pricing"
        icon={<Package className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by product name, supplier, or category..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search products"
            />
          </div>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<SlidersHorizontal className="h-4 w-4" />}
            onClick={() => setIsFilterModalOpen(true)}
          >
            Filters
          </AppButton>
          {hasActiveFilters && (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ('');
                setSearchParams(new URLSearchParams());
                refetch();
              }}
            >
              Clear Filters
            </AppButton>
          )}
        </div>
      </AppCard>

      {/* Filter Chips */}
      {hasActiveFilters && (
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
          {currentRules.map((rule) => (
            <FilterChip
              key={rule.id}
              rule={rule}
              onRemove={() => {
                const updatedRules = currentRules.filter(r => r.id !== rule.id);
                const params = convertRulesToParams(updatedRules);
                if (q) params.set('q', q);
                setSearchParams(params);
                refetch();
              }}
              getValueLabel={formatRuleValue}
              getFieldLabel={getFieldLabel}
            />
          ))}
        </div>
      )}

      <LoadingOverlay isLoading={isInitialLoading} text="Loading products...">
        <AppCard className={uiCx(uiShadows.card, listCardAnimClass)} bodyClassName={uiSpacing.cardPadding}>
          {isLoading ? (
            <div className={uiCx(uiTypography.helper, 'py-8 text-center')}>Loading products...</div>
          ) : showEmptyList ? (
            <div className={uiCx(uiSpacing.sectionStack, 'min-h-[12rem]')}>
              {canEditProducts ? (
                <AppListCreateItem
                  label="New Product"
                  layout="card"
                  className="min-h-[200px] w-full flex-col items-center justify-center"
                  onClick={() => {
                    resetModal();
                    setOpen(true);
                  }}
                />
              ) : null}
              <AppEmptyState
                title="No products found"
                className="border-0 bg-transparent p-0 shadow-none"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
              {canEditProducts && (
                <AppListCreateItem
                  label="New Product"
                  layout="card"
                  className="min-h-[200px] w-full flex-col items-center justify-center"
                  onClick={() => {
                    resetModal();
                    setOpen(true);
                  }}
                />
              )}
              {rows.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openViewModal(p)}
                  className={uiCx(
                    uiBorders.subtle,
                    uiRadius.control,
                    'flex flex-col border bg-white p-3 text-left transition-all hover:border-brand-red hover:bg-gray-50/50',
                  )}
                >
                  <div className="relative mb-2 h-24 w-full">
                    {p.image_base64 ? (
                      <img
                        src={
                          p.image_base64.startsWith('data:')
                            ? p.image_base64
                            : `data:image/jpeg;base64,${p.image_base64}`
                        }
                        alt={p.name}
                        className="h-full w-full rounded object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const placeholder = (e.target as HTMLImageElement)
                            .nextElementSibling as HTMLElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <img
                      src="/ui/assets/image placeholders/no_image.png"
                      alt="No image"
                      className={uiCx(
                        'h-full w-full rounded object-contain',
                        p.image_base64 ? 'hidden' : '',
                      )}
                      style={{ display: p.image_base64 ? 'none' : 'block' }}
                    />
                  </div>
                  <div className={uiCx(uiTypography.sectionTitle, 'mb-1 line-clamp-2')}>{p.name}</div>
                  {p.supplier_name && (
                    <div className={uiCx(uiTypography.helper, 'mb-1')}>Supplier: {p.supplier_name}</div>
                  )}
                  {p.category && (
                    <div className={uiCx(uiTypography.helper, 'mb-1')}>Category: {p.category}</div>
                  )}
                  <div className={uiCx(uiTypography.body, 'mt-auto font-semibold text-brand-red')}>
                    {typeof p.price === 'number' ? `$${Number(p.price || 0).toFixed(2)}` : '—'}
                  </div>
                  {p.unit && <div className={uiTypography.helper}>Unit: {p.unit}</div>}
                </button>
              ))}
            </div>
          )}
        </AppCard>
      </LoadingOverlay>

      <AppFormModal
        open={open}
        onClose={handleProductModalClose}
        layout={viewing && !editing ? 'detail' : 'form'}
        formWidth="wide"
        title={
          viewing && !editing
            ? 'Product Information'
            : editing
              ? 'Edit Product'
              : 'New Product'
        }
        description={
          viewing && !editing
            ? `${viewing.name} — pricing, usage, and related items`
            : editing
              ? 'Update product information'
              : 'Add a new product to your inventory'
        }
        quickInfo={
          viewing && !editing
            ? productDetailQuickInfo(canEditProductDetails)
            : !editing
              ? inventoryNewProductQuickInfo
              : undefined
        }
        bodyClassName={viewing && !editing ? uiCx(uiSpacing.cardPadding, 'min-w-0') : undefined}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            {viewing && !editing ? (
              <>
                <AppButton type="button" variant="secondary" size="sm" onClick={closeProductModal}>
                  Close
                </AppButton>
                {canEditProductDetails ? (
                  <AppButton type="button" size="sm" onClick={openEditModal}>
                    Edit
                  </AppButton>
                ) : null}
              </>
            ) : (
              <>
                <AppButton type="button" variant="secondary" size="sm" onClick={handleProductModalClose}>
                  Cancel
                </AppButton>
                <AppButton
                  type="button"
                  size="sm"
                  disabled={isSavingProduct}
                  loading={isSavingProduct}
                  onClick={handleSaveProduct}
                >
                  {isSavingProduct ? (editing ? 'Updating...' : 'Creating...') : editing ? 'Update' : 'Create'}
                </AppButton>
              </>
            )}
          </div>
        }
      >
        {viewing && !editing ? (
          <div className={uiSpacing.sectionStack}>
            <div className={uiCx(uiLayout.actionsRow, 'items-start gap-4')}>
              <img
                src={viewing.image_base64 || '/ui/assets/placeholders/product.png'}
                className={uiCx('h-16 w-16 shrink-0 object-cover border', uiRadius.control, uiBorders.subtle)}
                alt={viewing.name}
              />
              <div className="min-w-0 flex-1">
                <h2 className={uiTypography.sectionTitle}>{viewing.name}</h2>
                <div className={uiCx(uiLayout.actionsRow, 'mt-1 flex-wrap gap-3', uiTypography.helper)}>
                  {viewing.supplier_name && <span>{viewing.supplier_name}</span>}
                  {viewing.category && <span>{viewing.category}</span>}
                </div>
              </div>
            </div>

            <AppTabs
              tabs={productTabItems}
              value={productTab}
              onChange={(key) => {
                setProductTab(key as typeof productTab);
                if (key === 'related' && viewing?.id && relatedList.length === 0) {
                  handleViewRelated(viewing.id);
                }
              }}
            />

            {productTab === 'details' ? (
              <div className={uiSpacing.sectionStack}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {viewing.unit && (
                    <AppCard bodyClassName={uiSpacing.cardPadding}>
                      <div className={uiTypography.overline}>Sell Unit</div>
                      <div className={uiTypography.body}>{viewing.unit}</div>
                    </AppCard>
                  )}
                  {viewing.unit_type && (
                    <AppCard bodyClassName={uiSpacing.cardPadding}>
                      <div className={uiTypography.overline}>Unit Type</div>
                      <div className={uiTypography.body}>{viewing.unit_type}</div>
                    </AppCard>
                  )}
                </div>
                {typeof viewing.price === 'number' && (
                  <AppCard bodyClassName={uiSpacing.cardPadding}>
                    <div className={uiTypography.overline}>Price</div>
                    <div className={uiCx(uiTypography.body, 'font-semibold')}>${viewing.price.toFixed(2)}</div>
                  </AppCard>
                )}
                {viewing.units_per_package && (
                  <AppCard bodyClassName={uiSpacing.cardPadding}>
                    <div className={uiTypography.overline}>Units per Package</div>
                    <div className={uiTypography.body}>{viewing.units_per_package}</div>
                  </AppCard>
                )}
                {(viewing.coverage_sqs || viewing.coverage_ft2 || viewing.coverage_m2) && (
                  <AppCard bodyClassName={uiSpacing.cardPadding}>
                    <div className={uiTypography.overline}>Coverage Area</div>
                    <div className={uiCx('grid grid-cols-3 gap-2', uiTypography.body)}>
                      <div>SQS: {viewing.coverage_sqs || '-'}</div>
                      <div>ft²: {viewing.coverage_ft2 || '-'}</div>
                      <div>m²: {viewing.coverage_m2 || '-'}</div>
                    </div>
                  </AppCard>
                )}
                {viewing.description && (
                  <AppCard bodyClassName={uiSpacing.cardPadding}>
                    <div className={uiTypography.overline}>Description</div>
                    <div className={uiCx(uiTypography.body, 'whitespace-pre-wrap')}>{viewing.description}</div>
                  </AppCard>
                )}
                {viewing.technical_manual_url &&
                  (() => {
                    const url = viewing.technical_manual_url.trim();
                    const absoluteUrl = url.match(/^https?:\/\//i) ? url : `https://${url}`;
                    return (
                      <AppCard bodyClassName={uiSpacing.cardPadding}>
                        <div className={uiCx(uiLayout.actionsRow, 'items-center justify-between gap-3')}>
                          <div className={uiTypography.overline}>Technical Manual</div>
                          <AppButton
                            type="button"
                            size="sm"
                            leftIcon={<ExternalLink className="h-4 w-4" />}
                            onClick={() => {
                              if (absoluteUrl && absoluteUrl !== 'https://') {
                                window.open(absoluteUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            View Manual
                          </AppButton>
                        </div>
                      </AppCard>
                    );
                  })()}
              </div>
            ) : productTab === 'usage' ? (
              <AppCard bodyClassName={uiSpacing.cardPadding}>
                {loadingUsage ? (
                  <div className={uiCx(uiTypography.helper, 'py-8 text-center')}>Loading usage data...</div>
                ) : productUsage.length === 0 ? (
                  <AppEmptyState
                    title="This product is not being used in any estimates."
                    className="border-0 bg-transparent p-0 shadow-none"
                  />
                ) : (
                  <div className={uiSpacing.sectionStack}>
                    <p className={uiTypography.helper}>
                      This product is being used in {productUsage.length} estimate
                      {productUsage.length !== 1 ? 's' : ''}:
                    </p>
                    <div className={uiCx(uiBorders.subtle, uiRadius.control, 'divide-y overflow-hidden border')}>
                      {productUsage.map((usage, idx) => (
                        <div key={idx} className="p-3 hover:bg-gray-50">
                          {usage.status === 'orphaned' ? (
                            <div className={uiCx(uiLayout.actionsRow, 'items-center justify-between gap-3')}>
                              <div>
                                <div className={uiTypography.sectionTitle}>Orphaned Estimate</div>
                                <div className={uiTypography.helper}>
                                  Estimate #{usage.estimate_id} (deleted)
                                </div>
                              </div>
                              <AppBadge variant="warning">Orphaned</AppBadge>
                            </div>
                          ) : usage.status === 'project_deleted' || usage.project_deleted ? (
                            <div className={uiCx(uiLayout.actionsRow, 'items-center justify-between gap-3')}>
                              <div className="min-w-0 flex-1">
                                <div className={uiTypography.sectionTitle}>
                                  {usage.project_name || 'Project Deleted'}
                                </div>
                                <div className={uiTypography.helper}>
                                  Estimate #{usage.estimate_id} - Project was deleted
                                </div>
                                {usage.created_at && (
                                  <div className={uiCx(uiTypography.helper, 'mt-1 text-gray-400')}>
                                    Created: {new Date(usage.created_at).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                              <AppBadge variant="danger">Project Deleted</AppBadge>
                            </div>
                          ) : (
                            <div className={uiCx(uiLayout.actionsRow, 'items-center justify-between gap-3')}>
                              <div className="min-w-0 flex-1">
                                {usage.project_name ? (
                                  <>
                                    <div className={uiTypography.sectionTitle}>{usage.project_name}</div>
                                    {usage.client_name && (
                                      <div className={uiTypography.helper}>Client: {usage.client_name}</div>
                                    )}
                                    {usage.created_at && (
                                      <div className={uiCx(uiTypography.helper, 'mt-1 text-gray-400')}>
                                        Created: {new Date(usage.created_at).toLocaleDateString()}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className={uiTypography.helper}>No project associated</div>
                                )}
                              </div>
                              {usage.project_id && !usage.project_deleted && (
                                <AppButton
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    navigate(`/projects/${usage.project_id}`);
                                    resetModal();
                                  }}
                                >
                                  View Project
                                </AppButton>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AppCard>
            ) : productTab === 'related' && viewing ? (
              <AppCard bodyClassName={uiSpacing.cardPadding}>
                {Array.isArray(relatedList) && relatedList.length ? (
                  <div className={uiSpacing.sectionStack}>
                    <p className={uiTypography.helper}>
                      This product is related to {relatedList.length} product
                      {relatedList.length !== 1 ? 's' : ''}:
                    </p>
                    <div className={uiCx(uiBorders.subtle, uiRadius.control, 'divide-y overflow-hidden border')}>
                      {relatedList.map((r: any, i: number) => (
                        <div key={i} className={uiCx(uiLayout.actionsRow, 'gap-3 p-3 hover:bg-gray-50')}>
                          <img
                            src={r.image_base64 || '/ui/assets/placeholders/product.png'}
                            className={uiCx('h-12 w-12 shrink-0 object-cover border', uiRadius.control)}
                            alt={r.name}
                          />
                          <div className="min-w-0 flex-1">
                            <div className={uiTypography.sectionTitle}>{r.name}</div>
                            {r.supplier_name && (
                              <div className={uiTypography.helper}>Supplier: {r.supplier_name}</div>
                            )}
                            {typeof r.price === 'number' && (
                              <div className={uiCx(uiTypography.body, 'mt-0.5 font-semibold text-brand-red')}>
                                ${r.price.toFixed(2)}
                              </div>
                            )}
                          </div>
                          {canEditProductRelated && (
                            <AppButton
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => deleteRelation(viewing.id, r.id)}
                            >
                              Remove
                            </AppButton>
                          )}
                        </div>
                      ))}
                    </div>
                    {canEditProductRelated && (
                      <AppButton type="button" size="sm" onClick={() => handleAddRelated(viewing.id)}>
                        + Add Related Product
                      </AppButton>
                    )}
                  </div>
                ) : (
                  <div className={uiCx(uiSpacing.sectionStack, 'items-center py-6 text-center')}>
                    <AppEmptyState
                      title="This product has no related products."
                      className="border-0 bg-transparent p-0 shadow-none"
                    />
                    {canEditProductRelated && (
                      <AppButton type="button" size="sm" onClick={() => handleAddRelated(viewing.id)}>
                        + Add Related Product
                      </AppButton>
                    )}
                  </div>
                )}
              </AppCard>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppInput
              className="sm:col-span-2"
              label={
                <>
                  Name <span className="text-red-600">*</span>
                </>
              }
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(false);
              }}
              error={nameError && !name.trim() ? 'This field is required' : undefined}
              fieldHint="Name\n\nProduct name as shown in estimates and the catalog."
            />
            <div className="space-y-1.5">
              <AppControlLabelRow
                label={
                  <>
                    Supplier <span className="text-red-600">*</span>
                  </>
                }
                fieldHint={
                  <AppFieldHint hint="Supplier *\n\nVendor that supplies this product. Use + New Supplier if missing." />
                }
              />
              <SupplierSelect
                value={newSupplier}
                onChange={(value) => {
                  setNewSupplier(value);
                  if (supplierError) setSupplierError(false);
                }}
                onOpenNewSupplierModal={() => setNewSupplierModalOpen(true)}
                error={supplierError && !newSupplier.trim()}
                placeholder="Select a supplier"
                className="[&_button]:text-sm"
              />
              {supplierError && !newSupplier.trim() && (
                <p className="text-[11px] text-red-600">This field is required</p>
              )}
            </div>
            <AppInput
              label="Category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              fieldHint="Category\n\nOptional grouping (e.g. lumber, fasteners)."
            />
            <AppInput
              label="Sell Unit"
              placeholder="e.g., Roll, Pail (20L), Box"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              fieldHint="Sell Unit\n\nHow this item is sold (roll, box, each, etc.)."
            />
            <AppInput
              label={
                <>
                  Price ($) <span className="text-red-600">*</span>
                </>
              }
              placeholder="$0.00"
              value={priceFocused ? priceDisplay : price ? formatCurrency(price) : ''}
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
              error={
                priceError && (!price || !price.trim() || Number(parseCurrency(price)) <= 0)
                  ? 'This field is required'
                  : undefined
              }
              fieldHint="Price ($)\n\nUnit price in CAD used on estimates."
            />
            <div className="sm:col-span-2 space-y-1.5">
              <AppControlLabelRow
                label="Unit Type"
                fieldHint={
                  <AppFieldHint hint="Unit Type\n\nUnitary = single item; Multiple = sold in packages; Coverage = area-based (SQS, ft², m²)." />
                }
              />
              <div className="mt-1 flex flex-wrap items-center gap-6">
                <AppCheckbox
                  label="Unitary"
                  checked={unitType === 'unitary'}
                  onChange={(checked) => {
                    if (!checked) return;
                    setUnitType('unitary');
                    setUnitsPerPackage('');
                    setCovSqs('');
                    setCovFt2('');
                    setCovM2('');
                  }}
                />
                <AppCheckbox
                  label="Multiple"
                  checked={unitType === 'multiple'}
                  onChange={(checked) => {
                    if (!checked) return;
                    setUnitType('multiple');
                    setCovSqs('');
                    setCovFt2('');
                    setCovM2('');
                  }}
                />
                <AppCheckbox
                  label="Coverage"
                  checked={unitType === 'coverage'}
                  onChange={(checked) => {
                    if (!checked) return;
                    setUnitType('coverage');
                    setUnitsPerPackage('');
                  }}
                />
              </div>
            </div>
            {unitType === 'multiple' && (
              <AppInput
                className="sm:col-span-2"
                label="Units per Package"
                type="number"
                step="0.01"
                value={unitsPerPackage}
                onChange={(e) => setUnitsPerPackage(e.target.value)}
                fieldHint="Units per Package\n\nHow many units are included in one package."
              />
            )}
            {unitType === 'coverage' && (
              <div className="sm:col-span-2 space-y-1.5">
                <AppControlLabelRow
                  label="Coverage Area"
                  fieldHint={
                    <AppFieldHint hint="Coverage Area\n\nEnter one value; the others convert automatically (SQS, ft², m²)." />
                  }
                />
                <div className={uiCx(uiLayout.actionsRow, 'items-center gap-2')}>
                  <AppInput placeholder="0" value={covSqs} onChange={(e) => onCoverageChange('sqs', e.target.value)} />
                  <span className={uiTypography.body}>SQS</span>
                  <span className="text-gray-400">=</span>
                  <AppInput placeholder="0" value={covFt2} onChange={(e) => onCoverageChange('ft2', e.target.value)} />
                  <span className={uiTypography.body}>ft²</span>
                  <span className="text-gray-400">=</span>
                  <AppInput placeholder="0" value={covM2} onChange={(e) => onCoverageChange('m2', e.target.value)} />
                  <span className={uiTypography.body}>m²</span>
                </div>
              </div>
            )}
            <AppTextarea
              className="sm:col-span-2"
              label="Description / Notes"
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              fieldHint="Description / Notes\n\nOptional product details for estimators."
            />
            <AppInput
              className="sm:col-span-2"
              label="Technical Manual URL"
              type="url"
              placeholder="https://supplier.com/manual/product"
              value={technicalManualUrl}
              onChange={(e) => setTechnicalManualUrl(e.target.value)}
              fieldHint="Technical Manual URL\n\nLink to the technical manual on the supplier's website."
            />
            <div className="sm:col-span-2 space-y-2">
              <AppControlLabelRow
                label="Product Image"
                fieldHint={<AppFieldHint hint="Product Image\n\nOptional photo for the catalog tile." />}
              />
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setImagePickerOpen(true)}>
                {imageDataUrl ? 'Change Image' : 'Select Image'}
              </AppButton>
              {imageDataUrl && (
                <div>
                  <img
                    src={imageDataUrl}
                    className={uiCx('h-32 w-32 object-contain border', uiRadius.control)}
                    alt="Preview"
                  />
                  <AppButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-red-700"
                    onClick={() => setImageDataUrl('')}
                  >
                    Remove Image
                  </AppButton>
                </div>
              )}
            </div>
          </div>
        )}
      </AppFormModal>
      <AppFormModal
        open={addRelatedOpen}
        onClose={() => setAddRelatedOpen(false)}
        overlayClassName="z-[120]"
        title="Add Related Product"
        description="Search and link a product to this one"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setAddRelatedOpen(false)}>
              Close
            </AppButton>
          </div>
        }
      >
        <AppInput
          label="Search products"
          placeholder="Search products..."
          value={addRelatedSearch}
          onChange={(e) => searchRelatedProducts(e.target.value)}
          fieldHint="Search products\n\nType to find another catalog product to link as related."
        />
        <div className={uiCx(uiBorders.subtle, uiRadius.control, 'mt-4 overflow-hidden border')}>
          {Array.isArray(addRelatedResults) && addRelatedResults.length > 0 ? (
            addRelatedResults.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => createRelation(addRelatedTarget!, r.id)}
                className="flex w-full items-center justify-between border-b border-gray-100 p-3 text-left text-sm last:border-b-0 hover:bg-gray-50"
              >
                <div>
                  <div className={uiTypography.sectionTitle}>{r.name}</div>
                  {r.supplier_name && <div className={uiTypography.helper}>{r.supplier_name}</div>}
                </div>
                <div className={uiCx(uiTypography.body, 'font-semibold text-brand-red')}>
                  ${Number(r.price || 0).toFixed(2)}
                </div>
              </button>
            ))
          ) : addRelatedResults.length === 0 && !addRelatedSearch ? (
            <div className={uiCx(uiTypography.helper, 'p-3 text-center')}>Start typing to search products...</div>
          ) : addRelatedSearch && addRelatedResults.length === 0 ? (
            <div className={uiCx(uiTypography.helper, 'p-3 text-center')}>No products found</div>
          ) : null}
        </div>
      </AppFormModal>

      <ImagePicker
        isOpen={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        targetWidth={400}
        targetHeight={400}
        allowEdit
        overlayClassName={uiModalLayer.nestedPicker}
        onConfirm={handleImagePickerConfirm}
      />
      {newSupplierModalOpen && (
        <NewSupplierModal
          open={true}
          onClose={() => setNewSupplierModalOpen(false)}
          onSupplierCreated={(supplierName: string) => {
            setNewSupplier(supplierName);
            setSupplierError(false);
            setNewSupplierModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions'] });
            queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions-select'] });
          }}
        />
      )}
      
      {/* Filter Builder Modal */}
      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        fields={filterFields}
        getFieldData={(fieldId) => {
          // Return data for field if needed
          return null;
        }}
      />
    </div>
  );
}

