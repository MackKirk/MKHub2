import { useMemo, useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

type Material = { id:number, name:string, supplier_name?:string, category?:string, unit?:string, price?:number, last_updated?:string, unit_type?:string, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number, description?:string, image_base64?:string };
type Item = { material_id?:number, name:string, unit?:string, quantity:number, unit_price:number, section:string, description?:string, item_type?:string, supplier_name?:string, unit_type?:string, qty_required?:number, unit_required?:string, markup?:number, taxable?:boolean, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number, labour_journey?:number, labour_men?:number, labour_journey_type?:'days'|'hours'|'contract' };

export type EstimateBuilderRef = {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<boolean>;
};

const EstimateBuilder = forwardRef<EstimateBuilderRef, { projectId: string, estimateId?: number, statusLabel?: string, settings?: any, isBidding?: boolean, canEdit?: boolean }>(
  function EstimateBuilder({ projectId, estimateId, statusLabel, settings, isBidding, canEdit: canEditProp }, ref) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [markup, setMarkup] = useState<number>(5);
  const [pstRate, setPstRate] = useState<number>(7);
  const [gstRate, setGstRate] = useState<number>(5);
  const [profitRate, setProfitRate] = useState<number>(20);
  const defaultSections = ['Roof System','Wood Blocking / Accessories','Flashing'];
  const [sectionOrder, setSectionOrder] = useState<string[]>(defaultSections);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentEstimateId, setCurrentEstimateId] = useState<number|undefined>(estimateId);
  const [viewingProductId, setViewingProductId] = useState<number | null>(null);
  const [editingSectionName, setEditingSectionName] = useState<string | null>(null);
  const [editingSectionNameValue, setEditingSectionNameValue] = useState<string>('');
  const [editingSectionNameOriginal, setEditingSectionNameOriginal] = useState<string>('');
  const [sectionNames, setSectionNames] = useState<Record<string, string>>({});
  const [addingToSection, setAddingToSection] = useState<{section: string, type: 'product' | 'labour' | 'subcontractor' | 'miscellaneous' | 'shop'} | null>(null);
  const [dirty, setDirty] = useState(false);
  const savedStateRef = useRef<{ items: Item[], markup: number, pstRate: number, gstRate: number, profitRate: number, sectionOrder: string[], sectionNames: Record<string, string> } | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const pendingSaveRef = useRef<{ items: Item[], markup: number, pstRate: number, gstRate: number, profitRate: number, sectionOrder: string[], sectionNames: Record<string, string> } | null>(null);
  
  // Check if editing is allowed based on status and permissions
  const canEdit = useMemo(()=>{
    // If canEditProp is explicitly false (no permission), deny editing
    if (canEditProp === false) return false;
    
    // If canEditProp is explicitly true, check status restrictions
    if (canEditProp === true) {
      // Always allow editing by default unless explicitly restricted
      if (!statusLabel || !statusLabel.trim()) return true;
      
      const statusLabelStr = String(statusLabel).trim();
      
      // Always allow "estimating" status
      if (statusLabelStr.toLowerCase() === 'estimating') return true;
      
      // If no settings or project_statuses, allow editing
      if (!settings || !settings.project_statuses || !Array.isArray(settings.project_statuses)) return true;
      
      const statusConfig = (settings.project_statuses as any[]).find((s:any)=> s.label === statusLabelStr);
      
      // If status not found in config, allow editing by default
      if (!statusConfig) return true;
      
      // Only restrict if explicitly set to false
      const allowEdit = statusConfig?.meta?.allow_edit_proposal;
      
      // If allow_edit_proposal is explicitly false, deny editing
      if (allowEdit === false || allowEdit === 'false' || allowEdit === 0) return false;
      
      // Otherwise allow editing (default behavior)
      return true;
    }
    
    // If canEditProp is undefined, use old behavior (backward compatibility)
    // Always allow editing by default unless explicitly restricted
    if (!statusLabel || !statusLabel.trim()) return true;
    
    const statusLabelStr = String(statusLabel).trim();
    
    // Always allow "estimating" status
    if (statusLabelStr.toLowerCase() === 'estimating') return true;
    
    // If no settings or project_statuses, allow editing
    if (!settings || !settings.project_statuses || !Array.isArray(settings.project_statuses)) return true;
    
    const statusConfig = (settings.project_statuses as any[]).find((s:any)=> s.label === statusLabelStr);
    
    // If status not found in config, allow editing by default
    if (!statusConfig) return true;
    
    // Only restrict if explicitly set to false
    const allowEdit = statusConfig?.meta?.allow_edit_proposal;
    
    // If allow_edit_proposal is explicitly false, deny editing
    if (allowEdit === false || allowEdit === 'false' || allowEdit === 0) return false;
    
    // Otherwise allow editing (default behavior)
    return true;
  }, [statusLabel, settings, canEditProp]);
  
  // Show warning if editing is restricted
  useEffect(() => {
    if (!canEdit && statusLabel) {
      toast.error(`Editing is restricted for projects with status "${statusLabel}"`, { duration: 5000 });
    }
  }, [canEdit, statusLabel]);


  // Fetch estimate by project_id if only projectId is provided
  const { data: projectEstimates } = useQuery({
    queryKey: ['projectEstimates', projectId],
    queryFn: () => projectId ? api<any[]>('GET', `/estimate/estimates?project_id=${encodeURIComponent(projectId)}`) : Promise.resolve([]),
    enabled: !!projectId && !estimateId && !currentEstimateId
  });

  // Set estimateId from project estimate if found
  useEffect(() => {
    if (projectEstimates && projectEstimates.length > 0 && !currentEstimateId && !estimateId) {
      // Use the first (most recent) estimate for this project
      const projectEstimate = projectEstimates[0];
      if (projectEstimate && projectEstimate.id) {
        setCurrentEstimateId(projectEstimate.id);
      }
    }
  }, [projectEstimates, currentEstimateId, estimateId]);

  // Load estimate data if estimateId is provided
  const { data: estimateData, refetch: refetchEstimate } = useQuery({
    queryKey: ['estimate', currentEstimateId],
    queryFn: () => currentEstimateId ? api<any>('GET', `/estimate/estimates/${currentEstimateId}`) : Promise.resolve(null),
    enabled: !!currentEstimateId
  });
  
  // Invalidate and refetch estimate data when component mounts or when estimateId changes to ensure fresh data
  const hasLoadedRef = useRef<number | undefined>(undefined);
  const hasInitializedRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (currentEstimateId && hasLoadedRef.current !== currentEstimateId) {
      hasLoadedRef.current = currentEstimateId;
      hasInitializedRef.current = undefined; // Reset initialization flag when estimateId changes
      // Invalidate cache and refetch to ensure we have the latest data
      queryClient.invalidateQueries({ queryKey: ['estimate', currentEstimateId] });
      refetchEstimate();
    }
  }, [currentEstimateId, queryClient, refetchEstimate]);

  // Load product data when viewing a product
  const { data: viewingProduct } = useQuery({
    queryKey: ['product', viewingProductId],
    queryFn: async () => {
      if (!viewingProductId) return null;
      // Fetch all products and find by ID
      const products = await api<Material[]>('GET', '/estimate/products');
      return products.find(p => p.id === viewingProductId) || null;
    },
    enabled: !!viewingProductId
  });

  // Load estimate data on mount - only once per estimateId
  useEffect(() => {
    if (estimateData && currentEstimateId && hasInitializedRef.current !== currentEstimateId) {
      hasInitializedRef.current = currentEstimateId;
      const est = estimateData.estimate;
      const loadedItems = estimateData.items || [];
      
      // Restore rates and section order
      // If values are null/undefined, use defaults (don't set 0 for rates that weren't saved)
      // Only set if value exists in the saved data (could be 0 if explicitly saved as 0)
      if (estimateData.pst_rate !== undefined && estimateData.pst_rate !== null) {
        setPstRate(estimateData.pst_rate);
      }
      if (estimateData.gst_rate !== undefined && estimateData.gst_rate !== null) {
        setGstRate(estimateData.gst_rate);
      }
      if (estimateData.profit_rate !== undefined && estimateData.profit_rate !== null) {
        setProfitRate(estimateData.profit_rate);
      } else {
        // Default to 20% if not set
        setProfitRate(20);
      }
      if (estimateData.section_order) setSectionOrder(estimateData.section_order);
      if (estimateData.section_names) setSectionNames(estimateData.section_names);
      if (est.markup !== undefined) setMarkup(est.markup);
      
      // Convert loaded items to Item format
      const formattedItems: Item[] = loadedItems.map((it: any) => {
        // For labour items, set unit based on labour_journey_type if unit is not provided
        let unit = it.unit || '';
        if (it.item_type === 'labour' && it.labour_journey_type && !unit) {
          if (it.labour_journey_type === 'contract') {
            unit = 'each'; // Default for contract if not saved
          } else {
            unit = it.labour_journey_type; // 'days' or 'hours'
          }
        }
        return {
          material_id: it.material_id,
          name: it.name || it.description || 'Item',
          unit: unit,
          quantity: it.quantity || 0,
          unit_price: it.unit_price || 0,
          section: it.section || 'Miscellaneous',
          description: it.description,
          item_type: it.item_type || 'product',
          supplier_name: it.supplier_name,
          unit_type: it.unit_type,
          units_per_package: it.units_per_package,
          coverage_sqs: it.coverage_sqs,
          coverage_ft2: it.coverage_ft2,
          coverage_m2: it.coverage_m2,
          qty_required: it.qty_required,
          unit_required: it.unit_required,
          markup: it.markup,
          taxable: it.taxable !== false,
          labour_journey: it.labour_journey,
          labour_men: it.labour_men,
          labour_journey_type: it.labour_journey_type
        };
      });
      setItems(formattedItems);
      // Update savedStateRef to match loaded data so dirty check works correctly
      const loadedSectionNames = estimateData.section_names || {};
      savedStateRef.current = { 
        items: formattedItems, 
        markup: est.markup !== undefined ? est.markup : markup, 
        pstRate: estimateData.pst_rate !== undefined && estimateData.pst_rate !== null ? estimateData.pst_rate : pstRate, 
        gstRate: estimateData.gst_rate !== undefined && estimateData.gst_rate !== null ? estimateData.gst_rate : gstRate, 
        profitRate: estimateData.profit_rate !== undefined && estimateData.profit_rate !== null ? estimateData.profit_rate : profitRate,
        sectionOrder: estimateData.section_order || sectionOrder,
        sectionNames: loadedSectionNames
      };
      setDirty(false);
    }
  }, [estimateData, currentEstimateId]);

  // Calculate item total based on item type
  const calculateItemTotal = (it: Item): number => {
    if (it.item_type === 'labour' && it.labour_journey_type) {
      if (it.labour_journey_type === 'contract') {
        return (it.labour_journey || 0) * it.unit_price;
      } else {
        return (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
      }
    }
    return it.quantity * it.unit_price;
  };

  // Total of all items
  const total = useMemo(()=> {
    return items.reduce((acc, it)=> {
      let itemTotal = 0;
      if (it.item_type === 'labour' && it.labour_journey_type) {
        if (it.labour_journey_type === 'contract') {
          itemTotal = (it.labour_journey || 0) * it.unit_price;
        } else {
          itemTotal = (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
        }
      } else {
        itemTotal = it.quantity * it.unit_price;
      }
      return acc + itemTotal;
    }, 0);
  }, [items]);
  
  // Total of taxable items only (for PST calculation) - with markup
  const taxableTotal = useMemo(()=> {
    return items
      .filter(it => it.taxable !== false) // Only items marked as taxable
      .reduce((acc, it)=> {
        // Calculate item total with markup
        const m = it.markup !== undefined && it.markup !== null ? it.markup : markup;
        let itemTotal = 0;
        if (it.item_type === 'labour' && it.labour_journey_type) {
          if (it.labour_journey_type === 'contract') {
            itemTotal = (it.labour_journey || 0) * it.unit_price;
          } else {
            itemTotal = (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
          }
        } else {
          itemTotal = it.quantity * it.unit_price;
        }
        return acc + (itemTotal * (1 + (m/100)));
      }, 0);
  }, [items, markup]);
  
  const pst = useMemo(()=> (taxableTotal * (pstRate/100)), [taxableTotal, pstRate]);

  // Internal save function (used by manual save and beforeunload)
  const performSave = useCallback(async (silent: boolean = false) => {
    // Don't save if already saving or if no projectId
    if (isSavingRef.current || !projectId || !canEdit) return false;
    
    // Don't save if nothing changed
    if (!dirty && currentEstimateId) {
      return true;
    }

    try {
      isSavingRef.current = true;
      
      // Store current state for save attempt
      const currentState = {
        items,
        markup,
        pstRate,
        gstRate,
        profitRate,
        sectionOrder,
        sectionNames
      };
      pendingSaveRef.current = currentState;
      
      const payload = { 
        project_id: projectId, 
        markup, 
        pst_rate: pstRate,
        gst_rate: gstRate,
        profit_rate: profitRate,
        section_order: sectionOrder,
        section_names: sectionNames,
        items: items.map(it=> ({ 
          material_id: it.material_id, 
          quantity: it.quantity, 
          unit_price: it.unit_price, 
          section: it.section, 
          description: it.description, 
          item_type: it.item_type,
          name: it.name,
          unit: it.unit,
          markup: it.markup,
          taxable: it.taxable,
          qty_required: it.qty_required,
          unit_required: it.unit_required,
          supplier_name: it.supplier_name,
          unit_type: it.unit_type,
          units_per_package: it.units_per_package,
          coverage_sqs: it.coverage_sqs,
          coverage_ft2: it.coverage_ft2,
          coverage_m2: it.coverage_m2,
          labour_journey: it.labour_journey,
          labour_men: it.labour_men,
          labour_journey_type: it.labour_journey_type
        })) 
      };
      
      let estimateIdToUse = currentEstimateId;
      if (estimateIdToUse) {
        // Update existing estimate
        await api('PUT', `/estimate/estimates/${estimateIdToUse}`, payload);
      } else {
        // Create new estimate
        const result = await api<any>('POST', '/estimate/estimates', payload);
        estimateIdToUse = result.id;
        setCurrentEstimateId(estimateIdToUse);
      }
      
      // Only update savedStateRef if save was successful
      savedStateRef.current = currentState;
      setDirty(false);
      pendingSaveRef.current = null;
      
      // Invalidate cache to ensure fresh data on remount
      queryClient.invalidateQueries({ queryKey: ['estimate', estimateIdToUse] });
      queryClient.invalidateQueries({ queryKey: ['projectEstimates', projectId] });
      
      if (!silent) {
        toast.success('Changes saved');
      }
      return true;
    } catch (e) {
      if (!silent) {
        toast.error('Failed to save');
      }
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [projectId, markup, pstRate, gstRate, profitRate, sectionOrder, sectionNames, items, currentEstimateId, canEdit, queryClient, dirty]);

  // Show warning if editing is restricted
  useEffect(() => {
    if (!canEdit && statusLabel) {
      toast.error(`Editing is restricted for projects with status "${statusLabel}"`, { duration: 5000 });
    }
  }, [canEdit, statusLabel]);

  // Keep pendingSaveRef updated with current state whenever it changes
  useEffect(() => {
    if (dirty && canEdit && projectId) {
      pendingSaveRef.current = {
        items,
        markup,
        pstRate,
        gstRate,
        profitRate,
        sectionOrder,
        sectionNames
      };
    }
  }, [items, markup, pstRate, gstRate, profitRate, sectionOrder, sectionNames, dirty, canEdit, projectId]);

  // Save before leaving page/component (visibilitychange and beforeunload)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && dirty && canEdit && projectId) {
        // Page is being hidden (user switching tabs, minimizing, etc.)
        // Try to save silently
        await performSave(true);
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty && canEdit && projectId && currentEstimateId && pendingSaveRef.current) {
        // Warn user about unsaved changes
        e.preventDefault();
        e.returnValue = '';
        
        // Try to save synchronously as last resort
        try {
          const payload = {
            project_id: projectId,
            markup: pendingSaveRef.current.markup,
            pst_rate: pendingSaveRef.current.pstRate,
            gst_rate: pendingSaveRef.current.gstRate,
            profit_rate: pendingSaveRef.current.profitRate,
            section_order: pendingSaveRef.current.sectionOrder,
            section_names: pendingSaveRef.current.sectionNames,
            items: pendingSaveRef.current.items.map(it=> ({
              material_id: it.material_id,
              quantity: it.quantity,
              unit_price: it.unit_price,
              section: it.section,
              description: it.description,
              item_type: it.item_type,
              name: it.name,
              unit: it.unit,
              markup: it.markup,
              taxable: it.taxable,
              qty_required: it.qty_required,
              unit_required: it.unit_required,
              supplier_name: it.supplier_name,
              unit_type: it.unit_type,
              units_per_package: it.units_per_package,
              coverage_sqs: it.coverage_sqs,
              coverage_ft2: it.coverage_ft2,
              coverage_m2: it.coverage_m2,
              labour_journey: it.labour_journey,
              labour_men: it.labour_men,
              labour_journey_type: it.labour_journey_type
            }))
          };
          
          const token = localStorage.getItem('user_token');
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', `/estimate/estimates/${currentEstimateId}`, false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          xhr.send(JSON.stringify(payload));
        } catch (err) {
          // If sync save fails, log error but don't block
          console.error('Failed to save on page unload:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [dirty, canEdit, projectId, currentEstimateId, performSave]);

  // Calculate quantity based on qty_required and unit_type
  const calculateQuantity = (item: Item): number => {
    if (!item.qty_required || item.qty_required <= 0) return item.quantity || 1;
    const qty = Number(item.qty_required);
    
    if (item.unit_type === 'coverage') {
      if (item.unit_required === 'SQS' && item.coverage_sqs && item.coverage_sqs > 0) {
        return Math.ceil(qty / item.coverage_sqs);
      } else if (item.unit_required === 'ft²' && item.coverage_ft2 && item.coverage_ft2 > 0) {
        return Math.ceil(qty / item.coverage_ft2);
      } else if (item.unit_required === 'm²' && item.coverage_m2 && item.coverage_m2 > 0) {
        return Math.ceil(qty / item.coverage_m2);
      }
    } else if (item.unit_type === 'multiple' && item.units_per_package && item.units_per_package > 0) {
      return Math.ceil(qty / item.units_per_package);
    } else if (item.unit_type === 'unitary') {
      return Math.ceil(qty);
    }
    
    return item.quantity || 1;
  };

  // Group items by section
  const groupedItems = useMemo(()=>{
    const groups: Record<string, Item[]> = {};
    items.forEach(it=>{
      const section = it.section || 'Miscellaneous';
      if(!groups[section]) groups[section] = [];
      groups[section].push(it);
    });
    return groups;
  }, [items]);

  // Calculate total of all section subtotals with markup (same as shown in table)
  const totalWithMarkup = useMemo(() => {
    return Object.keys(groupedItems).reduce((acc, section) => {
      const sectionItems = groupedItems[section];
      const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                              section.startsWith('Labour Section') ||
                              section.startsWith('Sub-Contractor Section') ||
                              section.startsWith('Shop Section') ||
                              section.startsWith('Miscellaneous Section');
      const sectionTotal = sectionItems.reduce((sum, it) => {
        const m = it.markup !== undefined && it.markup !== null ? it.markup : markup;
        let itemTotal = 0;
        if (!isLabourSection) {
          itemTotal = it.quantity * it.unit_price;
        } else {
          if (it.item_type === 'labour' && it.labour_journey_type) {
            if (it.labour_journey_type === 'contract') {
              itemTotal = (it.labour_journey || 0) * it.unit_price;
            } else {
              itemTotal = (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
            }
          } else {
            itemTotal = it.quantity * it.unit_price;
          }
        }
        return sum + (itemTotal * (1 + (m/100)));
      }, 0);
      return acc + sectionTotal;
    }, 0);
  }, [groupedItems, markup]);

  // Calculate Sections Mark-up as the difference between total with markup and total without markup for all products
  const markupValue = useMemo(() => {
    // Calculate total without markup for all items
    const totalWithoutMarkup = items.reduce((acc, it) => {
      const m = it.markup !== undefined && it.markup !== null ? it.markup : markup;
      let itemTotal = 0;
      const section = it.section || 'Miscellaneous';
      const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                              section.startsWith('Labour Section') ||
                              section.startsWith('Sub-Contractor Section') ||
                              section.startsWith('Shop Section') ||
                              section.startsWith('Miscellaneous Section');
      
      if (!isLabourSection) {
        itemTotal = it.quantity * it.unit_price;
      } else {
        if (it.item_type === 'labour' && it.labour_journey_type) {
          if (it.labour_journey_type === 'contract') {
            itemTotal = (it.labour_journey || 0) * it.unit_price;
          } else {
            itemTotal = (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
          }
        } else {
          itemTotal = it.quantity * it.unit_price;
        }
      }
      return acc + itemTotal;
    }, 0);
    
    // Calculate total with markup for all items
    const totalWithMarkupAll = items.reduce((acc, it) => {
      const m = it.markup !== undefined && it.markup !== null ? it.markup : markup;
      let itemTotal = 0;
      const section = it.section || 'Miscellaneous';
      const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                              section.startsWith('Labour Section') ||
                              section.startsWith('Sub-Contractor Section') ||
                              section.startsWith('Shop Section') ||
                              section.startsWith('Miscellaneous Section');
      
      if (!isLabourSection) {
        itemTotal = it.quantity * it.unit_price;
      } else {
        if (it.item_type === 'labour' && it.labour_journey_type) {
          if (it.labour_journey_type === 'contract') {
            itemTotal = (it.labour_journey || 0) * it.unit_price;
          } else {
            itemTotal = (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
          }
        } else {
          itemTotal = it.quantity * it.unit_price;
        }
      }
      return acc + (itemTotal * (1 + (m/100)));
    }, 0);
    
    return totalWithMarkupAll - totalWithoutMarkup;
  }, [items, markup]);

  // Helper function to calculate section subtotal
  const calculateSectionSubtotal = useCallback((sectionName: string): number => {
    const sectionItems = groupedItems[sectionName] || [];
    const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(sectionName) || 
                          sectionName.startsWith('Labour Section') || 
                          sectionName.startsWith('Sub-Contractor Section') || 
                          sectionName.startsWith('Shop Section') || 
                          sectionName.startsWith('Miscellaneous Section');
    return sectionItems.reduce((sum, it) => {
      const m = it.markup !== undefined && it.markup !== null ? it.markup : markup;
      let itemTotal = 0;
      if (!isLabourSection) {
        itemTotal = it.quantity * it.unit_price;
      } else {
        if (it.item_type === 'labour' && it.labour_journey_type) {
          if (it.labour_journey_type === 'contract') {
            itemTotal = (it.labour_journey || 0) * it.unit_price;
          } else {
            itemTotal = (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
          }
        } else {
          itemTotal = it.quantity * it.unit_price;
        }
      }
      return sum + (itemTotal * (1 + (m/100)));
    }, 0);
  }, [groupedItems, markup]);

  // Calculate specific section costs
  const totalProductsCosts = useMemo(() => {
    return sectionOrder
      .filter(section => !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) && 
                        !section.startsWith('Labour Section') && 
                        !section.startsWith('Sub-Contractor Section') && 
                        !section.startsWith('Shop Section') && 
                        !section.startsWith('Miscellaneous Section'))
      .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
  }, [sectionOrder, calculateSectionSubtotal]);

  const totalLabourCosts = useMemo(() => {
    return calculateSectionSubtotal('Labour') + 
           sectionOrder
             .filter(s => s.startsWith('Labour Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
  }, [sectionOrder, calculateSectionSubtotal]);

  const totalSubContractorsCosts = useMemo(() => {
    return calculateSectionSubtotal('Sub-Contractors') + 
           sectionOrder
             .filter(s => s.startsWith('Sub-Contractor Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
  }, [sectionOrder, calculateSectionSubtotal]);

  const totalShopCosts = useMemo(() => {
    return calculateSectionSubtotal('Shop') + 
           sectionOrder
             .filter(s => s.startsWith('Shop Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
  }, [sectionOrder, calculateSectionSubtotal]);

  const totalMiscellaneousCosts = useMemo(() => {
    return calculateSectionSubtotal('Miscellaneous') + 
           sectionOrder
             .filter(s => s.startsWith('Miscellaneous Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
  }, [sectionOrder, calculateSectionSubtotal]);

  // Calculate Total Direct Project Costs as sum of all specific costs
  const totalDirectProjectCosts = useMemo(() => {
    return totalProductsCosts + totalLabourCosts + totalSubContractorsCosts + totalShopCosts + totalMiscellaneousCosts;
  }, [totalProductsCosts, totalLabourCosts, totalSubContractorsCosts, totalShopCosts, totalMiscellaneousCosts]);

  const subtotal = useMemo(()=> totalDirectProjectCosts + pst, [totalDirectProjectCosts, pst]);

  const profitValue = useMemo(()=> subtotal * (profitRate/100), [subtotal, profitRate]);
  const finalTotal = useMemo(()=> subtotal + profitValue, [subtotal, profitValue]);
  const gst = useMemo(()=> finalTotal * (gstRate/100), [finalTotal, gstRate]);
  const grandTotal = useMemo(()=> finalTotal + gst, [finalTotal, gst]);

  // Track dirty state
  useEffect(() => {
    if (!savedStateRef.current) {
      savedStateRef.current = { items, markup, pstRate, gstRate, profitRate, sectionOrder, sectionNames };
      setDirty(false);
      return;
    }
    const saved = savedStateRef.current;
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(saved.items);
    const markupChanged = markup !== saved.markup;
    const profitRateChanged = profitRate !== saved.profitRate;
    const sectionOrderChanged = JSON.stringify(sectionOrder) !== JSON.stringify(saved.sectionOrder);
    const sectionNamesChanged = JSON.stringify(sectionNames) !== JSON.stringify(saved.sectionNames);
    const pstRateChanged = pstRate !== saved.pstRate;
    const gstRateChanged = gstRate !== saved.gstRate;
    setDirty(itemsChanged || markupChanged || pstRateChanged || gstRateChanged || profitRateChanged || sectionOrderChanged || sectionNamesChanged);
  }, [items, markup, pstRate, gstRate, profitRate, sectionOrder, sectionNames]);

  // Manual save function (user clicks Save button)
  const handleManualSave = useCallback(async () => {
    await performSave(false);
  }, [performSave]);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => dirty && canEdit,
    save: () => performSave(false)
  }), [dirty, canEdit, performSave]);

  // Sync section order with items (add new sections that appear in items)
  useEffect(()=>{
    const sectionsInItems = new Set<string>();
    items.forEach(it=> sectionsInItems.add(it.section || 'Miscellaneous'));
    const existingSections = new Set(sectionOrder);
    const newSections = Array.from(sectionsInItems).filter(s => !existingSections.has(s));
    if(newSections.length > 0){
      setSectionOrder(prev => [...prev, ...newSections]);
    }
  }, [items, sectionOrder]);

  // Drag and drop handlers
  const [draggingSection, setDraggingSection] = useState<string|null>(null);
  const [dragOverSection, setDragOverSection] = useState<string|null>(null);
  const onSectionDragStart = (section: string) => setDraggingSection(section);
  const onSectionDragOver = (e: any, section: string) => {
    e.preventDefault();
    setDragOverSection(section);
  };
  const onSectionDrop = () => {
    if (draggingSection === null || dragOverSection === null || draggingSection === dragOverSection) {
      setDraggingSection(null);
      setDragOverSection(null);
      return;
    }
    setSectionOrder(arr => {
      const next = [...arr];
      const draggedIndex = next.indexOf(draggingSection);
      const dropIndex = next.indexOf(dragOverSection);
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
    setDraggingSection(null);
    setDragOverSection(null);
  };

  // Show warning banner if editing is restricted
  const showRestrictionWarning = !canEdit && statusLabel;
  
  // Handle remove item with confirmation
  const handleRemoveItem = useCallback(async (index: number, itemName: string) => {
    if (!canEdit) {
      toast.error('Editing is restricted for this project status');
      return;
    }
    
    const ok = await confirm({
      title: 'Remove item',
      message: `Are you sure you want to remove "${itemName}"? This action cannot be undone.`,
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });
    
    if (ok) {
      setItems(prev => prev.filter((_, i) => i !== index));
    }
  }, [confirm, canEdit]);

  // Helper function to get display name for section
  const getSectionDisplayName = useCallback((section: string): string => {
    return sectionNames[section] || 
      (section.startsWith('Labour Section') ? 'Labour' :
       section.startsWith('Sub-Contractor Section') ? 'Sub-Contractor' :
       section.startsWith('Miscellaneous Section') ? 'Miscellaneous' :
       section.startsWith('Shop Section') ? 'Shop' :
       section.startsWith('Product Section') ? 'Product Section' :
       section);
  }, [sectionNames]);

  // Handle remove section with confirmation
  const handleRemoveSection = useCallback(async (section: string) => {
    if (!canEdit) {
      toast.error('Editing is restricted for this project status');
      return;
    }
    
    const sectionItems = groupedItems[section] || [];
    const itemCount = sectionItems.length;
    const displayName = getSectionDisplayName(section);
    
    const ok = await confirm({
      title: 'Remove section',
      message: `Are you sure you want to remove the section "${displayName}" and all its ${itemCount} item${itemCount !== 1 ? 's' : ''}? This action cannot be undone.`,
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });
    
    if (ok) {
      setItems(prev => prev.filter(item => item.section !== section));
      setSectionOrder(prev => prev.filter(s => s !== section));
      setSectionNames(prev => {
        const newNames = { ...prev };
        delete newNames[section];
        return newNames;
      });
    }
  }, [confirm, canEdit, groupedItems, getSectionDisplayName]);
  
  return (
    <div>
      {showRestrictionWarning && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <strong>Editing Restricted:</strong> This project has status "{statusLabel}" which does not allow editing proposals or estimates. 
          Please change the project status to allow editing.
        </div>
      )}
      {canEdit && (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur mb-3 py-3 border-b">
          <div className="mb-2 text-sm font-medium text-gray-700">+ Add Section for:</div>
          <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (!canEdit) return;
              const newSection = `Product Section ${Date.now()}`;
              setSectionOrder(prev => {
                // Find the last index of a Product Section
                let lastProductIndex = -1;
                for (let i = prev.length - 1; i >= 0; i--) {
                  if (prev[i].startsWith('Product Section')) {
                    lastProductIndex = i;
                    break;
                  }
                }
                // If found, insert after the last product section; otherwise, insert at the very beginning (top)
                if (lastProductIndex >= 0) {
                  const newOrder = [...prev];
                  newOrder.splice(lastProductIndex + 1, 0, newSection);
                  return newOrder;
                } else {
                  // No product section found, insert at the very beginning (top of all sections)
                  return [newSection, ...prev];
                }
              });
              setSectionNames(prev => ({ ...prev, [newSection]: 'Product Section' }));
            }}
            disabled={!canEdit}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60">
            Product
          </button>
          <button 
            onClick={() => {
              if (!canEdit) return;
              // Check if Labour section already exists
              const hasLabour = sectionOrder.some(s => s.startsWith('Labour Section') || s === 'Labour');
              if (hasLabour) {
                toast.error('Only one Labour section is allowed');
                return;
              }
              const newSection = `Labour Section ${Date.now()}`;
              setSectionOrder(prev => [...prev, newSection]);
              setSectionNames(prev => ({ ...prev, [newSection]: 'Labour' }));
            }}
            disabled={!canEdit || sectionOrder.some(s => s.startsWith('Labour Section') || s === 'Labour')}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60">
            Labour
          </button>
          <button 
            onClick={() => {
              if (!canEdit) return;
              // Check if Sub-Contractor section already exists
              const hasSubContractor = sectionOrder.some(s => s.startsWith('Sub-Contractor Section') || s === 'Sub-Contractors');
              if (hasSubContractor) {
                toast.error('Only one Sub-Contractor section is allowed');
                return;
              }
              const newSection = `Sub-Contractor Section ${Date.now()}`;
              setSectionOrder(prev => [...prev, newSection]);
              setSectionNames(prev => ({ ...prev, [newSection]: 'Sub-Contractor' }));
            }}
            disabled={!canEdit || sectionOrder.some(s => s.startsWith('Sub-Contractor Section') || s === 'Sub-Contractors')}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60">
            Sub-Contractor
          </button>
          <button 
            onClick={() => {
              if (!canEdit) return;
              // Check if Miscellaneous section already exists
              const hasMiscellaneous = sectionOrder.some(s => s.startsWith('Miscellaneous Section') || s === 'Miscellaneous');
              if (hasMiscellaneous) {
                toast.error('Only one Miscellaneous section is allowed');
                return;
              }
              const newSection = `Miscellaneous Section ${Date.now()}`;
              setSectionOrder(prev => [...prev, newSection]);
              setSectionNames(prev => ({ ...prev, [newSection]: 'Miscellaneous' }));
            }}
            disabled={!canEdit || sectionOrder.some(s => s.startsWith('Miscellaneous Section') || s === 'Miscellaneous')}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60">
            Miscellaneous
          </button>
          <button 
            onClick={() => {
              if (!canEdit) return;
              // Check if Shop section already exists
              const hasShop = sectionOrder.some(s => s.startsWith('Shop Section') || s === 'Shop');
              if (hasShop) {
                toast.error('Only one Shop section is allowed');
                return;
              }
              const newSection = `Shop Section ${Date.now()}`;
              setSectionOrder(prev => [...prev, newSection]);
              setSectionNames(prev => ({ ...prev, [newSection]: 'Shop' }));
            }}
            disabled={!canEdit || sectionOrder.some(s => s.startsWith('Shop Section') || s === 'Shop')}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60">
            Shop
          </button>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <label>Markup (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={markup} min={0} step={1} onChange={e=>setMarkup(Number(e.target.value||0))} disabled={!canEdit} />
            <label>PST (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={pstRate} min={0} step={1} onChange={e=>setPstRate(Number(e.target.value||0))} disabled={!canEdit} />
            <label>GST (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={gstRate} min={0} step={1} onChange={e=>setGstRate(Number(e.target.value||0))} disabled={!canEdit} />
          </div>
        </div>
        </div>
      )}

      <SummaryModal 
        open={summaryOpen}
        onClose={()=>setSummaryOpen(false)}
        items={items}
        pstRate={pstRate}
        gstRate={gstRate}
        markup={markup}
        profitRate={profitRate}
        sectionNames={sectionNames}
        sectionOrder={sectionOrder}
      />

      {/* Product View Modal */}
      {viewingProduct && viewingProductId && (
        <ProductViewModal 
          product={viewingProduct}
          onClose={() => setViewingProductId(null)}
        />
      )}

      {/* Add Item to Section Modals */}
      {addingToSection && (
        (() => {
          const { section, type } = addingToSection;
          if (type === 'product') {
            return (
              <AddProductModal
                onAdd={(it) => {
                  setItems(prev => [...prev, { ...it, section }]);
                  setAddingToSection(null);
                }}
                disabled={!canEdit}
                defaultMarkup={markup}
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
              />
            );
          } else if (type === 'labour') {
            return (
              <AddLabourModal
                onAdd={(it) => {
                  setItems(prev => [...prev, { ...it, section }]);
                  setAddingToSection(null);
                }}
                disabled={!canEdit}
                defaultMarkup={markup}
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
              />
            );
          } else if (type === 'subcontractor') {
            return (
              <AddSubContractorModal
                onAdd={(it) => {
                  setItems(prev => [...prev, { ...it, section }]);
                  setAddingToSection(null);
                }}
                disabled={!canEdit}
                defaultMarkup={markup}
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
              />
            );
          } else if (type === 'miscellaneous') {
            return (
              <AddMiscellaneousModal
                onAdd={(it) => {
                  setItems(prev => [...prev, { ...it, section }]);
                  setAddingToSection(null);
                }}
                disabled={!canEdit}
                defaultMarkup={markup}
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
              />
            );
          } else if (type === 'shop') {
            return (
              <AddShopModal
                onAdd={(it) => {
                  setItems(prev => [...prev, { ...it, section }]);
                  setAddingToSection(null);
                }}
                disabled={!canEdit}
                defaultMarkup={markup}
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
              />
            );
          }
          return null;
        })()
      )}

      {/* Sections grouped display */}
      <div className="space-y-4">
        {sectionOrder.length > 0 ? (
          sectionOrder.map(section => {
            const sectionItems = groupedItems[section] || [];
            const isNewSection = section.startsWith('Product Section') || section.startsWith('Labour Section') || section.startsWith('Sub-Contractor Section') || section.startsWith('Miscellaneous Section') || section.startsWith('Shop Section');
            // Only show empty sections if they are newly created sections, or if they have items
            if (sectionItems.length === 0 && !isNewSection && !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section)) {
              return null;
            }
            const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) || isNewSection && (section.startsWith('Labour Section') || section.startsWith('Sub-Contractor Section') || section.startsWith('Shop Section') || section.startsWith('Miscellaneous Section'));
            return (
            <div key={section}
                 className={`rounded-xl border overflow-hidden bg-white ${dragOverSection === section && canEdit ? 'ring-2 ring-brand-red' : ''}`}
                 onDragOver={canEdit ? (e) => onSectionDragOver(e, section) : undefined}
                 onDrop={canEdit ? onSectionDrop : undefined}>
              <div className="bg-gray-200 px-4 py-2 border-b flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                {canEdit && (
                  <span 
                    className="inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing" 
                    title="Drag to reorder section" 
                    aria-label="Drag section handle"
                    draggable
                    onDragStart={() => {
                      onSectionDragStart(section);
                    }}
                    onDragEnd={() => {
                      if (draggingSection === section) {
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
                {editingSectionName === section && canEdit ? (
                  <input
                    type="text"
                    value={editingSectionNameValue}
                    onChange={(e) => setEditingSectionNameValue(e.target.value)}
                    onBlur={() => {
                      if (editingSectionNameValue.trim()) {
                        setSectionNames(prev => ({ ...prev, [section]: editingSectionNameValue.trim() }));
                      } else {
                        // If empty, restore original value - don't change sectionNames
                      }
                      setEditingSectionName(null);
                      setEditingSectionNameValue('');
                      setEditingSectionNameOriginal('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editingSectionNameValue.trim()) {
                          setSectionNames(prev => ({ ...prev, [section]: editingSectionNameValue.trim() }));
                        }
                        // If empty, don't save - original value will be restored automatically
                        setEditingSectionName(null);
                        setEditingSectionNameValue('');
                        setEditingSectionNameOriginal('');
                      } else if (e.key === 'Escape') {
                        // Restore original value on Escape
                        setEditingSectionName(null);
                        setEditingSectionNameValue('');
                        setEditingSectionNameOriginal('');
                      }
                    }}
                    placeholder={
                      section.startsWith('Product Section') ? "Insert Product Section Name. E.g.: Roof, Wood Blocking, Flashing..." :
                      section.startsWith('Shop Section') ? "Insert Shop Section Name" :
                      section.startsWith('Labour Section') ? "Insert Labour Section Name" :
                      section.startsWith('Sub-Contractor Section') ? "Insert Sub-Contractor Section Name" :
                      section.startsWith('Miscellaneous Section') ? "Insert Miscellaneous Section Name" :
                      "Insert Section Name"
                    }
                    className="font-semibold text-gray-900 border rounded px-3 py-2 min-w-[400px] placeholder:text-gray-400 placeholder:font-normal"
                    autoFocus
                  />
                ) : (
                  <h3 className="font-semibold text-gray-900">
                    {sectionNames[section] || 
                      (section.startsWith('Labour Section') ? 'Labour' :
                       section.startsWith('Sub-Contractor Section') ? 'Sub-Contractor' :
                       section.startsWith('Miscellaneous Section') ? 'Miscellaneous' :
                       section.startsWith('Shop Section') ? 'Shop' :
                       section.startsWith('Product Section') ? 'Product Section' :
                       section)}
                  </h3>
                )}
                {canEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Get current display name as the value to edit
                      const currentDisplayName = sectionNames[section] || 
                        (section.startsWith('Labour Section') ? 'Labour' :
                         section.startsWith('Sub-Contractor Section') ? 'Sub-Contractor' :
                         section.startsWith('Miscellaneous Section') ? 'Miscellaneous' :
                         section.startsWith('Shop Section') ? 'Shop' :
                         section.startsWith('Product Section') ? 'Product Section' :
                         section);
                      setEditingSectionName(section);
                      setEditingSectionNameValue('');
                      setEditingSectionNameOriginal(currentDisplayName);
                    }}
                    className="px-2 py-1 rounded text-gray-500 hover:text-blue-600"
                    title="Edit section name"
                    disabled={!canEdit}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const sectionType = section.startsWith('Product Section') ? 'product' :
                                        section.startsWith('Labour Section') ? 'labour' :
                                        section.startsWith('Sub-Contractor Section') ? 'subcontractor' :
                                        section.startsWith('Miscellaneous Section') ? 'miscellaneous' :
                                        section.startsWith('Shop Section') ? 'shop' :
                                        ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ? 
                                          (section === 'Labour' ? 'labour' : section === 'Sub-Contractors' ? 'subcontractor' : section === 'Shop' ? 'shop' : 'miscellaneous') :
                                        'product';
                      return (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddingToSection({ section, type: sectionType as 'product' | 'labour' | 'subcontractor' | 'miscellaneous' | 'shop' });
                          }}
                          className="px-2 py-1 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111] flex items-center justify-center"
                          title="Add item to section"
                          disabled={!canEdit}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="4" x2="12" y2="20"></line>
                            <line x1="4" y1="12" x2="20" y2="12"></line>
                          </svg>
                        </button>
                      );
                    })()}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSection(section);
                      }} 
                      className="px-2 py-1 rounded text-gray-500 hover:text-red-600" 
                      title="Remove section"
                      disabled={!canEdit}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M9 3h6a1 1 0 0 1 1 1v2h4v2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8H4V6h4V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-2 2 1 12h8l1-12H8Z"></path>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  {!isLabourSection ? (
                    <>
                      <th className="p-2 text-left">Product / Item</th>
                      <th className="p-2 text-left">Quantity Required</th>
                      <th className="p-2 text-left">Demand Unit</th>
                      <th className="p-2 text-left">Unit Price</th>
                      <th className="p-2 text-left">Purchase Quantity</th>
                      <th className="p-2 text-left">Sell Unit</th>
                      <th className="p-2 text-left">Total</th>
                      <th className="p-2 text-left">Mkp%</th>
                      <th className="p-2 text-left">Total (with Mkp)</th>
                      <th className="p-2 text-center">Taxable</th>
                      <th className="p-2 text-left">Supplier</th>
                      <th className="p-2"></th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 text-left">
                        {section.startsWith('Miscellaneous Section') || section === 'Miscellaneous' || section.startsWith('Shop Section') || section === 'Shop' ? 'Product / Item' :
                         section.startsWith('Labour Section') || section === 'Labour' ? 'Labour' :
                         section.startsWith('Sub-Contractor Section') || section === 'Sub-Contractors' ? 'Sub-Contractor' :
                         section}
                      </th>
                      <th className="p-2 text-left">
                        {section.startsWith('Miscellaneous Section') || section === 'Miscellaneous' || section.startsWith('Shop Section') || section === 'Shop' ? 'Quantity Required' : 'Composition'}
                      </th>
                      <th className="p-2 text-left">Unit Price</th>
                      <th className="p-2 text-left">Total</th>
                      <th className="p-2 text-left">Mkp%</th>
                      <th className="p-2 text-left">Total (with Mkp)</th>
                      <th className="p-2 text-center">Taxable</th>
                      <th className="p-2"></th>
                    </>
                  )}
                </tr></thead>
                <tbody>
                  {sectionItems.length === 0 ? (
                    <tr>
                      <td colSpan={!isLabourSection ? 12 : 8} className="p-4 text-center text-gray-500">
                        No items yet. Click the + button to add items to this section.
                      </td>
                    </tr>
                  ) : (
                    sectionItems.map((it, idx)=> {
                    const originalIdx = items.indexOf(it);
                    const itemMarkup = it.markup !== undefined && it.markup !== null ? it.markup : markup;
                    // Calculate total value based on item type
                    let totalValue = 0;
                    if (!isLabourSection) {
                      totalValue = it.quantity * it.unit_price;
                    } else {
                      // For labour/subcontractor/shop, check if it's labour with special calculation
                      if (it.item_type === 'labour' && it.labour_journey_type) {
                        if (it.labour_journey_type === 'contract') {
                          totalValue = it.labour_journey! * it.unit_price;
                        } else {
                          totalValue = it.labour_journey! * it.labour_men! * it.unit_price;
                        }
                      } else {
                        totalValue = it.quantity * it.unit_price;
                      }
                    }
                    const totalWithMarkup = totalValue * (1 + (itemMarkup/100));
                    return (
                      <tr key={`${section}-${originalIdx}`} className="border-b hover:bg-gray-50">
                        {!isLabourSection ? (
                          <>
                            <td className="p-2">
                              {it.item_type === 'product' && it.material_id ? (
                                <button
                                  onClick={() => setViewingProductId(it.material_id!)}
                                  className="text-left cursor-pointer hover:text-red-600"
                                  title="View product details"
                                >
                                  {it.name}
                                </button>
                              ) : (
                                <span>{it.name}</span>
                              )}
                            </td>
                            <td className="p-2">
                              <input type="number" className={`w-20 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={it.qty_required ?? ''} min={0} step={1}
                                onChange={e=>{
                                  if (!canEdit) return;
                                  const inputValue = e.target.value;
                                  if (inputValue === '') {
                                    // Allow empty field during editing
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, qty_required: undefined} : item));
                                    return;
                                  }
                                  const newValue = Number(inputValue);
                                  if (!isNaN(newValue)) {
                                    const newItem = {...it, qty_required: newValue};
                                    const calculatedQty = calculateQuantity(newItem);
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...newItem, quantity: calculatedQty} : item));
                                  }
                                }}
                                onBlur={e=>{
                                  if (!canEdit) return;
                                  // If empty on blur, set to default value
                                  if (e.target.value === '' || e.target.value === null) {
                                    const newItem = {...it, qty_required: 1};
                                    const calculatedQty = calculateQuantity(newItem);
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...newItem, quantity: calculatedQty} : item));
                                  }
                                }}
                                disabled={!canEdit}
                                readOnly={!canEdit} />
                            </td>
                            <td className="p-2">
                              <select className={`w-20 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={it.unit_required||''}
                                onChange={e=>{
                                  if (!canEdit) return;
                                  const newValue = e.target.value;
                                  const newItem = {...it, unit_required: newValue};
                                  const calculatedQty = calculateQuantity(newItem);
                                  setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...newItem, quantity: calculatedQty} : item));
                                }}
                                disabled={!canEdit}>
                                <option value="">—</option>
                                {it.unit_type === 'coverage' && (
                                  <>
                                    <option value="SQS">SQS</option>
                                    <option value="ft²">ft²</option>
                                    <option value="m²">m²</option>
                                  </>
                                )}
                                {it.unit_type === 'multiple' && <option value="package">package</option>}
                                {it.unit_type === 'unitary' && <option value="Each">Each</option>}
                              </select>
                            </td>
                            <td className="p-2">${it.unit_price.toFixed(2)}</td>
                            <td className="p-2">
                              <input type="number" className={`w-20 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={it.quantity ?? ''} min={0} step={1}
                                onChange={e=>{
                                  if (!canEdit) return;
                                  const inputValue = e.target.value;
                                  if (inputValue === '') {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, quantity: 0} : item));
                                    return;
                                  }
                                  const newValue = Number(inputValue);
                                  if (!isNaN(newValue)) {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, quantity: newValue} : item));
                                  }
                                }}
                                onBlur={e=>{
                                  if (!canEdit) return;
                                  if (e.target.value === '' || e.target.value === null) {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, quantity: 0} : item));
                                  }
                                }}
                                disabled={!canEdit}
                                readOnly={!canEdit} />
                            </td>
                            <td className="p-2">{it.unit||''}</td>
                            <td className="p-2">${totalValue.toFixed(2)}</td>
                            <td className="p-2">
                              <input type="number" className={`w-16 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={it.markup !== undefined && it.markup !== null ? it.markup : ''} min={0} step={1}
                                onChange={e=>{
                                  if (!canEdit) return;
                                  const inputValue = e.target.value;
                                  if (inputValue === '') {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, markup: 0} : item));
                                    return;
                                  }
                                  const newValue = Number(inputValue);
                                  if (!isNaN(newValue) && newValue >= 0) {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, markup: newValue} : item));
                                  }
                                }}
                                onBlur={e=>{
                                  if (!canEdit) return;
                                  if (e.target.value === '' || e.target.value === null) {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, markup: 0} : item));
                                  }
                                }}
                                disabled={!canEdit}
                                readOnly={!canEdit} />
                            </td>
                            <td className="p-2">${totalWithMarkup.toFixed(2)}</td>
                            <td className="p-2 text-center">
                              <input type="checkbox" checked={it.taxable!==false} 
                                onChange={e=>{
                                  if (!canEdit) return;
                                  setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, taxable: e.target.checked} : item));
                                }}
                                className={canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}
                                disabled={!canEdit} />
                            </td>
                            <td className="p-2">{it.supplier_name||''}</td>
                          </>
                        ) : (
                          <>
                            <td className="p-2">{it.description||it.name}</td>
                            <td className="p-2">
                              {it.item_type === 'labour' && it.labour_journey_type ? (
                                it.labour_journey_type === 'contract' ? (
                                  <div className="flex items-center gap-2">
                                    <input type="number" className={`w-16 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={it.labour_journey ?? ''} min={0} step={0.5} 
                                      onChange={e=>{
                                        if (!canEdit) return;
                                        const inputValue = e.target.value;
                                        if (inputValue === '') {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: 0} : item));
                                          return;
                                        }
                                        const newValue = Number(inputValue);
                                        if (!isNaN(newValue)) {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: newValue} : item));
                                        }
                                      }}
                                      onBlur={e=>{
                                        if (!canEdit) return;
                                        if (e.target.value === '' || e.target.value === null) {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: 0} : item));
                                        }
                                      }}
                                      disabled={!canEdit}
                                      readOnly={!canEdit} />
                                    <span>{it.unit || ''}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <input type="number" className={`w-16 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={it.labour_journey ?? ''} min={0} step={0.5} 
                                      onChange={e=>{
                                        if (!canEdit) return;
                                        const inputValue = e.target.value;
                                        if (inputValue === '') {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: 0} : item));
                                          return;
                                        }
                                        const newValue = Number(inputValue);
                                        if (!isNaN(newValue)) {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: newValue} : item));
                                        }
                                      }}
                                      onBlur={e=>{
                                        if (!canEdit) return;
                                        if (e.target.value === '' || e.target.value === null) {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: 0} : item));
                                        }
                                      }}
                                      disabled={!canEdit}
                                      readOnly={!canEdit} />
                                    <span>{it.labour_journey_type}</span>
                                    <span>×</span>
                                    <input type="number" className={`w-14 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={it.labour_men ?? ''} min={0} step={1} 
                                      onChange={e=>{
                                        if (!canEdit) return;
                                        const inputValue = e.target.value;
                                        if (inputValue === '') {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_men: 0} : item));
                                          return;
                                        }
                                        const newMen = Number(inputValue);
                                        if (!isNaN(newMen)) {
                                          const baseName = it.description?.includes(' - ') ? it.description.split(' - ')[0] : it.description || it.name;
                                          const newDesc = newMen > 0 ? `${baseName} - ${newMen} men` : baseName;
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_men: newMen, description: newDesc} : item));
                                        }
                                      }}
                                      onBlur={e=>{
                                        if (!canEdit) return;
                                        if (e.target.value === '' || e.target.value === null) {
                                          const baseName = it.description?.includes(' - ') ? it.description.split(' - ')[0] : it.description || it.name;
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_men: 1, description: `${baseName} - 1 men`} : item));
                                        }
                                      }}
                                      disabled={!canEdit}
                                      readOnly={!canEdit} />
                                    <span>men</span>
                                  </div>
                                )
                              ) : (
                                <div className="flex items-center gap-2">
                                  <input type="number" className={`w-20 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={it.quantity ?? ''} min={0} step={['Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ? 1 : 0.01} 
                                    onChange={e=>{
                                      if (!canEdit) return;
                                      const inputValue = e.target.value;
                                      if (inputValue === '') {
                                        setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, quantity: 0} : item));
                                        return;
                                      }
                                      const newValue = Number(inputValue);
                                      if (!isNaN(newValue)) {
                                        setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, quantity: newValue} : item));
                                      }
                                    }}
                                    onBlur={e=>{
                                      if (!canEdit) return;
                                      if (e.target.value === '' || e.target.value === null) {
                                        setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, quantity: 0} : item));
                                      }
                                    }}
                                    disabled={!canEdit}
                                    readOnly={!canEdit} />
                                  <span>{it.unit || ''}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-left">
                              <div className="flex items-center gap-1">
                                <span>$</span>
                                <input type="number" className={`w-20 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                  value={it.unit_price ?? ''} min={0} step={(it.item_type === 'labour' || it.item_type === 'subcontractor' || it.item_type === 'shop' || it.item_type === 'miscellaneous' || ['Sub-Contractors', 'Shop', 'Miscellaneous', 'Labour'].includes(section)) ? 1 : 0.01}
                                  onChange={e=>{
                                    if (!canEdit) return;
                                    const inputValue = e.target.value;
                                    if (inputValue === '') {
                                      setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, unit_price: 0} : item));
                                      return;
                                    }
                                    const newValue = Number(inputValue);
                                    if (!isNaN(newValue)) {
                                      setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, unit_price: newValue} : item));
                                    }
                                  }}
                                  onBlur={e=>{
                                    if (!canEdit) return;
                                    if (e.target.value === '' || e.target.value === null) {
                                      setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, unit_price: 0} : item));
                                    }
                                  }}
                                  disabled={!canEdit}
                                  readOnly={!canEdit} />
                                <span>
                                  {it.item_type === 'labour' && it.labour_journey_type ? (
                                    it.labour_journey_type === 'contract' 
                                      ? (() => {
                                          // For contract, check if unit is "each" or "lump sum" (no "per")
                                          const unitLower = (it.unit || '').toLowerCase().trim();
                                          if (unitLower === 'each' || unitLower === 'lump sum') {
                                            return it.unit || '';
                                          }
                                          // For "sqs", keep as is (show "per sqs")
                                          if (unitLower === 'sqs') {
                                            return it.unit ? `per ${it.unit}` : '';
                                          }
                                          // Convert to singular for display (except sqs)
                                          const unitSingular = it.unit?.endsWith('s') ? it.unit.slice(0, -1) : it.unit;
                                          return unitSingular ? `per ${unitSingular}` : '';
                                        })()
                                      : (() => {
                                          // For days/hours, convert to singular if needed
                                          const journeyType = it.labour_journey_type;
                                          const singular = journeyType?.endsWith('s') ? journeyType.slice(0, -1) : journeyType;
                                          return `per ${singular}`;
                                        })()
                                  ) : (
                                    (() => {
                                      // For subcontractor, shop, and miscellaneous
                                      if (['subcontractor', 'shop', 'miscellaneous'].includes(it.item_type || '')) {
                                        const unitLower = (it.unit || '').toLowerCase().trim();
                                        if (unitLower === 'each' || unitLower === 'lump sum') {
                                          return it.unit || '';
                                        }
                                        // Keep "sqs" as is, convert others to singular for display
                                        if (unitLower === 'sqs') {
                                          return it.unit ? `per ${it.unit}` : '';
                                        }
                                        const unitSingular = it.unit?.endsWith('s') ? it.unit.slice(0, -1) : it.unit;
                                        return unitSingular ? `per ${unitSingular}` : '';
                                      }
                                      // For other cases (products), show "per unit" as is
                                      return it.unit ? `per ${it.unit}` : '';
                                    })()
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="p-2">${totalValue.toFixed(2)}</td>
                            <td className="p-2">
                              <input type="number" className={`w-16 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={it.markup !== undefined && it.markup !== null ? it.markup : ''} min={0} step={1}
                                onChange={e=>{
                                  if (!canEdit) return;
                                  const inputValue = e.target.value;
                                  if (inputValue === '') {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, markup: 0} : item));
                                    return;
                                  }
                                  const newValue = Number(inputValue);
                                  if (!isNaN(newValue) && newValue >= 0) {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, markup: newValue} : item));
                                  }
                                }}
                                onBlur={e=>{
                                  if (!canEdit) return;
                                  if (e.target.value === '' || e.target.value === null) {
                                    setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, markup: 0} : item));
                                  }
                                }}
                                disabled={!canEdit}
                                readOnly={!canEdit} />
                            </td>
                            <td className="p-2">${totalWithMarkup.toFixed(2)}</td>
                            <td className="p-2 text-center">
                              <input type="checkbox" checked={it.taxable!==false} 
                                onChange={e=>{
                                  if (!canEdit) return;
                                  setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, taxable: e.target.checked} : item));
                                }}
                                className={canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}
                                disabled={!canEdit} />
                            </td>
                          </>
                        )}
                        {canEdit && (
                          <td className="p-2">
                            <button 
                              onClick={()=> handleRemoveItem(originalIdx, it.name || it.description || 'this item')} 
                              className="px-2 py-1 rounded text-gray-500 hover:text-red-600" 
                              title="Remove item">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M9 3h6a1 1 0 0 1 1 1v2h4v2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8H4V6h4V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-2 2 1 12h8l1-12H8Z"></path>
                              </svg>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                  )}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={!isLabourSection ? 10 : 7} className="p-2 text-right font-semibold">Section Subtotal:</td>
                    <td className="p-2 text-right font-bold">${sectionItems.reduce((acc, it)=> {
                      const m = it.markup !== undefined && it.markup !== null ? it.markup : markup;
                      let itemTotal = 0;
                      if (!isLabourSection) {
                        itemTotal = it.quantity * it.unit_price;
                      } else {
                        if (it.item_type === 'labour' && it.labour_journey_type) {
                          if (it.labour_journey_type === 'contract') {
                            itemTotal = it.labour_journey! * it.unit_price;
                          } else {
                            itemTotal = it.labour_journey! * it.labour_men! * it.unit_price;
                          }
                        } else {
                          itemTotal = it.quantity * it.unit_price;
                        }
                      }
                      return acc + (itemTotal * (1 + (m/100)));
                    }, 0).toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )})
        ) : (
          <div className="rounded-xl border bg-white p-6 text-center text-gray-600">
            No items yet. Add products, labour, sub-contractors or shop items to build your estimate.
          </div>
        )}
      </div>

      {/* Summary Section */}
      <div className="mt-6 space-y-4">
        {/* Summary Title Card */}
        <div className="rounded-t-xl bg-gradient-to-br from-[#7f1010] to-[#a31414] p-4 text-white font-semibold text-lg">
          Summary
        </div>
        
        {/* Two Cards Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Left Card */}
          <div className="rounded-xl border bg-white p-4">
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>Total Products Costs</span><span>${totalProductsCosts.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>Total Labour Costs</span><span>${totalLabourCosts.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>Total Sub-Contractors Costs</span><span>${totalSubContractorsCosts.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>Total Shop Costs</span><span>${totalShopCosts.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>Total Miscellaneous Costs</span><span>${totalMiscellaneousCosts.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Total Direct Project Costs</span><span className="font-bold">${totalDirectProjectCosts.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>PST ({pstRate}%)</span><span>${pst.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Sub-total</span><span className="font-bold">${subtotal.toFixed(2)}</span></div>
            </div>
          </div>
          {/* Right Card */}
          <div className="rounded-xl border bg-white p-4">
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>Sections Mark-up</span><span>${markupValue.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1">
                <span>Profit (%)</span>
                <input 
                  type="number" 
                  className="border rounded px-2 py-1 w-20 text-right" 
                  value={profitRate} 
                  min={0} 
                  step={1}
                  onChange={e=>setProfitRate(Number(e.target.value||0))} 
                />
              </div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Total Profit</span><span className="font-bold">${profitValue.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Total Estimate</span><span className="font-bold">${finalTotal.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>GST ({gstRate}%)</span><span>${gst.toFixed(2)}</span></div>
              <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1 text-lg"><span className="font-bold">Final Total (with GST)</span><span className="font-bold">${grandTotal.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Spacer to prevent fixed bar from overlapping content */}
      <div className="h-24" />

      {/* Fixed Unsaved Changes bar */}
      <div className="fixed left-60 right-0 bottom-0 z-40">
        <div className="px-4">
          <div className="mx-auto max-w-[1400px] rounded-t-xl border bg-white/95 backdrop-blur p-4 flex items-center justify-between shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
            {/* Left: Status indicator (only show when canEdit) */}
            {canEdit && (
              <div className={dirty ? 'text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 font-medium' : 'text-sm text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1.5 font-medium'}>
                {dirty ? 'Unsaved changes' : 'All changes saved'}
              </div>
            )}
            {!canEdit && <div className="w-0"></div>}
            
            {/* Center: Analysis and PDF */}
            <div className="flex items-center gap-2">
                <button
                  onClick={()=>setSummaryOpen(true)}
                  className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors">
                  Analysis
                </button>
                <div className="w-px h-5 bg-gray-300"></div>
                <button
                  onClick={async()=>{
                    try{
                      setIsLoading(true);
                      // First ensure estimate is saved (only if canEdit)
                      let estimateIdToUse = currentEstimateId;
                      if (!estimateIdToUse) {
                        if (!canEdit) {
                          toast.error('Estimate not found. Please save the estimate first.');
                          setIsLoading(false);
                          return;
                        }
                        const payload = { 
                          project_id: projectId, 
                          markup, 
                          pst_rate: pstRate,
                          gst_rate: gstRate,
                          profit_rate: profitRate,
                          section_order: sectionOrder,
                          items: items.map(it=> ({ 
                            material_id: it.material_id, 
                            quantity: it.quantity, 
                            unit_price: it.unit_price, 
                            section: it.section, 
                            description: it.description, 
                            item_type: it.item_type,
                            name: it.name,
                            unit: it.unit,
                            markup: it.markup,
                            taxable: it.taxable,
                            qty_required: it.qty_required,
                            unit_required: it.unit_required,
                            supplier_name: it.supplier_name,
                            unit_type: it.unit_type,
                            units_per_package: it.units_per_package,
                            coverage_sqs: it.coverage_sqs,
                            coverage_ft2: it.coverage_ft2,
                            coverage_m2: it.coverage_m2,
                            labour_journey: it.labour_journey,
                            labour_men: it.labour_men,
                            labour_journey_type: it.labour_journey_type
                          })) 
                        };
                        const result = await api<any>('POST', '/estimate/estimates', payload);
                        estimateIdToUse = result.id;
                        setCurrentEstimateId(estimateIdToUse);
                      }
                      
                      // Generate PDF
                      const token = localStorage.getItem('user_token');
                      const resp = await fetch(`/estimate/estimates/${estimateIdToUse}/generate`, {
                        method: 'GET',
                        headers: token ? { Authorization: `Bearer ${token}` } : {}
                      });
                      
                      if (!resp.ok) {
                        throw new Error('Failed to generate PDF');
                      }
                      
                      const blob = await resp.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `estimate-${estimateIdToUse}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      
                      toast.success('PDF generated and downloaded');
                    }catch(_e){
                      toast.error('Failed to generate PDF');
                    }finally{
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading || items.length === 0}
                  className="px-4 py-2 rounded-lg bg-gray-400 hover:bg-gray-500 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {isLoading ? 'Generating...' : 'Generate PDF'}
                </button>
              </div>
              
              {/* Right: Generate Orders (only for Projects, not Opportunities) and Save */}
              {canEdit ? (
                <div className="flex items-center gap-2">
                  {!isBidding && (
                    <>
                      <button 
                        onClick={async () => {
                          if (!currentEstimateId) {
                            toast.error('Please save the estimate first');
                            return;
                          }
                          try {
                            setIsLoading(true);
                            const response = await api('POST', `/orders/projects/${projectId}/generate`, { estimate_id: currentEstimateId });
                            toast.success(`Generated ${response.orders_created || 0} orders successfully`);
                            // Invalidate orders query so they appear immediately in the orders tab
                            queryClient.invalidateQueries({ queryKey: ['projectOrders', projectId] });
                            // Navigate to orders tab would be handled by parent
                          } catch (error: any) {
                            const errorMsg = error.response?.data?.detail || error.message || 'Failed to generate orders';
                            toast.error(errorMsg);
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        disabled={isLoading || !currentEstimateId || items.length === 0}
                        className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                        {isLoading ? 'Generating...' : 'Generate Orders'}
                      </button>
                      <div className="w-px h-5 bg-gray-300"></div>
                    </>
                  )}
                  <button 
                    disabled={!dirty} 
                    onClick={handleManualSave}
                    className={`px-5 py-2 rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm ${
                      dirty 
                        ? 'bg-gradient-to-r from-brand-red to-[#ee2b2b] hover:from-red-700 hover:to-red-800' 
                        : 'bg-gray-400 hover:bg-gray-500'
                    }`}>
                    Save
                  </button>
                </div>
              ) : (
                <div className="w-0"></div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
});

export default EstimateBuilder;

function SummaryModal({ open, onClose, items, pstRate, gstRate, markup, profitRate, sectionNames, sectionOrder }: { open:boolean, onClose:()=>void, items:Item[], pstRate:number, gstRate:number, markup:number, profitRate:number, sectionNames:Record<string, string>, sectionOrder:string[] }){
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Calculate item total based on item type
  const calculateItemTotal = (it: Item): number => {
    if (it.item_type === 'labour' && it.labour_journey_type) {
      if (it.labour_journey_type === 'contract') {
        return (it.labour_journey || 0) * it.unit_price;
      } else {
        return (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
      }
    }
    return it.quantity * it.unit_price;
  };

  // Calculate item total with markup applied
  const calculateItemTotalWithMarkup = (it: Item): number => {
    const itemTotal = calculateItemTotal(it);
    const itemMarkup = it.markup !== undefined && it.markup !== null ? it.markup : markup;
    return itemTotal * (1 + (itemMarkup / 100));
  };

  // Helper to get display name for section
  const getSectionDisplayName = useCallback((section: string): string => {
    return sectionNames[section] || 
      (section.startsWith('Labour Section') ? 'Labour' :
       section.startsWith('Sub-Contractor Section') ? 'Sub-Contractor' :
       section.startsWith('Miscellaneous Section') ? 'Miscellaneous' :
       section.startsWith('Shop Section') ? 'Shop' :
       section.startsWith('Product Section') ? 'Product Section' :
       section);
  }, [sectionNames]);

  // Calculate costs by section
  const costsBySection = useMemo(() => {
    const sectionTotals: Record<string, number> = {};
    items.forEach(it => {
      const section = it.section || 'Miscellaneous';
      if (!sectionTotals[section]) sectionTotals[section] = 0;
      sectionTotals[section] += calculateItemTotalWithMarkup(it);
    });
    return sectionTotals;
  }, [items, markup]);

  const totalCost = useMemo(() => Object.values(costsBySection).reduce((acc: number, val: number) => acc + val, 0), [costsBySection]);
  
  // Calculate labor, materials, sub-contractors, shop totals
  const laborTotal = useMemo(() => {
    return items.filter(it => it.item_type === 'labour').reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, markup]);

  const materialTotal = useMemo(() => {
    return items.filter(it => !['labour'].includes(it.item_type || '')).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, markup]);

  const subcontractorTotal = useMemo(() => {
    return costsBySection['Sub-Contractors'] || 0;
  }, [costsBySection]);

  const shopTotal = useMemo(() => {
    return costsBySection['Shop'] || 0;
  }, [costsBySection]);

  const miscellaneousTotal = useMemo(() => {
    return costsBySection['Miscellaneous'] || 0;
  }, [costsBySection]);

  // Calculate product total (all items in product sections)
  const productTotal = useMemo(() => {
    return items.filter(it => {
      const section = it.section || 'Miscellaneous';
      return !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) &&
             !section.startsWith('Labour Section') &&
             !section.startsWith('Sub-Contractor Section') &&
             !section.startsWith('Shop Section') &&
             !section.startsWith('Miscellaneous Section');
    }).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, markup]);

  // Calculate subcontractor total (all items in subcontractor sections)
  const subcontractorItemsTotal = useMemo(() => {
    return items.filter(it => {
      const section = it.section || 'Miscellaneous';
      return section === 'Sub-Contractors' || section.startsWith('Sub-Contractor Section');
    }).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, markup]);

  // Calculate shop total (all items in shop sections)
  const shopItemsTotal = useMemo(() => {
    return items.filter(it => {
      const section = it.section || 'Miscellaneous';
      return section === 'Shop' || section.startsWith('Shop Section');
    }).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, markup]);

  // Calculate miscellaneous total (all items in miscellaneous sections)
  const miscellaneousItemsTotal = useMemo(() => {
    return items.filter(it => {
      const section = it.section || 'Miscellaneous';
      return section === 'Miscellaneous' || section.startsWith('Miscellaneous Section');
    }).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, markup]);

  // Total of all items (same calculation as main page)
  const total = useMemo(() => {
    return items.reduce((acc, it) => {
      let itemTotal = 0;
      if (it.item_type === 'labour' && it.labour_journey_type) {
        if (it.labour_journey_type === 'contract') {
          itemTotal = (it.labour_journey || 0) * it.unit_price;
        } else {
          itemTotal = (it.labour_journey || 0) * (it.labour_men || 0) * it.unit_price;
        }
      } else {
        itemTotal = it.quantity * it.unit_price;
      }
      return acc + itemTotal;
    }, 0);
  }, [items]);
  
  // Total of taxable items only (for PST calculation) - with markup
  const taxableTotal = useMemo(() => {
    return items
      .filter(it => it.taxable !== false) // Only items marked as taxable
      .reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, markup]);
  
  const pst = useMemo(() => taxableTotal * (pstRate/100), [taxableTotal, pstRate]);
  const subtotal = useMemo(() => totalCost + pst, [totalCost, pst]);
  
  // Calculate Sections Mark-up as the difference between total with markup and total without markup
  const markupValue = useMemo(() => {
    return totalCost - total;
  }, [totalCost, total]);
  
  const profitValue = useMemo(() => subtotal * (profitRate/100), [subtotal, profitRate]);
  const totalEstimate = useMemo(() => subtotal + profitValue, [subtotal, profitValue]);
  const gst = useMemo(() => totalEstimate * (gstRate/100), [totalEstimate, gstRate]);
  const finalTotal = useMemo(() => totalEstimate + gst, [totalEstimate, gst]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-[800px] max-w-full bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Summary and Analysis</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Cost Breakdown by Section */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b font-semibold">Cost Breakdown by Section</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-2 text-left">Section</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(costsBySection).sort().map(section => {
                  const total = costsBySection[section];
                  const percentage = totalCost > 0 ? (total / totalCost * 100) : 0;
                  return (
                    <tr key={section} className="border-b hover:bg-gray-50">
                      <td className="p-2">{getSectionDisplayName(section)}</td>
                      <td className="p-2 text-right">${total.toFixed(2)}</td>
                      <td className="p-2 text-right">{percentage.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="p-2 font-semibold">Total</td>
                  <td className="p-2 text-right font-bold">${totalCost.toFixed(2)}</td>
                  <td className="p-2 text-right font-semibold">100.00%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Labor Analysis */}
          {laborTotal > 0 && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b font-semibold">Labor Analysis</div>
              <div className="px-4 py-2 bg-blue-50 border-b">Total Labor Cost: ${laborTotal.toFixed(2)}</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-2 text-left">Labor Item</th>
                    <th className="p-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(it => it.item_type === 'labour').map((it, idx) => {
                    const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                    return (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-2">{it.description || it.name}</td>
                        <td className="p-2 text-right">${itemTotalWithMarkup.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Product Analysis */}
          {productTotal > 0 && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b font-semibold">Product Analysis</div>
              <div className="px-4 py-2 bg-blue-50 border-b">Total Product Cost: ${productTotal.toFixed(2)}</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-2 text-left">Product Item</th>
                    <th className="p-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(it => {
                    const section = it.section || 'Miscellaneous';
                    return !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) &&
                           !section.startsWith('Labour Section') &&
                           !section.startsWith('Sub-Contractor Section') &&
                           !section.startsWith('Shop Section') &&
                           !section.startsWith('Miscellaneous Section');
                  }).map((it, idx) => {
                    const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                    return (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-2">{it.description || it.name}</td>
                        <td className="p-2 text-right">${itemTotalWithMarkup.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sub-Contractor Analysis */}
          {subcontractorItemsTotal > 0 && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b font-semibold">Sub-Contractor Analysis</div>
              <div className="px-4 py-2 bg-blue-50 border-b">Total Sub-Contractor Cost: ${subcontractorItemsTotal.toFixed(2)}</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-2 text-left">Sub-Contractor Item</th>
                    <th className="p-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(it => {
                    const section = it.section || 'Miscellaneous';
                    return section === 'Sub-Contractors' || section.startsWith('Sub-Contractor Section');
                  }).map((it, idx) => {
                    const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                    return (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-2">{it.description || it.name}</td>
                        <td className="p-2 text-right">${itemTotalWithMarkup.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Shop Analysis */}
          {shopItemsTotal > 0 && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b font-semibold">Shop Analysis</div>
              <div className="px-4 py-2 bg-blue-50 border-b">Total Shop Cost: ${shopItemsTotal.toFixed(2)}</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-2 text-left">Shop Item</th>
                    <th className="p-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(it => {
                    const section = it.section || 'Miscellaneous';
                    return section === 'Shop' || section.startsWith('Shop Section');
                  }).map((it, idx) => {
                    const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                    return (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-2">{it.description || it.name}</td>
                        <td className="p-2 text-right">${itemTotalWithMarkup.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Miscellaneous Analysis */}
          {miscellaneousItemsTotal > 0 && (
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b font-semibold">Miscellaneous Analysis</div>
              <div className="px-4 py-2 bg-blue-50 border-b">Total Miscellaneous Cost: ${miscellaneousItemsTotal.toFixed(2)}</div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-2 text-left">Miscellaneous Item</th>
                    <th className="p-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(it => {
                    const section = it.section || 'Miscellaneous';
                    return section === 'Miscellaneous' || section.startsWith('Miscellaneous Section');
                  }).map((it, idx) => {
                    const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                    return (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-2">{it.description || it.name}</td>
                        <td className="p-2 text-right">${itemTotalWithMarkup.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}


          {/* Final Summary */}
          <div className="rounded-xl border bg-white overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b font-semibold">Final Summary</div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>Total Direct Costs:</span><span className="font-medium">${totalCost.toFixed(2)}</span></div>
              <div className="flex items-center justify-between border-t pt-2"><span>Total PST:</span><span className="font-medium">${pst.toFixed(2)}</span></div>
              <div className="flex items-center justify-between"><span>Sections Mark-up:</span><span className="font-medium">${markupValue.toFixed(2)}</span></div>
              <div className="flex items-center justify-between">
                <span>Profit (%):</span>
                <span className="font-medium">{profitRate.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between"><span>Total Profit:</span><span className="font-medium">${profitValue.toFixed(2)}</span></div>
              <div className="flex items-center justify-between"><span>Total Estimate:</span><span className="font-medium">${totalEstimate.toFixed(2)}</span></div>
              <div className="flex items-center justify-between"><span>GST:</span><span className="font-medium">${gst.toFixed(2)}</span></div>
              <div className="flex items-center justify-between font-semibold text-lg border-t pt-2"><span>Grand Total:</span><span className="font-semibold">${finalTotal.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductViewModal({ product, onClose }: { product: Material, onClose: () => void }){
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-y-auto">
          <div className="space-y-6">
            {/* Product Header */}
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
                title="Close"
              >
                ×
              </button>
              <div className="w-24 h-24 rounded-xl border-4 border-white shadow-lg overflow-hidden bg-white flex items-center justify-center">
                <img 
                  src={product.image_base64 || '/ui/assets/login/logo-light.svg'} 
                  className="w-full h-full object-cover" 
                  alt={product.name}
                />
              </div>
              <div className="flex-1">
                <h2 className="text-3xl font-extrabold text-white">{product.name}</h2>
                <div className="flex items-center gap-4 mt-3 text-sm">
                  {product.supplier_name && (
                    <div className="flex items-center gap-2">
                      <span className="text-white/80">🏢</span>
                      <span className="text-white">{product.supplier_name}</span>
                    </div>
                  )}
                  {product.category && (
                    <div className="flex items-center gap-2">
                      <span className="text-white/80">📦</span>
                      <span className="text-white">{product.category}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div className="px-6 pb-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {product.unit && (
                <div className="bg-white border rounded-lg p-4">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Sell Unit</div>
                  <div className="text-gray-900">{product.unit}</div>
                </div>
              )}
              {product.unit_type && (
                <div className="bg-white border rounded-lg p-4">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Unit Type</div>
                  <div className="text-gray-900">{product.unit_type}</div>
                </div>
              )}
            </div>
            {typeof product.price === 'number' && (
              <div className="bg-white border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-600 mb-1">Price</div>
                <div className="text-gray-900 font-semibold text-lg">${product.price.toFixed(2)}</div>
              </div>
            )}
            {product.units_per_package && (
              <div className="bg-white border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-600 mb-1">Units per Package</div>
                <div className="text-gray-900">{product.units_per_package}</div>
              </div>
            )}
            {(product.coverage_sqs || product.coverage_ft2 || product.coverage_m2) && (
              <div className="bg-white border rounded-lg p-4">
                <div className="text-sm font-semibold text-gray-900 mb-3">📍 Coverage Area</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-gray-700">SQS: {product.coverage_sqs||'-'}</div>
                  <div className="text-gray-700">ft²: {product.coverage_ft2||'-'}</div>
                  <div className="text-gray-700">m²: {product.coverage_m2||'-'}</div>
                </div>
              </div>
            )}
            {product.description && (
              <div className="bg-white border rounded-lg p-4">
                <div className="text-sm font-semibold text-gray-900 mb-2">Description</div>
                <div className="text-gray-700 whitespace-pre-wrap">{product.description}</div>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddProductModal({ onAdd, disabled, defaultMarkup, open: openProp, onClose: onCloseProp, section: sectionProp }: { onAdd:(it: Item)=>void, disabled?: boolean, defaultMarkup?: number, open?: boolean, onClose?: ()=>void, section?: string }){
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = onCloseProp ? (val: boolean) => { if (!val && onCloseProp) onCloseProp(); if (openProp === undefined) setInternalOpen(val); } : setInternalOpen;
  const [q, setQ] = useState('');
  const [section, setSection] = useState(sectionProp || 'Roof System');
  const [selection, setSelection] = useState<Material|null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(5);
  const { data } = useQuery({ 
    queryKey:['mat-search', q], 
    queryFn: async()=>{
      if (!q.trim()) return [];
      const params = new URLSearchParams(); 
      params.set('q', q);
      return await api<Material[]>('GET', `/estimate/products/search?${params.toString()}`);
    },
    enabled: !!q.trim()
  });
  const allResults = data||[];
  const list = allResults.slice(0, displayedCount);
  const hasMore = allResults.length > displayedCount;

  useEffect(() => {
    if (sectionProp) {
      setSection(sectionProp);
    }
  }, [sectionProp]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const resetForm = () => {
    setQ('');
    setSelection(null);
    setDisplayedCount(5);
  };

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Product</button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[720px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Add Product</div>
              <button onClick={()=>setOpen(false)} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-600">Search Product:</label>
                  <input className="w-full border rounded px-3 py-2" placeholder="Type product name..." value={q} onChange={e=>setQ(e.target.value)} />
                </div>
                <button
                  onClick={() => setSupplierModalOpen(true)}
                  className="px-2 py-1 rounded text-gray-500 hover:text-blue-600 mt-6"
                  title="Browse by supplier">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="M21 21l-4.35-4.35"></path>
                  </svg>
                </button>
              </div>
              {q.trim() && list.length > 0 && (
                <div className="max-h-64 overflow-auto rounded border divide-y">
                  {list.map(p=> (
                    <button key={p.id} onClick={()=>setSelection(p)} className={`w-full text-left px-3 py-2 bg-white hover:bg-gray-50 ${selection?.id===p.id? 'ring-2 ring-brand-red':''}`}>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.supplier_name||''} · {p.unit||''} · ${Number(p.price||0).toFixed(2)}</div>
                    </button>
                  ))}
                  {hasMore && (
                    <button
                      onClick={() => setDisplayedCount(prev => prev + 5)}
                      className="w-full text-center px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm text-gray-600 border-t">
                      Load more ({allResults.length - displayedCount} remaining)
                    </button>
                  )}
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
                      <div className={`w-full h-full bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs ${selection.image_base64 ? 'hidden' : ''}`} style={{ display: selection.image_base64 ? 'none' : 'flex' }}>
                        No Image
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{selection.name}</div>
                        <button
                          onClick={() => setCompareModalOpen(true)}
                          className="px-3 py-1.5 rounded bg-gray-700 text-white hover:bg-gray-800 text-sm">
                          Compare
                        </button>
                      </div>
                      <div className="text-sm text-gray-600">Supplier: {selection.supplier_name||'N/A'}</div>
                      <div className="text-sm text-gray-600">Unit: {selection.unit||'-'} · Price: ${Number(selection.price||0).toFixed(2)}</div>
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
              {selection && !sectionProp && (
                <div>
                  <label className="text-xs text-gray-600">Section:</label>
                  <select className="w-full border rounded px-3 py-2" value={section} onChange={e=>setSection(e.target.value)}>
                    {['Roof System','Wood Blocking / Accessories','Flashing'].map(s=> <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="text-right">
                <button onClick={()=>{
                  if(!selection){ toast.error('Select a product first'); return; }
                  const defaultUnitRequired = selection.unit_type === 'coverage' ? 'SQS' : selection.unit_type === 'multiple' ? 'package' : 'Each';
                  onAdd({ 
                    material_id: selection.id, 
                    name: selection.name, 
                    unit: selection.unit, 
                    quantity: 1, 
                    unit_price: Number(selection.price||0), 
                    section, 
                    item_type: 'product',
                    supplier_name: selection.supplier_name,
                    unit_type: selection.unit_type,
                    units_per_package: selection.units_per_package,
                    coverage_sqs: selection.coverage_sqs,
                    coverage_ft2: selection.coverage_ft2,
                    coverage_m2: selection.coverage_m2,
                    qty_required: 1,
                    unit_required: defaultUnitRequired,
                    markup: defaultMarkup ?? 5,
                    taxable: true
                  });
                  setOpen(false);
                  resetForm();
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Item</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {supplierModalOpen && (
        <SupplierProductModal
          open={supplierModalOpen}
          onClose={() => setSupplierModalOpen(false)}
          onSelect={(product) => {
            setSelection(product);
            setSupplierModalOpen(false);
          }}
        />
      )}
      {compareModalOpen && selection && (
        <CompareProductsModal
          open={compareModalOpen}
          onClose={() => setCompareModalOpen(false)}
          selectedProduct={selection}
          onSelect={(product) => {
            setSelection(product);
            setCompareModalOpen(false);
          }}
        />
      )}
    </>
  );
}

function SupplierProductModal({ open, onClose, onSelect }: { open: boolean, onClose: ()=>void, onSelect: (product: Material)=>void }){
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [displayedProductCount, setDisplayedProductCount] = useState(20);
  const { data: suppliers } = useQuery({ 
    queryKey: ['suppliers'], 
    queryFn: async () => {
      const suppliers = await api<{id: string, name: string}[]>('GET', '/inventory/suppliers');
      return suppliers;
    },
    enabled: open
  });
  
  const { data: allProducts } = useQuery({
    queryKey: ['all-products'],
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
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="w-[1000px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Browse Products by Supplier</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Suppliers List */}
          <div className="w-64 border-r overflow-y-auto bg-gray-50">
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
          <div className="flex-1 overflow-y-auto p-4">
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
                    <div className="grid grid-cols-4 gap-3">
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
                          <div className={`w-full h-full bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs ${product.image_base64 ? 'hidden' : ''}`} style={{ display: product.image_base64 ? 'none' : 'flex' }}>
                            No Image
                          </div>
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
                  <div className="text-center text-gray-500 py-8">
                    No products found for this supplier
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompareProductsModal({ open, onClose, selectedProduct, onSelect }: { open: boolean, onClose: ()=>void, selectedProduct: Material, onSelect: (product: Material)=>void }){
  const { data: relatedProducts } = useQuery({
    queryKey: ['related-products', selectedProduct.id],
    queryFn: async () => {
      if (!selectedProduct.id) return [];
      try {
        return await api<Material[]>('GET', `/estimate/related/${selectedProduct.id}`);
      } catch (e) {
        return [];
      }
    },
    enabled: open && !!selectedProduct.id
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="w-[900px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Compare Products</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {/* Selected Product (Highlighted) */}
          <div className="mb-6">
            <div className="text-sm font-semibold text-gray-700 mb-3">Selected Product</div>
            <div className="border-2 border-gray-300 rounded-lg p-4 bg-gray-50">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {selectedProduct.image_base64 ? (
                    <img 
                      src={selectedProduct.image_base64.startsWith('data:') ? selectedProduct.image_base64 : `data:image/jpeg;base64,${selectedProduct.image_base64}`}
                      alt={selectedProduct.name}
                      className="w-full h-32 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).parentElement?.querySelector('.image-placeholder')?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div className={`w-full h-32 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs ${selectedProduct.image_base64 ? 'hidden image-placeholder' : ''}`}>
                    No Image
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-lg mb-2">{selectedProduct.name}</div>
                  <div className="text-sm text-gray-600 mb-1">Supplier: {selectedProduct.supplier_name || 'N/A'}</div>
                  <div className="text-sm text-gray-600 mb-1">Category: {selectedProduct.category || 'N/A'}</div>
                  <div className="text-sm text-gray-600 mb-1">Unit: {selectedProduct.unit || '-'}</div>
                  <div className="text-lg font-bold text-brand-red mb-2">${Number(selectedProduct.price || 0).toFixed(2)}</div>
                  {selectedProduct.unit_type === 'coverage' && (
                    <div className="text-xs text-gray-600">
                      Coverage: {selectedProduct.coverage_sqs ? `${selectedProduct.coverage_sqs} SQS · ` : ''}{selectedProduct.coverage_ft2 ? `${selectedProduct.coverage_ft2} ft² · ` : ''}{selectedProduct.coverage_m2 ? `${selectedProduct.coverage_m2} m²` : ''}
                    </div>
                  )}
                  {selectedProduct.unit_type === 'multiple' && selectedProduct.units_per_package && (
                    <div className="text-xs text-gray-600">
                      {selectedProduct.units_per_package} units per package
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Related Products */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-3">Related Products ({relatedProducts?.length || 0})</div>
            {relatedProducts && relatedProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {relatedProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => onSelect(product)}
                    className="border rounded-lg p-4 hover:border-brand-red hover:shadow-md transition-all text-left bg-white">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        {product.image_base64 ? (
                          <img 
                            src={product.image_base64.startsWith('data:') ? product.image_base64 : `data:image/jpeg;base64,${product.image_base64}`}
                            alt={product.name}
                            className="w-full h-24 object-contain rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).parentElement?.querySelector('.image-placeholder')?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-24 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs ${product.image_base64 ? 'hidden image-placeholder' : ''}`}>
                          No Image
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-sm mb-1 line-clamp-2">{product.name}</div>
                        <div className="text-xs text-gray-500 mb-1">{product.supplier_name || 'N/A'}</div>
                        <div className="text-xs text-gray-500 mb-1">{product.category || 'N/A'}</div>
                        <div className="text-sm font-semibold text-brand-red">${Number(product.price || 0).toFixed(2)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                No related products found. Add related products in the Products page.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddLabourModal({ onAdd, disabled, defaultMarkup, open: openProp, onClose: onCloseProp, section: sectionProp }: { onAdd:(it: Item)=>void, disabled?: boolean, defaultMarkup?: number, open?: boolean, onClose?: ()=>void, section?: string }){
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = onCloseProp ? (val: boolean) => { if (!val && onCloseProp) onCloseProp(); if (openProp === undefined) setInternalOpen(val); } : setInternalOpen;
  const [labour, setLabour] = useState('');
  const [men, setMen] = useState<string>('1');
  const [journeyType, setJourneyType] = useState<'days'|'hours'|'contract'>('days');
  const [days, setDays] = useState<string>('1');
  const [hours, setHours] = useState<string>('1');
  const [contractNumber, setContractNumber] = useState<string>('1');
  const [contractUnit, setContractUnit] = useState('');
  const [price, setPrice] = useState<string>('0');
  
  const showDays = journeyType === 'days';
  const showHours = journeyType === 'hours';
  const showContract = journeyType === 'contract';

  const total = useMemo(()=>{
    const p = Number(price||0);
    const m = Number(men||0);
    if(showContract){
      return Number(contractNumber||0) * p;
    }else if(showHours){
      return m * Number(hours||0) * p;
    }else{
      return m * Number(days||0) * p;
    }
  }, [men, days, hours, contractNumber, price, journeyType]);

  const calcText = useMemo(()=>{
    const p = Number(price||0).toFixed(2);
    if(showContract){
      return `${contractNumber} ${contractUnit} × $${p} = $${total.toFixed(2)}`;
    }else if(showHours){
      return `${men} men × ${hours} hour × $${p} = $${total.toFixed(2)}`;
    }else{
      return `${men} men × ${days} day × $${p} = $${total.toFixed(2)}`;
    }
  }, [men, days, hours, contractNumber, contractUnit, price, total, journeyType]);

  const priceLabel = useMemo(()=>{
    if(showContract) return 'Price ($ per unit):';
    if(showHours) return 'Price per Worker ($ per hour):';
    return 'Price per Worker ($ per day):';
  }, [journeyType]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Labour</button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Add Labour</div>
              <button onClick={()=>setOpen(false)} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="text-xs text-gray-600">Labour:</label>
                <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter labour function name..." value={labour} onChange={e=>setLabour(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Quantity (Men):</label>
                <input type="number" className="w-full border rounded px-3 py-2" value={men} min={1} step={1} onChange={e=>setMen(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Journey:</label>
                <select className="w-full border rounded px-3 py-2" value={journeyType} onChange={e=>setJourneyType(e.target.value as any)}>
                  <option value="days">Day</option>
                  <option value="hours">Hour</option>
                  <option value="contract">Contract</option>
                </select>
              </div>
              {showDays && (
                <div>
                  <label className="text-xs text-gray-600">Number of Days:</label>
                  <input type="number" className="w-full border rounded px-3 py-2" value={days} min={0} step={0.5} onChange={e=>setDays(e.target.value)} />
                </div>
              )}
              {showHours && (
                <div>
                  <label className="text-xs text-gray-600">Number of Hours:</label>
                  <input type="number" className="w-full border rounded px-3 py-2" value={hours} min={0} step={0.5} onChange={e=>setHours(e.target.value)} />
                </div>
              )}
              {showContract && (
                <div>
                  <label className="text-xs text-gray-600">Number:</label>
                  <div className="flex gap-2 items-center">
                    <input type="number" className="w-24 border rounded px-3 py-2" value={contractNumber} min={0} step={0.01} onChange={e=>setContractNumber(e.target.value)} />
                    <input type="text" className="flex-1 border rounded px-3 py-2" placeholder="Unit (e.g., each, sqs)" value={contractUnit} onChange={e=>setContractUnit(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-600">{priceLabel}</label>
                <input type="number" className="w-full border rounded px-3 py-2" value={price} min={0} step={0.01} onChange={e=>setPrice(e.target.value)} />
              </div>
              <div className="bg-gray-100 p-3 rounded">
                <strong>Total Preview:</strong>
                <div className="mt-1 text-sm text-gray-600">{calcText}</div>
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  if(!labour.trim()){ toast.error('Please enter a labour name'); return; }
                  const priceValue = Number(price||0);
                  let name, desc, qty, unit, journey;
                  if(showContract){
                    name = labour;
                    desc = labour;
                    qty = Number(contractNumber||0);
                    unit = contractUnit||'each';
                    journey = qty;
                  }else{
                    name = labour;
                    desc = `${labour} - ${men} men`;
                    qty = Number(men||0);
                    unit = showHours ? 'hours' : 'days';
                    journey = showHours ? Number(hours||0) : Number(days||0);
                  }
                  onAdd({ name, unit, quantity: qty, unit_price: priceValue, section: sectionProp || 'Labour', description: desc, item_type: 'labour', markup: defaultMarkup ?? 5, taxable: true, labour_journey: journey, labour_men: Number(men||0), labour_journey_type: journeyType });
                  setOpen(false); setLabour(''); setMen('1'); setDays('1'); setHours('1'); setContractNumber('1'); setContractUnit(''); setPrice('0'); setJourneyType('days');
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Labour</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddSubContractorModal({ onAdd, disabled, defaultMarkup, open: openProp, onClose: onCloseProp, section: sectionProp }: { onAdd:(it: Item)=>void, disabled?: boolean, defaultMarkup?: number, open?: boolean, onClose?: ()=>void, section?: string }){
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = onCloseProp ? (val: boolean) => { if (!val && onCloseProp) onCloseProp(); if (openProp === undefined) setInternalOpen(val); } : setInternalOpen;
  const [type, setType] = useState<'debris-cartage'|'portable-washroom'|'other'|''>('');
  
  // Debris Cartage fields
  const [debrisDesc, setDebrisDesc] = useState('');
  const [debrisInputType, setDebrisInputType] = useState<'area'|'loads'>('area');
  const [debrisSqs, setDebrisSqs] = useState<string>('0');
  const [debrisSqsPerLoad, setDebrisSqsPerLoad] = useState<string>('0');
  const [debrisLoads, setDebrisLoads] = useState<string>('0');
  const [debrisPricePerLoad, setDebrisPricePerLoad] = useState<string>('0');
  
  // Portable Washroom fields
  const [washroomPeriod, setWashroomPeriod] = useState<'days'|'months'>('days');
  const [washroomPeriodCount, setWashroomPeriodCount] = useState<string>('1');
  const [washroomPrice, setWashroomPrice] = useState<string>('0');
  
  // Other fields
  const [otherDesc, setOtherDesc] = useState('');
  const [otherNumber, setOtherNumber] = useState<string>('1');
  const [otherUnit, setOtherUnit] = useState('');
  const [otherPrice, setOtherPrice] = useState<string>('0');

  const showDebris = type === 'debris-cartage';
  const showWashroom = type === 'portable-washroom';
  const showOther = type === 'other';

  const total = useMemo(()=>{
    if(showDebris){
      const loads = Number(debrisLoads||0);
      const finalLoads = loads === 0 && Number(debrisSqs||0) > 0 && Number(debrisSqsPerLoad||0) > 0
        ? Math.ceil(Number(debrisSqs||0) / Number(debrisSqsPerLoad||0))
        : loads;
      return finalLoads * Number(debrisPricePerLoad||0);
    }else if(showWashroom){
      return Number(washroomPeriodCount||0) * Number(washroomPrice||0);
    }else if(showOther){
      return Number(otherNumber||0) * Number(otherPrice||0);
    }
    return 0;
  }, [type, debrisLoads, debrisSqs, debrisSqsPerLoad, debrisPricePerLoad, washroomPeriodCount, washroomPrice, otherNumber, otherPrice]);

  const calcText = useMemo(()=>{
    const p = Number(isNaN(total) ? 0 : total).toFixed(2);
    if(showDebris){
      const loads = Number(debrisLoads||0);
      const finalLoads = loads === 0 && Number(debrisSqs||0) > 0 && Number(debrisSqsPerLoad||0) > 0
        ? Math.ceil(Number(debrisSqs||0) / Number(debrisSqsPerLoad||0))
        : loads;
      const price = Number(debrisPricePerLoad||0).toFixed(2);
      return `${finalLoads} loads × $${price} = $${p}`;
    }else if(showWashroom){
      const count = Number(washroomPeriodCount||0);
      const price = Number(washroomPrice||0).toFixed(2);
      return `${count} ${washroomPeriod} × $${price} = $${p}`;
    }else if(showOther){
      const num = Number(otherNumber||0);
      const price = Number(otherPrice||0).toFixed(2);
      return `${num} ${otherUnit} × $${price} = $${p}`;
    }
    return '';
  }, [total, type, debrisLoads, debrisSqs, debrisSqsPerLoad, debrisPricePerLoad, washroomPeriodCount, washroomPeriod, washroomPrice, otherNumber, otherUnit, otherPrice]);

  const washroomPeriodLabel = useMemo(()=>{
    return washroomPeriod === 'days' ? 'Number of Days:' : 'Number of Months:';
  }, [washroomPeriod]);
  
  const washroomPriceLabel = useMemo(()=>{
    return washroomPeriod === 'days' ? 'Price per Day ($):' : 'Price per Month ($):';
  }, [washroomPeriod]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Sub-Contractor</button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[700px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Add Sub-Contractors</div>
              <button onClick={()=>setOpen(false)} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="text-xs text-gray-600">Sub-Contractor Type:</label>
                <select className="w-full border rounded px-3 py-2" value={type} onChange={e=>setType(e.target.value as any)}>
                  <option value="">Select type...</option>
                  <option value="debris-cartage">Debris Cartage</option>
                  <option value="portable-washroom">Portable Washroom</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {showDebris && (
                <>
                  <div>
                    <label className="text-xs text-gray-600">Description:</label>
                    <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter description..." value={debrisDesc} onChange={e=>setDebrisDesc(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Input Type:</label>
                    <select className="w-full border rounded px-3 py-2" value={debrisInputType} onChange={e=>setDebrisInputType(e.target.value as any)}>
                      <option value="area">Insert Area (SQS) and Area per Load (SQS/Load)</option>
                      <option value="loads">Insert Number of Loads</option>
                    </select>
                  </div>
                  {debrisInputType === 'area' && (
                    <>
                      <div>
                        <label className="text-xs text-gray-600">SQS:</label>
                        <input type="number" className="w-full border rounded px-3 py-2" placeholder="Enter area in SQS" value={debrisSqs} min={0} step={1} onChange={e=>setDebrisSqs(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">SQS/Load:</label>
                        <input type="number" className="w-full border rounded px-3 py-2" placeholdeer="Enter area per load in SQS/Load" value={debrisSqsPerLoad} min={0} step={1} onChange={e=>setDebrisSqsPerLoad(e.target.value)} />
                      </div>
                    </>
                  )}
                  {debrisInputType === 'loads' && (
                    <div>
                      <label className="text-xs text-gray-600">Number of Loads:</label>
                      <input type="number" className="w-full border rounded px-3 py-2" value={debrisLoads} min={0} step={1} onChange={e=>setDebrisLoads(e.target.value)} />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-gray-600">Price per Load ($):</label>
                    <input type="number" className="w-full border rounded px-3 py-2" placeholder="Enter price per load ($)" value={debrisPricePerLoad} min={0} step={0.01} onChange={e=>setDebrisPricePerLoad(e.target.value)} />
                  </div>
                </>
              )}

              {showWashroom && (
                <>
                  <div>
                    <label className="text-xs text-gray-600">Period:</label>
                    <select className="w-full border rounded px-3 py-2" value={washroomPeriod} onChange={e=>setWashroomPeriod(e.target.value as any)}>
                      <option value="days">Days</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{washroomPeriodLabel}</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={washroomPeriodCount} min={0} step={0.5} onChange={e=>setWashroomPeriodCount(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{washroomPriceLabel}</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={washroomPrice} min={0} step={0.01} onChange={e=>setWashroomPrice(e.target.value)} />
                  </div>
                </>
              )}

              {showOther && (
                <>
                  <div>
                    <label className="text-xs text-gray-600">Description:</label>
                    <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter description..." value={otherDesc} onChange={e=>setOtherDesc(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Number:</label>
                    <input type="number" className="w-28 border rounded px-3 py-2" value={otherNumber} min={0} step={0.01} onChange={e=>setOtherNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Unit:</label>
                    <input type="text" className="w-full border rounded px-3 py-2" placeholder="Unit (e.g., each, sqs)" value={otherUnit} onChange={e=>setOtherUnit(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Price per Unit ($):</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={otherPrice} min={0} step={0.01} onChange={e=>setOtherPrice(e.target.value)} />
                  </div>
                </>
              )}

              {type && (
                <div className="bg-gray-100 p-3 rounded">
                  <strong>Total Preview:</strong>
                  <div className="mt-1 text-sm text-gray-600">{calcText}</div>
                </div>
              )}

              <div className="text-right">
                <button onClick={()=>{
                  if(!type){ toast.error('Please select a sub-contractor type'); return; }
                  let desc='', qty=0, unit='', totalValue=0;
                  if(showDebris){
                    desc = debrisDesc.trim() || 'Debris Cartage';
                    qty = Number(debrisLoads||0);
                    if(qty === 0 && Number(debrisSqs||0) > 0 && Number(debrisSqsPerLoad||0) > 0){
                      qty = Math.ceil(Number(debrisSqs||0) / Number(debrisSqsPerLoad||0));
                    }
                    unit = 'loads';
                    totalValue = Number(debrisPricePerLoad||0);
                  }else if(showWashroom){
                    desc = 'Portable Washroom';
                    qty = Number(washroomPeriodCount||0);
                    unit = washroomPeriod;
                    totalValue = Number(washroomPrice||0);
                  }else{
                    desc = otherDesc.trim() || 'Other';
                    qty = Number(otherNumber||0);
                    unit = otherUnit;
                    totalValue = Number(otherPrice||0);
                  }
                  if(!desc){ toast.error('Please fill in the required fields'); return; }
                  onAdd({ name: desc, unit, quantity: qty, unit_price: totalValue, section: sectionProp || 'Sub-Contractors', description: desc, item_type: 'subcontractor', markup: defaultMarkup ?? 5, taxable: true });
                  setOpen(false); setType(''); setDebrisDesc(''); setDebrisSqs('0'); setDebrisSqsPerLoad('0'); setDebrisLoads('0'); setDebrisPricePerLoad('0'); setWashroomPeriod('days'); setWashroomPeriodCount('1'); setWashroomPrice('0'); setOtherDesc(''); setOtherNumber('1'); setOtherUnit(''); setOtherPrice('0');
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Sub-Contractors</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddMiscellaneousModal({ onAdd, disabled, defaultMarkup, open: openProp, onClose: onCloseProp, section: sectionProp }: { onAdd:(it: Item)=>void, disabled?: boolean, defaultMarkup?: number, open?: boolean, onClose?: ()=>void, section?: string }){
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = onCloseProp ? (val: boolean) => { if (!val && onCloseProp) onCloseProp(); if (openProp === undefined) setInternalOpen(val); } : setInternalOpen;
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState<string>('0');

  const total = useMemo(()=> Number(quantity||0) * Number(price||0), [quantity, price]);
  const calcText = `${quantity} ${unit} × $${Number(price||0).toFixed(2)} = $${total.toFixed(2)}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Miscellaneous</button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Add Miscellaneous</div>
              <button onClick={()=>setOpen(false)} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="text-xs text-gray-600">Name/Description:</label>
                <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter miscellaneous name or description..." value={name} onChange={e=>setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Quantity:</label>
                <div className="flex gap-2 items-center">
                  <input type="number" className="w-28 border rounded px-3 py-2" value={quantity} min={0} step={0.01} onChange={e=>setQuantity(e.target.value)} />
                  <input type="text" className="flex-1 border rounded px-3 py-2" placeholder="Unit (e.g., each, sqs)" value={unit} onChange={e=>setUnit(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Price per Unit ($):</label>
                <input type="number" className="w-full border rounded px-3 py-2" value={price} min={0} step={0.01} onChange={e=>setPrice(e.target.value)} />
              </div>
              <div className="bg-gray-100 p-3 rounded">
                <strong>Total Preview:</strong>
                <div className="mt-1 text-sm text-gray-600">{calcText}</div>
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  if(!name.trim()){ toast.error('Please enter a miscellaneous name/description'); return; }
                  onAdd({ name, unit, quantity: Number(quantity||0), unit_price: Number(price||0), section: sectionProp || 'Miscellaneous', description: name, item_type: 'miscellaneous', markup: defaultMarkup ?? 5, taxable: true });
                  setOpen(false); setName(''); setQuantity('1'); setUnit(''); setPrice('0');
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Miscellaneous</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddShopModal({ onAdd, disabled, defaultMarkup, open: openProp, onClose: onCloseProp, section: sectionProp }: { onAdd:(it: Item)=>void, disabled?: boolean, defaultMarkup?: number, open?: boolean, onClose?: ()=>void, section?: string }){
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = onCloseProp ? (val: boolean) => { if (!val && onCloseProp) onCloseProp(); if (openProp === undefined) setInternalOpen(val); } : setInternalOpen;
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState<string>('0');

  const total = useMemo(()=> Number(quantity||0) * Number(price||0), [quantity, price]);
  const calcText = `${quantity} ${unit} × $${Number(price||0).toFixed(2)} = $${total.toFixed(2)}`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Shop</button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Add Shop</div>
              <button onClick={()=>setOpen(false)} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div>
                <label className="text-xs text-gray-600">Name/Description:</label>
                <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter shop name or description..." value={name} onChange={e=>setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Quantity:</label>
                <div className="flex gap-2 items-center">
                  <input type="number" className="w-28 border rounded px-3 py-2" value={quantity} min={0} step={0.01} onChange={e=>setQuantity(e.target.value)} />
                  <input type="text" className="flex-1 border rounded px-3 py-2" placeholder="Unit (e.g., each, sqs)" value={unit} onChange={e=>setUnit(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Price per Unit ($):</label>
                <input type="number" className="w-full border rounded px-3 py-2" value={price} min={0} step={0.01} onChange={e=>setPrice(e.target.value)} />
              </div>
              <div className="bg-gray-100 p-3 rounded">
                <strong>Total Preview:</strong>
                <div className="mt-1 text-sm text-gray-600">{calcText}</div>
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  if(!name.trim()){ toast.error('Please enter a shop name/description'); return; }
                  onAdd({ name, unit, quantity: Number(quantity||0), unit_price: Number(price||0), section: sectionProp || 'Shop', description: name, item_type: 'shop', markup: defaultMarkup ?? 5, taxable: true });
                  setOpen(false); setName(''); setQuantity('1'); setUnit(''); setPrice('0');
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Shop</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
