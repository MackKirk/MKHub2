import ScheduleCard from '@/components/ScheduleCard';
import { AppPageHeader, uiSpacing, uiTypography, uiCx } from '@/components/ui';
import { CalendarDays } from 'lucide-react';
import { useMemo } from 'react';

export default function Schedule() {
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-screen w-full')}>
      <AppPageHeader
        title="Schedule"
        subtitle="View and manage your work schedule"
        icon={<CalendarDays className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <ScheduleCard />
    </div>
  );
}

