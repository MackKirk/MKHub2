import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import DynamicSafetyForm from '@/components/DynamicSafetyForm';
import {
  EmployeeReviewRatingScalePanel,
  EmployeeReviewWelcomeOverlay,
} from '@/components/EmployeeReviewParticipantGuide';
import { normalizeDefinition, type SafetyFormDefinition } from '@/types/safetyFormTemplate';
import {
  collectEmployeeReviewFieldRows,
  mergeSupervisorSideCommentsForSubmit,
} from '@/lib/employeeReviewForm';

type AssignmentQuestionsResponse = {
  definition: SafetyFormDefinition;
  form_template_id: string;
  assignment_id: string;
};

type AssignmentRow = {
  id: string;
  status?: string;
  due_date?: string | null;
  cycle_name?: string | null;
  cycle_status?: string | null;
  cycle_period_start?: string | null;
  cycle_period_end?: string | null;
  reviewee_display_name?: string | null;
  reviewee_username?: string | null;
};

function formatFriendlyDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCyclePeriod(start: string | null | undefined, end: string | null | undefined) {
  if (!start && !end) return null;
  return `${start ? formatFriendlyDate(start) : '—'} → ${end ? formatFriendlyDate(end) : '—'}`;
}

function personLabel(a: AssignmentRow) {
  return (a.reviewee_display_name || a.reviewee_username || 'Employee').trim();
}

function isSubmitted(a: { status?: string }) {
  return String(a.status || '').toLowerCase() === 'submitted';
}

function StatusPill({ status }: { status: string }) {
  const s = String(status || '').toLowerCase();
  const done = s === 'submitted';
  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
        done ? 'bg-green-100 text-green-800' : 'bg-amber-50 text-amber-800'
      }`}
    >
      {status || '—'}
    </span>
  );
}

function IconUserSolid() {
  return (
    <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function IconUsersTeam() {
  return (
    <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function IconClipboardReview() {
  return (
    <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function SelfReviewHeroCard({
  a,
  setOpenId,
  variant,
}: {
  a: AssignmentRow;
  setOpenId: (id: string) => void;
  variant: 'pending' | 'completed';
}) {
  const done = variant === 'completed';
  const period = formatCyclePeriod(a.cycle_period_start, a.cycle_period_end);
  const name = personLabel(a);

  return (
    <div
      className={
        done
          ? 'rounded-2xl border border-gray-200 bg-gray-50/80 p-5 md:p-6 shadow-sm'
          : 'relative overflow-hidden rounded-2xl border-2 border-brand-red/25 bg-gradient-to-br from-red-50/95 via-white to-white p-5 md:p-6 shadow-md ring-1 ring-brand-red/10'
      }
    >
      {!done ? (
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-brand-red/[0.07] blur-2xl" />
      ) : null}
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          {!done ? (
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-red">Your self-review</p>
          ) : (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Completed self-review</p>
          )}
          <h3 className="text-xl font-bold leading-tight text-gray-900">{a.cycle_name || 'Review cycle'}</h3>
          <p className="text-sm text-gray-700">
            <span className="text-gray-500">Prepared for </span>
            <span className="font-semibold text-gray-900">{name}</span>
          </p>
          {period ? <p className="text-xs text-gray-500">Cycle period: {period}</p> : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <span className="inline-flex items-center gap-2 text-sm text-gray-700">
              <IconCalendar />
              <span>
                Due <span className="font-semibold text-gray-900">{formatFriendlyDate(a.due_date)}</span>
              </span>
            </span>
            <StatusPill status={a.status || 'pending'} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:flex-col xl:flex-row">
          <button
            type="button"
            onClick={() => setOpenId(a.id)}
            disabled={done}
            className={
              done
                ? 'rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-400 cursor-not-allowed'
                : 'rounded-xl px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-95 bg-gradient-to-r from-brand-red to-[#ee2b2b]'
            }
          >
            {done ? 'Submitted' : 'Start review'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelfReviewSpotlightSection({
  rows,
  setOpenId,
  emptyMessage,
}: {
  rows: AssignmentRow[];
  setOpenId: (id: string) => void;
  emptyMessage: string;
}) {
  const pending = rows.filter((a) => !isSubmitted(a));
  const completed = rows.filter((a) => isSubmitted(a));

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/90 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <IconUserSolid />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-blue-900">Your self-review</h5>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                When HR includes you in a cycle, your personal questionnaire appears here as a highlighted card.
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/70 px-4 py-10 text-center text-sm text-gray-600">
            {emptyMessage}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 bg-gray-50/90 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
            <IconUserSolid />
          </div>
          <div className="min-w-0">
            <h5 className="text-sm font-semibold text-blue-900">Your self-review</h5>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
              This is your own questionnaire — one clear card per cycle so it stays easy to spot.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-8 p-4 md:p-6">
        {pending.length > 0 ? (
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-amber-900/85">To do</p>
            <div className="space-y-4">
              {pending.map((a) => (
                <SelfReviewHeroCard key={a.id} a={a} setOpenId={setOpenId} variant="pending" />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nothing pending for your self-review.</p>
        )}
        {completed.length > 0 ? (
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-green-900/85">Completed</p>
            <div className="space-y-3">
              {completed.map((a) => (
                <SelfReviewHeroCard key={a.id} a={a} setOpenId={setOpenId} variant="completed" />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TeamAssignmentTable({
  rows,
  setOpenId,
}: {
  rows: AssignmentRow[];
  setOpenId: (id: string) => void;
}) {
  if (!rows.length) {
    return <p className="py-3 text-sm text-gray-500">No rows.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
            <th className="px-3 py-2.5 font-medium">Team member</th>
            <th className="py-2.5 pr-3 font-medium">Review cycle</th>
            <th className="py-2.5 pr-3 font-medium">Due</th>
            <th className="py-2.5 pr-3 font-medium">Status</th>
            <th className="px-3 py-2.5 text-right font-medium"> </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const done = isSubmitted(a);
            const period = formatCyclePeriod(a.cycle_period_start, a.cycle_period_end);
            return (
              <tr key={a.id} className="border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50/80">
                <td className="px-3 py-3 align-top">
                  <div className="font-semibold text-gray-900">{personLabel(a)}</div>
                </td>
                <td className="py-3 pr-3 align-top">
                  <div className="font-medium text-gray-900">{a.cycle_name || '—'}</div>
                  {period ? <div className="mt-0.5 text-xs text-gray-500">{period}</div> : null}
                  {a.cycle_status ? <div className="mt-0.5 text-[11px] capitalize text-gray-400">{a.cycle_status}</div> : null}
                </td>
                <td className="whitespace-nowrap py-3 pr-3 align-top text-sm text-gray-800">
                  {formatFriendlyDate(a.due_date)}
                </td>
                <td className="py-3 pr-3 align-top">
                  <StatusPill status={a.status || 'pending'} />
                </td>
                <td className="px-3 py-3 text-right align-top">
                  <button
                    type="button"
                    onClick={() => setOpenId(a.id)}
                    disabled={done}
                    className={
                      done
                        ? 'cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-400'
                        : 'rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95'
                    }
                  >
                    {done ? 'Done' : 'Open'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TeamReviewSectionCard({
  title,
  description,
  icon,
  rows,
  setOpenId,
  emptyMessage,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  rows: AssignmentRow[];
  setOpenId: (id: string) => void;
  emptyMessage: string;
}) {
  const pending = rows.filter((a) => !isSubmitted(a));
  const completed = rows.filter((a) => isSubmitted(a));

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-gray-100 bg-gray-50/90 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">{icon}</div>
        <div className="min-w-0">
          <h5 className="text-sm font-semibold text-blue-900">{title}</h5>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{description}</p>
        </div>
      </div>
      <div className="space-y-6 p-4">
        {!rows.length ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/70 px-4 py-8 text-center text-sm text-gray-600">
            {emptyMessage}
          </div>
        ) : (
          <>
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">To do</div>
              {pending.length ? (
                <TeamAssignmentTable rows={pending as AssignmentRow[]} setOpenId={setOpenId} />
              ) : (
                <p className="py-2 text-sm text-gray-500">Everyone is caught up here.</p>
              )}
            </div>
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Completed</div>
              {completed.length ? (
                <TeamAssignmentTable rows={completed as AssignmentRow[]} setOpenId={setOpenId} />
              ) : (
                <p className="py-2 text-sm text-gray-500">No completed reviews yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PageHeaderBar({
  title,
  subtitle,
  todayLabel,
  onBack,
}: {
  title: string;
  subtitle: string;
  todayLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100"
            title="Back to Overview"
          >
            <svg className="h-4 w-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
            <IconClipboardReview />
          </div>
          <div className="min-w-0">
            <h5 className="text-sm font-semibold text-blue-900">{title}</h5>
            <p className="mt-0.5 text-xs leading-snug text-gray-600">{subtitle}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Today</div>
          <div className="mt-0.5 text-xs font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
    </div>
  );
}

export default function MyReviews() {
  const navigate = useNavigate();
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    []
  );

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const { data: reviewsAvailable, isLoading: availLoading } = useQuery({
    queryKey: ['reviews-me-available'],
    queryFn: () => api<{ available?: boolean; is_supervisor?: boolean }>('GET', '/reviews/me/available'),
  });
  const { data: assignments, refetch, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => api<AssignmentRow[]>('GET', '/reviews/my/assignments'),
  });
  const [openId, setOpenId] = useState<string>('');
  const { data: questionBundle } = useQuery({
    queryKey: ['assignment-questions', openId],
    queryFn: () =>
      openId ? api<AssignmentQuestionsResponse>('GET', `/reviews/assignments/${openId}/questions`) : Promise.resolve(null),
    enabled: !!openId,
  });
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});
  const [reviewIntroAcknowledged, setReviewIntroAcknowledged] = useState(false);

  const definition = questionBundle?.definition;
  const normalizedDef = useMemo(() => (definition ? normalizeDefinition(definition) : normalizeDefinition({})), [definition]);

  const openAssignment = useMemo(
    () => (assignments || []).find((a) => String(a.id) === String(openId)),
    [assignments, openId]
  );
  const showSupervisorCommentFields = !!(
    openAssignment &&
    me &&
    String(openAssignment.reviewer_user_id) === String(me.id) &&
    String(openAssignment.reviewee_user_id) !== String(me.id)
  );
  useEffect(() => {
    setFormPayload({});
    setReviewIntroAcknowledged(false);
  }, [openId]);

  const isSupervisor = reviewsAvailable?.is_supervisor ?? false;
  const selfAssignments = useMemo(() => (assignments || []).filter((a: any) => a.is_self), [assignments]);
  const subordinateAssignments = useMemo(() => (assignments || []).filter((a: any) => a.is_subordinate), [assignments]);
  const otherAssignments = useMemo(
    () => (assignments || []).filter((a: any) => !a.is_self && !a.is_subordinate),
    [assignments]
  );

  const submit = async () => {
    try {
      const fieldKeys = collectEmployeeReviewFieldRows(normalizedDef).map((r) => r.key);
      const payload =
        showSupervisorCommentFields && fieldKeys.length > 0
          ? mergeSupervisorSideCommentsForSubmit(formPayload, fieldKeys)
          : formPayload;
      await api('POST', `/reviews/assignments/${openId}/answers`, { form_payload: payload });
      toast.success('Submitted');
      setOpenId('');
      setFormPayload({});
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    }
  };

  const revieweeModalName =
    (openAssignment as AssignmentRow | undefined)?.reviewee_display_name ||
    (openAssignment as AssignmentRow | undefined)?.reviewee_username ||
    'direct report';

  const modalTitle = showSupervisorCommentFields ? `Review — ${revieweeModalName}` : 'My review';

  const list = assignments || [];
  const hasAny = list.length > 0;

  if (availLoading) {
    return (
      <div className="space-y-4">
        <PageHeaderBar
          title="My reviews"
          subtitle="Loading your review tasks…"
          todayLabel={todayLabel}
          onBack={() => navigate('/overview')}
        />
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="h-28 animate-pulse rounded-lg bg-gray-100" />
        </div>
      </div>
    );
  }

  if (reviewsAvailable && !reviewsAvailable.available) {
    return (
      <div className="space-y-4">
        <PageHeaderBar
          title="My reviews"
          subtitle="Self-reviews and supervisor questionnaires for active HR cycles."
          todayLabel={todayLabel}
          onBack={() => navigate('/overview')}
        />
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="p-5">
            <p className="mb-4 text-sm text-gray-600">
              HR runs review cycles by team. When a cycle is active and you are included, tasks appear here and under{' '}
              <span className="font-medium text-gray-800">Personal → My reviews</span> in the sidebar.
            </p>
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-600">
              There is no employee review available for you at this time.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <PageHeaderBar
        title="My reviews"
        subtitle="Your self-review is highlighted below. Supervisor tasks for your team are listed in tables."
        todayLabel={todayLabel}
        onBack={() => navigate('/overview')}
      />

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="space-y-6 p-5">
          {assignmentsLoading ? (
            <div className="h-28 animate-pulse rounded-lg bg-gray-100" />
          ) : !hasAny ? (
            <>
              <p className="text-sm leading-relaxed text-gray-600">
                When HR generates tasks, your <span className="font-medium text-gray-800">self-review</span> shows as a
                highlighted card. If you manage people, their reviews appear in the team list.
              </p>
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-600">
                No review tasks are assigned to you yet for an active cycle. Check back after HR creates tasks for the
                cycle.
              </div>
            </>
          ) : isSupervisor ? (
            <div className="space-y-6">
              <SelfReviewSpotlightSection
                rows={selfAssignments as AssignmentRow[]}
                setOpenId={setOpenId}
                emptyMessage="No self-review row was created for you in this period (HR may still be setting up the cycle)."
              />
              <TeamReviewSectionCard
                title="Your direct reports"
                description="These are the people who report to you. Open each row to answer the same questions they had for themselves; use the comment bubble beside a question when you want a supervisor note."
                icon={<IconUsersTeam />}
                rows={subordinateAssignments as AssignmentRow[]}
                setOpenId={setOpenId}
                emptyMessage="No supervisor reviews for your direct reports yet. They appear here after HR generates assignments."
              />
              {otherAssignments.length > 0 ? (
                <TeamReviewSectionCard
                  title="Other reviews assigned to you"
                  description="You are the reviewer, but the employee is not your direct report in the org chart."
                  icon={<IconClipboardReview />}
                  rows={otherAssignments as AssignmentRow[]}
                  setOpenId={setOpenId}
                  emptyMessage="No assignments."
                />
              ) : null}
            </div>
          ) : (
            <SelfReviewSpotlightSection
              rows={list as AssignmentRow[]}
              setOpenId={setOpenId}
              emptyMessage="No assignments."
            />
          )}
        </div>
      </div>

      {openId && (
        <OverlayPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4" style={{ touchAction: 'none' }}>
            <div
              className="relative flex max-h-[92vh] w-full max-w-[min(1200px,calc(100vw-1.5rem))] flex-col rounded-xl border border-gray-200 bg-white shadow-xl"
              style={{ touchAction: 'auto' }}
            >
              <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-100 p-4">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-gray-900">{modalTitle}</div>
                  {openAssignment?.cycle_name ? (
                    <div className="mt-1 text-xs text-gray-600">{openAssignment.cycle_name}</div>
                  ) : null}
                  {formatCyclePeriod(openAssignment?.cycle_period_start, openAssignment?.cycle_period_end) ? (
                    <div className="mt-0.5 text-xs text-gray-500">
                      {formatCyclePeriod(openAssignment?.cycle_period_start, openAssignment?.cycle_period_end)}
                    </div>
                  ) : null}
                  {openAssignment?.status ? (
                    <div className="mt-2">
                      <StatusPill status={openAssignment.status} />
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOpenId('')}
                  className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
              <div
                className="relative min-h-0 flex-1 overflow-y-auto"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {!definition ? (
                  <div className="p-4 py-10 text-center text-sm text-gray-500">Loading form…</div>
                ) : (
                  <>
                    <EmployeeReviewWelcomeOverlay
                      open={!reviewIntroAcknowledged}
                      variant={showSupervisorCommentFields ? 'supervisor' : 'self'}
                      revieweeDisplayName={showSupervisorCommentFields ? revieweeModalName : undefined}
                      onContinue={() => setReviewIntroAcknowledged(true)}
                    />
                    <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start">
                      <div className="shrink-0 lg:order-2 lg:w-72">
                        <EmployeeReviewRatingScalePanel />
                      </div>
                      <div className="min-w-0 flex-1 lg:order-1">
                        <DynamicSafetyForm
                          definition={normalizedDef}
                          formPayload={formPayload}
                          setFormPayload={setFormPayload}
                          canWrite
                          readOnly={false}
                          projectId=""
                          signerDisplayName="Reviewer"
                          hideAdditionalCommentsBlock
                          hideWorkerSignatureBlock
                          hidePerFieldSideComments={!showSupervisorCommentFields}
                          fieldCommentTextOnly={showSupervisorCommentFields}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-shrink-0 flex-col gap-2 border-t border-gray-100 bg-gray-50/50 p-4">
                <p className="text-center text-xs leading-relaxed text-gray-600 sm:text-left">
                  After you press <span className="font-medium text-gray-800">Submit</span>, this review is sent in. You
                  cannot change answers later from this screen.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenId('')}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    className="rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
