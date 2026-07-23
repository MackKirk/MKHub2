import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addMonths,
  buildMonthGrid,
  comboboxMenuStyle,
  startOfMonth,
  toIsoDateLocal,
  uiCx,
  uiDatePicker,
  uiTypography,
  useComboboxDropdown,
} from '@/components/ui';

const PANEL_WIDTH = 280;
const PANEL_MAX_HEIGHT = 360;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

type PanelView = 'days' | 'monthYear';

/**
 * AppShell “Today” control — opens the design-system calendar panel (same shell as AppDatePicker).
 * Browse months/years like the Windows clock calendar; Today jumps to the current day.
 */
export default function HubTodayCalendar() {
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-CA', {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );
  const todayIso = useMemo(() => toIsoDateLocal(new Date()), []);

  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('days');
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedIso, setSelectedIso] = useState(todayIso);

  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen, {
    menuWidth: PANEL_WIDTH,
    menuAlign: 'end',
    preferredMaxHeight: PANEL_MAX_HEIGHT,
  });

  const selectedYearRef = useRef<HTMLButtonElement>(null);
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const viewYear = viewMonth.getFullYear();
  const activeMonthIndex = viewMonth.getMonth();

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const list: number[] = [];
    for (let y = now - 20; y <= now + 20; y++) list.push(y);
    return list;
  }, []);

  useEffect(() => {
    if (!open) setPanelView('days');
  }, [open]);

  useEffect(() => {
    if (!open || panelView !== 'monthYear') return;
    const rid = window.requestAnimationFrame(() => {
      selectedYearRef.current?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(rid);
  }, [open, panelView, viewYear]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDropdown();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeDropdown]);

  const goToday = () => {
    const now = new Date();
    setViewMonth(startOfMonth(now));
    setSelectedIso(todayIso);
    setPanelView('days');
  };

  const panel =
    open && menuRect ? (
      <div
        id={portalListId}
        role="dialog"
        aria-label="Calendar"
        className={uiCx(uiDatePicker.panel, 'w-[280px]')}
        style={comboboxMenuStyle(menuRect)}
      >
        <div className={uiDatePicker.panelHeader}>
          <button
            type="button"
            className={uiDatePicker.monthYearTrigger}
            aria-expanded={panelView === 'monthYear'}
            onClick={() => setPanelView((v) => (v === 'days' ? 'monthYear' : 'days'))}
          >
            <span className={uiTypography.sectionTitle}>{monthLabel}</span>
            <ChevronDown
              className={uiCx(
                'h-4 w-4 shrink-0 text-gray-500 transition-transform',
                panelView === 'monthYear' && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
          {panelView === 'days' ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={uiDatePicker.navButton}
                aria-label="Previous month"
                onClick={() => setViewMonth((m) => addMonths(m, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={uiDatePicker.navButton}
                aria-label="Next month"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>

        {panelView === 'monthYear' ? (
          <>
            <div className={uiDatePicker.yearSection}>
              <div className={uiTypography.overline}>Year</div>
              <div className={uiCx(uiDatePicker.yearList, 'mt-1.5')}>
                <div className={uiDatePicker.yearGrid}>
                  {years.map((y) => (
                    <button
                      key={y}
                      ref={y === viewYear ? selectedYearRef : undefined}
                      type="button"
                      onClick={() => setViewMonth(new Date(y, viewMonth.getMonth(), 1, 12, 0, 0, 0))}
                      className={uiCx(uiDatePicker.yearCell, y === viewYear && uiDatePicker.yearCellActive)}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={uiDatePicker.monthSection}>
              <div className={uiTypography.overline}>Month</div>
              <div className={uiDatePicker.monthGrid}>
                {MONTH_SHORT.map((label, monthIndex) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setViewMonth(new Date(viewYear, monthIndex, 1, 12, 0, 0, 0));
                      setPanelView('days');
                    }}
                    className={uiCx(
                      uiDatePicker.monthCell,
                      monthIndex === activeMonthIndex && uiDatePicker.monthCellActive,
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={uiDatePicker.weekHeader}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <span key={d} className={uiDatePicker.weekday}>
                  {d}
                </span>
              ))}
            </div>
            <div className={uiDatePicker.grid}>
              {cells.map((cell) => {
                const isSelected = selectedIso === cell.iso;
                const isToday = cell.iso === todayIso;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedIso(cell.iso)}
                    className={uiCx(
                      uiDatePicker.day,
                      !cell.inMonth && uiDatePicker.dayOutside,
                      isToday && uiDatePicker.dayToday,
                      isSelected && uiDatePicker.daySelected,
                    )}
                  >
                    {cell.date.getDate()}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className={uiDatePicker.footer}>
          <span className="text-[10px] text-gray-400" aria-hidden />
          <button type="button" className={uiDatePicker.footerAction} onClick={goToday}>
            Today
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className="relative hidden shrink-0 sm:block" ref={anchorRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? portalListId : undefined}
        aria-label={`Calendar, ${todayLabel}`}
        title="Open calendar"
        onClick={() => setOpen((v) => !v)}
        className={uiCx(
          'rounded-lg px-2 py-1 text-right transition-colors',
          'hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/45 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900',
          open && 'bg-white/10',
        )}
      >
        <div className="text-[10px] font-medium uppercase tracking-wide text-white/55">Today</div>
        <div className="mt-0.5 text-xs font-semibold text-white/90 whitespace-nowrap">{todayLabel}</div>
      </button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
