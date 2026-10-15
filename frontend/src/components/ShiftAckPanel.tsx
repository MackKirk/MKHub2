import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { shiftAckMeta, shiftAckTracked, shiftResponseActionLabel } from '@/lib/shiftAck';
import {
  AppBadge,
  AppButton,
  AppTextarea,
  uiCx,
  uiTypography,
} from '@/components/ui';

type ShiftAck = {
  id: string;
  ack_status?: string | null;
  ack_note?: string | null;
  date?: string;
};

type ShiftResponseEvent = {
  id: string;
  action: string;
  note?: string | null;
  shift_date?: string | null;
  weekday?: string | null;
  project_name?: string | null;
  created_at?: string | null;
};

type ResponsePayload = {
  ack_status?: string | null;
  ack_note?: string | null;
  events?: ShiftResponseEvent[];
  worker_declines?: ShiftResponseEvent[];
};

function formatWhen(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShiftDay(dateStr?: string | null, weekday?: string | null): string {
  if (!dateStr) return weekday || '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return weekday || dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ShiftAckPanel({
  mode,
  shift,
  onUpdated,
}: {
  mode: 'worker' | 'dispatcher';
  shift: ShiftAck;
  onUpdated?: (shift: any) => void;
}) {
  const queryClient = useQueryClient();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNote, setDeclineNote] = useState('');
  const [saving, setSaving] = useState(false);
  const viewedSent = useRef(new Set<string>());
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  const history = useQuery({
    queryKey: ['shift-responses', shift.id],
    queryFn: () => api<ResponsePayload>('GET', `/dispatch/shifts/${shift.id}/responses`),
    enabled: mode === 'dispatcher' && !!shift.id && shiftAckTracked(shift.ack_status),
  });
  const status =
    (mode === 'dispatcher' ? history.data?.ack_status : null) || shift.ack_status || 'pending';
  const ackNote =
    mode === 'dispatcher' ? (history.data?.ack_note ?? shift.ack_note) : shift.ack_note;
  const meta = shiftAckMeta(status);
  const tracked = shiftAckTracked(status);

  useEffect(() => {
    if (mode !== 'worker' || !shift.id || !tracked || status !== 'pending') return;
    if (viewedSent.current.has(shift.id)) return;
    viewedSent.current.add(shift.id);
    api<any>('POST', `/dispatch/shifts/${shift.id}/response`, { action: 'viewed' })
      .then((updated) => {
        onUpdatedRef.current?.(updated);
      })
      .catch(() => {
        viewedSent.current.delete(shift.id);
      });
  }, [mode, shift.id, status, tracked]);

  if (!tracked) return null;

  const respond = async (action: 'accepted' | 'declined', note?: string) => {
    setSaving(true);
    try {
      const updated = await api<any>('POST', `/dispatch/shifts/${shift.id}/response`, {
        action,
        note: note?.trim() || null,
      });
      setDeclineOpen(false);
      setDeclineNote('');
      onUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ['shift-responses', shift.id] });
      toast.success(action === 'accepted' ? 'Shift accepted' : 'Shift declined');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Could not save your response');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <AppBadge variant={meta.variant} className="normal-case tracking-normal">
          {meta.longLabel}
        </AppBadge>
        {status === 'declined' && ackNote?.trim() ? (
          <span className={uiCx(uiTypography.helper, 'text-gray-700')}>{ackNote.trim()}</span>
        ) : null}
      </div>

      {mode === 'worker' ? (
        <>
          <p className={uiCx(uiTypography.helper, 'text-gray-600')}>
            {status === 'accepted'
              ? 'You confirmed you will attend this shift.'
              : status === 'declined'
                ? 'You declined this shift. You can still accept it if that changes.'
                : status === 'viewed'
                  ? 'This shift is marked as seen. Confirm that you will attend, or decline if you cannot.'
                  : 'Opening this shift records that you saw it. Confirm that you will attend, or decline if you cannot.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <AppButton
              size="sm"
              type="button"
              disabled={saving || status === 'accepted'}
              onClick={() => respond('accepted')}
            >
              I'll be there
            </AppButton>
            <AppButton
              size="sm"
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setDeclineOpen((open) => !open)}
            >
              I can't go
            </AppButton>
          </div>
          {declineOpen ? (
            <div className="space-y-2">
              <AppTextarea
                label="Reason"
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                rows={3}
                maxLength={500}
                disabled={saving}
                placeholder="Optional — for example, can't work Fridays"
                helperText="Saved on this shift and in the worker's decline history."
              />
              <AppButton
                size="sm"
                type="button"
                variant="danger"
                loading={saving}
                disabled={saving}
                onClick={() => respond('declined', declineNote)}
              >
                Confirm decline
              </AppButton>
            </div>
          ) : null}
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <div className={uiCx(uiTypography.overline, 'mb-1.5')}>This shift</div>
            {history.isLoading ? (
              <p className={uiCx(uiTypography.helper, 'text-gray-500')}>Loading history…</p>
            ) : (history.data?.events || []).length === 0 ? (
              <p className={uiCx(uiTypography.helper, 'text-gray-500')}>No response yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {(history.data?.events || []).map((event) => (
                  <li key={event.id} className={uiCx(uiTypography.helper, 'text-gray-700')}>
                    <span className="font-semibold text-gray-900">{shiftResponseActionLabel(event.action)}</span>
                    {event.created_at ? ` · ${formatWhen(event.created_at)}` : ''}
                    {event.note?.trim() ? ` — ${event.note.trim()}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Other declines by this worker</div>
            {(history.data?.worker_declines || []).length === 0 ? (
              <p className={uiCx(uiTypography.helper, 'text-gray-500')}>No other declined shifts yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {(history.data?.worker_declines || []).map((event) => (
                  <li key={event.id} className={uiCx(uiTypography.helper, 'text-gray-700')}>
                    <span className="font-semibold text-gray-900">
                      {formatShiftDay(event.shift_date, event.weekday)}
                    </span>
                    {event.project_name ? ` · ${event.project_name}` : ''}
                    {event.note?.trim() ? ` — ${event.note.trim()}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
