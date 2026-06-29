import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { withFileAccessToken } from '@/lib/api';
import type { TrainingCourse, TrainingData } from '@/hooks/useMyTrainingData';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppTabs,
  uiCx,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type CourseTab = 'available' | 'required' | 'in_progress' | 'completed' | 'expired';

const COURSE_TABS = [
  { key: 'available' as const, label: 'Browse' },
  { key: 'required' as const, label: 'Required' },
  { key: 'in_progress' as const, label: 'In Progress' },
  { key: 'completed' as const, label: 'Completed' },
  { key: 'expired' as const, label: 'Expired' },
];

type Props = {
  training?: TrainingData;
  isLoading?: boolean;
};

function courseCount(training: TrainingData | undefined, tab: CourseTab): number {
  if (!training) return 0;
  return training[tab]?.length ?? 0;
}

function learnerStatusBadge(
  tab: CourseTab,
  course: TrainingCourse,
): { label: string; variant: 'success' | 'warning' | 'info' | 'danger' | 'neutral' } {
  if (tab === 'expired') return { label: 'Expired', variant: 'danger' };
  if (tab === 'completed' || course.completed_at) return { label: 'Completed', variant: 'success' };
  if (tab === 'in_progress' || (course.progress_percent > 0 && !course.completed_at)) {
    return { label: 'In progress', variant: 'warning' };
  }
  if (tab === 'required') return { label: 'Required', variant: 'info' };
  return { label: 'Available', variant: 'neutral' };
}

function formatDuration(minutes?: number): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function courseProgressPercent(course: TrainingCourse, tab: CourseTab): number {
  if (course.completed_at || tab === 'completed') return 100;
  return Math.min(100, Math.max(0, course.progress_percent ?? 0));
}

function CourseCard({
  course,
  activeTab,
  onOpen,
}: {
  course: TrainingCourse;
  activeTab: CourseTab;
  onOpen: (courseId: string) => void;
}) {
  const status = learnerStatusBadge(activeTab, course);
  const duration = formatDuration(course.estimated_duration_minutes);
  const progressPercent = courseProgressPercent(course, activeTab);
  const isComplete = progressPercent >= 100;

  return (
    <AppCard
      className={uiCx(
        uiShadows.card,
        'group flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md',
      )}
      bodyClassName="!p-0 flex flex-1 flex-col"
      footer={
        <AppButton type="button" className="w-full" onClick={() => onOpen(course.id)}>
          {course.completed_at && activeTab === 'expired' ? 'Renew course' : 'Open course'}
        </AppButton>
      }
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
          <AppBadge variant={status.variant}>{status.label}</AppBadge>
        </div>
        <h2 className={uiCx(uiTypography.sectionTitle, 'mb-1 line-clamp-2 text-lg')}>{course.title}</h2>
        {course.description ? (
          <p className={uiCx(uiTypography.body, 'mb-3 line-clamp-2 text-gray-600')}>{course.description}</p>
        ) : (
          <p className={uiCx(uiTypography.helper, 'mb-3 italic text-gray-400')}>No description</p>
        )}
        <div className="mb-3">
          <div className={uiCx('mb-1 flex justify-between', uiTypography.helper)}>
            <span>Progress</span>
            <span className="font-medium text-gray-700">{progressPercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={uiCx(
                'h-full rounded-full transition-all',
                isComplete ? 'bg-emerald-500' : progressPercent > 0 ? 'bg-brand-red' : 'bg-transparent',
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div
          className={uiCx(
            'mt-auto flex items-center justify-between border-t border-gray-100 pt-3',
            uiTypography.helper,
          )}
        >
          <span>{duration ?? '—'}</span>
          {course.certificate_expires_at ? (
            <span className={activeTab === 'expired' ? 'font-medium text-amber-700' : undefined}>
              Expires {new Date(course.certificate_expires_at).toLocaleDateString()}
            </span>
          ) : course.completed_at ? (
            <span className="text-emerald-700">Finished</span>
          ) : (
            <span>{progressPercent > 0 ? 'In progress' : 'Not started'}</span>
          )}
        </div>
      </div>
    </AppCard>
  );
}

export default function TrainingCoursesTab({ training, isLoading }: Props) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<CourseTab>('required');

  const tabs = COURSE_TABS.map((t) => ({
    ...t,
    label: `${t.label} (${courseCount(training, t.key)})`,
  }));

  const courses = training?.[activeTab] ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <AppCard key={i} className="h-64 animate-pulse" bodyClassName="h-full bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className={uiCx('space-y-4')}>
      <AppTabs tabs={tabs} value={activeTab} onChange={(key) => setActiveTab(key as CourseTab)} />
      {courses.length === 0 ? (
        <AppEmptyState
          title="No courses in this category"
          description="Browse available courses or check Required for assigned training."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              activeTab={activeTab}
              onOpen={(id) => navigate(`/training/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
