import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import DirectorMeetingSlotPicker, {
  formatDirectorSlotDayLabel,
  formatDirectorSlotTimeRange,
  normalizeDirectorMeetingSlots,
  revieweeUserIdsEqual,
} from '@/components/DirectorMeetingSlotPicker';
import {
  AppEmptyState,
  AppSectionHeader,
  AppSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { CalendarDays } from 'lucide-react';

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

  const cycleOptions = cyclesFromSelf.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Director 1:1 meeting"
        description="After your self-review, pick a day on the calendar, then book a closing conversation with leadership. Slots appear when HR publishes availability for this review cycle."
        icon={<CalendarDays className="h-4 w-4" />}
      />

      {!cyclesFromSelf.length ? (
        <AppEmptyState title="You are not included in a review cycle yet, so there is nothing to schedule here." />
      ) : (
        <>
          <AppSelect
            label="Review cycle"
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            options={cycleOptions}
            triggerClassName="min-w-[240px]"
          />

          {hrRescheduleNudge ? (
            <div
              role="status"
              className={uiCx(uiRadius.control, uiBorders.subtle, 'border-amber-300 bg-amber-50', uiSpacing.compactCardPadding)}
            >
              <p className={uiTypography.sectionTitle}>Your director meeting needs a new time</p>
              <p className={uiCx(uiTypography.body, 'mt-1')}>
                HR cancelled your previous booking. Please book another slot below when you are ready
                {hrRescheduleNudge.since
                  ? ` (updated ${formatDirectorSlotDayLabel(hrRescheduleNudge.since)})`
                  : ''}
                .
              </p>
              {hrRescheduleNudge.message ? (
                <div
                  className={uiCx(
                    'mt-2 whitespace-pre-wrap',
                    uiRadius.control,
                    uiBorders.subtle,
                    uiColors.surface,
                    uiSpacing.compactCardPadding,
                    uiTypography.helper,
                  )}
                >
                  <span className={uiTypography.sectionTitle}>Message from HR: </span>
                  {hrRescheduleNudge.message}
                </div>
              ) : null}
            </div>
          ) : null}

          {activeBookingSlot && !hrRescheduleNudge ? (
            <p className={uiCx(uiTypography.body, uiRadius.control, uiBorders.subtle, 'border-green-200 bg-green-50', uiSpacing.compactCardPadding)}>
              <span className={uiTypography.sectionTitle}>Your meeting:</span>{' '}
              {formatDirectorSlotDayLabel(activeBookingSlot.starts_at)} ·{' '}
              {formatDirectorSlotTimeRange(activeBookingSlot.starts_at, activeBookingSlot.ends_at)}
            </p>
          ) : null}

          {boardLoading ? (
            <p className={uiTypography.helper}>Loading availability…</p>
          ) : !hasWindows ? (
            <AppEmptyState title="No available dates right now. HR has not published meeting times for this cycle yet." />
          ) : !hasSlots ? (
            <AppEmptyState title="No available dates right now. The published windows do not yield any bookable slot (check back after HR updates availability)." />
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
