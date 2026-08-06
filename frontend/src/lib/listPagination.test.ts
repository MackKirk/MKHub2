import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  parseListPageLimit,
  resolveInitialListViewMode,
  type ProjectViewMode,
} from '@/lib/listPagination';

describe('resolveInitialListViewMode', () => {
  const key = 'test-view-mode';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('never returns map on initial load', () => {
    localStorage.setItem(key, 'map');
    expect(resolveInitialListViewMode('map', key)).toBe('list');
    expect(resolveInitialListViewMode(null, key)).toBe('list');
  });

  it('restores list or cards from localStorage', () => {
    localStorage.setItem(key, 'cards');
    expect(resolveInitialListViewMode(null, key)).toBe('cards');
  });

  it('prefers explicit list/cards URL param', () => {
    localStorage.setItem(key, 'cards');
    expect(resolveInitialListViewMode('list', key)).toBe('list');
  });
});

describe('listPagination map view', () => {
  it('accepts map as ProjectViewMode', () => {
    const mode: ProjectViewMode = 'map';
    expect(mode).toBe('map');
  });

  it('parseListPageLimit still defaults to 25', () => {
    expect(parseListPageLimit(null)).toBe(25);
  });
});
