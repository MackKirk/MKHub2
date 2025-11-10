import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import EventModal from './EventModal';
import { useConfirm } from '@/components/ConfirmProvider';

type CalendarMockProps = {
  title?: string;
  projectId?: string;
};

type Event = {
  id: string;
  name: string;
  location?: string;
  start_datetime: string;
  end_datetime: string;
  notes?: string;
  is_all_day?: boolean;
  timezone?: string;
  repeat_type?: string;
  repeat_config?: any;
  repeat_until?: string;
  repeat_count?: number;
  exceptions?: string[];
  extra_dates?: string[];
  overrides?: Record<string, any>;
};

// Generate a consistent color for an event based on its ID
function getEventColor(eventId: string): { bg: string; text: string; border: string } {
  // Improved hash function to generate a more distributed number from the ID
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) {
    const char = eventId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Expanded palette of 24 distinct colors that work well together
  const colors = [
    { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
    { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
    { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
    { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
    { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' },
    { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
    { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' },
    { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
    { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
    { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
    { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-300' },
    { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-300' },
    { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300' },
    { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-300' },
    { bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-300' },
    { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' },
    { bg: 'bg-zinc-100', text: 'text-zinc-800', border: 'border-zinc-300' },
    { bg: 'bg-neutral-100', text: 'text-neutral-800', border: 'border-neutral-300' },
    { bg: 'bg-blue-200', text: 'text-blue-900', border: 'border-blue-400' },
    { bg: 'bg-green-200', text: 'text-green-900', border: 'border-green-400' },
    { bg: 'bg-purple-200', text: 'text-purple-900', border: 'border-purple-400' },
  ];
  
  // Use modulo to pick a color from the expanded palette
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export default function CalendarMock({ title, projectId }: CalendarMockProps){
  const [anchorDate, setAnchorDate] = useState<Date>(()=>{
    const d = new Date();
    d.setDate(1);
    d.setHours(0,0,0,0);
    return d;
  });

  const queryClient = useQueryClient();
  const confirm = useConfirm();
  
  // Fetch events from API
  const { data: events = [], refetch: refetchEvents } = useQuery({
    queryKey: ['projectEvents', projectId],
    queryFn: () => projectId ? api<Event[]>('GET', `/projects/${projectId}/events`) : Promise.resolve([]),
    enabled: !!projectId,
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState<Event | null>(null);
  const [showEditModal, setShowEditModal] = useState<Event | null>(null);

  const days = useMemo(()=>{
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const first = new Date(year, month, 1);
    const firstWeekday = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = firstWeekday; // leading blanks
    const totalCells = Math.ceil((prevDays + daysInMonth) / 7) * 7; // 5 or 6 weeks

    const cells: { date: Date | null, key: string }[] = [];
    for(let i=0;i<totalCells;i++){
      const dayIndex = i - prevDays + 1;
      if(dayIndex >= 1 && dayIndex <= daysInMonth){
        const d = new Date(year, month, dayIndex);
        cells.push({ date: d, key: d.toISOString().slice(0,10) });
      } else {
        cells.push({ date: null, key: `blank-${i}` });
      }
    }
    return cells;
  }, [anchorDate]);

  const monthLabel = useMemo(()=>{
    return anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [anchorDate]);

  // Generate occurrences from recurring events
  const generateOccurrences = (event: Event, startDate: Date, endDate: Date): Array<{ date: string; event: Event }> => {
    const occurrences: Array<{ date: string; event: Event }> = [];
    const eventStart = new Date(event.start_datetime);
    const eventEnd = new Date(event.end_datetime);
    const repeatType = event.repeat_type || 'none';
    
    if (repeatType === 'none') {
      // Single event or continuous block
      const current = new Date(Math.max(eventStart.getTime(), startDate.getTime()));
      const end = new Date(Math.min(eventEnd.getTime(), endDate.getTime()));
      current.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      
      while (current <= end) {
        const dateKey = current.toISOString().slice(0, 10);
        // Check exceptions
        if (!event.exceptions?.includes(dateKey)) {
          occurrences.push({ date: dateKey, event });
        }
        current.setDate(current.getDate() + 1);
      }
    } else {
      // Recurring event - generate occurrences
      const repeatConfig = event.repeat_config || {};
      const repeatInterval = repeatConfig.interval || 1;
      const repeatDaysOfWeek = repeatConfig.daysOfWeek;
      const repeatUntil = event.repeat_until ? new Date(event.repeat_until) : null;
      const repeatCount = event.repeat_count;
      
      let current = new Date(eventStart);
      let count = 0;
      const maxCount = repeatCount || 365;
      const viewEnd = repeatUntil ? new Date(Math.min(repeatUntil.getTime(), endDate.getTime())) : endDate;
      
      while (current <= viewEnd && count < maxCount) {
        const dateKey = current.toISOString().slice(0, 10);
        
        // Skip if before view start
        if (current < startDate) {
          current.setDate(current.getDate() + 1);
          continue;
        }
        
        // Check exceptions
        if (event.exceptions?.includes(dateKey)) {
          current.setDate(current.getDate() + 1);
          continue;
        }
        
        let shouldInclude = false;
        const daysDiff = Math.floor((current.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24));
        
        if (repeatType === 'daily') {
          shouldInclude = daysDiff % repeatInterval === 0 && daysDiff >= 0;
        } else if (repeatType === 'weekly' && repeatDaysOfWeek) {
          const dayOfWeek = current.getDay();
          if (repeatDaysOfWeek[dayOfWeek]) {
            // Calculate which week this is (week 0 = week of start date)
            const startDateDayOfWeek = eventStart.getDay();
            const startWeekStart = new Date(eventStart);
            startWeekStart.setDate(startWeekStart.getDate() - startDateDayOfWeek);
            startWeekStart.setHours(0, 0, 0, 0);
            
            const currentDayOfWeek = current.getDay();
            const currentWeekStart = new Date(current);
            currentWeekStart.setDate(currentWeekStart.getDate() - currentDayOfWeek);
            currentWeekStart.setHours(0, 0, 0, 0);
            
            const weeksDiff = Math.floor((currentWeekStart.getTime() - startWeekStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
            shouldInclude = weeksDiff >= 0 && weeksDiff % repeatInterval === 0;
          }
        } else if (repeatType === 'monthly') {
          if (current.getDate() === eventStart.getDate()) {
            const monthsDiff = (current.getFullYear() - eventStart.getFullYear()) * 12 + 
                              (current.getMonth() - eventStart.getMonth());
            shouldInclude = monthsDiff % repeatInterval === 0 && monthsDiff >= 0;
          }
        } else if (repeatType === 'yearly') {
          if (current.getMonth() === eventStart.getMonth() && current.getDate() === eventStart.getDate()) {
            const yearsDiff = current.getFullYear() - eventStart.getFullYear();
            shouldInclude = yearsDiff % repeatInterval === 0 && yearsDiff >= 0;
          }
        }
        
        if (shouldInclude || (daysDiff === 0 && repeatType !== 'none')) {
          occurrences.push({ date: dateKey, event });
          count++;
        }
        
        current.setDate(current.getDate() + 1);
        
        // Safety break
        if (daysDiff > 1000) break;
      }
      
      // Add extra dates
      event.extra_dates?.forEach(dateStr => {
        const extraDate = new Date(dateStr);
        if (extraDate >= startDate && extraDate <= endDate) {
          if (!occurrences.find(o => o.date === dateStr)) {
            occurrences.push({ date: dateStr, event });
          }
        }
      });
    }
    
    return occurrences;
  };

  // Group events by date (YYYY-MM-DD) - expand recurring events
  const eventsByDate = useMemo(()=>{
    const grouped: Record<string, Event[]> = {};
    
    // Calculate view range (current month +/- 1 month for context)
    const viewStart = new Date(anchorDate);
    viewStart.setMonth(viewStart.getMonth() - 1);
    viewStart.setDate(1);
    viewStart.setHours(0, 0, 0, 0);
    
    const viewEnd = new Date(anchorDate);
    viewEnd.setMonth(viewEnd.getMonth() + 2);
    viewEnd.setDate(0); // Last day of next month
    viewEnd.setHours(23, 59, 59);
    
    events.forEach(event => {
      const occurrences = generateOccurrences(event, viewStart, viewEnd);
      occurrences.forEach(({ date, event: eventRef }) => {
        if (!grouped[date]) {
          grouped[date] = [];
        }
        // Only add once per date
        if (!grouped[date].find(e => e.id === eventRef.id)) {
          grouped[date].push(eventRef);
        }
      });
    });
    
    return grouped;
  }, [events, anchorDate]);

  const weekDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Get events for a specific date with unique colors
  const getEventsForDate = (date: Date | null): Event[] => {
    if (!date) return [];
    const dateKey = date.toISOString().slice(0, 10);
    return eventsByDate[dateKey] || [];
  };

  // Assign unique colors to events on the same day
  const assignUniqueColors = (events: Event[]): Map<string, { bg: string; text: string; border: string }> => {
    const colorMap = new Map<string, { bg: string; text: string; border: string }>();
    const usedColors = new Set<string>();
    
    // All available colors
    const allColors = [
      { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
      { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
      { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
      { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
      { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
      { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
      { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
      { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' },
      { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
      { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' },
      { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
      { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
      { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
      { bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-300' },
      { bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-300' },
      { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300' },
      { bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-300' },
      { bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-300' },
      { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' },
      { bg: 'bg-zinc-100', text: 'text-zinc-800', border: 'border-zinc-300' },
      { bg: 'bg-neutral-100', text: 'text-neutral-800', border: 'border-neutral-300' },
      { bg: 'bg-blue-200', text: 'text-blue-900', border: 'border-blue-400' },
      { bg: 'bg-green-200', text: 'text-green-900', border: 'border-green-400' },
      { bg: 'bg-purple-200', text: 'text-purple-900', border: 'border-purple-400' },
    ];
    
    // First pass: assign preferred colors based on event ID
    for (const event of events) {
      const preferredColor = getEventColor(event.id);
      
      if (!usedColors.has(preferredColor.bg)) {
        colorMap.set(event.id, preferredColor);
        usedColors.add(preferredColor.bg);
      }
    }
    
    // Second pass: assign remaining colors to events without colors
    let colorIndex = 0;
    for (const event of events) {
      if (!colorMap.has(event.id)) {
        // Find next available color
        while (colorIndex < allColors.length && usedColors.has(allColors[colorIndex].bg)) {
          colorIndex++;
        }
        
        if (colorIndex < allColors.length) {
          colorMap.set(event.id, allColors[colorIndex]);
          usedColors.add(allColors[colorIndex].bg);
          colorIndex++;
        } else {
          // Fallback: cycle through colors if we run out
          const fallbackIndex = events.indexOf(event) % allColors.length;
          colorMap.set(event.id, allColors[fallbackIndex]);
        }
      }
    }
    
    return colorMap;
  };

  return (
    <div>
      <style>{`
        .calendar-day-scroll {
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .calendar-day-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .calendar-day-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .calendar-day-scroll::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 2px;
        }
        .calendar-day-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-lg">{title || 'Calendar'}</div>
        <div className="flex items-center gap-2">
          <button onClick={()=> setAnchorDate(d=> new Date(d.getFullYear(), d.getMonth()-1, 1))} className="px-2 py-1 rounded bg-gray-100">Prev</button>
          <div className="px-2 text-sm text-gray-700 min-w-[140px] text-center">{monthLabel}</div>
          <button onClick={()=> setAnchorDate(d=> new Date(d.getFullYear(), d.getMonth()+1, 1))} className="px-2 py-1 rounded bg-gray-100">Next</button>
          <button onClick={()=> setAnchorDate(()=>{ const n=new Date(); n.setDate(1); n.setHours(0,0,0,0); return n; })} className="px-2 py-1 rounded bg-gray-100">Today</button>
          {projectId && (
            <button onClick={()=> setShowAddModal(true)} className="px-3 py-1 rounded bg-brand-red text-white text-sm">+ Create Event</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDays.map(d=> (
          <div key={d} className="text-[11px] uppercase tracking-wide text-gray-600 text-center">{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-2">
        {days.map(({ date, key })=> {
          if(!date) return <div key={key} className="h-24 rounded border bg-gray-50" />;
          const ds = date.toISOString().slice(0,10);
          const dayEvents = getEventsForDate(date);
          const isToday = (()=>{
            const t = new Date();
            return t.toISOString().slice(0,10) === ds;
          })();
          return (
            <div key={key} className={`h-24 rounded border bg-white p-2 flex flex-col ${isToday? 'ring-2 ring-brand-red': ''}`}>
              <div className="text-xs font-semibold text-gray-700 flex-shrink-0">{date.getDate()}</div>
              <div className="mt-1 flex-1 overflow-y-auto min-h-0 calendar-day-scroll">
                {dayEvents.length? (() => {
                  const colorMap = assignUniqueColors(dayEvents);
                  return (
                    <ul className="space-y-1">
                      {dayEvents.map((event)=> {
                        const color = colorMap.get(event.id) || getEventColor(event.id);
                        return (
                          <li 
                            key={event.id} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowViewModal(event);
                            }}
                            className={`text-[11px] font-medium leading-tight truncate cursor-pointer hover:opacity-90 transition-opacity px-1.5 py-0.5 rounded border ${color.bg} ${color.text} ${color.border} shadow-sm flex-shrink-0`}
                            title={`${event.name} - Click to view details`}
                          >
                            {event.name}
                          </li>
                        );
                      })}
                    </ul>
                  );
                })() : (
                  <div className="text-[10px] text-gray-400">No events</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Event Modal */}
      {showAddModal && projectId && (
        <EventModal
          projectId={projectId}
          mode="create"
          onClose={()=> setShowAddModal(false)}
          onSave={async (eventData) => {
            try {
              await api('POST', `/projects/${projectId}/events`, eventData);
              toast.success('Event created');
              setShowAddModal(false);
              refetchEvents();
              queryClient.invalidateQueries({ queryKey: ['projectEvents', projectId] });
            } catch (e: any) {
              toast.error(e?.message || 'Failed to create event');
            }
          }}
        />
      )}

      {/* View Event Modal */}
      {showViewModal && (
        <EventViewModal
          event={showViewModal}
          projectId={projectId || ''}
          onClose={()=> setShowViewModal(null)}
          onEdit={()=> {
            setShowEditModal(showViewModal);
            setShowViewModal(null);
          }}
          onDelete={async () => {
            if (!projectId || !showViewModal) return;
            const ok = await confirm({
              title: 'Delete event',
              message: `Are you sure you want to delete "${showViewModal.name}"? This action cannot be undone.`,
              confirmText: 'Delete',
              cancelText: 'Cancel'
            });
            if (!ok) return;
            try {
              await api('DELETE', `/projects/${projectId}/events/${showViewModal.id}`);
              toast.success('Event deleted');
              setShowViewModal(null);
              refetchEvents();
              queryClient.invalidateQueries({ queryKey: ['projectEvents', projectId] });
            } catch (e: any) {
              toast.error(e?.message || 'Failed to delete event');
            }
          }}
        />
      )}

      {/* Edit Event Modal */}
      {showEditModal && projectId && (
        <EventModal
          projectId={projectId}
          mode="edit"
          event={showEditModal}
          onClose={()=> setShowEditModal(null)}
          onSave={async (eventData) => {
            try {
              await api('PATCH', `/projects/${projectId}/events/${showEditModal.id}`, eventData);
              toast.success('Event updated');
              setShowEditModal(null);
              refetchEvents();
              queryClient.invalidateQueries({ queryKey: ['projectEvents', projectId] });
            } catch (e: any) {
              toast.error(e?.message || 'Failed to update event');
            }
          }}
        />
      )}
    </div>
  );
}

// Event View Modal
function EventViewModal({ 
  event, 
  projectId,
  onClose, 
  onEdit, 
  onDelete 
}: { 
  event: Event; 
  projectId: string;
  onClose: () => void; 
  onEdit: () => void; 
  onDelete: () => Promise<void>;
}) {
  const startDate = new Date(event.start_datetime);
  const endDate = new Date(event.end_datetime);
  const isAllDay = event.is_all_day || false;
  const repeatType = event.repeat_type || 'none';
  const repeatConfig = event.repeat_config || {};
  const timezone = event.timezone || 'America/Vancouver';

  const formatDateTime = (date: Date, showTime: boolean = true) => {
    if (isAllDay && !showTime) {
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: showTime ? '2-digit' : undefined,
      minute: showTime ? '2-digit' : undefined,
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRepeatDescription = () => {
    if (repeatType === 'none') {
      const start = new Date(event.start_datetime);
      const end = new Date(event.end_datetime);
      if (start.toDateString() === end.toDateString()) {
        return 'Single event';
      }
      return `Continuous event (${Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))} days)`;
    }

    const parts: string[] = [];
    if (repeatType === 'daily') {
      const interval = repeatConfig.interval || 1;
      parts.push(`Every ${interval === 1 ? 'day' : `${interval} days`}`);
    } else if (repeatType === 'weekly') {
      const interval = repeatConfig.interval || 1;
      const daysOfWeek = repeatConfig.daysOfWeek || [];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const selectedDays = daysOfWeek
        .map((selected: boolean, idx: number) => selected ? dayNames[idx] : null)
        .filter(Boolean)
        .join(', ');
      parts.push(`Every ${interval === 1 ? 'week' : `${interval} weeks`} on ${selectedDays}`);
    } else if (repeatType === 'monthly') {
      const interval = repeatConfig.interval || 1;
      parts.push(`Every ${interval === 1 ? 'month' : `${interval} months`} on day ${startDate.getDate()}`);
    } else if (repeatType === 'yearly') {
      const interval = repeatConfig.interval || 1;
      parts.push(`Every ${interval === 1 ? 'year' : `${interval} years`}`);
    }

    if (event.repeat_until) {
      parts.push(`until ${new Date(event.repeat_until).toLocaleDateString()}`);
    } else if (event.repeat_count) {
      parts.push(`for ${event.repeat_count} occurrence${event.repeat_count > 1 ? 's' : ''}`);
    } else {
      parts.push('(never ends)');
    }

    return parts.join(', ');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{event.name}</h2>
          <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
            <div className="text-gray-900 font-medium">{event.name}</div>
          </div>

          {event.location && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <div className="text-gray-900">{event.location}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start {isAllDay ? 'Date' : 'Date & Time'}</label>
              <div className="text-gray-900">
                {formatDateTime(startDate, !isAllDay)}
                {!isAllDay && <span className="text-xs text-gray-500 ml-2">({timezone})</span>}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End {isAllDay ? 'Date' : 'Date & Time'}</label>
              <div className="text-gray-900">
                {formatDateTime(endDate, !isAllDay)}
                {!isAllDay && <span className="text-xs text-gray-500 ml-2">({timezone})</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            {isAllDay && (
              <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium">All-day</span>
            )}
            {!isAllDay && startDate.toDateString() === endDate.toDateString() && (
              <span className="text-gray-600">
                {formatTime(startDate)} - {formatTime(endDate)}
              </span>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recurrence</label>
            <div className="text-gray-900">{getRepeatDescription()}</div>
          </div>

          {event.exceptions && event.exceptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Exception Dates</label>
              <div className="flex flex-wrap gap-2">
                {event.exceptions.map((date: string) => (
                  <span key={date} className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">
                    {new Date(date).toLocaleDateString()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {event.extra_dates && event.extra_dates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Extra Dates</label>
              <div className="flex flex-wrap gap-2">
                {event.extra_dates.map((date: string) => (
                  <span key={date} className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs">
                    {new Date(date).toLocaleDateString()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {event.notes && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <div className="text-gray-900 whitespace-pre-wrap bg-gray-50 p-3 rounded">{event.notes}</div>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-white border-t p-4 flex justify-between">
          <button
            onClick={onDelete}
            className="px-4 py-2 rounded border bg-red-100 text-red-700 hover:bg-red-200"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
            >
              Close
            </button>
            <button
              onClick={onEdit}
              className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
