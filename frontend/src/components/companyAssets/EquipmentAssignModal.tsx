import { useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { FleetAssignmentPhotosPicker } from '@/components/fleet/FleetAssignmentPhotosPicker';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { FLEET_ASSIGNMENT_FIELD_HINTS as H } from '@/lib/fleetAssignmentFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  AppUserSelect,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'equipment-assign-form';

const EQUIPMENT_ASSIGN_QUICK_INFO = formModalQuickInfo({
  purpose: <>Assign this equipment item to a team member and record check-out details for the assignment log.</>,
  howToUse: (
    <>
      Choose {uiLabel('Name')}, then confirm or edit phone, address, and department. Add photos and notes before
      assigning.
    </>
  ),
  actions: (
    <>
      {uiLabel('Assign')} saves the assignment. {uiLabel('Cancel')} closes without changes.
    </>
  ),
});

function getEmployeeDisplayName(emp: any): string {
  if (!emp) return '';
  const name = (emp.name || '').trim();
  if (name) return name;
  const first = (emp.first_name || emp.profile?.first_name || '').trim();
  const last = (emp.last_name || emp.profile?.last_name || '').trim();
  const full = [first, last].filter(Boolean).join(' ');
  if (full) return full;
  return (emp.preferred_name || emp.profile?.preferred_name || emp.username || '').trim() || '—';
}

type Props = {
  open: boolean;
  equipmentDisplayName?: string;
  employees: unknown[];
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
};

export default function EquipmentAssignModal({
  open,
  equipmentDisplayName,
  employees,
  onClose,
  onSubmit,
  isSubmitting,
}: Props) {
  const [assigned_to_user_id, setAssignedToUserId] = useState('');
  const [phone_snapshot, setPhoneSnapshot] = useState('');
  const [address_snapshot, setAddressSnapshot] = useState('');
  const [department_snapshot, setDepartmentSnapshot] = useState('');
  const [notes_out, setNotesOut] = useState('');
  const [photos_out, setPhotosOut] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const controlInputClass = uiCx('w-full text-sm', uiRadius.control, uiBorders.input, uiSpacing.controlX, 'py-2');

  useEffect(() => {
    if (!open) return;
    setAssignedToUserId('');
    setPhoneSnapshot('');
    setAddressSnapshot('');
    setDepartmentSnapshot('');
    setNotesOut('');
    setPhotosOut([]);
    setUploadingPhotos(false);
  }, [open]);

  const assignUsers = useMemo(
    () => (Array.isArray(employees) ? employees : []).map((e: any) => mapEmployeeToAppUserSelect(e)),
    [employees],
  );

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    Array.isArray(employees) &&
      employees.forEach((emp: any) => {
        const d = (emp.department || emp.division || '').trim();
        if (d) set.add(d);
      });
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((d) => ({ value: d, label: d }));
  }, [employees]);

  const selectedUser = (Array.isArray(employees) ? employees : []).find(
    (e: any) => e.id === assigned_to_user_id,
  );

  useEffect(() => {
    if (!open || !selectedUser) return;
    const p = (selectedUser as any).profile || selectedUser;
    if (phone_snapshot === '' && (p.phone || p.mobile_phone)) setPhoneSnapshot(p.phone || p.mobile_phone || '');
    if (address_snapshot === '' && p.address) setAddressSnapshot(p.address);
    if (department_snapshot === '' && (p.department || p.division))
      setDepartmentSnapshot(p.department || p.division || '');
  }, [open, assigned_to_user_id, selectedUser, phone_snapshot, address_snapshot, department_snapshot]);

  const busy = isSubmitting || uploadingPhotos;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigned_to_user_id) {
      toast.error('Select who to assign the equipment to');
      return;
    }
    const assigned_to_name = selectedUser ? getEmployeeDisplayName(selectedUser) : '';
    onSubmit({
      assigned_to_user_id,
      assigned_to_name: assigned_to_name || null,
      phone_snapshot: phone_snapshot || null,
      address_snapshot: address_snapshot || null,
      department_snapshot: department_snapshot || null,
      notes_out: notes_out || null,
      photos_out: photos_out.length ? photos_out : null,
    });
  };

  const title = equipmentDisplayName?.trim() ? `Assign — ${equipmentDisplayName.trim()}` : 'Assign';

  const nameLabel: ReactNode = (
    <>
      Name <span className="text-brand-red">*</span>
    </>
  );

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description="Assign this equipment to a team member. Checkout details and photos are saved on the assignment log."
      formWidth="comfortable"
      quickInfo={EQUIPMENT_ASSIGN_QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={FORM_ID} size="sm" disabled={busy} loading={isSubmitting}>
            {isSubmitting ? 'Assigning…' : 'Assign'}
          </AppButton>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className={uiSpacing.sectionStack}>
        <div className={uiLayout.sectionGrid2}>
          <AppUserSelect
            mode="single"
            label={nameLabel}
            users={assignUsers}
            value={assigned_to_user_id}
            onChange={(userId) => setAssignedToUserId(userId ?? '')}
            placeholder="Search or select user…"
            disabled={busy}
            fieldHint={H.assigned_to}
          />
          <AppInput
            label="Phone"
            value={phone_snapshot}
            onChange={(e) => setPhoneSnapshot(e.target.value)}
            disabled={busy}
            fieldHint={H.phone_snapshot}
          />
          <div className="min-w-0 space-y-1.5 md:col-span-2">
            <AppControlLabelRow label="Address" fieldHint={<AppFieldHint hint={H.address_snapshot} />} />
            <AddressAutocomplete
              value={address_snapshot}
              onChange={setAddressSnapshot}
              placeholder="Start typing an address…"
              disabled={busy}
              className={controlInputClass}
            />
          </div>
          {departmentOptions.length > 0 ? (
            <AppSelect
              label="Department"
              value={department_snapshot}
              onChange={(e) => setDepartmentSnapshot(e.target.value)}
              options={departmentOptions}
              placeholder="Select department"
              disabled={busy}
              fieldHint={H.department_snapshot}
              className="md:col-span-2"
            />
          ) : (
            <AppInput
              label="Department"
              value={department_snapshot}
              onChange={(e) => setDepartmentSnapshot(e.target.value)}
              disabled={busy}
              fieldHint={H.department_snapshot}
              className="md:col-span-2"
            />
          )}
        </div>

        <FleetAssignmentPhotosPicker
          label="Image out"
          photoIds={photos_out}
          onPhotoIdsChange={setPhotosOut}
          onUploadingChange={setUploadingPhotos}
          disabled={busy}
          fieldHint={H.photos_out}
        />
        <AppTextarea
          label="Notes out"
          value={notes_out}
          onChange={(e) => setNotesOut(e.target.value)}
          rows={3}
          disabled={busy}
          fieldHint={H.notes_out}
        />
      </form>
    </AppFormModal>
  );
}
