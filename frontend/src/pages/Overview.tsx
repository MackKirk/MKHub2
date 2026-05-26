import EmployeeCommunity from '@/components/EmployeeCommunity';
import { ClockActionTile } from '@/components/ClockActionTile';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';
import {
  AppBadge,
  AppCard,
  AppPageHeader,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { ScheduleWidget } from '@/pages/home-dashboard/widgets/ScheduleWidget';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { getTodayLocal } from '@/lib/dateUtils';
import { ChevronRight, LayoutGrid } from 'lucide-react';

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

type Shift = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  project_name?: string;
  status?: string;
};

type Attendance = {
  id: string;
  shift_id: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string;
  reason_text?: string;
};

function isHoursWorked(a: Attendance): boolean {
  return !!a.reason_text && a.reason_text.includes('HOURS_WORKED:');
}

export default function Overview() {
  const { data: meProfile } = useQuery({
    queryKey: ['me-profile'],
    queryFn: () => api<any>('GET', '/auth/me/profile'),
  });

  const profile = meProfile?.profile || {};
  const user = meProfile?.user || {};
  const displayName =
    profile.preferred_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    user.username ||
    'User';
  const jobTitle = profile.job_title || '';

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const greetingTitle = `${getTimeBasedGreeting()}, ${displayName}`;
  const [communityUnread, setCommunityUnread] = useState(0);

  return (
    <div className={uiCx('min-h-full w-full bg-gray-50', uiSpacing.pageStack)}>
      <AppPageHeader
        title={greetingTitle}
        subtitle={jobTitle || undefined}
        icon={<LayoutGrid className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <div className={uiLayout.pageOverview}>
        <AppCard
          title="Employee Community"
          subtitle="Company updates and required communications"
          className="flex h-full min-h-0 min-w-0 flex-col"
          bodyClassName="flex min-h-0 flex-1 flex-col"
          actions={
            <div className={uiCx('flex items-center gap-2', uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.compactCardPadding)}>
              <span className={uiTypography.overline}>Unread</span>
              <AppBadge variant={communityUnread > 0 ? 'danger' : 'neutral'}>{communityUnread}</AppBadge>
            </div>
          }
        >
          <EmployeeCommunity feedMode onUnreadCountChange={setCommunityUnread} />
        </AppCard>

        <aside className={uiCx('flex h-full min-h-0 min-w-0 flex-col', uiSpacing.sectionStack)}>
          <AppCard title="Clock In / Out" subtitle="Start or finish your work session">
            <OverviewClockPanel />
          </AppCard>
          <AppCard title="Schedule" subtitle="Your weekly shift snapshot">
            <ScheduleWidget embedded />
          </AppCard>
          <AppCard title="Quick Links" subtitle="Secondary actions">
            <OverviewQuickLinks />
          </AppCard>
        </aside>
      </div>
    </div>
  );
}

function OverviewClockPanel() {
  const todayStr = getTodayLocal();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockModal, setClockModal] = useState<'in' | 'out' | null>(null);

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
  });

  const { data: allAttendancesData, isLoading } = useQuery({
    queryKey: ['overview-clock-attendances', todayStr, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { attendances: [], shifts: [] };
      const shifts = await api<Shift[]>(
        'GET',
        `/dispatch/shifts?date_range=${todayStr},${todayStr}&worker_id=${currentUser.id}`,
      ).catch(() => []);
      const attendances: Attendance[] = [];

      for (const shift of shifts ?? []) {
        try {
          const atts = await api<Attendance[]>('GET', `/dispatch/shifts/${shift.id}/attendance`);
          attendances.push(...(atts ?? []));
        } catch {
          // Keep the overview resilient if one shift attendance request fails.
        }
      }

      try {
        const direct = await api<Attendance[]>('GET', `/dispatch/attendance/direct/${todayStr}`);
        attendances.push(...(direct ?? []));
      } catch {
        // Direct attendance may be unavailable for some users/roles.
      }

      return { attendances, shifts: shifts ?? [] };
    },
    enabled: !!currentUser?.id,
  });

  const allAttendancesForDate = allAttendancesData?.attendances ?? [];

  const openClockIn = useMemo(() => {
    const events = allAttendancesForDate
      .filter((a) => !!(a.clock_in_time || a.clock_out_time))
      .map((a) => ({ a, tMs: new Date((a.clock_in_time || a.clock_out_time)!).getTime() }))
      .sort((x, y) => x.tMs - y.tMs);

    const openStack: Attendance[] = [];
    for (const { a } of events) {
      if (isHoursWorked(a)) continue;
      if (a.clock_in_time && a.clock_out_time) continue;
      if (a.clock_in_time && !a.clock_out_time) {
        openStack.push(a);
        continue;
      }
      if (a.clock_out_time && !a.clock_in_time && openStack.length) openStack.pop();
    }
    return openStack.length ? openStack[openStack.length - 1] : null;
  }, [allAttendancesForDate]);

  const hasOpenClockIn = !!openClockIn;
  const canClockIn = !hasOpenClockIn;
  const canClockOut =
    hasOpenClockIn && !!openClockIn && (openClockIn.status === 'approved' || openClockIn.status === 'pending');

  const workingDurationLive = useMemo(() => {
    if (!openClockIn?.clock_in_time) return null;
    const clockInDate = new Date(openClockIn.clock_in_time);
    const diffMs = currentTime.getTime() - clockInDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return diffHours > 0 ? `${diffHours}h ${diffMinutes}m` : `${diffMinutes}m`;
  }, [openClockIn, currentTime]);

  useEffect(() => {
    if (!hasOpenClockIn) return;
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, [hasOpenClockIn]);

  return (
    <div className={uiSpacing.sectionStack}>
      {clockModal && (
        <ClockInOutModalLayer
          selectedDate={todayStr}
          clockType={clockModal}
          onClose={() => setClockModal(null)}
        />
      )}
      <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.compactCardPadding)}>
        <div className={uiTypography.overline}>Today Status</div>
        <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>
          {isLoading
            ? 'Loading attendance...'
            : hasOpenClockIn
              ? `Clocked in${workingDurationLive ? ` · ${workingDurationLive}` : ''}`
              : 'Ready to clock in'}
        </div>
      </div>

      <ClockActionTile
        kind="in"
        enabled={canClockIn}
        onClick={() => setClockModal('in')}
        title={!canClockIn ? 'You must clock out first' : undefined}
      />
      <ClockActionTile
        kind="out"
        enabled={canClockOut}
        onClick={() => setClockModal('out')}
        title={
          !canClockOut
            ? hasOpenClockIn && openClockIn
              ? 'Clock-in must be approved or pending'
              : 'No open clock-in found'
            : undefined
        }
      />
    </div>
  );
}

function OverviewQuickLinks() {
  return (
    <div className="divide-y divide-gray-100">
      <QuickLink to="/tasks" label="Tasks" description="Open your task queue" />
      <QuickLink to="/task-requests" label="Requests" description="Review pending task requests" />
      <QuickLink to="/clock-in-out" label="Clock History" description="Manage attendance records" />
    </div>
  );
}

function QuickLink({ to, label, description }: { to: string; label: string; description: string }) {
  return (
    <Link
      to={to}
      state={{ fromHome: true }}
      className="block py-2.5 transition-colors hover:bg-gray-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={uiTypography.sectionTitle}>{label}</div>
          <div className={uiCx(uiTypography.helper, 'truncate')}>{description}</div>
        </div>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-red">
          Open
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
