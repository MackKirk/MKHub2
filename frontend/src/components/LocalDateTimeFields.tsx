import type { ReactNode } from 'react';
import {
  AppControlLabelRow,
  AppDatePicker,
  AppFieldHint,
  AppTimePicker,
  uiCx,
  uiSpacing,
} from '@/components/ui';
import { parseHhmm } from '@/lib/timePickerUtils';

function localDatePart(value: string): string {
  if (!value?.includes('T')) return value?.trim() || '';
  return value.split('T')[0] || '';
}

function localTimePart(value: string): string {
  if (!value?.includes('T')) return '';
  const timePart = value.split('T')[1] || '';
  return /^\d{2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : '';
}

/** True when value is `YYYY-MM-DDTHH:mm` with a complete AppTimePicker time (incl. AM/PM). */
export function isCompleteLocalDatetime(value: string): boolean {
  if (!value?.includes('T')) return false;
  const [datePart, timePart = ''] = value.split('T');
  const { hour12, minute, amPm } = parseHhmm(timePart.slice(0, 5));
  return Boolean(datePart && hour12 && minute && amPm);
}

type LocalDateTimeFieldsProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  dateFieldHint?: string;
  timeFieldHint?: string;
};

/** Date + time pair for forms — stores `YYYY-MM-DDTHH:mm` (datetime-local shape). */
export function LocalDateTimeFields({
  label,
  value,
  onChange,
  required,
  dateFieldHint,
  timeFieldHint,
}: LocalDateTimeFieldsProps) {
  const date = localDatePart(value);
  const time = localTimePart(value);
  const groupLabel = required ? `${label} *` : label;

  const dateHintNode: ReactNode | undefined = dateFieldHint ? (
    <AppFieldHint hint={dateFieldHint} />
  ) : undefined;
  const timeHintNode: ReactNode | undefined = timeFieldHint ? (
    <AppFieldHint hint={timeFieldHint} />
  ) : undefined;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppControlLabelRow label={groupLabel} />
      <div className={uiCx('grid grid-cols-2 gap-3')}>
        <AppDatePicker
          label="Date"
          fieldHint={dateHintNode}
          value={date}
          onChange={(e) => {
            const d = e.target.value;
            if (!d) {
              onChange('');
              return;
            }
            onChange(time ? `${d}T${time}` : `${d}T`);
          }}
          required={required}
        />
        <AppTimePicker
          label="Time"
          fieldHint={timeHintNode}
          value={time}
          onChange={(e) => {
            const t = e.target.value;
            if (!date) return;
            onChange(t ? `${date}T${t}` : `${date}T`);
          }}
          required={required}
        />
      </div>
    </div>
  );
}
