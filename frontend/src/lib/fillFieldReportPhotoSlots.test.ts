import { describe, expect, it } from 'vitest';
import type { DocumentPage } from '@/types/documentCreator';
import {
  fillFieldReportPhotoSlots,
  listEmptyPhotoSlots,
} from '@/lib/fillFieldReportPhotoSlots';
import type { FieldworkPhotoObservation } from '@/types/fieldwork';

function photo(id: string, file: string, phrase: string): FieldworkPhotoObservation {
  return {
    id,
    record_id: 'r1',
    file_object_id: file,
    sort_order: 0,
    entry_type: 'observation',
    phrase_text_snapshot: phrase,
  };
}

function slottedPages(): DocumentPage[] {
  return [
    {
      template_id: null,
      elements: [
        {
          id: 'img1',
          type: 'image',
          content: '',
          x_pct: 8,
          y_pct: 8,
          width_pct: 84,
          height_pct: 60,
          meta: { slot: 'photo_1' },
        },
        {
          id: 'cap1',
          type: 'text',
          content: 'Photo description',
          x_pct: 8,
          y_pct: 72,
          width_pct: 84,
          height_pct: 12,
          meta: { slot: 'caption_1' },
        },
      ],
    },
    {
      template_id: null,
      elements: [
        {
          id: 'img2',
          type: 'image',
          content: '',
          x_pct: 8,
          y_pct: 8,
          width_pct: 84,
          height_pct: 60,
          meta: { slot: 'photo_2' },
        },
        {
          id: 'cap2',
          type: 'text',
          content: 'Photo description',
          x_pct: 8,
          y_pct: 72,
          width_pct: 84,
          height_pct: 12,
          meta: { slot: 'caption_2' },
        },
      ],
    },
  ];
}

describe('fillFieldReportPhotoSlots', () => {
  it('lists empty photo slots in order', () => {
    expect(listEmptyPhotoSlots(slottedPages()).map((s) => s.index)).toEqual([1, 2]);
  });

  it('fills photo and caption slots and returns overflow', () => {
    const photos = [
      photo('a', 'file-a', 'Crack at curb'),
      photo('b', 'file-b', 'Ponding water'),
      photo('c', 'file-c', 'Extra'),
    ];
    const { pages, filledCount, overflow } = fillFieldReportPhotoSlots(slottedPages(), photos);
    expect(filledCount).toBe(2);
    expect(overflow).toHaveLength(1);
    expect(overflow[0].id).toBe('c');
    expect(pages[0].elements?.[0].content).toBe('file-a');
    expect(pages[0].elements?.[1].content).toBe('Crack at curb');
    expect(pages[1].elements?.[0].content).toBe('file-b');
    expect(pages[1].elements?.[1].content).toBe('Ponding water');
  });

  it('returns all photos as overflow when no slots', () => {
    const pages: DocumentPage[] = [{ template_id: null, elements: [] }];
    const photos = [photo('a', 'file-a', 'X')];
    const out = fillFieldReportPhotoSlots(pages, photos);
    expect(out.filledCount).toBe(0);
    expect(out.overflow).toHaveLength(1);
  });
});
