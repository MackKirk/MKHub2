import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const NETWORKS = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'Amex' },
  { value: 'other', label: 'Other' },
];

export default function CompanyCreditCardNew() {
  const nav = useNavigate();
  const [label, setLabel] = useState('');
  const [network, setNetwork] = useState('visa');
  const [lastFour, setLastFour] = useState('');
  const [expiryMonth, setExpiryMonth] = useState(String(new Date().getMonth() + 1));
  const [expiryYear, setExpiryYear] = useState(String(new Date().getFullYear() + 3));
  const [cardholderName, setCardholderName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [billingEntity, setBillingEntity] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ id: string }>('POST', '/company-credit-cards', {
        label: label.trim(),
        network,
        last_four: lastFour.trim(),
        expiry_month: parseInt(expiryMonth, 10),
        expiry_year: parseInt(expiryYear, 10),
        cardholder_name: cardholderName.trim() || undefined,
        issuer: issuer.trim() || undefined,
        billing_entity: billingEntity.trim() || undefined,
        status: 'active',
        notes: notes.trim() || undefined,
      }),
    onSuccess: (data) => {
      toast.success('Card record created');
      nav(`/company-assets/credit-cards/${data.id}`);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to create'),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (!/^\d{4}$/.test(lastFour.trim())) {
      toast.error('Last four must be exactly 4 digits');
      return;
    }
    const em = parseInt(expiryMonth, 10);
    const ey = parseInt(expiryYear, 10);
    if (em < 1 || em > 12) {
      toast.error('Invalid expiry month');
      return;
    }
    createMutation.mutate();
  };

  const years = Array.from({ length: 15 }, (_, i) => String(new Date().getFullYear() + i));

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <button type="button" onClick={() => nav('/company-assets/credit-cards')} className="text-sm text-brand-red hover:underline mb-4">
        ← Back to corporate cards
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Add corporate card</h1>
      <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
        Enter only the last four digits and expiry — never store full card numbers, CVV, or PIN in MKHub.
      </p>

      <form onSubmit={onSubmit} className="space-y-4 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Internal label *</label>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="e.g. Marketing fuel card"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Network *</label>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {NETWORKS.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last four digits *</label>
            <input
              required
              inputMode="numeric"
              maxLength={4}
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tracking-widest"
              placeholder="4242"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry month *</label>
            <select
              value={expiryMonth}
              onChange={(e) => setExpiryMonth(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry year *</label>
            <select
              value={expiryYear}
              onChange={(e) => setExpiryYear(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name on card</label>
          <input
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Issuer / bank</label>
          <input
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Billing entity</label>
          <input
            value={billingEntity}
            onChange={(e) => setBillingEntity(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 rounded-lg bg-brand-red text-white font-medium disabled:opacity-50"
          >
            {createMutation.isPending ? 'Saving…' : 'Create'}
          </button>
          <button type="button" onClick={() => nav('/company-assets/credit-cards')} className="px-4 py-2 rounded-lg border border-gray-300">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
