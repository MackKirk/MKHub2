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
  id: string;
  cycle_id: string;
  cycle_name?: string;
  is_self?: boolean;
  reviewee_user_id: string;
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

function newWindowRow() {
  return { id: crypto.randomUUID(), starts_at: '', ends_at: '' };
}

export default function DirectorMeetingsPage() {
  const queryClient = useQueryClient();
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

  const [cycleId, setCycleId] = useState<string>('');

  useEffect(() => {
    if (cycleId || !cycleOptions.length) return;
    setCycleId(String(cycleOptions[0].id));
  }, [cycleOptions, cycleId]);

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['director-meeting-board', cycleId],
    queryFn: () => api<BoardResponse>('GET', `/reviews/cycles/${encodeURIComponent(cycleId)}/director-meeting-board`),
    enabled: !!cycleId,
  });

  const { data: hrStatus = [] } = useQuery({
    queryKey: ['review-hr-status', cycleId],
    queryFn: () => api<any[]>('GET', `/reviews/cycles/${encodeURIComponent(cycleId)}/hr-status`),
    enabled: !!cycleId && canHrBook,
  });

  const [durationDraft, setDurationDraft] = useState(30);
  const [windowsDraft, setWindowsDraft] = useState(() => [newWindowRow()]);

  useEffect(() => {
    if (!board) return;
    setDurationDraft(board.duration_minutes || 30);
    const w = board.windows || [];
    if (w.length) {
      setWindowsDraft(
        w.map((x) => ({
          id: x.id || crypto.randomUUID(),
          starts_at: localFromIso(x.starts_at),
          ends_at: localFromIso(x.ends_at),
        }))
      );
    } else {
      setWindowsDraft([newWindowRow()]);
    }
  }, [board?.duration_minutes, board?.windows, cycleId]);

  const saveConfig = useMutation({
    mutationFn: (body: { duration_minutes: number; windows: { id: string; starts_at: string; ends_at: string }[] }) =>
      api<BoardResponse>(
        'PUT',
        `/reviews/cycles/${encodeURIComponent(cycleId)}/director-meeting-config`,
        {
          duration_minutes: body.duration_minutes,
          windows: body.windows.map((w) => ({
            id: w.id,
            starts_at: isoFromLocal(w.starts_at),
            ends_at: isoFromLocal(w.ends_at),
          })),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['director-meeting-board', cycleId] });
    },
  });

  const bookMutation = useMutation({
    mutationFn: (body: { reviewee_user_id: string; slot_starts_at: string | null }) =>
      api('POST', `/reviews/cycles/${encodeURIComponent(cycleId)}/director-meetings/book`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['director-meeting-board', cycleId] });
      queryClient.invalidateQueries({ queryKey: ['review-hr-status', cycleId] });
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
  }, [canHrBook, hrStatus, cycleId]);

  const bookingTargetId = canHrBook ? hrRevieweeId : myId;

  const activeBookingSlot = useMemo(() => {
    if (!board?.slots?.length || !bookingTargetId) return null;
    return board.slots.find((s) => s.booked_reviewee_user_id === bookingTargetId) || null;
  }, [board, bookingTargetId]);

  const handleBook = useCallback(
    (slotStartIso: string) => {
      if (!bookingTargetId || !cycleId) return;
      bookMutation.mutate({ reviewee_user_id: bookingTargetId, slot_starts_at: slotStartIso });
    },
    [bookingTargetId, cycleId, bookMutation]
  );

  const handleCancelMine = useCallback(() => {
    if (!bookingTargetId || !cycleId) return;
    bookMutation.mutate({ reviewee_user_id: bookingTargetId, slot_starts_at: null });
  }, [bookingTargetId, cycleId, bookMutation]);

  const updateWindow = (idx: number, field: 'starts_at' | 'ends_at', val: string) => {
    setWindowsDraft((rows) => {
      const next = [...rows];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const addWindow = () => setWindowsDraft((rows) => [...rows, newWindowRow()]);
  const removeWindow = (idx: number) =>
    setWindowsDraft((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx)));

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 pb-12">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Director 1:1 meetings</h1>
        <p className="text-sm text-gray-600 mt-1 max-w-2xl">
          An admin sets meeting length and availability per cycle. Employees book from{' '}
          <Link className="text-brand-red font-medium hover:underline" to="/reviews/my">
            My reviews
          </Link>{' '}
          (Director 1:1 tab). Use this page to configure slots and, as HR, to book on behalf of others.{' '}
          <Link className="text-brand-red font-medium hover:underline" to="/reviews/compare">
            Compare reviews
          </Link>{' '}
          if needed.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <label className="text-sm font-medium text-gray-700">Cycle</label>
        <select
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm min-w-[240px]"
          value={cycleId}
          onChange={(e) => setCycleId(e.target.value)}
        >
          <option value="">Select…</option>
          {cycleOptions.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {!cycleId ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 py-12 text-center text-sm text-gray-500">
          {cycleOptions.length === 0
            ? 'No review cycles available for your account.'
            : 'Select a review cycle.'}
        </div>
      ) : (
        <>
          {canConfigure ? (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                Availability (admin)
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Meeting length applies to every generated slot. Add one or more windows (start → end); the system
                splits them into consecutive slots of that length.
              </p>
              <div className="flex flex-wrap items-end gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    min={15}
                    max={480}
                    step={5}
                    className="w-28 rounded-lg border border-gray-300 px-2 py-2 text-sm"
                    value={durationDraft}
                    onChange={(e) => setDurationDraft(Number(e.target.value) || 30)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    saveConfig.mutate({
                      duration_minutes: durationDraft,
                      windows: windowsDraft.filter((w) => w.starts_at && w.ends_at),
                    })
                  }
                  disabled={saveConfig.isPending}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {saveConfig.isPending ? 'Saving…' : 'Save availability'}
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Time windows</span>
                  <button type="button" onClick={addWindow} className="text-sm font-semibold text-brand-red hover:underline">
                    + Add window
                  </button>
                </div>
                {windowsDraft.map((w, idx) => (
                  <div key={w.id} className="flex flex-wrap items-center gap-2">
                    <input
                      type="datetime-local"
                      className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
                      value={w.starts_at}
                      onChange={(e) => updateWindow(idx, 'starts_at', e.target.value)}
                    />
                    <span className="text-gray-400">→</span>
                    <input
                      type="datetime-local"
                      className="rounded-lg border border-gray-300 px-2 py-2 text-sm"
                      value={w.ends_at}
                      onChange={(e) => updateWindow(idx, 'ends_at', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeWindow(idx)}
                      className="text-xs text-gray-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Book a slot</h2>
            {canHrBook ? (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Employee (HR)</label>
                <select
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[280px]"
                  value={hrRevieweeId}
                  onChange={(e) => setHrRevieweeId(e.target.value)}
                >
                  {(hrStatus as any[]).map((r: any) => (
                    <option key={r.user_id} value={r.user_id}>
                      {r.display_name || r.name || r.user_id}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-4">
                Booking for <span className="font-medium text-gray-900">your account</span>.
                {activeBookingSlot ? (
                  <span className="block mt-2 text-green-700">
                    Scheduled: {formatRange(activeBookingSlot.starts_at, activeBookingSlot.ends_at)}
                  </span>
                ) : null}
              </p>
            )}
            {boardLoading ? (
              <p className="text-sm text-gray-500">Loading slots…</p>
            ) : !(board?.slots || []).length ? (
              <p className="text-sm text-amber-700">
                No slots yet. An admin must set duration and availability windows above (or in{' '}
                <Link to="/reviews/admin" className="font-medium underline">
                  Employee Review → Director 1:1
                </Link>
                ).
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-100">
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
                      const isMine = taken && slot.booked_reviewee_user_id === bookingTargetId;
                      const canTake = !taken && !!bookingTargetId;
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
                                onClick={handleCancelMine}
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
          </section>
        </>
      )}
    </div>
  );
}

function localFromIso(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoFromLocal(v: string): string {
  if (!v.trim()) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}
