import { useEffect, useMemo, useState } from 'react';
import DirectorMeetingMonthCalendar, {
  formatYMD,
  formatYmdHeading,
} from '@/components/DirectorMeetingMonthCalendar';

export type SlotPickerSlot = {
  starts_at: string;
  ends_at: string;
  booked_reviewee_user_id: string | null;
  booked_reviewee_name: string | null;
};

function formatTimeOnly(isoStart: string, isoEnd: string) {
  try {
    const a = new Date(isoStart);
    const b = new Date(isoEnd);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
    return `${a.toLocaleTimeString(undefined, { timeStyle: 'short' })} – ${b.toLocaleTimeString(undefined, {
      timeStyle: 'short',
    })}`;
  } catch {
    return '';
  }
}

/** For banners / summaries next to the picker. */
export function formatDirectorSlotDayLabel(isoStart: string): string {
  try {
    const a = new Date(isoStart);
    if (Number.isNaN(a.getTime())) return '';
    return a.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export function formatDirectorSlotTimeRange(isoStart: string, isoEnd: string): string {
  return formatTimeOnly(isoStart, isoEnd);
}

type Props = {
  cycleId: string;
  slots: SlotPickerSlot[];
  durationMinutes: number;
  bookingTargetId: string;
  onBook: (slotStartsAt: string) => void;
  onCancelMine: () => void;
  isPending: boolean;
  /** Default layout: medium-sized calendar (not full width, not tiny). */
  compact?: boolean;
  reserveLabel?: string;
  cancelLabel?: string;
};

export default function DirectorMeetingSlotPicker({
  cycleId,
  slots,
  durationMinutes,
  bookingTargetId,
  onBook,
  onCancelMine,
  isPending,
  compact = true,
  reserveLabel = 'Reserve this time',
  cancelLabel = 'Cancel booking',
}: Props) {
  const [selectedBookingYmd, setSelectedBookingYmd] = useState<string | null>(null);
  const [bookingCalendarMonth, setBookingCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    setSelectedBookingYmd(null);
  }, [cycleId]);

  useEffect(() => {
    if (!slots?.length) {
      setSelectedBookingYmd(null);
      return;
    }
    setSelectedBookingYmd((prev) => {
      if (prev && slots.some((s) => formatYMD(new Date(s.starts_at)) === prev)) return prev;
      const days = [...new Set(slots.map((s) => formatYMD(new Date(s.starts_at))))].sort();
      return days[0] ?? null;
    });
  }, [slots, cycleId]);

  useEffect(() => {
    if (!selectedBookingYmd) return;
    const parts = selectedBookingYmd.split('-').map((x) => parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return;
    setBookingCalendarMonth(new Date(parts[0], parts[1] - 1, 1));
  }, [selectedBookingYmd]);

  const bookingSlotStatsByYmd = useMemo(() => {
    const map = new Map<string, { total: number; booked: number }>();
    for (const s of slots) {
      const d = new Date(s.starts_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = formatYMD(d);
      const cur = map.get(key) || { total: 0, booked: 0 };
      cur.total += 1;
      if (s.booked_reviewee_user_id) cur.booked += 1;
      map.set(key, cur);
    }
    return map;
  }, [slots]);

  const slotsForSelectedDay = useMemo(() => {
    if (!selectedBookingYmd) return [];
    return slots
      .filter((s) => {
        const d = new Date(s.starts_at);
        return !Number.isNaN(d.getTime()) && formatYMD(d) === selectedBookingYmd;
      })
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [slots, selectedBookingYmd]);

  return (
    <div className="space-y-5">
      <DirectorMeetingMonthCalendar
        compact={compact}
        visibleMonth={bookingCalendarMonth}
        onVisibleMonthChange={setBookingCalendarMonth}
        selectedYmd={selectedBookingYmd}
        onSelectYmd={setSelectedBookingYmd}
        getDayProps={(ymd) => {
          const stats = bookingSlotStatsByYmd.get(ymd);
          const total = stats?.total ?? 0;
          const booked = stats?.booked ?? 0;
          const hasSlots = total > 0;
          return {
            disabled: !hasSlots,
            badge: hasSlots ? (booked > 0 ? booked : total) : undefined,
            badgeTone: booked > 0 ? 'booked' : 'neutral',
          };
        }}
        getDayTitle={(ymd) => {
          const stats = bookingSlotStatsByYmd.get(ymd);
          const total = stats?.total ?? 0;
          const booked = stats?.booked ?? 0;
          const hasSlots = total > 0;
          if (!hasSlots) return 'No slots';
          return `${booked} booked · ${total} slot${total === 1 ? '' : 's'} offered`;
        }}
        footerNote="Red = bookings that day. Gray = slots open, none booked (number = slots offered)."
      />

      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-3">
          {selectedBookingYmd ? formatYmdHeading(selectedBookingYmd) : 'Select a day'}
        </h3>
        {!selectedBookingYmd ? (
          <p className="text-sm text-slate-500 py-5 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-2">
            Tap a date on the calendar to see times.
          </p>
        ) : slotsForSelectedDay.length === 0 ? (
          <p className="text-sm text-slate-500 py-5 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-2">
            No slots on this day.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {slotsForSelectedDay.map((slot) => {
              const taken = !!slot.booked_reviewee_user_id;
              const isMine = taken && slot.booked_reviewee_user_id === bookingTargetId;
              const canTake = !taken && !!bookingTargetId;
              return (
                <div
                  key={slot.starts_at}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-white hover:bg-slate-50/80"
                >
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums text-slate-900 text-base">
                      {formatTimeOnly(slot.starts_at, slot.ends_at)}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{durationMinutes} min meeting</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="text-sm">
                      {taken ? (
                        <span className="text-slate-700">
                          Booked —{' '}
                          <span className="font-medium">{slot.booked_reviewee_name || slot.booked_reviewee_user_id}</span>
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-700">Available</span>
                      )}
                    </span>
                    {canTake ? (
                      <button
                        type="button"
                        onClick={() => onBook(slot.starts_at)}
                        disabled={isPending}
                        className="rounded-lg bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                      >
                        {reserveLabel}
                      </button>
                    ) : isMine ? (
                      <button
                        type="button"
                        onClick={onCancelMine}
                        disabled={isPending}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {cancelLabel}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
