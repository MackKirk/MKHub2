import EmployeeCommunity from '@/components/EmployeeCommunity';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { ScheduleWidget } from '@/pages/home-dashboard/widgets/ScheduleWidget';
import { getTodayLocal } from '@/lib/dateUtils';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';

// Helper function to get time-based greeting
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

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (Number.isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

function isHoursWorked(a: Attendance): boolean {
  return !!a.reason_text && a.reason_text.includes('HOURS_WORKED:');
}

export default function Overview(){
  const { data: meProfile } = useQuery({ 
    queryKey: ['me-profile'], 
    queryFn: () => api<any>('GET', '/auth/me/profile') 
  });
  
  const profile = meProfile?.profile || {};
  const user = meProfile?.user || {};
  const displayName = profile.preferred_name || 
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 
    user.username || 
    'User';
  const jobTitle = profile.job_title || '';
  
  // Get current date formatted (same as Business Dashboard)
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4 min-h-screen">
      {/* Title Bar - preserved in the same simple format used before the redesign */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {getTimeBasedGreeting()}, {displayName}
              </div>
              {jobTitle && <div className="text-xs text-gray-500 mt-0.5">{jobTitle}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 min-h-[720px]">
          <EmployeeCommunity feedMode={true} />
        </div>

        <aside className="min-w-0 space-y-4">
          <EnterpriseUtilityCard title="Clock In / Out" subtitle="Start or finish your work session">
            <OverviewClockPanel />
          </EnterpriseUtilityCard>
          <EnterpriseUtilityCard title="Schedule" subtitle="Your weekly shift snapshot">
            <ScheduleWidget />
          </EnterpriseUtilityCard>
          <EnterpriseUtilityCard title="Quick Links" subtitle="Secondary actions">
            <OverviewQuickLinks />
          </EnterpriseUtilityCard>
        </aside>
      </div>
    </div>
  );
}

function EnterpriseUtilityCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="min-h-[200px]">{children}</div>
    </section>
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
        `/dispatch/shifts?date_range=${todayStr},${todayStr}&worker_id=${currentUser.id}`
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
    hasOpenClockIn &&
    !!openClockIn &&
    (openClockIn.status === 'approved' || openClockIn.status === 'pending');

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
    <div className="space-y-3">
      {clockModal && (
        <ClockInOutModalLayer
          selectedDate={todayStr}
          clockType={clockModal}
          onClose={() => setClockModal(null)}
        />
      )}
      <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today Status</div>
        <div className="mt-0.5 text-sm font-semibold text-gray-900">
          {isLoading
            ? 'Loading attendance...'
            : hasOpenClockIn
              ? `Clocked in${workingDurationLive ? ` · ${workingDurationLive}` : ''}`
              : 'Ready to clock in'}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setClockModal('in')}
        disabled={!canClockIn}
        className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
          canClockIn
            ? 'border-green-200 bg-green-50/50 hover:border-green-300 hover:bg-green-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
            : 'border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60'
        }`}
        title={!canClockIn ? 'You must clock out first' : ''}
      >
        <div className="flex items-start gap-3">
          <ClockActionIcon tone={canClockIn ? 'green' : 'disabled'} direction="in" />
          <div className="flex-1 min-w-0">
            <div className={`text-base font-semibold mb-1 ${canClockIn ? 'text-gray-900' : 'text-gray-400'}`}>
              Clock In
            </div>
            <div className={`text-xs ${canClockIn ? 'text-gray-600' : 'text-gray-400'}`}>
              Start tracking your work time
            </div>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => setClockModal('out')}
        disabled={!canClockOut}
        className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
          canClockOut
            ? 'border-red-200 bg-red-50/50 hover:border-red-300 hover:bg-red-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
            : 'border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60'
        }`}
        title={
          !canClockOut
            ? hasOpenClockIn && openClockIn
              ? 'Clock-in must be approved or pending'
              : 'No open clock-in found'
            : ''
        }
      >
        <div className="flex items-start gap-3">
          <ClockActionIcon tone={canClockOut ? 'red' : 'disabled'} direction="out" />
          <div className="flex-1 min-w-0">
            <div className={`text-base font-semibold mb-1 ${canClockOut ? 'text-gray-900' : 'text-gray-400'}`}>
              Clock Out
            </div>
            <div className={`text-xs ${canClockOut ? 'text-gray-600' : 'text-gray-400'}`}>
              End your current work session
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function ClockActionIcon({ tone, direction }: { tone: 'green' | 'red' | 'disabled'; direction: 'in' | 'out' }) {
  const toneClass =
    tone === 'green' ? 'bg-green-600 text-white' : tone === 'red' ? 'bg-red-600 text-white' : 'bg-gray-300 text-gray-500';

  return (
    <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${toneClass}`}>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
        {direction === 'in' ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 12h-3m3 0l-2 2m2-2l-2-2" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h3m-3 0l2 2m-2-2l2-2" />
        )}
      </svg>
    </div>
  );
}

function OverviewQuickLinks() {
  return (
    <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
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
      className="block px-3 py-2.5 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-gray-50"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{label}</div>
          <div className="text-xs text-gray-500 truncate">{description}</div>
        </div>
        <span className="text-xs font-semibold text-brand-red">Open</span>
      </div>
    </Link>
  );
}
