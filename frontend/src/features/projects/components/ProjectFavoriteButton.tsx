import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { uiCx } from '@/components/ui';

type ProjectFavoriteButtonProps = {
  projectId: string;
  favorited?: boolean;
  className?: string;
  iconClassName?: string;
  /** When true, stop click from navigating parent Link/row. */
  stopPropagation?: boolean;
};

type ListCacheSnapshot = Array<[QueryKey, unknown]>;

function isTabCountsQuery(queryKey: QueryKey): boolean {
  return Array.isArray(queryKey) && queryKey[1] === 'tab-counts';
}

function isFavoritedListQuery(queryKey: QueryKey): boolean {
  if (isTabCountsQuery(queryKey)) return false;
  const qs = queryKey.find((part) => typeof part === 'string' && part.includes('favorited='));
  if (typeof qs !== 'string') return false;
  try {
    const params = new URLSearchParams(qs);
    const v = params.get('favorited');
    return v === 'true' || v === '1';
  } catch {
    return false;
  }
}

function isListRootQuery(queryKey: QueryKey): boolean {
  return Array.isArray(queryKey) && (queryKey[0] === 'projects' || queryKey[0] === 'opportunities');
}

function extractItems(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as any).items)) {
    return (data as any).items;
  }
  return [];
}

function findCachedListItem(snapshots: ListCacheSnapshot[], projectId: string): any | null {
  for (const snapshot of snapshots) {
    for (const [key, data] of snapshot) {
      if (isTabCountsQuery(key)) continue;
      for (const item of extractItems(data)) {
        if (item && typeof item === 'object' && String(item.id) === projectId) {
          return item;
        }
      }
    }
  }
  return null;
}

function patchListCacheData(
  data: unknown,
  projectId: string,
  next: boolean,
  opts: { removeWhenUnfavorited?: boolean; upsertItem?: any | null } = {},
): unknown {
  if (!data || typeof data !== 'object') return data;
  const { removeWhenUnfavorited = false, upsertItem = null } = opts;

  if (Array.isArray(data)) {
    let nextItems = data.map((item) =>
      item && typeof item === 'object' && String((item as any).id) === projectId
        ? { ...item, favorited: next }
        : item,
    );
    if (next && upsertItem && !nextItems.some((item) => item && String((item as any).id) === projectId)) {
      nextItems = [{ ...upsertItem, favorited: true }, ...nextItems];
    }
    if (!next && removeWhenUnfavorited) {
      return nextItems.filter((item) => !(item && typeof item === 'object' && String((item as any).id) === projectId));
    }
    return nextItems;
  }

  const row = data as { items?: unknown[]; total?: number };
  if (!Array.isArray(row.items)) return data;

  let items = row.items.map((item) =>
    item && typeof item === 'object' && String((item as any).id) === projectId
      ? { ...item, favorited: next }
      : item,
  );
  let total = typeof row.total === 'number' ? row.total : undefined;

  if (next && upsertItem && !items.some((item) => item && String((item as any).id) === projectId)) {
    items = [{ ...upsertItem, favorited: true }, ...items];
    if (typeof total === 'number') total += 1;
  }

  if (!next && removeWhenUnfavorited) {
    const before = items.length;
    items = items.filter((item) => !(item && typeof item === 'object' && String((item as any).id) === projectId));
    if (typeof total === 'number' && items.length < before) {
      total = Math.max(0, total - (before - items.length));
    }
  }

  return { ...row, items, ...(typeof total === 'number' ? { total } : {}) };
}

function patchTabCounts(data: unknown, next: boolean): unknown {
  if (!data || typeof data !== 'object') return data;
  const counts = data as Record<string, number>;
  if (typeof counts.favorited !== 'number') {
    return { ...counts, favorited: next ? 1 : 0 };
  }
  return {
    ...counts,
    favorited: Math.max(0, counts.favorited + (next ? 1 : -1)),
  };
}

export function ProjectFavoriteButton({
  projectId,
  favorited = false,
  className,
  iconClassName = 'h-3.5 w-3.5',
  stopPropagation = true,
}: ProjectFavoriteButtonProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) {
        return api<{ favorited: boolean }>('POST', `/projects/${projectId}/favorite`);
      }
      return api<{ favorited: boolean }>('DELETE', `/projects/${projectId}/favorite`);
    },
    onMutate: async (next) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['project', projectId] }),
        queryClient.cancelQueries({ queryKey: ['projects'] }),
        queryClient.cancelQueries({ queryKey: ['opportunities'] }),
      ]);

      const previousProject = queryClient.getQueryData<any>(['project', projectId]);
      const previousProjects: ListCacheSnapshot = queryClient.getQueriesData({ queryKey: ['projects'] });
      const previousOpportunities: ListCacheSnapshot = queryClient.getQueriesData({ queryKey: ['opportunities'] });
      const sourceItem = findCachedListItem([previousProjects, previousOpportunities], projectId);

      if (previousProject && typeof previousProject === 'object') {
        queryClient.setQueryData(['project', projectId], { ...previousProject, favorited: next });
      }

      const patchRoot = (key: QueryKey, old: unknown) => {
        if (isTabCountsQuery(key)) return patchTabCounts(old, next);
        if (isFavoritedListQuery(key)) {
          return patchListCacheData(old, projectId, next, {
            removeWhenUnfavorited: true,
            upsertItem: next ? sourceItem : null,
          });
        }
        return patchListCacheData(old, projectId, next);
      };

      for (const [key] of previousProjects) {
        queryClient.setQueryData(key, (old: unknown) => patchRoot(key, old));
      }
      for (const [key] of previousOpportunities) {
        queryClient.setQueryData(key, (old: unknown) => patchRoot(key, old));
      }

      return { previousProject, previousProjects, previousOpportunities };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previousProject !== undefined) {
        queryClient.setQueryData(['project', projectId], ctx.previousProject);
      }
      for (const [key, data] of ctx?.previousProjects || []) {
        queryClient.setQueryData(key, data);
      }
      for (const [key, data] of ctx?.previousOpportunities || []) {
        queryClient.setQueryData(key, data);
      }
      toast.error('Failed to update favorite');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId], refetchType: 'none' });
      // Favorited-filtered lists must refetch (or mark stale) so a just-starred
      // item appears when the Favorites quick filter is applied next.
      queryClient.invalidateQueries({
        predicate: (q) => isListRootQuery(q.queryKey) && isFavoritedListQuery(q.queryKey),
      });
    },
  });

  const active = mutation.isPending ? !!mutation.variables : favorited;

  return (
    <button
      type="button"
      onClick={(e) => {
        if (stopPropagation) {
          e.preventDefault();
          e.stopPropagation();
        }
        mutation.mutate(!active);
      }}
      className={uiCx(
        'inline-flex items-center justify-center transition-colors',
        active ? 'text-amber-500 hover:text-amber-600' : 'text-gray-400 hover:text-amber-500',
        className,
      )}
      title={active ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={active}
      disabled={mutation.isPending}
    >
      <Star className={iconClassName} fill={active ? 'currentColor' : 'none'} aria-hidden />
    </button>
  );
}
