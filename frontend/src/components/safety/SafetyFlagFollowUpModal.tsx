import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Building2, Calendar, ChevronDown, ChevronUp, MapPin, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { AppButton, AppDatePicker, AppInput, AppUserSelect, uiCx, uiLayout } from '@/components/ui';
import OverlayPortal from '@/components/OverlayPortal';
import {
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SafetyFormModalLayout,
  SafetyModalOverlayBackdrop,
} from '@/components/safety/SafetyModalChrome';
import DynamicSafetyForm from '@/components/DynamicSafetyForm';
import CustomSafetySignatureSlots from '@/components/safety/CustomSafetySignatureSlots';
import SafetyFormSignaturesGallery from '@/components/safety/SafetyFormSignaturesGallery';
import { appendCustomSignatureSlot, hasIncompleteCustomSignature } from '@/lib/customSafetySignatures';
import {
  normalizeDefinition,
  validateDynamicFormMissing,
  type SafetyFormDefinition,
} from '@/types/safetyFormTemplate';

type FollowUpTemplate = {
  id: string;
  name: string;
  version_label?: string;
  definition?: SafetyFormDefinition;
};

export type FollowUpRow = {
  id: string;
  source_field_key: string;
  source_field_label_snapshot?: string | null;
  source_value_snapshot?: {
    value?: unknown;
    display?: string;
    required?: boolean;
    field_type?: string | null;
  } | null;
  source_inspection_date?: string | null;
  source_template_name?: string | null;
  form_template_id?: string | null;
  template_name?: string | null;
  form_definition_snapshot?: SafetyFormDefinition | null;
  form_payload?: Record<string, unknown>;
  label?: string | null;
  assigned_user_id?: string | null;
  worker_name?: string | null;
  due_date?: string | null;
  status: string;
  created_at?: string | null;
  project_name?: string;
  project_code?: string;
  project_address?: string;
  project_address_city?: string;
  project_address_province?: string;
};

export type FollowUpProjectInfo = {
  name?: string;
  address?: string;
  address_city?: string;
  address_province?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  inspectionId: string;
  fieldKey: string;
  fieldLabel?: string;
  fieldRequired?: boolean;
  existingFollowUps: FollowUpRow[];
  canWrite: boolean;
  projectInfo?: FollowUpProjectInfo;
  sourceInspectionDate?: string | null;
  sourceTemplateName?: string | null;
  initialFollowUpId?: string | null;
  onOpenSourceInspection?: () => void;
};

type Step = 'pick' | 'compose' | 'view';

function formatInfoWhen(iso?: string | null): string {
  if (!iso) return new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function projectLocation(info?: FollowUpProjectInfo, row?: FollowUpRow | null): string {
  const parts = [
    info?.address || row?.project_address,
    info?.address_city || row?.project_address_city,
    info?.address_province || row?.project_address_province,
  ].filter((x) => (x || '').trim());
  return parts.join(', ') || '—';
}

function withRequiredWorkerSignature(def: SafetyFormDefinition): SafetyFormDefinition {
  const worker = def.signature_policy?.worker;
  return {
    ...def,
    signature_policy: {
      ...def.signature_policy,
      worker: {
        mode: worker?.mode || 'drawn',
        required: true,
      },
    },
  };
}

function FlaggedFormItemCard({
  fieldLabel,
  required,
  displayValue,
  sourceTemplateName,
  sourceInspectionDate,
  onViewOriginal,
}: {
  fieldLabel: string;
  required?: boolean;
  displayValue?: string;
  sourceTemplateName?: string | null;
  sourceInspectionDate?: string | null;
  onViewOriginal?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-sm font-semibold text-amber-950">Flagged Form Item</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-800 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-800 shrink-0" />
        )}
      </button>
      {expanded ? (
        <div className="px-3 pb-3 space-y-2 text-sm text-amber-950">
          <div>
            <div className="font-semibold">{fieldLabel}</div>
            {required ? <div className="text-xs italic text-amber-800/80 mt-0.5">*Required</div> : null}
            {displayValue ? <div className="mt-1 text-amber-900">{displayValue}</div> : null}
          </div>
          {(sourceTemplateName || sourceInspectionDate) && (
            <div className="text-xs text-amber-900/80 space-y-0.5">
              {sourceTemplateName ? <div>{sourceTemplateName}</div> : null}
              {sourceInspectionDate ? <div>{formatInfoWhen(sourceInspectionDate)}</div> : null}
            </div>
          )}
          {onViewOriginal ? (
            <button
              type="button"
              className="text-xs font-semibold text-brand-red hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onViewOriginal();
              }}
            >
              View original inspection
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function InformationCard({
  projectName,
  location,
  whenIso,
}: {
  projectName: string;
  location: string;
  whenIso?: string | null;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 space-y-2 text-sm text-gray-800">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Information</div>
      <div className="flex items-start gap-2">
        <Building2 className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
        <span className="font-medium">{projectName || '—'}</span>
      </div>
      <div className="flex items-start gap-2">
        <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
        <span>{location}</span>
      </div>
      <div className="flex items-start gap-2">
        <Calendar className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
        <span>{formatInfoWhen(whenIso)}</span>
      </div>
    </div>
  );
}

export default function SafetyFlagFollowUpModal({
  open,
  onClose,
  projectId,
  inspectionId,
  fieldKey,
  fieldLabel,
  fieldRequired,
  existingFollowUps,
  canWrite,
  projectInfo,
  sourceInspectionDate,
  sourceTemplateName,
  initialFollowUpId,
  onOpenSourceInspection,
}: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('pick');
  const [pickedTemplateId, setPickedTemplateId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [followUpLabel, setFollowUpLabel] = useState('');
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deepLinkConsumed, setDeepLinkConsumed] = useState(false);
  const [existingGateConsumed, setExistingGateConsumed] = useState(false);

  const fieldFollowUps = useMemo(
    () => existingFollowUps.filter((f) => f.source_field_key === fieldKey),
    [existingFollowUps, fieldKey]
  );

  useEffect(() => {
    if (!open) {
      setDeepLinkConsumed(false);
      setExistingGateConsumed(false);
      return;
    }
    if (deepLinkConsumed || !initialFollowUpId) return;
    const match = existingFollowUps.find((f) => f.id === initialFollowUpId);
    if (!match) return;
    setViewingId(match.id);
    setFollowUpLabel((match.label || '').trim());
    setStep('view');
    setDeepLinkConsumed(true);
    setExistingGateConsumed(true);
  }, [open, initialFollowUpId, existingFollowUps, deepLinkConsumed]);

  /** One follow-up per field: open existing in view (no second create). */
  useEffect(() => {
    if (!open || existingGateConsumed || deepLinkConsumed) return;
    if (fieldFollowUps.length === 0) return;
    const first = fieldFollowUps[0];
    setViewingId(first.id);
    setFollowUpLabel((first.label || '').trim());
    setStep('view');
    setExistingGateConsumed(true);
  }, [open, fieldFollowUps, existingGateConsumed, deepLinkConsumed]);

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['formTemplatesFollowUpSchedulable'],
    queryFn: () =>
      api<FollowUpTemplate[]>(
        'GET',
        '/form-templates?category=follow_up&schedulable=true&sort=name&sort_dir=asc'
      ),
    enabled: open && fieldFollowUps.length === 0,
  });

  const { data: pickedTemplate } = useQuery({
    queryKey: ['formTemplate', pickedTemplateId],
    queryFn: () =>
      api<FollowUpTemplate>('GET', `/form-templates/${encodeURIComponent(pickedTemplateId)}`),
    enabled: open && !!pickedTemplateId && step === 'compose',
  });

  const composeDefinition = useMemo(() => {
    if (!pickedTemplate?.definition) return null;
    return withRequiredWorkerSignature(normalizeDefinition(pickedTemplate.definition));
  }, [pickedTemplate?.definition]);

  const viewing = fieldFollowUps.find((f) => f.id === viewingId) || fieldFollowUps[0] || null;
  const viewDefinition = useMemo(() => {
    if (!viewing?.form_definition_snapshot) return null;
    return normalizeDefinition(viewing.form_definition_snapshot);
  }, [viewing?.form_definition_snapshot]);

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: ['projectSafetyFollowUps', projectId, inspectionId],
    });
    qc.invalidateQueries({ queryKey: ['safetyFollowUps'] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      api<FollowUpRow>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/safety-inspections/${encodeURIComponent(inspectionId)}/follow-ups`,
        {
          field_key: fieldKey,
          form_template_id: pickedTemplateId,
          assigned_user_id: assigneeId,
          due_date: dueDate || null,
          label: followUpLabel.trim() || null,
          form_payload: formPayload,
          status: 'completed',
        }
      ),
    onSuccess: () => {
      invalidate();
      toast.success('Follow-up completed');
      onClose();
    },
    onError: (err: unknown) => {
      const detail =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message || '')
          : '';
      toast.error(detail || 'Could not create follow-up');
    },
  });

  const submitCompose = () => {
    if (!assigneeId.trim()) {
      toast.error('Assign to worker is required');
      return;
    }
    if (!composeDefinition) {
      toast.error('Template still loading');
      return;
    }
    const missing = validateDynamicFormMissing(composeDefinition, formPayload);
    if (missing.length > 0) {
      toast.error(`Complete required fields: ${missing.map((m) => m.label).join(', ')}`);
      return;
    }
    if (hasIncompleteCustomSignature(formPayload)) {
      toast.error('Finish or remove incomplete custom signatures');
      return;
    }
    createMut.mutate();
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const title =
    step === 'view'
      ? viewing?.template_name || 'Follow-up'
      : step === 'compose'
        ? pickedTemplate?.name || 'Follow-up'
        : 'Flag & Follow-up';

  const resetCompose = () => {
    if (fieldFollowUps.length > 0) {
      onClose();
      return;
    }
    setStep('pick');
    setPickedTemplateId('');
    setAssigneeId('');
    setDueDate('');
    setFollowUpLabel('');
    setFormPayload({});
    setViewingId(null);
  };

  const infoName = projectInfo?.name || viewing?.project_name || '—';
  const infoLocation = projectLocation(projectInfo, viewing);
  const composeRequired =
    fieldRequired ??
    (typeof viewing?.source_value_snapshot?.required === 'boolean'
      ? viewing.source_value_snapshot.required
      : undefined);

  const headerBlocks = (opts: {
    whenIso?: string | null;
    flaggedLabel: string;
    flaggedRequired?: boolean;
    flaggedDisplay?: string;
    flaggedTemplate?: string | null;
    flaggedDate?: string | null;
    showLabel?: boolean;
    labelEditable: boolean;
  }) => (
    <div className="space-y-3">
      <InformationCard projectName={infoName} location={infoLocation} whenIso={opts.whenIso} />
      {opts.showLabel !== false ? (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Tag className="h-4 w-4 text-sky-600 shrink-0" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Label</span>
          </div>
          {opts.labelEditable ? (
            <AppInput
              placeholder="Type your Label"
              value={followUpLabel}
              onChange={(e) => setFollowUpLabel(e.target.value)}
              aria-label="Follow-up label"
            />
          ) : (
            <p className="text-sm text-gray-800">{followUpLabel.trim() || '—'}</p>
          )}
        </div>
      ) : null}
      <FlaggedFormItemCard
        fieldLabel={opts.flaggedLabel}
        required={opts.flaggedRequired}
        displayValue={opts.flaggedDisplay}
        sourceTemplateName={opts.flaggedTemplate}
        sourceInspectionDate={opts.flaggedDate}
        onViewOriginal={onOpenSourceInspection}
      />
    </div>
  );

  const hasExisting = fieldFollowUps.length > 0;

  return (
    <OverlayPortal>
      <SafetyModalOverlayBackdrop
        overlayClassName="z-[200]"
        overflowClassName="overflow-hidden"
        onBackdropClick={onClose}
      >
        <SafetyFormModalLayout
          widthClass="w-full max-w-[46rem]"
          titleId="safety-flag-follow-up-title"
          title={title}
          onClose={onClose}
          bodyClassName="overflow-y-auto overscroll-contain flex-1 p-4 min-h-0 scroll-pt-2"
          footer={
            <>
              {step === 'compose' ? (
                <button type="button" className={SAFETY_MODAL_BTN_CANCEL} onClick={resetCompose}>
                  Back
                </button>
              ) : (
                <button type="button" className={SAFETY_MODAL_BTN_CANCEL} onClick={onClose}>
                  Close
                </button>
              )}
              {step === 'compose' && canWrite ? (
                <button
                  type="button"
                  className={SAFETY_MODAL_BTN_PRIMARY}
                  disabled={!pickedTemplateId || createMut.isPending}
                  onClick={submitCompose}
                >
                  {createMut.isPending ? 'Saving…' : 'Complete'}
                </button>
              ) : null}
            </>
          }
        >
          {step === 'pick' && !hasExisting ? (
            <div className="space-y-3">
              {headerBlocks({
                whenIso: null,
                flaggedLabel: fieldLabel || fieldKey,
                flaggedRequired: fieldRequired,
                flaggedTemplate: sourceTemplateName,
                flaggedDate: sourceInspectionDate,
                showLabel: false,
                labelEditable: false,
              })}

              {canWrite ? (
                <>
                  {loadingTemplates ? (
                    <p className="text-sm text-gray-600 py-4 text-center">Loading…</p>
                  ) : templates.length === 0 ? (
                    <p className="text-sm text-gray-600 py-4 text-center">
                      No follow-up templates. Set a form template type to Follow-up in the template
                      editor.
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                      {templates.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2.5 hover:bg-amber-50"
                            onClick={() => {
                              setPickedTemplateId(t.id);
                              setFormPayload({});
                              setFollowUpLabel('');
                              setAssigneeId('');
                              setDueDate('');
                              setStep('compose');
                            }}
                          >
                            <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                            {(t.version_label || '').trim() ? (
                              <span className="text-xs text-gray-500 ml-2">{t.version_label}</span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600 py-4 text-center">No follow-ups on this field.</p>
              )}
            </div>
          ) : null}

          {step === 'compose' && composeDefinition ? (
            <div className="space-y-4 pb-2">
              {headerBlocks({
                whenIso: null,
                flaggedLabel: fieldLabel || fieldKey,
                flaggedRequired: composeRequired,
                flaggedTemplate: sourceTemplateName,
                flaggedDate: sourceInspectionDate,
                labelEditable: canWrite,
              })}
              <AppUserSelect
                mode="single"
                label="Assign to worker"
                value={assigneeId}
                onChange={setAssigneeId}
                placeholder="Search workers…"
                triggerClassName="w-full"
              />
              <AppDatePicker
                label="Due date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <div className="space-y-3">
                <p className={SAFETY_MODAL_FIELD_LABEL}>Details</p>
                <DynamicSafetyForm
                  definition={composeDefinition}
                  formPayload={formPayload}
                  setFormPayload={setFormPayload}
                  canWrite
                  projectId={projectId}
                  hideAdditionalCommentsBlock={false}
                />
              </div>
              <CustomSafetySignatureSlots
                projectId={projectId}
                formPayload={formPayload}
                setFormPayload={setFormPayload}
                disabled={createMut.isPending}
              />
              <div className={uiCx(uiLayout.actionsRow, 'gap-2')}>
                <AppButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={createMut.isPending}
                  onClick={() => setFormPayload((p) => appendCustomSignatureSlot(p))}
                >
                  Add custom signature
                </AppButton>
              </div>
              <SafetyFormSignaturesGallery formPayload={formPayload} title="Signatures" />
            </div>
          ) : null}

          {step === 'compose' && !composeDefinition ? (
            <p className="text-sm text-gray-600 py-6 text-center">Loading template…</p>
          ) : null}

          {step === 'view' && viewing && viewDefinition ? (
            <div className="space-y-4 pb-2">
              {headerBlocks({
                whenIso: viewing.created_at,
                flaggedLabel:
                  viewing.source_field_label_snapshot || viewing.source_field_key || fieldKey,
                flaggedRequired: Boolean(viewing.source_value_snapshot?.required),
                flaggedDisplay:
                  typeof viewing.source_value_snapshot?.display === 'string'
                    ? viewing.source_value_snapshot.display
                    : undefined,
                flaggedTemplate: viewing.source_template_name || sourceTemplateName,
                flaggedDate: viewing.source_inspection_date || sourceInspectionDate,
                labelEditable: false,
              })}
              <p className="text-sm text-gray-700">
                Status:{' '}
                <span className="font-semibold">
                  {viewing.status === 'completed' ? 'Completed' : 'Pending'}
                </span>
                {viewing.worker_name ? ` · Assigned to ${viewing.worker_name}` : ''}
                {viewing.due_date ? ` · Due ${viewing.due_date}` : ''}
              </p>
              <div className="space-y-3">
                <p className={SAFETY_MODAL_FIELD_LABEL}>Details</p>
                <DynamicSafetyForm
                  definition={viewDefinition}
                  formPayload={
                    viewing.form_payload && typeof viewing.form_payload === 'object'
                      ? viewing.form_payload
                      : {}
                  }
                  setFormPayload={() => {}}
                  canWrite={false}
                  readOnly
                  projectId={projectId}
                />
              </div>
              <SafetyFormSignaturesGallery
                formPayload={
                  viewing.form_payload && typeof viewing.form_payload === 'object'
                    ? viewing.form_payload
                    : {}
                }
                title="Signatures"
              />
            </div>
          ) : null}

          {step === 'view' && viewing && !viewDefinition ? (
            <p className="text-sm text-gray-600 py-6 text-center">Loading follow-up…</p>
          ) : null}
        </SafetyFormModalLayout>
      </SafetyModalOverlayBackdrop>
    </OverlayPortal>
  );
}
