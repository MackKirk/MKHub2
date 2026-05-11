import DocumentEditor from '@/components/DocumentEditor';
import OverlayPortal from '@/components/OverlayPortal';
import { CompressIcon } from '@/components/document-editor/documentEditorIcons';

type DocumentCreatorModalProps = {
  open: boolean;
  documentId: string | null;
  projectId?: string | null;
  onClose: () => void;
  /** Called when modal is closed (e.g. to refresh project documents list) */
  onAfterClose?: () => void;
  /** When true, document is opened in read-only mode (no editing, no add page). */
  readOnly?: boolean;
  /** When provided, shows a compress button in the ribbon to exit full-screen mode. */
  onCompress?: () => void;
};

export function DocumentCreatorModal({
  open,
  documentId,
  projectId,
  onClose,
  onAfterClose,
  readOnly = false,
  onCompress,
}: DocumentCreatorModalProps) {
  const handleClose = () => {
    onAfterClose?.();
    onClose();
  };

  if (!open) return null;

  const compressButton = onCompress ? (
    <button
      type="button"
      onClick={onCompress}
      title="Exit full screen"
      className="rounded-xl p-2 text-slate-600 transition-[color,background-color,transform] duration-200 ease-out hover:bg-slate-200/70 hover:text-slate-950 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35"
    >
      <CompressIcon className="w-5 h-5" />
    </button>
  ) : undefined;

  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {documentId ? (
          <DocumentEditor
            documentId={documentId}
            projectId={projectId}
            onClose={handleClose}
            readOnly={readOnly}
            closeSlotBelow={compressButton}
          />
        ) : (
          <div className="flex items-center justify-center p-8 text-gray-500">
            Loading...
          </div>
        )}
      </div>
    </div>
    </OverlayPortal>
  );
}
