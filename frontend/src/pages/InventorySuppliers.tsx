import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import ImagePicker from '@/components/ImagePicker';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { useNavigate } from 'react-router-dom';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import LoadingOverlay from '@/components/LoadingOverlay';

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
  const canViewSuppliers = isAdmin || permissions.has('inventory:suppliers:read');
  const canEditSuppliers = isAdmin || permissions.has('inventory:suppliers:write');
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
    if (!meLoading && me !== undefined && !canViewSuppliers) {
      toast.error('You do not have permission to view suppliers');
      navigate('/home');
    }
  }, [meLoading, me, canViewSuppliers, navigate]);
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
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
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
  const [pickerForContact, setPickerForContact] = useState<string | null>(null);
  const [supplierTab, setSupplierTab] = useState<'overview' | 'contacts'>('overview');
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any | null>(null);
  const [productsModalOpen, setProductsModalOpen] = useState(false);
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
  
  // Contact form fields
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactNotes, setContactNotes] = useState('');
  
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
    if (!open && !contactModalOpen && !productsModalOpen && !newProductModalOpen && !productModalOpen && !addRelatedOpen && !editProductImagePickerOpen) return;
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
        } else if (productsModalOpen) {
          setProductsModalOpen(false);
        } else if (contactModalOpen) {
          setContactModalOpen(false);
          setEditingContact(null);
        } else if (open) {
          setOpen(false);
          resetForm();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, contactModalOpen, productsModalOpen, newProductModalOpen, productModalOpen, addRelatedOpen, editProductImagePickerOpen, editingProduct]);

  // Build query params from searchParams
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    searchParams.forEach((value, key) => {
      if (key !== 'q') params.set(key, value);
    });
    return params;
  }, [q, searchParams]);
  
  const { data, isLoading, isFetching, refetch: refetchSuppliers } = useQuery({
    queryKey: ['suppliers', queryParams.toString()],
    queryFn: async () => {
      const path = queryParams.toString() ? `/inventory/suppliers?${queryParams.toString()}` : '/inventory/suppliers';
      return await api<Supplier[]>('GET', path);
    },
  });

  // Auto-apply filters when they change
  useEffect(() => {
    refetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryParams]);
  
  // Extract unique countries, provinces, and cities from suppliers data
  const allCountries = useMemo(() => {
    const countriesSet = new Set<string>();
    (data || []).forEach((s: Supplier) => {
      if (s.country) countriesSet.add(s.country);
    });
    return Array.from(countriesSet).sort();
  }, [data]);
  
  const allProvinces = useMemo(() => {
    const provincesSet = new Set<string>();
    (data || []).forEach((s: Supplier) => {
      if (s.province) provincesSet.add(s.province);
    });
    return Array.from(provincesSet).sort();
  }, [data]);
  
  const allCities = useMemo(() => {
    const citiesSet = new Set<string>();
    (data || []).forEach((s: Supplier) => {
      if (s.city) citiesSet.add(s.city);
    });
    return Array.from(citiesSet).sort();
  }, [data]);
  
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
    setSearchParams(params);
    refetchSuppliers();
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

  const { data: contactsData, refetch: refetchContacts } = useQuery({
    queryKey: ['supplierContacts', viewing?.id],
    queryFn: async () => {
      if (!viewing?.id) return [];
      return await api<any[]>('GET', `/inventory/suppliers/${viewing.id}/contacts`);
    },
    enabled: !!viewing?.id && supplierTab === 'contacts',
  });

  const { data: supplierOptions } = useQuery({ 
    queryKey: ['invSuppliersOptions-supplier'], 
    queryFn: () => api<any[]>('GET', '/inventory/suppliers') 
  });

  const { data: supplierProducts, isLoading: loadingProducts, refetch: refetchSupplierProducts } = useQuery({
    queryKey: ['supplierProducts', viewing?.id, viewing?.name],
    queryFn: async () => {
      if (!viewing?.name) return [];
      const allProducts = await api<any[]>('GET', '/estimate/products');
      return allProducts.filter((p: any) => p.supplier_name === viewing.name);
    },
    enabled: !!viewing?.id && !!viewing?.name && productsModalOpen,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier deleted');
    },
    onError: () => toast.error('Failed to delete supplier'),
  });

  const resetForm = () => {
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

  const sortedRows = useMemo(() => {
    if (!data) return [];
    const sorted = [...data];
    
    sorted.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof Supplier];
      let bVal: any = b[sortColumn as keyof Supplier];
      
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
  }, [data, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const rows = sortedRows;

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
  if (meLoading || !canViewSuppliers) {
    return null;
  }

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title Bar - same layout and font sizes as Products / TaskRequests */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">Suppliers</div>
              <div className="text-xs text-gray-500 mt-0.5">Manage vendors and contact information</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="relative">
                <input 
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-9 text-xs bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all" 
                  placeholder="Search by supplier name, email, or phone..." 
                  value={q} 
                  onChange={e=>setQ(e.target.value)} 
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <button 
              onClick={()=>setIsFilterModalOpen(true)}
              className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
            </button>
            {hasActiveFilters && (
              <button 
                onClick={()=>{
                  setQ('');
                  setSearchParams(new URLSearchParams());
                  refetchSuppliers();
                }} 
                className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          {currentRules.map((rule) => (
            <FilterChip
              key={rule.id}
              rule={rule}
              onRemove={() => {
                const updatedRules = currentRules.filter(r => r.id !== rule.id);
                const params = convertRulesToParams(updatedRules);
                if (q) params.set('q', q);
                setSearchParams(params);
                refetchSuppliers();
              }}
              getValueLabel={formatRuleValue}
              getFieldLabel={getFieldLabel}
            />
          ))}
        </div>
      )}

      <LoadingOverlay isLoading={isInitialLoading} text="Loading suppliers...">
        <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white overflow-hidden min-w-0">
          <div className="flex flex-col gap-2 overflow-x-auto">
            {canEditSuppliers && (
              <button
                onClick={() => {
                  resetForm();
                  setOpen(true);
                }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-[640px]"
              >
                <div className="text-lg text-gray-400 mr-2">+</div>
                <div className="font-medium text-xs text-gray-700">New Supplier</div>
              </button>
            )}
            {!isLoading && Array.isArray(rows) && rows.length > 0 && (
              <>
                {/* Column headers - same style as Customers list */}
                <div 
                  className="grid grid-cols-[60fr_20fr_20fr] gap-2 sm:gap-3 lg:gap-4 items-center px-4 py-2 w-full text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200 rounded-t-lg"
                  aria-hidden
                >
                  <div className="min-w-0" title="Supplier name and address">Supplier</div>
                  <div className="min-w-0" title="Email">Email</div>
                  <div className="min-w-0" title="Phone">Phone</div>
                </div>
                <div className="rounded-b-lg border border-t-0 border-gray-200 overflow-hidden min-w-0">
                  {rows.map((s) => (
                    <div
                      key={s.id}
                      className="grid grid-cols-[60fr_20fr_20fr] gap-2 sm:gap-3 lg:gap-4 items-center px-4 py-3 w-full hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 min-h-[52px]"
                      onClick={() => openViewModal(s)}
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <img
                          src={s.image_base64 || '/ui/assets/placeholders/supplier.png'}
                          className="w-10 h-10 rounded-lg border border-gray-200 object-cover flex-shrink-0"
                          alt={s.name}
                        />
                        <div className="min-w-0 flex flex-col justify-center">
                          <div className="text-xs font-semibold text-gray-900 truncate">{s.name}</div>
                          {(s as any).address_line1 && <div className="text-[10px] text-gray-500 truncate">{String((s as any).address_line1)}</div>}
                        </div>
                      </div>
                      <div className="min-w-0 flex items-center">
                        <span className="text-xs text-gray-700 truncate">{s.email || '—'}</span>
                      </div>
                      <div className="min-w-0 flex items-center">
                        <span className="text-xs text-gray-700 truncate">{s.phone ? formatPhone(s.phone) : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {!isLoading && (!Array.isArray(rows) || rows.length === 0) && (
            <div className="p-8 text-center text-xs text-gray-500">
              No suppliers found matching your criteria.
            </div>
          )}
        </div>
      </LoadingOverlay>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col shadow-xl">
              {viewing && !editing ? (
                // View mode - display supplier details
                <>
                  {/* Profile Header - new style */}
                  <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-white">
                    <div className="flex items-start gap-4">
                      <button
                        onClick={() => setPickerOpen(true)}
                        className="w-16 h-16 rounded-xl border border-gray-200 overflow-hidden hover:border-brand-red transition-colors relative group flex-shrink-0"
                      >
                        <img 
                          src={viewing.image_base64 || '/ui/assets/placeholders/supplier.png'} 
                          className="w-full h-full object-cover" 
                          alt={viewing.name}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity">
                          Change
                        </div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-semibold text-gray-900">{viewing.name}</h2>
                        {viewing.legal_name && (
                          <p className="text-xs text-gray-500 mt-0.5">{viewing.legal_name}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                          {viewing.email && <span>{viewing.email}</span>}
                          {viewing.phone && <span>{formatPhone(viewing.phone)}</span>}
                        </div>
                        {/* Tab buttons - same style as TaskRequests */}
                        <div className="flex gap-1 border-b border-gray-200 mt-3 -mb-[-1px]">
                          <button
                            onClick={() => setSupplierTab('overview')}
                            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
                              supplierTab === 'overview' 
                                ? 'border-brand-red text-brand-red' 
                                : 'border-transparent text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Overview
                          </button>
                          <button
                            onClick={() => setSupplierTab('contacts')}
                            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
                              supplierTab === 'contacts' 
                                ? 'border-brand-red text-brand-red' 
                                : 'border-transparent text-gray-600 hover:text-gray-900'
                            }`}
                          >
                            Contacts
                          </button>
                          <button
                            onClick={() => setProductsModalOpen(true)}
                            className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 border-b-2 border-transparent -mb-[1px]"
                          >
                            Products
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setOpen(false);
                          resetForm();
                        }}
                        className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl font-medium leading-none flex-shrink-0"
                        title="Close"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 overflow-y-auto">
                    {supplierTab === 'overview' ? (
                      <div className="px-4 pt-4 pb-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Website Card */}
                        {viewing.website && (
                          <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Website</div>
                            <a href={viewing.website} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-red hover:underline">
                              {viewing.website}
                            </a>
                          </div>
                        )}

                        {/* Legal Name Card */}
                        {viewing.legal_name && (
                          <div className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Legal Name</div>
                            <div className="text-xs text-gray-900">{viewing.legal_name}</div>
                          </div>
                        )}
                      </div>

                      {/* Address Card */}
                      {((viewing as any).address_line1 || viewing.city || viewing.province || (viewing as any).postal_code || viewing.country) && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="text-xs font-semibold text-gray-900 mb-2">Address</div>
                          <div className="space-y-1 text-xs text-gray-700">
                            {(viewing as any).address_line1 && <div>{(viewing as any).address_line1}</div>}
                            {(viewing as any).address_line2 && <div>{(viewing as any).address_line2}</div>}
                            <div>
                              {[viewing.city, viewing.province, (viewing as any).postal_code].filter(Boolean).join(', ')}
                            </div>
                            {viewing.country && <div>{viewing.country}</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 pt-4 pb-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-gray-900">Contacts</h3>
                        {canEditSuppliers && (
                          <button
                            onClick={() => {
                              setContactModalOpen(true);
                              setEditingContact(null);
                              setContactName('');
                              setContactEmail('');
                              setContactPhone('');
                              setContactTitle('');
                              setContactNotes('');
                            }}
                            className="px-3 py-2 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity"
                          >
                            + Add Contact
                          </button>
                        )}
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        {contactsData?.length ? (
                          contactsData.map((contact: any) => (
                            <div key={contact.id} className="rounded-xl border bg-white overflow-hidden flex group">
                              <div className="w-28 bg-gray-100 flex items-center justify-center relative">
                                {contact.image_base64 ? (
                                  <img 
                                    className="w-20 h-20 object-cover rounded border" 
                                    src={contact.image_base64}
                                    alt={contact.name}
                                  />
                                ) : viewing?.image_base64 ? (
                                  <img 
                                    className="w-20 h-20 object-cover rounded border" 
                                    src={viewing.image_base64}
                                    alt={contact.name}
                                  />
                                ) : (
                                  <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">
                                    {(contact.name||'?').slice(0,2).toUpperCase()}
                                  </div>
                                )}
                                <button 
                                  onClick={() => setPickerForContact(contact.id)} 
                                  className="hidden group-hover:block absolute right-1 bottom-1 text-[11px] px-2 py-0.5 rounded bg-black/70 text-white"
                                >
                                  Photo
                                </button>
                              </div>
                              <div className="flex-1 p-3 text-sm">
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold">{contact.name}</div>
                                  {canEditSuppliers && (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          setEditingContact(contact);
                                          setContactModalOpen(true);
                                          setContactName(contact.name || '');
                                          setContactEmail(contact.email || '');
                                          setContactPhone(contact.phone || '');
                                          setContactTitle(contact.title || '');
                                          setContactNotes(contact.notes || '');
                                        }}
                                        className="px-2 py-1 rounded bg-gray-100 text-xs"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={async () => {
                                          const ok = await confirm({
                                            title: 'Delete contact',
                                            message: 'Are you sure you want to delete this contact?',
                                            confirmText: 'Delete',
                                            cancelText: 'Cancel'
                                          });
                                          if (ok === 'confirm') {
                                            try {
                                              await api('DELETE', `/inventory/contacts/${contact.id}`);
                                              refetchContacts();
                                              toast.success('Contact deleted');
                                            } catch (error) {
                                              toast.error('Failed to delete contact');
                                            }
                                          }
                                        }}
                                        className="px-2 py-1 rounded bg-gray-100 text-xs"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {contact.title && (
                                  <div className="text-gray-600 text-xs">{contact.title}</div>
                                )}
                                <div className="mt-2">
                                  <div className="text-[11px] uppercase text-gray-500">Email</div>
                                  <div className="text-gray-700">{contact.email||'-'}</div>
                                </div>
                                <div className="mt-2">
                                  <div className="text-[11px] uppercase text-gray-500">Phone</div>
                                  <div className="text-gray-700">{contact.phone||'-'}</div>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 text-center py-8 text-gray-500">
                            No contacts yet. Add a contact to get started.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                </>
              ) : (
                // Edit/Create mode - form inputs
                <>
                  {/* Edit Header - new style */}
                  <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">
                        {editing ? 'Edit Supplier' : 'New Supplier'}
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {editing ? 'Update supplier information' : 'Add a new supplier to your inventory'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setOpen(false);
                        resetForm();
                      }}
                      className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xl font-medium leading-none"
                      title="Close"
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-4 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-700">Name *</label>
                  <input
                    type="text"
                    className={`w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 ${nameError && !name.trim() ? 'border-red-500' : ''}`}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (nameError) setNameError(false);
                    }}
                  />
                  {nameError && !name.trim() && (
                    <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-700">Legal Name</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Phone</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-700">Website</label>
                  <input
                    type="url"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-700">Address</label>
                    <AddressAutocomplete
                      value={addressLine1}
                      onChange={(value) => setAddressLine1(value)}
                      onAddressSelect={(address) => {
                        setAddressLine1(address.address_line1 || addressLine1);
                        setCity(address.city !== undefined ? address.city : city);
                        setProvince(address.province !== undefined ? address.province : province);
                        setPostalCode(address.postal_code !== undefined ? address.postal_code : postalCode);
                        setCountry(address.country !== undefined ? address.country : country);
                      }}
                      placeholder="Enter address"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700">Complement</label>
                    <input
                      type="text"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                      value={addressLine1Complement}
                      onChange={(e) => setAddressLine1Complement(e.target.value)}
                      placeholder="Apartment, Unit, Block, etc (Optional)"
                    />
                  </div>
                </div>
                {!showAddress2 && !showAddress3 && (
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={() => setShowAddress2(true)}
                      className="text-xs font-medium text-brand-red hover:underline flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add another Address
                    </button>
                  </div>
                )}
                {showAddress2 && (
                  <>
                    <div className="col-span-2 grid grid-cols-[1fr_0.8fr_auto] gap-4 items-end">
                      <div>
                        <label className="text-xs font-medium text-gray-700">Address 2</label>
                        <AddressAutocomplete
                          value={addressLine2}
                          onChange={(value) => setAddressLine2(value)}
                          onAddressSelect={(address) => {
                            setAddressLine2(address.address_line1 || addressLine2);
                          }}
                          placeholder="Enter address"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700">Complement</label>
                        <input
                          type="text"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                          value={addressLine2Complement}
                          onChange={(e) => setAddressLine2Complement(e.target.value)}
                          placeholder="Apartment, Unit, Block, etc (Optional)"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddress2(false);
                          setAddressLine2('');
                          setAddressLine2Complement('');
                          if (showAddress3) {
                            setAddressLine2(addressLine3);
                            setAddressLine2Complement(addressLine3Complement);
                            setAddressLine3('');
                            setAddressLine3Complement('');
                            setShowAddress3(false);
                          }
                        }}
                        className="mb-[2px] px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                        title="Remove Address 2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    {!showAddress3 && (
                      <div className="col-span-2">
                        <button
                          type="button"
                          onClick={() => setShowAddress3(true)}
                          className="text-xs font-medium text-brand-red hover:underline flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <div className="col-span-2 grid grid-cols-[1fr_0.8fr_auto] gap-4 items-end">
                      <div>
                        <label className="text-xs font-medium text-gray-700">Address 3</label>
                        <AddressAutocomplete
                          value={addressLine3}
                          onChange={(value) => setAddressLine3(value)}
                          onAddressSelect={(address) => {
                            setAddressLine3(address.address_line1 || addressLine3);
                          }}
                          placeholder="Enter address"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-700">Complement</label>
                        <input
                          type="text"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                          value={addressLine3Complement}
                          onChange={(e) => setAddressLine3Complement(e.target.value)}
                          placeholder="Apartment, Unit, Block, etc (Optional)"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddress3(false);
                          setAddressLine3('');
                          setAddressLine3Complement('');
                        }}
                        className="mb-[2px] px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                        title="Remove Address 3"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
                <div>
                  <label className="text-xs font-medium text-gray-700">City</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs bg-gray-50 cursor-not-allowed"
                    value={city}
                    readOnly
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Province</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs bg-gray-50 cursor-not-allowed"
                    value={province}
                    readOnly
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Postal Code</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs bg-gray-50 cursor-not-allowed"
                    value={postalCode}
                    readOnly
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Country</label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-xs bg-gray-50 cursor-not-allowed"
                    value={country}
                    readOnly
                    placeholder=""
                  />
                </div>
                    </div>
                  </div>
                </>
              )}
            <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
              {viewing && !editing ? (
                // View mode buttons
                <>
                  {canEditSuppliers && (
                    <>
                      <button
                        onClick={openEditModal}
                        className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirm({ 
                            title: 'Delete supplier', 
                            message: 'Are you sure you want to delete this supplier? This action cannot be undone.',
                            confirmText: 'Delete',
                            cancelText: 'Cancel'
                          });
                          if (ok === 'confirm') {
                            deleteMut.mutate(viewing.id);
                            setOpen(false);
                            resetForm();
                          }
                        }}
                        className="px-3 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </>
              ) : (
                // Edit/Create mode buttons
                <>
                  <button
                    onClick={() => {
                      if (editing) {
                        // If editing, go back to view mode
                        setViewing(editing);
                        setEditing(null);
                        // Reset form fields but keep viewing
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
                        setAddressLine1('');
                        setAddressLine2('');
                        setCity('');
                        setProvince('');
                        setPostalCode('');
                        setCountry('');
                      } else {
                        // If creating new, close modal
                        setOpen(false);
                        resetForm();
                      }
                    }}
                    className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={createMut.isPending || updateMut.isPending}
                    className="px-3 py-2 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {editing ? 'Update' : 'Create'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {pickerOpen && (
        <ImagePicker 
          isOpen={true} 
          onClose={() => setPickerOpen(false)} 
          targetWidth={800} 
          targetHeight={800} 
          allowEdit={true}
          onConfirm={async (blob) => {
            await handleImageUpdate(blob);
            setPickerOpen(false);
          }} 
        />
      )}

      {pickerForContact && viewing && (
        <ImagePicker 
          isOpen={true} 
          onClose={() => setPickerForContact(null)} 
          targetWidth={400} 
          targetHeight={400} 
          allowEdit={true}
          onConfirm={async (blob) => {
            try {
              const reader = new FileReader();
              reader.onload = async (e) => {
                const imageBase64 = e.target?.result as string;
                try {
                  await api('PUT', `/inventory/contacts/${pickerForContact}`, {
                    image_base64: imageBase64
                  });
                  toast.success('Contact photo updated');
                  refetchContacts();
                } catch (error) {
                  toast.error('Failed to update contact photo');
                }
              };
              reader.readAsDataURL(blob);
            } catch (error) {
              toast.error('Failed to process image');
            } finally {
              setPickerForContact(null);
            }
          }} 
        />
      )}

      {productsModalOpen && viewing && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
          <div className="w-[1200px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">
                Products from {viewing.name}
              </div>
              <button 
                onClick={() => setProductsModalOpen(false)} 
                className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" 
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingProducts ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Loading products...
                </div>
              ) : supplierProducts && supplierProducts.length > 0 ? (
                <div className="grid grid-cols-6 gap-3">
                  {/* New Product Card - First position */}
                  <button
                    onClick={() => setNewProductModalOpen(true)}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[200px]"
                  >
                    <div className="text-4xl text-gray-400 mb-2">+</div>
                    <div className="font-medium text-sm text-gray-700">New Product</div>
                    <div className="text-xs text-gray-500 mt-1">Add new product to {viewing.name}</div>
                  </button>
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
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <div className="mb-4">No products found for this supplier</div>
                  <button
                    onClick={() => setNewProductModalOpen(true)}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center w-64"
                  >
                    <div className="text-4xl text-gray-400 mb-2">+</div>
                    <div className="font-medium text-sm text-gray-700">New Product</div>
                    <div className="text-xs text-gray-500 mt-1">Add new product to {viewing.name}</div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {newProductModalOpen && viewing && (
        <>
          <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
            <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
                <div className="font-semibold text-lg text-white">New Product</div>
                <button 
                  onClick={() => setNewProductModalOpen(false)} 
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
                      className={`w-full border rounded px-3 py-2 mt-1 ${productNameError && !productName.trim() ? 'border-red-500' : ''}`}
                      value={productName} 
                      onChange={e=>{
                        setProductName(e.target.value);
                        if (productNameError) setProductNameError(false);
                      }} 
                    />
                    {productNameError && !productName.trim() && (
                      <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700">Supplier</label>
                    <input 
                      className="w-full border rounded px-3 py-2 mt-1 bg-gray-50 cursor-not-allowed"
                      value={viewing.name}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700">Category</label>
                    <input 
                      className="w-full border rounded px-3 py-2 mt-1" 
                      value={productCategory} 
                      onChange={e=>setProductCategory(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700">Sell Unit</label>
                    <input 
                      className="w-full border rounded px-3 py-2 mt-1" 
                      placeholder="e.g., Roll, Pail (20L), Box" 
                      value={productUnit} 
                      onChange={e=>setProductUnit(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-700">
                      Price ($) <span className="text-red-600">*</span>
                    </label>
                    <input 
                      type="text" 
                      className={`w-full border rounded px-3 py-2 mt-1 ${productPriceError && (!productPrice || !productPrice.trim() || Number(parseCurrency(productPrice)) <= 0) ? 'border-red-500' : ''}`}
                      placeholder="$0.00"
                      value={productPriceFocused ? productPriceDisplay : (productPrice ? formatCurrency(productPrice) : '')}
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
                      onChange={e => {
                        const raw = e.target.value;
                        setProductPriceDisplay(raw);
                      }}
                    />
                    {productPriceError && (!productPrice || !productPrice.trim() || Number(parseCurrency(productPrice)) <= 0) && (
                      <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-700">Unit Type</label>
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
                  {productUnitType==='multiple' && (
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Units per Package</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        className="w-full border rounded px-3 py-2 mt-1" 
                        value={productUnitsPerPackage} 
                        onChange={e=>setProductUnitsPerPackage(e.target.value)} 
                      />
                    </div>
                  )}
                  {productUnitType==='coverage' && (
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Coverage Area</label>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 flex items-center gap-1">
                          <input 
                            className="w-full border rounded px-3 py-2" 
                            placeholder="0" 
                            value={productCovSqs} 
                            onChange={e=> onProductCoverageChange('sqs', e.target.value)} 
                          />
                          <span className="text-sm text-gray-600 whitespace-nowrap">SQS</span>
                        </div>
                        <span className="text-gray-400">=</span>
                        <div className="flex-1 flex items-center gap-1">
                          <input 
                            className="w-full border rounded px-3 py-2" 
                            placeholder="0" 
                            value={productCovFt2} 
                            onChange={e=> onProductCoverageChange('ft2', e.target.value)} 
                          />
                          <span className="text-sm text-gray-600 whitespace-nowrap">ft²</span>
                        </div>
                        <span className="text-gray-400">=</span>
                        <div className="flex-1 flex items-center gap-1">
                          <input 
                            className="w-full border rounded px-3 py-2" 
                            placeholder="0" 
                            value={productCovM2} 
                            onChange={e=> onProductCoverageChange('m2', e.target.value)} 
                          />
                          <span className="text-sm text-gray-600 whitespace-nowrap">m²</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-700">Description / Notes</label>
                    <textarea 
                      className="w-full border rounded px-3 py-2 mt-1" 
                      rows={3} 
                      value={productDesc} 
                      onChange={e=>setProductDesc(e.target.value)} 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-700">Technical Manual URL</label>
                    <input 
                      className="w-full border rounded px-3 py-2 mt-1" 
                      type="url"
                      placeholder="https://supplier.com/manual/product"
                      value={productTechnicalManualUrl} 
                      onChange={e=>setProductTechnicalManualUrl(e.target.value)} 
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-gray-700">Product Image</label>
                    <div className="mt-1 space-y-2">
                      <button
                        type="button"
                        onClick={() => setProductImagePickerOpen(true)}
                        className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
                      >
                        {productImageDataUrl ? 'Change Image' : 'Select Image'}
                      </button>
                      {productImageDataUrl && (
                        <div className="mt-2">
                          <img src={productImageDataUrl} className="w-32 h-32 object-contain border rounded" alt="Preview" />
                          <button
                            type="button"
                            onClick={() => setProductImageDataUrl('')}
                            className="mt-2 px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200"
                          >
                            Remove Image
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
                <button 
                  onClick={() => setNewProductModalOpen(false)} 
                  className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button 
                  onClick={async()=>{
                    if(isSavingProduct) return;
                    
                    if(!productName.trim()){
                      setProductNameError(true);
                      toast.error('Name is required');
                      return;
                    }
                    
                    const priceValue = parseCurrency(productPrice);
                    if(!priceValue || !priceValue.trim() || Number(priceValue) <= 0){
                      setProductPriceError(true);
                      toast.error('Price is required');
                      return;
                    }
                    
                    try{
                      setIsSavingProduct(true);
                      
                      // If no image is provided, load the default product placeholder image
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
                        category: productCategory||null,
                        unit: productUnit||null,
                        price: Number(parseCurrency(productPrice)),
                        description: productDesc||null,
                        unit_type: productUnitType,
                        units_per_package: productUnitType==='multiple'? (productUnitsPerPackage? Number(productUnitsPerPackage): null) : null,
                        coverage_sqs: productUnitType==='coverage'? (productCovSqs? Number(productCovSqs): null) : null,
                        coverage_ft2: productUnitType==='coverage'? (productCovFt2? Number(productCovFt2): null) : null,
                        coverage_m2: productUnitType==='coverage'? (productCovM2? Number(productCovM2): null) : null,
                        image_base64: finalImageBase64 || null,
                        technical_manual_url: productTechnicalManualUrl || null,
                      };
                      await api('POST','/estimate/products', payload);
                      toast.success('Product created');
                      setNewProductModalOpen(false);
                      // Refetch products to show the new one
                      await refetchSupplierProducts();
                      queryClient.invalidateQueries({ queryKey: ['supplierProducts'] });
                    }catch(e: any){ 
                      toast.error(e?.message || 'Failed to create product');
                    }finally{
                      setIsSavingProduct(false);
                    }
                  }}
                  disabled={isSavingProduct}
                  className="px-4 py-2 rounded bg-brand-red text-white hover:bg-brand-red-dark disabled:opacity-50"
                >
                  {isSavingProduct ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            </div>
          </div>
          {productImagePickerOpen && (
            <div className="fixed inset-0 z-[130]">
              <ImagePicker 
                isOpen={true} 
                onClose={() => setProductImagePickerOpen(false)} 
                targetWidth={800} 
                targetHeight={800} 
                allowEdit={true}
                onConfirm={async (blob) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    setProductImageDataUrl(String(reader.result || ''));
                    setProductImagePickerOpen(false);
                  };
                  reader.readAsDataURL(blob);
                }} 
              />
            </div>
          )}
        </>
      )}

      {productModalOpen && (viewingProduct || editingProduct) && (
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center">
          <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
              {viewingProduct && !editingProduct ? (
                // View mode - display product details
                <>
                {/* Product Header */}
                <div className="flex-shrink-0 bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative">
                  <button
                    onClick={() => {
                      setProductModalOpen(false);
                      setViewingProduct(null);
                    }}
                    className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
                    title="Close"
                  >
                    ×
                  </button>
                  <div className="w-24 h-24 rounded-xl border-4 border-white shadow-lg overflow-hidden bg-white flex items-center justify-center">
                    <img 
                      src={viewingProduct.image_base64 || '/ui/assets/placeholders/product.png'} 
                      className="w-full h-full object-cover" 
                      alt={viewingProduct.name}
                    />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-3xl font-extrabold text-white">{viewingProduct.name}</h2>
                    <div className="flex items-center gap-4 mt-3 text-sm">
                      {viewingProduct.supplier_name && (
                        <div className="flex items-center gap-2">
                          <span className="text-white/80">🏢</span>
                          <span className="text-white">{viewingProduct.supplier_name}</span>
                        </div>
                      )}
                      {viewingProduct.category && (
                        <div className="flex items-center gap-2">
                          <span className="text-white/80">📦</span>
                          <span className="text-white">{viewingProduct.category}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex-shrink-0 px-6 border-b">
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
                    {canEditProducts && viewingProduct && (
                      <button
                        onClick={() => {
                          setProductTab('related');
                          if (viewingProduct.id) {
                            handleViewRelated(viewingProduct.id);
                          }
                        }}
                        className={`px-4 py-2 font-medium text-sm transition-colors ${
                          productTab === 'related'
                            ? 'text-brand-red border-b-2 border-brand-red'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Related {relatedCounts[viewingProduct.id] ? `(${relatedCounts[viewingProduct.id]})` : ''}
                      </button>
                    )}
                  </div>
                </div>

                {/* Product Details, Usage, or Related */}
                <div className="flex-1 overflow-y-auto">
                {productTab === 'details' ? (
                  <div className="px-6 pb-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {viewingProduct.unit && (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Sell Unit</div>
                          <div className="text-gray-900">{viewingProduct.unit}</div>
                        </div>
                      )}
                      {viewingProduct.unit_type && (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Unit Type</div>
                          <div className="text-gray-900">{viewingProduct.unit_type}</div>
                        </div>
                      )}
                    </div>
                    {typeof viewingProduct.price === 'number' && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-xs font-semibold text-gray-600 mb-1">Price</div>
                        <div className="text-gray-900 font-semibold text-lg">${viewingProduct.price.toFixed(2)}</div>
                      </div>
                    )}
                    {viewingProduct.units_per_package && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-xs font-semibold text-gray-600 mb-1">Units per Package</div>
                        <div className="text-gray-900">{viewingProduct.units_per_package}</div>
                      </div>
                    )}
                    {(viewingProduct.coverage_sqs || viewingProduct.coverage_ft2 || viewingProduct.coverage_m2) && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-sm font-semibold text-gray-900 mb-3">📍 Coverage Area</div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-gray-700">SQS: {viewingProduct.coverage_sqs||'-'}</div>
                          <div className="text-gray-700">ft²: {viewingProduct.coverage_ft2||'-'}</div>
                          <div className="text-gray-700">m²: {viewingProduct.coverage_m2||'-'}</div>
                        </div>
                      </div>
                    )}
                    {viewingProduct.description && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-sm font-semibold text-gray-900 mb-2">Description</div>
                        <div className="text-gray-700 whitespace-pre-wrap">{viewingProduct.description}</div>
                      </div>
                    )}
                    {viewingProduct.technical_manual_url && (() => {
                      const url = viewingProduct.technical_manual_url.trim();
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
                                        setProductModalOpen(false);
                                        setViewingProduct(null);
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
                ) : productTab === 'related' && viewingProduct ? (
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
                                  onClick={() => deleteRelation(viewingProduct.id, r.id)}
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
                            onClick={() => handleAddRelated(viewingProduct.id)}
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
                            onClick={() => handleAddRelated(viewingProduct.id)}
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
                </>
              ) : (
                // Edit mode - form inputs
                <>
                  {/* Edit Header */}
                  <div className="flex-shrink-0 bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 relative">
                    <button
                      onClick={() => {
                        setEditingProduct(null);
                        setViewingProduct(editingProduct);
                        // Reset form fields
                        setEditProductName('');
                        setEditProductNameError(false);
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
                      className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
                      title="Close"
                    >
                      ×
                    </button>
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-extrabold text-white">Edit Product</h2>
                        <p className="text-sm text-white/80 mt-1">Update product information</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">
                        Name <span className="text-red-600">*</span>
                      </label>
                      <input 
                        className={`w-full border rounded px-3 py-2 mt-1 ${editProductNameError && !editProductName.trim() ? 'border-red-500' : ''}`}
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
                      <label className="text-xs font-semibold text-gray-700">Supplier</label>
                      <input 
                        className="w-full border rounded px-3 py-2 mt-1 bg-gray-50 cursor-not-allowed"
                        value={editingProduct?.supplier_name || ''}
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Category</label>
                      <input 
                        className="w-full border rounded px-3 py-2 mt-1" 
                        value={editProductCategory} 
                        onChange={e=>setEditProductCategory(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Sell Unit</label>
                      <input 
                        className="w-full border rounded px-3 py-2 mt-1" 
                        placeholder="e.g., Roll, Pail (20L), Box" 
                        value={editProductUnit} 
                        onChange={e=>setEditProductUnit(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">
                        Price ($) <span className="text-red-600">*</span>
                      </label>
                      <input 
                        type="text" 
                        className={`w-full border rounded px-3 py-2 mt-1 ${editProductPriceError && (!editProductPrice || !editProductPrice.trim() || Number(parseCurrency(editProductPrice)) <= 0) ? 'border-red-500' : ''}`}
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
                      <label className="text-xs font-semibold text-gray-700">Unit Type</label>
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
                        <label className="text-xs font-semibold text-gray-700">Units per Package</label>
                        <input 
                          type="number" 
                          step="0.01" 
                          className="w-full border rounded px-3 py-2 mt-1" 
                          value={editProductUnitsPerPackage} 
                          onChange={e=>setEditProductUnitsPerPackage(e.target.value)} 
                        />
                      </div>
                    )}
                    {editProductUnitType==='coverage' && (
                      <div className="col-span-2">
                        <label className="text-xs font-semibold text-gray-700">Coverage Area</label>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 flex items-center gap-1">
                            <input 
                              className="w-full border rounded px-3 py-2" 
                              placeholder="0" 
                              value={editProductCovSqs} 
                              onChange={e=> onEditProductCoverageChange('sqs', e.target.value)} 
                            />
                            <span className="text-sm text-gray-600 whitespace-nowrap">SQS</span>
                          </div>
                          <span className="text-gray-400">=</span>
                          <div className="flex-1 flex items-center gap-1">
                            <input 
                              className="w-full border rounded px-3 py-2" 
                              placeholder="0" 
                              value={editProductCovFt2} 
                              onChange={e=> onEditProductCoverageChange('ft2', e.target.value)} 
                            />
                            <span className="text-sm text-gray-600 whitespace-nowrap">ft²</span>
                          </div>
                          <span className="text-gray-400">=</span>
                          <div className="flex-1 flex items-center gap-1">
                            <input 
                              className="w-full border rounded px-3 py-2" 
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
                      <label className="text-xs font-semibold text-gray-700">Description / Notes</label>
                      <textarea 
                        className="w-full border rounded px-3 py-2 mt-1" 
                        rows={3} 
                        value={editProductDesc} 
                        onChange={e=>setEditProductDesc(e.target.value)} 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Technical Manual URL</label>
                      <input 
                        className="w-full border rounded px-3 py-2 mt-1" 
                        type="url"
                        placeholder="https://supplier.com/manual/product"
                        value={editProductTechnicalManualUrl} 
                        onChange={e=>setEditProductTechnicalManualUrl(e.target.value)} 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Product Image</label>
                      <div className="mt-1 space-y-2">
                        <button
                          type="button"
                          onClick={() => setEditProductImagePickerOpen(true)}
                          className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
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
                </>
              )}
            <div className="flex-shrink-0 px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
              {viewingProduct && !editingProduct ? (
                // View mode buttons
                <>
                    {canEditProducts && (
                      <>
                        <button
                        onClick={openEditProductModal}
                        className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
                      >
                        Edit
                      </button>
                    </>
                  )}
                </>
              ) : editingProduct ? (
                // Edit mode buttons
                <>
                  <button
                    onClick={() => {
                      setViewingProduct(editingProduct);
                      setEditingProduct(null);
                      // Reset form fields
                      setEditProductName('');
                      setEditProductNameError(false);
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
                    className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (isSavingEditProduct) return;
                      
                      if (!editProductName.trim()) {
                        setEditProductNameError(true);
                        toast.error('Name is required');
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
                          supplier_name: editingProduct.supplier_name,
                          category: editProductCategory || null,
                          unit: editProductUnit || null,
                          price: Number(parseCurrency(editProductPrice)),
                          description: editProductDesc || null,
                          unit_type: editProductUnitType,
                          units_per_package: editProductUnitType === 'multiple' ? (editProductUnitsPerPackage ? Number(editProductUnitsPerPackage) : null) : null,
                          coverage_sqs: editProductUnitType === 'coverage' ? (editProductCovSqs ? Number(editProductCovSqs) : null) : null,
                          coverage_ft2: editProductUnitType === 'coverage' ? (editProductCovFt2 ? Number(editProductCovFt2) : null) : null,
                          coverage_m2: editProductUnitType === 'coverage' ? (editProductCovM2 ? Number(editProductCovM2) : null) : null,
                          image_base64: editProductImageDataUrl || null,
                          technical_manual_url: editProductTechnicalManualUrl || null,
                        };
                        const updated = await api('PUT', `/estimate/products/${editingProduct.id}`, payload);
                        toast.success('Product updated');
                        setViewingProduct(updated);
                        setEditingProduct(null);
                        // Reset form fields
                        setEditProductName('');
                        setEditProductNameError(false);
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
                        // Refetch products to show the updated one
                        await refetchSupplierProducts();
                        queryClient.invalidateQueries({ queryKey: ['supplierProducts'] });
                      } catch (e: any) {
                        toast.error(e?.message || 'Failed to update product');
                      } finally {
                        setIsSavingEditProduct(false);
                      }
                    }}
                    disabled={isSavingEditProduct}
                    className="px-4 py-2 rounded bg-brand-red text-white hover:bg-brand-red-dark disabled:opacity-50"
                  >
                    {isSavingEditProduct ? 'Updating...' : 'Update'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {editProductImagePickerOpen && (
        <div className="fixed inset-0 z-[130]">
          <ImagePicker 
            isOpen={true} 
            onClose={() => setEditProductImagePickerOpen(false)} 
            targetWidth={800} 
            targetHeight={800} 
            allowEdit={true}
            onConfirm={async (blob) => {
              const reader = new FileReader();
              reader.onload = () => {
                setEditProductImageDataUrl(String(reader.result || ''));
                setEditProductImagePickerOpen(false);
              };
              reader.readAsDataURL(blob);
            }} 
          />
        </div>
      )}


      {addRelatedOpen && (
        <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0 px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div className="font-semibold text-lg">Add Related Product</div>
              <button
                onClick={() => setAddRelatedOpen(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <input
                type="text"
                className="w-full border rounded px-3 py-2 mb-4"
                placeholder="Search products..."
                value={addRelatedSearch}
                onChange={e => searchRelatedProducts(e.target.value)}
              />
              <div>
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

      {contactModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex-shrink-0 px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div className="font-semibold text-lg">
                {editingContact ? 'Edit Contact' : 'New Contact'}
              </div>
              <button
                onClick={() => {
                  setContactModalOpen(false);
                  setEditingContact(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700">Name *</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Enter contact name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Email</label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Enter email address"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Phone</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Title / Department</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  placeholder="Enter title or department"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Notes</label>
                <textarea
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  placeholder="Enter notes"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex-shrink-0 px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => {
                  setContactModalOpen(false);
                  setEditingContact(null);
                }}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!contactName.trim()) {
                    toast.error('Name is required');
                    return;
                  }
                  try {
                    if (editingContact) {
                      await api('PUT', `/inventory/contacts/${editingContact.id}`, {
                        name: contactName,
                        email: contactEmail || undefined,
                        phone: contactPhone || undefined,
                        title: contactTitle || undefined,
                        notes: contactNotes || undefined,
                        supplier_id: viewing?.id
                      });
                      toast.success('Contact updated');
                    } else {
                      await api('POST', '/inventory/contacts', {
                        name: contactName,
                        email: contactEmail || undefined,
                        phone: contactPhone || undefined,
                        title: contactTitle || undefined,
                        notes: contactNotes || undefined,
                        supplier_id: viewing?.id
                      });
                      toast.success('Contact created');
                    }
                    setContactModalOpen(false);
                    setEditingContact(null);
                    refetchContacts();
                  } catch (error) {
                    toast.error('Failed to save contact');
                  }
                }}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-brand-red-dark"
              >
                {editingContact ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
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
