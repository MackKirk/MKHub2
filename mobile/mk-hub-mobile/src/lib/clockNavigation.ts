let pending: { date: string; openLog: boolean } | null = null;

export function requestClockLog(date: string): void {
  pending = { date, openLog: true };
}

export function consumeClockLogRequest(): { date: string; openLog: boolean } | null {
  const next = pending;
  pending = null;
  return next;
}
