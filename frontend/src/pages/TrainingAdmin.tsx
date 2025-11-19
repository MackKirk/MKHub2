import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useState } from 'react';

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

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Training Administration</div>
          <div className="text-sm opacity-90">Manage courses, modules, and training content.</div>
        </div>
        <Link
          to="/training/admin/new"
          className="px-4 py-2 bg-white text-[#d11616] rounded-lg font-semibold hover:bg-gray-100 transition-colors"
        >
          + Create Course
        </Link>
      </div>

      {/* Statistics Cards */}
      {status && (
        <div className="grid md:grid-cols-5 gap-4 mb-6">
          <div className="border rounded-xl bg-white p-4">
            <div className="text-2xl font-bold">{status.total_courses}</div>
            <div className="text-sm text-gray-600">Total Courses</div>
          </div>
          <div className="border rounded-xl bg-white p-4">
            <div className="text-2xl font-bold text-green-600">{status.published_courses}</div>
            <div className="text-sm text-gray-600">Published</div>
          </div>
          <div className="border rounded-xl bg-white p-4">
            <div className="text-2xl font-bold text-gray-600">{status.draft_courses}</div>
            <div className="text-sm text-gray-600">Drafts</div>
          </div>
          <div className="border rounded-xl bg-white p-4">
            <div className="text-2xl font-bold text-blue-600">{status.total_completions}</div>
            <div className="text-sm text-gray-600">Completions</div>
          </div>
          <div className="border rounded-xl bg-white p-4">
            <div className="text-2xl font-bold text-orange-600">{status.overdue_certificates}</div>
            <div className="text-sm text-gray-600">Overdue</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            statusFilter === ''
              ? 'bg-[#7f1010] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setStatusFilter('published')}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            statusFilter === 'published'
              ? 'bg-[#7f1010] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Published
        </button>
        <button
          onClick={() => setStatusFilter('draft')}
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            statusFilter === 'draft'
              ? 'bg-[#7f1010] text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Drafts
        </button>
      </div>

      {/* Course List */}
      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : courses && courses.length > 0 ? (
        <div className="grid md:grid-cols-3 gap-4">
          {courses.map((course) => (
            <div
              key={course.id}
              className="border rounded-xl bg-white overflow-hidden hover:shadow-lg transition-shadow"
            >
              {course.thumbnail_file_id ? (
                <img
                  src={`/files/${course.thumbnail_file_id}/thumbnail?w=400`}
                  alt={course.title}
                  className="w-full h-40 object-cover"
                />
              ) : (
                <div className="w-full h-40 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                  <span className="text-gray-400 text-4xl">📚</span>
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  {course.category_label && (
                    <span className="text-xs font-semibold text-[#7f1010] uppercase">
                      {course.category_label}
                    </span>
                  )}
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded ${
                      course.status === 'published'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {course.status}
                  </span>
                </div>
                <h3 className="font-bold text-lg mb-2 line-clamp-2">{course.title}</h3>
                {course.description && (
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{course.description}</p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span>{course.module_count} modules</span>
                  <span>{course.lesson_count} lessons</span>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/training/admin/${course.id}`}
                    className="flex-1 text-center px-3 py-2 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors text-sm"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No courses found.</p>
          <Link
            to="/training/admin/new"
            className="inline-block mt-4 px-6 py-3 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors"
          >
            Create Your First Course
          </Link>
        </div>
      )}
    </div>
  );
}

