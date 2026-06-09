import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { uploadTrainingContentFile } from '@/lib/trainingFileUpload';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import toast from 'react-hot-toast';
import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import CourseBuilderPanel from '@/pages/training/CourseBuilderPanel';
import { Plus, Settings } from 'lucide-react';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppCombobox,
  AppEmptyState,
  AppFileUpload,
  AppInput,
  AppMultiSelect,
  AppPageHeader,
  AppSectionHeader,
  AppSelect,
  AppTabs,
  AppTextarea,
  AppUserSelect,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const PAGE_TABS = [
  { key: 'setup', label: 'Setup' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'certificate', label: 'Certificate' },
  { key: 'builder', label: 'Content builder' },
] as const;

const PUBLICATION_TABS = [
  { key: 'draft', label: 'Draft' },
  { key: 'published', label: 'Published' },
] as const;

const PREVIEW_MODE_TABS = [
  { key: 'live', label: 'Live' },
  { key: 'pdf', label: 'Final PDF' },
] as const;

const RENEWAL_FREQUENCY_OPTIONS = [
  { value: 'none', label: 'No renewal' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
  { value: 'days_X', label: 'Custom (X days)' },
  { value: 'every_new_job', label: 'Every New Job' },
] as const;

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

const CERT_PAGE_W = 792;
const CERT_PAGE_H = 612;

function CertificateHtmlPreview({
  layout,
  bgUrl,
  logoFileId,
  headingPrimary,
  headingSecondary,
  bodyText,
  instructorName,
  scale,
}: {
  layout: CertificateLayout;
  bgUrl: string | null;
  logoFileId?: string;
  headingPrimary: string;
  headingSecondary: string;
  bodyText: string;
  instructorName: string;
  scale: number;
}) {
  const safeScale = Math.max(0.1, scale);

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-slate-100">
      <div
        className="relative overflow-hidden bg-white shadow-sm"
        style={{ width: CERT_PAGE_W * safeScale, height: CERT_PAGE_H * safeScale }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left bg-white"
          style={{
            width: CERT_PAGE_W,
            height: CERT_PAGE_H,
            transform: `scale(${safeScale})`,
          }}
        >
          {bgUrl ? (
            <img src={bgUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <>
              <div className="absolute inset-0 bg-[#ededed]" />
              <div
                className="pointer-events-none absolute border border-[#b08d57]"
                style={{ left: 28, top: 28, right: 28, bottom: 28 }}
              />
            </>
          )}
          {logoFileId ? (
            <img
              src={withFileAccessToken(`/files/${logoFileId}`)}
              alt=""
              className="absolute object-contain"
              style={{
                left: layout.logoX,
                top: layout.logoY,
                width: layout.logoW,
                height: layout.logoH,
              }}
            />
          ) : null}
          <div
            className="absolute text-center text-[#7f1010]"
            style={{
              left: layout.contentSide,
              right: layout.contentSide,
              top: layout.contentTop,
            }}
          >
            <div style={{ fontSize: layout.h1Size, fontWeight: 700, lineHeight: 1.1 }}>{headingPrimary}</div>
            <div style={{ fontSize: layout.h2Size, fontWeight: 600, lineHeight: 1.2, marginTop: 4 }}>
              {headingSecondary}
            </div>
            <div
              className="whitespace-pre-wrap text-left text-[#2d2d2d]"
              style={{ fontSize: layout.bodySize, marginTop: layout.titleBodyGap, lineHeight: 1.45 }}
            >
              {bodyText}
            </div>
          </div>
          <div
            className="absolute inset-x-0 flex justify-between text-[#555555]"
            style={{
              bottom: 72,
              paddingLeft: layout.signatureSideInset,
              paddingRight: layout.signatureSideInset,
            }}
          >
            <div className="flex-1 text-center">
              <div className="mx-auto h-px w-40 bg-[#b08d57]" style={{ marginBottom: layout.signatureNameGap }} />
              <div style={{ fontSize: Math.max(10, layout.bodySize - 2) }}>{instructorName}</div>
            </div>
            <div className="flex-1 text-center">
              <div
                className="mx-auto h-px w-40 bg-[#b08d57]"
                style={{ marginBottom: layout.signatureNameGap, marginTop: layout.signatureGap }}
              />
              <div style={{ fontSize: Math.max(10, layout.bodySize - 2) }}>Participant name</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  const categoryOptions = useMemo(
    () => [
      { value: '', label: 'Select a category' },
      ...categories.map((cat: { id: string; label: string }) => ({
        value: String(cat.id),
        label: String(cat.label),
      })),
    ],
    [categories],
  );
  const matrixOptions = useMemo(
    () => [
      { value: '', label: 'None — internal only' },
      ...(matrixCatalog?.items || []).map((it) => ({ value: it.id, label: it.label })),
    ],
    [matrixCatalog?.items],
  );
  const roleMultiOptions = useMemo(
    () =>
      ((roles as any[]) || []).map((r) => ({
        value: String(r.id),
        label: String(r.name || 'Role'),
      })),
    [roles],
  );
  const divisionMultiOptions = useMemo(
    () =>
      (divisions || []).map((d: { id: string; label: string }) => ({
        value: String(d.id),
        label: String(d.label || 'Division'),
      })),
    [divisions],
  );
  const employeeUsers = useMemo(
    () => ((employees as any[]) || []).map((e) => mapEmployeeToAppUserSelect(e)),
    [employees],
  );
  const selectedRoleIds = formData.required_role_ids || [];
  const selectedDivisionIds = formData.required_division_ids || [];
  const selectedUserIds = formData.required_user_ids || [];
  const publicationStatus = (formData.status || 'draft') as 'draft' | 'published';

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
  const [previewSize, setPreviewSize] = useState({ w: CERT_PAGE_W, h: CERT_PAGE_H });
  useLayoutEffect(() => {
    if (activeTab !== 'certificate' || !formData.generates_certificate) return;
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
  }, [activeTab, formData.generates_certificate]);
  const previewScale = Math.min(previewSize.w / CERT_PAGE_W, previewSize.h / CERT_PAGE_H);
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
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppCard className={uiShadows.card} bodyClassName={uiCx(uiSpacing.cardPadding, 'flex min-h-[240px] flex-col items-center justify-center')}>
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-brand-red" />
          <p className={uiCx('mt-4', uiTypography.body, 'font-medium')}>Loading course…</p>
        </AppCard>
      </div>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={isNew ? 'Create new course' : `Edit: ${course?.title || 'Course'}`}
        subtitle={isNew ? 'Set up your training course' : 'Manage course content and settings'}
        icon={<Settings className="h-4 w-4" />}
        onBack={() => navigate('/training/admin')}
        backLabel="Back to list"
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
        <div
          className={uiCx(
            uiLayout.actionsRow,
            'flex-col flex-wrap items-stretch justify-between gap-3 lg:flex-row lg:items-center',
          )}
        >
          <AppTabs
            tabs={[...PAGE_TABS]}
            value={activeTab}
            onChange={(key) => setActiveTab(key as typeof activeTab)}
          />
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center gap-3 lg:shrink-0')}>
            <span className={uiTypography.overline}>Publication</span>
            <AppBadge variant={publicationStatus === 'published' ? 'success' : 'neutral'}>
              {publicationStatus === 'published' ? 'Published' : 'Draft'}
            </AppBadge>
            <AppTabs
              tabs={[...PUBLICATION_TABS]}
              value={publicationStatus}
              onChange={(key) => setFormData({ ...formData, status: key as 'draft' | 'published' })}
            />
          </div>
        </div>
        <p className={uiCx('mt-3', uiTypography.helper, 'lg:text-right')}>
          {publicationStatus === 'published'
            ? 'Visible to learners per Requirements.'
            : 'Hidden from the catalog until you publish.'}
        </p>
      </AppCard>

      <AppCard className={uiShadows.card} bodyClassName={uiCx(uiSpacing.cardPadding, 'sm:p-6')}>
        {activeTab === 'setup' && (
          <div className={uiSpacing.sectionStack}>
            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppSectionHeader
                title="Basics & visibility"
                description="Set how this course appears in the catalog—like the first screen on a platform such as Udemy—then fine-tune HR reporting below. Use Publication in the tab bar to switch Draft or Published."
              />
            </AppCard>

            <AppCard bodyClassName="!p-0">
              <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100')}>
                <AppSectionHeader
                  title="Course information"
                  description="Title, summary, category, and duration—aligned with how you structure lessons in Content builder."
                />
              </div>
              <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
                <AppInput
                  label="Title *"
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Clear, specific course title"
                />

                <AppTextarea
                  label="Description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={4}
                  placeholder="What learners will get out of this course—outcomes, audience, and format."
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <AppSelect
                    label="Category"
                    value={formData.category_id || ''}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value || undefined })}
                    options={categoryOptions}
                  />

                  <AppInput
                    label="Estimated duration (minutes)"
                    type="number"
                    min={0}
                    value={formData.estimated_duration_minutes ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        estimated_duration_minutes: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      })
                    }
                    placeholder="e.g. 60"
                    helperText="Approximate time to complete all lessons."
                  />
                </div>
              </div>
            </AppCard>

            <AppCard bodyClassName="!p-0">
              <div className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100')}>
                <AppSectionHeader
                  title="HR profile & training matrix"
                  description="Optional: sync completions into employee training history and the standard matrix column."
                />
              </div>
              <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
                <p className={uiTypography.body}>
                  When a learner completes this course, you can write a row to their HR training history and fill the
                  matrix column (only if the slot is free or was created by a previous LMS sync for this course).
                </p>
                <AppCombobox
                  label="Matrix column"
                  value={formData.matrix_training_id || ''}
                  onChange={(value) => setFormData({ ...formData, matrix_training_id: value })}
                  options={matrixOptions}
                  placeholder="Search matrix columns…"
                />
                <AppCheckbox
                  className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surface, 'px-4 py-3 hover:bg-gray-50')}
                  label="Sync completion to employee training record / matrix"
                  checked={!!formData.sync_completion_to_employee_record}
                  onChange={(checked) =>
                    setFormData({ ...formData, sync_completion_to_employee_record: checked })
                  }
                />
              </div>
            </AppCard>
          </div>
        )}

        {activeTab === 'requirements' && (
          <div className={uiSpacing.sectionStack}>
            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <AppCheckbox
                label={
                  <span>
                    <span className="font-semibold text-gray-900">This course is required</span>
                    <span className={uiCx('mt-0.5 block', uiTypography.helper)}>
                      Assign required audiences and renewal policy.
                    </span>
                  </span>
                }
                checked={formData.is_required || false}
                onChange={(checked) => setFormData({ ...formData, is_required: checked })}
              />
            </AppCard>

            {formData.is_required && (
              <>
                <AppCard bodyClassName={uiSpacing.sectionStack}>
                  <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                    <AppSelect
                      label="Renewal Frequency"
                      value={formData.renewal_frequency || 'none'}
                      onChange={(e) => setFormData({ ...formData, renewal_frequency: e.target.value })}
                      options={[...RENEWAL_FREQUENCY_OPTIONS]}
                    />
                    <AppInput
                      label="Custom renewal (days)"
                      type="number"
                      disabled={formData.renewal_frequency !== 'days_X'}
                      value={formData.renewal_frequency_days || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          renewal_frequency_days: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      placeholder="Days"
                    />
                  </div>
                </AppCard>

                <div className="grid gap-4 xl:grid-cols-3">
                  <AppCard bodyClassName={uiSpacing.sectionStack}>
                    <AppMultiSelect
                      searchable
                      label="Roles"
                      value={selectedRoleIds}
                      onChange={(ids) => setFormData({ ...formData, required_role_ids: ids })}
                      options={roleMultiOptions}
                      placeholder="Search roles…"
                      showSelectedChips
                      helperText={`${selectedRoleIds.length} selected`}
                    />
                  </AppCard>
                  <AppCard bodyClassName={uiSpacing.sectionStack}>
                    <AppMultiSelect
                      searchable
                      label="Divisions"
                      value={selectedDivisionIds}
                      onChange={(ids) => setFormData({ ...formData, required_division_ids: ids })}
                      options={divisionMultiOptions}
                      placeholder="Search divisions…"
                      showSelectedChips
                      helperText={`${selectedDivisionIds.length} selected`}
                    />
                  </AppCard>
                  <AppCard bodyClassName={uiSpacing.sectionStack}>
                    <AppUserSelect
                      mode="multiple"
                      label="Users"
                      users={employeeUsers}
                      value={selectedUserIds}
                      onChange={(ids) => setFormData({ ...formData, required_user_ids: ids })}
                      placeholder="Search users…"
                      showSelectedChips
                      helperText={`${selectedUserIds.length} selected`}
                    />
                  </AppCard>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'certificate' && (
          <div className={uiSpacing.sectionStack}>
            <AppCheckbox
              label="Generate certificate upon completion"
              checked={!!formData.generates_certificate}
              onChange={(checked) => setFormData({ ...formData, generates_certificate: checked })}
            />

            {formData.generates_certificate && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_min(460px,54vw)] xl:grid-cols-[minmax(0,1fr)_min(600px,58%)]">
                <div className={uiCx('min-w-0', uiSpacing.sectionStack)}>
                  <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
                    <AppSectionHeader
                      title="Certificate format"
                      description="Choose the layout family for this course. The standard option matches the current PDF engine; future formats may use different text positions and artwork regions."
                    />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label
                        className={uiCx(
                          'flex cursor-default gap-3 border-2 border-brand-red bg-red-50/30 p-4 ring-1 ring-brand-red/20',
                          uiRadius.card,
                        )}
                      >
                        <input type="radio" name="cert-layout" className="mt-1" checked readOnly />
                        <div>
                          <div className={uiTypography.sectionTitle}>Standard — landscape letter</div>
                          <p className={uiCx('mt-1 leading-snug', uiTypography.helper)}>
                            US Letter landscape (11&quot; × 8.5&quot;). Optional full-page background; optional logo
                            top-left next to titles.
                          </p>
                        </div>
                      </label>
                      <div className={uiCx(uiBorders.createDashed, uiColors.surfaceSubtle, uiRadius.card, 'p-4')}>
                        <p className={uiTypography.sectionTitle}>More formats</p>
                        <p className={uiCx('mt-1 leading-relaxed', uiTypography.helper)}>
                          Additional certificate types and layout presets will appear here later.
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 border-t border-gray-100 pt-6">
                      <p className={uiTypography.overline}>Page artwork</p>
                      <p className={uiCx('mt-1', uiTypography.helper)}>
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

                        <div className={uiCx('min-w-0', uiRadius.card, uiBorders.subtle, uiColors.surfaceSubtle, 'p-4')}>
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
                          <div className={uiCx('mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200/80 pt-3')}>
                            <AppFileUpload
                              accept="image/jpeg,image/png,image/webp"
                              label="Course-only override"
                              helperText="Upload a logo for this course only."
                              value={null}
                              onChange={() => undefined}
                              onFilesSelected={async (files) => {
                                const f = files[0];
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
                            {formData.certificate_logo_file_id ? (
                              <AppButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() =>
                                  setFormData((fd) => ({
                                    ...fd,
                                    certificate_logo_file_id: undefined,
                                  }))
                                }
                              >
                                Remove file
                              </AppButton>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </AppCard>

                  <AppCard className={uiShadows.card} bodyClassName={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack)}>
                    <AppSectionHeader
                      title="Certificate wording"
                      description="Landscape PDF. Two title lines are centered at the top; the body supports placeholders for name, course, date, and instructor. The learner's name on the issued certificate always comes from the employee record; the instructor name prints above the left signature line (script font in the PDF)."
                    />
                    <AppInput
                      label="First title line"
                      value={formData.certificate_heading_primary ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, certificate_heading_primary: e.target.value || undefined })
                      }
                      placeholder="CERTIFICATE"
                    />
                    <AppInput
                      label="Second title line"
                      value={formData.certificate_heading_secondary ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, certificate_heading_secondary: e.target.value || undefined })
                      }
                      placeholder="OF COMPLETION"
                    />
                    <AppTextarea
                      label="Body paragraph"
                      value={formData.certificate_body_template ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, certificate_body_template: e.target.value || undefined })
                      }
                      rows={8}
                      placeholder="Placeholders: {user_name}, {course_title}, {completion_date}, {instructor_name}, {certificate_number}, {expiry_date}. Leave blank for the default Mack Kirk paragraph."
                    />
                    <AppInput
                      label="Instructor name (signature line)"
                      value={formData.certificate_instructor_name ?? ''}
                      onChange={(e) =>
                        setFormData({ ...formData, certificate_instructor_name: e.target.value || undefined })
                      }
                      placeholder="Printed above the left gold line"
                    />
                  </AppCard>

                  <AppCard bodyClassName={uiSpacing.sectionStack}>
                    <AppCheckbox
                      label="Never expires"
                      checked={!formData.certificate_validity_days}
                      onChange={(checked) =>
                        setFormData({
                          ...formData,
                          certificate_validity_days: checked ? undefined : formData.certificate_validity_days || 365,
                        })
                      }
                    />
                    <AppInput
                      label="Certificate validity (days)"
                      type="number"
                      value={formData.certificate_validity_days || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          certificate_validity_days: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      placeholder="365"
                      disabled={!formData.certificate_validity_days}
                    />
                  </AppCard>
                </div>

                <div className={uiCx('lg:sticky lg:top-4 h-max min-h-0', uiSpacing.sectionStack)}>
                  <p className={uiTypography.overline}>Live preview</p>
                  <AppTabs
                    tabs={[...PREVIEW_MODE_TABS]}
                    value={previewMode}
                    onChange={(key) => setPreviewMode(key as 'live' | 'pdf')}
                  />
                  <div
                    ref={previewFrameRef}
                    className={uiCx(
                      'relative w-full overflow-hidden border-2 border-gray-200 bg-gray-100 shadow-lg',
                      uiRadius.card,
                    )}
                    style={{ aspectRatio: '11 / 8.5', minHeight: 320 }}
                  >
                    {previewMode === 'pdf' ? (
                      pdfPreviewUrl ? (
                        <iframe
                          title="Generated certificate preview"
                          src={cleanPdfViewerSrc(pdfPreviewUrl)}
                          className="absolute inset-0 block h-full w-full border-0 bg-white"
                        />
                      ) : (
                        <div className="absolute inset-0 flex h-full items-center justify-center bg-slate-50 text-center">
                          <div className="px-6">
                            <p className="text-sm font-semibold text-slate-700">No PDF preview yet</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Click <strong>Generate PDF</strong> to render the exact final output.
                            </p>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="absolute inset-0">
                        {!isNew && livePdfPreviewUrl ? (
                          <iframe
                            title="Live generated certificate preview"
                            src={cleanPdfViewerSrc(livePdfPreviewUrl)}
                            className="absolute inset-0 block h-full w-full border-0 bg-white"
                          />
                        ) : (
                          <CertificateHtmlPreview
                            layout={certLayout}
                            bgUrl={previewBgUrl}
                            logoFileId={previewLogoFileId}
                            headingPrimary={previewH1}
                            headingSecondary={previewH2}
                            bodyText={previewBodyText}
                            instructorName={previewInstructor}
                            scale={previewScale}
                          />
                        )}
                        {isLiveRendering ? (
                          <div className="pointer-events-none absolute right-2 top-2 rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow">
                            Updating…
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <p className={uiTypography.helper}>
                    Use <strong>Live</strong> while adjusting sliders. Switch to <strong>Final PDF</strong> after generating
                    to compare exact output.
                  </p>
                  <AppCard bodyClassName={uiSpacing.compactCardPadding}>
                    <p className={uiTypography.overline}>Layout editor</p>
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
                        <label
                          key={String(key)}
                          className={uiCx('grid grid-cols-[94px_1fr_50px] items-center gap-2', uiTypography.helper)}
                        >
                          <span className="font-medium text-gray-700">{label}</span>
                          <input
                            type="range"
                            min={Number(min)}
                            max={Number(max)}
                            value={Math.round(certLayout[key as keyof CertificateLayout])}
                            onChange={(e) => setCertLayout(key as keyof CertificateLayout, Number(e.target.value))}
                          />
                          <span className="text-right text-gray-500">
                            {Math.round(certLayout[key as keyof CertificateLayout])}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-end">
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setFormData((fd) => ({ ...fd, certificate_layout: { ...DEFAULT_CERT_LAYOUT } }))}
                      >
                        Reset layout
                      </AppButton>
                    </div>
                  </AppCard>
                  <AppButton
                    type="button"
                    className="w-full"
                    onClick={() => void handleGenerateCertificatePdf()}
                    disabled={saveMutation.isPending || !formData.generates_certificate || isNew}
                    loading={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? 'Saving…' : 'Generate PDF'}
                  </AppButton>
                  <p className={uiTypography.helper}>
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
              <AppEmptyState
                title="Content builder unlocks after save"
                description="Save this course as a draft first. You can then add modules, lessons, and quizzes from the outline."
                icon={<Plus className="h-5 w-5" />}
                className="border-0 bg-transparent shadow-none"
              />
            ) : courseId ? (
              <CourseBuilderPanel courseId={courseId} />
            ) : null}
          </div>
        )}
      </AppCard>

      <AppCard
        className={uiShadows.card}
        bodyClassName={uiCx(uiSpacing.cardPadding, uiLayout.actionsRow, 'flex-col flex-wrap sm:flex-row sm:items-center sm:justify-between')}
      >
        <AppButton type="button" variant="secondary" onClick={() => navigate('/training/admin')} className="w-full sm:w-auto">
          Cancel
        </AppButton>
        <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-stretch sm:w-auto sm:justify-end')}>
          <AppButton
            type="button"
            variant="secondary"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            loading={saveMutation.isPending}
            className="min-h-[42px] flex-1 sm:flex-none"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save draft'}
          </AppButton>
          {!isNew && course?.status === 'draft' && (
            <AppButton
              type="button"
              onClick={handlePublish}
              disabled={publishMutation.isPending}
              loading={publishMutation.isPending}
              className="min-h-[42px] flex-1 sm:flex-none"
            >
              {publishMutation.isPending ? 'Publishing…' : 'Publish'}
            </AppButton>
          )}
          {!isNew && (
            <AppButton
              type="button"
              variant="secondary"
              className="min-h-[42px] w-full sm:w-auto"
              onClick={() => {
                const newTitle = prompt('Enter new course title:', `${course?.title} (Copy)`);
                if (newTitle) {
                  duplicateMutation.mutate(newTitle);
                }
              }}
            >
              Duplicate
            </AppButton>
          )}
        </div>
      </AppCard>
    </div>
  );
}

