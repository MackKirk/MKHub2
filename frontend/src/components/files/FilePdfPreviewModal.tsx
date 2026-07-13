import { AppButton, AppModal, uiCx, uiLayout } from '@/components/ui';

type Props = {
  open: boolean;
  url: string | null | undefined;
  name: string | null | undefined;
  onClose: () => void;
};

export function FilePdfPreviewModal({ open, url, name, onClose }: Props) {
  const fileUrl = url || '';
  const fileName = name || 'PDF';

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={fileName}
      size="lg"
      dialogClassName="!max-h-[95vh]"
      bodyClassName="!p-0 min-h-[70vh]"
      bodyFill={false}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end gap-2')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
            Close
          </AppButton>
          {fileUrl ? (
            <AppButton size="sm" type="button" onClick={() => window.open(fileUrl, '_blank')}>
              Download
            </AppButton>
          ) : null}
        </div>
      }
    >
      {fileUrl ? (
        <iframe src={fileUrl} className="h-[70vh] w-full border-0" title={fileName} />
      ) : null}
    </AppModal>
  );
}
