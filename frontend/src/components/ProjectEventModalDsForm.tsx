import { useState } from 'react';
import { X } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppDatePicker,
  AppEmptyState,
  AppInput,
  AppSectionHeader,
  AppSelect,
  AppTable,
  AppTextarea,
  AppTimePicker,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
  uiUserSelect,
} from '@/components/ui';

function formatChipDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function DateChipList({
  dates,
  variant,
  onRemove,
}: {
  dates: string[];
  variant: 'danger' | 'success';
  onRemove: (date: string) => void;
}) {
  if (dates.length === 0) return null;
  return (
    <div className={uiUserSelect.chipRow}>
      {dates.map((date) => (
        <span key={date} className={uiUserSelect.chip}>
          <AppBadge variant={variant}>{formatChipDate(date)}</AppBadge>
          <button
            type="button"
            className={uiUserSelect.chipClear}
            onClick={() => onRemove(date)}
            aria-label={`Remove ${formatChipDate(date)}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}

const TIMEZONE_OPTIONS = [
  { value: 'America/Vancouver', label: 'America/Vancouver (PST/PDT)' },
  { value: 'America/Toronto', label: 'America/Toronto (EST/EDT)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
  { value: 'UTC', label: 'UTC' },
];

const REPEAT_TYPE_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom…' },
];

const REPEAT_ENDS_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'on', label: 'On date' },
  { value: 'after', label: 'After number of occurrences' },
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_TITLES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type ProjectEventModalDsFormProps = {
  mode: 'create' | 'edit';
  name: string;
  setName: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isAllDay: boolean;
  setIsAllDay: (v: boolean) => void;
  is247: boolean;
  setIs247: (v: boolean) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  endTime: string;
  setEndTime: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  repeatType: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  setRepeatType: (v: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom') => void;
  repeatInterval: number;
  setRepeatInterval: (v: number) => void;
  repeatDaysOfWeek: boolean[];
  toggleDayOfWeek: (index: number) => void;
  repeatEnds: 'never' | 'on' | 'after';
  setRepeatEnds: (v: 'never' | 'on' | 'after') => void;
  repeatUntilDate: string;
  setRepeatUntilDate: (v: string) => void;
  repeatCount: number;
  setRepeatCount: (v: number) => void;
  summaryText: string;
  exceptions: string[];
  extraDates: string[];
  onAddExceptionDate: (date: string) => void;
  onAddExtraDate: (date: string) => void;
  removeException: (date: string) => void;
  removeExtraDate: (date: string) => void;
  previewOccurrences: Array<{
    date: string;
    startTime: string | null;
    endTime: string | null;
    isAllDay: boolean;
  }>;
  occurrencesLength: number;
  onSubmit: () => void;
};

export function ProjectEventModalDsForm(props: ProjectEventModalDsFormProps) {
  const {
    name,
    setName,
    location,
    setLocation,
    notes,
    setNotes,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isAllDay,
    setIsAllDay,
    is247,
    setIs247,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    timezone,
    setTimezone,
    repeatType,
    setRepeatType,
    repeatInterval,
    setRepeatInterval,
    repeatDaysOfWeek,
    toggleDayOfWeek,
    repeatEnds,
    setRepeatEnds,
    repeatUntilDate,
    setRepeatUntilDate,
    repeatCount,
    setRepeatCount,
    summaryText,
    exceptions,
    extraDates,
    onAddExceptionDate,
    onAddExtraDate,
    removeException,
    removeExtraDate,
    previewOccurrences,
    occurrencesLength,
    onSubmit,
  } = props;

  const [exceptionDraft, setExceptionDraft] = useState('');
  const [extraDateDraft, setExtraDateDraft] = useState('');

  const previewCount = Math.min(previewOccurrences.length, 30);
  const previewRows = previewOccurrences.slice(0, 30).map((occ) => {
    const date = new Date(`${occ.date}T12:00:00`);
    const isException = exceptions.includes(occ.date);
    const isExtra = extraDates.includes(occ.date);
    const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeLabel = occ.isAllDay
      ? 'All day'
      : occ.startTime && occ.endTime
        ? `${occ.startTime} – ${occ.endTime}`
        : '—';
    const status = isException ? (
      <AppBadge variant="danger">Excluded</AppBadge>
    ) : isExtra ? (
      <AppBadge variant="success">Extra</AppBadge>
    ) : (
      <AppBadge variant="info">Scheduled</AppBadge>
    );
    return [dateLabel, timeLabel, status];
  });

  return (
    <form
      id="event-form-modal-ds"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <AppInput
        label="Event Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter event name"
        fieldHint="Event Name\n\nTitle shown on the calendar and in event details."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AppCard bodyClassName="p-4">
          <AppSectionHeader title="When" />
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <AppDatePicker
                label="Start Date *"
                value={startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  if (!endDate || endDate < v) setEndDate(v);
                }}
                fieldHint="Start Date\n\nFirst day of the event or block."
              />
              <AppDatePicker
                label="End Date *"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                fieldHint="End Date\n\nLast day included in the event."
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <AppCheckbox label="All-day" checked={isAllDay} onChange={setIsAllDay} />
              {!isAllDay && (
                <AppCheckbox label="Run 24/7" checked={is247} onChange={setIs247} />
              )}
            </div>
            {!isAllDay && (
              <div className="grid gap-3 sm:grid-cols-2">
                <AppTimePicker
                  label="Start time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={is247}
                  placeholder="Select time"
                  fieldHint="Start time\n\nWhen the event begins on each day (not used for all-day or 24/7)."
                />
                <AppTimePicker
                  label="End time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={is247}
                  placeholder="Select time"
                  fieldHint="End time\n\nWhen the event ends on each day."
                />
              </div>
            )}
            <AppSelect
              label="Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={TIMEZONE_OPTIONS}
              fieldHint="Timezone\n\nAll times for this event use this zone."
            />
          </div>
        </AppCard>

        <AppCard bodyClassName="p-4">
          <AppSectionHeader title="Repeat" />
          <div className="mt-4 space-y-3">
            <AppSelect
              label="Repeat"
              value={repeatType}
              onChange={(e) =>
                setRepeatType(e.target.value as 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom')
              }
              options={REPEAT_TYPE_OPTIONS}
              fieldHint="Repeat\n\nHow often this event occurs after the start date."
            />

            {repeatType !== 'none' && (
              <>
                {(repeatType === 'daily' || repeatType === 'monthly' || repeatType === 'yearly') && (
                  <AppInput
                    label="Every"
                    type="number"
                    min={1}
                    value={String(repeatInterval)}
                    onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                )}

                {repeatType === 'weekly' && (
                  <div className="space-y-2">
                    <AppInput
                      label="Every (weeks)"
                      type="number"
                      min={1}
                      value={String(repeatInterval)}
                      onChange={(e) => setRepeatInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                    <p className={uiTypography.helper}>On days</p>
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAY_LABELS.map((day, idx) => (
                        <AppButton
                          key={`${day}-${idx}`}
                          type="button"
                          size="sm"
                          variant={repeatDaysOfWeek[idx] ? 'primary' : 'secondary'}
                          className="h-8 w-8 min-w-8 p-0"
                          onClick={() => toggleDayOfWeek(idx)}
                          title={WEEKDAY_TITLES[idx]}
                        >
                          {day}
                        </AppButton>
                      ))}
                    </div>
                  </div>
                )}

                {repeatType === 'custom' && (
                  <p className={uiTypography.helper}>
                    Custom recurrence options coming soon. Use Weekly or Monthly for now.
                  </p>
                )}

                <AppSelect
                  label="Ends"
                  value={repeatEnds}
                  onChange={(e) => setRepeatEnds(e.target.value as 'never' | 'on' | 'after')}
                  options={REPEAT_ENDS_OPTIONS}
                />
                {repeatEnds === 'on' && (
                  <AppDatePicker
                    label="End on"
                    value={repeatUntilDate}
                    onChange={(e) => setRepeatUntilDate(e.target.value)}
                  />
                )}
                {repeatEnds === 'after' && (
                  <AppInput
                    label="Occurrences"
                    type="number"
                    min={1}
                    value={String(repeatCount)}
                    onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                )}
              </>
            )}
          </div>
        </AppCard>
      </div>

      <AppCard bodyClassName="p-4">
        <AppSectionHeader
          title="Exceptions & preview"
          description="Exclude dates from a series or add one-off extra dates, then review generated occurrences."
        />
        <div className="mt-4 space-y-5">
          <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, 'px-3 py-2.5')}>
            <p className={uiTypography.overline}>Summary</p>
            <p className={uiCx(uiTypography.body, 'mt-1')}>{summaryText}</p>
          </div>

          <div className="space-y-3">
            <AppSectionHeader title="Exception dates" description="Skip these dates when the event repeats." />
            <div className={uiCx('grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end')}>
              <AppDatePicker
                label="Date to exclude"
                value={exceptionDraft}
                onChange={(e) => setExceptionDraft(e.target.value)}
                fieldHint="Date to exclude\n\nDays removed from the recurrence (shown as Excluded in preview)."
              />
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="sm:mb-0.5"
                disabled={!exceptionDraft}
                onClick={() => {
                  onAddExceptionDate(exceptionDraft);
                  setExceptionDraft('');
                }}
              >
                Add
              </AppButton>
            </div>
            <DateChipList dates={exceptions} variant="danger" onRemove={removeException} />
          </div>

          <div className="space-y-3">
            <AppSectionHeader title="Extra dates" description="Add dates outside the normal repeat pattern." />
            <div className={uiCx('grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end')}>
              <AppDatePicker
                label="Extra occurrence date"
                value={extraDateDraft}
                onChange={(e) => setExtraDateDraft(e.target.value)}
                fieldHint="Extra occurrence date\n\nOne-off dates added to the series (shown as Extra in preview)."
              />
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="sm:mb-0.5"
                disabled={!extraDateDraft}
                onClick={() => {
                  onAddExtraDate(extraDateDraft);
                  setExtraDateDraft('');
                }}
              >
                Add
              </AppButton>
            </div>
            <DateChipList dates={extraDates} variant="success" onRemove={removeExtraDate} />
          </div>

          <div className="space-y-3">
            <AppSectionHeader
              title="Occurrence preview"
              description={
                occurrencesLength > 0
                  ? `Showing ${previewCount} of ${occurrencesLength} occurrence${occurrencesLength !== 1 ? 's' : ''}.`
                  : 'Adjust dates and repeat settings to generate occurrences.'
              }
            />
            {previewOccurrences.length > 0 ? (
              <div className="max-h-56 overflow-y-auto">
                <AppTable columns={['Date', 'Time', 'Status']} rows={previewRows} />
              </div>
            ) : (
              <AppEmptyState
                title="No occurrences in preview"
                description="Change start/end dates or repeat options to see scheduled occurrences here."
              />
            )}
          </div>
        </div>
      </AppCard>

      <div className="grid gap-4 md:grid-cols-2">
        <AppInput
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Enter location (optional)"
          fieldHint="Location\n\nOptional place or site label for this event."
        />
        <AppTextarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Enter event notes (optional)"
          rows={4}
          fieldHint="Notes\n\nOptional details visible when viewing the event."
        />
      </div>
    </form>
  );
}
