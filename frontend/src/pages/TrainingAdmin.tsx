import { useQuery } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { BookOpen, Settings } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppListCreateItem,
  AppPageHeader,
  AppTabCountBadge,
  getAppTabButtonClassName,
  uiColors,
  uiCx,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type Course = {
  id: string;
  title: string;
  description?: string;
  status: string;
  category_label?: string;
  thumbnail_file_id?: string;
  module_count: number;
  lesson_count: number;
  created_at: string;
  last_published_at?: string;
};

type StatusData = {
  total_courses: number;
  published_courses: number;
  draft_courses: number;
  total_completions: number;
  overdue_certificates: number;
};

function courseStatusVariant(status: string): 'success' | 'neutral' {
  return status === 'published' ? 'success' : 'neutral';
}

export default function TrainingAdmin() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data: me } = useQuery<{ roles?: string[]; permissions?: string[] }>({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: string[]; permissions?: string[] }>('GET', '/auth/me'),
  });
  const canEditAdmin =
    (me?.roles || []).includes('admin') ||
    (me?.permissions || []).includes('training:admin:write') ||
    (me?.permissions || []).includes('training:manage') ||
    (me?.permissions || []).includes('users:write');
  const { data: courses, isLoading } = useQuery<Course[]>({
    queryKey: ['training-admin-courses', statusFilter],
    queryFn: () =>
      api<Course[]>('GET', `/training/admin/courses${statusFilter ? `?status=${statusFilter}` : ''}`),
  });

  const { data: status } = useQuery<StatusData>({
    queryKey: ['training-status'],
    queryFn: () => api<StatusData>('GET', '/training/admin/status'),
  });

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const quickFilterSegments = useMemo(
    () => [
      {
        key: 'all',
        label: 'All',
        active: statusFilter === '',
        count: status?.total_courses,
        onClick: () => setStatusFilter(''),
      },
      {
        key: 'published',
        label: 'Published',
        active: statusFilter === 'published',
        count: status?.published_courses,
        onClick: () => setStatusFilter('published'),
      },
      {
        key: 'draft',
        label: 'Drafts',
        active: statusFilter === 'draft',
        count: status?.draft_courses,
        onClick: () => setStatusFilter('draft'),
      },
    ],
    [statusFilter, status],
  );

  const statItems = status
    ? [
        { label: 'Total courses', value: status.total_courses, valueClass: uiColors.textStrong },
        { label: 'Published', value: status.published_courses, valueClass: 'text-emerald-600' },
        { label: 'Drafts', value: status.draft_courses, valueClass: 'text-slate-600' },
        { label: 'Completions', value: status.total_completions, valueClass: 'text-sky-600' },
        { label: 'Overdue certs', value: status.overdue_certificates, valueClass: 'text-amber-600' },
      ]
    : [];

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Training administration"
        subtitle="Manage courses, modules, and content for your team."
        icon={<Settings className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      {status ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {statItems.map((item) => (
            <AppCard key={item.label} className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
              <div className={uiCx('text-2xl font-bold tabular-nums', item.valueClass)}>{item.value}</div>
              <div className={uiCx(uiTypography.overline, 'mt-1')}>{item.label}</div>
            </AppCard>
          ))}
        </div>
      ) : null}

      <AppCard bodyClassName="!p-0">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className={uiCx(uiTypography.overline, 'shrink-0 leading-none')}>Status:</span>
          <div className="flex flex-wrap items-center gap-2">
            {quickFilterSegments.map((segment) => (
              <button
                key={segment.key}
                type="button"
                onClick={segment.onClick}
                className={getAppTabButtonClassName(segment.active)}
                aria-pressed={segment.active}
              >
                <span>{segment.label}</span>
                {typeof segment.count === 'number' ? (
                  <AppTabCountBadge count={segment.count} isActive={segment.active} />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </AppCard>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <AppCard key={i} className="h-64 animate-pulse" bodyClassName="h-full bg-gray-100" />
          ))}
        </div>
      ) : courses && courses.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {canEditAdmin ? (
            <AppListCreateItem
              label="Create course"
              layout="card"
              className="min-h-[200px]"
              onClick={() => navigate('/training/admin/new')}
            />
          ) : null}
          {courses.map((course) => (
            <AppCard
              key={course.id}
              className={uiCx(
                uiShadows.card,
                'group flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md',
              )}
              bodyClassName="!p-0 flex flex-1 flex-col"
              footer={canEditAdmin ? (
                <AppButton
                  type="button"
                  className="w-full"
                  onClick={() => navigate(`/training/admin/${course.id}`)}
                >
                  Edit course
                </AppButton>
              ) : undefined}
            >
              {course.thumbnail_file_id ? (
                <img
                  src={withFileAccessToken(`/files/${course.thumbnail_file_id}/thumbnail?w=400`)}
                  alt=""
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div
                  className={uiCx(
                    'flex h-40 w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200/80',
                  )}
                >
                  <BookOpen className="h-10 w-10 text-gray-400 opacity-60" aria-hidden />
                </div>
              )}
              <div className={uiCx(uiSpacing.cardPadding, 'flex flex-1 flex-col')}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  {course.category_label ? (
                    <AppBadge className="bg-brand-red/10 text-brand-red">{course.category_label}</AppBadge>
                  ) : (
                    <span />
                  )}
                  <AppBadge variant={courseStatusVariant(course.status)}>{course.status}</AppBadge>
                </div>
                <h2 className={uiCx(uiTypography.sectionTitle, 'mb-1 line-clamp-2 text-lg')}>{course.title}</h2>
                {course.description ? (
                  <p className={uiCx(uiTypography.body, 'mb-3 line-clamp-2 text-gray-600')}>{course.description}</p>
                ) : (
                  <p className={uiCx(uiTypography.helper, 'mb-3 italic text-gray-400')}>No description</p>
                )}
                <div
                  className={uiCx(
                    'mt-auto flex items-center justify-between border-t border-gray-100 pt-3',
                    uiTypography.helper,
                  )}
                >
                  <span>{course.module_count} modules</span>
                  <span>{course.lesson_count} lessons</span>
                </div>
              </div>
            </AppCard>
          ))}
        </div>
      ) : (
        <AppEmptyState
          title="No courses yet"
          description="Create a course to add modules, lessons, quizzes, and publish to your team."
          action={canEditAdmin ? (
            <AppButton onClick={() => navigate('/training/admin/new')}>Create your first course</AppButton>
          ) : undefined}
        />
      )}
    </div>
  );
}
