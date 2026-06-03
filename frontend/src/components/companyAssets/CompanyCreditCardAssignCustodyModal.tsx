import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import {
  AppButton,
  AppFormModal,
  AppTextarea,
  AppUserSelect,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'company-credit-card-assign-custody-form';

export type CompanyCreditCardAssignCustodyModalProps = {
  open: boolean;
  cardLabel?: string;
  onClose: () => void;
  onAssign: (data: { assigned_to_user_id: string; notes?: string }) => void;
  isPending?: boolean;
};

export default function CompanyCreditCardAssignCustodyModal({
  open,
  cardLabel,
  onClose,
  onAssign,
  isPending = false,
}: CompanyCreditCardAssignCustodyModalProps) {
  const [assignUserId, setAssignUserId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<unknown[]>('GET', '/employees'),
    enabled: open,
  });

  const assignUsers = useMemo(
    () => (Array.isArray(employees) ? employees : []).map((e) => mapEmployeeToAppUserSelect(e as Record<string, unknown>)),
    [employees],
  );

  useEffect(() => {
    if (!open) return;
    setAssignUserId('');
    setAssignNotes('');
  }, [open]);

  const title = cardLabel?.trim() ? `Assign custody — ${cardLabel.trim()}` : 'Assign custody';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description="The employee who will physically hold this card."
      formWidth="comfortable"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={!assignUserId || isPending}
            loading={isPending}
          >
            {isPending ? 'Assigning…' : 'Assign'}
          </AppButton>
        </div>
      }
    >
      <form
        id={FORM_ID}
        className={uiSpacing.sectionStack}
        onSubmit={(e) => {
          e.preventDefault();
          if (!assignUserId) return;
          onAssign({
            assigned_to_user_id: assignUserId,
            notes: assignNotes.trim() || undefined,
          });
        }}
      >
        <AppUserSelect
          mode="single"
          label="Employee"
          users={assignUsers}
          value={assignUserId}
          onChange={(userId) => setAssignUserId(userId ?? '')}
          placeholder="Search or select user…"
          disabled={isPending}
          fieldHint="Employee\n\nThe team member who will physically hold this corporate card."
        />
        <AppTextarea
          label="Notes"
          value={assignNotes}
          onChange={(e) => setAssignNotes(e.target.value)}
          rows={2}
          disabled={isPending}
          fieldHint="Notes\n\nOptional context for this assignment (e.g. project or vehicle)."
        />
      </form>
    </AppFormModal>
  );
}
