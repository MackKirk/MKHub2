import { useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Copy, FileText, Trash2, X } from 'lucide-react';
import {
  AppInput,
  AppSelect,
  AppTextarea,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiTypography,
} from '@/components/ui';

export const PLACEHOLDER_REQUESTER_EMAIL = 'dev@mackkirk.com';

export function isNotifiableRequesterEmail(email?: string | null) {
  const e = (email || '').trim().toLowerCase();
  return Boolean(e) && e !== PLACEHOLDER_REQUESTER_EMAIL && e.includes('@');
}

export const MAX_FILES_DEFAULT = 10;
export const MAX_ITEMS_DEFAULT = 20;

export type MetaOption = { value: string; label: string };

export type PrintRequestMeta = {
  product_types: MetaOption[];
  units: MetaOption[];
  max_artwork_mb: number;
  max_artwork_files?: number;
  max_line_items?: number;
};

export type ArtworkItem = {
  id: string;
  file: File;
  previewUrl: string | null;
};

export type PrintRequestLineItem = {
  id: string;
  productType: string;
  title: string;
  description: string;
  quantity: string;
  width: string;
  height: string;
  unit: string;
  artworkItems: ArtworkItem[];
};

export const DEFAULT_PRINT_REQUEST_META: PrintRequestMeta = {
  product_types: [
    { value: 'sign', label: 'Sign' },
    { value: 'sticker', label: 'Sticker' },
    { value: 'other', label: 'Other' },
  ],
  units: [
    { value: 'in', label: 'Inches' },
    { value: 'cm', label: 'Centimeters' },
    { value: 'ft', label: 'Feet' },
  ],
  max_artwork_mb: 15,
  max_artwork_files: MAX_FILES_DEFAULT,
  max_line_items: MAX_ITEMS_DEFAULT,
};

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);
}

function isAllowedArtwork(file: File) {
  const okType = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'].includes(file.type);
  const okExt = /\.(pdf|png|jpe?g)$/i.test(file.name);
  return okType || okExt;
}

export function newLineItem(productType = 'sign'): PrintRequestLineItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    productType,
    title: '',
    description: '',
    quantity: '1',
    width: '',
    height: '',
    unit: 'in',
    artworkItems: [],
  };
}

function cloneLineItem(source: PrintRequestLineItem): PrintRequestLineItem {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    productType: source.productType,
    title: source.title,
    description: source.description,
    quantity: source.quantity,
    width: source.width,
    height: source.height,
    unit: source.unit,
    artworkItems: source.artworkItems.map((a) => ({
      id: `${a.file.name}-${a.file.size}-${a.file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file: a.file,
      previewUrl: isImageFile(a.file) ? URL.createObjectURL(a.file) : null,
    })),
  };
}

function revokeArtwork(items: ArtworkItem[]) {
  items.forEach((a) => {
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
  });
}

function productLabel(meta: PrintRequestMeta, value: string) {
  return meta.product_types.find((o) => o.value === value)?.label || value;
}

function itemSummary(item: PrintRequestLineItem, meta: PrintRequestMeta) {
  const type = productLabel(meta, item.productType);
  const title = item.title.trim() || 'Untitled';
  const qty = item.quantity || '1';
  const size =
    item.width || item.height
      ? `${item.width || '?'}×${item.height || '?'} ${item.unit}`
      : null;
  const files = item.artworkItems.length;
  const parts = [`${type}`, title, `qty ${qty}`];
  if (size) parts.push(size);
  if (files > 0) parts.push(files === 1 ? '1 ref' : `${files} refs`);
  return parts.join(' · ');
}

export function appendLineItemsToFormData(fd: FormData, lineItems: PrintRequestLineItem[]) {
  fd.append(
    'items_json',
    JSON.stringify(
      lineItems.map((it) => ({
        product_type: it.productType,
        title: it.title.trim(),
        description: it.description.trim() || null,
        quantity: Number(it.quantity),
        width: it.width.trim() || null,
        height: it.height.trim() || null,
        unit: it.unit,
      }))
    )
  );
  lineItems.forEach((it, idx) => {
    it.artworkItems.forEach((a) => {
      fd.append(`artwork_${idx}`, a.file, a.file.name);
    });
  });
}

export function usePrintRequestLineItems() {
  const seedRef = useRef<PrintRequestLineItem | null>(null);
  if (!seedRef.current) seedRef.current = newLineItem();
  const [meta, setMeta] = useState<PrintRequestMeta>(DEFAULT_PRINT_REQUEST_META);
  const [lineItems, setLineItems] = useState<PrintRequestLineItem[]>([seedRef.current]);
  const [expandedId, setExpandedId] = useState<string | null>(seedRef.current.id);

  const maxFiles = meta.max_artwork_files || MAX_FILES_DEFAULT;
  const maxItems = meta.max_line_items || MAX_ITEMS_DEFAULT;
  const maxBytes = (meta.max_artwork_mb || 15) * 1024 * 1024;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/print-shop/public/meta', { headers: { Accept: 'application/json' } });
        if (r.ok) {
          const data = (await r.json()) as PrintRequestMeta;
          if (!cancelled) setMeta({ ...DEFAULT_PRINT_REQUEST_META, ...data });
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateLineItem(id: string, patch: Partial<PrintRequestLineItem>) {
    setLineItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function addLineItem() {
    if (lineItems.length >= maxItems) {
      toast.error(`Maximum ${maxItems} items`);
      return;
    }
    const next = newLineItem();
    setLineItems((prev) => [...prev, next]);
    setExpandedId(next.id);
  }

  function duplicateLineItem(id: string) {
    if (lineItems.length >= maxItems) {
      toast.error(`Maximum ${maxItems} items`);
      return;
    }
    const source = lineItems.find((it) => it.id === id);
    if (!source) return;
    const next = cloneLineItem(source);
    setLineItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx < 0) return [...prev, next];
      const copy = [...prev];
      copy.splice(idx + 1, 0, next);
      return copy;
    });
    setExpandedId(next.id);
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => {
      if (prev.length <= 1) {
        toast.error('At least one item is required');
        return prev;
      }
      const target = prev.find((it) => it.id === id);
      if (target) revokeArtwork(target.artworkItems);
      const next = prev.filter((it) => it.id !== id);
      setExpandedId((cur) => (cur === id ? next[0]?.id ?? null : cur));
      return next;
    });
  }

  function addArtworkToItem(itemId: string, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    setLineItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const room = maxFiles - it.artworkItems.length;
        if (room <= 0) {
          toast.error(`Maximum ${maxFiles} files per item`);
          return it;
        }
        const accepted: ArtworkItem[] = [];
        for (const file of incoming) {
          if (accepted.length >= room) {
            toast.error(`Maximum ${maxFiles} files per item`);
            break;
          }
          if (!isAllowedArtwork(file)) {
            toast.error(`${file.name}: must be PDF, PNG, or JPG`);
            continue;
          }
          if (file.size > maxBytes) {
            toast.error(`${file.name}: too large (max ${meta.max_artwork_mb || 15} MB)`);
            continue;
          }
          accepted.push({
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
            file,
            previewUrl: isImageFile(file) ? URL.createObjectURL(file) : null,
          });
        }
        return accepted.length ? { ...it, artworkItems: [...it.artworkItems, ...accepted] } : it;
      })
    );
  }

  function removeArtworkFromItem(itemId: string, artworkId: string) {
    setLineItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const nextArt: ArtworkItem[] = [];
        for (const a of it.artworkItems) {
          if (a.id === artworkId) {
            if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
          } else {
            nextArt.push(a);
          }
        }
        return { ...it, artworkItems: nextArt };
      })
    );
  }

  function resetLineItems() {
    const fresh = newLineItem();
    setLineItems((prev) => {
      prev.forEach((it) => revokeArtwork(it.artworkItems));
      return [fresh];
    });
    setExpandedId(fresh.id);
  }

  function validateLineItems(): boolean {
    for (let i = 0; i < lineItems.length; i++) {
      const it = lineItems[i];
      if (!it.title.trim()) {
        toast.error(`Title is required on item ${i + 1}`);
        setExpandedId(it.id);
        return false;
      }
      const qty = Number(it.quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        toast.error(`Quantity must be at least 1 on item ${i + 1}`);
        setExpandedId(it.id);
        return false;
      }
    }
    return true;
  }

  return {
    meta,
    lineItems,
    expandedId,
    setExpandedId,
    maxFiles,
    maxItems,
    updateLineItem,
    addLineItem,
    duplicateLineItem,
    removeLineItem,
    addArtworkToItem,
    removeArtworkFromItem,
    resetLineItems,
    validateLineItems,
  };
}

export function PrintRequestLineItemCard({
  index,
  item,
  meta,
  maxFiles,
  expanded,
  canRemove,
  canDuplicate,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
  onAddFiles,
  onRemoveFile,
}: {
  index: number;
  item: PrintRequestLineItem;
  meta: PrintRequestMeta;
  maxFiles: number;
  expanded: boolean;
  canRemove: boolean;
  canDuplicate: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PrintRequestLineItem>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (artworkId: string) => void;
}) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const incomplete = !item.title.trim();

  return (
    <div
      className={uiCx(
        'rounded-lg border overflow-hidden transition-colors',
        expanded ? 'border-gray-300 bg-white shadow-sm' : 'border-gray-200 bg-gray-50/70 hover:bg-gray-50'
      )}
    >
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={uiCx(
              'h-4 w-4 shrink-0 text-gray-500 transition-transform',
              expanded ? 'rotate-0' : '-rotate-90'
            )}
          />
          <span
            className={uiCx(
              'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
              incomplete ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'
            )}
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
            {itemSummary(item, meta)}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          disabled={!canDuplicate}
          className={uiCx(
            'shrink-0 px-3 text-gray-500 hover:bg-gray-100 hover:text-gray-800',
            !canDuplicate && 'opacity-40 pointer-events-none'
          )}
          aria-label={`Duplicate item ${index + 1}`}
          title="Duplicate item"
        >
          <Copy className="h-4 w-4" />
        </button>
        {canRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="shrink-0 px-3 text-gray-500 hover:bg-red-50 hover:text-red-700"
            aria-label={`Remove item ${index + 1}`}
            title="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-gray-200 px-3 py-3 space-y-3 bg-white">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-2">
              <AppSelect
                label="Type"
                required
                value={item.productType}
                onChange={(e) => onChange({ productType: e.target.value })}
                options={meta.product_types.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>
            <div className="sm:col-span-6">
              <AppInput
                label="Title"
                required
                value={item.title}
                onChange={(e) => onChange({ title: e.target.value })}
                placeholder="e.g. Site entrance sign"
              />
            </div>
            <div className="sm:col-span-1">
              <AppInput
                label="Qty"
                type="number"
                required
                min={1}
                value={item.quantity}
                onChange={(e) => onChange({ quantity: e.target.value })}
              />
            </div>
            <div className="sm:col-span-1">
              <AppInput
                label="W"
                type="number"
                step="any"
                value={item.width}
                onChange={(e) => onChange({ width: e.target.value })}
              />
            </div>
            <div className="sm:col-span-1">
              <AppInput
                label="H"
                type="number"
                step="any"
                value={item.height}
                onChange={(e) => onChange({ height: e.target.value })}
              />
            </div>
            <div className="sm:col-span-1">
              <AppSelect
                label="Unit"
                value={item.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
                options={meta.units.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <AppTextarea
              label="Description"
              value={item.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={3}
              placeholder="Describe what you need: colours, text/wording, shape, material, finish…"
              helperText="Include colours, written text, shape, and any other details so we can produce it even without a file."
            />

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label className={uiTypography.controlLabel} htmlFor={fileInputId}>
                  Example / art reference
                  <span className={uiCx(uiTypography.helper, 'ml-1 font-normal')}>(optional)</span>
                </label>
                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(e) => {
                    onAddFiles(e.target.files);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className={uiCx(
                    'block w-full max-w-xs text-xs',
                    uiColors.textMuted,
                    'file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:bg-gray-100 file:text-xs file:font-medium'
                  )}
                />
              </div>
              <p className={uiTypography.helper}>
                Optional mockup, photo, or sketch · PDF / PNG / JPG · up to {maxFiles} files
              </p>

              {item.artworkItems.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {item.artworkItems.map((a) => (
                    <li
                      key={a.id}
                      className={uiCx(
                        'relative h-16 w-16 shrink-0 overflow-hidden border bg-gray-50',
                        uiBorders.subtle,
                        uiRadius.control
                      )}
                      title={a.file.name}
                    >
                      {a.previewUrl ? (
                        <img src={a.previewUrl} alt={a.file.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5">
                          <FileText className="h-5 w-5 text-gray-400" />
                          <span className="text-[9px] text-gray-500">PDF</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveFile(a.id)}
                        className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-sm border border-gray-200 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Remove ${a.file.name}`}
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
