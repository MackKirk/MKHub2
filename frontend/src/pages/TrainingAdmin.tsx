import { useQuery } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';

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

const statCard =
  'rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm transition-shadow hover:shadow-md';

export default function TrainingAdmin() {
  const [statusFilter, setStatusFilter] = useState<string>('');
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

  const filterBtn = (active: boolean) =>
    `px-4 py-2 rounded-full text-sm font-semibold transition-all border ${
      active
        ? 'border-brand-red bg-brand-red text-white shadow-sm'
        : 'border-slate-200 bg-white text-gray-700 hover:border-slate-300 hover:bg-slate-50'
    }`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Training administration</h1>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Manage courses, modules, and content for your team.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Today</div>
              <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
            </div>
            <Link
              to="/training/admin/new"
              className="inline-flex items-center justify-center rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-red700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
            >
              + Create course
            </Link>
          </div>
        </div>
      </div>

      {status && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className={statCard}>
            <div className="text-2xl font-bold tabular-nums text-gray-900">{status.total_courses}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Total courses</div>
          </div>
          <div className={statCard}>
            <div className="text-2xl font-bold tabular-nums text-emerald-600">{status.published_courses}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Published</div>
          </div>
          <div className={statCard}>
            <div className="text-2xl font-bold tabular-nums text-slate-600">{status.draft_courses}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Drafts</div>
          </div>
          <div className={statCard}>
            <div className="text-2xl font-bold tabular-nums text-sky-600">{status.total_completions}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Completions</div>
          </div>
          <div className={statCard}>
            <div className="text-2xl font-bold tabular-nums text-amber-600">{status.overdue_certificates}</div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Overdue certs</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setStatusFilter('')} className={filterBtn(statusFilter === '')}>
          All
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('published')}
          className={filterBtn(statusFilter === 'published')}
        >
          Published
        </button>
        <button type="button" onClick={() => setStatusFilter('draft')} className={filterBtn(statusFilter === 'draft')}>
          Drafts
        </button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100/80" />
          ))}
        </div>
      ) : courses && courses.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <article
              key={course.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              {course.thumbnail_file_id ? (
                <img
                  src={withFileAccessToken(`/files/${course.thumbnail_file_id}/thumbnail?w=400`)}
                  alt=""
                  className="h-40 w-full object-cover"
                />
              ) : (
                <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200/80">
                  <span className="text-4xl opacity-40" aria-hidden>
                    📚
                  </span>
                </div>
              )}
              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  {course.category_label ? (
                    <span className="rounded-md bg-brand-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-red">
                      {course.category_label}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                      course.status === 'published'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {course.status}
                  </span>
                </div>
                <h2 className="mb-1 line-clamp-2 text-lg font-bold text-gray-900">{course.title}</h2>
                {course.description ? (
                  <p className="mb-3 line-clamp-2 text-sm text-gray-600">{course.description}</p>
                ) : (
                  <p className="mb-3 text-sm italic text-gray-400">No description</p>
                )}
                <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-gray-500">
                  <span>{course.module_count} modules</span>
                  <span>{course.lesson_count} lessons</span>
                </div>
                <Link
                  to={`/training/admin/${course.id}`}
                  className="mt-3 block w-full rounded-lg bg-brand-red py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-red700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
                >
                  Edit course
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center">
          <p className="text-lg font-medium text-gray-700">No courses yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Create a course to add modules, lessons, quizzes, and publish to your team.
          </p>
          <Link
            to="/training/admin/new"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-red px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-red700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            Create your first course
          </Link>
        </div>
      )}
    </div>
  );
}
