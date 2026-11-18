import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckSquare2, ListChecks, Square } from 'lucide-react';
import { ApiError, api, formatApiErrorDetail } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppSectionHeader,
  AppSelect,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type WorkPhase = {
  id: string;
  key: string;
  label: string;
  done: boolean;
  sort: number;
};

export type WorkPhaseTemplate = {
  id: string;
  name: string;
  description?: string | null;
  business_line?: string | null;
  phases: { key: string; label: string }[];
};

type PhasesPayload = {
  work_phases: WorkPhase[];
  work_phase_template_id?: string | null;
  progress?: number | null;
  progress_from_phases?: number | null;
};

type Props = {
  projectId: string;
  businessLine?: string | null;
  canEdit: boolean;
  useDesignSystem?: boolean;
  /** When project payload already has phases, use as initial; still refetch on actions. */
  initialPhases?: WorkPhase[] | null;
  onProgressSynced?: (progress: number | null | undefined) => void;
};

export default function ProjectWorkPhasesCard({
  projectId,
  businessLine,
  canEdit,
  useDesignSystem = true,
  initialPhases,
  onProgressSynced,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['project-work-phases', projectId],
    queryFn: () => api<PhasesPayload>('GET', `/projects/${encodeURIComponent(projectId)}/work-phases`),
    enabled: !!projectId,
    initialData:
      initialPhases && initialPhases.length
        ? {
            work_phases: initialPhases,
            work_phase_template_id: null,
            progress: null,
            progress_from_phases: null,
          }
        : undefined,
  });

  const phases = useMemo(() => {
    const rows = Array.isArray(data?.work_phases) ? [...data!.work_phases!] : [];
    return rows.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }, [data?.work_phases]);

  const { data: templates = [] } = useQuery({
    queryKey: ['work-phase-templates', businessLine || ''],
    queryFn: () => {
      const qs = businessLine
        ? `?business_line=${encodeURIComponent(businessLine)}`
        : '';
      return api<WorkPhaseTemplate[]>('GET', `/work-phase-templates${qs}`);
    },
    enabled: pickerOpen || phases.length === 0,
  });

  const syncProjectCache = (payload: PhasesPayload) => {
    qc.setQueryData(['project-work-phases', projectId], payload);
    qc.setQueryData(['project', projectId], (old: Record<string, unknown> | undefined) =>
      old
        ? {
            ...old,
            work_phases: payload.work_phases,
            work_phase_template_id: payload.work_phase_template_id,
            progress: payload.progress,
          }
        : old
    );
    onProgressSynced?.(payload.progress);
  };

  const applyMut = useMutation({
    mutationFn: (tid: string) =>
      api<PhasesPayload>('POST', `/projects/${encodeURIComponent(projectId)}/work-phases/apply-template`, {
        template_id: tid,
        replace: true,
      }),
    onSuccess: (payload) => {
      syncProjectCache(payload);
      setPickerOpen(false);
      setTemplateId('');
      toast.success('Progress map applied');
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? formatApiErrorDetail(err) || err.message
          : 'Could not apply template'
      );
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ phaseId, done }: { phaseId: string; done: boolean }) =>
      api<PhasesPayload>(
        'PATCH',
        `/projects/${encodeURIComponent(projectId)}/work-phases/${encodeURIComponent(phaseId)}`,
        { done }
      ),
    onSuccess: (payload) => {
      syncProjectCache(payload);
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? formatApiErrorDetail(err) || err.message
          : 'Could not update phase'
      );
    },
  });

  const clearMut = useMutation({
    mutationFn: () =>
      api<PhasesPayload>('DELETE', `/projects/${encodeURIComponent(projectId)}/work-phases`),
    onSuccess: (payload) => {
      syncProjectCache(payload);
      toast.success('Progress map cleared');
    },
    onError: () => toast.error('Could not clear progress map'),
  });

  const doneCount = phases.filter((p) => p.done).length;
  const pct =
    typeof data?.progress_from_phases === 'number'
      ? data.progress_from_phases
      : phases.length
        ? Math.round((100 * doneCount) / phases.length)
        : null;

  const openPicker = async () => {
    if (phases.length && canEdit) {
      const result = await confirm({
        title: 'Replace progress map?',
        message: 'Choosing a template replaces the current checklist on this project.',
        confirmText: 'Choose template',
        cancelText: 'Cancel',
      });
      if (result !== 'confirm') return;
    }
    setPickerOpen(true);
  };

  const body = (
    <div className="space-y-3">
      {isLoading && !phases.length ? (
        <p className={uiTypography.helper}>Loading…</p>
      ) : phases.length === 0 ? (
        <AppEmptyState
          title="No progress map yet"
          description="Pick a template to create broad job phases. Checking them off updates project progress %."
          className="border-0 bg-transparent p-0 shadow-none"
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className={uiTypography.helper}>
              {doneCount}/{phases.length} done
              {pct != null ? ` · ${pct}%` : ''}
            </p>
          </div>
          <ul className="space-y-1.5">
            {phases.map((phase) => {
              const busy = toggleMut.isPending && toggleMut.variables?.phaseId === phase.id;
              return (
                <li key={phase.id}>
                  <button
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() =>
                      canEdit && toggleMut.mutate({ phaseId: phase.id, done: !phase.done })
                    }
                    className={uiCx(
                      'flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                      canEdit ? 'hover:bg-gray-50' : 'cursor-default',
                      phase.done ? 'opacity-80' : ''
                    )}
                  >
                    <span className="mt-0.5 text-brand-red shrink-0">
                      {phase.done ? (
                        <CheckSquare2 className="h-4.5 w-4.5" aria-hidden />
                      ) : (
                        <Square className="h-4.5 w-4.5 text-gray-400" aria-hidden />
                      )}
                    </span>
                    <span
                      className={uiCx(
                        'text-sm text-gray-900',
                        phase.done ? 'line-through text-gray-500' : 'font-medium'
                      )}
                    >
                      {phase.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canEdit ? (
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
          <AppButton type="button" size="sm" variant="secondary" onClick={() => void openPicker()}>
            {phases.length ? 'Change template' : 'Choose template'}
          </AppButton>
          {phases.length ? (
            <AppButton
              type="button"
              size="sm"
              variant="ghost"
              loading={clearMut.isPending}
              onClick={async () => {
                const result = await confirm({
                  title: 'Clear progress map?',
                  message: 'Removes all phases from this project. Progress % is left as-is.',
                  confirmText: 'Clear',
                  cancelText: 'Cancel',
                });
                if (result !== 'confirm') return;
                clearMut.mutate();
              }}
            >
              Clear
            </AppButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {useDesignSystem ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Job progress"
            description="Broad phases for this job — not system Tasks. Completing them updates progress %."
            icon={<ListChecks className="h-4 w-4" />}
          />
          <div className="mt-3">{body}</div>
        </AppCard>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Job progress</h3>
          <p className="mt-1 text-xs text-gray-500">
            Broad phases for this job — not system Tasks.
          </p>
          <div className="mt-3">{body}</div>
        </div>
      )}

      <AppFormModal
        open={pickerOpen}
        onClose={() => {
          if (applyMut.isPending) return;
          setPickerOpen(false);
          setTemplateId('');
        }}
        title="Choose progress template"
        description="Phases are created on this project. You can check them off as work advances."
        size="md"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={applyMut.isPending}
              onClick={() => {
                setPickerOpen(false);
                setTemplateId('');
              }}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={applyMut.isPending}
              disabled={!templateId}
              onClick={() => applyMut.mutate(templateId)}
            >
              Apply
            </AppButton>
          </div>
        }
      >
        {templates.length === 0 ? (
          <p className={uiTypography.helper}>No templates available for this business line.</p>
        ) : (
          <div className="space-y-3">
            <AppSelect
              label="Template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="Select a template…"
              options={templates.map((t) => ({
                value: t.id,
                label: `${t.name}${t.phases?.length ? ` (${t.phases.length} phases)` : ''}`,
              }))}
            />
            {templateId ? (
              <ul className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 space-y-1">
                {(templates.find((t) => t.id === templateId)?.phases || []).map((p) => (
                  <li key={p.key}>• {p.label}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </AppFormModal>
    </>
  );
}
