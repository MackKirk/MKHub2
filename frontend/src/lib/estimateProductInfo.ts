export type EstimateProductItem = {
  quantity: number;
  unit_price: number;
  unit?: string;
  unit_type?: string;
  units_per_package?: number;
  coverage_sqs?: number;
  coverage_ft2?: number;
  coverage_m2?: number;
  item_type?: string;
};

const LABOURISH_SECTIONS = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'] as const;

export function isProductSection(section: string): boolean {
  if (LABOURISH_SECTIONS.includes(section as (typeof LABOURISH_SECTIONS)[number])) return false;
  if (
    section.startsWith('Labour Section') ||
    section.startsWith('Sub-Contractor Section') ||
    section.startsWith('Shop Section') ||
    section.startsWith('Miscellaneous Section')
  ) {
    return false;
  }
  return true;
}

export function isProductItem(it: EstimateProductItem): boolean {
  return it.item_type === 'product' || (!it.item_type && isProductSection('Roof System'));
}

export function calculateProductLineTotal(item: EstimateProductItem): number {
  return (item.quantity || 0) * (item.unit_price || 0);
}

export function getProductUnitInfo(item: EstimateProductItem): string | null {
  const qty = item.quantity || 0;
  const unitLabel = item.unit || 'unit';

  if (item.unit_type === 'coverage') {
    const parts: string[] = [];
    const sellLabel = qty === 1 ? unitLabel : `${qty} ${unitLabel}(s)`;
    parts.push(sellLabel);

    if (item.coverage_sqs && item.coverage_sqs > 0) {
      const totalSqs = qty * item.coverage_sqs;
      parts.push(`covers ~${totalSqs.toFixed(2)} SQS`);
      const lineTotal = calculateProductLineTotal(item);
      if (totalSqs > 0) {
        parts.push(`~$${(lineTotal / totalSqs).toFixed(2)}/SQS`);
      }
    } else if (item.coverage_ft2 && item.coverage_ft2 > 0) {
      const totalFt2 = qty * item.coverage_ft2;
      parts.push(`covers ~${totalFt2.toFixed(2)} ft²`);
      const lineTotal = calculateProductLineTotal(item);
      if (totalFt2 > 0) {
        parts.push(`~$${(lineTotal / totalFt2).toFixed(2)}/ft²`);
      }
    } else if (item.coverage_m2 && item.coverage_m2 > 0) {
      const totalM2 = qty * item.coverage_m2;
      parts.push(`covers ~${totalM2.toFixed(2)} m²`);
      const lineTotal = calculateProductLineTotal(item);
      if (totalM2 > 0) {
        parts.push(`~$${(lineTotal / totalM2).toFixed(2)}/m²`);
      }
    }

    return parts.join(' · ');
  }

  if (item.unit_type === 'multiple' && item.units_per_package && item.units_per_package > 0) {
    const totalUnits = qty * item.units_per_package;
    const pkgLabel = qty === 1 ? 'package' : 'packages';
    return `${qty} ${pkgLabel} · ${totalUnits} units total`;
  }

  if (item.unit_type === 'unitary') {
    return item.unit ? `Sell unit: ${item.unit}` : 'Sell unit: Each';
  }

  return item.unit ? `Sell unit: ${item.unit}` : null;
}
