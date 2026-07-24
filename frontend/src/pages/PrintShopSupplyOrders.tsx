import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Package, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeVancouver } from '@/lib/dateUtils';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppPageHeader,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTabs,
  sortListByAppColumn,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
} from '@/components/ui';

type SupplyOrder = {
  id: string;
  order_code: string;
  status: string;
  status_label: string;
  supplier_name?: string | null;
  contact_name?: string | null;
  items?: { product_name: string; quantity: number }[];
  created_at?: string | null;
  ordered_at?: string | null;
  received_at?: string | null;
};

type ListResponse = { items: SupplyOrder[]; total: number };

type SortCol = 'code' | 'supplier' | 'items' | 'status' | 'created';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'received', label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

const LIST_GRID_COLS =
  'grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_auto]';
const LIST_MIN_WIDTH = 'min-w-[860px]';

function statusVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'draft':
      return 'neutral';
    case 'ordered':
      return 'info';
    case 'received':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export default function PrintShopSupplyOrders() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const { sortBy, sortDir, setSort } = useLocalAppListSort<SortCol>('created', 'desc');

  const listQuery = useQuery({
    queryKey: ['print-shop-supply-orders', tab, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('status', tab);
      if (q.trim()) params.set('q', q.trim());
      const qs = params.toString();
      return api<ListResponse>('GET', `/print-shop/supplies/orders${qs ? `?${qs}` : ''}`);
    },
  });

  const countsQuery = useQuery({
    queryKey: ['print-shop-supply-order-counts'],
    queryFn: async () => {
      const all = await api<ListResponse>('GET', '/print-shop/supplies/orders');
      const counts: Record<string, number> = {
        all: all.items?.length || 0,
        draft: 0,
        ordered: 0,
        received: 0,
        cancelled: 0,
      };
      for (const item of all.items || []) {
        if (counts[item.status] != null) counts[item.status] += 1;
      }
      return counts;
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api('DELETE', `/print-shop/supplies/orders/${id}`),
    onSuccess: () => {
      toast.success('Order deleted');
      qc.invalidateQueries({ queryKey: ['print-shop-supply-orders'] });
      qc.invalidateQueries({ queryKey: ['print-shop-supply-order-counts'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete'),
  });

  const tabs = useMemo(
    () =>
      TABS.map((t) => ({
        key: t.key,
        label: t.label,
        count: countsQuery.data?.[t.key],
      })),
    [countsQuery.data]
  );

  const items = useMemo(() => {
    const rows = listQuery.data?.items || [];
    return sortListByAppColumn(rows, sortBy, sortDir, {
      code: (o) => o.order_code,
      supplier: (o) => o.supplier_name || '',
      items: (o) => (o.items || []).length,
      status: (o) => o.status_label || o.status,
      created: (o) => o.created_at || '',
    });
  }, [listQuery.data?.items, sortBy, sortDir]);

  const isLoading = listQuery.isLoading;
  const showEmpty = !isLoading && items.length === 0;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Supply orders"
        subtitle="Build supplier orders, copy the email, attach their paperwork, then confirm receipt."
        icon={<Package className="h-4 w-4" />}
        actions={
          <div className="flex gap-2">
            <Link to="/print-shop/supplies">
              <AppButton variant="secondary">Stock</AppButton>
            </Link>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search order code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search supply orders"
            />
          </div>
        </div>
      </AppCard>

      <AppTabs tabs={tabs} value={tab} onChange={setTab} />

      <AppCard className={uiShadows.card} bodyClassName="!p-0">
        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center')}>Loading…</div>
        ) : showEmpty ? (
          <div className={uiSpacing.cardPadding}>
            <AppListCreateItem
              label="New order"
              layout="row"
              className="w-full"
              href="/print-shop/supplies/orders/new"
            />
            <AppEmptyState
              icon={<Package className="h-8 w-8" />}
              title="No supply orders"
              description="Create an order from the product catalog."
              className="mt-4 border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : (
          <AppSortableEntityList layout="flat">
            <div className={uiSpacing.cardPadding}>
              <AppListCreateItem
                label="New order"
                layout="row"
                className="w-full"
                href="/print-shop/supplies/orders/new"
              />
            </div>
            <AppSortableEntityListHeader
              variant="flat"
              gridCols={LIST_GRID_COLS}
              minWidth={LIST_MIN_WIDTH}
            >
              <AppSortableEntityListSortColumn
                label="Code"
                column="code"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setSort}
              />
              <AppSortableEntityListSortColumn
                label="Supplier"
                column="supplier"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setSort}
              />
              <AppSortableEntityListSortColumn
                label="Items"
                column="items"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setSort}
              />
              <AppSortableEntityListSortColumn
                label="Status"
                column="status"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setSort}
              />
              <AppSortableEntityListSortColumn
                label="Created"
                column="created"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setSort}
              />
              <AppSortableEntityListSortColumn
                label={<span className="sr-only">Actions</span>}
                column="code"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setSort}
                sortable={false}
                className="flex justify-end"
              />
            </AppSortableEntityListHeader>
            <AppSortableEntityListFlatBody gridCols={LIST_GRID_COLS} minWidth={LIST_MIN_WIDTH}>
              {items.map((o) => (
                <AppSortableEntityListRow
                  key={o.id}
                  variant="flat"
                  as="div"
                  gridCols={LIST_GRID_COLS}
                  minWidth={LIST_MIN_WIDTH}
                  className="cursor-pointer"
                  onClick={() => navigate(`/print-shop/supplies/orders/${o.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/print-shop/supplies/orders/${o.id}`);
                    }
                  }}
                >
                  <span className={uiCx(uiTypography.sectionTitle, 'truncate')}>{o.order_code}</span>
                  <div className="min-w-0">
                    <div className={uiCx(uiTypography.body, 'truncate')}>{o.supplier_name || '—'}</div>
                    {o.contact_name ? (
                      <div className={uiCx(uiTypography.helper, 'truncate')}>{o.contact_name}</div>
                    ) : null}
                  </div>
                  <span className={uiTypography.body}>{(o.items || []).length}</span>
                  <div>
                    <AppBadge variant={statusVariant(o.status)}>{o.status_label}</AppBadge>
                  </div>
                  <span className={uiCx(uiTypography.body, 'whitespace-nowrap')}>
                    {o.created_at ? formatDateTimeVancouver(o.created_at) : '—'}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    <AppListRowIconButton
                      preset="delete"
                      label={`Delete ${o.order_code}`}
                      loading={deleteMut.isPending && deleteMut.variables === o.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm(`Delete ${o.order_code} permanently?`)) return;
                        deleteMut.mutate(o.id);
                      }}
                    />
                  </div>
                </AppSortableEntityListRow>
              ))}
            </AppSortableEntityListFlatBody>
          </AppSortableEntityList>
        )}
      </AppCard>
    </div>
  );
}
