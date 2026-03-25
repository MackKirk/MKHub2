import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DivisionIcon } from '@/components/DivisionIcon';
import OverlayPortal from '@/components/OverlayPortal';

function getDivisionIcon(label: string) {
  return <DivisionIcon label={label} size={24} />;
}

function getDivisionInfoById(divisionId: string | undefined, projectDivisions: any[] | undefined): { icon: string; label: string } | null {
  if (!divisionId || !projectDivisions) return null;
  for (const div of projectDivisions || []) {
    if (String(div.id) === String(divisionId)) {
      return { icon: getDivisionIcon(div.label), label: div.label };
    }
    for (const sub of (div.subdivisions || [])) {
      if (String(sub.id) === String(divisionId)) {
        return { icon: getDivisionIcon(div.label), label: `${div.label} - ${sub.label}` };
      }
    }
  }
  return null;
}

const formatAccounting = (value: string | number): string => {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) || 0 : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseAccounting = (value: string): string => {
  if (!value) return '';
  const cleaned = value.replace(/,/g, '');
  const match = cleaned.match(/^-?\d*\.?\d*$/);
  if (!match) {
    const numMatch = cleaned.match(/^-?\d+\.?\d*/);
    return numMatch ? numMatch[0] : '';
  }
  return cleaned;
};

function DivisionSelectionModal({
  projectDivisions,
  projectDivisionIds,
  onSelect,
  onClose,
}: {
  projectDivisions: any[];
  projectDivisionIds: string[];
  onSelect: (divisionId: string) => void;
  onClose: () => void;
}) {
  const availableDivisions = useMemo(() => {
    const divisions: Array<{ id: string; label: string; icon: string }> = [];
    for (const div of projectDivisions) {
      const divId = String(div.id);
      if (projectDivisionIds.includes(divId)) {
        divisions.push({ id: divId, label: div.label, icon: getDivisionIcon(div.label) });
      }
      for (const sub of (div.subdivisions || [])) {
        const subId = String(sub.id);
        if (projectDivisionIds.includes(subId)) {
          divisions.push({ id: subId, label: `${div.label} - ${sub.label}`, icon: getDivisionIcon(div.label) });
        }
      }
    }
    return divisions;
  }, [projectDivisions, projectDivisionIds]);

  return (
    <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-slate-200 p-2.5 text-gray-900 font-semibold text-xs flex items-center justify-between">
          <span>Select Division</span>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {availableDivisions.length > 0 ? (
            <div className={`grid gap-3 ${availableDivisions.length === 1 ? 'grid-cols-1' : availableDivisions.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
              {availableDivisions.map((div) => (
                <button
                  key={div.id}
                  onClick={() => onSelect(div.id)}
                  className="flex flex-col items-center gap-2 p-3 border border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all"
                >
                  <span className="text-2xl">{div.icon}</span>
                  <span className="text-xs font-medium text-gray-900 text-center">{div.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-xs">No divisions assigned to this project.</p>
            </div>
          )}
        </div>
      </div>
    </div></OverlayPortal>
  );
}

export type PricingFormInitial = {
  additional_costs?: any[];
  optional_services?: any[];
  pst_rate?: number;
  gst_rate?: number;
  show_total_in_pdf?: boolean;
};

export default function PricingAndOptionalForm({
  projectId,
  project,
  projectDivisions,
  initial,
  disabled,
  onSave,
  onPricingItemsChange,
}: {
  projectId: string;
  project: any;
  projectDivisions: any[] | undefined;
  initial: PricingFormInitial | null | undefined;
  disabled: boolean;
  onSave: (payload: {
    additional_costs: any[];
    optional_services: any[];
    pst_rate: number;
    gst_rate: number;
    show_total_in_pdf: boolean;
    show_pst_in_pdf: boolean;
    show_gst_in_pdf: boolean;
    total: number;
  }) => Promise<void>;
  onPricingItemsChange?: (items: any[]) => void;
}) {
  const queryClient = useQueryClient();
  const [pricingItems, setPricingItems] = useState<{ name: string; price: string; quantity?: string; pst?: boolean; gst?: boolean; division_id?: string }[]>([]);
  const [optionalServices, setOptionalServices] = useState<{ service: string; price: string }[]>([]);
  const [pstRate, setPstRate] = useState(7);
  const [gstRate, setGstRate] = useState(5);
  const [showTotalInPdf, setShowTotalInPdf] = useState(true);
  const [showDivisionModal, setShowDivisionModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!initial) return;
    const d = initial;
    const dc = Array.isArray(d.additional_costs) ? d.additional_costs : [];
    const loaded = dc.map((c: any) => ({
      name: String(c.label || ''),
      price: formatAccounting(c.value ?? c.amount ?? 0),
      quantity: c.quantity || '1',
      pst: c.pst === true || c.pst === 'true' || c.pst === 1,
      gst: c.gst === true || c.gst === 'true' || c.gst === 1,
      division_id: c.division_id ? String(c.division_id) : undefined,
    }));
    setPricingItems(loaded);
    const os = Array.isArray(d.optional_services) ? d.optional_services : [];
    setOptionalServices(os.map((s: any) => ({ service: String(s.service || ''), price: formatAccounting(s.price ?? '') })));
    setShowTotalInPdf(d.show_total_in_pdf !== undefined ? Boolean(d.show_total_in_pdf) : true);
    setPstRate(d.pst_rate !== undefined && d.pst_rate !== null ? Number(d.pst_rate) : 7);
    setGstRate(d.gst_rate !== undefined && d.gst_rate !== null ? Number(d.gst_rate) : 5);
  }, [initial]);

  const totalNum = useMemo(() => {
    return pricingItems.reduce((a, c) => {
      const price = Number(parseAccounting(c.price) || '0');
      const qty = Number(c.quantity || '1');
      return a + price * qty;
    }, 0);
  }, [pricingItems]);

  const totalForPst = useMemo(() => {
    return pricingItems
      .filter((c) => c.pst === true)
      .reduce((a, c) => {
        const price = Number(parseAccounting(c.price) || '0');
        const qty = Number(c.quantity || '1');
        return a + price * qty;
      }, 0);
  }, [pricingItems]);

  const totalForGst = useMemo(() => {
    return pricingItems
      .filter((c) => c.gst === true)
      .reduce((a, c) => {
        const price = Number(parseAccounting(c.price) || '0');
        const qty = Number(c.quantity || '1');
        return a + price * qty;
      }, 0);
  }, [pricingItems]);

  const pst = useMemo(() => totalForPst * (pstRate / 100), [totalForPst, pstRate]);
  const subtotal = useMemo(() => totalNum + pst, [totalNum, pst]);
  const gst = useMemo(() => totalForGst * (gstRate / 100), [totalForGst, gstRate]);
  const grandTotal = useMemo(() => subtotal + gst, [subtotal, gst]);
  const showPstInPdf = useMemo(() => pricingItems.some((item) => item.pst === true), [pricingItems]);
  const showGstInPdf = useMemo(() => pricingItems.some((item) => item.gst === true), [pricingItems]);

  useEffect(() => {
    if (!projectId) return;
    const additionalCosts = pricingItems.map((c) => ({
      label: c.name,
      value: Number(parseAccounting(c.price) || '0'),
      quantity: c.quantity || '1',
      pst: c.pst === true,
      gst: c.gst === true,
      division_id: c.division_id || null,
    }));
    queryClient.setQueryData(['proposal-pricing-items', projectId], { data: { additional_costs: additionalCosts } });
    onPricingItemsChange?.(additionalCosts);
  }, [pricingItems, projectId, queryClient, onPricingItemsChange]);

  const handleSave = async () => {
    if (disabled || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        additional_costs: pricingItems.map((c) => ({
          label: c.name,
          value: Number(parseAccounting(c.price) || '0'),
          quantity: c.quantity || '1',
          pst: c.pst === true,
          gst: c.gst === true,
          division_id: c.division_id || null,
        })),
        optional_services: optionalServices.map((s) => ({ service: s.service, price: Number(parseAccounting(s.price) || '0') })),
        pst_rate: pstRate,
        gst_rate: gstRate,
        show_total_in_pdf: showTotalInPdf,
        show_pst_in_pdf: showPstInPdf,
        show_gst_in_pdf: showGstInPdf,
        total: grandTotal,
      });
      toast.success('Saved');
    } catch (_e) {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Pricing Block */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="bg-slate-200 p-2.5 text-gray-900 font-semibold text-xs">Pricing</div>
        <div className="p-3">
          <div className="text-[10px] text-gray-600 mb-2">Pricing items compose the project value. Add items and optional services below.</div>
          {!disabled && (
            <div className="mb-3 py-2 border-b flex flex-wrap items-center gap-3">
              <div className="text-xs font-medium text-gray-600">PST (%)</div>
              <input type="number" className="rounded-lg border border-gray-300 bg-white px-2 py-1 w-20 text-xs" value={pstRate} min={0} step={1} onChange={(e) => setPstRate(Number(e.target.value || 0))} disabled={disabled} />
              <div className="text-xs font-medium text-gray-600">GST (%)</div>
              <input type="number" className="rounded-lg border border-gray-300 bg-white px-2 py-1 w-20 text-xs" value={gstRate} min={0} step={1} onChange={(e) => setGstRate(Number(e.target.value || 0))} disabled={disabled} />
            </div>
          )}
          {disabled && (
            <div className="mb-4 flex items-center gap-4">
              <div className="text-xs font-medium text-gray-600">PST: {pstRate}%</div>
              <div className="text-xs font-medium text-gray-600">GST: {gstRate}%</div>
            </div>
          )}
          <div className="space-y-2">
            {pricingItems.map((c, i) => {
              const priceNum = parseFloat(parseAccounting(c.price || '0').replace(/,/g, '')) || 0;
              const qtyNum = parseFloat(c.quantity || '1') || 1;
              const lineTotal = priceNum * qtyNum;
              const divisionInfo = getDivisionInfoById(c.division_id, projectDivisions);
              return (
                <div key={i} className="flex flex-col sm:flex-row gap-1.5 sm:gap-2 items-stretch sm:items-center w-full min-w-0">
                  {divisionInfo && (
                    <div className="relative group/divicon flex-shrink-0">
                      <div className="text-lg w-8 h-8 flex items-center justify-center">{divisionInfo.icon}</div>
                    </div>
                  )}
                  <input
                    className={`flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs ${disabled ? 'bg-gray-100' : ''}`}
                    placeholder="Name"
                    value={c.name}
                    onChange={(e) => setPricingItems((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    disabled={disabled}
                    readOnly={disabled}
                  />
                  <input
                    type="text"
                    className="flex-1 min-w-[100px] max-w-[140px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                    placeholder="Price"
                    value={c.price}
                    onChange={(e) => setPricingItems((arr) => arr.map((x, j) => (j === i ? { ...x, price: parseAccounting(e.target.value) } : x)))}
                    onBlur={!disabled ? () => setPricingItems((arr) => arr.map((x, j) => (j === i ? { ...x, price: formatAccounting(x.price) } : x))) : undefined}
                    disabled={disabled}
                    readOnly={disabled}
                  />
                  <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden min-w-[80px] max-w-[120px]">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className={`flex-1 min-w-0 border-0 rounded-none px-2 py-1.5 text-xs appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${disabled ? 'bg-gray-100' : ''}`}
                      placeholder="Qty"
                      value={c.quantity || '1'}
                      onChange={(e) => {
                        const num = parseInt(e.target.value) || 1;
                        const finalValue = num < 1 ? '1' : String(num);
                        setPricingItems((arr) => arr.map((x, j) => (j === i ? { ...x, quantity: finalValue } : x)));
                      }}
                      disabled={disabled}
                      readOnly={disabled}
                    />
                    {!disabled && (
                      <div className="flex flex-col flex-none border-l bg-white w-6">
                        <button type="button" onClick={() => setPricingItems((arr) => arr.map((x, j) => (j === i ? { ...x, quantity: String(parseInt(c.quantity || '1') + 1) } : x)))} className="px-0.5 py-0 text-[9px] leading-tight border-b hover:bg-gray-100 flex items-center justify-center flex-1">▲</button>
                        <button type="button" onClick={() => setPricingItems((arr) => arr.map((x, j) => (j === i ? { ...x, quantity: String(Math.max(1, parseInt(c.quantity || '1') - 1)) } : x)))} className="px-0.5 py-0 text-[9px] leading-tight hover:bg-gray-100 flex items-center justify-center flex-1" disabled={parseInt(c.quantity || '1') <= 1}>▼</button>
                      </div>
                    )}
                  </div>
                  <div className={`rounded-lg border border-gray-300 px-2 py-1.5 bg-gray-50 min-w-[100px] max-w-[140px] flex-shrink-0 ${disabled ? '' : ''}`}>
                    <div className="text-xs font-medium text-gray-700 text-right">${formatAccounting(lineTotal)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <label className={`flex items-center gap-1 text-xs flex-shrink-0 ${disabled ? '' : 'cursor-pointer'}`}>
                      <input type="checkbox" checked={c.pst === true} onChange={(e) => setPricingItems((arr) => arr.map((x, j) => (j === i ? { ...x, pst: e.target.checked } : x)))} disabled={disabled} />
                      <span className="text-gray-700 whitespace-nowrap">PST</span>
                    </label>
                    <label className={`flex items-center gap-1 text-xs flex-shrink-0 ${disabled ? '' : 'cursor-pointer'}`}>
                      <input type="checkbox" checked={c.gst === true} onChange={(e) => setPricingItems((arr) => arr.map((x, j) => (j === i ? { ...x, gst: e.target.checked } : x)))} disabled={disabled} />
                      <span className="text-gray-700 whitespace-nowrap">GST</span>
                    </label>
                  </div>
                  {!disabled && (
                    <button className="p-1 rounded bg-red-100 hover:bg-red-200 flex items-center justify-center flex-shrink-0 w-7 h-7" onClick={() => setPricingItems((arr) => arr.filter((_, j) => j !== i))} title="Remove">
                      <svg className="w-4 h-4 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!disabled && (
            <button
              className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center"
              onClick={() => {
                if (projectId && project?.project_division_ids?.length > 0) {
                  setShowDivisionModal(true);
                } else {
                  setPricingItems((arr) => [...arr, { name: '', price: '', quantity: '1', pst: false, gst: false }]);
                }
              }}
            >
              <div className="text-lg text-gray-400 mr-2">+</div>
              <div className="font-medium text-xs text-gray-700">Add Pricing Item</div>
            </button>
          )}
          <div className="mt-6">
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="bg-gray-500 p-2.5 text-white font-semibold text-xs">Summary</div>
              <div className="p-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between"><span className="text-xs font-semibold">Total Direct Costs</span><span className="text-xs font-semibold">${totalNum.toFixed(2)}</span></div>
                      {showPstInPdf && pst > 0 && <div className="flex items-center justify-between"><span className="text-xs">PST ({pstRate}%)</span><span className="text-xs">${pst.toFixed(2)}</span></div>}
                      <div className="flex items-center justify-between"><span className="text-xs font-semibold">Sub-total</span><span className="text-xs font-semibold">${subtotal.toFixed(2)}</span></div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <div className="space-y-1">
                      {showGstInPdf && gst > 0 && <div className="flex items-center justify-between"><span className="text-xs">GST ({gstRate}%)</span><span className="text-xs">${gst.toFixed(2)}</span></div>}
                      <div className="flex items-center justify-between"><span className="text-xs font-semibold">Final Total (with GST)</span><span className="text-xs font-semibold">${grandTotal.toFixed(2)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="text-xs font-semibold">Total: <span className="text-gray-600">${formatAccounting(grandTotal)}</span></div>
            <label className={`flex items-center gap-1 text-xs text-gray-600 ${disabled ? '' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={showTotalInPdf} onChange={(e) => setShowTotalInPdf(e.target.checked)} disabled={disabled} />
              <span>Show Total in PDF</span>
            </label>
          </div>
        </div>
      </div>

      {/* Optional Services Block */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="bg-slate-200 p-2.5 text-gray-900 font-semibold text-xs">Optional Services</div>
        <div className="p-3">
          <div className="text-[10px] text-gray-600 mb-2">Add optional services that can be selected by the client.</div>
          <div className="space-y-2">
            {optionalServices.map((s, i) => (
              <div key={i} className="grid grid-cols-5 gap-2">
                <input className={`col-span-3 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs ${disabled ? 'bg-gray-100' : ''}`} placeholder="Service" value={s.service} onChange={(e) => setOptionalServices((arr) => arr.map((x, j) => (j === i ? { ...x, service: e.target.value } : x)))} disabled={disabled} readOnly={disabled} />
                <input type="text" className={`col-span-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs ${disabled ? 'bg-gray-100' : ''}`} placeholder="Price" value={s.price} onChange={(e) => setOptionalServices((arr) => arr.map((x, j) => (j === i ? { ...x, price: parseAccounting(e.target.value) } : x)))} onBlur={!disabled ? () => setOptionalServices((arr) => arr.map((x, j) => (j === i ? { ...x, price: formatAccounting(x.price) } : x))) : undefined} disabled={disabled} readOnly={disabled} />
                {!disabled && <button className="col-span-1 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs" onClick={() => setOptionalServices((arr) => arr.filter((_, j) => j !== i))}>Remove</button>}
              </div>
            ))}
            {!disabled && (
              <button className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center" onClick={() => setOptionalServices((arr) => [...arr, { service: '', price: '' }])}>
                <div className="text-lg text-gray-400 mr-2">+</div>
                <div className="font-medium text-xs text-gray-700">Add Service</div>
              </button>
            )}
          </div>
        </div>
      </div>

      {!disabled && (
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 rounded-lg bg-brand-red text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      {showDivisionModal && projectId && project?.project_division_ids && (
        <DivisionSelectionModal
          projectDivisions={projectDivisions || []}
          projectDivisionIds={project.project_division_ids || []}
          onSelect={(divisionId) => {
            setPricingItems((arr) => [...arr, { name: '', price: '', quantity: '1', pst: false, gst: false, division_id: divisionId }]);
            setShowDivisionModal(false);
          }}
          onClose={() => setShowDivisionModal(false)}
        />
      )}
    </div>
  );
}
