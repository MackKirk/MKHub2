import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  project_name?: string;
  project_id?: string;
  status?: string;
};

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

function formatDayShort(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type ScheduleWidgetProps = {
  config?: Record<string, unknown>;
};

export function ScheduleWidget({ config: _config }: ScheduleWidgetProps) {
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
  });

  const weekStart = useMemo(() => new Date(anchorDate), [anchorDate]);
  const weekEnd = useMemo(() => {
    const sat = new Date(anchorDate);
    sat.setDate(sat.getDate() + 6);
    return sat;
  }, [anchorDate]);
  const dateRange = useMemo(
    () => `${formatDateLocal(weekStart)},${formatDateLocal(weekEnd)}`,
    [weekStart, weekEnd]
  );

  const { data: shifts = [], isLoading, error } = useQuery<Shift[]>({
    queryKey: ['schedule-shifts', dateRange, currentUser?.id],
    queryFn: () => {
      const workerId = currentUser?.id;
      if (!workerId) return Promise.resolve([]);
      return api<Shift[]>('GET', `/dispatch/shifts?date_range=${dateRange}&worker_id=${workerId}`);
    },
    enabled: !!currentUser?.id,
  });

  const shiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    shifts.forEach((s) => {
      const key = s.date?.slice(0, 10) ?? '';
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    const keys = Object.keys(map).sort();
    keys.forEach((k) => map[k].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));
    return map;
  }, [shifts]);

  const weekLabel = useMemo(() => {
    return `${formatDayShort(formatDateLocal(weekStart))} – ${formatDayShort(formatDateLocal(weekEnd))}`;
  }, [weekStart, weekEnd]);

  const goToPrev = () => {
    setAnchorDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };
  const goToNext = () => {
    setAnchorDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };
  const goToToday = () => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    setAnchorDate(d);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-0 h-full justify-center py-4 text-sm text-gray-400">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm text-red-600">
        Failed to load schedule
      </div>
    );
  }

  const dateKeys = Object.keys(shiftsByDate).sort();
  const totalShifts = shifts.length;

  return (
    <div className="flex flex-col min-h-0 h-full w-full">
      <div className="flex items-center justify-between shrink-0 mb-2">
        <span className="text-[10px] font-semibold text-gray-600 truncate">{weekLabel}</span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={goToPrev}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 text-xs"
            aria-label="Previous week"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-600 hover:bg-gray-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 text-xs"
            aria-label="Next week"
          >
            →
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {totalShifts === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-4 text-center text-xs text-gray-500">
            No shifts this week
          </div>
        ) : (
          dateKeys.map((dateStr) => (
            <div key={dateStr} className="shrink-0">
              <div className="text-[10px] font-semibold text-gray-500 mb-1">
                {formatDayShort(dateStr)}
              </div>
              <ul className="space-y-1.5">
                {(shiftsByDate[dateStr] ?? []).map((shift) => (
                  <li key={shift.id}>
                    <Link
                      to={`/schedule?date=${dateStr}`}
                      className="block rounded-lg border border-gray-200 bg-white px-2.5 py-2 shadow-sm transition-all hover:border-brand-red/30 hover:shadow-md hover:bg-gray-50/50"
                    >
                      <div className="font-medium text-gray-900 text-xs truncate">
                        {shift.project_name || 'Shift'}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
      <div className="shrink-0 pt-2 border-t border-gray-100">
        <Link to="/schedule" className="text-xs font-medium text-brand-red hover:underline">
          View full schedule →
        </Link>
      </div>
    </div>
  );
}
