import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Globe } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTimeVancouver } from '@/lib/dateUtils';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppTabs,
  uiCx,
  uiSpacing,
} from '@/components/ui';

type SubmissionItem = {
  id: string;
  description: string;
  gauge?: string | null;
  colour?: string | null;
  quantity: number;
  notes?: string | null;
};

type Submission = {
  id: string;
  submission_code: string;
  kind: string;
  status: string;
  status_label: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string | null;
  company_name?: string | null;
  customer_type?: string | null;
  project_po?: string | null;
  notes?: string | null;
  delivery_method?: string | null;
  delivery_address?: string | null;
  internal_notes?: string | null;
  metals_client_id?: string | null;
  converted_quote_id?: string | null;
  created_at?: string | null;
  items: SubmissionItem[];
  files: { id: string; original_name?: string | null; file_object_id: string }[];
  metals_client?: { id: string; name: string; code?: string | null };
  converted_quote?: { id: string; code?: string | null; title?: string | null };
};

type ListResponse = {
  items: Submission[];
  total: number;
  new_count: number;
};

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'in_review', label: 'In review' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_production', label: 'In production' },
  { key: 'ready', label: 'Ready' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

const STATUS_OPTIONS = STATUS_TABS.filter((t) => t.key !== 'all').map((t) => ({
  value: t.key,
  label: t.label,
}));

function statusVariant(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'new':
      return 'info';
    case 'in_review':
    case 'quoted':
    case 'confirmed':
    case 'in_production':
      return 'warning';
    case 'ready':
    case 'shipped':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

function ListPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');

  const listQuery = useQuery({
    queryKey: ['metals-website-submissions', tab, kind, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab !== 'all') params.set('status', tab);
      if (kind !== 'all') params.set('kind', kind);
      if (q.trim()) params.set('q', q.trim());
      return api<ListResponse>('GET', `/metals/website/submissions?${params.toString()}`);
    },
  });

  const items = listQuery.data?.items || [];

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Website inbox"
        subtitle="Estimates and orders from the Mack Kirk Metals public site"
        icon={<Globe className="h-5 w-5" />}
        actions={
          listQuery.data?.new_count ? (
            <AppBadge variant="info">{listQuery.data.new_count} new</AppBadge>
          ) : null
        }
      />

      <AppTabs tabs={[...STATUS_TABS]} value={tab} onChange={setTab} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <AppSelect
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            options={[
              { value: 'all', label: 'All kinds' },
              { value: 'estimate', label: 'Estimates' },
              { value: 'order', label: 'Orders' },
            ]}
          />
        </div>
        <div className="max-w-sm flex-1">
          <AppInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" />
        </div>
      </div>

      {listQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {listQuery.isError && (
        <p className="text-sm text-red-600">{(listQuery.error as Error)?.message || 'Failed to load'}</p>
      )}
      {!listQuery.isLoading && items.length === 0 && (
        <AppEmptyState title="No submissions" description="Website estimates and orders will appear here." />
      )}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/metals/website/${row.id}`)}
                >
                  <td className="px-4 py-3 font-medium">{row.submission_code}</td>
                  <td className="px-4 py-3 capitalize">{row.kind}</td>
                  <td className="px-4 py-3">
                    <div>{row.company_name || row.contact_name}</div>
                    <div className="text-xs text-gray-500">{row.contact_email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <AppBadge variant={statusVariant(row.status)}>{row.status_label}</AppBadge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {row.created_at ? formatDateTimeVancouver(row.created_at) : '—'}
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

function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [internalNotes, setInternalNotes] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['metals-website-submission', id],
    enabled: Boolean(id),
    queryFn: () => api<Submission>('GET', `/metals/website/submissions/${id}`),
  });

  const row = detailQuery.data;
  const notesValue = useMemo(() => {
    if (internalNotes !== null) return internalNotes;
    return row?.internal_notes || '';
  }, [internalNotes, row?.internal_notes]);

  const patchMutation = useMutation({
    mutationFn: (body: { status?: string; internal_notes?: string }) =>
      api<Submission>('PATCH', `/metals/website/submissions/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metals-website-submission', id] });
      qc.invalidateQueries({ queryKey: ['metals-website-submissions'] });
      toast.success('Updated');
      setInternalNotes(null);
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const convertMutation = useMutation({
    mutationFn: () =>
      api<{ quote_id: string; quote_code?: string }>('POST', `/metals/website/submissions/${id}/convert-to-quote`, {
        confirm: true,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['metals-website-submission', id] });
      qc.invalidateQueries({ queryKey: ['metals-website-submissions'] });
      toast.success('Converted to quote');
      if (data.quote_id) navigate(`/quotes/${data.quote_id}`);
    },
    onError: (e: Error) => toast.error(e.message || 'Convert failed'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api<Submission>('POST', `/metals/website/submissions/${id}/confirm-order`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metals-website-submission', id] });
      qc.invalidateQueries({ queryKey: ['metals-website-submissions'] });
      toast.success('Order confirmed');
    },
    onError: (e: Error) => toast.error(e.message || 'Confirm failed'),
  });

  if (detailQuery.isLoading) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppEmptyState title="Not found" description="Submission could not be loaded." />
        <AppButton variant="secondary" onClick={() => navigate('/metals/website')}>
          Back to inbox
        </AppButton>
      </div>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={row.submission_code}
        subtitle={`${row.kind} · ${row.status_label}`}
        icon={<Globe className="h-5 w-5" />}
        onBack={() => navigate('/metals/website')}
        backLabel="Back to inbox"
        actions={
          <div className="flex flex-wrap gap-2">
            {row.kind === 'estimate' && !row.converted_quote_id && (
              <AppButton onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending}>
                Convert to quote
              </AppButton>
            )}
            {row.converted_quote_id && (
              <AppButton variant="secondary" onClick={() => navigate(`/quotes/${row.converted_quote_id}`)}>
                Open quote
              </AppButton>
            )}
            {row.kind === 'order' && row.status !== 'confirmed' && row.status !== 'cancelled' && (
              <AppButton onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
                Confirm order
              </AppButton>
            )}
            {row.metals_client_id && (
              <AppButton
                variant="secondary"
                onClick={() => navigate(`/metals/customers/${row.metals_client_id}`)}
              >
                Open customer
              </AppButton>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Contact</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Name</dt>
                <dd>{row.contact_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Email</dt>
                <dd>{row.contact_email}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Phone</dt>
                <dd>{row.contact_phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Company</dt>
                <dd>{row.company_name || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Customer type</dt>
                <dd>{row.customer_type || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Project / PO</dt>
                <dd>{row.project_po || '—'}</dd>
              </div>
            </dl>
            {row.notes && (
              <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{row.notes}</p>
            )}
            {row.delivery_method && (
              <p className="mt-3 text-sm">
                Delivery: <span className="font-medium capitalize">{row.delivery_method}</span>
                {row.delivery_address ? ` — ${row.delivery_address}` : ''}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Items</h2>
            {row.items.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No line items</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {row.items.map((it) => (
                  <li key={it.id} className="py-2 text-sm">
                    <p className="font-medium">{it.description}</p>
                    <p className="text-xs text-gray-500">
                      {[it.gauge, it.colour, `qty ${it.quantity}`].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {row.files.length > 0 && (
            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Files</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {row.files.map((f) => (
                  <li key={f.id}>
                    <a className="text-blue-600 hover:underline" href={`/files/${f.file_object_id}`} target="_blank" rel="noreferrer">
                      {f.original_name || f.file_object_id}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Status</h2>
            <div className="mt-3">
              <AppSelect
                value={row.status}
                onChange={(e) => patchMutation.mutate({ status: e.target.value })}
                options={STATUS_OPTIONS}
              />
            </div>
            {row.metals_client && (
              <p className="mt-3 text-sm text-gray-600">
                Customer:{' '}
                <Link className="text-blue-600 hover:underline" to={`/metals/customers/${row.metals_client.id}`}>
                  {row.metals_client.name}
                </Link>
              </p>
            )}
            {row.converted_quote && (
              <p className="mt-2 text-sm text-gray-600">
                Quote:{' '}
                <Link className="text-blue-600 hover:underline" to={`/quotes/${row.converted_quote.id}`}>
                  {row.converted_quote.code || row.converted_quote.id}
                </Link>
              </p>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Internal notes</h2>
            <textarea
              className="mt-3 w-full rounded border border-gray-200 px-3 py-2 text-sm"
              rows={5}
              value={notesValue}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
            <div className="mt-2">
              <AppButton
                variant="secondary"
                disabled={patchMutation.isPending}
                onClick={() => patchMutation.mutate({ internal_notes: notesValue })}
              >
                Save notes
              </AppButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function MetalsWebsiteInbox() {
  const { id } = useParams();
  if (id) return <DetailPage />;
  return <ListPage />;
}
