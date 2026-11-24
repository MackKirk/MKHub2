import { describe, expect, it } from 'vitest';
import type { DocumentPage } from '@/types/documentCreator';
import {
  buildFilledFieldReportPages,
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

  it('replaces caption content, clears richLines, keeps run font (not element bold default), uses cover', () => {
    const pages: DocumentPage[] = [
      {
        template_id: null,
        elements: [
          {
            id: 'img1',
            type: 'image',
            content: '',
            x_pct: 8,
            y_pct: 8,
            width_pct: 40,
            height_pct: 30,
            meta: { slot: 'photo_1' },
            imageFit: 'contain',
          },
          {
            id: 'cap1',
            type: 'text',
            content: 'Template placeholder',
            x_pct: 8,
            y_pct: 40,
            width_pct: 40,
            height_pct: 10,
            meta: { slot: 'caption_1' },
            fontWeight: 'bold',
            fontSize: 12,
            richLines: [[{ text: 'Template placeholder', bold: false, fontSize: 11, color: '#787878' }]],
          },
        ],
      },
    ];
    const { pages: out } = fillFieldReportPhotoSlots(pages, [
      photo('a', 'file-a', 'Real field phrase'),
    ]);
    const img = out[0].elements?.[0];
    const cap = out[0].elements?.[1];
    expect(img?.imageFit).toBe('cover');
    expect(cap?.content).toBe('Real field phrase');
    expect(cap?.richLines).toBeUndefined();
    expect(cap?.fontWeight).toBe('normal');
    expect(cap?.fontSize).toBe(11);
    expect(cap?.color).toBe('#787878');
  });

  it('preserves caption typography through clone then fill (template insert path)', () => {
    const layout: DocumentPage = {
      template_id: null,
      elements: [
        {
          id: 'img1',
          type: 'image',
          content: '',
          x_pct: 8,
          y_pct: 8,
          width_pct: 40,
          height_pct: 30,
          meta: { slot: 'photo_1' },
        },
        {
          id: 'cap1',
          type: 'text',
          content: 'Placeholder',
          x_pct: 8,
          y_pct: 40,
          width_pct: 40,
          height_pct: 10,
          meta: { slot: 'caption_1' },
          fontWeight: 'bold',
          fontFamily: 'Open Sans',
          richLines: [
            [{ text: 'Placeholder', bold: false, fontSize: 10, fontFamily: 'Open Sans', color: '#555555' }],
          ],
        },
      ],
    };
    const { pages } = buildFilledFieldReportPages([layout], [photo('a', 'file-a', 'Phrase A')]);
    const cap = pages[0].elements?.find((e) => e.meta?.slot === 'caption_1');
    const img = pages[0].elements?.find((e) => e.meta?.slot === 'photo_1');
    expect(cap?.content).toBe('Phrase A');
    expect(cap?.fontWeight).toBe('normal');
    expect(cap?.fontSize).toBe(10);
    expect(cap?.fontFamily).toBe('Open Sans');
    expect(cap?.color).toBe('#555555');
    expect(img?.imageFit).toBe('cover');
  });

  it('returns all photos as overflow when no slots', () => {
    const pages: DocumentPage[] = [{ template_id: null, elements: [] }];
    const photos = [photo('a', 'file-a', 'X')];
    const out = fillFieldReportPhotoSlots(pages, photos);
    expect(out.filledCount).toBe(0);
    expect(out.overflow).toHaveLength(1);
  });

  it('clones layout pages to fit more photos than slots (6+2)', () => {
    const layout: DocumentPage = {
      template_id: null,
      elements: [1, 2, 3, 4, 5, 6].flatMap((n) => [
        {
          id: `img${n}`,
          type: 'image' as const,
          content: '',
          x_pct: 8,
          y_pct: 8,
          width_pct: 40,
          height_pct: 20,
          meta: { slot: `photo_${n}` },
        },
        {
          id: `cap${n}`,
          type: 'text' as const,
          content: '',
          x_pct: 8,
          y_pct: 30,
          width_pct: 40,
          height_pct: 8,
          fontSize: 14,
          meta: { slot: `caption_${n}` },
        },
      ]),
    };
    const photos = Array.from({ length: 8 }, (_, i) =>
      photo(`p${i}`, `file-${i}`, `Phrase ${i + 1}`)
    );
    const { pages, filledCount, overflow } = buildFilledFieldReportPages([layout], photos);
    expect(pages).toHaveLength(2);
    expect(filledCount).toBe(8);
    expect(overflow).toHaveLength(0);
    expect(pages[0].elements?.find((e) => e.meta?.slot === 'photo_1')?.content).toBe('file-0');
    expect(pages[1].elements?.find((e) => e.meta?.slot === 'photo_1')?.content).toBe('file-6');
    expect(pages[1].elements?.find((e) => e.meta?.slot === 'photo_2')?.content).toBe('file-7');
    expect(pages[1].elements?.find((e) => e.meta?.slot === 'caption_2')?.content).toBe('Phrase 8');
    expect(pages[1].elements?.find((e) => e.meta?.slot === 'caption_2')?.fontSize).toBe(14);
  });
});
