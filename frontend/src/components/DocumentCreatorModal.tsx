import DocumentEditor from '@/components/DocumentEditor';

type DocumentCreatorModalProps = {
  open: boolean;
  documentId: string | null;
  projectId?: string | null;
  onClose: () => void;
  /** Called when modal is closed (e.g. to refresh project documents list) */
  onAfterClose?: () => void;
};

export function DocumentCreatorModal({
  open,
  documentId,
  projectId,
  onClose,
  onAfterClose,
}: DocumentCreatorModalProps) {
  const handleClose = () => {
    onAfterClose?.();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {documentId ? (
          <DocumentEditor
            documentId={documentId}
            projectId={projectId}
            onClose={handleClose}
          />
        ) : (
          <div className="flex items-center justify-center p-8 text-gray-500">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}
