import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { useMyTrainingData } from '@/hooks/useMyTrainingData';
import TrainingOverviewTab from '@/components/training/TrainingOverviewTab';
import TrainingCoursesTab from '@/components/training/TrainingCoursesTab';
import TrainingMyRecordsTab from '@/components/training/TrainingMyRecordsTab';
import TrainingMyMatrixTab from '@/components/training/TrainingMyMatrixTab';
import TrainingCertificates from '@/pages/TrainingCertificates';
import {
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppTabs,
  uiCx,
  uiSpacing,
} from '@/components/ui';

export type TrainingHubTab = 'overview' | 'courses' | 'records' | 'certificates' | 'matrix';

const PAGE_TABS = [
  { key: 'overview' as const, label: 'Overview' },
  { key: 'courses' as const, label: 'Internal courses' },
  { key: 'records' as const, label: 'My schedule & records' },
  { key: 'certificates' as const, label: 'Certificates' },
  { key: 'matrix' as const, label: 'My matrix' },
];

const VALID_TABS = new Set<string>(PAGE_TABS.map((t) => t.key));

function parseTab(raw: string | null): TrainingHubTab {
  if (raw && VALID_TABS.has(raw)) return raw as TrainingHubTab;
  return 'overview';
}

function canViewTrainingDashboard(me: { roles?: string[]; permissions?: string[] } | undefined): boolean {
  if (!me) return false;
  const roles = me.roles || [];
  const perms = me.permissions || [];
  return (
    roles.includes('admin') ||
    perms.includes('training:manage') ||
    perms.includes('users:write') ||
    perms.includes('users:read') ||
    perms.includes('hr:users:read') ||
    perms.includes('hr:users:view:general')
  );
}

export default function Training() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageTab, setPageTab] = useState<TrainingHubTab>(() => parseTab(searchParams.get('tab')));

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id: string; roles?: string[]; permissions?: string[] }>('GET', '/auth/me'),
  });

  const data = useMyTrainingData();
  const showDashboardLink = canViewTrainingDashboard(me);

  useEffect(() => {
    setPageTab(parseTab(searchParams.get('tab')));
  }, [searchParams]);

  const setTab = useCallback(
    (tab: TrainingHubTab) => {
      setPageTab(tab);
      setSearchParams(tab === 'overview' ? {} : { tab }, { replace: true });
    },
    [setSearchParams],
  );

  const tabsWithCounts = useMemo(
    () =>
      PAGE_TABS.map((t) => {
        if (t.key === 'courses' && data.summaryCounts.required > 0) {
          return { ...t, label: `${t.label} (${data.summaryCounts.required} req.)` };
        }
        if (t.key === 'certificates' && data.summaryCounts.certificates > 0) {
          return { ...t, label: `${t.label} (${data.summaryCounts.certificates})` };
        }
        return t;
      }),
    [data.summaryCounts],
  );

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        icon={<GraduationCap className="h-4 w-4" />}
        title="My Training"
        subtitle={
          <>
            Your personal training hub. Courses, certificates, schedule, and compliance matrix.
          </>
        }
      />

      <AppCard bodyClassName="!py-3">
        <AppTabs tabs={tabsWithCounts} value={pageTab} onChange={(key) => setTab(key as TrainingHubTab)} />
      </AppCard>

      {data.isLoading && !data.training && !data.records.length ? (
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        </div>
      ) : null}

      {data.isError ? (
        <AppEmptyState
          title="Could not load training data"
          description={data.errorMessage || 'Please refresh the page or try again later.'}
        />
      ) : null}

      {!data.isLoading || data.training || data.records.length ? (
        <>
      {pageTab === 'overview' ? (
        <TrainingOverviewTab data={data} onGoToTab={(tab) => setTab(tab as TrainingHubTab)} />
      ) : null}

      {pageTab === 'courses' ? (
        <TrainingCoursesTab training={data.training} isLoading={data.isLoading} />
      ) : null}

      {pageTab === 'records' ? (
        <TrainingMyRecordsTab userId={data.userId} records={data.records} isLoading={data.isLoading} />
      ) : null}

      {pageTab === 'certificates' ? (
        <TrainingCertificates
          embedded
          certificates={data.certificates}
          isLoading={data.isLoading}
          isError={data.certificatesQuery.isError}
          errorMessage={data.errorMessage}
        />
      ) : null}

      {pageTab === 'matrix' ? (
        <TrainingMyMatrixTab matrixItems={data.matrixItems} isLoading={data.isLoading} />
      ) : null}
        </>
      ) : null}
    </div>
  );
}
