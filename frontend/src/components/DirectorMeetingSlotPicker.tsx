import { useEffect, useMemo, useState } from 'react';
import DirectorMeetingMonthCalendar, {
  formatYMD,
  formatYmdHeading,
} from '@/components/DirectorMeetingMonthCalendar';
import { AppBadge } from '@/components/ui';

export type SlotPickerSlot = {
  starts_at: string;
  ends_at: string;
  booked_reviewee_user_id: string | null;
  booked_reviewee_name: string | null;
};

/** Normalize API slot objects (snake_case and occasional camelCase) for the picker. */
export function normalizeDirectorMeetingSlots(rawList: unknown[] | undefined): SlotPickerSlot[] {
  if (!rawList?.length) return [];
  return rawList.map((raw) => {
    const s = raw as Record<string, unknown>;
    const id =
      (s.booked_reviewee_user_id as string | null | undefined) ??
      (s.bookedRevieweeUserId as string | null | undefined) ??
      null;
    const name =
      (s.booked_reviewee_name as string | null | undefined) ??
      (s.bookedRevieweeName as string | null | undefined) ??
      null;
    return {
      starts_at: String(s.starts_at ?? s.startsAt ?? ''),
      ends_at: String(s.ends_at ?? s.endsAt ?? ''),
      booked_reviewee_user_id: id != null ? String(id) : null,
      booked_reviewee_name: name != null && String(name).trim() ? String(name).trim() : null,
    };
  });
}

export function revieweeUserIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function bookedColleagueLabel(slot: SlotPickerSlot): string {
  const name = (slot.booked_reviewee_name || '').trim();
  if (name) return name;
  const id = slot.booked_reviewee_user_id;
  if (id) return String(id);
  return 'Booked';
}

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
  /** HR / admin: cancel any occupied slot (pass booked reviewee id). When set, Cancel appears for every taken row. */
  onCancelBookedSlot?: (bookedRevieweeUserId: string) => void;
  isPending: boolean;
  /** Default layout: medium-sized calendar (not full width, not tiny). */
  compact?: boolean;
  reserveLabel?: string;
  cancelLabel?: string;
  /** Allow reserve button even if bookingTargetId is empty (HR chooses target later). */
  allowReserveWithoutTarget?: boolean;
  /** When true, slots booked by someone other than `bookingTargetId` show as generic “Booked” (no name); calendar tooltips omit names too. */
  hideOtherBookedNames?: boolean;
  /** On `lg+` breakpoints, calendar and time list sit side-by-side to use wide pages (e.g. Meeting schedule). */
  wideSplit?: boolean;
};

export default function DirectorMeetingSlotPicker({
  cycleId,
  slots,
  durationMinutes,
  bookingTargetId,
  onBook,
  onCancelMine,
  onCancelBookedSlot,
  isPending,
  compact = true,
  reserveLabel = 'Reserve this time',
  cancelLabel = 'Cancel booking',
  allowReserveWithoutTarget = false,
  hideOtherBookedNames = false,
  wideSplit = false,
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
    const map = new Map<string, { total: number; booked: number; available: number }>();
    for (const s of slots) {
      const d = new Date(s.starts_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = formatYMD(d);
      const cur = map.get(key) || { total: 0, booked: 0, available: 0 };
      cur.total += 1;
      if (s.booked_reviewee_user_id) {
        cur.booked += 1;
      } else {
        cur.available += 1;
      }
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

  const calendarEl = (
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
        const available = stats?.available ?? Math.max(0, total - booked);
        const hasSlots = total > 0;
        return {
          disabled: !hasSlots,
          /** Badge = bookable slots left that day (not how many are already taken). */
          badge: hasSlots ? available : undefined,
          badgeTone: hasSlots && available === 0 ? 'booked' : 'neutral',
        };
      }}
      getDayTitle={(ymd) => {
        const stats = bookingSlotStatsByYmd.get(ymd);
        const total = stats?.total ?? 0;
        const booked = stats?.booked ?? 0;
        const available = stats?.available ?? Math.max(0, total - booked);
        const hasSlots = total > 0;
        if (!hasSlots) return 'No slots';
        const base = `${available} available · ${booked} booked · ${total} total`;
        if (hideOtherBookedNames) {
          return base;
        }
        const dayBooked = slots.filter((s) => {
          const d = new Date(s.starts_at);
          return !Number.isNaN(d.getTime()) && formatYMD(d) === ymd && !!s.booked_reviewee_user_id;
        });
        const names = [
          ...new Set(dayBooked.map((s) => bookedColleagueLabel(s)).filter((x) => x && x !== 'Booked')),
        ];
        if (names.length > 0) {
          const head = names.slice(0, 6).join(', ');
          const tail = names.length > 6 ? ` (+${names.length - 6} more)` : '';
          return `${base}. Booked: ${head}${tail}.`;
        }
        return base;
      }}
      footerNote="Number on each day = open slots you can book. Red = that day is fully booked. Gray = at least one slot is free."
    />
  );

  return (
    <div
      className={
        wideSplit
          ? 'flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8 xl:gap-10'
          : 'space-y-5'
      }
    >
      <div
        className={
          wideSplit
            ? 'w-full min-w-0 shrink-0 lg:max-w-[min(100%,42rem)] xl:max-w-[min(100%,48rem)]'
            : 'contents'
        }
      >
        {calendarEl}
      </div>

      <div className={wideSplit ? 'min-w-0 flex-1' : 'min-w-0'}>
        <h3 className="text-sm font-semibold text-gray-800 border-b border-gray-200 pb-2 mb-3">
          {selectedBookingYmd ? formatYmdHeading(selectedBookingYmd) : 'Select a day'}
        </h3>
        {!selectedBookingYmd ? (
          <p className="text-xs text-gray-500 py-5 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-2">
            Tap a date on the calendar to see times.
          </p>
        ) : slotsForSelectedDay.length === 0 ? (
          <p className="text-xs text-gray-500 py-5 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-2">
            No slots on this day.
          </p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
            {slotsForSelectedDay.map((slot) => {
              const taken = !!slot.booked_reviewee_user_id;
              const isMine = taken && revieweeUserIdsEqual(slot.booked_reviewee_user_id, bookingTargetId);
              const canHrCancelTaken = !!(taken && onCancelBookedSlot && slot.booked_reviewee_user_id);
              const canTake = !taken && (!!bookingTargetId || allowReserveWithoutTarget);
              return (
                <div
                  key={slot.starts_at}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-white hover:bg-gray-50/80"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-semibold tabular-nums text-gray-900 text-sm">
                        {formatTimeOnly(slot.starts_at, slot.ends_at)}
                      </span>
                      {!taken ? (
                        <AppBadge
                          variant="success"
                          className="!px-1.5 !py-px !text-[10px] !leading-none normal-case !tracking-normal"
                        >
                          Available
                        </AppBadge>
                      ) : null}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{durationMinutes} min meeting</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {taken ? (
                      <span className="text-xs text-gray-700">
                        {hideOtherBookedNames && !isMine ? (
                          <span className="font-medium">Booked</span>
                        ) : (
                          <>
                            Booked — <span className="font-medium">{bookedColleagueLabel(slot)}</span>
                          </>
                        )}
                      </span>
                    ) : null}
                    {canTake ? (
                      <button
                        type="button"
                        onClick={() => onBook(slot.starts_at)}
                        disabled={isPending}
                        className="rounded-lg bg-brand-red px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#aa1212] disabled:opacity-50"
                      >
                        {reserveLabel}
                      </button>
                    ) : canHrCancelTaken ? (
                      <button
                        type="button"
                        onClick={() => {
                          const id = slot.booked_reviewee_user_id;
                          if (id) onCancelBookedSlot(id);
                        }}
                        disabled={isPending}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {cancelLabel}
                      </button>
                    ) : isMine ? (
                      <button
                        type="button"
                        onClick={onCancelMine}
                        disabled={isPending}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {cancelLabel}
                      </button>
                    ) : null}
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
