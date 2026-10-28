import { describe, expect, it } from 'vitest';
import { applyUniformTextAlign, effectiveLineTextAligns, lineAlignAt } from './documentTextAlign';
import type { DocElement } from '@/types/documentCreator';

function textEl(partial: Partial<DocElement>): DocElement {
  return {
    id: 't1',
    type: 'text',
    x_pct: 0,
    y_pct: 0,
    width_pct: 0.4,
    height_pct: 0.1,
    content: 'Hello',
    ...partial,
  };
}

describe('documentTextAlign', () => {
  it('drops stale all-right lineTextAligns when textAlign is left and there is no rich text', () => {
    const el = textEl({
      textAlign: 'left',
      lineTextAligns: ['right', 'right'],
    });
    expect(effectiveLineTextAligns(el)).toBeUndefined();
    expect(lineAlignAt(el, 0)).toBe('left');
  });

  it('keeps mixed per-line aligns', () => {
    const el = textEl({
      textAlign: 'left',
      lineTextAligns: ['left', 'right'],
    });
    expect(effectiveLineTextAligns(el)).toEqual(['left', 'right']);
    expect(lineAlignAt(el, 1)).toBe('right');
  });

  it('keeps all-right when richLines are present', () => {
    const el = textEl({
      textAlign: 'left',
      lineTextAligns: ['right'],
      richLines: [[{ text: 'Hello', bold: true }]],
    });
    expect(effectiveLineTextAligns(el)).toEqual(['right']);
  });

  it('applyUniformTextAlign rewrites existing lineTextAligns', () => {
    const next = applyUniformTextAlign(
      textEl({ textAlign: 'left', lineTextAligns: ['right', 'right'] }),
      'left',
    );
    expect(next.textAlign).toBe('left');
    expect(next.lineTextAligns).toEqual(['left', 'left']);
  });
});
