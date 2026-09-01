import { AppButton, AppModal, uiCx, uiLayout, uiTypography } from '@/components/ui';
import { formatDateLocal } from '@/lib/dateUtils';
import type { ProjectCalendarDayEntry } from './projectCalendar.types';
import { ProjectCalendarProjectChip } from './ProjectCalendarProjectChip';

type Props = {
  open: boolean;
  date: Date | null;
  entries: ProjectCalendarDayEntry[];
  onClose: () => void;
  onProjectClick: (entry: ProjectCalendarDayEntry) => void;
};

export function ProjectCalendarDayPanel({ open, date, entries, onClose, onProjectClick }: Props) {
  const label = date
    ? date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={label || 'Day details'}
      size="lg"
      footer={
        <AppButton type="button" variant="secondary" onClick={onClose}>
          Close
        </AppButton>
      }
    >
      <div className={uiCx(uiLayout.stack, 'gap-3')}>
        <p className={uiTypography.helper}>
          {entries.length} project{entries.length === 1 ? '' : 's'} on{' '}
          {date ? formatDateLocal(date) : 'this day'}
        </p>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <ProjectCalendarProjectChip
              key={entry.project_id}
              entry={entry}
              onOpen={() => onProjectClick(entry)}
            />
          ))}
        </div>
      </div>
    </AppModal>
  );
}
