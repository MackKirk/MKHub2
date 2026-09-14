import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppInput,
  uiCx,
  uiTypography,
} from '@/components/ui';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import {
  addDays,
  formatWeekRangeLabel,
  startOfSundayWeek,
  weekdayShort,
  weekDateStrings,
} from '@/lib/weekUtils';
import LoadingSpinner from '@/components/LoadingSpinner';
import { AttendanceSageBadge } from '@/components/AttendanceSageBadge';

export type AttendanceWeekGridEntry = {
  event_id: string;
  worker_id: string;
  worker_name: string;
  hours_worked?: number | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  is_hours_worked?: boolean;
  sage_state?: string | null;
  sage_locked?: boolean;
  sage_error?: string | null;
  record_kind?: string | null;
};

export type AttendanceWeekGridEmployee = {
  id: string;
  name: string;
};

type Props = {
  weekStart: Date;
  onWeekStartChange: (next: Date) => void;
  employees: AttendanceWeekGridEmployee[];
  entries: AttendanceWeekGridEntry[];
  jobLabel: (entry: AttendanceWeekGridEntry) => string;
  canEdit: boolean;
  isLoading?: boolean;
  onAdd: (workerId: string, date: string) => void;
  onEdit: (entry: AttendanceWeekGridEntry) => void;
};

function entryLocalDate(entry: AttendanceWeekGridEntry): string {
  const iso = entry.clock_in_time || entry.clock_out_time;
  if (!iso) return '';
  if (entry.is_hours_worked) return iso.slice(0, 10);
  return formatDateLocal(new Date(iso));
}

function isOpenClock(entry: AttendanceWeekGridEntry): boolean {
  return !entry.is_hours_worked && !!entry.clock_in_time && !entry.clock_out_time;
}

function entrySageClass(entry: AttendanceWeekGridEntry): string {
  if (isOpenClock(entry)) return 'border-amber-300 bg-amber-50 text-amber-950';
  switch ((entry.sage_state || '').toLowerCase()) {
    case 'paid':
      return 'border-gray-300 bg-gray-50 text-gray-700';
    case 'error':
      return 'border-red-300 bg-red-50 text-red-950';
    case 'queued':
      return 'border-sky-200 bg-sky-50 text-gray-800';
    case 'sent':
      return 'border-emerald-200 bg-emerald-50 text-gray-800';
    default:
      return 'border-gray-200 bg-white text-gray-800';
  }
}

function formatHoursShort(hours?: number | null): string {
  if (hours === undefined || hours === null) return '—';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function AttendanceWeekGrid({
  weekStart,
  onWeekStartChange,
  employees,
  entries,
  jobLabel,
  canEdit,
  isLoading,
  onAdd,
  onEdit,
}: Props) {
  const [query, setQuery] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);
  const todayStr = getTodayLocal();
  const dates = useMemo(() => weekDateStrings(weekStart), [weekStart]);

  const byWorkerDay = useMemo(() => {
    const map = new Map<string, AttendanceWeekGridEntry[]>();
    for (const entry of entries) {
      const day = entryLocalDate(entry);
      if (!day) continue;
      const key = `${entry.worker_id}|${day}`;
      const list = map.get(key) || [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [entries]);

  const openByWorker = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      if (isOpenClock(entry)) set.add(entry.worker_id);
    }
    return set;
  }, [entries]);

  const hoursByWorker = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      map.set(entry.worker_id, (map.get(entry.worker_id) || 0) + (entry.hours_worked || 0));
    }
    return map;
  }, [entries]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter((emp) => !q || emp.name.toLowerCase().includes(q))
      .filter((emp) => !hideEmpty || (hoursByWorker.get(emp.id) || 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, query, hideEmpty, hoursByWorker]);

  const clockedInCount = openByWorker.size;
  const weekTotal = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.hours_worked || 0), 0),
    [entries],
  );

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onWeekStartChange(addDays(weekStart, -7))}
            leftIcon={<ChevronLeft className="h-4 w-4" />}
          >
            Previous
          </AppButton>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onWeekStartChange(startOfSundayWeek(new Date()))}
          >
            This week
          </AppButton>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onWeekStartChange(addDays(weekStart, 7))}
            rightIcon={<ChevronRight className="h-4 w-4" />}
          >
            Next
          </AppButton>
          <p className={uiCx(uiTypography.pageSubtitle, 'px-1 font-medium text-gray-800')}>
            {formatWeekRangeLabel(weekStart)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {clockedInCount > 0 ? (
            <AppBadge variant="warning">{clockedInCount} clocked in</AppBadge>
          ) : (
            <AppBadge variant="neutral">Nobody clocked in</AppBadge>
          )}
          <AppBadge variant="neutral">Week total {formatHoursShort(weekTotal)}</AppBadge>
          <span className="px-1 text-[10px] uppercase tracking-wide text-gray-400">Sage</span>
          <AppBadge variant="info">Queued</AppBadge>
          <AppBadge variant="success">In Sage</AppBadge>
          <AppBadge variant="neutral">Paid</AppBadge>
          <AppBadge variant="danger">Sage error</AppBadge>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <AppInput
            label="Find employee"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name"
          />
        </div>
        <label className={uiCx('mb-1 flex items-center gap-2 text-xs text-gray-700')}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(e) => setHideEmpty(e.target.checked)}
          />
          Hide people with no hours
        </label>
      </div>

      {isLoading ? (
        <div className="flex min-h-[16rem] items-center justify-center rounded-xl border border-gray-200 bg-white">
          <LoadingSpinner size="lg" text="Loading employees…" />
        </div>
      ) : rows.length === 0 ? (
        <AppEmptyState
          title="No employees to show"
          description="Clear the search, or turn off “hide people with no hours”."
          className="border-0 bg-transparent p-0 py-6 shadow-none"
        />
      ) : (
        <div className="overflow-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-[64rem] w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="sticky left-0 z-10 min-w-[12rem] border-b border-r border-gray-200 bg-gray-50 px-3 py-2 font-semibold">
                  Employee
                </th>
                {dates.map((date) => (
                  <th
                    key={date}
                    className={uiCx(
                      'min-w-[7.5rem] border-b border-gray-200 px-2 py-2 font-semibold',
                      date === todayStr ? 'bg-blue-50 text-blue-900' : '',
                    )}
                  >
                    <div>{weekdayShort(date)}</div>
                    <div className="font-normal text-gray-500">{date.slice(5)}</div>
                  </th>
                ))}
                <th className="min-w-[5.5rem] border-b border-l border-gray-200 px-2 py-2 font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => {
                const weekHours = hoursByWorker.get(emp.id) || 0;
                const clockedIn = openByWorker.has(emp.id);
                return (
                  <tr key={emp.id} className="align-top hover:bg-gray-50/80">
                    <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-3 py-2">
                      <div className="font-medium text-gray-900">{emp.name}</div>
                      {clockedIn ? <AppBadge variant="warning">Clocked in</AppBadge> : null}
                    </td>
                    {dates.map((date) => {
                      const cell = byWorkerDay.get(`${emp.id}|${date}`) || [];
                      return (
                        <td
                          key={date}
                          className={uiCx(
                            'border-b border-gray-100 px-1.5 py-1.5',
                            date === todayStr ? 'bg-blue-50/40' : '',
                          )}
                        >
                          <div className="flex min-h-[2.75rem] flex-col gap-1">
                            {cell.map((entry) => (
                              <button
                                key={entry.event_id}
                                type="button"
                                onClick={() => onEdit(entry)}
                                className={uiCx(
                                  'rounded-md border px-1.5 py-1 text-left hover:border-gray-400',
                                  entrySageClass(entry),
                                )}
                              >
                                <div className="font-semibold">{formatHoursShort(entry.hours_worked)}</div>
                                <div className="truncate text-[10px] text-gray-500">{jobLabel(entry)}</div>
                                <AttendanceSageBadge
                                  state={entry.sage_state}
                                  recordKind={entry.record_kind}
                                  error={entry.sage_error}
                                />
                              </button>
                            ))}
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => onAdd(emp.id, date)}
                                className="inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-gray-200 px-1 py-1 text-[10px] text-gray-500 hover:border-gray-400 hover:text-gray-800"
                              >
                                <Plus className="h-3 w-3" />
                                Add
                              </button>
                            ) : cell.length === 0 ? (
                              <span className="px-1 py-2 text-gray-300">—</span>
                            ) : null}
                          </div>
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-gray-100 px-2 py-2 font-semibold text-gray-900">
                      {formatHoursShort(weekHours)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
