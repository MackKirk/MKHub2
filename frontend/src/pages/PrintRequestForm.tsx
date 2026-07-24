import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown, FileText, Plus, Printer, Trash2, X } from 'lucide-react';
import { formatApiErrorDetail, getToken } from '@/lib/api';
import {
  AppButton,
  AppDatePicker,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppTextarea,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const LOGO_SRC = '/ui/assets/login/logo-light.svg';
const MAX_FILES_DEFAULT = 10;
const MAX_ITEMS_DEFAULT = 20;

type MetaOption = { value: string; label: string };

type Meta = {
  product_types: MetaOption[];
  units: MetaOption[];
  max_artwork_mb: number;
  max_artwork_files?: number;
  max_line_items?: number;
};

type ArtworkItem = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type LineItem = {
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

const DEFAULT_META: Meta = {
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

function newLineItem(productType = 'sign'): LineItem {
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

function revokeArtwork(items: ArtworkItem[]) {
  items.forEach((a) => {
    if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
  });
}

function productLabel(meta: Meta, value: string) {
  return meta.product_types.find((o) => o.value === value)?.label || value;
}

function itemSummary(item: LineItem, meta: Meta) {
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
  parts.push(files === 1 ? '1 file' : `${files} files`);
  return parts.join(' · ');
}

export default function PrintRequestForm() {
  const seedRef = useRef<LineItem | null>(null);
  if (!seedRef.current) seedRef.current = newLineItem();
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([seedRef.current]);
  const [expandedId, setExpandedId] = useState<string | null>(seedRef.current.id);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);

  const maxFiles = meta.max_artwork_files || MAX_FILES_DEFAULT;
  const maxItems = meta.max_line_items || MAX_ITEMS_DEFAULT;
  const maxBytes = (meta.max_artwork_mb || 15) * 1024 * 1024;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/print-shop/public/meta', { headers: { Accept: 'application/json' } });
        if (r.ok) {
          const data = (await r.json()) as Meta;
          if (!cancelled) setMeta({ ...DEFAULT_META, ...data });
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateLineItem(id: string, patch: Partial<LineItem>) {
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

  function resetFormBody() {
    const fresh = newLineItem();
    setLineItems((prev) => {
      prev.forEach((it) => revokeArtwork(it.artworkItems));
      return [fresh];
    });
    setExpandedId(fresh.id);
    setDueDate('');
    setNotes('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (let i = 0; i < lineItems.length; i++) {
      const it = lineItems[i];
      if (!it.title.trim()) {
        toast.error(`Title is required on item ${i + 1}`);
        setExpandedId(it.id);
        return;
      }
      const qty = Number(it.quantity);
      if (!Number.isFinite(qty) || qty < 1) {
        toast.error(`Quantity must be at least 1 on item ${i + 1}`);
        setExpandedId(it.id);
        return;
      }
      if (it.artworkItems.length === 0) {
        toast.error(`Please attach artwork on item ${i + 1}`);
        setExpandedId(it.id);
        return;
      }
    }

    const fd = new FormData();
    fd.append('requester_name', requesterName.trim());
    fd.append('requester_email', requesterEmail.trim());
    if (dueDate) fd.append('due_date', dueDate);
    if (notes.trim()) fd.append('notes', notes.trim());
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

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      const r = await fetch('/print-shop/public/requests', {
        method: 'POST',
        headers,
        body: fd,
      });
      if (!r.ok) {
        let message = `HTTP ${r.status}`;
        try {
          const err = await r.json();
          message = formatApiErrorDetail(err.detail) || err.message || message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      const data = await r.json();
      resetFormBody();
      setConfirmationCode(data.request_code || 'submitted');
      toast.success('Print request submitted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmationCode) {
    return (
      <div
        className={uiCx(
          'min-h-screen flex items-center justify-center',
          uiSpacing.pageX,
          uiSpacing.pageY,
          'bg-gradient-to-b from-gray-100 to-gray-50'
        )}
      >
        <div
          className={uiCx(
            'w-full max-w-lg',
            uiSpacing.sectionStack,
            uiRadius.card,
            uiShadows.card,
            uiColors.surface,
            uiBorders.subtle,
            uiSpacing.cardPadding,
            'p-8 text-center'
          )}
        >
          <img src={LOGO_SRC} alt="MK Hub" className="h-10 mx-auto" />
          <h1 className={uiTypography.pageTitle}>Request received</h1>
          <p className={uiTypography.pageSubtitle}>
            Your print request code is{' '}
            <span className={uiCx(uiTypography.sectionTitle, uiColors.textStrong)}>{confirmationCode}</span>.
            We will email you when it is ready.
          </p>
          <div className={uiCx(uiLayout.actionsRow, 'justify-center')}>
            <AppButton
              variant="secondary"
              onClick={() => {
                setConfirmationCode(null);
                resetFormBody();
              }}
            >
              Submit another
            </AppButton>
            {getToken() ? (
              <Link to="/print-shop">
                <AppButton variant="primary">Open Print Shop</AppButton>
              </Link>
            ) : (
              <Link to="/login">
                <AppButton variant="primary">Sign in</AppButton>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={uiCx(
        'min-h-screen',
        uiSpacing.pageX,
        uiSpacing.pageY,
        'bg-gradient-to-b from-gray-100 to-gray-50'
      )}
    >
      <div className={uiCx('mx-auto w-full max-w-5xl', uiSpacing.pageStack)}>
        <AppPageHeader
          title="Print Shop Request"
          subtitle="Request one or more signs, stickers, or other printed materials."
          icon={<Printer className="h-4 w-4" />}
          actions={
            getToken() ? (
              <Link to="/home">
                <AppButton variant="ghost">Back to Hub</AppButton>
              </Link>
            ) : undefined
          }
        />

        <form
          onSubmit={onSubmit}
          className={uiCx(
            uiSpacing.sectionStack,
            uiRadius.card,
            uiShadows.card,
            uiColors.surface,
            uiBorders.subtle,
            'p-5 md:p-6'
          )}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <AppInput
              label="Your name"
              required
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              autoComplete="name"
            />
            <AppInput
              label="Email"
              type="email"
              required
              value={requesterEmail}
              onChange={(e) => setRequesterEmail(e.target.value)}
              autoComplete="email"
            />
            <AppDatePicker
              label="Desired delivery date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className={uiCx(uiLayout.actionsRow, 'justify-between items-center')}>
            <div>
              <h2 className={uiTypography.sectionTitle}>Items to print</h2>
              <p className={uiTypography.helper}>
                {lineItems.length} item{lineItems.length === 1 ? '' : 's'} — click a row to expand
              </p>
            </div>
            <AppButton type="button" variant="secondary" onClick={addLineItem}>
              <Plus className="h-4 w-4" />
              Add item
            </AppButton>
          </div>

          <div className="space-y-2">
            {lineItems.map((item, index) => (
              <LineItemCard
                key={item.id}
                index={index}
                item={item}
                meta={meta}
                maxFiles={maxFiles}
                expanded={expandedId === item.id}
                canRemove={lineItems.length > 1}
                onToggle={() =>
                  setExpandedId((cur) => (cur === item.id ? null : item.id))
                }
                onChange={(patch) => updateLineItem(item.id, patch)}
                onRemove={() => removeLineItem(item.id)}
                onAddFiles={(files) => addArtworkToItem(item.id, files)}
                onRemoveFile={(artworkId) => removeArtworkFromItem(item.id, artworkId)}
              />
            ))}
          </div>

          <AppTextarea
            label="Notes (for the whole request)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Pickup location, general instructions, etc."
          />

          <p className={uiCx(uiTypography.helper, 'rounded-lg border border-gray-200 bg-gray-50 px-3 py-2')}>
            Someone from the print shop will review your request and confirm the completion date afterward.
          </p>

          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="submit" variant="primary" disabled={submitting} loading={submitting}>
              Submit request
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function LineItemCard({
  index,
  item,
  meta,
  maxFiles,
  expanded,
  canRemove,
  onToggle,
  onChange,
  onRemove,
  onAddFiles,
  onRemoveFile,
}: {
  index: number;
  item: LineItem;
  meta: Meta;
  maxFiles: number;
  expanded: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (artworkId: string) => void;
}) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const incomplete = !item.title.trim() || item.artworkItems.length === 0;

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
              rows={2}
              placeholder="Details for this item…"
            />

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <label className={uiTypography.controlLabel} htmlFor={fileInputId}>
                  Artwork <span className="text-brand-red">*</span>
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
                PDF / PNG / JPG · up to {maxFiles} files
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
