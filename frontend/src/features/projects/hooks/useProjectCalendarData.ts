import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchProjectCalendarData } from '../services/projectCalendar.service';
import type { ProjectCalendarResponse } from '../components/calendar/projectCalendar.types';

const CALENDAR_CACHE_TTL_MS = 60_000;

export function useProjectCalendarData(
  searchParams: URLSearchParams,
  businessLine: string,
  start: string,
  end: string,
  enabled: boolean,
) {
  const filterKey = useMemo(() => {
    const p = new URLSearchParams(searchParams);
    p.delete('view');
    p.delete('page');
    p.delete('limit');
    p.delete('sort');
    p.delete('dir');
    return p.toString();
  }, [searchParams]);

  return useQuery<ProjectCalendarResponse>({
    queryKey: ['projects', 'calendar', businessLine, filterKey, start, end],
    queryFn: ({ signal }) => fetchProjectCalendarData(searchParams, businessLine, start, end, signal),
    enabled,
    staleTime: CALENDAR_CACHE_TTL_MS,
    placeholderData: keepPreviousData,
  });
}
