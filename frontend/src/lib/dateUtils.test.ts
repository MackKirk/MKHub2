import { describe, expect, it } from 'vitest';
import {
  attendanceWorkDate,
  formatDateTimeVancouver,
  formatDateTimeVancouverFriendly,
  formatDateVancouver,
  formatTimeVancouver,
  parseUtcTimestamp,
} from './dateUtils';

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

describe('Vancouver instant formatters', () => {
  // 2026-11-06 15:28:00 UTC = 7:28 AM PST (after DST ended Nov 1, 2026)
  const pstInstant = '2026-11-06T15:28:00.000Z';
  // 2026-07-06 14:28:00 UTC = 7:28 AM PDT
  const pdtInstant = '2026-07-06T14:28:00.000Z';

  it('parseUtcTimestamp treats bare ISO as UTC', () => {
    expect(parseUtcTimestamp('2026-11-06T15:28:00').getTime()).toBe(
      parseUtcTimestamp('2026-11-06T15:28:00Z').getTime(),
    );
  });

  it('formatDateTimeVancouverFriendly is stable in PST and PDT', () => {
    expect(formatDateTimeVancouverFriendly(pstInstant)).toBe('Nov 6, 2026, 7:28 AM');
    expect(formatDateTimeVancouverFriendly(pdtInstant)).toBe('Jul 6, 2026, 7:28 AM');
  });

  it('formatDateTimeVancouver returns en-CA short/medium Pacific', () => {
    const out = formatDateTimeVancouver(pstInstant);
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/7:28/);
  });

  it('formatDateVancouver and formatTimeVancouver split date/time', () => {
    expect(formatDateVancouver(pstInstant)).toMatch(/Nov|2026-11|06/);
    expect(formatTimeVancouver(pstInstant)).toMatch(/7:28/);
  });

  it('returns empty placeholders for missing values', () => {
    expect(formatDateTimeVancouver(null)).toBe('—');
    expect(formatDateTimeVancouverFriendly(undefined)).toBe('');
  });
});
