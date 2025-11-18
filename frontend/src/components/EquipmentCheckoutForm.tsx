import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Props = {
  equipmentId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  mode: 'checkout' | 'checkin';
  checkoutId?: string;
};

export default function EquipmentCheckoutForm({ equipmentId, onSuccess, onCancel, mode, checkoutId }: Props) {
  const [checkedOutBy, setCheckedOutBy] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [condition, setCondition] = useState<'new' | 'good' | 'fair' | 'poor'>('good');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === 'checkout') {
        await api('POST', `/fleet/equipment/${equipmentId}/checkout`, {
          checked_out_by_user_id: checkedOutBy,
          checked_out_at: new Date().toISOString(),
          expected_return_date: expectedReturnDate || undefined,
          condition_out: condition,
          notes_out: notes || undefined,
        });
        toast.success('Equipment checked out successfully');
      } else {
        await api('POST', `/fleet/equipment/${equipmentId}/checkin`, {
          actual_return_date: new Date().toISOString(),
          condition_in: condition,
          notes_in: notes || undefined,
        });
        toast.success('Equipment checked in successfully');
      }
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === 'checkout' && (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">Checked Out By (User ID)</label>
            <input
              type="text"
              value={checkedOutBy}
              onChange={e => setCheckedOutBy(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Expected Return Date</label>
            <input
              type="date"
              value={expectedReturnDate}
              onChange={e => setExpectedReturnDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
        </>
      )}
      <div>
        <label className="block text-sm font-medium mb-1">
          Condition {mode === 'checkout' ? 'Out' : 'In'}
        </label>
        <select
          value={condition}
          onChange={e => setCondition(e.target.value as any)}
          required
          className="w-full border rounded-lg px-3 py-2"
        >
          <option value="new">New</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full border rounded-lg px-3 py-2"
          rows={3}
        />
      </div>
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700"
        >
          {mode === 'checkout' ? 'Check Out' : 'Check In'}
        </button>
      </div>
    </form>
  );
}

