import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { GripVertical } from 'lucide-react';
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
  AppFormModal,
  AppUserSelect,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  collectPresentSignerRoleIds,
  type DocumentSignerRoleDef,
  type DocElement,
} from '@/types/documentCreator';
import { sendForSignatureQuickInfo } from '@/lib/formModalQuickInfo';

type Props = {
  open: boolean;
  documentId: string;
  documentTitle: string;
  pages: { elements?: DocElement[] }[];
  signerRoles: DocumentSignerRoleDef[];
  onClose: () => void;
  onSent: () => void;
  flushSave: () => Promise<boolean>;
};

function SortableSignerRow({
  signer,
  index,
  value,
  onChange,
  disabled,
}: {
  signer: DocumentSignerRoleDef;
  index: number;
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: signer.id, disabled });

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
        disabled={disabled}
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
          fieldHint={
            /^employee$/i.test(signer.label) ? 'Employee auto-fill tokens use this user.' : undefined
          }
        />
      </div>
    </div>
  );
}

export default function SendForSignatureModal({
  open,
  documentId,
  documentTitle,
  pages,
  signerRoles,
  onClose,
  onSent,
  flushSave,
}: Props) {
  const roleIds = useMemo(
    () => collectPresentSignerRoleIds(pages, signerRoles),
    [pages, signerRoles],
  );
  const signersNeeded = useMemo(
    () =>
      roleIds
        .map(
          (id) =>
            signerRoles.find((r) => r.id === id) || {
              id,
              label: 'Signer',
              sortOrder: 999,
              fillsEmployeeTokens: false,
            },
        )
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [roleIds, signerRoles],
  );
  const hasEmployeeLabeled = signersNeeded.some((r) => /^employee$/i.test(r.label));
  const [orderedSigners, setOrderedSigners] = useState<DocumentSignerRoleDef[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssignments({});
    setOrderedSigners(signersNeeded.map((s) => ({ ...s })));
  }, [open, documentId, signersNeeded]);

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
      const saved = await flushSave();
      if (!saved) {
        toast.error('Could not save the document before sending.');
        return;
      }
      const body: Record<string, string> = {};
      for (const r of orderedSigners) {
        body[r.id] = assignments[r.id]!;
      }
      await api('POST', `/document-creator/documents/${documentId}/send-for-signature`, {
        assignments: body,
        signing_order: orderedSigners.map((s) => s.id),
      });
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
            This document has no Signature, Initials, or Date fields yet. Add them in the builder first.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedSigners.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {orderedSigners.map((signer, idx) => (
                  <SortableSignerRow
                    key={signer.id}
                    signer={signer}
                    index={idx}
                    value={assignments[signer.id] || ''}
                    onChange={(v) => setAssignments((prev) => ({ ...prev, [signer.id]: v }))}
                    disabled={sending}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <p className={uiTypography.helper}>
          Each person only fills their fields. The PDF accumulates signatures until the last signer finishes.
          {hasEmployeeLabeled
            ? ' A signer labeled “Employee” fills Employee auto-fill tokens.'
            : ''}
        </p>
      </div>
    </AppFormModal>
  );
}
