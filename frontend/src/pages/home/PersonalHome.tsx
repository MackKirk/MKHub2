import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Clock,
  FileText,
  GraduationCap,
  HeartPulse,
  LogOut,
  Megaphone,
  Play,
  Sun,
  Wrench,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getTodayLocal } from '@/lib/dateUtils';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';
import { TimeOffRequestModal } from '@/pages/clock/TimeOffRequestModal';
import type { TaskBuckets } from '@/components/tasks/types';
import type { TimeOffMode } from '@/lib/timeOff';
import { uiCx, uiRadius } from '@/components/ui';

type Attendance = {
  id: string;
  shift_id: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string;
  reason_text?: string;
};

type Shift = {
  id: string;
  date: string;
  start_time?: string;
  end_time?: string;
  project_name?: string;
  status?: string;
};

function isHoursWorked(a: Attendance): boolean {
  return !!a.reason_text && a.reason_text.includes('HOURS_WORKED:');
}

function darkenHex(hex: string, amount = 0.28): string {
  const raw = hex.replace('#', '');
  const n = parseInt(raw, 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

type CommunityBadgePost = {
  id: string;
  is_unread?: boolean;
  requires_read_confirmation?: boolean;
  user_has_confirmed?: boolean;
};

function asPostList(result: unknown): CommunityBadgePost[] {
  if (Array.isArray(result)) return result as CommunityBadgePost[];
  if (result && typeof result === 'object' && Array.isArray((result as { data?: unknown }).data)) {
    return (result as { data: CommunityBadgePost[] }).data;
  }
  return [];
}

function QuickActionBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -right-1 -top-1 z-10 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c22033] px-1 text-[9px] font-bold leading-none text-white"
      aria-label={label}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function QuickActionCard({
  label,
  icon,
  accent,
  tint,
  watermark,
  badge = 0,
  badgeLabel,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  accent: string;
  tint: string;
  watermark?: string;
  badge?: number;
  badgeLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-full min-h-9 overflow-visible rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-px hover:shadow-md"
    >
      <span
        className="w-0.5 shrink-0 self-stretch rounded-l-lg"
        style={{ background: `linear-gradient(180deg, ${darkenHex(accent)} 0%, ${accent} 100%)` }}
      />
      <span className="relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2">
        {watermark ? (
          <span
            className="pointer-events-none absolute -bottom-3 -right-3 h-10 w-10 opacity-[0.1]"
            style={{
              backgroundColor: accent,
              WebkitMaskImage: `url(${watermark})`,
              maskImage: `url(${watermark})`,
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
            aria-hidden
          />
        ) : null}
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: tint, color: accent }}
        >
          {icon}
        </span>
        <span className="min-w-0 truncate text-xs font-semibold text-gray-900">{label}</span>
      </span>
      <QuickActionBadge
        count={badge}
        label={badgeLabel || `${badge} pending`}
      />
    </button>
  );
}

/** Locked personal shortcuts above the customizable dashboard. Not a widget. */
export function HomeQuickAccess() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const todayStr = getTodayLocal();
  const [clockModal, setClockModal] = useState<'in' | 'out' | null>(null);
  const [timeOffMode, setTimeOffMode] = useState<TimeOffMode | null>(null);

  // Sidebar Personal → Time Off / Sick Leave / Clock In/Out land here with ?open=
  useEffect(() => {
    const open = (searchParams.get('open') || '').toLowerCase();
    if (!open) return;

    if (open === 'hours' || open === 'log-hours' || open === 'clock') {
      setTimeOffMode(null);
      setClockModal('in');
    } else if (open === 'time-off' || open === 'vacation') {
      setClockModal(null);
      setTimeOffMode('vacation');
    } else if (open === 'sick' || open === 'sick-leave') {
      setClockModal(null);
      setTimeOffMode('sick');
    } else {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
  });

  const { data: allAttendancesData } = useQuery({
    queryKey: ['clock-in-out-all-attendances', todayStr, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { attendances: [] as Attendance[], shifts: [] as Shift[] };
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
          // keep going
        }
      }
      try {
        const direct = await api<Attendance[]>('GET', `/dispatch/attendance/direct/${todayStr}`);
        attendances.push(...(direct ?? []));
      } catch {
        // optional
      }
      return { attendances, shifts: shifts ?? [] };
    },
    enabled: !!currentUser?.id,
  });

  const { data: taskBuckets } = useQuery<TaskBuckets>({
    queryKey: ['home-list-tasks'],
    queryFn: () => api('GET', '/tasks?limit=20'),
    staleTime: 30_000,
  });

  const { data: priorClockAttention } = useQuery({
    queryKey: ['attendance-needs-attention'],
    queryFn: () => api<{ count: number; items?: { date: string }[] }>('GET', '/dispatch/attendance/needs-attention'),
    enabled: !!currentUser?.id,
    staleTime: 30_000,
  });

  const { data: communityBadge = 0 } = useQuery({
    queryKey: ['community-posts', 'home-badge'],
    queryFn: async () => {
      const [unreadRaw, requiredRaw] = await Promise.all([
        api('GET', '/community/posts?filter=unread&limit=50').catch(() => []),
        api('GET', '/community/posts?filter=required&limit=50').catch(() => []),
      ]);
      const ids = new Set<string>();
      for (const post of asPostList(unreadRaw)) {
        if (post.is_unread !== false) ids.add(String(post.id));
      }
      for (const post of asPostList(requiredRaw)) {
        if (post.requires_read_confirmation && !post.user_has_confirmed) ids.add(String(post.id));
      }
      return ids.size;
    },
    staleTime: 30_000,
  });

  const { openClockIn, hasOpenClockIn } = useMemo(() => {
    const events = (allAttendancesData?.attendances ?? [])
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
    const open = openStack.length ? openStack[openStack.length - 1] : null;
    return { openClockIn: open, hasOpenClockIn: !!open };
  }, [allAttendancesData]);

  const canClockOut =
    hasOpenClockIn &&
    !!openClockIn &&
    (openClockIn.status === 'approved' || openClockIn.status === 'pending');

  const acceptedCount = taskBuckets?.accepted?.length ?? 0;
  const inProgressCount = taskBuckets?.in_progress?.length ?? 0;
  const assetsPath = currentUser?.id ? `/users/${currentUser.id}?tab=assets` : '/profile';
  const priorClockCount = priorClockAttention?.count ?? 0;

  return (
    <section className="space-y-2">
      {clockModal ? (
        <ClockInOutModalLayer
          selectedDate={todayStr}
          clockType={clockModal}
          onClose={() => setClockModal(null)}
        />
      ) : null}
      {timeOffMode ? (
        <TimeOffRequestModal open mode={timeOffMode} onClose={() => setTimeOffMode(null)} />
      ) : null}

      <h2 className="text-sm font-semibold text-gray-900">Quick access</h2>

      <div className="grid grid-cols-1 gap-1.5 pt-1 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-stretch">
        <div className="grid h-full min-h-0 min-w-0 auto-rows-[minmax(2.25rem,1fr)] grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
          <QuickActionCard
            label="Log hours"
            icon={<Clock className="h-3.5 w-3.5" />}
            accent="#166534"
            tint="#DCFCE7"
            watermark="/assets/brand/clock-watermark.png"
            badge={priorClockCount}
            badgeLabel={`${priorClockCount} pending from previous days`}
            onClick={() => setClockModal('in')}
          />
          <QuickActionCard
            label="Time Off"
            icon={<Sun className="h-3.5 w-3.5" />}
            accent="#EA580C"
            tint="#FFEDD5"
            watermark="/assets/brand/timeoff-watermark.png"
            onClick={() => setTimeOffMode('vacation')}
          />
          <QuickActionCard
            label="Sick Leave"
            icon={<HeartPulse className="h-3.5 w-3.5" />}
            accent="#DC2626"
            tint="#FEE2E2"
            watermark="/assets/brand/medkit-watermark.png"
            onClick={() => setTimeOffMode('sick')}
          />
          <QuickActionCard
            label="Schedule"
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            accent="#2563EB"
            tint="#DBEAFE"
            watermark="/assets/brand/calendar-watermark.png"
            onClick={() => navigate('/schedule')}
          />
          <QuickActionCard
            label="Announcements"
            icon={<Megaphone className="h-3.5 w-3.5" />}
            accent="#4F46E5"
            tint="#E0E7FF"
            badge={communityBadge}
            badgeLabel={`${communityBadge} new or unread required posts`}
            onClick={() => navigate('/announcements')}
          />
          <QuickActionCard
            label="Training"
            icon={<GraduationCap className="h-3.5 w-3.5" />}
            accent="#7C3AED"
            tint="#EDE9FE"
            onClick={() => navigate('/training')}
          />
          <QuickActionCard
            label="My assets"
            icon={<Wrench className="h-3.5 w-3.5" />}
            accent="#0F766E"
            tint="#CCFBF1"
            onClick={() => navigate(assetsPath)}
          />
        </div>

        <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-2.5 py-1">
            <h3 className="text-[11px] font-semibold text-gray-900">Open tasks</h3>
            <Link
              to="/tasks"
              state={{ fromHome: true }}
              className="text-[10px] font-semibold text-blue-700 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="flex min-h-9 flex-1 items-stretch">
            <Link
              to="/tasks"
              state={{ fromHome: true }}
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 transition-colors hover:bg-gray-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-50 text-orange-600">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold tabular-nums text-orange-600">{acceptedCount}</span>
              <span className="truncate text-[11px] text-gray-500">Open</span>
            </Link>
            <div className="my-1.5 w-px self-stretch bg-gray-100" />
            <Link
              to="/tasks"
              state={{ fromHome: true }}
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 transition-colors hover:bg-gray-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                <Play className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-semibold tabular-nums text-blue-700">{inProgressCount}</span>
              <span className="truncate text-[11px] text-gray-500">In progress</span>
            </Link>
          </div>
        </aside>
      </div>

      {hasOpenClockIn && canClockOut ? (
        <button
          type="button"
          onClick={() => setClockModal('out')}
          className={uiCx(
            'flex h-8 w-full items-center justify-center gap-2 border border-red-200 bg-red-50 text-xs font-semibold text-red-800',
            uiRadius.control,
            'hover:bg-red-100',
          )}
        >
          <LogOut className="h-3.5 w-3.5" />
          Clock out — this entry is missing an end time
        </button>
      ) : null}
    </section>
  );
}
