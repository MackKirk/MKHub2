import { calculateProductLineTotal, isProductSection } from '@/lib/estimateProductInfo';

export type SectionTaxRates = { pstRate: number; gstRate: number };

export type EstimateTaxItem = {
  quantity: number;
  unit_price: number;
  section?: string;
  item_type?: string;
  pst?: boolean;
  gst?: boolean;
  labour_journey?: number;
  labour_men?: number;
  labour_journey_type?: 'days' | 'hours' | 'contract';
};

export const DEFAULT_SECTION_TAX_RATES: SectionTaxRates = { pstRate: 7, gstRate: 5 };

export function getSectionTaxRates(
  section: string,
  sectionTaxRates: Record<string, SectionTaxRates>,
  fallback?: SectionTaxRates,
): SectionTaxRates {
  return sectionTaxRates[section] ?? fallback ?? DEFAULT_SECTION_TAX_RATES;
}

/** Line total base (no markup): products qty×price; labour journey×men×price; else qty×price. */
export function calculateItemBaseTotal(item: EstimateTaxItem): number {
  if (item.item_type === 'product' || (item.item_type !== 'labour' && isProductSection(item.section || ''))) {
    return calculateProductLineTotal(item);
  }
  if (item.item_type === 'labour' && item.labour_journey_type) {
    if (item.labour_journey_type === 'contract') {
      return (item.labour_journey || 0) * item.unit_price;
    }
    return (item.labour_journey || 0) * (item.labour_men || 0) * item.unit_price;
  }
  return item.quantity * item.unit_price;
}

export function calculateSectionTaxTotals(
  sectionItems: EstimateTaxItem[],
  rates: SectionTaxRates,
): { totalForPst: number; totalForGst: number; pst: number; gst: number } {
  let totalForPst = 0;
  let totalForGst = 0;
  for (const item of sectionItems) {
    const lineTotal = calculateItemBaseTotal(item);
    if (item.pst === true) totalForPst += lineTotal;
    if (item.gst === true) totalForGst += lineTotal;
  }
  return {
    totalForPst,
    totalForGst,
    pst: totalForPst * (rates.pstRate / 100),
    gst: totalForGst * (rates.gstRate / 100),
  };
}

export function buildSectionTaxRatesMap(
  sectionOrder: string[],
  saved: Record<string, SectionTaxRates> | undefined,
  globalFallback?: { pstRate?: number | null; gstRate?: number | null },
): Record<string, SectionTaxRates> {
  const fallback: SectionTaxRates = {
    pstRate: globalFallback?.pstRate ?? DEFAULT_SECTION_TAX_RATES.pstRate,
    gstRate: globalFallback?.gstRate ?? DEFAULT_SECTION_TAX_RATES.gstRate,
  };
  const map: Record<string, SectionTaxRates> = {};
  for (const section of sectionOrder) {
    map[section] = saved?.[section]
      ? { pstRate: saved[section].pstRate, gstRate: saved[section].gstRate }
      : { ...fallback };
  }
  return map;
}

export function migrateItemTaxFlags(item: {
  pst?: boolean;
  gst?: boolean;
  taxable?: boolean;
}): { pst: boolean; gst: boolean } {
  const hasExplicitPst = item.pst === true || item.pst === false;
  const hasExplicitGst = item.gst === true || item.gst === false;
  return {
    pst: hasExplicitPst ? item.pst === true : item.taxable !== false,
    gst: hasExplicitGst ? item.gst === true : false,
  };
}
