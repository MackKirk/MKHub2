import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { INSPECTION_RESULT_LABELS } from '@/lib/fleetBadges';
import { useConfirm } from '@/components/ConfirmProvider';
import { AppButton, AppCard, AppTextarea, uiCx } from '@/components/ui';
import {
  BODY_CONDITION_OPTIONS,
  buildBodyFormFromInspection,
  buildMechanicalFormFromInspection,
  computeResultFromConditions,
  isBodyChecklistComplete,
  isMechanicalChecklistComplete,
  isValidInspectionCondition,
  resolveBodyResultForSubmit,
  resolveMechanicalResultForSubmit,
  type BodyFormState,
  type FleetInspectionRecord,
  type FleetAssetFormContext,
  type MechanicalFormState,
} from '@/pages/fleetInspectionFormShared';

export type InlineInspectionRow = FleetInspectionRecord & {
  result: string;
  photos?: string[];
  inspection_date?: string;
  auto_generated_work_order_id?: string | null;
};

type ChecklistAreas = Array<{ key: string; label: string; description?: string }>;
type ChecklistSections = Array<{ id: string; title: string; items: Array<{ key: string; label: string; category: string }> }>;

/** Only changes when server-backed inspection data changes — avoids resetting the other editor when the parent re-renders after a sibling save. */
function inspectionServerSyncKey(inspection: InlineInspectionRow): string {
  return [
    inspection.id,
    inspection.result,
    JSON.stringify(inspection.checklist_results ?? null),
    inspection.notes ?? '',
    JSON.stringify(inspection.photos ?? []),
  ].join('\x1e');
}

function invalidateAfterInspectionSave(qc: ReturnType<typeof useQueryClient>, inspectionId: string, scheduleId: string | undefined) {
  qc.invalidateQueries({ queryKey: ['inspection', inspectionId] });
  if (scheduleId) {
    qc.invalidateQueries({ queryKey: ['inspection-schedule', scheduleId] });
    qc.invalidateQueries({ queryKey: ['fleet-inspection-route-schedule-resolve', scheduleId] });
    qc.invalidateQueries({ queryKey: ['fleet-inspection-route-inspection-resolve', scheduleId] });
  }
  qc.invalidateQueries({ queryKey: ['inspection-schedules'] });
  qc.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
}

function scrollToFirstIncompleteBodyArea(areas: Array<{ key: string; condition: string }>) {
  const gap = areas.find((a) => !isValidInspectionCondition(a.condition));
  if (!gap) return;
  document.getElementById(`fleet-inspection-body-area-${gap.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function scrollToFirstIncompleteMechItem(items: Array<{ key: string; condition: string }>) {
  const gap = items.find((i) => !isValidInspectionCondition(i.condition));
  if (!gap) return;
  document.getElementById(`fleet-inspection-mech-item-${gap.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

type InspectionPutResponse = InlineInspectionRow & { id: string };

type InspectionSaveMutationVars = {
  checklist_results?: Record<string, unknown>;
  result?: string;
  notes?: string;
  photos?: string[];
  finish: boolean;
};

export function ScheduleBodyInlineEditor({
  inspectionId,
  scheduleId,
  inspection,
  fleetAsset,
  templateAreas,
  onSaved,
  onCancel,
}: {
  inspectionId: string;
  scheduleId: string | undefined;
  inspection: InlineInspectionRow;
  fleetAsset: FleetAssetFormContext | undefined;
  templateAreas: ChecklistAreas;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [bodyForm, setBodyForm] = useState<BodyFormState | null>(null);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  const serverSyncKey = useMemo(() => inspectionServerSyncKey(inspection), [
    inspection.id,
    inspection.result,
    inspection.checklist_results,
    inspection.notes,
    inspection.photos,
  ]);

  useEffect(() => {
    setBodyForm(buildBodyFormFromInspection(inspection, templateAreas, fleetAsset));
    setPhotoIds(Array.isArray(inspection.photos) ? inspection.photos : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when serverSyncKey changes; `inspection` identity changes every parent render (asInlineRow).
  }, [serverSyncKey, templateAreas, fleetAsset]);

  const setBodyArea = (index: number, value: string) => {
    setBodyForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, areas: [...prev.areas] };
      next.areas[index] = { ...next.areas[index], condition: value };
      return next;
    });
  };

  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setPhotoUploading(true);
    try {
      const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
        original_name: file.name,
        content_type: file.type,
        client_id: null,
        project_id: null,
        employee_id: null,
        category_id: 'fleet-inspection',
      });
      const res = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' },
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');
      const conf: { id: string } = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type,
      });
      setPhotoIds((prev) => [...prev, conf.id]);
      toast.success('Photo added');
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = (pid: string) => setPhotoIds((prev) => prev.filter((p) => p !== pid));

  const saveMutation = useMutation({
    mutationFn: ({ checklist_results, result, notes, photos, finish }: InspectionSaveMutationVars) =>
      api<InspectionPutResponse>('PUT', `/fleet/inspections/${inspectionId}`, {
        checklist_results,
        result,
        notes,
        photos,
      }).then((data) => ({ data, finish })),
    onSuccess: ({ data: updated, finish }) => {
      toast.success(finish ? 'Inspection finished' : 'Progress saved');
      invalidateAfterInspectionSave(queryClient, inspectionId, scheduleId);
      if (updated?.result === 'fail' && (updated as InspectionPutResponse).auto_generated_work_order_id) {
        toast.success('Work order was created automatically for this failed inspection.');
      }
      onSaved();
    },
    onError: () => toast.error('Failed to save inspection'),
  });

  const bodyChecklistPayload = (form: BodyFormState) => {
    const _metadata: Record<string, string> = {};
    if (fleetAsset) {
      if (fleetAsset.unit_number || fleetAsset.name) _metadata.unit_number = fleetAsset.unit_number || fleetAsset.name || '';
      if (fleetAsset.odometer_current != null) _metadata.km = String(fleetAsset.odometer_current);
      _metadata.date = new Date().toISOString().slice(0, 10);
    }
    const checklist_results: Record<string, unknown> = {
      _metadata: Object.keys(_metadata).length ? _metadata : undefined,
      areas: form.areas.map((a) => ({
        key: a.key,
        ...(a.condition ? { condition: a.condition } : {}),
      })),
    };
    return checklist_results;
  };

  const handleSaveDraft = () => {
    if (!bodyForm) return;
    const resolved = resolveBodyResultForSubmit('draft', bodyForm.areas);
    if (!resolved.ok) return;
    saveMutation.mutate({
      checklist_results: bodyChecklistPayload(bodyForm),
      result: resolved.result,
      notes: bodyForm.notes.trim() || undefined,
      photos: photoIds.length ? photoIds : undefined,
      finish: false,
    });
  };

  const handleFinishInspection = async () => {
    if (!bodyForm) return;
    const resolved = resolveBodyResultForSubmit('finish', bodyForm.areas);
    if (!resolved.ok) {
      toast.error(resolved.message);
      scrollToFirstIncompleteBodyArea(bodyForm.areas);
      return;
    }
    const finalResult = resolved.result;
    const resultLabel =
      INSPECTION_RESULT_LABELS[finalResult as keyof typeof INSPECTION_RESULT_LABELS] ??
      finalResult.charAt(0).toUpperCase() + finalResult.slice(1);
    let message = `Finalize this Body / Exterior inspection with result: ${resultLabel}? This locks in the checklist and affects the inspection schedule.\n`;
    if (finalResult === 'fail') {
      message += 'A work order may be created automatically for a failed inspection.';
    }
    const dlg = await confirm({
      title: 'Finish inspection',
      message,
      confirmText: 'Finish',
      cancelText: 'Cancel',
    });
    if (dlg !== 'confirm') return;
    saveMutation.mutate({
      checklist_results: bodyChecklistPayload(bodyForm),
      result: finalResult,
      notes: bodyForm.notes.trim() || undefined,
      photos: photoIds.length ? photoIds : undefined,
      finish: true,
    });
  };

  const bodyComplete = bodyForm ? isBodyChecklistComplete(bodyForm.areas) : false;
  const computedFinalResult = bodyForm && bodyComplete ? computeResultFromConditions(bodyForm.areas) : null;

  if (!bodyForm) return <div className="text-sm text-gray-500 py-4">Loading form…</div>;

  return (
    <div className="space-y-6 min-w-0">
      {fleetAsset && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Vehicle</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block text-xs font-medium">Unit #</span>
              <span className="text-gray-900">{fleetAsset.unit_number || fleetAsset.name || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium">Name</span>
              <span className="text-gray-900">{fleetAsset.name || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium">KM</span>
              <span className="text-gray-900">{fleetAsset.odometer_current != null ? fleetAsset.odometer_current.toLocaleString() : '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium">Date</span>
              <span className="text-gray-900">
                {inspection.inspection_date ? new Date(inspection.inspection_date).toLocaleDateString() : new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <h3 className="text-sm font-semibold text-gray-800 px-4 py-3 border-b border-gray-100 bg-gray-50/80">Body / Exterior areas</h3>
        <div className="divide-y divide-gray-100">
          {templateAreas.map((area, index) => (
            <div
              key={area.key}
              id={`fleet-inspection-body-area-${area.key}`}
              className={`p-4 transition-colors ${index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}`}
            >
              <div className="flex flex-wrap items-center gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{area.label}</div>
                  {area.description && <div className="text-xs text-gray-500 mt-0.5">{area.description}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {BODY_CONDITION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value || 'empty'}
                      type="button"
                      title={opt.title}
                      onClick={() => setBodyArea(index, opt.value)}
                      className={`min-w-[3.25rem] min-h-[3.25rem] flex items-center justify-center rounded-xl text-2xl font-bold border-2 transition-all ${
                        (bodyForm.areas[index]?.condition ?? '') === opt.value
                          ? opt.className + ' scale-105 shadow-md'
                          : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400'
                      }`}
                    >
                      {opt.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AppCard bodyClassName="p-4">
        <AppTextarea
          label="Observations"
          value={bodyForm.notes}
          onChange={(e) => setBodyForm((p) => (p ? { ...p, notes: e.target.value } : p))}
          placeholder="Notes, damage description, or other observations..."
          rows={4}
        />
      </AppCard>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
        <div className="flex flex-wrap gap-3 items-start">
          {photoIds.map((photoId) => (
            <div key={photoId} className="relative group">
              <img
                src={withFileAccessToken(`/files/${photoId}/thumbnail?w=200`)}
                alt=""
                className="w-24 h-24 object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => removePhoto(photoId)}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <label className="w-24 h-24 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
            <input type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} disabled={photoUploading} />
            {photoUploading ? <span className="text-xs">...</span> : <span className="text-2xl">+</span>}
          </label>
        </div>
      </div>

      {!bodyComplete ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-gray-700">Inspection result</span>
          <div className="text-right">
            <span className="text-xl font-semibold text-gray-700">Draft</span>
            <p className="text-xs text-gray-500 mt-1 max-w-[16rem] sm:max-w-none">Answer every area, then Finish to submit Pass / Conditional / Fail.</p>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-xl border-2 p-5 flex items-center justify-between gap-4 ${
            computedFinalResult === 'fail'
              ? 'bg-red-50 border-red-200'
              : computedFinalResult === 'conditional'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-200'
          }`}
        >
          <span className="text-sm font-medium text-gray-700">Result if you finish now</span>
          <div className="flex items-center gap-2">
            <span className={`text-3xl ${computedFinalResult === 'fail' ? 'text-red-600' : computedFinalResult === 'conditional' ? 'text-amber-600' : 'text-green-600'}`}>
              {computedFinalResult === 'fail' ? '✗' : computedFinalResult === 'conditional' ? '⚠' : '✓'}
            </span>
            <span
              className={`text-xl font-bold uppercase tracking-wide ${
                computedFinalResult === 'fail' ? 'text-red-800' : computedFinalResult === 'conditional' ? 'text-amber-800' : 'text-green-800'
              }`}
            >
              {computedFinalResult === 'fail' ? 'Fail' : computedFinalResult === 'conditional' ? 'Conditional' : 'Pass'}
            </span>
          </div>
        </div>
      )}

      <AppCard bodyClassName={uiCx('flex flex-wrap gap-3 p-4')}>
        <AppButton
          type="button"
          onClick={handleFinishInspection}
          disabled={saveMutation.isPending || !bodyForm}
          loading={saveMutation.isPending}
          aria-label="Finish inspection"
        >
          Finish inspection
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          onClick={handleSaveDraft}
          disabled={saveMutation.isPending || !bodyForm}
          aria-label="Save draft"
        >
          Save draft
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </AppButton>
      </AppCard>
    </div>
  );
}

export function ScheduleMechanicalInlineEditor({
  inspectionId,
  scheduleId,
  inspection,
  fleetAsset,
  templateSections,
  onSaved,
  onCancel,
}: {
  inspectionId: string;
  scheduleId: string | undefined;
  inspection: InlineInspectionRow;
  fleetAsset: FleetAssetFormContext | undefined;
  templateSections: ChecklistSections;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [mechanicalForm, setMechanicalForm] = useState<MechanicalFormState | null>(null);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);

  const serverSyncKey = useMemo(() => inspectionServerSyncKey(inspection), [
    inspection.id,
    inspection.result,
    inspection.checklist_results,
    inspection.notes,
    inspection.photos,
  ]);

  useEffect(() => {
    setMechanicalForm(buildMechanicalFormFromInspection(inspection, templateSections, fleetAsset));
    setPhotoIds(Array.isArray(inspection.photos) ? inspection.photos : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when serverSyncKey changes; `inspection` identity changes every parent render (asInlineRow).
  }, [serverSyncKey, templateSections, fleetAsset]);

  const setMechanicalItem = (itemIndex: number, value: string) => {
    setMechanicalForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, items: [...prev.items] };
      next.items[itemIndex] = { ...next.items[itemIndex], condition: value };
      return next;
    });
  };

  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setPhotoUploading(true);
    try {
      const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
        original_name: file.name,
        content_type: file.type,
        client_id: null,
        project_id: null,
        employee_id: null,
        category_id: 'fleet-inspection',
      });
      const res = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' },
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');
      const conf: { id: string } = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type,
      });
      setPhotoIds((prev) => [...prev, conf.id]);
      toast.success('Photo added');
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = (pid: string) => setPhotoIds((prev) => prev.filter((p) => p !== pid));

  const saveMutation = useMutation({
    mutationFn: ({ checklist_results, result, notes, photos, finish }: InspectionSaveMutationVars) =>
      api<InspectionPutResponse>('PUT', `/fleet/inspections/${inspectionId}`, {
        checklist_results,
        result,
        notes,
        photos,
      }).then((data) => ({ data, finish })),
    onSuccess: ({ data: updated, finish }) => {
      toast.success(finish ? 'Inspection finished' : 'Progress saved');
      invalidateAfterInspectionSave(queryClient, inspectionId, scheduleId);
      if (updated?.result === 'fail' && (updated as InspectionPutResponse).auto_generated_work_order_id) {
        toast.success('Work order was created automatically for this failed inspection.');
      }
      onSaved();
    },
    onError: () => toast.error('Failed to save inspection'),
  });

  const mechanicalChecklistPayload = (form: MechanicalFormState) => {
    const _metadata: Record<string, string> = {};
    if (fleetAsset) {
      if (fleetAsset.unit_number || fleetAsset.name) _metadata.unit_number = fleetAsset.unit_number || fleetAsset.name || '';
      if (fleetAsset.odometer_current != null) _metadata.km = String(fleetAsset.odometer_current);
      if (fleetAsset.hours_current != null) _metadata.hours = String(fleetAsset.hours_current);
      _metadata.date = new Date().toISOString().slice(0, 10);
    }
    return {
      _metadata: Object.keys(_metadata).length ? _metadata : undefined,
      ...Object.fromEntries(form.items.filter((i) => i.condition).map((i) => [i.key, i.condition])),
    } as Record<string, unknown>;
  };

  const handleSaveDraftMech = () => {
    if (!mechanicalForm) return;
    const resolved = resolveMechanicalResultForSubmit('draft', mechanicalForm.items);
    if (!resolved.ok) return;
    saveMutation.mutate({
      checklist_results: mechanicalChecklistPayload(mechanicalForm),
      result: resolved.result,
      notes: mechanicalForm.notes.trim() || undefined,
      photos: photoIds.length ? photoIds : undefined,
      finish: false,
    });
  };

  const handleFinishInspectionMech = async () => {
    if (!mechanicalForm) return;
    const resolved = resolveMechanicalResultForSubmit('finish', mechanicalForm.items);
    if (!resolved.ok) {
      toast.error(resolved.message);
      scrollToFirstIncompleteMechItem(mechanicalForm.items);
      return;
    }
    const finalResult = resolved.result;
    const resultLabel =
      INSPECTION_RESULT_LABELS[finalResult as keyof typeof INSPECTION_RESULT_LABELS] ??
      finalResult.charAt(0).toUpperCase() + finalResult.slice(1);
    let message = `Finalize this Mechanical inspection with result: ${resultLabel}? This locks in the checklist and affects the inspection schedule.\n`;
    if (finalResult === 'fail') {
      message += 'A work order may be created automatically for a failed inspection.';
    }
    const dlg = await confirm({
      title: 'Finish inspection',
      message,
      confirmText: 'Finish',
      cancelText: 'Cancel',
    });
    if (dlg !== 'confirm') return;
    saveMutation.mutate({
      checklist_results: mechanicalChecklistPayload(mechanicalForm),
      result: finalResult,
      notes: mechanicalForm.notes.trim() || undefined,
      photos: photoIds.length ? photoIds : undefined,
      finish: true,
    });
  };

  const mechComplete = mechanicalForm ? isMechanicalChecklistComplete(mechanicalForm.items) : false;
  const computedMechFinalResult = mechanicalForm && mechComplete ? computeResultFromConditions(mechanicalForm.items) : null;

  if (!mechanicalForm) return <div className="text-sm text-gray-500 py-4">Loading form…</div>;

  return (
    <div className="space-y-6 min-w-0">
      {fleetAsset && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Vehicle</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block text-xs font-medium">Unit #</span>
              <span className="text-gray-900">{fleetAsset.unit_number || fleetAsset.name || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium">Name</span>
              <span className="text-gray-900">{fleetAsset.name || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium">KM</span>
              <span className="text-gray-900">{fleetAsset.odometer_current != null ? fleetAsset.odometer_current.toLocaleString() : '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium">Hours</span>
              <span className="text-gray-900">{fleetAsset.hours_current != null ? fleetAsset.hours_current.toLocaleString() : '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs font-medium">Date</span>
              <span className="text-gray-900">
                {inspection.inspection_date ? new Date(inspection.inspection_date).toLocaleDateString() : new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <h3 className="text-sm font-semibold text-gray-800 px-4 py-3 border-b border-gray-100 bg-gray-50/80">Mechanical checklist</h3>
        <div className="divide-y divide-gray-100">
          {templateSections.map((section) => (
            <div key={section.id}>
              <h4 className="px-4 py-2 text-sm font-semibold text-gray-800 bg-gray-50/50 border-b border-gray-100">
                {section.id}. {section.title}
              </h4>
              {section.items.map((item, idxInSection) => {
                const itemIndex = mechanicalForm.items.findIndex((i) => i.key === item.key);
                if (itemIndex < 0) return null;
                return (
                  <div
                    key={item.key}
                    id={`fleet-inspection-mech-item-${item.key}`}
                    className={`p-4 transition-colors ${idxInSection % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">
                          {item.key}. {item.label}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {BODY_CONDITION_OPTIONS.map((opt) => (
                          <button
                            key={opt.value || 'empty'}
                            type="button"
                            title={opt.title}
                            onClick={() => setMechanicalItem(itemIndex, opt.value)}
                            className={`min-w-[3.25rem] min-h-[3.25rem] flex items-center justify-center rounded-xl text-2xl font-bold border-2 transition-all ${
                              (mechanicalForm.items[itemIndex]?.condition ?? '') === opt.value
                                ? opt.className + ' scale-105 shadow-md'
                                : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400'
                            }`}
                          >
                            {opt.icon}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <AppCard bodyClassName="p-4">
        <AppTextarea
          label="Observations"
          value={mechanicalForm.notes}
          onChange={(e) => setMechanicalForm((p) => (p ? { ...p, notes: e.target.value } : p))}
          placeholder="Notes, issues, or other observations..."
          rows={4}
        />
      </AppCard>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
        <div className="flex flex-wrap gap-3 items-start">
          {photoIds.map((photoId) => (
            <div key={photoId} className="relative group">
              <img
                src={withFileAccessToken(`/files/${photoId}/thumbnail?w=200`)}
                alt=""
                className="w-24 h-24 object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => removePhoto(photoId)}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <label className="w-24 h-24 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
            <input type="file" accept="image/*" className="hidden" onChange={handleAddPhoto} disabled={photoUploading} />
            {photoUploading ? <span className="text-xs">...</span> : <span className="text-2xl">+</span>}
          </label>
        </div>
      </div>

      {!mechComplete ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-gray-700">Inspection result</span>
          <div className="text-right">
            <span className="text-xl font-semibold text-gray-700">Draft</span>
            <p className="text-xs text-gray-500 mt-1 max-w-[16rem] sm:max-w-none">Answer every checklist item, then Finish to submit Pass / Conditional / Fail.</p>
          </div>
        </div>
      ) : (
        <div
          className={`rounded-xl border-2 p-5 flex items-center justify-between gap-4 ${
            computedMechFinalResult === 'fail'
              ? 'bg-red-50 border-red-200'
              : computedMechFinalResult === 'conditional'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-200'
          }`}
        >
          <span className="text-sm font-medium text-gray-700">Result if you finish now</span>
          <div className="flex items-center gap-2">
            <span
              className={`text-3xl ${
                computedMechFinalResult === 'fail' ? 'text-red-600' : computedMechFinalResult === 'conditional' ? 'text-amber-600' : 'text-green-600'
              }`}
            >
              {computedMechFinalResult === 'fail' ? '✗' : computedMechFinalResult === 'conditional' ? '⚠' : '✓'}
            </span>
            <span
              className={`text-xl font-bold uppercase tracking-wide ${
                computedMechFinalResult === 'fail' ? 'text-red-800' : computedMechFinalResult === 'conditional' ? 'text-amber-800' : 'text-green-800'
              }`}
            >
              {computedMechFinalResult === 'fail' ? 'Fail' : computedMechFinalResult === 'conditional' ? 'Conditional' : 'Pass'}
            </span>
          </div>
        </div>
      )}

      <AppCard bodyClassName={uiCx('flex flex-wrap gap-3 p-4')}>
        <AppButton
          type="button"
          onClick={handleFinishInspectionMech}
          disabled={saveMutation.isPending || !mechanicalForm}
          loading={saveMutation.isPending}
          aria-label="Finish inspection"
        >
          Finish inspection
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          onClick={handleSaveDraftMech}
          disabled={saveMutation.isPending || !mechanicalForm}
          aria-label="Save draft"
        >
          Save draft
        </AppButton>
        <AppButton type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </AppButton>
      </AppCard>
    </div>
  );
}
