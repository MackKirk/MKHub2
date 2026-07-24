import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, Minus, PackagePlus, Plus, Search, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCombobox,
  AppInput,
  AppPageHeader,
  AppTabs,
  AppTextarea,
  uiColors,
  uiCx,
  uiShadows,
  uiSpacing,
  uiTypography,
  type AppComboboxOption,
} from '@/components/ui';

type Product = {
  id: string;
  name: string;
  category: string;
  unit?: string;
  list_price_note?: string | null;
  manufacturer?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  stock_quantity: number;
};

type SupplierContact = { id: string; name: string; email?: string | null; title?: string | null };
type Supplier = {
  id: string;
  name: string;
  email?: string | null;
  contacts: SupplierContact[];
};

function formatPriceNote(note?: string | null) {
  if (!note) return null;
  const t = note.replace(/\u00a0/g, ' ').trim();
  if (!t) return null;
  if (t.startsWith('$')) return t;
  if (/^\d+(\.\d+)?$/.test(t)) return `$${t}`;
  return t;
}

function QtyStepper({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const n = parseInt(value || '0', 10) || 0;
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        disabled={n <= 0}
        onClick={() => onChange(n <= 1 ? '' : String(n - 1))}
        aria-label={`Decrease ${ariaLabel}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-12 border-x border-gray-200 bg-white text-center text-xs tabular-nums outline-none"
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center text-gray-500 hover:bg-gray-50"
        onClick={() => onChange(String(n + 1))}
        aria-label={`Increase ${ariaLabel}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function PrintShopSupplyOrderNew() {
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState('');
  const [contactId, setContactId] = useState('');
  const [greetingName, setGreetingName] = useState('');
  const [notes, setNotes] = useState('');
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, string>>({});
  const [filterCat, setFilterCat] = useState('all');
  const [q, setQ] = useState('');
  const [onlySupplierProducts, setOnlySupplierProducts] = useState(true);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});

  const suppliersQuery = useQuery({
    queryKey: ['print-shop-supply-suppliers'],
    queryFn: () => api<{ items: Supplier[] }>('GET', '/print-shop/supplies/suppliers'),
  });

  const productsQuery = useQuery({
    queryKey: ['print-shop-supplies'],
    queryFn: () =>
      api<{ items: Product[]; categories: string[] }>('GET', '/print-shop/supplies/products'),
  });

  const suppliers = suppliersQuery.data?.items || [];
  const supplier = suppliers.find((s) => s.id === supplierId);
  const contacts = supplier?.contacts || [];

  const supplierOptions: AppComboboxOption[] = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers]
  );

  const contactOptions: AppComboboxOption[] = useMemo(
    () => [
      { value: '', label: 'No specific contact' },
      ...contacts.map((c) => ({
        value: c.id,
        label: c.email ? `${c.name} · ${c.email}` : c.name,
        description: c.title || undefined,
      })),
    ],
    [contacts]
  );

  const allProducts = productsQuery.data?.items || [];

  const supplierProductCount = useMemo(() => {
    if (!supplierId) return 0;
    return allProducts.filter((p) => p.supplier_id === supplierId).length;
  }, [allProducts, supplierId]);

  const catalogBase = useMemo(() => {
    let list = allProducts;
    if (supplierId && onlySupplierProducts && supplierProductCount > 0) {
      list = list.filter((p) => p.supplier_id === supplierId);
    }
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.manufacturer || '').toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term)
      );
    }
    return list;
  }, [allProducts, supplierId, onlySupplierProducts, supplierProductCount, q]);

  const categories = useMemo(() => {
    const set = new Set(catalogBase.map((p) => p.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalogBase]);

  const categoryTabs = useMemo(
    () => [
      { key: 'all', label: 'All', count: catalogBase.length },
      ...categories.map((c) => ({
        key: c,
        label: c,
        count: catalogBase.filter((p) => p.category === c).length,
      })),
    ],
    [categories, catalogBase]
  );

  const productsByCategory = useMemo(() => {
    const list =
      filterCat === 'all' ? catalogBase : catalogBase.filter((p) => p.category === filterCat);
    const map = new Map<string, Product[]>();
    for (const p of list) {
      const arr = map.get(p.category) || [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalogBase, filterCat]);

  const selectedLines = useMemo(() => {
    const lines: { product_id: string; quantity: number; name: string; category: string }[] = [];
    for (const p of allProducts) {
      const n = parseInt(qtyByProduct[p.id] || '', 10);
      if (n > 0) lines.push({ product_id: p.id, quantity: n, name: p.name, category: p.category });
    }
    return lines;
  }, [qtyByProduct, allProducts]);

  const selectedByCategory = useMemo(() => {
    const map = new Map<string, typeof selectedLines>();
    for (const line of selectedLines) {
      const arr = map.get(line.category) || [];
      arr.push(line);
      map.set(line.category, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [selectedLines]);

  const emailPreview = useMemo(() => {
    const who =
      greetingName.trim() ||
      contacts.find((c) => c.id === contactId)?.name.split(/\s+/)[0] ||
      'there';
    if (selectedLines.length === 0) {
      return `Hello ${who}, how are you?\n\nCould you please place the following order for us:\n\n…\n\nThank you.`;
    }
    const lines = selectedLines.map((l) => `${l.quantity}x ${l.name}`).join('\n');
    return `Hello ${who}, how are you?\n\nCould you please place the following order for us:\n\n${lines}\n\nThank you.`;
  }, [greetingName, contactId, contacts, selectedLines]);

  const createMut = useMutation({
    mutationFn: () =>
      api<{ id: string }>('POST', '/print-shop/supplies/orders', {
        supplier_id: supplierId,
        contact_id: contactId || null,
        contact_greeting_name: greetingName.trim() || null,
        notes: notes.trim() || null,
        items: selectedLines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      }),
    onSuccess: (data) => {
      toast.success('Order created');
      navigate(`/print-shop/supplies/orders/${data.id}`);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create order'),
  });

  const onSupplierChange = (id: string) => {
    setSupplierId(id);
    setContactId('');
    setGreetingName('');
    setOnlySupplierProducts(true);
    setFilterCat('all');
  };

  const onContactChange = (id: string) => {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c?.name) setGreetingName(c.name.split(/\s+/)[0] || '');
    else setGreetingName('');
  };

  const toggleCat = (cat: string) => {
    setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const setQty = (productId: string, next: string) => {
    setQtyByProduct((prev) => ({ ...prev, [productId]: next }));
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="New supply order"
        subtitle="Choose supplier and contact, then pick quantities by category."
        icon={<PackagePlus className="h-4 w-4" />}
        onBack={() => navigate('/print-shop/supplies/orders')}
        backLabel="Back to orders"
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className={uiSpacing.sectionStack}>
          <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
            <div className="mb-3 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-gray-500" />
              <h2 className={uiTypography.sectionTitle}>Supplier & contact</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AppCombobox
                label="Supplier *"
                options={supplierOptions}
                value={supplierId}
                onChange={onSupplierChange}
                placeholder="Search supplier…"
                helperText="Same suppliers as Inventory → Suppliers."
              />
              <AppCombobox
                label="Contact"
                options={contactOptions}
                value={contactId}
                onChange={onContactChange}
                placeholder={supplierId ? 'Search contact…' : 'Select a supplier first'}
                disabled={!supplierId}
                helperText={
                  supplier?.email
                    ? `Supplier email: ${supplier.email}`
                    : 'Optional — used for greeting and mailto.'
                }
              />
              <AppInput
                label="Greeting name"
                value={greetingName}
                onChange={(e) => setGreetingName(e.target.value)}
                placeholder="Emran"
                helperText='Email opens with “Hello Emran, how are you?”'
              />
              <AppTextarea
                label="Internal notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional notes for the team…"
              />
            </div>
            {supplierId && supplierProductCount > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <AppBadge variant="info">
                  {supplierProductCount} product{supplierProductCount === 1 ? '' : 's'} linked to{' '}
                  {supplier?.name}
                </AppBadge>
                <button
                  type="button"
                  className="text-xs text-brand-red underline"
                  onClick={() => setOnlySupplierProducts((v) => !v)}
                >
                  {onlySupplierProducts ? 'Show full catalog' : 'Show only this supplier'}
                </button>
              </div>
            ) : supplierId ? (
              <p className={uiCx(uiTypography.helper, 'mt-3')}>
                No products linked to this supplier yet — showing full catalog. You can set the
                supplier on each product in Supply stock.
              </p>
            ) : null}
          </AppCard>

          <AppCard className={uiShadows.card} bodyClassName="!p-0">
            <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100 space-y-3')}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className={uiTypography.sectionTitle}>Catalog</h2>
                  <p className={uiTypography.helper}>Browse by category and set quantities.</p>
                </div>
                <div className="w-full max-w-xs">
                  <AppInput
                    placeholder="Search products…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    leftIcon={<Search className="h-4 w-4" />}
                  />
                </div>
              </div>
              {categoryTabs.length > 1 ? (
                <AppTabs tabs={categoryTabs} value={filterCat} onChange={setFilterCat} />
              ) : null}
            </div>

            <div className={uiSpacing.cardPadding}>
              {!supplierId ? (
                <p className={uiCx(uiTypography.body, uiColors.textMuted)}>
                  Select a supplier above to start building the order.
                </p>
              ) : productsQuery.isLoading ? (
                <p className={uiCx(uiTypography.body, uiColors.textMuted)}>Loading catalog…</p>
              ) : productsByCategory.length === 0 ? (
                <p className={uiCx(uiTypography.body, uiColors.textMuted)}>
                  No products match this filter.
                </p>
              ) : (
                <div className="space-y-4">
                  {productsByCategory.map(([cat, products]) => {
                    const collapsed = !!collapsedCats[cat];
                    const selectedInCat = products.reduce((sum, p) => {
                      const n = parseInt(qtyByProduct[p.id] || '', 10) || 0;
                      return sum + n;
                    }, 0);
                    return (
                      <section key={cat} className="overflow-hidden rounded-xl border border-gray-200">
                        <button
                          type="button"
                          onClick={() => toggleCat(cat)}
                          className="flex w-full items-center justify-between gap-3 bg-gray-50 px-4 py-2.5 text-left hover:bg-gray-100/80"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {collapsed ? (
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-gray-400" />
                            )}
                            <span className={uiCx(uiTypography.sectionTitle)}>{cat}</span>
                            <span className={uiTypography.helper}>
                              {products.length} item{products.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          {selectedInCat > 0 ? (
                            <AppBadge variant="success">{selectedInCat} selected</AppBadge>
                          ) : null}
                        </button>
                        {!collapsed ? (
                          <ul className="divide-y divide-gray-100 bg-white">
                            {products.map((p) => {
                              const price = formatPriceNote(p.list_price_note);
                              const qty = qtyByProduct[p.id] || '';
                              const active = (parseInt(qty, 10) || 0) > 0;
                              return (
                                <li
                                  key={p.id}
                                  className={uiCx(
                                    'flex flex-wrap items-center gap-3 px-4 py-3',
                                    active && 'bg-brand-red/[0.03]'
                                  )}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className={uiCx(uiTypography.body, 'font-medium text-gray-900')}
                                    >
                                      {p.name}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      {p.manufacturer ? (
                                        <span className={uiTypography.helper}>{p.manufacturer}</span>
                                      ) : null}
                                      <span className="inline-flex rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                                        {p.unit || 'ea'}
                                      </span>
                                      {price ? (
                                        <span className="text-xs font-medium tabular-nums text-gray-800">
                                          {price}
                                        </span>
                                      ) : null}
                                      <span className={uiTypography.helper}>
                                        stock {p.stock_quantity}
                                      </span>
                                    </div>
                                  </div>
                                  <QtyStepper
                                    value={qty}
                                    onChange={(next) => setQty(p.id, next)}
                                    ariaLabel={`Quantity for ${p.name}`}
                                  />
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </AppCard>
        </div>

        <aside className={uiCx(uiSpacing.sectionStack, 'xl:sticky xl:top-4')}>
          <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
            <h2 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Order summary</h2>
            {!supplierId ? (
              <p className={uiCx(uiTypography.body, uiColors.textMuted)}>Pick a supplier to continue.</p>
            ) : selectedLines.length === 0 ? (
              <p className={uiCx(uiTypography.body, uiColors.textMuted)}>No items selected yet.</p>
            ) : (
              <div className="space-y-3">
                {selectedByCategory.map(([cat, lines]) => (
                  <div key={cat}>
                    <div className={uiCx(uiTypography.helper, 'mb-1 uppercase tracking-wide')}>
                      {cat}
                    </div>
                    <ul className="space-y-1">
                      {lines.map((l) => (
                        <li key={l.product_id} className={uiTypography.body}>
                          <span className="font-medium tabular-nums">{l.quantity}x</span>{' '}
                          {l.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className={uiCx(uiTypography.helper, 'mb-1')}>Email preview</div>
              <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-700">
                {emailPreview}
              </pre>
            </div>
            <AppButton
              variant="primary"
              className="mt-4 w-full"
              loading={createMut.isPending}
              disabled={!supplierId || selectedLines.length === 0}
              onClick={() => createMut.mutate()}
            >
              Create draft order
            </AppButton>
          </AppCard>
        </aside>
      </div>
    </div>
  );
}
