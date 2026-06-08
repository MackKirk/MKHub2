import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { AppControlLabelRow } from './AppControlLabel';
import { AppFieldHint } from './AppFieldHint';
import { AppSelect } from './AppSelect';
import {
  TIME_AM_PM_OPTIONS,
  TIME_HOUR_12_OPTIONS,
  TIME_MINUTE_OPTIONS,
  buildHhmm,
  formatTimeDisplay,
  parseHhmm,
  type TimeAmPm,
} from '@/lib/timePickerUtils';
import { uiCx, uiDatePicker, uiDropdown, uiTypography } from './tokens';
import { useComboboxDropdown } from './useComboboxDropdown';

const TIME_PICKER_PANEL_WIDTH = 280;

/**
 * Encapsulated time field — same trigger shell as {@link AppDatePicker} (clock icon, portaled panel).
 *
 * **Use for:** session start/end, training times, any form that needs Hour + Min + AM/PM.
 * **Value:** `HH:mm` (24-hour), same as `onChange` from a native time input.
 * **Display:** trigger shows 12-hour label (e.g. `9:30 AM`).
 *
 * **Do not** use `input type="time"` or three separate `AppSelect` rows for hour/min/AM·PM in product forms.
 * AM/PM menu lists only **AM** and **PM** (no placeholder row).
 */
export type AppTimePickerProps = {
  label?: ReactNode;
  fieldHint?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  className?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
};

function fireTimeChange(onChange: AppTimePickerProps['onChange'], name: string | undefined, value: string) {
  if (!onChange) return;
  const synthetic = {
    target: { value, name: name ?? '' },
    currentTarget: { value, name: name ?? '' },
  } as ChangeEvent<HTMLInputElement>;
  onChange(synthetic);
}

export function AppTimePicker({
  label,
  fieldHint,
  helperText,
  placeholder = 'Select time',
  className,
  value = '',
  onChange,
  disabled,
  required,
  name,
  id,
}: AppTimePickerProps) {
  const [open, setOpen] = useState(false);
  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(open, setOpen, {
    menuWidth: TIME_PICKER_PANEL_WIDTH,
    shouldIgnoreClose: (target) =>
      target instanceof Element && target.closest('[role="listbox"]') != null,
  });

  const parsed = parseHhmm(value);
  const [hour12, setHour12] = useState(parsed.hour12);
  const [minute, setMinute] = useState(parsed.minute);
  const [amPm, setAmPm] = useState<TimeAmPm | ''>(parsed.amPm);

  /** AM/PM has no empty placeholder row — default display in panel is AM until user picks PM. */
  const panelAmPm: TimeAmPm = amPm || 'AM';

  useEffect(() => {
    const next = parseHhmm(value);
    setHour12(next.hour12);
    setMinute(next.minute);
    setAmPm(next.amPm);
  }, [value]);

  const display = formatTimeDisplay(value);

  const applyParts = (nextHour12: string, nextMinute: string, nextAmPm: TimeAmPm | '') => {
    setHour12(nextHour12);
    setMinute(nextMinute);
    setAmPm(nextAmPm);
    fireTimeChange(onChange, name, buildHhmm(nextHour12, nextMinute, nextAmPm));
  };

  const panel =
    open && menuRect ? (
      <div
        id={portalListId}
        role="dialog"
        aria-label="Choose time"
        className={uiCx(uiDatePicker.panel, 'w-[280px]')}
        style={{ top: menuRect.top, left: menuRect.left }}
      >
        <div className="space-y-3 px-3 py-2">
          <div className="flex items-center gap-2">
            <AppSelect
              className="min-w-0 flex-1"
              value={hour12}
              onChange={(e) => applyParts(e.target.value, minute, panelAmPm)}
              options={[...TIME_HOUR_12_OPTIONS]}
              placeholder="Hour"
              disabled={disabled}
            />
            <span className="shrink-0 text-xs font-medium text-gray-500">:</span>
            <AppSelect
              className="min-w-0 flex-1"
              value={minute}
              onChange={(e) => applyParts(hour12, e.target.value, amPm || 'AM')}
              options={[...TIME_MINUTE_OPTIONS]}
              placeholder="Min"
              disabled={disabled}
            />
            <AppSelect
              className="min-w-0 flex-1"
              value={panelAmPm}
              onChange={(e) => applyParts(hour12, minute, e.target.value as TimeAmPm)}
              options={[...TIME_AM_PM_OPTIONS]}
              disabled={disabled}
            />
          </div>
        </div>
        <div className={uiDatePicker.footer}>
          <button
            type="button"
            className={uiDatePicker.footerAction}
            onClick={() => {
              applyParts('', '', '');
              closeDropdown();
            }}
          >
            Clear
          </button>
          <button
            type="button"
            className={uiDatePicker.footerAction}
            onClick={() => closeDropdown()}
          >
            Done
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div className={uiCx('block space-y-1.5', className)}>
      {label ? (
        <AppControlLabelRow label={label} fieldHint={fieldHint ? <AppFieldHint hint={fieldHint} /> : undefined} />
      ) : null}
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <div ref={anchorRef} className="relative">
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? portalListId : undefined}
          className={uiCx(
            uiDropdown.trigger,
            'flex w-full items-center justify-between gap-2 pr-9 text-left',
            !display && 'text-gray-400',
            open && !disabled && 'border-gray-400 ring-1 ring-inset ring-gray-400/35',
          )}
          onClick={() => {
            if (!disabled) setOpen((o) => !o);
          }}
        >
          <span className="min-w-0 truncate">{display || placeholder}</span>
        </button>
        <Clock className={uiDatePicker.triggerIcon} aria-hidden />
      </div>
      {helperText ? <span className={uiTypography.helper}>{helperText}</span> : null}
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
