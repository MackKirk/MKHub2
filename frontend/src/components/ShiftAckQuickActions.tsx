import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import {
  SCHEDULE_PENDING_ACK_QUERY_KEY,
  shiftAckNeedsResponse,
  shiftAckTracked,
} from '@/lib/shiftAck';
import {
  AppButton,
  AppFormModal,
  AppTextarea,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';

type ShiftAckQuickActionsProps = {
  shiftId: string;
  ackStatus?: string | null;
  onUpdated?: (updated: any) => void;
};

/**
 * Compact Accept / Decline controls for schedule list cards (icons above labels).
 */
export function ShiftAckQuickActions({
  shiftId,
  ackStatus,
  onUpdated,
}: ShiftAckQuickActionsProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNote, setDeclineNote] = useState('');

  if (!shiftAckTracked(ackStatus)) return null;

  const needsResponse = shiftAckNeedsResponse(ackStatus);
  const isAccepted = ackStatus === 'accepted';
  const isDeclined = ackStatus === 'declined';

  if (isAccepted) return null;

  const respond = async (action: 'accepted' | 'declined', note?: string) => {
    setSaving(true);
    try {
      const updated = await api<any>('POST', `/dispatch/shifts/${shiftId}/response`, {
        action,
        note: note?.trim() || null,
      });
      setDeclineOpen(false);
      setDeclineNote('');
      onUpdated?.(updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['schedule-shifts'] }),
        queryClient.invalidateQueries({ queryKey: [...SCHEDULE_PENDING_ACK_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: ['shift-responses', shiftId] }),
      ]);
      toast.success(action === 'accepted' ? 'Shift accepted' : 'Shift declined');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Could not save your response');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        className={uiCx('mt-2 grid gap-1.5', isDeclined ? 'grid-cols-1' : 'grid-cols-2')}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          disabled={saving}
          onClick={() => respond('accepted')}
          className={uiCx(
            'flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 transition-colors',
            uiRadius.control,
            uiBorders.subtle,
            'border-green-200 bg-green-50 text-green-800 hover:bg-green-100',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
          aria-label="Accept shift"
        >
          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          <span className={uiCx(uiTypography.helper, 'font-semibold text-green-800')}>Accept</span>
        </button>
        {needsResponse ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => setDeclineOpen(true)}
            className={uiCx(
              'flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 transition-colors',
              uiRadius.control,
              uiBorders.subtle,
              'border-red-200 bg-red-50 text-red-800 hover:bg-red-100',
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
            aria-label="Decline shift"
          >
            <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            <span className={uiCx(uiTypography.helper, 'font-semibold text-red-800')}>Decline</span>
          </button>
        ) : null}
      </div>

      {declineOpen ? (
        <AppFormModal
          open
          onClose={() => {
            if (saving) return;
            setDeclineOpen(false);
            setDeclineNote('');
          }}
          title="Decline shift"
          description="Optional — tell dispatch why you cannot attend."
          formWidth="default"
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setDeclineOpen(false);
                  setDeclineNote('');
                }}
              >
                Cancel
              </AppButton>
              <AppButton
                type="button"
                variant="danger"
                size="sm"
                loading={saving}
                disabled={saving}
                onClick={() => respond('declined', declineNote)}
              >
                Confirm decline
              </AppButton>
            </div>
          }
        >
          <AppTextarea
            label="Reason"
            value={declineNote}
            onChange={(e) => setDeclineNote(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={saving}
            placeholder="Optional — for example, can't work Fridays"
          />
        </AppFormModal>
      ) : null}
    </>
  );
}
