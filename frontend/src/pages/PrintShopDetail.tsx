import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarClock,
  Download,
  FileText,
  Mail,
  Package,
  Printer,
  UserRound,
} from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import { formatDateTimeVancouver } from '@/lib/dateUtils';
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDatePicker,
  AppInput,
  AppPageHeader,
  AppTextarea,
  uiColors,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Artwork = {
  id: string;
  content_type?: string | null;
  original_name?: string | null;
  size_bytes?: number | null;
  url?: string;
};

type LineItem = {
  id?: string | null;
  sort_index?: number;
  product_type: string;
  product_type_label: string;
  title: string;
  description?: string | null;
  quantity: number;
  width?: number | null;
  height?: number | null;
  unit: string;
  files?: Artwork[];
};

type PrintShopRequestDetail = {
  id: string;
  request_code: string;
  status: string;
  status_label: string;
  title: string;
  item_count?: number;
  items?: LineItem[];
  due_date?: string | null;
  estimated_delivery_date?: string | null;
  estimate_message?: string | null;
  pickup_location?: string | null;
  requester_name: string;
  requester_email: string;
  notes?: string | null;
  internal_notes?: string | null;
  cancelled_reason?: string | null;
  received_emailed_at?: string | null;
  estimate_emailed_at?: string | null;
  ready_emailed_at?: string | null;
  created_at?: string | null;
  email_sent?: boolean;
  email_skipped?: boolean;
};

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

function formatDisplayDate(iso?: string | null) {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d;
  }
}

function MetaChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-lg border border-gray-200/80 bg-white px-3 py-2.5">
      <span className="mt-0.5 text-gray-400">{icon}</span>
      <div className="min-w-0">
        <div className={uiCx(uiTypography.helper, 'leading-none')}>{label}</div>
        <div className={uiCx(uiTypography.body, uiColors.textStrong, 'mt-1 break-words')}>{value}</div>
      </div>
    </div>
  );
}

export default function PrintShopDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [internalNotes, setInternalNotes] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [estimateDate, setEstimateDate] = useState('');
  const [estimateMessage, setEstimateMessage] = useState('');
  const [estimateHydrated, setEstimateHydrated] = useState(false);
  const [showReady, setShowReady] = useState(false);
  const [pickupLocation, setPickupLocation] = useState('');
  const [sendReadyEmail, setSendReadyEmail] = useState(true);

  const detailQuery = useQuery({
    queryKey: ['print-shop-request', id],
    enabled: !!id,
    queryFn: () => api<PrintShopRequestDetail>('GET', `/print-shop/requests/${id}`),
  });

  const row = detailQuery.data;
  const notesValue = internalNotes ?? row?.internal_notes ?? '';

  useEffect(() => {
    setEstimateHydrated(false);
    setEstimateDate('');
    setEstimateMessage('');
    setShowReady(false);
    setPickupLocation('');
    setSendReadyEmail(true);
  }, [id]);

  useEffect(() => {
    if (!row || estimateHydrated) return;
    setEstimateDate(row.estimated_delivery_date?.slice(0, 10) || '');
    setEstimateMessage(row.estimate_message || '');
    setPickupLocation(row.pickup_location || '');
    setEstimateHydrated(true);
  }, [row, estimateHydrated]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['print-shop-request', id] });
    qc.invalidateQueries({ queryKey: ['print-shop-requests'] });
    qc.invalidateQueries({ queryKey: ['print-shop-request-counts'] });
  };

  const startMut = useMutation({
    mutationFn: () => api('POST', `/print-shop/requests/${id}/start`),
    onSuccess: () => {
      toast.success('Moved to In Production');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to start'),
  });

  const readyMut = useMutation({
    mutationFn: () =>
      api<PrintShopRequestDetail>('POST', `/print-shop/requests/${id}/mark-ready`, {
        pickup_location: pickupLocation.trim() || null,
        send_email: sendReadyEmail,
      }),
    onSuccess: (data) => {
      if (data?.email_skipped) toast.success('Marked ready — email not sent');
      else if (data?.email_sent) toast.success('Marked ready — pickup email sent');
      else toast.success('Marked ready (email not sent — check SMTP settings)');
      setShowReady(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to mark ready'),
  });

  const cancelMut = useMutation({
    mutationFn: () =>
      api('POST', `/print-shop/requests/${id}/cancel`, { reason: cancelReason.trim() || null }),
    onSuccess: () => {
      toast.success('Request cancelled');
      setShowCancel(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to cancel'),
  });

  const saveNotesMut = useMutation({
    mutationFn: () =>
      api('PATCH', `/print-shop/requests/${id}`, { internal_notes: notesValue }),
    onSuccess: () => {
      toast.success('Internal notes saved');
      setInternalNotes(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save notes'),
  });

  const estimateMut = useMutation({
    mutationFn: () =>
      api<PrintShopRequestDetail>('POST', `/print-shop/requests/${id}/send-estimate`, {
        estimated_delivery_date: estimateDate,
        message: estimateMessage.trim() || null,
      }),
    onSuccess: (data) => {
      if (data?.email_sent) toast.success('Estimate emailed to requester');
      else toast.success('Estimate saved (email not sent — check SMTP settings)');
      setEstimateHydrated(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send estimate'),
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
          title="Print request"
          subtitle="Request not found."
          icon={<Printer className="h-4 w-4" />}
          onBack={() => navigate('/print-shop')}
          backLabel="Back to Print Shop"
        />
      </div>
    );
  }

  const lineItems = row.items && row.items.length > 0 ? row.items : [];
  const canAct = row.status === 'todo' || row.status === 'in_production';
  const canSendEstimate = canAct;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={row.request_code}
        subtitle={row.title}
        icon={<Printer className="h-4 w-4" />}
        onBack={() => navigate('/print-shop')}
        backLabel="Back to Print Shop"
        actions={
          <div className={uiLayout.actionsRow}>
            {row.status === 'todo' ? (
              <AppButton
                variant="primary"
                loading={startMut.isPending}
                onClick={() => startMut.mutate()}
              >
                Start production
              </AppButton>
            ) : null}
            {row.status === 'in_production' ? (
              <AppButton
                variant="primary"
                onClick={() => {
                  setShowCancel(false);
                  setShowReady((v) => !v);
                }}
              >
                Mark ready
              </AppButton>
            ) : null}
            {canAct ? (
              <AppButton
                variant="secondary"
                onClick={() => {
                  setShowReady(false);
                  setShowCancel((v) => !v);
                }}
              >
                Cancel
              </AppButton>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <AppBadge variant={statusBadgeVariant(row.status)}>{row.status_label}</AppBadge>
        {row.item_count ? (
          <span className={uiTypography.helper}>
            {row.item_count} item{row.item_count === 1 ? '' : 's'}
          </span>
        ) : null}
        {row.estimated_delivery_date ? (
          <span className={uiCx(uiTypography.helper, 'inline-flex items-center gap-1')}>
            <CalendarClock className="h-3.5 w-3.5" />
            Est. {formatDisplayDate(row.estimated_delivery_date)}
          </span>
        ) : null}
        {row.pickup_location ? (
          <span className={uiCx(uiTypography.helper, 'inline-flex items-center gap-1')}>
            <Package className="h-3.5 w-3.5" />
            Pickup: {row.pickup_location}
          </span>
        ) : null}
      </div>

      {showReady ? (
        <div className={uiCx('rounded-lg border border-emerald-200 bg-emerald-50/60 p-4', uiSpacing.sectionStack, 'max-w-xl')}>
          <p className={uiTypography.helper}>
            Confirm pickup details. Uncheck the email if you are handing this over in person.
          </p>
          <AppInput
            label="Pickup location"
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            placeholder="e.g. Mack Kirk office — front desk"
          />
          <AppCheckbox
            label="Send ready email to requester"
            checked={sendReadyEmail}
            onChange={setSendReadyEmail}
            fieldHint={
              sendReadyEmail
                ? 'Includes the pickup location in the email.'
                : 'Status will still move to Ready — no email sent.'
            }
          />
          <div className={uiLayout.actionsRow}>
            <AppButton
              variant="primary"
              loading={readyMut.isPending}
              disabled={sendReadyEmail && !pickupLocation.trim()}
              onClick={() => readyMut.mutate()}
            >
              Confirm ready
            </AppButton>
            <AppButton variant="ghost" onClick={() => setShowReady(false)}>
              Keep in production
            </AppButton>
          </div>
        </div>
      ) : null}

      {showCancel ? (
        <div className={uiCx('rounded-lg border border-rose-200 bg-rose-50/60 p-4', uiSpacing.sectionStack, 'max-w-xl')}>
          <AppTextarea
            label="Cancel reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
          />
          <div className={uiLayout.actionsRow}>
            <AppButton
              variant="danger"
              loading={cancelMut.isPending}
              onClick={() => cancelMut.mutate()}
            >
              Confirm cancel
            </AppButton>
            <AppButton variant="ghost" onClick={() => setShowCancel(false)}>
              Keep request
            </AppButton>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className={uiSpacing.sectionStack}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetaChip
              icon={<UserRound className="h-4 w-4" />}
              label="Requester"
              value={
                <div>
                  <div>{row.requester_name}</div>
                  <a
                    className="text-brand-red underline text-xs"
                    href={`mailto:${row.requester_email}`}
                  >
                    {row.requester_email}
                  </a>
                </div>
              }
            />
            <MetaChip
              icon={<CalendarClock className="h-4 w-4" />}
              label="Requested delivery"
              value={formatDisplayDate(row.due_date)}
            />
            <MetaChip
              icon={<Package className="h-4 w-4" />}
              label="Submitted"
              value={row.created_at ? formatDateTimeVancouver(row.created_at) : '—'}
            />
            <MetaChip
              icon={<Mail className="h-4 w-4" />}
              label="Emails"
              value={
                <div className="space-y-0.5 text-xs">
                  <div>
                    Received:{' '}
                    {row.received_emailed_at
                      ? formatDateTimeVancouver(row.received_emailed_at)
                      : 'not sent'}
                  </div>
                  <div>
                    Estimate:{' '}
                    {row.estimate_emailed_at
                      ? formatDateTimeVancouver(row.estimate_emailed_at)
                      : 'not sent'}
                  </div>
                  <div>
                    Ready:{' '}
                    {row.ready_emailed_at
                      ? formatDateTimeVancouver(row.ready_emailed_at)
                      : 'not sent'}
                  </div>
                </div>
              }
            />
          </div>

          {row.notes || row.cancelled_reason ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              {row.notes ? (
                <div>
                  <div className={uiTypography.controlLabel}>Requester notes</div>
                  <p className={uiCx(uiTypography.body, uiColors.textStrong, 'mt-1 whitespace-pre-wrap')}>
                    {row.notes}
                  </p>
                </div>
              ) : null}
              {row.cancelled_reason ? (
                <div>
                  <div className={uiTypography.controlLabel}>Cancel reason</div>
                  <p className={uiCx(uiTypography.body, 'mt-1 text-rose-700')}>{row.cancelled_reason}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-3">
            <h2 className={uiTypography.sectionTitle}>Line items</h2>
            <span className={uiTypography.helper}>
              {lineItems.length} item{lineItems.length === 1 ? '' : 's'}
            </span>
          </div>

          {lineItems.map((item, idx) => {
            const files = item.files || [];
            return (
              <div
                key={item.id || idx}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm shadow-gray-100/80"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white px-4 py-3">
                  <div className="min-w-0">
                    <div className={uiCx(uiTypography.helper, 'uppercase tracking-wide')}>
                      Item {idx + 1}
                    </div>
                    <h3 className={uiCx(uiTypography.sectionTitle, 'truncate')}>{item.title}</h3>
                  </div>
                  <AppBadge variant="neutral">{item.product_type_label}</AppBadge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-4 py-3 border-b border-gray-100">
                  <div>
                    <div className={uiTypography.helper}>Quantity</div>
                    <div className={uiCx(uiTypography.body, uiColors.textStrong, 'mt-0.5')}>
                      {item.quantity}
                    </div>
                  </div>
                  <div>
                    <div className={uiTypography.helper}>Size</div>
                    <div className={uiCx(uiTypography.body, uiColors.textStrong, 'mt-0.5')}>
                      {item.width != null || item.height != null
                        ? `${item.width ?? '?'} × ${item.height ?? '?'} ${item.unit}`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className={uiTypography.helper}>Description</div>
                    <div className={uiCx(uiTypography.body, uiColors.textStrong, 'mt-0.5')}>
                      {item.description || '—'}
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-gray-400" />
                    <p className={uiTypography.controlLabel}>Example / art reference</p>
                  </div>
                  {files.length > 0 ? (
                    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {files.map((f) => {
                        const isImg = (f.content_type || '').startsWith('image/');
                        const thumb = withFileAccessToken(`/files/${f.id}`);
                        return (
                          <li
                            key={f.id}
                            className="group overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                          >
                            <div className="aspect-square bg-white flex items-center justify-center">
                              {isImg ? (
                                <img
                                  src={thumb}
                                  alt={f.original_name || 'Reference'}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <div className="flex flex-col items-center gap-1 px-2 text-center">
                                  <FileText className="h-6 w-6 text-gray-300" />
                                  <p className={uiTypography.helper}>{f.original_name || 'PDF'}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-white px-2 py-1.5">
                              <p
                                className="truncate text-[11px] text-gray-600"
                                title={f.original_name || ''}
                              >
                                {f.original_name || f.id}
                              </p>
                              <a
                                href={withFileAccessToken(`/files/${f.id}/download`)}
                                className="inline-flex shrink-0 items-center gap-1 text-xs text-brand-red hover:underline"
                                target="_blank"
                                rel="noreferrer"
                                title="Download"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className={uiCx(uiTypography.body, uiColors.textMuted)}>
                      No reference file — description only
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <aside className={uiCx(uiSpacing.sectionStack, 'xl:sticky xl:top-4')}>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-gray-100/80">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-gray-500" />
              <h2 className={uiTypography.sectionTitle}>Estimated delivery</h2>
            </div>
            <p className={uiCx(uiTypography.helper, 'mb-3')}>
              Set a date and optional note, then email the requester. The message explains this is an
              estimate based on current print demand.
            </p>

            {canSendEstimate ? (
              <div className={uiSpacing.sectionStack}>
                <AppDatePicker
                  label="Estimated ready / delivery date"
                  value={estimateDate}
                  onChange={(e) => setEstimateDate(e.target.value)}
                />
                <AppTextarea
                  label="Message to requester (optional)"
                  value={estimateMessage}
                  onChange={(e) => setEstimateMessage(e.target.value)}
                  rows={4}
                  placeholder="e.g. High volume this week — aiming for mid-week pickup."
                />
                <AppButton
                  variant="primary"
                  className="w-full"
                  loading={estimateMut.isPending}
                  disabled={!estimateDate}
                  onClick={() => estimateMut.mutate()}
                >
                  {row.estimate_emailed_at ? 'Update & email estimate' : 'Send estimate email'}
                </AppButton>
                {row.estimate_emailed_at ? (
                  <p className={uiTypography.helper}>
                    Last emailed {formatDateTimeVancouver(row.estimate_emailed_at)}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <div className={uiTypography.helper}>Estimated date</div>
                  <div className={uiCx(uiTypography.body, uiColors.textStrong)}>
                    {formatDisplayDate(row.estimated_delivery_date)}
                  </div>
                </div>
                {row.estimate_message ? (
                  <div>
                    <div className={uiTypography.helper}>Message sent</div>
                    <p className={uiCx(uiTypography.body, 'mt-0.5 whitespace-pre-wrap')}>
                      {row.estimate_message}
                    </p>
                  </div>
                ) : null}
                <p className={uiTypography.helper}>
                  Estimates can only be sent while the request is open.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-gray-100/80">
            <h2 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Internal notes</h2>
            <AppTextarea
              value={notesValue}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={5}
              placeholder="Visible only to print shop staff…"
            />
            <div className="mt-3">
              <AppButton
                variant="secondary"
                loading={saveNotesMut.isPending}
                onClick={() => saveNotesMut.mutate()}
              >
                Save notes
              </AppButton>
            </div>
          </div>

          <p className={uiTypography.helper}>
            Public form:{' '}
            <Link to="/print-request" className="text-brand-red underline">
              /print-request
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
