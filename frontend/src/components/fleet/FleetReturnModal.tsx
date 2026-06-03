import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FleetAssignmentPhotosPicker } from '@/components/fleet/FleetAssignmentPhotosPicker';
import { FLEET_ASSIGNMENT_FIELD_HINTS as H } from '@/lib/fleetAssignmentFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'fleet-return-form';

const FLEET_RETURN_QUICK_INFO = formModalQuickInfo({
  purpose: <>Record return readings, photos, and notes when the asset comes back.</>,
  howToUse: (
    <>
      Enter odometer or hours in, add return photos if needed, and save. Odometer in cannot be below the check-out
      reading.
    </>
  ),
  actions: (
    <>
      {uiLabel('Return')} saves the return on the open assignment. {uiLabel('Cancel')} closes without changes.
    </>
  ),
});

type OpenAssignment = {
  odometer_out?: number;
};

type FleetAsset = {
  asset_type: string;
};

type Props = {
  open: boolean;
  openAssignment: OpenAssignment;
  asset: FleetAsset | undefined;
  assetDisplayName?: string;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
};

export default function FleetReturnModal({
  open,
  openAssignment,
  asset,
  assetDisplayName,
  onClose,
  onSubmit,
  isSubmitting,
}: Props) {
  const [odometer_in, setOdometerIn] = useState('');
  const [hours_in, setHoursIn] = useState('');
  const [notes_in, setNotesIn] = useState('');
  const [photos_in, setPhotosIn] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOdometerIn('');
    setHoursIn('');
    setNotesIn('');
    setPhotosIn([]);
    setUploadingPhotos(false);
  }, [open]);

  const minOdometerIn = useMemo(() => {
    if (asset?.asset_type !== 'vehicle' || !openAssignment) return null;
    const out = openAssignment.odometer_out;
    if (out == null || Number.isNaN(Number(out))) return null;
    return Number(out);
  }, [asset?.asset_type, openAssignment?.odometer_out]);

  const busy = isSubmitting || uploadingPhotos;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (asset?.asset_type === 'vehicle' && odometer_in.trim() !== '' && minOdometerIn != null) {
      const v = parseInt(odometer_in, 10);
      if (!Number.isNaN(v) && v < minOdometerIn) {
        toast.error(`Odometer in must be at least odometer out at check-out (${minOdometerIn.toLocaleString()}).`);
        return;
      }
    }
    onSubmit({
      odometer_in: odometer_in ? parseInt(odometer_in, 10) : null,
      hours_in: hours_in ? parseFloat(hours_in) : null,
      notes_in: notes_in || null,
      photos_in: photos_in.length ? photos_in : null,
    });
  };

  const title = assetDisplayName?.trim() ? `Return — ${assetDisplayName.trim()}` : 'Return';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description="Record return readings, photos, and notes. Odometer in cannot be below the reading recorded at check-out."
      formWidth="comfortable"
      quickInfo={FLEET_RETURN_QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={FORM_ID} size="sm" disabled={busy} loading={isSubmitting}>
            {isSubmitting ? 'Returning…' : 'Return'}
          </AppButton>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className={uiSpacing.sectionStack}>
        {asset?.asset_type === 'vehicle' && (
          <AppInput
            label="Odometer in"
            type="number"
            value={odometer_in}
            onChange={(e) => setOdometerIn(e.target.value)}
            min={minOdometerIn != null ? minOdometerIn : 0}
            disabled={busy}
            fieldHint={H.odometer_in}
            helperText={
              minOdometerIn != null
                ? `Must be at least check-out odometer (${minOdometerIn.toLocaleString()}).`
                : undefined
            }
          />
        )}
        {(asset?.asset_type === 'heavy_machinery' || asset?.asset_type === 'other') && (
          <AppInput
            label="Hours in"
            type="number"
            step="0.1"
            value={hours_in}
            onChange={(e) => setHoursIn(e.target.value)}
            min={0}
            disabled={busy}
            fieldHint={H.hours_in}
          />
        )}
        <FleetAssignmentPhotosPicker
          label="Images in"
          photoIds={photos_in}
          onPhotoIdsChange={setPhotosIn}
          onUploadingChange={setUploadingPhotos}
          disabled={busy}
          fieldHint={H.photos_in}
        />
        <AppTextarea
          label="Notes in"
          value={notes_in}
          onChange={(e) => setNotesIn(e.target.value)}
          rows={3}
          disabled={busy}
          fieldHint={H.notes_in}
        />
      </form>
    </AppFormModal>
  );
}
