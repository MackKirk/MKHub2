import { api } from '@/lib/api';
import { buildOpportunityListSearchParams } from '@/lib/opportunityFilters';
import type { MapBounds, MapListKind, ProjectMapPointsResponse } from '../components/map/projectMap.types';

const MAP_POINTS_ENDPOINT: Record<MapListKind, string> = {
  projects: '/projects/business/projects/map-points',
  opportunities: '/projects/business/opportunities/map-points',
};

export function buildProjectMapQueryParams(
  searchParams: URLSearchParams,
  businessLine: string,
  bounds?: MapBounds | null,
): URLSearchParams {
  const params = buildOpportunityListSearchParams(searchParams, businessLine, {
    omitQuickFilters: false,
  });
  params.delete('page');
  params.delete('limit');
  params.delete('view');
  params.delete('sort');
  params.delete('dir');
  if (bounds) {
    params.set('north', String(bounds.north));
    params.set('south', String(bounds.south));
    params.set('east', String(bounds.east));
    params.set('west', String(bounds.west));
    params.set('zoom', String(bounds.zoom));
  }
  return params;
}

export async function fetchMapPoints(
  listKind: MapListKind,
  searchParams: URLSearchParams,
  businessLine: string,
  bounds: MapBounds | null,
  signal?: AbortSignal,
): Promise<ProjectMapPointsResponse> {
  const params = buildProjectMapQueryParams(searchParams, businessLine, bounds);
  const qs = params.toString();
  const endpoint = MAP_POINTS_ENDPOINT[listKind];
  return api<ProjectMapPointsResponse>(
    'GET',
    `${endpoint}${qs ? `?${qs}` : ''}`,
    undefined,
    undefined,
    signal,
  );
}

/** @deprecated Use fetchMapPoints('projects', ...) */
export async function fetchProjectMapPoints(
  searchParams: URLSearchParams,
  businessLine: string,
  bounds: MapBounds | null,
  signal?: AbortSignal,
): Promise<ProjectMapPointsResponse> {
  return fetchMapPoints('projects', searchParams, businessLine, bounds, signal);
}
