import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useMemo, useState, useEffect } from 'react';
import { INSPECTION_RESULT_LABELS, INSPECTION_RESULT_COLORS } from '@/lib/fleetBadges';
import FleetDetailHeader from '@/components/FleetDetailHeader';

type Inspection = {
  id: string;
  fleet_asset_id: string;
  fleet_asset_name?: string;
  inspection_schedule_id?: string;
  inspection_date: string;
  inspection_type?: string; // 'body' | 'mechanical'
  inspector_user_id?: string;
  checklist_results?: {
    _metadata?: Record<string, string>;
    areas?: Array<{ key: string; issues?: string; condition?: string; photo_ids?: string[] }>;
    quote_amount?: number;
    quote_file_ids?: string[];
    [key: string]: any;
  } | Record<string, any>;
  photos?: string[];
  result: string;
  notes?: string;
  odometer_reading?: number;
  hours_reading?: number;
  auto_generated_work_order_id?: string;
  created_at: string;
};

type ChecklistTemplate = {
  type?: string;
  sections?: Array<{
    id: string;
    title: string;
    items: Array<{ key: string; label: string; category: string }>;
  }>;
  status_options?: Array<{ value: string; label: string }>;
  areas?: Array<{ key: string; label: string; description?: string }>;
  metadata_fields?: Array<{ key: string; label: string; type: string }>;
  quote_fields?: boolean;
};

const BODY_CONDITION_OPTIONS = [
  { value: 'ok', label: 'OK', icon: '✓', title: 'OK', className: 'bg-green-100 text-green-800 border-green-400 hover:bg-green-200' },
  { value: 'damage', label: 'Damage', icon: '✗', title: 'Damage', className: 'bg-red-100 text-red-800 border-red-400 hover:bg-red-200' },
  { value: 'conditional', label: 'Conditional', icon: '⚠', title: 'Conditional', className: 'bg-amber-100 text-amber-800 border-amber-400 hover:bg-amber-200' },
];

function computeResultFromConditions(conditions: Array<{ condition: string }>): string {
  if (conditions.some((a) => a.condition === 'damage')) return 'fail';
  if (conditions.some((a) => a.condition === 'conditional')) return 'conditional';
  return 'pass';
}

type BodyFormState = {
  _metadata: Record<string, string>;
  areas: Array<{ key: string; condition: string }>;
  notes: string;
};

function buildBodyFormFromInspection(
  inspection: Inspection,
  templateAreas: Array<{ key: string; label: string; description?: string }>,
  asset?: { unit_number?: string | null; name?: string | null; odometer_current?: number | null }
): BodyFormState {
  const cr = inspection.checklist_results as any;
  const metadata = cr?._metadata && typeof cr._metadata === 'object' ? { ...cr._metadata } : {};
  if (asset) {
    const hasUnit = metadata.unit_number != null && String(metadata.unit_number).trim() !== '';
    if (!hasUnit && asset.unit_number != null && String(asset.unit_number).trim() !== '') metadata.unit_number = asset.unit_number;
    if (!hasUnit && asset.name != null && String(asset.name).trim() !== '') metadata.unit_number = (metadata.unit_number as string) || asset.name;
    if ((metadata.km == null || String(metadata.km).trim() === '') && asset.odometer_current != null) metadata.km = String(asset.odometer_current);
  }
  if (!metadata.date || String(metadata.date).trim() === '') metadata.date = new Date().toISOString().slice(0, 10);
  const areas = (templateAreas || []).map((area) => {
    const existing = cr?.areas?.find((a: any) => a.key === area.key);
    return {
      key: area.key,
      condition: existing?.condition ?? '',
    };
  });
  return {
    _metadata: metadata,
    areas,
    notes: inspection.notes ?? '',
  };
}

type MechanicalFormState = {
  _metadata: Record<string, string>;
  items: Array<{ key: string; condition: string }>;
  notes: string;
};

function buildMechanicalFormFromInspection(
  inspection: Inspection,
  templateSections: Array<{ id: string; title: string; items: Array<{ key: string; label: string; category: string }> }>,
  asset?: { unit_number?: string | null; name?: string | null; odometer_current?: number | null }
): MechanicalFormState {
  const cr = inspection.checklist_results as any;
  const metadata = cr?._metadata && typeof cr._metadata === 'object' ? { ...cr._metadata } : {};
  if (asset) {
    const hasUnit = metadata.unit_number != null && String(metadata.unit_number).trim() !== '';
    if (!hasUnit && asset.unit_number != null && String(asset.unit_number).trim() !== '') metadata.unit_number = asset.unit_number;
    if (!hasUnit && asset.name != null && String(asset.name).trim() !== '') metadata.unit_number = (metadata.unit_number as string) || asset.name;
    if ((metadata.km == null || String(metadata.km).trim() === '') && asset.odometer_current != null) metadata.km = String(asset.odometer_current);
  }
  if (!metadata.date || String(metadata.date).trim() === '') metadata.date = new Date().toISOString().slice(0, 10);
  const items: Array<{ key: string; condition: string }> = [];
  (templateSections || []).forEach((section) => {
    section.items.forEach((item) => {
      const val = cr?.[item.key];
      const condition = typeof val === 'object' ? (val?.status || val?.condition || '') : (val || '');
      const norm = condition === 'ok' || condition === 'damage' || condition === 'conditional' ? condition : '';
      items.push({ key: item.key, condition: norm });
    });
  });
  return {
    _metadata: metadata,
    items,
    notes: inspection.notes ?? '',
  };
}

export default function InspectionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const queryClient = useQueryClient();

  const isValidId = id && id !== 'new';

  const { data: inspection, isLoading } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => api<Inspection>('GET', `/fleet/inspections/${id}`),
    enabled: isValidId,
  });

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');

  const inspectionType = inspection?.inspection_type || 'mechanical';
  const { data: checklistTemplate } = useQuery<ChecklistTemplate>({
    queryKey: ['inspectionChecklistTemplate', inspectionType],
    queryFn: () => api<ChecklistTemplate>('GET', `/fleet/inspections/checklist-template?type=${inspectionType}`),
    enabled: !!inspection,
  });

  const isBody = inspection?.inspection_type === 'body';
  const isMechanical = inspection?.inspection_type === 'mechanical';
  const hasWorkOrder = !!(inspection as Inspection)?.auto_generated_work_order_id;
  const canEditBody = isBody && !hasWorkOrder;
  const canEditMechanical = isMechanical && !hasWorkOrder;
  const [bodyEditMode, setBodyEditMode] = useState(true);
  const [bodyForm, setBodyForm] = useState<BodyFormState | null>(null);
  const [mechanicalEditMode, setMechanicalEditMode] = useState(true);
  const [mechanicalForm, setMechanicalForm] = useState<MechanicalFormState | null>(null);

  useEffect(() => {
    if (isBody && hasWorkOrder) setBodyEditMode(false);
  }, [isBody, hasWorkOrder]);
  useEffect(() => {
    if (isMechanical && hasWorkOrder) setMechanicalEditMode(false);
  }, [isMechanical, hasWorkOrder]);

  const { data: fleetAsset } = useQuery({
    queryKey: ['fleetAsset', inspection?.fleet_asset_id],
    queryFn: () =>
      api<{ unit_number?: string; name?: string; odometer_current?: number; hours_current?: number }>(
        'GET',
        `/fleet/assets/${inspection?.fleet_asset_id}`
      ),
    enabled: (isBody || isMechanical) && !!inspection?.fleet_asset_id,
  });

  useEffect(() => {
    if (isBody && inspection && checklistTemplate?.areas) {
      setBodyForm(buildBodyFormFromInspection(inspection, checklistTemplate.areas, fleetAsset));
    } else if (!isBody) {
      setBodyForm(null);
    }
  }, [isBody, inspection?.id, inspection?.checklist_results, inspection?.notes, checklistTemplate?.areas, fleetAsset?.unit_number, fleetAsset?.name, fleetAsset?.odometer_current]);

  useEffect(() => {
    if (isMechanical && inspection && checklistTemplate?.sections) {
      setMechanicalForm(buildMechanicalFormFromInspection(inspection, checklistTemplate.sections, fleetAsset));
    } else if (!isMechanical) {
      setMechanicalForm(null);
    }
  }, [isMechanical, inspection?.id, inspection?.checklist_results, inspection?.notes, checklistTemplate?.sections, fleetAsset?.unit_number, fleetAsset?.name, fleetAsset?.odometer_current]);

  const setBodyArea = (index: number, field: 'condition', value: string) => {
    setBodyForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, areas: [...prev.areas] };
      next.areas[index] = { ...next.areas[index], [field]: value };
      return next;
    });
  };

  const setMechanicalItem = (itemIndex: number, value: string) => {
    setMechanicalForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, items: [...prev.items] };
      next.items[itemIndex] = { ...next.items[itemIndex], condition: value };
      return next;
    });
  };

  const [bodyPhotoIds, setBodyPhotoIds] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  useEffect(() => {
    if ((isBody || isMechanical) && inspection?.id != null) {
      setBodyPhotoIds(inspection.photos && Array.isArray(inspection.photos) ? inspection.photos : []);
    }
  }, [isBody, isMechanical, inspection?.id]);

  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    setPhotoUploading(true);
    try {
      const up: any = await api('POST', '/files/upload', {
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
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type,
      });
      setBodyPhotoIds((prev) => [...prev, conf.id]);
      toast.success('Photo added');
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  const removeBodyPhoto = (photoId: string) => {
    setBodyPhotoIds((prev) => prev.filter((p) => p !== photoId));
  };

  const updateInspectionMutation = useMutation({
    mutationFn: (payload: { checklist_results?: Record<string, any>; result?: string; notes?: string; photos?: string[] }) =>
      api<Inspection>('PUT', `/fleet/inspections/${id}`, payload),
    onSuccess: (updated) => {
      toast.success('Inspection saved');
      queryClient.invalidateQueries({ queryKey: ['inspection', id] });
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
      if (updated?.result === 'fail' && (updated as any).auto_generated_work_order_id) {
        toast.success('Work order was created automatically for this failed inspection.');
      }
      setBodyEditMode(false);
      setMechanicalEditMode(false);
    },
    onError: () => {
      toast.error('Failed to save inspection');
    },
  });

  const handleSaveBody = () => {
    if (!bodyForm || !id) return;
    const result = computeResultFromConditions(bodyForm.areas);
    const _metadata: Record<string, string> = {};
    if (fleetAsset) {
      if (fleetAsset.unit_number || fleetAsset.name) _metadata.unit_number = fleetAsset.unit_number || fleetAsset.name || '';
      if (fleetAsset.odometer_current != null) _metadata.km = String(fleetAsset.odometer_current);
      _metadata.date = new Date().toISOString().slice(0, 10);
    }
    const checklist_results: Record<string, any> = {
      _metadata: Object.keys(_metadata).length ? _metadata : undefined,
      areas: bodyForm.areas.map((a) => ({
        key: a.key,
        ...(a.condition ? { condition: a.condition } : {}),
      })),
    };
    updateInspectionMutation.mutate({
      checklist_results,
      result,
      notes: bodyForm.notes.trim() || undefined,
      photos: bodyPhotoIds.length ? bodyPhotoIds : undefined,
    });
  };

  const computedResult = bodyForm ? computeResultFromConditions(bodyForm.areas) : inspection?.result;
  const computedMechanicalResult = mechanicalForm ? computeResultFromConditions(mechanicalForm.items) : inspection?.result;

  const handleSaveMechanical = () => {
    if (!mechanicalForm || !id) return;
    const result = computeResultFromConditions(mechanicalForm.items);
    const _metadata: Record<string, string> = {};
    if (fleetAsset) {
      if (fleetAsset.unit_number || fleetAsset.name) _metadata.unit_number = fleetAsset.unit_number || fleetAsset.name || '';
      if (fleetAsset.odometer_current != null) _metadata.km = String(fleetAsset.odometer_current);
      if (fleetAsset.hours_current != null) _metadata.hours = String(fleetAsset.hours_current);
      _metadata.date = new Date().toISOString().slice(0, 10);
    }
    const checklist_results: Record<string, any> = {
      _metadata: Object.keys(_metadata).length ? _metadata : undefined,
      ...Object.fromEntries(mechanicalForm.items.filter((i) => i.condition).map((i) => [i.key, i.condition])),
    };
    updateInspectionMutation.mutate({
      checklist_results,
      result,
      notes: mechanicalForm.notes.trim() || undefined,
      photos: bodyPhotoIds.length ? bodyPhotoIds : undefined,
    });
  };

  const generateWOMutation = useMutation({
    mutationFn: () => {
      if (!isValidId) throw new Error('Invalid inspection ID');
      return api('POST', `/fleet/inspections/${id}/generate-work-order`);
    },
    onSuccess: () => {
      toast.success('Work order generated');
      queryClient.invalidateQueries({ queryKey: ['inspection', id] });
    },
    onError: () => {
      toast.error('Failed to generate work order');
    },
  });

  const deleteInspectionMutation = useMutation({
    mutationFn: () => {
      if (!isValidId) throw new Error('Invalid inspection ID');
      return api('DELETE', `/fleet/inspections/${id}`);
    },
    onSuccess: () => {
      toast.success('Inspection deleted');
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
      nav('/fleet/inspections');
    },
    onError: () => toast.error('Failed to delete inspection'),
  });

  const resultColors = INSPECTION_RESULT_COLORS;
  const resultLabels = INSPECTION_RESULT_LABELS;

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  if (!isValidId) {
    return <div className="p-4">Invalid inspection ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!inspection) {
    return <div className="p-4">Inspection not found</div>;
  }

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <FleetDetailHeader
        onBack={() => nav('/fleet/inspections')}
        title={
          <>
            <span className="text-sm font-semibold text-gray-900">
              {inspection.inspection_type === 'body' ? 'Body / Exterior inspection' : inspection.inspection_type === 'mechanical' ? 'Mechanical inspection' : 'Inspection'}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${inspection.inspection_type === 'body' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
              {inspection.inspection_type === 'body' ? 'Body' : 'Mechanical'}
            </span>
          </>
        }
        subtitle={
          <>
            {inspection.fleet_asset_name && <span className="text-gray-700">{inspection.fleet_asset_name} · </span>}
            {new Date(inspection.inspection_date).toLocaleDateString()}
            {inspection.inspection_schedule_id && (
              <div className="mt-2">
                <a
                  href="/fleet/calendar?view=list"
                  onClick={(e) => { e.preventDefault(); nav('/fleet/calendar?view=list'); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  Part of schedule
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                </a>
              </div>
            )}
          </>
        }
        actions={isAdmin ? (
          <button
            type="button"
            onClick={() => window.confirm('Delete this inspection permanently?') && deleteInspectionMutation.mutate()}
            disabled={deleteInspectionMutation.isPending}
            className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
          >
            {deleteInspectionMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : undefined}
        right={
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-6 min-w-0 overflow-hidden">
        {!(isBody && bodyEditMode && bodyForm && canEditBody) && !(isMechanical && mechanicalEditMode && mechanicalForm && canEditMechanical) && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600">Result</label>
              <div className="mt-1">
                <span className={`px-2 py-1 rounded text-xs font-medium ${resultColors[inspection.result] || 'bg-gray-100 text-gray-800'}`}>
                  {resultLabels[inspection.result] ?? inspection.result}
                </span>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-600">Inspection Date</label>
              <div className="font-medium mt-1">
                {new Date(inspection.inspection_date).toLocaleDateString()}
              </div>
            </div>
          </div>
        )}

        {/* Body inspection: editable form or read-only view */}
        {inspection.inspection_type === 'body' && (
          <>
            {bodyEditMode && bodyForm && checklistTemplate?.areas && canEditBody ? (
              <div className="space-y-6">
                {/* Vehicle info (read-only) */}
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
                        <span className="text-gray-900">{inspection.inspection_date ? new Date(inspection.inspection_date).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Areas: condition + observations */}
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <h3 className="text-sm font-semibold text-gray-800 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                    Body / Exterior areas
                  </h3>
                  <div className="divide-y divide-gray-100">
                    {checklistTemplate.areas.map((area, index) => (
                      <div
                        key={area.key}
                        className={`p-4 transition-colors ${index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                      >
                        {/* Row: Bloco A (title + description) | Bloco B (buttons) */}
                        <div className="flex flex-wrap items-center gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">{area.label}</div>
                            {area.description && (
                              <div className="text-xs text-gray-500 mt-0.5">{area.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {BODY_CONDITION_OPTIONS.map((opt) => (
                              <button
                                key={opt.value || 'empty'}
                                type="button"
                                title={opt.title}
                                onClick={() => setBodyArea(index, 'condition', opt.value)}
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

                {/* Observations (where Quote was) */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Observations</label>
                  <textarea
                    value={bodyForm.notes}
                    onChange={(e) => setBodyForm((p) => (p ? { ...p, notes: e.target.value } : p))}
                    placeholder="Notes, damage description, or other observations..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                </div>

                {/* Photos */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
                  <div className="flex flex-wrap gap-3 items-start">
                    {bodyPhotoIds.map((photoId) => (
                      <div key={photoId} className="relative group">
                        <img
                          src={`/files/${photoId}/thumbnail?w=200`}
                          alt="Inspection"
                          className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeBodyPhoto(photoId)}
                          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <label className="w-24 h-24 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAddPhoto}
                        disabled={photoUploading}
                      />
                      {photoUploading ? <span className="text-xs">...</span> : <span className="text-2xl">+</span>}
                    </label>
                  </div>
                </div>

                {/* Result - expressive summary */}
                <div
                  className={`rounded-xl border-2 p-5 flex items-center justify-between gap-4 ${
                    computedResult === 'fail'
                      ? 'bg-red-50 border-red-200'
                      : computedResult === 'conditional'
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-green-50 border-green-200'
                  }`}
                >
                  <span className="text-sm font-medium text-gray-700">Inspection result</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-3xl ${
                        computedResult === 'fail'
                          ? 'text-red-600'
                          : computedResult === 'conditional'
                            ? 'text-amber-600'
                            : 'text-green-600'
                      }`}
                    >
                      {computedResult === 'fail' ? '✗' : computedResult === 'conditional' ? '⚠' : '✓'}
                    </span>
                    <span
                      className={`text-xl font-bold uppercase tracking-wide ${
                        computedResult === 'fail'
                          ? 'text-red-800'
                          : computedResult === 'conditional'
                            ? 'text-amber-800'
                            : 'text-green-800'
                      }`}
                    >
                      {computedResult === 'fail' ? 'Fail' : computedResult === 'conditional' ? 'Conditional' : 'Pass'}
                    </span>
                  </div>
                </div>

                {/* Save */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveBody}
                      disabled={updateInspectionMutation.isPending}
                      className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updateInspectionMutation.isPending ? 'Saving...' : 'Save inspection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => nav('/fleet/calendar?view=list')}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Back to schedule
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">Body / Exterior inspection</h3>
                  {isBody && (
                    hasWorkOrder ? (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">View only (work order generated)</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBodyEditMode(true)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    )
                  )}
                </div>
                {fleetAsset && (
                  <div className="bg-gray-50 p-4 rounded-lg border mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Vehicle</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div><span className="text-gray-600 block text-xs font-medium">Unit #</span> {fleetAsset.unit_number || fleetAsset.name || '—'}</div>
                      <div><span className="text-gray-600 block text-xs font-medium">Name</span> {fleetAsset.name || '—'}</div>
                      <div><span className="text-gray-600 block text-xs font-medium">KM</span> {fleetAsset.odometer_current != null ? fleetAsset.odometer_current.toLocaleString() : '—'}</div>
                      <div><span className="text-gray-600 block text-xs font-medium">Date</span> {inspection.inspection_date ? new Date(inspection.inspection_date).toLocaleDateString() : '—'}</div>
                    </div>
                  </div>
                )}
                {checklistTemplate?.areas && (
                  <div>
                    <label className="text-sm text-gray-600 mb-3 block font-medium">Body / Exterior areas</label>
                    <div className="space-y-3 border rounded-lg p-4 bg-white">
                      {checklistTemplate.areas.map((area) => {
                        const result = (inspection.checklist_results as any)?.areas?.find((a: any) => a.key === area.key);
                        const issues = result?.issues ?? (inspection.checklist_results as any)?.[area.key];
                        const issueText = typeof issues === 'string' ? issues : (result?.issues ?? '-');
                        const cond = result?.condition;
                        return (
                          <div key={area.key} className="border-b border-gray-100 last:border-b-0 pb-3 last:pb-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-800">{area.label}</span>
                              {cond && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  cond === 'ok' ? 'bg-green-100 text-green-800' : cond === 'damage' ? 'bg-red-100 text-red-800' : cond === 'conditional' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {BODY_CONDITION_OPTIONS.find((o) => o.value === cond)?.label ?? (cond === 'na' ? 'N/A' : cond)}
                                </span>
                              )}
                            </div>
                            {area.description && <div className="text-xs text-gray-500 mt-0.5">{area.description}</div>}
                            <div className="mt-1 text-sm text-gray-600">{issueText || '—'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(inspection.checklist_results as any)?.quote_amount != null && (
                  <div>
                    <label className="text-sm text-gray-600">Quote amount</label>
                    <div className="font-medium mt-1">{(inspection.checklist_results as any).quote_amount}</div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Mechanical: editable form or read-only view */}
        {isMechanical && (
          <>
            {mechanicalEditMode && mechanicalForm && checklistTemplate?.sections && canEditMechanical ? (
              <div className="space-y-6">
                {/* Vehicle info (read-only) */}
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
                        <span className="text-gray-900">{inspection.inspection_date ? new Date(inspection.inspection_date).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sections with items: same design as body (label + 3 buttons), alternating rows */}
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <h3 className="text-sm font-semibold text-gray-800 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
                    Mechanical checklist
                  </h3>
                  <div className="divide-y divide-gray-100">
                    {checklistTemplate.sections.map((section) => (
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

                {/* Observations */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Observations</label>
                  <textarea
                    value={mechanicalForm.notes}
                    onChange={(e) => setMechanicalForm((p) => (p ? { ...p, notes: e.target.value } : p))}
                    placeholder="Notes, issues, or other observations..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                </div>

                {/* Photos */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
                  <div className="flex flex-wrap gap-3 items-start">
                    {bodyPhotoIds.map((photoId) => (
                      <div key={photoId} className="relative group">
                        <img
                          src={`/files/${photoId}/thumbnail?w=200`}
                          alt="Inspection"
                          className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeBodyPhoto(photoId)}
                          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity shadow"
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <label className="w-24 h-24 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAddPhoto}
                        disabled={photoUploading}
                      />
                      {photoUploading ? <span className="text-xs">...</span> : <span className="text-2xl">+</span>}
                    </label>
                  </div>
                </div>

                {/* Result */}
                <div
                  className={`rounded-xl border-2 p-5 flex items-center justify-between gap-4 ${
                    computedMechanicalResult === 'fail'
                      ? 'bg-red-50 border-red-200'
                      : computedMechanicalResult === 'conditional'
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-green-50 border-green-200'
                  }`}
                >
                  <span className="text-sm font-medium text-gray-700">Inspection result</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-3xl ${
                        computedMechanicalResult === 'fail'
                          ? 'text-red-600'
                          : computedMechanicalResult === 'conditional'
                            ? 'text-amber-600'
                            : 'text-green-600'
                      }`}
                    >
                      {computedMechanicalResult === 'fail' ? '✗' : computedMechanicalResult === 'conditional' ? '⚠' : '✓'}
                    </span>
                    <span
                      className={`text-xl font-bold uppercase tracking-wide ${
                        computedMechanicalResult === 'fail'
                          ? 'text-red-800'
                          : computedMechanicalResult === 'conditional'
                            ? 'text-amber-800'
                            : 'text-green-800'
                      }`}
                    >
                      {computedMechanicalResult === 'fail' ? 'Fail' : computedMechanicalResult === 'conditional' ? 'Conditional' : 'Pass'}
                    </span>
                  </div>
                </div>

                {/* Save */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveMechanical}
                      disabled={updateInspectionMutation.isPending}
                      className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updateInspectionMutation.isPending ? 'Saving...' : 'Save inspection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => nav('/fleet/calendar?view=list')}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Back to schedule
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">Mechanical inspection</h3>
                  {isMechanical && (
                    hasWorkOrder ? (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">View only (work order generated)</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMechanicalEditMode(true)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    )
                  )}
                </div>
                {fleetAsset && (
                  <div className="bg-gray-50 p-4 rounded-lg border mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Vehicle</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div><span className="text-gray-600 block text-xs font-medium">Unit #</span> {fleetAsset.unit_number || fleetAsset.name || '—'}</div>
                      <div><span className="text-gray-600 block text-xs font-medium">Name</span> {fleetAsset.name || '—'}</div>
                      <div><span className="text-gray-600 block text-xs font-medium">KM</span> {fleetAsset.odometer_current != null ? fleetAsset.odometer_current.toLocaleString() : '—'}</div>
                      <div><span className="text-gray-600 block text-xs font-medium">Hours</span> {fleetAsset.hours_current != null ? fleetAsset.hours_current.toLocaleString() : '—'}</div>
                      <div><span className="text-gray-600 block text-xs font-medium">Date</span> {inspection.inspection_date ? new Date(inspection.inspection_date).toLocaleDateString() : '—'}</div>
                    </div>
                  </div>
                )}
                {inspection.checklist_results && checklistTemplate?.sections && (
                  <div>
                    <label className="text-sm text-gray-600 mb-3 block font-medium">Checklist Results</label>
                    <div className="space-y-6 border rounded-lg p-4 bg-white">
                      {checklistTemplate.sections.map((section) => {
                        const checklistItems = inspection.checklist_results && typeof inspection.checklist_results === 'object'
                          ? Object.fromEntries(
                              Object.entries(inspection.checklist_results).filter(([key]) => key !== '_metadata')
                            )
                          : inspection.checklist_results;
                        return (
                          <div key={section.id} className="border-b pb-4 last:border-b-0 last:pb-0">
                            <h4 className="text-base font-semibold text-gray-800 mb-3">{section.id}. {section.title}</h4>
                            <div className="space-y-2">
                              {section.items.map((item) => {
                                const itemResult = checklistItems?.[item.key];
                                const cond = typeof itemResult === 'object' ? itemResult?.status ?? itemResult?.condition : itemResult;
                                return (
                                  <div key={item.key} className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-b-0">
                                    <div className="flex-1 text-sm text-gray-700">{item.key}. {item.label}</div>
                                    {cond && (
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        cond === 'ok' ? 'bg-green-100 text-green-800' : cond === 'damage' ? 'bg-red-100 text-red-800' : cond === 'conditional' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
                                      }`}>
                                        {BODY_CONDITION_OPTIONS.find((o) => o.value === cond)?.label ?? cond}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {inspection.notes && (
          <div>
            <label className="text-sm text-gray-600">Notes</label>
            <div className="mt-1 p-3 bg-gray-50 rounded">{inspection.notes}</div>
          </div>
        )}

        {inspection.photos && inspection.photos.length > 0 && (
          <div>
            <label className="text-sm text-gray-600 mb-2 block">Photos</label>
            <div className="grid grid-cols-4 gap-2">
              {inspection.photos.map((photoId, idx) => (
                <img
                  key={idx}
                  src={`/files/${photoId}/thumbnail?w=300`}
                  alt={`Photo ${idx + 1}`}
                  className="w-full h-24 object-cover rounded border"
                />
              ))}
            </div>
          </div>
        )}

        {inspection.result === 'fail' && !inspection.auto_generated_work_order_id && (
          <div className="border rounded-lg p-4 bg-yellow-50">
            <div className="font-medium mb-2">Failed Inspection</div>
            <div className="text-sm text-gray-600 mb-3">
              This inspection failed. Generate a work order to address the issues.
            </div>
            <button
              onClick={() => generateWOMutation.mutate()}
              disabled={generateWOMutation.isPending}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
            >
              {generateWOMutation.isPending ? 'Generating...' : 'Generate Work Order'}
            </button>
          </div>
        )}

        {inspection.auto_generated_work_order_id && (
          <div className="border rounded-lg p-4 bg-green-50">
            <div className="font-medium mb-2">Work Order Generated</div>
            <button
              onClick={() => nav(`/fleet/work-orders/${inspection.auto_generated_work_order_id}`)}
              className="text-sm text-brand-red hover:underline"
            >
              View Work Order
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => nav(`/fleet/assets/${inspection.fleet_asset_id}`)}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            View Asset
          </button>
        </div>
      </div>
    </div>
  );
}

