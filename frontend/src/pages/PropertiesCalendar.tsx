import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type CalendarEvent = {
  id: string;
  event_type: string;
  title: string;
  property_id: string;
  property_name: string;
  date: string;
  status?: string;
};

function monthRange(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function PropertiesCalendar() {
  const nav = useNavigate();
  const [cursor, setCursor] = useState(() => new Date());
  const range = useMemo(() => monthRange(cursor), [cursor]);

  const { data, isLoading } = useQuery({
    queryKey: ['properties-calendar', range.start, range.end],
    queryFn: () =>
      api<{ events: CalendarEvent[] }>(
        'GET',
        `/properties/calendar?start=${range.start}&end=${range.end}`,
      ),
  });

  const events = data?.events || [];
  const label = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

  const tone = (t: string) => {
    if (t.includes('expir') || t === 'lease_end') return 'danger' as const;
    if (t === 'tax_due') return 'warning' as const;
    return 'neutral' as const;
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Properties calendar"
        subtitle="Leases, insurance, tax, permits, and maintenance"
        onBack={() => nav('/properties')}
        backLabel="Back to Properties"
        icon={<CalendarIcon className="h-4 w-4" />}
        actions={
          <div className={uiCx(uiLayout.actionsRow, 'gap-2')}>
            <AppButton variant="secondary" size="sm" leftIcon={<ChevronLeft className="h-4 w-4" />} onClick={prevMonth}>
              Previous
            </AppButton>
            <AppButton variant="secondary" size="sm" onClick={nextMonth} leftIcon={<ChevronRight className="h-4 w-4" />}>
              Next
            </AppButton>
          </div>
        }
      />

      <AppCard>
        <AppSectionHeader
          title={label}
          description={`${events.length} event${events.length === 1 ? '' : 's'} this month`}
          {...appSectionPresetProps('timesheet')}
        />
        <div className="mt-4">
          {isLoading ? (
            <div className={uiTypography.helper}>Loading…</div>
          ) : events.length === 0 ? (
            <AppEmptyState title="No events this month" description="Lease, insurance, tax and maintenance deadlines will appear here." />
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-3 text-left transition-colors hover:bg-gray-50"
                  onClick={() => nav(`/properties/${ev.property_id}`)}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{ev.title}</div>
                    <div className={uiCx(uiTypography.helper, 'truncate')}>
                      {ev.property_name} · {formatDateLocal(new Date(ev.date))}
                    </div>
                  </div>
                  <AppBadge variant={tone(ev.event_type)}>{ev.event_type.replace(/_/g, ' ')}</AppBadge>
                </button>
              ))}
            </div>
          )}
        </div>
      </AppCard>
    </div>
  );
}
