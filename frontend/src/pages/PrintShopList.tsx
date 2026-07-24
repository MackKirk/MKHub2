import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Printer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppTabs,
  uiColors,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type PrintShopRequestItem = {
  id: string;
  request_code: string;
  status: string;
  status_label: string;
  product_type: string;
  product_type_label: string;
  title: string;
  quantity: number;
  item_count?: number;
  width?: number | null;
  height?: number | null;
  unit: string;
  due_date?: string | null;
  estimated_delivery_date?: string | null;
  requester_name: string;
  requester_email: string;
  created_at?: string | null;
};

type ListResponse = {
  items: PrintShopRequestItem[];
  total: number;
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To Do' },
  { key: 'in_production', label: 'In Production' },
  { key: 'ready', label: 'Ready' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

function statusBadgeVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'todo':
      return 'info';
    case 'in_production':
      return 'warning';
    case 'ready':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export default function PrintShopList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>('all');
  const [q, setQ] = useState('');

  const listQuery = useQuery({
    queryKey: ['print-shop-requests', tab, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab && tab !== 'all') params.set('status', tab);
      if (q.trim()) params.set('q', q.trim());
      const qs = params.toString();
      return api<ListResponse>('GET', `/print-shop/requests${qs ? `?${qs}` : ''}`);
    },
  });

  const countsQuery = useQuery({
    queryKey: ['print-shop-request-counts'],
    queryFn: async () => {
      const all = await api<ListResponse>('GET', '/print-shop/requests');
      const counts: Record<string, number> = {
        all: all.items?.length || 0,
        todo: 0,
        in_production: 0,
        ready: 0,
        cancelled: 0,
      };
      for (const item of all.items || []) {
        if (counts[item.status] != null) counts[item.status] += 1;
      }
      return counts;
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api('DELETE', `/print-shop/requests/${id}`),
    onSuccess: () => {
      toast.success('Request deleted');
      qc.invalidateQueries({ queryKey: ['print-shop-requests'] });
      qc.invalidateQueries({ queryKey: ['print-shop-request-counts'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to delete'),
  });

  const tabs = useMemo(
    () =>
      STATUS_TABS.map((t) => ({
        key: t.key,
        label: t.label,
        count: countsQuery.data?.[t.key],
      })),
    [countsQuery.data]
  );

  const items = listQuery.data?.items || [];

  const handleDelete = (item: PrintShopRequestItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = window.confirm(
      `Delete ${item.request_code} permanently?\n\nThis cannot be undone.`
    );
    if (!ok) return;
    deleteMut.mutate(item.id);
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Print Shop"
        subtitle="Manage print requests for signs, stickers, banners, and more."
        icon={<Printer className="h-4 w-4" />}
        actions={
          <Link to="/print-request">
            <AppButton variant="primary">New request</AppButton>
          </Link>
        }
      />

      <AppTabs tabs={tabs} value={tab} onChange={setTab} />

      <div className="max-w-sm">
        <AppInput
          placeholder="Search code, title, requester…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {listQuery.isLoading ? (
        <p className={uiCx(uiTypography.body, uiColors.textMuted)}>Loading…</p>
      ) : items.length === 0 ? (
        <AppEmptyState
          icon={<Printer className="h-8 w-8" />}
          title="No requests in this queue"
          description="New submissions appear under To Do."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Items</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Est. delivery</th>
                <th className="px-4 py-3 font-medium">Requester</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium w-[1%]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/print-shop/${item.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{item.request_code}</td>
                  <td className="px-4 py-3 text-gray-800">{item.title}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {item.item_count && item.item_count > 1
                      ? `${item.item_count} items`
                      : item.product_type_label}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.due_date || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {item.estimated_delivery_date || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{item.requester_name}</div>
                    <div className="text-xs text-gray-500">{item.requester_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <AppBadge variant={statusBadgeVariant(item.status)}>{item.status_label}</AppBadge>
                  </td>
                  <td className="px-2 py-3">
                    <AppButton
                      variant="ghost"
                      size="sm"
                      title={`Delete ${item.request_code}`}
                      aria-label={`Delete ${item.request_code}`}
                      loading={deleteMut.isPending && deleteMut.variables === item.id}
                      onClick={(e) => handleDelete(item, e)}
                    >
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </AppButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
