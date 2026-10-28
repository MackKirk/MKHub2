import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AppButton, AppModal, uiCx, uiLayout } from '@/components/ui';
import { downloadStoredFile } from '@/lib/downloadFile';
import { FilePreviewExpandButton } from './FilePreviewExpandButton';

type Props = {
  open: boolean;
  url: string | null | undefined;
  name: string | null | undefined;
  fileObjectId?: string | null;
  onClose: () => void;
};

export function FilePdfPreviewModal({ open, url, name, fileObjectId, onClose }: Props) {
  const fileUrl = url || '';
  const fileName = name || 'PDF';
  const fileId = String(fileObjectId || '').trim() || null;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  const handleDownload = async () => {
    try {
      if (fileId) {
        await downloadStoredFile(fileId, fileName);
        return;
      }
      if (fileUrl) window.open(fileUrl, '_blank');
    } catch {
      toast.error('Download failed');
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={fileName}
      size={expanded ? 'full' : 'lg'}
      dialogClassName={expanded ? undefined : '!max-h-[95vh]'}
      bodyClassName={
        expanded ? '!p-0 flex min-h-0 flex-1 flex-col' : '!p-0 min-h-[70vh]'
      }
      bodyFill={expanded}
      headerActions={
        <FilePreviewExpandButton expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end gap-2')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
            Close
          </AppButton>
          {fileUrl || fileId ? (
            <AppButton size="sm" type="button" onClick={() => void handleDownload()}>
              Download
            </AppButton>
          ) : null}
        </div>
      }
    >
      {fileUrl ? (
        <iframe
          src={fileUrl}
          className={
            expanded ? 'h-full min-h-0 w-full flex-1 border-0' : 'h-[70vh] w-full border-0'
          }
          title={fileName}
        />
      ) : null}
    </AppModal>
  );
}
