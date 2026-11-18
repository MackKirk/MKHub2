import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckSquare2, ListChecks, Plus, Square, Trash2 } from 'lucide-react';
import { ApiError, api, formatApiErrorDetail } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListRowIconButton,
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
  source_template_id?: string | null;
  source_template_name?: string | null;
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
  const [replaceOnApply, setReplaceOnApply] = useState(false);
  const [newLabel, setNewLabel] = useState('');

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
    mutationFn: ({ tid, replace }: { tid: string; replace: boolean }) =>
      api<PhasesPayload>('POST', `/projects/${encodeURIComponent(projectId)}/work-phases/apply-template`, {
        template_id: tid,
        replace,
      }),
    onSuccess: (payload, vars) => {
      syncProjectCache(payload);
      setPickerOpen(false);
      setTemplateId('');
      setReplaceOnApply(false);
      toast.success(vars.replace ? 'Progress map replaced' : 'Template phases added');
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? formatApiErrorDetail(err) || err.message
          : 'Could not apply template'
      );
    },
  });

  const addMut = useMutation({
    mutationFn: (label: string) =>
      api<PhasesPayload>('POST', `/projects/${encodeURIComponent(projectId)}/work-phases`, {
        label,
      }),
    onSuccess: (payload) => {
      syncProjectCache(payload);
      setNewLabel('');
      toast.success('Phase added');
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError
          ? formatApiErrorDetail(err) || err.message
          : 'Could not add phase'
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

  const removeMut = useMutation({
    mutationFn: (phaseId: string) =>
      api<PhasesPayload>(
        'DELETE',
        `/projects/${encodeURIComponent(projectId)}/work-phases/${encodeURIComponent(phaseId)}`
      ),
    onSuccess: (payload) => {
      syncProjectCache(payload);
    },
    onError: () => toast.error('Could not remove phase'),
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

  const submitNewPhase = () => {
    const label = newLabel.trim();
    if (!label || addMut.isPending) return;
    addMut.mutate(label);
  };

  const body = (
    <div className="space-y-3">
      {isLoading && !phases.length ? (
        <p className={uiTypography.helper}>Loading…</p>
      ) : phases.length === 0 ? (
        <AppEmptyState
          title="No progress phases yet"
          description="Add phases manually or pull in one or more templates (e.g. Pre-production, then Production)."
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
              const busy =
                (toggleMut.isPending && toggleMut.variables?.phaseId === phase.id) ||
                (removeMut.isPending && removeMut.variables === phase.id);
              return (
                <li key={phase.id} className="flex items-start gap-1">
                  <button
                    type="button"
                    disabled={!canEdit || busy}
                    onClick={() =>
                      canEdit && toggleMut.mutate({ phaseId: phase.id, done: !phase.done })
                    }
                    className={uiCx(
                      'flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                      canEdit ? 'hover:bg-gray-50' : 'cursor-default',
                      phase.done ? 'opacity-80' : ''
                    )}
                  >
                    <span className="mt-0.5 shrink-0 text-brand-red">
                      {phase.done ? (
                        <CheckSquare2 className="h-4.5 w-4.5" aria-hidden />
                      ) : (
                        <Square className="h-4.5 w-4.5 text-gray-400" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={uiCx(
                          'block text-sm text-gray-900',
                          phase.done ? 'text-gray-500 line-through' : 'font-medium'
                        )}
                      >
                        {phase.label}
                      </span>
                      {phase.source_template_name ? (
                        <span className={uiCx(uiTypography.helper, 'mt-0.5 block truncate')}>
                          from {phase.source_template_name}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {canEdit ? (
                    <AppListRowIconButton
                      label={`Remove ${phase.label}`}
                      icon={<Trash2 className="h-4 w-4" />}
                      disabled={busy}
                      className="mt-1 shrink-0"
                      onClick={() => removeMut.mutate(phase.id)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canEdit ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <AppInput
              id="work-phase-new-label"
              className="min-w-0 flex-1"
              label="Add phase"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Scaffolding setup"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitNewPhase();
                }
              }}
            />
            <AppButton
              type="button"
              size="sm"
              loading={addMut.isPending}
              disabled={!newLabel.trim()}
              onClick={submitNewPhase}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </AppButton>
          </div>

          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
            <AppButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setReplaceOnApply(false);
                setPickerOpen(true);
              }}
            >
              Add from template
            </AppButton>
            {phases.length ? (
              <AppButton
                type="button"
                size="sm"
                variant="ghost"
                loading={clearMut.isPending}
                onClick={async () => {
                  const result = await confirm({
                    title: 'Clear all phases?',
                    message: 'Removes every phase on this project. Progress % is left as-is.',
                    confirmText: 'Clear all',
                    cancelText: 'Cancel',
                  });
                  if (result !== 'confirm') return;
                  clearMut.mutate();
                }}
              >
                Clear all
              </AppButton>
            ) : null}
          </div>
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
            description="Checklist for this job — not system Tasks. Add phases by hand or stack templates. Completing them updates progress %."
            icon={<ListChecks className="h-4 w-4" />}
          />
          <div className="mt-3">{body}</div>
        </AppCard>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Job progress</h3>
          <p className="mt-1 text-xs text-gray-500">
            Add phases manually or stack templates — not system Tasks.
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
          setReplaceOnApply(false);
        }}
        title="Add from template"
        description={
          phases.length
            ? 'Template phases are appended to the current list. You can apply Pre-production, then Production, etc.'
            : 'Templates quickly seed the checklist. You can still add or remove phases afterward.'
        }
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
                setReplaceOnApply(false);
              }}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={applyMut.isPending}
              disabled={!templateId}
              onClick={() => applyMut.mutate({ tid: templateId, replace: replaceOnApply })}
            >
              {replaceOnApply ? 'Replace all' : 'Add phases'}
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
              <ul className="space-y-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {(templates.find((t) => t.id === templateId)?.phases || []).map((p) => (
                  <li key={p.key}>• {p.label}</li>
                ))}
              </ul>
            ) : null}
            {phases.length > 0 ? (
              <AppCheckbox
                label="Replace existing phases instead of appending"
                checked={replaceOnApply}
                onChange={setReplaceOnApply}
              />
            ) : null}
          </div>
        )}
      </AppFormModal>
    </>
  );
}
