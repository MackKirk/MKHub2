import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ScheduleRailProject = {
  id: string;
  code?: string | null;
  name?: string | null;
  status?: string | null;
  status_label?: string | null;
};

const IN_PROGRESS_LABELS = new Set(['in progress', 'on progress']);

export function inProgressStatusIds(statuses: unknown[] | undefined): string[] {
  const ids: string[] = [];
  for (const s of statuses || []) {
    const row = s as { id?: unknown; label?: unknown };
    const label = String(row.label || '')
      .toLowerCase()
      .trim();
    if (IN_PROGRESS_LABELS.has(label) && row.id != null) {
      ids.push(String(row.id));
    }
  }
  return ids;
}

function projectSortKey(p: ScheduleRailProject): string {
  return `${(p.code || '').toString()} ${(p.name || '').toString()}`.trim().toLowerCase();
}

export function useInProgressProjectsForSchedule(businessLine: string, enabled: boolean) {
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, unknown[]>>('GET', '/settings'),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const statusIds = useMemo(
    () => inProgressStatusIds(settings?.project_statuses),
    [settings?.project_statuses],
  );

  const statusKey = statusIds.slice().sort().join(',');

  const listQuery = useQuery({
    queryKey: ['projects', 'schedule-rail', businessLine, statusKey],
    queryFn: async ({ signal }) => {
      if (statusIds.length === 0) return [] as ScheduleRailProject[];
      const params = new URLSearchParams();
      params.set('business_line', businessLine);
      params.set('page', '1');
      params.set('limit', '200');
      params.set('sort', 'project');
      params.set('dir', 'asc');
      for (const id of statusIds) params.append('status', id);
      const res = await api<{ items?: ScheduleRailProject[] } | ScheduleRailProject[]>(
        'GET',
        `/projects/business/projects?${params.toString()}`,
        undefined,
        undefined,
        signal,
      );
      const items = Array.isArray(res) ? res : res?.items || [];
      return [...items].sort((a, b) => projectSortKey(a).localeCompare(projectSortKey(b)));
    },
    enabled: enabled && !settingsLoading && statusIds.length > 0,
    staleTime: 60_000,
  });

  return {
    projects: listQuery.data ?? [],
    isLoading: enabled && (settingsLoading || listQuery.isLoading),
    isFetching: listQuery.isFetching,
    statusIdsReady: statusIds.length > 0,
  };
}
