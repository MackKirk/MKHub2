import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';

type WorkOrderCalendarEvent = {
  type: 'work_order';
  id: string;
  work_order_number: string;
  entity_id: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  estimated_duration_minutes: number | null;
  status: string;
  asset_name: string | null;
};

type ScheduleCalendarEvent = {
  type: 'inspection_schedule';
  id: string;
  scheduled_at: string;
  fleet_asset_name: string | null;
  status: string;
  body_inspection_id?: string | null;
  mechanical_inspection_id?: string | null;
};

type CalendarEvent = WorkOrderCalendarEvent | ScheduleCalendarEvent;

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true });
}

type FleetServiceCalendarProps = { embedView?: boolean };

export default function FleetServiceCalendar({ embedView }: FleetServiceCalendarProps) {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const monthStart = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  }, [currentMonth]);
  const monthEnd = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  }, [currentMonth]);
  const startStr = formatDateLocal(monthStart);
  const endStr = formatDateLocal(monthEnd);

  const { data: woEvents = [] } = useQuery({
    queryKey: ['fleet-work-orders-calendar', startStr, endStr],
    queryFn: () => api<any[]>('GET', `/fleet/work-orders/calendar?start=${startStr}&end=${endStr}`),
  });

  const { data: scheduleEvents = [] } = useQuery({
    queryKey: ['fleet-inspection-schedules-calendar', startStr, endStr],
    queryFn: () => api<any[]>('GET', `/fleet/inspection-schedules/calendar?start=${startStr}&end=${endStr}`),
  });

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    const dayKey = (iso: string) => formatDateLocal(new Date(iso));
    woEvents.forEach((ev) => {
      const wo: WorkOrderCalendarEvent = { type: 'work_order', ...ev };
      if (!wo.scheduled_start_at) return;
      const day = dayKey(wo.scheduled_start_at);
      if (!map[day]) map[day] = [];
      map[day].push(wo);
    });
    scheduleEvents.forEach((ev) => {
      const s: ScheduleCalendarEvent = { type: 'inspection_schedule', ...ev };
      const day = dayKey(s.scheduled_at);
      if (!map[day]) map[day] = [];
      map[day].push(s);
    });
    Object.keys(map).forEach((day) =>
      map[day].sort((a, b) => {
        const timeA = a.type === 'work_order' ? a.scheduled_start_at : a.scheduled_at;
        const timeB = b.type === 'work_order' ? b.scheduled_start_at : b.scheduled_at;
        return (timeA || '').localeCompare(timeB || '');
      })
    );
    return map;
  }, [woEvents, scheduleEvents]);

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

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const goToPreviousMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const today = new Date();
  const isToday = (date: Date | null) => date && date.toDateString() === today.toDateString();
  const getDayEvents = (date: Date | null) => (date ? eventsByDay[formatDateLocal(date)] || [] : []);

  return (
    <div className={embedView ? '' : 'p-4 max-w-6xl mx-auto'}>
      {!embedView && (
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h1 className="text-xl font-bold text-gray-900">Schedule</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/fleet/inspections/new"
              className="px-4 py-2 rounded-lg border border-blue-600 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors"
            >
              Schedule inspection
            </Link>
            <Link
              to="/fleet/work-orders/new?entity_type=fleet"
              className="px-4 py-2 rounded-lg bg-brand-red text-white text-sm font-medium hover:bg-red-700 transition-colors"
            >
              New service
            </Link>
            <Link
              to="/fleet/calendar?view=list"
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              List
            </Link>
            <Link
              to="/fleet/work-orders"
              className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Work orders
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-bold text-gray-900 tracking-tight">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={goToPreviousMonth}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-600"
            >
              ←
            </button>
            <button onClick={goToToday} className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-600">
              Today
            </button>
            <button onClick={goToNextMonth} className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-600">
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dayNames.map((day) => (
            <div key={day} className="text-center text-[10px] font-bold text-gray-500 py-1.5 uppercase">
              {day}
            </div>
          ))}
          {calendarDays.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="min-h-[100px]" />;
            }
            const dayEvents = getDayEvents(date);
            const dayIsToday = isToday(date);
            return (
              <div
                key={date.toISOString()}
                className={`min-h-[100px] border rounded-lg p-1.5 flex flex-col ${
                  dayIsToday ? 'border-2 border-brand-red bg-red-50/30' : 'border-gray-200'
                }`}
              >
                <span className={`text-xs font-medium ${dayIsToday ? 'text-brand-red' : 'text-gray-700'}`}>
                  {date.getDate()}
                </span>
                <div className="mt-1 space-y-1 flex-1 overflow-auto">
                  {dayEvents.slice(0, 5).map((ev) =>
                    ev.type === 'work_order' ? (
                      <button
                        key={`wo-${ev.id}`}
                        type="button"
                        onClick={() => navigate(`/fleet/work-orders/${ev.id}`)}
                        className="w-full text-left text-[10px] px-1.5 py-1 rounded bg-gray-100 hover:bg-gray-200 truncate block"
                        title={`${ev.work_order_number} ${ev.asset_name || ''} ${formatTime(ev.scheduled_start_at)}`}
                      >
                        <span className="font-medium text-gray-800">{ev.work_order_number}</span>
                        {ev.asset_name && <span className="text-gray-600"> · {ev.asset_name}</span>}
                        {ev.scheduled_start_at && (
                          <span className="text-gray-500 block">{formatTime(ev.scheduled_start_at)}</span>
                        )}
                      </button>
                    ) : (
                      <button
                        key={`sched-${ev.id}`}
                        type="button"
                        onClick={() => {
                          const inspectionId = ev.body_inspection_id || ev.mechanical_inspection_id;
                          if (inspectionId) navigate(`/fleet/inspections/${inspectionId}`);
                          else navigate('/fleet/calendar?view=list');
                        }}
                        className="w-full text-left text-xs px-2 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200/60 truncate block shadow-sm"
                        title={`Inspection ${ev.fleet_asset_name || ''} ${formatTime(ev.scheduled_at)}`}
                      >
                        <span className="font-medium text-blue-800 block">Inspection</span>
                        {ev.fleet_asset_name && <span className="text-blue-700 text-[10px] block truncate">{ev.fleet_asset_name}</span>}
                        <span className="text-blue-600 text-[10px]">{formatTime(ev.scheduled_at)}</span>
                      </button>
                    )
                  )}
                  {dayEvents.length > 5 && (
                    <span className="text-[10px] text-gray-500">+{dayEvents.length - 5} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {woEvents.length === 0 && scheduleEvents.length === 0 && (
          <div className="mt-5 text-center py-5 text-gray-500 border-t border-gray-100">
            <div className="text-sm font-medium mb-1">No appointments this month</div>
            <div className="text-xs text-gray-400">Use New service or Schedule inspection to add.</div>
          </div>
        )}
      </div>
    </div>
  );
}
