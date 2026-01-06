import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import ImagePicker from '@/components/ImagePicker';
import { useNavigate } from 'react-router-dom';
import SupplierSelect from '@/components/SupplierSelect';
import NewSupplierModal from '@/components/NewSupplierModal';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import LoadingOverlay from '@/components/LoadingOverlay';

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
  const canViewProducts = isAdmin || permissions.has('inventory:products:read');
  const canEditProducts = isAdmin || permissions.has('inventory:products:write');
  const [q, setQ] = useState('');
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const hasLoadedDataRef = useRef(false);

  // Get current date formatted (same as Dashboard)
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

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

  // ESC key handler for modals
  useEffect(() => {
    if (!open && !addRelatedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (addRelatedOpen) setAddRelatedOpen(false);
        else if (open) resetModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, addRelatedOpen]);

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

  // Don't render if still loading or user doesn't have permission
  if (meLoading || !canViewProducts) {
    return null;
  }

  return (
    <div>
      <div 
        className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6"
        style={animationComplete ? {} : {
          opacity: hasAnimated ? 1 : 0,
          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
          transition: 'opacity 400ms ease-out, transform 400ms ease-out'
        }}
      >
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Products</div>
          <div className="text-sm text-gray-500 font-medium">Catalog of materials and pricing</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      {/* Filter Bar */}
      <div className="mb-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Primary Row: Global Search + Actions */}
        <div className="px-6 py-4 bg-white">
          <div className="flex items-center gap-4">
            {/* Global Search - Dominant, large */}
            <div className="flex-1">
              <div className="relative">
                <input 
                  className="w-full border border-gray-200 rounded-md px-4 py-2.5 pl-10 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150" 
                  placeholder="Search by product name, supplier, or category..." 
                  value={q} 
                  onChange={e=>setQ(e.target.value)} 
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* + Filters Button - Opens Modal */}
            <button 
              onClick={()=>setIsFilterModalOpen(true)}
              className="px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 whitespace-nowrap"
            >
              + Filters
            </button>

            {/* Clear Filters - Only when active */}
            {hasActiveFilters && (
              <button 
                onClick={()=>{
                  setQ('');
                  setSearchParams(new URLSearchParams());
                  refetch();
                }} 
                className="px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 whitespace-nowrap"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      {hasActiveFilters && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
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
      <div className="rounded-xl border bg-white p-4">
        {isLoading ? (
          <div className="p-4">
            <div className="h-6 bg-gray-100 animate-pulse rounded" />
          </div>
        ) : !rows.length ? (
          <div className="p-4 text-gray-600 text-center">
            No products found
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
            {canEditProducts && (
              <button
                onClick={() => { resetModal(); setOpen(true); }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[200px]"
              >
                <div className="text-4xl text-gray-400 mb-2">+</div>
                <div className="font-medium text-sm text-gray-700">New Product</div>
                <div className="text-xs text-gray-500 mt-1">Add new product to inventory</div>
              </button>
            )}
            {rows.map(p => (
              <button
                key={p.id}
                onClick={() => openViewModal(p)}
                className="border rounded-lg p-3 hover:border-brand-red hover:shadow-md transition-all bg-white flex flex-col text-left"
              >
                <div className="w-full h-24 mb-2 relative">
                  {p.image_base64 ? (
                    <img 
                      src={p.image_base64.startsWith('data:') ? p.image_base64 : `data:image/jpeg;base64,${p.image_base64}`}
                      alt={p.name}
                      className="w-full h-full object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const placeholder = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                        if (placeholder) placeholder.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className={`w-full h-full bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs ${p.image_base64 ? 'hidden' : ''}`} style={{ display: p.image_base64 ? 'none' : 'flex' }}>
                    No Image
                  </div>
                </div>
                <div className="font-medium text-sm mb-1 line-clamp-2">{p.name}</div>
                {p.supplier_name && (
                  <div className="text-xs text-gray-500 mb-1">Supplier: {p.supplier_name}</div>
                )}
                {p.category && (
                  <div className="text-xs text-gray-500 mb-1">Category: {p.category}</div>
                )}
                <div className="text-xs text-red-600 font-semibold mt-auto">
                  {typeof p.price === 'number' ? `$${Number(p.price || 0).toFixed(2)}` : '—'}
                </div>
                {p.unit && (
                  <div className="text-xs text-gray-500">Unit: {p.unit}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      </LoadingOverlay>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
            <div className="overflow-y-auto">
              {viewing && !editing ? (
                // View mode - display product details
                <div className="space-y-6">
                  {/* Product Header */}
                  <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative">
                    <button
                      onClick={resetModal}
                      className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
                      title="Close"
                    >
                      ×
                    </button>
                    <div className="w-24 h-24 rounded-xl border-4 border-white shadow-lg overflow-hidden bg-white flex items-center justify-center">
                      <img 
                        src={viewing.image_base64 || '/ui/assets/placeholders/product.png'} 
                        className="w-full h-full object-cover" 
                        alt={viewing.name}
                      />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-3xl font-extrabold text-white">{viewing.name}</h2>
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        {viewing.supplier_name && (
                          <div className="flex items-center gap-2">
                            <span className="text-white/80">🏢</span>
                            <span className="text-white">{viewing.supplier_name}</span>
                          </div>
                        )}
                        {viewing.category && (
                          <div className="flex items-center gap-2">
                            <span className="text-white/80">📦</span>
                            <span className="text-white">{viewing.category}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="px-6 border-b">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setProductTab('details')}
                        className={`px-4 py-2 font-medium text-sm transition-colors ${
                          productTab === 'details'
                            ? 'text-brand-red border-b-2 border-brand-red'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Details
                      </button>
                      <button
                        onClick={() => setProductTab('usage')}
                        className={`px-4 py-2 font-medium text-sm transition-colors ${
                          productTab === 'usage'
                            ? 'text-brand-red border-b-2 border-brand-red'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Usage {productUsage.length > 0 && `(${productUsage.length})`}
                      </button>
                      {canEditProducts && viewing && (
                        <button
                          onClick={() => {
                            setProductTab('related');
                            if (viewing.id && relatedList.length === 0) {
                              handleViewRelated(viewing.id);
                            }
                          }}
                          className={`px-4 py-2 font-medium text-sm transition-colors ${
                            productTab === 'related'
                              ? 'text-brand-red border-b-2 border-brand-red'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          Related {relatedCounts[viewing.id] ? `(${relatedCounts[viewing.id]})` : ''}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Product Details or Usage */}
                  {productTab === 'details' ? (
                  <div className="px-6 pb-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {viewing.unit && (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Sell Unit</div>
                          <div className="text-gray-900">{viewing.unit}</div>
                        </div>
                      )}
                      {viewing.unit_type && (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Unit Type</div>
                          <div className="text-gray-900">{viewing.unit_type}</div>
                        </div>
                      )}
                    </div>
                    {typeof viewing.price === 'number' && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-xs font-semibold text-gray-600 mb-1">Price</div>
                        <div className="text-gray-900 font-semibold text-lg">${viewing.price.toFixed(2)}</div>
                      </div>
                    )}
                    {viewing.units_per_package && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-xs font-semibold text-gray-600 mb-1">Units per Package</div>
                        <div className="text-gray-900">{viewing.units_per_package}</div>
                      </div>
                    )}
                    {(viewing.coverage_sqs || viewing.coverage_ft2 || viewing.coverage_m2) && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-sm font-semibold text-gray-900 mb-3">📍 Coverage Area</div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-gray-700">SQS: {viewing.coverage_sqs||'-'}</div>
                          <div className="text-gray-700">ft²: {viewing.coverage_ft2||'-'}</div>
                          <div className="text-gray-700">m²: {viewing.coverage_m2||'-'}</div>
                        </div>
                      </div>
                    )}
                    {viewing.description && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-sm font-semibold text-gray-900 mb-2">Description</div>
                        <div className="text-gray-700 whitespace-pre-wrap">{viewing.description}</div>
                      </div>
                    )}
                    {viewing.technical_manual_url && (() => {
                      // Ensure URL is absolute (add https:// if missing protocol)
                      const url = viewing.technical_manual_url.trim();
                      const absoluteUrl = url.match(/^https?:\/\//i) ? url : `https://${url}`;
                      return (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-900">Technical Manual</div>
                            <a
                              href={absoluteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                // Prevent navigation if URL is invalid
                                if (!absoluteUrl || absoluteUrl === 'https://') {
                                  e.preventDefault();
                                }
                              }}
                              className="px-4 py-2 rounded bg-brand-red text-white hover:bg-[#6d0d0d] transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              View Manual
                            </a>
      </div>
    </div>
  );
})()}
                  </div>
                  ) : productTab === 'usage' ? (
                    <div className="px-6 pb-6">
                      {loadingUsage ? (
                        <div className="py-8 text-center text-gray-500">Loading usage data...</div>
                      ) : productUsage.length === 0 ? (
                        <div className="py-8 text-center text-gray-500">
                          <div className="text-lg mb-2">📦</div>
                          <div>This product is not being used in any estimates.</div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-sm text-gray-600 mb-4">
                            This product is being used in {productUsage.length} estimate{productUsage.length !== 1 ? 's' : ''}:
                          </div>
                          <div className="border rounded-lg divide-y">
                            {productUsage.map((usage, idx) => (
                              <div key={idx} className="p-4 hover:bg-gray-50">
                                {usage.status === 'orphaned' ? (
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-gray-900">Orphaned Estimate</div>
                                      <div className="text-sm text-gray-500">Estimate #{usage.estimate_id} (deleted)</div>
                                    </div>
                                    <span className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-800">Orphaned</span>
                                  </div>
                                ) : usage.status === 'project_deleted' || usage.project_deleted ? (
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-900">{usage.project_name || 'Project Deleted'}</div>
                                      <div className="text-sm text-gray-500">Estimate #{usage.estimate_id} - Project was deleted</div>
                                      {usage.created_at && (
                                        <div className="text-xs text-gray-400 mt-1">
                                          Created: {new Date(usage.created_at).toLocaleDateString()}
                                        </div>
                                      )}
                                    </div>
                                    <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800">Project Deleted</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      {usage.project_name ? (
                                        <>
                                          <div className="font-medium text-gray-900">{usage.project_name}</div>
                                          {usage.client_name && (
                                            <div className="text-sm text-gray-500">Client: {usage.client_name}</div>
                                          )}
                                          {usage.created_at && (
                                            <div className="text-xs text-gray-400 mt-1">
                                              Created: {new Date(usage.created_at).toLocaleDateString()}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <div className="text-gray-500">No project associated</div>
                                      )}
                                    </div>
                                    {usage.project_id && !usage.project_deleted && (
                                      <button
                                        onClick={() => {
                                          navigate(`/projects/${usage.project_id}`);
                                          resetModal();
                                        }}
                                        className="px-3 py-1.5 rounded bg-brand-red text-white hover:bg-[#6d0d0d] transition-colors text-sm"
                                      >
                                        View Project
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : productTab === 'related' && viewing ? (
                    <div className="px-6 pb-6">
                      {Array.isArray(relatedList) && relatedList.length ? (
                        <div className="space-y-3">
                          <div className="text-sm text-gray-600 mb-4">
                            This product is related to {relatedList.length} product{relatedList.length !== 1 ? 's' : ''}:
                          </div>
                          <div className="border rounded-lg divide-y">
                            {relatedList.map((r: any, i: number) => (
                              <div key={i} className="p-4 hover:bg-gray-50 flex items-center gap-4">
                                <img
                                  src={r.image_base64 || '/ui/assets/placeholders/product.png'}
                                  className="w-16 h-16 rounded-lg border object-cover flex-shrink-0"
                                  alt={r.name}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900">{r.name}</div>
                                  {r.supplier_name && (
                                    <div className="text-sm text-gray-500">Supplier: {r.supplier_name}</div>
                                  )}
                                  {typeof r.price === 'number' && (
                                    <div className="text-sm text-brand-red font-semibold mt-1">
                                      ${r.price.toFixed(2)}
                                    </div>
                                  )}
                                </div>
                                {canEditProducts && (
                                  <button
                                    onClick={() => deleteRelation(viewing.id, r.id)}
                                    className="px-3 py-1.5 rounded bg-red-100 text-red-700 hover:bg-red-200 text-sm flex-shrink-0"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {canEditProducts && (
                            <button
                              onClick={() => handleAddRelated(viewing.id)}
                              className="w-full mt-4 px-4 py-2 rounded bg-brand-red text-white hover:bg-[#6d0d0d] transition-colors"
                            >
                              + Add Related Product
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-gray-500">
                          <div className="text-lg mb-2">🔗</div>
                          <div>This product has no related products.</div>
                          {canEditProducts && (
                            <button
                              onClick={() => handleAddRelated(viewing.id)}
                              className="mt-4 px-4 py-2 rounded bg-brand-red text-white hover:bg-[#6d0d0d] transition-colors"
                            >
                              + Add Related Product
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                // Edit/Create mode - form inputs
                <div className="space-y-6">
                  {/* Edit Header */}
                  <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 relative">
                    <button
                      onClick={resetModal}
                      className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
                      title="Close"
                    >
                      ×
                    </button>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-extrabold text-white">
                          {editing ? 'Edit Product' : 'New Product'}
                        </h2>
                        {editing && (
                          <p className="text-sm text-white/80 mt-1">
                            Update product information
                          </p>
                        )}
                        {!editing && (
                          <p className="text-sm text-white/80 mt-1">
                            Add a new product to your inventory
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-700">
                  Name <span className="text-red-600">*</span>
                </label>
                <input 
                  className={`w-full border rounded px-3 py-2 mt-1 ${nameError && !name.trim() ? 'border-red-500' : ''}`}
                  value={name} 
                  onChange={e=>{
                    setName(e.target.value);
                    if (nameError) setNameError(false);
                  }} 
                />
                {nameError && !name.trim() && (
                  <div className="text-[11px] text-red-600 mt-1">This field is required</div>
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
                    }}
                    onOpenNewSupplierModal={() => setNewSupplierModalOpen(true)}
                    error={supplierError && !newSupplier.trim()}
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
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type" checked={unitType==='unitary'} onChange={()=>{ setUnitType('unitary'); setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Unitary</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type" checked={unitType==='multiple'} onChange={()=>{ setUnitType('multiple'); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Multiple</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type" checked={unitType==='coverage'} onChange={()=>{ setUnitType('coverage'); setUnitsPerPackage(''); }} /> Coverage</label>
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
                        type="number"
                        step="any"
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
                        type="number"
                        step="any"
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
                        type="number"
                        step="any"
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
                <div className="text-xs text-gray-500 mt-1">Link to the technical manual on the supplier's website</div>
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
              )}
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
              {viewing && !editing ? (
                // View mode buttons
                <>
                  {canEditProducts && (
                    <>
                      <button onClick={openEditModal} className="px-4 py-2 rounded bg-gray-100">Edit</button>
                      <button onClick={()=> handleDelete(viewing.id)} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
                    </>
                  )}
                </>
              ) : (
                // Edit/Create mode buttons
                <>
                  <button onClick={()=>{
                    if(editing){
                      setViewing(editing);
                      setEditing(null);
                      setName(''); setNameError(false); setNewSupplier(''); setSupplierError(false); setNewCategory(''); setUnit('');                       setPrice(''); setPriceDisplay(''); setPriceFocused(false); setPriceError(false); setDesc('');
                      setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); setUnitType('unitary'); setImageDataUrl('');
                      setTechnicalManualUrl('');
                    }else{
                      resetModal();
                    }
                  }} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
                  <button onClick={async()=>{
                    if(isSavingProduct) return;
                    
                    // Validate name
                    if(!name.trim()){
                      setNameError(true);
                      toast.error('Name is required');
                      return;
                    }

                    // Validate supplier
                    if(!newSupplier.trim()){
                      setSupplierError(true);
                      toast.error('Supplier is required');
                      return;
                    }
                    
                    // Validate price
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
                        supplier_name: newSupplier.trim(),
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
                      if(editing){ await api('PUT', `/estimate/products/${editing.id}`, payload); toast.success('Updated'); }
                      else{ await api('POST','/estimate/products', payload); toast.success('Created'); }
                      resetModal();
                      await refetch();
                    }catch(_e){ toast.error('Failed'); }
                    finally{ setIsSavingProduct(false); }
                  }} disabled={isSavingProduct} className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed">
                    {isSavingProduct ? (editing ? 'Updating...' : 'Creating...') : (editing ? 'Update' : 'Create')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}


      {addRelatedOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div className="font-semibold text-lg">Add Related Product</div>
              <button
                onClick={() => setAddRelatedOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <input
                type="text"
                className="w-full border rounded px-3 py-2 mb-4"
                placeholder="Search products..."
                value={addRelatedSearch}
                onChange={e => searchRelatedProducts(e.target.value)}
              />
              <div className="max-h-[50vh] overflow-y-auto">
                {Array.isArray(addRelatedResults) && addRelatedResults.length > 0 ? (
                  addRelatedResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => createRelation(addRelatedTarget!, r.id)}
                      className="w-full text-left p-3 border-b hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-medium">{r.name}</div>
                        {r.supplier_name && (
                          <div className="text-sm text-gray-500">{r.supplier_name}</div>
                        )}
                      </div>
                      <div className="text-sm text-brand-red font-semibold">
                        ${Number(r.price || 0).toFixed(2)}
                      </div>
                    </button>
                  ))
                ) : addRelatedResults.length === 0 && !addRelatedSearch ? (
                  <div className="p-3 text-gray-500 text-center">Start typing to search products...</div>
                ) : addRelatedSearch && addRelatedResults.length === 0 ? (
                  <div className="p-3 text-gray-500 text-center">No products found</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
      <ImagePicker
        isOpen={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        targetWidth={400}
        targetHeight={400}
        allowEdit={true}
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

