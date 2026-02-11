import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';

type Shift = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
};

type CalendarWidgetProps = {
  config?: Record<string, unknown>;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarWidget({ config: _config }: CalendarWidgetProps) {
  const { ready } = useAnimationReady();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
  });

  const monthStart = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
    [currentMonth]
  );
  const monthEnd = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0),
    [currentMonth]
  );
  const dateRange = useMemo(
    () => `${formatDateLocal(monthStart)},${formatDateLocal(monthEnd)}`,
    [monthStart, monthEnd]
  );

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['calendar-shifts', dateRange, currentUser?.id],
    queryFn: async () => {
      const workerId = currentUser?.id;
      if (!workerId) return [];
      try {
        const result = await api<Shift[] | { data: Shift[] }>(
          'GET',
          `/dispatch/shifts?date_range=${dateRange}&worker_id=${workerId}`
        );
        if (Array.isArray(result)) return result;
        if (result && Array.isArray((result as { data: Shift[] }).data)) return (result as { data: Shift[] }).data;
        return [];
      } catch {
        return [];
      }
    },
    enabled: !!currentUser?.id,
  });

  const datesWithShifts = useMemo(() => {
    const countByDate: Record<string, number> = {};
    shifts.forEach((s) => {
      if (s.date) {
        const key = s.date.slice(0, 10);
        countByDate[key] = (countByDate[key] ?? 0) + 1;
      }
    });
    return countByDate;
  }, [shifts]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) days.push(new Date(year, month, day));
    return days;
  }, [currentMonth]);

  const today = new Date();
  const todayStr = formatDateLocal(today);
  const isToday = (date: Date | null) => date && formatDateLocal(date) === todayStr;
  const goToPrev = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNext = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));

  const handleDayClick = (date: Date) => {
    navigate(`/schedule?date=${formatDateLocal(date)}`);
  };

  if (shiftsLoading && currentUser?.id) {
    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="flex-1 min-h-0">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }

  return (
    <FadeInOnMount enabled={ready} className="flex flex-col min-h-0 h-full w-full">
      <div className="flex items-center justify-between shrink-0 mb-2">
        <span className="text-xs font-semibold text-gray-800">
          {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goToPrev}
            className="p-1 rounded hover:bg-gray-100 text-gray-600 text-[10px] font-medium"
            aria-label="Previous month"
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
            className="p-1 rounded hover:bg-gray-100 text-gray-600 text-[10px] font-medium"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 shrink-0">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-gray-400 py-0.5">
            {d}
          </div>
        ))}
        {calendarDays.map((date, idx) => {
          if (!date) return <div key={`e-${idx}`} className="aspect-square min-w-0" />;
          const dateStr = formatDateLocal(date);
          const shiftCount = datesWithShifts[dateStr] ?? 0;
          const dayIsToday = isToday(date);
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => handleDayClick(date)}
              className={`
                relative aspect-square min-w-0 rounded flex flex-col items-center justify-center text-[10px] font-medium
                transition-all duration-150 hover:shadow-sm active:scale-95
                ${dayIsToday ? 'bg-brand-red/15 text-brand-red border border-brand-red/40 ring-1 ring-brand-red/20' : 'border border-transparent hover:border-gray-300 hover:bg-gray-50 text-gray-700'}
                ${shiftCount > 0 && !dayIsToday ? 'bg-blue-50/80 hover:bg-blue-100/80' : ''}
              `}
              title={shiftCount > 0 ? `${shiftCount} shift(s)` : dayIsToday ? 'Today' : ''}
            >
              {date.getDate()}
              {shiftCount > 0 && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 shrink-0 flex items-center justify-between text-[9px] text-gray-500">
        <span>Click day → Schedule</span>
        <Link to="/schedule" className="text-brand-red hover:underline font-medium">
          Open Schedule
        </Link>
      </div>
    </FadeInOnMount>
  );
}
