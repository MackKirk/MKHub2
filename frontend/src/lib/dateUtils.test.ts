import { describe, expect, it } from 'vitest';
import { attendanceWorkDate } from './dateUtils';

describe('attendanceWorkDate', () => {
  it('keeps the stamped calendar day for hours-worked UTC midnight', () => {
    // America/Vancouver would otherwise shift 2026-09-09T00:00:00Z to Sep 8.
    expect(attendanceWorkDate('2026-09-09T00:00:00Z', true)).toBe('2026-09-09');
    expect(attendanceWorkDate('2026-09-09T00:00:00.000Z', true)).toBe('2026-09-09');
  });

  it('uses local date for real clock times', () => {
    expect(attendanceWorkDate('2026-09-09T15:00:00.000Z', false)).toBe(
      attendanceWorkDate('2026-09-09T15:00:00.000Z', true),
    );
  });

  it('uses local date for hours-worked stored as local midnight in UTC', () => {
    const iso = '2026-09-09T07:00:00.000Z';
    expect(attendanceWorkDate(iso, true)).toBe(attendanceWorkDate(iso, false));
  });
});
