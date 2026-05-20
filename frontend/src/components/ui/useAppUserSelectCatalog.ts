import { useMemo } from 'react';
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getUserPickerLabel } from '@/lib/userDisplay';
import { sortByLabel } from '@/lib/sortOptions';
import type { AppUserSelectUser } from './AppUserSelect';

const DEFAULT_PAGE_SIZE = 40;

function normalizeUserId(id: string | null | undefined): string {
  return id == null ? '' : String(id).trim();
}

export type UseAppUserSelectCatalogOptions = {
  search: string;
  enabled?: boolean;
  /** When false, skips paginated list fetch (e.g. dropdown closed) but still resolves selected users. */
  fetchList?: boolean;
  pageSize?: number;
  /** Resolve display rows for selected ids not yet loaded in the current list pages. */
  selectedIds?: string[];
};

function mapDirectoryCardToUser(row: Record<string, unknown>): AppUserSelectUser {
  const id = String(row.id ?? '');
  return {
    id,
    name: (row.name as string) || undefined,
    username: (row.username as string) || undefined,
    first_name: (row.first_name as string) || undefined,
    last_name: (row.last_name as string) || undefined,
    preferred_name: (row.preferred_name as string) || undefined,
    department: (row.department as string) || (row.division as string) || undefined,
    profile_photo_file_id: (row.profile_photo_file_id as string) || undefined,
  };
}

export function useAppUserSelectCatalog({
  search,
  enabled = true,
  fetchList = true,
  pageSize = DEFAULT_PAGE_SIZE,
  selectedIds = [],
}: UseAppUserSelectCatalogOptions) {
  const q = search.trim();
  const selectedIdList = useMemo(
    () => [...new Set(selectedIds.map(normalizeUserId).filter(Boolean))],
    [selectedIds],
  );

  const infinite = useInfiniteQuery({
    queryKey: ['app-user-select-catalog', { q, pageSize }],
    enabled: enabled && fetchList,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams({
        limit: String(pageSize),
        offset: String(pageParam),
      });
      if (q) qs.set('q', q);
      const rows = await api<AppUserSelectUser[]>('GET', `/auth/users/options?${qs.toString()}`);
      return Array.isArray(rows) ? rows : [];
    },
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < pageSize) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
  });

  const users = useMemo(() => {
    const byId = new Map<string, AppUserSelectUser>();
    for (const page of infinite.data?.pages ?? []) {
      for (const user of page) {
        if (user?.id) byId.set(normalizeUserId(user.id), user);
      }
    }
    return sortByLabel(Array.from(byId.values()), (u) => getUserPickerLabel(u));
  }, [infinite.data?.pages]);

  const usersById = useMemo(() => {
    const map = new Map<string, AppUserSelectUser>();
    for (const user of users) map.set(user.id, user);
    return map;
  }, [users]);

  const missingSelectedIds = useMemo(
    () => selectedIdList.filter((id) => !usersById.has(normalizeUserId(id))),
    [selectedIdList, usersById],
  );

  const fallbackQueries = useQueries({
    queries: missingSelectedIds.map((id) => ({
      queryKey: ['app-user-select-selected', id],
      enabled: enabled && !!id,
      queryFn: () => api<Record<string, unknown>>('GET', `/employees/${id}/directory-card`),
    })),
  });

  const fallbackById = useMemo(() => {
    const map = new Map<string, AppUserSelectUser>();
    missingSelectedIds.forEach((id, index) => {
      const row = fallbackQueries[index]?.data;
      if (row) map.set(id, mapDirectoryCardToUser(row));
    });
    return map;
  }, [missingSelectedIds, fallbackQueries]);

  const selectedUsers = useMemo(() => {
    return selectedIdList
      .map((id) => usersById.get(normalizeUserId(id)) ?? fallbackById.get(normalizeUserId(id)) ?? null)
      .filter((u): u is AppUserSelectUser => u != null);
  }, [selectedIdList, usersById, fallbackById]);

  /** @deprecated Use selectedUsers[0] — kept for single-select callers. */
  const selectedUser = selectedUsers[0] ?? null;

  const resolveUserById = (id: string) =>
    usersById.get(normalizeUserId(id)) ?? fallbackById.get(normalizeUserId(id)) ?? null;

  return {
    users,
    usersById,
    resolveUserById,
    selectedUsers,
    selectedUser,
    fetchNextPage: infinite.fetchNextPage,
    hasNextPage: infinite.hasNextPage ?? false,
    isFetchingNextPage: infinite.isFetchingNextPage,
    isLoading: infinite.isLoading,
    isFetching: infinite.isFetching,
    refetch: infinite.refetch,
  };
}

/** Fetch one user row for display (e.g. legacy single-id usage). */
export function useAppUserSelectSelectedUser(userId: string | undefined, enabled = true) {
  const { data } = useQuery({
    queryKey: ['app-user-select-selected', userId],
    enabled: enabled && !!userId,
    queryFn: () => api<Record<string, unknown>>('GET', `/employees/${userId}/directory-card`),
  });
  return data ? mapDirectoryCardToUser(data) : null;
}
