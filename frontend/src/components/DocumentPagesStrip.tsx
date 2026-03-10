import { useEffect, useRef, useState } from 'react';
import type { DocumentPage, DocElement } from '@/types/documentCreator';

const A4_ASPECT = 210 / 297;
// Keep thumbnails visually consistent with the main editor scaling.
const REFERENCE_CANVAS_WIDTH_PX = 910;

type Template = { id: string; name: string; background_file_id?: string };

type DocumentPagesStripProps = {
  pages: DocumentPage[];
  templates: Template[];
  currentPageIndex: number;
  onPageSelect: (index: number) => void;
  /** When set, show the "Add page" button. Omit for read-only mode. */
  onAddPage?: () => void;
  /** When set, pages can be reordered by drag and drop. */
  onReorderPages?: (fromIndex: number, toIndex: number) => void;
  /** When set, show delete button on each page (only when more than one page). */
  onDeletePage?: (index: number) => void;
  /** When set, show duplicate button on each page. */
  onDuplicatePage?: (index: number) => void;
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
  const thumbRef = useRef<HTMLButtonElement>(null);
  const [thumbWidthPx, setThumbWidthPx] = useState<number>(130);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const update = () => setThumbWidthPx(el.getBoundingClientRect().width || 130);
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const scale = Math.max(0.08, Math.min(0.3, thumbWidthPx / REFERENCE_CANVAS_WIDTH_PX));

  return (
    <button
      ref={thumbRef}
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
                (() => {
                  const va = el.verticalAlign ?? 'top';
                  const justifyContent = va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';
                  const refFontSize = Math.max(8, Math.min(72, el.fontSize ?? 12));
                  const fontSizePx = Math.max(2, Math.min(10, refFontSize * scale));
                  const textStyle: React.CSSProperties = {
                    fontSize: `${fontSizePx}px`,
                    textAlign: el.textAlign ?? 'left',
                    fontWeight: el.fontWeight ?? 'normal',
                    fontStyle: el.fontStyle ?? 'normal',
                    fontFamily: el.fontFamily === 'Open Sans' ? '"Open Sans", sans-serif' : '"Montserrat", sans-serif',
                    color: el.color ?? '#000000',
                    lineHeight: 1.15,
                  };
                  return (
                    <div className="w-full h-full flex flex-col" style={{ justifyContent }}>
                      <span className="block overflow-hidden whitespace-pre-wrap break-words p-0.5 min-h-[1em]" style={textStyle}>
                        {el.content || ''}
                      </span>
                    </div>
                  );
                })()
              ) : el.type === 'block' ? (
                <div
                  className="w-full h-full rounded bg-amber-500/20 border border-amber-600/40"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(245,158,11,0.12) 6px, rgba(245,158,11,0.12) 12px)',
                  }}
                />
              ) : (
                el.content && (
                  <img
                    src={`/files/${el.content}/thumbnail?w=80`} loading="lazy"
                    alt=""
                    className="w-full h-full"
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
    </button>
  );
}

export default function DocumentPagesStrip({
  pages,
  templates,
  currentPageIndex,
  onPageSelect,
  onAddPage,
  onReorderPages,
  onDeletePage,
  onDuplicatePage,
}: DocumentPagesStripProps) {
  const canDelete = typeof onDeletePage === 'function' && pages.length > 1;
  const canDuplicate = typeof onDuplicatePage === 'function';
  const canReorder = typeof onReorderPages === 'function' && pages.length > 1;
  const [dragPageIndex, setDragPageIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!canReorder) return;
    setDragPageIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.setData('application/x-page-index', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!canReorder || dragPageIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    setDragPageIndex(null);
    if (!onReorderPages || dragPageIndex === null) return;
    const fromIndex = dragPageIndex;
    if (fromIndex !== toIndex) onReorderPages(fromIndex, toIndex);
  };

  const handleDragEnd = () => {
    setDragPageIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="w-36 flex flex-col bg-gray-50/80 border-r border-gray-200 overflow-y-auto py-3 gap-2 flex-shrink-0">
      {pages.map((page, i) => {
        const template = templates.find((t) => t.id === (page.template_id ?? ''));
        const backgroundUrl = template?.background_file_id
          ? `/files/${template.background_file_id}/thumbnail?w=200`
          : null;
        const isDragging = dragPageIndex === i;
        const isDropTarget = dragOverIndex === i;
        return (
          <div
            key={i}
            draggable={canReorder}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            className={`px-2 relative group transition-colors rounded-lg ${
              canReorder ? 'cursor-grab active:cursor-grabbing' : ''
            } ${isDropTarget ? 'ring-2 ring-brand-red/50 ring-inset bg-brand-red/5 rounded-lg' : ''} ${isDragging ? 'opacity-50' : ''}`}
          >
            <PageThumbnail
              page={page}
              backgroundUrl={backgroundUrl}
              isSelected={currentPageIndex === i}
              onClick={() => onPageSelect(i)}
            />
            <div className="flex items-center justify-center gap-0.5 mt-0.5">
              <span className="text-center text-[10px] text-gray-500 font-medium flex-1">
                {i === 0 ? 'Cover' : i + 1}
              </span>
              {canDuplicate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicatePage?.(i);
                  }}
                  className="p-0.5 rounded text-gray-400 hover:text-brand-red hover:bg-brand-red/10"
                  aria-label="Duplicate page"
                  title="Duplicate page"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m8 0h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2m-4-4h8" />
                  </svg>
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePage?.(i);
                  }}
                  className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                  aria-label="Delete page"
                  title="Delete page"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        );
      })}
      {onAddPage != null && (
        <button
          type="button"
          onClick={onAddPage}
          className="mx-2 mt-1 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 hover:border-brand-red hover:bg-brand-red/5 text-gray-500 hover:text-brand-red transition-colors py-4"
        >
          <span className="text-lg font-light">+</span>
          <span className="sr-only">Add page</span>
        </button>
      )}
    </div>
  );
}
