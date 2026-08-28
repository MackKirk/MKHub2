import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { GripVertical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import {
  AppButton,
  AppCheckbox,
  AppFormModal,
  AppUserSelect,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  collectPresentSignerRoleIds,
  collectPresentSignerRoleIdsFromTemplate,
  signersFromSignatureTemplate,
  type DocumentSignerRoleDef,
  type DocElement,
  type SignatureTemplatePayloadRef,
} from '@/types/documentCreator';
import { sendForSignatureQuickInfo } from '@/lib/formModalQuickInfo';

type BaseProps = {
  open: boolean;
  documentTitle: string;
  onClose: () => void;
  onSent: () => void;
  /** When set (user Document Builder), Employee signer is fixed to this user. */
  lockedSubjectUserId?: string | null;
};

type DocumentModeProps = BaseProps & {
  documentId: string;
  pages: { elements?: DocElement[] }[];
  signerRoles: DocumentSignerRoleDef[];
  flushSave: () => Promise<boolean>;
  templateId?: never;
  signatureTemplate?: never;
};

type TemplateModeProps = BaseProps & {
  templateId: string;
  signatureTemplate: SignatureTemplatePayloadRef | null | undefined;
  documentId?: never;
  pages?: never;
  signerRoles?: never;
  flushSave?: never;
};

type Props = DocumentModeProps | TemplateModeProps;

function isEmployeeSigner(signer: DocumentSignerRoleDef): boolean {
  return Boolean(signer.fillsEmployeeTokens) || /^employee$/i.test(signer.label);
}

function SortableSignerRow({
  signer,
  index,
  value,
  onChange,
  disabled,
  locked,
}: {
  signer: DocumentSignerRoleDef;
  index: number;
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const rowDisabled = Boolean(disabled || locked);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: signer.id, disabled: rowDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white p-2.5 shadow-sm"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="shrink-0 cursor-grab touch-none rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={`Drag to reorder ${signer.label}`}
        disabled={rowDisabled}
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <AppUserSelect
          mode="single"
          label={`${index + 1}. ${signer.label}`}
          value={value}
          onChange={onChange}
          placeholder="Search users…"
          disabled={rowDisabled}
          fieldHint={
            locked
              ? 'Fixed to this employee — cannot be changed for user-scoped documents.'
              : isEmployeeSigner(signer)
                ? 'Employee auto-fill tokens use this user.'
                : undefined
          }
        />
      </div>
    </div>
  );
}

export default function SendForSignatureModal(props: Props) {
  const {
    open,
    documentTitle,
    onClose,
    onSent,
    lockedSubjectUserId = null,
  } = props;
  const isTemplateMode = 'templateId' in props && Boolean(props.templateId);
  const documentId = !isTemplateMode ? props.documentId : undefined;
  const templateId = isTemplateMode ? props.templateId : undefined;
  const pages = !isTemplateMode ? props.pages : undefined;
  const signerRoles = !isTemplateMode ? props.signerRoles : undefined;
  const signatureTemplate = isTemplateMode ? props.signatureTemplate : undefined;
  const flushSave = !isTemplateMode ? props.flushSave : undefined;

  const roleIds = useMemo(() => {
    if (isTemplateMode) return collectPresentSignerRoleIdsFromTemplate(signatureTemplate);
    return collectPresentSignerRoleIds(pages, signerRoles!);
  }, [isTemplateMode, signatureTemplate, pages, signerRoles]);

  const signersNeeded = useMemo(() => {
    if (isTemplateMode) return signersFromSignatureTemplate(signatureTemplate);
    return roleIds
      .map(
        (id) =>
          signerRoles!.find((r) => r.id === id) || {
            id,
            label: 'Signer',
            sortOrder: 999,
            fillsEmployeeTokens: false,
          },
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [isTemplateMode, roleIds, signatureTemplate, signerRoles]);
  const hasEmployeeLabeled = signersNeeded.some((r) => isEmployeeSigner(r));
  const [orderedSigners, setOrderedSigners] = useState<DocumentSignerRoleDef[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [signingDeadlineDays, setSigningDeadlineDays] = useState<string>('7');
  const [blockHubAccess, setBlockHubAccess] = useState(false);
  const [messageToSigners, setMessageToSigners] = useState('');
  const [sending, setSending] = useState(false);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ permissions?: string[]; roles?: string[] }>('GET', '/auth/me'),
    enabled: open,
  });
  const canBlockAccess =
    (me?.roles || []).includes('admin') ||
    (me?.permissions || []).includes('documents:signatures:block_access');

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    if (lockedSubjectUserId) {
      for (const signer of signersNeeded) {
        if (isEmployeeSigner(signer)) {
          initial[signer.id] = lockedSubjectUserId;
        }
      }
    }
    setAssignments(initial);
    setOrderedSigners(signersNeeded.map((s) => ({ ...s })));
    setSigningDeadlineDays('7');
    setBlockHubAccess(false);
    setMessageToSigners('');
  }, [open, documentId, templateId, signersNeeded, lockedSubjectUserId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedSigners((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === String(active.id));
      const newIndex = prev.findIndex((s) => s.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  const handleClose = () => {
    if (sending) return;
    setAssignments({});
    onClose();
  };

  const allAssigned =
    orderedSigners.length > 0 &&
    orderedSigners.every((r) => !!(assignments[r.id] && String(assignments[r.id]).trim()));

  const handleSend = async () => {
    if (!orderedSigners.length) {
      toast.error('Add Signature, Initials, or Date fields first.');
      return;
    }
    if (!allAssigned) {
      toast.error('Assign a user for each signer on the document.');
      return;
    }
    setSending(true);
    try {
      if (!isTemplateMode) {
        const saved = await flushSave!();
        if (!saved) {
          toast.error('Could not save the document before sending.');
          return;
        }
      }
      const body: Record<string, unknown> = {
        assignments: {},
        signing_order: orderedSigners.map((s) => s.id),
      };
      for (const r of orderedSigners) {
        const locked = Boolean(lockedSubjectUserId) && isEmployeeSigner(r);
        (body.assignments as Record<string, string>)[r.id] = locked
          ? lockedSubjectUserId!
          : assignments[r.id]!;
      }
      const days = parseInt(signingDeadlineDays, 10);
      if (!Number.isNaN(days) && days >= 1) {
        body.signing_deadline_days = days;
      }
      if (blockHubAccess && canBlockAccess) {
        body.block_hub_access = true;
      }
      const msg = messageToSigners.trim();
      if (msg) body.message_to_signers = msg;
      const url = isTemplateMode
        ? `/document-signature-templates/${templateId}/send-for-signature`
        : `/document-creator/documents/${documentId}/send-for-signature`;
      await api('POST', url, body);
      toast.success('Sent for signature.');
      setAssignments({});
      onSent();
      onClose();
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message?: string }).message)
          : 'Failed to send for signature';
      toast.error(msg || 'Failed to send for signature');
    } finally {
      setSending(false);
    }
  };

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title="Send for signature"
      description={`Assign a user to each signer on “${documentTitle || 'Document'}”. Drag to change signing order (1 → 2 → …).`}
      formWidth="md"
      quickInfo={sendForSignatureQuickInfo}
      footer={
        <div className="flex justify-end gap-2">
          <AppButton variant="secondary" onClick={handleClose} disabled={sending}>
            Cancel
          </AppButton>
          <AppButton variant="primary" onClick={() => void handleSend()} disabled={sending || !allAssigned}>
            {sending ? 'Sending…' : 'Send'}
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        {orderedSigners.length === 0 ? (
          <p className={uiTypography.helper}>
            {isTemplateMode
              ? 'This document has no Signature, Initials, or Date fields yet. Add them in the template editor first.'
              : 'This document has no Signature, Initials, or Date fields yet. Add them in the builder first.'}
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedSigners.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {orderedSigners.map((signer, idx) => {
                  const locked =
                    Boolean(lockedSubjectUserId) && isEmployeeSigner(signer);
                  return (
                    <SortableSignerRow
                      key={signer.id}
                      signer={signer}
                      index={idx}
                      value={assignments[signer.id] || ''}
                      onChange={(v) => {
                        if (locked) return;
                        setAssignments((prev) => ({ ...prev, [signer.id]: v }));
                      }}
                      disabled={sending}
                      locked={locked}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-gray-700">Signing deadline (days per turn)</span>
          <input
            type="number"
            min={1}
            className="w-20 shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={signingDeadlineDays}
            onChange={(e) => setSigningDeadlineDays(e.target.value)}
            disabled={sending}
            aria-label="Signing deadline in days per turn"
          />
        </div>
        {canBlockAccess ? (
          <AppCheckbox
            label="Block Hub access if overdue"
            fieldHint="Requires a signing deadline."
            checked={blockHubAccess}
            onChange={setBlockHubAccess}
            disabled={sending}
          />
        ) : null}
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Message to signers (optional)</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm min-h-[72px]"
            value={messageToSigners}
            onChange={(e) => setMessageToSigners(e.target.value)}
            disabled={sending}
            maxLength={4000}
          />
        </label>
        <p className={uiTypography.helper}>
          Each person only fills their fields. The PDF accumulates signatures until the last signer finishes.
          {hasEmployeeLabeled
            ? lockedSubjectUserId
              ? ' The Employee signer is fixed to this user and cannot be changed.'
              : ' A signer labeled “Employee” fills Employee auto-fill tokens.'
            : ''}
        </p>
      </div>
    </AppFormModal>
  );
}
