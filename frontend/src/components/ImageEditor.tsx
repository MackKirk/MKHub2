import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api, withFileAccessToken } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import { uiCx, uiModalLayer } from '@/components/ui/tokens';
import { AppCheckbox } from '@/components/ui';
import DocumentEditorFontColorPicker from '@/components/document-editor/DocumentEditorFontColorPicker';
import {
  editorCaptionClass,
  editorGroupLabelClass,
  editorPanelTitleClass,
  editorTransitionInteractive,
  selectionToolButtonGhostClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';
import {
  applyShapeFill,
  circleGeometryFromItem,
  hexToRgba,
  SHAPE_FILL_PATTERNS,
  type ShapeFillPattern,
} from '@/components/imageEditorShapeFill';
import { ROTATE_CURSOR } from '@/utils/documentElementGeometry';

function ShapeFillPatternIcon({
  pattern,
  color = '#64748b',
  className = 'h-5 w-5',
}: {
  pattern: ShapeFillPattern;
  color?: string;
  className?: string;
}) {
  const stroke = color || '#64748b';
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <defs>
        <clipPath id={`shape-fill-clip-${pattern}`}>
          <rect x="3" y="3" width="14" height="14" rx="1" />
        </clipPath>
      </defs>
      <rect x="1.5" y="1.5" width="17" height="17" rx="2" fill="none" stroke="#cbd5e1" strokeWidth="1" />
      <g clipPath={`url(#shape-fill-clip-${pattern})`}>
        {pattern === 'solid' && (
          <rect x="3" y="3" width="14" height="14" rx="1" fill={stroke} opacity={0.55} />
        )}
        {pattern === 'hatch-horiz' &&
          [4, 8, 12, 16].map((y) => (
            <rect key={y} x="3" y={y} width="14" height="2" fill={stroke} opacity={0.65} />
          ))}
        {pattern === 'hatch-vert' &&
          [4, 8, 12, 16].map((x) => (
            <rect key={x} x={x} y="3" width="2" height="14" fill={stroke} opacity={0.65} />
          ))}
        {pattern === 'hatch-cross' && (
          <>
            {[4, 8, 12, 16].map((y) => (
              <rect key={`h${y}`} x="3" y={y} width="14" height="2" fill={stroke} opacity={0.55} />
            ))}
            {[4, 8, 12, 16].map((x) => (
              <rect key={`v${x}`} x={x} y="3" width="2" height="14" fill={stroke} opacity={0.55} />
            ))}
          </>
        )}
        {pattern === 'hatch-diag' &&
          [-2, 2, 6, 10, 14, 18].map((i) => (
            <polygon
              key={i}
              points={`${3 + i},3 ${17 + i},17 ${16 + i},17 ${2 + i},3`}
              fill={stroke}
              opacity={0.65}
            />
          ))}
        {pattern === 'hatch-diag-rev' &&
          [2, 6, 10, 14, 18, 22].map((i) => (
            <polygon
              key={i}
              points={`${i},3 ${i - 14},17 ${i - 15},17 ${i - 1},3`}
              fill={stroke}
              opacity={0.65}
            />
          ))}
      </g>
    </svg>
  );
}

const toolBtnBase = `${editorTransitionInteractive} flex items-center justify-center rounded-lg border px-2 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35`;
const toolBtnIdle = `${toolBtnBase} border-transparent bg-slate-100/95 text-slate-800 hover:bg-slate-200/90 active:scale-[0.98]`;
const toolBtnActive = `${toolBtnBase} border-brand-red/25 bg-brand-red text-white shadow-sm hover:bg-red-700 active:scale-[0.98]`;

/** UI zoom is relative to the scale that fits the whole image in the canvas. */
const EDITOR_ZOOM_MIN = 1;
const EDITOR_ZOOM_MAX = 6;

function computeEditorFitScale(
  canvasW: number,
  canvasH: number,
  imageW: number,
  imageH: number,
  angleDeg: number,
): number {
  if (!canvasW || !canvasH || !imageW || !imageH) return 1;
  const r = (((Math.round(angleDeg / 90) * 90) % 360) + 360) % 360;
  const boxW = r === 90 || r === 270 ? imageH : imageW;
  const boxH = r === 90 || r === 270 ? imageW : imageH;
  return Math.min(canvasW / boxW, canvasH / boxH);
}

// Custom slider styles and icon rendering improvements
const sliderStyle = `
  img[src*="/ui/assets/icons/"] {
    image-rendering: auto;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  .custom-slider {
    -webkit-appearance: none;
    appearance: none;
    flex: 1 1 0%;
    min-width: 0;
    height: 6px;
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }
  
  .custom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #6b7280;
    cursor: pointer;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    position: relative;
    z-index: 1;
  }
  
  .custom-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #6b7280;
    cursor: pointer;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    position: relative;
    z-index: 1;
  }
  
  .custom-slider-container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  
  .custom-slider-value {
    background: #6b7280;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    line-height: 1.2;
    flex-shrink: 0;
  }
`;

// Icon paths - using ui/assets/icons (served by backend)
// Adding cache-busting query parameter to force reload
const iconCacheBuster = `?v=${Date.now()}`;
const selectIcon = `/ui/assets/icons/select.png${iconCacheBuster}`;
const rectIcon = `/ui/assets/icons/rec.png${iconCacheBuster}`;
const arrowIcon = `/ui/assets/icons/arrow.png${iconCacheBuster}`;
const textIcon = `/ui/assets/icons/text.png${iconCacheBuster}`;
const circleIcon = `/ui/assets/icons/circ.png${iconCacheBuster}`;
const pencilIcon = `/ui/assets/icons/pencil2.png${iconCacheBuster}`;
const pencilCursorIcon = `/ui/assets/icons/pencil-cursor.png${iconCacheBuster}`;
const deleteIcon = `/ui/assets/icons/del.png${iconCacheBuster}`;
const saveIcon = `/ui/assets/icons/save.png${iconCacheBuster}`;

const POLYGON_SNAP_RADIUS = 10;

function PolygonToolIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Placed segments */}
      <path d="M4 17V9l7-4 7 6" />
      {/* Rubber-band preview to next point */}
      <path d="M18 11l3-4" strokeDasharray="2.5 2.5" opacity="0.55" />
      {/* Vertex anchors */}
      <circle cx="4" cy="17" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="4" cy="9" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="11" cy="5" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="18" cy="11" r="1.75" fill="currentColor" stroke="none" />
      <circle cx="21" cy="7" r="1.25" fill="currentColor" stroke="none" opacity="0.55" />
    </svg>
  );
}

type AnnotationItem = {
  id: string;
  type: 'rect' | 'arrow' | 'text' | 'circle' | 'path' | 'polygon';
  x: number;
  y: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  r?: number;
  rx?: number; // For ellipses
  ry?: number; // For ellipses
  points?: { x: number; y: number }[];
  closed?: boolean;
  text?: string;
  color: string;
  stroke: number;
  fontSize?: number;
  _editing?: boolean;
  cursorPosition?: number; // Position of cursor in text (character index)
  selectionStart?: number;
  selectionEnd?: number;
  textBackgroundEnabled?: boolean;
  textBackgroundColor?: string;
  textBackgroundOpacity?: number;
  /** Fill for rect/circle (independent of stroke color). */
  fillEnabled?: boolean;
  fillColor?: string;
  fillOpacity?: number;
  fillPattern?: ShapeFillPattern;
  /** Degrees, around the item's axis-aligned bounding-box center. */
  rotation?: number;
};

type AnnotationBounds = { x: number; y: number; w: number; h: number };

const TEXT_BOX_PADDING = 4;

/** Smallest text box that still shows one line and a few typed characters. */
function minTextBoxSize(fontPx: number): { w: number; h: number } {
  const fs = Math.max(8, fontPx || 16);
  return {
    w: Math.ceil(TEXT_BOX_PADDING * 2 + fs * 3.2),
    h: Math.ceil(TEXT_BOX_PADDING * 2 + fs * 1.45),
  };
}

/** Visual size of resize handles — smaller on tiny boxes so content stays visible. */
function getHandleVisualSize(bb: AnnotationBounds): number {
  const base = 6;
  const clamped = Math.min(8, Math.max(4, base));
  return Math.min(clamped, Math.max(4, 0.25 * Math.min(Math.abs(bb.w), Math.abs(bb.h))));
}

/** Hit area slightly larger than visual handles for easier grabbing. */
function getHandleHitSize(bb: AnnotationBounds): number {
  return getHandleVisualSize(bb) + 4;
}

function getResizeHandlePoints(bb: AnnotationBounds): { x: number; y: number; name: string }[] {
  return [
    { x: bb.x, y: bb.y, name: 'nw' },
    { x: bb.x + bb.w / 2, y: bb.y, name: 'n' },
    { x: bb.x + bb.w, y: bb.y, name: 'ne' },
    { x: bb.x + bb.w, y: bb.y + bb.h / 2, name: 'e' },
    { x: bb.x + bb.w, y: bb.y + bb.h, name: 'se' },
    { x: bb.x + bb.w / 2, y: bb.y + bb.h, name: 's' },
    { x: bb.x, y: bb.y + bb.h, name: 'sw' },
    { x: bb.x, y: bb.y + bb.h / 2, name: 'w' },
  ];
}

const ROTATE_HANDLE_OFFSET = 18;
const ROTATE_HANDLE_RADIUS = 5;

function annotationRotationDeg(it: AnnotationItem): number {
  const r = it.rotation;
  return typeof r === 'number' && Number.isFinite(r) ? r : 0;
}

function rotatePointAround(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number,
): { x: number; y: number } {
  if (!deg) return { x, y };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

function boundsCenter(bb: AnnotationBounds): { cx: number; cy: number } {
  return { cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2 };
}

function worldToLocalPoint(
  x: number,
  y: number,
  bb: AnnotationBounds,
  rotationDeg: number,
): { x: number; y: number } {
  const { cx, cy } = boundsCenter(bb);
  return rotatePointAround(x, y, cx, cy, -rotationDeg);
}

function applyAnnotationRotation(
  ctx: CanvasRenderingContext2D,
  bb: AnnotationBounds,
  rotationDeg: number,
) {
  if (!rotationDeg) return;
  const { cx, cy } = boundsCenter(bb);
  ctx.translate(cx, cy);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

function getRotationHandleLocal(bb: AnnotationBounds): { x: number; y: number } {
  return { x: bb.x + bb.w / 2, y: bb.y - ROTATE_HANDLE_OFFSET };
}

function getRotatedAabb(bb: AnnotationBounds, rotationDeg: number): AnnotationBounds {
  if (!rotationDeg) return bb;
  const { cx, cy } = boundsCenter(bb);
  const corners = [
    rotatePointAround(bb.x, bb.y, cx, cy, rotationDeg),
    rotatePointAround(bb.x + bb.w, bb.y, cx, cy, rotationDeg),
    rotatePointAround(bb.x + bb.w, bb.y + bb.h, cx, cy, rotationDeg),
    rotatePointAround(bb.x, bb.y + bb.h, cx, cy, rotationDeg),
  ];
  let minX = corners[0].x;
  let minY = corners[0].y;
  let maxX = corners[0].x;
  let maxY = corners[0].y;
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function oppositeHandleAnchor(bb: AnnotationBounds, handle: string): { x: number; y: number } {
  const { cx, cy } = boundsCenter(bb);
  switch (handle) {
    case 'e':
      return { x: bb.x, y: cy };
    case 'w':
      return { x: bb.x + bb.w, y: cy };
    case 'n':
      return { x: cx, y: bb.y + bb.h };
    case 's':
      return { x: cx, y: bb.y };
    case 'ne':
      return { x: bb.x, y: bb.y + bb.h };
    case 'nw':
      return { x: bb.x + bb.w, y: bb.y + bb.h };
    case 'se':
      return { x: bb.x, y: bb.y };
    case 'sw':
      return { x: bb.x + bb.w, y: bb.y };
    default:
      return { x: cx, y: cy };
  }
}

function shiftToKeepHandleAnchor(
  oldBb: AnnotationBounds,
  newBb: AnnotationBounds,
  handle: string,
  rotationDeg: number,
): { x: number; y: number } {
  if (!rotationDeg) return { x: 0, y: 0 };
  const oldA = oppositeHandleAnchor(oldBb, handle);
  const newA = oppositeHandleAnchor(newBb, handle);
  const oldC = boundsCenter(oldBb);
  const newC = boundsCenter(newBb);
  const oldW = rotatePointAround(oldA.x, oldA.y, oldC.cx, oldC.cy, rotationDeg);
  const newW = rotatePointAround(newA.x, newA.y, newC.cx, newC.cy, rotationDeg);
  return { x: oldW.x - newW.x, y: oldW.y - newW.y };
}

function resizeCursorForHandle(handle: string, rotationDeg: number): string {
  if (handle === 'rotate') return ROTATE_CURSOR;
  const order = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const cursors = [
    'nwse-resize',
    'ns-resize',
    'nesw-resize',
    'ew-resize',
    'nwse-resize',
    'ns-resize',
    'nesw-resize',
    'ew-resize',
  ];
  const idx = order.indexOf(handle);
  if (idx < 0) return 'default';
  const steps = Math.round(((((rotationDeg % 360) + 360) % 360) / 45)) % 8;
  return cursors[(idx + steps) % 8];
}

/** Arrow shaft stops at the head base so the stroke does not protrude past the tip. */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const head = 10 + strokeWidth * 2;
  const baseX = x2 - ux * head;
  const baseY = y2 - uy * head;

  const prevCap = ctx.lineCap;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  if (len > head) {
    ctx.lineTo(baseX, baseY);
  } else {
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.lineCap = prevCap;

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(baseX - uy * head * 0.5, baseY + ux * head * 0.5);
  ctx.lineTo(baseX + uy * head * 0.5, baseY - ux * head * 0.5);
  ctx.closePath();
  ctx.fill();
}

function strokePolygonPath(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  closed: boolean,
) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (closed) ctx.closePath();
  ctx.stroke();
}

function drawPolygonAnnotation(
  ctx: CanvasRenderingContext2D,
  it: AnnotationItem,
  fillDefaults: {
    fillEnabled: boolean;
    fillColor: string;
    fillOpacity: number;
    fillPattern: ShapeFillPattern;
    scale?: number;
  },
  preview?: { x: number; y: number } | null,
) {
  const pts = it.points || [];
  if (pts.length < 1) return;

  const closed = !!it.closed;
  if (closed && pts.length >= 3) {
    const enabled = it.fillEnabled !== undefined ? it.fillEnabled : fillDefaults.fillEnabled;
    applyShapeFill(
      ctx,
      { kind: 'polygon', points: pts },
      {
        enabled,
        color: it.fillColor || fillDefaults.fillColor,
        opacity: it.fillOpacity !== undefined ? it.fillOpacity : fillDefaults.fillOpacity,
        pattern: it.fillPattern || fillDefaults.fillPattern,
        scale: fillDefaults.scale,
      },
    );
  }

  ctx.strokeStyle = it.color;
  ctx.lineWidth = it.stroke;
  if (pts.length >= 2) {
    strokePolygonPath(ctx, pts, closed);
  }

  if (preview && pts.length >= 1 && !closed) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    const nearFirst =
      pts.length >= 3 && Math.hypot(preview.x - first.x, preview.y - first.y) <= POLYGON_SNAP_RADIUS;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = it.color;
    ctx.lineWidth = it.stroke;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(nearFirst ? first.x : preview.x, nearFirst ? first.y : preview.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const vertexRadius = 4;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const isFirst = i === 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isFirst && nearFirst ? vertexRadius + 2 : vertexRadius, 0, Math.PI * 2);
      ctx.fillStyle = isFirst ? '#d11616' : it.color;
      ctx.fill();
      if (isFirst) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

type ImageEditorProps = {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName?: string;
  fileObjectId?: string;
  onSave: (blob: Blob) => Promise<void>;
  targetWidth?: number;
  targetHeight?: number;
  editorScaleFactor?: number;
  overlayClassName?: string;
  /** When set (e.g. from ImagePicker), outer dialog matches this size; canvas scales to fit. */
  matchDialogSize?: { width: number; height: number } | null;
};

export default function ImageEditor({
  isOpen,
  onClose,
  imageUrl,
  imageName = 'image',
  fileObjectId,
  onSave,
  targetWidth,
  targetHeight,
  editorScaleFactor = 2.5,
  overlayClassName,
  matchDialogSize = null,
}: ImageEditorProps) {
  const [mode, setMode] = useState<'pan' | 'rect' | 'arrow' | 'text' | 'circle' | 'draw' | 'polygon' | 'select' | 'delete'>('select');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [angle, setAngle] = useState(0);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  
  // Sync refs with state
  useEffect(() => {
    offsetXRef.current = offsetX;
    offsetYRef.current = offsetY;
    scaleRef.current = scale;
  }, [offsetX, offsetY, scale]);
  const [items, setItems] = useState<AnnotationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [textColor, setTextColor] = useState('#000000');
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [stroke, setStroke] = useState(3);
  const [fontSize, setFontSize] = useState(16);
  const [text, setText] = useState('');
  const [textBackgroundEnabled, setTextBackgroundEnabled] = useState(true);
  const [textBackgroundColor, setTextBackgroundColor] = useState('#efefef');
  const [textBackgroundOpacity, setTextBackgroundOpacity] = useState(0.8);
  const [fillEnabled, setFillEnabled] = useState(false);
  const [fillColor, setFillColor] = useState('#000000');
  const [fillOpacity, setFillOpacity] = useState(0.4);
  const [fillPattern, setFillPattern] = useState<ShapeFillPattern>('solid');
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const cursorVisibleRef = useRef(true);
  const cursorBlinkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const draggingRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const drawingRef = useRef<AnnotationItem | null>(null);
  const polygonPreviewRef = useRef<{ x: number; y: number } | null>(null);
  const movingRef = useRef<{ item: AnnotationItem; startX: number; startY: number } | null>(null);
  const resizingRef = useRef<{ item: AnnotationItem; handle: string; startX: number; startY: number; startW?: number; startH?: number; startR?: number; startRx?: number; startRy?: number; startX2?: number; startY2?: number } | null>(null);
  const rotatingRef = useRef<{
    item: AnnotationItem;
    cx: number;
    cy: number;
    startRotation: number;
    startPointerAngle: number;
  } | null>(null);
  const marqueeRef = useRef<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const textEditingRef = useRef<string | null>(null);
  const textCursorPositionRef = useRef<number>(0); // Current cursor/caret position
  const textSelectionStartRef = useRef<number | null>(null); // Selection start (null = no selection)
  const textSelectingRef = useRef<boolean>(false); // mouse-drag selection flag
  const loadedFileIdRef = useRef<string | null>(null);
  const loadingRef = useRef<boolean>(false);
  const offsetXRef = useRef<number>(0);
  const offsetYRef = useRef<number>(0);
  const scaleRef = useRef<number>(1);
  const prevAngleRef = useRef(0);
  const blurredBgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blurredBgKeyRef = useRef<string>('');
  const itemsRef = useRef<AnnotationItem[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  const drawOverlayRef = useRef<() => void>(() => {});
  const lastCursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const overlayCursorRef = useRef('grab');

  const isGestureActive = () =>
    !!(
      drawingRef.current ||
      movingRef.current ||
      resizingRef.current ||
      rotatingRef.current ||
      textSelectingRef.current ||
      draggingRef.current ||
      marqueeRef.current
    );

  const stopTextCursorBlink = useCallback(() => {
    if (cursorBlinkRef.current) {
      clearInterval(cursorBlinkRef.current);
      cursorBlinkRef.current = null;
    }
    cursorVisibleRef.current = true;
  }, []);

  const startTextCursorBlink = useCallback(() => {
    stopTextCursorBlink();
    cursorVisibleRef.current = true;
    cursorBlinkRef.current = setInterval(() => {
      cursorVisibleRef.current = !cursorVisibleRef.current;
      drawOverlayRef.current();
    }, 500);
  }, [stopTextCursorBlink]);

  // Keep itemsRef in sync with React state except during live gestures (ref is source of truth then)
  useEffect(() => {
    if (isGestureActive()) return;
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);
  
  // Cleanup cursor blink on unmount
  useEffect(() => {
    return () => {
      if (cursorBlinkRef.current) {
        clearInterval(cursorBlinkRef.current);
      }
    };
  }, []);

  // Update fontSize of selected / editing text when the slider changes (not on selection change)
  const prevFontSizeRef = useRef(fontSize);
  useEffect(() => {
    const changed = prevFontSizeRef.current !== fontSize;
    prevFontSizeRef.current = fontSize;
    if (!changed) return;
    setItems(prev => prev.map(it => {
      if (!it || !it.id) return it;
      if (it.type === 'text' && (it.id === textEditingRef.current || selectedIds.includes(it.id))) {
        return { ...it, fontSize };
      }
      return it;
    }).filter(it => it && it.id));
  }, [fontSize, selectedIds]);

  const prevTextBgEnabledRef = useRef(textBackgroundEnabled);
  const prevTextBgColorRef = useRef(textBackgroundColor);
  const prevTextBgOpacityRef = useRef(textBackgroundOpacity);
  useEffect(() => {
    const changed =
      prevTextBgEnabledRef.current !== textBackgroundEnabled ||
      prevTextBgColorRef.current !== textBackgroundColor ||
      prevTextBgOpacityRef.current !== textBackgroundOpacity;
    prevTextBgEnabledRef.current = textBackgroundEnabled;
    prevTextBgColorRef.current = textBackgroundColor;
    prevTextBgOpacityRef.current = textBackgroundOpacity;
    if (!changed || selectedIds.length === 0) return;
    setItems(prev => prev.map(it => {
      if (!it || !it.id) return it;
      if (selectedIds.includes(it.id) && it.type === 'text') {
        return {
          ...it,
          textBackgroundEnabled,
          textBackgroundColor,
          textBackgroundOpacity
        };
      }
      return it;
    }).filter(it => it && it.id));
  }, [textBackgroundEnabled, textBackgroundColor, textBackgroundOpacity, selectedIds]);

  const prevFillEnabledRef = useRef(fillEnabled);
  const prevFillColorRef = useRef(fillColor);
  const prevFillOpacityRef = useRef(fillOpacity);
  const prevFillPatternRef = useRef(fillPattern);
  useEffect(() => {
    const changed =
      prevFillEnabledRef.current !== fillEnabled ||
      prevFillColorRef.current !== fillColor ||
      prevFillOpacityRef.current !== fillOpacity ||
      prevFillPatternRef.current !== fillPattern;
    prevFillEnabledRef.current = fillEnabled;
    prevFillColorRef.current = fillColor;
    prevFillOpacityRef.current = fillOpacity;
    prevFillPatternRef.current = fillPattern;
    if (!changed || selectedIds.length === 0) return;
    setItems((prev) =>
      prev
        .map((it) => {
          if (!it || !it.id) return it;
          if (
            selectedIds.includes(it.id) &&
            (it.type === 'rect' || it.type === 'circle' || (it.type === 'polygon' && it.closed))
          ) {
            return {
              ...it,
              fillEnabled,
              fillColor,
              fillOpacity,
              fillPattern,
            };
          }
          return it;
        })
        .filter((it) => it && it.id),
    );
  }, [fillEnabled, fillColor, fillOpacity, fillPattern, selectedIds]);

  const selectedAnnotations = selectedIds
    .map((id) => items.find((x) => x?.id === id))
    .filter((it): it is AnnotationItem => !!it && !!it.id);

  const showTextPanel =
    mode === 'text' ||
    (mode === 'select' && selectedAnnotations.some((it) => it.type === 'text'));

  const showShapePanel =
    mode === 'rect' ||
    mode === 'arrow' ||
    mode === 'circle' ||
    mode === 'polygon' ||
    mode === 'draw' ||
    (mode === 'select' && selectedAnnotations.some((it) => it.type !== 'text'));

  const showShapeFillPanel =
    showShapePanel &&
    (mode === 'rect' ||
      mode === 'circle' ||
      mode === 'polygon' ||
      selectedAnnotations.some(
        (it) => it.type === 'rect' || it.type === 'circle' || (it.type === 'polygon' && it.closed),
      ));

  // Track previous colors/stroke to only update when they actually change
  const prevTextColorRef = useRef<string>(textColor);
  const prevStrokeColorRef = useRef<string>(strokeColor);
  const prevStrokeRef = useRef<number>(stroke);
  const prevSelectionForColorSyncRef = useRef<string | null>(null);

  // Update text color of selected text items when textColor changes (not when selection changes)
  useEffect(() => {
    const changed = prevTextColorRef.current !== textColor;
    prevTextColorRef.current = textColor;
    if (!changed || selectedIds.length === 0 || mode !== 'select') return;
    setItems(prev => prev.map(it => {
      if (!it || !it.id) return it;
      if (selectedIds.includes(it.id) && it.type === 'text') {
        return { ...it, color: textColor };
      }
      return it;
    }).filter(it => it && it.id));
  }, [textColor, selectedIds, mode]);

  // Update stroke color of selected non-text items when strokeColor changes
  useEffect(() => {
    const changed = prevStrokeColorRef.current !== strokeColor;
    prevStrokeColorRef.current = strokeColor;
    if (!changed || selectedIds.length === 0 || mode !== 'select') return;
    setItems(prev => prev.map(it => {
      if (!it || !it.id) return it;
      if (selectedIds.includes(it.id) && it.type !== 'text') {
        return { ...it, color: strokeColor };
      }
      return it;
    }).filter(it => it && it.id));
  }, [strokeColor, selectedIds, mode]);

  // Update stroke width of selected items when stroke changes (not when selection changes)
  useEffect(() => {
    const changed = prevStrokeRef.current !== stroke;
    prevStrokeRef.current = stroke;
    if (!changed || selectedIds.length === 0 || mode !== 'select') return;
    setItems(prev => prev.map(it => {
      if (!it || !it.id) return it;
      if (selectedIds.includes(it.id) && it.type !== 'text') {
        return { ...it, stroke };
      }
      return it;
    }).filter(it => it && it.id));
  }, [stroke, selectedIds, mode]);

  // Reflect selected item properties in the visible tool panels
  useEffect(() => {
    const id = selectedIds.length === 1 ? selectedIds[0] : null;
    if (id === prevSelectionForColorSyncRef.current) return;
    prevSelectionForColorSyncRef.current = id;
    if (!id) return;
    const it = items.find((x) => x?.id === id);
    if (!it) return;
    if (it.type === 'text') {
      prevTextColorRef.current = it.color;
      prevFontSizeRef.current = it.fontSize || fontSize;
      prevTextBgEnabledRef.current = it.textBackgroundEnabled !== undefined ? it.textBackgroundEnabled : textBackgroundEnabled;
      prevTextBgColorRef.current = it.textBackgroundColor || textBackgroundColor;
      prevTextBgOpacityRef.current = it.textBackgroundOpacity !== undefined ? it.textBackgroundOpacity : textBackgroundOpacity;
      setTextColor(it.color);
      if (it.fontSize) setFontSize(it.fontSize);
      if (it.textBackgroundEnabled !== undefined) setTextBackgroundEnabled(it.textBackgroundEnabled);
      if (it.textBackgroundColor) setTextBackgroundColor(it.textBackgroundColor);
      if (it.textBackgroundOpacity !== undefined) setTextBackgroundOpacity(it.textBackgroundOpacity);
    } else {
      prevStrokeColorRef.current = it.color;
      prevStrokeRef.current = it.stroke;
      setStrokeColor(it.color);
      setStroke(it.stroke);
      if (it.type === 'rect' || it.type === 'circle' || (it.type === 'polygon' && it.closed)) {
        prevFillEnabledRef.current = it.fillEnabled !== undefined ? it.fillEnabled : fillEnabled;
        prevFillColorRef.current = it.fillColor || fillColor;
        prevFillOpacityRef.current = it.fillOpacity !== undefined ? it.fillOpacity : fillOpacity;
        prevFillPatternRef.current = it.fillPattern || fillPattern;
        if (it.fillEnabled !== undefined) setFillEnabled(it.fillEnabled);
        if (it.fillColor) setFillColor(it.fillColor);
        if (it.fillOpacity !== undefined) setFillOpacity(it.fillOpacity);
        if (it.fillPattern) setFillPattern(it.fillPattern);
      }
    }
  }, [selectedIds, items]);

  // Auto-switch from delete to select when no items are available
  useEffect(() => {
    if (mode === 'delete' && items.length === 0) {
      setMode('select');
    }
  }, [mode, items.length]);

  // Helper to exit text editing mode (used by ESC and click-outside)
  const exitTextEditing = useCallback((opts?: { keepSelection?: boolean }) => {
    const editingId = textEditingRef.current;
    if (!editingId) return;

    textEditingRef.current = null;
    textCursorPositionRef.current = 0;
    textSelectionStartRef.current = null;

    // Turn off editing flag for the text item
    setItems(prev => {
      const next = prev.map(it =>
        !it || !it.id ? it : (it.id === editingId && it.type === 'text'
          ? { ...it, _editing: false, selectionStart: undefined, selectionEnd: undefined }
          : it)
      ).filter(it => it && it.id) as AnnotationItem[];
      itemsRef.current = next;
      return next;
    });

    if (opts?.keepSelection === false) {
      selectedIdsRef.current = [];
      setSelectedIds([]);
    } else {
      // ESC / tool switch: keep selected so handles stay available
      setSelectedIds(prev =>
        prev.length === 1 && prev[0] === editingId ? prev : [editingId]
      );
      selectedIdsRef.current = [editingId];
    }

    stopTextCursorBlink();

    // After leaving text editing we always return to select mode
    setMode('select');
  }, [setItems, setSelectedIds, setMode, stopTextCursorBlink]);

  // Load image when modal opens: server file via fileObjectId (full-res when possible), otherwise imageUrl (blob / data / direct src).
  useEffect(() => {
    if (!isOpen) {
      setImg(null);
      setIsLoading(false);
      setLoadError(null);
      loadedFileIdRef.current = null;
      loadingRef.current = false;
      prevAngleRef.current = 0;
      blurredBgCanvasRef.current = null;
      blurredBgKeyRef.current = '';
      if (cursorBlinkRef.current) {
        clearInterval(cursorBlinkRef.current);
        cursorBlinkRef.current = null;
      }
      return;
    }

    const loadKey = fileObjectId ?? (imageUrl || '').trim();
    if (!loadKey) {
      return;
    }

    // Prevent reloading if already loaded or currently loading
    if (loadingRef.current) {
      return;
    }

    if (loadedFileIdRef.current === loadKey) {
      return;
    }

    const loadImage = async () => {
      loadingRef.current = true;
      loadedFileIdRef.current = loadKey;
      setIsLoading(true);
      setLoadError(null);
      setImg(null);

      let urlToLoad: string;
      if (fileObjectId) {
        try {
          // Prefer full-resolution image via download URL so saved image keeps original quality
          const r: any = await api('GET', withFileAccessToken(`/files/${fileObjectId}/download`));
          const downloadUrl = r?.download_url ? String(r.download_url) : '';
          if (downloadUrl) {
            urlToLoad = downloadUrl;
          } else {
            urlToLoad = withFileAccessToken(`/files/${fileObjectId}/thumbnail?w=1024`);
          }
        } catch (_e) {
          urlToLoad = withFileAccessToken(`/files/${fileObjectId}/thumbnail?w=1024`);
        }
      } else {
        urlToLoad = (imageUrl || '').trim();
        if (!urlToLoad) {
          loadingRef.current = false;
          loadedFileIdRef.current = null;
          setIsLoading(false);
          setLoadError('No image URL to load.');
          return;
        }
      }

      const image = new Image();
      let imageLoaded = false;
      const loadTimeout = setTimeout(() => {
        if (!imageLoaded) {
          loadingRef.current = false;
          setIsLoading(false);
          setLoadError('Timeout loading image. Please try again.');
          setImg(null);
          loadedFileIdRef.current = null;
        }
      }, 60000);

      image.onload = () => {
        imageLoaded = true;
        clearTimeout(loadTimeout);
        loadingRef.current = false;
        setIsLoading(false);
        setLoadError(null);
        setImg(image);
        setAngle(0);
        prevAngleRef.current = 0;
        setScale(1);
        setOffsetX(0);
        setOffsetY(0);
        setItems([]);
        setSelectedIds([]);
        setMode('select');
      };

      image.onerror = () => {
        if (fileObjectId && !image.src.includes('/thumbnail')) {
          imageLoaded = false;
          image.removeAttribute('crossOrigin');
          image.src = withFileAccessToken(`/files/${fileObjectId}/thumbnail?w=1024`);
          return;
        }
        imageLoaded = true;
        clearTimeout(loadTimeout);
        loadingRef.current = false;
        setIsLoading(false);
        setLoadError('Failed to load image. Please check if the file exists and try again.');
        loadedFileIdRef.current = null;
      };

      // Blob/data URLs must not use crossOrigin or some browsers won't decode / canvas may taint.
      const skipCors = /^blob:|^data:/i.test(urlToLoad);
      if (skipCors) {
        image.removeAttribute('crossOrigin');
      } else {
        image.crossOrigin = 'anonymous';
      }
      image.src = urlToLoad;
    };

    loadImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fileObjectId, imageUrl]);

  // Set canvas size to match image dimensions exactly (no white space)
  // The canvas will be sized to show the full image without any padding
  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current || !img) return;
    
    let canvasWidth: number;
    let canvasHeight: number;
    
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    const imgAspect = imgWidth / Math.max(1, imgHeight);
    const sidebarWithGap = 240; // tools column (matches ImagePicker upload/gallery width)
    const headerHeight = 56;
    const chromePadding = 120; // content padding + caption + controls under image

    if (matchDialogSize && matchDialogSize.width > 0 && matchDialogSize.height > 0) {
      // Fit canvas into the left pane of a dialog that matches the picker size.
      const availW = Math.max(160, matchDialogSize.width - sidebarWithGap - 32);
      const availH = Math.max(160, matchDialogSize.height - headerHeight - chromePadding);
      const availAspect = availW / availH;
      if (imgAspect > availAspect) {
        canvasWidth = availW;
        canvasHeight = availW / imgAspect;
      } else {
        canvasHeight = availH;
        canvasWidth = availH * imgAspect;
      }
    } else if (targetWidth && targetHeight) {
      // If targetWidth and targetHeight are provided, use them as a bounding box
      // but preserve the image's own aspect ratio to avoid white letterbox borders
      const targetAspect = targetWidth / targetHeight;
      if (imgAspect > targetAspect) {
        canvasWidth = targetWidth;
        canvasHeight = targetWidth / imgAspect;
      } else {
        canvasWidth = targetHeight * imgAspect;
        canvasHeight = targetHeight;
      }
    } else {
      // Calculate maximum size that fits in viewport while maintaining aspect ratio
      // Account for sidebar (224px) + gap (16px) + padding (32px) + modal padding (32px) + margin
      const totalPadding = 64; // p-4 on modal content (16px * 2) + modal padding (16px * 2)
      const maxWidth = Math.min(imgWidth, window.innerWidth - sidebarWithGap - totalPadding - 40);
      const maxHeight = Math.min(imgHeight, window.innerHeight - 200);
      
      const maxAspect = maxWidth / maxHeight;
      
      // Scale to fit while maintaining aspect ratio
      if (imgAspect > maxAspect) {
        // Image is wider - fit to width
        canvasWidth = maxWidth;
        canvasHeight = maxWidth / imgAspect;
      } else {
        // Image is taller - fit to height
        canvasHeight = maxHeight;
        canvasWidth = maxHeight * imgAspect;
      }
    }
    
    // Use devicePixelRatio for crisp rendering on high-DPI displays
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.round(canvasWidth);
    const displayHeight = Math.round(canvasHeight);
    
    // Set display size (CSS pixels)
    canvasRef.current.style.width = `${displayWidth}px`;
    canvasRef.current.style.height = `${displayHeight}px`;
    overlayRef.current.style.width = `${displayWidth}px`;
    overlayRef.current.style.height = `${displayHeight}px`;
    
    // Set actual size in memory (scaled by devicePixelRatio)
    canvasRef.current.width = displayWidth * dpr;
    canvasRef.current.height = displayHeight * dpr;
    overlayRef.current.width = displayWidth * dpr;
    overlayRef.current.height = displayHeight * dpr;
    
    // Scale drawing context to match devicePixelRatio
    const baseCtx = canvasRef.current.getContext('2d');
    const overlayCtx = overlayRef.current.getContext('2d');
    if (baseCtx) {
      baseCtx.scale(dpr, dpr);
      baseCtx.imageSmoothingEnabled = true;
      baseCtx.imageSmoothingQuality = 'high';
    }
    if (overlayCtx) {
      overlayCtx.scale(dpr, dpr);
      overlayCtx.imageSmoothingEnabled = true;
      overlayCtx.imageSmoothingQuality = 'high';
    }
    
    // Update canvas dimensions state for modal sizing
    setCanvasDimensions({ width: Math.round(canvasWidth), height: Math.round(canvasHeight) });
    
    const fitScale = computeEditorFitScale(displayWidth, displayHeight, imgWidth, imgHeight, 0);
    setScale(fitScale);
    setOffsetX(0);
    setOffsetY(0);
  }, [img, isOpen, targetWidth, targetHeight, editorScaleFactor, matchDialogSize]);

  // Clamp translation - allow movement within canvas when zoom < 1, or ensure coverage when zoom >= 1
  const clampOffset = useCallback((x: number, y: number, s?: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return { x, y };

    // Get display dimensions (CSS pixels)
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;

    // Calculate the displayed size of the image after rotation and scale
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const currentScale = s !== undefined ? s : scale;
    
    // For rotated images, we need to calculate the bounding box
    const angleRad = (angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angleRad));
    const sin = Math.abs(Math.sin(angleRad));
    
    // Rotated bounding box dimensions
    const rotatedW = iw * currentScale * cos + ih * currentScale * sin;
    const rotatedH = iw * currentScale * sin + ih * currentScale * cos;
    
    const cw = displayWidth;
    const ch = displayHeight;

    // Center-based clamp:
    // - If rotatedW > cw: clamp to ensure edges cover canvas.
    // - If rotatedW < cw: allow movement within empty margins (blur/white fills behind).
    // Same formula works for both.
    const maxOffsetX = Math.abs(rotatedW - cw) / 2;
    const maxOffsetY = Math.abs(rotatedH - ch) / 2;
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, x)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, y)),
    };
  }, [img, scale, angle]);

  const fitScale = useMemo(() => {
    if (!img || canvasDimensions.width <= 0 || canvasDimensions.height <= 0) return 1;
    return computeEditorFitScale(
      canvasDimensions.width,
      canvasDimensions.height,
      img.naturalWidth,
      img.naturalHeight,
      angle,
    );
  }, [img, canvasDimensions.width, canvasDimensions.height, angle]);

  const displayZoom = fitScale > 0 ? scale / fitScale : 1;

  const applyDisplayZoom = useCallback(
    (z: number) => {
      const nextZ = Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, z));
      const nextScale = nextZ * (fitScale || 1);
      const clamped = clampOffset(offsetXRef.current, offsetYRef.current, nextScale);
      setScale(nextScale);
      setOffsetX(clamped.x);
      setOffsetY(clamped.y);
    },
    [fitScale, clampOffset],
  );

  useEffect(() => {
    const prev = prevAngleRef.current;
    if (prev === angle) return;
    prevAngleRef.current = angle;
    if (!img || canvasDimensions.width <= 0 || canvasDimensions.height <= 0) return;
    const oldFit = computeEditorFitScale(
      canvasDimensions.width,
      canvasDimensions.height,
      img.naturalWidth,
      img.naturalHeight,
      prev,
    );
    const newFit = computeEditorFitScale(
      canvasDimensions.width,
      canvasDimensions.height,
      img.naturalWidth,
      img.naturalHeight,
      angle,
    );
    const z = oldFit > 0 ? scaleRef.current / oldFit : 1;
    const nextZ = Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, z));
    setScale(nextZ * newFit);
  }, [angle, img, canvasDimensions.width, canvasDimensions.height]);

  // Clamp offsets whenever they or scale/angle change
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const clamped = clampOffset(offsetX, offsetY);
    if (clamped.x !== offsetX || clamped.y !== offsetY) {
      setOffsetX(clamped.x);
      setOffsetY(clamped.y);
    }
  }, [offsetX, offsetY, scale, angle, img, clampOffset]);

  const ensureBlurredBackground = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    // Get display dimensions (CSS pixels)
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;

    // Cache key depends on the source + current canvas size.
    const key = `${img.src}|${displayWidth}x${displayHeight}`;
    if (blurredBgCanvasRef.current && blurredBgKeyRef.current === key) return;

    const bg = document.createElement('canvas');
    bg.width = displayWidth;
    bg.height = displayHeight;
    const bctx = bg.getContext('2d');
    if (!bctx) return;

    // Cover-fit, slightly overscaled to avoid edge artifacts after blur
    const cover = Math.max(bg.width / img.naturalWidth, bg.height / img.naturalHeight) * 1.08;
    const dw = img.naturalWidth * cover;
    const dh = img.naturalHeight * cover;
    const dx = (bg.width - dw) / 2;
    const dy = (bg.height - dh) / 2;

    bctx.save();
    // Fast blur & desaturate for preview (way cheaper than pixel processing)
    // This is only for the editor preview; exported image still includes the blur.
    (bctx as any).filter = 'blur(24px) saturate(0.6)';
    bctx.drawImage(img, dx, dy, dw, dh);
    bctx.restore();

    blurredBgCanvasRef.current = bg;
    blurredBgKeyRef.current = key;
  }, [img]);

  // Draw base image
  const drawBase = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Get display dimensions (CSS pixels)
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;
    
    // Use clamped offsets (read from refs so drawBase doesn't change on every drag tick)
    const currentScale = scaleRef.current;
    const clamped = clampOffset(offsetXRef.current, offsetYRef.current, currentScale);
    
    ctx.save();
    // High-quality smoothing is essential for rotation to avoid blur/artifacts
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    
    // Determine if we need a blur background (fast check; uses currentScale)
    const iw0 = img.naturalWidth;
    const ih0 = img.naturalHeight;
    const angleRad0 = (angle * Math.PI) / 180;
    const cos0 = Math.abs(Math.cos(angleRad0));
    const sin0 = Math.abs(Math.sin(angleRad0));
    const rotatedW0 = iw0 * currentScale * cos0 + ih0 * currentScale * sin0;
    const rotatedH0 = iw0 * currentScale * sin0 + ih0 * currentScale * cos0;
    const needsBlur = rotatedW0 < displayWidth || rotatedH0 < displayHeight;

    // Only draw background if image doesn't fill the canvas completely
    // Use white background instead of blur
    if (needsBlur) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, displayWidth, displayHeight);
    }
    
    ctx.translate(displayWidth / 2 + clamped.x, displayHeight / 2 + clamped.y);
    ctx.rotate(angle * Math.PI / 180);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = currentScale;
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }, [img, angle, clampOffset, ensureBlurredBackground]);

  // Get item bounds
  const getItemBounds = useCallback((it: AnnotationItem | null | undefined) => {
    if (!it || !it.id) return null;
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const ctx = overlay.getContext('2d');
    if (!ctx) return null;

    if (it.type === 'rect') {
      const w = Math.abs(it.w || 0);
      const h = Math.abs(it.h || 0);
      const x = Math.min(it.x, it.x + (it.w || 0));
      const y = Math.min(it.y, it.y + (it.h || 0));
      return { x, y, w, h };
    }
    if (it.type === 'arrow') {
      const x = Math.min(it.x, it.x2 || it.x);
      const y = Math.min(it.y, it.y2 || it.y);
      return { x, y, w: Math.abs((it.x2 || it.x) - it.x), h: Math.abs((it.y2 || it.y) - it.y) };
    }
    if (it.type === 'text') {
      // Use w and h if available (when creating text area), otherwise calculate from text
      if (it.w && it.h) {
        return { x: it.x, y: it.y, w: it.w, h: it.h };
      }
      const itemFontSize = it.fontSize || fontSize;
      ctx.font = `${itemFontSize}px Montserrat`;
      const w = ctx.measureText(it.text || '').width;
      const h = itemFontSize;
      return { x: it.x, y: it.y - h, w, h };
    }
    if (it.type === 'circle') {
      // Support both old format (rx, ry or r) and new format (w, h)
      if (it.w !== undefined && it.h !== undefined) {
        // New format: x, y is already top-left corner
        return { x: it.x, y: it.y, w: Math.abs(it.w), h: Math.abs(it.h) };
      } else if (it.rx !== undefined && it.ry !== undefined) {
        // Old format: x, y is center, rx, ry are radii
        return { x: it.x - it.rx, y: it.y - it.ry, w: it.rx * 2, h: it.ry * 2 };
      } else {
        // Old format: x, y is center, r is radius
        const r = Math.max(1, it.r || 1);
        return { x: it.x - r, y: it.y - r, w: r * 2, h: r * 2 };
      }
    }
    if (it.type === 'path' || it.type === 'polygon') {
      const pts = it.points || [];
      if (!pts.length) return null;
      let minX = pts[0].x, minY = pts[0].y, maxX = pts[0].x, maxY = pts[0].y;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    return null;
  }, [fontSize]);

  // Draw overlay annotations
  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    
    // Get display dimensions (CSS pixels)
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = overlay.width / dpr;
    const displayHeight = overlay.height / dpr;
    
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const items = itemsRef.current;
    const selectedIds = selectedIdsRef.current;
    const cursorVisible = cursorVisibleRef.current;
    
    // Draw items
    for (const it of items) {
      if (!it || !it.id) continue; // Skip null/undefined items
      ctx.save();
      const itemBounds = getItemBounds(it);
      if (itemBounds) {
        applyAnnotationRotation(ctx, itemBounds, annotationRotationDeg(it));
      }
      ctx.strokeStyle = it.color;
      ctx.fillStyle = it.color;
      ctx.lineWidth = it.stroke;
      
      if (it.type === 'rect') {
        const enabled = it.fillEnabled !== undefined ? it.fillEnabled : fillEnabled;
        applyShapeFill(
          ctx,
          { kind: 'rect', x: it.x, y: it.y, w: it.w || 0, h: it.h || 0 },
          {
            enabled,
            color: it.fillColor || fillColor,
            opacity: it.fillOpacity !== undefined ? it.fillOpacity : fillOpacity,
            pattern: it.fillPattern || fillPattern,
          },
        );
        ctx.strokeStyle = it.color;
        ctx.lineWidth = it.stroke;
        ctx.strokeRect(it.x, it.y, it.w || 0, it.h || 0);
      } else if (it.type === 'arrow') {
        drawArrow(ctx, it.x, it.y, it.x2 || it.x, it.y2 || it.y, it.stroke);
      } else if (it.type === 'text') {
        const itemFontSize = it.fontSize || fontSize;
        ctx.font = `${itemFontSize}px Montserrat`;
        const padding = TEXT_BOX_PADDING;
        
        // Draw text area border:
        // - while actively editing the text
        // - OR while initially drawing the text box (drawingRef)
        if (it.w && it.h && it.w > 1 && it.h > 1 && (it._editing || (drawingRef.current && drawingRef.current.id === it.id))) {
          ctx.strokeStyle = it.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(it.x, it.y, it.w, it.h);
          ctx.setLineDash([]);
        }
        
        // Draw text background if enabled
        const bgEnabled = it.textBackgroundEnabled !== undefined ? it.textBackgroundEnabled : textBackgroundEnabled;
        if (bgEnabled && it.w && it.h) {
          const bgColor = it.textBackgroundColor || textBackgroundColor;
          const bgOpacity = it.textBackgroundOpacity !== undefined ? it.textBackgroundOpacity : textBackgroundOpacity;
          ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
          ctx.fillRect(it.x, it.y, it.w, it.h);
        }
        
        // Draw text within the box bounds with clipping
        ctx.save();
        // Clip to text box area
        ctx.beginPath();
        ctx.rect(it.x, it.y, it.w || 200, it.h || 30);
        ctx.clip();
        
        ctx.fillStyle = it.color;
        const textContent = it.text || '';
        const maxWidth = (it.w || 200) - padding * 2;
        const lineHeight = itemFontSize * 1.2;
        const startY = it.y + padding + itemFontSize;
        
        // Word wrap text - handle both spaces and newlines
        const lines: string[] = [];
        const paragraphs = textContent.split('\n');
        
        for (const para of paragraphs) {
          if (!para.trim() && lines.length > 0) {
            // Empty line
            lines.push('');
            continue;
          }
          
          const words = para.split(' ');
          let currentLine = '';
          
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            
            // Check if word itself is too long for a single line
            const wordMetrics = ctx.measureText(word);
            if (wordMetrics.width > maxWidth) {
              // Word is too long, break it by characters
              // First, save current line if it has content
              if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
              }
              
              // Break word by characters
              let charLine = '';
              for (let j = 0; j < word.length; j++) {
                const charTest = charLine + word[j];
                const charMetrics = ctx.measureText(charTest);
                if (charMetrics.width > maxWidth && charLine) {
                  lines.push(charLine);
                  charLine = word[j];
                } else {
                  charLine = charTest;
                }
              }
              currentLine = charLine;
            } else {
              // Word fits, try to add it to current line
              const testLine = currentLine + (currentLine ? ' ' : '') + word;
              const metrics = ctx.measureText(testLine);
              
              if (metrics.width > maxWidth && currentLine) {
                // Current line is full, save it and start new line with this word
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }
          }
          if (currentLine) {
            lines.push(currentLine);
          }
        }
        
        // If no text, show at least one empty line for cursor
        if (lines.length === 0) {
          lines.push('');
        }
        
        // Draw each line within box bounds
        let y = startY;
        let lastLineWidth = 0;
        const maxY = it.y + (it.h || 30) - padding;
        
        // Calculate cursor position (only when editing)
        let cursorX = it.x + padding;
        let cursorY = startY;
        let charCount = 0;
        let foundCursor = false;
        
        if (it._editing) {
          const cursorPos = it.cursorPosition !== undefined ? it.cursorPosition : textContent.length;
          
          for (let i = 0; i < lines.length; i++) {
            if (y > maxY) break;
            const line = lines[i];
            const lineLength = line.length;
            
            if (!foundCursor && charCount + lineLength >= cursorPos) {
              // Cursor is in this line
              const posInLine = cursorPos - charCount;
              const textBeforeCursor = line.substring(0, posInLine);
              cursorX = it.x + padding + ctx.measureText(textBeforeCursor).width;
              cursorY = y;
              foundCursor = true;
            }
            
            charCount += lineLength;
            if (i < lines.length - 1) {
              charCount += 1; // newline
            }
            y += lineHeight;
          }
          
          // If cursor is at the end
          if (!foundCursor) {
            y = startY;
            for (let i = 0; i < lines.length; i++) {
              if (y > maxY) break;
              const line = lines[i];
              if (i === lines.length - 1) {
                lastLineWidth = ctx.measureText(line).width;
              }
              y += lineHeight;
            }
            cursorX = it.x + padding + lastLineWidth;
            cursorY = startY + Math.min(lines.length - 1, Math.floor((maxY - startY) / lineHeight)) * lineHeight;
          }
        }
        
        // Draw text lines (always, not just when editing)
        y = startY;
        const selStart = it.selectionStart ?? null;
        const selEnd = it.selectionEnd ?? null;
        const hasSelection = selStart !== null && selEnd !== null && selEnd > selStart;
        charCount = 0;

        for (let i = 0; i < lines.length; i++) {
          if (y > maxY) break;
          const line = lines[i];
          const lineLength = line.length;

          // Draw selection background for this line if needed
          if (hasSelection) {
            const lineStartIndex = charCount;
            const lineEndIndex = charCount + lineLength;
            const start = Math.max(selStart!, lineStartIndex);
            const end = Math.min(selEnd!, lineEndIndex);
            if (end > start) {
              const startInLine = start - lineStartIndex;
              const endInLine = end - lineStartIndex;
              const beforeText = line.substring(0, startInLine);
              const selectedText = line.substring(startInLine, endInLine);
              const selX = it.x + padding + ctx.measureText(beforeText).width;
              const selW = ctx.measureText(selectedText).width;
              ctx.save();
              ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
              ctx.fillRect(selX, y - itemFontSize, selW, itemFontSize + 2);
              ctx.restore();
            }
          }

          ctx.fillStyle = it.color;
          ctx.fillText(line, it.x + padding, y);
          if (i === lines.length - 1) {
            lastLineWidth = ctx.measureText(lines[i]).width;
          }
          charCount += lineLength;
          if (i < lines.length - 1) {
            charCount += 1;
          }
          y += lineHeight;
        }
        
        // Draw cursor when editing
        if (it._editing && cursorVisible) {
          cursorX = Math.min(Math.max(cursorX, it.x + padding), it.x + (it.w || 200) - padding);
          // Cursor Y should align with text baseline - cursorY is the baseline of the current line
          // Draw cursor from baseline upward (baseline - fontSize gives us the top of the cursor)
          const cursorTop = cursorY - itemFontSize;
          ctx.fillStyle = it.color;
          ctx.fillRect(cursorX, cursorTop, 2, itemFontSize);
        }
        
        ctx.restore();
      } else if (it.type === 'circle') {
        const geometry = circleGeometryFromItem(it);
        const enabled = it.fillEnabled !== undefined ? it.fillEnabled : fillEnabled;
        applyShapeFill(ctx, geometry, {
          enabled,
          color: it.fillColor || fillColor,
          opacity: it.fillOpacity !== undefined ? it.fillOpacity : fillOpacity,
          pattern: it.fillPattern || fillPattern,
        });
        ctx.strokeStyle = it.color;
        ctx.lineWidth = it.stroke;
        ctx.beginPath();
        if (geometry.kind === 'ellipse') {
          const { cx: centerX, cy: centerY, rx, ry } = geometry;
          if (rx === ry) {
            ctx.arc(centerX, centerY, Math.max(1, rx), 0, Math.PI * 2);
          } else {
            ctx.ellipse(centerX, centerY, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
          }
        }
        ctx.stroke();
      } else if (it.type === 'path') {
        const pts = it.points || [];
        if (pts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }
      } else if (it.type === 'polygon') {
        const isInProgress = drawingRef.current?.id === it.id;
        drawPolygonAnnotation(
          ctx,
          it,
          { fillEnabled, fillColor, fillOpacity, fillPattern },
          isInProgress ? polygonPreviewRef.current : null,
        );
      }
      
      // Draw selection border in red when items are selected (only in select mode, not during drawing)
      if (selectedIds.includes(it.id) && mode === 'select' && !drawingRef.current) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#d11616'; // brand-red
        ctx.lineWidth = 1;
        const bb = itemBounds;
        if (bb) {
          ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);

          const handleSize = getHandleVisualSize(bb);
          const handles = getResizeHandlePoints(bb);

          ctx.fillStyle = '#d11616';
          ctx.setLineDash([]);
          for (const handle of handles) {
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeStyle = '#d11616';
          }

          const rotHandle = getRotationHandleLocal(bb);
          const stemX = bb.x + bb.w / 2;
          ctx.beginPath();
          ctx.moveTo(stemX, bb.y);
          ctx.lineTo(rotHandle.x, rotHandle.y);
          ctx.strokeStyle = '#d11616';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(rotHandle.x, rotHandle.y, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#d11616';
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    
    // Draw marquee selection box
    if (marqueeRef.current && mode === 'select') {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#d11616'; // brand-red
      ctx.lineWidth = 1;
      const m = marqueeRef.current;
      const x = Math.min(m.x, m.x2);
      const y = Math.min(m.y, m.y2);
      const w = Math.abs(m.x2 - m.x);
      const h = Math.abs(m.y2 - m.y);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }, [fontSize, getItemBounds, mode, textBackgroundEnabled, textBackgroundColor, textBackgroundOpacity, fillEnabled, fillColor, fillOpacity, fillPattern]);

  drawOverlayRef.current = drawOverlay;

  // Initial draw when opening / image loaded
  useEffect(() => {
    if (!isOpen || !img) return;
    const raf = requestAnimationFrame(() => {
      drawBase();
      drawOverlay();
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, img, drawBase, drawOverlay]);

  // Redraw base only when view transform changes (pan/zoom/rotate)
  useEffect(() => {
    if (!isOpen || !img) return;
    drawBase();
  }, [isOpen, img, offsetX, offsetY, scale, angle, drawBase]);

  // Redraw overlay when items / style deps change (cursor blink uses ref + drawOverlayRef)
  useEffect(() => {
    if (isOpen && img) {
      drawOverlay();
    }
  }, [items, selectedIds, isOpen, img, drawOverlay]);

  // Calculate cursor position in text based on click position
  const getTextCursorPosition = useCallback((item: AnnotationItem, clickX: number, clickY: number): number => {
    const overlay = overlayRef.current;
    if (!overlay || item.type !== 'text') return 0;
    const ctx = overlay.getContext('2d');
    if (!ctx) return 0;

    const bb = getItemBounds(item);
    if (bb) {
      const local = worldToLocalPoint(clickX, clickY, bb, annotationRotationDeg(item));
      clickX = local.x;
      clickY = local.y;
    }

    const itemFontSize = item.fontSize || fontSize;
    ctx.font = `${itemFontSize}px Montserrat`;
    const padding = 4;
    const textContent = item.text || '';
    
    // Calculate which line was clicked.
    // Use the *top* of the text area as origin, so vertical line index
    // matches what the user sees (first line, second line, etc.).
    const lineHeight = itemFontSize * 1.2;
    const topY = item.y + padding; // top of first line box
    const relativeY = Math.max(0, clickY - topY);
    const lineIndex = Math.floor(relativeY / lineHeight);
    
    // Word wrap the text to get lines
    const maxWidth = (item.w || 200) - padding * 2;
    const lines: string[] = [];
    const paragraphs = textContent.split('\n');
    
    for (const para of paragraphs) {
      if (!para.trim() && lines.length > 0) {
        lines.push('');
        continue;
      }
      
      const words = para.split(' ');
      let currentLine = '';
      
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordMetrics = ctx.measureText(word);
        if (wordMetrics.width > maxWidth) {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
          }
          let charLine = '';
          for (let j = 0; j < word.length; j++) {
            const charTest = charLine + word[j];
            const charMetrics = ctx.measureText(charTest);
            if (charMetrics.width > maxWidth && charLine) {
              lines.push(charLine);
              charLine = word[j];
            } else {
              charLine = charTest;
            }
          }
          currentLine = charLine;
        } else {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    }
    
    if (lines.length === 0) {
      lines.push('');
    }
    
    // Get the line that was clicked
    const targetLine = lines[Math.min(lineIndex, lines.length - 1)] || '';
    
    // Calculate character position in that line
    const relativeX = clickX - (item.x + padding);
    let charPos = 0;
    let currentWidth = 0;
    
    for (let i = 0; i <= targetLine.length; i++) {
      const testText = targetLine.substring(0, i);
      const width = ctx.measureText(testText).width;
      if (width > relativeX) {
        charPos = i;
        break;
      }
      currentWidth = width;
      charPos = i;
    }
    
    // Calculate absolute position in full text
    let absolutePos = 0;
    for (let i = 0; i < Math.min(lineIndex, lines.length); i++) {
      absolutePos += lines[i].length;
      if (i < lines.length - 1) {
        absolutePos += 1; // newline
      }
    }
    absolutePos += charPos;
    
    return Math.max(0, Math.min(absolutePos, textContent.length));
  }, [fontSize, getItemBounds]);

  const wrapTextLines = useCallback((ctx: CanvasRenderingContext2D, textContent: string, maxWidth: number): string[] => {
    const lines: string[] = [];
    const paragraphs = textContent.split('\n');
    for (const para of paragraphs) {
      if (!para.trim() && lines.length > 0) {
        lines.push('');
        continue;
      }
      const words = para.split(' ');
      let currentLine = '';
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordMetrics = ctx.measureText(word);
        if (wordMetrics.width > maxWidth) {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
          }
          let charLine = '';
          for (let j = 0; j < word.length; j++) {
            const charTest = charLine + word[j];
            const charMetrics = ctx.measureText(charTest);
            if (charMetrics.width > maxWidth && charLine) {
              lines.push(charLine);
              charLine = word[j];
            } else {
              charLine = charTest;
            }
          }
          if (charLine) currentLine = charLine;
        } else {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const testMetrics = ctx.measureText(testLine);
          if (testMetrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines;
  }, []);

  // True when the pointer is on rendered glyphs (not empty padding / border).
  const isClickOnTextContent = useCallback((item: AnnotationItem, clickX: number, clickY: number): boolean => {
    const overlay = overlayRef.current;
    if (!overlay || item.type !== 'text') return false;
    const ctx = overlay.getContext('2d');
    if (!ctx) return false;

    const textContent = item.text || '';
    if (!textContent) return false;

    const bb = getItemBounds(item);
    const local = bb
      ? worldToLocalPoint(clickX, clickY, bb, annotationRotationDeg(item))
      : { x: clickX, y: clickY };

    const boxW = item.w || 200;
    const boxH = item.h || 30;
    const innerMargin = 4;
    const insideCoreBox =
      local.x >= item.x + innerMargin &&
      local.x <= item.x + boxW - innerMargin &&
      local.y >= item.y + innerMargin &&
      local.y <= item.y + boxH - innerMargin;
    if (!insideCoreBox) return false;

    const itemFontSize = item.fontSize || fontSize;
    ctx.font = `${itemFontSize}px Montserrat`;
    const padding = 4;
    const maxWidth = boxW - padding * 2;
    const lineHeight = itemFontSize * 1.2;
    const topY = item.y + padding;
    const relativeY = Math.max(0, local.y - topY);
    const lineIndex = Math.floor(relativeY / lineHeight);
    const lines = wrapTextLines(ctx, textContent, maxWidth);

    if (lineIndex >= 0 && lineIndex < lines.length && lines[lineIndex].trim()) {
      const lineText = lines[lineIndex];
      const lineStartX = item.x + padding;
      const lineEndX = lineStartX + ctx.measureText(lineText).width;
      return local.x >= lineStartX && local.x <= lineEndX;
    }
    return false;
  }, [fontSize, getItemBounds, wrapTextLines]);

  // Find item at position
  const itemAt = useCallback((x: number, y: number): AnnotationItem | null => {
    const list = itemsRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (!it || !it.id) continue; // Skip null/undefined items
      const b = getItemBounds(it);
      if (!b) continue;
      const local = worldToLocalPoint(x, y, b, annotationRotationDeg(it));
      if (local.x >= b.x && local.y >= b.y && local.x <= b.x + b.w && local.y <= b.y + b.h) {
        return it;
      }
    }
    return null;
  }, [getItemBounds]);

  // Get handle at position for resize
  const getHandleAt = useCallback((x: number, y: number, item: AnnotationItem): string | null => {
    if (mode !== 'select') return null;
    const bb = getItemBounds(item);
    if (!bb) return null;

    const rotation = annotationRotationDeg(item);
    const local = worldToLocalPoint(x, y, bb, rotation);
    const handleSize = getHandleHitSize(bb);

    const rotHandle = getRotationHandleLocal(bb);
    const rotHit = Math.max(handleSize, ROTATE_HANDLE_RADIUS * 2 + 4);
    if (Math.hypot(local.x - rotHandle.x, local.y - rotHandle.y) <= rotHit / 2) {
      return 'rotate';
    }

    const handles = getResizeHandlePoints(bb);
    for (const handle of handles) {
      if (Math.abs(local.x - handle.x) <= handleSize / 2 && Math.abs(local.y - handle.y) <= handleSize / 2) {
        return handle.name;
      }
    }
    return null;
  }, [mode, getItemBounds]);

  const beginResizeAt = useCallback((x: number, y: number, item: AnnotationItem, handle: string) => {
    const bb = getItemBounds(item);
    if (!bb) return;
    if (handle === 'rotate') {
      const { cx, cy } = boundsCenter(bb);
      rotatingRef.current = {
        item: { ...item },
        cx,
        cy,
        startRotation: annotationRotationDeg(item),
        startPointerAngle: Math.atan2(y - cy, x - cx),
      };
      return;
    }
    resizingRef.current = {
      item: { ...item },
      handle,
      startX: x,
      startY: y,
      startW: bb.w,
      startH: bb.h,
      startR: item.type === 'circle' && !item.w ? (item.r || (item.rx && item.ry ? Math.max(item.rx, item.ry) : undefined)) : undefined,
      startRx: item.type === 'circle' && !item.w ? (item.rx || item.r) : undefined,
      startRy: item.type === 'circle' && !item.w ? (item.ry || item.r) : undefined,
      startX2: item.type === 'arrow' ? item.x2 : undefined,
      startY2: item.type === 'arrow' ? item.y2 : undefined,
    };
  }, [getItemBounds]);

  const setOverlayCursor = (cursor: string) => {
    overlayCursorRef.current = cursor;
    const overlay = overlayRef.current;
    if (overlay) overlay.style.cursor = cursor;
  };

  useLayoutEffect(() => {
    if (movingRef.current || resizingRef.current || rotatingRef.current || draggingRef.current) {
      return;
    }
    if (mode === 'draw') {
      overlayCursorRef.current = `url("${pencilCursorIcon}") 6 28, auto`;
    } else if (mode === 'select' || mode === 'delete') {
      overlayCursorRef.current = 'grab';
    } else if (mode === 'pan') {
      overlayCursorRef.current = 'default';
    } else {
      overlayCursorRef.current = 'crosshair';
    }
  }, [mode]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (overlay) overlay.style.cursor = overlayCursorRef.current;
  });

  // Handle wheel for zoom - using native event listener like ImagePicker
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const handleWheel = (e: WheelEvent) => {
      // Handle wheel when in pan or select mode and not editing text
      if (textEditingRef.current || (mode !== 'pan' && mode !== 'select')) return;
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const factor = e.deltaY < 0 ? 1.06 : 1/1.06;
      const currentScale = scaleRef.current;
      const currentOffsetX = offsetXRef.current;
      const currentOffsetY = offsetYRef.current;
      const base = fitScale || 1;
      const newZoom = Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, (currentScale / base) * factor));
      const newScale = newZoom * base;
      
      // Recalculate clamp values with new scale
      if (img) {
        const clamped = clampOffset(currentOffsetX, currentOffsetY, newScale);
        setScale(newScale);
        setOffsetX(clamped.x);
        setOffsetY(clamped.y);
      } else {
        setScale(newScale);
      }
    };
    
    canvas.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => {
      canvas.removeEventListener('wheel', handleWheel, { capture: true } as any);
    };
  }, [isOpen, mode, img, clampOffset, fitScale]);

  const cancelPolygonDrawing = useCallback(() => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.type !== 'polygon') return;
    const drawnId = drawing.id;
    setItems((prev) => {
      const next = prev.filter((it) => it && it.id && it.id !== drawnId) as AnnotationItem[];
      itemsRef.current = next;
      return next;
    });
    setSelectedIds((prev) => prev.filter((id) => id !== drawnId));
    drawingRef.current = null;
    polygonPreviewRef.current = null;
  }, []);

  const finalizePolygon = useCallback((closed: boolean) => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.type !== 'polygon') return;
    const drawnId = drawing.id;
    const minPts = closed ? 3 : 2;
    let kept = false;

    setItems((prev) => {
      const item = prev.find((it) => it?.id === drawnId) || itemsRef.current.find((it) => it?.id === drawnId);
      const pts = item?.points || [];
      if (!item || pts.length < minPts) {
        const next = prev.filter((it) => it && it.id && it.id !== drawnId);
        itemsRef.current = next as AnnotationItem[];
        return next;
      }
      kept = true;
      const next = prev
        .map((it) => (it?.id === drawnId ? { ...it, closed } : it))
        .filter((it) => it && it.id) as AnnotationItem[];
      itemsRef.current = next;
      return next;
    });

    setSelectedIds(kept ? [drawnId] : (prev) => prev.filter((id) => id !== drawnId));
    drawingRef.current = null;
    polygonPreviewRef.current = null;
    setMode('select');
  }, []);

  const popPolygonVertex = useCallback(() => {
    const drawing = drawingRef.current;
    if (!drawing || drawing.type !== 'polygon') return;
    const drawnId = drawing.id;

    setItems((prev) => {
      const item = itemsRef.current.find((it) => it?.id === drawnId) || prev.find((it) => it?.id === drawnId);
      const pts = item?.points || [];
      if (!item || pts.length <= 1) {
        drawingRef.current = null;
        polygonPreviewRef.current = null;
        setSelectedIds((prev) => prev.filter((id) => id !== drawnId));
        const next = prev.filter((it) => it && it.id && it.id !== drawnId) as AnnotationItem[];
        itemsRef.current = next;
        return next;
      }
      const newPts = pts.slice(0, -1);
      const updated = { ...item, points: newPts };
      drawingRef.current = updated;
      const next = prev.map((it) => (it?.id === drawnId ? updated : it)).filter((it) => it && it.id) as AnnotationItem[];
      itemsRef.current = next;
      return next;
    });
  }, []);

  // Sync fill settings onto polygon currently being drawn
  useEffect(() => {
    if (mode !== 'polygon' || drawingRef.current?.type !== 'polygon') return;
    const drawnId = drawingRef.current.id;
    setItems((prev) =>
      prev
        .map((it) => {
          if (!it || !it.id || it.id !== drawnId) return it;
          return { ...it, fillEnabled, fillColor, fillOpacity, fillPattern };
        })
        .filter((it) => it && it.id),
    );
  }, [fillEnabled, fillColor, fillOpacity, fillPattern, mode]);

  // Cancel in-progress polygon when leaving polygon mode (e.g. switching tools)
  useEffect(() => {
    if (mode !== 'polygon' && drawingRef.current?.type === 'polygon') {
      cancelPolygonDrawing();
    }
  }, [mode, cancelPolygonDrawing]);

  // Pointer event handlers for drag - like ImagePicker
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Disable pan when editing text - clicking canvas should exit edit mode
    if (textEditingRef.current) {
      exitTextEditing({ keepSelection: false });
      return;
    }
    if (!img) return;
    
    // Allow pan in pan mode, or in select mode when clicking outside items
    if (mode === 'pan') {
      e.preventDefault();
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      draggingRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        offsetX: offsetXRef.current,
        offsetY: offsetYRef.current,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else if (mode === 'select') {
      // In select mode, check if clicking outside any item
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvasRef.current ? canvasRef.current.width / dpr : 0;
      const displayHeight = canvasRef.current ? canvasRef.current.height / dpr : 0;
      
      // Convert click coordinates to canvas coordinates
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Check if click is within canvas bounds and outside any item
      if (x >= 0 && x <= displayWidth && y >= 0 && y <= displayHeight) {
        const hit = itemAt(x, y);
        if (!hit) {
          // Click is outside any item: drop selection and pan
          selectedIdsRef.current = [];
          setSelectedIds([]);
          e.preventDefault();
          draggingRef.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            offsetX: offsetXRef.current,
            offsetY: offsetYRef.current,
          };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img || !draggingRef.current) return;
    // Allow pan movement in pan mode or when dragging in select mode (after clicking outside items)
    if (mode === 'pan' || (mode === 'select' && draggingRef.current)) {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const dx = e.clientX - rect.left - draggingRef.current.x;
      const dy = e.clientY - rect.top - draggingRef.current.y;
      const { x, y } = clampOffset(draggingRef.current.offsetX + dx, draggingRef.current.offsetY + dy);
      offsetXRef.current = x;
      offsetYRef.current = y;
      drawBase();
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) {
      setOffsetX(offsetXRef.current);
      setOffsetY(offsetYRef.current);
    }
    draggingRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Overlay mouse handlers
  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Handle clicks when editing text (even in pan mode)
    if (textEditingRef.current) {
      const editingItem = itemsRef.current.find(it => it && it.id === textEditingRef.current && it.type === 'text');
      if (editingItem) {
        const boxW = editingItem.w || 200;
        const boxH = editingItem.h || 30;
        const safetyMargin = 10; // safety margin around text box before exiting edit mode
        const editBb = getItemBounds(editingItem);
        const local = editBb
          ? worldToLocalPoint(x, y, editBb, annotationRotationDeg(editingItem))
          : { x, y };

        const handle = getHandleAt(x, y, editingItem);
        if (handle) {
          beginResizeAt(x, y, editingItem, handle);
          return;
        }

        const insideExpandedBox =
          local.x >= editingItem.x - safetyMargin &&
          local.x <= editingItem.x + boxW + safetyMargin &&
          local.y >= editingItem.y - safetyMargin &&
          local.y <= editingItem.y + boxH + safetyMargin;

        if (insideExpandedBox) {
          if (isClickOnTextContent(editingItem, x, y)) {
            // Click on glyphs → caret + drag-selection
            const cursorPos = getTextCursorPosition(editingItem, x, y);
            textCursorPositionRef.current = cursorPos;
            textSelectionStartRef.current = cursorPos;
            textSelectingRef.current = true;
            setItems(prev => prev.map(it =>
              !it || !it.id ? it : (it.id === editingItem.id ? { ...it, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it)
            ).filter(it => it && it.id));
            if (overlayRef.current) {
              overlayRef.current.focus();
            }
            e.stopPropagation();
            return;
          }
          // Empty padding or border → move whole box
          if (!selectedIds.includes(editingItem.id)) {
            setSelectedIds([editingItem.id]);
          }
          movingRef.current = { item: { ...editingItem }, startX: x, startY: y };
          setOverlayCursor('grabbing');
          e.stopPropagation();
          return;
        } else {
          // Click outside the text box → exit edit and deselect, then continue
          // so another object can be selected (or empty canvas can pan) in one click.
          exitTextEditing({ keepSelection: false });
        }
      }
    }
    
    // When not editing text, overlay only handles clicks in non-pan modes
    if (mode === 'pan') return; // Pan mode handles base canvas, not overlay
    
    if (mode === 'delete') {
      const hit = itemAt(x, y);
      if (hit) {
        setItems(prev => {
          const newItems = prev.filter(it => it && it.id && it.id !== hit.id);
          // If no items left, switch to select mode
          if (newItems.length === 0) {
            setMode('select');
          }
          return newItems;
        });
        setSelectedIds(prev => prev.filter(id => id !== hit.id));
      }
      return;
    } else if (mode === 'rect') {
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'rect',
          x,
          y,
          w: 1,
          h: 1,
          color: strokeColor,
          stroke,
          fillEnabled,
          fillColor,
          fillOpacity,
          fillPattern,
        };
        setItems(prev => {
          const next = [...prev.filter(it => it && it.id), newItem];
          itemsRef.current = next;
          return next;
        });
        setSelectedIds([newItem.id]);
        selectedIdsRef.current = [newItem.id];
        drawingRef.current = newItem;
      } else if (mode === 'arrow') {
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'arrow',
          x,
          y,
          x2: x + 1,
          y2: y + 1,
          color: strokeColor,
          stroke,
        };
        setItems(prev => {
          const next = [...prev.filter(it => it && it.id), newItem];
          itemsRef.current = next;
          return next;
        });
        setSelectedIds([newItem.id]);
        selectedIdsRef.current = [newItem.id];
        drawingRef.current = newItem;
      } else if (mode === 'circle') {
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'circle',
          x,
          y,
          w: 1, // Width of bounding box
          h: 1, // Height of bounding box
          color: strokeColor,
          stroke,
          fillEnabled,
          fillColor,
          fillOpacity,
          fillPattern,
        };
        setItems(prev => {
          const next = [...prev.filter(it => it && it.id), newItem];
          itemsRef.current = next;
          return next;
        });
        setSelectedIds([newItem.id]);
        selectedIdsRef.current = [newItem.id];
        drawingRef.current = newItem;
      } else if (mode === 'draw') {
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'path',
          x,
          y,
          points: [{ x, y }],
          color: strokeColor,
          stroke,
        };
        setItems(prev => {
          const next = [...prev.filter(it => it && it.id), newItem];
          itemsRef.current = next;
          return next;
        });
        setSelectedIds([newItem.id]);
        selectedIdsRef.current = [newItem.id];
        drawingRef.current = newItem;
      } else if (mode === 'polygon') {
        const currentDrawing = drawingRef.current;
        if (currentDrawing?.type === 'polygon') {
          const pts = currentDrawing.points || [];
          const first = pts[0];
          const nearFirst =
            pts.length >= 3 &&
            first &&
            Math.hypot(x - first.x, y - first.y) <= POLYGON_SNAP_RADIUS;

          if (e.detail >= 2) {
            finalizePolygon(false);
            return;
          }
          if (nearFirst) {
            finalizePolygon(true);
            return;
          }

          setItems((prev) => {
            const next = prev
              .map((it) => {
                if (!it || !it.id || it.id !== currentDrawing.id) return it;
                const nextPts = [...(it.points || []), { x, y }];
                const updated = { ...it, points: nextPts };
                drawingRef.current = updated;
                return updated;
              })
              .filter((it) => it && it.id) as AnnotationItem[];
            itemsRef.current = next;
            return next;
          });
          polygonPreviewRef.current = { x, y };
          return;
        }

        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'polygon',
          x,
          y,
          points: [{ x, y }],
          closed: false,
          color: strokeColor,
          stroke,
          fillEnabled,
          fillColor,
          fillOpacity,
          fillPattern,
        };
        setItems((prev) => {
          const next = [...prev.filter((it) => it && it.id), newItem];
          itemsRef.current = next;
          return next;
        });
        setSelectedIds([newItem.id]);
        selectedIdsRef.current = [newItem.id];
        drawingRef.current = newItem;
        polygonPreviewRef.current = { x, y };
      } else if (mode === 'text') {
        // Create a text area by drawing a rectangle first - only store in drawingRef, don't add to items yet
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'text',
          x,
          y,
          w: 1, // Start with minimal size, will be resized on mouse move
          h: 1,
          text: '', // Start with empty text
          fontSize,
          color: textColor,
          stroke,
          _editing: false,
          textBackgroundEnabled,
          textBackgroundColor,
          textBackgroundOpacity,
        };
        // Don't add to items yet - only add when user starts dragging
        drawingRef.current = newItem;
      } else if (mode === 'select') {
        if (e.shiftKey) {
          marqueeRef.current = { x, y, x2: x, y2: y };
        } else {
          // First check if clicking on a resize handle of any selected item
          let handleClicked = false;
          for (const item of itemsRef.current) {
            if (!item || !item.id) continue;
            if (selectedIdsRef.current.includes(item.id)) {
              const handle = getHandleAt(x, y, item);
              if (handle) {
                handleClicked = true;
                beginResizeAt(x, y, item, handle);
                break;
              }
            }
          }
          
          if (!handleClicked) {
            const hit = itemAt(x, y);
            
            // If clicking on a text item that's being edited, calculate cursor position
            if (hit && hit.type === 'text' && textEditingRef.current === hit.id) {
              // Clicking inside the text box - calculate cursor position
              const cursorPos = getTextCursorPosition(hit, x, y);
              textCursorPositionRef.current = cursorPos;
              setItems(prev => prev.map(it =>
                !it || !it.id ? it : (it.id === hit.id ? { ...it, cursorPosition: cursorPos } : it)
              ).filter(it => it && it.id));
              return; // Don't do anything else, just update cursor position
            }
            
            // If clicking outside the text being edited, exit edit + deselect in one click,
            // then continue so another item can be selected (or empty canvas clears/pans).
            if (textEditingRef.current && (!hit || hit.type !== 'text' || hit.id !== textEditingRef.current)) {
              exitTextEditing({ keepSelection: false });
            }
            
          if (hit) {
            // Select the item (or keep it selected if already selected)
            if (!selectedIdsRef.current.includes(hit.id)) {
              selectedIdsRef.current = [hit.id];
              setSelectedIds([hit.id]);
            }
            
            if (hit.type === 'text') {
              // One click: select + focus. Glyphs → caret; empty padding/border → drag.
              const cursorPos = getTextCursorPosition(hit, x, y);
              const onGlyphs = isClickOnTextContent(hit, x, y);
              textCursorPositionRef.current = cursorPos;
              textSelectionStartRef.current = onGlyphs ? cursorPos : null;
              textSelectingRef.current = onGlyphs;
              setItems(prev => {
                const next = prev.map(it =>
                  !it || !it.id ? it : (it.id === hit.id ? { ...it, _editing: true, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it)
                ).filter(it => it && it.id) as AnnotationItem[];
                itemsRef.current = next;
                return next;
              });
              textEditingRef.current = hit.id;
              startTextCursorBlink();
              if (overlayRef.current) {
                overlayRef.current.focus();
              }
              if (onGlyphs) {
                movingRef.current = null;
              } else {
                movingRef.current = { item: { ...hit }, startX: x, startY: y };
                setOverlayCursor('grabbing');
              }
            } else {
              // Non-text items: select and prepare to move
              movingRef.current = { item: { ...hit }, startX: x, startY: y };
              setOverlayCursor('grabbing');
            }
          } else {
              // Click on empty area — drop focus + selection in one click, then pan.
              selectedIdsRef.current = [];
              setSelectedIds([]);
              // Click on empty area -> allow pan in select mode
              if (mode === 'select' && img) {
                // Start pan when clicking outside items in select mode
                draggingRef.current = {
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  offsetX: offsetXRef.current,
                  offsetY: offsetYRef.current,
                };
              }
            }
          }
        }
      }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const livePatchItems = (updater: (prev: AnnotationItem[]) => AnnotationItem[]) => {
      itemsRef.current = updater(itemsRef.current).filter((it) => it && it.id) as AnnotationItem[];
      drawOverlay();
    };
    
    // Handle pan when dragging in select mode (clicked outside items)
    if (mode === 'select' && draggingRef.current && img) {
      const dx = e.clientX - rect.left - draggingRef.current.x;
      const dy = e.clientY - rect.top - draggingRef.current.y;
      const { x: newX, y: newY } = clampOffset(draggingRef.current.offsetX + dx, draggingRef.current.offsetY + dy);
      offsetXRef.current = newX;
      offsetYRef.current = newY;
      drawBase();
      return;
    }
    
    // Mouse-drag text selection while editing
    if (textEditingRef.current && textSelectingRef.current) {
      const editingItem = itemsRef.current.find(it => it && it.id === textEditingRef.current && it.type === 'text');
      if (editingItem) {
        const currentText = editingItem.text || '';
        const anchor = textSelectionStartRef.current ?? textCursorPositionRef.current;
        const cursorPos = getTextCursorPosition(editingItem, x, y);
        textCursorPositionRef.current = cursorPos;
        textSelectionStartRef.current = anchor;
        const start = Math.max(0, Math.min(anchor, cursorPos));
        const end = Math.min(currentText.length, Math.max(anchor, cursorPos));
        livePatchItems(prev => prev.map(it =>
          !it || !it.id ? it : (it.id === editingItem.id
            ? { ...it, cursorPosition: cursorPos, selectionStart: start, selectionEnd: end }
            : it)
        ));
      }
      return;
    }
    
    if (marqueeRef.current) {
      marqueeRef.current.x2 = x;
      marqueeRef.current.y2 = y;
      drawOverlay();
      return;
    }

    if (mode === 'polygon' && drawingRef.current?.type === 'polygon') {
      polygonPreviewRef.current = { x, y };
      drawOverlay();
      return;
    }
    
    const drawing = drawingRef.current;
    if (drawing) {
      const drawnId = drawing.id;
      if (drawing.type === 'rect') {
        livePatchItems(prev => prev.map(it => !it || !it.id ? it : (it.id === drawnId ? { ...it, w: x - it.x, h: y - it.y } : it)));
        const updated = itemsRef.current.find(it => it.id === drawnId);
        if (updated) drawingRef.current = updated;
      } else if (drawing.type === 'arrow') {
        livePatchItems(prev => prev.map(it => !it || !it.id ? it : (it.id === drawnId ? { ...it, x2: x, y2: y } : it)));
        const updated = itemsRef.current.find(it => it.id === drawnId);
        if (updated) drawingRef.current = updated;
      } else if (drawing.type === 'circle') {
        livePatchItems(prev => prev.map(it => {
          if (!it || !it.id) return it;
          if (it.id === drawnId) return { ...it, w: x - it.x, h: y - it.y };
          return it;
        }));
        const updated = itemsRef.current.find(it => it.id === drawnId);
        if (updated) drawingRef.current = updated;
      } else if (drawing.type === 'text') {
        const dx = Math.abs(x - drawing.x);
        const dy = Math.abs(y - drawing.y);
        const minSize = 5;
        if (dx < minSize && dy < minSize) return;
        const textMin = minTextBoxSize(drawing.fontSize || fontSize);
        const nextW = Math.max(textMin.w, Math.abs(x - drawing.x));
        const nextH = Math.max(textMin.h, Math.abs(y - drawing.y));
        if (!drawing.w || drawing.w <= 1) {
          const newItem = { ...drawing, w: nextW, h: nextH };
          itemsRef.current = [...itemsRef.current.filter(it => it && it.id && it.id !== drawnId), newItem];
          drawingRef.current = newItem;
          selectedIdsRef.current = [newItem.id];
          setSelectedIds([newItem.id]);
          drawOverlay();
        } else {
          livePatchItems(prev => prev.map(it => !it || !it.id ? it : (it.id === drawnId ? { ...it, w: nextW, h: nextH } : it)));
          const updated = itemsRef.current.find(it => it.id === drawnId);
          if (updated) drawingRef.current = updated;
        }
      } else if (drawing.type === 'path') {
        livePatchItems(prev => prev.map(it => {
          if (!it || !it.id) return it;
          if (it.id === drawnId) {
            const pts = [...(it.points || []), { x, y }];
            return { ...it, points: pts };
          }
          return it;
        }));
        const updated = itemsRef.current.find(it => it.id === drawnId);
        if (updated) drawingRef.current = updated;
      }
      return;
    }
    
    if (rotatingRef.current) {
      const rotState = rotatingRef.current;
      const pointerAngle = Math.atan2(y - rotState.cy, x - rotState.cx);
      let nextRot = rotState.startRotation + ((pointerAngle - rotState.startPointerAngle) * 180) / Math.PI;
      if (e.shiftKey) {
        nextRot = Math.round(nextRot / 15) * 15;
      }
      livePatchItems(prev => prev.map(it =>
        !it || !it.id || it.id !== rotState.item.id ? it : { ...it, rotation: nextRot }
      ));
      (e.currentTarget as HTMLCanvasElement).style.cursor = ROTATE_CURSOR;
      return;
    }

    if (resizingRef.current) {
      const resizeState = resizingRef.current;
      const item = resizeState.item;
      const startBb = getItemBounds(item);
      const rot = annotationRotationDeg(item);
      let dx = x - resizeState.startX;
      let dy = y - resizeState.startY;
      let localX = x;
      let localY = y;
      if (startBb) {
        const localStart = worldToLocalPoint(resizeState.startX, resizeState.startY, startBb, rot);
        const localNow = worldToLocalPoint(x, y, startBb, rot);
        dx = localNow.x - localStart.x;
        dy = localNow.y - localStart.y;
        localX = localNow.x;
        localY = localNow.y;
      }
      
      livePatchItems(prev => {
        const mapped = prev.map(it => {
        if (!it || !it.id) return it;
        if (it.id === item.id) {
          if (it.type === 'rect') {
            const { handle, startW, startH } = resizeState;
            const origX = item.x;
            const origY = item.y;
            
            let newW = startW! + (handle.includes('e') ? dx : handle.includes('w') ? -dx : 0);
            let newH = startH! + (handle.includes('s') ? dy : handle.includes('n') ? -dy : 0);
            let newX = origX;
            let newY = origY;
            
            if (handle.includes('w')) { newX = origX + dx; }
            if (handle.includes('n')) { newY = origY + dy; }
            
            return { ...it, x: newX, y: newY, w: newW, h: newH };
          } else if (it.type === 'circle') {
            const { handle, startW, startH, startR, startRx, startRy } = resizeState;
            const bb = getItemBounds(item);
            if (!bb) return it;
            
            if (item.w !== undefined && item.h !== undefined) {
              const origX = bb.x;
              const origY = bb.y;
              
              let newW = startW! + (handle.includes('e') ? dx : handle.includes('w') ? -dx : 0);
              let newH = startH! + (handle.includes('s') ? dy : handle.includes('n') ? -dy : 0);
              let newX = origX;
              let newY = origY;
              
              if (handle.includes('w')) { newX = origX + dx; }
              if (handle.includes('n')) { newY = origY + dy; }
              
              return { ...it, x: newX, y: newY, w: newW, h: newH };
            } else {
              const centerX = item.x;
              const centerY = item.y;
              
              if (item.rx !== undefined || item.ry !== undefined || startRx !== undefined || startRy !== undefined) {
                let newRx = startRx !== undefined ? startRx : (item.rx || item.r || 1);
                let newRy = startRy !== undefined ? startRy : (item.ry || item.r || 1);
                let newX = centerX;
                let newY = centerY;
                
                if (handle === 'se' || handle === 'ne' || handle === 'sw' || handle === 'nw') {
                  const distX = Math.abs(localX - centerX);
                  const distY = Math.abs(localY - centerY);
                  if (handle === 'se' || handle === 'ne') { newRx = distX; }
                  if (handle === 'sw' || handle === 'nw') { newRx = distX; }
                  if (handle === 'se' || handle === 'sw') { newRy = distY; }
                  if (handle === 'ne' || handle === 'nw') { newRy = distY; }
                } else if (handle.includes('e')) { 
                  newRx = startRx! + dx;
                } else if (handle.includes('w')) { 
                  newRx = startRx! - dx;
                  newX = centerX + dx;
                } else if (handle.includes('s')) { 
                  newRy = startRy! + dy;
                } else if (handle.includes('n')) { 
                  newRy = startRy! - dy;
                  newY = centerY + dy;
                }
                
                return { ...it, x: newX, y: newY, rx: Math.max(1, newRx), ry: Math.max(1, newRy) };
              } else {
                let newR = startR!;
                
                if (handle === 'se' || handle === 'ne' || handle === 'sw' || handle === 'nw') {
                  const dist = Math.hypot(localX - centerX, localY - centerY);
                  newR = Math.max(1, dist);
                } else if (handle.includes('e')) { 
                  newR = Math.max(1, startR! + dx); 
                } else if (handle.includes('w')) { 
                  newR = Math.max(1, startR! - dx); 
                } else if (handle.includes('s')) { 
                  newR = Math.max(1, startR! + dy); 
                } else if (handle.includes('n')) { 
                  newR = Math.max(1, startR! - dy); 
                }
                
                return { ...it, r: newR };
              }
            }
          } else if (it.type === 'arrow') {
            const { handle } = resizeState;
            const origX = item.x;
            const origY = item.y;
            const origX2 = item.x2 || item.x;
            const origY2 = item.y2 || item.y;
            
            const bbX = Math.min(origX, origX2);
            const bbY = Math.min(origY, origY2);
            const bbW = Math.abs(origX2 - origX);
            const bbH = Math.abs(origY2 - origY);
            
            let handleX = 0, handleY = 0;
            if (handle === 'nw') { handleX = bbX; handleY = bbY; }
            else if (handle === 'ne') { handleX = bbX + bbW; handleY = bbY; }
            else if (handle === 'se') { handleX = bbX + bbW; handleY = bbY + bbH; }
            else if (handle === 'sw') { handleX = bbX; handleY = bbY + bbH; }
            else if (handle === 'n') { handleX = bbX + bbW / 2; handleY = bbY; }
            else if (handle === 's') { handleX = bbX + bbW / 2; handleY = bbY + bbH; }
            else if (handle === 'e') { handleX = bbX + bbW; handleY = bbY + bbH / 2; }
            else if (handle === 'w') { handleX = bbX; handleY = bbY + bbH / 2; }
            
            const distToStart = Math.hypot(handleX - origX, handleY - origY);
            const distToEnd = Math.hypot(handleX - origX2, handleY - origY2);
            
            if (distToStart <= distToEnd) {
              return { ...it, x: origX + dx, y: origY + dy };
            } else {
              return { ...it, x2: origX2 + dx, y2: origY2 + dy };
            }
          } else if (it.type === 'path' || it.type === 'polygon') {
            const { handle, startW, startH } = resizeState;
            const origPoints = item.points || [];
            if (!origPoints.length) return it;
            
            let minX = origPoints[0].x, minY = origPoints[0].y, maxX = origPoints[0].x, maxY = origPoints[0].y;
            for (const p of origPoints) {
              if (p.x < minX) minX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.x > maxX) maxX = p.x;
              if (p.y > maxY) maxY = p.y;
            }
            
            let scaleX = 1, scaleY = 1;
            let offsetX = 0, offsetY = 0;
            
            if (handle.includes('e')) { scaleX = (startW! + dx) / startW!; }
            if (handle.includes('w')) { scaleX = (startW! - dx) / startW!; offsetX = dx; }
            if (handle.includes('s')) { scaleY = (startH! + dy) / startH!; }
            if (handle.includes('n')) { scaleY = (startH! - dy) / startH!; offsetY = dy; }
            
            const newPoints = origPoints.map(p => ({
              x: (p.x - minX) * scaleX + minX + offsetX,
              y: (p.y - minY) * scaleY + minY + offsetY
            }));
            
            return { ...it, points: newPoints };
          } else if (it.type === 'text') {
            const { handle, startW, startH } = resizeState;
            const origX = item.x;
            const origY = item.y;
            const textMin = minTextBoxSize(it.fontSize || fontSize);
            
            let newW = startW!;
            let newH = startH!;
            let newX = origX;
            let newY = origY;
            
            if (handle.includes('e')) { newW = Math.max(textMin.w, startW! + dx); }
            if (handle.includes('w')) {
              newW = Math.max(textMin.w, startW! - dx);
              newX = origX + (startW! - newW);
            }
            if (handle.includes('s')) { newH = Math.max(textMin.h, startH! + dy); }
            if (handle.includes('n')) {
              newH = Math.max(textMin.h, startH! - dy);
              newY = origY + (startH! - newH);
            }
            
            return { ...it, x: newX, y: newY, w: newW, h: newH };
          }
        }
        return it;
      });
        const updated = mapped.find((it) => it && it.id === item.id);
        if (!updated || !startBb || !rot) return mapped;
        const nextBb = getItemBounds(updated);
        if (!nextBb) return mapped;
        const shift = shiftToKeepHandleAnchor(startBb, nextBb, resizeState.handle, rot);
        if (!shift.x && !shift.y) return mapped;
        return mapped.map((it) => {
          if (!it || it.id !== item.id) return it;
          return {
            ...it,
            x: it.x + shift.x,
            y: it.y + shift.y,
            ...(it.x2 != null ? { x2: it.x2 + shift.x } : {}),
            ...(it.y2 != null ? { y2: it.y2 + shift.y } : {}),
            ...(it.points ? { points: it.points.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })) } : {}),
          };
        });
      });
      return;
    }
    
    if (movingRef.current) {
      setOverlayCursor('grabbing');
      const moveState = movingRef.current;
      const dx = x - moveState.startX;
      const dy = y - moveState.startY;
      
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        livePatchItems(prev => prev.map(it => {
          if (!it || !it.id) return it;
          if (it.id === moveState.item.id) {
            const origX = moveState.item.x;
            const origY = moveState.item.y;
            
            if (it.type === 'rect') {
              return { ...it, x: origX + dx, y: origY + dy };
            } else if (it.type === 'arrow') {
              const origX2 = moveState.item.x2 || moveState.item.x;
              const origY2 = moveState.item.y2 || moveState.item.y;
              return { 
                ...it, 
                x: origX + dx, 
                y: origY + dy, 
                x2: origX2 + dx, 
                y2: origY2 + dy 
              };
            } else if (it.type === 'text') {
              return { ...it, x: origX + dx, y: origY + dy };
            } else if (it.type === 'circle') {
              return { ...it, x: origX + dx, y: origY + dy };
            } else if (it.type === 'path' || it.type === 'polygon') {
              const origPoints = moveState.item.points || [];
              return { 
                ...it, 
                points: origPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) 
              };
            }
          }
          return it;
        }));
      }
    }
  };

  const handleOverlayMouseUp = () => {
    // Commit pan offsets after live ref updates
    if (draggingRef.current && mode === 'select' && !drawingRef.current && !movingRef.current && !resizingRef.current && !rotatingRef.current) {
      setOffsetX(offsetXRef.current);
      setOffsetY(offsetYRef.current);
      draggingRef.current = null;
    }
    
    if (textSelectingRef.current) {
      textSelectingRef.current = false;
      setItems([...itemsRef.current]);
    }
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      const x = Math.min(m.x, m.x2);
      const y = Math.min(m.y, m.y2);
      const w = Math.abs(m.x2 - m.x);
      const h = Math.abs(m.y2 - m.y);
      const sel: string[] = [];
      for (const it of itemsRef.current) {
        if (!it || !it.id) continue;
        const b = getItemBounds(it);
        if (b) {
          const aabb = getRotatedAabb(b, annotationRotationDeg(it));
          if (aabb.x >= x && aabb.y >= y && (aabb.x + aabb.w) <= x + w && (aabb.y + aabb.h) <= y + h) {
            sel.push(it.id);
          }
        }
      }
      selectedIdsRef.current = sel;
      setSelectedIds(sel);
      marqueeRef.current = null;
      drawOverlay();
    }

    const hadMoveOrResize = !!(movingRef.current || resizingRef.current || rotatingRef.current);
    
    // If we just finished drawing rect, arrow, circle, or text, switch to select mode
    const keepPolygonDrawing = mode === 'polygon' && drawingRef.current?.type === 'polygon';
    if (drawingRef.current && !keepPolygonDrawing) {
      const drawnType = drawingRef.current.type;
      const drawnId = drawingRef.current.id;
      if (drawnType === 'rect' || drawnType === 'circle') {
        // Normalize coordinates from live ref (source of truth during drag)
        itemsRef.current = itemsRef.current.map(it => {
          if (!it || !it.id || it.id !== drawnId) return it;
          const currentW = it.w || 0;
          const currentH = it.h || 0;
          let newX = it.x;
          let newY = it.y;
          let newW = currentW;
          let newH = currentH;
          
          if (currentW < 0) {
            newX = it.x + currentW;
            newW = Math.abs(currentW);
          }
          if (currentH < 0) {
            newY = it.y + currentH;
            newH = Math.abs(currentH);
          }
          
          return { ...it, x: newX, y: newY, w: newW, h: newH };
        }).filter(it => it && it.id) as AnnotationItem[];
        setItems([...itemsRef.current]);
        setMode('select');
      } else if (drawnType === 'arrow' || drawnType === 'path') {
        setItems([...itemsRef.current]);
        setMode('select');
      } else if (drawnType === 'text') {
        const textItem =
          drawingRef.current.type === 'text'
            ? drawingRef.current
            : itemsRef.current.find(it => it && it.id === drawnId);
        const w = Math.abs(textItem?.w || 0);
        const h = Math.abs(textItem?.h || 0);
        const created = !!(textItem && w >= 8 && h >= 8 && itemsRef.current.some(it => it.id === drawnId));

        if (created && textItem) {
          // Normalize top-left + positive size
          const textMin = minTextBoxSize(textItem.fontSize || fontSize);
          let newX = textItem.x;
          let newY = textItem.y;
          let newW = textItem.w || w;
          let newH = textItem.h || h;
          if ((textItem.w || 0) < 0) {
            newX = textItem.x + (textItem.w || 0);
            newW = Math.abs(textItem.w || 0);
          }
          if ((textItem.h || 0) < 0) {
            newY = textItem.y + (textItem.h || 0);
            newH = Math.abs(textItem.h || 0);
          }
          newW = Math.max(textMin.w, newW);
          newH = Math.max(textMin.h, newH);

          itemsRef.current = itemsRef.current.map(it =>
            it.id === drawnId
              ? { ...it, x: newX, y: newY, w: newW, h: newH, _editing: true, cursorPosition: 0 }
              : it
          );
          setItems([...itemsRef.current]);
          selectedIdsRef.current = [drawnId];
          setSelectedIds([drawnId]);
          textEditingRef.current = drawnId;
          textCursorPositionRef.current = 0;
          setMode('select');
          startTextCursorBlink();
          overlayRef.current?.focus();
        } else {
          // Click without meaningful drag — discard stub
          itemsRef.current = itemsRef.current.filter(it => it && it.id && it.id !== drawnId);
          setItems([...itemsRef.current]);
          textEditingRef.current = null;
          stopTextCursorBlink();
          setMode('select');
        }
      }
    } else if (hadMoveOrResize) {
      setItems([...itemsRef.current]);
    }
    
    if (!keepPolygonDrawing) {
      drawingRef.current = null;
    }
    movingRef.current = null;
    resizingRef.current = null;
    rotatingRef.current = null;
  };

  // Keyboard handlers
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't delete when editing text - ESC should exit edit mode instead
        if (textEditingRef.current) {
          const editingItem = itemsRef.current.find(it => it && it.id === textEditingRef.current && it.type === 'text');
          if (editingItem) {
            const patchEditing = (updater: (it: AnnotationItem) => AnnotationItem) => {
              const id = textEditingRef.current;
              const next = itemsRef.current
                .map((it) => (!it || !it.id || it.id !== id ? it : updater(it)))
                .filter((it) => it && it.id) as AnnotationItem[];
              itemsRef.current = next;
              setItems(next);
              drawOverlayRef.current();
            };
            const currentText = editingItem.text || '';
            let cursorPos = editingItem.cursorPosition !== undefined ? editingItem.cursorPosition : currentText.length;
            cursorPos = Math.max(0, Math.min(cursorPos, currentText.length));
            let selStart = textSelectionStartRef.current;

            const hasSelection = selStart !== null && selStart !== cursorPos;
            const normSelection = () => {
              if (selStart === null) return { start: cursorPos, end: cursorPos };
              const start = Math.min(selStart, cursorPos);
              const end = Math.max(selStart, cursorPos);
              return { start, end };
            };
          
            if (e.key === 'ArrowLeft') {
            e.preventDefault();
              if (e.shiftKey) {
                if (selStart === null) selStart = cursorPos;
                cursorPos = Math.max(0, cursorPos - 1);
                textSelectionStartRef.current = selStart;
              } else {
                cursorPos = Math.max(0, cursorPos - 1);
                selStart = null;
                textSelectionStartRef.current = null;
              }
              textCursorPositionRef.current = cursorPos;
              const { start, end } = normSelection();
              setItems(prev => prev.map(it =>
                !it || !it.id ? it : (it.id === textEditingRef.current ? { ...it, cursorPosition: cursorPos, selectionStart: selStart === null ? undefined : start, selectionEnd: selStart === null ? undefined : end } : it)
              ).filter(it => it && it.id));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (e.shiftKey) {
              if (selStart === null) selStart = cursorPos;
              cursorPos = Math.min(currentText.length, cursorPos + 1);
              textSelectionStartRef.current = selStart;
            } else {
              cursorPos = Math.min(currentText.length, cursorPos + 1);
              selStart = null;
              textSelectionStartRef.current = null;
            }
            textCursorPositionRef.current = cursorPos;
            const { start, end } = normSelection();
              setItems(prev => prev.map(it =>
                !it || !it.id ? it : (it.id === textEditingRef.current ? { ...it, cursorPosition: cursorPos, selectionStart: selStart === null ? undefined : start, selectionEnd: selStart === null ? undefined : end } : it)
              ).filter(it => it && it.id));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            // Move to start of current line or previous line
            const textBefore = currentText.substring(0, cursorPos);
            const lastNewline = textBefore.lastIndexOf('\n');
            if (lastNewline >= 0) {
              const lineStart = lastNewline + 1;
              const currentLineStart = lineStart;
              const prevLineStart = textBefore.lastIndexOf('\n', lastNewline - 1) + 1;
              const offsetInLine = cursorPos - currentLineStart;
              cursorPos = Math.min(prevLineStart + offsetInLine, lastNewline);
            } else {
              cursorPos = 0;
            }
            textCursorPositionRef.current = cursorPos;
            textSelectionStartRef.current = selStart; // keep selection anchor if using Shift+Up/Down later
            const { start, end } = normSelection();
              setItems(prev => prev.map(it =>
                !it || !it.id ? it : (it.id === textEditingRef.current ? { ...it, cursorPosition: cursorPos, selectionStart: selStart === null ? undefined : start, selectionEnd: selStart === null ? undefined : end } : it)
              ).filter(it => it && it.id));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            // Move to next line
            const textBefore = currentText.substring(0, cursorPos);
            const lastNewline = textBefore.lastIndexOf('\n');
            const lineStart = lastNewline + 1;
            const offsetInLine = cursorPos - lineStart;
            const textAfter = currentText.substring(cursorPos);
            const nextNewline = textAfter.indexOf('\n');
            if (nextNewline >= 0) {
              cursorPos = cursorPos + nextNewline + 1 + Math.min(offsetInLine, nextNewline);
            } else {
              cursorPos = currentText.length;
            }
            textCursorPositionRef.current = cursorPos;
            textSelectionStartRef.current = selStart;
            const { start, end } = normSelection();
              setItems(prev => prev.map(it =>
                !it || !it.id ? it : (it.id === textEditingRef.current ? { ...it, cursorPosition: cursorPos, selectionStart: selStart === null ? undefined : start, selectionEnd: selStart === null ? undefined : end } : it)
              ).filter(it => it && it.id));
          } else if (e.key === 'Backspace') {
            e.preventDefault();
            const { start, end } = hasSelection ? normSelection() : { start: cursorPos - 1, end: cursorPos };
            if (start >= 0 && end > start) {
              const newText = currentText.substring(0, start) + currentText.substring(end);
              cursorPos = start;
              textCursorPositionRef.current = cursorPos;
              textSelectionStartRef.current = null;
              patchEditing(it => ({ ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined }));
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const { start, end } = hasSelection ? normSelection() : { start: cursorPos, end: cursorPos };
            const newText = currentText.substring(0, start) + '\n' + currentText.substring(end);
            cursorPos = start + 1;
            textCursorPositionRef.current = cursorPos;
            textSelectionStartRef.current = null;
            patchEditing(it => ({ ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined }));
          } else if (e.key === 'Escape') {
            e.preventDefault();
            // Unified behavior for ESC while editing text
            exitTextEditing();
          } else if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
            // Copy selection to clipboard (or whole text if nothing selected)
            e.preventDefault();
            const { start, end } = hasSelection ? normSelection() : { start: 0, end: currentText.length };
            const selectedText = currentText.substring(start, end);
            if (selectedText) {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(selectedText).catch(() => {});
              }
            }
          } else if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) {
            // Select all
            e.preventDefault();
            textSelectionStartRef.current = 0;
            cursorPos = currentText.length;
            textCursorPositionRef.current = cursorPos;
            setItems(prev => prev.map(it =>
              !it || !it.id ? it : (it.id === textEditingRef.current ? {
                ...it,
                cursorPosition: cursorPos,
                selectionStart: 0, 
                selectionEnd: currentText.length 
              } : it)
            ).filter(it => it && it.id));
          } else if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
            // Paste from clipboard, replacing selection or inserting at caret
            e.preventDefault();
            const applyPaste = (pasteText: string) => {
              if (!pasteText) return;
              const { start, end } = hasSelection ? normSelection() : { start: cursorPos, end: cursorPos };
              const newText = currentText.substring(0, start) + pasteText + currentText.substring(end);
              cursorPos = start + pasteText.length;
              textCursorPositionRef.current = cursorPos;
              textSelectionStartRef.current = null;
              setItems(prev => prev.map(it => 
                !it || !it.id ? it : (it.id === textEditingRef.current ? { 
                  ...it, 
                  text: newText, 
                  cursorPosition: cursorPos,
                  selectionStart: undefined,
                  selectionEnd: undefined
                } : it)
              ).filter(it => it && it.id));
            };

            if (navigator.clipboard && navigator.clipboard.readText) {
              navigator.clipboard.readText().then(applyPaste).catch(() => {});
            }
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const { start, end } = hasSelection ? normSelection() : { start: cursorPos, end: cursorPos };
            const newText = currentText.substring(0, start) + e.key + currentText.substring(end);
            cursorPos = start + 1;
            textCursorPositionRef.current = cursorPos;
            textSelectionStartRef.current = null;
            patchEditing(it => ({ ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined }));
          }
        }
      } else if (e.key === 'Delete' && selectedIds.length) {
        // Only delete when not editing text
        setItems(prev => prev.filter(it => it && it.id && !selectedIds.includes(it.id)));
        setSelectedIds([]);
      } else if (mode === 'polygon' && drawingRef.current?.type === 'polygon') {
        if (e.key === 'Enter') {
          e.preventDefault();
          finalizePolygon(false);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelPolygonDrawing();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          popPolygonVertex();
        }
      } else if (e.key === 'Escape' && mode !== 'select' && mode !== 'pan') {
        // Escape key -> return to select mode
        setMode('select');
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIds, items, mode, finalizePolygon, cancelPolygonDrawing, popPolygonVertex, exitTextEditing]);

  // Reset
  const handleReset = () => {
    prevAngleRef.current = 0;
    setAngle(0);
    const fit =
      img && canvasDimensions.width > 0
        ? computeEditorFitScale(
            canvasDimensions.width,
            canvasDimensions.height,
            img.naturalWidth,
            img.naturalHeight,
            0,
          )
        : 1;
    setScale(fit);
    setOffsetX(0);
    setOffsetY(0);
    itemsRef.current = [];
    setItems([]);
    selectedIdsRef.current = [];
    setSelectedIds([]);
    stopTextCursorBlink();
    textEditingRef.current = null;
    drawingRef.current = null;
    polygonPreviewRef.current = null;
  };

  // Save
  const handleSave = async () => {
    if (isSaving) return; // Prevent multiple saves
    
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay || !img) return;

    let itemsToRender = itemsRef.current;
    if (drawingRef.current?.type === 'polygon') {
      const drawnId = drawingRef.current.id;
      itemsToRender = itemsToRender.filter((it) => it?.id !== drawnId);
      drawingRef.current = null;
      polygonPreviewRef.current = null;
    }
    
    setIsSaving(true);
    
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = scale;
    const clamped = clampOffset(offsetX, offsetY);
    const cx = displayWidth / 2;
    const cy = displayHeight / 2;
    const angleRad = (angle * Math.PI) / 180;

    // Export canvas represents the visible frame at natural resolution.
    // Each display pixel covers 1/s natural pixels, so the visible frame is displayW/s × displayH/s.
    // At fitScale (initial load, no pan) this equals iw × ih (full image). When zoomed in it
    // is a crop — exactly what the user sees, with no room for white margins.
    const outW = Math.round(displayWidth / s);
    const outH = Math.round(displayHeight / s);
    
    // Transform display coords to export canvas coords.
    // Pan and rotation terms cancel completely; only scale + re-center is needed.
    const dispToImg = (xd: number, yd: number): { xi: number; yi: number } => ({
      xi: (xd - cx) / s + outW / 2,
      yi: (yd - cy) / s + outH / 2,
    });
    const lenScale = 1 / s; // scale factor for stroke, fontSize, w, h
    
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = outW;
    finalCanvas.height = outH;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.save();
    ctx.clearRect(0, 0, outW, outH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.translate(outW / 2 + clamped.x / s, outH / 2 + clamped.y / s);
    ctx.rotate(angleRad);
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
    
    // Draw annotations in image coordinates (scaled from display)
    for (const it of itemsToRender) {
      if (!it || !it.id) continue;
      ctx.save();
      const overlayBb = getItemBounds(it);
      if (overlayBb) {
        const p1 = dispToImg(overlayBb.x, overlayBb.y);
        const p2 = dispToImg(overlayBb.x + overlayBb.w, overlayBb.y + overlayBb.h);
        applyAnnotationRotation(
          ctx,
          {
            x: Math.min(p1.xi, p2.xi),
            y: Math.min(p1.yi, p2.yi),
            w: Math.abs(p2.xi - p1.xi),
            h: Math.abs(p2.yi - p1.yi),
          },
          annotationRotationDeg(it),
        );
      }
      ctx.strokeStyle = it.color;
      ctx.fillStyle = it.color;
      ctx.lineWidth = Math.max(0.5, (it.stroke || 1) * lenScale);
      
      if (it.type === 'rect') {
        const p = dispToImg(it.x, it.y);
        const w = (it.w || 0) * lenScale;
        const h = (it.h || 0) * lenScale;
        const enabled = it.fillEnabled !== undefined ? it.fillEnabled : fillEnabled;
        applyShapeFill(
          ctx,
          { kind: 'rect', x: p.xi, y: p.yi, w, h },
          {
            enabled,
            color: it.fillColor || fillColor,
            opacity: it.fillOpacity !== undefined ? it.fillOpacity : fillOpacity,
            pattern: it.fillPattern || fillPattern,
            scale: lenScale,
          },
        );
        ctx.strokeStyle = it.color;
        ctx.lineWidth = Math.max(0.5, (it.stroke || 1) * lenScale);
        ctx.strokeRect(p.xi, p.yi, w, h);
      } else if (it.type === 'arrow') {
        const p1 = dispToImg(it.x, it.y);
        const p2 = dispToImg(it.x2 ?? it.x, it.y2 ?? it.y);
        const strokeW = Math.max(0.5, (it.stroke || 1) * lenScale);
        drawArrow(ctx, p1.xi, p1.yi, p2.xi, p2.yi, strokeW);
      } else if (it.type === 'text') {
        const itemFontSize = Math.max(8, (it.fontSize || fontSize) * lenScale);
        ctx.font = `${itemFontSize}px Montserrat`;
        const padding = 4 * lenScale;
        const textContent = it.text || '';
        const boxW = (it.w || 200) * lenScale;
        const boxH = (it.h || 30) * lenScale;
        const maxWidth = boxW - padding * 2;
        const lineHeight = itemFontSize * 1.2;
        const p = dispToImg(it.x, it.y);
        const startY = p.yi + padding + itemFontSize;
        
        const lines: string[] = [];
        const paragraphs = textContent.split('\n');
        for (const para of paragraphs) {
          if (!para.trim() && lines.length > 0) {
            lines.push('');
            continue;
          }
          const words = para.split(' ');
          let currentLine = '';
          for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const wordMetrics = ctx.measureText(word);
            if (wordMetrics.width > maxWidth) {
              if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
              }
              let charLine = '';
              for (let j = 0; j < word.length; j++) {
                const charTest = charLine + word[j];
                const charMetrics = ctx.measureText(charTest);
                if (charMetrics.width > maxWidth && charLine) {
                  lines.push(charLine);
                  charLine = word[j];
                } else {
                  charLine = charTest;
                }
              }
              currentLine = charLine;
            } else {
              const testLine = currentLine + (currentLine ? ' ' : '') + word;
              const metrics = ctx.measureText(testLine);
              if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }
          }
          if (currentLine) lines.push(currentLine);
        }
        if (lines.length === 0) lines.push('');
        
        const bgEnabled = it.textBackgroundEnabled !== undefined ? it.textBackgroundEnabled : textBackgroundEnabled;
        if (bgEnabled && it.w && it.h) {
          const bgColor = it.textBackgroundColor || textBackgroundColor;
          const bgOpacity = it.textBackgroundOpacity !== undefined ? it.textBackgroundOpacity : textBackgroundOpacity;
          ctx.fillStyle = hexToRgba(bgColor, bgOpacity);
          ctx.fillRect(p.xi, p.yi, boxW, boxH);
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.xi, p.yi, boxW, boxH);
        ctx.clip();
        ctx.fillStyle = it.color;
        let y = startY;
        const maxY = p.yi + boxH - padding;
        for (let i = 0; i < lines.length; i++) {
          if (y > maxY) break;
          ctx.fillText(lines[i], p.xi + padding, y);
          y += lineHeight;
        }
        ctx.restore();
      } else if (it.type === 'circle') {
        // Must match drawOverlay: new circles use top-left (x,y) + w,h; old ones use center + r or rx/ry.
        let geometry;
        if (it.w !== undefined && it.h !== undefined) {
          const c = dispToImg(it.x + (it.w || 0) / 2, it.y + (it.h || 0) / 2);
          geometry = {
            kind: 'ellipse' as const,
            cx: c.xi,
            cy: c.yi,
            rx: (Math.abs(it.w || 0) / 2) * lenScale,
            ry: (Math.abs(it.h || 0) / 2) * lenScale,
          };
        } else if (it.rx !== undefined && it.ry !== undefined) {
          const c = dispToImg(it.x, it.y);
          geometry = {
            kind: 'ellipse' as const,
            cx: c.xi,
            cy: c.yi,
            rx: Math.max(1, (it.rx || 1) * lenScale),
            ry: Math.max(1, (it.ry || 1) * lenScale),
          };
        } else {
          const c = dispToImg(it.x, it.y);
          const r = Math.max(1, (it.r || 1) * lenScale);
          geometry = { kind: 'ellipse' as const, cx: c.xi, cy: c.yi, rx: r, ry: r };
        }
        const enabled = it.fillEnabled !== undefined ? it.fillEnabled : fillEnabled;
        applyShapeFill(ctx, geometry, {
          enabled,
          color: it.fillColor || fillColor,
          opacity: it.fillOpacity !== undefined ? it.fillOpacity : fillOpacity,
          pattern: it.fillPattern || fillPattern,
          scale: lenScale,
        });
        ctx.strokeStyle = it.color;
        ctx.lineWidth = Math.max(0.5, (it.stroke || 1) * lenScale);
        // beginPath() is required — otherwise the canvas connects this arc to the previous subpath.
        ctx.beginPath();
        if (Math.abs(geometry.rx - geometry.ry) < 1e-6) {
          ctx.arc(geometry.cx, geometry.cy, Math.max(1, geometry.rx), 0, Math.PI * 2);
        } else {
          ctx.ellipse(geometry.cx, geometry.cy, Math.max(1, geometry.rx), Math.max(1, geometry.ry), 0, 0, Math.PI * 2);
        }
        ctx.stroke();
      } else if (it.type === 'path') {
        const pts = it.points || [];
        if (pts.length > 1) {
          const first = dispToImg(pts[0].x, pts[0].y);
          ctx.beginPath();
          ctx.moveTo(first.xi, first.yi);
          for (let i = 1; i < pts.length; i++) {
            const pt = dispToImg(pts[i].x, pts[i].y);
            ctx.lineTo(pt.xi, pt.yi);
          }
          ctx.stroke();
        }
      } else if (it.type === 'polygon') {
        const pts = it.points || [];
        if (pts.length >= 2) {
          const imgPts = pts.map((p) => dispToImg(p.x, p.y));
          if (it.closed && imgPts.length >= 3) {
            const enabled = it.fillEnabled !== undefined ? it.fillEnabled : fillEnabled;
            applyShapeFill(
              ctx,
              {
                kind: 'polygon',
                points: imgPts.map((p) => ({ x: p.xi, y: p.yi })),
              },
              {
                enabled,
                color: it.fillColor || fillColor,
                opacity: it.fillOpacity !== undefined ? it.fillOpacity : fillOpacity,
                pattern: it.fillPattern || fillPattern,
                scale: lenScale,
              },
            );
          }
          ctx.strokeStyle = it.color;
          ctx.lineWidth = Math.max(0.5, (it.stroke || 1) * lenScale);
          ctx.beginPath();
          ctx.moveTo(imgPts[0].xi, imgPts[0].yi);
          for (let i = 1; i < imgPts.length; i++) {
            ctx.lineTo(imgPts[i].xi, imgPts[i].yi);
          }
          if (it.closed) ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    
    // Convert to blob and save
    try {
      await new Promise<void>((resolve, reject) => {
        finalCanvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await onSave(blob);
              onClose();
              resolve();
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error('Failed to create blob'));
          }
        }, 'image/png');
      });
    } catch (e: any) {
      console.error('Failed to save image:', e);
      // Error handling is done by onSave callback
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  // Calculate modal size based on canvas dimensions (or match the picker dialog when requested)
  const canvasWidth = canvasDimensions.width || canvasRef.current?.width || 0;
  const canvasHeight = canvasDimensions.height || canvasRef.current?.height || 0;
  const sidebarWidth = 240; // matches ImagePicker upload/gallery column
  const padding = 32; // p-4 = 16px * 2
  const headerHeight = 60; // approximate header height
  const matchedW = matchDialogSize && matchDialogSize.width > 0 ? matchDialogSize.width : null;
  const matchedH = matchDialogSize && matchDialogSize.height > 0 ? matchDialogSize.height : null;
  const modalWidth = matchedW
    ?? (isLoading ? 800 : (canvasWidth > 0 ? canvasWidth + sidebarWidth + padding : 1200));
  const modalHeight = matchedH
    ?? (isLoading ? 600 : (canvasHeight > 0 ? Math.max(canvasHeight, 400) + headerHeight + padding + 88 : 700));
  const clampedModalWidth = Math.min(modalWidth, typeof window !== 'undefined' ? window.innerWidth - 32 : modalWidth);
  const clampedModalHeight = Math.min(modalHeight, typeof window !== 'undefined' ? window.innerHeight - 32 : modalHeight);
  const progressOverlayClassName =
    overlayClassName === uiModalLayer.nestedEditor
      ? 'z-[225]'
      : overlayClassName === uiModalLayer.nestedPicker
        ? uiModalLayer.nestedPickerBusy
        : 'z-[60]';

  return (
    <>
      <style>{sliderStyle}</style>
      <OverlayPortal>
      <div
        className={uiCx(
          'fixed inset-0 flex items-center justify-center bg-black/45 p-4',
          overlayClassName ?? uiModalLayer.default,
        )}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-editor-title"
          className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/[0.06]"
          style={{
            width: `${clampedModalWidth}px`,
            ...(matchedH
              ? { height: `${clampedModalHeight}px`, maxHeight: `${clampedModalHeight}px` }
              : { maxHeight: '95vh' }),
            maxWidth: 'min(98vw, calc(100vw - 2rem))',
          }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200/85 bg-gradient-to-b from-white to-slate-50/90 px-4 py-3">
            <h2 id="image-editor-title" className={`${editorPanelTitleClass} truncate`}>
              Edit image<span className="text-slate-500 font-normal">: {imageName}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className={`${editorTransitionInteractive} flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35`}
              title="Close"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <div ref={containerRef} className="isolate flex min-h-0 min-w-0 flex-1 gap-0 overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-50/80">
                <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]">
                <div className="inline-flex max-w-full flex-col">
                {(() => {
                  const frameW =
                    canvasWidth > 0
                      ? canvasWidth
                      : matchDialogSize
                        ? Math.max(200, Math.round(matchDialogSize.width - sidebarWidth - 32))
                        : 480;
                  const frameH =
                    canvasHeight > 0
                      ? canvasHeight
                      : matchDialogSize
                        ? Math.max(200, Math.round(matchDialogSize.height - headerHeight - 120))
                        : 360;
                  return (
                <>
                <div className="relative inline-block">
                  <div
                    className="flex-shrink-0"
                    style={{ width: `${frameW}px`, maxWidth: `${frameW}px` }}
                  >
                {loadError && !isLoading && (
                  <div className="flex items-center justify-center p-8">
                    <div className="text-center">
                      <div className="mb-2 font-semibold text-red-700">Error</div>
                      <div className="mb-4 max-w-md text-sm text-slate-600">{loadError}</div>
                      <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className={`${editorTransitionInteractive} rounded-md bg-brand-red px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/45`}
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}
                {!loadError && (
                  <div
                    className="inline-block rounded-md border-2 border-slate-500 bg-slate-200/95 p-px shadow-[0_2px_8px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/10"
                    title="Editing area — same frame style as Image picker"
                  >
                    <div
                      className="relative overflow-hidden rounded-[3px] bg-slate-200"
                      style={canvasWidth <= 0 ? { width: frameW, height: frameH } : undefined}
                    >
                    <canvas
                      ref={canvasRef}
                      className="block"
                      style={{ 
                        cursor: ((mode === 'pan' || mode === 'select') && !textEditingRef.current) ? (draggingRef.current ? 'grabbing' : 'grab') : 'default',
                        display: canvasWidth > 0 ? 'block' : 'none',
                        pointerEvents: textEditingRef.current ? 'none' : 'auto',
                        touchAction: 'none'
                      }}
                      onPointerDown={handleCanvasPointerDown}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                    />
                    <canvas
                      ref={overlayRef}
                      className="absolute left-0 top-0"
                      tabIndex={0}
                      style={{ 
                        display: canvasWidth > 0 ? 'block' : 'none',
                        cursor: mode === 'draw'
                          ? `url("${pencilCursorIcon}") 6 28, auto`
                          : mode === 'select' || mode === 'delete'
                            ? 'move'
                            : mode !== 'pan'
                              ? 'crosshair'
                              : textEditingRef.current
                                ? 'text'
                                : 'default',
                        pointerEvents: mode !== 'pan' ? 'auto' : (textEditingRef.current ? 'auto' : 'none'),
                        outline: 'none'
                      }}
                      onMouseMove={(e) => {
                        // Skip expensive hover hit-tests while a gesture is in progress
                        if (
                          !(mode === 'select' || mode === 'delete') ||
                          drawingRef.current ||
                          movingRef.current ||
                          resizingRef.current ||
                          rotatingRef.current ||
                          draggingRef.current ||
                          marqueeRef.current ||
                          textSelectingRef.current
                        ) {
                          if (movingRef.current || draggingRef.current) {
                            setOverlayCursor('grabbing');
                          } else if (rotatingRef.current) {
                            setOverlayCursor(ROTATE_CURSOR);
                          }
                          handleOverlayMouseMove(e);
                          return;
                        }

                        const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        const last = lastCursorPosRef.current;
                        if (last && Math.abs(last.x - x) < 2 && Math.abs(last.y - y) < 2) {
                          handleOverlayMouseMove(e);
                          return;
                        }
                        lastCursorPosRef.current = { x, y };

                        let cursor = 'default';
                        let handleFound = false;
                        if (mode === 'select') {
                          for (const item of itemsRef.current) {
                            if (!item || !item.id) continue;
                            if (selectedIdsRef.current.includes(item.id)) {
                              const handle = getHandleAt(x, y, item);
                              if (handle) {
                                cursor = resizeCursorForHandle(handle, annotationRotationDeg(item));
                                handleFound = true;
                                break;
                              }
                            }
                          }
                        }

                        if (!handleFound) {
                          const hit = itemAt(x, y);
                          if (hit) {
                            cursor = hit.type === 'text' && textEditingRef.current === hit.id ? 'text' : 'move';
                          } else if (mode === 'select') {
                            cursor = 'grab';
                          } else {
                            cursor = 'default';
                          }
                        }

                        setOverlayCursor(cursor);
                        handleOverlayMouseMove(e);
                      }}
                      onWheel={(e) => {
                        // Handle zoom when in select or pan mode
                        if (textEditingRef.current || (mode !== 'pan' && mode !== 'select')) return;
                        if (!img) return;
                        
                        e.preventDefault();
                        e.stopPropagation();
                        
                        const factor = e.deltaY < 0 ? 1.06 : 1/1.06;
                        const currentScale = scaleRef.current;
                        const currentOffsetX = offsetXRef.current;
                        const currentOffsetY = offsetYRef.current;
                        const base = fitScale || 1;
                        const newZoom = Math.min(
                          EDITOR_ZOOM_MAX,
                          Math.max(EDITOR_ZOOM_MIN, (currentScale / base) * factor),
                        );
                        const newScale = newZoom * base;
                        
                        // Recalculate clamp values with new scale
                        const clamped = clampOffset(currentOffsetX, currentOffsetY, newScale);
                        setScale(newScale);
                        setOffsetX(clamped.x);
                        setOffsetY(clamped.y);
                      }}
                      onMouseDown={handleOverlayMouseDown}
                      onMouseUp={handleOverlayMouseUp}
                      onMouseLeave={handleOverlayMouseUp}
                      onFocus={() => {
                        // Focus canvas when editing text
                        if (textEditingRef.current && overlayRef.current) {
                          overlayRef.current.focus();
                        }
                      }}
                    />
                    {(isLoading || canvasWidth <= 0) && (
                      <div className="absolute inset-0 z-[1] grid place-items-center bg-slate-200 text-sm text-slate-600">
                        Loading image…
                      </div>
                    )}
                    <div
                      className="pointer-events-none absolute inset-0 z-[2] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.22)]"
                      aria-hidden
                    />
                    </div>
                  </div>
                )}
                  </div>
                </div>
                </>
                  );
                })()}
                </div>
                </div>

                <div className="w-full shrink-0 border-t border-slate-200/80 bg-slate-50/80 px-4 pb-4 pt-3">
                  <p className={`${editorCaptionClass} mb-2 text-center text-slate-500`}>
                    {canvasWidth > 0 && canvasHeight > 0
                      ? `Editing area: ${canvasWidth} × ${canvasHeight}px`
                      : 'Editing area'}
                  </p>
                  <div className="flex w-full flex-nowrap items-center gap-2">
                    <div className="custom-slider-container mb-0 min-w-0 flex-1">
                      <span className="flex w-11 shrink-0 text-xs font-medium text-slate-700">Zoom</span>
                      <input
                        type="range"
                        min={EDITOR_ZOOM_MIN}
                        max={EDITOR_ZOOM_MAX}
                        step={0.01}
                        disabled={isLoading || !img}
                        value={Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, displayZoom))}
                        onChange={(e) => applyDisplayZoom(parseFloat(e.target.value || '1'))}
                        className="custom-slider"
                        style={{
                          background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, displayZoom)) - EDITOR_ZOOM_MIN) / (EDITOR_ZOOM_MAX - EDITOR_ZOOM_MIN)) * 100}%, #e5e7eb ${((Math.min(EDITOR_ZOOM_MAX, Math.max(EDITOR_ZOOM_MIN, displayZoom)) - EDITOR_ZOOM_MIN) / (EDITOR_ZOOM_MAX - EDITOR_ZOOM_MIN)) * 100}%, #e5e7eb 100%)`
                        }}
                      />
                      <div className="custom-slider-value">{displayZoom.toFixed(2)}×</div>
                    </div>
                    <button
                      type="button"
                      disabled={isLoading || !img}
                      onClick={() => setAngle((prev) => (prev + 270) % 360)}
                      className={`${selectionToolButtonGhostClass} h-8 shrink-0 px-3 text-xs font-semibold disabled:opacity-50`}
                    >
                      ⟲ Left
                    </button>
                    <button
                      type="button"
                      disabled={isLoading || !img}
                      onClick={() => setAngle((prev) => (prev + 90) % 360)}
                      className={`${selectionToolButtonGhostClass} h-8 shrink-0 px-3 text-xs font-semibold disabled:opacity-50`}
                    >
                      ⟳ Right
                    </button>
                    <button
                      type="button"
                      disabled={isLoading || !img}
                      onClick={handleReset}
                      className={`${selectionToolButtonGhostClass} h-9 shrink-0 px-3 text-xs font-semibold disabled:opacity-50`}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isLoading || isSaving || !img}
                      className={`${editorTransitionInteractive} inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-brand-red px-4 text-xs font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/45 disabled:opacity-50`}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>

              <aside
                className="relative z-[1] box-border flex h-full min-h-0 w-[240px] min-w-[240px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-l border-slate-200/90 bg-white/95 px-3 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.95)] ring-1 ring-slate-900/[0.04] [scrollbar-gutter:stable]"
              >
                <div className="flex min-h-0 flex-1 flex-col gap-3 content-start">
              <div>
                <span className={`${editorGroupLabelClass} mb-2 block`}>Tools</span>
                <div className="grid grid-cols-4 gap-1.5">
                  <button onClick={() => {
                    // Disable text editing when changing tools
                    if (textEditingRef.current) {
                      exitTextEditing();
                    } else {
                      // Also clear current selection when entering select mode,
                      // so nothing starts pre-selected
                      if (mode !== 'select') {
                        setSelectedIds([]);
                      }
                    }
                    setMode('select');
                  }} className={mode === 'select' ? toolBtnActive : toolBtnIdle} title="Select">
                    <img src={selectIcon} alt="Select" className="w-6 h-6" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('rect');
                  }} className={mode === 'rect' ? toolBtnActive : toolBtnIdle} title="Rectangle">
                    <img src={rectIcon} alt="Rect" className="w-6 h-6" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('arrow');
                  }} className={mode === 'arrow' ? toolBtnActive : toolBtnIdle} title="Arrow">
                    <img src={arrowIcon} alt="Arrow" className="w-6 h-6" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('text');
                  }} className={mode === 'text' ? toolBtnActive : toolBtnIdle} title="Text">
                    <img src={textIcon} alt="Text" className="w-5 h-5" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('circle');
                  }} className={mode === 'circle' ? toolBtnActive : toolBtnIdle} title="Circle">
                    <img src={circleIcon} alt="Circle" className="w-5 h-5" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('draw');
                  }} className={mode === 'draw' ? toolBtnActive : toolBtnIdle} title="Draw">
                    <img src={pencilIcon} alt="Draw" className="w-5 h-5" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('polygon');
                  }} className={mode === 'polygon' ? toolBtnActive : toolBtnIdle} title="Polygon">
                    <PolygonToolIcon className="h-5 w-5" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('delete');
                  }} className={mode === 'delete' ? toolBtnActive : toolBtnIdle} title="Delete">
                    <img src={deleteIcon} alt="Delete" className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {showTextPanel && (
              <div className="border-t border-slate-200/80 pt-3">
                <span className={`${editorGroupLabelClass} mb-2 block`}>Text</span>
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] font-medium text-slate-700">Color</span>
                  <DocumentEditorFontColorPicker
                    value={textColor}
                    onChange={(c) => setTextColor(c ?? '#000000')}
                    buttonTitle="Font color"
                    panelAriaLabel="Font colors"
                  />
                </div>
                <div className="custom-slider-container mb-2">
                  <span className="w-10 shrink-0 text-[11px] font-medium text-slate-700">Size</span>
                  <input
                    type="range"
                    min="8"
                    max="72"
                    value={fontSize}
                    onChange={e => setFontSize(parseInt(e.target.value))}
                    className="custom-slider"
                    style={{
                      background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((fontSize - 8) / (72 - 8)) * 100}%, #e5e7eb ${((fontSize - 8) / (72 - 8)) * 100}%, #e5e7eb 100%)`
                    }}
                  />
                  <div className="custom-slider-value">{fontSize}</div>
                </div>
                <AppCheckbox
                  className="mb-2 items-center"
                  label={<span className="text-[11px] font-semibold text-slate-700">Text background</span>}
                  checked={textBackgroundEnabled}
                  onChange={setTextBackgroundEnabled}
                />
                {textBackgroundEnabled && (
                  <>
                    <div className="mb-1 flex min-w-0 items-center gap-2">
                      <span className="w-10 shrink-0 text-[11px] font-medium text-slate-700">Color</span>
                      <DocumentEditorFontColorPicker
                        value={textBackgroundColor}
                        onChange={(c) => setTextBackgroundColor(c ?? '#efefef')}
                        buttonTitle="Text background color"
                        panelAriaLabel="Text background colors"
                      />
                    </div>
                    <div className="custom-slider-container mb-1">
                      <span className="w-10 shrink-0 text-[11px] font-medium text-slate-700">Opacity</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={textBackgroundOpacity}
                        onChange={e => setTextBackgroundOpacity(parseFloat(e.target.value))}
                        className="custom-slider"
                        style={{
                          background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${textBackgroundOpacity * 100}%, #e5e7eb ${textBackgroundOpacity * 100}%, #e5e7eb 100%)`
                        }}
                      />
                      <div className="custom-slider-value">{Math.round(textBackgroundOpacity * 100)}%</div>
                    </div>
                  </>
                )}
              </div>
              )}

              {showShapePanel && (
                    <div className="border-t border-slate-200/80 pt-3">
                      <span className={`${editorGroupLabelClass} mb-2 block`}>Shape</span>
                      <div className="mb-1 flex min-w-0 items-center gap-2">
                        <span className="w-10 shrink-0 text-[11px] font-medium text-slate-700">Color</span>
                        <DocumentEditorFontColorPicker
                          value={strokeColor}
                          onChange={(c) => setStrokeColor(c ?? '#000000')}
                          buttonTitle="Shape stroke color"
                          panelAriaLabel="Shape stroke colors"
                        />
                      </div>
                      <div className="custom-slider-container mb-2">
                        <span className="w-10 shrink-0 text-[11px] font-medium text-slate-700">Stroke</span>
                        <input
                          type="range"
                          min="1"
                          max="20"
                          value={stroke}
                          onChange={(e) => setStroke(parseInt(e.target.value))}
                          className="custom-slider"
                          style={{
                            background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((stroke - 1) / (20 - 1)) * 100}%, #e5e7eb ${((stroke - 1) / (20 - 1)) * 100}%, #e5e7eb 100%)`,
                          }}
                        />
                        <div className="custom-slider-value">{stroke}</div>
                      </div>
                      {showShapeFillPanel && (
                        <>
                          <AppCheckbox
                            className="mb-2 items-center"
                            label={<span className="text-[11px] font-semibold text-slate-700">Fill</span>}
                            checked={fillEnabled}
                            onChange={setFillEnabled}
                          />
                          {fillEnabled && (
                            <div className="space-y-2">
                              <div className="mb-1 flex min-w-0 items-center gap-2">
                                <span className="w-10 shrink-0 text-[11px] font-medium text-slate-700">Color</span>
                                <DocumentEditorFontColorPicker
                                  value={fillColor}
                                  onChange={(c) => setFillColor(c ?? '#000000')}
                                  buttonTitle="Shape fill color"
                                  panelAriaLabel="Shape fill colors"
                                />
                              </div>
                              <div className="custom-slider-container mb-1">
                                <span className="w-10 shrink-0 text-[11px] font-medium text-slate-700">Opacity</span>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={fillOpacity}
                                  onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                                  className="custom-slider"
                                  style={{
                                    background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${fillOpacity * 100}%, #e5e7eb ${fillOpacity * 100}%, #e5e7eb 100%)`,
                                  }}
                                />
                                <div className="custom-slider-value">{Math.round(fillOpacity * 100)}%</div>
                              </div>
                              <div>
                                <label className="mb-1.5 block text-[11px] font-medium text-slate-600">Pattern</label>
                                <div className="grid grid-cols-3 gap-1">
                                  {SHAPE_FILL_PATTERNS.map((p) => {
                                    const active = fillPattern === p.id;
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        title={p.label}
                                        aria-label={p.label}
                                        aria-pressed={active}
                                        onClick={() => setFillPattern(p.id)}
                                        className={`flex h-8 w-full items-center justify-center rounded-md border transition-colors ${
                                          active
                                            ? 'border-brand-red/40 bg-brand-red/10 ring-1 ring-brand-red/30'
                                            : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                      >
                                        <ShapeFillPatternIcon pattern={p.id} color={fillColor} />
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
              )}
              {!showTextPanel && !showShapePanel && (
                <p className={`${editorCaptionClass} border-t border-slate-200/80 pt-3 text-slate-400`}>
                  Select an object to edit its properties.
                </p>
              )}
                </div>
            </aside>
            </div>
          </div>
        </div>
      </div>
      </OverlayPortal>
      {(isLoading || isSaving) && (
        <OverlayPortal>
          <div
            className={uiCx(
              'fixed inset-0 flex items-center justify-center bg-black/45 p-4',
              progressOverlayClassName,
            )}
          >
            <div className="w-[360px] max-w-[90vw] rounded-xl border border-slate-200/90 bg-white px-6 py-5 text-center shadow-2xl ring-1 ring-slate-900/[0.06]">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-red" />
              <div className="text-sm text-slate-600">
                {isSaving ? 'Saving…' : 'Loading image…'}
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </>
  );
}
