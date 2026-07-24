import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Boxes, ChevronDown, ChevronRight, Minus, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCombobox,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppPageHeader,
  AppTabs,
  AppTextarea,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
  type AppComboboxOption,
} from '@/components/ui';

type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  list_price_note?: string | null;
  notes?: string | null;
  manufacturer?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  stock_quantity: number;
  reorder_point: number;
  low_stock?: boolean;
  is_active?: boolean;
};

type ProductsResponse = {
  items: Product[];
  categories: string[];
  total: number;
};

type Supplier = { id: string; name: string };

type EditForm = {
  name: string;
  category: string;
  manufacturer: string;
  supplier_id: string;
  unit: string;
  list_price_note: string;
  reorder_point: string;
  notes: string;
};

function formatPriceNote(note?: string | null) {
  if (!note) return null;
  const t = note.replace(/\u00a0/g, ' ').trim();
  if (!t) return null;
  if (t.startsWith('$')) return t;
  if (/^\d+(\.\d+)?$/.test(t)) return `$${t}`;
  return t;
}

function formatUnit(unit?: string | null) {
  const u = (unit || '').trim();
  if (!u) return 'ea';
  return u;
}

/** Fixed tracks so Unit / Stock / Price / Actions stay aligned regardless of product name length. */
const ROW_GRID =
  'grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_4.75rem_5.75rem_6.5rem_5.5rem] items-center gap-3';
const LIST_MIN_WIDTH = 'min-w-[980px]';

const emptyForm = (): EditForm => ({
  name: '',
  category: '',
  manufacturer: '',
  supplier_id: '',
  unit: 'ea',
  list_price_note: '',
  reorder_point: '0',
  notes: '',
});

function formFromProduct(p: Product): EditForm {
  return {
    name: p.name || '',
    category: p.category || '',
    manufacturer: p.manufacturer || '',
    supplier_id: p.supplier_id || '',
    unit: p.unit || 'ea',
    list_price_note: p.list_price_note || '',
    reorder_point: String(p.reorder_point ?? 0),
    notes: p.notes || '',
  };
}

export default function PrintShopSupplies() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>('all');
  const [q, setQ] = useState('');
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EditForm>(emptyForm());
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustNote, setAdjustNote] = useState('');

  const productsQuery = useQuery({
    queryKey: ['print-shop-supplies', q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const qs = params.toString();
      return api<ProductsResponse>('GET', `/print-shop/supplies/products${qs ? `?${qs}` : ''}`);
    },
  });

  const suppliersQuery = useQuery({
    queryKey: ['print-shop-supply-suppliers'],
    queryFn: () => api<{ items: Supplier[] }>('GET', '/print-shop/supplies/suppliers'),
  });

  const supplierOptions: AppComboboxOption[] = useMemo(() => {
    const list = suppliersQuery.data?.items || [];
    return [{ value: '', label: 'No supplier' }, ...list.map((s) => ({ value: s.id, label: s.name }))];
  }, [suppliersQuery.data?.items]);

  const allItems = productsQuery.data?.items || [];

  const categoryTabs = useMemo(() => {
    const cats = productsQuery.data?.categories || [];
    return [
      { key: 'all', label: 'All', count: allItems.length },
      ...cats.map((c) => ({
        key: c,
        label: c,
        count: allItems.filter((p) => p.category === c).length,
      })),
    ];
  }, [productsQuery.data?.categories, allItems]);

  const productsByCategory = useMemo(() => {
    const list = category === 'all' ? allItems : allItems.filter((p) => p.category === category);
    const map = new Map<string, Product[]>();
    for (const p of list) {
      const arr = map.get(p.category) || [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, products]) => [
        cat,
        [...products].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
      ] as [string, Product[]]);
  }, [allItems, category]);

  const adjustMut = useMutation({
    mutationFn: ({ id, delta, note }: { id: string; delta: number; note?: string }) =>
      api('POST', `/print-shop/supplies/products/${id}/adjust-stock`, { delta, note: note || null }),
    onSuccess: () => {
      toast.success('Stock updated');
      setStockProduct(null);
      setAdjustQty('1');
      setAdjustNote('');
      qc.invalidateQueries({ queryKey: ['print-shop-supplies'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to adjust stock'),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        manufacturer: form.manufacturer.trim() || null,
        supplier_id: form.supplier_id || null,
        unit: form.unit.trim() || 'ea',
        list_price_note: form.list_price_note.trim() || null,
        reorder_point: Math.max(0, parseInt(form.reorder_point, 10) || 0),
        notes: form.notes.trim() || null,
      };
      if (!payload.name) throw new Error('Name is required');
      if (!payload.category) throw new Error('Category is required');
      if (creating) {
        return api('POST', '/print-shop/supplies/products', {
          ...payload,
          stock_quantity: 0,
        });
      }
      if (!editing) throw new Error('No product selected');
      return api('PATCH', `/print-shop/supplies/products/${editing.id}`, payload);
    },
    onSuccess: () => {
      toast.success(creating ? 'Product created' : 'Product updated');
      setCreating(false);
      setEditing(null);
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ['print-shop-supplies'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save product'),
  });

  const applyAdjust = (direction: 1 | -1) => {
    if (!stockProduct) return;
    const n = Math.abs(parseInt(adjustQty, 10) || 0);
    if (!n) {
      toast.error('Enter a quantity');
      return;
    }
    adjustMut.mutate({
      id: stockProduct.id,
      delta: direction * n,
      note: adjustNote.trim() || undefined,
    });
  };

  const openEdit = (p: Product) => {
    setCreating(false);
    setEditing(p);
    setForm(formFromProduct(p));
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({
      ...emptyForm(),
      category: category !== 'all' ? category : '',
    });
  };

  const closeEditModal = () => {
    setEditing(null);
    setCreating(false);
    setForm(emptyForm());
  };

  const toggleCat = (cat: string) => {
    setCollapsedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const editModalOpen = creating || !!editing;
  const isLoading = productsQuery.isLoading;
  const showEmpty = !isLoading && allItems.length === 0;
  const showNoMatches = !isLoading && allItems.length > 0 && productsByCategory.length === 0;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Supply stock"
        subtitle="Print shop consumables — receive via orders; reduce stock manually when used."
        icon={<Boxes className="h-4 w-4" />}
        actions={
          <div className="flex gap-2">
            <Link to="/print-shop/supplies/orders">
              <AppButton variant="secondary">Orders</AppButton>
            </Link>
            <Link to="/print-shop/supplies/orders/new">
              <AppButton variant="primary">New order</AppButton>
            </Link>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search name, manufacturer, category…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search supply products"
            />
          </div>
        </div>
      </AppCard>

      <AppTabs tabs={categoryTabs} value={category} onChange={setCategory} />

      <AppCard className={uiShadows.card} bodyClassName="!p-0">
        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center')}>Loading…</div>
        ) : showEmpty ? (
          <div className={uiSpacing.cardPadding}>
            <AppListCreateItem
              label="New product"
              layout="row"
              className="w-full"
              onClick={openCreate}
            />
            <AppEmptyState
              icon={<Boxes className="h-8 w-8" />}
              title="No products"
              description="Import the Laird catalog or add a product."
              className="mt-4 border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : (
          <div className={uiSpacing.cardPadding}>
            <AppListCreateItem
              label="New product"
              layout="row"
              className="w-full"
              onClick={openCreate}
            />

            {showNoMatches ? (
              <p className={uiCx(uiTypography.helper, 'mt-6 text-center')}>
                No matching products in this category.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <div className={uiCx(LIST_MIN_WIDTH, 'space-y-3')}>
                  {/* Shared column header — one alignment for every category */}
                  <div
                    className={uiCx(
                      ROW_GRID,
                      'px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-gray-500'
                    )}
                  >
                    <span className="min-w-0">Product</span>
                    <span className="min-w-0">Manufacturer</span>
                    <span className="min-w-0">Supplier</span>
                    <span className="text-center">Unit</span>
                    <span className="text-right">Stock</span>
                    <span className="text-right">Price</span>
                    <span className="sr-only">Actions</span>
                  </div>

                  {productsByCategory.map(([cat, products]) => {
                    const collapsed = !!collapsedCats[cat];
                    const lowCount = products.filter((p) => p.low_stock).length;
                    return (
                      <section
                        key={cat}
                        className="overflow-hidden rounded-xl border border-gray-200"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCat(cat)}
                          className="flex w-full items-center justify-between gap-3 bg-gray-50 px-4 py-2.5 text-left hover:bg-gray-100/80"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            {collapsed ? (
                              <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                            )}
                            <span className={uiTypography.sectionTitle}>{cat}</span>
                            <span className={uiTypography.helper}>
                              {products.length} item{products.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          {lowCount > 0 ? (
                            <AppBadge variant="warning">{lowCount} low</AppBadge>
                          ) : null}
                        </button>

                        {!collapsed ? (
                          <ul className="divide-y divide-gray-100 bg-white">
                            {products.map((p) => {
                              const price = formatPriceNote(p.list_price_note);
                              const unit = formatUnit(p.unit);
                              return (
                                <li key={p.id} className={uiCx(ROW_GRID, 'px-4 py-3')}>
                                  <div className="min-w-0">
                                    <button
                                      type="button"
                                      className={uiCx(
                                        uiTypography.sectionTitle,
                                        'block w-full truncate text-left hover:text-brand-red hover:underline'
                                      )}
                                      title={p.name}
                                      onClick={() => openEdit(p)}
                                    >
                                      {p.name}
                                    </button>
                                  </div>
                                  <span
                                    className={uiCx(uiTypography.body, 'min-w-0 truncate text-gray-600')}
                                    title={p.manufacturer || ''}
                                  >
                                    {p.manufacturer || '—'}
                                  </span>
                                  <span
                                    className={uiCx(uiTypography.body, 'min-w-0 truncate text-gray-600')}
                                    title={p.supplier_name || ''}
                                  >
                                    {p.supplier_name || '—'}
                                  </span>
                                  <div className="flex justify-center">
                                    <span className="inline-flex max-w-full truncate rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-600">
                                      {unit}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="text-sm font-medium tabular-nums text-gray-900">
                                      {p.stock_quantity}
                                    </span>
                                    {p.low_stock ? <AppBadge variant="warning">Low</AppBadge> : null}
                                  </div>
                                  <span
                                    className={uiCx(
                                      'truncate text-right text-sm tabular-nums',
                                      price ? 'font-medium text-gray-900' : 'text-gray-400'
                                    )}
                                    title={price || undefined}
                                  >
                                    {price || '—'}
                                  </span>
                                  <div className="flex items-center justify-end gap-1">
                                    <AppListRowIconButton
                                      preset="edit"
                                      label={`Edit ${p.name}`}
                                      onClick={() => openEdit(p)}
                                    />
                                    <AppListRowIconButton
                                      icon={<Boxes className="h-4 w-4" />}
                                      label={`Adjust stock for ${p.name}`}
                                      onClick={() => {
                                        setStockProduct(p);
                                        setAdjustQty('1');
                                        setAdjustNote('');
                                      }}
                                    />
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </AppCard>

      <AppFormModal
        open={editModalOpen}
        onClose={closeEditModal}
        title={creating ? 'New supply product' : 'Edit supply product'}
        description="Link a MK Hub supplier and set the manufacturer brand (e.g. Avery, Roland)."
        footer={
          <div className={uiLayout.actionsRow}>
            <AppButton variant="ghost" onClick={closeEditModal}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              loading={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              Save
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppInput
            label="Name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AppInput
              label="Category *"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Ink"
              helperText={
                (productsQuery.data?.categories || []).length
                  ? `Existing: ${(productsQuery.data?.categories || []).join(', ')}`
                  : undefined
              }
            />
            <AppInput
              label="Unit"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="ea"
            />
          </div>
          <AppInput
            label="Manufacturer"
            value={form.manufacturer}
            onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))}
            placeholder="e.g. Avery, Roland / TrueVIS"
            helperText="Brand / maker of the product."
          />
          <AppCombobox
            label="Supplier"
            options={supplierOptions}
            value={form.supplier_id}
            onChange={(value) => setForm((f) => ({ ...f, supplier_id: value }))}
            placeholder="Search MK Hub suppliers…"
            helperText="Who you buy this from (same list as Inventory → Suppliers)."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AppInput
              label="Ref. price note"
              value={form.list_price_note}
              onChange={(e) => setForm((f) => ({ ...f, list_price_note: e.target.value }))}
              placeholder="209"
            />
            <AppInput
              label="Reorder point"
              type="number"
              min={0}
              value={form.reorder_point}
              onChange={(e) => setForm((f) => ({ ...f, reorder_point: e.target.value }))}
            />
          </div>
          <AppTextarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
          />
        </div>
      </AppFormModal>

      <AppFormModal
        open={!!stockProduct}
        onClose={() => setStockProduct(null)}
        title="Adjust stock"
        description={stockProduct?.name}
        footer={
          <div className={uiLayout.actionsRow}>
            <AppButton variant="ghost" onClick={() => setStockProduct(null)}>
              Cancel
            </AppButton>
            <AppButton
              variant="secondary"
              loading={adjustMut.isPending}
              onClick={() => applyAdjust(-1)}
            >
              <Minus className="h-3.5 w-3.5 mr-1" />
              Remove
            </AppButton>
            <AppButton
              variant="primary"
              loading={adjustMut.isPending}
              onClick={() => applyAdjust(1)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <p className={uiTypography.body}>
            Current stock:{' '}
            <span className="font-medium text-gray-900">{stockProduct?.stock_quantity ?? 0}</span>
          </p>
          <AppInput
            label="Quantity"
            type="number"
            min={1}
            value={adjustQty}
            onChange={(e) => setAdjustQty(e.target.value)}
          />
          <AppInput
            label="Note (optional)"
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            placeholder="e.g. Used on job PS-…"
          />
        </div>
      </AppFormModal>
    </div>
  );
}
