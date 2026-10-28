import { describe, expect, it } from 'vitest';
import {
  coerceOptionalServiceApproval,
  normalizeOptionalService,
  normalizeOptionalServiceStatus,
  optionalServiceVisibleInPdf,
  serializeOptionalService,
} from './optionalServiceStatus';

describe('normalizeOptionalServiceStatus', () => {
  it('preserves explicit status', () => {
    expect(normalizeOptionalServiceStatus({ status: 'approved' })).toBe('approved');
    expect(normalizeOptionalServiceStatus({ status: 'pending' })).toBe('pending');
    expect(normalizeOptionalServiceStatus({ status: 'not_approved' })).toBe('not_approved');
  });

  it('maps legacy approved:false to not_approved', () => {
    expect(normalizeOptionalServiceStatus({ approved: false })).toBe('not_approved');
  });

  it('maps legacy approved:true or absent to pending', () => {
    expect(normalizeOptionalServiceStatus({ approved: true })).toBe('pending');
    expect(normalizeOptionalServiceStatus({ service: 'X', price: 10 })).toBe('pending');
    expect(normalizeOptionalServiceStatus({})).toBe('pending');
  });
});

describe('normalizeOptionalService', () => {
  it('defaults pst/gst to false and parses price', () => {
    expect(normalizeOptionalService({ service: 'Leak', price: '1,200.50', approved: true })).toEqual({
      service: 'Leak',
      price: 1200.5,
      status: 'pending',
      pst: false,
      gst: false,
      division_id: null,
    });
  });

  it('reads pst/gst flags', () => {
    expect(normalizeOptionalService({ service: 'A', price: 1, status: 'approved', pst: true, gst: true })).toEqual({
      service: 'A',
      price: 1,
      status: 'approved',
      pst: true,
      gst: true,
      division_id: null,
    });
  });

  it('preserves division_id', () => {
    expect(
      normalizeOptionalService({
        service: 'A',
        price: 1,
        status: 'pending',
        division_id: '  div-1  ',
      }),
    ).toEqual({
      service: 'A',
      price: 1,
      status: 'pending',
      pst: false,
      gst: false,
      division_id: 'div-1',
    });
  });
});

describe('optionalServiceVisibleInPdf', () => {
  it('hides not_approved only', () => {
    expect(optionalServiceVisibleInPdf({ status: 'approved' })).toBe(true);
    expect(optionalServiceVisibleInPdf({ status: 'pending' })).toBe(true);
    expect(optionalServiceVisibleInPdf({ approved: true })).toBe(true);
    expect(optionalServiceVisibleInPdf({ status: 'not_approved' })).toBe(false);
    expect(optionalServiceVisibleInPdf({ approved: false })).toBe(false);
  });
});

describe('coerceOptionalServiceApproval', () => {
  it('accepts status strings and legacy booleans', () => {
    expect(coerceOptionalServiceApproval('pending')).toBe('pending');
    expect(coerceOptionalServiceApproval('approved')).toBe('approved');
    expect(coerceOptionalServiceApproval('not_approved')).toBe('not_approved');
    expect(coerceOptionalServiceApproval(true)).toBe('approved');
    expect(coerceOptionalServiceApproval(false)).toBe('not_approved');
    expect(coerceOptionalServiceApproval(null)).toBe('pending');
  });
});

describe('serializeOptionalService', () => {
  it('writes canonical shape', () => {
    expect(
      serializeOptionalService({
        service: 'S',
        price: 9,
        status: 'approved',
        pst: true,
        gst: false,
        division_id: 'div-9',
      }),
    ).toEqual({
      service: 'S',
      price: 9,
      status: 'approved',
      pst: true,
      gst: false,
      division_id: 'div-9',
    });
  });
});
