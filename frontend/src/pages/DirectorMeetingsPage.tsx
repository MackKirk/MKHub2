import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import DirectorMeetingMonthCalendar, {
  formatYMD,
  formatYmdHeading,
} from '@/components/DirectorMeetingMonthCalendar';
import DirectorMeetingSlotPicker, {
  normalizeDirectorMeetingSlots,
  revieweeUserIdsEqual,
} from '@/components/DirectorMeetingSlotPicker';
import OverlayPortal from '@/components/OverlayPortal';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { FieldHint } from '@/components/FieldHint';
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

/** Build: removing a row with bookings, or Book tab: cancelling someone’s slot — both notify then apply. */
type PendingDirectorNotifyModal =
  | { kind: 'remove_row'; idx: number; bookedSlots: BoardSlot[] }
  | {
      kind: 'cancel_booking';
      cycleId: string;
      revieweeUserId: string;
      displayName: string;
    };

type AssignmentRow = {
  id: string;
  cycle_id: string;
  cycle_name?: string;
  is_self?: boolean;
  reviewee_user_id: string;
};

/** One availability block: day + start clock time + how long the calendar stays open (then split into meeting-sized slots). */
type AvailabilityRow = {
  id: string;
  date: string;
  startTime: string;
  windowMinutes: number;
};

/** Same choices for meeting slot length and quick-picks for how long each availability block stays open. */
const DURATION_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 h', minutes: 60 },
] as const;

const PRESET_MINUTES = new Set(DURATION_PRESETS.map((p) => p.minutes));

/** Snap saved duration to the nearest preset when loading (legacy values like 25 → 30). */
function snapToMeetingPresetMinutes(raw: number): number {
  const v = Math.max(15, Math.min(480, raw || 15));
  if (PRESET_MINUTES.has(v)) return v;
  const opts = [...PRESET_MINUTES] as number[];
  return opts.reduce((best, x) => (Math.abs(x - v) <= Math.abs(best - v) ? x : best), opts[0]);
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Browsers often use HH:mm:ss for <input type="time" />; our logic must accept both. */
function parseClockParts(s: string): { h: number; m: number } | null {
  const t = (s || '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/** Normalize for controlled time inputs (stable HH:mm). */
function normalizeTimeValue(raw: string): string {
  const p = parseClockParts(raw);
  if (!p) return raw.trim();
  return `${pad2(p.h)}:${pad2(p.m)}`;
}

function availabilityFromApiWindows(
  windows: { id?: string; starts_at: string; ends_at: string }[]
): AvailabilityRow[] {
  return windows.map((w) => {
    const s = new Date(w.starts_at);
    const e = new Date(w.ends_at);
    const id = w.id || crypto.randomUUID();
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      return { id, date: '', startTime: '09:00', windowMinutes: 60 };
    }
    const date = `${s.getFullYear()}-${pad2(s.getMonth() + 1)}-${pad2(s.getDate())}`;
    const startTime = `${pad2(s.getHours())}:${pad2(s.getMinutes())}`;
    const windowMinutes = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000));
    return { id, date, startTime, windowMinutes };
  });
}

/** Build ISO range from local date + time + window length (same semantics as previous datetime-local). */
function toApiWindow(row: AvailabilityRow): { id: string; starts_at: string; ends_at: string } | null {
  if (!row.date || !row.startTime.trim()) return null;
  const [yy, mm, dd] = row.date.split('-').map((x) => parseInt(x, 10));
  const tm = row.startTime.trim();
  const pc = parseClockParts(tm);
  if (!pc || Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  const start = new Date(yy, mm - 1, dd, pc.h, pc.m, 0, 0);
  if (Number.isNaN(start.getTime())) return null;
  const wm = Math.max(15, Math.min(24 * 60, row.windowMinutes || 60));
  const end = new Date(start.getTime() + wm * 60000);
  return {
    id: row.id,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
  };
}

/** Same slot carving as server `_derive_slots_from_windows` (reviews.py). */
function deriveSlotsFromWindows(
  durationMinutes: number,
  windows: { starts_at: string; ends_at: string }[]
): { starts_at: string; ends_at: string }[] {
  const durMs = Math.max(1, durationMinutes) * 60000;
  const slots: { starts_at: string; ends_at: string }[] = [];
  for (const w of windows) {
    let cur = new Date(w.starts_at).getTime();
    const end = new Date(w.ends_at).getTime();
    if (Number.isNaN(cur) || Number.isNaN(end) || cur >= end) continue;
    while (cur + durMs <= end) {
      const slotEnd = cur + durMs;
      slots.push({
        starts_at: new Date(cur).toISOString(),
        ends_at: new Date(slotEnd).toISOString(),
      });
      cur = slotEnd;
    }
  }
  slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return slots;
}

function slotOverlapsAvailabilityRow(slot: BoardSlot, row: AvailabilityRow): boolean {
  const w = toApiWindow(row);
  if (!w) return false;
  const rs = new Date(w.starts_at).getTime();
  const re = new Date(w.ends_at).getTime();
  const ss = new Date(slot.starts_at).getTime();
  const se = new Date(slot.ends_at).getTime();
  if ([rs, re, ss, se].some((x) => Number.isNaN(x))) return false;
  return ss < re && se > rs;
}

/** Bookings on the live board whose slot start is not present after publishing the draft. */
function getDisplacedBookingsByConfigChange(
  currentBoard: BoardResponse | undefined,
  payload: { duration_minutes: number; windows: { starts_at: string; ends_at: string }[] }
): { name: string; startsAt: string }[] {
  const slots = normalizeDirectorMeetingSlots(currentBoard?.slots as unknown[]);
  if (!slots.length) return [];
  const dur = snapToMeetingPresetMinutes(payload.duration_minutes);
  const newSlots = deriveSlotsFromWindows(dur, payload.windows);
  const newStartMs = new Set(newSlots.map((s) => new Date(s.starts_at).getTime()));
  const out: { name: string; startsAt: string }[] = [];
  for (const s of slots) {
    if (!s.booked_reviewee_user_id) continue;
    const t = new Date(s.starts_at).getTime();
    if (Number.isNaN(t)) continue;
    if (!newStartMs.has(t)) {
      out.push({
        name: (s.booked_reviewee_name || s.booked_reviewee_user_id || '').trim() || 'Unknown',
        startsAt: s.starts_at,
      });
    }
  }
  return out;
}

function formatSlotStartLabel(iso: string) {
  try {
    const a = new Date(iso);
    if (Number.isNaN(a.getTime())) return iso;
    return a.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
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

function formatDayHeading(isoStart: string) {
  try {
    const a = new Date(isoStart);
    if (Number.isNaN(a.getTime())) return '';
    return a.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function newAvailabilityRow(): AvailabilityRow {
  const today = new Date();
  const date = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  return { id: crypto.randomUUID(), date, startTime: '09:00', windowMinutes: 60 };
}

/** Canonical fingerprint for comparing draft vs last saved (ids ignored). */
function scheduleFingerprint(duration: number, rows: AvailabilityRow[]): string {
  const normalized = rows
    .map((r) => ({
      date: (r.date || '').trim(),
      start: normalizeTimeValue(r.startTime || ''),
      wm: Math.max(15, Math.min(24 * 60, r.windowMinutes || 60)),
    }))
    .filter((r) => r.date)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.wm - b.wm
    );
  return JSON.stringify({ duration, rows: normalized });
}

/** Inclusive list of YYYY-MM-DD from start through end (same day if end omitted). */
function enumerateDates(fromYmd: string, toYmd: string | ''): string[] {
  if (!fromYmd.trim()) return [];
  const startParts = fromYmd.split('-').map((x) => parseInt(x, 10));
  const endStr = (toYmd || '').trim() || fromYmd;
  const endParts = endStr.split('-').map((x) => parseInt(x, 10));
  if (startParts.length !== 3 || endParts.length !== 3) return [];
  const start = new Date(startParts[0], startParts[1] - 1, startParts[2], 12, 0, 0, 0);
  const end = new Date(endParts[0], endParts[1] - 1, endParts[2], 12, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    out.push(formatYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Minutes between two clock times on the same calendar day (local). Accepts HH:mm or HH:mm:ss. */
function minutesBetweenTimesOnDay(dateYmd: string, startHHmm: string, endHHmm: string): number | null {
  const [y, mo, d] = dateYmd.split('-').map((x) => parseInt(x, 10));
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return null;
  const ps = parseClockParts(startHHmm);
  const pe = parseClockParts(endHHmm);
  if (!ps || !pe) return null;
  const s = new Date(y, mo - 1, d, ps.h, ps.m, 0, 0);
  const e = new Date(y, mo - 1, d, pe.h, pe.m, 0, 0);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null;
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

/**
 * One draft row per bookable slot (same as server slicing): consecutive blocks of `slotMinutes`
 * from `fromHHmm` until `toHHmm` on that calendar day.
 */
function expandDayIntoSlotRows(dateYmd: string, fromHHmm: string, toHHmm: string, slotMinutes: number): AvailabilityRow[] {
  const span = Math.max(15, Math.min(24 * 60, slotMinutes || 15));
  const wm = minutesBetweenTimesOnDay(dateYmd, fromHHmm, toHHmm);
  if (wm == null || wm < span) return [];

  const [y, mo, d] = dateYmd.split('-').map((x) => parseInt(x, 10));
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return [];
  const ps = parseClockParts(fromHHmm);
  const pe = parseClockParts(toHHmm);
  if (!ps || !pe) return [];

  const rows: AvailabilityRow[] = [];
  let cur = new Date(y, mo - 1, d, ps.h, ps.m, 0, 0);
  const dayEnd = new Date(y, mo - 1, d, pe.h, pe.m, 0, 0);
  while (cur.getTime() + span * 60000 <= dayEnd.getTime()) {
    rows.push({
      id: crypto.randomUUID(),
      date: dateYmd,
      startTime: `${pad2(cur.getHours())}:${pad2(cur.getMinutes())}`,
      windowMinutes: span,
    });
    cur = new Date(cur.getTime() + span * 60000);
  }
  return rows;
}

type PageTab = 'build' | 'book';

type BookPersonModalTab = 'new' | 'reschedule';

export default function DirectorMeetingsPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const myId = me?.id != null ? String(me.id) : '';

  const perms: string[] = me?.permissions || [];
  const roles: string[] = me?.roles || [];
  const canConfigure =
    roles.includes('admin') || perms.includes('hr:reviews:admin') || perms.includes('reviews:admin');
  const canHrBook = canConfigure;

  const canLoadAllCycles =
    roles.includes('admin') || perms.includes('reviews:read') || perms.includes('hr:reviews:admin');

  const { data: allCycles } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<any[]>('GET', '/reviews/cycles'),
    enabled: canLoadAllCycles,
  });

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

  const cycleOptions = useMemo(() => {
    if (canLoadAllCycles && (allCycles || []).length) return allCycles || [];
    return cyclesFromSelf;
  }, [canLoadAllCycles, allCycles, cyclesFromSelf]);

  const [pageTab, setPageTab] = useState<PageTab>('build');

  /** First cycle in the list — used to load slot config for Build (same config is synced to all cycles on save). */
  const canonicalCycleId = useMemo(
    () => (cycleOptions.length ? String((cycleOptions[0] as { id: string }).id) : ''),
    [cycleOptions]
  );

  /** Which cycle’s assignments / bookings HR is acting on in Book tab (slots are the same for every cycle). */
  const [bookingCycleId, setBookingCycleId] = useState('');
  useEffect(() => {
    if (!canonicalCycleId) return;
    setBookingCycleId((prev) => {
      if (prev && cycleOptions.some((c: { id: string }) => String(c.id) === prev)) return prev;
      return canonicalCycleId;
    });
  }, [canonicalCycleId, cycleOptions]);

  const boardQueryCycleId =
    pageTab === 'build' ? canonicalCycleId : bookingCycleId || canonicalCycleId;

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['director-meeting-board', boardQueryCycleId],
    queryFn: () =>
      api<BoardResponse>(
        'GET',
        `/reviews/cycles/${encodeURIComponent(boardQueryCycleId)}/director-meeting-board`
      ),
    enabled: !!boardQueryCycleId,
  });

  const boardSlotsNorm = useMemo(
    () => normalizeDirectorMeetingSlots(board?.slots as unknown[]),
    [board?.slots]
  );

  const { data: hrStatus = [] } = useQuery({
    queryKey: ['review-hr-status', bookingCycleId],
    queryFn: () =>
      api<any[]>('GET', `/reviews/cycles/${encodeURIComponent(bookingCycleId)}/hr-status`),
    enabled: !!bookingCycleId && canHrBook,
  });

  useEffect(() => {
    if (!canConfigure && pageTab === 'build') setPageTab('book');
  }, [canConfigure, pageTab]);

  const [meetingDurationDraft, setMeetingDurationDraft] = useState(15);
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityRow[]>(() => [newAvailabilityRow()]);

  const todayYmd = useMemo(() => formatYMD(new Date()), []);
  const [bulkDateFrom, setBulkDateFrom] = useState(todayYmd);
  const [bulkDateTo, setBulkDateTo] = useState(todayYmd);
  const [bulkTimeFrom, setBulkTimeFrom] = useState('09:00');
  const [bulkTimeTo, setBulkTimeTo] = useState('11:00');
  const [bulkReplaceDraft, setBulkReplaceDraft] = useState(false);
  const [bulkHint, setBulkHint] = useState<string | null>(null);

  const [scheduleCalendarMonth, setScheduleCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [scheduleSelectedYmd, setScheduleSelectedYmd] = useState<string | null>(() => formatYMD(new Date()));

  useEffect(() => {
    setBulkHint(null);
  }, [pageTab]);

  useEffect(() => {
    if (!canonicalCycleId) return;
    const ymd = formatYMD(new Date());
    setScheduleSelectedYmd(ymd);
    setBulkDateFrom(ymd);
    setBulkDateTo(ymd);
    setScheduleCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  }, [canonicalCycleId]);

  useEffect(() => {
    if (!scheduleSelectedYmd) return;
    const parts = scheduleSelectedYmd.split('-').map((x) => parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return;
    setScheduleCalendarMonth(new Date(parts[0], parts[1] - 1, 1));
  }, [scheduleSelectedYmd]);

  const [savedScheduleFingerprint, setSavedScheduleFingerprint] = useState('');
  const [scheduleBaselineReady, setScheduleBaselineReady] = useState(false);

  useEffect(() => {
    setScheduleBaselineReady(false);
    setSavedScheduleFingerprint('');
  }, [canonicalCycleId]);

  useEffect(() => {
    if (!board) return;
    const dur = snapToMeetingPresetMinutes(board.duration_minutes ?? 15);
    const w = board.windows || [];
    const rows = w.length ? availabilityFromApiWindows(w) : [newAvailabilityRow()];
    setMeetingDurationDraft(dur);
    setAvailabilityDraft(rows);
    setSavedScheduleFingerprint(scheduleFingerprint(dur, rows));
    setScheduleBaselineReady(true);
  }, [board?.duration_minutes, board?.windows, canonicalCycleId]);

  const saveConfig = useMutation({
    mutationFn: (body: { duration_minutes: number; windows: { id: string; starts_at: string; ends_at: string }[] }) =>
      api<BoardResponse>('PUT', `/reviews/director-meeting-config-all-cycles`, body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['director-meeting-board'] });
      queryClient.invalidateQueries({ queryKey: ['review-hr-status'] });
      const dur = snapToMeetingPresetMinutes(variables.duration_minutes);
      const rows =
        variables.windows.length > 0
          ? availabilityFromApiWindows(variables.windows)
          : [newAvailabilityRow()];
      setSavedScheduleFingerprint(scheduleFingerprint(dur, rows));
    },
  });

  const bookMutation = useMutation({
    mutationFn: (body: {
      cycleId: string;
      reviewee_user_id: string;
      slot_starts_at: string | null;
      hr_cancel_message?: string | null;
    }) => {
      const payload: Record<string, unknown> = {
        reviewee_user_id: body.reviewee_user_id,
        slot_starts_at: body.slot_starts_at,
      };
      if (body.hr_cancel_message != null && body.hr_cancel_message !== '') {
        payload.hr_cancel_message = body.hr_cancel_message;
      }
      return api('POST', `/reviews/cycles/${encodeURIComponent(body.cycleId)}/director-meetings/book`, payload);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['director-meeting-board'] });
      queryClient.invalidateQueries({ queryKey: ['review-hr-status', variables.cycleId] });
    },
  });

  const [hrRevieweeId, setHrRevieweeId] = useState<string>('');

  useEffect(() => {
    if (!canHrBook || !hrStatus.length) {
      setHrRevieweeId('');
      return;
    }
    setHrRevieweeId((prev) => {
      if (prev && (hrStatus as any[]).some((r: any) => r.user_id === prev)) return prev;
      return String((hrStatus as any[])[0]?.user_id || '');
    });
  }, [canHrBook, hrStatus, bookingCycleId]);

  const bookingTargetId = canHrBook ? hrRevieweeId : myId;

  /** At least self-review done (`employee_self_done`) — sorted A–Z for reserve-time picker modal. */
  const eligiblePeopleBySelfDone = useMemo(() => {
    const rows = (hrStatus as any[]).filter((r: any) => !!r.employee_self_done);
    return [...rows].sort((a: any, b: any) =>
      String(a.display_name || a.name || '').localeCompare(
        String(b.display_name || b.name || ''),
        undefined,
        { sensitivity: 'base' }
      )
    );
  }, [hrStatus]);

  const peopleWithoutSchedule = useMemo(
    () => eligiblePeopleBySelfDone.filter((r: any) => !r.director_meeting_scheduled_at),
    [eligiblePeopleBySelfDone]
  );

  const peopleWithSchedule = useMemo(
    () => eligiblePeopleBySelfDone.filter((r: any) => !!r.director_meeting_scheduled_at),
    [eligiblePeopleBySelfDone]
  );

  const [bookPersonModalOpen, setBookPersonModalOpen] = useState(false);
  const [bookPersonModalTab, setBookPersonModalTab] = useState<BookPersonModalTab>('new');
  const [pendingBookSlotStartsAt, setPendingBookSlotStartsAt] = useState<string | null>(null);
  const closeBookPersonModal = useCallback(() => {
    setBookPersonModalOpen(false);
    setPendingBookSlotStartsAt(null);
  }, []);

  useEffect(() => {
    if (!bookPersonModalOpen) return;
    if (peopleWithoutSchedule.length > 0) setBookPersonModalTab('new');
    else if (peopleWithSchedule.length > 0) setBookPersonModalTab('reschedule');
  }, [bookPersonModalOpen, peopleWithoutSchedule.length, peopleWithSchedule.length]);

  useEffect(() => {
    if (!bookPersonModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBookPersonModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bookPersonModalOpen, closeBookPersonModal]);

  const pickPendingPersonForBooking = useCallback(
    (userId: string) => {
      if (!bookingCycleId || !pendingBookSlotStartsAt) return;
      setHrRevieweeId(userId);
      closeBookPersonModal();
      bookMutation.mutate({
        cycleId: bookingCycleId,
        reviewee_user_id: userId,
        slot_starts_at: pendingBookSlotStartsAt,
      });
    },
    [bookMutation, bookingCycleId, pendingBookSlotStartsAt, closeBookPersonModal]
  );

  const activeBookingSlot = useMemo(() => {
    if (!boardSlotsNorm.length || !bookingTargetId) return null;
    return boardSlotsNorm.find((s) => revieweeUserIdsEqual(s.booked_reviewee_user_id, bookingTargetId)) || null;
  }, [boardSlotsNorm, bookingTargetId]);

  const handleBook = useCallback(
    (slotStartIso: string) => {
      if (!bookingCycleId) return;
      if (canHrBook) {
        if (eligiblePeopleBySelfDone.length === 0) {
          toast.error('No colleague with self-review submitted for booking yet.');
          return;
        }
        setPendingBookSlotStartsAt(slotStartIso);
        setBookPersonModalOpen(true);
        return;
      }
      if (!bookingTargetId) return;
      bookMutation.mutate({
        cycleId: bookingCycleId,
        reviewee_user_id: bookingTargetId,
        slot_starts_at: slotStartIso,
      });
    },
    [bookingTargetId, bookingCycleId, bookMutation, canHrBook, eligiblePeopleBySelfDone.length]
  );

  const openCancelBookingModal = useCallback(
    (revieweeUserId: string) => {
      if (!revieweeUserId || !bookingCycleId) return;
      const slot = boardSlotsNorm.find((s) => revieweeUserIdsEqual(s.booked_reviewee_user_id, revieweeUserId));
      const displayName = (slot?.booked_reviewee_name || '').trim() || revieweeUserId;
      setPendingDirectorNotifyModal({
        kind: 'cancel_booking',
        cycleId: bookingCycleId,
        revieweeUserId,
        displayName,
      });
      setRemoveBookingJustification('');
    },
    [bookingCycleId, boardSlotsNorm]
  );

  const handleCancelMine = useCallback(() => {
    if (!bookingTargetId) return;
    openCancelBookingModal(bookingTargetId);
  }, [bookingTargetId, openCancelBookingModal]);

  const removeAvailabilityRow = useCallback((idx: number) => {
    setAvailabilityDraft((rows) => rows.filter((_, i) => i !== idx));
  }, []);

  const [pendingDirectorNotifyModal, setPendingDirectorNotifyModal] = useState<PendingDirectorNotifyModal | null>(
    null
  );
  const [removeBookingJustification, setRemoveBookingJustification] = useState('');
  const [removeNotifyPending, setRemoveNotifyPending] = useState(false);

  const closeDirectorNotifyModal = useCallback(() => {
    setPendingDirectorNotifyModal(null);
    setRemoveBookingJustification('');
    setRemoveNotifyPending(false);
  }, []);

  const submitDirectorNotifyModal = useCallback(async () => {
    if (!pendingDirectorNotifyModal) return;
    const msg = removeBookingJustification.trim();
    if (!msg) {
      toast.error('Enter a message for the affected colleagues.');
      return;
    }

    let removeRowIds: string[] | null = null;
    if (pendingDirectorNotifyModal.kind === 'remove_row') {
      if (!canonicalCycleId) return;
      removeRowIds = [
        ...new Set(
          pendingDirectorNotifyModal.bookedSlots
            .map((s) => s.booked_reviewee_user_id)
            .filter((id): id is string => !!id)
        ),
      ];
      if (!removeRowIds.length) {
        toast.error('No booked colleagues found for this row.');
        return;
      }
    }

    setRemoveNotifyPending(true);
    try {
      const pend = pendingDirectorNotifyModal;
      if (pend.kind === 'remove_row') {
        await api<{ ok: boolean; notified_count: number }>(
          'POST',
          `/reviews/cycles/${encodeURIComponent(canonicalCycleId)}/director-meeting-notify-affected`,
          {
            reviewee_user_ids: removeRowIds!,
            message: msg,
          }
        );
        removeAvailabilityRow(pend.idx);
        closeDirectorNotifyModal();
        toast.success(
          removeRowIds!.length === 1
            ? 'Notification sent. Row removed from schedule.'
            : `Notifications sent (${removeRowIds!.length}). Row removed from schedule.`
        );
      } else {
        await api<{ ok: boolean; notified_count: number }>(
          'POST',
          `/reviews/cycles/${encodeURIComponent(pend.cycleId)}/director-meeting-notify-affected`,
          {
            reviewee_user_ids: [pend.revieweeUserId],
            message: msg,
          }
        );
        await bookMutation.mutateAsync({
          cycleId: pend.cycleId,
          reviewee_user_id: pend.revieweeUserId,
          slot_starts_at: null,
          hr_cancel_message: msg,
        });
        closeDirectorNotifyModal();
        toast.success('Notification sent. Booking cancelled.');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Failed to send notifications');
    } finally {
      setRemoveNotifyPending(false);
    }
  }, [
    pendingDirectorNotifyModal,
    canonicalCycleId,
    removeBookingJustification,
    closeDirectorNotifyModal,
    removeAvailabilityRow,
    bookMutation,
  ]);

  useEffect(() => {
    if (!pendingDirectorNotifyModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDirectorNotifyModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDirectorNotifyModal, closeDirectorNotifyModal]);

  const requestRemoveDraftRow = useCallback(
    (idx: number, bookedSlots: BoardSlot[]) => {
      if (bookedSlots.length > 0) {
        setPendingDirectorNotifyModal({ kind: 'remove_row', idx, bookedSlots });
        setRemoveBookingJustification('');
        return;
      }
      removeAvailabilityRow(idx);
    },
    [removeAvailabilityRow]
  );

  const draftCountByYmd = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of availabilityDraft) {
      if (!r.date?.trim()) continue;
      m.set(r.date, (m.get(r.date) ?? 0) + 1);
    }
    return m;
  }, [availabilityDraft]);

  /** Rows for the calendar-selected day only (Current Schedule panel). */
  const draftRowsForSelectedDay = useMemo(() => {
    if (!scheduleSelectedYmd) return [];
    const items: { row: AvailabilityRow; idx: number }[] = [];
    availabilityDraft.forEach((row, idx) => {
      if (row.date?.trim() === scheduleSelectedYmd) items.push({ row, idx });
    });
    return items.sort((x, y) =>
      normalizeTimeValue(x.row.startTime).localeCompare(normalizeTimeValue(y.row.startTime))
    );
  }, [availabilityDraft, scheduleSelectedYmd]);

  const draftScheduleFingerprint = useMemo(
    () => scheduleFingerprint(meetingDurationDraft, availabilityDraft),
    [meetingDurationDraft, availabilityDraft]
  );

  const hasScheduleUnsaved =
    scheduleBaselineReady && canConfigure && draftScheduleFingerprint !== savedScheduleFingerprint;

  const buildSchedulePayload = useCallback(() => {
    const windows: { id: string; starts_at: string; ends_at: string }[] = [];
    for (const row of availabilityDraft) {
      const w = toApiWindow(row);
      if (w) windows.push(w);
    }
    return {
      duration_minutes: meetingDurationDraft,
      windows: windows.map((x) => ({ id: x.id, starts_at: x.starts_at, ends_at: x.ends_at })),
    };
  }, [availabilityDraft, meetingDurationDraft]);

  const saveSchedule = useCallback(async () => {
    const payload = buildSchedulePayload();
    const displaced = getDisplacedBookingsByConfigChange(board, payload);
    if (displaced.length > 0) {
      const lines = displaced.slice(0, 10).map((d) => `• ${d.name} — ${formatSlotStartLabel(d.startsAt)}`);
      const more =
        displaced.length > 10 ? `\n… and ${displaced.length - 10} more booking(s).` : '';
      const result = await confirm({
        title: 'Existing bookings',
        message: `Publishing this draft removes ${displaced.length} current slot start(s) from the schedule (usually because times or duration changed). Those meetings may need to be rebooked:\n\n${lines.join('\n')}${more}\n\nPublish this schedule anyway?`,
        confirmText: 'Publish anyway',
        cancelText: 'Cancel',
      });
      if (result !== 'confirm') return;
    }
    await saveConfig.mutateAsync(payload);
  }, [buildSchedulePayload, saveConfig, board, confirm]);

  const discardScheduleDraft = useCallback(() => {
    if (!board) return;
    const dur = snapToMeetingPresetMinutes(board.duration_minutes ?? 15);
    const w = board.windows || [];
    const rows = w.length ? availabilityFromApiWindows(w) : [newAvailabilityRow()];
    setMeetingDurationDraft(dur);
    setAvailabilityDraft(rows);
    setSavedScheduleFingerprint(scheduleFingerprint(dur, rows));
  }, [board]);

  useUnsavedChangesGuard(hasScheduleUnsaved, saveSchedule, discardScheduleDraft);

  const hasConfiguredWindows = (board?.windows?.length ?? 0) > 0;

  const bulkPreviewSlots = useMemo(() => {
    const wm = minutesBetweenTimesOnDay(
      bulkDateFrom || todayYmd,
      normalizeTimeValue(bulkTimeFrom),
      normalizeTimeValue(bulkTimeTo)
    );
    if (wm == null || wm < 15 || meetingDurationDraft < 1) return 0;
    return Math.floor(wm / meetingDurationDraft);
  }, [bulkDateFrom, bulkTimeFrom, bulkTimeTo, meetingDurationDraft, todayYmd]);

  const bulkDayCount = useMemo(() => enumerateDates(bulkDateFrom || todayYmd, bulkDateTo).length, [
    bulkDateFrom,
    bulkDateTo,
    todayYmd,
  ]);

  const addTimeRangeToDraft = () => {
    setBulkHint(null);
    const anchor = bulkDateFrom.trim();
    if (!anchor) {
      setBulkHint('Choose a start date.');
      return;
    }
    const wm = minutesBetweenTimesOnDay(anchor, normalizeTimeValue(bulkTimeFrom), normalizeTimeValue(bulkTimeTo));
    if (wm == null) {
      setBulkHint('End time must be after start time on the same day.');
      return;
    }
    if (wm < 15) {
      setBulkHint('The time range must be at least 15 minutes.');
      return;
    }
    const days = enumerateDates(anchor, bulkDateTo.trim() || anchor);
    if (!days.length) {
      setBulkHint('End date must be on or after start date.');
      return;
    }
    const slotSpan = Math.max(15, Math.min(480, meetingDurationDraft || 15));
    const slotsPerDay = Math.floor(wm / slotSpan);
    const fromNorm = normalizeTimeValue(bulkTimeFrom);
    const toNorm = normalizeTimeValue(bulkTimeTo);

    const newRows: AvailabilityRow[] = [];
    for (const date of days) {
      newRows.push(...expandDayIntoSlotRows(date, fromNorm, toNorm, slotSpan));
    }

    if (!newRows.length) {
      setBulkHint(
        'No slot rows generated — the time range must fit at least one meeting (expand To − From or shorten “Each meeting slot lasts”).'
      );
      return;
    }

    if (bulkReplaceDraft) {
      setAvailabilityDraft(newRows);
    } else {
      setAvailabilityDraft((rows) => [...rows, ...newRows]);
    }
    const action = bulkReplaceDraft ? 'Replaced schedule with' : 'Added';
    const perDay = slotsPerDay > 0 ? slotsPerDay : Math.ceil(newRows.length / Math.max(1, days.length));
    setBulkHint(
      `${action} ${newRows.length} slot row${newRows.length === 1 ? '' : 's'} (~${perDay} per day × ${days.length} day${days.length === 1 ? '' : 's'}, ${slotSpan} min each). Save schedule when ready.`
    );
  };

  const promptScheduleLeave = useCallback(
    async (message: string): Promise<boolean> => {
      if (!hasScheduleUnsaved || !canConfigure) return true;
      const result = await confirm({
        title: 'Unsaved Changes',
        message,
        confirmText: 'Save and Continue',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes',
      });
      if (result === 'cancel') return false;
      if (result === 'confirm') {
        try {
          await saveSchedule();
          return true;
        } catch {
          return false;
        }
      }
      discardScheduleDraft();
      return true;
    },
    [hasScheduleUnsaved, canConfigure, confirm, saveSchedule, discardScheduleDraft]
  );

  const handlePageTabRequest = async (next: PageTab) => {
    if (next === pageTab) return;
    if (pageTab === 'build' && next === 'book') {
      const ok = await promptScheduleLeave(
        'You have unsaved changes in Build schedule. What would you like to do?'
      );
      if (!ok) return;
    }
    setPageTab(next);
  };

  const directorNotifyModalRecipients = useMemo(() => {
    if (!pendingDirectorNotifyModal) return [] as { id: string; label: string }[];
    if (pendingDirectorNotifyModal.kind === 'cancel_booking') {
      const p = pendingDirectorNotifyModal;
      return [{ id: p.revieweeUserId, label: p.displayName }];
    }
    const m = new Map<string, string>();
    for (const s of pendingDirectorNotifyModal.bookedSlots) {
      const id = s.booked_reviewee_user_id;
      if (!id) continue;
      if (!m.has(id)) m.set(id, (s.booked_reviewee_name || id).trim());
    }
    return [...m.entries()].map(([id, label]) => ({ id, label }));
  }, [pendingDirectorNotifyModal]);

  const showScheduleFooterBar = canConfigure && pageTab === 'build' && !!canonicalCycleId && scheduleBaselineReady;

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <>
    <div className={`w-full min-w-0 max-w-none space-y-4 ${showScheduleFooterBar ? 'pb-28' : 'pb-12'}`}>
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h5 className="text-sm font-semibold text-purple-900">Director meeting schedule</h5>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                Publish availability and book director closing 1:1s for the performance review cycle.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-end shrink-0 lg:pl-4">
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
          </div>
        </div>
      </div>

      {!canonicalCycleId ? (
        <div className="rounded-xl border bg-white py-12 text-center text-xs text-gray-500">
          {cycleOptions.length === 0
            ? 'No review cycles available for your account.'
            : 'Loading review cycles…'}
        </div>
      ) : (
        <>
          {canConfigure ? (
            <div className="rounded-xl border bg-white p-3">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Director meetings">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pageTab === 'build'}
                  onClick={() => void handlePageTabRequest('build')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    pageTab === 'build'
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  Build schedule
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pageTab === 'book'}
                  onClick={() => void handlePageTabRequest('book')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    pageTab === 'book'
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  Book times
                </button>
              </div>
            </div>
          ) : null}

          {canConfigure && pageTab === 'build' ? (
            <section className="rounded-xl border bg-white p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Publish availability</h2>

              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 mb-6">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
                  <div className="min-w-0 flex-1 shrink-0">
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-800">Calendar</span>
                      <FieldHint
                        hint={
                          'Calendar\n\nClick a day to sync start and end dates in the form. The badge is how many schedule rows fall on that date.'
                        }
                      />
                    </div>
                    <DirectorMeetingMonthCalendar
                      compact
                      visibleMonth={scheduleCalendarMonth}
                      onVisibleMonthChange={setScheduleCalendarMonth}
                      selectedYmd={scheduleSelectedYmd}
                      onSelectYmd={(ymd) => {
                        setScheduleSelectedYmd(ymd);
                        setBulkDateFrom(ymd);
                        setBulkDateTo(ymd);
                      }}
                      getDayProps={(ymd) => {
                        const n = draftCountByYmd.get(ymd) ?? 0;
                        return {
                          disabled: false,
                          badge: n > 0 ? n : undefined,
                          badgeTone: n > 0 ? 'draft' : 'neutral',
                        };
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-800">Dates & times</span>
                      <FieldHint
                        hint={
                          'Dates & times\n\nSet the day range and daily open hours. The same From–To window applies to each day in the range when you add rows.'
                        }
                      />
                    </div>
                    <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-3">
                        <div>
                          <div className="mb-1 flex items-center gap-1">
                            <span className="text-xs font-medium text-gray-600">Start date</span>
                            <FieldHint hint="First day included when you generate rows from the range (bulk add)." />
                          </div>
                          <input
                            type="date"
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 min-w-[10rem] focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                            value={bulkDateFrom}
                            onChange={(e) => setBulkDateFrom(e.target.value)}
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center gap-1">
                            <span className="text-xs font-medium text-gray-600">End date</span>
                            <FieldHint hint="Last day included (inclusive). Use the same as start for a single day, or extend for multiple days." />
                          </div>
                          <input
                            type="date"
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 min-w-[10rem] focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                            value={bulkDateTo}
                            onChange={(e) => setBulkDateTo(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <div>
                          <div className="mb-1 flex items-center gap-1">
                            <span className="text-xs font-medium text-gray-600">From time</span>
                            <FieldHint hint="Start of the daily open window. The same From–To times apply to each day between start and end date." />
                          </div>
                          <input
                            type="time"
                            step={60}
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 min-w-[7rem] focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                            value={bulkTimeFrom}
                            onChange={(e) => setBulkTimeFrom(normalizeTimeValue(e.target.value))}
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center gap-1">
                            <span className="text-xs font-medium text-gray-600">To time</span>
                            <FieldHint hint="End of the daily window. Must be after From time; the span is split into meeting-length slots." />
                          </div>
                          <input
                            type="time"
                            step={60}
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 min-w-[7rem] focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                            value={bulkTimeTo}
                            onChange={(e) => setBulkTimeTo(normalizeTimeValue(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-gray-300"
                        checked={bulkReplaceDraft}
                        onChange={(e) => setBulkReplaceDraft(e.target.checked)}
                      />
                      <span className="flex flex-wrap items-center gap-1 text-xs text-gray-700">
                        Replace current Schedule
                        <FieldHint hint="When checked, your next Add replaces the whole schedule. When off, new rows are appended to what you already have." />
                      </span>
                    </label>

                    <div>
                      <div className="mb-2 flex items-center gap-1">
                        <span className="text-xs font-medium text-gray-600">Each meeting slot lasts</span>
                        <FieldHint hint="Length of each bookable slot. The From–To window is divided into consecutive segments of this length." />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DURATION_PRESETS.map((p) => (
                          <button
                            key={`slot-${p.minutes}`}
                            type="button"
                            onClick={() => setMeetingDurationDraft(p.minutes)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                              meetingDurationDraft === p.minutes
                                ? 'border-brand-red bg-brand-red text-white hover:bg-[#aa1212]'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                      Preview: ~<span className="font-semibold text-gray-900">{bulkPreviewSlots}</span> row
                      {bulkPreviewSlots === 1 ? '' : 's'} per day · ~{' '}
                      <span className="font-semibold text-gray-900">{bulkDayCount * bulkPreviewSlots}</span> total for{' '}
                      {bulkDayCount} day{bulkDayCount === 1 ? '' : 's'} · each row ={' '}
                      <span className="font-semibold text-gray-900">{meetingDurationDraft} min</span> window.
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={addTimeRangeToDraft}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-red px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#aa1212] sm:px-3 sm:py-1.5"
                      >
                        {bulkReplaceDraft ? 'Replace schedule from range' : 'Add range to schedule'}
                      </button>
                    </div>

                    {bulkHint ? (
                      <p
                        className={`text-xs ${/^Added |^Replaced /.test(bulkHint) ? 'text-emerald-800' : 'text-red-700'}`}
                        role="status"
                      >
                        {bulkHint}
                      </p>
                    ) : null}
                    </div>
                  </div>
                </div>

                {scheduleSelectedYmd ? (
                  <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-semibold text-gray-900">Current schedule</h4>
                          <FieldHint hint="Shows availability rows for the selected day in your current schedule. Remove a row if needed; if someone already booked in that window, you can notify them before removing." />
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-gray-600">{formatYmdHeading(scheduleSelectedYmd)}</p>
                      </div>
                      <span className="rounded-full bg-gray-200/90 px-2.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-800">
                        {draftRowsForSelectedDay.length} row{draftRowsForSelectedDay.length === 1 ? '' : 's'} this day
                      </span>
                    </div>
                    <div className="max-h-[min(22rem,55vh)] overflow-y-auto p-4">
                      {draftRowsForSelectedDay.length > 0 ? (
                        <ul className="space-y-1.5">
                          {draftRowsForSelectedDay.map(({ row, idx }) => {
                            const bookedHere = boardSlotsNorm.filter(
                              (s) => s.booked_reviewee_user_id && slotOverlapsAvailabilityRow(s, row)
                            );
                            return (
                              <li
                                key={row.id}
                                className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="tabular-nums text-gray-800">
                                    <span className="font-medium">{normalizeTimeValue(row.startTime)}</span>
                                    <span className="text-gray-400"> · </span>
                                    {row.windowMinutes} min window
                                  </div>
                                  {bookedHere.length > 0 ? (
                                    <p className="mt-1 text-xs font-medium leading-snug text-amber-900">
                                      Booked:{' '}
                                      {bookedHere
                                        .map(
                                          (s) =>
                                            `${s.booked_reviewee_name || s.booked_reviewee_user_id} (${formatTimeOnly(
                                              s.starts_at,
                                              s.ends_at
                                            )})`
                                        )
                                        .join(' · ')}
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => void requestRemoveDraftRow(idx, bookedHere)}
                                  className="shrink-0 self-start rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-red-600 hover:border-red-200 sm:self-center"
                                >
                                  Remove
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : availabilityDraft.length === 0 ? (
                        <p className="py-8 text-center text-xs leading-relaxed text-gray-500">
                          Nothing in the schedule yet. Use the calendar and time range above. Saving while empty clears published
                          availability for every review cycle.
                        </p>
                      ) : (
                        <p className="py-8 text-center text-xs leading-relaxed text-gray-500">
                          No windows for this day in the current schedule. Choose another day on the calendar or add a range that
                          includes this date.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {(!canConfigure || pageTab === 'book') ? (
          <section className="rounded-xl border bg-white p-4 sm:p-5">
            {canHrBook ? (
              <div className="mb-5 space-y-4">
                {cycleOptions.length > 1 ? (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1">
                      <label className="text-xs font-medium text-gray-700">Review cycle (assignments)</label>
                      <FieldHint hint="Open times are identical for every cycle; this only picks which cycle’s assignment list and bookings you are acting on." />
                    </div>
                    <select
                      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 min-w-[min(100%,320px)] focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                      value={bookingCycleId}
                      onChange={(e) => setBookingCycleId(e.target.value)}
                    >
                      {(cycleOptions as { id: string; name?: string }[]).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.id}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Open times are shared across cycles; this only chooses which cycle’s employee list and bookings you are
                      working with.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                Booking for <span className="font-semibold text-gray-900">your account</span>.
                {activeBookingSlot ? (
                  <span className="block mt-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
                    <span className="font-medium">Scheduled:</span>{' '}
                    {formatDayHeading(activeBookingSlot.starts_at)} ·{' '}
                    {formatTimeOnly(activeBookingSlot.starts_at, activeBookingSlot.ends_at)}
                  </span>
                ) : null}
              </p>
            )}

            {boardLoading ? (
              <p className="text-xs text-gray-500 py-8 text-center">Loading open times…</p>
            ) : !hasConfiguredWindows ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center text-xs text-amber-950">
                {canConfigure ? (
                  <>
                    No schedule published yet. Open the <span className="font-semibold">Build schedule</span> tab to add
                    availability, or configure under{' '}
                  </>
                ) : (
                  <>No schedule published yet. An admin must publish availability under </>
                )}
                <Link to="/reviews/director-meetings" className="font-semibold underline">
                  Employee Review → Meeting schedule
                </Link>
                .
              </div>
            ) : !boardSlotsNorm.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center text-xs text-amber-950">
                No bookable times yet — try a longer block or shorter meeting length so at least one slot fits inside the
                window.
              </div>
            ) : (
              <DirectorMeetingSlotPicker
                cycleId={bookingCycleId || canonicalCycleId}
                slots={boardSlotsNorm}
                durationMinutes={board?.duration_minutes ?? meetingDurationDraft}
                bookingTargetId={bookingTargetId}
                onBook={(iso) => handleBook(iso)}
                onCancelMine={handleCancelMine}
                onCancelBookedSlot={canHrBook ? (uid) => openCancelBookingModal(uid) : undefined}
                isPending={bookMutation.isPending}
                compact
                wideSplit
                allowReserveWithoutTarget={canHrBook}
              />
            )}
          </section>
          ) : null}
        </>
      )}
    </div>

    {bookPersonModalOpen ? (
      <OverlayPortal>
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="book-person-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeBookPersonModal();
          }}
        >
          <div
            className="flex max-h-[min(88vh,32rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-5 py-4">
              <h2 id="book-person-modal-title" className="text-sm font-semibold text-gray-900">
                New schedule
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
                Pick who this slot is for. People who already have a meeting are under{' '}
                <span className="font-medium text-gray-800">Reschedule</span>, with their current time shown.
              </p>
              {pendingBookSlotStartsAt ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700">
                  <span className="font-medium text-gray-500">Time:</span>
                  <span className="font-semibold tabular-nums text-gray-900">
                    {formatSlotStartLabel(pendingBookSlotStartsAt)}
                  </span>
                </p>
              ) : null}
            </div>

            <div className="shrink-0 border-b border-gray-100 px-4 pt-3 pb-3">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Booking type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={bookPersonModalTab === 'new'}
                  onClick={() => setBookPersonModalTab('new')}
                  className={`inline-flex flex-1 min-w-0 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors sm:flex-initial ${
                    bookPersonModalTab === 'new'
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  Not scheduled
                  <span
                    className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      bookPersonModalTab === 'new' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {peopleWithoutSchedule.length}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={bookPersonModalTab === 'reschedule'}
                  onClick={() => setBookPersonModalTab('reschedule')}
                  className={`inline-flex flex-1 min-w-0 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors sm:flex-initial ${
                    bookPersonModalTab === 'reschedule'
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  Reschedule
                  <span
                    className={`min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      bookPersonModalTab === 'reschedule' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {peopleWithSchedule.length}
                  </span>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {bookPersonModalTab === 'new' ? (
                peopleWithoutSchedule.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center">
                    <p className="text-xs font-medium text-gray-700">No one without a meeting</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Everyone eligible already has a time. Use the Reschedule tab to change it.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {peopleWithoutSchedule.map((r: any) => (
                      <li key={r.user_id}>
                        <button
                          type="button"
                          onClick={() => pickPendingPersonForBooking(String(r.user_id))}
                          disabled={bookMutation.isPending}
                          className="group w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-all hover:border-gray-300 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
                        >
                          <span className="text-xs font-semibold text-gray-900 group-hover:text-brand-red">
                            {r.display_name || r.name || r.user_id}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-gray-500">Click to book this slot</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : peopleWithSchedule.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-8 text-center">
                  <p className="text-xs font-medium text-gray-700">No one to reschedule</p>
                  <p className="mt-1 text-xs text-gray-500">
                    No eligible people with a meeting booked in this cycle yet.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {peopleWithSchedule.map((r: any) => {
                    const startsAt = r.director_meeting_scheduled_at as string | null;
                    const endsAt =
                      (r.director_meeting_scheduled_until as string | null) ||
                      (r.director_meeting_scheduled_at as string | null);
                    return (
                      <li key={r.user_id}>
                        <button
                          type="button"
                          onClick={() => pickPendingPersonForBooking(String(r.user_id))}
                          disabled={bookMutation.isPending}
                          className="group w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-all hover:border-gray-300 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50"
                        >
                          <div className="text-xs font-semibold text-gray-900 group-hover:text-brand-red">
                            {r.display_name || r.name || r.user_id}
                          </div>
                          {startsAt ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-600">
                              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                                Current: {formatDayHeading(startsAt)}
                              </span>
                              {endsAt ? (
                                <span className="tabular-nums text-gray-600">{formatTimeOnly(startsAt, endsAt)}</span>
                              ) : null}
                            </div>
                          ) : null}
                          <span className="mt-1.5 block text-[11px] text-gray-500">
                            The current booking will be replaced with this slot
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={() => closeBookPersonModal()}
                disabled={bookMutation.isPending}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </OverlayPortal>
    ) : null}

    {pendingDirectorNotifyModal ? (
      <OverlayPortal>
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-booking-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !removeNotifyPending) closeDirectorNotifyModal();
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              id="remove-booking-modal-title"
              className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900"
            >
              {pendingDirectorNotifyModal.kind === 'remove_row'
                ? 'Remove schedule row — colleagues will be notified'
                : 'Cancel booking — colleagues will be notified'}
            </div>
            <div className="max-h-[min(70vh,28rem)] overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-gray-700 leading-relaxed">
                {pendingDirectorNotifyModal.kind === 'remove_row' ? (
                  <>
                    This row overlaps published slots that are already booked. If you continue, an{' '}
                    <span className="font-medium text-gray-900">in-app notification</span> will be sent to each affected
                    person with your message below. Then the row is removed from your current schedule (publish to apply
                    availability).
                  </>
                ) : (
                  <>
                    This cancels the director meeting slot for this person. If you continue, an{' '}
                    <span className="font-medium text-gray-900">in-app notification</span> will be sent with your message
                    below, then the booking is cleared.
                  </>
                )}
              </p>
              {directorNotifyModalRecipients.length > 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                  <span className="font-medium text-gray-900">Notify: </span>
                  {directorNotifyModalRecipients.map((r) => r.label).join(' · ')}
                </div>
              ) : null}
              <div>
                <label htmlFor="remove-booking-justification" className="block text-xs font-medium text-gray-700 mb-1">
                  Message to colleagues <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="remove-booking-justification"
                  rows={4}
                  maxLength={4000}
                  value={removeBookingJustification}
                  onChange={(e) => setRemoveBookingJustification(e.target.value)}
                  placeholder="Explain why the time is changing or what they should do next…"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-400 focus:ring-1 focus:ring-gray-400"
                  disabled={removeNotifyPending}
                />
                <p className="mt-1 text-[11px] text-gray-500">{removeBookingJustification.length}/4000</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
              <button
                type="button"
                onClick={() => closeDirectorNotifyModal()}
                disabled={removeNotifyPending}
                className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitDirectorNotifyModal()}
                disabled={
                  removeNotifyPending ||
                  !removeBookingJustification.trim() ||
                  directorNotifyModalRecipients.length === 0
                }
                className="rounded-lg px-3 py-2 bg-brand-red text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
              >
                {removeNotifyPending
                  ? 'Sending…'
                  : pendingDirectorNotifyModal.kind === 'remove_row'
                    ? 'Send notification & remove row'
                    : 'Send notification & cancel booking'}
              </button>
            </div>
          </div>
        </div>
      </OverlayPortal>
    ) : null}

    {showScheduleFooterBar ? (
      <div className="fixed left-64 right-0 bottom-0 z-40 flex justify-center">
        <div className="w-full min-w-0 max-w-none px-5">
          <div className="rounded-t-xl border bg-white/95 backdrop-blur p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
            {hasScheduleUnsaved ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 font-medium">
                Unsaved changes
              </div>
            ) : (
              <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1 font-medium">
                All changes saved
              </div>
            )}
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => discardScheduleDraft()}
                disabled={!hasScheduleUnsaved || saveConfig.isPending}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void saveSchedule()}
                disabled={!hasScheduleUnsaved || saveConfig.isPending}
                className="rounded-lg bg-brand-red px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#aa1212] disabled:opacity-50 disabled:pointer-events-none"
              >
                {saveConfig.isPending ? 'Saving…' : 'Save schedule'}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
