import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarDays } from 'lucide-react';
import SafetyServiceCalendar from './SafetyServiceCalendar';
import { api } from '@/lib/api';
import { hasAnyLineSafetyPermission } from '@/lib/projectLinePermissionKeys';
import {
  AppButton,
  AppCombobox,
  AppDatePicker,
  AppFormModal,
  AppPageHeader,
  AppSelect,
  AppTimePicker,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type BizProject = { id: string; name: string; code?: string; business_line?: string };

type FormTemplatePick = {
  id: string;
  name: string;
  version_label: string;
};

function formatProjectLabel(p: BizProject): string {
  return p.code ? `${p.code} — ${p.name}` : p.name;
}

type SafetyInspectionCreated = {
  id: string;
  project_id: string;
  inspection_date: string | null;
  status?: string;
};

function localDatePart(value: string): string {
  if (!value) return '';
  return value.split('T')[0] || '';
}

function localTimePart(value: string): string {
  const timePart = value.split('T')[1] || '';
  return /^\d{2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : '';
}

function PlannedDateTimeFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const date = localDatePart(value);
  const time = localTimePart(value);

  return (
    <div className={uiSpacing.sectionStack}>
      <AppDatePicker
        label="Planned date and time *"
        value={date}
        onChange={(e) => {
          const d = e.target.value;
          if (!d) {
            onChange('');
            return;
          }
          onChange(time ? `${d}T${time}` : `${d}T`);
        }}
        required
      />
      <AppTimePicker
        label="Time *"
        value={time}
        onChange={(e) => {
          const t = e.target.value;
          if (!date) return;
          onChange(t ? `${date}T${t}` : `${date}T`);
        }}
        required
      />
    </div>
  );
}

export default function SafetySchedulePage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [scheduledLocal, setScheduledLocal] = useState(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });



  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(projectSearch.trim()), 300);
    return () => window.clearTimeout(t);
  }, [projectSearch]);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const permissions = new Set((me?.permissions || []) as string[]);
  const isAdmin = (me?.roles || []).some((r: unknown) => String(r ?? '').toLowerCase() === 'admin');
  const canSchedule = hasAnyLineSafetyPermission(permissions, 'write', isAdmin);

  const { data: schedulableTemplates = [] } = useQuery({
    queryKey: ['formTemplatesSchedulable', showModal],
    queryFn: () => api<FormTemplatePick[]>('GET', '/form-templates?schedulable=true'),
    enabled: showModal && canSchedule,
  });

  const { data: projectsRes, isLoading: projectsLoading } = useQuery({
    queryKey: ['business-projects-safety-picker', debouncedQ],
    queryFn: () =>
      api<{ items: BizProject[] }>(
        'GET',
        `/projects/business/projects?limit=100&page=1${debouncedQ ? `&q=${encodeURIComponent(debouncedQ)}` : ''}`
      ),
    enabled: showModal && canSchedule,
  });

  const projectItems = projectsRes?.items ?? [];

  const projectOptions = useMemo(
    () =>
      projectItems.map((p) => ({
        value: p.id,
        label: formatProjectLabel(p),
      })),
    [projectItems]
  );

  const templateOptions = useMemo(
    () => [
      { value: '', label: '— Select template —' },
      ...schedulableTemplates.map((t) => ({
        value: t.id,
        label: `${t.name}${(t.version_label || '').trim() ? ` (${(t.version_label || '').trim()})` : ''}`,
      })),
    ],
    [schedulableTemplates]
  );

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('Select a project');
      if (!selectedTemplateId) throw new Error('Select a template');
      const t = new Date(scheduledLocal);
      if (Number.isNaN(t.getTime())) throw new Error('Invalid date');
      return api<SafetyInspectionCreated>('POST', `/projects/${encodeURIComponent(selectedProjectId)}/safety-inspections`, {
        form_template_id: selectedTemplateId,
        form_payload: {},
        inspection_date: t.toISOString(),
      });
    },
    onSuccess: (row) => {
      toast.success('Inspection scheduled');
      queryClient.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['safetyInspections'] });
      queryClient.invalidateQueries({ queryKey: ['projectSafetyInspections', row.project_id] });
      setShowModal(false);
      setSelectedProjectId('');
      setProjectSearch('');
      setSelectedTemplateId('');
    },
    onError: () => toast.error('Could not schedule inspection'),
  });

  const canSubmit = useMemo(
    () =>
      !!selectedProjectId &&
      !!selectedTemplateId &&
      !!scheduledLocal &&
      !scheduleMutation.isPending,
    [selectedProjectId, selectedTemplateId, scheduledLocal, scheduleMutation.isPending]
  );

  const resetScheduleForm = () => {
    setProjectSearch('');
    setSelectedProjectId('');
    setDebouncedQ('');
    setSelectedTemplateId('');
  };

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Safety schedule"
        subtitle="Scheduled site safety inspections on the calendar. Open the project Safety tab to complete forms."
        icon={<CalendarDays className="h-4 w-4" />}
      />

      <SafetyServiceCalendar
        embedView
        canSchedule={canSchedule}
        onScheduleNew={() => {
          resetScheduleForm();
          setShowModal(true);
        }}
      />

      <AppFormModal
        open={showModal && canSchedule}
        onClose={() => setShowModal(false)}
        title="Schedule site safety inspection"
        description="Pick an active form template, an awarded project, and a planned date. Complete the form on the project Safety tab."
        footer={
          <>
            <AppButton type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </AppButton>
            <AppButton type="button" disabled={!canSubmit} onClick={() => scheduleMutation.mutate()}>
              {scheduleMutation.isPending ? 'Scheduling…' : 'Schedule inspection'}
            </AppButton>
          </>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppSelect
            label="Form template *"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            options={templateOptions}
          />
          <AppCombobox
            label="Project *"
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            onInputChange={setProjectSearch}
            options={projectOptions}
            placeholder="Search by name or code…"
            emptyMessage={
              projectsLoading ? 'Loading…' : 'No projects match. Try another search.'
            }
          />
          <PlannedDateTimeFields value={scheduledLocal} onChange={setScheduledLocal} />
        </div>
      </AppFormModal>
    </div>
  );
}
