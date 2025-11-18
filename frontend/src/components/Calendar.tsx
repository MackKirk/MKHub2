import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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
    return `${monthStart.toISOString().slice(0, 10)},${monthEnd.toISOString().slice(0, 10)}`;
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
    const dateStr = date.toISOString().slice(0, 10);
    return datesWithShifts.has(dateStr);
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Calendar</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousMonth}
            className="px-3 py-1 rounded border hover:bg-gray-50 text-sm"
          >
            ←
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 rounded border hover:bg-gray-50 text-sm"
          >
            Today
          </button>
          <button
            onClick={goToNextMonth}
            className="px-3 py-1 rounded border hover:bg-gray-50 text-sm"
          >
            →
          </button>
        </div>
      </div>

      <div className="mb-2 text-center font-semibold text-gray-800">
        {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {/* Day headers */}
        {dayNames.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-gray-600 py-2">
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
                aspect-square border rounded flex items-center justify-center text-sm
                ${dayIsToday ? 'border-2 border-blue-500 font-semibold' : 'border-gray-200'}
                ${dayHasShift ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-gray-50'}
                ${dayIsToday && dayHasShift ? 'bg-blue-200' : ''}
                cursor-pointer transition-colors
              `}
              title={dayHasShift ? 'Has shifts' : ''}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border border-gray-200 bg-blue-100"></div>
          <span>Days with shifts</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border-2 border-blue-500"></div>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}

