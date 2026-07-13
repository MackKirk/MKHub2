import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import ImagePicker from '@/components/ImagePicker';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, SlidersHorizontal, Trash2, Truck } from 'lucide-react';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import LoadingOverlay from '@/components/LoadingOverlay';
import SupplierContactsCard from '@/components/SupplierContactsCard';
import SupplierSelect from '@/components/SupplierSelect';
import {
  SupplierAddressFields,
  SupplierCompanyFields,
  type SupplierFormFieldsProps,
  supplierFormStepPills,
} from '@/components/SupplierFormFields';
import {
  inventoryNewProductQuickInfo,
  productDetailQuickInfo,
  supplierDetailQuickInfo,
  supplierFormQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  canAccessSupplierList,
  canEditSupplierRecord,
  canReadSupplierTab,
  canWriteSupplierTab,
  type SupplierTab,
} from '@/lib/supplierPermissions';
import {
  canEditProductRecord,
  canReadProductTab,
  canWriteProductTab,
} from '@/lib/productPermissions';
import {
  AppButton,
  AppCard,
  AppControlLabelRow,
  AppFieldHint,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTabs,
  AppTextarea,
  resolveAppSortableListPreset,
  useAppListSort,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiBorders,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Supplier = {
  id: string;
  name: string;
  legal_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
  created_at?: string;
  image_base64?: string;
};

type SuppliersPageResponse = {
  items: Supplier[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

const SUPPLIER_LIST_SORTS = ['name', 'email', 'phone'] as const;
type SupplierListSort = (typeof SUPPLIER_LIST_SORTS)[number];

// Helper function to format phone numbers
const formatPhone = (phone: string | undefined): string => {
  if (!phone) return '-';
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  // Format as (XXX) XXX-XXXX for North American numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    // Handle 11-digit numbers starting with 1
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  // Return original if can't format
  return phone;
};

// Helper functions for currency formatting (CAD)
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

// Helper: Convert filter rules to URL parameters
function convertRulesToParams(rules: FilterRule[]): URLSearchParams {
  const params = new URLSearchParams();
  
  // Clear all potential conflicting parameters first
  params.delete('country');
  params.delete('country_not');
  params.delete('province');
  params.delete('province_not');
  params.delete('city');
  params.delete('city_not');
  
  for (const rule of rules) {
    if (!rule.value || (Array.isArray(rule.value) && (!rule.value[0] || !rule.value[1]))) {
      continue; // Skip empty rules
    }
    
    switch (rule.field) {
      case 'country':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('country', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('country_not', rule.value);
          }
        }
        break;
      
      case 'province':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('province', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('province_not', rule.value);
          }
        }
        break;
      
      case 'city':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('city', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('city_not', rule.value);
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
  
  // Country
  const country = params.get('country');
  const countryNot = params.get('country_not');
  if (country) {
    rules.push({ id: `rule-${idCounter++}`, field: 'country', operator: 'is', value: country });
  } else if (countryNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'country', operator: 'is_not', value: countryNot });
  }
  
  // Province
  const province = params.get('province');
  const provinceNot = params.get('province_not');
  if (province) {
    rules.push({ id: `rule-${idCounter++}`, field: 'province', operator: 'is', value: province });
  } else if (provinceNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'province', operator: 'is_not', value: provinceNot });
  }
  
  // City
  const city = params.get('city');
  const cityNot = params.get('city_not');
  if (city) {
    rules.push({ id: `rule-${idCounter++}`, field: 'city', operator: 'is', value: city });
  } else if (cityNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'city', operator: 'is_not', value: cityNot });
  }
  
  return rules;
}

export default function InventorySuppliers() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const canViewSuppliers = canAccessSupplierList(isAdmin, permissions);
  const canEditSuppliers = canEditSupplierRecord(isAdmin, permissions);
  const canEditSupplierOverview = canWriteSupplierTab(isAdmin, permissions, 'overview');
  const canEditSupplierContacts = canWriteSupplierTab(isAdmin, permissions, 'contacts');
  const canEditSupplierProductsTab = canWriteSupplierTab(isAdmin, permissions, 'products');
  const canEditProducts = canEditProductRecord(isAdmin, permissions);
  const canEditProductDetails = canWriteProductTab(isAdmin, permissions, 'details');
  const canEditProductRelated = canWriteProductTab(isAdmin, permissions, 'related');
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
    if (!meLoading && me !== undefined && !canViewSuppliers) {
      toast.error('You do not have permission to view suppliers');
      navigate('/home');
    }
  }, [meLoading, me, canViewSuppliers, navigate]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const { sortBy, sortDir, setSort: setListSort } = useAppListSort<SupplierListSort>({
    searchParams,
    setSearchParams,
    defaultSort: 'name',
    validSorts: SUPPLIER_LIST_SORTS,
  });
  const supplierPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const supplierLimit = 25;

  // Convert current URL params to rules for modal
  const currentRules = useMemo(() => {
    return convertParamsToRules(searchParams);
  }, [searchParams]);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine1Complement, setAddressLine1Complement] = useState('');
  const [showAddress2, setShowAddress2] = useState(false);
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLine2Complement, setAddressLine2Complement] = useState('');
  const [showAddress3, setShowAddress3] = useState(false);
  const [addressLine3, setAddressLine3] = useState('');
  const [addressLine3Complement, setAddressLine3Complement] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [supplierTab, setSupplierTab] = useState<'overview' | 'contacts' | 'products'>('overview');
  const [supplierFormStep, setSupplierFormStep] = useState(1);
  const [newProductModalOpen, setNewProductModalOpen] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<any | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productTab, setProductTab] = useState<'details'|'usage'|'related'>('details');
  const [productUsage, setProductUsage] = useState<any[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [relatedList, setRelatedList] = useState<any[]>([]);
  const [addRelatedOpen, setAddRelatedOpen] = useState(false);
  const [addRelatedTarget, setAddRelatedTarget] = useState<number|null>(null);
  const [addRelatedSearch, setAddRelatedSearch] = useState('');
  const [addRelatedResults, setAddRelatedResults] = useState<any[]>([]);
  const [relatedCounts, setRelatedCounts] = useState<Record<number, number>>({});
  
  // New product form fields
  const [productName, setProductName] = useState('');
  const [productNameError, setProductNameError] = useState(false);
  const [productCategory, setProductCategory] = useState('');
  const [productUnit, setProductUnit] = useState('');
  const [productPrice, setProductPrice] = useState<string>('');
  const [productPriceDisplay, setProductPriceDisplay] = useState<string>('');
  const [productPriceFocused, setProductPriceFocused] = useState(false);
  const [productPriceError, setProductPriceError] = useState(false);
  const [productDesc, setProductDesc] = useState('');
  const [productUnitType, setProductUnitType] = useState<'unitary'|'multiple'|'coverage'>('unitary');
  const [productUnitsPerPackage, setProductUnitsPerPackage] = useState<string>('');
  const [productCovSqs, setProductCovSqs] = useState<string>('');
  const [productCovFt2, setProductCovFt2] = useState<string>('');
  const [productCovM2, setProductCovM2] = useState<string>('');
  const [productImageDataUrl, setProductImageDataUrl] = useState<string>('');
  const [productImagePickerOpen, setProductImagePickerOpen] = useState(false);
  const [productTechnicalManualUrl, setProductTechnicalManualUrl] = useState<string>('');
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  
  // Edit product form fields (separate from new product)
  const [editProductName, setEditProductName] = useState('');
  const [editProductNameError, setEditProductNameError] = useState(false);
  const [editProductSupplier, setEditProductSupplier] = useState('');
  const [editProductSupplierError, setEditProductSupplierError] = useState(false);
  const [editProductCategory, setEditProductCategory] = useState('');
  const [editProductUnit, setEditProductUnit] = useState('');
  const [editProductPrice, setEditProductPrice] = useState<string>('');
  const [editProductPriceDisplay, setEditProductPriceDisplay] = useState<string>('');
  const [editProductPriceFocused, setEditProductPriceFocused] = useState(false);
  const [editProductPriceError, setEditProductPriceError] = useState(false);
  const [editProductDesc, setEditProductDesc] = useState('');
  const [editProductUnitType, setEditProductUnitType] = useState<'unitary'|'multiple'|'coverage'>('unitary');
  const [editProductUnitsPerPackage, setEditProductUnitsPerPackage] = useState<string>('');
  const [editProductCovSqs, setEditProductCovSqs] = useState<string>('');
  const [editProductCovFt2, setEditProductCovFt2] = useState<string>('');
  const [editProductCovM2, setEditProductCovM2] = useState<string>('');
  const [editProductImageDataUrl, setEditProductImageDataUrl] = useState<string>('');
  const [editProductImagePickerOpen, setEditProductImagePickerOpen] = useState(false);
  const [editProductTechnicalManualUrl, setEditProductTechnicalManualUrl] = useState<string>('');
  const [isSavingEditProduct, setIsSavingEditProduct] = useState(false);

  useEffect(() => {
    if (!open && !newProductModalOpen && !productModalOpen && !addRelatedOpen && !editProductImagePickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editProductImagePickerOpen) {
          setEditProductImagePickerOpen(false);
        } else if (addRelatedOpen) {
          setAddRelatedOpen(false);
        } else if (productModalOpen) {
          if (editingProduct) {
            setViewingProduct(editingProduct);
            setEditingProduct(null);
          } else {
            setProductModalOpen(false);
            setViewingProduct(null);
          }
        } else if (newProductModalOpen) {
          setNewProductModalOpen(false);
        } else if (open) {
          setOpen(false);
          resetForm();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, newProductModalOpen, productModalOpen, addRelatedOpen, editProductImagePickerOpen, editingProduct]);

  const { data: supplierOptions } = useQuery({
    queryKey: ['invSuppliersOptions-supplier'],
    queryFn: () => api<Supplier[]>('GET', '/inventory/suppliers'),
    staleTime: 60_000,
  });

  // Extract unique countries, provinces, and cities (from options list — not current page)
  const allCountries = useMemo(() => {
    const countriesSet = new Set<string>();
    (supplierOptions || []).forEach((s: Supplier) => {
      if (s.country) countriesSet.add(s.country);
    });
    return Array.from(countriesSet).sort();
  }, [supplierOptions]);

  const allProvinces = useMemo(() => {
    const provincesSet = new Set<string>();
    (supplierOptions || []).forEach((s: Supplier) => {
      if (s.province) provincesSet.add(s.province);
    });
    return Array.from(provincesSet).sort();
  }, [supplierOptions]);

  const allCities = useMemo(() => {
    const citiesSet = new Set<string>();
    (supplierOptions || []).forEach((s: Supplier) => {
      if (s.city) citiesSet.add(s.city);
    });
    return Array.from(citiesSet).sort();
  }, [supplierOptions]);

  const listQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('envelope', '1');
    params.set('page', String(supplierPage));
    params.set('limit', String(supplierLimit));
    params.set('sort', sortBy);
    params.set('dir', sortDir);
    searchParams.forEach((value, key) => {
      if (['page', 'limit', 'sort', 'dir', 'envelope'].includes(key)) return;
      params.set(key, value);
    });
    if (q) params.set('q', q);
    return params;
  }, [q, searchParams, supplierPage, supplierLimit, sortBy, sortDir]);

  const { data: suppliersPayload, isLoading, isFetching } = useQuery({
    queryKey: ['suppliers', listQueryParams.toString()],
    queryFn: async () => {
      return await api<SuppliersPageResponse>('GET', `/inventory/suppliers?${listQueryParams.toString()}`);
    },
  });

  const rows = suppliersPayload?.items ?? [];
  const suppliersTotal = suppliersPayload?.total ?? 0;
  const suppliersTotalPages = Math.max(1, suppliersPayload?.total_pages ?? 1);
  
  // Filter Builder Configuration
  const filterFields: FieldConfig[] = useMemo(() => [
    {
      id: 'country',
      label: 'Country',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => allCountries.map(country => ({ value: country, label: country })),
    },
    {
      id: 'province',
      label: 'Province',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => allProvinces.map(province => ({ value: province, label: province })),
    },
    {
      id: 'city',
      label: 'City',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => allCities.map(city => ({ value: city, label: city })),
    },
  ], [allCountries, allProvinces, allCities]);

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    if (q) params.set('q', q);
    params.set('page', '1');
    params.set('sort', searchParams.get('sort') || 'name');
    params.set('dir', searchParams.get('dir') === 'desc' ? 'desc' : 'asc');
    setSearchParams(params, { replace: true });
  };

  const hasActiveFilters = currentRules.length > 0;

  // Helper to format rule value for display
  const formatRuleValue = (rule: FilterRule): string => {
    return String(rule.value);
  };

  // Helper to get field label
  const getFieldLabel = (fieldId: string): string => {
    const field = filterFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const { data: supplierProducts, isLoading: loadingProducts, refetch: refetchSupplierProducts } = useQuery({
    queryKey: ['supplierProducts', viewing?.id, viewing?.name],
    queryFn: async () => {
      if (!viewing?.name) return [];
      const allProducts = await api<any[]>('GET', '/estimate/products');
      return allProducts.filter((p: any) => p.supplier_name === viewing.name);
    },
    enabled: !!viewing?.id && !!viewing?.name && supplierTab === 'products',
  });

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

  const openProductModal = (product: any) => {
    setViewingProduct(product);
    setProductModalOpen(true);
    setProductTab('details');
    setProductUsage([]);
    setEditingProduct(null);
    setRelatedList([]);
    // Load usage data when opening modal
    if (product.id) {
      loadProductUsage(product.id);
      // Load related counts
      loadRelatedCounts([product.id]);
    }
  };

  const loadRelatedCounts = async (productIds: number[]) => {
    if (!productIds.length) return;
    try {
      const counts = await api<Record<string, number>>('GET', `/estimate/related/count?ids=${productIds.join(',')}`);
      if (counts) {
        const numCounts: Record<number, number> = {};
        Object.entries(counts).forEach(([k, v]) => {
          numCounts[Number(k)] = v;
        });
        setRelatedCounts(numCounts);
      }
    } catch (e) {
      console.error('Failed to load related counts:', e);
    }
  };

  const handleViewRelated = async (id: number) => {
    try {
      const rels = await api<any[]>('GET', `/estimate/related/${id}`);
      setRelatedList(rels);
    } catch (_e) {
      toast.error('Failed to load related');
    }
  };

  const handleAddRelated = async (targetId: number) => {
    setAddRelatedTarget(targetId);
    setAddRelatedOpen(true);
    setAddRelatedSearch('');
    setAddRelatedResults([]);
  };

  const searchRelatedProducts = async (txt: string) => {
    setAddRelatedSearch(txt);
    try {
      const params = new URLSearchParams();
      if (txt.trim()) {
        params.set('q', txt);
      }
      const results = await api<any[]>('GET', `/estimate/products/search?${params.toString()}`);
      // Filter out the current product and products already related
      const filtered = results.filter(r => r.id !== addRelatedTarget && r.id !== viewingProduct?.id);
      setAddRelatedResults(filtered);
    } catch (_e) {
      setAddRelatedResults([]);
    }
  };

  const createRelation = async (productA: number, productB: number) => {
    try {
      await api('POST', `/estimate/related/${productA}`, { related_id: productB });
      toast.success('Relation created');
      setAddRelatedOpen(false);
      // Update the current viewing product's related list
      if (viewingProduct) {
        const updatedRels = await api<any[]>('GET', `/estimate/related/${viewingProduct.id}`);
        setRelatedList(updatedRels);
        // Update related counts
        await loadRelatedCounts([viewingProduct.id]);
      }
      await refetchSupplierProducts();
    } catch (_e) {
      toast.error('Failed to create relation');
    }
  };

  const deleteRelation = async (a: number, b: number) => {
    const ok = await confirm({
      title: 'Remove relation',
      message: 'Are you sure you want to remove this relation between products?',
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });
    if (ok !== 'confirm') return;
    try {
      await api('DELETE', `/estimate/related/${a}/${b}`);
      toast.success('Relation removed');
      // Update related counts
      if (viewingProduct) {
        await loadRelatedCounts([viewingProduct.id]);
      }
      // Reload the related list
      if (viewingProduct) {
        handleViewRelated(viewingProduct.id);
      }
      await refetchSupplierProducts();
    } catch (_e) {
      toast.error('Failed to remove relation');
    }
  };

  const openEditProductModal = () => {
    if (!viewingProduct) return;
    setEditingProduct(viewingProduct);
    setEditProductName(viewingProduct.name);
    setEditProductNameError(false);
    setEditProductSupplier(viewingProduct.supplier_name || viewing?.name || '');
    setEditProductSupplierError(false);
    setEditProductCategory(viewingProduct.category || '');
    setEditProductUnit(viewingProduct.unit || '');
    setEditProductPrice(viewingProduct.price?.toString() || '');
    setEditProductPriceDisplay(viewingProduct.price?.toString() || '');
    setEditProductPriceFocused(false);
    setEditProductPriceError(false);
    setEditProductDesc(viewingProduct.description || '');
    setEditProductUnitType((viewingProduct.unit_type as any) || 'unitary');
    setEditProductUnitsPerPackage(viewingProduct.units_per_package?.toString() || '');
    setEditProductCovSqs(viewingProduct.coverage_sqs?.toString() || '');
    setEditProductCovFt2(viewingProduct.coverage_ft2?.toString() || '');
    setEditProductCovM2(viewingProduct.coverage_m2?.toString() || '');
    setEditProductImageDataUrl(viewingProduct.image_base64 || '');
    setEditProductTechnicalManualUrl(viewingProduct.technical_manual_url || '');
    setViewingProduct(null);
  };

  const onProductCoverageChange = (which: 'sqs'|'ft2'|'m2', val: string) => {
    if (!val) { setProductCovSqs(''); setProductCovFt2(''); setProductCovM2(''); return; }
    const num = parseFloat(val) || 0;
    if (which === 'sqs') {
      setProductCovSqs(val);
      setProductCovFt2(String((num * 100).toFixed(2)));
      setProductCovM2(String((num * 9.29).toFixed(2)));
    } else if (which === 'ft2') {
      setProductCovFt2(val);
      setProductCovSqs(String((num / 100).toFixed(2)));
      setProductCovM2(String((num * 0.0929).toFixed(2)));
    } else if (which === 'm2') {
      setProductCovM2(val);
      setProductCovSqs(String((num / 9.29).toFixed(2)));
      setProductCovFt2(String((num * 10.764).toFixed(2)));
    }
  };

  const onEditProductCoverageChange = (which: 'sqs'|'ft2'|'m2', val: string) => {
    if (!val) { setEditProductCovSqs(''); setEditProductCovFt2(''); setEditProductCovM2(''); return; }
    const num = parseFloat(val) || 0;
    if (which === 'sqs') {
      setEditProductCovSqs(val);
      setEditProductCovFt2(String((num * 100).toFixed(2)));
      setEditProductCovM2(String((num * 9.29).toFixed(2)));
    } else if (which === 'ft2') {
      setEditProductCovFt2(val);
      setEditProductCovSqs(String((num / 100).toFixed(2)));
      setEditProductCovM2(String((num * 0.0929).toFixed(2)));
    } else if (which === 'm2') {
      setEditProductCovM2(val);
      setEditProductCovSqs(String((num / 9.29).toFixed(2)));
      setEditProductCovFt2(String((num * 10.764).toFixed(2)));
    }
  };

  useEffect(() => {
    if (!newProductModalOpen) {
      setProductName('');
      setProductNameError(false);
      setProductCategory('');
      setProductUnit('');
      setProductPrice('');
      setProductPriceDisplay('');
      setProductPriceFocused(false);
      setProductPriceError(false);
      setProductDesc('');
      setProductUnitsPerPackage('');
      setProductCovSqs('');
      setProductCovFt2('');
      setProductCovM2('');
      setProductUnitType('unitary');
      setProductImageDataUrl('');
      setProductTechnicalManualUrl('');
    } else if (newProductModalOpen && viewing) {
      // Pre-fill supplier name if available
    }
  }, [newProductModalOpen, viewing]);

  const createMut = useMutation({
    mutationFn: async (data: any) => api('POST', '/inventory/suppliers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions-supplier'] });
      toast.success('Supplier created');
      setOpen(false);
      resetForm();
    },
    onError: () => toast.error('Failed to create supplier'),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => api('PUT', `/inventory/suppliers/${id}`, data),
    onSuccess: async (updatedSupplier) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions-supplier'] });
      toast.success('Supplier updated');
      // Set the updated supplier as viewing instead of closing
      setViewing(updatedSupplier);
      setEditing(null);
      // Reset form fields
      setName('');
      setNameError(false);
      setLegalName('');
      setEmail('');
      setPhone('');
      setWebsite('');
      setAddressLine1('');
      setAddressLine1Complement('');
      setShowAddress2(false);
      setAddressLine2('');
      setAddressLine2Complement('');
      setShowAddress3(false);
      setAddressLine3('');
      setAddressLine3Complement('');
      setCity('');
      setProvince('');
      setPostalCode('');
      setCountry('');
    },
    onError: () => toast.error('Failed to update supplier'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api('DELETE', `/inventory/suppliers/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      await queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions-supplier'] });
      await queryClient.refetchQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier deleted');
    },
    onError: () => toast.error('Failed to delete supplier'),
  });

  const resetForm = () => {
    setSupplierFormStep(1);
    setName('');
    setNameError(false);
    setLegalName('');
    setEmail('');
    setPhone('');
    setWebsite('');
    setAddressLine1('');
    setAddressLine1Complement('');
    setShowAddress2(false);
    setAddressLine2('');
    setAddressLine2Complement('');
    setShowAddress3(false);
    setAddressLine3('');
    setAddressLine3Complement('');
    setCity('');
    setProvince('');
    setPostalCode('');
    setCountry('');
    setEditing(null);
    setViewing(null);
  };

  const openViewModal = (supplier: Supplier) => {
    setViewing(supplier);
    setOpen(true);
  };
  
  const openEditModal = () => {
    if (!viewing) return;
    setEditing(viewing);
    setName(viewing.name);
    setNameError(false);
    setLegalName(viewing.legal_name || '');
    setEmail(viewing.email || '');
    setPhone(viewing.phone || '');
    setWebsite(viewing.website || '');
    setAddressLine1((viewing as any).address_line1 || '');
    setAddressLine1Complement((viewing as any).address_line1_complement || '');
    setAddressLine2((viewing as any).address_line2 || '');
    setAddressLine2Complement((viewing as any).address_line2_complement || '');
    setAddressLine3((viewing as any).address_line3 || '');
    setAddressLine3Complement((viewing as any).address_line3_complement || '');
    setShowAddress2(!!((viewing as any).address_line2 || (viewing as any).address_line2_complement));
    setShowAddress3(!!((viewing as any).address_line3 || (viewing as any).address_line3_complement));
    setCity(viewing.city || '');
    setProvince(viewing.province || '');
    setPostalCode((viewing as any).postal_code || '');
    setCountry(viewing.country || '');
    setViewing(null);
  };

  const handleImageUpdate = async (blob: Blob) => {
    if (!viewing) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageBase64 = e.target?.result as string;
      try {
        // Get the updated supplier data from the backend
        const updatedSupplier = await api<Supplier>('PUT', `/inventory/suppliers/${viewing.id}`, {
          image_base64: imageBase64
        });
        
        // Update the viewing state with the full updated supplier
        setViewing(updatedSupplier);
        
        // Force refetch to refresh the list
        await queryClient.refetchQueries({ queryKey: ['suppliers'] });
        
        toast.success('Image updated');
      } catch (error) {
        toast.error('Failed to update image');
      }
    };
    reader.readAsDataURL(blob);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError(true);
      toast.error('Name is required');
      return;
    }
    
    const data = {
      name: name.trim(),
      legal_name: legalName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      website: website.trim() || undefined,
      address_line1: addressLine1.trim() || undefined,
      address_line1_complement: addressLine1Complement.trim() || undefined,
      address_line2: addressLine2.trim() || undefined,
      address_line2_complement: addressLine2Complement.trim() || undefined,
      address_line3: addressLine3.trim() || undefined,
      address_line3_complement: addressLine3Complement.trim() || undefined,
      city: city.trim() || undefined,
      province: province.trim() || undefined,
      postal_code: postalCode.trim() || undefined,
      country: country.trim() || undefined,
      is_active: true,
    };

    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  // Track if we've loaded data at least once
  useEffect(() => {
    if (suppliersPayload) {
      hasLoadedDataRef.current = true;
    }
  }, [suppliersPayload]);

  // Check if we're still loading initial data (only show overlay if no data yet and we haven't loaded before)
  const isInitialLoading = (isLoading && !suppliersPayload) && !hasLoadedDataRef.current;

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

  const supplierTabItems = useMemo(
    () =>
      (
        [
          { key: 'overview', label: 'Overview' },
          { key: 'contacts', label: 'Contacts' },
          { key: 'products', label: 'Products' },
        ] as const
      ).filter((t) => canReadSupplierTab(isAdmin, permissions, t.key as SupplierTab)),
    [isAdmin, permissions],
  );

  useEffect(() => {
    if (supplierTabItems.length === 0) return;
    if (!supplierTabItems.some((t) => t.key === supplierTab)) {
      setSupplierTab(supplierTabItems[0].key);
    }
  }, [supplierTabItems, supplierTab]);

  const productTabItems = useMemo(() => {
    const items = [
      { key: 'details', label: 'Details' },
      { key: 'usage', label: productUsage.length > 0 ? `Usage (${productUsage.length})` : 'Usage' },
    ];
    if (canReadProductTab(isAdmin, permissions, 'related') && viewingProduct) {
      const count = relatedCounts[viewingProduct.id];
      items.push({ key: 'related', label: count ? `Related (${count})` : 'Related' });
    }
    return items.filter((t) => canReadProductTab(isAdmin, permissions, t.key as 'details' | 'usage' | 'related'));
  }, [isAdmin, permissions, viewingProduct, productUsage.length, relatedCounts]);

  const showEmptyList =
    suppliersPayload != null && rows.length === 0 && (suppliersTotal === 0 || rows.length === 0);

  const listCardAnimClass = animationComplete
    ? undefined
    : uiCx(
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]',
      );

  const supplierListPreset = resolveAppSortableListPreset('suppliers');

  const closeSupplierModal = () => {
    setOpen(false);
    resetForm();
  };

  const supplierFieldProps: SupplierFormFieldsProps = useMemo(
    () => ({
      name,
      nameError,
      legalName,
      email,
      phone,
      website,
      addressLine1,
      addressLine1Complement,
      showAddress2,
      addressLine2,
      addressLine2Complement,
      showAddress3,
      addressLine3,
      addressLine3Complement,
      city,
      province,
      postalCode,
      country,
      onNameChange: setName,
      onClearNameError: () => setNameError(false),
      onLegalNameChange: setLegalName,
      onEmailChange: setEmail,
      onPhoneChange: setPhone,
      onWebsiteChange: setWebsite,
      onAddressLine1Change: setAddressLine1,
      onAddressLine1ComplementChange: setAddressLine1Complement,
      onShowAddress2: setShowAddress2,
      onAddressLine2Change: setAddressLine2,
      onAddressLine2ComplementChange: setAddressLine2Complement,
      onShowAddress3: setShowAddress3,
      onAddressLine3Change: setAddressLine3,
      onAddressLine3ComplementChange: setAddressLine3Complement,
      onCityChange: setCity,
      onProvinceChange: setProvince,
      onPostalCodeChange: setPostalCode,
      onCountryChange: setCountry,
      onAddressSelect: (address) => {
        setAddressLine1(address.address_line1 || addressLine1);
        if (address.city !== undefined) setCity(address.city);
        if (address.province !== undefined) setProvince(address.province);
        if (address.postal_code !== undefined) setPostalCode(address.postal_code);
        if (address.country !== undefined) setCountry(address.country);
      },
    }),
    [
      name,
      nameError,
      legalName,
      email,
      phone,
      website,
      addressLine1,
      addressLine1Complement,
      showAddress2,
      addressLine2,
      addressLine2Complement,
      showAddress3,
      addressLine3,
      addressLine3Complement,
      city,
      province,
      postalCode,
      country,
      addressLine1,
    ],
  );

  const isNewSupplierForm = open && !viewing && !editing;

  // Don't render if still loading or user doesn't have permission
  if (meLoading || !canViewSuppliers) {
    return null;
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Suppliers"
        subtitle="Manage vendors and contact information"
        icon={<Truck className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search by supplier name, email, or phone..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search suppliers"
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
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear
            </AppButton>
          )}
        </div>
      </AppCard>

      {hasActiveFilters && (
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
          {currentRules.map((rule) => (
            <FilterChip
              key={rule.id}
              rule={rule}
              onRemove={() => {
                const updatedRules = currentRules.filter((r) => r.id !== rule.id);
                const params = convertRulesToParams(updatedRules);
                if (q) params.set('q', q);
                params.set('page', '1');
                params.set('sort', sortBy);
                params.set('dir', sortDir);
                setSearchParams(params, { replace: true });
              }}
              getValueLabel={formatRuleValue}
              getFieldLabel={getFieldLabel}
            />
          ))}
        </div>
      )}

      <LoadingOverlay isLoading={isInitialLoading} text="Loading suppliers...">
        <AppCard
          className={uiCx(uiShadows.card, listCardAnimClass)}
          bodyClassName="!p-0"
          footer={
            suppliersTotal > 0 ? (
              <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
                <p className={uiTypography.helper}>
                  Showing {((supplierPage - 1) * supplierLimit) + 1} to{' '}
                  {Math.min(supplierPage * supplierLimit, suppliersTotal)} of {suppliersTotal} suppliers
                </p>
                <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={supplierPage <= 1 || isFetching}
                    onClick={() => {
                      const p = new URLSearchParams(searchParams);
                      p.set('page', String(Math.max(1, supplierPage - 1)));
                      setSearchParams(p, { replace: true });
                    }}
                  >
                    Previous
                  </AppButton>
                  <span className={uiTypography.helper}>
                    Page {supplierPage} of {suppliersTotalPages}
                  </span>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={supplierPage >= suppliersTotalPages || isFetching}
                    onClick={() => {
                      const p = new URLSearchParams(searchParams);
                      p.set('page', String(Math.min(suppliersTotalPages, supplierPage + 1)));
                      setSearchParams(p, { replace: true });
                    }}
                  >
                    Next
                  </AppButton>
                </div>
              </div>
            ) : undefined
          }
        >
          <div className="flex flex-col">
            {showEmptyList ? (
              <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack, 'min-h-[12rem] pb-10')}>
                {canEditSuppliers ? (
                  <AppListCreateItem
                    label="New Supplier"
                    layout="row"
                    className="w-full"
                    onClick={() => {
                      resetForm();
                      setOpen(true);
                    }}
                  />
                ) : null}
                <AppEmptyState
                  title="No suppliers found matching your criteria."
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </div>
            ) : (
              <>
                {canEditSuppliers && (
                  <div className={uiCx(uiSpacing.cardPadding, rows.length === 0 ? 'pb-10' : 'pb-3')}>
                    <AppListCreateItem
                      label="New Supplier"
                      layout="row"
                      className={uiCx('w-full', supplierListPreset.minWidth)}
                      onClick={() => {
                        resetForm();
                        setOpen(true);
                      }}
                    />
                  </div>
                )}
                {!isLoading && rows.length > 0 ? (
                  <AppSortableEntityList layout="flat">
                    <AppSortableEntityListHeader variant="flat" preset="suppliers">
                      <AppSortableEntityListSortColumn
                        label="Supplier"
                        column="name"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                        title="Sort by supplier name"
                      />
                      <AppSortableEntityListSortColumn
                        label="Email"
                        column="email"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                        title="Sort by email"
                      />
                      <AppSortableEntityListSortColumn
                        label="Phone"
                        column="phone"
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={setListSort}
                        title="Sort by phone"
                      />
                    </AppSortableEntityListHeader>
                    <AppSortableEntityListFlatBody preset="suppliers">
                      {rows.map((s) => (
                        <SupplierSortableRow key={s.id} s={s} onOpen={() => openViewModal(s)} />
                      ))}
                    </AppSortableEntityListFlatBody>
                  </AppSortableEntityList>
                ) : null}
              </>
            )}
          </div>
        </AppCard>
      </LoadingOverlay>

      <AppFormModal
        open={open}
        onClose={closeSupplierModal}
        layout={viewing && !editing ? 'detail' : 'form'}
        formWidth="wide"
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        title={
          viewing && !editing
            ? 'Supplier Information'
            : editing
              ? 'Edit Supplier'
              : 'New Supplier'
        }
        description={
          viewing && !editing
            ? `${viewing.name} — profile, contacts, and products`
            : editing
              ? 'Update supplier information'
              : supplierFormStep === 1
                ? 'Company details'
                : 'Address'
        }
        headerExtra={isNewSupplierForm ? supplierFormStepPills(supplierFormStep, 2) : undefined}
        quickInfo={
          viewing && !editing
            ? supplierDetailQuickInfo(canEditSupplierOverview)
            : supplierFormQuickInfo(!!editing)
        }
        bodyClassName={viewing && !editing ? uiCx(uiSpacing.cardPadding, 'min-w-0') : undefined}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            {viewing && !editing ? (
              <>
                <AppButton type="button" variant="secondary" size="sm" onClick={closeSupplierModal}>
                  Close
                </AppButton>
                {canEditSuppliers || canEditSupplierOverview ? (
                  <>
                    {canEditSuppliers ? (
                    <AppButton type="button" variant="danger" size="sm" onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete supplier',
                        message: 'Are you sure you want to delete this supplier? This action cannot be undone.',
                        confirmText: 'Delete',
                        cancelText: 'Cancel',
                      });
                      if (ok === 'confirm' && viewing) {
                        deleteMut.mutate(viewing.id);
                        closeSupplierModal();
                      }
                    }}>
                      Delete
                    </AppButton>
                    ) : null}
                    {canEditSupplierOverview ? (
                    <AppButton type="button" size="sm" onClick={openEditModal}>
                      Edit
                    </AppButton>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : editing ? (
              <>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setViewing(editing);
                    setEditing(null);
                    setName('');
                    setNameError(false);
                    setLegalName('');
                    setEmail('');
                    setPhone('');
                    setWebsite('');
                    setAddressLine1('');
                    setAddressLine1Complement('');
                    setShowAddress2(false);
                    setAddressLine2('');
                    setAddressLine2Complement('');
                    setShowAddress3(false);
                    setAddressLine3('');
                    setAddressLine3Complement('');
                    setCity('');
                    setProvince('');
                    setPostalCode('');
                    setCountry('');
                  }}
                >
                  Cancel
                </AppButton>
                <AppButton
                  type="button"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={updateMut.isPending}
                  loading={updateMut.isPending}
                >
                  Update
                </AppButton>
              </>
            ) : (
              <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
                <span className={uiTypography.helper}>Step {supplierFormStep} of 2</span>
                <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
                  <AppButton type="button" variant="secondary" size="sm" onClick={closeSupplierModal}>
                    Cancel
                  </AppButton>
                  {supplierFormStep > 1 ? (
                    <AppButton type="button" variant="secondary" size="sm" onClick={() => setSupplierFormStep(1)}>
                      Back
                    </AppButton>
                  ) : null}
                  {supplierFormStep === 1 ? (
                    <AppButton
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (!name.trim()) {
                          setNameError(true);
                          toast.error('Name is required');
                          return;
                        }
                        setSupplierFormStep(2);
                      }}
                    >
                      Next
                    </AppButton>
                  ) : (
                    <AppButton
                      type="button"
                      size="sm"
                      onClick={handleSubmit}
                      disabled={createMut.isPending}
                      loading={createMut.isPending}
                    >
                      Create
                    </AppButton>
                  )}
                </div>
              </div>
            )}
          </div>
        }
      >
        {viewing && !editing ? (
          <div className={uiSpacing.sectionStack}>
            <div className={uiCx(uiLayout.actionsRow, 'items-start gap-4')}>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className={uiCx(
                  'relative h-16 w-16 shrink-0 overflow-hidden border hover:border-brand-red transition-colors group',
                  uiRadius.control,
                  uiBorders.subtle,
                )}
              >
                <img
                  src={viewing.image_base64 || '/ui/assets/placeholders/supplier.png'}
                  className="h-full w-full object-cover"
                  alt={viewing.name}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Change
                </div>
              </button>
              <div className="min-w-0 flex-1">
                <h2 className={uiTypography.sectionTitle}>{viewing.name}</h2>
                {viewing.legal_name && viewing.legal_name !== viewing.name ? (
                  <p className={uiTypography.helper}>{viewing.legal_name}</p>
                ) : null}
                <div className={uiCx(uiLayout.actionsRow, 'mt-2 flex-wrap gap-3', uiTypography.body)}>
                  {viewing.email && <span>{viewing.email}</span>}
                  {viewing.phone && <span>{formatPhone(viewing.phone)}</span>}
                </div>
              </div>
            </div>

            <AppTabs
              tabs={supplierTabItems}
              value={supplierTab}
              onChange={(key) => setSupplierTab(key as typeof supplierTab)}
            />

            {supplierTab === 'overview' ? (
                <div className={uiSpacing.sectionStack}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {viewing.website && (
                      <AppCard bodyClassName={uiSpacing.cardPadding}>
                        <div className={uiTypography.overline}>Website</div>
                        <a href={viewing.website} target="_blank" rel="noopener noreferrer" className={uiCx(uiTypography.body, 'text-brand-red hover:underline')}>
                          {viewing.website}
                        </a>
                      </AppCard>
                    )}
                    {viewing.legal_name && (
                      <AppCard bodyClassName={uiSpacing.cardPadding}>
                        <div className={uiTypography.overline}>Legal Name</div>
                        <div className={uiTypography.body}>{viewing.legal_name}</div>
                      </AppCard>
                    )}
                  </div>
                  {((viewing as any).address_line1 || viewing.city || viewing.province || (viewing as any).postal_code || viewing.country) && (
                    <AppCard bodyClassName={uiSpacing.cardPadding}>
                      <div className={uiCx(uiTypography.sectionTitle, 'mb-2')}>Address</div>
                      <div className={uiCx(uiSpacing.sectionStack, uiTypography.body)}>
                        {(viewing as any).address_line1 && <div>{(viewing as any).address_line1}</div>}
                        {(viewing as any).address_line2 && <div>{(viewing as any).address_line2}</div>}
                        <div>{[viewing.city, viewing.province, (viewing as any).postal_code].filter(Boolean).join(', ')}</div>
                        {viewing.country && <div>{viewing.country}</div>}
                      </div>
                    </AppCard>
                  )}
                </div>
              ) : supplierTab === 'contacts' && viewing ? (
                <SupplierContactsCard
                  supplierId={viewing.id}
                  supplierDisplayName={viewing.name}
                  hasEditPermission={canEditSupplierContacts}
                />
              ) : (
                <div>
                      {loadingProducts ? (
                        <div className="flex items-center justify-center py-12 text-gray-500">
                          Loading products...
                        </div>
                      ) : supplierProducts && supplierProducts.length > 0 ? (
                        <div className="grid grid-cols-6 gap-3">
                          {(canEditSupplierProductsTab || canEditProducts) && (
                            <button
                              onClick={() => setNewProductModalOpen(true)}
                              className="border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[200px]"
                            >
                              <div className="text-4xl text-gray-400 mb-2">+</div>
                              <div className="font-medium text-sm text-gray-700">New Product</div>
                              <div className="text-xs text-gray-500 mt-1">Add new product to {viewing.name}</div>
                            </button>
                          )}
                          {supplierProducts.map((product: any) => (
                            <button
                              key={product.id}
                              onClick={() => openProductModal(product)}
                              className="border rounded-lg p-3 hover:border-brand-red hover:shadow-md transition-all bg-white flex flex-col text-left"
                            >
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
                              <div className="text-xs text-red-600 font-semibold mt-auto">
                                ${Number(product.price || 0).toFixed(2)}
                              </div>
                              {product.unit && (
                                <div className="text-xs text-gray-500">Unit: {product.unit}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                          <div className="mb-4">No products found for this supplier</div>
                          {(canEditSupplierProductsTab || canEditProducts) && (
                            <button
                              onClick={() => setNewProductModalOpen(true)}
                              className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center w-64"
                            >
                              <div className="text-4xl text-gray-400 mb-2">+</div>
                              <div className="font-medium text-sm text-gray-700">New Product</div>
                              <div className="text-xs text-gray-500 mt-1">Add new product to {viewing.name}</div>
                            </button>
                          )}
                        </div>
                      )}
                </div>
              )}
          </div>
        ) : editing ? (
          <div className={uiSpacing.sectionStack}>
            <SupplierCompanyFields {...supplierFieldProps} />
            <SupplierAddressFields {...supplierFieldProps} />
          </div>
        ) : supplierFormStep === 1 ? (
          <SupplierCompanyFields {...supplierFieldProps} />
        ) : (
          <SupplierAddressFields {...supplierFieldProps} />
        )}
      </AppFormModal>

      {pickerOpen && (
        <ImagePicker
          isOpen
          onClose={() => setPickerOpen(false)}
          targetWidth={800}
          targetHeight={800}
          allowEdit
          overlayClassName={uiModalLayer.nestedPicker}
          onConfirm={async (blob) => {
            await handleImageUpdate(blob);
            setPickerOpen(false);
          }} 
        />
      )}

      <AppFormModal
        open={!!(newProductModalOpen && viewing)}
        onClose={() => setNewProductModalOpen(false)}
        formWidth="wide"
        overlayClassName="z-[100]"
        title="New Product"
        description={viewing ? `Add new product to ${viewing.name}` : undefined}
        quickInfo={inventoryNewProductQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setNewProductModalOpen(false)}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={isSavingProduct}
              loading={isSavingProduct}
              onClick={async () => {
                if (isSavingProduct || !viewing) return;
                if (!productName.trim()) {
                  setProductNameError(true);
                  toast.error('Name is required');
                  return;
                }
                const priceValue = parseCurrency(productPrice);
                if (!priceValue || !priceValue.trim() || Number(priceValue) <= 0) {
                  setProductPriceError(true);
                  toast.error('Price is required');
                  return;
                }
                try {
                  setIsSavingProduct(true);
                  let finalImageBase64 = productImageDataUrl;
                  if (!finalImageBase64) {
                    try {
                      const response = await fetch('/ui/assets/placeholders/product.png');
                      if (response.ok) {
                        const blob = await response.blob();
                        const reader = new FileReader();
                        finalImageBase64 = await new Promise<string>((resolve) => {
                          reader.onload = () => resolve(reader.result as string);
                          reader.readAsDataURL(blob);
                        });
                      }
                    } catch (e) {
                      console.warn('Failed to load default product image:', e);
                    }
                  }
                  const payload = {
                    name: productName.trim(),
                    supplier_name: viewing.name,
                    category: productCategory || null,
                    unit: productUnit || null,
                    price: Number(parseCurrency(productPrice)),
                    description: productDesc || null,
                    unit_type: productUnitType,
                    units_per_package:
                      productUnitType === 'multiple' ? (productUnitsPerPackage ? Number(productUnitsPerPackage) : null) : null,
                    coverage_sqs: productUnitType === 'coverage' ? (productCovSqs ? Number(productCovSqs) : null) : null,
                    coverage_ft2: productUnitType === 'coverage' ? (productCovFt2 ? Number(productCovFt2) : null) : null,
                    coverage_m2: productUnitType === 'coverage' ? (productCovM2 ? Number(productCovM2) : null) : null,
                    image_base64: finalImageBase64 || null,
                    technical_manual_url: productTechnicalManualUrl || null,
                  };
                  await api('POST', '/estimate/products', payload);
                  toast.success('Product created');
                  setNewProductModalOpen(false);
                  await refetchSupplierProducts();
                  queryClient.invalidateQueries({ queryKey: ['supplierProducts'] });
                } catch (e: any) {
                  toast.error(e?.message || 'Failed to create product');
                } finally {
                  setIsSavingProduct(false);
                }
              }}
            >
              {isSavingProduct ? 'Creating...' : 'Create Product'}
            </AppButton>
          </div>
        }
      >
        {viewing && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AppInput
              className="sm:col-span-2"
              label={
                <>
                  Name <span className="text-red-600">*</span>
                </>
              }
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                if (productNameError) setProductNameError(false);
              }}
              error={productNameError && !productName.trim() ? 'This field is required' : undefined}
              fieldHint="Name\n\nProduct name as shown in estimates and the catalog."
            />
            <AppInput
              label="Supplier"
              value={viewing.name}
              readOnly
              tabIndex={-1}
              inputClassName="cursor-default bg-gray-50"
              fieldHint="Supplier\n\nLocked to the supplier you are viewing."
            />
            <AppInput
              label="Category"
              value={productCategory}
              onChange={(e) => setProductCategory(e.target.value)}
              fieldHint="Category\n\nOptional grouping (e.g. lumber, fasteners)."
            />
            <AppInput
              label="Sell Unit"
              placeholder="e.g., Roll, Pail (20L), Box"
              value={productUnit}
              onChange={(e) => setProductUnit(e.target.value)}
              fieldHint="Sell Unit\n\nHow this item is sold (roll, box, each, etc.)."
            />
            <AppInput
              label={
                <>
                  Price ($) <span className="text-red-600">*</span>
                </>
              }
              placeholder="$0.00"
              value={productPriceFocused ? productPriceDisplay : productPrice ? formatCurrency(productPrice) : ''}
              onFocus={() => {
                setProductPriceFocused(true);
                setProductPriceDisplay(productPrice || '');
              }}
              onBlur={() => {
                setProductPriceFocused(false);
                const parsed = parseCurrency(productPriceDisplay);
                setProductPrice(parsed);
                setProductPriceDisplay(parsed);
                if (productPriceError && parsed && Number(parsed) > 0) setProductPriceError(false);
              }}
              onChange={(e) => setProductPriceDisplay(e.target.value)}
              error={
                productPriceError && (!productPrice || !productPrice.trim() || Number(parseCurrency(productPrice)) <= 0)
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
                    <div className="flex items-center gap-6 mt-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input 
                          type="radio" 
                          name="unit-type-supplier" 
                          checked={productUnitType==='unitary'} 
                          onChange={()=>{ 
                            setProductUnitType('unitary'); 
                            setProductUnitsPerPackage(''); 
                            setProductCovSqs(''); 
                            setProductCovFt2(''); 
                            setProductCovM2(''); 
                          }} 
                        /> 
                        Unitary
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input 
                          type="radio" 
                          name="unit-type-supplier" 
                          checked={productUnitType==='multiple'} 
                          onChange={()=>{ 
                            setProductUnitType('multiple'); 
                            setProductCovSqs(''); 
                            setProductCovFt2(''); 
                            setProductCovM2(''); 
                          }} 
                        /> 
                        Multiple
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input 
                          type="radio" 
                          name="unit-type-supplier" 
                          checked={productUnitType==='coverage'} 
                          onChange={()=>{ 
                            setProductUnitType('coverage'); 
                            setProductUnitsPerPackage(''); 
                          }} 
                        /> 
                        Coverage
                      </label>
                    </div>
                  </div>
            {productUnitType === 'multiple' && (
              <AppInput
                className="sm:col-span-2"
                label="Units per Package"
                type="number"
                step="0.01"
                value={productUnitsPerPackage}
                onChange={(e) => setProductUnitsPerPackage(e.target.value)}
                fieldHint="Units per Package\n\nHow many units are included in one package."
              />
            )}
            {productUnitType === 'coverage' && (
              <div className="sm:col-span-2 space-y-1.5">
                <AppControlLabelRow
                  label="Coverage Area"
                  fieldHint={
                    <AppFieldHint hint="Coverage Area\n\nEnter one value; the others convert automatically (SQS, ft², m²)." />
                  }
                />
                <div className={uiCx(uiLayout.actionsRow, 'items-center gap-2')}>
                  <AppInput placeholder="0" value={productCovSqs} onChange={(e) => onProductCoverageChange('sqs', e.target.value)} />
                  <span className={uiTypography.body}>SQS</span>
                  <span className="text-gray-400">=</span>
                  <AppInput placeholder="0" value={productCovFt2} onChange={(e) => onProductCoverageChange('ft2', e.target.value)} />
                  <span className={uiTypography.body}>ft²</span>
                  <span className="text-gray-400">=</span>
                  <AppInput placeholder="0" value={productCovM2} onChange={(e) => onProductCoverageChange('m2', e.target.value)} />
                  <span className={uiTypography.body}>m²</span>
                </div>
              </div>
            )}
            <AppTextarea
              className="sm:col-span-2"
              label="Description / Notes"
              rows={3}
              value={productDesc}
              onChange={(e) => setProductDesc(e.target.value)}
              fieldHint="Description / Notes\n\nOptional product details for estimators."
            />
            <AppInput
              className="sm:col-span-2"
              label="Technical Manual URL"
              type="url"
              placeholder="https://supplier.com/manual/product"
              value={productTechnicalManualUrl}
              onChange={(e) => setProductTechnicalManualUrl(e.target.value)}
              fieldHint="Technical Manual URL\n\nLink to the product manual or spec sheet."
            />
            <div className="sm:col-span-2 space-y-2">
              <AppControlLabelRow
                label="Product Image"
                fieldHint={<AppFieldHint hint="Product Image\n\nOptional photo for the catalog tile." />}
              />
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setProductImagePickerOpen(true)}>
                {productImageDataUrl ? 'Change Image' : 'Select Image'}
              </AppButton>
              {productImageDataUrl && (
                <div>
                  <img src={productImageDataUrl} className={uiCx('h-32 w-32 object-contain border', uiRadius.control)} alt="Preview" />
                  <AppButton type="button" variant="ghost" size="sm" className="mt-2 text-red-700" onClick={() => setProductImageDataUrl('')}>
                    Remove Image
                  </AppButton>
                </div>
              )}
            </div>
          </div>
        )}
      </AppFormModal>

      {productImagePickerOpen && (
        <ImagePicker
          isOpen
          onClose={() => setProductImagePickerOpen(false)}
          targetWidth={800}
          targetHeight={800}
          allowEdit
          overlayClassName={uiModalLayer.nestedPicker}
          onConfirm={async (blob) => {
            const reader = new FileReader();
            reader.onload = () => {
              setProductImageDataUrl(String(reader.result || ''));
              setProductImagePickerOpen(false);
            };
            reader.readAsDataURL(blob);
          }}
        />
      )}

      <AppFormModal
        open={productModalOpen && !!(viewingProduct || editingProduct)}
        onClose={() => {
          if (editingProduct) {
            setViewingProduct(editingProduct);
            setEditingProduct(null);
          } else {
            setProductModalOpen(false);
            setViewingProduct(null);
          }
        }}
        layout={viewingProduct && !editingProduct ? 'detail' : 'form'}
        formWidth="wide"
        overlayClassName="z-[110]"
        title={
          viewingProduct && !editingProduct
            ? 'Product Information'
            : editingProduct
              ? 'Edit Product'
              : 'Product'
        }
        description={
          viewingProduct && !editingProduct
            ? `${viewingProduct.name} — pricing, usage, and related items`
            : editingProduct
              ? 'Update product information'
              : undefined
        }
        quickInfo={
          viewingProduct && !editingProduct ? productDetailQuickInfo(canEditProductDetails) : undefined
        }
        bodyClassName={viewingProduct && !editingProduct ? uiCx(uiSpacing.cardPadding, 'min-w-0') : undefined}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            {viewingProduct && !editingProduct ? (
              <>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setProductModalOpen(false);
                    setViewingProduct(null);
                  }}
                >
                  Close
                </AppButton>
                {canEditProductDetails ? (
                  <AppButton type="button" size="sm" onClick={openEditProductModal}>
                    Edit
                  </AppButton>
                ) : null}
              </>
            ) : editingProduct ? (
              <>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setViewingProduct(editingProduct);
                    setEditingProduct(null);
                    setEditProductName('');
                    setEditProductNameError(false);
                    setEditProductSupplier('');
                    setEditProductSupplierError(false);
                    setEditProductCategory('');
                    setEditProductUnit('');
                    setEditProductPrice('');
                    setEditProductPriceDisplay('');
                    setEditProductPriceFocused(false);
                    setEditProductPriceError(false);
                    setEditProductDesc('');
                    setEditProductUnitsPerPackage('');
                    setEditProductCovSqs('');
                    setEditProductCovFt2('');
                    setEditProductCovM2('');
                    setEditProductUnitType('unitary');
                    setEditProductImageDataUrl('');
                    setEditProductTechnicalManualUrl('');
                  }}
                >
                  Cancel
                </AppButton>
                <AppButton
                  type="button"
                  size="sm"
                  disabled={isSavingEditProduct}
                  loading={isSavingEditProduct}
                  onClick={async () => {
                    if (isSavingEditProduct) return;
                    if (!editProductName.trim()) {
                      setEditProductNameError(true);
                      toast.error('Name is required');
                      return;
                    }
                    if (!editProductSupplier.trim()) {
                      setEditProductSupplierError(true);
                      toast.error('Supplier is required');
                      return;
                    }
                    const priceValue = parseCurrency(editProductPrice);
                    if (!priceValue || !priceValue.trim() || Number(priceValue) <= 0) {
                      setEditProductPriceError(true);
                      toast.error('Price is required');
                      return;
                    }
                    try {
                      setIsSavingEditProduct(true);
                      const payload = {
                        name: editProductName.trim(),
                        supplier_name: editProductSupplier.trim(),
                        category: editProductCategory || null,
                        unit: editProductUnit || null,
                        price: Number(parseCurrency(editProductPrice)),
                        description: editProductDesc || null,
                        unit_type: editProductUnitType,
                        units_per_package:
                          editProductUnitType === 'multiple'
                            ? editProductUnitsPerPackage
                              ? Number(editProductUnitsPerPackage)
                              : null
                            : null,
                        coverage_sqs:
                          editProductUnitType === 'coverage' ? (editProductCovSqs ? Number(editProductCovSqs) : null) : null,
                        coverage_ft2:
                          editProductUnitType === 'coverage' ? (editProductCovFt2 ? Number(editProductCovFt2) : null) : null,
                        coverage_m2:
                          editProductUnitType === 'coverage' ? (editProductCovM2 ? Number(editProductCovM2) : null) : null,
                        image_base64: editProductImageDataUrl || null,
                        technical_manual_url: editProductTechnicalManualUrl || null,
                      };
                      const updated = await api('PUT', `/estimate/products/${editingProduct.id}`, payload);
                      toast.success('Product updated');
                      setViewingProduct(updated);
                      setEditingProduct(null);
                      setEditProductName('');
                      setEditProductNameError(false);
                      setEditProductSupplier('');
                      setEditProductSupplierError(false);
                      setEditProductCategory('');
                      setEditProductUnit('');
                      setEditProductPrice('');
                      setEditProductPriceDisplay('');
                      setEditProductPriceFocused(false);
                      setEditProductPriceError(false);
                      setEditProductDesc('');
                      setEditProductUnitsPerPackage('');
                      setEditProductCovSqs('');
                      setEditProductCovFt2('');
                      setEditProductCovM2('');
                      setEditProductUnitType('unitary');
                      setEditProductImageDataUrl('');
                      setEditProductTechnicalManualUrl('');
                      await refetchSupplierProducts();
                      queryClient.invalidateQueries({ queryKey: ['supplierProducts'] });
                      queryClient.invalidateQueries({ queryKey: ['estimateProducts'] });
                      queryClient.invalidateQueries({ queryKey: ['invProducts'] });
                    } catch (e: any) {
                      toast.error(e?.message || 'Failed to update product');
                    } finally {
                      setIsSavingEditProduct(false);
                    }
                  }}
                >
                  {isSavingEditProduct ? 'Updating...' : 'Update'}
                </AppButton>
              </>
            ) : null}
          </div>
        }
      >
        {viewingProduct && !editingProduct ? (
          <div className={uiSpacing.sectionStack}>
            <div className={uiCx(uiLayout.actionsRow, 'items-start gap-4')}>
              <img
                src={viewingProduct.image_base64 || '/ui/assets/placeholders/product.png'}
                className={uiCx('h-16 w-16 shrink-0 object-cover border', uiRadius.control, uiBorders.subtle)}
                alt={viewingProduct.name}
              />
              <div className="min-w-0 flex-1">
                <h2 className={uiTypography.sectionTitle}>{viewingProduct.name}</h2>
                <div className={uiCx(uiLayout.actionsRow, 'mt-1 flex-wrap gap-3', uiTypography.helper)}>
                  {viewingProduct.supplier_name && <span>{viewingProduct.supplier_name}</span>}
                  {viewingProduct.category && <span>{viewingProduct.category}</span>}
                </div>
              </div>
            </div>

            <AppTabs
              tabs={productTabItems}
              value={productTab}
              onChange={(key) => {
                setProductTab(key as typeof productTab);
                if (key === 'related' && viewingProduct?.id) {
                  handleViewRelated(viewingProduct.id);
                }
              }}
            />

            {productTab === 'details' ? (
                  <div className="rounded-xl border bg-white p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {viewingProduct.unit && (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Sell Unit</div>
                          <div className="text-sm text-gray-900">{viewingProduct.unit}</div>
                        </div>
                      )}
                      {viewingProduct.unit_type && (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Unit Type</div>
                          <div className="text-sm text-gray-900">{viewingProduct.unit_type}</div>
                        </div>
                      )}
                    </div>
                    {typeof viewingProduct.price === 'number' && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Price</div>
                        <div className="text-sm text-gray-900 font-semibold">${viewingProduct.price.toFixed(2)}</div>
                      </div>
                    )}
                    {viewingProduct.units_per_package && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Units per Package</div>
                        <div className="text-sm text-gray-900">{viewingProduct.units_per_package}</div>
                      </div>
                    )}
                    {(viewingProduct.coverage_sqs || viewingProduct.coverage_ft2 || viewingProduct.coverage_m2) && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Coverage Area</div>
                        <div className="grid grid-cols-3 gap-2 text-sm text-gray-700">
                          <div>SQS: {viewingProduct.coverage_sqs||'-'}</div>
                          <div>ft²: {viewingProduct.coverage_ft2||'-'}</div>
                          <div>m²: {viewingProduct.coverage_m2||'-'}</div>
                        </div>
                      </div>
                    )}
                    {viewingProduct.description && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Description</div>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap">{viewingProduct.description}</div>
                      </div>
                    )}
                    {viewingProduct.technical_manual_url && (() => {
                      const url = viewingProduct.technical_manual_url.trim();
                      const absoluteUrl = url.match(/^https?:\/\//i) ? url : `https://${url}`;
                      return (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Technical Manual</div>
                            <a
                              href={absoluteUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                if (!absoluteUrl || absoluteUrl === 'https://') {
                                  e.preventDefault();
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212] transition-colors flex items-center gap-2"
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
                  <div className="rounded-xl border bg-white p-4">
                    {loadingUsage ? (
                      <div className="py-8 text-center text-sm text-gray-500">Loading usage data...</div>
                    ) : productUsage.length === 0 ? (
                      <div className="py-8 text-center text-sm text-gray-500">
                        <div className="text-base mb-2">📦</div>
                        <div>This product is not being used in any estimates.</div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-xs text-gray-600 mb-4">
                          This product is being used in {productUsage.length} estimate{productUsage.length !== 1 ? 's' : ''}:
                        </div>
                        <div className="border rounded-lg divide-y">
                          {productUsage.map((usage, idx) => (
                            <div key={idx} className="p-3 hover:bg-gray-50">
                              {usage.status === 'orphaned' ? (
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">Orphaned Estimate</div>
                                    <div className="text-xs text-gray-500">Estimate #{usage.estimate_id} (deleted)</div>
                                  </div>
                                  <span className="px-2 py-0.5 text-[10px] rounded bg-amber-100 text-amber-800">Orphaned</span>
                                </div>
                              ) : usage.status === 'project_deleted' || usage.project_deleted ? (
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-900">{usage.project_name || 'Project Deleted'}</div>
                                    <div className="text-xs text-gray-500">Estimate #{usage.estimate_id} - Project was deleted</div>
                                    {usage.created_at && (
                                      <div className="text-[10px] text-gray-400 mt-1">
                                        Created: {new Date(usage.created_at).toLocaleDateString()}
                                      </div>
                                    )}
                                  </div>
                                  <span className="px-2 py-0.5 text-[10px] rounded bg-red-100 text-red-800">Project Deleted</span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    {usage.project_name ? (
                                      <>
                                        <div className="text-sm font-medium text-gray-900">{usage.project_name}</div>
                                        {usage.client_name && (
                                          <div className="text-xs text-gray-500">Client: {usage.client_name}</div>
                                        )}
                                        {usage.created_at && (
                                          <div className="text-[10px] text-gray-400 mt-1">
                                            Created: {new Date(usage.created_at).toLocaleDateString()}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-xs text-gray-500">No project associated</div>
                                    )}
                                  </div>
                                  {usage.project_id && !usage.project_deleted && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigate(`/projects/${usage.project_id}`);
                                        setProductModalOpen(false);
                                        setViewingProduct(null);
                                      }}
                                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-red text-white hover:bg-[#aa1212] transition-colors"
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
                ) : productTab === 'related' && viewingProduct ? (
                  <div className="rounded-xl border bg-white p-4">
                    {Array.isArray(relatedList) && relatedList.length ? (
                      <div className="space-y-3">
                        <div className="text-xs text-gray-600 mb-4">
                          This product is related to {relatedList.length} product{relatedList.length !== 1 ? 's' : ''}:
                        </div>
                        <div className="border rounded-lg divide-y">
                          {relatedList.map((r: any, i: number) => (
                            <div key={i} className="p-3 hover:bg-gray-50 flex items-center gap-3">
                              <img
                                src={r.image_base64 || '/ui/assets/placeholders/product.png'}
                                className="w-12 h-12 rounded-lg border object-cover flex-shrink-0"
                                alt={r.name}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">{r.name}</div>
                                {r.supplier_name && (
                                  <div className="text-xs text-gray-500">Supplier: {r.supplier_name}</div>
                                )}
                                {typeof r.price === 'number' && (
                                  <div className="text-xs text-brand-red font-semibold mt-0.5">
                                    ${r.price.toFixed(2)}
                                  </div>
                                )}
                              </div>
                              {canEditProductRelated && (
                                <button
                                  type="button"
                                  onClick={() => deleteRelation(viewingProduct.id, r.id)}
                                  className="px-2 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 flex-shrink-0"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        {canEditProductRelated && (
                          <button
                            type="button"
                            onClick={() => handleAddRelated(viewingProduct.id)}
                            className="w-full mt-4 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212] transition-colors"
                          >
                            + Add Related Product
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-gray-500">
                        <div className="text-base mb-2">🔗</div>
                        <div>This product has no related products.</div>
                        {canEditProductRelated && (
                          <button
                            type="button"
                            onClick={() => handleAddRelated(viewingProduct.id)}
                            className="mt-4 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212] transition-colors"
                          >
                            + Add Related Product
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
          </div>
        ) : editingProduct ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="col-span-2">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                        Name <span className="text-red-600">*</span>
                      </label>
                      <input 
                        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${editProductNameError && !editProductName.trim() ? 'border-red-500' : ''}`}
                        value={editProductName} 
                        onChange={e=>{
                          setEditProductName(e.target.value);
                          if (editProductNameError) setEditProductNameError(false);
                        }} 
                      />
                      {editProductNameError && !editProductName.trim() && (
                        <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                        Supplier <span className="text-red-600">*</span>
                      </label>
                      <SupplierSelect
                        value={editProductSupplier}
                        onChange={(value) => {
                          setEditProductSupplier(value);
                          if (editProductSupplierError) setEditProductSupplierError(false);
                        }}
                        error={editProductSupplierError && !editProductSupplier.trim()}
                        placeholder="Select a supplier"
                        className="[&_button]:text-sm"
                      />
                      {editProductSupplierError && !editProductSupplier.trim() && (
                        <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Category</label>
                      <input 
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                        value={editProductCategory} 
                        onChange={e=>setEditProductCategory(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Sell Unit</label>
                      <input 
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                        placeholder="e.g., Roll, Pail (20L), Box" 
                        value={editProductUnit} 
                        onChange={e=>setEditProductUnit(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                        Price ($) <span className="text-red-600">*</span>
                      </label>
                      <input 
                        type="text" 
                        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm ${editProductPriceError && (!editProductPrice || !editProductPrice.trim() || Number(parseCurrency(editProductPrice)) <= 0) ? 'border-red-500' : ''}`}
                        placeholder="$0.00"
                        value={editProductPriceFocused ? editProductPriceDisplay : (editProductPrice ? formatCurrency(editProductPrice) : '')}
                        onFocus={() => {
                          setEditProductPriceFocused(true);
                          setEditProductPriceDisplay(editProductPrice || '');
                        }}
                        onBlur={() => {
                          setEditProductPriceFocused(false);
                          const parsed = parseCurrency(editProductPriceDisplay);
                          setEditProductPrice(parsed);
                          setEditProductPriceDisplay(parsed);
                          if (editProductPriceError && parsed && Number(parsed) > 0) setEditProductPriceError(false);
                        }}
                        onChange={e => {
                          const raw = e.target.value;
                          setEditProductPriceDisplay(raw);
                        }}
                      />
                      {editProductPriceError && (!editProductPrice || !editProductPrice.trim() || Number(parseCurrency(editProductPrice)) <= 0) && (
                        <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Unit Type</label>
                      <div className="flex items-center gap-6 mt-1">
                        <label className="flex items-center gap-2 text-sm">
                          <input 
                            type="radio" 
                            name="unit-type-edit" 
                            checked={editProductUnitType==='unitary'} 
                            onChange={()=>{ 
                              setEditProductUnitType('unitary'); 
                              setEditProductUnitsPerPackage(''); 
                              setEditProductCovSqs(''); 
                              setEditProductCovFt2(''); 
                              setEditProductCovM2(''); 
                            }} 
                          /> 
                          Unitary
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input 
                            type="radio" 
                            name="unit-type-edit" 
                            checked={editProductUnitType==='multiple'} 
                            onChange={()=>{ 
                              setEditProductUnitType('multiple'); 
                              setEditProductCovSqs(''); 
                              setEditProductCovFt2(''); 
                              setEditProductCovM2(''); 
                            }} 
                          /> 
                          Multiple
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input 
                            type="radio" 
                            name="unit-type-edit" 
                            checked={editProductUnitType==='coverage'} 
                            onChange={()=>{ 
                              setEditProductUnitType('coverage'); 
                              setEditProductUnitsPerPackage(''); 
                            }} 
                          /> 
                          Coverage
                        </label>
                      </div>
                    </div>
                    {editProductUnitType==='multiple' && (
                      <div className="col-span-2">
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Units per Package</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                          value={editProductUnitsPerPackage} 
                          onChange={e=>setEditProductUnitsPerPackage(e.target.value)} 
                        />
                      </div>
                    )}
                    {editProductUnitType==='coverage' && (
                      <div className="col-span-2">
                        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Coverage Area</label>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 flex items-center gap-1">
                            <input 
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                              placeholder="0" 
                              value={editProductCovSqs} 
                              onChange={e=> onEditProductCoverageChange('sqs', e.target.value)} 
                            />
                            <span className="text-sm text-gray-600 whitespace-nowrap">SQS</span>
                          </div>
                          <span className="text-gray-400">=</span>
                          <div className="flex-1 flex items-center gap-1">
                            <input 
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                              placeholder="0" 
                              value={editProductCovFt2} 
                              onChange={e=> onEditProductCoverageChange('ft2', e.target.value)} 
                            />
                            <span className="text-sm text-gray-600 whitespace-nowrap">ft²</span>
                          </div>
                          <span className="text-gray-400">=</span>
                          <div className="flex-1 flex items-center gap-1">
                            <input 
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                              placeholder="0" 
                              value={editProductCovM2} 
                              onChange={e=> onEditProductCoverageChange('m2', e.target.value)} 
                            />
                            <span className="text-sm text-gray-600 whitespace-nowrap">m²</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Description / Notes</label>
                      <textarea 
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                        rows={3} 
                        value={editProductDesc} 
                        onChange={e=>setEditProductDesc(e.target.value)} 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Technical Manual URL</label>
                      <input 
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                        type="url"
                        placeholder="https://supplier.com/manual/product"
                        value={editProductTechnicalManualUrl} 
                        onChange={e=>setEditProductTechnicalManualUrl(e.target.value)} 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Product Image</label>
                      <div className="mt-1 space-y-2">
                        <button
                          type="button"
                          onClick={() => setEditProductImagePickerOpen(true)}
                          className="px-3 py-2 rounded-lg text-sm bg-gray-100 hover:bg-gray-200"
                        >
                          {editProductImageDataUrl ? 'Change Image' : 'Select Image'}
                        </button>
                        {editProductImageDataUrl && (
                          <div className="mt-2">
                            <img src={editProductImageDataUrl} className="w-32 h-32 object-contain border rounded" alt="Preview" />
                            <button
                              type="button"
                              onClick={() => setEditProductImageDataUrl('')}
                              className="mt-2 px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200"
                            >
                              Remove Image
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
          </div>
        ) : null}
      </AppFormModal>

      {editProductImagePickerOpen && (
        <ImagePicker
          isOpen
          onClose={() => setEditProductImagePickerOpen(false)}
          targetWidth={800}
          targetHeight={800}
          allowEdit
          overlayClassName={uiModalLayer.nestedPicker}
          onConfirm={async (blob) => {
            const reader = new FileReader();
            reader.onload = () => {
              setEditProductImageDataUrl(String(reader.result || ''));
              setEditProductImagePickerOpen(false);
            };
            reader.readAsDataURL(blob);
          }}
        />
      )}


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
                <div className={uiCx(uiTypography.body, 'font-semibold text-brand-red')}>${Number(r.price || 0).toFixed(2)}</div>
              </button>
            ))
          ) : addRelatedResults.length === 0 && !addRelatedSearch ? (
            <div className={uiCx(uiTypography.helper, 'p-3 text-center')}>Start typing to search products...</div>
          ) : addRelatedSearch && addRelatedResults.length === 0 ? (
            <div className={uiCx(uiTypography.helper, 'p-3 text-center')}>No products found</div>
          ) : null}
        </div>
      </AppFormModal>

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

function SupplierSortableRow({ s, onOpen }: { s: Supplier; onOpen: () => void }) {
  return (
    <AppSortableEntityListRow
      variant="flat"
      preset="suppliers"
      as="div"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={s.image_base64 || '/ui/assets/placeholders/supplier.png'}
          className={uiCx('h-10 w-10 shrink-0 object-cover', uiRadius.control, uiBorders.subtle)}
          alt={s.name}
        />
        <div className="flex min-w-0 flex-col justify-center">
          <div className={uiCx(uiTypography.sectionTitle, 'truncate text-xs')}>{s.name}</div>
          {s.address_line1 ? (
            <div className={uiCx(uiTypography.helper, 'truncate text-[10px]')}>{s.address_line1}</div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center">
        <span className={uiCx(uiTypography.body, 'truncate text-xs')}>{s.email || '—'}</span>
      </div>
      <div className="flex min-w-0 items-center">
        <span className={uiCx(uiTypography.body, 'truncate text-xs')}>{s.phone ? formatPhone(s.phone) : '—'}</span>
      </div>
    </AppSortableEntityListRow>
  );
}
