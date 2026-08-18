import { describe, expect, it } from 'vitest';
import { lockSecondsForFailures, parseRetryAfterSeconds } from '@/lib/loginThrottle';

describe('lockSecondsForFailures', () => {
  it('locks after 3, 6, and 10 consecutive failures', () => {
    expect(lockSecondsForFailures(0)).toBe(0);
    expect(lockSecondsForFailures(2)).toBe(0);
    expect(lockSecondsForFailures(3)).toBe(10);
    expect(lockSecondsForFailures(5)).toBe(10);
    expect(lockSecondsForFailures(6)).toBe(30);
    expect(lockSecondsForFailures(10)).toBe(60);
  });
});

describe('parseRetryAfterSeconds', () => {
  it('reads the server cooldown from the 429 message', () => {
    expect(parseRetryAfterSeconds('Too many login attempts. Try again in 10 seconds.')).toBe(10);
    expect(parseRetryAfterSeconds('Incorrect username or password.')).toBeNull();
  });
});
