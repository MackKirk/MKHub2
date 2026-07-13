import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { editFieldBriefQuickInfo } from '@/lib/formModalQuickInfo';
import {
  type CrewMaterialItem,
} from '@/lib/estimateMaterialList';
import OverlayPortal from '@/components/OverlayPortal';
import {
  AppButton,
  AppCard,
  AppFormModal,
  AppHeroEditButton,
  AppInput,
  AppSectionHeader,
  AppTextarea,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiTypography,
} from '@/components/ui';

export type { CrewMaterialItem };

export type ProjectFieldBriefData = {
  scope_of_work?: string | null;
  job_completion_estimate?: string | null;
  crew_material_list?: CrewMaterialItem[] | null;
};

function normalizeMaterialRows(raw: CrewMaterialItem[] | null | undefined): CrewMaterialItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => ({
    id: item?.id ? String(item.id) : crypto.randomUUID(),
    name: String(item?.name ?? ''),
    quantity: item?.quantity != null ? String(item.quantity) : '',
    unit: item?.unit != null ? String(item.unit) : '',
    notes: item?.notes != null ? String(item.notes) : '',
    source: item?.source === 'estimate' ? 'estimate' : item?.source === 'manual' ? 'manual' : undefined,
    source_ref: item?.source_ref != null ? String(item.source_ref) : undefined,
  }));
}

export function projectHasFieldBriefContent(proj: ProjectFieldBriefData | null | undefined): boolean {
  if (!proj) return false;
  const scope = proj.scope_of_work?.trim();
  const job = proj.job_completion_estimate?.trim();
  const materials = normalizeMaterialRows(proj.crew_material_list).filter((m) => m.name.trim());
  return !!(scope || job || materials.length > 0);
}

type ProjectFieldBriefCardProps = {
  projectId: string;
  proj: ProjectFieldBriefData;
  hasEditPermission: boolean;
  designSystem?: boolean;
  onSaved: (updated: ProjectFieldBriefData) => void | Promise<void>;
};

export default function ProjectFieldBriefCard({
  projectId,
  proj,
  hasEditPermission,
  designSystem = false,
  onSaved,
}: ProjectFieldBriefCardProps) {
  const [editOpen, setEditOpen] = useState(false);

  const materials = useMemo(
    () => normalizeMaterialRows(proj.crew_material_list).filter((m) => m.name.trim()),
    [proj.crew_material_list],
  );

  const visible = projectHasFieldBriefContent(proj) || hasEditPermission;
  if (!visible) return null;

  const body = (
    <div className="mt-3 space-y-4">
      <div>
        <div className={uiCx(uiTypography.helper, 'mb-1 font-medium uppercase tracking-wide')}>
          Scope of Work
        </div>
        {proj.scope_of_work?.trim() ? (
          <p className={uiCx(uiTypography.body, 'whitespace-pre-wrap leading-snug')}>{proj.scope_of_work.trim()}</p>
        ) : (
          <p className={uiCx(uiTypography.helper, 'italic')}>No scope defined</p>
        )}
      </div>

      <div>
        <div className={uiCx(uiTypography.helper, 'mb-1 font-medium uppercase tracking-wide')}>
          Job Completion Estimate
        </div>
        {proj.job_completion_estimate?.trim() ? (
          <p className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{proj.job_completion_estimate.trim()}</p>
        ) : (
          <p className={uiCx(uiTypography.helper, 'italic')}>Not specified</p>
        )}
      </div>

      <div>
        <div className={uiCx(uiTypography.helper, 'mb-2 font-medium uppercase tracking-wide')}>Material List</div>
        <p className={uiCx(uiTypography.helper, 'mb-2')}>
          Product lines from the Costs tab. Edit materials in Costs to update this list.
        </p>
        {materials.length > 0 ? (
          designSystem ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {materials.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-medium text-gray-900">{item.name}</td>
                      <td className="px-3 py-2 text-gray-700">{item.quantity?.trim() || '—'}</td>
                      <td className="px-3 py-2 text-gray-700">{item.unit?.trim() || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{item.notes?.trim() || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="space-y-2 text-sm text-gray-700">
              {materials.map((item) => (
                <li key={item.id} className="rounded-lg border border-gray-200 px-3 py-2">
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-600">
                    {[item.quantity?.trim(), item.unit?.trim()].filter(Boolean).join(' ') || 'Qty not specified'}
                    {item.notes?.trim() ? ` · ${item.notes.trim()}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className={uiCx(uiTypography.helper, 'italic')}>No materials in Costs yet</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {designSystem ? (
        <AppCard className="flex h-full min-h-0 flex-col">
          <AppSectionHeader
            title="Field Brief"
            description="Scope, materials from Costs, and estimated job completion for the crew."
            {...appSectionPresetProps('description')}
            action={
              hasEditPermission ? (
                <AppHeroEditButton title="Edit Field Brief" onClick={() => setEditOpen(true)} />
              ) : null
            }
          />
          {body}
        </AppCard>
      ) : (
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Field Brief</div>
            {hasEditPermission ? (
              <AppHeroEditButton title="Edit Field Brief" onClick={() => setEditOpen(true)} />
            ) : null}
          </div>
          {body}
        </div>
      )}

      {editOpen ? (
        <EditFieldBriefModal
          projectId={projectId}
          initial={proj}
          designSystem={designSystem}
          onClose={() => setEditOpen(false)}
          onSave={onSaved}
        />
      ) : null}
    </>
  );
}

function EditFieldBriefModal({
  projectId,
  initial,
  designSystem,
  onClose,
  onSave,
}: {
  projectId: string;
  initial: ProjectFieldBriefData;
  designSystem?: boolean;
  onClose: () => void;
  onSave: (updated: ProjectFieldBriefData) => void | Promise<void>;
}) {
  const [scopeOfWork, setScopeOfWork] = useState(initial.scope_of_work ?? '');
  const [jobCompletionEstimate, setJobCompletionEstimate] = useState(initial.job_completion_estimate ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setScopeOfWork(initial.scope_of_work ?? '');
    setJobCompletionEstimate(initial.job_completion_estimate ?? '');
  }, [initial]);

  const handleSave = async () => {
    const payload = {
      scope_of_work: scopeOfWork.trim() || null,
      job_completion_estimate: jobCompletionEstimate.trim() || null,
    };

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, payload);
      onClose();
      toast.success('Field brief updated');
      void Promise.resolve(onSave(payload)).catch((err) => {
        console.error('Field brief saved but refresh failed:', err);
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to update field brief';
      toast.error(message || 'Failed to update field brief');
    } finally {
      setSaving(false);
    }
  };

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Field Brief"
        description="Share scope and job completion details with the crew. Material List is managed in Costs."
        formWidth="wide"
        quickInfo={editFieldBriefQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <AppTextarea
            label="Scope of Work"
            value={scopeOfWork}
            onChange={(e) => setScopeOfWork(e.target.value)}
            placeholder="Describe the work the crew should perform on site..."
            rows={6}
            autoFocus
            fieldHint="Scope of Work\n\nDescribe the work the crew should perform on site. Shown on the project overview for the whole team."
          />
          <AppInput
            label="Job Completion Estimate"
            value={jobCompletionEstimate}
            onChange={(e) => setJobCompletionEstimate(e.target.value)}
            placeholder="e.g. 2 crews, 1 day"
            fieldHint="Job Completion Estimate\n\nFree-text estimate for how long the job should take (e.g. 2 crews, 1 day)."
          />
          <p className={uiCx(uiTypography.helper)}>
            Material List is fed from product lines in the Costs tab and cannot be edited here.
          </p>
        </div>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div
          className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Edit Field Brief</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Share scope and job completion details. Material List is managed in Costs.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
                Scope of Work
              </label>
              <textarea
                value={scopeOfWork}
                onChange={(e) => setScopeOfWork(e.target.value)}
                className="min-h-[140px] w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder="Describe the work the crew should perform on site..."
                autoFocus
              />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-500">
                Job Completion Estimate
              </label>
              <input
                value={jobCompletionEstimate}
                onChange={(e) => setJobCompletionEstimate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-300 focus:outline-none focus:ring-1 focus:ring-gray-300"
                placeholder="e.g. 2 crews, 1 day"
              />
            </div>
            <p className="px-1 text-xs text-gray-500">
              Material List is fed from product lines in the Costs tab and cannot be edited here.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center justify-end gap-3 rounded-b-xl border-t border-gray-200 bg-white px-4 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-brand-red px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
