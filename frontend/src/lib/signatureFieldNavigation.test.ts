import { describe, expect, it } from 'vitest';
import {
  fieldHasValue,
  getNextUnfilledFieldId,
  getUnfilledFields,
  sortFieldsForNavigation,
  type SignatureTemplateField,
} from './signatureFieldNavigation';

const base = (overrides: Partial<SignatureTemplateField> & { id: string }): SignatureTemplateField => ({
  type: 'text',
  page_index: 0,
  rect: { x: 10, y: 700, width: 100, height: 20 },
  field_name: 'Field',
  required: true,
  assignee: 'employee',
  ...overrides,
});

describe('signatureFieldNavigation', () => {
  it('sortFieldsForNavigation orders by page then top-to-bottom', () => {
    const fields = [
      base({ id: 'b', page_index: 0, rect: { x: 10, y: 500, width: 100, height: 20 } }),
      base({ id: 'a', page_index: 0, rect: { x: 10, y: 700, width: 100, height: 20 } }),
      base({ id: 'c', page_index: 1, rect: { x: 10, y: 700, width: 100, height: 20 } }),
    ];
    expect(sortFieldsForNavigation(fields).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('fieldHasValue treats unchecked checkbox as empty', () => {
    const f = base({ id: 'cb', type: 'checkbox' });
    expect(fieldHasValue(f, { cb: false })).toBe(false);
    expect(fieldHasValue(f, { cb: true })).toBe(true);
  });

  it('getUnfilledFields excludes filled fields', () => {
    const fields = [
      base({ id: 'a' }),
      base({ id: 'b', required: false }),
    ];
    const values = { a: 'done' };
    expect(getUnfilledFields(fields, values).map((f) => f.id)).toEqual(['b']);
  });

  it('getNextUnfilledFieldId loops through unfilled fields', () => {
    const fields = [
      base({ id: 'a' }),
      base({ id: 'b', page_index: 0, rect: { x: 10, y: 500, width: 100, height: 20 } }),
    ];
    const values: Record<string, string | boolean> = {};
    expect(getNextUnfilledFieldId(fields, values, null)).toBe('a');
    expect(getNextUnfilledFieldId(fields, values, 'a')).toBe('b');
    expect(getNextUnfilledFieldId(fields, values, 'b')).toBe('a');
  });

  it('getNextUnfilledFieldId returns null when all complete', () => {
    const fields = [base({ id: 'a' })];
    expect(getNextUnfilledFieldId(fields, { a: 'x' }, 'a')).toBe(null);
  });
});
