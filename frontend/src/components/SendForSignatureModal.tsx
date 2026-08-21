import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
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
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssignments({});
  }, [open, documentId]);

  const handleClose = () => {
    if (sending) return;
    setAssignments({});
    onClose();
  };

  const allAssigned =
    signersNeeded.length > 0 &&
    signersNeeded.every((r) => !!(assignments[r.id] && String(assignments[r.id]).trim()));

  const handleSend = async () => {
    if (!signersNeeded.length) {
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
      for (const r of signersNeeded) {
        body[r.id] = assignments[r.id]!;
      }
      await api('POST', `/document-creator/documents/${documentId}/send-for-signature`, {
        assignments: body,
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
      description={`Assign a user to each signer on “${documentTitle || 'Document'}”. Signing follows signer order (Signer 1 → 2 → …).`}
      formWidth="md"
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
        {signersNeeded.length === 0 ? (
          <p className={uiTypography.helper}>
            This document has no Signature, Initials, or Date fields yet. Add them in the builder first.
          </p>
        ) : (
          signersNeeded.map((signer, idx) => (
            <AppUserSelect
              key={signer.id}
              mode="single"
              label={`${idx + 1}. ${signer.label}`}
              value={assignments[signer.id] || ''}
              onChange={(v) => setAssignments((prev) => ({ ...prev, [signer.id]: v }))}
              placeholder="Search users…"
              fieldHint={
                /^employee$/i.test(signer.label)
                  ? 'Employee auto-fill tokens use this user.'
                  : undefined
              }
            />
          ))
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
