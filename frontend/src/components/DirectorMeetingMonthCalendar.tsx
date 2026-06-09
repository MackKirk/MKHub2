import { type ReactNode, useMemo } from 'react';
import {
  AppButton,
  AppCalendarBase,
  type AppCalendarDay,
  type AppCalendarDayBadgeTone,
  uiCx,
  uiTypography,
} from '@/components/ui';

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

const BADGE_TONE_MAP: Record<DayBadgeTone, AppCalendarDayBadgeTone> = {
  booked: 'accent',
  draft: 'emphasis',
  neutral: 'neutral',
};

function isTodayDate(date: Date) {
  const todayRef = new Date();
  return (
    date.getFullYear() === todayRef.getFullYear() &&
    date.getMonth() === todayRef.getMonth() &&
    date.getDate() === todayRef.getDate()
  );
}

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

  const days: AppCalendarDay[] = useMemo(
    () =>
      cells.map((cell) => {
        if (!cell) return { dateLabel: '', isMuted: true };
        const meta = getDayProps(cell.ymd, cell.date);
        const showBadge =
          !meta.disabled && meta.badge != null && (meta.badge > 0 || meta.badgeTone === 'booked');
        const isSelected = selectedYmd === cell.ymd;
        const isTodayCell = isTodayDate(cell.date);
        return {
          dateLabel: String(cell.date.getDate()),
          isMuted: meta.disabled,
          isToday: isTodayCell && !meta.disabled,
          isSelected: isSelected && !meta.disabled,
          badge: showBadge ? meta.badge : undefined,
          badgeTone: showBadge ? BADGE_TONE_MAP[meta.badgeTone] : undefined,
          onClick: meta.disabled ? undefined : () => onSelectYmd(cell.ymd),
          title: meta.disabled ? undefined : getDayTitle?.(cell.ymd, cell.date),
        };
      }),
    [cells, getDayProps, getDayTitle, onSelectYmd, selectedYmd],
  );

  const monthLabel = visibleMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const weekDayLabels = compact
    ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <AppCalendarBase
        className="h-full min-h-0 w-full"
        compact={compact}
        compactCellProfile="flat"
        monthLabel={monthLabel}
        weekDayLabels={weekDayLabels}
        days={days}
        onPrevious={() => onVisibleMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
        onNext={() => onVisibleMonthChange(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
        headerExtra={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const t = new Date();
              onVisibleMonthChange(new Date(t.getFullYear(), t.getMonth(), 1));
            }}
            className={compact ? 'h-6 min-h-0 px-1.5 text-[10px]' : undefined}
          >
            Today
          </AppButton>
        }
        footer={footerNote ? <div className={uiCx(uiTypography.helper, 'text-[11px]')}>{footerNote}</div> : undefined}
    />
  );
}
