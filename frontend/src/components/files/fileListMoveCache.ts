import type { QueryClient, QueryKey } from '@tanstack/react-query';

type FileRow = { id: string };

export function patchFilesInQueryCache<T extends FileRow>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  fileIds: string[],
  patch: Partial<T>,
): T[] | undefined {
  const prev = queryClient.getQueryData<T[]>(queryKey);
  if (!prev) return undefined;
  const idSet = new Set(fileIds);
  const next = prev.map((file) => (idSet.has(file.id) ? { ...file, ...patch } : file));
  queryClient.setQueryData(queryKey, next);
  return prev;
}

export function removeFilesFromQueryCache<T extends FileRow>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  fileIds: string[],
): T[] | undefined {
  const prev = queryClient.getQueryData<T[]>(queryKey);
  if (!prev) return undefined;
  const idSet = new Set(fileIds);
  const next = prev.filter((file) => !idSet.has(file.id));
  queryClient.setQueryData(queryKey, next);
  return prev;
}

export function restoreQueryCache<T>(queryClient: QueryClient, queryKey: QueryKey, snapshot: T | undefined) {
  if (snapshot !== undefined) {
    queryClient.setQueryData(queryKey, snapshot);
  }
}

export function invalidateQueriesInBackground(queryClient: QueryClient, queryKeys: QueryKey[]) {
  for (const queryKey of queryKeys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
