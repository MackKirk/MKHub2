import { useEffect, useRef, useState } from 'react';
import { withFileAccessToken } from '@/lib/api';
import type { DocumentPage, DocElement, RichTextRun } from '@/types/documentCreator';
import { isInlineAtomRun } from '@/types/documentCreator';
import { docElementRotationDeg, docElementRotateStyle } from '@/utils/documentElementGeometry';

const A4_ASPECT = 210 / 297;
const DEFAULT_THUMB_WIDTH_PX = 48;
const REFERENCE_CANVAS_WIDTH_PX = 910;

type Template = { id: string; name?: string; background_file_id?: string };

function contentLines(content: string | null | undefined): string[] {
  return (content ?? '').replace(/\r\n/g, '\n').split('\n');
}

function runsText(runs: RichTextRun[]): string {
  return runs.map((r) => r.text).join('');
}

function textRunsFromElement(el: DocElement): RichTextRun[][] {
  if (el.richLines?.length && el.richLines.some((line) => runsText(line).trim())) {
    return el.richLines;
  }
  return contentLines(el.content).map((line) => [{ text: line }]);
}

function runPreviewStyle(run: RichTextRun, elementFontSize: number): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (run.bold !== undefined) s.fontWeight = run.bold ? 'bold' : 'normal';
  if (run.italic !== undefined) s.fontStyle = run.italic ? 'italic' : 'normal';
  if (run.fontSize !== undefined && run.fontSize !== elementFontSize) {
    s.fontSize = `${(run.fontSize / Math.max(1, elementFontSize)).toFixed(4)}em`;
  }
  if (run.color !== undefined) s.color = run.color;
  if (run.fontFamily !== undefined) {
    s.fontFamily = run.fontFamily === 'Open Sans' ? '"Open Sans", sans-serif' : '"Montserrat", sans-serif';
  }
  return s;
}

function PreviewTextElement({ el }: { el: DocElement }) {
  const refFontSize = Math.max(8, Math.min(72, el.fontSize ?? 12));
  const va = el.verticalAlign ?? 'top';
  const justifyContent = va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';
  const lineRuns = textRunsFromElement(el);
  const baseStyle: React.CSSProperties = {
    fontSize: `${refFontSize}px`,
    textAlign: el.textAlign ?? 'left',
    fontWeight: el.fontWeight ?? 'normal',
    fontStyle: el.fontStyle ?? 'normal',
    fontFamily: el.fontFamily === 'Open Sans' ? '"Open Sans", sans-serif' : '"Montserrat", sans-serif',
    color: el.color ?? '#000000',
    lineHeight: 1.25,
  };

  return (
    <div className="h-full w-full overflow-hidden" style={{ display: 'flex', flexDirection: 'column', justifyContent }}>
      {lineRuns.map((runs, lineIdx) => {
        const lineAlign = el.lineTextAligns?.[lineIdx] ?? el.textAlign ?? 'left';
        return (
          <div
            key={lineIdx}
            className="whitespace-pre-wrap break-words"
            style={{ ...baseStyle, textAlign: lineAlign, minHeight: `${refFontSize * 1.25}px` }}
          >
            {runs.map((run, runIdx) => {
              if (isInlineAtomRun(run)) {
                const w = run.atomWidthPx ?? 120;
                const h = run.atomHeightPx ?? Math.round(refFontSize * 2.5);
                return (
                  <span
                    key={runIdx}
                    className="inline-block align-middle rounded border border-gray-300 bg-gray-100/90"
                    style={{ width: w, height: h, margin: '0 2px' }}
                  />
                );
              }
              return (
                <span key={runIdx} style={runPreviewStyle(run, refFontSize)}>
                  {run.text}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function ScaledPagePreview({
  page,
  backgroundUrl,
  thumbWidthPx,
  fillWidth = false,
  className,
}: {
  page: DocumentPage;
  backgroundUrl: string | null;
  thumbWidthPx: number;
  fillWidth?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(thumbWidthPx);

  useEffect(() => {
    if (!fillWidth) {
      setMeasuredWidth(thumbWidthPx);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const update = () => setMeasuredWidth(el.getBoundingClientRect().width || thumbWidthPx);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fillWidth, thumbWidthPx]);

  const scale = measuredWidth / REFERENCE_CANVAS_WIDTH_PX;
  const refHeight = REFERENCE_CANVAS_WIDTH_PX / A4_ASPECT;
  const elements = page.elements ?? [];

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden bg-white ${fillWidth ? 'w-full' : 'flex-shrink-0'} ${className ?? ''}`}
      style={{
        aspectRatio: `${A4_ASPECT}`,
        ...(fillWidth ? {} : { width: thumbWidthPx }),
      }}
    >
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width: REFERENCE_CANVAS_WIDTH_PX,
          height: refHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-gray-100" />
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
                ...docElementRotateStyle(docElementRotationDeg(el.rotation)),
              }}
            >
              {el.type === 'text' ? (
                <PreviewTextElement el={el} />
              ) : el.type === 'block' ? (
                <div
                  className="h-full w-full rounded-sm border border-amber-600/40 bg-amber-500/20"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(245,158,11,0.15) 2px, rgba(245,158,11,0.15) 4px)',
                  }}
                />
              ) : el.type === 'initials' || el.type === 'date' ? (
                <div className="h-full w-full rounded-sm border border-sky-500/50 bg-sky-400/30" />
              ) : el.content ? (
                <img
                  src={withFileAccessToken(`/files/${el.content}/thumbnail?w=256`)}
                  loading="lazy"
                  alt=""
                  className="h-full w-full"
                  style={{
                    objectFit: el.imageFit ?? 'contain',
                    objectPosition: el.imagePosition ?? '50% 50%',
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type DocumentPagePreviewThumbnailsProps = {
  pages: DocumentPage[];
  templates: Template[];
  /** Max number of page thumbnails to show. Default 4. */
  maxPages?: number;
  /** Width of each page thumbnail in pixels. Default 48. Ignored when fillWidth is true. */
  thumbWidthPx?: number;
  /** When true, each thumb stretches to the container width (uses aspect ratio). */
  fillWidth?: boolean;
};

/**
 * Horizontal row of small page thumbnails for document list preview.
 * Used in ProjectDocumentsTab to give a quick visual of each document.
 */
export function DocumentPagePreviewThumbnails({
  pages,
  templates,
  maxPages = 4,
  thumbWidthPx = DEFAULT_THUMB_WIDTH_PX,
  fillWidth = false,
}: DocumentPagePreviewThumbnailsProps) {
  const safePages = Array.isArray(pages) ? pages : [];
  const toShow = safePages.slice(0, maxPages);
  if (toShow.length === 0) {
    return (
      <div
        className="flex flex-shrink-0 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-[10px] text-gray-400"
        style={{ width: thumbWidthPx, aspectRatio: `${A4_ASPECT}` }}
      >
        —
      </div>
    );
  }
  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      {toShow.map((page, i) => {
        const template = templates.find((t) => t.id === (page.template_id ?? ''));
        const backgroundUrl = template?.background_file_id
          ? withFileAccessToken(`/files/${template.background_file_id}/thumbnail?w=512`)
          : null;
        return (
          <ScaledPagePreview
            key={i}
            page={page as DocumentPage}
            backgroundUrl={backgroundUrl}
            thumbWidthPx={thumbWidthPx}
            fillWidth={fillWidth}
            className="rounded border border-gray-200 shadow-sm"
          />
        );
      })}
    </div>
  );
}

type DocumentPagePreviewGridProps = {
  pages: DocumentPage[];
  templates: Template[];
  /** Max pages to render. Default: all pages. */
  maxPages?: number;
  columns?: 2 | 3;
  thumbWidthPx?: number;
  className?: string;
};

/** Grid of page previews that fill each cell — similar to template picker cards. */
export function DocumentPagePreviewGrid({
  pages,
  templates,
  maxPages,
  columns = 2,
  thumbWidthPx = 160,
  className,
}: DocumentPagePreviewGridProps) {
  const safePages = Array.isArray(pages) ? pages : [];
  const toShow = maxPages != null ? safePages.slice(0, maxPages) : safePages;
  if (toShow.length === 0) return null;

  const gridCols = columns === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className={`grid ${gridCols} w-full content-start gap-2 ${className ?? ''}`}>
      {toShow.map((page, i) => {
        const template = templates.find((t) => t.id === (page.template_id ?? ''));
        const backgroundUrl = template?.background_file_id
          ? withFileAccessToken(`/files/${template.background_file_id}/thumbnail?w=512`)
          : null;
        return (
          <ScaledPagePreview
            key={i}
            page={page as DocumentPage}
            backgroundUrl={backgroundUrl}
            thumbWidthPx={thumbWidthPx}
            fillWidth
            className="rounded border border-gray-200 shadow-sm"
          />
        );
      })}
    </div>
  );
}

export { A4_ASPECT, ScaledPagePreview };
