type Template = { id: string; name: string; description?: string; background_file_id?: string };

type AddPageTemplateModalProps = {
  open: boolean;
  templates: Template[];
  onClose: () => void;
  onSelect: (templateId: string | null) => void;
};

const A4_ASPECT = 210 / 297;

export function AddPageTemplateModal({
  open,
  templates,
  onClose,
  onSelect,
}: AddPageTemplateModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Choose template for new page</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="rounded-xl border-2 border-gray-200 hover:border-brand-red hover:bg-brand-red/5 transition-colors overflow-hidden flex flex-col items-center text-left"
            >
              <div
                className="w-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm"
                style={{ aspectRatio: `${A4_ASPECT}` }}
              >
                Blank
              </div>
              <span className="w-full p-2 text-sm font-medium text-gray-900">Blank (A4)</span>
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className="rounded-xl border-2 border-gray-200 hover:border-brand-red hover:bg-brand-red/5 transition-colors overflow-hidden flex flex-col items-center text-left"
              >
                <div
                  className="w-full bg-gray-100 relative"
                  style={{ aspectRatio: `${A4_ASPECT}` }}
                >
                  {t.background_file_id ? (
                    <img
                      src={`/files/${t.background_file_id}/thumbnail?w=200`}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
                      No image
                    </div>
                  )}
                </div>
                <span className="w-full p-2 text-sm font-medium text-gray-900 truncate" title={t.name}>
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
