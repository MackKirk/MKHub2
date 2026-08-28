import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import ImagePicker from '@/components/ImagePicker';
import { api, withFileAccessToken } from '@/lib/api';
import { uploadPropertyFile } from '@/lib/propertyFileUpload';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppHeroEditButton,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';
import { formatPropertyAddress, PROPERTY_PLACEHOLDER_COVER } from '@/lib/propertyListUtils';
import toast from 'react-hot-toast';

export type PropertyHeroData = {
  id: string;
  name: string;
  property_type?: string;
  ownership: string;
  visibility: string;
  status: string;
  address_line1?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  owner_summary?: string;
  image_file_object_id?: string | null;
};

type Props = {
  property: PropertyHeroData;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onImageUpdated: () => void;
};

export default function PropertyHeroBar({ property, canEdit, onEdit, onDelete, onImageUpdated }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const cover = property.image_file_object_id
    ? withFileAccessToken(`/files/${property.image_file_object_id}/thumbnail?w=800`)
    : PROPERTY_PLACEHOLDER_COVER;

  const address = formatPropertyAddress(property);

  const handleCover = async (blob: Blob) => {
    try {
      const file = new File([blob], 'property-cover.jpg', { type: 'image/jpeg' });
      const fileId = await uploadPropertyFile(file);
      await api('PATCH', `/properties/${property.id}`, { image_file_object_id: fileId });
      toast.success('Cover photo updated');
      onImageUpdated();
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    } finally {
      setPickerOpen(false);
    }
  };

  return (
    <>
      <AppCard className="overflow-hidden" bodyClassName={collapsed ? undefined : '!p-0'}>
        {collapsed ? (
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center justify-between gap-3')}>
            <div className="flex min-w-0 items-center gap-3">
              <img src={cover} alt="" className={uiCx('h-12 w-16 object-cover', uiRadius.control, uiBorders.subtle)} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-gray-900">{property.name}</div>
                <div className={uiTypography.helper}>{address}</div>
              </div>
            </div>
            <div className={uiCx(uiLayout.actionsRow, 'gap-2')}>
              <AppBadge variant={property.visibility === 'family' ? 'warning' : 'info'}>{property.visibility}</AppBadge>
              <AppBadge variant="neutral">{property.ownership}</AppBadge>
              <AppButton variant="ghost" size="sm" onClick={() => setCollapsed(false)} aria-label="Expand">
                <ChevronDown className="h-4 w-4" />
              </AppButton>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <div
                className={uiCx(
                  'relative h-36 w-full max-w-xs shrink-0 overflow-hidden group',
                  uiRadius.card,
                  uiBorders.subtle,
                  'bg-gray-100',
                )}
              >
                <img src={cover} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Change photo
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={uiCx(uiTypography.overline, 'mb-1')}>
                      {[property.property_type, property.status].filter(Boolean).join(' · ') || 'Property'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-5 w-5 shrink-0 text-gray-400" />
                      <h2 className={uiTypography.sectionTitle}>{property.name}</h2>
                      {canEdit ? (
                        <AppHeroEditButton size="title" title="Edit property" aria-label="Edit property" onClick={onEdit} />
                      ) : null}
                    </div>
                    <p className={uiTypography.helper}>{address || 'No address on file'}</p>
                    {property.owner_summary ? (
                      <p className="mt-1 text-sm text-gray-600">{property.owner_summary}</p>
                    ) : null}
                  </div>
                  <div className={uiCx(uiLayout.actionsRow, 'flex-wrap gap-2')}>
                    {canEdit ? (
                      <AppButton variant="secondary" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
                        Delete
                      </AppButton>
                    ) : null}
                    <AppButton variant="ghost" size="sm" onClick={() => setCollapsed(true)} aria-label="Collapse">
                      <ChevronUp className="h-4 w-4" />
                    </AppButton>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AppBadge variant={property.visibility === 'family' ? 'warning' : 'info'}>{property.visibility}</AppBadge>
                  <AppBadge variant="neutral">{property.ownership}</AppBadge>
                  {property.property_type ? <AppBadge variant="neutral">{property.property_type}</AppBadge> : null}
                  <AppBadge variant="neutral">{property.status}</AppBadge>
                </div>
                {property.postal_code ? (
                  <div className="text-sm text-gray-600">Postal: {property.postal_code}</div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </AppCard>

      {pickerOpen && (
        <ImagePicker
          isOpen
          onClose={() => setPickerOpen(false)}
          clientId=""
          targetWidth={1200}
          targetHeight={800}
          allowEdit
          onConfirm={handleCover}
        />
      )}
    </>
  );
}
