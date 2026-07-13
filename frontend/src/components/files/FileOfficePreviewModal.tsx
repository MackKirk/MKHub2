import {
  AppButton,
  AppEmptyState,
  AppModal,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { canEmbedWithOfficeOnline, officeOnlineEmbedSrc } from './officeOnlinePreview';

type Props = {
  open: boolean;
  url: string | null | undefined;
  name: string | null | undefined;
  onClose: () => void;
};

function downloadFile(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'download';
  a.rel = 'noopener';
  a.click();
}

export function FileOfficePreviewModal({ open, url, name, onClose }: Props) {
  const fileUrl = url || '';
  const fileName = name || 'Spreadsheet';
  const canEmbed = !!fileUrl && canEmbedWithOfficeOnline(fileUrl);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={fileName}
      size="lg"
      dialogClassName="!max-w-[95vw] !max-h-[95vh]"
      bodyClassName={canEmbed ? '!p-0 min-h-[70vh]' : undefined}
      bodyFill={false}
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
              <AppButton size="sm" type="button" onClick={() => downloadFile(fileUrl, fileName)}>
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
          className="h-[70vh] w-full border-0"
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
