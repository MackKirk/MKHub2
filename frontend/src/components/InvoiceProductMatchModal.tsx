import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import { formatAccounting } from '@/lib/accountingFormat';
import { AppButton, AppCheckboxControl, AppCombobox, AppFormModal } from '@/components/ui';

type CatalogProduct = {
  id: number;
  name: string;
  supplier_name?: string | null;
  unit?: string | null;
  price?: number | null;
  quantity?: number | null;
  unit_type?: string | null;
  units_per_package?: number | null;
  coverage_sqs?: number | null;
  coverage_ft2?: number | null;
  coverage_m2?: number | null;
  image_base64?: string | null;
  invoice_description?: string | null;
  similar?: CatalogProduct[];
};

type MatchResult = {
  readable: boolean;
  found_count: number;
  products: CatalogProduct[];
};

export type InvoiceMatchedItem = {
  material_id: number;
  name: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  item_type: 'product';
  supplier_name?: string;
  unit_type?: string;
  units_per_package?: number;
  coverage_sqs?: number;
  coverage_ft2?: number;
  coverage_m2?: number;
  product_image?: string;
  pst: boolean;
  gst: boolean;
};

function productImage(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  return raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`;
}

function productToItem(product: CatalogProduct): InvoiceMatchedItem {
  const quantity = Math.max(1, Number(product.quantity || 1));
  return {
    material_id: product.id,
    name: product.name,
    unit: product.unit || undefined,
    quantity,
    unit_price: Number(product.price || 0),
    item_type: 'product',
    supplier_name: product.supplier_name || undefined,
    unit_type: product.unit_type || undefined,
    units_per_package: product.units_per_package ?? undefined,
    coverage_sqs: product.coverage_sqs ?? undefined,
    coverage_ft2: product.coverage_ft2 ?? undefined,
    coverage_m2: product.coverage_m2 ?? undefined,
    product_image: productImage(product.image_base64),
    pst: false,
    gst: false,
  };
}

function otherOptions(original: CatalogProduct, currentId: number): CatalogProduct[] {
  const pool = [original, ...(original.similar || [])];
  const seen = new Set<number>();
  const options: CatalogProduct[] = [];
  for (const item of pool) {
    if (item.id === currentId || seen.has(item.id)) continue;
    seen.add(item.id);
    options.push(item);
  }
  return options;
}

function SimilarProductButton({
  product,
  onSelect,
}: {
  product: CatalogProduct;
  onSelect: (product: CatalogProduct) => void;
}) {
  const image = productImage(product.image_base64);
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
      onClick={() => onSelect(product)}
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded border bg-gray-100">
        <img src={image || '/ui/assets/image placeholders/no_image.png'} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900">{product.name}</div>
        <div className="truncate text-xs text-gray-500">
          {[product.supplier_name, product.unit].filter(Boolean).join(' · ')}
        </div>
        {product.price != null ? (
          <div className="mt-0.5 text-sm text-gray-700">${formatAccounting(product.price)}</div>
        ) : null}
      </div>
    </button>
  );
}

function SimilarProductsModal({
  open,
  invoiceName,
  options,
  onSelect,
  onClose,
}: {
  open: boolean;
  invoiceName: string;
  options: CatalogProduct[];
  onSelect: (product: CatalogProduct) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-match-swap', q],
    queryFn: async () => {
      const params = new URLSearchParams({ q });
      return api<CatalogProduct[]>('GET', `/estimate/products/search?${params.toString()}`);
    },
    enabled: open && q.trim().length >= 2,
  });
  const results = data || [];
  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Similar products"
      description={invoiceName ? `Invoice: ${invoiceName}` : undefined}
      formWidth="wide"
      overlayClassName="z-[80]"
      footer={
        <div className="flex justify-end">
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </AppButton>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {options.map((product) => (
            <SimilarProductButton key={product.id} product={product} onSelect={onSelect} />
          ))}
        </div>
        <AppCombobox
          label="Search catalog"
          placeholder="Search if the right product is not listed…"
          options={results.map((product) => ({
            value: String(product.id),
            label: product.name,
            description: [product.supplier_name, product.unit, typeof product.price === 'number' ? `$${product.price.toFixed(2)}` : '']
              .filter(Boolean)
              .join(' · '),
          }))}
          value=""
          onChange={(productId) => {
            const product = results.find((row) => String(row.id) === productId);
            if (product) onSelect(product);
          }}
          onInputChange={setQ}
          emptyMessage={isLoading ? 'Searching…' : q.trim().length < 2 ? 'Type at least 2 characters.' : 'No products found. Try another search.'}
        />
      </div>
    </AppFormModal>
  );
}

export function InvoiceProductMatchModal({
  open,
  fileId,
  fileName,
  onClose,
  onAdd,
}: {
  open: boolean;
  fileId: string;
  fileName: string;
  onClose: () => void;
  onAdd: (items: InvoiceMatchedItem[]) => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [replacements, setReplacements] = useState<Record<number, CatalogProduct>>({});
  const [similarIndex, setSimilarIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['invoice-product-match', fileId],
    queryFn: () => api<MatchResult>('POST', `/estimate/invoices/${fileId}/match-products`),
    enabled: open && !!fileId,
  });
  const { data: previewUrl, isLoading: previewLoading, isError: previewError } = useQuery({
    queryKey: ['invoice-product-match-preview', fileId],
    queryFn: async () => {
      const response: { preview_url?: string; download_url?: string } = await api(
        'GET',
        withFileAccessToken(`/files/${fileId}/preview`),
      );
      const url = String(response.preview_url || response.download_url || '');
      if (!url) throw new Error('Preview not available');
      return url;
    },
    enabled: open && !!fileId,
  });

  useEffect(() => {
    if (!open) {
      setChecked(new Set());
      setReplacements({});
      setSimilarIndex(null);
    }
  }, [open, fileId]);

  const products = (data?.products || []).map((product, index) => {
    const replacement = replacements[index];
    if (!replacement) return product;
    return {
      ...replacement,
      quantity: product.quantity,
      invoice_description: product.invoice_description,
      similar: product.similar,
    };
  });
  const readable = data?.readable === true;
  const foundCount = data?.found_count ?? products.length;
  const summary = !data
    ? null
    : !readable
      ? 'This invoice could not be read. Add the products manually.'
      : `Based on the invoice, ${foundCount} product${foundCount === 1 ? '' : 's'} were found that may be in the catalog.`;

  const toggle = (index: number, next: boolean) => {
    setChecked((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(index);
      else updated.delete(index);
      return updated;
    });
  };

  const allChecked = products.length > 0 && products.every((_, index) => checked.has(index));
  const selectAll = () => {
    setChecked(allChecked ? new Set() : new Set(products.map((_, index) => index)));
  };

  const addSelected = () => {
    const picked = products.filter((_, index) => checked.has(index));
    if (!picked.length) {
      toast.error('Select at least one product');
      return;
    }
    setSubmitting(true);
    try {
      onAdd(picked.map(productToItem));
    } finally {
      setSubmitting(false);
    }
  };

  const similarSource = similarIndex != null ? data?.products?.[similarIndex] : null;

  return (
    <>
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Products from invoice"
      description={fileName}
      layout="detail"
      size="lg"
      scrollBody={false}
      bodyFill
      dialogClassName="!h-[90vh] !max-h-[90vh] !w-[min(96vw,1440px)] !max-w-[min(96vw,1440px)]"
      footer={
        <div className="flex justify-end gap-2">
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AppButton>
          {readable && foundCount > 0 ? (
            <AppButton type="button" size="sm" disabled={submitting || isLoading} onClick={addSelected}>
              {submitting ? 'Adding…' : 'Add to section'}
            </AppButton>
          ) : null}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-[45vh] min-w-0 flex-1 border-b border-gray-200 bg-gray-100 md:min-h-0 md:border-b-0 md:border-r">
          {previewUrl ? (
            <iframe src={previewUrl} className="h-full w-full border-0" title={fileName} />
          ) : (
            <p className="p-4 text-sm text-gray-600">
              {previewError ? 'Invoice preview is not available.' : previewLoading ? 'Opening invoice…' : ''}
            </p>
          )}
        </div>
        <div className="flex min-h-0 w-full flex-col md:w-[28rem] md:shrink-0">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {isLoading ? (
              <p className="text-sm text-gray-600">Reading invoice…</p>
            ) : isError ? (
              <p className="text-sm text-gray-600">This invoice could not be read. Add the products manually.</p>
            ) : (
              <>
                {summary ? (
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{summary}</p>
                    {readable && products.length > 0 ? (
                      <button
                        type="button"
                        className="shrink-0 text-sm text-brand-red hover:underline"
                        onClick={selectAll}
                      >
                        {allChecked ? 'Clear' : 'Select all'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {readable
                  ? products.map((product, index) => {
                      const image = productImage(product.image_base64);
                      const quantity = Math.max(1, Number(product.quantity || 1));
                      const invoiceName = product.invoice_description || '';
                      return (
                        <div key={`${product.invoice_description || product.name}-${index}`} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start gap-3">
                            <AppCheckboxControl
                              aria-label={`Include ${product.name}`}
                              checked={checked.has(index)}
                              onChange={(next) => toggle(index, next)}
                            />
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded border bg-gray-100">
                              <img
                                src={image || '/ui/assets/image placeholders/no_image.png'}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-900">{product.name}</div>
                              <div className="truncate text-xs text-gray-500">
                                {[product.supplier_name, product.unit].filter(Boolean).join(' · ')}
                              </div>
                              {invoiceName ? (
                                <div className="truncate text-xs text-gray-500">Invoice: {invoiceName}</div>
                              ) : null}
                              <div className="mt-1 flex items-center justify-between gap-2 text-sm text-gray-700">
                                <span>
                                  Qty {quantity}
                                  {product.price != null ? ` · $${formatAccounting(product.price)}` : ''}
                                </span>
                                {(() => {
                                  const original = data?.products?.[index];
                                  const options = original ? otherOptions(original, product.id) : [];
                                  if (!options.length) return null;
                                  return (
                                    <button
                                      type="button"
                                      className="shrink-0 text-xs text-brand-red hover:underline"
                                      onClick={() => setSimilarIndex(index)}
                                    >
                                      {options.length} similar
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  : null}
              </>
            )}
          </div>
        </div>
      </div>
    </AppFormModal>
    {similarSource ? (
      <SimilarProductsModal
        open
        invoiceName={similarSource.invoice_description || ''}
        options={otherOptions(similarSource, products[similarIndex ?? 0]?.id ?? -1)}
        onClose={() => setSimilarIndex(null)}
        onSelect={(next) => {
          const index = similarIndex;
          if (index == null) return;
          setReplacements((prev) => ({ ...prev, [index]: next }));
          setSimilarIndex(null);
        }}
      />
    ) : null}
    </>
  );
}
