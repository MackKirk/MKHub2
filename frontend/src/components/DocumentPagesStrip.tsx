import type { DocumentPage, DocElement } from '@/types/documentCreator';

const A4_ASPECT = 210 / 297;

type Template = { id: string; name: string; background_file_id?: string };

type DocumentPagesStripProps = {
  pages: DocumentPage[];
  templates: Template[];
  currentPageIndex: number;
  onPageSelect: (index: number) => void;
  onAddPage: () => void;
};

function PageThumbnail({
  page,
  backgroundUrl,
  isSelected,
  onClick,
}: {
  page: DocumentPage;
  backgroundUrl: string | null;
  isSelected: boolean;
  onClick: () => void;
}) {
  const elements = page.elements ?? [];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full rounded-lg border-2 overflow-hidden bg-white transition-all flex-shrink-0 ${
        isSelected ? 'border-brand-red ring-2 ring-brand-red/30 shadow-md' : 'border-gray-200 hover:border-gray-300'
      }`}
      style={{ aspectRatio: `${A4_ASPECT}` }}
    >
      <div className="absolute inset-0">
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 bg-gray-100 pointer-events-none" />
        )}
        {elements.map((el: DocElement) => {
          const x = (el.x_pct ?? 10) / 100;
          const y = (el.y_pct ?? 20) / 100;
          const w = (el.width_pct ?? 80) / 100;
          const h = (el.height_pct ?? 8) / 100;
          return (
            <div
              key={el.id}
              className="absolute pointer-events-none"
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
              }}
            >
              {el.type === 'text' ? (
                <span
                  className="block text-black text-left overflow-hidden whitespace-pre-wrap break-words p-0.5 leading-tight"
                  style={{
                    fontSize: `${Math.max(6, Math.min(10, Math.round((el.fontSize ?? 12) * 0.35)))}px`,
                  }}
                >
                  {el.content || ''}
                </span>
              ) : (
                el.content && (
                  <img
                    src={`/files/${el.content}/thumbnail?w=80`}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                )
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}

export default function DocumentPagesStrip({
  pages,
  templates,
  currentPageIndex,
  onPageSelect,
  onAddPage,
}: DocumentPagesStripProps) {
  return (
    <div className="w-36 flex flex-col bg-gray-50/80 border-r border-gray-200 overflow-y-auto py-3 gap-2 flex-shrink-0">
      {pages.map((page, i) => {
        const template = templates.find((t) => t.id === (page.template_id ?? ''));
        const backgroundUrl = template?.background_file_id
          ? `/files/${template.background_file_id}/thumbnail?w=200`
          : null;
        return (
          <div key={i} className="px-2">
            <PageThumbnail
              page={page}
              backgroundUrl={backgroundUrl}
              isSelected={currentPageIndex === i}
              onClick={() => onPageSelect(i)}
            />
            <span className="block text-center text-[10px] text-gray-500 font-medium mt-0.5">
              {i === 0 ? 'Cover' : i + 1}
            </span>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAddPage}
        className="mx-2 mt-1 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-red hover:bg-brand-red/5 text-gray-500 hover:text-brand-red transition-colors py-4"
      >
        <span className="text-lg font-light">+</span>
        <span className="sr-only">Add page</span>
      </button>
    </div>
  );
}
