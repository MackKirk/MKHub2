import { type ReactNode, useMemo } from 'react';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function formatYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatYmdHeading(ymd: string): string {
  const parts = ymd.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd;
  const dt = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return ymd;
  try {
    return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return ymd;
  }
}

export type DayBadgeTone = 'booked' | 'neutral' | 'draft';

export type DirectorMeetingMonthCalendarDayProps = {
  disabled: boolean;
  /** Omit or 0 to hide badge */
  badge?: number;
  badgeTone: DayBadgeTone;
};

type Props = {
  compact?: boolean;
  visibleMonth: Date;
  onVisibleMonthChange: (firstOfMonth: Date) => void;
  selectedYmd: string | null;
  onSelectYmd: (ymd: string) => void;
  getDayProps: (ymd: string, dayDate: Date) => DirectorMeetingMonthCalendarDayProps;
  /** Tooltip on day cells (e.g. booking stats). */
  getDayTitle?: (ymd: string, dayDate: Date) => string | undefined;
  footerNote?: ReactNode;
};

export default function DirectorMeetingMonthCalendar({
  compact = true,
  visibleMonth,
  onVisibleMonthChange,
  selectedYmd,
  onSelectYmd,
  getDayProps,
  getDayTitle,
  footerNote,
}: Props) {
  const cells = useMemo(() => {
    const y = visibleMonth.getFullYear();
    const mo = visibleMonth.getMonth();
    const firstDay = new Date(y, mo, 1);
    const lastDay = new Date(y, mo + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startPad = firstDay.getDay();
    const out: ({ date: Date; ymd: string } | null)[] = [];
    for (let i = 0; i < startPad; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, mo, d);
      out.push({ date, ymd: formatYMD(date) });
    }
    return out;
  }, [visibleMonth]);

  const calWrap = compact ? 'w-full max-w-[26rem] sm:max-w-[34rem] mx-auto' : 'max-w-lg mx-auto';
  const cellAspect = compact ? 'aspect-[5/3] min-h-[2.6rem]' : 'aspect-[5/3] min-h-[3rem]';
  const dayNumCls = compact ? 'text-sm tabular-nums leading-none' : 'text-base tabular-nums leading-none';
  const dayHead = compact ? 'text-[10px] py-1' : 'text-[10px] py-1.5';
  const navBtn = compact ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-xs';
  const monthTitle = 'text-sm';
  const badgeCls = compact ? 'h-6 min-w-[1.25rem] px-1 text-[10px]' : 'h-7 min-w-[1.5rem] px-1 text-xs';
  const gridGap = 'gap-1.5';
  const cellRound = 'rounded-xl';

  const badgeToneClass = (tone: DayBadgeTone) => {
    if (tone === 'booked') return 'bg-brand-red text-white shadow-sm';
    if (tone === 'draft') return 'bg-slate-700 text-white shadow-sm';
    return 'border border-slate-300 bg-white text-slate-600';
  };

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/50 p-4 ${calWrap}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className={`font-semibold text-slate-900 capitalize ${monthTitle}`}>
          {visibleMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onVisibleMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
            className={`rounded-md border border-slate-200 bg-white font-medium text-slate-600 hover:bg-slate-50 ${navBtn}`}
            aria-label="Previous month"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => {
              const t = new Date();
              onVisibleMonthChange(new Date(t.getFullYear(), t.getMonth(), 1));
            }}
            className={`rounded-md border border-slate-200 bg-white font-medium text-slate-600 hover:bg-slate-50 ${navBtn}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onVisibleMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
            className={`rounded-md border border-slate-200 bg-white font-medium text-slate-600 hover:bg-slate-50 ${navBtn}`}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>
      <div className={`grid grid-cols-7 ${gridGap}`}>
        {(compact ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).map(
          (d, i) => (
            <div
              key={`${d}-${i}`}
              className={`text-center font-semibold uppercase tracking-wide text-slate-500 ${dayHead}`}
            >
              {d}
            </div>
          )
        )}
        {cells.map((cell, index) => {
          if (!cell) return <div key={`pad-${index}`} className={`${cellAspect} ${cellRound}`} />;
          const meta = getDayProps(cell.ymd, cell.date);
          /** Show count when >0, or 0 when day has slots but none left (booked tone). */
          const showBadge =
            !meta.disabled &&
            meta.badge != null &&
            (meta.badge > 0 || meta.badgeTone === 'booked');
          const isSelected = selectedYmd === cell.ymd;
          const todayRef = new Date();
          const isTodayCell =
            cell.date.getFullYear() === todayRef.getFullYear() &&
            cell.date.getMonth() === todayRef.getMonth() &&
            cell.date.getDate() === todayRef.getDate();
          return (
            <button
              key={cell.ymd}
              type="button"
              disabled={meta.disabled}
              onClick={() => onSelectYmd(cell.ymd)}
              title={
                meta.disabled
                  ? undefined
                  : getDayTitle?.(cell.ymd, cell.date) ?? undefined
              }
              className={`${cellAspect} ${cellRound} border relative flex w-full min-w-0 flex-col overflow-hidden text-left transition-colors ${
                meta.disabled
                  ? 'cursor-not-allowed border-slate-100 bg-slate-50/50 text-slate-300'
                  : 'cursor-pointer border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
              } ${
                isSelected && !meta.disabled ? 'ring-2 ring-brand-red border-brand-red/50 bg-red-50/50 shadow-sm' : ''
              } ${isTodayCell && !meta.disabled && !isSelected ? 'ring-1 ring-slate-300' : ''}`}
            >
              <span
                className={`self-start pl-1.5 pt-1 ${dayNumCls} ${isTodayCell ? 'font-semibold text-slate-900' : ''}`}
              >
                {cell.date.getDate()}
              </span>
              <div className="flex min-h-0 flex-1 items-center justify-center px-0.5 pb-1">
                {showBadge ? (
                  <span
                    className={`inline-flex items-center justify-center rounded-full font-bold leading-none ${badgeCls} ${badgeToneClass(
                      meta.badgeTone
                    )}`}
                  >
                    {meta.badge}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      {footerNote ? (
        <div className="text-slate-500 leading-relaxed mt-3 text-[11px]">{footerNote}</div>
      ) : null}
    </div>
  );
}
