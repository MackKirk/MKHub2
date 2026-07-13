import { useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback, useImperativeHandle, forwardRef, type InputHTMLAttributes, type Dispatch, type SetStateAction, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  estimateAddLabourQuickInfo,
  estimateAddMiscellaneousQuickInfo,
  estimateAddProductQuickInfo,
  estimateAddShopQuickInfo,
  estimateAddSubContractorQuickInfo,
  estimateBrowseProductsBySupplierQuickInfo,
  estimateCompareProductsQuickInfo,
  estimateNewProductQuickInfo,
  estimateProductViewQuickInfo,
  estimateSummaryQuickInfo,
} from '@/lib/formModalQuickInfo';
import ImagePicker from '@/components/ImagePicker';
import SupplierSelect from '@/components/SupplierSelect';
import NewSupplierModal from '@/components/NewSupplierModal';
import OverlayPortal from '@/components/OverlayPortal';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckboxControl,
  AppCombobox,
  AppControlLabel,
  AppEmptyState,
  AppFormModal,
  AppHeroEditButton,
  AppInput,
  AppListRowIconButton,
  AppSelect,
  AppTable,
  AppTextarea,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  calculateProductLineTotal,
  getProductUnitInfo,
  isProductSection,
} from '@/lib/estimateProductInfo';
import { formatAccounting, parseAccounting, parseAccountingNumber } from '@/lib/accountingFormat';
import {
  buildSectionTaxRatesMap,
  calculateItemBaseTotal,
  calculateSectionTaxTotals,
  DEFAULT_SECTION_TAX_RATES,
  getSectionTaxRates,
  migrateItemTaxFlags,
  type SectionTaxRates,
} from '@/lib/estimateTax';
import { clampOverflowScrollAncestors, findScrollableAncestor } from '@/lib/clampScroll';

type Material = { id:number, name:string, supplier_name?:string, category?:string, unit?:string, price?:number, last_updated?:string, unit_type?:string, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number, description?:string, image_base64?:string };
type Item = {
  material_id?:number,
  name:string,
  unit?:string,
  quantity:number,
  unit_price:number,
  section:string,
  description?:string,
  item_type?:string,
  supplier_name?:string,
  unit_type?:string,
  qty_required?:number,
  unit_required?:string,
  markup?:number,
  taxable?:boolean,
  pst?:boolean,
  gst?:boolean,
  units_per_package?:number,
  coverage_sqs?:number,
  coverage_ft2?:number,
  coverage_m2?:number,
  labour_journey?:number,
  labour_men?:number,
  labour_journey_type?:'days'|'hours'|'contract',
  /** Original days entered in time-based labour modal (display). */
  labour_days?:number,
  /** Hours per day from time-based labour modal (display). */
  labour_hours_per_day?:number,
  /** Whether unit_price is per day or per hour (display). */
  labour_price_unit?:'day'|'hour',
  added_via_report_id?:string,
  added_via_report_date?:string,
  product_image?:string,
};

/** Clear rich time-based display extras after inline journey/men edits. */
const CLEAR_LABOUR_RICH_EXTRAS: Pick<Item, 'labour_days' | 'labour_hours_per_day' | 'labour_price_unit'> = {
  labour_days: undefined,
  labour_hours_per_day: undefined,
  labour_price_unit: undefined,
};

function formatLabourRichComposition(item: Item): string | null {
  if (!item.labour_price_unit && item.labour_days == null && item.labour_hours_per_day == null) {
    return null;
  }
  const men = item.labour_men ?? 0;
  const days = item.labour_days ?? (item.labour_journey_type === 'days' ? item.labour_journey : undefined);
  const hoursPerDay = item.labour_hours_per_day;
  const price = formatAccounting(item.unit_price ?? 0);
  const unit = item.labour_price_unit === 'hour' ? '/h' : '/day';
  const parts: string[] = [];
  if (men > 0) parts.push(`${men} men`);
  if (days != null && days > 0) parts.push(`${days} days`);
  if (hoursPerDay != null && hoursPerDay > 0) parts.push(`${hoursPerDay}h/day`);
  parts.push(`$${price}${unit}`);
  return parts.join(' · ');
}

export type EstimateBuilderRef = {
  hasUnsavedChanges: () => boolean;
  save: () => Promise<boolean>;
  getGrandTotal: () => number;
  getTotalEstimate: () => number; // Returns Total Estimate (before GST)
  getPst: () => number;
  getGst: () => number;
  getEstimateData: () => { items: Item[], markup: number, pstRate: number, gstRate: number, profitRate: number, sectionOrder: string[], sectionNames: Record<string, string>, sectionTaxRates: Record<string, SectionTaxRates> } | null;
};

const ESTIMATE_INLINE_CONTROL_H = 'h-8';
const ESTIMATE_PRODUCT_PRICE_CELL = 'pr-5';
const ESTIMATE_PRODUCT_QUANTITY_CELL = 'pl-2';
const ESTIMATE_PRODUCT_PRICE_FIELD = 'min-w-[100px] max-w-[140px] shrink-0';
const ESTIMATE_PRODUCT_QTY_FIELD = 'min-w-[80px] max-w-[120px] shrink-0';
const ESTIMATE_PRODUCT_TOTAL_FIELD = 'min-w-[100px] max-w-[140px] shrink-0';
const ESTIMATE_PRODUCT_LIST_LABEL_ROW = 'mb-0.5 h-3 shrink-0';
const ESTIMATE_PRODUCT_ROW = 'flex w-full min-w-0 items-start gap-2';
const ESTIMATE_PRODUCT_TABLE_SHELL = uiCx('overflow-hidden rounded-lg border bg-white', uiBorders.subtle);
const ESTIMATE_PRODUCT_TABLE_BAND = uiCx(
  ESTIMATE_PRODUCT_ROW,
  'items-center border-gray-200 px-3 py-2.5',
  uiColors.surfaceSubtle,
);

function EstimateProductFieldLabel({
  children,
  align = 'left',
}: {
  children: ReactNode;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <span
      className={uiCx(
        uiTypography.controlLabel,
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        align === 'left' && 'text-left',
      )}
    >
      {children}
    </span>
  );
}

function EstimateProductHeaderCell({
  children,
  className,
  align = 'left',
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <div
      className={uiCx(
        'flex min-h-8 items-center',
        align === 'center' && 'justify-center',
        align === 'right' && 'justify-end',
        align === 'left' && 'justify-start',
        className,
      )}
    >
      <EstimateProductFieldLabel align={align}>{children}</EstimateProductFieldLabel>
    </div>
  );
}

function EstimateProductListControlSpacer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={uiCx('flex shrink-0 flex-col', className)}>
      <div className={ESTIMATE_PRODUCT_LIST_LABEL_ROW} aria-hidden />
      <div className={uiCx('flex items-center', ESTIMATE_INLINE_CONTROL_H)}>{children}</div>
    </div>
  );
}

const estimateSummaryShell = uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, 'overflow-hidden');
const estimateSectionShell = uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, 'overflow-hidden');
const estimateSectionHeader = 'flex items-center gap-2 border-b border-gray-100 px-4 py-3';
const estimateSummaryInnerCard = 'rounded-lg border border-gray-200 bg-white p-3';
const estimateSummaryRow = 'flex items-center justify-between rounded px-1 py-1 -mx-1 hover:bg-gray-50';
const estimateSummaryLabel = 'text-xs';
const estimateSummaryLabelBold = 'text-xs font-semibold';

/** Dense line-item table input chrome for designSystem path (ProposalInlineInput pattern). */
function EstimateInlineInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={uiCx(
        'box-border bg-white text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gray-400/35 disabled:cursor-not-allowed disabled:bg-gray-100',
        uiSpacing.controlX,
        ESTIMATE_INLINE_CONTROL_H,
        'py-0',
        uiRadius.control,
        uiBorders.input,
        className,
      )}
      {...props}
    />
  );
}

// Alert icon component for Estimate Changes (circle with exclamation mark)
const EstimateChangesAlertIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} text-orange-600`} fill="currentColor" stroke="none">
    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.1"/>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
    <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor" fontFamily="system-ui, -apple-system, sans-serif">!</text>
  </svg>
);

function EstimateTaxCheckboxCells({
  item,
  originalIdx,
  canEdit,
  isFromReport,
  designSystem,
  setItems,
  onBeforeTaxChange,
}: {
  item: Item;
  originalIdx: number;
  canEdit: boolean;
  isFromReport: boolean;
  designSystem: boolean;
  setItems: Dispatch<SetStateAction<Item[]>>;
  onBeforeTaxChange?: () => void;
}) {
  const cellClass = uiCx('p-2 text-center', isFromReport && 'bg-yellow-50');
  const updateFlag = (field: 'pst' | 'gst', checked: boolean) => {
    if (!canEdit) return;
    onBeforeTaxChange?.();
    setItems((prev) => prev.map((row, i) => (i === originalIdx ? { ...row, [field]: checked } : row)));
  };
  const checkbox = (field: 'pst' | 'gst', label: string) =>
    designSystem ? (
      <AppCheckboxControl
        aria-label={label}
        checked={item[field] === true}
        disabled={!canEdit}
        onClick={() => updateFlag(field, !(item[field] === true))}
      />
    ) : (
      <input
        type="checkbox"
        checked={item[field] === true}
        onChange={(e) => updateFlag(field, e.target.checked)}
        className={canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}
        disabled={!canEdit}
      />
    );
  return (
    <>
      <td className={cellClass}>{checkbox('pst', 'PST')}</td>
      <td className={cellClass}>{checkbox('gst', 'GST')}</td>
    </>
  );
}

function EstimateProductListRow({
  item,
  canEdit,
  onQuantityChange,
  onPriceChange,
  onPstChange,
  onGstChange,
  onRemove,
  onViewProduct,
  onReplaceProduct,
}: {
  item: Item;
  canEdit: boolean;
  onQuantityChange: (qty: number) => void;
  onPriceChange: (price: number) => void;
  onPstChange: (checked: boolean) => void;
  onGstChange: (checked: boolean) => void;
  onRemove: () => void;
  onViewProduct: () => void;
  onReplaceProduct: () => void;
}) {
  const [priceFocused, setPriceFocused] = useState(false);
  const lineTotal = calculateProductLineTotal(item);
  const unitInfo = getProductUnitInfo(item);
  const isFromReport = !!item.added_via_report_id;
  const imageSrc = item.product_image || '/ui/assets/image placeholders/no_image.png';
  const qty = Math.max(1, Math.round(item.quantity || 1));
  const priceDisplay = priceFocused
    ? String(item.unit_price ?? '')
    : formatAccounting(item.unit_price ?? 0);

  return (
    <div className={uiCx(isFromReport && 'rounded-lg bg-yellow-50 px-2')}>
      <div
        className={uiCx(
          ESTIMATE_PRODUCT_ROW,
          !isFromReport && 'rounded-lg px-2 py-0.5 hover:bg-gray-50',
        )}
      >
        <EstimateProductListControlSpacer>
          <div className="h-8 w-10 overflow-hidden rounded border bg-gray-100">
            <img
              src={imageSrc}
              alt={item.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/ui/assets/image placeholders/no_image.png';
              }}
            />
          </div>
        </EstimateProductListControlSpacer>

        <div className="relative min-w-0 flex-1">
          <EstimateProductListControlSpacer className="w-full min-w-0">
            <div
              className={uiCx(
                'box-border flex h-8 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border bg-white px-2',
                uiBorders.input,
                isFromReport && 'bg-yellow-50',
              )}
            >
              {item.added_via_report_id && (
                <div className="relative group/alert inline-flex shrink-0 items-center">
                  <EstimateChangesAlertIcon className="h-4 w-4" />
                  <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/alert:opacity-100">
                    Added via Report (Estimate Changes) on{' '}
                    {item.added_via_report_date
                      ? new Date(item.added_via_report_date).toLocaleDateString()
                      : 'unknown date'}
                    <div className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 bg-gray-900" />
                  </div>
                </div>
              )}
              {item.material_id ? (
                <button
                  type="button"
                  onClick={onViewProduct}
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium text-gray-900 hover:text-brand-red"
                >
                  {item.name}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate text-xs text-gray-900">{item.name}</span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={onReplaceProduct}
                  className="shrink-0 p-1 text-gray-500 hover:text-gray-700"
                  title="Browse Products by Supplier"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                </button>
              )}
            </div>
          </EstimateProductListControlSpacer>
        </div>

        <EstimateProductListControlSpacer className={uiCx(ESTIMATE_PRODUCT_PRICE_FIELD, ESTIMATE_PRODUCT_PRICE_CELL)}>
          {canEdit ? (
            <EstimateInlineInput
              className="w-full text-left"
              value={priceDisplay}
              onFocus={() => setPriceFocused(true)}
              onChange={(e) => onPriceChange(parseAccountingNumber(e.target.value))}
              onBlur={(e) => {
                setPriceFocused(false);
                onPriceChange(parseAccountingNumber(e.target.value));
              }}
            />
          ) : (
            <div className="w-full truncate px-2 text-left text-xs text-gray-900">
              ${formatAccounting(item.unit_price ?? 0)}
            </div>
          )}
        </EstimateProductListControlSpacer>

        <EstimateProductListControlSpacer className={uiCx(ESTIMATE_PRODUCT_QTY_FIELD, ESTIMATE_PRODUCT_QUANTITY_CELL)}>
          <div className={uiCx('flex w-full items-center overflow-hidden rounded-lg border border-gray-300 bg-white', ESTIMATE_INLINE_CONTROL_H)}>
            <input
              type="number"
              min={1}
              step={1}
              className={uiCx(
                'min-w-0 flex-1 appearance-none border-0 bg-transparent px-2 text-xs text-gray-900 [-moz-appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                !canEdit && 'cursor-not-allowed bg-gray-100',
                ESTIMATE_INLINE_CONTROL_H,
                'py-0',
              )}
              value={qty}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10) || 1;
                onQuantityChange(Math.max(1, num));
              }}
              disabled={!canEdit}
              readOnly={!canEdit}
            />
            {canEdit && (
              <div className="flex w-6 shrink-0 flex-col border-l border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => onQuantityChange(qty + 1)}
                  className="flex flex-1 items-center justify-center border-b border-gray-200 px-0.5 py-0 text-[9px] leading-tight hover:bg-gray-100"
                  title="Increase"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => onQuantityChange(Math.max(1, qty - 1))}
                  className="flex flex-1 items-center justify-center px-0.5 py-0 text-[9px] leading-tight hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Decrease"
                  disabled={qty <= 1}
                >
                  ▼
                </button>
              </div>
            )}
          </div>
        </EstimateProductListControlSpacer>

        <EstimateProductListControlSpacer className={ESTIMATE_PRODUCT_TOTAL_FIELD}>
          <div className="w-full overflow-hidden whitespace-nowrap text-right text-xs font-medium text-gray-700">
            ${formatAccounting(lineTotal)}
          </div>
        </EstimateProductListControlSpacer>

        <EstimateProductListControlSpacer className="shrink-0">
          <div className="flex items-center gap-1.5">
            <AppCheckboxControl
              aria-label="PST"
              checked={item.pst === true}
              disabled={!canEdit}
              onClick={() => onPstChange(!(item.pst === true))}
            />
            <AppCheckboxControl
              aria-label="GST"
              checked={item.gst === true}
              disabled={!canEdit}
              onClick={() => onGstChange(!(item.gst === true))}
            />
          </div>
        </EstimateProductListControlSpacer>

        {canEdit ? (
          <EstimateProductListControlSpacer>
            <button
              type="button"
              className={uiCx(
                'flex w-8 shrink-0 items-center justify-center rounded bg-red-100 transition-colors hover:bg-red-200',
                ESTIMATE_INLINE_CONTROL_H,
              )}
              onClick={onRemove}
              title="Remove"
            >
              <svg className="h-4 w-4 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </EstimateProductListControlSpacer>
        ) : null}
      </div>

      {(unitInfo || item.supplier_name) ? (
        <div className="px-2 pb-0.5 pt-0.5 text-xs leading-tight text-gray-500">
          {unitInfo ? <span>{unitInfo}</span> : null}
          {unitInfo && item.supplier_name ? <span className="mx-2 text-gray-300">·</span> : null}
          {item.supplier_name ? <span>Supplier: {item.supplier_name}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

const ESTIMATE_LABOUR_COMPOSITION_FIELD = 'min-w-[11rem] max-w-[16rem] shrink-0';
const ESTIMATE_LABOUR_PRICE_FIELD = 'min-w-[7.5rem] max-w-[10rem] shrink-0';

function getLabourStyleSectionMeta(section: string): {
  type: 'labour' | 'subcontractor' | 'miscellaneous' | 'shop';
  addLabel: string;
  itemLabel: string;
  midLabel: string;
  emptyLabel: string;
} {
  if (section === 'Labour' || section.startsWith('Labour Section')) {
    return { type: 'labour', addLabel: '+ Add Labour', itemLabel: 'Labour', midLabel: 'Composition', emptyLabel: 'No labour items yet. Add your first item below.' };
  }
  if (section === 'Sub-Contractors' || section.startsWith('Sub-Contractor Section')) {
    return { type: 'subcontractor', addLabel: '+ Add Sub-Contractor', itemLabel: 'Sub-Contractor', midLabel: 'Composition', emptyLabel: 'No sub-contractor items yet. Add your first item below.' };
  }
  if (section === 'Shop' || section.startsWith('Shop Section')) {
    return { type: 'shop', addLabel: '+ Add Shop', itemLabel: 'Item', midLabel: 'Quantity', emptyLabel: 'No shop items yet. Add your first item below.' };
  }
  return { type: 'miscellaneous', addLabel: '+ Add Miscellaneous', itemLabel: 'Item', midLabel: 'Quantity', emptyLabel: 'No miscellaneous items yet. Add your first item below.' };
}

function EstimateLabourStyleListRow({
  item,
  section,
  canEdit,
  onUpdate,
  onRemove,
}: {
  item: Item;
  section: string;
  canEdit: boolean;
  onUpdate: (patch: Partial<Item>) => void;
  onRemove: () => void;
}) {
  const [priceFocused, setPriceFocused] = useState(false);
  const lineTotal = calculateItemBaseTotal(item);
  const isFromReport = !!item.added_via_report_id;
  const isShopOrMisc =
    section === 'Shop' ||
    section.startsWith('Shop Section') ||
    section === 'Miscellaneous' ||
    section.startsWith('Miscellaneous Section') ||
    item.item_type === 'shop' ||
    item.item_type === 'miscellaneous';
  const priceDisplay = priceFocused
    ? String(item.unit_price ?? '')
    : formatAccounting(item.unit_price ?? 0);
  const richComposition = formatLabourRichComposition(item);

  return (
    <div className={uiCx(isFromReport && 'rounded-lg bg-yellow-50 px-2')}>
      <div className={uiCx(ESTIMATE_PRODUCT_ROW, !isFromReport && 'rounded-lg px-2 py-0.5 hover:bg-gray-50')}>
        <div className="relative min-w-0 flex-1">
          <EstimateProductListControlSpacer className="w-full min-w-0">
            <div
              className={uiCx(
                'box-border flex h-8 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border bg-white px-2',
                uiBorders.input,
                isFromReport && 'bg-yellow-50',
              )}
            >
              {item.added_via_report_id && (
                <div className="relative group/alert inline-flex shrink-0 items-center">
                  <EstimateChangesAlertIcon className="h-4 w-4" />
                  <div className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/alert:opacity-100">
                    Added via Report (Estimate Changes) on{' '}
                    {item.added_via_report_date
                      ? new Date(item.added_via_report_date).toLocaleDateString()
                      : 'unknown date'}
                    <div className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 bg-gray-900" />
                  </div>
                </div>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-gray-900">{item.description || item.name}</span>
            </div>
          </EstimateProductListControlSpacer>
        </div>

        <EstimateProductListControlSpacer className={ESTIMATE_LABOUR_COMPOSITION_FIELD}>
          {item.item_type === 'labour' && item.labour_journey_type ? (
            item.labour_journey_type === 'contract' ? (
              <div className="flex w-full items-center gap-1">
                <EstimateInlineInput
                  type="number"
                  className="w-16"
                  value={item.labour_journey ?? ''}
                  min={0}
                  step={0.5}
                  disabled={!canEdit}
                  readOnly={!canEdit}
                  onChange={(e) => {
                    if (!canEdit) return;
                    const v = e.target.value;
                    onUpdate({ labour_journey: v === '' ? 0 : Number(v) || 0 });
                  }}
                />
                <span className="shrink-0 text-xs text-gray-500">{item.unit || ''}</span>
              </div>
            ) : (
              <div className="flex w-full items-center gap-1">
                <EstimateInlineInput
                  type="number"
                  className="w-14"
                  value={item.labour_journey ?? ''}
                  min={0}
                  step={0.5}
                  disabled={!canEdit}
                  readOnly={!canEdit}
                  onChange={(e) => {
                    if (!canEdit) return;
                    const v = e.target.value;
                    onUpdate({
                      labour_journey: v === '' ? 0 : Number(v) || 0,
                      ...CLEAR_LABOUR_RICH_EXTRAS,
                    });
                  }}
                />
                <span className="shrink-0 text-xs text-gray-500">{item.labour_journey_type}</span>
                <span className="text-xs text-gray-400">×</span>
                <EstimateInlineInput
                  type="number"
                  className="w-12"
                  value={item.labour_men ?? ''}
                  min={0}
                  step={1}
                  disabled={!canEdit}
                  readOnly={!canEdit}
                  onChange={(e) => {
                    if (!canEdit) return;
                    const v = e.target.value;
                    const newMen = v === '' ? 0 : Number(v) || 0;
                    const patch: Partial<Item> = {
                      labour_men: newMen,
                      ...CLEAR_LABOUR_RICH_EXTRAS,
                    };
                    // Legacy description pattern "Name - N men" only
                    if (item.description?.includes(' - ') && /\d+\s*men\s*$/i.test(item.description)) {
                      const baseName = item.description.split(' - ')[0];
                      patch.description = newMen > 0 ? `${baseName} - ${newMen} men` : baseName;
                    }
                    onUpdate(patch);
                  }}
                />
                <span className="shrink-0 text-xs text-gray-500">men</span>
              </div>
            )
          ) : (
            <div className="flex w-full items-center gap-1">
              <div className={uiCx('flex flex-1 items-center overflow-hidden rounded-lg border border-gray-300 bg-white', ESTIMATE_INLINE_CONTROL_H)}>
                <input
                  type="number"
                  min={0}
                  step={isShopOrMisc ? 1 : 0.01}
                  className={uiCx(
                    'min-w-0 flex-1 appearance-none border-0 bg-transparent px-2 text-xs text-gray-900 [-moz-appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                    !canEdit && 'cursor-not-allowed bg-gray-100',
                    ESTIMATE_INLINE_CONTROL_H,
                    'py-0',
                  )}
                  value={item.quantity ?? ''}
                  disabled={!canEdit}
                  readOnly={!canEdit}
                  onChange={(e) => {
                    if (!canEdit) return;
                    const v = e.target.value;
                    onUpdate({ quantity: v === '' ? 0 : Number(v) || 0 });
                  }}
                />
              </div>
              <span className="shrink-0 text-xs text-gray-500">{item.unit || ''}</span>
            </div>
          )}
        </EstimateProductListControlSpacer>

        <EstimateProductListControlSpacer className={ESTIMATE_LABOUR_PRICE_FIELD}>
          {canEdit ? (
            <EstimateInlineInput
              className="w-full text-left"
              value={priceDisplay}
              onFocus={() => setPriceFocused(true)}
              onChange={(e) => onUpdate({ unit_price: parseAccountingNumber(e.target.value) })}
              onBlur={(e) => {
                setPriceFocused(false);
                onUpdate({ unit_price: parseAccountingNumber(e.target.value) });
              }}
            />
          ) : (
            <div className="w-full truncate px-2 text-left text-xs text-gray-900">
              ${formatAccounting(item.unit_price ?? 0)}
            </div>
          )}
        </EstimateProductListControlSpacer>

        <EstimateProductListControlSpacer className={ESTIMATE_PRODUCT_TOTAL_FIELD}>
          <div className="w-full overflow-hidden whitespace-nowrap text-right text-xs font-medium text-gray-700">
            ${formatAccounting(lineTotal)}
          </div>
        </EstimateProductListControlSpacer>

        <EstimateProductListControlSpacer className="shrink-0">
          <div className="flex items-center gap-1.5">
            <AppCheckboxControl
              aria-label="PST"
              checked={item.pst === true}
              disabled={!canEdit}
              onClick={() => onUpdate({ pst: !(item.pst === true) })}
            />
            <AppCheckboxControl
              aria-label="GST"
              checked={item.gst === true}
              disabled={!canEdit}
              onClick={() => onUpdate({ gst: !(item.gst === true) })}
            />
          </div>
        </EstimateProductListControlSpacer>

        {canEdit ? (
          <EstimateProductListControlSpacer>
            <button
              type="button"
              className={uiCx(
                'flex w-8 shrink-0 items-center justify-center rounded bg-red-100 transition-colors hover:bg-red-200',
                ESTIMATE_INLINE_CONTROL_H,
              )}
              onClick={onRemove}
              title="Remove"
            >
              <svg className="h-4 w-4 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </EstimateProductListControlSpacer>
        ) : null}
      </div>

      {richComposition ? (
        <div className="px-2 pb-0.5 pt-0.5 text-xs leading-tight text-gray-500" title={richComposition}>
          {richComposition}
        </div>
      ) : null}
    </div>
  );
}

const EstimateBuilder = forwardRef<EstimateBuilderRef, { projectId: string, estimateId?: number, statusLabel?: string, settings?: any, isBidding?: boolean, canEdit?: boolean, hideFooter?: boolean, designSystem?: boolean, onEstimateSaved?: (payload: { items: Item[], sectionNames: Record<string, string> }) => void }>(
  function EstimateBuilder({ projectId, estimateId, statusLabel, settings, isBidding, canEdit: canEditProp, hideFooter, designSystem = false, onEstimateSaved }, ref) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [markup, setMarkup] = useState<number>(5);
  const [pstRate, setPstRate] = useState<number>(7);
  const [gstRate, setGstRate] = useState<number>(5);
  const [profitRate, setProfitRate] = useState<number>(0);
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
  const [sectionTaxRates, setSectionTaxRates] = useState<Record<string, SectionTaxRates>>(() =>
    buildSectionTaxRatesMap(defaultSections, undefined),
  );
  const [addingToSection, setAddingToSection] = useState<{section: string, type: 'product' | 'labour' | 'subcontractor' | 'miscellaneous' | 'shop', replaceItemIndex?: number} | null>(null);
  const [dirty, setDirty] = useState(false);
  const [footerVisible, setFooterVisible] = useState<boolean>(false);
  const savedStateRef = useRef<{ items: Item[], markup: number, pstRate: number, gstRate: number, profitRate: number, sectionOrder: string[], sectionNames: Record<string, string>, sectionTaxRates: Record<string, SectionTaxRates> } | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const pendingSaveRef = useRef<{ items: Item[], markup: number, pstRate: number, gstRate: number, profitRate: number, sectionOrder: string[], sectionNames: Record<string, string>, sectionTaxRates: Record<string, SectionTaxRates> } | null>(null);
  const builderRootRef = useRef<HTMLDivElement>(null);
  const preservedScrollTopRef = useRef<number | null>(null);

  const captureScrollForTaxUpdate = useCallback(() => {
    const scrollEl = findScrollableAncestor(builderRootRef.current);
    preservedScrollTopRef.current = scrollEl?.scrollTop ?? null;
  }, []);

  // Tax toggles can shrink the summary block; restore/clamp scroll so the page does not stay stuck past content.
  useLayoutEffect(() => {
    const scrollEl = findScrollableAncestor(builderRootRef.current);
    const saved = preservedScrollTopRef.current;
    if (scrollEl != null && saved != null) {
      scrollEl.scrollTop = saved;
      preservedScrollTopRef.current = null;
    }
    clampOverflowScrollAncestors(builderRootRef.current);
  }, [items]);

  useEffect(() => {
    setSectionTaxRates((prev) => buildSectionTaxRatesMap(sectionOrder, prev));
  }, [sectionOrder]);
  
  // Check if editing is allowed based on status and permissions
  const canEdit = useMemo(()=>{
    // If canEditProp is explicitly false (no permission), deny editing
    if (canEditProp === false) return false;
    
    // If canEditProp is explicitly true, check status restrictions
    if (canEditProp === true) {
      // Always allow editing by default unless explicitly restricted
      if (!statusLabel || !statusLabel.trim()) return true;
      
      const statusLabelStr = String(statusLabel).trim().toLowerCase();
      
      // For opportunities (isBidding = true), apply specific restrictions
      if (isBidding) {
        // Always allow "prospecting" status
        if (statusLabelStr === 'prospecting') return true;
        // Restrict "Sent to Customer", "Refused", and "Cancelled" statuses
        if (statusLabelStr === 'sent to customer' || statusLabelStr === 'refused' || statusLabelStr === 'cancelled' || statusLabelStr === 'canceled') return false;
        // Default to allow for other statuses (backward compatibility)
        return true;
      }
      
      // For projects (isBidding = false), use existing logic
      // Always allow "estimating", "prospecting", and "In Progress" status
      if (statusLabelStr === 'estimating' || statusLabelStr === 'prospecting' || statusLabelStr === 'in progress') return true;
      
      // Restrict "On Hold" and "Cancelled" (same as proposals)
      if (statusLabelStr === 'on hold' || statusLabelStr === 'cancelled' || statusLabelStr === 'canceled') return false;
      
      // If no settings or project_statuses, allow editing
      if (!settings || !settings.project_statuses || !Array.isArray(settings.project_statuses)) return true;
      
      const statusConfig = (settings.project_statuses as any[]).find((s:any)=> s.label?.toLowerCase() === statusLabelStr);
      
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
    
    const statusLabelStr = String(statusLabel).trim().toLowerCase();
    
    // For opportunities (isBidding = true), apply specific restrictions
    if (isBidding) {
      // Always allow "prospecting" status
      if (statusLabelStr === 'prospecting') return true;
      // Restrict "Sent to Customer", "Refused", and "Cancelled" statuses
      if (statusLabelStr === 'sent to customer' || statusLabelStr === 'refused' || statusLabelStr === 'cancelled' || statusLabelStr === 'canceled') return false;
      // Default to allow for other statuses (backward compatibility)
      return true;
    }
    
    // For projects (isBidding = false), use existing logic
    // Always allow "estimating", "prospecting", and "In Progress" status
    if (statusLabelStr === 'estimating' || statusLabelStr === 'prospecting' || statusLabelStr === 'in progress') return true;
    
    // Restrict "On Hold" and "Cancelled" (same as proposals)
    if (statusLabelStr === 'on hold' || statusLabelStr === 'cancelled' || statusLabelStr === 'canceled') return false;
    
    // If no settings or project_statuses, allow editing
    if (!settings || !settings.project_statuses || !Array.isArray(settings.project_statuses)) return true;
    
    const statusConfig = (settings.project_statuses as any[]).find((s:any)=> s.label?.toLowerCase() === statusLabelStr);
    
    // If status not found in config, allow editing by default
    if (!statusConfig) return true;
    
    // Only restrict if explicitly set to false
    const allowEdit = statusConfig?.meta?.allow_edit_proposal;
    
    // If allow_edit_proposal is explicitly false, deny editing
    if (allowEdit === false || allowEdit === 'false' || allowEdit === 0) return false;
    
    // Otherwise allow editing (default behavior)
    return true;
  }, [statusLabel, settings, canEditProp, isBidding]);

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

  // Load financial totals for Additional Income/Expense
  const { data: financialTotals } = useQuery({
    queryKey: ['projectFinancialTotals', projectId],
    queryFn: () => projectId ? api<any>('GET', `/projects/${projectId}/financial-totals`) : Promise.resolve({ additional_income: 0, additional_expense: 0 }),
    enabled: !!projectId
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
        // Default to 0% if not set
        setProfitRate(0);
      }
      if (estimateData.section_order) setSectionOrder(estimateData.section_order);
      if (estimateData.section_names) setSectionNames(estimateData.section_names);
      const loadedSectionOrder = estimateData.section_order || sectionOrder;
      setSectionTaxRates(
        buildSectionTaxRatesMap(loadedSectionOrder, estimateData.section_tax_rates, {
          pstRate: estimateData.pst_rate,
          gstRate: estimateData.gst_rate,
        }),
      );
      if (est.markup !== undefined) setMarkup(est.markup);
      
      // Convert loaded items to Item format
      const formattedItems: Item[] = loadedItems.map((it: any) => {
        const taxFlags = migrateItemTaxFlags(it);
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
          product_image: it.product_image,
          qty_required: it.qty_required,
          unit_required: it.unit_required,
          markup: it.markup,
          taxable: it.taxable !== false,
          pst: taxFlags.pst,
          gst: taxFlags.gst,
          labour_journey: it.labour_journey,
          labour_men: it.labour_men,
          labour_journey_type: it.labour_journey_type,
          labour_days: it.labour_days,
          labour_hours_per_day: it.labour_hours_per_day,
          labour_price_unit: it.labour_price_unit,
          added_via_report_id: it.added_via_report_id,
          added_via_report_date: it.added_via_report_date,
        };
      });
      setItems(formattedItems);
      // Update savedStateRef to match loaded data so dirty check works correctly
      const loadedSectionNames = estimateData.section_names || {};
      const loadedTaxRates = buildSectionTaxRatesMap(loadedSectionOrder, estimateData.section_tax_rates, {
        pstRate: estimateData.pst_rate,
        gstRate: estimateData.gst_rate,
      });
      savedStateRef.current = { 
        items: formattedItems, 
        markup: est.markup !== undefined ? est.markup : markup, 
        pstRate: estimateData.pst_rate !== undefined && estimateData.pst_rate !== null ? estimateData.pst_rate : pstRate, 
        gstRate: estimateData.gst_rate !== undefined && estimateData.gst_rate !== null ? estimateData.gst_rate : gstRate, 
        profitRate: estimateData.profit_rate !== undefined && estimateData.profit_rate !== null ? estimateData.profit_rate : profitRate,
        sectionOrder: loadedSectionOrder,
        sectionNames: loadedSectionNames,
        sectionTaxRates: loadedTaxRates,
      };
      setDirty(false);
    }
  }, [estimateData, currentEstimateId]);

  // Calculate item total based on item type (no markup)
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

  // Line total for display / rollups (no markup — same as products)
  const calculateItemTotalWithMarkup = useCallback((it: Item): number => {
    if (it.item_type === 'product') {
      return calculateProductLineTotal(it);
    }
    return calculateItemTotal(it);
  }, []);

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
      const mirrorRates = sectionOrder[0]
        ? getSectionTaxRates(sectionOrder[0], sectionTaxRates)
        : DEFAULT_SECTION_TAX_RATES;
      const currentState = {
        items,
        markup,
        pstRate: mirrorRates.pstRate,
        gstRate: mirrorRates.gstRate,
        profitRate,
        sectionOrder,
        sectionNames,
        sectionTaxRates,
      };
      pendingSaveRef.current = currentState;
      
      const payload = { 
        project_id: projectId, 
        markup, 
        pst_rate: mirrorRates.pstRate,
        gst_rate: mirrorRates.gstRate,
        profit_rate: profitRate,
        section_order: sectionOrder,
        section_names: sectionNames,
        section_tax_rates: sectionTaxRates,
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
          pst: it.pst,
          gst: it.gst,
          product_image: it.product_image,
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
          labour_journey_type: it.labour_journey_type,
          labour_days: it.labour_days,
          labour_hours_per_day: it.labour_hours_per_day,
          labour_price_unit: it.labour_price_unit,
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
      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });

      try {
        await Promise.resolve(onEstimateSaved?.({ items, sectionNames }));
      } catch (err) {
        console.error('onEstimateSaved failed:', err);
      }
      
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
  }, [projectId, markup, profitRate, sectionOrder, sectionNames, sectionTaxRates, items, currentEstimateId, canEdit, queryClient, dirty, onEstimateSaved]);

  // Keep pendingSaveRef updated with current state whenever it changes
  useEffect(() => {
    if (dirty && canEdit && projectId) {
      pendingSaveRef.current = {
        items,
        markup,
        pstRate: sectionOrder[0] ? getSectionTaxRates(sectionOrder[0], sectionTaxRates).pstRate : pstRate,
        gstRate: sectionOrder[0] ? getSectionTaxRates(sectionOrder[0], sectionTaxRates).gstRate : gstRate,
        profitRate,
        sectionOrder,
        sectionNames,
        sectionTaxRates,
      };
    }
  }, [items, markup, pstRate, gstRate, profitRate, sectionOrder, sectionNames, sectionTaxRates, dirty, canEdit, projectId]);

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
          const mirrorRates = pendingSaveRef.current.sectionOrder[0]
            ? getSectionTaxRates(pendingSaveRef.current.sectionOrder[0], pendingSaveRef.current.sectionTaxRates)
            : DEFAULT_SECTION_TAX_RATES;
          const payload = {
            project_id: projectId,
            markup: pendingSaveRef.current.markup,
            pst_rate: mirrorRates.pstRate,
            gst_rate: mirrorRates.gstRate,
            profit_rate: pendingSaveRef.current.profitRate,
            section_order: pendingSaveRef.current.sectionOrder,
            section_names: pendingSaveRef.current.sectionNames,
            section_tax_rates: pendingSaveRef.current.sectionTaxRates,
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
              pst: it.pst,
              gst: it.gst,
              product_image: it.product_image,
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
              labour_journey_type: it.labour_journey_type,
              labour_days: it.labour_days,
              labour_hours_per_day: it.labour_hours_per_day,
              labour_price_unit: it.labour_price_unit,
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

  // Quote-style PST/GST: per-section rates on checked lines
  const { pst, gst } = useMemo(() => {
    let totalPst = 0;
    let totalGst = 0;
    const sections = new Set([...sectionOrder, ...Object.keys(groupedItems)]);
    for (const section of sections) {
      const sectionItems = groupedItems[section] || [];
      if (sectionItems.length === 0) continue;
      const rates = getSectionTaxRates(section, sectionTaxRates);
      const tax = calculateSectionTaxTotals(sectionItems, rates);
      totalPst += tax.pst;
      totalGst += tax.gst;
    }
    return { pst: totalPst, gst: totalGst };
  }, [sectionOrder, groupedItems, sectionTaxRates]);

  // Sum of all section line totals (no markup)
  const totalWithMarkup = useMemo(() => {
    return Object.keys(groupedItems).reduce((acc, section) => {
      const sectionItems = groupedItems[section];
      const sectionTotal = sectionItems.reduce((sum, it) => sum + calculateItemTotalWithMarkup(it), 0);
      return acc + sectionTotal;
    }, 0);
  }, [groupedItems, calculateItemTotalWithMarkup]);

  // Helper function to calculate section subtotal
  const calculateSectionSubtotal = useCallback((sectionName: string): number => {
    const sectionItems = groupedItems[sectionName] || [];
    return sectionItems.reduce((sum, it) => sum + calculateItemTotalWithMarkup(it), 0);
  }, [groupedItems, calculateItemTotalWithMarkup]);

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

  // Calculate Estimate Changes totals by category
  const estimateChangesProductsTotal = useMemo(() => {
    return items
      .filter(it => {
        const section = it.section || 'Miscellaneous';
        return !!it.added_via_report_id &&
               !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) &&
               !section.startsWith('Labour Section') &&
               !section.startsWith('Sub-Contractor Section') &&
               !section.startsWith('Shop Section') &&
               !section.startsWith('Miscellaneous Section');
      })
      .reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, calculateItemTotalWithMarkup]);

  const estimateChangesLabourTotal = useMemo(() => {
    return items
      .filter(it => {
        const section = it.section || 'Miscellaneous';
        return !!it.added_via_report_id &&
               (section === 'Labour' || section.startsWith('Labour Section'));
      })
      .reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, calculateItemTotalWithMarkup]);

  const estimateChangesSubContractorsTotal = useMemo(() => {
    return items
      .filter(it => {
        const section = it.section || 'Miscellaneous';
        return !!it.added_via_report_id &&
               (section === 'Sub-Contractors' || section.startsWith('Sub-Contractor Section'));
      })
      .reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, calculateItemTotalWithMarkup]);

  const estimateChangesShopTotal = useMemo(() => {
    return items
      .filter(it => {
        const section = it.section || 'Miscellaneous';
        return !!it.added_via_report_id &&
               (section === 'Shop' || section.startsWith('Shop Section'));
      })
      .reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, calculateItemTotalWithMarkup]);

  const estimateChangesMiscellaneousTotal = useMemo(() => {
    return items
      .filter(it => {
        const section = it.section || 'Miscellaneous';
        return !!it.added_via_report_id &&
               (section === 'Miscellaneous' || section.startsWith('Miscellaneous Section'));
      })
      .reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items, calculateItemTotalWithMarkup]);

  // Calculate Total Direct Project Costs as sum of all specific costs
  const totalDirectProjectCosts = useMemo(() => {
    return totalProductsCosts + totalLabourCosts + totalSubContractorsCosts + totalShopCosts + totalMiscellaneousCosts;
  }, [totalProductsCosts, totalLabourCosts, totalSubContractorsCosts, totalShopCosts, totalMiscellaneousCosts]);

  const subtotal = useMemo(()=> totalDirectProjectCosts + pst, [totalDirectProjectCosts, pst]);

  const profitValue = useMemo(()=> subtotal * (profitRate/100), [subtotal, profitRate]);
  const finalTotal = useMemo(()=> subtotal + profitValue, [subtotal, profitValue]);
  const grandTotal = useMemo(()=> finalTotal + gst, [finalTotal, gst]);

  // Track dirty state
  useEffect(() => {
    if (!savedStateRef.current) {
      savedStateRef.current = { items, markup, pstRate, gstRate, profitRate, sectionOrder, sectionNames, sectionTaxRates };
      setDirty(false);
      return;
    }
    const saved = savedStateRef.current;
    const itemsChanged = JSON.stringify(items) !== JSON.stringify(saved.items);
    const markupChanged = markup !== saved.markup;
    const profitRateChanged = profitRate !== saved.profitRate;
    const sectionOrderChanged = JSON.stringify(sectionOrder) !== JSON.stringify(saved.sectionOrder);
    const sectionNamesChanged = JSON.stringify(sectionNames) !== JSON.stringify(saved.sectionNames);
    const sectionTaxRatesChanged = JSON.stringify(sectionTaxRates) !== JSON.stringify(saved.sectionTaxRates);
    setDirty(itemsChanged || markupChanged || profitRateChanged || sectionOrderChanged || sectionNamesChanged || sectionTaxRatesChanged);
  }, [items, markup, profitRate, sectionOrder, sectionNames, sectionTaxRates]);

  // Manual save function (user clicks Save button)
  const handleManualSave = useCallback(async () => {
    await performSave(false);
  }, [performSave]);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => dirty && canEdit,
    save: () => performSave(false),
    getGrandTotal: () => grandTotal,
    getTotalEstimate: () => finalTotal, // Returns Total Estimate (before GST)
    getPst: () => pst,
    getGst: () => gst,
    getEstimateData: () => ({
      items,
      markup,
      pstRate: sectionOrder[0] ? getSectionTaxRates(sectionOrder[0], sectionTaxRates).pstRate : pstRate,
      gstRate: sectionOrder[0] ? getSectionTaxRates(sectionOrder[0], sectionTaxRates).gstRate : gstRate,
      profitRate,
      sectionOrder,
      sectionNames,
      sectionTaxRates,
    })
  }), [dirty, canEdit, performSave, grandTotal, finalTotal, pst, gst, items, markup, pstRate, gstRate, profitRate, sectionOrder, sectionNames, sectionTaxRates]);

  // Sync section order with items (add new sections that appear in items)
  useEffect(()=>{
    const sectionsInItems = new Set<string>();
    items.forEach(it=> sectionsInItems.add(it.section || 'Miscellaneous'));
    const existingSections = new Set(sectionOrder);
    const newSections = Array.from(sectionsInItems).filter(s => !existingSections.has(s));
    if(newSections.length > 0){
      setSectionOrder(prev => [...prev, ...newSections]);
      setSectionTaxRates(prev => buildSectionTaxRatesMap([...sectionOrder, ...newSections], prev));
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
      return;
    }
    
    const ok = await confirm({
      title: 'Remove item',
      message: `Are you sure you want to remove "${itemName}"? This action cannot be undone.`,
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });
    
    if (ok === 'confirm') {
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
    
    if (ok === 'confirm') {
      setItems(prev => prev.filter(item => item.section !== section));
      setSectionOrder(prev => prev.filter(s => s !== section));
      setSectionTaxRates(prev => {
        const next = { ...prev };
        delete next[section];
        return next;
      });
      setSectionNames(prev => {
        const newNames = { ...prev };
        delete newNames[section];
        return newNames;
      });
    }
  }, [confirm, canEdit, groupedItems, getSectionDisplayName]);
  
  const estimateThClass = designSystem ? uiCx('p-2 text-left', uiTypography.controlLabel) : 'p-2 text-left';
  const estimateThCenterClass = designSystem ? uiCx('p-2 text-center', uiTypography.controlLabel) : 'p-2 text-center';
  const estimateTableClass = designSystem ? 'w-full text-xs' : 'w-full text-sm';
  const estimateTfootClass = designSystem ? uiColors.surfaceSubtle : 'bg-gray-50';

  const addSectionToolbar = (
    <>
      <div className={uiCx('mb-2', designSystem ? uiTypography.controlLabel : 'text-sm font-medium text-gray-700')}>+ Add Section for:</div>
      <div className="flex items-center gap-2">
      {designSystem ? (
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canEdit}
          onClick={() => {
          if (!canEdit) return;
          const newSection = `Product Section ${Date.now()}`;
          setSectionOrder(prev => {
            let lastProductIndex = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].startsWith('Product Section')) {
                lastProductIndex = i;
                break;
              }
            }
            if (lastProductIndex >= 0) {
              const newOrder = [...prev];
              newOrder.splice(lastProductIndex + 1, 0, newSection);
              return newOrder;
            } else {
              return [newSection, ...prev];
            }
          });
          setSectionNames(prev => ({ ...prev, [newSection]: 'Product Section' }));
        }}
        >
          Product
        </AppButton>
      ) : (
      <button 
        onClick={() => {
          if (!canEdit) return;
          const newSection = `Product Section ${Date.now()}`;
          setSectionOrder(prev => {
            let lastProductIndex = -1;
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].startsWith('Product Section')) {
                lastProductIndex = i;
                break;
              }
            }
            if (lastProductIndex >= 0) {
              const newOrder = [...prev];
              newOrder.splice(lastProductIndex + 1, 0, newSection);
              return newOrder;
            } else {
              return [newSection, ...prev];
            }
          });
          setSectionNames(prev => ({ ...prev, [newSection]: 'Product Section' }));
        }}
        disabled={!canEdit}
        className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-base">
        Product
      </button>
      )}
      {designSystem ? (
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canEdit || sectionOrder.some(s => s.startsWith('Labour Section') || s === 'Labour')}
          onClick={() => {
          if (!canEdit) return;
          const hasLabour = sectionOrder.some(s => s.startsWith('Labour Section') || s === 'Labour');
          if (hasLabour) {
            toast.error('Only one Labour section is allowed');
            return;
          }
          const newSection = `Labour Section ${Date.now()}`;
          setSectionOrder(prev => [...prev, newSection]);
          setSectionNames(prev => ({ ...prev, [newSection]: 'Labour' }));
        }}
        >
          Labour
        </AppButton>
      ) : (
      <button 
        onClick={() => {
          if (!canEdit) return;
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
        className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-base">
        Labour
      </button>
      )}
      {designSystem ? (
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canEdit || sectionOrder.some(s => s.startsWith('Sub-Contractor Section') || s === 'Sub-Contractors')}
          onClick={() => {
          if (!canEdit) return;
          const hasSubContractor = sectionOrder.some(s => s.startsWith('Sub-Contractor Section') || s === 'Sub-Contractors');
          if (hasSubContractor) {
            toast.error('Only one Sub-Contractor section is allowed');
            return;
          }
          const newSection = `Sub-Contractor Section ${Date.now()}`;
          setSectionOrder(prev => [...prev, newSection]);
          setSectionNames(prev => ({ ...prev, [newSection]: 'Sub-Contractor' }));
        }}
        >
          Sub-Contractor
        </AppButton>
      ) : (
      <button 
        onClick={() => {
          if (!canEdit) return;
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
        className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-base">
        Sub-Contractor
      </button>
      )}
      {designSystem ? (
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canEdit || sectionOrder.some(s => s.startsWith('Miscellaneous Section') || s === 'Miscellaneous')}
          onClick={() => {
          if (!canEdit) return;
          const hasMiscellaneous = sectionOrder.some(s => s.startsWith('Miscellaneous Section') || s === 'Miscellaneous');
          if (hasMiscellaneous) {
            toast.error('Only one Miscellaneous section is allowed');
            return;
          }
          const newSection = `Miscellaneous Section ${Date.now()}`;
          setSectionOrder(prev => [...prev, newSection]);
          setSectionNames(prev => ({ ...prev, [newSection]: 'Miscellaneous' }));
        }}
        >
          Miscellaneous
        </AppButton>
      ) : (
      <button 
        onClick={() => {
          if (!canEdit) return;
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
        className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-base">
        Miscellaneous
      </button>
      )}
      {designSystem ? (
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canEdit || sectionOrder.some(s => s.startsWith('Shop Section') || s === 'Shop')}
          onClick={() => {
          if (!canEdit) return;
          const hasShop = sectionOrder.some(s => s.startsWith('Shop Section') || s === 'Shop');
          if (hasShop) {
            toast.error('Only one Shop section is allowed');
            return;
          }
          const newSection = `Shop Section ${Date.now()}`;
          setSectionOrder(prev => [...prev, newSection]);
          setSectionNames(prev => ({ ...prev, [newSection]: 'Shop' }));
        }}
        >
          Shop
        </AppButton>
      ) : (
      <button 
        onClick={() => {
          if (!canEdit) return;
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
        className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-base">
        Shop
      </button>
      )}
    </div>
    </>
  );

  return (
    <div ref={builderRootRef} className="[overflow-anchor:none]">
      {showRestrictionWarning && (
        <div
          className={
            designSystem
              ? uiCx('mb-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900', uiRadius.card)
              : 'mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800'
          }
        >
          <strong>Editing Restricted:</strong> This project has status "{statusLabel}" which does not allow editing proposals or estimates.
        </div>
      )}
      {canEdit && (designSystem ? (
        <AppCard className="sticky top-0 z-30 mb-3" bodyClassName={uiSpacing.cardPadding}>{addSectionToolbar}</AppCard>
      ) : (
        <div className="sticky top-0 z-30 mb-3 border-b bg-white/95 py-3 backdrop-blur">{addSectionToolbar}</div>
      ))}

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
        sectionTaxRates={sectionTaxRates}
        designSystem={designSystem}
      />

      {/* Product View Modal */}
      {viewingProduct && viewingProductId && (
        <ProductViewModal 
          product={viewingProduct}
          onClose={() => setViewingProductId(null)}
          designSystem={designSystem}
        />
      )}

      {/* Add Item to Section Modals */}
      {addingToSection && (
        (() => {
          const { section, type } = addingToSection;
          if (type === 'product') {
            const replaceItemIndex = addingToSection.replaceItemIndex;
            return (
              <AddProductModal
                onAdd={(it) => {
                  if (replaceItemIndex !== undefined) {
                    setItems((prev) =>
                      prev.map((item, i) =>
                        i === replaceItemIndex
                          ? {
                              ...it,
                              section,
                              quantity: item.quantity,
                              unit_price: item.unit_price,
                              pst: item.pst,
                              gst: item.gst,
                              added_via_report_id: item.added_via_report_id,
                              added_via_report_date: item.added_via_report_date,
                            }
                          : item,
                      ),
                    );
                  } else {
                    setItems((prev) => [...prev, { ...it, section }]);
                  }
                  setAddingToSection(null);
                }}
                disabled={!canEdit}
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
                designSystem={designSystem}
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
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
                designSystem={designSystem}
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
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
                designSystem={designSystem}
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
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
                designSystem={designSystem}
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
                open={true}
                onClose={() => setAddingToSection(null)}
                section={section}
                designSystem={designSystem}
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
            const showProductList = designSystem && isProductSection(section);
            const productSectionSubtotal = sectionItems.reduce((acc, it) => acc + calculateProductLineTotal(it), 0);
            const productEstimateChangesTotal = sectionItems
              .filter((it) => !!it.added_via_report_id)
              .reduce((acc, it) => acc + calculateProductLineTotal(it), 0);
            return (
            <div key={section}
                 className={uiCx(
                   designSystem ? estimateSectionShell : 'rounded-xl border overflow-hidden bg-white',
                   dragOverSection === section && canEdit && 'ring-2 ring-brand-red',
                 )}
                 onDragOver={canEdit ? (e) => onSectionDragOver(e, section) : undefined}
                 onDrop={canEdit ? onSectionDrop : undefined}>
              <div className={designSystem ? estimateSectionHeader : uiCx('flex items-center gap-2 border-b px-4 py-2 bg-gray-200')}>
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
                  designSystem ? (
                    <AppInput
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
                      className="min-w-[400px]"
                      autoFocus
                    />
                  ) : (
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
                  )
                ) : (
                  <h3 className={designSystem ? uiTypography.sectionTitle : 'font-semibold text-gray-900'}>
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
                  designSystem ? (
                    <AppHeroEditButton
                      title="Edit section name"
                      disabled={!canEdit}
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
                    />
                  ) : (
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
                  )
                )}
                </div>
                <div className="ml-auto flex items-end gap-2">
                  {designSystem ? (
                    <>
                      <AppInput
                        type="number"
                        label="PST (%)"
                        className="w-24"
                        value={getSectionTaxRates(section, sectionTaxRates).pstRate}
                        min={0}
                        step={0.01}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0);
                          setSectionTaxRates((prev) => ({
                            ...prev,
                            [section]: { ...getSectionTaxRates(section, prev), pstRate: value },
                          }));
                        }}
                        disabled={!canEdit}
                      />
                      <AppInput
                        type="number"
                        label="GST (%)"
                        className="w-24"
                        value={getSectionTaxRates(section, sectionTaxRates).gstRate}
                        min={0}
                        step={0.01}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0);
                          setSectionTaxRates((prev) => ({
                            ...prev,
                            [section]: { ...getSectionTaxRates(section, prev), gstRate: value },
                          }));
                        }}
                        disabled={!canEdit}
                      />
                    </>
                  ) : (
                    <>
                      <label className="text-xs text-gray-600">PST (%)</label>
                      <input
                        type="number"
                        className="w-16 rounded border px-2 py-1 text-sm"
                        value={getSectionTaxRates(section, sectionTaxRates).pstRate}
                        min={0}
                        step={0.01}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0);
                          setSectionTaxRates((prev) => ({
                            ...prev,
                            [section]: { ...getSectionTaxRates(section, prev), pstRate: value },
                          }));
                        }}
                        disabled={!canEdit}
                      />
                      <label className="text-xs text-gray-600">GST (%)</label>
                      <input
                        type="number"
                        className="w-16 rounded border px-2 py-1 text-sm"
                        value={getSectionTaxRates(section, sectionTaxRates).gstRate}
                        min={0}
                        step={0.01}
                        onChange={(e) => {
                          const value = Number(e.target.value || 0);
                          setSectionTaxRates((prev) => ({
                            ...prev,
                            [section]: { ...getSectionTaxRates(section, prev), gstRate: value },
                          }));
                        }}
                        disabled={!canEdit}
                      />
                    </>
                  )}
                {canEdit && (
                  designSystem ? (
                    <AppListRowIconButton
                      label="Remove section"
                      preset="delete"
                      disabled={!canEdit}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSection(section);
                      }}
                    />
                  ) : (
                    <>
                      {!isLabourSection && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAddingToSection({ section, type: 'product' });
                            }}
                            className="px-2 py-1 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111] flex items-center justify-center"
                            title="Add item to section"
                            disabled={!canEdit}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="4" x2="12" y2="20"></line>
                              <line x1="4" y1="12" x2="20" y2="12"></line>
                            </svg>
                          </button>
                      )}
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
                    </>
                  )
                )}
                </div>
              </div>
              {showProductList ? (
                <div className="p-4">
                  <div className={ESTIMATE_PRODUCT_TABLE_SHELL}>
                    <div className={uiCx(ESTIMATE_PRODUCT_TABLE_BAND, 'border-b')}>
                      <div className="w-10 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <EstimateProductHeaderCell>Product</EstimateProductHeaderCell>
                      </div>
                      <EstimateProductHeaderCell
                        className={uiCx(ESTIMATE_PRODUCT_PRICE_FIELD, ESTIMATE_PRODUCT_PRICE_CELL)}
                      >
                        Price
                      </EstimateProductHeaderCell>
                      <EstimateProductHeaderCell
                        className={uiCx(ESTIMATE_PRODUCT_QTY_FIELD, ESTIMATE_PRODUCT_QUANTITY_CELL)}
                      >
                        Quantity
                      </EstimateProductHeaderCell>
                      <EstimateProductHeaderCell className={ESTIMATE_PRODUCT_TOTAL_FIELD} align="right">
                        Total
                      </EstimateProductHeaderCell>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <EstimateProductHeaderCell className="w-9" align="center">
                          PST
                        </EstimateProductHeaderCell>
                        <EstimateProductHeaderCell className="w-9" align="center">
                          GST
                        </EstimateProductHeaderCell>
                      </div>
                      {canEdit ? <div className="w-8 shrink-0" aria-hidden /> : null}
                    </div>

                    {sectionItems.length === 0 ? (
                      <div className={uiCx('px-3 py-6 text-center', uiTypography.helper)}>
                        No products yet. Add your first product below.
                      </div>
                    ) : (
                      <div className="space-y-1 px-1 py-1 [overflow-anchor:none]">
                      {sectionItems.map((it) => {
                        const originalIdx = items.indexOf(it);
                        return (
                          <EstimateProductListRow
                            key={`${section}-product-${originalIdx}`}
                            item={it}
                            canEdit={!!canEdit}
                            onQuantityChange={(qty) => {
                              if (!canEdit) return;
                              setItems((prev) =>
                                prev.map((item, i) => (i === originalIdx ? { ...item, quantity: qty } : item)),
                              );
                            }}
                            onPriceChange={(price) => {
                              if (!canEdit) return;
                              setItems((prev) =>
                                prev.map((item, i) => (i === originalIdx ? { ...item, unit_price: price } : item)),
                              );
                            }}
                            onPstChange={(checked) => {
                              if (!canEdit) return;
                              captureScrollForTaxUpdate();
                              setItems((prev) =>
                                prev.map((item, i) => (i === originalIdx ? { ...item, pst: checked } : item)),
                              );
                            }}
                            onGstChange={(checked) => {
                              if (!canEdit) return;
                              captureScrollForTaxUpdate();
                              setItems((prev) =>
                                prev.map((item, i) => (i === originalIdx ? { ...item, gst: checked } : item)),
                              );
                            }}
                            onRemove={() => handleRemoveItem(originalIdx, it.name || it.description || 'this item')}
                            onViewProduct={() => {
                              if (it.material_id) setViewingProductId(it.material_id);
                            }}
                            onReplaceProduct={() => {
                              setAddingToSection({ section, type: 'product', replaceItemIndex: originalIdx });
                            }}
                          />
                        );
                      })}
                      </div>
                    )}

                    <div className={uiCx(ESTIMATE_PRODUCT_TABLE_BAND, 'border-t')}>
                      <div className="w-10 shrink-0" aria-hidden />
                      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                        {productEstimateChangesTotal > 0 ? (
                          <div className="relative group/alert inline-flex items-center">
                            <EstimateChangesAlertIcon className="h-4 w-4" />
                            <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/alert:opacity-100">
                              Amount for items added via Report (Estimate Changes): ${productEstimateChangesTotal.toFixed(2)}
                              <div className="absolute -bottom-1 right-4 h-2 w-2 rotate-45 bg-gray-900" />
                            </div>
                          </div>
                        ) : null}
                        <span className={uiCx(uiTypography.controlLabel, 'font-semibold text-gray-700')}>
                          Section Subtotal:
                        </span>
                      </div>
                      <div className={uiCx(ESTIMATE_PRODUCT_PRICE_FIELD, ESTIMATE_PRODUCT_PRICE_CELL)} aria-hidden />
                      <div className={uiCx(ESTIMATE_PRODUCT_QTY_FIELD, ESTIMATE_PRODUCT_QUANTITY_CELL)} aria-hidden />
                      <div className={uiCx(ESTIMATE_PRODUCT_TOTAL_FIELD, 'flex min-h-8 items-center justify-end')}>
                        <span className="text-xs font-bold tabular-nums text-gray-900">
                          ${productSectionSubtotal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
                        <div className="w-9" />
                        <div className="w-9" />
                      </div>
                      {canEdit ? <div className="w-8 shrink-0" aria-hidden /> : null}
                    </div>
                  </div>
                  {canEdit && (
                    <AppButton
                      type="button"
                      variant="secondary"
                      className="mt-3 flex min-h-[60px] w-full items-center justify-center border-2 border-dashed"
                      onClick={() => setAddingToSection({ section, type: 'product' })}
                      disabled={!canEdit}
                    >
                      + Add Product
                    </AppButton>
                  )}
                </div>
              ) : designSystem && isLabourSection ? (
                (() => {
                  const labourMeta = getLabourStyleSectionMeta(section);
                  const labourSectionSubtotal = sectionItems.reduce((acc, it) => acc + calculateItemBaseTotal(it), 0);
                  const labourEstimateChangesTotal = sectionItems
                    .filter((it) => !!it.added_via_report_id)
                    .reduce((acc, it) => acc + calculateItemBaseTotal(it), 0);
                  return (
                    <div className="p-4">
                      <div className={ESTIMATE_PRODUCT_TABLE_SHELL}>
                        <div className={uiCx(ESTIMATE_PRODUCT_TABLE_BAND, 'border-b')}>
                          <div className="min-w-0 flex-1">
                            <EstimateProductHeaderCell>{labourMeta.itemLabel}</EstimateProductHeaderCell>
                          </div>
                          <EstimateProductHeaderCell className={ESTIMATE_LABOUR_COMPOSITION_FIELD}>
                            {labourMeta.midLabel}
                          </EstimateProductHeaderCell>
                          <EstimateProductHeaderCell className={ESTIMATE_LABOUR_PRICE_FIELD}>
                            Price
                          </EstimateProductHeaderCell>
                          <EstimateProductHeaderCell className={ESTIMATE_PRODUCT_TOTAL_FIELD} align="right">
                            Total
                          </EstimateProductHeaderCell>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <EstimateProductHeaderCell className="w-9" align="center">PST</EstimateProductHeaderCell>
                            <EstimateProductHeaderCell className="w-9" align="center">GST</EstimateProductHeaderCell>
                          </div>
                          {canEdit ? <div className="w-8 shrink-0" aria-hidden /> : null}
                        </div>

                        {sectionItems.length === 0 ? (
                          <div className={uiCx('px-3 py-6 text-center', uiTypography.helper)}>
                            {labourMeta.emptyLabel}
                          </div>
                        ) : (
                          <div className="space-y-1 px-1 py-1 [overflow-anchor:none]">
                            {sectionItems.map((it) => {
                              const originalIdx = items.indexOf(it);
                              return (
                                <EstimateLabourStyleListRow
                                  key={`${section}-labour-${originalIdx}`}
                                  item={it}
                                  section={section}
                                  canEdit={!!canEdit}
                                  onUpdate={(patch) => {
                                    if (!canEdit) return;
                                    if ('pst' in patch || 'gst' in patch) {
                                      captureScrollForTaxUpdate();
                                    }
                                    setItems((prev) =>
                                      prev.map((row, i) => (i === originalIdx ? { ...row, ...patch } : row)),
                                    );
                                  }}
                                  onRemove={() => handleRemoveItem(originalIdx, it.name || it.description || 'this item')}
                                />
                              );
                            })}
                          </div>
                        )}

                        <div className={uiCx(ESTIMATE_PRODUCT_TABLE_BAND, 'border-t')}>
                          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                            {labourEstimateChangesTotal > 0 ? (
                              <div className="relative group/alert inline-flex items-center">
                                <EstimateChangesAlertIcon className="h-4 w-4" />
                                <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/alert:opacity-100">
                                  Amount for items added via Report (Estimate Changes): ${labourEstimateChangesTotal.toFixed(2)}
                                  <div className="absolute -bottom-1 right-4 h-2 w-2 rotate-45 bg-gray-900" />
                                </div>
                              </div>
                            ) : null}
                            <span className={uiCx(uiTypography.controlLabel, 'font-semibold text-gray-700')}>
                              Section Subtotal:
                            </span>
                          </div>
                          <div className={ESTIMATE_LABOUR_COMPOSITION_FIELD} aria-hidden />
                          <div className={ESTIMATE_LABOUR_PRICE_FIELD} aria-hidden />
                          <div className={uiCx(ESTIMATE_PRODUCT_TOTAL_FIELD, 'flex min-h-8 items-center justify-end')}>
                            <span className="text-xs font-bold tabular-nums text-gray-900">
                              ${labourSectionSubtotal.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
                            <div className="w-9" />
                            <div className="w-9" />
                          </div>
                          {canEdit ? <div className="w-8 shrink-0" aria-hidden /> : null}
                        </div>
                      </div>
                      {canEdit && (
                        <AppButton
                          type="button"
                          variant="secondary"
                          className="mt-3 flex min-h-[60px] w-full items-center justify-center border-2 border-dashed"
                          onClick={() => setAddingToSection({ section, type: labourMeta.type })}
                          disabled={!canEdit}
                        >
                          {labourMeta.addLabel}
                        </AppButton>
                      )}
                    </div>
                  );
                })()
              ) : (
              <>
              <table className={estimateTableClass}>
                <thead className={uiCx(designSystem ? uiColors.surfaceSubtle : 'bg-gray-50', 'border-b')}><tr>
                  {!isLabourSection ? (
                    <>
                      <th className={estimateThClass}>Product / Item</th>
                      <th className={estimateThClass}>Quantity Required</th>
                      <th className={estimateThClass}>Demand Unit</th>
                      <th className={estimateThClass}>Unit Price</th>
                      <th className={estimateThClass}>Purchase Quantity</th>
                      <th className={estimateThClass}>Sell Unit</th>
                      <th className={estimateThClass}>Total</th>
                      <th className={estimateThCenterClass}>PST</th>
                      <th className={estimateThCenterClass}>GST</th>
                      <th className={estimateThClass}>Supplier</th>
                      <th className={estimateThClass}></th>
                    </>
                  ) : (
                    <>
                      <th className={estimateThClass}>
                        {section.startsWith('Miscellaneous Section') || section === 'Miscellaneous' || section.startsWith('Shop Section') || section === 'Shop' ? 'Product / Item' :
                         section.startsWith('Labour Section') || section === 'Labour' ? 'Labour' :
                         section.startsWith('Sub-Contractor Section') || section === 'Sub-Contractors' ? 'Sub-Contractor' :
                         section}
                      </th>
                      <th className={estimateThClass}>
                        {section.startsWith('Miscellaneous Section') || section === 'Miscellaneous' || section.startsWith('Shop Section') || section === 'Shop' ? 'Quantity Required' : 'Composition'}
                      </th>
                      <th className={estimateThClass}>Unit Price</th>
                      <th className={estimateThClass}>Total</th>
                      <th className={estimateThCenterClass}>PST</th>
                      <th className={estimateThCenterClass}>GST</th>
                      <th className={estimateThClass}></th>
                    </>
                  )}
                </tr></thead>
                <tbody>
                  {sectionItems.length === 0 ? (
                    <tr>
                      <td colSpan={!isLabourSection ? 11 : 7} className={uiCx('p-4 text-center', designSystem ? uiTypography.helper : 'text-gray-500')}>
                        No items yet. Add your first item below.
                      </td>
                    </tr>
                  ) : (
                    sectionItems.map((it, idx)=> {
                    const originalIdx = items.indexOf(it);
                    // Calculate total value based on item type (no markup)
                    let totalValue = 0;
                    if (!isLabourSection) {
                      totalValue = it.quantity * it.unit_price;
                    } else {
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
                    const isFromReport = !!it.added_via_report_id;
                    return (
                      <tr
                        key={`${section}-${originalIdx}`}
                        className={`border-b ${isFromReport ? '!bg-yellow-50' : 'hover:bg-gray-50'}`}
                      >
                        {!isLabourSection ? (
                          <>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>
                              <div className="flex items-center gap-2">
                                {it.added_via_report_id && (
                                  <div className="relative group/alert inline-flex items-center">
                                    <EstimateChangesAlertIcon />
                                    <div className="absolute left-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                      Added via Report (Estimate Changes) on {it.added_via_report_date ? new Date(it.added_via_report_date).toLocaleDateString() : 'unknown date'}
                                      <div className="absolute -bottom-1 left-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                                    </div>
                                  </div>
                                )}
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
                              </div>
                            </td>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>
                              {designSystem ? (
                                <EstimateInlineInput
                                  type="number"
                                  className="w-20"
                                  value={it.qty_required ?? ''}
                                  min={0}
                                  step={1}
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
                                  readOnly={!canEdit}
                                />
                              ) : (
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
                              )}
                            </td>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>
                              {designSystem ? (
                                <AppSelect
                                  className="w-24"
                                  triggerClassName="w-24 !h-8 text-xs"
                                  value={it.unit_required||''}
                                  placeholder="—"
                                  options={[
                                    { value: '', label: '—' },
                                    ...(it.unit_type === 'coverage' ? [
                                      { value: 'SQS', label: 'SQS' },
                                      { value: 'ft²', label: 'ft²' },
                                      { value: 'm²', label: 'm²' },
                                    ] : []),
                                    ...(it.unit_type === 'multiple' ? [{ value: 'package', label: 'package' }] : []),
                                    ...(it.unit_type === 'unitary' ? [{ value: 'Each', label: 'Each' }] : []),
                                  ]}
                                  onChange={e=>{
                                  if (!canEdit) return;
                                  const newValue = e.target.value;
                                  const newItem = {...it, unit_required: newValue};
                                  const calculatedQty = calculateQuantity(newItem);
                                  setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...newItem, quantity: calculatedQty} : item));
                                }}
                                  disabled={!canEdit}
                                />
                              ) : (
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
                              )}
                            </td>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>${it.unit_price.toFixed(2)}</td>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>
                              {designSystem ? (
                                <EstimateInlineInput
                                  type="number"
                                  className="w-20"
                                  value={it.quantity ?? ''}
                                  min={0}
                                  step={1}
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
                                  readOnly={!canEdit}
                                />
                              ) : (
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
                              )}
                            </td>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>{it.unit||''}</td>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>${totalValue.toFixed(2)}</td>
                            <EstimateTaxCheckboxCells
                              item={it}
                              originalIdx={originalIdx}
                              canEdit={!!canEdit}
                              isFromReport={isFromReport}
                              designSystem={!!designSystem}
                              setItems={setItems}
                              onBeforeTaxChange={captureScrollForTaxUpdate}
                            />
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>{it.supplier_name||''}</td>
                          </>
                        ) : (
                          <>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>
                              <div className="flex items-center gap-2">
                                {it.added_via_report_id && (
                                  <div className="relative group/alert inline-flex items-center">
                                    <EstimateChangesAlertIcon />
                                    <div className="absolute left-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                                      Added via Report (Estimate Changes) on {it.added_via_report_date ? new Date(it.added_via_report_date).toLocaleDateString() : 'unknown date'}
                                      <div className="absolute -bottom-1 left-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                                    </div>
                                  </div>
                                )}
                                <span>{it.description||it.name}</span>
                              </div>
                            </td>
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>
                              {it.item_type === 'labour' && it.labour_journey_type ? (
                                it.labour_journey_type === 'contract' ? (
                                  <div className="flex items-center gap-2">
                                    {designSystem ? (
                                      <EstimateInlineInput
                                        type="number"
                                        className="w-16"
                                        value={it.labour_journey ?? ''}
                                        min={0}
                                        step={0.5}
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
                                        readOnly={!canEdit}
                                      />
                                    ) : (
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
                                    )}
                                    <span>{it.unit || ''}</span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    {designSystem ? (
                                      <EstimateInlineInput
                                        type="number"
                                        className="w-16"
                                        value={it.labour_journey ?? ''}
                                        min={0}
                                        step={0.5}
                                        onChange={e=>{
                                        if (!canEdit) return;
                                        const inputValue = e.target.value;
                                        if (inputValue === '') {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: 0, ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                          return;
                                        }
                                        const newValue = Number(inputValue);
                                        if (!isNaN(newValue)) {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: newValue, ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                        }
                                      }}
                                        onBlur={e=>{
                                        if (!canEdit) return;
                                        if (e.target.value === '' || e.target.value === null) {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: 0, ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                        }
                                      }}
                                        disabled={!canEdit}
                                        readOnly={!canEdit}
                                      />
                                    ) : (
                                    <input type="number" className={`w-16 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={it.labour_journey ?? ''} min={0} step={0.5} 
                                      onChange={e=>{
                                        if (!canEdit) return;
                                        const inputValue = e.target.value;
                                        if (inputValue === '') {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: 0, ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                          return;
                                        }
                                        const newValue = Number(inputValue);
                                        if (!isNaN(newValue)) {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: newValue, ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                        }
                                      }}
                                      onBlur={e=>{
                                        if (!canEdit) return;
                                        if (e.target.value === '' || e.target.value === null) {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_journey: 0, ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                        }
                                      }}
                                      disabled={!canEdit}
                                      readOnly={!canEdit} />
                                    )}
                                    <span>{it.labour_journey_type}</span>
                                    <span>×</span>
                                    {designSystem ? (
                                      <EstimateInlineInput
                                        type="number"
                                        className="w-14"
                                        value={it.labour_men ?? ''}
                                        min={0}
                                        step={1}
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
                                          const newDesc = (it.description?.includes(' - ') && /\d+\s*men\s*$/i.test(it.description || ''))
                                            ? (newMen > 0 ? `${baseName} - ${newMen} men` : baseName)
                                            : it.description;
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_men: newMen, ...(newDesc !== it.description ? { description: newDesc } : {}), ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                        }
                                      }}
                                        onBlur={e=>{
                                        if (!canEdit) return;
                                        if (e.target.value === '' || e.target.value === null) {
                                          const baseName = it.description?.includes(' - ') ? it.description.split(' - ')[0] : it.description || it.name;
                                          const keepLegacyDesc = it.description?.includes(' - ') && /\d+\s*men\s*$/i.test(it.description || '');
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_men: 1, ...(keepLegacyDesc ? { description: `${baseName} - 1 men` } : {}), ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                        }
                                      }}
                                        disabled={!canEdit}
                                        readOnly={!canEdit}
                                      />
                                    ) : (
                                    <input type="number" className={`w-14 border rounded px-2 py-1 ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`} value={it.labour_men ?? ''} min={0} step={1} 
                                      onChange={e=>{
                                        if (!canEdit) return;
                                        const inputValue = e.target.value;
                                        if (inputValue === '') {
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_men: 0, ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                          return;
                                        }
                                        const newMen = Number(inputValue);
                                        if (!isNaN(newMen)) {
                                          const baseName = it.description?.includes(' - ') ? it.description.split(' - ')[0] : it.description || it.name;
                                          const newDesc = (it.description?.includes(' - ') && /\d+\s*men\s*$/i.test(it.description || ''))
                                            ? (newMen > 0 ? `${baseName} - ${newMen} men` : baseName)
                                            : it.description;
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_men: newMen, ...(newDesc !== it.description ? { description: newDesc } : {}), ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                        }
                                      }}
                                      onBlur={e=>{
                                        if (!canEdit) return;
                                        if (e.target.value === '' || e.target.value === null) {
                                          const baseName = it.description?.includes(' - ') ? it.description.split(' - ')[0] : it.description || it.name;
                                          const keepLegacyDesc = it.description?.includes(' - ') && /\d+\s*men\s*$/i.test(it.description || '');
                                          setItems(prev=>prev.map((item,i)=> i===originalIdx ? {...item, labour_men: 1, ...(keepLegacyDesc ? { description: `${baseName} - 1 men` } : {}), ...CLEAR_LABOUR_RICH_EXTRAS} : item));
                                        }
                                      }}
                                      disabled={!canEdit}
                                      readOnly={!canEdit} />
                                    )}
                                    <span>men</span>
                                  </div>
                                    {formatLabourRichComposition(it) ? (
                                      <div className="truncate text-xs leading-tight text-gray-500" title={formatLabourRichComposition(it) || undefined}>
                                        {formatLabourRichComposition(it)}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              ) : (
                                <div className="flex items-center gap-2">
                                  {designSystem ? (
                                    <EstimateInlineInput
                                      type="number"
                                      className="w-20"
                                      value={it.quantity ?? ''}
                                      min={0}
                                      step={['Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ? 1 : 0.01}
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
                                      readOnly={!canEdit}
                                    />
                                  ) : (
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
                                  )}
                                  <span>{it.unit || ''}</span>
                                </div>
                              )}
                            </td>
                            <td className={`p-2 text-left ${isFromReport ? 'bg-yellow-50' : ''}`}>
                              <div className="flex items-center gap-1">
                                <span>$</span>
                                {designSystem ? (
                                  <EstimateInlineInput
                                    type="number"
                                    className="w-20"
                                    value={it.unit_price ?? ''}
                                    min={0}
                                    step={(it.item_type === 'labour' || it.item_type === 'subcontractor' || it.item_type === 'shop' || it.item_type === 'miscellaneous' || ['Sub-Contractors', 'Shop', 'Miscellaneous', 'Labour'].includes(section)) ? 1 : 0.01}
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
                                    readOnly={!canEdit}
                                  />
                                ) : (
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
                                )}
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
                            <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>${totalValue.toFixed(2)}</td>
                            <EstimateTaxCheckboxCells
                              item={it}
                              originalIdx={originalIdx}
                              canEdit={!!canEdit}
                              isFromReport={isFromReport}
                              designSystem={!!designSystem}
                              setItems={setItems}
                              onBeforeTaxChange={captureScrollForTaxUpdate}
                            />
                          </>
                        )}
                        {canEdit ? (
                          <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}>
                            {designSystem ? (
                              <AppListRowIconButton
                                label="Remove item"
                                preset="delete"
                                onClick={()=> handleRemoveItem(originalIdx, it.name || it.description || 'this item')}
                              />
                            ) : (
                            <button 
                              onClick={()=> handleRemoveItem(originalIdx, it.name || it.description || 'this item')} 
                              className="px-2 py-1 rounded text-gray-500 hover:text-red-600" 
                              title="Remove item">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M9 3h6a1 1 0 0 1 1 1v2h4v2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8H4V6h4V4a1 1 0 0 1 1-1Zm1 3h4V5h-4v1Zm-2 2 1 12h8l1-12H8Z"></path>
                              </svg>
                            </button>
                            )}
                          </td>
                        ) : (
                          // Keep table column alignment consistent with header even when read-only
                          <td className={`p-2 ${isFromReport ? 'bg-yellow-50' : ''}`}></td>
                        )}
                      </tr>
                    );
                  })
                  )}
                </tbody>
                <tfoot className={estimateTfootClass}>
                  <tr>
                    <td colSpan={!isLabourSection ? 6 : 3} className="p-2 text-right font-semibold">
                      <div className="flex items-center justify-end gap-2">
                        {(() => {
                          const estimateChangesItems = sectionItems.filter(it => !!it.added_via_report_id);
                          const estimateChangesTotal = estimateChangesItems.reduce((acc, it) => {
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
                            return acc + itemTotal;
                          }, 0);
                          
                          return estimateChangesTotal > 0 ? (
                            <div className="relative group/alert inline-flex items-center">
                              <EstimateChangesAlertIcon className="w-4 h-4" />
                              <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                              Amount for items added via Report (Estimate Changes): ${estimateChangesTotal.toFixed(2)}
                                <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                              </div>
                            </div>
                          ) : null;
                        })()}
                        <span>Section Subtotal:</span>
                      </div>
                    </td>
                    <td className="p-2 text-right font-bold">${sectionItems.reduce((acc, it)=> {
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
                      return acc + itemTotal;
                    }, 0).toFixed(2)}</td>
                    <td colSpan={!isLabourSection ? 4 : 3}></td>
                  </tr>
                </tfoot>
              </table>
              {canEdit && isLabourSection && (() => {
                const labourMeta = getLabourStyleSectionMeta(section);
                return (
                  <button
                    type="button"
                    className="mt-3 flex min-h-[60px] w-full items-center justify-center rounded border-2 border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                    onClick={() => setAddingToSection({ section, type: labourMeta.type })}
                    disabled={!canEdit}
                  >
                    {labourMeta.addLabel}
                  </button>
                );
              })()}
              </>
              )}
            </div>
          )})
        ) : (
          designSystem ? (
            <AppEmptyState
              title="No items yet. Add products, labour, sub-contractors or shop items to build your estimate."
            />
          ) : (
          <div className="rounded-xl border bg-white p-6 text-center text-gray-600">
            No items yet. Add products, labour, sub-contractors or shop items to build your estimate.
          </div>
          )
        )}
      </div>

      {/* Summary Section */}
      <div className="mt-6">
        {designSystem ? (
          <div className={estimateSummaryShell}>
            <div className={uiCx('bg-gray-500 px-4 py-3 text-xs font-semibold text-white')}>
              Summary
            </div>
            <div className="p-3">
              <div className="grid gap-3 md:grid-cols-2">
                {/* Left Card */}
                <div className={estimateSummaryInnerCard}>
                  <div className="space-y-1">
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabel}>Total Products Costs</span>
                      <span className={uiCx(estimateSummaryLabel, 'flex items-center gap-2')}>
                        {estimateChangesProductsTotal > 0 && (
                          <div className="relative group/alert inline-flex items-center">
                            <EstimateChangesAlertIcon className="w-4 h-4" />
                            <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                            Amount for items added via Report (Estimate Changes): ${estimateChangesProductsTotal.toFixed(2)}
                              <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <span>${totalProductsCosts.toFixed(2)}</span>
                      </span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabel}>Total Labour Costs</span>
                      <span className={uiCx(estimateSummaryLabel, 'flex items-center gap-2')}>
                        {estimateChangesLabourTotal > 0 && (
                          <div className="relative group/alert inline-flex items-center">
                            <EstimateChangesAlertIcon className="w-4 h-4" />
                            <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                            Amount for items added via Report (Estimate Changes): ${estimateChangesLabourTotal.toFixed(2)}
                              <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <span>${totalLabourCosts.toFixed(2)}</span>
                      </span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabel}>Total Sub-Contractors Costs</span>
                      <span className={uiCx(estimateSummaryLabel, 'flex items-center gap-2')}>
                        {estimateChangesSubContractorsTotal > 0 && (
                          <div className="relative group/alert inline-flex items-center">
                            <EstimateChangesAlertIcon className="w-4 h-4" />
                            <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                            Amount for items added via Report (Estimate Changes): ${estimateChangesSubContractorsTotal.toFixed(2)}
                              <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <span>${totalSubContractorsCosts.toFixed(2)}</span>
                      </span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabel}>Total Shop Costs</span>
                      <span className={uiCx(estimateSummaryLabel, 'flex items-center gap-2')}>
                        {estimateChangesShopTotal > 0 && (
                          <div className="relative group/alert inline-flex items-center">
                            <EstimateChangesAlertIcon className="w-4 h-4" />
                            <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                            Amount for items added via Report (Estimate Changes): ${estimateChangesShopTotal.toFixed(2)}
                              <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <span>${totalShopCosts.toFixed(2)}</span>
                      </span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabel}>Total Miscellaneous Costs</span>
                      <span className={uiCx(estimateSummaryLabel, 'flex items-center gap-2')}>
                        {estimateChangesMiscellaneousTotal > 0 && (
                          <div className="relative group/alert inline-flex items-center">
                            <EstimateChangesAlertIcon className="w-4 h-4" />
                            <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                            Amount for items added via Report (Estimate Changes): ${estimateChangesMiscellaneousTotal.toFixed(2)}
                              <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <span>${totalMiscellaneousCosts.toFixed(2)}</span>
                      </span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabelBold}>Total Direct Costs</span>
                      <span className={estimateSummaryLabelBold}>${totalDirectProjectCosts.toFixed(2)}</span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabel}>PST</span>
                      <span className={estimateSummaryLabel}>${pst.toFixed(2)}</span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabelBold}>Sub-total</span>
                      <span className={estimateSummaryLabelBold}>${subtotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                {/* Right Card */}
                <div className={estimateSummaryInnerCard}>
                  <div className="space-y-1">
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabel}>Profit (%)</span>
                      <EstimateInlineInput
                        type="number"
                        className="w-20 text-right"
                        value={profitRate}
                        min={0}
                        step={1}
                        onChange={e=>setProfitRate(Number(e.target.value||0))}
                        disabled={!canEdit}
                      />
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabelBold}>Total Profit</span>
                      <span className={estimateSummaryLabelBold}>${profitValue.toFixed(2)}</span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabelBold}>Total Estimate</span>
                      <span className={estimateSummaryLabelBold}>${finalTotal.toFixed(2)}</span>
                    </div>
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabel}>GST</span>
                      <span className={estimateSummaryLabel}>${gst.toFixed(2)}</span>
                    </div>
                    {(() => {
                      const additionalIncome = financialTotals?.additional_income || 0;
                      const additionalExpense = financialTotals?.additional_expense || 0;
                      if (additionalIncome > 0 || additionalExpense > 0) {
                        return (
                          <>
                            {additionalIncome > 0 && (
                              <div className={estimateSummaryRow}>
                                <span className={estimateSummaryLabel}>Additional Income</span>
                                <span className={estimateSummaryLabel}>${additionalIncome.toFixed(2)}</span>
                              </div>
                            )}
                            {additionalExpense > 0 && (
                              <div className={estimateSummaryRow}>
                                <span className={estimateSummaryLabel}>Additional Expense</span>
                                <span className={estimateSummaryLabel}>${additionalExpense.toFixed(2)}</span>
                              </div>
                            )}
                          </>
                        );
                      }
                      return null;
                    })()}
                    <div className={estimateSummaryRow}>
                      <span className={estimateSummaryLabelBold}>Final Total (with GST)</span>
                      <span className={estimateSummaryLabelBold}>
                        ${(grandTotal + (financialTotals?.additional_income || 0) - (financialTotals?.additional_expense || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
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
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1">
                    <span>Total Products Costs</span>
                    <span className="flex items-center gap-2">
                      {estimateChangesProductsTotal > 0 && (
                        <div className="relative group/alert inline-flex items-center">
                          <EstimateChangesAlertIcon className="w-4 h-4" />
                          <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                          Amount for items added via Report (Estimate Changes): ${estimateChangesProductsTotal.toFixed(2)}
                            <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                          </div>
                        </div>
                      )}
                      <span>${totalProductsCosts.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1">
                    <span>Total Labour Costs</span>
                    <span className="flex items-center gap-2">
                      {estimateChangesLabourTotal > 0 && (
                        <div className="relative group/alert inline-flex items-center">
                          <EstimateChangesAlertIcon className="w-4 h-4" />
                          <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                          Amount for items added via Report (Estimate Changes): ${estimateChangesLabourTotal.toFixed(2)}
                            <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                          </div>
                        </div>
                      )}
                      <span>${totalLabourCosts.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1">
                    <span>Total Sub-Contractors Costs</span>
                    <span className="flex items-center gap-2">
                      {estimateChangesSubContractorsTotal > 0 && (
                        <div className="relative group/alert inline-flex items-center">
                          <EstimateChangesAlertIcon className="w-4 h-4" />
                          <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                          Amount for items added via Report (Estimate Changes): ${estimateChangesSubContractorsTotal.toFixed(2)}
                            <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                          </div>
                        </div>
                      )}
                      <span>${totalSubContractorsCosts.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1">
                    <span>Total Shop Costs</span>
                    <span className="flex items-center gap-2">
                      {estimateChangesShopTotal > 0 && (
                        <div className="relative group/alert inline-flex items-center">
                          <EstimateChangesAlertIcon className="w-4 h-4" />
                          <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                          Amount for items added via Report (Estimate Changes): ${estimateChangesShopTotal.toFixed(2)}
                            <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                          </div>
                        </div>
                      )}
                      <span>${totalShopCosts.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1">
                    <span>Total Miscellaneous Costs</span>
                    <span className="flex items-center gap-2">
                      {estimateChangesMiscellaneousTotal > 0 && (
                        <div className="relative group/alert inline-flex items-center">
                          <EstimateChangesAlertIcon className="w-4 h-4" />
                          <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                          Amount for items added via Report (Estimate Changes): ${estimateChangesMiscellaneousTotal.toFixed(2)}
                            <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                          </div>
                        </div>
                      )}
                      <span>${totalMiscellaneousCosts.toFixed(2)}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Total Direct Costs</span><span className="font-bold">${totalDirectProjectCosts.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>PST</span><span>${pst.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Sub-total</span><span className="font-bold">${subtotal.toFixed(2)}</span></div>
                </div>
              </div>
              {/* Right Card */}
              <div className="rounded-xl border bg-white p-4">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1">
                    <span>Profit (%)</span>
                    <input 
                      type="number" 
                      className="border rounded px-2 py-1 w-20 text-right" 
                      value={profitRate} 
                      min={0} 
                      step={1}
                      onChange={e=>setProfitRate(Number(e.target.value||0))} 
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Total Profit</span><span className="font-bold">${profitValue.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span className="font-bold">Total Estimate</span><span className="font-bold">${finalTotal.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>GST</span><span>${gst.toFixed(2)}</span></div>
                  {(() => {
                    const additionalIncome = financialTotals?.additional_income || 0;
                    const additionalExpense = financialTotals?.additional_expense || 0;
                    if (additionalIncome > 0 || additionalExpense > 0) {
                      return (
                        <>
                          {additionalIncome > 0 && (
                            <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>Additional Income</span><span>${additionalIncome.toFixed(2)}</span></div>
                          )}
                          {additionalExpense > 0 && (
                            <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1"><span>Additional Expense</span><span>${additionalExpense.toFixed(2)}</span></div>
                          )}
                        </>
                      );
                    }
                    return null;
                  })()}
                  <div className="flex items-center justify-between hover:bg-gray-50 rounded px-1 py-1 -mx-1 text-lg"><span className="font-bold">Final Total (with GST)</span><span className="font-bold">${(grandTotal + (financialTotals?.additional_income || 0) - (financialTotals?.additional_expense || 0)).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Spacer to prevent fixed bar from overlapping content */}
      {!hideFooter && <div className="h-12" />}

      {/* Footer hover trigger area - always visible at bottom */}
      {!hideFooter && (
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

      {/* Fixed Unsaved Changes bar */}
      {!hideFooter && (
      <div 
        className={`fixed left-60 right-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
          footerVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
        onMouseEnter={() => setFooterVisible(true)}
        onMouseLeave={() => setFooterVisible(false)}
      >
        <div className="px-4">
          <div className="mx-auto max-w-[1400px] rounded-t-xl border bg-white/95 backdrop-blur p-2.5 flex items-center justify-between shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
            {/* Left: Status indicator (only show when canEdit) */}
            {canEdit && (
              designSystem ? (
                <AppBadge variant={dirty ? 'warning' : 'success'}>
                  {dirty ? 'Unsaved changes' : 'All changes saved'}
                </AppBadge>
              ) : (
              <div className={dirty ? 'text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 font-medium' : 'text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 font-medium'}>
                {dirty ? 'Unsaved changes' : 'All changes saved'}
              </div>
              )
            )}
            {!canEdit && <div className="w-0"></div>}
            
            {/* Center: Analysis and PDF */}
            <div className="flex items-center gap-1.5">
                {designSystem ? (
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={()=>setSummaryOpen(true)}
                  >
                    Analysis
                  </AppButton>
                ) : (
                <button
                  onClick={()=>setSummaryOpen(true)}
                  className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors">
                  Analysis
                </button>
                )}
                <div className="w-px h-4 bg-gray-300"></div>
                {designSystem ? (
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="sm"
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
                        const mirrorRates = sectionOrder[0]
                          ? getSectionTaxRates(sectionOrder[0], sectionTaxRates)
                          : DEFAULT_SECTION_TAX_RATES;
                        const payload = { 
                          project_id: projectId, 
                          markup, 
                          pst_rate: mirrorRates.pstRate,
                          gst_rate: mirrorRates.gstRate,
                          profit_rate: profitRate,
                          section_order: sectionOrder,
                          section_names: sectionNames,
                          section_tax_rates: sectionTaxRates,
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
                            pst: it.pst,
                            gst: it.gst,
                            product_image: it.product_image,
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
                            labour_journey_type: it.labour_journey_type,
                            labour_days: it.labour_days,
                            labour_hours_per_day: it.labour_hours_per_day,
                            labour_price_unit: it.labour_price_unit,
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
                      // Open PDF in new tab automatically for preview instead of auto-download
                      window.open(url, '_blank');
                      // Note: Don't revoke URL immediately - let it stay open for the user to view/download
                      // The browser will handle cleanup when the tab is closed
                      
                      toast.success('PDF generated and opened in new tab');
                    }catch(_e){
                      toast.error('Failed to generate PDF');
                    }finally{
                      setIsLoading(false);
                    }
                  }}
                    disabled={isLoading || items.length === 0}
                  >
                    {isLoading ? 'Generating...' : 'Generate PDF'}
                  </AppButton>
                ) : (
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
                        const mirrorRates = sectionOrder[0]
                          ? getSectionTaxRates(sectionOrder[0], sectionTaxRates)
                          : DEFAULT_SECTION_TAX_RATES;
                        const payload = { 
                          project_id: projectId, 
                          markup, 
                          pst_rate: mirrorRates.pstRate,
                          gst_rate: mirrorRates.gstRate,
                          profit_rate: profitRate,
                          section_order: sectionOrder,
                          section_names: sectionNames,
                          section_tax_rates: sectionTaxRates,
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
                            pst: it.pst,
                            gst: it.gst,
                            product_image: it.product_image,
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
                            labour_journey_type: it.labour_journey_type,
                            labour_days: it.labour_days,
                            labour_hours_per_day: it.labour_hours_per_day,
                            labour_price_unit: it.labour_price_unit,
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
                      // Open PDF in new tab automatically for preview instead of auto-download
                      window.open(url, '_blank');
                      // Note: Don't revoke URL immediately - let it stay open for the user to view/download
                      // The browser will handle cleanup when the tab is closed
                      
                      toast.success('PDF generated and opened in new tab');
                    }catch(_e){
                      toast.error('Failed to generate PDF');
                    }finally{
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading || items.length === 0}
                  className="px-3 py-1.5 text-sm rounded-lg bg-gray-400 hover:bg-gray-500 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {isLoading ? 'Generating...' : 'Generate PDF'}
                </button>
                )}
              </div>
              
              {/* Right: Save */}
              {canEdit ? (
                <div className="flex items-center gap-1.5">
                  {designSystem ? (
                    <AppButton
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={!dirty}
                      onClick={handleManualSave}
                    >
                      Save
                    </AppButton>
                  ) : (
                  <button 
                    disabled={!dirty} 
                    onClick={handleManualSave}
                    className={`px-4 py-1.5 text-sm rounded-lg text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm ${
                      dirty 
                        ? 'bg-gradient-to-r from-brand-red to-[#ee2b2b] hover:from-red-700 hover:to-red-800' 
                        : 'bg-gray-400 hover:bg-gray-500'
                    }`}>
                    Save
                  </button>
                  )}
                </div>
              ) : (
                <div className="w-0"></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default EstimateBuilder;

function SummaryModal({ open, onClose, items, pstRate, gstRate, markup, profitRate, sectionNames, sectionOrder, sectionTaxRates, projectId, designSystem }: { open:boolean, onClose:()=>void, items:Item[], pstRate:number, gstRate:number, markup:number, profitRate:number, sectionNames:Record<string, string>, sectionOrder:string[], sectionTaxRates: Record<string, SectionTaxRates>, projectId?:string, designSystem?: boolean }){
  // Load financial totals for Additional Income/Expense
  const { data: financialTotals } = useQuery({
    queryKey: ['projectFinancialTotals', projectId],
    queryFn: () => projectId ? api<any>('GET', `/projects/${projectId}/financial-totals`) : Promise.resolve({ additional_income: 0, additional_expense: 0 }),
    enabled: !!projectId && !!open
  });
  
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

  // Line total (no markup)
  const calculateItemTotalWithMarkup = (it: Item): number => {
    if (it.item_type === 'product') {
      return calculateProductLineTotal(it);
    }
    return calculateItemTotal(it);
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
  }, [items]);

  const totalCost = useMemo(() => Object.values(costsBySection).reduce((acc: number, val: number) => acc + val, 0), [costsBySection]);
  
  // Calculate labor, materials, sub-contractors, shop totals
  const laborTotal = useMemo(() => {
    return items.filter(it => it.item_type === 'labour').reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items]);

  const materialTotal = useMemo(() => {
    return items.filter(it => !['labour'].includes(it.item_type || '')).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items]);

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
  }, [items]);

  // Calculate subcontractor total (all items in subcontractor sections)
  const subcontractorItemsTotal = useMemo(() => {
    return items.filter(it => {
      const section = it.section || 'Miscellaneous';
      return section === 'Sub-Contractors' || section.startsWith('Sub-Contractor Section');
    }).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items]);

  // Calculate shop total (all items in shop sections)
  const shopItemsTotal = useMemo(() => {
    return items.filter(it => {
      const section = it.section || 'Miscellaneous';
      return section === 'Shop' || section.startsWith('Shop Section');
    }).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items]);

  // Calculate miscellaneous total (all items in miscellaneous sections)
  const miscellaneousItemsTotal = useMemo(() => {
    return items.filter(it => {
      const section = it.section || 'Miscellaneous';
      return section === 'Miscellaneous' || section.startsWith('Miscellaneous Section');
    }).reduce((acc, it) => acc + calculateItemTotalWithMarkup(it), 0);
  }, [items]);

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
  
  const groupedItems = useMemo(() => {
    const groups: Record<string, Item[]> = {};
    items.forEach((it) => {
      const section = it.section || 'Miscellaneous';
      if (!groups[section]) groups[section] = [];
      groups[section].push(it);
    });
    return groups;
  }, [items]);

  const { pst, gst } = useMemo(() => {
    let totalPst = 0;
    let totalGst = 0;
    const sections = new Set([...sectionOrder, ...Object.keys(groupedItems)]);
    for (const section of sections) {
      const sectionItems = groupedItems[section] || [];
      if (sectionItems.length === 0) continue;
      const rates = getSectionTaxRates(section, sectionTaxRates);
      const tax = calculateSectionTaxTotals(sectionItems, rates);
      totalPst += tax.pst;
      totalGst += tax.gst;
    }
    return { pst: totalPst, gst: totalGst };
  }, [sectionOrder, groupedItems, sectionTaxRates]);

  const subtotal = useMemo(() => totalCost + pst, [totalCost, pst]);
  
  const profitValue = useMemo(() => subtotal * (profitRate/100), [subtotal, profitRate]);
  const totalEstimate = useMemo(() => subtotal + profitValue, [subtotal, profitValue]);
  const finalTotal = useMemo(() => totalEstimate + gst, [totalEstimate, gst]);

  if (!open) return null;

  if (designSystem) {
    const summaryAnalysisHeader = 'bg-gray-500 px-4 py-3 text-xs font-semibold text-white';
    const costBreakdownRows = Object.keys(costsBySection).sort().map((section) => {
      const sectionTotal = costsBySection[section];
      const percentage = totalCost > 0 ? (sectionTotal / totalCost * 100) : 0;
      return [
        getSectionDisplayName(section),
        <span key={`${section}-total`} className="block text-right">${sectionTotal.toFixed(2)}</span>,
        <span key={`${section}-pct`} className="block text-right">{percentage.toFixed(2)}%</span>,
      ];
    });

    return (
      <AppFormModal
        open={open}
        onClose={onClose}
        title="Summary and Analysis"
        layout="detail"
        size="lg"
        dialogClassName="!max-w-[800px]"
        dialogClassNameExpanded="!max-w-[calc(50rem+16rem)]"
        quickInfo={estimateSummaryQuickInfo}
      >
        <div className="space-y-6">
          <div className={estimateSummaryShell}>
            <div className={summaryAnalysisHeader}>Cost Breakdown by Section</div>
            <AppTable
              columns={['Section', 'Total', '% of Total']}
              rows={costBreakdownRows}
              className="!rounded-none !border-0"
            />
            <div className={uiCx(uiColors.surfaceSubtle, 'grid grid-cols-3 gap-2 border-t border-gray-200 px-2.5 py-2 text-xs font-semibold')}>
              <span>Total</span>
              <span className="text-right">${totalCost.toFixed(2)}</span>
              <span className="text-right">100.00%</span>
            </div>
          </div>

          {laborTotal > 0 && (
            <div className={estimateSummaryShell}>
              <div className={summaryAnalysisHeader}>Labor Analysis</div>
              <div className="border-b border-gray-100 bg-blue-50 px-4 py-2 text-xs">Total Labor Cost: ${laborTotal.toFixed(2)}</div>
              <AppTable
                columns={['Labor Item', 'Cost']}
                rows={items.filter(it => it.item_type === 'labour').map((it) => {
                  const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                  return [it.description || it.name, <span key={it.description || it.name} className="block text-right">${itemTotalWithMarkup.toFixed(2)}</span>];
                })}
                className="!rounded-none !border-0"
              />
            </div>
          )}

          {productTotal > 0 && (
            <div className={estimateSummaryShell}>
              <div className={summaryAnalysisHeader}>Product Analysis</div>
              <div className="border-b border-gray-100 bg-blue-50 px-4 py-2 text-xs">Total Product Cost: ${productTotal.toFixed(2)}</div>
              <AppTable
                columns={['Product Item', 'Cost']}
                rows={items.filter(it => {
                  const section = it.section || 'Miscellaneous';
                  return !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) &&
                         !section.startsWith('Labour Section') &&
                         !section.startsWith('Sub-Contractor Section') &&
                         !section.startsWith('Shop Section') &&
                         !section.startsWith('Miscellaneous Section');
                }).map((it) => {
                  const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                  return [it.description || it.name, <span key={it.description || it.name} className="block text-right">${itemTotalWithMarkup.toFixed(2)}</span>];
                })}
                className="!rounded-none !border-0"
              />
            </div>
          )}

          {subcontractorItemsTotal > 0 && (
            <div className={estimateSummaryShell}>
              <div className={summaryAnalysisHeader}>Sub-Contractor Analysis</div>
              <div className="border-b border-gray-100 bg-blue-50 px-4 py-2 text-xs">Total Sub-Contractor Cost: ${subcontractorItemsTotal.toFixed(2)}</div>
              <AppTable
                columns={['Sub-Contractor Item', 'Cost']}
                rows={items.filter(it => {
                  const section = it.section || 'Miscellaneous';
                  return section === 'Sub-Contractors' || section.startsWith('Sub-Contractor Section');
                }).map((it) => {
                  const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                  return [it.description || it.name, <span key={it.description || it.name} className="block text-right">${itemTotalWithMarkup.toFixed(2)}</span>];
                })}
                className="!rounded-none !border-0"
              />
            </div>
          )}

          {shopItemsTotal > 0 && (
            <div className={estimateSummaryShell}>
              <div className={summaryAnalysisHeader}>Shop Analysis</div>
              <div className="border-b border-gray-100 bg-blue-50 px-4 py-2 text-xs">Total Shop Cost: ${shopItemsTotal.toFixed(2)}</div>
              <AppTable
                columns={['Shop Item', 'Cost']}
                rows={items.filter(it => {
                  const section = it.section || 'Miscellaneous';
                  return section === 'Shop' || section.startsWith('Shop Section');
                }).map((it) => {
                  const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                  return [it.description || it.name, <span key={it.description || it.name} className="block text-right">${itemTotalWithMarkup.toFixed(2)}</span>];
                })}
                className="!rounded-none !border-0"
              />
            </div>
          )}

          {miscellaneousItemsTotal > 0 && (
            <div className={estimateSummaryShell}>
              <div className={summaryAnalysisHeader}>Miscellaneous Analysis</div>
              <div className="border-b border-gray-100 bg-blue-50 px-4 py-2 text-xs">Total Miscellaneous Cost: ${miscellaneousItemsTotal.toFixed(2)}</div>
              <AppTable
                columns={['Miscellaneous Item', 'Cost']}
                rows={items.filter(it => {
                  const section = it.section || 'Miscellaneous';
                  return section === 'Miscellaneous' || section.startsWith('Miscellaneous Section');
                }).map((it) => {
                  const itemTotalWithMarkup = calculateItemTotalWithMarkup(it);
                  return [it.description || it.name, <span key={it.description || it.name} className="block text-right">${itemTotalWithMarkup.toFixed(2)}</span>];
                })}
                className="!rounded-none !border-0"
              />
            </div>
          )}

          <div className={estimateSummaryShell}>
            <div className={summaryAnalysisHeader}>Final Summary</div>
            <div className="space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between"><span>Total Direct Costs:</span><span className="font-medium">${totalCost.toFixed(2)}</span></div>
              <div className="flex items-center justify-between border-t pt-2"><span>Total PST:</span><span className="font-medium">${pst.toFixed(2)}</span></div>
              <div className="flex items-center justify-between">
                <span>Profit (%):</span>
                <span className="font-medium">{profitRate.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between"><span>Total Profit:</span><span className="font-medium">${profitValue.toFixed(2)}</span></div>
              <div className="flex items-center justify-between"><span>Total Estimate:</span><span className="font-medium">${totalEstimate.toFixed(2)}</span></div>
              <div className="flex items-center justify-between"><span>GST:</span><span className="font-medium">${gst.toFixed(2)}</span></div>
              {(() => {
                const additionalIncome = financialTotals?.additional_income || 0;
                const additionalExpense = financialTotals?.additional_expense || 0;
                if (additionalIncome > 0 || additionalExpense > 0) {
                  return (
                    <>
                      {additionalIncome > 0 && (
                        <div className="flex items-center justify-between"><span>Additional Income:</span><span className="font-medium">${additionalIncome.toFixed(2)}</span></div>
                      )}
                      {additionalExpense > 0 && (
                        <div className="flex items-center justify-between"><span>Additional Expense:</span><span className="font-medium">${additionalExpense.toFixed(2)}</span></div>
                      )}
                    </>
                  );
                }
                return null;
              })()}
              <div className="flex items-center justify-between border-t pt-2 text-lg font-semibold"><span>Grand Total:</span><span>${(finalTotal + (financialTotals?.additional_income || 0) - (financialTotals?.additional_expense || 0)).toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
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
              <div className="flex items-center justify-between">
                <span>Profit (%):</span>
                <span className="font-medium">{profitRate.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between"><span>Total Profit:</span><span className="font-medium">${profitValue.toFixed(2)}</span></div>
              <div className="flex items-center justify-between"><span>Total Estimate:</span><span className="font-medium">${totalEstimate.toFixed(2)}</span></div>
                  <div className="flex items-center justify-between"><span>GST:</span><span className="font-medium">${gst.toFixed(2)}</span></div>
                  {(() => {
                    const additionalIncome = financialTotals?.additional_income || 0;
                    const additionalExpense = financialTotals?.additional_expense || 0;
                    if (additionalIncome > 0 || additionalExpense > 0) {
                      return (
                        <>
                          {additionalIncome > 0 && (
                            <div className="flex items-center justify-between"><span>Additional Income:</span><span className="font-medium">${additionalIncome.toFixed(2)}</span></div>
                          )}
                          {additionalExpense > 0 && (
                            <div className="flex items-center justify-between"><span>Additional Expense:</span><span className="font-medium">${additionalExpense.toFixed(2)}</span></div>
                          )}
                        </>
                      );
                    }
                    return null;
                  })()}
                  <div className="flex items-center justify-between font-semibold text-lg border-t pt-2"><span>Grand Total:</span><span className="font-semibold">${(finalTotal + (financialTotals?.additional_income || 0) - (financialTotals?.additional_expense || 0)).toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

function ProductViewModal({ product, onClose, designSystem }: { product: Material, onClose: () => void, designSystem?: boolean }){
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (designSystem) {
    return (
      <AppFormModal
        open={true}
        onClose={onClose}
        title={product.name}
        layout="detail"
        size="lg"
        dialogClassName="!max-w-[900px]"
        dialogClassNameExpanded="!max-w-[calc(56rem+16rem)]"
        quickInfo={estimateProductViewQuickInfo}
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={uiCx('h-24 w-24 overflow-hidden rounded-xl border bg-white', uiBorders.subtle)}>
              <img
                src={product.image_base64 || '/ui/assets/login/logo-light.svg'}
                className="h-full w-full object-cover"
                alt={product.name}
              />
            </div>
            <div className="space-y-1 text-sm text-gray-600">
              {product.supplier_name ? <div>Supplier: {product.supplier_name}</div> : null}
              {product.category ? <div>Category: {product.category}</div> : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
              {product.unit && (
                <div className={uiCx('rounded-lg border p-4', uiBorders.subtle, uiColors.surface)}>
                  <div className="mb-1 text-xs font-semibold text-gray-600">Sell Unit</div>
                  <div className="text-gray-900">{product.unit}</div>
                </div>
              )}
              {product.unit_type && (
                <div className={uiCx('rounded-lg border p-4', uiBorders.subtle, uiColors.surface)}>
                  <div className="mb-1 text-xs font-semibold text-gray-600">Unit Type</div>
                  <div className="text-gray-900">{product.unit_type}</div>
                </div>
              )}
            </div>
            {typeof product.price === 'number' && (
              <div className={uiCx('rounded-lg border p-4', uiBorders.subtle, uiColors.surface)}>
                <div className="mb-1 text-xs font-semibold text-gray-600">Price</div>
                <div className="text-lg font-semibold text-gray-900">${product.price.toFixed(2)}</div>
              </div>
            )}
            {product.units_per_package && (
              <div className={uiCx('rounded-lg border p-4', uiBorders.subtle, uiColors.surface)}>
                <div className="mb-1 text-xs font-semibold text-gray-600">Units per Package</div>
                <div className="text-gray-900">{product.units_per_package}</div>
              </div>
            )}
            {(product.coverage_sqs || product.coverage_ft2 || product.coverage_m2) && (
              <div className={uiCx('rounded-lg border p-4', uiBorders.subtle, uiColors.surface)}>
                <div className="mb-3 text-sm font-semibold text-gray-900">Coverage Area</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-gray-700">SQS: {product.coverage_sqs || '-'}</div>
                  <div className="text-gray-700">ft²: {product.coverage_ft2 || '-'}</div>
                  <div className="text-gray-700">m²: {product.coverage_m2 || '-'}</div>
                </div>
              </div>
            )}
            {product.description && (
              <div className={uiCx('rounded-lg border p-4', uiBorders.subtle, uiColors.surface)}>
                <div className="mb-2 text-sm font-semibold text-gray-900">Description</div>
                <div className="whitespace-pre-wrap text-gray-700">{product.description}</div>
              </div>
            )}
        </div>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
        {/* Product Header */}
        <div className="flex-shrink-0 bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative">
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
        <div className="flex-1 overflow-y-auto">
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
                  <div className="text-gray-700">SQS: {product.coverage_sqs || '-'}</div>
                  <div className="text-gray-700">ft²: {product.coverage_ft2 || '-'}</div>
                  <div className="text-gray-700">m²: {product.coverage_m2 || '-'}</div>
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
    </div></OverlayPortal>
  );
}

function AddProductModal({ onAdd, disabled, open: openProp, onClose: onCloseProp, section: sectionProp, designSystem }: { onAdd:(it: Item)=>void, disabled?: boolean, open?: boolean, onClose?: ()=>void, section?: string, designSystem?: boolean }){
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = onCloseProp ? (val: boolean) => { if (!val && onCloseProp) onCloseProp(); if (openProp === undefined) setInternalOpen(val); } : setInternalOpen;
  const [q, setQ] = useState('');
  const [section, setSection] = useState(sectionProp || 'Roof System');
  const [selection, setSelection] = useState<Material|null>(null);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [newProductModalOpen, setNewProductModalOpen] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(5);
  const { data: initialProducts, isLoading: isLoadingInitial } = useQuery({
    queryKey: ['all-products'],
    queryFn: async () => await api<Material[]>('GET', '/estimate/products'),
    enabled: open,
  });
  const { data: searchResults, isLoading: isLoadingSearch } = useQuery({ 
    queryKey:['mat-search', q], 
    queryFn: async()=>{
      if (!q.trim()) return [];
      const params = new URLSearchParams(); 
      params.set('q', q);
      return await api<Material[]>('GET', `/estimate/products/search?${params.toString()}`);
    },
    enabled: !!q.trim() && open
  });
  const isSearching = !!q.trim();
  const allResults = isSearching ? (searchResults || []) : (initialProducts || []);
  const isLoading = isSearching ? isLoadingSearch : isLoadingInitial;
  const productComboboxOptions = useMemo(
    () =>
      allResults.map((p) => ({
        value: String(p.id),
        label: p.name,
        description: [p.supplier_name, p.unit, typeof p.price === 'number' ? `$${p.price.toFixed(2)}` : '']
          .filter(Boolean)
          .join(' · '),
      })),
    [allResults],
  );
  const list = allResults.slice(0, displayedCount);
  const hasMore = allResults.length > displayedCount;
  const hasNoResults = q.trim().length >= 2 && !isLoading && allResults.length === 0;

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

  const handleAddProductItem = () => {
    if(!selection){ toast.error('Select a product first'); return; }
    const imageBase64 = selection.image_base64
      ? (selection.image_base64.startsWith('data:') ? selection.image_base64 : `data:image/jpeg;base64,${selection.image_base64}`)
      : undefined;
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
      product_image: imageBase64,
      pst: false,
      gst: false,
    });
    setOpen(false);
    resetForm();
  };

  if (designSystem) {
    return (
      <>
        {openProp === undefined && (
          <AppButton type="button" variant="secondary" size="sm" onClick={()=>setOpen(true)} disabled={disabled}>+ Add Product</AppButton>
        )}
        <AppFormModal
          open={open}
          onClose={() => { setOpen(false); resetForm(); }}
          title="Add Product"
          formWidth="comfortable"
          quickInfo={estimateAddProductQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => { setOpen(false); resetForm(); }}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={handleAddProductItem}>
                Add Item
              </AppButton>
            </div>
          }
        >
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <AppCombobox
                  label="Product *"
                  placeholder="Search by name, supplier, or unit…"
                  fieldHint="Product\n\nSearch the product catalog by name, supplier, or unit."
                  options={productComboboxOptions}
                  value={selection ? String(selection.id) : ''}
                  onChange={(productId) => {
                    if (!productId) {
                      setSelection(null);
                      return;
                    }
                    const product = allResults.find((p) => String(p.id) === productId);
                    if (product) setSelection(product);
                  }}
                  onInputChange={(text) => {
                    setQ(text);
                    if (!text.trim()) setSelection(null);
                  }}
                  emptyMessage={
                    isLoading
                      ? isSearching
                        ? 'Searching…'
                        : 'Loading products…'
                      : hasNoResults
                        ? `No products found matching "${q}"`
                        : isSearching
                          ? 'No matches. Try another search.'
                          : 'No products in catalog.'
                  }
                />
              </div>
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
            {selection && !sectionProp && (
              <AppSelect
                label="Section"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                options={[
                  { value: 'Roof System', label: 'Roof System' },
                  { value: 'Wood Blocking / Accessories', label: 'Wood Blocking / Accessories' },
                  { value: 'Flashing', label: 'Flashing' },
                ]}
              />
            )}
          </div>
        </AppFormModal>
        {supplierModalOpen && (
          <SupplierProductModal
            open={supplierModalOpen}
            onClose={() => setSupplierModalOpen(false)}
            designSystem={designSystem}
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
            designSystem={designSystem}
            onSelect={(product) => {
              setSelection(product);
              setCompareModalOpen(false);
            }}
          />
        )}
        {newProductModalOpen && (
          <NewProductModal
            open={true}
            onClose={() => setNewProductModalOpen(false)}
            initialSupplier={''}
            initialName={q.trim()}
            queryClient={queryClient}
            designSystem={designSystem}
            onProductCreated={(product: Material) => {
              setSelection(product);
              setNewProductModalOpen(false);
              setQ(product.name);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Product</button>
      )}
      {open && (
        <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
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
                  const legacyImageBase64 = selection.image_base64
                    ? (selection.image_base64.startsWith('data:') ? selection.image_base64 : `data:image/jpeg;base64,${selection.image_base64}`)
                    : undefined;
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
                    product_image: legacyImageBase64,
                    pst: false,
                    gst: false,
                  });
                  setOpen(false);
                  resetForm();
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Item</button>
              </div>
            </div>
          </div>
        </div></OverlayPortal>
      )}
      {supplierModalOpen && (
        <SupplierProductModal
          open={supplierModalOpen}
          onClose={() => setSupplierModalOpen(false)}
          designSystem={designSystem}
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
          designSystem={designSystem}
          onSelect={(product) => {
            setSelection(product);
            setCompareModalOpen(false);
          }}
        />
      )}
      {newProductModalOpen && (
        <NewProductModal
          open={true}
          onClose={() => setNewProductModalOpen(false)}
          initialSupplier={''}
          initialName={q.trim()}
          queryClient={queryClient}
          designSystem={designSystem}
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

function SupplierProductModal({ open, onClose, onSelect, designSystem }: { open: boolean, onClose: ()=>void, onSelect: (product: Material)=>void, designSystem?: boolean }){
  const queryClient = useQueryClient();
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [displayedProductCount, setDisplayedProductCount] = useState(20);
  const [newProductModalOpen, setNewProductModalOpen] = useState(false);
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

  const supplierBrowserLegacy = (
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
  );

  const supplierBrowserDs = (
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

  if (designSystem) {
    return (
      <>
        <AppFormModal
          open={open}
          onClose={onClose}
          title="Browse Products by Supplier"
          layout="detail"
          size="lg"
          dialogClassName="!max-w-3xl"
          dialogClassNameExpanded="!max-w-[calc(48rem+16rem)]"
          bodyClassName="!p-0"
          overlayClassName={uiModalLayer.stacked}
          quickInfo={estimateBrowseProductsBySupplierQuickInfo}
        >
          {supplierBrowserDs}
        </AppFormModal>
      {newProductModalOpen && selectedSupplier && (
        <NewProductModal
          open={true}
          onClose={() => setNewProductModalOpen(false)}
          initialSupplier={suppliers?.find(s => s.id === selectedSupplier)?.name || ''}
          queryClient={queryClient}
          designSystem={designSystem}
          onProductCreated={(product: Material) => {
            onSelect(product);
            setNewProductModalOpen(false);
          }}
        />
      )}
      </>
    );
  }

  return (
    <OverlayPortal><div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="w-[1000px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Browse Products by Supplier</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        {supplierBrowserLegacy}
      </div>
      {newProductModalOpen && selectedSupplier && (
        <NewProductModal
          open={true}
          onClose={() => setNewProductModalOpen(false)}
          initialSupplier={suppliers?.find(s => s.id === selectedSupplier)?.name || ''}
          queryClient={queryClient}
          designSystem={designSystem}
          onProductCreated={(product: Material) => {
            onSelect(product);
            setNewProductModalOpen(false);
          }}
        />
      )}
    </div></OverlayPortal>
  );
}

function CompareProductsModal({ open, onClose, selectedProduct, onSelect, designSystem }: { open: boolean, onClose: ()=>void, selectedProduct: Material, onSelect: (product: Material)=>void, designSystem?: boolean }){
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

  if (designSystem) {
    return (
      <AppFormModal
        open={open}
        onClose={onClose}
        title="Compare Products"
        layout="detail"
        size="md"
        overlayClassName={uiModalLayer.stacked}
        quickInfo={estimateCompareProductsQuickInfo}
      >
        <div className="space-y-3">
          <div className={uiCx('rounded border bg-gray-50 p-3', uiBorders.subtle)}>
            <div className="mb-2 font-medium">Selected: {selectedProduct.name}</div>
            <div className={uiTypography.helper}>
              ${Number(selectedProduct.price || 0).toFixed(2)} · {selectedProduct.supplier_name || 'N/A'}
            </div>
          </div>
          {(relatedProducts || []).length > 0 && (
            <div className="space-y-2">
              <div className={uiTypography.sectionTitle}>Related Products ({relatedProducts?.length || 0})</div>
              <div className={uiCx('max-h-64 divide-y overflow-auto rounded border', uiBorders.subtle)}>
                {(relatedProducts || []).map((p) => (
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
          {(!relatedProducts || relatedProducts.length === 0) && (
            <div className={uiCx('py-6 text-center', uiTypography.helper)}>
              No related products found. Add related products in the Products page.
            </div>
          )}
        </div>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="w-[900px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Compare Products</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
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
                  <img 
                    src="/ui/assets/image placeholders/no_image.png" 
                    alt="No image"
                    className={`w-full h-32 object-contain rounded ${selectedProduct.image_base64 ? 'hidden image-placeholder' : ''}`}
                  />
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
                        <img 
                          src="/ui/assets/image placeholders/no_image.png" 
                          alt="No image"
                          className={`w-full h-24 object-contain rounded ${product.image_base64 ? 'hidden image-placeholder' : ''}`}
                        />
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
    </div></OverlayPortal>
  );
}

// New Product Modal for EstimateBuilder
function NewProductModal({ open, onClose, onProductCreated, initialSupplier, initialName, queryClient, designSystem }: { open: boolean, onClose: () => void, onProductCreated: (product: Material) => void, initialSupplier?: string, initialName?: string, queryClient: any, designSystem?: boolean }) {
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

  const { data: supplierOptions } = useQuery({ queryKey:['invSuppliersOptions'], queryFn: ()=> api<any[]>('GET','/inventory/suppliers') });
  
  // Check for duplicate products (same name and supplier)
  const { data: existingProducts, isLoading: checkingDuplicate } = useQuery({
    queryKey: ['product-duplicate-check', name.trim(), newSupplier],
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

  const supplierComboboxOptions = (supplierOptions || []).map((s: any) => ({
    value: s.name,
    label: s.name,
  }));

  const handleCreateProduct = async () => {
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
            p.supplier_name?.toLowerCase().trim() === newSupplier.toLowerCase().trim()
        );
        if (duplicate) {
          setDuplicateError(true);
          toast.error(`A product with the name "${name.trim()}" already exists for supplier "${newSupplier}". Please use a different name or select a different supplier.`);
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
      queryClient.invalidateQueries({ queryKey: ['mat-search'] });
      queryClient.invalidateQueries({ queryKey: ['all-products'] });
      onProductCreated(created);
    } catch (_e) {
      toast.error('Failed to create product');
    } finally {
      setIsSavingProduct(false);
    }
  };

  if (designSystem) {
    return (
      <>
        <AppFormModal
          open={open}
          onClose={onClose}
          title="New Product"
          formWidth="comfortable"
          overlayClassName={uiModalLayer.stacked}
          quickInfo={estimateNewProductQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSavingProduct}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={handleCreateProduct} disabled={isSavingProduct} loading={isSavingProduct}>
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
              <div className="mt-1.5 space-y-2">
                <AppCombobox
                  value={newSupplier}
                  onChange={(value) => {
                    setNewSupplier(value);
                    if (supplierError) setSupplierError(false);
                    if (duplicateError) setDuplicateError(false);
                  }}
                  options={supplierComboboxOptions}
                  placeholder="Select a supplier"
                />
                <AppButton type="button" variant="secondary" size="sm" className="w-full" onClick={() => setNewSupplierModalOpen(true)}>
                  + Create New Supplier
                </AppButton>
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
              <AppSelect
                label="Unit Type"
                value={unitType}
                options={[
                  { value: 'unitary', label: 'Unitary' },
                  { value: 'multiple', label: 'Multiple' },
                  { value: 'coverage', label: 'Coverage' },
                ]}
                onChange={(e) => {
                  const next = e.target.value as 'unitary' | 'multiple' | 'coverage';
                  setUnitType(next);
                  if (next === 'unitary') {
                    setUnitsPerPackage('');
                    setCovSqs('');
                    setCovFt2('');
                    setCovM2('');
                  } else if (next === 'multiple') {
                    setCovSqs('');
                    setCovFt2('');
                    setCovM2('');
                  } else {
                    setUnitsPerPackage('');
                  }
                }}
              />
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
              queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions'] });
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      <OverlayPortal><div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
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
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type-estimate" checked={unitType==='unitary'} onChange={()=>{ setUnitType('unitary'); setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Unitary</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type-estimate" checked={unitType==='multiple'} onChange={()=>{ setUnitType('multiple'); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Multiple</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type-estimate" checked={unitType==='coverage'} onChange={()=>{ setUnitType('coverage'); setUnitsPerPackage(''); }} /> Coverage</label>
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
                  // Invalidate product caches
                  queryClient.invalidateQueries({ queryKey: ['mat-search'] });
                  queryClient.invalidateQueries({ queryKey: ['all-products'] });
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
      </div></OverlayPortal>
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
            queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions'] });
          }}
        />
      )}
    </>
  );
}


function AddLabourModal({ onAdd, disabled, open: openProp, onClose: onCloseProp, section: sectionProp, designSystem }: { onAdd:(it: Item)=>void, disabled?: boolean, open?: boolean, onClose?: ()=>void, section?: string, designSystem?: boolean }){
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = onCloseProp ? (val: boolean) => { if (!val && onCloseProp) onCloseProp(); if (openProp === undefined) setInternalOpen(val); } : setInternalOpen;
  const [labour, setLabour] = useState('');
  const [men, setMen] = useState<string>('1');
  /** UI mode: time-based (days + hours/day + price basis) or contract */
  const [mode, setMode] = useState<'time'|'contract'>('time');
  const [days, setDays] = useState<string>('1');
  const [hoursPerDay, setHoursPerDay] = useState<string>('8');
  const [priceUnit, setPriceUnit] = useState<'day'|'hour'>('day');
  const [contractNumber, setContractNumber] = useState<string>('1');
  const [contractUnit, setContractUnit] = useState('');
  const [price, setPrice] = useState<string>('0');

  const showContract = mode === 'contract';
  const showTime = mode === 'time';

  const total = useMemo(()=>{
    const p = Number(price||0);
    const m = Number(men||0);
    if (showContract) {
      return Number(contractNumber||0) * p;
    }
    const d = Number(days||0);
    if (priceUnit === 'hour') {
      return m * d * Number(hoursPerDay||0) * p;
    }
    return m * d * p;
  }, [men, days, hoursPerDay, contractNumber, price, mode, priceUnit]);

  const calcText = useMemo(()=>{
    const p = Number(price||0).toFixed(2);
    if (showContract) {
      return `${contractNumber} ${contractUnit || 'unit'} × $${p} = $${total.toFixed(2)}`;
    }
    if (priceUnit === 'hour') {
      return `${men} men × ${days} days × ${hoursPerDay} h/day × $${p}/h = $${total.toFixed(2)}`;
    }
    const hNote = Number(hoursPerDay||0) > 0 ? ` (${hoursPerDay} h/day)` : '';
    return `${men} men × ${days} days${hNote} × $${p}/day = $${total.toFixed(2)}`;
  }, [men, days, hoursPerDay, contractNumber, contractUnit, price, total, mode, priceUnit]);

  const priceLabel = useMemo(()=>{
    if (showContract) return 'Price ($ per unit)';
    if (priceUnit === 'hour') return 'Price per Worker ($ per hour)';
    return 'Price per Worker ($ per day)';
  }, [mode, priceUnit]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const resetForm = () => {
    setLabour('');
    setMen('1');
    setDays('1');
    setHoursPerDay('8');
    setPriceUnit('day');
    setContractNumber('1');
    setContractUnit('');
    setPrice('0');
    setMode('time');
  };

  const handleAddLabour = () => {
    if (!labour.trim()) { toast.error('Please enter a labour name'); return; }
    const priceValue = Number(price||0);
    const menNum = Number(men||0);
    const name = labour.trim();

    if (showContract) {
      const qty = Number(contractNumber||0);
      onAdd({
        name,
        unit: contractUnit || 'each',
        quantity: qty,
        unit_price: priceValue,
        section: sectionProp || 'Labour',
        description: name,
        item_type: 'labour',
        taxable: true,
        pst: false,
        gst: false,
        labour_journey: qty,
        labour_men: menNum,
        labour_journey_type: 'contract',
      });
    } else {
      const daysNum = Number(days||0);
      const hpd = Number(hoursPerDay||0);
      if (priceUnit === 'hour' && !(hpd > 0)) {
        toast.error('Hours per day is required when pricing by the hour');
        return;
      }
      if (!(daysNum > 0)) {
        toast.error('Please enter the number of days');
        return;
      }
      if (!(menNum > 0)) {
        toast.error('Please enter the number of men');
        return;
      }

      if (priceUnit === 'hour') {
        const journeyHours = daysNum * hpd;
        onAdd({
          name,
          unit: 'hours',
          quantity: menNum,
          unit_price: priceValue,
          section: sectionProp || 'Labour',
          description: name,
          item_type: 'labour',
          taxable: true,
          pst: false,
          gst: false,
          labour_journey: journeyHours,
          labour_men: menNum,
          labour_journey_type: 'hours',
          labour_days: daysNum,
          labour_hours_per_day: hpd,
          labour_price_unit: 'hour',
        });
      } else {
        onAdd({
          name,
          unit: 'days',
          quantity: menNum,
          unit_price: priceValue,
          section: sectionProp || 'Labour',
          description: name,
          item_type: 'labour',
          taxable: true,
          pst: false,
          gst: false,
          labour_journey: daysNum,
          labour_men: menNum,
          labour_journey_type: 'days',
          labour_days: daysNum,
          labour_hours_per_day: hpd > 0 ? hpd : undefined,
          labour_price_unit: 'day',
        });
      }
    }
    setOpen(false);
    resetForm();
  };

  const formFields = designSystem ? (
    <div className="space-y-3">
      <AppInput label="Labour" placeholder="Enter labour function name..." value={labour} onChange={(e)=>setLabour(e.target.value)} />
      <AppSelect
        label="Type"
        value={mode}
        options={[
          { value: 'time', label: 'Time-based' },
          { value: 'contract', label: 'Contract' },
        ]}
        onChange={(e)=>setMode(e.target.value as 'time'|'contract')}
      />
      {showTime && (
        <>
          <AppInput label="Quantity (Men)" type="number" value={men} min={1} step={1} onChange={(e)=>setMen(e.target.value)} />
          <AppInput label="Number of Days" type="number" value={days} min={0} step={0.5} onChange={(e)=>setDays(e.target.value)} />
          <AppInput
            label={priceUnit === 'hour' ? 'Hours per Day' : 'Hours per Day (optional)'}
            type="number"
            value={hoursPerDay}
            min={0}
            step={0.5}
            onChange={(e)=>setHoursPerDay(e.target.value)}
          />
          <AppSelect
            label="Price basis"
            value={priceUnit}
            options={[
              { value: 'day', label: 'Per day' },
              { value: 'hour', label: 'Per hour' },
            ]}
            onChange={(e)=>setPriceUnit(e.target.value as 'day'|'hour')}
          />
        </>
      )}
      {showContract && (
        <>
          <AppInput label="Quantity (Men)" type="number" value={men} min={1} step={1} onChange={(e)=>setMen(e.target.value)} />
          <div>
            <AppControlLabel label="Number" />
            <div className="mt-1.5 flex gap-2 items-center">
              <AppInput className="w-24" type="number" value={contractNumber} min={0} step={0.01} onChange={(e)=>setContractNumber(e.target.value)} />
              <AppInput className="flex-1" type="text" placeholder="Unit (e.g., each, sqs)" value={contractUnit} onChange={(e)=>setContractUnit(e.target.value)} />
            </div>
          </div>
        </>
      )}
      <AppInput label={priceLabel} type="number" value={price} min={0} step={0.01} onChange={(e)=>setPrice(e.target.value)} />
      <div className={uiCx('rounded p-3', uiColors.surfaceSubtle)}>
        <strong>Total Preview:</strong>
        <div className={uiCx('mt-1', uiTypography.helper)}>{calcText}</div>
      </div>
    </div>
  ) : (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-600">Labour:</label>
        <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter labour function name..." value={labour} onChange={e=>setLabour(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-gray-600">Type:</label>
        <select className="w-full border rounded px-3 py-2" value={mode} onChange={e=>setMode(e.target.value as 'time'|'contract')}>
          <option value="time">Time-based</option>
          <option value="contract">Contract</option>
        </select>
      </div>
      {showTime && (
        <>
          <div>
            <label className="text-xs text-gray-600">Quantity (Men):</label>
            <input type="number" className="w-full border rounded px-3 py-2" value={men} min={1} step={1} onChange={e=>setMen(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Number of Days:</label>
            <input type="number" className="w-full border rounded px-3 py-2" value={days} min={0} step={0.5} onChange={e=>setDays(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">{priceUnit === 'hour' ? 'Hours per Day:' : 'Hours per Day (optional):'}</label>
            <input type="number" className="w-full border rounded px-3 py-2" value={hoursPerDay} min={0} step={0.5} onChange={e=>setHoursPerDay(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Price basis:</label>
            <select className="w-full border rounded px-3 py-2" value={priceUnit} onChange={e=>setPriceUnit(e.target.value as 'day'|'hour')}>
              <option value="day">Per day</option>
              <option value="hour">Per hour</option>
            </select>
          </div>
        </>
      )}
      {showContract && (
        <>
          <div>
            <label className="text-xs text-gray-600">Quantity (Men):</label>
            <input type="number" className="w-full border rounded px-3 py-2" value={men} min={1} step={1} onChange={e=>setMen(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600">Number:</label>
            <div className="flex gap-2 items-center">
              <input type="number" className="w-24 border rounded px-3 py-2" value={contractNumber} min={0} step={0.01} onChange={e=>setContractNumber(e.target.value)} />
              <input type="text" className="flex-1 border rounded px-3 py-2" placeholder="Unit (e.g., each, sqs)" value={contractUnit} onChange={e=>setContractUnit(e.target.value)} />
            </div>
          </div>
        </>
      )}
      <div>
        <label className="text-xs text-gray-600">{priceLabel}</label>
        <input type="number" className="w-full border rounded px-3 py-2" value={price} min={0} step={0.01} onChange={e=>setPrice(e.target.value)} />
      </div>
      <div className="bg-gray-100 p-3 rounded">
        <strong>Total Preview:</strong>
        <div className="mt-1 text-sm text-gray-600">{calcText}</div>
      </div>
    </div>
  );

  if (designSystem) {
    return (
      <>
        {openProp === undefined && (
          <AppButton type="button" variant="secondary" size="sm" onClick={()=>setOpen(true)} disabled={disabled}>+ Add Labour</AppButton>
        )}
        <AppFormModal
          open={open}
          onClose={() => setOpen(false)}
          title="Add Labour"
          formWidth="comfortable"
          quickInfo={estimateAddLabourQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</AppButton>
              <AppButton type="button" size="sm" onClick={handleAddLabour}>Add Labour</AppButton>
            </div>
          }
        >
          {formFields}
        </AppFormModal>
      </>
    );
  }

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Labour</button>
      )}
      {open && (
        <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Add Labour</div>
              <button onClick={()=>setOpen(false)} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {formFields}
              <div className="text-right mt-3">
                <button onClick={handleAddLabour} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Labour</button>
              </div>
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </>
  );
}

function AddSubContractorModal({ onAdd, disabled, open: openProp, onClose: onCloseProp, section: sectionProp, designSystem }: { onAdd:(it: Item)=>void, disabled?: boolean, open?: boolean, onClose?: ()=>void, section?: string, designSystem?: boolean }){
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

  const handleAddSubContractor = () => {
    if(!type){ toast.error('Please select a sub-contractor type'); return; }
    let desc='', qty=0, unit='', totalValue=0;
    if(showDebris){
      desc = debrisDesc.trim()
        ? `Debris Cartage - ${debrisDesc.trim()}`
        : 'Debris Cartage';
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
    onAdd({ name: desc, unit, quantity: qty, unit_price: totalValue, section: sectionProp || 'Sub-Contractors', description: desc, item_type: 'subcontractor', taxable: true, pst: false, gst: false });
    setOpen(false); setType(''); setDebrisDesc(''); setDebrisSqs('0'); setDebrisSqsPerLoad('0'); setDebrisLoads('0'); setDebrisPricePerLoad('0'); setWashroomPeriod('days'); setWashroomPeriodCount('1'); setWashroomPrice('0'); setOtherDesc(''); setOtherNumber('1'); setOtherUnit(''); setOtherPrice('0');
  };

  if (designSystem) {
    return (
      <>
        {openProp === undefined && (
          <AppButton type="button" variant="secondary" size="sm" onClick={()=>setOpen(true)} disabled={disabled}>+ Add Sub-Contractor</AppButton>
        )}
        <AppFormModal
          open={open}
          onClose={() => setOpen(false)}
          title="Add Sub-Contractors"
          formWidth="comfortable"
          quickInfo={estimateAddSubContractorQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</AppButton>
              <AppButton type="button" size="sm" onClick={handleAddSubContractor}>Add Sub-Contractors</AppButton>
            </div>
          }
        >
          <div className="space-y-3">
            <AppSelect
              label="Sub-Contractor Type"
              value={type}
              placeholder="Select type..."
              options={[
                { value: '', label: 'Select type...' },
                { value: 'debris-cartage', label: 'Debris Cartage' },
                { value: 'portable-washroom', label: 'Portable Washroom' },
                { value: 'other', label: 'Other' },
              ]}
              onChange={(e)=>setType(e.target.value as any)}
            />
            {showDebris && (
              <>
                <AppInput label="Description" placeholder="Enter description..." value={debrisDesc} onChange={(e)=>setDebrisDesc(e.target.value)} />
                <AppSelect
                  label="Input Type"
                  value={debrisInputType}
                  options={[
                    { value: 'area', label: 'Insert Area (SQS) and Area per Load (SQS/Load)' },
                    { value: 'loads', label: 'Insert Number of Loads' },
                  ]}
                  onChange={(e)=>setDebrisInputType(e.target.value as any)}
                />
                {debrisInputType === 'area' && (
                  <>
                    <AppInput label="SQS" type="number" placeholder="Enter area in SQS" value={debrisSqs} min={0} step={1} onChange={(e)=>setDebrisSqs(e.target.value)} />
                    <AppInput label="SQS/Load" type="number" placeholder="Enter area per load in SQS/Load" value={debrisSqsPerLoad} min={0} step={1} onChange={(e)=>setDebrisSqsPerLoad(e.target.value)} />
                  </>
                )}
                {debrisInputType === 'loads' && (
                  <AppInput label="Number of Loads" type="number" value={debrisLoads} min={0} step={1} onChange={(e)=>setDebrisLoads(e.target.value)} />
                )}
                <AppInput label="Price per Load ($)" type="number" placeholder="Enter price per load ($)" value={debrisPricePerLoad} min={0} step={0.01} onChange={(e)=>setDebrisPricePerLoad(e.target.value)} />
              </>
            )}
            {showWashroom && (
              <>
                <AppSelect
                  label="Period"
                  value={washroomPeriod}
                  options={[
                    { value: 'days', label: 'Days' },
                    { value: 'months', label: 'Months' },
                  ]}
                  onChange={(e)=>setWashroomPeriod(e.target.value as any)}
                />
                <AppInput label={washroomPeriodLabel} type="number" value={washroomPeriodCount} min={0} step={0.5} onChange={(e)=>setWashroomPeriodCount(e.target.value)} />
                <AppInput label={washroomPriceLabel} type="number" value={washroomPrice} min={0} step={0.01} onChange={(e)=>setWashroomPrice(e.target.value)} />
              </>
            )}
            {showOther && (
              <>
                <AppInput label="Description" placeholder="Enter description..." value={otherDesc} onChange={(e)=>setOtherDesc(e.target.value)} />
                <AppInput label="Number" type="number" className="w-28" value={otherNumber} min={0} step={0.01} onChange={(e)=>setOtherNumber(e.target.value)} />
                <AppInput label="Unit" placeholder="Unit (e.g., each, sqs)" value={otherUnit} onChange={(e)=>setOtherUnit(e.target.value)} />
                <AppInput label="Price per Unit ($)" type="number" value={otherPrice} min={0} step={0.01} onChange={(e)=>setOtherPrice(e.target.value)} />
              </>
            )}
            {type && (
              <div className={uiCx('rounded p-3', uiColors.surfaceSubtle)}>
                <strong>Total Preview:</strong>
                <div className={uiCx('mt-1', uiTypography.helper)}>{calcText}</div>
              </div>
            )}
          </div>
        </AppFormModal>
      </>
    );
  }

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Sub-Contractor</button>
      )}
      {open && (
        <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[700px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Add Sub-Contractors</div>
              <button onClick={()=>setOpen(false)} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                        <input type="number" className="w-full border rounded px-3 py-2" placeholder="Enter area per load in SQS/Load" value={debrisSqsPerLoad} min={0} step={1} onChange={e=>setDebrisSqsPerLoad(e.target.value)} />
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
                    desc = debrisDesc.trim()
        ? `Debris Cartage - ${debrisDesc.trim()}`
        : 'Debris Cartage';
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
                  onAdd({ name: desc, unit, quantity: qty, unit_price: totalValue, section: sectionProp || 'Sub-Contractors', description: desc, item_type: 'subcontractor', taxable: true, pst: false, gst: false });
                  setOpen(false); setType(''); setDebrisDesc(''); setDebrisSqs('0'); setDebrisSqsPerLoad('0'); setDebrisLoads('0'); setDebrisPricePerLoad('0'); setWashroomPeriod('days'); setWashroomPeriodCount('1'); setWashroomPrice('0'); setOtherDesc(''); setOtherNumber('1'); setOtherUnit(''); setOtherPrice('0');
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Sub-Contractors</button>
              </div>
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </>
  );
}

function AddMiscellaneousModal({ onAdd, disabled, open: openProp, onClose: onCloseProp, section: sectionProp, designSystem }: { onAdd:(it: Item)=>void, disabled?: boolean, open?: boolean, onClose?: ()=>void, section?: string, designSystem?: boolean }){
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

  const handleAddMiscellaneous = () => {
    if(!name.trim()){ toast.error('Please enter a miscellaneous name/description'); return; }
    onAdd({ name, unit, quantity: Number(quantity||0), unit_price: Number(price||0), section: sectionProp || 'Miscellaneous', description: name, item_type: 'miscellaneous', taxable: true, pst: false, gst: false });
    setOpen(false); setName(''); setQuantity('1'); setUnit(''); setPrice('0');
  };

  if (designSystem) {
    return (
      <>
        {openProp === undefined && (
          <AppButton type="button" variant="secondary" size="sm" onClick={()=>setOpen(true)} disabled={disabled}>+ Add Miscellaneous</AppButton>
        )}
        <AppFormModal
          open={open}
          onClose={() => setOpen(false)}
          title="Add Miscellaneous"
          formWidth="comfortable"
          quickInfo={estimateAddMiscellaneousQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</AppButton>
              <AppButton type="button" size="sm" onClick={handleAddMiscellaneous}>Add Miscellaneous</AppButton>
            </div>
          }
        >
          <div className="space-y-3">
            <AppInput label="Name/Description" placeholder="Enter miscellaneous name or description..." value={name} onChange={(e)=>setName(e.target.value)} />
            <div>
              <AppControlLabel label="Quantity" />
              <div className="mt-1.5 flex gap-2 items-center">
                <AppInput className="w-28" type="number" value={quantity} min={0} step={0.01} onChange={(e)=>setQuantity(e.target.value)} />
                <AppInput className="flex-1" placeholder="Unit (e.g., each, sqs)" value={unit} onChange={(e)=>setUnit(e.target.value)} />
              </div>
            </div>
            <AppInput label="Price per Unit ($)" type="number" value={price} min={0} step={0.01} onChange={(e)=>setPrice(e.target.value)} />
            <div className={uiCx('rounded p-3', uiColors.surfaceSubtle)}>
              <strong>Total Preview:</strong>
              <div className={uiCx('mt-1', uiTypography.helper)}>{calcText}</div>
            </div>
          </div>
        </AppFormModal>
      </>
    );
  }

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Miscellaneous</button>
      )}
      {open && (
        <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
              <div className="font-semibold text-lg text-white">Add Miscellaneous</div>
              <button onClick={()=>setOpen(false)} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
                  onAdd({ name, unit, quantity: Number(quantity||0), unit_price: Number(price||0), section: sectionProp || 'Miscellaneous', description: name, item_type: 'miscellaneous', taxable: true, pst: false, gst: false });
                  setOpen(false); setName(''); setQuantity('1'); setUnit(''); setPrice('0');
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Miscellaneous</button>
              </div>
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </>
  );
}

function AddShopModal({ onAdd, disabled, open: openProp, onClose: onCloseProp, section: sectionProp, designSystem }: { onAdd:(it: Item)=>void, disabled?: boolean, open?: boolean, onClose?: ()=>void, section?: string, designSystem?: boolean }){
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

  const handleAddShop = () => {
    if(!name.trim()){ toast.error('Please enter a shop name/description'); return; }
    onAdd({ name, unit, quantity: Number(quantity||0), unit_price: Number(price||0), section: sectionProp || 'Shop', description: name, item_type: 'shop', taxable: true, pst: false, gst: false });
    setOpen(false); setName(''); setQuantity('1'); setUnit(''); setPrice('0');
  };

  if (designSystem) {
    return (
      <>
        {openProp === undefined && (
          <AppButton type="button" variant="secondary" size="sm" onClick={()=>setOpen(true)} disabled={disabled}>+ Add Shop</AppButton>
        )}
        <AppFormModal
          open={open}
          onClose={() => setOpen(false)}
          title="Add Shop"
          formWidth="comfortable"
          quickInfo={estimateAddShopQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</AppButton>
              <AppButton type="button" size="sm" onClick={handleAddShop}>Add Shop</AppButton>
            </div>
          }
        >
          <div className="space-y-3">
            <AppInput label="Name/Description" placeholder="Enter shop name or description..." value={name} onChange={(e)=>setName(e.target.value)} />
            <div>
              <AppControlLabel label="Quantity" />
              <div className="mt-1.5 flex gap-2 items-center">
                <AppInput className="w-28" type="number" value={quantity} min={0} step={0.01} onChange={(e)=>setQuantity(e.target.value)} />
                <AppInput className="flex-1" placeholder="Unit (e.g., each, sqs)" value={unit} onChange={(e)=>setUnit(e.target.value)} />
              </div>
            </div>
            <AppInput label="Price per Unit ($)" type="number" value={price} min={0} step={0.01} onChange={(e)=>setPrice(e.target.value)} />
            <div className={uiCx('rounded p-3', uiColors.surfaceSubtle)}>
              <strong>Total Preview:</strong>
              <div className={uiCx('mt-1', uiTypography.helper)}>{calcText}</div>
            </div>
          </div>
        </AppFormModal>
      </>
    );
  }

  return (
    <>
      {openProp === undefined && (
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100" disabled={disabled}>+ Add Shop</button>
      )}
      {open && (
        <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
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
                  onAdd({ name, unit, quantity: Number(quantity||0), unit_price: Number(price||0), section: sectionProp || 'Shop', description: name, item_type: 'shop', taxable: true, pst: false, gst: false });
                  setOpen(false); setName(''); setQuantity('1'); setUnit(''); setPrice('0');
                }} className="px-3 py-2 rounded text-white bg-gradient-to-br from-[#7f1010] to-[#a31414] hover:from-[#6d0d0d] hover:to-[#8f1111]">Add Shop</button>
              </div>
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </>
  );
}
