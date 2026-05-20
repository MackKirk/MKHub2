import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { AppButton, AppCalendarBase, type AppCalendarDay, uiCx, uiLayout, uiTypography } from '@/components/ui';

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
    [currentMonth],
  );
  const monthEnd = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0),
    [currentMonth],
  );
  const dateRange = useMemo(
    () => `${formatDateLocal(monthStart)},${formatDateLocal(monthEnd)}`,
    [monthStart, monthEnd],
  );

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['calendar-shifts', dateRange, currentUser?.id],
    queryFn: async () => {
      const workerId = currentUser?.id;
      if (!workerId) return [];
      try {
        const result = await api<Shift[] | { data: Shift[] }>(
          'GET',
          `/dispatch/shifts?date_range=${dateRange}&worker_id=${workerId}`,
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

  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  const appDays: AppCalendarDay[] = useMemo(
    () =>
      calendarDays.map((date) => {
        if (!date) {
          return { dateLabel: '', isMuted: true };
        }
        const dateStr = formatDateLocal(date);
        const shiftCount = datesWithShifts[dateStr] ?? 0;
        const dayIsToday = Boolean(isToday(date));
        return {
          dateLabel: String(date.getDate()),
          isToday: dayIsToday,
          hasMarker: shiftCount > 0,
          onClick: () => handleDayClick(date),
          title: shiftCount > 0 ? `${shiftCount} shift(s)` : dayIsToday ? 'Today' : undefined,
        };
      }),
    [calendarDays, datesWithShifts, todayStr],
  );

  if (shiftsLoading && currentUser?.id) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="min-h-0 flex-1">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }

  return (
    <FadeInOnMount enabled={ready} className="flex h-full min-h-0 w-full flex-col">
      <AppCalendarBase
        bare
        compact
        monthLabel={monthLabel}
        weekDayLabels={DAY_NAMES}
        days={appDays}
        onPrevious={goToPrev}
        onNext={goToNext}
        headerExtra={
          <AppButton type="button" variant="ghost" size="sm" onClick={goToToday} className="h-6 min-h-0 px-1.5 text-[10px]">
            Today
          </AppButton>
        }
        className="flex min-h-0 flex-1 flex-col"
      />
      <div className={uiCx(uiLayout.actionsRow, 'mt-2 shrink-0 justify-between', uiTypography.helper)}>
        <span className="text-[9px]">Click day → Schedule</span>
        <Link to="/schedule" className="text-[9px] font-medium text-brand-red hover:underline">
          Open Schedule
        </Link>
      </div>
    </FadeInOnMount>
  );
}
