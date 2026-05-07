import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import DirectorMeetingSlotPicker, {
  formatDirectorSlotDayLabel,
  formatDirectorSlotTimeRange,
  normalizeDirectorMeetingSlots,
  revieweeUserIdsEqual,
} from '@/components/DirectorMeetingSlotPicker';

type BoardSlot = {
  starts_at: string;
  ends_at: string;
  booked_reviewee_user_id: string | null;
  booked_reviewee_name: string | null;
};

type HrPendingReschedule = {
  since: string;
  message?: string | null;
};

type BoardResponse = {
  duration_minutes: number;
  windows: { id?: string; starts_at: string; ends_at: string }[];
  slots: BoardSlot[];
  hr_pending_reschedule?: HrPendingReschedule | null;
};

type AssignmentRow = {
  cycle_id: string;
  cycle_name?: string;
  is_self?: boolean;
};

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

  const boardSlotsNorm = useMemo(
    () => normalizeDirectorMeetingSlots(board?.slots as unknown[]),
    [board?.slots]
  );

  const bookMutation = useMutation({
    mutationFn: (body: { reviewee_user_id: string; slot_starts_at: string | null }) =>
      api('POST', `/reviews/cycles/${encodeURIComponent(cycleId)}/director-meetings/book`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['director-meeting-board', cycleId] });
    },
  });

  const activeBookingSlot = useMemo(() => {
    if (!boardSlotsNorm.length || !myId) return null;
    return boardSlotsNorm.find((s) => revieweeUserIdsEqual(s.booked_reviewee_user_id, myId)) || null;
  }, [boardSlotsNorm, myId]);

  const hrRescheduleNudge = board?.hr_pending_reschedule ?? null;

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
  const hasSlots = boardSlotsNorm.length > 0;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Director 1:1 meeting</h2>
        <p className="text-sm text-gray-600 leading-relaxed w-full">
          After your self-review, pick a day on the calendar, then book a closing conversation with leadership. Slots
          appear when HR publishes availability for this review cycle.
        </p>
      </header>

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

          {hrRescheduleNudge ? (
            <div
              role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 shadow-sm"
            >
              <p className="font-semibold text-amber-950">Your director meeting needs a new time</p>
              <p className="mt-1 text-amber-900/90 leading-relaxed">
                HR cancelled your previous booking. Please book another slot below when you are ready
                {hrRescheduleNudge.since
                  ? ` (updated ${formatDirectorSlotDayLabel(hrRescheduleNudge.since)})`
                  : ''}
                .
              </p>
              {hrRescheduleNudge.message ? (
                <div className="mt-2 rounded-md border border-amber-200/80 bg-white/70 px-2.5 py-2 text-xs text-amber-950/95 whitespace-pre-wrap">
                  <span className="font-medium text-amber-950">Message from HR: </span>
                  {hrRescheduleNudge.message}
                </div>
              ) : null}
            </div>
          ) : null}

          {activeBookingSlot && !hrRescheduleNudge ? (
            <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span className="font-medium">Your meeting:</span>{' '}
              {formatDirectorSlotDayLabel(activeBookingSlot.starts_at)} ·{' '}
              {formatDirectorSlotTimeRange(activeBookingSlot.starts_at, activeBookingSlot.ends_at)}
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
            <DirectorMeetingSlotPicker
              cycleId={cycleId}
              slots={boardSlotsNorm}
              durationMinutes={board?.duration_minutes ?? 15}
              bookingTargetId={myId}
              onBook={handleBook}
              onCancelMine={handleCancel}
              isPending={bookMutation.isPending}
              compact
              reserveLabel="Book"
              cancelLabel="Cancel"
              hideOtherBookedNames
            />
          )}
        </>
      )}
    </div>
  );
}
