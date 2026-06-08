import { useEffect, useState } from 'react';
import { FleetAssignmentPhotosPicker } from '@/components/fleet/FleetAssignmentPhotosPicker';
import { FLEET_ASSIGNMENT_FIELD_HINTS as H } from '@/lib/fleetAssignmentFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'equipment-return-form';

const EQUIPMENT_RETURN_QUICK_INFO = formModalQuickInfo({
  purpose: <>Record return photos and notes when the equipment comes back.</>,
  howToUse: <>Add return photos if needed and save notes about the condition or handoff.</>,
  actions: (
    <>
      {uiLabel('Return')} saves the return on the open assignment. {uiLabel('Cancel')} closes without changes.
    </>
  ),
});

type Props = {
  open: boolean;
  equipmentDisplayName?: string;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
};

export default function EquipmentReturnModal({
  open,
  equipmentDisplayName,
  onClose,
  onSubmit,
  isSubmitting,
}: Props) {
  const [notes_in, setNotesIn] = useState('');
  const [photos_in, setPhotosIn] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNotesIn('');
    setPhotosIn([]);
    setUploadingPhotos(false);
  }, [open]);

  const busy = isSubmitting || uploadingPhotos;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      notes_in: notes_in || null,
      photos_in: photos_in.length ? photos_in : null,
    });
  };

  const title = equipmentDisplayName?.trim() ? `Return — ${equipmentDisplayName.trim()}` : 'Return';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description="Record return photos and notes for this equipment assignment."
      formWidth="comfortable"
      quickInfo={EQUIPMENT_RETURN_QUICK_INFO}
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
