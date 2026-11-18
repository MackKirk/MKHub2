import ScheduleCard from '@/components/ScheduleCard';
import { AppPageHeader } from '@/components/ui';
import { CalendarDays } from 'lucide-react';

export default function Schedule() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <AppPageHeader
        title="Schedule"
        subtitle="Shifts and tasks for the day, and the day after"
        icon={<CalendarDays className="h-4 w-4" />}
        className="shrink-0"
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ScheduleCard />
      </div>
    </div>
  );
}
