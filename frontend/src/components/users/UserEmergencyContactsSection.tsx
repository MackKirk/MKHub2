import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, MapPin, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { userEmergencyContactsQuickInfo } from '@/lib/formModalQuickInfo';
import { userProfileFieldHint } from '@/lib/userProfileFieldHints';
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';

function UserEmergencyRecordCard({ children }: { children: React.ReactNode }) {
  return <div className={uiCx('rounded-lg border border-gray-200 bg-white p-4')}>{children}</div>;
}

export function UserEmergencyContactsSection({
  userId,
  canEdit,
  showFieldHints,
}: {
  userId: string;
  canEdit: boolean;
  showFieldHints?: boolean;
}) {
  const { data, refetch } = useQuery({
    queryKey: ['emergency-contacts', userId],
    queryFn: () => api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`),
  });
  const confirm = useConfirm();
  const [editId, setEditId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [homePhone, setHomePhone] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [eName, setEName] = useState('');
  const [eRelationship, setERelationship] = useState('');
  const [eMobilePhone, setEMobilePhone] = useState('');
  const [eHomePhone, setEHomePhone] = useState('');
  const [eWorkPhone, setEWorkPhone] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [eAddress, setEAddress] = useState('');
  const [eIsPrimary, setEIsPrimary] = useState(false);

  const formatPhone = (v: string) => {
    const d = String(v || '').replace(/\D+/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  };

  const beginEdit = (c: any) => {
    setEditId(c.id);
    setEName(c.name || '');
    setERelationship(c.relationship || '');
    setEMobilePhone(c.mobile_phone || '');
    setEHomePhone(c.home_phone || '');
    setEWorkPhone(c.work_phone || '');
    setEEmail(c.email || '');
    setEAddress(c.address || '');
    setEIsPrimary(c.is_primary || false);
  };

  const cancelEdit = () => {
    setEditId(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      await api('POST', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`, {
        name,
        relationship,
        mobile_phone: mobilePhone,
        home_phone: homePhone,
        work_phone: workPhone,
        email,
        address,
        is_primary: isPrimary,
      });
      toast.success('Emergency contact created');
      setName('');
      setRelationship('');
      setMobilePhone('');
      setHomePhone('');
      setWorkPhone('');
      setEmail('');
      setAddress('');
      setIsPrimary(false);
      setCreateOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create contact');
    }
  };

  const handleUpdate = async (contactId: string) => {
    if (!eName.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      await api('PATCH', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`, {
        name: eName,
        relationship: eRelationship,
        mobile_phone: eMobilePhone,
        home_phone: eHomePhone,
        work_phone: eWorkPhone,
        email: eEmail,
        address: eAddress,
        is_primary: eIsPrimary,
      });
      toast.success('Emergency contact updated');
      setEditId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update contact');
    }
  };

  const handleDelete = async (contactId: string) => {
    const result = await confirm({
      title: 'Delete emergency contact',
      message: 'Are you sure you want to delete this emergency contact? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts/${contactId}`);
      toast.success('Emergency contact deleted');
      setEditId(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete contact');
    }
  };

  const resetCreateForm = () => {
    setName('');
    setRelationship('');
    setMobilePhone('');
    setHomePhone('');
    setWorkPhone('');
    setEmail('');
    setAddress('');
    setIsPrimary(false);
  };

  const openEdit = (c: any) => {
    if (!canEdit) return;
    beginEdit(c);
  };

  const renderContactFormFields = (mode: 'create' | 'edit') => {
    const isCreate = mode === 'create';
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <AppInput
          className="md:col-span-2"
          label="Name *"
          value={isCreate ? name : eName}
          onChange={(e) => (isCreate ? setName : setEName)(e.target.value)}
          fieldHint={showFieldHints ? userProfileFieldHint('emergency_name') : undefined}
        />
        <AppInput
          label="Relationship"
          value={isCreate ? relationship : eRelationship}
          onChange={(e) => (isCreate ? setRelationship : setERelationship)(e.target.value)}
          fieldHint={showFieldHints ? userProfileFieldHint('emergency_relationship') : undefined}
        />
        <AppCheckbox
          label="Set as primary contact"
          checked={isCreate ? isPrimary : eIsPrimary}
          onChange={isCreate ? setIsPrimary : setEIsPrimary}
        />
        <AppInput
          label="Mobile Phone"
          value={isCreate ? mobilePhone : eMobilePhone}
          onChange={(e) => (isCreate ? setMobilePhone : setEMobilePhone)(formatPhone(e.target.value))}
          fieldHint={showFieldHints ? userProfileFieldHint('emergency_mobile_phone') : undefined}
        />
        <AppInput
          label="Home Phone"
          value={isCreate ? homePhone : eHomePhone}
          onChange={(e) => (isCreate ? setHomePhone : setEHomePhone)(formatPhone(e.target.value))}
          fieldHint={showFieldHints ? userProfileFieldHint('emergency_home_phone') : undefined}
        />
        <AppInput
          label="Work Phone"
          value={isCreate ? workPhone : eWorkPhone}
          onChange={(e) => (isCreate ? setWorkPhone : setEWorkPhone)(formatPhone(e.target.value))}
          fieldHint={showFieldHints ? userProfileFieldHint('emergency_work_phone') : undefined}
        />
        <AppInput
          className="md:col-span-2"
          label="Email"
          type="email"
          value={isCreate ? email : eEmail}
          onChange={(e) => (isCreate ? setEmail : setEEmail)(e.target.value)}
          fieldHint={showFieldHints ? userProfileFieldHint('emergency_email') : undefined}
        />
        <AppInput
          className="md:col-span-2"
          label="Address"
          value={isCreate ? address : eAddress}
          onChange={(e) => (isCreate ? setAddress : setEAddress)(e.target.value)}
          fieldHint={showFieldHints ? userProfileFieldHint('emergency_address') : undefined}
        />
      </div>
    );
  };

  const contacts = data || [];

  return (
    <div className="flex flex-col gap-2">
      {canEdit ? (
        <AppListCreateItem label="New Contact" layout="row" className="w-full" onClick={() => setCreateOpen(true)} />
      ) : null}

      {contacts.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {contacts.map((c: any) => {
            const phoneEntries = [
              c.mobile_phone ? { label: 'Mobile', value: c.mobile_phone } : null,
              c.home_phone ? { label: 'Home', value: c.home_phone } : null,
              c.work_phone ? { label: 'Work', value: c.work_phone } : null,
            ].filter(Boolean) as { label: string; value: string }[];

            return (
              <UserEmergencyRecordCard key={c.id}>
                <div
                  role={canEdit ? 'button' : undefined}
                  tabIndex={canEdit ? 0 : undefined}
                  onClick={() => openEdit(c)}
                  onKeyDown={(e) => {
                    if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      openEdit(c);
                    }
                  }}
                  className={uiCx('group flex items-center gap-2 text-left sm:gap-3', canEdit && 'cursor-pointer')}
                >
                  <div
                    className={uiCx(
                      'flex h-11 w-11 shrink-0 items-center justify-center text-sm font-semibold text-gray-600',
                      uiRadius.control,
                      'bg-gradient-to-br from-gray-100 to-gray-200',
                    )}
                  >
                    {(c.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={uiCx(uiTypography.sectionTitle, 'truncate')}>{c.name || '—'}</span>
                      {c.is_primary ? <AppBadge variant="neutral">Primary</AppBadge> : null}
                    </div>
                    {c.relationship ? (
                      <p className={uiCx(uiTypography.helper, 'truncate')}>{c.relationship}</p>
                    ) : null}
                    <div
                      className={uiCx('mt-1 flex flex-col gap-0.5', uiTypography.helper)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex min-w-0 max-w-full items-center gap-1 truncate text-gray-600 hover:text-brand-red"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                          <span className="truncate">{c.email}</span>
                        </a>
                      ) : null}
                      {phoneEntries.map((phone) => (
                        <a
                          key={`${c.id}-${phone.label}`}
                          href={`tel:${phone.value}`}
                          className="inline-flex min-w-0 max-w-full items-center gap-1 truncate text-gray-600 hover:text-brand-red"
                        >
                          <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                          <span className="truncate">
                            {phoneEntries.length > 1 ? `${phone.label}: ` : ''}
                            {phone.value}
                          </span>
                        </a>
                      ))}
                      {c.address ? (
                        <p className="inline-flex min-w-0 max-w-full items-start gap-1 text-gray-600">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                          <span className="line-clamp-2">{c.address}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </UserEmergencyRecordCard>
            );
          })}
        </div>
      ) : !canEdit ? (
        <AppEmptyState title="No emergency contacts" />
      ) : null}

      <AppFormModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          resetCreateForm();
        }}
        title="New Emergency Contact"
        description="Add a person to call in an emergency."
        formWidth="comfortable"
        quickInfo={userEmergencyContactsQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setCreateOpen(false);
                resetCreateForm();
              }}
            >
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleCreate}>
              Create
            </AppButton>
          </div>
        }
      >
        {renderContactFormFields('create')}
      </AppFormModal>

      <AppFormModal
        open={editId !== null}
        onClose={cancelEdit}
        title="Edit Emergency Contact"
        description="Update contact details or mark as primary."
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              className="!text-red-600 hover:!bg-red-50"
              onClick={() => editId && handleDelete(editId)}
            >
              Delete
            </AppButton>
            <div className="flex items-center gap-2">
              <AppButton type="button" variant="secondary" size="sm" onClick={cancelEdit}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={() => editId && handleUpdate(editId)}>
                Save
              </AppButton>
            </div>
          </div>
        }
      >
        {renderContactFormFields('edit')}
      </AppFormModal>
    </div>
  );
}
