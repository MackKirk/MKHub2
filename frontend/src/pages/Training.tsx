import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';
import { useState } from 'react';

type Course = {
  id: string;
  title: string;
  description?: string;
  category_label?: string;
  thumbnail_file_id?: string;
  estimated_duration_minutes?: number;
  tags?: string[];
  progress_percent: number;
  completed_at?: string;
  certificate_id?: string;
  certificate_expires_at?: string;
};

type TrainingData = {
  completed: Course[];
  in_progress: Course[];
  required: Course[];
  expired: Course[];
};

export default function Training() {
  const [activeTab, setActiveTab] = useState<'completed' | 'in_progress' | 'required' | 'expired'>('required');
  const { data, isLoading } = useQuery<TrainingData>({
    queryKey: ['training'],
    queryFn: () => api<TrainingData>('GET', '/training'),
  });

  const courses = data?.[activeTab] || [];

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Training & Learning</div>
        <div className="text-sm opacity-90">Complete your required training and earn certificates.</div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('required')}
          className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
            activeTab === 'required'
              ? 'border-[#7f1010] text-[#7f1010]'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Required ({data?.required?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('in_progress')}
          className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
            activeTab === 'in_progress'
              ? 'border-[#7f1010] text-[#7f1010]'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          In Progress ({data?.in_progress?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
            activeTab === 'completed'
              ? 'border-[#7f1010] text-[#7f1010]'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Completed ({data?.completed?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('expired')}
          className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
            activeTab === 'expired'
              ? 'border-[#7f1010] text-[#7f1010]'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Expired ({data?.expired?.length || 0})
        </button>
      </div>

      {/* Course Grid */}
      {isLoading ? (
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No courses in this category.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {courses.map((course) => (
            <Link
              key={course.id}
              to={`/training/${course.id}`}
              className="rounded-xl border bg-white overflow-hidden hover:shadow-lg transition-shadow"
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
                {course.category_label && (
                  <span className="text-xs font-semibold text-[#7f1010] uppercase">
                    {course.category_label}
                  </span>
                )}
                <h3 className="font-bold text-lg mt-1 mb-2 line-clamp-2">{course.title}</h3>
                {course.description && (
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">{course.description}</p>
                )}
                
                {/* Progress Bar */}
                {activeTab === 'in_progress' && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>{course.progress_percent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-[#7f1010] h-2 rounded-full transition-all"
                        style={{ width: `${course.progress_percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Status Badge */}
                <div className="flex items-center justify-between mt-3">
                  {course.completed_at && (
                    <span className="text-xs text-green-600 font-semibold">✓ Completed</span>
                  )}
                  {course.certificate_expires_at && (
                    <span className="text-xs text-orange-600">
                      Expires: {new Date(course.certificate_expires_at).toLocaleDateString()}
                    </span>
                  )}
                  {course.estimated_duration_minutes && (
                    <span className="text-xs text-gray-500">
                      {Math.round(course.estimated_duration_minutes / 60)}h
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

