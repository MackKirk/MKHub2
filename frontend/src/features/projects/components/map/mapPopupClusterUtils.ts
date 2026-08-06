import type { LocationGroup, MapViewLabels, ProjectMapPoint } from './projectMap.types';

export const CLUSTER_COLLAPSED_LIMIT = 4;
export const CLUSTER_SEE_ALL_THRESHOLD = 6;

export type ClusterLocation = {
  street: string | null;
  cityLine: string | null;
  fullLine: string | null;
};

export function formatClusterLocation(group: LocationGroup): ClusterLocation {
  const point = group.projects[0];
  if (!point) {
    return { street: null, cityLine: null, fullLine: null };
  }

  const street = point.address_street?.trim() || null;
  const cityLine = point.address_city_line?.trim() || null;
  const fallback = point.address?.trim() || null;

  if (street || cityLine) {
    const fullLine = [street, cityLine].filter(Boolean).join(', ');
    return { street, cityLine, fullLine: fullLine || null };
  }

  return { street: null, cityLine: null, fullLine: fallback };
}

export function clusterCountLabel(count: number, labels: MapViewLabels): string {
  return labels.projectsAtLocation(count);
}

export function shouldShowSeeAll(count: number, expanded: boolean): boolean {
  return count > CLUSTER_SEE_ALL_THRESHOLD && !expanded;
}

export function getClusterVisibleItems(projects: ProjectMapPoint[], expanded: boolean): ProjectMapPoint[] {
  if (projects.length <= CLUSTER_SEE_ALL_THRESHOLD || expanded) {
    return projects;
  }
  return projects.slice(0, CLUSTER_COLLAPSED_LIMIT);
}

export function clusterListScrollClass(count: number, expanded: boolean): string | undefined {
  if (count <= 1) return undefined;
  if (count > CLUSTER_SEE_ALL_THRESHOLD && expanded) {
    return 'max-h-[min(60vh,18rem)] overflow-y-auto overscroll-contain pr-1 pb-1';
  }
  if (count >= 2) {
    return 'max-h-[min(55vh,16rem)] overflow-y-auto overscroll-contain pr-1 pb-1';
  }
  return undefined;
}
