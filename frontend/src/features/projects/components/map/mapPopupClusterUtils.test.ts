import { describe, expect, it } from 'vitest';
import {
  clusterListScrollClass,
  formatClusterLocation,
  getClusterVisibleItems,
  shouldShowSeeAll,
} from './mapPopupClusterUtils';
import type { LocationGroup, ProjectMapPoint } from './projectMap.types';

function makePoint(overrides: Partial<ProjectMapPoint> = {}): ProjectMapPoint {
  return {
    id: overrides.id || 'p1',
    code: overrides.code || 'MK-001',
    name: overrides.name || 'Test Project',
    latitude: 49.28,
    longitude: -123.12,
    status: 'active',
    division_names: [],
    ...overrides,
  };
}

function makeGroup(projects: ProjectMapPoint[]): LocationGroup {
  return {
    key: '49.280000,-123.120000',
    lat: 49.28,
    lng: -123.12,
    projects,
  };
}

describe('mapPopupClusterUtils', () => {
  it('formats cluster location from first point', () => {
    const group = makeGroup([
      makePoint({
        address_street: 'Arbutus Village',
        address_city_line: 'Vancouver, BC',
      }),
    ]);
    expect(formatClusterLocation(group)).toEqual({
      street: 'Arbutus Village',
      cityLine: 'Vancouver, BC',
      fullLine: 'Arbutus Village, Vancouver, BC',
    });
  });

  it('shows all items up to six', () => {
    const projects = Array.from({ length: 5 }, (_, i) => makePoint({ id: `p${i}` }));
    expect(getClusterVisibleItems(projects, false)).toHaveLength(5);
  });

  it('collapses to four when more than six and not expanded', () => {
    const projects = Array.from({ length: 8 }, (_, i) => makePoint({ id: `p${i}` }));
    expect(getClusterVisibleItems(projects, false)).toHaveLength(4);
    expect(shouldShowSeeAll(8, false)).toBe(true);
  });

  it('shows all when expanded', () => {
    const projects = Array.from({ length: 8 }, (_, i) => makePoint({ id: `p${i}` }));
    expect(getClusterVisibleItems(projects, true)).toHaveLength(8);
    expect(shouldShowSeeAll(8, true)).toBe(false);
  });

  it('enables scroll for multi-project clusters', () => {
    expect(clusterListScrollClass(2, false)).toContain('overflow-y-auto');
    expect(clusterListScrollClass(5, false)).toContain('overflow-y-auto');
    expect(clusterListScrollClass(8, true)).toContain('overflow-y-auto');
    expect(clusterListScrollClass(1, false)).toBeUndefined();
  });
});
