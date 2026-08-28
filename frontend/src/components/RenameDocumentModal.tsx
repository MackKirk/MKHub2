import { useEffect, useState } from 'react';
import { AppButton, AppFormModal, AppInput, uiCx, uiLayout } from '@/components/ui';

type RenameDocumentModalProps = {
  open: boolean;
  initialTitle: string;
  saving?: boolean;
  error?: string | null;
  onSave: (title: string) => void | Promise<void>;
  onCancel: () => void;
};

export default function RenameDocumentModal({
  open,
  initialTitle,
  saving = false,
  error = null,
  onSave,
  onCancel,
}: RenameDocumentModalProps) {
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    if (open) setTitle(initialTitle);
  }, [open, initialTitle]);

  if (!open) return null;

  const trimmed = title.trim();
  const canSave = trimmed.length > 0 && !saving;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    void onSave(trimmed);
  };

  return (
    <AppFormModal
      open
      onClose={onCancel}
      title="Name your document"
      description="Confirm or edit the document name before you start editing."
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton size="sm" type="submit" form="rename-document-form" disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </AppButton>
        </div>
      }
    >
      <form id="rename-document-form" onSubmit={handleSubmit} className="space-y-3 pb-0.5">
        <AppInput
          id="rename-document-title"
          label="Document name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          autoFocus
          disabled={saving}
          error={error}
        />
      </form>
    </AppFormModal>
  );
}
