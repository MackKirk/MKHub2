import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AppButton,
  AppEmptyState,
  AppModal,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { downloadFromUrl } from '@/lib/downloadFile';
import { FilePreviewExpandButton } from './FilePreviewExpandButton';
import { canEmbedWithOfficeOnline, officeOnlineEmbedSrc } from './officeOnlinePreview';

type Props = {
  open: boolean;
  url: string | null | undefined;
  name: string | null | undefined;
  onClose: () => void;
};

export function FileOfficePreviewModal({ open, url, name, onClose }: Props) {
  const fileUrl = url || '';
  const fileName = name || 'Spreadsheet';
  const canEmbed = !!fileUrl && canEmbedWithOfficeOnline(fileUrl);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={fileName}
      size={expanded ? 'full' : 'lg'}
      dialogClassName={expanded ? undefined : '!max-h-[95vh]'}
      bodyClassName={
        canEmbed
          ? expanded
            ? '!p-0 flex min-h-0 flex-1 flex-col'
            : '!p-0 min-h-[70vh]'
          : undefined
      }
      bodyFill={canEmbed && expanded}
      headerActions={
        <FilePreviewExpandButton expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end gap-2')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose}>
            Close
          </AppButton>
          {fileUrl ? (
            <>
              <AppButton
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
              >
                Open
              </AppButton>
              <AppButton
                size="sm"
                type="button"
                onClick={() => {
                  void downloadFromUrl(fileUrl, fileName).catch(() => toast.error('Download failed'));
                }}
              >
                Download
              </AppButton>
            </>
          ) : null}
        </div>
      }
    >
      {canEmbed ? (
        <iframe
          src={officeOnlineEmbedSrc(fileUrl)}
          className={
            expanded ? 'h-full min-h-0 w-full flex-1 border-0' : 'h-[70vh] w-full border-0'
          }
          title={fileName}
          allow="fullscreen"
        />
      ) : (
        <div className={uiCx(uiSpacing.sectionStack, 'py-6')}>
          <AppEmptyState
            title="Preview not available here"
            description="Spreadsheets open in Microsoft Office Online only when the file URL is publicly reachable. On local/dev this usually fails — download the file or open it in a new tab instead."
          />
          <p className={uiCx(uiTypography.helper, 'text-center')}>
            Supported for in-app preview when hosted on a public HTTPS URL (for example Azure Blob with SAS).
          </p>
        </div>
      )}
    </AppModal>
  );
}
