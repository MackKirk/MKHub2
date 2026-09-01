import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CalendarClock,
  Copy,
  Download,
  FileText,
  Mail,
  Package,
  Pencil,
  Plus,
  Printer,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import { formatDateTimeVancouver } from '@/lib/dateUtils';
import { isNotifiableRequesterEmail } from '@/components/print-shop/printRequestLineItems';
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDatePicker,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppTextarea,
  uiColors,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const PRODUCT_TYPES = [
  { value: 'sign', label: 'Sign' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'other', label: 'Other' },
];
const UNITS = [
  { value: 'in', label: 'Inches' },
  { value: 'cm', label: 'Centimeters' },
  { value: 'ft', label: 'Feet' },
];
const MAX_FILES = 10;
const MAX_ITEMS = 20;
const MAX_MB = 15;

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

type NewArtwork = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type EditItem = {
  key: string;
  productType: string;
  title: string;
  description: string;
  quantity: string;
  width: string;
  height: string;
  unit: string;
  keepFiles: Artwork[];
  newFiles: NewArtwork[];
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

function isImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);
}

function isAllowedArtwork(file: File) {
  const okType = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'].includes(file.type);
  const okExt = /\.(pdf|png|jpe?g)$/i.test(file.name);
  return okType || okExt;
}

function newEditItem(seed?: Partial<EditItem>): EditItem {
  return {
    key: `item-${Math.random().toString(36).slice(2)}`,
    productType: seed?.productType || 'sign',
    title: seed?.title || '',
    description: seed?.description || '',
    quantity: seed?.quantity || '1',
    width: seed?.width || '',
    height: seed?.height || '',
    unit: seed?.unit || 'in',
    keepFiles: seed?.keepFiles || [],
    newFiles: seed?.newFiles || [],
  };
}

function draftFromRow(row: PrintShopRequestDetail): {
  requesterName: string;
  requesterEmail: string;
  dueDate: string;
  createdAt: string;
  notes: string;
  items: EditItem[];
} {
  const items =
    row.items && row.items.length > 0
      ? row.items.map((it) =>
          newEditItem({
            productType: it.product_type || 'sign',
            title: it.title || '',
            description: it.description || '',
            quantity: String(it.quantity ?? 1),
            width: it.width != null ? String(it.width) : '',
            height: it.height != null ? String(it.height) : '',
            unit: it.unit || 'in',
            keepFiles: [...(it.files || [])],
            newFiles: [],
          })
        )
      : [newEditItem()];
  return {
    requesterName: row.requester_name || '',
    requesterEmail: isNotifiableRequesterEmail(row.requester_email) ? row.requester_email : '',
    dueDate: row.due_date?.slice(0, 10) || '',
    createdAt: row.created_at?.slice(0, 10) || '',
    notes: row.notes || '',
    items,
  };
}

function revokeNewFiles(items: EditItem[]) {
  items.forEach((it) => {
    it.newFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
  });
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

  const [editing, setEditing] = useState(false);
  const [editRequesterName, setEditRequesterName] = useState('');
  const [editRequesterEmail, setEditRequesterEmail] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editCreatedAt, setEditCreatedAt] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<EditItem[]>([]);

  const detailQuery = useQuery({
    queryKey: ['print-shop-request', id],
    enabled: !!id,
    queryFn: () => api<PrintShopRequestDetail>('GET', `/print-shop/requests/${id}`),
  });

  const row = detailQuery.data;
  const notesValue = internalNotes ?? row?.internal_notes ?? '';
  const canNotifyRequester = isNotifiableRequesterEmail(row?.requester_email);

  useEffect(() => {
    setEstimateHydrated(false);
    setEstimateDate('');
    setEstimateMessage('');
    setShowReady(false);
    setPickupLocation('');
    setSendReadyEmail(false);
    setEditing(false);
    setEditItems((prev) => {
      revokeNewFiles(prev);
      return [];
    });
  }, [id]);

  useEffect(() => {
    if (!row || estimateHydrated) return;
    setEstimateDate(row.estimated_delivery_date?.slice(0, 10) || '');
    setEstimateMessage(row.estimate_message || '');
    setPickupLocation(row.pickup_location || '');
    setSendReadyEmail(isNotifiableRequesterEmail(row.requester_email));
    setEstimateHydrated(true);
  }, [row, estimateHydrated]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['print-shop-request', id] });
    qc.invalidateQueries({ queryKey: ['print-shop-requests'] });
    qc.invalidateQueries({ queryKey: ['print-shop-request-counts'] });
  };

  const startEdit = () => {
    if (!row) return;
    setShowCancel(false);
    setShowReady(false);
    setEditItems((prev) => {
      revokeNewFiles(prev);
      return [];
    });
    const draft = draftFromRow(row);
    setEditRequesterName(draft.requesterName);
    setEditRequesterEmail(draft.requesterEmail);
    setEditDueDate(draft.dueDate);
    setEditCreatedAt(draft.createdAt);
    setEditNotes(draft.notes);
    setEditItems(draft.items);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditItems((prev) => {
      revokeNewFiles(prev);
      return [];
    });
    setEditing(false);
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
        send_email: canNotifyRequester && sendReadyEmail,
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
      else if (!isNotifiableRequesterEmail(row?.requester_email)) {
        toast.success('Estimate saved (no requester email to notify)');
      } else {
        toast.success('Estimate saved (email not sent — check SMTP settings)');
      }
      setEstimateHydrated(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to send estimate'),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!editRequesterName.trim()) throw new Error('Requester name is required');
      if (editRequesterEmail.trim() && !isNotifiableRequesterEmail(editRequesterEmail)) {
        throw new Error('Enter a valid requester email, or leave it blank');
      }
      for (let i = 0; i < editItems.length; i++) {
        const it = editItems[i];
        if (!it.title.trim()) throw new Error(`Title is required on item ${i + 1}`);
        const qty = Number(it.quantity);
        if (!Number.isFinite(qty) || qty < 1) {
          throw new Error(`Quantity must be at least 1 on item ${i + 1}`);
        }
      }

      const fd = new FormData();
      fd.append('requester_name', editRequesterName.trim());
      fd.append('requester_email', editRequesterEmail.trim());
      if (editDueDate) fd.append('due_date', editDueDate);
      if (editCreatedAt) fd.append('created_at', editCreatedAt);
      if (editNotes.trim()) fd.append('notes', editNotes.trim());
      fd.append(
        'items_json',
        JSON.stringify(
          editItems.map((it) => ({
            product_type: it.productType,
            title: it.title.trim(),
            description: it.description.trim() || null,
            quantity: Number(it.quantity),
            width: it.width === '' ? null : Number(it.width),
            height: it.height === '' ? null : Number(it.height),
            unit: it.unit,
            keep_file_ids: it.keepFiles.map((f) => f.id),
          }))
        )
      );
      editItems.forEach((it, idx) => {
        it.newFiles.forEach((nf) => fd.append(`artwork_${idx}`, nf.file, nf.file.name));
      });
      return api<PrintShopRequestDetail>('POST', `/print-shop/requests/${id}/update`, fd);
    },
    onSuccess: () => {
      toast.success('Request updated');
      setEditItems((prev) => {
        revokeNewFiles(prev);
        return [];
      });
      setEditing(false);
      setEstimateHydrated(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update request'),
  });

  const updateEditItem = (key: string, patch: Partial<EditItem>) => {
    setEditItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const addEditItem = () => {
    if (editItems.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} items`);
      return;
    }
    setEditItems((prev) => [...prev, newEditItem()]);
  };

  const duplicateEditItem = (key: string) => {
    if (editItems.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} items`);
      return;
    }
    setEditItems((prev) => {
      const idx = prev.findIndex((it) => it.key === key);
      if (idx < 0) return prev;
      const src = prev[idx];
      const clone = newEditItem({
        productType: src.productType,
        title: src.title,
        description: src.description,
        quantity: src.quantity,
        width: src.width,
        height: src.height,
        unit: src.unit,
        keepFiles: [...src.keepFiles],
        newFiles: src.newFiles.map((f) => ({
          id: `${f.file.name}-${Math.random().toString(36).slice(2)}`,
          file: f.file,
          previewUrl: isImageFile(f.file) ? URL.createObjectURL(f.file) : null,
        })),
      });
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  };

  const removeEditItem = (key: string) => {
    setEditItems((prev) => {
      if (prev.length <= 1) {
        toast.error('At least one item is required');
        return prev;
      }
      const target = prev.find((it) => it.key === key);
      if (target) revokeNewFiles([target]);
      return prev.filter((it) => it.key !== key);
    });
  };

  const addNewFiles = (key: string, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const room = MAX_FILES - it.keepFiles.length - it.newFiles.length;
        if (room <= 0) {
          toast.error(`Maximum ${MAX_FILES} files per item`);
          return it;
        }
        const accepted: NewArtwork[] = [];
        for (const file of incoming) {
          if (accepted.length >= room) {
            toast.error(`Maximum ${MAX_FILES} files per item`);
            break;
          }
          if (!isAllowedArtwork(file)) {
            toast.error(`${file.name}: must be PDF, PNG, or JPG`);
            continue;
          }
          if (file.size > MAX_MB * 1024 * 1024) {
            toast.error(`${file.name}: too large (max ${MAX_MB} MB)`);
            continue;
          }
          accepted.push({
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
            file,
            previewUrl: isImageFile(file) ? URL.createObjectURL(file) : null,
          });
        }
        return accepted.length ? { ...it, newFiles: [...it.newFiles, ...accepted] } : it;
      })
    );
  };

  const removeKeepFile = (itemKey: string, fileId: string) => {
    setEditItems((prev) =>
      prev.map((it) =>
        it.key === itemKey
          ? { ...it, keepFiles: it.keepFiles.filter((f) => f.id !== fileId) }
          : it
      )
    );
  };

  const removeNewFile = (itemKey: string, artworkId: string) => {
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.key !== itemKey) return it;
        const next: NewArtwork[] = [];
        for (const f of it.newFiles) {
          if (f.id === artworkId) {
            if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
          } else {
            next.push(f);
          }
        }
        return { ...it, newFiles: next };
      })
    );
  };

  const openFile = (fileObjectId: string) => {
    window.open(withFileAccessToken(`/files/${fileObjectId}`), '_blank', 'noopener,noreferrer');
  };

  const downloadFile = async (fileObjectId: string) => {
    try {
      const r = await api<{ download_url?: string }>(
        'GET',
        withFileAccessToken(`/files/${fileObjectId}/download`)
      );
      const url = String(r.download_url || '');
      if (!url) {
        toast.error('Download link unavailable');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Download link unavailable');
    }
  };

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
  const canSendEstimate = canAct && !editing;

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
            {canAct && !editing ? (
              <AppButton
                variant="secondary"
                onClick={startEdit}
              >
                <Pencil className="h-4 w-4" />
                Edit request
              </AppButton>
            ) : null}
            {editing ? (
              <>
                <AppButton
                  variant="primary"
                  loading={updateMut.isPending}
                  onClick={() => updateMut.mutate()}
                >
                  Save changes
                </AppButton>
                <AppButton variant="ghost" onClick={cancelEdit} disabled={updateMut.isPending}>
                  Cancel edit
                </AppButton>
              </>
            ) : null}
            {!editing && row.status === 'todo' ? (
              <AppButton
                variant="primary"
                loading={startMut.isPending}
                onClick={() => startMut.mutate()}
              >
                Start production
              </AppButton>
            ) : null}
            {!editing && row.status === 'in_production' ? (
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
            {canAct && !editing ? (
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

      {showReady && !editing ? (
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
            checked={canNotifyRequester && sendReadyEmail}
            onChange={setSendReadyEmail}
            disabled={!canNotifyRequester}
            fieldHint={
              !canNotifyRequester
                ? 'No requester email on this request — status will still move to Ready.'
                : sendReadyEmail
                  ? 'Includes the pickup location in the email.'
                  : 'Status will still move to Ready — no email sent.'
            }
          />
          <div className={uiLayout.actionsRow}>
            <AppButton
              variant="primary"
              loading={readyMut.isPending}
              disabled={canNotifyRequester && sendReadyEmail && !pickupLocation.trim()}
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

      {showCancel && !editing ? (
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
          {editing ? (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                <h2 className={uiTypography.sectionTitle}>Requester</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <AppInput
                    label="Name"
                    required
                    value={editRequesterName}
                    onChange={(e) => setEditRequesterName(e.target.value)}
                  />
                  <AppInput
                    label="Email"
                    type="email"
                    value={editRequesterEmail}
                    onChange={(e) => setEditRequesterEmail(e.target.value)}
                    helperText="Optional. Leave blank if you will not notify them."
                  />
                  <AppDatePicker
                    label="Created date"
                    value={editCreatedAt}
                    onChange={(e) => setEditCreatedAt(e.target.value)}
                    fieldHint="Use the original date when logging historical print jobs."
                  />
                  <AppDatePicker
                    label="Requested by date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                </div>
                <AppTextarea
                  label="Requester notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className={uiCx(uiLayout.actionsRow, 'justify-between items-center')}>
                <div>
                  <h2 className={uiTypography.sectionTitle}>Line items</h2>
                  <p className={uiTypography.helper}>
                    {editItems.length} item{editItems.length === 1 ? '' : 's'}
                  </p>
                </div>
                <AppButton type="button" variant="secondary" onClick={addEditItem}>
                  <Plus className="h-4 w-4" />
                  Add item
                </AppButton>
              </div>

              {editItems.map((item, idx) => (
                <EditItemCard
                  key={item.key}
                  index={idx}
                  item={item}
                  canRemove={editItems.length > 1}
                  onChange={(patch) => updateEditItem(item.key, patch)}
                  onDuplicate={() => duplicateEditItem(item.key)}
                  onRemove={() => removeEditItem(item.key)}
                  onAddFiles={(files) => addNewFiles(item.key, files)}
                  onRemoveKeep={(fileId) => removeKeepFile(item.key, fileId)}
                  onRemoveNew={(artworkId) => removeNewFile(item.key, artworkId)}
                />
              ))}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <MetaChip
                  icon={<UserRound className="h-4 w-4" />}
                  label="Requester"
                  value={
                    <div>
                      <div>{row.requester_name}</div>
                      {isNotifiableRequesterEmail(row.requester_email) ? (
                        <a
                          className="text-brand-red underline text-xs"
                          href={`mailto:${row.requester_email}`}
                        >
                          {row.requester_email}
                        </a>
                      ) : (
                        <div className="text-xs text-gray-500">No email</div>
                      )}
                    </div>
                  }
                />
                <MetaChip
                  icon={<CalendarClock className="h-4 w-4" />}
                  label="Requested by"
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
                                <button
                                  type="button"
                                  onClick={() => openFile(f.id)}
                                  className="aspect-square w-full bg-white flex items-center justify-center"
                                >
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
                                </button>
                                <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-white px-2 py-1.5">
                                  <p
                                    className="truncate text-[11px] text-gray-600"
                                    title={f.original_name || ''}
                                  >
                                    {f.original_name || f.id}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => downloadFile(f.id)}
                                    className="inline-flex shrink-0 items-center gap-1 text-xs text-brand-red hover:underline"
                                    title="Download"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
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
            </>
          )}
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
                  label="Estimated ready date"
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
                  {canNotifyRequester
                    ? row.estimate_emailed_at
                      ? 'Update & email estimate'
                      : 'Send estimate email'
                    : row.estimated_delivery_date
                      ? 'Update estimate'
                      : 'Save estimate'}
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
                  {editing
                    ? 'Finish or cancel editing to send estimates.'
                    : 'Estimates can only be sent while the request is open.'}
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
              disabled={editing}
            />
            <div className="mt-3">
              <AppButton
                variant="secondary"
                loading={saveNotesMut.isPending}
                onClick={() => saveNotesMut.mutate()}
                disabled={editing}
              >
                Save notes
              </AppButton>
            </div>
          </div>

          <p className={uiTypography.helper}>
            Log from email:{' '}
            <Link to="/print-shop/new" className="text-brand-red underline">
              /print-shop/new
            </Link>
            {' · '}
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

function EditItemCard({
  index,
  item,
  canRemove,
  onChange,
  onDuplicate,
  onRemove,
  onAddFiles,
  onRemoveKeep,
  onRemoveNew,
}: {
  index: number;
  item: EditItem;
  canRemove: boolean;
  onChange: (patch: Partial<EditItem>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddFiles: (files: FileList | null) => void;
  onRemoveKeep: (fileId: string) => void;
  onRemoveNew: (artworkId: string) => void;
}) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalFiles = item.keepFiles.length + item.newFiles.length;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className={uiCx(uiTypography.helper, 'uppercase tracking-wide')}>Item {index + 1}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            title="Duplicate item"
          >
            <Copy className="h-4 w-4" />
          </button>
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700"
              title="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-2">
            <AppSelect
              label="Type"
              required
              value={item.productType}
              onChange={(e) => onChange({ productType: e.target.value })}
              options={PRODUCT_TYPES}
            />
          </div>
          <div className="sm:col-span-6">
            <AppInput
              label="Title"
              required
              value={item.title}
              onChange={(e) => onChange({ title: e.target.value })}
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
              options={UNITS}
            />
          </div>
        </div>

        <AppTextarea
          label="Description"
          value={item.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label className={uiTypography.controlLabel} htmlFor={fileInputId}>
              Example / art reference
              <span className={uiCx(uiTypography.helper, 'ml-1 font-normal')}>
                ({totalFiles}/{MAX_FILES})
              </span>
            </label>
            <input
              id={fileInputId}
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={(e) => {
                onAddFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={totalFiles >= MAX_FILES}
            >
              <Plus className="h-4 w-4" />
              Add files
            </AppButton>
          </div>

          {totalFiles > 0 ? (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {item.keepFiles.map((f) => {
                const isImg = (f.content_type || '').startsWith('image/');
                const thumb = withFileAccessToken(`/files/${f.id}`);
                return (
                  <li key={f.id} className="relative overflow-hidden rounded-lg border border-gray-200">
                    <div className="aspect-square bg-white flex items-center justify-center">
                      {isImg ? (
                        <img src={thumb} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <FileText className="h-6 w-6 text-gray-300" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveKeep(f.id)}
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow border border-gray-200 hover:bg-red-50 hover:text-red-700"
                      title="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <p className="truncate px-1.5 py-1 text-[11px] text-gray-600">
                      {f.original_name || f.id}
                    </p>
                  </li>
                );
              })}
              {item.newFiles.map((f) => (
                <li key={f.id} className="relative overflow-hidden rounded-lg border border-emerald-200">
                  <div className="aspect-square bg-white flex items-center justify-center">
                    {f.previewUrl ? (
                      <img src={f.previewUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <FileText className="h-6 w-6 text-gray-300" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveNew(f.id)}
                    className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow border border-gray-200 hover:bg-red-50 hover:text-red-700"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <p className="truncate px-1.5 py-1 text-[11px] text-emerald-700">{f.file.name}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className={uiTypography.helper}>No reference files</p>
          )}
        </div>
      </div>
    </div>
  );
}
