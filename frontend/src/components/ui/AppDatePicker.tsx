import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Calendar, CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import {
  addMonths,
  buildMonthGrid,
  formatDateDisplay,
  formatDatePickerCardOverline,
  formatDatePickerCardValue,
  isIsoInRange,
  parseIsoDate,
  startOfMonth,
  toIsoDateLocal,
} from './datePickerUtils';
import { uiCx, uiDatePicker, uiDropdown, uiTypography } from './tokens';
import { useComboboxDropdown } from './useComboboxDropdown';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DATE_PICKER_PANEL_WIDTH = 280;

type PanelView = 'days' | 'monthYear';

export type AppDatePickerTriggerVariant = 'default' | 'card';

export type AppDatePickerProps = {
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  min?: string;
  max?: string;
  /** `default` — form field with text + calendar icon. `card` — Clock In/Out style tile (overline + long date). */
  triggerVariant?: AppDatePickerTriggerVariant;
  /** Extra classes on the trigger control (e.g. `w-[220px]` for card in card headers). */
  triggerClassName?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
    value?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  };

function fireDateChange(onChange: AppDatePickerProps['onChange'], name: string | undefined, value: string) {
  if (!onChange) return;
  const synthetic = {
    target: { value, name: name ?? '' },
    currentTarget: { value, name: name ?? '' },
  } as ChangeEvent<HTMLInputElement>;
  onChange(synthetic);
}

function yearBounds(min?: string, max?: string) {
  const now = new Date().getFullYear();
  let yMin = now - 100;
  let yMax = now + 20;
  if (min) {
    const p = parseIsoDate(min);
    if (p) yMin = p.getFullYear();
  }
  if (max) {
    const p = parseIsoDate(max);
    if (p) yMax = p.getFullYear();
  }
  return { yMin, yMax };
}

export function AppDatePicker({
  label,
  fieldHint,
  helperText,
  placeholder = 'yyyy-mm-dd',
  value = '',
  onChange,
  disabled,
  required,
  name,
  id,
  min,
  max,
  className,
  triggerVariant = 'default',
  triggerClassName,
  'aria-label': ariaLabel,
}: AppDatePickerProps) {
  const isCardTrigger = triggerVariant === 'card';
  const [open, setOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('days');
  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen, {
    menuWidth: DATE_PICKER_PANEL_WIDTH,
    menuAlign: isCardTrigger ? 'end' : 'start',
  });

  const yearListRef = useRef<HTMLDivElement>(null);
  const selectedYearRef = useRef<HTMLButtonElement>(null);

  const parsed = value ? parseIsoDate(value) : null;
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(parsed ?? new Date()));

  const todayIso = useMemo(() => toIsoDateLocal(new Date()), []);
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const { yMin, yMax } = useMemo(() => yearBounds(min, max), [min, max]);
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = yMin; y <= yMax; y++) list.push(y);
    return list;
  }, [yMin, yMax]);
  const viewYear = viewMonth.getFullYear();
  const activeMonthIndex = viewMonth.getMonth();
  useEffect(() => {
    if (parsed) setViewMonth(startOfMonth(parsed));
  }, [parsed]);

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

  const display = value ? formatDateDisplay(value) : '';
  const cardOverline = value ? formatDatePickerCardOverline(value, todayIso) : '';
  const cardValue = value ? formatDatePickerCardValue(value) : placeholder;

  const pickDate = (iso: string) => {
    if (!isIsoInRange(iso, min, max)) return;
    fireDateChange(onChange, name, iso);
    closeDropdown();
  };

  const setYear = (year: number) => {
    const clamped = Math.min(yMax, Math.max(yMin, year));
    setViewMonth(new Date(clamped, viewMonth.getMonth(), 1, 12, 0, 0, 0));
  };

  const selectMonth = (monthIndex: number) => {
    setViewMonth(new Date(viewYear, monthIndex, 1, 12, 0, 0, 0));
    setPanelView('days');
  };

  const panel =
    open && menuRect ? (
      <div
        id={portalListId}
        role="dialog"
        aria-label="Choose date"
        className={uiCx(uiDatePicker.panel, 'w-[280px]')}
        style={{ top: menuRect.top, left: menuRect.left }}
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
              className={uiCx('h-4 w-4 shrink-0 text-gray-500 transition-transform', panelView === 'monthYear' && 'rotate-180')}
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
              <div ref={yearListRef} className={uiCx(uiDatePicker.yearList, 'mt-1.5')}>
                <div className={uiDatePicker.yearGrid}>
                  {years.map((y) => (
                    <button
                      key={y}
                      ref={y === viewYear ? selectedYearRef : undefined}
                      type="button"
                      onClick={() => setYear(y)}
                      className={uiCx(
                        uiDatePicker.yearCell,
                        y === viewYear && uiDatePicker.yearCellActive,
                      )}
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
                    onClick={() => selectMonth(monthIndex)}
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
                const isSelected = value === cell.iso;
                const isToday = cell.iso === todayIso;
                const isDisabled = !isIsoInRange(cell.iso, min, max);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => pickDate(cell.iso)}
                    className={uiCx(
                      uiDatePicker.day,
                      !cell.inMonth && uiDatePicker.dayOutside,
                      isToday && uiDatePicker.dayToday,
                      isSelected && uiDatePicker.daySelected,
                      isDisabled && 'cursor-not-allowed opacity-40',
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
          <button
            type="button"
            className={uiDatePicker.footerAction}
            onClick={() => {
              fireDateChange(onChange, name, '');
              closeDropdown();
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className={uiDatePicker.footerAction}
            onClick={() => {
              if (panelView === 'monthYear') {
                setViewMonth(startOfMonth(new Date()));
                setPanelView('days');
              } else {
                pickDate(todayIso);
              }
            }}
            disabled={panelView === 'days' && !isIsoInRange(todayIso, min, max)}
          >
            Today
          </button>
        </div>
      </div>
    ) : null;

  const triggerButton = (
    <button
      id={id}
      type="button"
      disabled={disabled}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={open ? portalListId : undefined}
      aria-label={isCardTrigger && !label ? ariaLabel ?? 'Select date' : undefined}
      className={uiCx(
        isCardTrigger
          ? uiCx(
              uiDatePicker.triggerCard,
              open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
              triggerClassName,
            )
          : uiCx(
              uiDropdown.trigger,
              'flex w-full items-center justify-between gap-2 pr-9 text-left',
              !display && 'text-gray-400',
              open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
              triggerClassName,
            ),
      )}
      onClick={() => {
        if (!disabled) setOpen((o) => !o);
      }}
    >
      {isCardTrigger ? (
        <>
          <div className={uiDatePicker.triggerCardIcon}>
            <CalendarDays className="h-4 w-4 text-gray-500" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className={uiCx(uiTypography.overline, 'leading-tight')}>{cardOverline}</div>
            <div
              className={uiCx(
                uiTypography.sectionTitle,
                'truncate leading-tight',
                !value && 'font-normal text-gray-400',
              )}
            >
              {cardValue}
            </div>
          </div>
        </>
      ) : (
        <span className="min-w-0 truncate">{display || placeholder}</span>
      )}
    </button>
  );

  return (
    <div className={uiCx('block space-y-1.5', isCardTrigger && label == null && helperText == null && '!space-y-0', className)}>
      {label ? (
        <AppControlLabelRow label={label} fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined} />
      ) : null}
      {name ? <input type="hidden" name={name} value={value} required={required} min={min} max={max} /> : null}
      <div ref={anchorRef} className="relative">
        {triggerButton}
        {!isCardTrigger ? <Calendar className={uiDatePicker.triggerIcon} aria-hidden /> : null}
      </div>
      {helperText ? <span className={uiTypography.helper}>{helperText}</span> : null}
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
