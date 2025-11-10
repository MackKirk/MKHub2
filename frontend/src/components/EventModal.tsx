import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';

type Event = {
  id?: string;
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

type EventModalProps = {
  projectId: string;
  mode: 'create' | 'edit';
  event?: Event;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
};

type Occurrence = {
  date: string;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
};

export default function EventModal({ projectId, mode, event, onClose, onSave }: EventModalProps) {
  // Basic event fields
  const [name, setName] = useState(event?.name || '');
  const [location, setLocation] = useState(event?.location || '');
  const [notes, setNotes] = useState(event?.notes || '');

  // When section
  const [startDate, setStartDate] = useState(() => {
    if (event?.start_datetime) {
      return new Date(event.start_datetime).toISOString().slice(0, 10);
    }
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    if (event?.end_datetime) {
      const end = new Date(event.end_datetime);
      return end.toISOString().slice(0, 10);
    }
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });
  // Default to all-day for new events, use event value for edits
  const [isAllDay, setIsAllDay] = useState(event?.is_all_day !== undefined ? event.is_all_day : true);
  const [is247, setIs247] = useState(() => {
    // Check if event spans multiple days with 24/7 hours
    if (event?.start_datetime && event?.end_datetime) {
      const start = new Date(event.start_datetime);
      const end = new Date(event.end_datetime);
      const startTime = start.toTimeString().slice(0, 5);
      const endTime = end.toTimeString().slice(0, 5);
      if (startTime === '00:00' && endTime === '23:59' && !event.is_all_day) {
        return true;
      }
    }
    return false;
  });
  const [startTime, setStartTime] = useState(() => {
    if (event?.start_datetime && !event?.is_all_day) {
      return new Date(event.start_datetime).toTimeString().slice(0, 5);
    }
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  });
  const [endTime, setEndTime] = useState(() => {
    if (event?.end_datetime && !event?.is_all_day) {
      return new Date(event.end_datetime).toTimeString().slice(0, 5);
    }
    // Default to 1 hour after start
    const start = new Date();
    start.setHours(start.getHours() + 1);
    return start.toTimeString().slice(0, 5);
  });
  const [timezone, setTimezone] = useState(event?.timezone || 'America/Vancouver');

  // Repeat section
  const [repeatType, setRepeatType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>(
    (event?.repeat_type as any) || 'none'
  );
  const [repeatInterval, setRepeatInterval] = useState(() => {
    if (event?.repeat_config?.interval) {
      return event.repeat_config.interval;
    }
    return 1;
  });
  const [repeatDaysOfWeek, setRepeatDaysOfWeek] = useState<boolean[]>(() => {
    if (event?.repeat_config?.daysOfWeek) {
      return event.repeat_config.daysOfWeek;
    }
    return [false, true, true, true, true, true, false]; // Sun-Sat, default Mon-Fri
  });
  const [repeatEnds, setRepeatEnds] = useState<'never' | 'on' | 'after'>(() => {
    if (event?.repeat_until) return 'on';
    if (event?.repeat_count) return 'after';
    return 'never';
  });
  const [repeatUntilDate, setRepeatUntilDate] = useState(() => {
    if (event?.repeat_until) {
      return new Date(event.repeat_until).toISOString().slice(0, 10);
    }
    return '';
  });
  const [repeatCount, setRepeatCount] = useState(() => {
    if (event?.repeat_count) {
      return event.repeat_count;
    }
    return 10;
  });

  // Exceptions
  const [exceptions, setExceptions] = useState<string[]>(event?.exceptions || []);
  const [extraDates, setExtraDates] = useState<string[]>(event?.extra_dates || []);

  const [saving, setSaving] = useState(false);

  // Auto-set end date to start date when start date changes (if it's a single day)
  useEffect(() => {
    if (startDate && (!endDate || endDate < startDate)) {
      setEndDate(startDate);
    }
  }, [startDate]);

  // Auto-set times when all-day is toggled
  useEffect(() => {
    if (isAllDay) {
      setStartTime('00:00');
      setEndTime('23:59');
      setIs247(false);
    }
  }, [isAllDay]);

  // Handle 24/7 toggle
  useEffect(() => {
    if (is247 && !isAllDay) {
      setStartTime('00:00');
      setEndTime('23:59');
    }
  }, [is247, isAllDay]);

  // Smart default: if user selects 7-day range and enables 24/7, suggest "Does not repeat"
  useEffect(() => {
    if (startDate && endDate && is247 && !isAllDay) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 6 && repeatType === 'none') {
        // This is a full week, user might want continuous 24/7
        // Keep repeatType as 'none' (continuous block)
      }
    }
  }, [startDate, endDate, is247, isAllDay, repeatType]);

  // Generate occurrences for preview
  const generateOccurrences = (): Occurrence[] => {
    if (repeatType === 'none') {
      // Single event or continuous block
      const occs: Occurrence[] = [];
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T23:59:59');
      const current = new Date(start);
      current.setHours(0, 0, 0, 0);
      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);
      
      while (current <= endDay) {
        const dateStr = current.toISOString().slice(0, 10);
        const isStartDay = current.toDateString() === start.toDateString();
        const isEndDay = current.toDateString() === endDay.toDateString();
        
        occs.push({
          date: dateStr,
          startTime: isAllDay || is247 ? null : (isStartDay ? startTime : '00:00'),
          endTime: isAllDay || is247 ? null : (isEndDay ? endTime : '23:59'),
          isAllDay: isAllDay || is247,
        });
        current.setDate(current.getDate() + 1);
      }
      return occs;
    }

    const occs: Occurrence[] = [];
    const baseStartDate = new Date(startDate + 'T00:00:00');
    baseStartDate.setHours(0, 0, 0, 0);
    
    // Calculate end date for repetition
    let repeatEndDate: Date | null = null;
    if (repeatEnds === 'on' && repeatUntilDate) {
      repeatEndDate = new Date(repeatUntilDate + 'T23:59:59');
      repeatEndDate.setHours(23, 59, 59);
    } else if (repeatEnds === 'after') {
      // Will limit by count
      repeatEndDate = new Date(baseStartDate);
      repeatEndDate.setDate(repeatEndDate.getDate() + 365); // Safety limit
    } else {
      // Never ends - show next 90 days for preview
      repeatEndDate = new Date(baseStartDate);
      repeatEndDate.setDate(repeatEndDate.getDate() + 90);
    }

    let current = new Date(baseStartDate);
    let occurrenceCount = 0;
    const maxOccurrences = repeatEnds === 'after' ? repeatCount : 365;

    while (occurrenceCount < maxOccurrences && current <= repeatEndDate!) {
      const dateStr = current.toISOString().slice(0, 10);
      const daysDiff = Math.floor((current.getTime() - baseStartDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Skip exceptions
      if (exceptions.includes(dateStr)) {
        current.setDate(current.getDate() + 1);
        continue;
      }

      let shouldInclude = false;

      if (repeatType === 'daily') {
        // Every N days starting from start date
        shouldInclude = daysDiff % repeatInterval === 0 && daysDiff >= 0;
      } else if (repeatType === 'weekly') {
        const dayOfWeek = current.getDay();
        if (repeatDaysOfWeek[dayOfWeek]) {
          // For weekly recurrence, we need to check if this day falls in a week that matches the interval
          // Week 0 is the week containing the start date
          // Use the start date's week as the reference
          const startDateDayOfWeek = baseStartDate.getDay();
          const startWeekStart = new Date(baseStartDate);
          startWeekStart.setDate(startWeekStart.getDate() - startDateDayOfWeek);
          startWeekStart.setHours(0, 0, 0, 0);
          
          const currentDayOfWeek = current.getDay();
          const currentWeekStart = new Date(current);
          currentWeekStart.setDate(currentWeekStart.getDate() - currentDayOfWeek);
          currentWeekStart.setHours(0, 0, 0, 0);
          
          const weeksDiff = Math.floor((currentWeekStart.getTime() - startWeekStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
          // Include if we're in week 0 (same week as start) or if weeksDiff is a multiple of repeatInterval
          shouldInclude = weeksDiff >= 0 && weeksDiff % repeatInterval === 0;
        }
      } else if (repeatType === 'monthly') {
        // Same day of month
        if (current.getDate() === baseStartDate.getDate()) {
          const monthsDiff = (current.getFullYear() - baseStartDate.getFullYear()) * 12 + 
                            (current.getMonth() - baseStartDate.getMonth());
          shouldInclude = monthsDiff % repeatInterval === 0 && monthsDiff >= 0;
        }
      } else if (repeatType === 'yearly') {
        // Same month and day
        if (current.getMonth() === baseStartDate.getMonth() && current.getDate() === baseStartDate.getDate()) {
          const yearsDiff = current.getFullYear() - baseStartDate.getFullYear();
          shouldInclude = yearsDiff % repeatInterval === 0 && yearsDiff >= 0;
        }
      }

      if (shouldInclude) {
        occs.push({
          date: dateStr,
          startTime: isAllDay || is247 ? null : startTime,
          endTime: isAllDay || is247 ? null : endTime,
          isAllDay: isAllDay || is247,
        });
        occurrenceCount++;
      }

      current.setDate(current.getDate() + 1);
      
      // Safety break
      if (daysDiff > 1000) break;
    }

    // Add extra dates
    extraDates.forEach(dateStr => {
      if (!occs.find(o => o.date === dateStr)) {
        occs.push({
          date: dateStr,
          startTime: isAllDay || is247 ? null : startTime,
          endTime: isAllDay || is247 ? null : endTime,
          isAllDay: isAllDay || is247,
        });
      }
    });

    return occs.sort((a, b) => a.date.localeCompare(b.date));
  };

  const occurrences = useMemo(() => generateOccurrences(), [
    startDate, endDate, startTime, endTime, isAllDay, is247,
    repeatType, repeatInterval, repeatDaysOfWeek, repeatEnds, repeatUntilDate, repeatCount,
    exceptions, extraDates
  ]);

  // Natural language summary
  const summaryText = useMemo(() => {
    if (repeatType === 'none') {
      if (startDate === endDate) {
        return `Single event on ${new Date(startDate).toLocaleDateString()}`;
      } else {
        return `Continuous event from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()} (${occurrences.length} days)`;
      }
    }

    const parts: string[] = [];
    if (repeatType === 'daily') {
      parts.push(`Every ${repeatInterval === 1 ? '' : repeatInterval + ' '}day${repeatInterval > 1 ? 's' : ''}`);
    } else if (repeatType === 'weekly') {
      const selectedDays = repeatDaysOfWeek.map((selected, idx) => selected ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][idx] : null).filter(Boolean);
      parts.push(`Every ${repeatInterval === 1 ? '' : repeatInterval + ' '}week${repeatInterval > 1 ? 's' : ''} on ${selectedDays.join(', ')}`);
    } else if (repeatType === 'monthly') {
      parts.push(`Every ${repeatInterval === 1 ? '' : repeatInterval + ' '}month${repeatInterval > 1 ? 's' : ''} on day ${new Date(startDate).getDate()}`);
    } else if (repeatType === 'yearly') {
      parts.push(`Every ${repeatInterval === 1 ? '' : repeatInterval + ' '}year${repeatInterval > 1 ? 's' : ''}`);
    }

    if (!isAllDay && !is247) {
      parts.push(`from ${startTime} to ${endTime}`);
    } else if (is247) {
      parts.push('24/7');
    } else {
      parts.push('all-day');
    }

    if (repeatEnds === 'on' && repeatUntilDate) {
      parts.push(`until ${new Date(repeatUntilDate).toLocaleDateString()}`);
    } else if (repeatEnds === 'after') {
      parts.push(`for ${repeatCount} occurrence${repeatCount > 1 ? 's' : ''}`);
    }

    parts.push(`(${occurrences.length} occurrence${occurrences.length !== 1 ? 's' : ''})`);

    return parts.join(', ');
  }, [repeatType, repeatInterval, repeatDaysOfWeek, startDate, endDate, startTime, endTime, isAllDay, is247, repeatEnds, repeatUntilDate, repeatCount, occurrences.length]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Event name is required');
      return;
    }

    if (!startDate) {
      toast.error('Start date is required');
      return;
    }

    if (!endDate) {
      toast.error('End date is required');
      return;
    }

    if (endDate < startDate) {
      toast.error('End date must be on or after start date');
      return;
    }

    if (!isAllDay && !is247) {
      if (startDate === endDate && endTime <= startTime) {
        const shouldOvernight = confirm('End time is before or equal to start time. Make this an overnight event (ends next day)?');
        if (!shouldOvernight) {
          toast.error('End time must be after start time');
          return;
        }
        // For overnight, we'll extend to next day
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        setEndDate(nextDay.toISOString().slice(0, 10));
      }
    }

    // Build datetime strings
    const startDatetime = isAllDay || is247
      ? `${startDate}T00:00:00`
      : `${startDate}T${startTime}:00`;
    
    let finalEndDate = endDate;
    if (!isAllDay && !is247 && startDate === endDate && endTime <= startTime) {
      // Overnight event
      const nextDay = new Date(endDate);
      nextDay.setDate(nextDay.getDate() + 1);
      finalEndDate = nextDay.toISOString().slice(0, 10);
    }
    
    const endDatetime = isAllDay || is247
      ? `${finalEndDate}T23:59:59`
      : `${finalEndDate}T${endTime}:00`;

    // Validate datetimes
    const startDt = new Date(startDatetime);
    const endDt = new Date(endDatetime);
    if (endDt <= startDt && repeatType === 'none') {
      toast.error('End date/time must be after start date/time');
      return;
    }

    // Build repeat config
    const repeatConfig = repeatType !== 'none' ? {
      interval: repeatInterval,
      daysOfWeek: repeatType === 'weekly' ? repeatDaysOfWeek : undefined,
    } : undefined;

    const repeatUntil = repeatEnds === 'on' && repeatUntilDate 
      ? new Date(repeatUntilDate + 'T23:59:59').toISOString()
      : undefined;

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        location: location.trim() || null,
        start_datetime: startDt.toISOString(),
        end_datetime: endDt.toISOString(),
        notes: notes.trim() || null,
        is_all_day: isAllDay || is247,
        timezone: timezone,
        repeat_type: repeatType,
        repeat_config: repeatConfig,
        repeat_until: repeatUntil,
        repeat_count: repeatEnds === 'after' ? repeatCount : undefined,
        exceptions: exceptions.length > 0 ? exceptions : undefined,
        extra_dates: extraDates.length > 0 ? extraDates : undefined,
        overrides: {},
      });
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save event');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Preset handlers
  const applyPreset = (preset: 'today' | 'all_week_247' | 'weekdays_9_5' | 'weekends_allday') => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    
    switch (preset) {
      case 'today':
        setStartDate(today);
        setEndDate(today);
        setIsAllDay(false);
        setIs247(false);
        setStartTime(now.toTimeString().slice(0, 5));
        setEndTime('23:59');
        setRepeatType('none');
        break;
      case 'all_week_247':
        const monday = new Date(now);
        monday.setDate(now.getDate() - now.getDay() + 1); // Get Monday
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        setStartDate(monday.toISOString().slice(0, 10));
        setEndDate(sunday.toISOString().slice(0, 10));
        setIsAllDay(false);
        setIs247(true);
        setRepeatType('none'); // Continuous block
        break;
      case 'weekdays_9_5':
        setStartDate(today);
        setEndDate(today);
        setIsAllDay(false);
        setIs247(false);
        setStartTime('09:00');
        setEndTime('17:00');
        setRepeatType('weekly');
        setRepeatDaysOfWeek([false, true, true, true, true, true, false]); // Mon-Fri
        setRepeatInterval(1);
        setRepeatEnds('never');
        break;
      case 'weekends_allday':
        setStartDate(today);
        setEndDate(today);
        setIsAllDay(true);
        setIs247(false);
        setRepeatType('weekly');
        setRepeatDaysOfWeek([true, false, false, false, false, false, true]); // Sat-Sun
        setRepeatInterval(1);
        setRepeatEnds('never');
        break;
    }
  };

  const toggleDayOfWeek = (index: number) => {
    const newDays = [...repeatDaysOfWeek];
    newDays[index] = !newDays[index];
    setRepeatDaysOfWeek(newDays);
  };

  const addException = () => {
    const date = prompt('Enter date to exclude (YYYY-MM-DD):');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (!exceptions.includes(date)) {
        setExceptions([...exceptions, date].sort());
      } else {
        toast.error('This date is already in exceptions');
      }
    } else if (date) {
      toast.error('Invalid date format. Use YYYY-MM-DD');
    }
  };

  const removeException = (date: string) => {
    setExceptions(exceptions.filter(d => d !== date));
  };

  const addExtraDate = () => {
    const date = prompt('Enter extra date (YYYY-MM-DD):');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (!extraDates.includes(date)) {
        setExtraDates([...extraDates, date].sort());
      } else {
        toast.error('This date is already in extra dates');
      }
    } else if (date) {
      toast.error('Invalid date format. Use YYYY-MM-DD');
    }
  };

  const removeExtraDate = (date: string) => {
    setExtraDates(extraDates.filter(d => d !== date));
  };

  // Preview occurrences - show first 30 for preview
  const previewOccurrences = occurrences.slice(0, 30);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10 shadow-sm">
          <h2 className="text-xl font-semibold">{mode === 'create' ? 'Create Event' : 'Edit Event'}</h2>
          <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Enter event name"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* When Section */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-gray-600">When</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (!endDate || endDate < e.target.value) {
                          setEndDate(e.target.value);
                        }
                      }}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">End Date *</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(e) => setIsAllDay(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">All-day</span>
                  </label>
                  {!isAllDay && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={is247}
                        onChange={(e) => setIs247(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Run 24/7</span>
                    </label>
                  )}
                </div>

                {!isAllDay && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      disabled={is247}
                      className="flex-1 border rounded px-2 py-1.5 text-sm disabled:bg-gray-100"
                    />
                    <span className="text-sm text-gray-600">to</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      disabled={is247}
                      className="flex-1 border rounded px-2 py-1.5 text-sm disabled:bg-gray-100"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-gray-600 mb-1">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="America/Vancouver">America/Vancouver (PST/PDT)</option>
                    <option value="America/Toronto">America/Toronto (EST/EDT)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="UTC">UTC</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">All times respect this timezone</p>
                </div>
              </div>
            </div>

            {/* Repeat Section */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-gray-600">Repeat</h3>
              
              <select
                value={repeatType}
                onChange={(e) => setRepeatType(e.target.value as any)}
                className="w-full border rounded px-2 py-1.5 text-sm mb-3"
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom…</option>
              </select>

              {repeatType !== 'none' && (
                <div className="space-y-3 text-sm">
                  {repeatType === 'daily' && (
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Every</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={repeatInterval}
                          onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 border rounded px-2 py-1"
                        />
                        <span className="text-xs text-gray-600">day(s)</span>
                      </div>
                    </div>
                  )}

                  {repeatType === 'weekly' && (
                    <div>
                      <label className="block text-xs text-gray-600 mb-2">Every</label>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="number"
                          min="1"
                          value={repeatInterval}
                          onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 border rounded px-2 py-1"
                        />
                        <span className="text-xs text-gray-600">week(s) on</span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                          <button
                            key={`${day}-${idx}`}
                            onClick={() => toggleDayOfWeek(idx)}
                            className={`w-7 h-7 text-xs rounded border flex items-center justify-center ${
                              repeatDaysOfWeek[idx]
                                ? 'bg-brand-red text-white border-brand-red font-semibold'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                            title={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][idx]}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {repeatType === 'monthly' && (
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Every</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={repeatInterval}
                          onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 border rounded px-2 py-1"
                        />
                        <span className="text-xs text-gray-600">month(s) on day {new Date(startDate).getDate()}</span>
                      </div>
                    </div>
                  )}

                  {repeatType === 'yearly' && (
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Every</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={repeatInterval}
                          onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 border rounded px-2 py-1"
                        />
                        <span className="text-xs text-gray-600">year(s)</span>
                      </div>
                    </div>
                  )}

                  {repeatType === 'custom' && (
                    <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
                      Custom recurrence options coming soon. Use Weekly or Monthly for now.
                    </div>
                  )}

                  {/* Repeat Ends */}
                  <div>
                    <label className="block text-xs text-gray-600 mb-2">Ends</label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="repeatEnds"
                          value="never"
                          checked={repeatEnds === 'never'}
                          onChange={(e) => setRepeatEnds(e.target.value as any)}
                        />
                        <span className="text-xs">Never</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="repeatEnds"
                          value="on"
                          checked={repeatEnds === 'on'}
                          onChange={(e) => setRepeatEnds(e.target.value as any)}
                        />
                        <span className="text-xs">On</span>
                        {repeatEnds === 'on' && (
                          <input
                            type="date"
                            value={repeatUntilDate}
                            onChange={(e) => setRepeatUntilDate(e.target.value)}
                            min={startDate}
                            className="border rounded px-2 py-1 text-xs ml-2"
                          />
                        )}
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="repeatEnds"
                          value="after"
                          checked={repeatEnds === 'after'}
                          onChange={(e) => setRepeatEnds(e.target.value as any)}
                        />
                        <span className="text-xs">After</span>
                        {repeatEnds === 'after' && (
                          <div className="flex items-center gap-2 ml-2">
                            <input
                              type="number"
                              min="1"
                              value={repeatCount}
                              onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-16 border rounded px-2 py-1 text-xs"
                            />
                            <span className="text-xs text-gray-600">occurrences</span>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Exceptions & Preview Section */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-gray-600">Exceptions & Preview</h3>
            
            {/* Summary */}
            <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
              <div className="text-sm font-medium text-blue-900 mb-1">Summary</div>
              <div className="text-sm text-blue-700">{summaryText}</div>
            </div>

            {/* Exceptions */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={addException}
                  className="px-3 py-1 text-xs rounded border bg-gray-50 hover:bg-gray-100"
                >
                  + Add exception date
                </button>
                <button
                  onClick={addExtraDate}
                  className="px-3 py-1 text-xs rounded border bg-gray-50 hover:bg-gray-100"
                >
                  + Add extra date
                </button>
              </div>
              
              {exceptions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {exceptions.map(date => (
                    <span
                      key={date}
                      className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 flex items-center gap-1"
                    >
                      {new Date(date).toLocaleDateString()}
                      <button onClick={() => removeException(date)} className="hover:text-red-900 font-bold">×</button>
                    </span>
                  ))}
                </div>
              )}

              {extraDates.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {extraDates.map(date => (
                    <span
                      key={date}
                      className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 flex items-center gap-1"
                    >
                      {new Date(date).toLocaleDateString()}
                      <button onClick={() => removeExtraDate(date)} className="hover:text-green-900 font-bold">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Preview Calendar - Simple list view for better clarity */}
            <div>
              <div className="text-xs font-medium text-gray-600 mb-2">Preview (showing first {Math.min(previewOccurrences.length, 30)} of {occurrences.length} occurrence{occurrences.length !== 1 ? 's' : ''})</div>
              {previewOccurrences.length > 0 ? (
                <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
                  {previewOccurrences.slice(0, 30).map((occ, idx) => {
                    const date = new Date(occ.date);
                    const isException = exceptions.includes(occ.date);
                    const isExtra = extraDates.includes(occ.date);
                    return (
                      <div
                        key={idx}
                        className={`p-2 rounded text-xs flex items-center justify-between ${
                          isException
                            ? 'bg-red-50 border border-red-200 text-red-700'
                            : isExtra
                            ? 'bg-green-50 border border-green-200 text-green-700'
                            : 'bg-blue-50 border border-blue-200 text-blue-900'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          {occ.isAllDay ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200">All day</span>
                          ) : occ.startTime && occ.endTime ? (
                            <span className="text-xs">{occ.startTime} - {occ.endTime}</span>
                          ) : null}
                        </div>
                        {isException && <span className="text-xs">(excluded)</span>}
                        {isExtra && <span className="text-xs">(extra)</span>}
                      </div>
                    );
                  })}
                  {previewOccurrences.length > 30 && (
                    <div className="text-xs text-gray-500 text-center pt-2">
                      ... and {previewOccurrences.length - 30} more occurrences
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500 p-4 text-center border rounded bg-gray-50">
                  No occurrences in preview range. Adjust your repeat settings or date range.
                </div>
              )}
            </div>
          </div>

          {/* Location and Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter location (optional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border rounded px-3 py-2 min-h-[80px] resize-y"
                placeholder="Enter event notes (optional)"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t p-4 flex justify-end gap-2 shadow-sm">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : mode === 'create' ? 'Create Event' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
