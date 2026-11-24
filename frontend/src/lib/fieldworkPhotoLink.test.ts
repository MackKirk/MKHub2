import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ensureFieldworkPhotosLinked } from '@/lib/fieldworkPhotoLink';

const apiMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
}));

describe('ensureFieldworkPhotosLinked', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('PATCHes already-linked photos when phrase changes', async () => {
    apiMock
      .mockResolvedValueOnce([
        {
          id: 'photo-1',
          file_object_id: 'file-a',
          entry_type: 'observation',
          phrase_item_id: 'old-phrase',
          extra_notes: null,
        },
      ])
      .mockResolvedValueOnce({
        id: 'photo-1',
        file_object_id: 'file-a',
        record_row_version: 4,
      });

    const result = await ensureFieldworkPhotosLinked({
      projectId: 'proj',
      recordId: 'rec',
      fileObjectIds: ['file-a'],
      classify: {
        entryType: 'observation',
        phraseItemIds: ['new-phrase'],
        phraseTexts: ['Updated caption'],
      },
      expectedRowVersion: 3,
    });

    expect(result.updated).toBe(1);
    expect(result.linked).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.recordRowVersion).toBe(4);
    expect(apiMock).toHaveBeenNthCalledWith(
      2,
      'PATCH',
      '/projects/proj/fieldwork-records/rec/photos/photo-1',
      expect.objectContaining({
        phrase_item_id: 'new-phrase',
        entry_type: 'observation',
        expected_row_version: 3,
      })
    );
  });

  it('skips PATCH when classification already matches', async () => {
    apiMock.mockResolvedValueOnce([
      {
        id: 'photo-1',
        file_object_id: 'file-a',
        entry_type: 'observation',
        phrase_item_id: 'same-phrase',
        extra_notes: null,
      },
    ]);

    const result = await ensureFieldworkPhotosLinked({
      projectId: 'proj',
      recordId: 'rec',
      fileObjectIds: ['file-a'],
      classify: {
        entryType: 'observation',
        phraseItemIds: ['same-phrase'],
        phraseTexts: ['Caption'],
      },
      expectedRowVersion: 2,
    });

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });
});
