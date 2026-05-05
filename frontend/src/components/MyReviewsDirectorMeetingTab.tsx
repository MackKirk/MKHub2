import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

type BoardSlot = {
  starts_at: string;
  ends_at: string;
  booked_reviewee_user_id: string | null;
  booked_reviewee_name: string | null;
};

type BoardResponse = {
  duration_minutes: number;
  windows: { id?: string; starts_at: string; ends_at: string }[];
  slots: BoardSlot[];
};

type AssignmentRow = {
  cycle_id: string;
  cycle_name?: string;
  is_self?: boolean;
};

function formatRange(isoStart: string, isoEnd: string) {
  try {
    const a = new Date(isoStart);
    const b = new Date(isoEnd);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return isoStart;
    return `${a.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} – ${b.toLocaleTimeString(undefined, { timeStyle: 'short' })}`;
  } catch {
    return isoStart;
  }
}

/**
 * Employee-only: book a director closing 1:1 from published slots (configured by HR on the cycle).
 */
export default function MyReviewsDirectorMeetingTab() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const myId = me?.id != null ? String(me.id) : '';

  const { data: assignments } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => api<AssignmentRow[]>('GET', '/reviews/my/assignments'),
  });

  const cyclesFromSelf = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments || []) {
      if (a.is_self && a.cycle_id) {
        m.set(a.cycle_id, a.cycle_name || 'Review cycle');
      }
    }
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [assignments]);

  const [cycleId, setCycleId] = useState<string>('');

  useEffect(() => {
    if (cycleId || !cyclesFromSelf.length) return;
    setCycleId(String(cyclesFromSelf[0].id));
  }, [cyclesFromSelf, cycleId]);

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['director-meeting-board', cycleId],
    queryFn: () => api<BoardResponse>('GET', `/reviews/cycles/${encodeURIComponent(cycleId)}/director-meeting-board`),
    enabled: !!cycleId,
  });

  const bookMutation = useMutation({
    mutationFn: (body: { reviewee_user_id: string; slot_starts_at: string | null }) =>
      api('POST', `/reviews/cycles/${encodeURIComponent(cycleId)}/director-meetings/book`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['director-meeting-board', cycleId] });
    },
  });

  const activeBookingSlot = useMemo(() => {
    if (!board?.slots?.length || !myId) return null;
    return board.slots.find((s) => s.booked_reviewee_user_id === myId) || null;
  }, [board, myId]);

  const handleBook = useCallback(
    (slotStartIso: string) => {
      if (!myId || !cycleId) return;
      bookMutation.mutate({ reviewee_user_id: myId, slot_starts_at: slotStartIso });
    },
    [myId, cycleId, bookMutation]
  );

  const handleCancel = useCallback(() => {
    if (!myId || !cycleId) return;
    bookMutation.mutate({ reviewee_user_id: myId, slot_starts_at: null });
  }, [myId, cycleId, bookMutation]);

  const hasWindows = (board?.windows?.length ?? 0) > 0;
  const hasSlots = (board?.slots?.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Director 1:1 meeting</h2>
        <p className="mt-1 text-sm text-gray-600 max-w-2xl">
          After your self-review and supervisor review, book a time for your closing conversation with leadership. Slots
          appear when HR publishes availability for the cycle.{' '}
          <Link to="/reviews/compare" className="font-medium text-brand-red hover:underline">
            Compare reviews
          </Link>
        </p>
      </div>

      {!cyclesFromSelf.length ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-600">
          You are not included in a review cycle yet, so there is nothing to schedule here.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Review cycle</label>
            <select
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm min-w-[240px]"
              value={cycleId}
              onChange={(e) => setCycleId(e.target.value)}
            >
              {cyclesFromSelf.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {activeBookingSlot ? (
            <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span className="font-medium">Your meeting:</span>{' '}
              {formatRange(activeBookingSlot.starts_at, activeBookingSlot.ends_at)}
            </p>
          ) : null}

          {boardLoading ? (
            <p className="text-sm text-gray-500">Loading availability…</p>
          ) : !hasWindows ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-8 text-center text-sm text-amber-900">
              No available dates right now. HR has not published meeting times for this cycle yet.
            </div>
          ) : !hasSlots ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-4 py-8 text-center text-sm text-amber-900">
              No available dates right now. The published windows do not yield any bookable slot (check back after HR
              updates availability).
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 w-36"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(board?.slots || []).map((slot) => {
                    const taken = !!slot.booked_reviewee_user_id;
                    const isMine = taken && slot.booked_reviewee_user_id === myId;
                    const canTake = !taken && !!myId;
                    return (
                      <tr key={slot.starts_at} className="hover:bg-gray-50/80">
                        <td className="px-3 py-2.5 tabular-nums">{formatRange(slot.starts_at, slot.ends_at)}</td>
                        <td className="px-3 py-2.5">
                          {taken ? (
                            <span className="text-gray-800">
                              Booked — {slot.booked_reviewee_name || slot.booked_reviewee_user_id}
                            </span>
                          ) : (
                            <span className="text-green-700 font-medium">Available</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {canTake ? (
                            <button
                              type="button"
                              onClick={() => handleBook(slot.starts_at)}
                              disabled={bookMutation.isPending}
                              className="rounded-lg bg-brand-red px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                            >
                              Book
                            </button>
                          ) : isMine ? (
                            <button
                              type="button"
                              onClick={handleCancel}
                              disabled={bookMutation.isPending}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
