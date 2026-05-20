import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import toast from 'react-hot-toast';
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
import MyReviewsDirectorMeetingTab from '@/components/MyReviewsDirectorMeetingTab';
import {
  formatDirectorSlotDayLabel,
  formatDirectorSlotTimeRange,
  normalizeDirectorMeetingSlots,
  revieweeUserIdsEqual,
} from '@/components/DirectorMeetingSlotPicker';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppPageHeader,
  AppSectionHeader,
  AppTable,
  AppTabs,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  PartyPopper,
  User,
  Users,
} from 'lucide-react';

type AssignmentQuestionsResponse = {
  definition: SafetyFormDefinition;
  form_template_id: string;
  assignment_id: string;
};

type AssignmentRow = {
  id: string;
  cycle_id?: string;
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

function reviewStatusBadgeVariant(status: string): 'success' | 'warning' {
  return String(status || '').toLowerCase() === 'submitted' ? 'success' : 'warning';
}

function StatusBadge({ status }: { status: string }) {
  return (
    <AppBadge variant={reviewStatusBadgeVariant(status)} className="normal-case">
      {status || '—'}
    </AppBadge>
  );
}

type DirectorMeetingBoardPeek = {
  windows: { id?: string; starts_at: string; ends_at: string }[];
  slots: unknown[];
  hr_pending_reschedule?: { since: string; message?: string | null } | null;
};

function DirectorMeetingScheduleRow({
  cycleId,
  onGoToSchedule,
}: {
  cycleId: string;
  onGoToSchedule: () => void;
}) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const myId = me?.id != null ? String(me.id) : '';
  const { data: board, isLoading } = useQuery({
    queryKey: ['director-meeting-board', cycleId],
    queryFn: () =>
      api<DirectorMeetingBoardPeek>('GET', `/reviews/cycles/${encodeURIComponent(cycleId)}/director-meeting-board`),
    enabled: !!cycleId,
  });
  const slotsNorm = useMemo(
    () => normalizeDirectorMeetingSlots(board?.slots as unknown[]),
    [board?.slots]
  );
  const activeSlot = useMemo(() => {
    if (!myId || !slotsNorm.length) return null;
    return slotsNorm.find((s) => revieweeUserIdsEqual(s.booked_reviewee_user_id, myId)) ?? null;
  }, [slotsNorm, myId]);
  /** Shown even if a stale slot row still matches (board API lists pending cancel first). */
  const pendingReschedule = board?.hr_pending_reschedule ?? null;

  if (isLoading) {
    return (
      <AppCard
        className={uiCx('mt-4 border-amber-200 bg-amber-50/80', uiShadows.card)}
        bodyClassName={uiSpacing.compactCardPadding}
      >
        <p className={uiTypography.body}>Checking director meeting status…</p>
      </AppCard>
    );
  }

  if (pendingReschedule != null) {
    const reason = (pendingReschedule.message && String(pendingReschedule.message).trim()) || '';

    return (
      <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
        <AppCard className="border-red-200 bg-red-50" bodyClassName={uiSpacing.compactCardPadding}>
          <p className={uiTypography.overline}>Booking cancelled</p>
          <p className={uiCx(uiTypography.body, 'mt-1')}>
            HR cancelled this time slot. What happened is summarized below; use the yellow section to pick a new time.
          </p>
          {reason ? (
            <div className={uiCx('mt-2.5', uiRadius.control, uiBorders.subtle, uiColors.surface, uiSpacing.compactCardPadding)}>
              <span className={uiTypography.sectionTitle}>Reason: </span>
              <span className={uiCx(uiTypography.body, 'whitespace-pre-wrap')}>{reason}</span>
            </div>
          ) : null}
        </AppCard>

        <AppCard className="border-2 border-amber-400 bg-amber-50" bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx(uiLayout.actionsRow, 'flex-col items-stretch sm:flex-row sm:items-center')}>
            <div className="flex min-w-0 gap-3">
              <div className={uiCx('flex h-10 w-10 shrink-0 items-center justify-center bg-amber-200 text-amber-900', uiRadius.control)}>
                <Calendar className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className={uiTypography.overline}>Action needed</p>
                <p className={uiCx(uiTypography.sectionTitle, 'mt-1')}>Pick a new time for your director 1:1</p>
                <p className={uiTypography.helper}>Choose another time when it works for you.</p>
              </div>
            </div>
            <AppButton type="button" onClick={onGoToSchedule} className="shrink-0 sm:self-center">
              Book a new time
            </AppButton>
          </div>
        </AppCard>
      </div>
    );
  }

  if (activeSlot) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onGoToSchedule}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onGoToSchedule();
          }
        }}
        className={uiCx(
          'mt-4 w-full cursor-pointer text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30',
          uiRadius.card,
        )}
        aria-label="View or change director 1:1 meeting"
      >
        <AppCard
          className={uiCx(
            'border-emerald-200 bg-emerald-50/80 transition-colors hover:border-emerald-300 hover:bg-emerald-50',
            uiShadows.card,
          )}
          bodyClassName={uiSpacing.cardPadding}
        >
          <div className="flex min-w-0 gap-3">
            <div className={uiCx('flex h-10 w-10 shrink-0 items-center justify-center bg-emerald-100 text-emerald-700', uiRadius.control)}>
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className={uiTypography.overline}>Director 1:1</p>
              <p className={uiCx(uiTypography.sectionTitle, 'mt-1')}>You&apos;re on the calendar</p>
              <p className={uiTypography.body}>
                {formatDirectorSlotDayLabel(activeSlot.starts_at)} ·{' '}
                {formatDirectorSlotTimeRange(activeSlot.starts_at, activeSlot.ends_at)}
              </p>
            </div>
          </div>
        </AppCard>
      </div>
    );
  }

  return (
    <AppCard className={uiCx('mt-4 border-amber-300 bg-amber-50', uiShadows.card)} bodyClassName={uiSpacing.cardPadding}>
      <div className={uiCx(uiLayout.actionsRow, 'flex-col items-stretch sm:flex-row sm:items-center')}>
        <div className="flex min-w-0 gap-3">
          <div className={uiCx('flex h-10 w-10 shrink-0 items-center justify-center bg-amber-200 text-amber-900', uiRadius.control)}>
            <PartyPopper className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className={uiTypography.overline}>Nice work</p>
            <p className={uiCx(uiTypography.sectionTitle, 'mt-1')}>
              You finished your self-review — ready for the next step
            </p>
            <p className={uiTypography.helper}>
              Book a short closing conversation with leadership. Slots open when HR publishes availability for this
              cycle.
            </p>
          </div>
        </div>
        <AppButton type="button" onClick={onGoToSchedule} className="shrink-0 sm:self-center">
          Schedule director 1:1
        </AppButton>
      </div>
    </AppCard>
  );
}

function SelfReviewHeroCard({
  a,
  setOpenId,
  variant,
  onGoToDirectorTab,
}: {
  a: AssignmentRow;
  setOpenId: (id: string) => void;
  variant: 'pending' | 'completed';
  onGoToDirectorTab?: () => void;
}) {
  const done = variant === 'completed';
  const period = formatCyclePeriod(a.cycle_period_start, a.cycle_period_end);
  const name = personLabel(a);

  return (
    <AppCard
      className={
        done
          ? uiCx(uiColors.surfaceSubtle, uiShadows.card)
          : uiCx('relative overflow-hidden border-2 border-brand-red/25 bg-brand-red/5', uiShadows.card)
      }
      bodyClassName={uiCx(uiSpacing.cardPadding, 'md:p-6')}
    >
      {!done ? (
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-brand-red/[0.07] blur-2xl" />
      ) : null}
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className={uiCx('min-w-0 flex-1', uiSpacing.sectionStack)}>
          {!done ? (
            <p className={uiCx(uiTypography.overline, 'text-brand-red')}>Your self-review</p>
          ) : (
            <p className={uiTypography.overline}>Completed self-review</p>
          )}
          <h3 className={uiTypography.pageTitle}>{a.cycle_name || 'Review cycle'}</h3>
          <p className={uiTypography.body}>
            <span className={uiColors.textMuted}>Prepared for </span>
            <span className={uiTypography.sectionTitle}>{name}</span>
          </p>
          {period ? <p className={uiTypography.helper}>Cycle period: {period}</p> : null}
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap pt-1')}>
            <span className={uiCx(uiLayout.actionsRow, uiTypography.body)}>
              <Calendar className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
              <span>
                Due <span className={uiTypography.sectionTitle}>{formatFriendlyDate(a.due_date)}</span>
              </span>
            </span>
            <StatusBadge status={a.status || 'pending'} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center lg:flex-col xl:flex-row">
          <AppButton type="button" onClick={() => setOpenId(a.id)} disabled={done} variant={done ? 'secondary' : undefined}>
            {done ? 'Submitted' : 'Start review'}
          </AppButton>
        </div>
      </div>
      {done && a.cycle_id && onGoToDirectorTab ? (
        <DirectorMeetingScheduleRow cycleId={String(a.cycle_id)} onGoToSchedule={onGoToDirectorTab} />
      ) : null}
    </AppCard>
  );
}

function SelfReviewSpotlightSection({
  rows,
  setOpenId,
  emptyMessage,
  onGoToDirectorTab,
}: {
  rows: AssignmentRow[];
  setOpenId: (id: string) => void;
  emptyMessage: string;
  onGoToDirectorTab: () => void;
}) {
  const pending = rows.filter((a) => !isSubmitted(a));
  const completed = rows.filter((a) => isSubmitted(a));

  if (!rows.length) {
    return (
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader
          title="Your self-review"
          description="When HR includes you in a cycle, your personal questionnaire appears here as a highlighted card."
          icon={<User className="h-4 w-4" />}
        />
        <AppEmptyState title={emptyMessage} className="mt-4" />
      </AppCard>
    );
  }

  return (
    <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'md:p-6')}>
      <AppSectionHeader
        title="Your self-review"
        description="This is your own questionnaire — one clear card per cycle so it stays easy to spot."
        icon={<User className="h-4 w-4" />}
      />
      <div className={uiCx('mt-6', uiSpacing.sectionStack)}>
        {pending.length > 0 ? (
          <div>
            <p className={uiCx(uiTypography.overline, 'mb-3 text-amber-900')}>To do</p>
            <div className={uiSpacing.sectionStack}>
              {pending.map((a) => (
                <SelfReviewHeroCard key={a.id} a={a} setOpenId={setOpenId} variant="pending" />
              ))}
            </div>
          </div>
        ) : (
          <p className={uiTypography.helper}>Nothing pending for your self-review.</p>
        )}
        {completed.length > 0 ? (
          <div>
            <p className={uiCx(uiTypography.overline, 'mb-3 text-green-800')}>Completed</p>
            <div className={uiSpacing.sectionStack}>
              {completed.map((a) => (
                <SelfReviewHeroCard
                  key={a.id}
                  a={a}
                  setOpenId={setOpenId}
                  variant="completed"
                  onGoToDirectorTab={onGoToDirectorTab}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppCard>
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
    return <p className={uiCx(uiTypography.helper, 'py-3')}>No rows.</p>;
  }

  const tableRows = rows.map((a) => {
    const done = isSubmitted(a);
    const period = formatCyclePeriod(a.cycle_period_start, a.cycle_period_end);
    return [
      <span key={`${a.id}-name`} className={uiTypography.sectionTitle}>
        {personLabel(a)}
      </span>,
      <div key={`${a.id}-cycle`} className="min-w-[12rem] whitespace-normal">
        <div className={uiTypography.sectionTitle}>{a.cycle_name || '—'}</div>
        {period ? <div className={uiTypography.helper}>{period}</div> : null}
        {a.cycle_status ? <div className={uiCx(uiTypography.helper, 'capitalize')}>{a.cycle_status}</div> : null}
      </div>,
      <span key={`${a.id}-due`}>{formatFriendlyDate(a.due_date)}</span>,
      <StatusBadge key={`${a.id}-status`} status={a.status || 'pending'} />,
      <div key={`${a.id}-action`} className="text-right">
        <AppButton type="button" size="sm" onClick={() => setOpenId(a.id)} disabled={done} variant={done ? 'secondary' : undefined}>
          {done ? 'Done' : 'Open'}
        </AppButton>
      </div>,
    ];
  });

  return (
    <AppTable
      columns={['Team member', 'Review cycle', 'Due', 'Status', '']}
      rows={tableRows}
      className="[&_td]:!whitespace-normal [&_td:last-child]:text-right"
    />
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
    <AppCard bodyClassName={uiSpacing.cardPadding}>
      <AppSectionHeader title={title} description={description} icon={icon} />
      <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
        {!rows.length ? (
          <AppEmptyState title={emptyMessage} />
        ) : (
          <>
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>To do</p>
              {pending.length ? (
                <TeamAssignmentTable rows={pending as AssignmentRow[]} setOpenId={setOpenId} />
              ) : (
                <p className={uiTypography.helper}>Everyone is caught up here.</p>
              )}
            </div>
            <div>
              <p className={uiCx(uiTypography.overline, 'mb-2')}>Completed</p>
              {completed.length ? (
                <TeamAssignmentTable rows={completed as AssignmentRow[]} setOpenId={setOpenId} />
              ) : (
                <p className={uiTypography.helper}>No completed reviews yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </AppCard>
  );
}

const mainTabItems = [
  { key: 'reviews', label: 'Reviews' },
  { key: 'director', label: 'Director 1:1' },
] as const;

type MainTab = 'reviews' | 'director';

export default function MyReviews() {
  const [mainTab, setMainTab] = useState<MainTab>('reviews');
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

  const pageHeader = (subtitle: string) => (
    <AppPageHeader
      title="My reviews"
      subtitle={subtitle}
      icon={<ClipboardCheck className="h-4 w-4" />}
      actions={
        <div className="text-right">
          <div className={uiTypography.overline}>Today</div>
          <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
        </div>
      }
    />
  );

  const reviewModalDescription = [
    openAssignment?.cycle_name,
    formatCyclePeriod(openAssignment?.cycle_period_start, openAssignment?.cycle_period_end),
  ]
    .filter(Boolean)
    .join(' · ');

  if (availLoading) {
    return (
      <main className={uiCx('min-h-full bg-gray-50', uiSpacing.pageY)}>
        <div className={uiCx('w-full', uiSpacing.pageStack)}>
          {pageHeader('Loading your review tasks…')}
          <AppCard bodyClassName={uiSpacing.cardPadding}>
            <div className={uiCx('h-28 animate-pulse bg-gray-100', uiRadius.control)} />
          </AppCard>
        </div>
      </main>
    );
  }

  if (reviewsAvailable && !reviewsAvailable.available) {
    return (
      <main className={uiCx('min-h-full bg-gray-50', uiSpacing.pageY)}>
        <div className={uiCx('w-full', uiSpacing.pageStack)}>
          {pageHeader('Self-reviews and supervisor questionnaires for active HR cycles.')}
          <AppCard bodyClassName={uiSpacing.cardPadding}>
            <p className={uiCx(uiTypography.body, 'mb-4')}>
              HR runs review cycles by team. When a cycle is active and you are included, tasks appear here — open{' '}
              <span className={uiTypography.sectionTitle}>My reviews</span> from the sidebar.
            </p>
            <AppEmptyState title="There is no employee review available for you at this time." />
          </AppCard>
        </div>
      </main>
    );
  }

  return (
    <main className={uiCx('min-h-full bg-gray-50', uiSpacing.pageY)}>
      <div className={uiCx('w-full pb-8', uiSpacing.pageStack)}>
        {pageHeader('Your self-review is highlighted below. Supervisor tasks for your team are listed in tables.')}

        <AppTabs tabs={[...mainTabItems]} value={mainTab} onChange={(key) => setMainTab(key as MainTab)} />

        {mainTab === 'director' ? (
          <AppCard bodyClassName={uiSpacing.cardPadding}>
            <MyReviewsDirectorMeetingTab />
          </AppCard>
        ) : null}

        {mainTab === 'reviews' ? (
          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
            {assignmentsLoading ? (
              <div className={uiCx('h-28 animate-pulse bg-gray-100', uiRadius.control)} />
            ) : !hasAny ? (
              <>
                <p className={uiTypography.body}>
                  When HR generates tasks, your <span className={uiTypography.sectionTitle}>self-review</span> shows as a
                  highlighted card. If you manage people, their reviews appear in the team list.
                </p>
                <AppEmptyState
                  title="No review tasks are assigned to you yet for an active cycle. Check back after HR creates tasks for the cycle."
                />
              </>
            ) : isSupervisor ? (
              <div className={uiSpacing.sectionStack}>
                <SelfReviewSpotlightSection
                  rows={selfAssignments as AssignmentRow[]}
                  setOpenId={setOpenId}
                  emptyMessage="No self-review row was created for you in this period (HR may still be setting up the cycle)."
                  onGoToDirectorTab={() => setMainTab('director')}
                />
                <TeamReviewSectionCard
                  title="Your direct reports"
                  description="These are the people who report to you. Open each row to answer the same questions they had for themselves; use the comment bubble beside a question when you want a supervisor note."
                  icon={<Users className="h-4 w-4" />}
                  rows={subordinateAssignments as AssignmentRow[]}
                  setOpenId={setOpenId}
                  emptyMessage="No supervisor reviews for your direct reports yet. They appear here after HR generates assignments."
                />
                {otherAssignments.length > 0 ? (
                  <TeamReviewSectionCard
                    title="Other reviews assigned to you"
                    description="You are the reviewer, but the employee is not your direct report in the org chart."
                    icon={<ClipboardCheck className="h-4 w-4" />}
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
                onGoToDirectorTab={() => setMainTab('director')}
              />
            )}
          </AppCard>
        ) : null}

        <AppFormModal
          open={!!openId}
          onClose={() => setOpenId('')}
          layout="detail"
          size="lg"
          title={modalTitle}
          description={reviewModalDescription || undefined}
          quickInfo={<EmployeeReviewRatingScalePanel />}
          quickInfoLabel="Rating scale"
          footer={
            <div className={uiCx(uiSpacing.sectionStack, 'w-full')}>
              <p className={uiCx(uiTypography.helper, 'text-center sm:text-left')}>
                After you press <span className={uiTypography.sectionTitle}>Submit</span>, this review is sent in. You
                cannot change answers later from this screen.
              </p>
              <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
                <AppButton variant="secondary" type="button" onClick={() => setOpenId('')}>
                  Cancel
                </AppButton>
                <AppButton type="button" onClick={submit}>
                  Submit
                </AppButton>
              </div>
            </div>
          }
        >
          {!definition ? (
            <div className={uiCx(uiSpacing.cardPadding, 'py-10 text-center', uiTypography.helper)}>Loading form…</div>
          ) : (
            <>
              {openAssignment?.status ? (
                <div className={uiCx(uiSpacing.cardPadding, 'pb-0')}>
                  <StatusBadge status={openAssignment.status} />
                </div>
              ) : null}
              <EmployeeReviewWelcomeOverlay
                open={!reviewIntroAcknowledged}
                variant={showSupervisorCommentFields ? 'supervisor' : 'self'}
                revieweeDisplayName={showSupervisorCommentFields ? revieweeModalName : undefined}
                onContinue={() => setReviewIntroAcknowledged(true)}
              />
              <div className={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
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
            </>
          )}
        </AppFormModal>
      </div>
    </main>
  );
}
