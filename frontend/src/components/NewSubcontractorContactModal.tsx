import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppSelect,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName?: string | null;
  onCreated?: () => void;
};

export default function NewSubcontractorContactModal({ open, onClose, companyId, companyName, onCreated }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [primary, setPrimary] = useState('false');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleClose = useCallback(() => {
    setIsCreating(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setPhone('');
    setPrimary('false');
    setRole('');
    setDept('');
  }, [open, companyId]);

  const formatPhone = (v: string) => {
    const d = String(v || '')
      .replace(/\D+/g, '')
      .slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  };

  const title = companyName?.trim() ? `New contact — ${companyName.trim()}` : 'New contact';

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      setIsCreating(true);
      await api('POST', `/subcontractors/companies/${companyId}/contacts`, {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role_title: role.trim() || undefined,
        department: dept.trim() || undefined,
        is_primary: primary === 'true',
      });
      toast.success('Contact created');
      onCreated?.();
      handleClose();
    } catch {
      toast.error('Failed to create contact');
    } finally {
      setIsCreating(false);
    }
  };

  if (!companyId) return null;

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title={title}
      description="Name, role, and contact details"
      formWidth="comfortable"
      quickInfo={
        <>
          <p>Add a contact for this subcontractor company. Name is required.</p>
          <p>Mark one contact as primary for default communication.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isCreating}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" disabled={isCreating} loading={isCreating} onClick={() => void handleCreate()}>
            {isCreating ? 'Creating…' : 'Create'}
          </AppButton>
        </div>
      }
    >
      <div className={uiCx(uiSpacing.sectionStack, 'grid gap-3 md:grid-cols-2')}>
        <AppInput
          className="md:col-span-2"
          label="Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isCreating}
          fieldHint="Name\n\nFull name shown in contact lists."
        />
        <AppInput
          label="Role/title"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={isCreating}
          fieldHint="Role/title\n\nJob title or role at the company."
        />
        <AppInput
          label="Department"
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          disabled={isCreating}
          fieldHint="Department\n\nDepartment or team (optional)."
        />
        <AppInput
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isCreating}
          fieldHint="Email\n\nWork email for this contact."
        />
        <AppInput
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          disabled={isCreating}
          fieldHint="Phone\n\nDirect phone number for this contact."
        />
        <AppSelect
          label="Primary"
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          options={[
            { value: 'false', label: 'No' },
            { value: 'true', label: 'Yes' },
          ]}
          disabled={isCreating}
          fieldHint="Primary\n\nPrimary contact receives default communication."
        />
      </div>
    </AppFormModal>
  );
}
