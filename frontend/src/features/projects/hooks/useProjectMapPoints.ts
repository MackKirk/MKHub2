import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PROJECT_MAP_CACHE_TTL_MS, PROJECT_MAP_DEBOUNCE_MS } from '../lib/projectMapConfig';
import { fetchMapPoints } from '../services/projectMap.service';
import type { MapBounds, MapListKind, ProjectMapPointsResponse } from '../components/map/projectMap.types';

type CacheEntry = { data: ProjectMapPointsResponse; expiresAt: number };

const responseCache = new Map<string, CacheEntry>();

function cacheKey(businessLine: string, filterKey: string, boundsKey: string): string {
  return `${businessLine}|${filterKey}|${boundsKey}`;
}

function roundBounds(bounds: MapBounds | null): string {
  if (!bounds) return 'all';
  const r = (n: number) => n.toFixed(3);
  return `${r(bounds.north)},${r(bounds.south)},${r(bounds.east)},${r(bounds.west)},${Math.round(bounds.zoom)}`;
}

export function isMapPointsAbortError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    const msg = err.message.toLowerCase();
    if (msg.includes('aborted') || msg.includes('abort')) return true;
  }
  return false;
}

export function useProjectMapPoints(
  listKind: MapListKind,
  searchParams: URLSearchParams,
  businessLine: string,
  bounds: MapBounds | null,
  enabled: boolean,
  /** When false, fetches all matching points (no viewport filter) — avoids abort races on first load. */
  useViewportBounds = false,
) {
  const [debouncedBounds, setDebouncedBounds] = useState<MapBounds | null>(bounds);

  useEffect(() => {
    if (!useViewportBounds) {
      setDebouncedBounds(null);
      return;
    }
    const timer = setTimeout(() => setDebouncedBounds(bounds), PROJECT_MAP_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [bounds, useViewportBounds]);

  const filterKey = useMemo(() => {
    const p = new URLSearchParams(searchParams);
    p.delete('view');
    p.delete('page');
    p.delete('limit');
    p.delete('sort');
    p.delete('dir');
    return p.toString();
  }, [searchParams]);

  const effectiveBounds = useViewportBounds ? debouncedBounds : null;
  const boundsKey = roundBounds(effectiveBounds);

  return useQuery({
    queryKey: [listKind, 'map-points', businessLine, filterKey, boundsKey],
    enabled,
    staleTime: PROJECT_MAP_CACHE_TTL_MS,
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => !isMapPointsAbortError(error) && failureCount < 1,
    queryFn: async ({ signal }) => {
      const key = cacheKey(businessLine, filterKey, boundsKey);
      const cached = responseCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }

      try {
        const data = await fetchMapPoints(
          listKind,
          searchParams,
          businessLine,
          effectiveBounds,
          signal,
        );
        responseCache.set(key, { data, expiresAt: Date.now() + PROJECT_MAP_CACHE_TTL_MS });
        return data;
      } catch (err) {
        if (isMapPointsAbortError(err)) {
          const fallback = responseCache.get(key);
          if (fallback) return fallback.data;
        }
        throw err;
      }
    },
  });
}
