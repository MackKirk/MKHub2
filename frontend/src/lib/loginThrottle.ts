/** Mirrors server lock steps so the UI can cool down without waiting for 429. */
export const LOGIN_LOCK_STEPS: ReadonlyArray<{ failures: number; seconds: number }> = [
  { failures: 3, seconds: 10 },
  { failures: 6, seconds: 30 },
  { failures: 10, seconds: 60 },
];

export const LOGIN_TOAST_ID = 'login-error';

export function lockSecondsForFailures(consecutiveFailures: number): number {
  let seconds = 0;
  for (const step of LOGIN_LOCK_STEPS) {
    if (consecutiveFailures >= step.failures) seconds = step.seconds;
  }
  return seconds;
}

export function parseRetryAfterSeconds(message: string): number | null {
  const match = String(message || '').match(/try again in (\d+) seconds/i);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
