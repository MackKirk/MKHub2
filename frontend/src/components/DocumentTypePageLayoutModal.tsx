import type { DocElement, PageMargins } from '@/types/documentCreator';
import DocumentEditor from '@/components/DocumentEditor';
import OverlayPortal from '@/components/OverlayPortal';

type Template = { id: string; name: string; background_file_id?: string };

type DocumentTypePageLayoutModalProps = {
  open: boolean;
  pageIndex: number;
  templateId: string | null;
  templates: Template[];
  initialMargins?: PageMargins | null;
  initialElements?: DocElement[];
  onClose: () => void;
  onSave: (margins: PageMargins, elements: DocElement[], templateId?: string | null) => void;
  /** Add a new page to the type with the given layout (duplicate page) */
  onDuplicatePage?: (margins: PageMargins, elements: DocElement[]) => void;
};

export function DocumentTypePageLayoutModal({
  open,
  pageIndex,
  templateId,
  templates,
  initialMargins,
  initialElements,
  onClose,
  onSave,
  onDuplicatePage,
}: DocumentTypePageLayoutModalProps) {
  if (!open) return null;

  return (
    <OverlayPortal>
      {/* Full-bleed like Document Builder editor — no inset card / margins. */}
      <div className="fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-white">
        <DocumentEditor
          mode="template"
          open={open}
          pageIndex={pageIndex}
          templateId={templateId}
          templates={templates}
          initialMargins={initialMargins}
          initialElements={initialElements}
          onClose={onClose}
          onSave={onSave}
          onDuplicatePage={onDuplicatePage}
        />
      </div>
    </OverlayPortal>
  );
}
