import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

function localInputFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoFromLocalInput(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type Draft = { at: string; notes: string };

type Props = {
  cycleId: string;
  setCycleId: (id: string) => void;
  cycles: any[] | undefined;
  activeCycles: any[];
};

export default function DirectorMeetingScheduleTab({
  cycleId,
  setCycleId,
  cycles,
  activeCycles,
}: Props) {
  const queryClient = useQueryClient();
  const { data: hrStatus = [], isLoading } = useQuery({
    queryKey: ['review-hr-status', cycleId],
    queryFn: () => api<any[]>('GET', `/reviews/cycles/${cycleId}/hr-status`),
    enabled: !!cycleId,
  });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const r of hrStatus as any[]) {
      next[r.user_id] = {
        at: localInputFromIso(r.director_meeting_scheduled_at),
        notes: (r.director_meeting_notes as string) || '',
      };
    }
    setDrafts(next);
  }, [hrStatus, cycleId]);

  const mutation = useMutation({
    mutationFn: async ({
      userId,
      scheduled_at,
      notes,
    }: {
      userId: string;
      scheduled_at: string | null;
      notes: string | null;
    }) =>
      api<any>(
        'PUT',
        `/reviews/cycles/${encodeURIComponent(cycleId)}/director-meetings/${encodeURIComponent(userId)}`,
        { scheduled_at, notes }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-hr-status', cycleId] });
    },
  });

  const cycleOptions = useMemo(
    () => (activeCycles.length ? activeCycles : cycles || []),
    [activeCycles, cycles]
  );

  const updateDraft = (userId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [userId]: { at: prev[userId]?.at ?? '', notes: prev[userId]?.notes ?? '', ...patch },
    }));
  };

  const saveRow = async (userId: string) => {
    const d = drafts[userId];
    if (!d || !cycleId) return;
    setSavingId(userId);
    try {
      await mutation.mutateAsync({
        userId,
        scheduled_at: isoFromLocalInput(d.at),
        notes: d.notes.trim() ? d.notes.trim() : null,
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-3">Director–employee 1:1</h1>
      <p className="text-sm text-gray-600 mb-2 max-w-3xl leading-relaxed">
        Final stage after self-review and supervisor review: HR or the director compares responses in the cycle (Team
        progress → Compare), then schedules the closing in-person meeting with the employee here.
      </p>
      <p className="text-sm text-gray-600 mb-4">
        For <span className="font-medium text-gray-800">published time slots</span>, employees book in{' '}
        <Link to="/reviews/my" className="font-medium text-brand-red hover:underline">
          My reviews
        </Link>{' '}
        → <span className="font-medium text-gray-800">Director 1:1</span> tab. HR can use the full{' '}
        <Link to="/reviews/director-meetings" className="font-medium text-brand-red hover:underline">
          Meeting schedule
        </Link>{' '}
        under Employee Review. Use the table below for manual date/time overrides if needed.
      </p>
      <p className="text-sm text-gray-500 mb-4">
        Open side-by-side comparison:{' '}
        <Link
          to={cycleId ? `/reviews/compare?cycle=${encodeURIComponent(cycleId)}` : '/reviews/compare'}
          className="font-medium text-brand-red hover:underline"
        >
          Reviews comparison
        </Link>
        {cycleId ? (
          <>
            {' '}
            — or from{' '}
            <Link to={`/reviews/cycles/${encodeURIComponent(cycleId)}`} className="font-medium text-brand-red hover:underline">
              this cycle’s Team progress
            </Link>
            .
          </>
        ) : null}
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm font-medium text-gray-700">Cycle</label>
        <select
          className="border rounded px-3 py-2 text-sm min-w-[220px]"
          value={cycleId}
          onChange={(e) => setCycleId(e.target.value)}
        >
          <option value="">Select cycle…</option>
          {cycleOptions.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.status === 'active' ? '(active)' : ''}
            </option>
          ))}
        </select>
      </div>

      {cycleId ? (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Employee</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase">Reviews</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase whitespace-nowrap">
                  1:1 date &amp; time
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase min-w-[10rem]">
                  Notes
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-600 uppercase w-28"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : (hrStatus as any[]).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No employees in this cycle.
                  </td>
                </tr>
              ) : (
                (hrStatus as any[]).map((r: any) => {
                  const draft = drafts[r.user_id] ?? { at: '', notes: '' };
                  return (
                    <tr key={r.user_id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 font-medium text-gray-900">{r.display_name || r.name || r.user_id}</td>
                      <td className="px-4 py-3">
                        {r.both_done ? (
                          <span className="text-green-700 font-medium">Both done</span>
                        ) : (
                          <span className="text-amber-700">
                            {!r.employee_self_done ? 'Missing self' : ''}{' '}
                            {!r.supervisor_done ? 'Missing supervisor' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="datetime-local"
                          className="border rounded px-2 py-1.5 text-sm w-full max-w-[14rem]"
                          value={draft.at}
                          onChange={(e) => updateDraft(r.user_id, { at: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <textarea
                          className="border rounded px-2 py-1.5 text-sm w-full min-h-[2.5rem] resize-y"
                          placeholder="Optional (location, agenda)"
                          rows={2}
                          value={draft.notes}
                          onChange={(e) => updateDraft(r.user_id, { notes: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={savingId === r.user_id}
                          onClick={() => saveRow(r.user_id)}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {savingId === r.user_id ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-6 text-gray-500 text-sm">Select a cycle to schedule meetings.</div>
      )}
    </div>
  );
}
