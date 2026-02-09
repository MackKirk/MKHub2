import type { DocElement } from '@/types/documentCreator';

type DocumentPreviewProps = {
  /** Background image URL (from template) */
  backgroundUrl: string | null;
  /** Canva-style elements (text, image) */
  elements: DocElement[];
  /** Called when user clicks an element (to select) */
  onElementClick?: (elementId: string) => void;
  /** Called when user clicks empty area (deselect) */
  onCanvasClick?: () => void;
  /** Currently selected element id */
  selectedElementId: string | null;
};

const A4_ASPECT = 210 / 297;

export default function DocumentPreview({
  backgroundUrl,
  elements,
  onElementClick,
  onCanvasClick,
  selectedElementId,
}: DocumentPreviewProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0 rounded-xl border bg-white overflow-hidden">
      <div className="p-3 border-b border-gray-200 text-gray-600 text-sm font-medium">
        Preview
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div
          className="bg-white shadow-lg rounded-sm overflow-hidden relative"
          style={{
            aspectRatio: `${A4_ASPECT}`,
            maxHeight: '100%',
            maxWidth: '100%',
            width: '100%',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onCanvasClick?.();
          }}
        >
          {backgroundUrl && (
            <img
              src={backgroundUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          )}
          {!backgroundUrl && (
            <div className="absolute inset-0 bg-gray-100 pointer-events-none" />
          )}
          {elements.map((el) => {
            const x = (el.x_pct ?? 10) / 100;
            const y = (el.y_pct ?? 20) / 100;
            const w = (el.width_pct ?? 80) / 100;
            const h = (el.height_pct ?? 8) / 100;
            const isSelected = selectedElementId === el.id;
            return (
              <div
                key={el.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onElementClick?.(el.id);
                }}
                className={`absolute cursor-pointer border transition-colors rounded overflow-hidden ${
                  isSelected ? 'ring-2 ring-brand-red border-brand-red' : 'border-transparent hover:border-gray-300'
                }`}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${w * 100}%`,
                  height: `${h * 100}%`,
                }}
              >
                {el.type === 'text' ? (
                  <span
                    className="block text-black text-left overflow-hidden whitespace-pre-wrap break-words p-1"
                    style={{
                      fontSize: `${Math.max(8, Math.min(72, el.fontSize ?? 12))}px`,
                    }}
                  >
                    {el.content || 'Click to edit'}
                  </span>
                ) : (
                  el.content && (
                    <img
                      src={`/files/${el.content}/thumbnail?w=400`}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
