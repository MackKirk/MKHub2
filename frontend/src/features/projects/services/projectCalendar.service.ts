import { api } from '@/lib/api';
import { buildOpportunityListSearchParams } from '@/lib/opportunityFilters';
import type { ProjectCalendarResponse } from '../components/calendar/projectCalendar.types';

export function buildProjectCalendarQueryParams(
  searchParams: URLSearchParams,
  businessLine: string,
  start: string,
  end: string,
): URLSearchParams {
  const params = buildOpportunityListSearchParams(searchParams, businessLine, {
    omitQuickFilters: false,
  });
  params.delete('page');
  params.delete('limit');
  params.delete('view');
  params.delete('sort');
  params.delete('dir');
  params.set('start', start);
  params.set('end', end);
  return params;
}

export async function fetchProjectCalendarData(
  searchParams: URLSearchParams,
  businessLine: string,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<ProjectCalendarResponse> {
  const params = buildProjectCalendarQueryParams(searchParams, businessLine, start, end);
  const qs = params.toString();
  return api<ProjectCalendarResponse>(
    'GET',
    `/projects/business/projects/calendar${qs ? `?${qs}` : ''}`,
    undefined,
    undefined,
    signal,
  );
}
