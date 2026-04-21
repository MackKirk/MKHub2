import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  expiryBadgeClass,
  expiryLabel,
  expiresWithinDays,
  isCardExpired,
} from '@/lib/companyCreditCardExpiry';

type CardDto = {
  id: string;
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  cardholder_name?: string | null;
  issuer?: string | null;
  billing_entity?: string | null;
  status: string;
  notes?: string | null;
};

type AssignmentRow = {
  id: string;
  assigned_to_user_id: string;
  assigned_at: string;
  returned_at?: string | null;
  assigned_to_name?: string | null;
  notes?: string | null;
  is_active: boolean;
};

const NETWORK_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  other: 'Other',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  cancelled: 'Cancelled',
  replaced: 'Replaced',
  lost: 'Lost',
};

function empLabel(e: any): string {
  const n = (e?.name || '').trim();
  if (n) return n;
  const f = (e?.first_name || e?.profile?.first_name || '').trim();
  const l = (e?.last_name || e?.profile?.last_name || '').trim();
  const full = [f, l].filter(Boolean).join(' ');
  return full || e?.username || '—';
}

function CardHeroVisual({ network, lastFour }: { network: string; lastFour: string }) {
  const n = (network || 'other').toLowerCase();
  const grad =
    n === 'amex'
      ? 'from-blue-800 via-blue-900 to-slate-950'
      : n === 'mastercard'
        ? 'from-zinc-800 via-stone-900 to-neutral-950'
        : n === 'visa'
          ? 'from-slate-800 via-indigo-950 to-slate-950'
          : 'from-gray-700 via-gray-800 to-gray-950';
  const netDisplay = NETWORK_LABEL[n] || 'Card';
  return (
    <div
      className={`relative flex h-[4.75rem] w-[7.5rem] shrink-0 flex-col justify-between rounded-xl bg-gradient-to-br ${grad} p-2.5 shadow-lg shadow-black/20 ring-1 ring-white/15`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="h-5 w-8 rounded bg-gradient-to-br from-amber-100 to-amber-200/90 shadow-inner" aria-hidden />
        <span className="max-w-[4rem] truncate text-[8px] font-bold uppercase tracking-wider text-white/75">{netDisplay}</span>
      </div>
      <div className="font-mono text-[13px] font-medium tracking-[0.18em] text-white drop-shadow-sm">•••• {lastFour}</div>
    </div>
  );
}

export default function CompanyCreditCardDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'details' | 'custody'>('details');
  const [showAssign, setShowAssign] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [returnNotes, setReturnNotes] = useState('');

  const [editLabel, setEditLabel] = useState('');
  const [editNetwork, setEditNetwork] = useState('visa');
  const [editLastFour, setEditLastFour] = useState('');
  const [editMonth, setEditMonth] = useState('1');
  const [editYear, setEditYear] = useState(String(new Date().getFullYear()));
  const [editHolder, setEditHolder] = useState('');
  const [editIssuer, setEditIssuer] = useState('');
  const [editBilling, setEditBilling] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editNotes, setEditNotes] = useState('');

  const isValidId = id && id !== 'new';

  const { data: card, isLoading } = useQuery({
    queryKey: ['company-credit-card', id],
    queryFn: () => api<CardDto>('GET', `/company-credit-cards/${id}`),
    enabled: !!isValidId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['company-credit-card-assignments', id],
    queryFn: () => api<AssignmentRow[]>('GET', `/company-credit-cards/${id}/assignments`),
    enabled: !!isValidId,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdministrator = !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');

  useEffect(() => {
    if (!card) return;
    setEditLabel(card.label);
    setEditNetwork(card.network);
    setEditLastFour(card.last_four);
    setEditMonth(String(card.expiry_month));
    setEditYear(String(card.expiry_year));
    setEditHolder(card.cardholder_name || '');
    setEditIssuer(card.issuer || '');
    setEditBilling(card.billing_entity || '');
    setEditStatus(card.status);
    setEditNotes(card.notes || '');
  }, [card]);

  const activeAssignment = useMemo(() => assignments.find((a) => a.is_active), [assignments]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api('PATCH', `/company-credit-cards/${id}`, {
        label: editLabel.trim(),
        network: editNetwork,
        last_four: editLastFour.trim(),
        expiry_month: parseInt(editMonth, 10),
        expiry_year: parseInt(editYear, 10),
        cardholder_name: editHolder.trim() || null,
        issuer: editIssuer.trim() || null,
        billing_entity: editBilling.trim() || null,
        status: editStatus,
        notes: editNotes.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['company-credit-card', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Save failed'),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api('POST', `/company-credit-cards/${id}/assign`, {
        assigned_to_user_id: assignUserId,
        notes: assignNotes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Assigned');
      setShowAssign(false);
      setAssignNotes('');
      qc.invalidateQueries({ queryKey: ['company-credit-card-assignments', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      qc.invalidateQueries({ queryKey: ['company-credit-card', id] });
    },
    onError: (e: any) => toast.error(e?.message || 'Assign failed'),
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      api('POST', `/company-credit-cards/${id}/return`, {
        notes: returnNotes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Return recorded');
      setShowReturn(false);
      setReturnNotes('');
      qc.invalidateQueries({ queryKey: ['company-credit-card-assignments', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Return failed'),
  });

  const markCancelledMutation = useMutation({
    mutationFn: () => api('PATCH', `/company-credit-cards/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      toast.success('Card marked as cancelled');
      qc.invalidateQueries({ queryKey: ['company-credit-card', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      setEditStatus('cancelled');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to cancel'),
  });

  const [deletingCard, setDeletingCard] = useState(false);
  const deleteCardMutation = useMutation({
    mutationFn: () => api('DELETE', `/company-credit-cards/${id}`),
    onSuccess: () => {
      toast.success('Card record removed');
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      nav('/company-assets/credit-cards');
    },
    onError: (e: any) => toast.error(e?.message || 'Delete failed'),
  });

  if (!isValidId) return <div className="max-w-5xl px-4 py-6 text-sm text-gray-600">Invalid id</div>;
  if (isLoading || !card) return <div className="max-w-5xl h-32 animate-pulse rounded-xl bg-gray-100" />;

  const expired = isCardExpired(card.expiry_month, card.expiry_year);
  const expiringSoon = !expired && expiresWithinDays(card.expiry_month, card.expiry_year, 60);
  const networkKey = (card.network || 'other').toLowerCase();

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(editLastFour.trim())) {
      toast.error('Last four must be 4 digits');
      return;
    }
    saveMutation.mutate();
  };

  const statusBadgeClass =
    card.status === 'active'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : card.status === 'cancelled'
        ? 'border-gray-200 bg-gray-100 text-gray-700'
        : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className="max-w-5xl px-4 py-6 sm:px-0">
      <button
        type="button"
        onClick={() => nav('/company-assets/credit-cards')}
        className="mb-4 text-sm text-gray-600 transition-colors hover:text-brand-red"
      >
        ← Corporate cards
      </button>

      {/* Header — UserDetail-style: avatar block + title + toolbar */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <CardHeroVisual network={card.network} lastFour={card.last_four} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{card.label}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
                {STATUS_LABEL[card.status] || card.status}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {NETWORK_LABEL[networkKey] || card.network}
              </span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${expiryBadgeClass(card.expiry_month, card.expiry_year)}`}
              >
                Expires {expiryLabel(card.expiry_month, card.expiry_year)}
              </span>
              {expired && (
                <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                  Expired
                </span>
              )}
              {!expired && expiringSoon && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                  Renews soon
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2 rounded-full bg-gray-100/80 p-1">
            {(['details', 'custody'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === k ? 'bg-black text-white shadow-sm' : 'bg-transparent text-gray-700 hover:bg-white'
                }`}
              >
                {k === 'details' ? 'Details' : 'Custody'}
              </button>
            ))}
          </div>
          {card.status === 'active' && (
            <>
              {!activeAssignment ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowAssign(true);
                    setTab('custody');
                  }}
                  className="rounded-full bg-brand-red px-4 py-1.5 text-sm font-medium text-white shadow-sm shadow-brand-red/25 hover:bg-red-800"
                >
                  Assign custody
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowReturn(true);
                    setTab('custody');
                  }}
                  className="rounded-full border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  Record return
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => markCancelledMutation.mutate()}
            disabled={markCancelledMutation.isPending || card.status !== 'active'}
            className="rounded-full border border-red-300 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mark cancelled
          </button>
          {isAdministrator ? (
            <button
              type="button"
              disabled={deletingCard || deleteCardMutation.isPending}
              onClick={async () => {
                const choice = await confirm({
                  title: 'Delete corporate card',
                  message:
                    'Permanently remove this card record from MKHub (including custody history)? This cannot be undone.',
                  confirmText: 'Delete permanently',
                  cancelText: 'Cancel',
                });
                if (choice !== 'confirm') return;
                setDeletingCard(true);
                try {
                  await deleteCardMutation.mutateAsync();
                } finally {
                  setDeletingCard(false);
                }
              }}
              className="rounded-full border border-red-400 bg-white px-4 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deletingCard || deleteCardMutation.isPending ? 'Deleting…' : 'Delete card'}
            </button>
          ) : null}
        </div>
      </div>

      {/* PCI notice — same vocabulary as UserDetail yellow callouts */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <span className="font-semibold">Privacy / PCI:</span>{' '}
        Only the last four digits belong in MKHub. Never enter full card numbers, CVV, or PIN.
      </div>

      {tab === 'details' && (
        <form onSubmit={onSave} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 border-b border-gray-100 pb-3 text-base font-semibold text-gray-900">Card record</h2>
          <div className="grid gap-4 text-sm md:grid-cols-2 md:gap-x-6 md:gap-y-4">
            <div>
              <div className="mb-1 text-gray-600">Internal label</div>
              <input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-brand-red/0 transition-shadow focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              />
            </div>
            <div>
              <div className="mb-1 text-gray-600">Status</div>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              >
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
                <option value="replaced">Replaced</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-gray-600">Network</div>
              <select
                value={editNetwork}
                onChange={(e) => setEditNetwork(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              >
                <option value="visa">Visa</option>
                <option value="mastercard">Mastercard</option>
                <option value="amex">Amex</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-gray-600">Last four digits</div>
              <input
                inputMode="numeric"
                maxLength={4}
                value={editLastFour}
                onChange={(e) => setEditLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm tracking-widest outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              />
            </div>
            <div>
              <div className="mb-1 text-gray-600">Expiry month</div>
              <select
                value={editMonth}
                onChange={(e) => setEditMonth(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-gray-600">Expiry year</div>
              <input
                value={editYear}
                onChange={(e) => setEditYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              />
            </div>
            <div>
              <div className="mb-1 text-gray-600">Name on card</div>
              <input
                value={editHolder}
                onChange={(e) => setEditHolder(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              />
            </div>
            <div>
              <div className="mb-1 text-gray-600">Issuer / bank</div>
              <input
                value={editIssuer}
                onChange={(e) => setEditIssuer(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-gray-600">Billing entity</div>
              <input
                value={editBilling}
                onChange={(e) => setEditBilling(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              />
            </div>
            <div className="md:col-span-2">
              <div className="mb-1 text-gray-600">Notes</div>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={4}
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-red/40 focus:ring-2 focus:ring-brand-red/25"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-lg bg-brand-red px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-800 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}

      {tab === 'custody' && (
        <div className="space-y-6">
          {activeAssignment && (
            <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Current custody</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                {activeAssignment.assigned_to_name || activeAssignment.assigned_to_user_id}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                Assigned {new Date(activeAssignment.assigned_at).toLocaleString()}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/80 px-5 py-3">
              <h2 className="text-base font-semibold text-gray-900">Custody history</h2>
              <p className="text-xs text-gray-500">Who held the physical card and when it was returned.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {assignments.length === 0 && (
                <div className="px-5 py-12 text-center text-sm text-gray-500">No assignments yet. Use Assign custody when someone receives the card.</div>
              )}
              {assignments.map((a) => (
                <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-gray-50/80">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{a.assigned_to_name || a.assigned_to_user_id}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Out {new Date(a.assigned_at).toLocaleString()}
                      {a.returned_at ? ` · Returned ${new Date(a.returned_at).toLocaleString()}` : ' · Still active'}
                    </div>
                    {a.notes && <div className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{a.notes}</div>}
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      a.is_active ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-gray-200 bg-gray-50 text-gray-600'
                    }`}
                  >
                    {a.is_active ? 'Active' : 'Closed'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAssign && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
            onClick={() => setShowAssign(false)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="text-lg font-semibold text-gray-900">Assign custody</h3>
                <p className="mt-1 text-xs text-gray-500">The employee who will physically hold this card.</p>
              </div>
              <div className="space-y-4 p-5">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Employee</label>
                  <select
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select…</option>
                    {employees.map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {empLabel(e)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Notes</label>
                  <textarea
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowAssign(false)}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!assignUserId || assignMutation.isPending}
                  onClick={() => assignMutation.mutate()}
                  className="rounded-full bg-brand-red px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {showReturn && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
            onClick={() => setShowReturn(false)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-gray-100 px-5 py-4">
                <h3 className="text-lg font-semibold text-gray-900">Record return</h3>
                <p className="mt-1 text-xs text-gray-500">When the card is back in the office or handed to another process.</p>
              </div>
              <div className="p-5">
                <textarea
                  placeholder="Optional notes"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowReturn(false)}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={returnMutation.isPending}
                  onClick={() => returnMutation.mutate()}
                  className="rounded-full bg-brand-red px-4 py-2 text-sm font-medium text-white"
                >
                  Confirm return
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
