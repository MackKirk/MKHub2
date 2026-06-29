import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  employeeActivityAuditQuickInfo,
  employeeActivitySignInQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppSectionHeader,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const USER_ACTIVITY_LOG_TZ = 'America/Vancouver';

function parseUtcForUserActivity(iso: string): Date {
  const s = iso.trim();
  if (!s) return new Date(NaN);
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  return new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
}

function formatUserActivityTime(iso: string): string {
  const d = parseUtcForUserActivity(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: USER_ACTIVITY_LOG_TZ,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(d);
}

type ActivityPaginated<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

type UserActivityLogResponse = {
  last_login_at: string | null;
  logins: ActivityPaginated<{
    id: string;
    timestamp_utc: string;
    title: string;
    path: string | null;
    request_id: string | null;
  }>;
  audit: ActivityPaginated<{
    id: string;
    timestamp_utc: string;
    entity_type: string;
    entity_id: string;
    entity_display: string | null;
    action: string;
    source: string | null;
  }>;
};

type LoginActivityRow = UserActivityLogResponse['logins']['items'][number];

type AuditActivityDetail = {
  id: string;
  timestamp_utc: string;
  entity_type: string;
  entity_id: string;
  entity_display: string | null;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  source: string | null;
  changes_json: Record<string, unknown> | unknown[] | null;
  context: Record<string, unknown> | null;
};

function activityAuditTitle(row: UserActivityLogResponse['audit']['items'][0]): string {
  const label = row.entity_display || row.entity_type.replace(/_/g, ' ');
  return `${row.action} · ${label}`;
}

function ActivityDetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className={uiCx(
        'grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-2.5',
      )}
    >
      <dt className={uiTypography.helper}>{label}</dt>
      <dd className={uiCx(uiTypography.body, 'min-w-0 break-words font-medium text-gray-900')}>{children}</dd>
    </div>
  );
}

function ActivityPager({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= 0) return null;
  return (
    <div className={uiCx(uiLayout.actionsRow, 'mt-3 justify-between')}>
      <span className={uiTypography.helper}>
        Page {page} of {Math.max(totalPages, 1)} · {total} total
      </span>
      <div className={uiCx(uiLayout.actionsRow, 'gap-2')}>
        <AppButton type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={onPrev}>
          Previous
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={totalPages <= 0 || page >= totalPages}
          onClick={onNext}
        >
          Next
        </AppButton>
      </div>
    </div>
  );
}

export type UserActivityTabProps = {
  userId: string;
};

export function UserActivitySection({ userId }: UserActivityTabProps) {
  const [loginsPage, setLoginsPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const pageSize = 15;

  const [loginModal, setLoginModal] = useState<LoginActivityRow | null>(null);
  const [auditModalId, setAuditModalId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['user-activity-log', userId, loginsPage, auditPage, pageSize],
    queryFn: () =>
      api<UserActivityLogResponse>(
        'GET',
        `/users/${encodeURIComponent(userId)}/activity-log?logins_page=${loginsPage}&logins_page_size=${pageSize}&audit_page=${auditPage}&audit_page_size=${pageSize}`,
      ),
    enabled: !!userId,
  });

  useEffect(() => {
    if (!data) return;
    if (data.logins.total_pages > 0 && loginsPage > data.logins.total_pages) {
      setLoginsPage(data.logins.page);
    }
    if (data.audit.total_pages > 0 && auditPage > data.audit.total_pages) {
      setAuditPage(data.audit.page);
    }
  }, [data, loginsPage, auditPage]);

  const { data: auditDetail, isLoading: auditDetailLoading } = useQuery({
    queryKey: ['user-activity-audit-detail', userId, auditModalId],
    queryFn: () =>
      api<AuditActivityDetail>(
        'GET',
        `/users/${encodeURIComponent(userId)}/activity-log/audit/${encodeURIComponent(auditModalId!)}`,
      ),
    enabled: !!userId && !!auditModalId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 pb-24">
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
        </AppCard>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 pb-24">
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <p className={uiCx(uiTypography.body, 'text-red-600')}>
            Could not load activity. Check that you have the &quot;View Activity Tab&quot; permission.
          </p>
        </AppCard>
      </div>
    );
  }

  if (!data) return null;

  const lg = data.logins;
  const au = data.audit;

  return (
    <>
      <div className="space-y-6 pb-24">
        <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
          <AppSectionHeader
            title="Activity"
            description="Sign-in history and audit trail for actions this employee performed in the system."
            {...appSectionPresetProps('description')}
          />

          <AppCard className="mt-4" bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <AppSectionHeader title="Last sign-in" description="Most recent successful sign-in (Vancouver time)." />
            <p className={uiCx(uiTypography.body, 'mt-2 font-medium text-gray-900')}>
              {data.last_login_at ? formatUserActivityTime(data.last_login_at) : '—'}
            </p>
          </AppCard>

          <div className="mt-6 space-y-6">
            <section>
              <AppSectionHeader
                title="Sign-ins"
                description="Click a row to view path and request details."
                className="mb-3"
              />
              {lg.total === 0 ? (
                <AppEmptyState
                  title="No sign-in events yet"
                  description="Sign-in events appear here after this employee logs into the system."
                  className="border-0 bg-transparent p-0 py-4 shadow-none"
                />
              ) : (
                <>
                  <div className={uiCx('rounded-xl border bg-gray-50/80', uiSpacing.cardPadding)}>
                    <div className="flex flex-col gap-2 overflow-x-auto">
                      <AppSortableEntityList layout="flat">
                        <AppSortableEntityListHeader preset="employeeActivityLog" variant="flat">
                          <AppSortableEntityListSortColumn
                            label="Event"
                            column="event"
                            sortBy="event"
                            sortDir="asc"
                            onSort={() => {}}
                            sortable={false}
                          />
                          <AppSortableEntityListSortColumn
                            label="Time"
                            column="time"
                            sortBy="time"
                            sortDir="asc"
                            onSort={() => {}}
                            sortable={false}
                          />
                        </AppSortableEntityListHeader>
                        <AppSortableEntityListFlatBody preset="employeeActivityLog">
                          {lg.items.map((row) => (
                            <AppSortableEntityListRow
                              key={row.id}
                              as="div"
                              variant="flat"
                              preset="employeeActivityLog"
                              className="group"
                              role="button"
                              tabIndex={0}
                              onClick={() => setLoginModal(row)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setLoginModal(row);
                                }
                              }}
                            >
                              <span
                                className={uiCx(
                                  'min-w-0 truncate text-xs font-medium text-gray-900 transition-colors group-hover:text-[#7f1010]',
                                )}
                              >
                                {row.title}
                              </span>
                              <span className={uiCx(uiTypography.helper, 'min-w-0 truncate')}>
                                {formatUserActivityTime(row.timestamp_utc)}
                              </span>
                            </AppSortableEntityListRow>
                          ))}
                        </AppSortableEntityListFlatBody>
                      </AppSortableEntityList>
                    </div>
                  </div>
                  <ActivityPager
                    page={lg.page}
                    totalPages={lg.total_pages}
                    total={lg.total}
                    onPrev={() => setLoginsPage((p) => Math.max(1, p - 1))}
                    onNext={() => setLoginsPage((p) => (lg.total_pages ? Math.min(lg.total_pages, p + 1) : p))}
                  />
                </>
              )}
            </section>

            <section>
              <AppSectionHeader
                title="Audit"
                description="System actions attributed to this employee. Click a row for change details."
                className="mb-3"
              />
              {au.total === 0 ? (
                <AppEmptyState
                  title="No audit entries"
                  description="Audit records appear when this employee creates or updates data in the system."
                  className="border-0 bg-transparent p-0 py-4 shadow-none"
                />
              ) : (
                <>
                  <div className={uiCx('rounded-xl border bg-gray-50/80', uiSpacing.cardPadding)}>
                    <div className="flex flex-col gap-2 overflow-x-auto">
                      <AppSortableEntityList layout="flat">
                        <AppSortableEntityListHeader preset="employeeActivityLog" variant="flat">
                          <AppSortableEntityListSortColumn
                            label="Action"
                            column="action"
                            sortBy="action"
                            sortDir="asc"
                            onSort={() => {}}
                            sortable={false}
                          />
                          <AppSortableEntityListSortColumn
                            label="Time"
                            column="time"
                            sortBy="time"
                            sortDir="asc"
                            onSort={() => {}}
                            sortable={false}
                          />
                        </AppSortableEntityListHeader>
                        <AppSortableEntityListFlatBody preset="employeeActivityLog">
                          {au.items.map((row) => (
                            <AppSortableEntityListRow
                              key={row.id}
                              as="div"
                              variant="flat"
                              preset="employeeActivityLog"
                              className="group"
                              role="button"
                              tabIndex={0}
                              onClick={() => setAuditModalId(row.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setAuditModalId(row.id);
                                }
                              }}
                            >
                              <span
                                className={uiCx(
                                  'min-w-0 truncate text-xs font-medium text-gray-900 transition-colors group-hover:text-[#7f1010]',
                                )}
                                title={activityAuditTitle(row)}
                              >
                                {activityAuditTitle(row)}
                              </span>
                              <span className={uiCx(uiTypography.helper, 'min-w-0 truncate')}>
                                {formatUserActivityTime(row.timestamp_utc)}
                              </span>
                            </AppSortableEntityListRow>
                          ))}
                        </AppSortableEntityListFlatBody>
                      </AppSortableEntityList>
                    </div>
                  </div>
                  <ActivityPager
                    page={au.page}
                    totalPages={au.total_pages}
                    total={au.total}
                    onPrev={() => setAuditPage((p) => Math.max(1, p - 1))}
                    onNext={() => setAuditPage((p) => (au.total_pages ? Math.min(au.total_pages, p + 1) : p))}
                  />
                </>
              )}
            </section>
          </div>
        </AppCard>
      </div>

      {loginModal ? (
        <AppFormModal
          open
          onClose={() => setLoginModal(null)}
          layout="detail"
          size="sm"
          title="Sign-in"
          description={loginModal.title}
          quickInfo={employeeActivitySignInQuickInfo}
          bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setLoginModal(null)}>
                Close
              </AppButton>
            </div>
          }
        >
          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <dl className="min-w-0">
              <ActivityDetailField label="Time (Vancouver)">
                <span className="font-mono font-normal">{formatUserActivityTime(loginModal.timestamp_utc)}</span>
              </ActivityDetailField>
              <ActivityDetailField label="Path">
                <span className="break-all font-mono font-normal text-xs">{loginModal.path || '—'}</span>
              </ActivityDetailField>
              {loginModal.request_id ? (
                <ActivityDetailField label="Request ID">
                  <span className="break-all font-mono font-normal text-xs">{loginModal.request_id}</span>
                </ActivityDetailField>
              ) : null}
            </dl>
          </AppCard>
        </AppFormModal>
      ) : null}

      {auditModalId ? (
        <AppFormModal
          open
          onClose={() => setAuditModalId(null)}
          layout="detail"
          size="md"
          title="Audit action"
          description={
            auditDetail
              ? activityAuditTitle({
                  id: auditDetail.id,
                  timestamp_utc: auditDetail.timestamp_utc,
                  entity_type: auditDetail.entity_type,
                  entity_id: auditDetail.entity_id,
                  entity_display: auditDetail.entity_display,
                  action: auditDetail.action,
                  source: auditDetail.source,
                })
              : 'Loading…'
          }
          quickInfo={employeeActivityAuditQuickInfo}
          bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setAuditModalId(null)}>
                Close
              </AppButton>
            </div>
          }
        >
          {auditDetailLoading ? (
            <div className={uiCx('h-16 animate-pulse bg-gray-100', uiRadius.control)} />
          ) : auditDetail ? (
            <div className="space-y-4">
              <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
                <dl className="min-w-0">
                  <ActivityDetailField label="Time">{formatUserActivityTime(auditDetail.timestamp_utc)}</ActivityDetailField>
                  <ActivityDetailField label="Action">{auditDetail.action}</ActivityDetailField>
                  <ActivityDetailField label="Entity">
                    {auditDetail.entity_display || auditDetail.entity_type}{' '}
                    <span className={uiCx(uiTypography.helper, 'font-mono font-normal')}>
                      ({auditDetail.entity_id})
                    </span>
                  </ActivityDetailField>
                  {auditDetail.source ? (
                    <ActivityDetailField label="Source">{auditDetail.source}</ActivityDetailField>
                  ) : null}
                </dl>
              </AppCard>
              {auditDetail.changes_json != null &&
              (Array.isArray(auditDetail.changes_json)
                ? auditDetail.changes_json.length > 0
                : typeof auditDetail.changes_json === 'object' &&
                  Object.keys(auditDetail.changes_json).length > 0) ? (
                <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
                  <AppSectionHeader title="Changes" />
                  <pre
                    className={uiCx(
                      uiTypography.helper,
                      uiBorders.subtle,
                      'mt-3 max-h-40 overflow-x-auto rounded-lg bg-gray-50/80 p-3',
                    )}
                  >
                    {JSON.stringify(auditDetail.changes_json, null, 2)}
                  </pre>
                </AppCard>
              ) : null}
              {auditDetail.context && Object.keys(auditDetail.context).length > 0 ? (
                <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
                  <AppSectionHeader title="Context" />
                  <pre
                    className={uiCx(
                      uiTypography.helper,
                      uiBorders.subtle,
                      'mt-3 max-h-32 overflow-x-auto rounded-lg bg-gray-50/80 p-3',
                    )}
                  >
                    {JSON.stringify(auditDetail.context, null, 2)}
                  </pre>
                </AppCard>
              ) : null}
            </div>
          ) : (
            <p className={uiCx(uiTypography.body, 'text-red-600')}>Could not load details.</p>
          )}
        </AppFormModal>
      ) : null}
    </>
  );
}

export default UserActivitySection;
