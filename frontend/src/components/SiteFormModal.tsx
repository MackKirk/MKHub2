import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { useConfirm } from '@/components/ConfirmProvider';
import { SITE_CARD_COVER_CROP, uploadSiteCover } from '@/lib/siteCover';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppTextarea,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiBorders,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type ClientSiteRecord = {
  id?: string;
  site_name?: string;
  site_address_line1?: string;
  site_address_line1_complement?: string;
  site_address_line2?: string;
  site_address_line2_complement?: string;
  site_address_line3?: string;
  site_address_line3_complement?: string;
  site_city?: string;
  site_province?: string;
  site_postal_code?: string;
  site_country?: string;
  site_lat?: number | null;
  site_lng?: number | null;
  site_notes?: string;
};

export type ClientSiteForm = Omit<ClientSiteRecord, 'id'>;

export function emptySiteForm(): ClientSiteForm {
  return {
    site_name: '',
    site_address_line1: '',
    site_address_line1_complement: '',
    site_address_line2: '',
    site_address_line2_complement: '',
    site_address_line3: '',
    site_address_line3_complement: '',
    site_city: '',
    site_province: '',
    site_postal_code: '',
    site_country: '',
    site_lat: null,
    site_lng: null,
    site_notes: '',
  };
}

function siteToForm(site: ClientSiteRecord): ClientSiteForm {
  const { id: _id, ...rest } = site;
  return { ...emptySiteForm(), ...rest };
}

type Props = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientDisplayName?: string | null;
  /** When null/undefined, modal is in create mode */
  site?: ClientSiteRecord | null;
  coverUrl?: string;
  readOnly?: boolean;
  onSaved?: () => void;
  onDeleted?: () => void;
  /** Raised z-index when opened from another modal (e.g. Edit Project Site). */
  overlayClassName?: string;
};

export default function SiteFormModal({
  open,
  onClose,
  clientId,
  clientDisplayName,
  site,
  coverUrl = '',
  readOnly = false,
  onSaved,
  onDeleted,
  overlayClassName,
}: Props) {
  const confirm = useConfirm();
  const isEdit = !!site?.id;
  const [form, setForm] = useState<ClientSiteForm>(emptySiteForm);
  const [showAddress2, setShowAddress2] = useState(false);
  const [showAddress3, setShowAddress3] = useState(false);
  const [coverPreview, setCoverPreview] = useState('');
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState(false);

  const setField = useCallback((key: keyof ClientSiteForm, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const controlInputClass = uiCx('w-full text-sm', uiRadius.control, uiBorders.input, uiSpacing.controlX, 'py-2');

  useEffect(() => {
    if (!open) return;
    if (site?.id) {
      const next = siteToForm(site);
      setForm(next);
      setShowAddress2(!!(next.site_address_line2 || next.site_address_line2_complement));
      setShowAddress3(!!(next.site_address_line3 || next.site_address_line3_complement));
    } else {
      setForm(emptySiteForm());
      setShowAddress2(false);
      setShowAddress3(false);
    }
    setCoverPreview(coverUrl || '');
    setCoverBlob(null);
    setPickerOpen(false);
    setNameError(false);
  }, [open, site, coverUrl]);

  const handleClose = useCallback(() => {
    setIsSaving(false);
    onClose();
  }, [onClose]);

  const title = readOnly
    ? site?.site_name?.trim()
      ? `View site — ${site.site_name.trim()}`
      : 'View site'
    : isEdit
      ? site?.site_name?.trim()
        ? `Edit site — ${site.site_name.trim()}`
        : clientDisplayName?.trim()
          ? `Edit site — ${clientDisplayName.trim()}`
          : 'Edit site'
      : clientDisplayName?.trim()
        ? `New site — ${clientDisplayName.trim()}`
        : 'New site';

  const handleSave = async () => {
    if (readOnly || isSaving) return;
    if (!form.site_name?.trim()) {
      setNameError(true);
      toast.error('Site name is required');
      return;
    }
    try {
      setIsSaving(true);
      if (isEdit && site?.id) {
        await api('PATCH', `/clients/${clientId}/sites/${site.id}`, form);
        if (coverBlob) {
          try {
            await uploadSiteCover(clientId, String(site.id), coverBlob);
          } catch {
            toast.error('Site saved, but cover upload failed');
          }
        }
        toast.success('Site updated');
      } else {
        const created = await api<{ id: string }>('POST', `/clients/${clientId}/sites`, form);
        if (coverBlob && created?.id) {
          try {
            await uploadSiteCover(clientId, String(created.id), coverBlob);
          } catch {
            toast.error('Site created, but cover upload failed');
          }
        }
        toast.success('Site created');
      }
      onSaved?.();
      handleClose();
    } catch {
      toast.error(isEdit ? 'Failed to update site' : 'Failed to create site');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !site?.id || readOnly || isSaving) return;
    const ok = await confirm({
      title: 'Delete site',
      message: `Are you sure you want to delete "${form.site_name || 'this site'}"? This action cannot be undone.`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      setIsSaving(true);
      await api('DELETE', `/clients/${clientId}/sites/${site.id}`);
      toast.success('Site deleted');
      onDeleted?.();
      handleClose();
    } catch {
      toast.error('Failed to delete site');
    } finally {
      setIsSaving(false);
    }
  };

  if (!clientId) return null;

  return (
    <>
      <AppFormModal
        open={open}
        onClose={handleClose}
        title={title}
        description={readOnly ? 'Construction site details' : 'Site name, address, and notes'}
        formWidth="wide"
        overlayClassName={overlayClassName}
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        quickInfo={
          <>
            <p>Construction sites belong to this customer for projects and documentation.</p>
            <p>Use address search to auto-fill city, province, country, and postal code.</p>
            <p>Cover image is optional. In the picker, drag and zoom to frame the banner — the outline matches the site card.</p>
          </>
        }
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between gap-2')}>
            {isEdit && !readOnly ? (
              <AppButton type="button" variant="danger" size="sm" disabled={isSaving} onClick={handleDelete}>
                Delete
              </AppButton>
            ) : (
              <span />
            )}
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
                {readOnly ? 'Close' : 'Cancel'}
              </AppButton>
              {!readOnly ? (
                <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={handleSave}>
                  {isSaving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save' : 'Create'}
                </AppButton>
              ) : null}
            </div>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppInput
            label="Site name *"
            value={form.site_name || ''}
            onChange={(e) => {
              setField('site_name', e.target.value);
              if (nameError) setNameError(false);
            }}
            disabled={readOnly || isSaving}
            error={nameError && !form.site_name?.trim() ? 'This field is required' : undefined}
            fieldHint="Site name\n\nLabel for this construction location."
          />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 space-y-1.5">
              <AppControlLabelRow
                label="Address"
                fieldHint={<AppFieldHint hint="Address\n\nStreet address. Suggestions appear as you type." />}
              />
              <AddressAutocomplete
                value={form.site_address_line1 || ''}
                onChange={(value) => setField('site_address_line1', value)}
                disabled={readOnly || isSaving}
                onAddressSelect={(address) => {
                  setForm((prev) => ({
                    ...prev,
                    site_address_line1: address.address_line1 || prev.site_address_line1,
                    site_address_line2:
                      address.address_line2 !== undefined ? address.address_line2 : prev.site_address_line2,
                    site_city: address.city !== undefined ? address.city : prev.site_city,
                    site_province: address.province !== undefined ? address.province : prev.site_province,
                    site_country: address.country !== undefined ? address.country : prev.site_country,
                    site_postal_code:
                      address.postal_code !== undefined ? address.postal_code : prev.site_postal_code,
                    site_lat: address.lat !== undefined ? address.lat : prev.site_lat,
                    site_lng: address.lng !== undefined ? address.lng : prev.site_lng,
                  }));
                }}
                placeholder="Enter address"
                className={controlInputClass}
              />
            </div>
            <AppInput
              className="md:col-span-2"
              label="Complement"
              value={form.site_address_line1_complement || ''}
              onChange={(e) => setField('site_address_line1_complement', e.target.value)}
              disabled={readOnly || isSaving}
              placeholder="Apartment, unit, block, etc. (optional)"
              fieldHint="Complement\n\nSuite or unit for the primary address."
            />

            {!showAddress2 && !readOnly ? (
              <div className="md:col-span-2">
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-brand-red"
                  onClick={() => setShowAddress2(true)}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add another address
                </AppButton>
              </div>
            ) : null}

            {showAddress2 ? (
              <>
                <div className="md:col-span-2 space-y-1.5">
                  <AppControlLabelRow label="Address 2" />
                  <AddressAutocomplete
                    value={form.site_address_line2 || ''}
                    onChange={(value) => setField('site_address_line2', value)}
                    disabled={readOnly || isSaving}
                    onAddressSelect={(address) => {
                      setForm((prev) => ({
                        ...prev,
                        site_address_line2: address.address_line1 || prev.site_address_line2,
                      }));
                    }}
                    placeholder="Enter address"
                    className={controlInputClass}
                  />
                </div>
                <div className="flex items-end gap-2 md:col-span-2">
                  <AppInput
                    className="flex-1"
                    label="Complement"
                    value={form.site_address_line2_complement || ''}
                    onChange={(e) => setField('site_address_line2_complement', e.target.value)}
                    disabled={readOnly || isSaving}
                    placeholder="Optional"
                  />
                  {!readOnly ? (
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mb-1 shrink-0 text-red-600"
                      title="Remove address 2"
                      onClick={() => {
                        if (showAddress3) {
                          setForm((prev) => ({
                            ...prev,
                            site_address_line2: prev.site_address_line3 || '',
                            site_address_line2_complement: prev.site_address_line3_complement || '',
                            site_address_line3: '',
                            site_address_line3_complement: '',
                          }));
                          setShowAddress3(false);
                        } else {
                          setField('site_address_line2', '');
                          setField('site_address_line2_complement', '');
                        }
                        setShowAddress2(false);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </AppButton>
                  ) : null}
                </div>
                {!showAddress3 && !readOnly ? (
                  <div className="md:col-span-2">
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-brand-red"
                      onClick={() => setShowAddress3(true)}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Add another address
                    </AppButton>
                  </div>
                ) : null}
              </>
            ) : null}

            {showAddress3 ? (
              <>
                <div className="md:col-span-2 space-y-1.5">
                  <AppControlLabelRow label="Address 3" />
                  <AddressAutocomplete
                    value={form.site_address_line3 || ''}
                    onChange={(value) => setField('site_address_line3', value)}
                    disabled={readOnly || isSaving}
                    onAddressSelect={(address) => {
                      setForm((prev) => ({
                        ...prev,
                        site_address_line3: address.address_line1 || prev.site_address_line3,
                      }));
                    }}
                    placeholder="Enter address"
                    className={controlInputClass}
                  />
                </div>
                <div className="flex items-end gap-2 md:col-span-2">
                  <AppInput
                    className="flex-1"
                    label="Complement"
                    value={form.site_address_line3_complement || ''}
                    onChange={(e) => setField('site_address_line3_complement', e.target.value)}
                    disabled={readOnly || isSaving}
                    placeholder="Optional"
                  />
                  {!readOnly ? (
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mb-1 shrink-0 text-red-600"
                      title="Remove address 3"
                      onClick={() => {
                        setField('site_address_line3', '');
                        setField('site_address_line3_complement', '');
                        setShowAddress3(false);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </AppButton>
                  ) : null}
                </div>
              </>
            ) : null}

            <AppInput
              label="Country"
              value={form.site_country || ''}
              readOnly
              disabled
              placeholder="Auto-filled from address"
              fieldHint="Country\n\nFilled automatically when you pick an address."
            />
            <AppInput
              label="Province / state"
              value={form.site_province || ''}
              readOnly
              disabled
              placeholder="Auto-filled from address"
              fieldHint="Province / state\n\nFilled automatically when you pick an address."
            />
            <AppInput
              label="City"
              value={form.site_city || ''}
              readOnly
              disabled
              placeholder="Auto-filled from address"
              fieldHint="City\n\nFilled automatically when you pick an address."
            />
            <AppInput
              label="Postal code"
              value={form.site_postal_code || ''}
              readOnly
              disabled
              placeholder="Auto-filled from address"
              fieldHint="Postal code\n\nFilled automatically when you pick an address."
            />
          </div>

          <div className="grid items-start gap-3 md:grid-cols-5">
            <AppTextarea
              className="md:col-span-3"
              label="Notes"
              rows={3}
              textareaClassName="h-32 min-h-32 resize-y"
              value={form.site_notes || ''}
              onChange={(e) => setField('site_notes', e.target.value)}
              disabled={readOnly || isSaving}
              fieldHint="Notes\n\nInternal notes about access, hazards, or site-specific details."
            />
            <div className="space-y-1.5 md:col-span-2">
              <AppControlLabelRow
                label="Site cover"
                fieldHint={
                  <AppFieldHint hint="Site cover\n\nOptional. Click to select and frame the banner (drag/zoom in the picker)." />
                }
              />
              <button
                type="button"
                onClick={() => !readOnly && setPickerOpen(true)}
                disabled={readOnly || isSaving}
                className={uiCx(
                  'relative grid h-32 w-full place-items-center overflow-hidden bg-gray-50',
                  uiRadius.control,
                  uiBorders.input,
                  (readOnly || isSaving) && 'cursor-not-allowed opacity-60',
                )}
              >
                {coverPreview ? (
                  <img src={coverPreview} className="h-full w-full object-cover" alt="Site cover preview" />
                ) : (
                  <span className={uiTypography.helper}>Select cover</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </AppFormModal>

      {pickerOpen && (
        <ImagePicker
          isOpen
          onClose={() => setPickerOpen(false)}
          clientId={String(clientId)}
          targetWidth={SITE_CARD_COVER_CROP.width}
          targetHeight={SITE_CARD_COVER_CROP.height}
          allowEdit
          overlayClassName={uiModalLayer.nestedPicker}
          onConfirm={async (blob) => {
            try {
              setCoverBlob(blob);
              setCoverPreview(URL.createObjectURL(blob));
            } finally {
              setPickerOpen(false);
            }
          }}
        />
      )}
    </>
  );
}
