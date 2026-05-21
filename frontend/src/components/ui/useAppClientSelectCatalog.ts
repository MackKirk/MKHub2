import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';

const DEFAULT_PAGE_SIZE = 40;

export type AppClientSelectClient = {
  id: string;
  display_name?: string;
  name?: string;
  city?: string;
  province?: string;
  address_line1?: string;
};

export function getClientPickerLabel(client: AppClientSelectClient): string {
  return (client.display_name || client.name || client.id || '').toString();
}

export function getClientSubtitle(client: AppClientSelectClient): string {
  const loc = [client.city, client.province].filter(Boolean).join(', ');
  if (loc) return loc;
  return (client.address_line1 || '').toString();
}

function normalizeClientId(id: string | null | undefined): string {
  return id == null ? '' : String(id).trim();
}

async function fetchClientsPage(page: number, q: string, pageSize: number): Promise<AppClientSelectClient[]> {
  const qs = new URLSearchParams({
    limit: String(pageSize),
    page: String(page),
    sort: 'customer',
    dir: 'asc',
  });
  if (q) qs.set('q', q);
  const result = await api<{ items?: AppClientSelectClient[] } | AppClientSelectClient[]>(
    'GET',
    `/clients?${qs.toString()}`,
  );
  if (Array.isArray(result)) return result;
  if (result?.items) return result.items;
  return [];
}

export type UseAppClientSelectCatalogOptions = {
  search: string;
  enabled?: boolean;
  fetchList?: boolean;
  pageSize?: number;
  selectedIds?: string[];
};

export function useAppClientSelectCatalog({
  search,
  enabled = true,
  fetchList = true,
  pageSize = DEFAULT_PAGE_SIZE,
  selectedIds = [],
}: UseAppClientSelectCatalogOptions) {
  const q = search.trim();
  const selectedIdList = useMemo(
    () => [...new Set(selectedIds.map(normalizeClientId).filter(Boolean))],
    [selectedIds],
  );

  const infinite = useInfiniteQuery({
    queryKey: ['app-client-select-catalog', { q, pageSize }],
    enabled: enabled && fetchList,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => fetchClientsPage(pageParam as number, q, pageSize),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < pageSize) return undefined;
      return allPages.length + 1;
    },
  });

  const clients = useMemo(() => {
    const byId = new Map<string, AppClientSelectClient>();
    for (const page of infinite.data?.pages ?? []) {
      for (const client of page) {
        if (client?.id) byId.set(normalizeClientId(client.id), client);
      }
    }
    return sortByLabel(Array.from(byId.values()), (c) => getClientPickerLabel(c));
  }, [infinite.data?.pages]);

  const clientsById = useMemo(() => {
    const map = new Map<string, AppClientSelectClient>();
    for (const client of clients) map.set(normalizeClientId(client.id), client);
    return map;
  }, [clients]);

  const missingSelectedIds = useMemo(
    () => selectedIdList.filter((id) => !clientsById.has(normalizeClientId(id))),
    [selectedIdList, clientsById],
  );

  const fallbackQuery = useQuery({
    queryKey: ['app-client-select-selected', missingSelectedIds.join(',')],
    enabled: enabled && missingSelectedIds.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(
        missingSelectedIds.map((id) =>
          api<AppClientSelectClient>('GET', `/clients/${encodeURIComponent(id)}`),
        ),
      );
      return rows.filter((c) => c?.id);
    },
  });

  const fallbackById = useMemo(() => {
    const map = new Map<string, AppClientSelectClient>();
    for (const client of fallbackQuery.data ?? []) {
      map.set(normalizeClientId(client.id), client);
    }
    return map;
  }, [fallbackQuery.data]);

  const selectedClients = useMemo(
    () =>
      selectedIdList
        .map((id) => clientsById.get(normalizeClientId(id)) ?? fallbackById.get(normalizeClientId(id)) ?? null)
        .filter((c): c is AppClientSelectClient => c != null),
    [selectedIdList, clientsById, fallbackById],
  );

  const selectedClient = selectedClients[0] ?? null;

  const resolveClientById = (id: string) =>
    clientsById.get(normalizeClientId(id)) ?? fallbackById.get(normalizeClientId(id)) ?? null;

  return {
    clients,
    clientsById,
    resolveClientById,
    selectedClients,
    selectedClient,
    fetchNextPage: infinite.fetchNextPage,
    hasNextPage: infinite.hasNextPage ?? false,
    isFetchingNextPage: infinite.isFetchingNextPage,
    isLoading: infinite.isLoading,
    isFetching: infinite.isFetching,
    refetch: infinite.refetch,
  };
}
