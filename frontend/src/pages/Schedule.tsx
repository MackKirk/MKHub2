import ScheduleCard from '@/components/ScheduleCard';
import { AppPageHeader, uiSpacing, uiCx } from '@/components/ui';
import { CalendarDays } from 'lucide-react';

export default function Schedule() {
  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-screen w-full')}>
      <AppPageHeader
        title="Schedule"
        subtitle="View and manage your work schedule"
        icon={<CalendarDays className="h-4 w-4" />}
      />

      <ScheduleCard />
    </div>
  );
}
