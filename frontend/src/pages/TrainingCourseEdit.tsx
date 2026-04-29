import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { uploadTrainingContentFile } from '@/lib/trainingFileUpload';
import toast from 'react-hot-toast';
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import CourseBuilderPanel from '@/pages/training/CourseBuilderPanel';

const FIELD =
  'w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-shadow focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-brand-red/20';
const FIELD_MULTI = `${FIELD} h-32`;

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
  certificate_heading_primary?: string;
  certificate_heading_secondary?: string;
  certificate_body_template?: string;
  certificate_instructor_name?: string;
  certificate_layout?: Record<string, number>;
  certificate_background_file_id?: string;
  certificate_background_setting_item_id?: string;
  certificate_background_preset_key?: string | null;
  certificate_logo_file_id?: string;
  certificate_logo_setting_item_id?: string;
  matrix_training_id?: string | null;
  sync_completion_to_employee_record?: boolean;
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

type CertificateBgPreset = {
  key: string;
  label: string;
  label_en?: string;
  preview_url: string | null;
  /** From Settings library; omit or `bundled` for static app files. */
  source?: 'library' | 'bundled';
};

const DEFAULT_CERT_BODY_PREVIEW =
  'This certificate is awarded to {user_name} in recognition of their successful completion of ' +
  '{course_title} on {completion_date}.\n\n' +
  'We recognize your hard work and dedication to your professional development.';

type CertificateLayout = {
  logoX: number;
  logoY: number;
  logoW: number;
  logoH: number;
  contentTop: number;
  contentSide: number;
  h1Size: number;
  h2Size: number;
  bodySize: number;
  titleBodyGap: number;
  signatureGap: number;
  signatureNameGap: number;
  signatureSideInset: number;
};

const DEFAULT_CERT_LAYOUT: CertificateLayout = {
  logoX: 14,
  logoY: 38,
  logoW: 164,
  logoH: 72,
  contentTop: 118,
  contentSide: 46,
  h1Size: 35,
  h2Size: 20,
  bodySize: 18,
  titleBodyGap: 25,
  signatureGap: 60,
  signatureNameGap: 18,
  signatureSideInset: 66,
};

function normalizeCertificateLayout(raw: any): CertificateLayout {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const n = (k: keyof CertificateLayout, min: number, max: number) => {
    const v = Number(src[k]);
    if (!Number.isFinite(v)) return DEFAULT_CERT_LAYOUT[k];
    return Math.min(max, Math.max(min, v));
  };
  return {
    logoX: n('logoX', 0, 760),
    logoY: n('logoY', 0, 560),
    logoW: n('logoW', 64, 360),
    logoH: n('logoH', 20, 150),
    contentTop: n('contentTop', 52, 220),
    contentSide: n('contentSide', 28, 160),
    h1Size: n('h1Size', 16, 56),
    h2Size: n('h2Size', 12, 36),
    bodySize: n('bodySize', 9, 24),
    titleBodyGap: n('titleBodyGap', 0, 48),
    signatureGap: n('signatureGap', -24, 120),
    signatureNameGap: n('signatureNameGap', 0, 36),
    signatureSideInset: n('signatureSideInset', 0, 160),
  };
}

function fillCertificatePreviewPlaceholders(
  template: string,
  partial: Partial<Course>,
  completionDateLabel: string
): string {
  const courseTitle = (partial.title || '').trim() || 'Course title';
  const instructor = (partial.certificate_instructor_name || '').trim() || 'Instructor name';
  const map: Record<string, string> = {
    user_name: 'Participant name',
    course_title: courseTitle,
    completion_date: completionDateLabel,
    instructor_name: instructor,
    certificate_number: 'MKHUB-CERT-000000',
    expiry_date: '—',
  };
  return template.replace(/\{([a-z_]+)\}/g, (_, k) => map[k] ?? `{${k}}`);
}

export default function TrainingCourseEdit() {
  const { courseId: courseIdParam } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const courseId = courseIdParam?.trim() || undefined;
  const isNew = !courseId || courseId === 'new';

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

  const { data: matrixCatalog } = useQuery({
    queryKey: ['training-matrix-catalog'],
    queryFn: () => api<{ items: Array<{ id: string; label: string }> }>('GET', '/auth/training-records/matrix-catalog'),
    staleTime: 60 * 60 * 1000,
  });

  const [activeTab, setActiveTab] = useState<'setup' | 'requirements' | 'certificate' | 'builder'>('setup');
  const [roleSearch, setRoleSearch] = useState('');
  const [divisionSearch, setDivisionSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const { data: bgPresetsRes } = useQuery<{ presets: CertificateBgPreset[] }>({
    queryKey: ['training-certificate-bg-presets'],
    queryFn: () => api('GET', '/training/certificate-background-presets'),
    staleTime: 60 * 60 * 1000,
    enabled: activeTab === 'certificate',
  });

  const { data: orgLogoPresetsRes } = useQuery<{
    logos: Array<{ id: string; label: string; file_object_id: string }>;
  }>({
    queryKey: ['training-organization-logo-presets'],
    queryFn: () => api('GET', '/training/organization-logo-presets'),
    staleTime: 60 * 60 * 1000,
    enabled: activeTab === 'certificate',
  });

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
    matrix_training_id: '',
    sync_completion_to_employee_record: false,
  });
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [livePdfPreviewUrl, setLivePdfPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'live' | 'pdf'>('live');
  const [isLiveRendering, setIsLiveRendering] = useState(false);
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
        certificate_heading_primary: course.certificate_heading_primary,
        certificate_heading_secondary: course.certificate_heading_secondary,
        certificate_body_template:
          course.certificate_body_template ?? course.certificate_text ?? '',
        certificate_instructor_name: course.certificate_instructor_name,
        certificate_background_file_id: course.certificate_background_file_id,
        certificate_background_setting_item_id: course.certificate_background_setting_item_id ?? '',
        certificate_background_preset_key: course.certificate_background_preset_key ?? undefined,
        certificate_logo_file_id: course.certificate_logo_file_id,
        certificate_logo_setting_item_id: course.certificate_logo_setting_item_id,
        certificate_layout: normalizeCertificateLayout(course.certificate_layout),
        required_role_ids: course.required_role_ids || [],
        required_division_ids: course.required_division_ids || [],
        required_user_ids: course.required_user_ids || [],
        matrix_training_id: course.matrix_training_id || '',
        sync_completion_to_employee_record: !!course.sync_completion_to_employee_record,
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
        matrix_training_id: '',
        sync_completion_to_employee_record: false,
        certificate_layout: { ...DEFAULT_CERT_LAYOUT },
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
      const createdId = typeof data === 'object' && data && 'id' in data ? String((data as { id: string }).id) : '';
      if (isNew && createdId) {
        navigate(`/training/admin/${createdId}`);
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
    const payload: Record<string, unknown> = { ...formData };
    const mid = (formData.matrix_training_id as string)?.trim();
    payload.matrix_training_id = mid || null;
    payload.sync_completion_to_employee_record = !!formData.sync_completion_to_employee_record;
    const bgSettingId = (formData.certificate_background_setting_item_id || '').trim();
    payload.certificate_background_setting_item_id = bgSettingId || null;
    payload.certificate_background_file_id = null;
    payload.certificate_background_preset_key = null;
    payload.certificate_logo_file_id = formData.certificate_logo_file_id ?? null;
    payload.certificate_logo_setting_item_id = formData.certificate_logo_setting_item_id ?? null;
    if (formData.certificate_logo_file_id) {
      payload.certificate_logo_setting_item_id = null;
    } else if (formData.certificate_logo_setting_item_id) {
      payload.certificate_logo_file_id = null;
    }
    payload.certificate_heading_primary = formData.certificate_heading_primary?.trim() || null;
    payload.certificate_heading_secondary = formData.certificate_heading_secondary?.trim() || null;
    payload.certificate_body_template = formData.certificate_body_template?.trim() || null;
    payload.certificate_instructor_name = formData.certificate_instructor_name?.trim() || null;
    payload.certificate_validity_days = formData.certificate_validity_days ?? null;
    payload.certificate_layout = normalizeCertificateLayout(formData.certificate_layout);
    if (payload.certificate_body_template) payload.certificate_text = null;

    if (!formData.generates_certificate) {
      payload.certificate_background_file_id = null;
      payload.certificate_background_setting_item_id = null;
      payload.certificate_background_preset_key = null;
      payload.certificate_logo_file_id = null;
      payload.certificate_logo_setting_item_id = null;
    }

    saveMutation.mutate(payload);
  };

  const buildCertificatePreviewPayload = () => ({
    title: formData.title || '',
    certificate_text: formData.certificate_text ?? null,
    certificate_heading_primary: formData.certificate_heading_primary?.trim() || null,
    certificate_heading_secondary: formData.certificate_heading_secondary?.trim() || null,
    certificate_body_template: formData.certificate_body_template?.trim() || null,
    certificate_instructor_name: formData.certificate_instructor_name?.trim() || '{instructor_name}',
    certificate_background_setting_item_id: (formData.certificate_background_setting_item_id || '').trim() || null,
    certificate_logo_file_id: formData.certificate_logo_file_id ?? null,
    certificate_logo_setting_item_id: formData.certificate_logo_setting_item_id ?? null,
    certificate_layout: normalizeCertificateLayout(formData.certificate_layout),
  });

  const handleGenerateCertificatePdf = async () => {
    if (!courseId || isNew) {
      toast.error('Save the course first');
      return;
    }
    try {
      await saveMutation.mutateAsync({
        ...formData,
        matrix_training_id: (formData.matrix_training_id as string)?.trim() || null,
        sync_completion_to_employee_record: !!formData.sync_completion_to_employee_record,
        certificate_background_file_id: null,
        certificate_background_setting_item_id: (formData.certificate_background_setting_item_id || '').trim() || null,
        certificate_background_preset_key: null,
        certificate_logo_file_id: formData.certificate_logo_file_id ?? null,
        certificate_logo_setting_item_id: formData.certificate_logo_setting_item_id ?? null,
        certificate_heading_primary: formData.certificate_heading_primary?.trim() || null,
        certificate_heading_secondary: formData.certificate_heading_secondary?.trim() || null,
        certificate_body_template: formData.certificate_body_template?.trim() || null,
        certificate_instructor_name: formData.certificate_instructor_name?.trim() || null,
        certificate_validity_days: formData.certificate_validity_days ?? null,
        certificate_layout: normalizeCertificateLayout(formData.certificate_layout),
      });
      const token = localStorage.getItem('user_token');
      const res = await fetch(`/training/admin/courses/${courseId}/certificate-preview.pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to generate PDF preview');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(url);
      setPreviewMode('pdf');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate PDF preview');
    }
  };

  const handlePublish = () => {
    if (confirm('Publish this course? It will be available to all required users.')) {
      publishMutation.mutate();
    }
  };

  const categories = (settings?.training_categories as any[]) || [];
  const divisions = (settings?.divisions as any[]) || [];
  const roleOptions = ((roles as any[]) || []).map((r) => ({ id: String(r.id), label: String(r.name || 'Role') }));
  const divisionOptions = (divisions || []).map((d: any) => ({ id: String(d.id), label: String(d.label || 'Division') }));
  const userOptions = ((employees as any[]) || []).map((e) => ({
    id: String(e.id),
    label: String(e.name || e.username || 'User'),
  }));
  const matches = (label: string, q: string) => label.toLowerCase().includes(q.trim().toLowerCase());
  const filteredRoleOptions = roleOptions.filter((o) => matches(o.label, roleSearch));
  const filteredDivisionOptions = divisionOptions.filter((o) => matches(o.label, divisionSearch));
  const filteredUserOptions = userOptions.filter((o) => matches(o.label, userSearch));
  const selectedRoleIds = formData.required_role_ids || [];
  const selectedDivisionIds = formData.required_division_ids || [];
  const selectedUserIds = formData.required_user_ids || [];
  const toggleSelect = (key: 'required_role_ids' | 'required_division_ids' | 'required_user_ids', id: string) => {
    const prev = (formData[key] as string[] | undefined) || [];
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    setFormData({ ...formData, [key]: next });
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const previewCompletionDate = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  const previewBgUrl = useMemo(() => {
    const libId = (formData.certificate_background_setting_item_id || '').trim();
    if (libId) {
      return `/training/certificate-background-library/${libId}`;
    }
    return null;
  }, [
    formData.certificate_background_setting_item_id,
  ]);

  const previewLogoFileId = useMemo(() => {
    if (formData.certificate_logo_file_id) return formData.certificate_logo_file_id;
    const sid = formData.certificate_logo_setting_item_id;
    if (!sid) return undefined;
    const hit = orgLogoPresetsRes?.logos?.find((l) => l.id === sid);
    return hit?.file_object_id;
  }, [formData.certificate_logo_file_id, formData.certificate_logo_setting_item_id, orgLogoPresetsRes]);

  const previewBodyText = useMemo(() => {
    const raw = (formData.certificate_body_template || '').trim();
    const tpl = raw || DEFAULT_CERT_BODY_PREVIEW;
    return fillCertificatePreviewPlaceholders(tpl, formData, previewCompletionDate);
  }, [formData.certificate_body_template, formData.title, formData.certificate_instructor_name, previewCompletionDate]);

  const previewH1 = (formData.certificate_heading_primary || '').trim() || 'CERTIFICATE';
  const previewH2 = (formData.certificate_heading_secondary || '').trim() || 'OF COMPLETION';
  const previewInstructor = (formData.certificate_instructor_name || '').trim() || 'Instructor name';
  const cleanPdfViewerSrc = (url: string) =>
    `${url}#page=1&view=Fit&zoom=page-fit&toolbar=0&navpanes=0&scrollbar=0&pagemode=none`;
  const certLayout = useMemo(() => normalizeCertificateLayout(formData.certificate_layout), [formData.certificate_layout]);
  const previewFrameRef = useRef<HTMLDivElement | null>(null);
  const [previewSize, setPreviewSize] = useState({ w: 792, h: 612 });
  useLayoutEffect(() => {
    const el = previewFrameRef.current;
    if (!el) return;
    const update = () => {
      setPreviewSize({
        w: Math.max(1, el.clientWidth || 1),
        h: Math.max(1, el.clientHeight || 1),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sx = previewSize.w / 792;
  const sy = previewSize.h / 612;
  const setCertLayout = (key: keyof CertificateLayout, value: number) => {
    setFormData((fd) => ({
      ...fd,
      certificate_layout: {
        ...normalizeCertificateLayout(fd.certificate_layout),
        [key]: value,
      },
    }));
  };

  useEffect(() => {
    if (activeTab !== 'certificate' || isNew || !courseId || !formData.generates_certificate || previewMode !== 'live') {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setIsLiveRendering(true);
        const token = localStorage.getItem('user_token');
        const res = await fetch(`/training/admin/courses/${courseId}/certificate-preview-render.pdf`, {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildCertificatePreviewPayload()),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (livePdfPreviewUrl) URL.revokeObjectURL(livePdfPreviewUrl);
        setLivePdfPreviewUrl(url);
      } finally {
        setIsLiveRendering(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    isNew,
    courseId,
    formData.generates_certificate,
    formData.title,
    formData.certificate_text,
    formData.certificate_heading_primary,
    formData.certificate_heading_secondary,
    formData.certificate_body_template,
    formData.certificate_instructor_name,
    formData.certificate_background_setting_item_id,
    formData.certificate_logo_file_id,
    formData.certificate_logo_setting_item_id,
    formData.certificate_layout,
    previewMode,
  ]);

  if (isLoading && !isNew) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/50 px-6 py-12">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-brand-red" />
        <p className="mt-4 text-sm font-medium text-gray-600">Loading course…</p>
      </div>
    );
  }

  const tabLabel: Record<string, string> = {
    setup: 'Setup',
    requirements: 'Requirements',
    certificate: 'Certificate',
    builder: 'Content builder',
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              {isNew ? 'Create new course' : `Edit: ${course?.title || 'Course'}`}
            </h1>
            <p className="mt-1 text-sm font-medium text-gray-500">
              {isNew ? 'Set up your training course' : 'Manage course content and settings'}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
            <div className="flex flex-col gap-2 sm:items-end">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Publication</span>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span
                  className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold tracking-wide ${
                    (formData.status || 'draft') === 'published'
                      ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80'
                      : 'bg-slate-200/90 text-slate-800 ring-1 ring-slate-300/60'
                  }`}
                >
                  {(formData.status || 'draft') === 'published' ? 'Published' : 'Draft'}
                </span>
                <div className="inline-flex gap-0.5 rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 shadow-inner">
                  {(['draft', 'published'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData({ ...formData, status: s })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all sm:px-4 sm:py-2 sm:text-sm ${
                        (formData.status || 'draft') === s
                          ? 'bg-white text-brand-red shadow-sm ring-1 ring-slate-200/80'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {s === 'draft' ? 'Draft' : 'Published'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="max-w-md text-right text-[11px] leading-snug text-gray-500 sm:max-w-xs">
                {(formData.status || 'draft') === 'published'
                  ? 'Visible to learners per Requirements.'
                  : 'Hidden from the catalog until you publish.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-4 border-t border-slate-200/70 pt-3 sm:border-t-0 sm:pt-0">
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Today</div>
                <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/training/admin')}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25"
              >
                ← Back to list
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-slate-100/90 p-1 shadow-inner">
        {(['setup', 'requirements', 'certificate', 'builder'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-all ${
              activeTab === tab
                ? 'bg-white text-brand-red shadow-sm ring-1 ring-slate-200/80'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tabLabel[tab] ?? tab}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
        {activeTab === 'setup' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50/95 via-white to-slate-50/50 px-5 py-4 shadow-sm sm:px-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Course landing</p>
              <h2 className="mt-1 text-lg font-bold tracking-tight text-gray-900">Basics & visibility</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-600">
                Set how this course appears in the catalog—like the first screen on a platform such as Udemy—then
                fine-tune HR reporting below. Use <span className="font-semibold text-gray-700">Publication</span> in
                the header to switch Draft or Published.
              </p>
            </div>

            <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
              <header className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-5 py-3.5 sm:px-6">
                <h3 className="text-sm font-bold text-gray-900">Course information</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Title, summary, category, and duration—aligned with how you structure lessons in Content builder.
                </p>
              </header>
              <div className="space-y-5 p-5 sm:p-6">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Title <span className="font-bold text-brand-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className={FIELD}
                    placeholder="Clear, specific course title"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Description
                  </label>
                  <textarea
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={FIELD_MULTI}
                    rows={4}
                    placeholder="What learners will get out of this course—outcomes, audience, and format."
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Category
                    </label>
                    <select
                      value={formData.category_id || ''}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value || undefined })}
                      className={FIELD}
                    >
                      <option value="">Select a category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Estimated duration
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={formData.estimated_duration_minutes ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            estimated_duration_minutes: e.target.value ? parseInt(e.target.value, 10) : undefined,
                          })
                        }
                        className={`${FIELD} pr-16`}
                        placeholder="e.g. 60"
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">
                        minutes
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500">Approximate time to complete all lessons.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
              <header className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-5 py-3.5 sm:px-6">
                <h3 className="text-sm font-bold text-gray-900">HR profile & training matrix</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Optional: sync completions into employee training history and the standard matrix column.
                </p>
              </header>
              <div className="space-y-4 p-5 sm:p-6">
                <p className="text-sm leading-relaxed text-gray-600">
                  When a learner completes this course, you can write a row to their HR training history and fill the
                  matrix column (only if the slot is free or was created by a previous LMS sync for this course).
                </p>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Matrix column
                  </label>
                  <select
                    value={formData.matrix_training_id || ''}
                    onChange={(e) => setFormData({ ...formData, matrix_training_id: e.target.value })}
                    className={FIELD}
                  >
                    <option value="">None — internal only</option>
                    {(matrixCatalog?.items || []).map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.label}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50/40">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-red focus:ring-brand-red/30"
                    checked={!!formData.sync_completion_to_employee_record}
                    onChange={(e) =>
                      setFormData({ ...formData, sync_completion_to_employee_record: e.target.checked })
                    }
                  />
                  <span className="text-sm font-medium leading-snug text-gray-800">
                    Sync completion to employee training record / matrix
                  </span>
                </label>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'requirements' && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.is_required || false}
                  onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                />
                <div>
                  <span className="font-semibold text-gray-900">This course is required</span>
                  <p className="text-xs text-gray-500">Assign required audiences and renewal policy.</p>
                </div>
              </label>
            </div>

            {formData.is_required && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <label className="block text-sm font-semibold mb-2">Renewal Frequency</label>
                  <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                    <select
                      value={formData.renewal_frequency || 'none'}
                      onChange={(e) => setFormData({ ...formData, renewal_frequency: e.target.value })}
                      className={FIELD}
                    >
                      <option value="none">No renewal</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                      <option value="days_X">Custom (X days)</option>
                      <option value="every_new_job">Every New Job</option>
                    </select>
                    <input
                      type="number"
                      disabled={formData.renewal_frequency !== 'days_X'}
                      value={formData.renewal_frequency_days || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          renewal_frequency_days: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      className={FIELD}
                      placeholder="Days"
                    />
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {[
                    ['Roles', 'required_role_ids', selectedRoleIds, roleSearch, setRoleSearch, filteredRoleOptions],
                    ['Divisions', 'required_division_ids', selectedDivisionIds, divisionSearch, setDivisionSearch, filteredDivisionOptions],
                    ['Users', 'required_user_ids', selectedUserIds, userSearch, setUserSearch, filteredUserOptions],
                  ].map(([title, key, selected, search, setSearch, options]) => (
                    <div key={String(key)} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">{String(title)}</p>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {(selected as string[]).length} selected
                        </span>
                      </div>
                      <input
                        type="text"
                        value={String(search)}
                        onChange={(e) => (setSearch as (v: string) => void)(e.target.value)}
                        className={FIELD}
                        placeholder={`Search ${String(title).toLowerCase()}...`}
                      />
                      <div className="mt-3 max-h-56 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                        {(options as Array<{ id: string; label: string }>).map((opt) => (
                          <label
                            key={opt.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white"
                          >
                            <input
                              type="checkbox"
                              checked={(selected as string[]).includes(opt.id)}
                              onChange={() =>
                                toggleSelect(key as 'required_role_ids' | 'required_division_ids' | 'required_user_ids', opt.id)
                              }
                            />
                            <span className="truncate">{opt.label}</span>
                          </label>
                        ))}
                        {(options as Array<{ id: string; label: string }>).length === 0 ? (
                          <p className="px-2 py-2 text-xs text-slate-500">No matches.</p>
                        ) : null}
                      </div>
                      {(selected as string[]).length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {(selected as string[]).slice(0, 8).map((id) => {
                            const label = (
                              [...roleOptions, ...divisionOptions, ...userOptions].find((o) => o.id === id)?.label || id
                            );
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() =>
                                  toggleSelect(key as 'required_role_ids' | 'required_division_ids' | 'required_user_ids', id)
                                }
                                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
                                title="Remove"
                              >
                                {label} ×
                              </button>
                            );
                          })}
                          {(selected as string[]).length > 8 ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              +{(selected as string[]).length - 8} more
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
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
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_min(460px,54vw)] xl:grid-cols-[minmax(0,1fr)_min(600px,58%)]">
                <div className="min-w-0 space-y-4">
                  <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
                    <p className="text-sm font-bold text-gray-900">Certificate format</p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-gray-600">
                      Choose the layout family for this course. The standard option matches the current PDF engine;
                      future formats may use different text positions and artwork regions.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="flex cursor-default gap-3 rounded-xl border-2 border-brand-red bg-red-50/30 p-4 ring-1 ring-brand-red/20">
                        <input type="radio" name="cert-layout" className="mt-1" checked readOnly />
                        <div>
                          <div className="text-sm font-bold text-gray-900">Standard — landscape letter</div>
                          <p className="mt-1 text-[11px] leading-snug text-gray-600">
                            US Letter landscape (11&quot; × 8.5&quot;). Optional full-page background; optional logo
                            top-left next to titles.
                          </p>
                        </div>
                      </label>
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                        <p className="text-sm font-semibold text-gray-500">More formats</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                          Additional certificate types and layout presets will appear here later.
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 border-t border-slate-100 pt-6">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Page artwork</p>
                      <p className="mt-1 text-xs font-medium text-gray-600">
                        Background and logo side by side. Shared backgrounds come from System Settings → Files →
                        Certificate backgrounds. Use the live preview and PDF generation button to validate final output.
                      </p>
                      <div className="mt-4 grid gap-5 lg:grid-cols-2 lg:items-start">
                        <div className="min-w-0">
                          <label className="block text-sm font-semibold text-gray-800">Background</label>
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            Fills the page behind the text layer in the PDF.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <label
                              className={`inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                                !formData.certificate_background_setting_item_id
                                  ? 'border-brand-red bg-red-50/50 ring-1 ring-brand-red/25'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name="cert-bg-source"
                                className="shrink-0"
                                checked={
                                  !formData.certificate_background_setting_item_id
                                }
                                onChange={() =>
                                  setFormData((fd) => ({
                                    ...fd,
                                    certificate_background_setting_item_id: '',
                                  }))
                                }
                              />
                              <span className="text-xs font-semibold text-gray-900">None</span>
                            </label>
                            {(bgPresetsRes?.presets || []).map((p) => (
                              <label
                                key={p.key}
                                className={`inline-flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                                  formData.certificate_background_setting_item_id === p.key
                                    ? 'border-brand-red bg-red-50/50 ring-1 ring-brand-red/25'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="cert-bg-source"
                                  className="shrink-0"
                                  checked={
                                    formData.certificate_background_setting_item_id === p.key
                                  }
                                  onChange={() =>
                                    setFormData((fd) => ({
                                      ...fd,
                                      certificate_background_setting_item_id: p.key,
                                    }))
                                  }
                                />
                                {p.preview_url ? (
                                  <img
                                    src={p.preview_url}
                                    alt=""
                                    className="h-10 w-14 shrink-0 rounded border border-slate-200 object-cover object-top"
                                  />
                                ) : (
                                  <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] text-slate-400">
                                    —
                                  </span>
                                )}
                                <span
                                  className="max-w-[8rem] truncate text-xs font-medium text-gray-900"
                                  title={p.label}
                                >
                                  {p.label}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
                          <label className="block text-sm font-semibold text-gray-800">Logo (optional)</label>
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            Presets from System Settings → Files → Organization logos, or a one-off upload for this
                            course only. Top-left beside titles (transparent PNG works best).
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <label
                              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 ${
                                !formData.certificate_logo_file_id && !formData.certificate_logo_setting_item_id
                                  ? 'border-brand-red bg-red-50/50 ring-1 ring-brand-red/25'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name="cert-logo-source"
                                className="shrink-0"
                                checked={
                                  !formData.certificate_logo_file_id && !formData.certificate_logo_setting_item_id
                                }
                                onChange={() =>
                                  setFormData((fd) => ({
                                    ...fd,
                                    certificate_logo_file_id: undefined,
                                    certificate_logo_setting_item_id: undefined,
                                  }))
                                }
                              />
                              <span className="text-xs font-semibold text-gray-900">None</span>
                            </label>
                            {(orgLogoPresetsRes?.logos || []).map((logo) => (
                              <label
                                key={logo.id}
                                className={`inline-flex max-w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 ${
                                  !formData.certificate_logo_file_id &&
                                  formData.certificate_logo_setting_item_id === logo.id
                                    ? 'border-brand-red bg-red-50/50 ring-1 ring-brand-red/25'
                                    : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="cert-logo-source"
                                  className="shrink-0"
                                  checked={
                                    !formData.certificate_logo_file_id &&
                                    formData.certificate_logo_setting_item_id === logo.id
                                  }
                                  onChange={() =>
                                    setFormData((fd) => ({
                                      ...fd,
                                      certificate_logo_setting_item_id: logo.id,
                                      certificate_logo_file_id: undefined,
                                    }))
                                  }
                                />
                                <img
                                  src={withFileAccessToken(`/files/${logo.file_object_id}`)}
                                  alt=""
                                  className="h-9 w-12 shrink-0 rounded border border-slate-200 bg-white object-contain"
                                />
                                <span
                                  className="max-w-[10rem] truncate text-xs font-medium text-gray-900"
                                  title={logo.label}
                                >
                                  {logo.label}
                                </span>
                              </label>
                            ))}
                          </div>
                          {!(orgLogoPresetsRes?.logos || []).length ? (
                            <p className="mt-2 text-[11px] text-gray-400">
                              No library logos yet. Add them under System Settings → Files → Organization logos.
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3">
                            <span className="text-[11px] font-medium text-slate-600">Course-only override:</span>
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="sr-only"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!f) return;
                                  try {
                                    const id = await uploadTrainingContentFile(f);
                                    setFormData((fd) => ({
                                      ...fd,
                                      certificate_logo_file_id: id,
                                      certificate_logo_setting_item_id: undefined,
                                    }));
                                    toast.success('Logo uploaded');
                                  } catch {
                                    toast.error('Upload failed');
                                  }
                                }}
                              />
                              <span className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm hover:bg-slate-50">
                                Upload file…
                              </span>
                            </label>
                            {formData.certificate_logo_file_id ? (
                              <button
                                type="button"
                                className="text-xs font-semibold text-red-600 hover:underline"
                                onClick={() =>
                                  setFormData((fd) => ({
                                    ...fd,
                                    certificate_logo_file_id: undefined,
                                  }))
                                }
                              >
                                Remove file
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
                    <p className="text-sm font-bold text-gray-900">Certificate wording</p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-gray-600">
                      Landscape PDF. Two title lines are centered at the top; the body supports placeholders for name,
                      course, date, and instructor. The learner&apos;s name on the issued certificate always comes from
                      the employee record; the instructor name prints above the left signature line (script font in the
                      PDF).
                    </p>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-800">First title line</label>
                        <input
                          type="text"
                          value={formData.certificate_heading_primary ?? ''}
                          onChange={(e) =>
                            setFormData({ ...formData, certificate_heading_primary: e.target.value || undefined })
                          }
                          className={FIELD}
                          placeholder="CERTIFICATE"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-800">Second title line</label>
                        <input
                          type="text"
                          value={formData.certificate_heading_secondary ?? ''}
                          onChange={(e) =>
                            setFormData({ ...formData, certificate_heading_secondary: e.target.value || undefined })
                          }
                          className={FIELD}
                          placeholder="OF COMPLETION"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-800">Body paragraph</label>
                        <textarea
                          value={formData.certificate_body_template ?? ''}
                          onChange={(e) =>
                            setFormData({ ...formData, certificate_body_template: e.target.value || undefined })
                          }
                          className={`${FIELD} min-h-[180px]`}
                          rows={8}
                          placeholder={
                            'Placeholders: {user_name}, {course_title}, {completion_date}, {instructor_name}, {certificate_number}, {expiry_date}. Leave blank for the default Mack Kirk paragraph.'
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-800">
                          Instructor name (signature line)
                        </label>
                        <input
                          type="text"
                          value={formData.certificate_instructor_name ?? ''}
                          onChange={(e) =>
                            setFormData({ ...formData, certificate_instructor_name: e.target.value || undefined })
                          }
                          className={FIELD}
                          placeholder="Printed above the left gold line"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold">Certificate validity (days)</label>
                    <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={!formData.certificate_validity_days}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            certificate_validity_days: e.target.checked
                              ? undefined
                              : formData.certificate_validity_days || 365,
                          })
                        }
                      />
                      Never expires
                    </label>
                    <input
                      type="number"
                      value={formData.certificate_validity_days || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          certificate_validity_days: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      className={FIELD}
                      placeholder="365"
                      disabled={!formData.certificate_validity_days}
                    />
                  </div>
                </div>

                <div className="lg:sticky lg:top-4 h-max min-h-0 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live preview</p>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('live')}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                        previewMode === 'live' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Live
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('pdf')}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                        previewMode === 'pdf' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Final PDF
                    </button>
                  </div>
                  <div
                    className="overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-100 shadow-lg lg:min-h-[320px]"
                    style={{ aspectRatio: '11 / 8.5' }}
                    ref={previewFrameRef}
                  >
                    {previewMode === 'pdf' ? (
                      pdfPreviewUrl ? (
                        <iframe
                          title="Generated certificate preview"
                          src={cleanPdfViewerSrc(pdfPreviewUrl)}
                          className="block h-full w-full border-0 bg-white"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-slate-50 text-center">
                          <div className="px-6">
                            <p className="text-sm font-semibold text-slate-700">No PDF preview yet</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Click <strong>Generate PDF</strong> to render the exact final output.
                            </p>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="relative h-full w-full">
                        {livePdfPreviewUrl ? (
                          <iframe
                            title="Live generated certificate preview"
                            src={cleanPdfViewerSrc(livePdfPreviewUrl)}
                            className="block h-full w-full border-0 bg-white"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-xs text-slate-500">
                            Adjust sliders to render live preview
                          </div>
                        )}
                        {isLiveRendering ? (
                          <div className="pointer-events-none absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow">
                            Updating…
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Use <strong>Live</strong> while adjusting sliders. Switch to <strong>Final PDF</strong> after generating
                    to compare exact output.
                  </p>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Layout editor</p>
                    <div className="mt-2 grid gap-2">
                      {[
                        ['Logo X', 'logoX', 0, 760],
                        ['Logo Y', 'logoY', 0, 560],
                        ['Logo Width', 'logoW', 64, 360],
                        ['Logo Height', 'logoH', 20, 150],
                        ['Content Top', 'contentTop', 52, 220],
                        ['Content Side', 'contentSide', 28, 160],
                        ['Title 1 Size', 'h1Size', 16, 56],
                        ['Title 2 Size', 'h2Size', 12, 36],
                        ['Body Size', 'bodySize', 9, 24],
                        ['Title-Body Gap', 'titleBodyGap', 0, 48],
                        ['Signature Gap', 'signatureGap', -24, 120],
                        ['Sign-Name Gap', 'signatureNameGap', 0, 36],
                        ['Sign Side Inset', 'signatureSideInset', 0, 160],
                      ].map(([label, key, min, max]) => (
                        <label key={String(key)} className="grid grid-cols-[94px_1fr_50px] items-center gap-2 text-[11px]">
                          <span className="font-medium text-slate-700">{label}</span>
                          <input
                            type="range"
                            min={Number(min)}
                            max={Number(max)}
                            value={Math.round(certLayout[key as keyof CertificateLayout])}
                            onChange={(e) => setCertLayout(key as keyof CertificateLayout, Number(e.target.value))}
                          />
                          <span className="text-right text-slate-500">{Math.round(certLayout[key as keyof CertificateLayout])}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        onClick={() => setFormData((fd) => ({ ...fd, certificate_layout: { ...DEFAULT_CERT_LAYOUT } }))}
                      >
                        Reset layout
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGenerateCertificatePdf()}
                    disabled={saveMutation.isPending || !formData.generates_certificate || isNew}
                    className="w-full rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saveMutation.isPending ? 'Saving…' : 'Generate PDF'}
                  </button>
                  <p className="text-[11px] text-slate-500">
                    Saves current certificate settings and opens the generated PDF preview in a new tab.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'builder' && (
          <div>
            {isNew ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-red/10 text-brand-red">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800">Content builder unlocks after save</p>
                <p className="mt-1 max-w-sm text-sm text-gray-500">
                  Save this course as a draft first. You can then add modules, lessons, and quizzes from the outline.
                </p>
              </div>
            ) : courseId ? (
              <CourseBuilderPanel courseId={courseId} />
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <button
          type="button"
          onClick={() => navigate('/training/admin')}
          className="w-full rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 sm:w-auto"
        >
          Cancel
        </button>
        <div className="flex flex-wrap items-center justify-stretch gap-2 sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="min-h-[42px] flex-1 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 disabled:opacity-50 sm:flex-none sm:px-5"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save draft'}
          </button>
          {!isNew && course?.status === 'draft' && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishMutation.isPending}
              className="min-h-[42px] flex-1 rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50 sm:flex-none sm:px-5"
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {!isNew && (
            <button
              type="button"
              onClick={() => {
                const newTitle = prompt('Enter new course title:', `${course?.title} (Copy)`);
                if (newTitle) {
                  duplicateMutation.mutate(newTitle);
                }
              }}
              className="min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 sm:w-auto sm:px-5"
            >
              Duplicate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

