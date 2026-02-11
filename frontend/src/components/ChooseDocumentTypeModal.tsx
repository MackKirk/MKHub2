import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type DocumentTypePreset = {
  id: string;
  name: string;
  description?: string | null;
  page_templates: { template_id: string; label?: string }[];
  created_at?: string | null;
};

type ChooseDocumentTypeModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called with null for "Blank", or document type id when user picks a preset */
  onSelect: (documentTypeId: string | null) => void;
};

export function ChooseDocumentTypeModal({
  open,
  onClose,
  onSelect,
}: ChooseDocumentTypeModalProps) {
  const { data: documentTypes = [], isLoading } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
    enabled: open,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create document</h2>
          <p className="text-sm text-gray-500 mt-0.5">Choose a document layout or start blank.</p>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="text-sm text-gray-500 py-6 text-center">Loading...</div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  onClose();
                }}
                className="w-full flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left p-3 rounded-lg border border-gray-200 hover:border-brand-red/50 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">Blank (single page)</span>
                <span className="text-xs text-gray-500">No background, one empty page</span>
              </button>
              {documentTypes.map((dt) => (
                <button
                  key={dt.id}
                  type="button"
                  onClick={() => {
                    onSelect(dt.id);
                    onClose();
                  }}
                  className="w-full flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-left p-3 rounded-lg border border-gray-200 hover:border-brand-red/50 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-gray-900">{dt.name}</span>
                  <span className="text-xs text-gray-500">
                    {dt.description || `${(dt.page_templates || []).length} page(s)`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-gray-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
