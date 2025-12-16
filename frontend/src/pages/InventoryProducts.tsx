import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import ImagePicker from '@/components/ImagePicker';
import { useNavigate } from 'react-router-dom';

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

export default function InventoryProducts(){
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const canViewProducts = isAdmin || permissions.has('inventory:products:read');
  const canEditProducts = isAdmin || permissions.has('inventory:products:write');
  const [q, setQ] = useState('');

  // Redirect if user doesn't have permission
  useEffect(() => {
    if (!meLoading && me !== undefined && !canViewProducts) {
      toast.error('You do not have permission to view products');
      navigate('/home');
    }
  }, [meLoading, me, canViewProducts, navigate]);
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMinDisplay, setPriceMinDisplay] = useState<string>('');
  const [priceMinFocused, setPriceMinFocused] = useState(false);
  const [priceMax, setPriceMax] = useState<string>('');
  const [priceMaxDisplay, setPriceMaxDisplay] = useState<string>('');
  const [priceMaxFocused, setPriceMaxFocused] = useState(false);
  const [unitTypeFilter, setUnitTypeFilter] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { data, refetch, isLoading, isFetching } = useQuery({
    queryKey:['estimateProducts', q, supplier, category, priceMin, priceMax, unitTypeFilter],
    queryFn: async ()=>{
      const params = new URLSearchParams(); 
      if(q) params.set('q', q); 
      if(supplier) params.set('supplier', supplier); 
      if(category) params.set('category', category);
      if(priceMin) params.set('price_min', priceMin);
      if(priceMax) params.set('price_max', priceMax);
      if(unitTypeFilter) params.set('unit_type', unitTypeFilter);
      const path = params.toString()? `/estimate/products/search?${params.toString()}` : '/estimate/products';
      return await api<Material[]>('GET', path);
    }
  });

  // Auto-apply filters when they change
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, supplier, category, priceMin, priceMax, unitTypeFilter]);
  const rawRows = data||[];
  const suppliers = useMemo(()=> Array.from(new Set(rawRows.map(r=> r.supplier_name||'').filter(Boolean))), [rawRows]);
  const categories = useMemo(()=> Array.from(new Set(rawRows.map(r=> r.category||'').filter(Boolean))), [rawRows]);

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

  const [viewRelated, setViewRelated] = useState<number|null>(null);
  const [relatedList, setRelatedList] = useState<any[]>([]);
  const [addRelatedOpen, setAddRelatedOpen] = useState(false);
  const [addRelatedTarget, setAddRelatedTarget] = useState<number|null>(null);
  const [addRelatedSearch, setAddRelatedSearch] = useState('');
  const [addRelatedResults, setAddRelatedResults] = useState<any[]>([]);
  const [relatedCounts, setRelatedCounts] = useState<Record<number, number>>({});

  const { data: supplierOptions } = useQuery({ queryKey:['invSuppliersOptions'], queryFn: ()=> api<any[]>('GET','/inventory/suppliers') });

  const qc = useQueryClient();
  const productIds = useMemo(()=> rows.map(p=> p.id).join(','), [rows]);
  const { data: relCounts } = useQuery({ queryKey:['related-counts', productIds], queryFn: async()=> productIds? await api<Record<string, number>>('GET', `/estimate/related/count?ids=${productIds}`) : {}, enabled: !!productIds });
  useEffect(()=> { if(relCounts) setRelatedCounts(relCounts); }, [relCounts]);

  // ESC key handler for modals
  useEffect(() => {
    if (!open && viewRelated === null && !addRelatedOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (addRelatedOpen) setAddRelatedOpen(false);
        else if (viewRelated !== null) setViewRelated(null);
        else if (open) resetModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, viewRelated, addRelatedOpen]);

  const onCoverageChange = (which: 'sqs'|'ft2'|'m2', val: string)=>{
    if(!val){ setCovSqs(''); setCovFt2(''); setCovM2(''); return; }
    const num = Number(val);
    if(Number.isNaN(num)){ return; }
    const SQS_TO_FT2 = 100;
    const FT2_TO_M2 = 0.09290304;
    if(which==='sqs'){
      const ft2 = num * SQS_TO_FT2;
      const m2 = ft2 * FT2_TO_M2;
      setCovSqs(String(num)); setCovFt2(String(Number(ft2.toFixed(0)))); setCovM2(String(Number(m2.toFixed(2))));
    }else if(which==='ft2'){
      const sqs = num / SQS_TO_FT2;
      const m2 = num * FT2_TO_M2;
      setCovSqs(String(Number(sqs.toFixed(3)))); setCovFt2(String(num)); setCovM2(String(Number(m2.toFixed(2))));
    }else{
      const ft2 = num / FT2_TO_M2;
      const sqs = ft2 / SQS_TO_FT2;
      setCovSqs(String(Number(sqs.toFixed(3)))); setCovFt2(String(Number(ft2.toFixed(0)))); setCovM2(String(Number(num.toFixed(2))));
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
      setViewRelated(id);
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
    setName(''); setNameError(false); setNewSupplier(''); setNewCategory(''); setUnit(''); setPrice(''); setPriceDisplay(''); setPriceFocused(false); setPriceError(false); setDesc('');
    setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); setUnitType('unitary');     setImageDataUrl('');
    setTechnicalManualUrl(''); setImagePickerOpen(false);
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
      // Reload the related list
      if(viewRelated) handleViewRelated(viewRelated);
      await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  // Don't render if still loading or user doesn't have permission
  if (meLoading || !canViewProducts) {
    return null;
  }

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Products</div>
          <div className="text-sm opacity-90">Catalog of materials and pricing.</div>
        </div>
        {canEditProducts && (
          <button onClick={()=>{ resetModal(); setOpen(true); }} className="px-4 py-2 rounded bg-white text-brand-red font-semibold">+ New Product</button>
        )}
      </div>
      {/* Advanced Search Panel */}
      <div className="mb-3 rounded-xl border bg-white shadow-sm overflow-hidden relative">
        {/* Main Search Bar */}
        {isFiltersCollapsed ? (
          <div className="p-4 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-gray-700">Show Filters</div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gradient-to-r from-gray-50 to-white border-b">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Search Products</label>
                <div className="relative">
                  <input 
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent text-gray-900" 
                    placeholder="Search by product name, supplier, or category..." 
                    value={q} 
                    onChange={e=>setQ(e.target.value)} 
                    onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} 
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <div className="flex items-end gap-2 pt-6">
                <button 
                  onClick={()=>setShowAdvanced(!showAdvanced)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  Advanced Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Filters */}
        {!isFiltersCollapsed && showAdvanced && (
          <div className="p-4 bg-gray-50 border-t animate-in slide-in-from-top duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Min Price ($)</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  placeholder="$0.00"
                  value={priceMinFocused ? priceMinDisplay : (priceMin ? formatCurrency(priceMin) : '')}
                  onFocus={() => {
                    setPriceMinFocused(true);
                    setPriceMinDisplay(priceMin || '');
                  }}
                  onBlur={() => {
                    setPriceMinFocused(false);
                    const parsed = parseCurrency(priceMinDisplay);
                    setPriceMin(parsed);
                    setPriceMinDisplay(parsed);
                  }}
                  onChange={e => {
                    const raw = e.target.value;
                    setPriceMinDisplay(raw);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Max Price ($)</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  placeholder="$0.00"
                  value={priceMaxFocused ? priceMaxDisplay : (priceMax ? formatCurrency(priceMax) : '')}
                  onFocus={() => {
                    setPriceMaxFocused(true);
                    setPriceMaxDisplay(priceMax || '');
                  }}
                  onBlur={() => {
                    setPriceMaxFocused(false);
                    const parsed = parseCurrency(priceMaxDisplay);
                    setPriceMax(parsed);
                    setPriceMaxDisplay(parsed);
                  }}
                  onChange={e => {
                    const raw = e.target.value;
                    setPriceMaxDisplay(raw);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Unit Type</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={unitTypeFilter}
                  onChange={e => setUnitTypeFilter(e.target.value)}
                >
                  <option value="">All Types</option>
                  <option value="unitary">Unitary</option>
                  <option value="multiple">Multiple</option>
                  <option value="coverage">Coverage</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Quick Filters Row */}
        {!isFiltersCollapsed && (
          <div className="p-4 border-b bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Supplier</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={supplier}
                  onChange={e=>setSupplier(e.target.value)}
                >
                  <option value="">All Suppliers</option>
                  {suppliers.map(s=> <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Category</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={category}
                  onChange={e=>setCategory(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {categories.map(c=> <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isFiltersCollapsed && (
          <div className="p-4 bg-white border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {Array.isArray(data) && data.length > 0 && (
                <span>Found {data.length} product{data.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-2 pr-10">
              <button 
                onClick={()=>{
                  setQ('');
                  setSupplier('');
                  setCategory('');
                  setPriceMin('');
                  setPriceMax('');
                  setUnitTypeFilter('');
                  refetch();
                }} 
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Collapse/Expand button - bottom right corner */}
        <button
          onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
          className="absolute bottom-0 right-0 w-8 h-8 rounded-tl-lg border-t border-l bg-white hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm"
          title={isFiltersCollapsed ? "Expand filters" : "Collapse filters"}
        >
          <svg 
            className={`w-4 h-4 text-gray-600 transition-transform ${!isFiltersCollapsed ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <div className="rounded-xl border bg-white">
        {isLoading ? (
          <div className="p-4">
            <div className="h-6 bg-gray-100 animate-pulse rounded" />
          </div>
        ) : !rows.length ? (
          <div className="p-4 text-gray-600 text-center">
            No products found
          </div>
        ) : (
          <div className="divide-y">
            {rows.map(p => (
              <div
                key={p.id}
                className="p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                onClick={() => openViewModal(p)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={p.image_base64 || '/ui/assets/login/logo-light.svg'}
                    className="w-12 h-12 rounded-lg border object-cover"
                    alt={p.name}
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-base">{p.name}</div>
                    <div className="text-xs text-gray-700">
                      {p.supplier_name && <span className="font-medium">{p.supplier_name}</span>}
                      {p.category && (
                        <>
                          {p.supplier_name && ' · '}
                          <span>{p.category}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      {p.unit && <span>{p.unit}</span>}
                      {typeof p.price === 'number' && (
                        <>
                          {p.unit && ' · '}
                          <span className="font-medium text-brand-red">${p.price.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleViewRelated(p.id)}
                    className="px-3 py-1.5 rounded bg-brand-red text-white"
                  >
                    {relatedCounts[p.id] || 0} Related
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
                        src={viewing.image_base64 || '/ui/assets/login/logo-light.svg'} 
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

                  {/* Product Details */}
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
                <label className="text-xs font-semibold text-gray-700">Supplier</label>
                <select 
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={newSupplier} 
                  onChange={e=>setNewSupplier(e.target.value)}
                >
                  <option value="">Select a supplier</option>
                  {Array.isArray(supplierOptions) && supplierOptions.map((s:any)=> (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
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
                      <button onClick={()=> handleAddRelated(viewing.id)} className="px-4 py-2 rounded bg-black text-white">Add Related</button>
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
                      setName(''); setNameError(false); setNewSupplier(''); setNewCategory(''); setUnit('');                       setPrice(''); setPriceDisplay(''); setPriceFocused(false); setPriceError(false); setDesc('');
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

      {viewRelated!==null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div className="font-semibold text-lg">Related Products</div>
              <button onClick={()=> setViewRelated(null)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
            </div>
            <div className="p-4">
              <div className="border rounded divide-y">
                {Array.isArray(relatedList) && relatedList.length? relatedList.map((r:any,i:number)=> (
                  <div key={i} className="px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.supplier_name||''} · ${Number(r.price||0).toFixed(2)}</div>
                    </div>
                    {canEditProducts && (
                      <button onClick={()=> deleteRelation(viewRelated, r.id)} className="px-2 py-1 rounded bg-red-100 text-xs">Remove</button>
                    )}
                  </div>
                )): <div className="p-3 text-gray-600">No related products</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {addRelatedOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div className="font-semibold text-lg">Add Related Product</div>
              <button onClick={()=> setAddRelatedOpen(false)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
            </div>
            <div className="p-4">
              <input 
                className="w-full border rounded px-3 py-2 mb-3" 
                placeholder="Search products..." 
                value={addRelatedSearch} 
                onChange={e=> searchRelatedProducts(e.target.value)} 
                autoFocus
              />
              <div className="border rounded divide-y max-h-96 overflow-y-auto">
                {Array.isArray(addRelatedResults) && addRelatedResults.length > 0 ? addRelatedResults.map(r=> (
                  <div 
                    key={r.id} 
                    className="px-3 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer" 
                    onClick={()=> createRelation(addRelatedTarget!, r.id)}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.supplier_name||''} · ${Number(r.price||0).toFixed(2)}</div>
                    </div>
                  </div>
                )) : addRelatedResults.length === 0 && !addRelatedSearch && (
                  <div className="p-3 text-gray-600">No products available</div>
                )}
                {addRelatedSearch && addRelatedResults.length === 0 && (
                  <div className="p-3 text-gray-600">No products found</div>
                )}
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
    </div>
  );
}
