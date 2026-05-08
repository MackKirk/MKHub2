import { withFileAccessToken } from '@/lib/api';
import { useEffect, useRef, useState } from 'react';
import type { DocumentPage, DocElement, PageMargins } from '@/types/documentCreator';
import {
  editorSidePanelBodyClass,
  editorSidePanelCollapsedRailButtonClass,
  editorSidePanelCollapsedRailCaptionClass,
  editorSidePanelCollapsedRailLeftClass,
  editorSidePanelCollapseToggleClass,
  editorSidePanelHeaderClass,
  editorSidePanelHeadingMetaClass,
  editorSidePanelHeadingTitleClass,
  editorSidePanelRootLeftClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';
import { ChevronLeftIcon, ChevronRightIcon, MiniPagesStackGlyph } from '@/components/document-editor/documentEditorIcons';
import {
  BLOCK_PROTECTED_BG,
  MARGIN_PROTECTED_BG,
  blockProtectedBorderClass,
  marginBandRingClass,
} from '@/components/document-editor/documentProtectedVisuals';

const A4_ASPECT = 210 / 297;
// Keep thumbnails visually consistent with the main editor scaling.
const REFERENCE_CANVAS_WIDTH_PX = 910;

type Template = { id: string; name: string; background_file_id?: string; margins?: PageMargins | null };

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
  /** When true, only a narrow rail with an expand control is shown. */
  collapsed?: boolean;
  /** Toggle between collapsed rail and full Pages strip (requires `collapsed`). */
  onToggleCollapsed?: () => void;
};

const defaultMargins: PageMargins = { left_pct: 0, right_pct: 0, top_pct: 0, bottom_pct: 0 };

function PageThumbnail({
  page,
  templates,
  backgroundUrl,
  isSelected,
  onClick,
}: {
  page: DocumentPage;
  templates: Template[];
  backgroundUrl: string | null;
  isSelected: boolean;
  onClick: () => void;
}) {
  const elements = page.elements ?? [];
  const tmpl = templates.find((t) => t.id === (page.template_id ?? ''));
  /** Same merge as DocumentEditor `effectiveMargins` per page */
  const marginOverlay: PageMargins = {
    ...defaultMargins,
    ...tmpl?.margins,
    ...page.margins,
  };
  const showMarginBands =
    (marginOverlay.left_pct ?? 0) > 0 ||
    (marginOverlay.right_pct ?? 0) > 0 ||
    (marginOverlay.top_pct ?? 0) > 0 ||
    (marginOverlay.bottom_pct ?? 0) > 0;
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
      className={`relative w-full flex-shrink-0 overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm transition-[box-shadow,border-color,transform] duration-200 ease-out ${
        isSelected
          ? 'border-brand-red/45 shadow-md ring-1 ring-brand-red/20'
          : 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md'
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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white to-slate-100" />
        )}
        {showMarginBands ? (
          <>
            {(marginOverlay.left_pct ?? 0) > 0 && (
              <div
                className={`pointer-events-none absolute inset-y-0 left-0 rounded-l-lg ${marginBandRingClass}`}
                style={{
                  width: `${marginOverlay.left_pct}%`,
                  background: MARGIN_PROTECTED_BG,
                }}
              />
            )}
            {(marginOverlay.right_pct ?? 0) > 0 && (
              <div
                className={`pointer-events-none absolute inset-y-0 right-0 rounded-r-lg ${marginBandRingClass}`}
                style={{
                  width: `${marginOverlay.right_pct}%`,
                  background: MARGIN_PROTECTED_BG,
                }}
              />
            )}
            {(marginOverlay.top_pct ?? 0) > 0 && (
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 rounded-t-lg ${marginBandRingClass}`}
                style={{
                  height: `${marginOverlay.top_pct}%`,
                  background: MARGIN_PROTECTED_BG,
                }}
              />
            )}
            {(marginOverlay.bottom_pct ?? 0) > 0 && (
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg ${marginBandRingClass}`}
                style={{
                  height: `${marginOverlay.bottom_pct}%`,
                  background: MARGIN_PROTECTED_BG,
                }}
              />
            )}
          </>
        ) : null}
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
                  className={`h-full w-full rounded-sm ${blockProtectedBorderClass}`}
                  style={{ background: BLOCK_PROTECTED_BG }}
                />
              ) : (
                el.content && (
                  <img
                    src={withFileAccessToken(`/files/${el.content}/thumbnail?w=80`)} loading="lazy"
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
  collapsed,
  onToggleCollapsed,
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

  const pagesMeta = canReorder ? 'Drag to reorder' : 'Tap to select';

  if (collapsed && onToggleCollapsed) {
    return (
      <div className={editorSidePanelCollapsedRailLeftClass}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={editorSidePanelCollapsedRailButtonClass}
          title="Expand Pages"
          aria-expanded={false}
          aria-label="Expand Pages panel"
        >
          <ChevronRightIcon className="h-4 w-4 shrink-0 opacity-90" />
          <MiniPagesStackGlyph className="h-9 w-6 shrink-0 text-slate-400" />
          <span aria-hidden className={`${editorSidePanelCollapsedRailCaptionClass} mt-0.5`}>Pages</span>
        </button>
      </div>
    );
  }

  return (
    <div className={editorSidePanelRootLeftClass}>
      <div className={`${editorSidePanelHeaderClass} flex flex-col gap-0`}>
        <div className="flex items-start gap-1">
          {onToggleCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={`${editorSidePanelCollapseToggleClass} shrink-0`}
              title="Collapse Pages"
              aria-expanded={true}
              aria-label="Collapse Pages panel"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1 text-right">
            <div className={`${editorSidePanelHeadingTitleClass} !text-right`}>Pages</div>
            <p className={`${editorSidePanelHeadingMetaClass} !text-right`}>{pagesMeta}</p>
          </div>
        </div>
      </div>
      <div className={`${editorSidePanelBodyClass} flex flex-col gap-2`}>
      {pages.map((page, i) => {
        const template = templates.find((t) => t.id === (page.template_id ?? ''));
        const backgroundUrl = template?.background_file_id
          ? withFileAccessToken(`/files/${template.background_file_id}/thumbnail?w=200`)
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
            className={`group relative rounded-lg px-0.5 transition-colors duration-200 ${
              canReorder ? 'cursor-grab active:cursor-grabbing' : ''
            } ${isDropTarget ? 'rounded-lg bg-brand-red/[0.08] ring-1 ring-inset ring-brand-red/30' : ''} ${isDragging ? 'opacity-50' : ''}`}
          >
            <PageThumbnail
              page={page}
              templates={templates}
              backgroundUrl={backgroundUrl}
              isSelected={currentPageIndex === i}
              onClick={() => onPageSelect(i)}
            />
            <div className="mt-1 flex items-center justify-center gap-1">
              <span className="flex-1 text-center text-[10px] font-semibold tabular-nums text-slate-400">
                {i === 0 ? 'Cover' : i + 1}
              </span>
              {canDuplicate && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicatePage?.(i);
                  }}
                  className="rounded-md p-1 text-slate-400 transition-[color,background-color] duration-200 hover:bg-slate-100 hover:text-slate-700"
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
                  className="rounded-md p-1 text-slate-400 transition-[color,background-color] duration-200 hover:bg-red-50 hover:text-red-600"
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
          className="flex items-center justify-center rounded-lg border border-dashed border-slate-300/90 py-2.5 text-slate-500 transition-[border-color,background-color,color] duration-200 ease-out hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700"
        >
          <span className="text-lg font-light">+</span>
          <span className="sr-only">Add page</span>
        </button>
      )}
      </div>
    </div>
  );
}
