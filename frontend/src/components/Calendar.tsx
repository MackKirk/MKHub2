import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
};

export default function Calendar() {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1); // First day of month
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });

  // Calculate month range for API query
  const monthStart = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  }, [currentMonth]);

  const monthEnd = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  }, [currentMonth]);

  const dateRange = useMemo(() => {
    return `${formatDateLocal(monthStart)},${formatDateLocal(monthEnd)}`;
  }, [monthStart, monthEnd]);

  // Fetch shifts for the month
  const { data: shifts = [] } = useQuery({
    queryKey: ['calendar-shifts', dateRange, currentUser?.id],
    queryFn: async () => {
      const workerId = currentUser?.id;
      if (!workerId) return [];
      try {
        const result = await api<any>('GET', `/dispatch/shifts?date_range=${dateRange}&worker_id=${workerId}`);
        // Ensure we return an array
        if (Array.isArray(result)) {
          return result;
        }
        // If result is an object with a data property, use that
        if (result && Array.isArray(result.data)) {
          return result.data;
        }
        // Default to empty array
        return [];
      } catch (error) {
        // If API call fails, return empty array
        return [];
      }
    },
    enabled: !!currentUser?.id,
  });

  // Create a set of dates that have shifts
  const datesWithShifts = useMemo(() => {
    const dates = new Set<string>();
    shifts.forEach((shift) => {
      if (shift.date) {
        dates.add(shift.date.slice(0, 10)); // YYYY-MM-DD format
      }
    });
    return dates;
  }, [shifts]);

  // Get calendar days
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday, 6 = Saturday

    const days: (Date | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, [currentMonth]);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const today = new Date();
  const isToday = (date: Date | null) => {
    if (!date) return false;
    return date.toDateString() === today.toDateString();
  };

  const hasShift = (date: Date | null) => {
    if (!date) return false;
    const dateStr = formatDateLocal(date);
    return datesWithShifts.has(dateStr);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-bold text-gray-900 tracking-tight">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPreviousMonth}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100 active:scale-[0.98] text-xs font-medium text-gray-600 transition-all duration-150"
          >
            ←
          </button>
          <button
            onClick={goToToday}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100 active:scale-[0.98] text-xs font-medium text-gray-600 transition-all duration-150"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:bg-gray-100 active:scale-[0.98] text-xs font-medium text-gray-600 transition-all duration-150"
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {/* Day headers */}
        {dayNames.map((day) => (
          <div key={day} className="text-center text-[10px] font-bold text-gray-500 py-1.5 tracking-wide uppercase">
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const dayHasShift = hasShift(date);
          const dayIsToday = isToday(date);

          return (
            <div
              key={date.toISOString()}
              className={`
                aspect-square border rounded-lg flex flex-col items-center justify-center text-xs relative
                transition-all duration-150
                ${dayIsToday 
                  ? 'border-2 border-blue-600 bg-gradient-to-br from-blue-50 to-blue-100/50 font-bold text-blue-900 shadow-sm ring-2 ring-blue-200/50' 
                  : 'border-gray-200/80'
                }
                ${dayHasShift && !dayIsToday ? 'bg-blue-50/60 hover:bg-blue-100/80 hover:border-blue-300' : ''}
                ${!dayHasShift && !dayIsToday ? 'hover:bg-gray-50 hover:border-gray-300' : ''}
                ${dayIsToday ? '' : 'hover:shadow-sm active:scale-[0.96]'}
                cursor-pointer
              `}
              title={dayHasShift ? 'Has shifts' : dayIsToday ? 'Today' : ''}
            >
              <span className={dayIsToday ? 'text-blue-900' : 'text-gray-700'}>{date.getDate()}</span>
              {dayHasShift && (
                <div className="absolute bottom-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 shadow-sm"></div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-[10px] text-gray-500 font-medium">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border border-gray-200/80 bg-blue-50/60 relative">
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600"></div>
          </div>
          <span>Shifts</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded border-2 border-blue-600 bg-gradient-to-br from-blue-50 to-blue-100/50"></div>
          <span>Today</span>
        </div>
      </div>

      {/* Friendly message when no shifts in current month */}
      {datesWithShifts.size === 0 && (
        <div className="mt-5 text-center py-5 text-gray-500 border-t border-gray-100/60">
          <div className="text-sm font-medium mb-1">📅 No shifts scheduled this month</div>
          <div className="text-xs text-gray-400">You're all set!</div>
        </div>
      )}
    </div>
  );
}

