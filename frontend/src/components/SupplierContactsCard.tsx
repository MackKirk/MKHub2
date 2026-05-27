import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import ImagePicker from '@/components/ImagePicker';
import {
  AppButton,
  AppControlLabelRow,
  AppEmptyState,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppTextarea,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { inventoryContactFormQuickInfo } from '@/lib/formModalQuickInfo';

const EM_DASH = '\u2014';

export type SupplierContactRecord = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  notes?: string;
  image_base64?: string;
};

type Props = {
  supplierId: string;
  supplierDisplayName?: string;
  hasEditPermission?: boolean;
};

export default function SupplierContactsCard({
  supplierId,
  supplierDisplayName,
  hasEditPermission = false,
}: Props) {
  const confirm = useConfirm();
  const { data, refetch, isSuccess } = useQuery({
    queryKey: ['supplierContacts', supplierId],
    queryFn: () => api<SupplierContactRecord[]>('GET', `/inventory/suppliers/${supplierId}/contacts`),
    enabled: !!supplierId,
  });

  const [list, setList] = useState<SupplierContactRecord[]>([]);
  useEffect(() => {
    setList(data || []);
  }, [data]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierContactRecord | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setTitle('');
    setNotes('');
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    resetForm();
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (c: SupplierContactRecord) => {
    if (!hasEditPermission) return;
    setEditing(c);
    setName(c.name || '');
    setEmail(c.email || '');
    setPhone(c.phone || '');
    setTitle(c.title || '');
    setNotes(c.notes || '');
    setModalOpen(true);
  };

  const refresh = () => {
    refetch();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        await api('PUT', `/inventory/contacts/${editing.id}`, {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
          supplier_id: supplierId,
        });
        toast.success('Contact updated');
      } else {
        await api('POST', '/inventory/contacts', {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
          supplier_id: supplierId,
        });
        toast.success('Contact created');
      }
      closeModal();
      refresh();
    } catch {
      toast.error('Failed to save contact');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: 'Delete contact',
      message: 'Are you sure you want to delete this contact?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    setIsSaving(true);
    try {
      await api('DELETE', `/inventory/contacts/${editing.id}`);
      toast.success('Contact deleted');
      closeModal();
      refresh();
    } catch {
      toast.error('Failed to delete contact');
    } finally {
      setIsSaving(false);
    }
  };

  const contactMetaLine = (c: SupplierContactRecord) => c.title?.trim() || null;

  return (
    <div className={uiSpacing.sectionStack}>
      <div className="flex flex-col gap-2">
        {hasEditPermission ? (
          <AppListCreateItem label="New Contact" layout="row" onClick={openCreate} />
        ) : null}

        {(list || []).map((c) => {
          const avatarSrc = c.image_base64 || '';
          const meta = contactMetaLine(c);

          return (
            <div
              key={c.id}
              role={hasEditPermission ? 'button' : undefined}
              tabIndex={hasEditPermission ? 0 : undefined}
              onClick={() => openEdit(c)}
              onKeyDown={(e) => {
                if (hasEditPermission && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  openEdit(c);
                }
              }}
              className={uiCx(
                'group flex items-center gap-2 text-left sm:gap-3',
                uiRadius.control,
                uiBorders.subtle,
                uiColors.surface,
                'px-2 py-2 sm:px-3 sm:py-2.5',
                hasEditPermission && 'cursor-pointer transition-shadow hover:border-gray-300 hover:shadow-sm',
              )}
            >
              <div className="relative shrink-0">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt=""
                    className={uiCx('h-11 w-11 object-cover', uiRadius.control, 'ring-2 ring-white')}
                  />
                ) : (
                  <div
                    className={uiCx(
                      'flex h-11 w-11 items-center justify-center text-sm font-semibold text-gray-600',
                      uiRadius.control,
                      'bg-gradient-to-br from-gray-100 to-gray-200',
                    )}
                  >
                    {(c.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={uiCx(uiTypography.sectionTitle, 'truncate')}>{c.name || EM_DASH}</span>
                </div>
                {meta ? <p className={uiCx(uiTypography.helper, 'truncate')}>{meta}</p> : null}
                <div
                  className={uiCx('mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5', uiTypography.helper)}
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
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex min-w-0 items-center gap-1 text-gray-600 hover:text-brand-red"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                      <span>{c.phone}</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isSuccess && (!list || !list.length) && !hasEditPermission ? (
        <AppEmptyState title="No contacts" />
      ) : null}

      <AppFormModal
        open={modalOpen}
        onClose={closeModal}
        formWidth="comfortable"
        overlayClassName={uiModalLayer.stacked}
        title={editing ? 'Edit Contact' : 'New Contact'}
        description={
          editing
            ? `Update contact for ${supplierDisplayName || 'this supplier'}`
            : `Add a contact for ${supplierDisplayName || 'this supplier'}`
        }
        quickInfo={inventoryContactFormQuickInfo(!!editing)}
        footer={
          editing && hasEditPermission ? (
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between gap-2')}>
              <AppButton type="button" variant="danger" size="sm" disabled={isSaving} onClick={handleDelete}>
                Delete
              </AppButton>
              <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
                <AppButton type="button" variant="secondary" size="sm" disabled={isSaving} onClick={closeModal}>
                  Cancel
                </AppButton>
                <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={handleSave}>
                  {isSaving ? 'Saving…' : 'Update'}
                </AppButton>
              </div>
            </div>
          ) : (
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" disabled={isSaving} onClick={closeModal}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={handleSave}>
                Create
              </AppButton>
            </div>
          )
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          {editing ? (
            <div className="md:col-span-2 space-y-1.5">
              <AppControlLabelRow
                label="Contact photo"
                fieldHint={<AppFieldHint hint="Contact photo\n\nOptional profile image for this contact." />}
              />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={isSaving}
                className={uiCx(
                  'relative h-24 w-24 overflow-hidden border transition-colors hover:border-brand-red',
                  uiRadius.control,
                  uiBorders.subtle,
                )}
              >
                {editing.image_base64 ? (
                  <img src={editing.image_base64} className="h-full w-full object-cover" alt="" />
                ) : (
                  <span className={uiCx(uiTypography.helper, 'px-2')}>Add photo</span>
                )}
              </button>
            </div>
          ) : null}
          <AppInput
            className="md:col-span-2"
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
            placeholder="Enter contact name"
            fieldHint="Name\n\nFull name for this contact at the supplier."
          />
          <AppInput
            label="Title / Department"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSaving}
            placeholder="Enter title or department"
            fieldHint="Title / Department\n\nRole or department (optional)."
          />
          <AppInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSaving}
            placeholder="Enter email address"
            fieldHint="Email\n\nWork email for this contact."
          />
          <AppInput
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isSaving}
            placeholder="Enter phone number"
            fieldHint="Phone\n\nDirect phone number."
          />
          <AppTextarea
            className="md:col-span-2"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSaving}
            placeholder="Enter notes"
            rows={3}
            fieldHint="Notes\n\nOptional internal notes about this contact."
          />
        </div>
      </AppFormModal>

      {pickerOpen && editing ? (
        <ImagePicker
          isOpen
          onClose={() => setPickerOpen(false)}
          targetWidth={400}
          targetHeight={400}
          allowEdit
          overlayClassName={uiModalLayer.nestedPicker}
          onConfirm={async (blob) => {
            try {
              const reader = new FileReader();
              reader.onload = async (e) => {
                const imageBase64 = e.target?.result as string;
                try {
                  await api('PUT', `/inventory/contacts/${editing.id}`, {
                    image_base64: imageBase64,
                  });
                  toast.success('Contact photo updated');
                  setEditing((prev) => (prev ? { ...prev, image_base64: imageBase64 } : prev));
                  refresh();
                } catch {
                  toast.error('Failed to update contact photo');
                }
              };
              reader.readAsDataURL(blob);
            } catch {
              toast.error('Failed to process image');
            } finally {
              setPickerOpen(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
