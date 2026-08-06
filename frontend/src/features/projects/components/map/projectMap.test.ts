import { describe, expect, it, vi } from 'vitest';
import { isMapPointsAbortError } from '../../hooks/useProjectMapPoints';
import { buildProjectMapQueryParams, fetchMapPoints } from '../../services/projectMap.service';

vi.mock('@/lib/api', () => ({
  api: vi.fn(() => Promise.resolve({ items: [], mapped_count: 0, unmapped_count: 0, total_matching: 0 })),
}));

describe('fetchMapPoints', () => {
  it('uses projects endpoint for projects listKind', async () => {
    const { api } = await import('@/lib/api');
    await fetchMapPoints('projects', new URLSearchParams(), 'construction', null);
    expect(api).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('/projects/business/projects/map-points'),
      undefined,
      undefined,
      undefined,
    );
  });

  it('uses opportunities endpoint for opportunities listKind', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api).mockClear();
    await fetchMapPoints('opportunities', new URLSearchParams(), 'construction', null);
    expect(api).toHaveBeenCalledWith(
      'GET',
      expect.stringContaining('/projects/business/opportunities/map-points'),
      undefined,
      undefined,
      undefined,
    );
  });
});

describe('buildProjectMapQueryParams', () => {
  it('strips pagination and view params', () => {
    const params = new URLSearchParams('page=2&limit=50&view=map&status=active');
    const built = buildProjectMapQueryParams(params, 'construction', null);
    expect(built.has('page')).toBe(false);
    expect(built.has('limit')).toBe(false);
    expect(built.has('view')).toBe(false);
    expect(built.get('status')).toBe('active');
  });
});

describe('isMapPointsAbortError', () => {
  it('detects AbortError', () => {
    expect(isMapPointsAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
  });

  it('detects fetch abort message', () => {
    expect(isMapPointsAbortError(new Error('signal is aborted without reason'))).toBe(true);
  });

  it('ignores real errors', () => {
    expect(isMapPointsAbortError(new Error('HTTP 500'))).toBe(false);
  });
});
