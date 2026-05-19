import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { AppButton, AppEmptyState, uiBorders, uiCx, uiRadius, uiTypography } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  embedded?: boolean;
};

export function ScheduleWidget({ config: _config, embedded = false }: ScheduleWidgetProps) {
  const { ready } = useAnimationReady();
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
    [weekStart, weekEnd],
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
      <div className="flex h-full min-h-0 w-full flex-col">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="min-h-0 flex-1">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }
  if (error) {
    return (
      <div className={uiCx(uiRadius.control, 'border border-red-200 bg-red-50/50 px-3 py-2 text-sm text-red-600')}>
        Failed to load schedule
      </div>
    );
  }

  const dateKeys = Object.keys(shiftsByDate).sort();
  const totalShifts = shifts.length;

  const weekControls = embedded ? (
    <div className="mb-3 flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 pb-3">
      <span className={uiCx(uiTypography.controlLabel, 'truncate font-semibold text-gray-700')}>{weekLabel}</span>
      <div className="flex shrink-0 items-center gap-1">
        <AppButton variant="secondary" size="sm" leftIcon={<ChevronLeft className="h-4 w-4" />} onClick={goToPrev} aria-label="Previous week" />
        <AppButton variant="secondary" size="sm" onClick={goToToday}>
          Today
        </AppButton>
        <AppButton variant="secondary" size="sm" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={goToNext} aria-label="Next week" />
      </div>
    </div>
  ) : (
    <div className="mb-2 flex shrink-0 items-center justify-between">
      <span className="truncate text-[10px] font-semibold text-gray-600">{weekLabel}</span>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={goToPrev} className="rounded p-1 text-xs text-gray-500 hover:bg-gray-100" aria-label="Previous week">
          ←
        </button>
        <button type="button" onClick={goToToday} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-100">
          Today
        </button>
        <button type="button" onClick={goToNext} className="rounded p-1 text-xs text-gray-500 hover:bg-gray-100" aria-label="Next week">
          →
        </button>
      </div>
    </div>
  );

  const content = (
    <>
      {weekControls}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {totalShifts === 0 ? (
          embedded ? (
            <AppEmptyState title="No shifts this week" className="py-6" />
          ) : (
            <div className={uiCx(uiRadius.control, 'border border-dashed border-gray-200 bg-gray-50/50 px-3 py-4 text-center text-xs text-gray-500')}>
              No shifts this week
            </div>
          )
        ) : (
          dateKeys.map((dateStr) => (
            <div key={dateStr} className="shrink-0">
              <div className={uiTypography.overline}>{formatDayShort(dateStr)}</div>
              <ul className="mt-1 space-y-1.5">
                {(shiftsByDate[dateStr] ?? []).map((shift) => (
                  <li key={shift.id}>
                    <Link
                      to={`/schedule?date=${encodeURIComponent(dateStr)}&shift=${encodeURIComponent(shift.id)}`}
                      className={uiCx(
                        'block px-2.5 py-2 transition-colors hover:bg-gray-50/80',
                        uiRadius.control,
                        uiBorders.subtle,
                        'bg-white',
                      )}
                    >
                      <div className={uiCx(uiTypography.sectionTitle, 'truncate')}>{shift.project_name || 'Shift'}</div>
                      <div className={uiCx(uiTypography.helper, 'mt-0.5')}>
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
    </>
  );

  if (embedded) {
    return <div className="flex min-h-0 w-full flex-col">{content}</div>;
  }

  return (
    <FadeInOnMount enabled={ready} className="flex h-full min-h-0 w-full flex-col">
      {content}
    </FadeInOnMount>
  );
}
