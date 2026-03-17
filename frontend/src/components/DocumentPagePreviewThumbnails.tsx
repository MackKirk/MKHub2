import type { DocumentPage, DocElement } from '@/types/documentCreator';

const A4_ASPECT = 210 / 297;
const THUMB_WIDTH_PX = 48;
const REFERENCE_CANVAS_WIDTH_PX = 910;
const scale = THUMB_WIDTH_PX / REFERENCE_CANVAS_WIDTH_PX;

type Template = { id: string; name?: string; background_file_id?: string };

type DocumentPagePreviewThumbnailsProps = {
  pages: DocumentPage[];
  templates: Template[];
  /** Max number of page thumbnails to show. Default 4. */
  maxPages?: number;
};

function MiniPageThumb({ page, backgroundUrl }: { page: DocumentPage; backgroundUrl: string | null }) {
  const elements = page.elements ?? [];
  return (
    <div
      className="relative flex-shrink-0 rounded border border-gray-200 overflow-hidden bg-white shadow-sm"
      style={{ width: THUMB_WIDTH_PX, aspectRatio: `${A4_ASPECT}` }}
    >
      <div className="absolute inset-0 w-full h-full">
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
                (() => {
                  const va = el.verticalAlign ?? 'top';
                  const justifyContent = va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';
                  const refFontSize = Math.max(8, Math.min(72, el.fontSize ?? 12));
                  const fontSizePx = Math.max(1, Math.min(6, refFontSize * scale));
                  const textStyle: React.CSSProperties = {
                    fontSize: `${fontSizePx}px`,
                    textAlign: el.textAlign ?? 'left',
                    fontWeight: el.fontWeight ?? 'normal',
                    fontStyle: el.fontStyle ?? 'normal',
                    fontFamily: el.fontFamily === 'Open Sans' ? '"Open Sans", sans-serif' : '"Montserrat", sans-serif',
                    color: el.color ?? '#000000',
                    lineHeight: 1.1,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  };
                  return (
                    <div className="w-full h-full flex flex-col" style={{ justifyContent }}>
                      <span className="block p-0.5 min-h-[1em]" style={textStyle}>
                        {(el.content || '').slice(0, 20)}
                      </span>
                    </div>
                  );
                })()
              ) : el.type === 'block' ? (
                <div
                  className="w-full h-full rounded-sm bg-amber-500/20 border border-amber-600/40"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(245,158,11,0.15) 2px, rgba(245,158,11,0.15) 4px)',
                  }}
                />
              ) : (
                el.content && (
                  <img
                    src={`/files/${el.content}/thumbnail?w=80`}
                    loading="lazy"
                    alt=""
                    className="w-full h-full object-cover"
                    style={{
                      objectFit: el.imageFit ?? 'contain',
                      objectPosition: el.imagePosition ?? '50% 50%',
                    }}
                  />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Horizontal row of small page thumbnails for document list preview.
 * Used in ProjectDocumentsTab to give a quick visual of each document.
 */
export function DocumentPagePreviewThumbnails({
  pages,
  templates,
  maxPages = 4,
}: DocumentPagePreviewThumbnailsProps) {
  const safePages = Array.isArray(pages) ? pages : [];
  const toShow = safePages.slice(0, maxPages);
  if (toShow.length === 0) {
    return (
      <div
        className="flex-shrink-0 rounded border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 text-[10px]"
        style={{ width: THUMB_WIDTH_PX, aspectRatio: `${A4_ASPECT}` }}
      >
        —
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {toShow.map((page, i) => {
        const template = templates.find((t) => t.id === (page.template_id ?? ''));
        const backgroundUrl = template?.background_file_id
          ? `/files/${template.background_file_id}/thumbnail?w=120`
          : null;
        return <MiniPageThumb key={i} page={page as DocumentPage} backgroundUrl={backgroundUrl} />;
      })}
    </div>
  );
}
