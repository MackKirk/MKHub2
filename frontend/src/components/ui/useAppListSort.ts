import { useCallback, useMemo, useState } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

export type AppListSortDirection = 'asc' | 'desc';

export type UseAppListSortOptions<T extends string> = {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  /** Column id used when `sort` is missing from the URL. */
  defaultSort: T;
  /** Allowed values; used to validate the URL `sort` param. */
  validSorts: readonly T[];
  sortParam?: string;
  dirParam?: string;
  /** Reset `page` to 1 when sort changes (default true). */
  resetPageOnSort?: boolean;
};

export type UseAppListSortResult<T extends string> = {
  sortBy: T;
  sortDir: AppListSortDirection;
  setSort: (column: T, direction?: AppListSortDirection) => void;
};

/**
 * URL-backed list sort (`sort` + `dir` query params), same pattern as Opportunities / Customers.
 */
export function useAppListSort<T extends string>({
  searchParams,
  setSearchParams,
  defaultSort,
  validSorts,
  sortParam = 'sort',
  dirParam = 'dir',
  resetPageOnSort = true,
}: UseAppListSortOptions<T>): UseAppListSortResult<T> {
  const sortBy = useMemo(() => {
    const raw = searchParams.get(sortParam);
    if (raw && (validSorts as readonly string[]).includes(raw)) {
      return raw as T;
    }
    return defaultSort;
  }, [searchParams, sortParam, validSorts, defaultSort]);

  const sortDir: AppListSortDirection = searchParams.get(dirParam) === 'desc' ? 'desc' : 'asc';

  const setSort = useCallback(
    (column: T, direction?: AppListSortDirection) => {
      const params = new URLSearchParams(searchParams);
      const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
      params.set(sortParam, column);
      params.set(dirParam, nextDir);
      if (resetPageOnSort) {
        params.set('page', '1');
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, sortBy, sortDir, sortParam, dirParam, resetPageOnSort],
  );

  return { sortBy, sortDir, setSort };
}

export function getAppListSortIndicator(
  sortBy: string,
  column: string,
  sortDir: AppListSortDirection,
): string {
  if (sortBy !== column) return '';
  return sortDir === 'asc' ? ' ↑' : ' ↓';
}

/**
 * In-memory sort for tab lists (Timesheet, Training, Reports) that do not use URL query params.
 */
export function useLocalAppListSort<T extends string>(
  defaultSort: T,
  defaultDir: AppListSortDirection = 'desc',
): UseAppListSortResult<T> {
  const [{ sortBy, sortDir }, setSortState] = useState({
    sortBy: defaultSort,
    sortDir: defaultDir,
  });

  const setSort = useCallback((column: T, direction?: AppListSortDirection) => {
    setSortState((prev) => {
      const nextDir =
        direction ?? (prev.sortBy === column && prev.sortDir === 'asc' ? 'desc' : 'asc');
      return { sortBy: column, sortDir: nextDir };
    });
  }, []);

  return { sortBy, sortDir, setSort };
}

export type AppListSortGetter<T> = (item: T) => string | number | null | undefined;

export function sortListByAppColumn<T>(
  items: readonly T[],
  sortBy: string,
  sortDir: AppListSortDirection,
  getters: Record<string, AppListSortGetter<T>>,
): T[] {
  const getter = getters[sortBy];
  if (!getter) return [...items];

  const dir = sortDir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * dir;
    }
    return String(av).localeCompare(String(bv), undefined, { sensitivity: 'base', numeric: true }) * dir;
  });
}
