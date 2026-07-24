import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, Download, Mail, Package, Trash2, Upload } from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import { formatDateTimeVancouver } from '@/lib/dateUtils';
import {
  AppBadge,
  AppButton,
  AppInput,
  AppPageHeader,
  AppTextarea,
  uiColors,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type OrderFile = {
  id: string;
  kind: string;
  file_object_id: string;
  original_name?: string | null;
  content_type?: string | null;
  url?: string;
};

type SupplyOrderDetail = {
  id: string;
  order_code: string;
  status: string;
  status_label: string;
  supplier_name?: string | null;
  supplier_email?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  email_to?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  notes?: string | null;
  items?: { id: string; product_name: string; quantity: number }[];
  supplier_order_files?: OrderFile[];
  packing_slip_files?: OrderFile[];
  ordered_at?: string | null;
  received_at?: string | null;
  created_at?: string | null;
};

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

export default function PrintShopSupplyOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const supplierFileRef = useRef<HTMLInputElement>(null);
  const packingFileRef = useRef<HTMLInputElement>(null);
  const [emailTo, setEmailTo] = useState<string | null>(null);
  const [emailSubject, setEmailSubject] = useState<string | null>(null);
  const [emailBody, setEmailBody] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['print-shop-supply-order', id],
    enabled: !!id,
    queryFn: () => api<SupplyOrderDetail>('GET', `/print-shop/supplies/orders/${id}`),
  });

  const row = detailQuery.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['print-shop-supply-order', id] });
    qc.invalidateQueries({ queryKey: ['print-shop-supply-orders'] });
    qc.invalidateQueries({ queryKey: ['print-shop-supply-order-counts'] });
    qc.invalidateQueries({ queryKey: ['print-shop-supplies'] });
  };

  const saveEmailMut = useMutation({
    mutationFn: () =>
      api('PATCH', `/print-shop/supplies/orders/${id}`, {
        email_to: emailTo ?? row?.email_to ?? null,
        email_subject: emailSubject ?? row?.email_subject ?? null,
        email_body: emailBody ?? row?.email_body ?? null,
      }),
    onSuccess: () => {
      toast.success('Email draft saved');
      setEmailTo(null);
      setEmailSubject(null);
      setEmailBody(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save'),
  });

  const markOrderedMut = useMutation({
    mutationFn: () => api('POST', `/print-shop/supplies/orders/${id}/mark-ordered`),
    onSuccess: () => {
      toast.success('Marked as ordered');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const receiveMut = useMutation({
    mutationFn: () => api('POST', `/print-shop/supplies/orders/${id}/receive`),
    onSuccess: () => {
      toast.success('Received — stock updated');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to receive'),
  });

  const cancelMut = useMutation({
    mutationFn: () => api('POST', `/print-shop/supplies/orders/${id}/cancel`),
    onSuccess: () => {
      toast.success('Order cancelled');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to cancel'),
  });

  const uploadMut = useMutation({
    mutationFn: async ({ kind, file }: { kind: string; file: File }) => {
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('file', file);
      return api('POST', `/print-shop/supplies/orders/${id}/files`, fd);
    },
    onSuccess: () => {
      toast.success('File uploaded');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Upload failed'),
  });

  const deleteFileMut = useMutation({
    mutationFn: (fileId: string) =>
      api('DELETE', `/print-shop/supplies/orders/${id}/files/${fileId}`),
    onSuccess: () => {
      toast.success('File removed');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to remove file'),
  });

  if (detailQuery.isLoading) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <p className={uiCx(uiTypography.body, uiColors.textMuted)}>Loading…</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Supply order"
          subtitle="Not found."
          icon={<Package className="h-4 w-4" />}
          onBack={() => navigate('/print-shop/supplies/orders')}
          backLabel="Back to orders"
        />
      </div>
    );
  }

  const to = emailTo ?? row.email_to ?? '';
  const subject = emailSubject ?? row.email_subject ?? '';
  const body = emailBody ?? row.email_body ?? '';
  const canAct = row.status === 'draft' || row.status === 'ordered';

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(body);
      toast.success('Email body copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const openMailto = () => {
    const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  const FileList = ({
    files,
    empty,
  }: {
    files: OrderFile[];
    empty: string;
  }) =>
    files.length === 0 ? (
      <p className={uiCx(uiTypography.body, uiColors.textMuted)}>{empty}</p>
    ) : (
      <ul className="space-y-2">
        {files.map((f) => {
          const isImg = (f.content_type || '').startsWith('image/');
          const url = withFileAccessToken(`/files/${f.file_object_id}`);
          return (
            <li
              key={f.id}
              className="flex items-start gap-3 rounded-lg border border-gray-200 p-2"
            >
              {isImg ? (
                <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={url}
                    alt={f.original_name || 'Attachment'}
                    className="h-16 w-16 object-cover rounded border border-gray-100"
                  />
                </a>
              ) : (
                <div className="h-16 w-16 flex items-center justify-center rounded bg-gray-50 text-xs text-gray-500">
                  PDF
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-gray-800">{f.original_name || f.id}</div>
                <div className="mt-1 flex gap-2">
                  <a
                    href={withFileAccessToken(`/files/${f.file_object_id}/download`)}
                    className="inline-flex items-center gap-1 text-xs text-brand-red hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                  {canAct ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
                      onClick={() => {
                        if (!window.confirm('Remove this file?')) return;
                        deleteFileMut.mutate(f.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={row.order_code}
        subtitle={row.supplier_name || 'Supply order'}
        icon={<Package className="h-4 w-4" />}
        onBack={() => navigate('/print-shop/supplies/orders')}
        backLabel="Back to orders"
        actions={
          <div className={uiLayout.actionsRow}>
            {row.status === 'draft' ? (
              <AppButton
                variant="secondary"
                loading={markOrderedMut.isPending}
                onClick={() => markOrderedMut.mutate()}
              >
                Mark ordered
              </AppButton>
            ) : null}
            {canAct ? (
              <AppButton
                variant="primary"
                loading={receiveMut.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Confirm receipt? Stock will increase by the ordered quantities.'
                    )
                  )
                    return;
                  receiveMut.mutate();
                }}
              >
                Confirm received
              </AppButton>
            ) : null}
            {canAct ? (
              <AppButton
                variant="ghost"
                loading={cancelMut.isPending}
                onClick={() => {
                  if (!window.confirm('Cancel this order?')) return;
                  cancelMut.mutate();
                }}
              >
                Cancel
              </AppButton>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <AppBadge variant={statusVariant(row.status)}>{row.status_label}</AppBadge>
        {row.ordered_at ? (
          <span className={uiTypography.helper}>
            Ordered {formatDateTimeVancouver(row.ordered_at)}
          </span>
        ) : null}
        {row.received_at ? (
          <span className={uiTypography.helper}>
            Received {formatDateTimeVancouver(row.received_at)}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className={uiSpacing.sectionStack}>
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <h2 className={uiTypography.sectionTitle}>Email to supplier</h2>
            </div>
            <p className={uiTypography.helper}>
              Not sent by MK Hub — copy or open in your mail app.
              {row.contact_name ? ` Contact: ${row.contact_name}` : ''}
            </p>
            <AppInput
              label="To"
              value={to}
              onChange={(e) => setEmailTo(e.target.value)}
              disabled={!canAct}
            />
            <AppInput
              label="Subject"
              value={subject}
              onChange={(e) => setEmailSubject(e.target.value)}
              disabled={!canAct}
            />
            <AppTextarea
              label="Body"
              value={body}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={12}
              disabled={!canAct}
            />
            <div className={uiLayout.actionsRow}>
              <AppButton variant="secondary" onClick={() => void copyEmail()}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy body
              </AppButton>
              <AppButton variant="secondary" onClick={openMailto} disabled={!to}>
                Open mailto
              </AppButton>
              {canAct ? (
                <AppButton
                  variant="primary"
                  loading={saveEmailMut.isPending}
                  onClick={() => saveEmailMut.mutate()}
                >
                  Save draft
                </AppButton>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Line items</h2>
            <ul className="divide-y divide-gray-100">
              {(row.items || []).map((it) => (
                <li key={it.id} className="flex justify-between gap-3 py-2">
                  <span className={uiCx(uiTypography.body, uiColors.textStrong)}>
                    {it.product_name}
                  </span>
                  <span className="font-medium text-gray-900 whitespace-nowrap">{it.quantity}x</span>
                </li>
              ))}
            </ul>
            {row.notes ? (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className={uiTypography.helper}>Internal notes</div>
                <p className={uiCx(uiTypography.body, 'mt-1 whitespace-pre-wrap')}>{row.notes}</p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className={uiCx(uiSpacing.sectionStack, 'xl:sticky xl:top-4')}>
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <h2 className={uiTypography.sectionTitle}>Supplier order file</h2>
            <p className={uiTypography.helper}>
              Attach the order / quote file the supplier sends back.
            </p>
            <FileList
              files={row.supplier_order_files || []}
              empty="No supplier order file yet."
            />
            {canAct ? (
              <>
                <input
                  ref={supplierFileRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    uploadMut.mutate({ kind: 'supplier_order', file });
                  }}
                />
                <AppButton
                  variant="secondary"
                  className="w-full"
                  loading={uploadMut.isPending}
                  onClick={() => supplierFileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload supplier file
                </AppButton>
              </>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <h2 className={uiTypography.sectionTitle}>Packing slip photo</h2>
            <p className={uiTypography.helper}>
              Photo of the paper that arrives with the shipment. Upload before or when confirming
              receipt.
            </p>
            <FileList files={row.packing_slip_files || []} empty="No packing slip photo yet." />
            {canAct ? (
              <>
                <input
                  ref={packingFileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    uploadMut.mutate({ kind: 'packing_slip', file });
                  }}
                />
                <AppButton
                  variant="secondary"
                  className="w-full"
                  loading={uploadMut.isPending}
                  onClick={() => packingFileRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload packing slip
                </AppButton>
              </>
            ) : null}
          </div>

          <p className={uiTypography.helper}>
            Stock catalog:{' '}
            <Link to="/print-shop/supplies" className="text-brand-red underline">
              /print-shop/supplies
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
