import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';

type Course = {
  id: string;
  title: string;
  description?: string;
  category_id?: string;
  status: string;
  thumbnail_file_id?: string;
  estimated_duration_minutes?: number;
  tags?: string[];
  is_required: boolean;
  renewal_frequency: string;
  renewal_frequency_days?: number;
  generates_certificate: boolean;
  certificate_validity_days?: number;
  certificate_text?: string;
  required_role_ids: string[];
  required_division_ids: string[];
  required_user_ids: string[];
  modules: Module[];
};

type Module = {
  id: string;
  title: string;
  order_index: number;
  lessons: Lesson[];
};

type Lesson = {
  id: string;
  title: string;
  lesson_type: string;
  order_index: number;
  requires_completion: boolean;
  content?: any;
  quiz?: any;
};

export default function TrainingCourseEdit() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = courseId === 'new';

  const { data: course, isLoading } = useQuery<Course>({
    queryKey: ['training-admin-course', courseId],
    queryFn: () => api<Course>('GET', `/training/admin/courses/${courseId}`),
    enabled: !isNew && !!courseId,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api('GET', '/settings'),
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api('GET', '/users/roles/all'),
  });

  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api('GET', '/employees'),
  });

  const [activeTab, setActiveTab] = useState<'setup' | 'requirements' | 'certificate' | 'builder'>('setup');
  const [formData, setFormData] = useState<Partial<Course>>({
    title: '',
    description: '',
    status: 'draft',
    is_required: false,
    renewal_frequency: 'none',
    generates_certificate: false,
    tags: [],
    required_role_ids: [],
    required_division_ids: [],
    required_user_ids: [],
  });
  const initialFormDataRef = useRef<Partial<Course>>({});

  // Initialize form data when course loads
  useEffect(() => {
    if (course && !isNew) {
      const initial = {
        title: course.title,
        description: course.description,
        category_id: course.category_id,
        status: course.status,
        thumbnail_file_id: course.thumbnail_file_id,
        estimated_duration_minutes: course.estimated_duration_minutes,
        tags: course.tags || [],
        is_required: course.is_required,
        renewal_frequency: course.renewal_frequency,
        renewal_frequency_days: course.renewal_frequency_days,
        generates_certificate: course.generates_certificate,
        certificate_validity_days: course.certificate_validity_days,
        certificate_text: course.certificate_text,
        required_role_ids: course.required_role_ids || [],
        required_division_ids: course.required_division_ids || [],
        required_user_ids: course.required_user_ids || [],
      };
      setFormData(initial);
      initialFormDataRef.current = initial;
    } else if (isNew) {
      const initial = {
        title: '',
        description: '',
        status: 'draft',
        is_required: false,
        renewal_frequency: 'none',
        generates_certificate: false,
        tags: [],
        required_role_ids: [],
        required_division_ids: [],
        required_user_ids: [],
      };
      setFormData(initial);
      initialFormDataRef.current = initial;
    }
  }, [course, isNew]);

  // Check if form has unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(initialFormDataRef.current);
  }, [formData]);

  // Save function for unsaved changes guard
  const handleSaveForGuard = async () => {
    if (!hasUnsavedChanges) return;
    handleSave();
  };

  // Use unsaved changes guard
  useUnsavedChangesGuard(hasUnsavedChanges, handleSaveForGuard);

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      if (isNew) {
        return api('POST', '/training/admin/courses', data);
      } else {
        return api('PUT', `/training/admin/courses/${courseId}`, data);
      }
    },
    onSuccess: (data) => {
      toast.success(isNew ? 'Course created!' : 'Course updated!');
      if (isNew && data.id) {
        navigate(`/training/admin/${data.id}`);
      } else {
        initialFormDataRef.current = { ...formData };
        queryClient.invalidateQueries({ queryKey: ['training-admin-course', courseId] });
      }
    },
    onError: () => {
      toast.error('Failed to save course');
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => api('POST', `/training/admin/courses/${courseId}/publish`),
    onSuccess: () => {
      toast.success('Course published!');
      queryClient.invalidateQueries({ queryKey: ['training-admin-course', courseId] });
      queryClient.invalidateQueries({ queryKey: ['training-admin-courses'] });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (newTitle: string) =>
      api('POST', `/training/admin/courses/${courseId}/duplicate`, { new_title: newTitle }),
    onSuccess: (data: any) => {
      toast.success('Course duplicated!');
      navigate(`/training/admin/${data.id}`);
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handlePublish = () => {
    if (confirm('Publish this course? It will be available to all required users.')) {
      publishMutation.mutate();
    }
  };

  const categories = (settings?.training_categories as any[]) || [];
  const divisions = (settings?.divisions as any[]) || [];

  if (isLoading && !isNew) {
    return <div className="p-4">Loading course...</div>;
  }

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold">
              {isNew ? 'Create New Course' : `Edit: ${course?.title || 'Course'}`}
            </div>
            <div className="text-sm opacity-90">
              {isNew ? 'Set up your training course' : 'Manage course content and settings'}
            </div>
          </div>
          <button
            onClick={() => navigate('/training/admin')}
            className="px-4 py-2 bg-white text-[#d11616] rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b">
        {['setup', 'requirements', 'certificate', 'builder'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 font-semibold border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? 'border-[#7f1010] text-[#7f1010]'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white border rounded-xl p-6">
        {activeTab === 'setup' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2">Title *</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                placeholder="Course title"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
                rows={4}
                placeholder="Course description"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Category</label>
                <select
                  value={formData.category_id || ''}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value || undefined })}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Estimated Duration (minutes)</label>
                <input
                  type="number"
                  value={formData.estimated_duration_minutes || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      estimated_duration_minutes: e.target.value ? parseInt(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="60"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2">Status</label>
              <select
                value={formData.status || 'draft'}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'requirements' && (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_required || false}
                  onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                />
                <span className="font-semibold">This course is required</span>
              </label>
            </div>

            {formData.is_required && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2">Renewal Frequency</label>
                  <select
                    value={formData.renewal_frequency || 'none'}
                    onChange={(e) => setFormData({ ...formData, renewal_frequency: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="none">No renewal</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                    <option value="days_X">Custom (X days)</option>
                    <option value="every_new_job">Every New Job</option>
                  </select>
                </div>

                {formData.renewal_frequency === 'days_X' && (
                  <div>
                    <label className="block text-sm font-semibold mb-2">Days</label>
                    <input
                      type="number"
                      value={formData.renewal_frequency_days || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          renewal_frequency_days: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      className="w-full px-4 py-2 border rounded-lg"
                      placeholder="365"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold mb-2">Required for Roles</label>
                  <select
                    multiple
                    value={formData.required_role_ids || []}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        required_role_ids: Array.from(e.target.selectedOptions, (opt) => opt.value),
                      })
                    }
                    className="w-full px-4 py-2 border rounded-lg h-32"
                  >
                    {(roles as any[])?.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Required for Divisions</label>
                  <select
                    multiple
                    value={formData.required_division_ids || []}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        required_division_ids: Array.from(e.target.selectedOptions, (opt) => opt.value),
                      })
                    }
                    className="w-full px-4 py-2 border rounded-lg h-32"
                  >
                    {divisions.map((div) => (
                      <option key={div.id} value={div.id}>
                        {div.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Required for Users</label>
                  <select
                    multiple
                    value={formData.required_user_ids || []}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        required_user_ids: Array.from(e.target.selectedOptions, (opt) => opt.value),
                      })
                    }
                    className="w-full px-4 py-2 border rounded-lg h-32"
                  >
                    {(employees as any[])?.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name || emp.username}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'certificate' && (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.generates_certificate || false}
                  onChange={(e) => setFormData({ ...formData, generates_certificate: e.target.checked })}
                />
                <span className="font-semibold">Generate certificate upon completion</span>
              </label>
            </div>

            {formData.generates_certificate && (
              <>
                <div>
                  <label className="block text-sm font-semibold mb-2">Certificate Validity (days)</label>
                  <input
                    type="number"
                    value={formData.certificate_validity_days || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        certificate_validity_days: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="365"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Custom Certificate Text (optional)</label>
                  <textarea
                    value={formData.certificate_text || ''}
                    onChange={(e) => setFormData({ ...formData, certificate_text: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    rows={6}
                    placeholder="Use {user_name}, {course_title}, {completion_date} as placeholders"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'builder' && (
          <div>
            {isNew ? (
              <div className="text-center py-12 text-gray-500">
                <p>Save the course first to add modules and lessons.</p>
              </div>
            ) : course ? (
              <div>
                <p className="text-gray-600 mb-4">
                  Course Builder interface will be implemented here. For now, use the API endpoints directly.
                </p>
                <div className="space-y-2">
                  {course.modules?.map((module) => (
                    <div key={module.id} className="border rounded-lg p-4">
                      <div className="font-semibold mb-2">{module.title}</div>
                      <div className="text-sm text-gray-600">
                        {module.lessons?.length || 0} lessons
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex gap-4 justify-end">
        <button
          onClick={() => navigate('/training/admin')}
          className="px-6 py-3 border rounded-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Draft'}
        </button>
        {!isNew && course?.status === 'draft' && (
          <button
            onClick={handlePublish}
            disabled={publishMutation.isPending}
            className="px-6 py-3 bg-[#7f1010] text-white rounded-lg font-semibold hover:bg-[#a31414] transition-colors disabled:opacity-50"
          >
            {publishMutation.isPending ? 'Publishing...' : 'Publish'}
          </button>
        )}
        {!isNew && (
          <button
            onClick={() => {
              const newTitle = prompt('Enter new course title:', `${course?.title} (Copy)`);
              if (newTitle) {
                duplicateMutation.mutate(newTitle);
              }
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Duplicate
          </button>
        )}
      </div>
    </div>
  );
}

