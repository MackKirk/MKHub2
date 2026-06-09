import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { COMPANY_CREDIT_CARD_FIELD_HINTS as H } from '@/lib/companyCreditCardFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
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

const ASSIGN_CUSTODY_QUICK_INFO = formModalQuickInfo({
  purpose: <>Record who is taking physical custody of this corporate card.</>,
  howToUse: (
    <>
      Select {uiLabel('Employee')}, add optional {uiLabel('Notes')} if helpful, then confirm the assignment.
    </>
  ),
  actions: (
    <>
      {uiLabel('Assign')} saves custody and appears in History. {uiLabel('Cancel')} closes without changes.
    </>
  ),
});

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
      quickInfo={ASSIGN_CUSTODY_QUICK_INFO}
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
          fieldHint={H.assign_employee}
        />
        <AppTextarea
          label="Notes"
          value={assignNotes}
          onChange={(e) => setAssignNotes(e.target.value)}
          rows={2}
          disabled={isPending}
          fieldHint={H.assign_notes}
        />
      </form>
    </AppFormModal>
  );
}
