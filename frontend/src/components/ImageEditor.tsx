import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';

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
    flex: 1;
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

type AnnotationItem = {
  id: string;
  type: 'rect' | 'arrow' | 'text' | 'circle' | 'path';
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
};

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
};

export default function ImageEditor({ isOpen, onClose, imageUrl, imageName = 'image', fileObjectId, onSave, targetWidth, targetHeight, editorScaleFactor = 2.5 }: ImageEditorProps) {
  const [mode, setMode] = useState<'pan' | 'rect' | 'arrow' | 'text' | 'circle' | 'draw' | 'select' | 'delete'>('select');
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
  const [color, setColor] = useState('#000000');
  const [stroke, setStroke] = useState(3);
  const [fontSize, setFontSize] = useState(16);
  const [text, setText] = useState('');
  const [textBackgroundEnabled, setTextBackgroundEnabled] = useState(true);
  const [textBackgroundColor, setTextBackgroundColor] = useState('#ffffff');
  const [textBackgroundOpacity, setTextBackgroundOpacity] = useState(0.8);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const cursorBlinkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const draggingRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const drawingRef = useRef<AnnotationItem | null>(null);
  const movingRef = useRef<{ item: AnnotationItem; startX: number; startY: number } | null>(null);
  const resizingRef = useRef<{ item: AnnotationItem; handle: string; startX: number; startY: number; startW?: number; startH?: number; startR?: number; startRx?: number; startRy?: number; startX2?: number; startY2?: number } | null>(null);
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
  const blurredBgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const blurredBgKeyRef = useRef<string>('');
  
  // Cleanup cursor blink on unmount
  useEffect(() => {
    return () => {
      if (cursorBlinkRef.current) {
        clearInterval(cursorBlinkRef.current);
      }
    };
  }, []);

  // Update fontSize of text item being edited when fontSize changes
  useEffect(() => {
    if (textEditingRef.current) {
      setItems(prev => prev.map(it => {
        if (!it || !it.id) return it;
        if (it.id === textEditingRef.current && it.type === 'text') {
          return { ...it, fontSize };
        }
        return it;
      }).filter(it => it && it.id));
    }
  }, [fontSize]);

  // Update text background settings of selected text items when settings change
  useEffect(() => {
    if (selectedIds.length > 0) {
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
    }
  }, [textBackgroundEnabled, textBackgroundColor, textBackgroundOpacity, selectedIds]);

  // Track previous color/stroke to only update when they actually change
  const prevColorRef = useRef<string>(color);
  const prevStrokeRef = useRef<number>(stroke);

  // Update color of selected items when color changes (not when selection changes)
  useEffect(() => {
    // Only update if color actually changed (not just selection)
    if (selectedIds.length > 0 && mode === 'select' && prevColorRef.current !== color) {
      setItems(prev => prev.map(it => {
        if (!it || !it.id) return it;
        if (selectedIds.includes(it.id)) {
          return { ...it, color };
        }
        return it;
      }).filter(it => it && it.id));
    }
    prevColorRef.current = color;
  }, [color, selectedIds, mode]);

  // Update stroke of selected items when stroke changes (not when selection changes)
  useEffect(() => {
    // Only update if stroke actually changed (not just selection)
    if (selectedIds.length > 0 && mode === 'select' && prevStrokeRef.current !== stroke) {
      setItems(prev => prev.map(it => {
        if (!it || !it.id) return it;
        if (selectedIds.includes(it.id)) {
          return { ...it, stroke };
        }
        return it;
      }).filter(it => it && it.id));
    }
    prevStrokeRef.current = stroke;
  }, [stroke, selectedIds, mode]);

  // Auto-switch from delete to select when no items are available
  useEffect(() => {
    if (mode === 'delete' && items.length === 0) {
      setMode('select');
    }
  }, [mode, items.length]);

  // Helper to exit text editing mode (used by ESC and click-outside)
  const exitTextEditing = useCallback(() => {
    const editingId = textEditingRef.current;
    if (!editingId) return;

    textEditingRef.current = null;
    textCursorPositionRef.current = 0;
    textSelectionStartRef.current = null;

    // Turn off editing flag for the text item
    setItems(prev => prev.map(it =>
      !it || !it.id ? it : (it.id === editingId && it.type === 'text'
        ? { ...it, _editing: false, selectionStart: undefined, selectionEnd: undefined }
        : it)
    ).filter(it => it && it.id));

    // Keep the text selected so user can still move/resize it
    setSelectedIds(prev =>
      prev.length === 1 && prev[0] === editingId ? prev : [editingId]
    );

    if (cursorBlinkRef.current) {
      clearInterval(cursorBlinkRef.current);
      cursorBlinkRef.current = null;
    }

    // After leaving text editing we always return to select mode
    setMode('select');
  }, [setItems, setSelectedIds, setMode]);

  // Load image - only when modal opens or fileObjectId changes
  useEffect(() => {
    if (!isOpen) {
      setImg(null);
      setIsLoading(false);
      setLoadError(null);
      loadedFileIdRef.current = null;
      loadingRef.current = false;
      blurredBgCanvasRef.current = null;
      blurredBgKeyRef.current = '';
      if (cursorBlinkRef.current) {
        clearInterval(cursorBlinkRef.current);
        cursorBlinkRef.current = null;
      }
      return;
    }
    
    if (!fileObjectId) {
      return;
    }
    
    // Prevent reloading if already loaded or currently loading
    if (loadingRef.current) {
      return;
    }
    
    if (loadedFileIdRef.current === fileObjectId) {
      return; // Already loaded or loading this file
    }
    
    const loadImage = async () => {
      loadingRef.current = true;
      loadedFileIdRef.current = fileObjectId;
      setIsLoading(true);
      setLoadError(null);
      setImg(null);
      
      try {
        const urlToLoad = `/files/${fileObjectId}/thumbnail?w=1600`;
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
        }, 30000);
        
        image.onload = () => {
          imageLoaded = true;
          clearTimeout(loadTimeout);
          loadingRef.current = false;
          setIsLoading(false);
          setLoadError(null);
          setImg(image);
          setAngle(0);
          setScale(1);
          setOffsetX(0);
          setOffsetY(0);
          setItems([]);
          setSelectedIds([]);
          setMode('select');
        };
        
        image.onerror = () => {
          imageLoaded = true;
          clearTimeout(loadTimeout);
          loadingRef.current = false;
          setIsLoading(false);
          setLoadError('Failed to load image. Please check if the file exists and try again.');
          loadedFileIdRef.current = null;
        };
        
        image.src = urlToLoad;
      } catch (e: any) {
        loadingRef.current = false;
        setIsLoading(false);
        setLoadError(e?.message || 'Failed to load image. Please try again.');
        loadedFileIdRef.current = null;
      }
    };
    
    loadImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fileObjectId]); // Only depend on isOpen and fileObjectId to prevent infinite loops

  // Set canvas size to match image dimensions exactly (no white space)
  // The canvas will be sized to show the full image without any padding
  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current || !img) return;
    
    let canvasWidth: number;
    let canvasHeight: number;
    
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    
    // If targetWidth and targetHeight are provided, use them
    if (targetWidth && targetHeight) {
      canvasWidth = targetWidth;
      canvasHeight = targetHeight;
    } else {
      // Calculate maximum size that fits in viewport while maintaining aspect ratio
      // Account for sidebar (224px) + gap (16px) + padding (32px) + modal padding (32px) + margin
      const sidebarWithGap = 240; // w-56 (224px) + gap-4 (16px)
      const totalPadding = 64; // p-4 on modal content (16px * 2) + modal padding (16px * 2)
      const maxWidth = Math.min(imgWidth, window.innerWidth - sidebarWithGap - totalPadding - 40);
      const maxHeight = Math.min(imgHeight, window.innerHeight - 200);
      
      const imgAspect = imgWidth / imgHeight;
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
    
    // Calculate initial scale to show the full image exactly (fit, not cover)
    // This ensures the image appears complete without any white space
    const fitScale = Math.min(canvasWidth / imgWidth, canvasHeight / imgHeight);
    
    // Set initial scale and reset offsets to center the image
    setScale(fitScale);
    setOffsetX(0);
    setOffsetY(0);
  }, [img, isOpen, targetWidth, targetHeight, editorScaleFactor]);

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
    if (it.type === 'path') {
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
    
    // Draw items
    for (const it of items) {
      if (!it || !it.id) continue; // Skip null/undefined items
      ctx.save();
      ctx.strokeStyle = it.color;
      ctx.fillStyle = it.color;
      ctx.lineWidth = it.stroke;
      
      if (it.type === 'rect') {
        ctx.strokeRect(it.x, it.y, it.w || 0, it.h || 0);
      } else if (it.type === 'arrow') {
        const dx = (it.x2 || it.x) - it.x;
        const dy = (it.y2 || it.y) - it.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const head = 10 + it.stroke * 2;
        ctx.beginPath();
        ctx.moveTo(it.x, it.y);
        ctx.lineTo(it.x2 || it.x, it.y2 || it.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(it.x2 || it.x, it.y2 || it.y);
        ctx.lineTo((it.x2 || it.x) - ux * head - uy * head * 0.5, (it.y2 || it.y) - uy * head + ux * head * 0.5);
        ctx.lineTo((it.x2 || it.x) - ux * head + uy * head * 0.5, (it.y2 || it.y) - uy * head - ux * head * 0.5);
        ctx.closePath();
        ctx.fill();
      } else if (it.type === 'text') {
        const itemFontSize = it.fontSize || fontSize;
        ctx.font = `${itemFontSize}px Montserrat`;
        const padding = 4;
        
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
          
          // Convert hex color to rgba
          const hex = bgColor.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
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
        ctx.beginPath();
        // Calculate center and radii from bounding box (x, y, w, h)
        // Support both old format (rx, ry or r) and new format (w, h)
        let centerX: number, centerY: number, rx: number, ry: number;
        
        if (it.w !== undefined && it.h !== undefined) {
          // New format: x, y is top-left corner, w, h is size
          centerX = it.x + it.w / 2;
          centerY = it.y + it.h / 2;
          rx = Math.abs(it.w) / 2;
          ry = Math.abs(it.h) / 2;
        } else if (it.rx !== undefined && it.ry !== undefined) {
          // Old format: x, y is center, rx, ry are radii
          centerX = it.x;
          centerY = it.y;
          rx = Math.max(1, it.rx);
          ry = Math.max(1, it.ry);
        } else {
          // Old format: x, y is center, r is radius
          const r = Math.max(1, it.r || 1);
          centerX = it.x;
          centerY = it.y;
          rx = r;
          ry = r;
        }
        
        if (rx === ry) {
          ctx.arc(centerX, centerY, Math.max(1, rx), 0, Math.PI * 2);
        } else {
          ctx.ellipse(centerX, centerY, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
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
      }
      
      // Draw selection border in red when items are selected (only in select mode, not during drawing)
      if (selectedIds.includes(it.id) && mode === 'select' && !drawingRef.current) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#d11616'; // brand-red
        ctx.lineWidth = 1;
        const bb = getItemBounds(it);
        if (bb) {
          ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
          
          // Draw resize handles (8 handles: corners and midpoints)
          const handleSize = 12; // slightly larger for easier interaction
          const handles = [
            { x: bb.x, y: bb.y, name: 'nw' }, // top-left
            { x: bb.x + bb.w / 2, y: bb.y, name: 'n' }, // top
            { x: bb.x + bb.w, y: bb.y, name: 'ne' }, // top-right
            { x: bb.x + bb.w, y: bb.y + bb.h / 2, name: 'e' }, // right
            { x: bb.x + bb.w, y: bb.y + bb.h, name: 'se' }, // bottom-right
            { x: bb.x + bb.w / 2, y: bb.y + bb.h, name: 's' }, // bottom
            { x: bb.x, y: bb.y + bb.h, name: 'sw' }, // bottom-left
            { x: bb.x, y: bb.y + bb.h / 2, name: 'w' }, // left
          ];
          
          ctx.fillStyle = '#d11616';
          ctx.setLineDash([]);
          for (const handle of handles) {
            ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
          }
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
  }, [items, selectedIds, fontSize, getItemBounds, mode, cursorVisible]);

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

  // Redraw overlay when cursor visibility changes or items change
  useEffect(() => {
    if (isOpen && img) {
      drawOverlay();
    }
  }, [cursorVisible, items, isOpen, img, drawOverlay]);

  // Calculate cursor position in text based on click position
  const getTextCursorPosition = useCallback((item: AnnotationItem, clickX: number, clickY: number): number => {
    const overlay = overlayRef.current;
    if (!overlay || item.type !== 'text') return 0;
    const ctx = overlay.getContext('2d');
    if (!ctx) return 0;

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
  }, [fontSize]);

  // Find item at position
  const itemAt = useCallback((x: number, y: number): AnnotationItem | null => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it || !it.id) continue; // Skip null/undefined items
      const b = getItemBounds(it);
      if (b && x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h) {
        return it;
      }
    }
    return null;
  }, [items, getItemBounds]);

  // Get handle at position for resize
  const getHandleAt = useCallback((x: number, y: number, item: AnnotationItem): string | null => {
    if (mode !== 'select') return null;
    const bb = getItemBounds(item);
    if (!bb) return null;
    
    // Slightly larger handle hit area to make it easier to grab borders
    const handleSize = 14;
    const handles = [
      { x: bb.x, y: bb.y, name: 'nw' },
      { x: bb.x + bb.w / 2, y: bb.y, name: 'n' },
      { x: bb.x + bb.w, y: bb.y, name: 'ne' },
      { x: bb.x + bb.w, y: bb.y + bb.h / 2, name: 'e' },
      { x: bb.x + bb.w, y: bb.y + bb.h, name: 'se' },
      { x: bb.x + bb.w / 2, y: bb.y + bb.h, name: 's' },
      { x: bb.x, y: bb.y + bb.h, name: 'sw' },
      { x: bb.x, y: bb.y + bb.h / 2, name: 'w' },
    ];
    
    for (const handle of handles) {
      if (Math.abs(x - handle.x) <= handleSize / 2 && Math.abs(y - handle.y) <= handleSize / 2) {
        return handle.name;
      }
    }
    return null;
  }, [mode, getItemBounds]);

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
      const newScale = Math.min(3, Math.max(0.1, currentScale * factor));
      
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
  }, [isOpen, mode, img, clampOffset]);

  // Pointer event handlers for drag - like ImagePicker
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Disable pan when editing text - clicking canvas should exit edit mode
    if (textEditingRef.current) {
      exitTextEditing();
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
          // Click is outside any item, allow pan
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
      setOffsetX(x);
      setOffsetY(y);
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // If we were panning in select mode, stay in select mode (don't change mode)
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
      const editingItem = items.find(it => it && it.id === textEditingRef.current && it.type === 'text');
      if (editingItem) {
        const boxW = editingItem.w || 200;
        const boxH = editingItem.h || 30;
        const safetyMargin = 10; // safety margin around text box before exiting edit mode
        const innerMargin = 4;   // inner margin to distinguish border vs inner text

        const insideExpandedBox =
          x >= editingItem.x - safetyMargin &&
          x <= editingItem.x + boxW + safetyMargin &&
          y >= editingItem.y - safetyMargin &&
          y <= editingItem.y + boxH + safetyMargin;

        if (insideExpandedBox) {
          // If user clicked on a resize handle while editing, let the normal
          // select/resize logic run (so we can move/resize the box)
          const handle = getHandleAt(x, y, editingItem);
          if (handle) {
            // fall through to normal select/resize logic below (resize handles)
          } else {
            const insideCoreBox =
              x >= editingItem.x + innerMargin &&
              x <= editingItem.x + boxW - innerMargin &&
              y >= editingItem.y + innerMargin &&
              y <= editingItem.y + boxH - innerMargin;

            if (insideCoreBox) {
              // Check if clicking on actual text content or empty area
              const itemFontSize = editingItem.fontSize || fontSize;
              const textContent = editingItem.text || '';
              const padding = 4;
              const maxWidth = boxW - padding * 2;
              const lineHeight = itemFontSize * 1.2;
              
              let isClickOnText = false;
              if (textContent && overlayRef.current) {
                const ctx = overlayRef.current.getContext('2d');
                if (ctx) {
                  ctx.font = `${itemFontSize}px Montserrat`;
                  const topY = editingItem.y + padding;
                  const relativeY = Math.max(0, y - topY);
                  const lineIndex = Math.floor(relativeY / lineHeight);
                  
                  // Word wrap to get lines (same logic as getTextCursorPosition)
                  const paragraphs = textContent.split('\n');
                  const lines: string[] = [];
                  
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
                  
                  // Check if click is on a line with text
                  if (lineIndex >= 0 && lineIndex < lines.length && lines[lineIndex].trim()) {
                    const lineText = lines[lineIndex];
                    const lineStartX = editingItem.x + padding;
                    const lineEndX = lineStartX + ctx.measureText(lineText).width;
                    isClickOnText = x >= lineStartX && x <= lineEndX;
                  }
                }
              }
              
              if (isClickOnText) {
                // Click inside the core text area on actual text → start caret + drag-selection
                const cursorPos = getTextCursorPosition(editingItem, x, y);
                textCursorPositionRef.current = cursorPos;
                textSelectionStartRef.current = cursorPos;
                textSelectingRef.current = true;
                setItems(prev => prev.map(it =>
                  !it || !it.id ? it : (it.id === editingItem.id ? { ...it, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it)
                ).filter(it => it && it.id));
                // Ensure overlay has focus for keyboard events (arrows, etc)
                if (overlayRef.current) {
                  overlayRef.current.focus();
                }
                e.stopPropagation();
                return;
              } else {
                // Click in empty area inside text box → move whole box
                if (!selectedIds.includes(editingItem.id)) {
                  setSelectedIds([editingItem.id]);
                }
                movingRef.current = { item: { ...editingItem }, startX: x, startY: y };
                e.stopPropagation();
                return;
              }
            } else {
              // Click in border zone (between core box and expanded margin) → move whole box
              if (!selectedIds.includes(editingItem.id)) {
                setSelectedIds([editingItem.id]);
              }
              movingRef.current = { item: { ...editingItem }, startX: x, startY: y };
              e.stopPropagation();
              return;
            }
          }
        } else {
          // Clicking completely outside the expanded text box → exit edit mode (same as ESC)
          exitTextEditing();
          e.stopPropagation();
          return;
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
          color,
          stroke,
        };
        setItems(prev => [...prev.filter(it => it && it.id), newItem]);
        setSelectedIds([newItem.id]);
        drawingRef.current = newItem;
      } else if (mode === 'arrow') {
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'arrow',
          x,
          y,
          x2: x + 1,
          y2: y + 1,
          color,
          stroke,
        };
        setItems(prev => [...prev.filter(it => it && it.id), newItem]);
        setSelectedIds([newItem.id]);
        drawingRef.current = newItem;
      } else if (mode === 'circle') {
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'circle',
          x,
          y,
          w: 1, // Width of bounding box
          h: 1, // Height of bounding box
          color,
          stroke,
        };
        setItems(prev => [...prev.filter(it => it && it.id), newItem]);
        setSelectedIds([newItem.id]);
        drawingRef.current = newItem;
      } else if (mode === 'draw') {
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'path',
          x,
          y,
          points: [{ x, y }],
          color,
          stroke,
        };
        setItems(prev => [...prev.filter(it => it && it.id), newItem]);
        setSelectedIds([newItem.id]);
        drawingRef.current = newItem;
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
          color,
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
          for (const item of items) {
            if (!item || !item.id) continue;
            if (selectedIds.includes(item.id)) {
              const handle = getHandleAt(x, y, item);
              if (handle) {
                handleClicked = true;
                const bb = getItemBounds(item);
                if (bb) {
                  // Store original item state for resizing
                  resizingRef.current = {
                    item: { ...item }, // Deep copy to preserve original state
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
                }
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
            
            // If clicking outside the text being edited, exit edit mode and return to select
            if (textEditingRef.current && (!hit || hit.type !== 'text' || hit.id !== textEditingRef.current)) {
              setItems(prev => prev.map(it => !it || !it.id ? it : ({ ...it, _editing: false })).filter(it => it && it.id));
              textEditingRef.current = null;
              textCursorPositionRef.current = 0;
              if (cursorBlinkRef.current) {
                clearInterval(cursorBlinkRef.current);
                cursorBlinkRef.current = null;
              }
              setMode('select');
              return; // Don't continue with selection logic
            }
            
          if (hit) {
            // Select the item (or keep it selected if already selected)
            if (!selectedIds.includes(hit.id)) {
              setSelectedIds([hit.id]);
            }
            
            if (hit.type === 'text') {
              // Check if clicking on actual text content or empty area
              const itemFontSize = hit.fontSize || fontSize;
              const padding = 4;
              const textContent = hit.text || '';
              const maxWidth = (hit.w || 200) - padding * 2;
              const lineHeight = itemFontSize * 1.2;
              
              // Calculate text bounds to see if click is on text or empty area
              const overlay = overlayRef.current;
              let isClickOnText = false;
              if (overlay && textContent) {
                const ctx = overlay.getContext('2d');
                if (ctx) {
                  ctx.font = `${itemFontSize}px Montserrat`;
                  const topY = hit.y + padding;
                  const relativeY = Math.max(0, y - topY);
                  const lineIndex = Math.floor(relativeY / lineHeight);
                  
                  // Word wrap to get lines (same logic as getTextCursorPosition)
                  const paragraphs = textContent.split('\n');
                  const lines: string[] = [];
                  
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
                  
                  // Check if click is on a line with text
                  if (lineIndex >= 0 && lineIndex < lines.length && lines[lineIndex].trim()) {
                    const lineText = lines[lineIndex];
                    const lineStartX = hit.x + padding;
                    const lineEndX = lineStartX + ctx.measureText(lineText).width;
                    isClickOnText = x >= lineStartX && x <= lineEndX;
                  }
                }
              }
              
              // If text box is already selected and click is on empty area, allow dragging
              if (selectedIds.includes(hit.id) && !isClickOnText && !textEditingRef.current) {
                // Prepare to move the text box
                movingRef.current = { item: { ...hit }, startX: x, startY: y };
                return;
              }
              
              // Otherwise, enter edit mode (click on text or first click)
              const cursorPos = getTextCursorPosition(hit, x, y);
              textCursorPositionRef.current = cursorPos;
              textSelectionStartRef.current = null;
              setItems(prev => prev.map(it =>
                !it || !it.id ? it : (it.id === hit.id ? { ...it, _editing: true, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it)
              ).filter(it => it && it.id));
              textEditingRef.current = hit.id;
              if (cursorBlinkRef.current) {
                clearInterval(cursorBlinkRef.current);
              }
              setCursorVisible(true);
              cursorBlinkRef.current = setInterval(() => {
                setCursorVisible(prev => !prev);
              }, 500);
              if (overlayRef.current) {
                overlayRef.current.focus();
              }
              // While editing, moving is only via resize handles / selection logic
              movingRef.current = null;
            } else {
              // Non-text items: select and prepare to move
              movingRef.current = { item: { ...hit }, startX: x, startY: y };
            }
          } else {
              // Click on empty area - disable text editing (already handled above)
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
    
    // Handle pan when dragging in select mode (clicked outside items)
    if (mode === 'select' && draggingRef.current && img) {
      const dx = e.clientX - rect.left - draggingRef.current.x;
      const dy = e.clientY - rect.top - draggingRef.current.y;
      const { x: newX, y: newY } = clampOffset(draggingRef.current.offsetX + dx, draggingRef.current.offsetY + dy);
      setOffsetX(newX);
      setOffsetY(newY);
      return;
    }
    
    // Mouse-drag text selection while editing
    if (textEditingRef.current && textSelectingRef.current) {
      const editingItem = items.find(it => it && it.id === textEditingRef.current && it.type === 'text');
      if (editingItem) {
        const currentText = editingItem.text || '';
        const anchor = textSelectionStartRef.current ?? textCursorPositionRef.current;
        const cursorPos = getTextCursorPosition(editingItem, x, y);
        textCursorPositionRef.current = cursorPos;
        textSelectionStartRef.current = anchor;
        const start = Math.max(0, Math.min(anchor, cursorPos));
        const end = Math.min(currentText.length, Math.max(anchor, cursorPos));
        setItems(prev => prev.map(it =>
          !it || !it.id ? it : (it.id === editingItem.id
            ? { ...it, cursorPosition: cursorPos, selectionStart: start, selectionEnd: end }
            : it)
        ).filter(it => it && it.id));
      }
      return;
    }
    
    if (marqueeRef.current) {
      marqueeRef.current.x2 = x;
      marqueeRef.current.y2 = y;
      drawOverlay();
      return;
    }
    
    const drawing = drawingRef.current;
    if (drawing) {
      const drawnId = drawing.id;
      if (drawing.type === 'rect') {
        setItems(prev => prev.map(it => !it || !it.id ? it : (it.id === drawnId ? { ...it, w: x - it.x, h: y - it.y } : it)).filter(it => it && it.id));
      } else if (drawing.type === 'arrow') {
        setItems(prev => prev.map(it => !it || !it.id ? it : (it.id === drawnId ? { ...it, x2: x, y2: y } : it)).filter(it => it && it.id));
      } else if (drawing.type === 'circle') {
        setItems(prev => prev.map(it => {
          if (!it || !it.id) return it;
          if (it.id === drawnId) return { ...it, w: x - it.x, h: y - it.y };
          return it;
        }).filter(it => it && it.id));
      } else if (drawing.type === 'text') {
        const dx = Math.abs(x - drawing.x);
        const dy = Math.abs(y - drawing.y);
        const minSize = 5;
        if (dx < minSize && dy < minSize) return;
        if (!drawing.w || drawing.w <= 1) {
          const newItem = { ...drawing, w: Math.max(50, Math.abs(x - drawing.x)), h: Math.max(20, Math.abs(y - drawing.y)) };
          setItems(prev => [...prev.filter(it => it && it.id), newItem]);
          setSelectedIds([newItem.id]);
          drawingRef.current = newItem;
        } else {
          setItems(prev => prev.map(it => !it || !it.id ? it : (it.id === drawnId ? { ...it, w: Math.max(50, Math.abs(x - it.x)), h: Math.max(20, Math.abs(y - it.y)) } : it)).filter(it => it && it.id));
        }
      } else if (drawing.type === 'path') {
        setItems(prev => prev.map(it => {
          if (!it || !it.id) return it;
          if (it.id === drawnId) {
            const pts = [...(it.points || []), { x, y }];
            return { ...it, points: pts };
          }
          return it;
        }).filter(it => it && it.id));
      }
      drawOverlay();
      return;
    }
    
    if (resizingRef.current) {
      const resizeState = resizingRef.current;
      const dx = x - resizeState.startX;
      const dy = y - resizeState.startY;
      const item = resizeState.item;
      
      setItems(prev => prev.map(it => {
        if (!it || !it.id) return it;
        if (it.id === item.id) {
          if (it.type === 'rect') {
            const { handle, startW, startH } = resizeState;
            // Get original position from item state
            const origX = item.x;
            const origY = item.y;
            
            // Allow negative width/height to flip (like Paint)
            let newW = startW! + (handle.includes('e') ? dx : handle.includes('w') ? -dx : 0);
            let newH = startH! + (handle.includes('s') ? dy : handle.includes('n') ? -dy : 0);
            let newX = origX;
            let newY = origY;
            
            // Adjust position when resizing from left or top
            if (handle.includes('w')) { newX = origX + dx; }
            if (handle.includes('n')) { newY = origY + dy; }
            
            return { ...it, x: newX, y: newY, w: newW, h: newH };
          } else if (it.type === 'circle') {
            const { handle, startW, startH, startR, startRx, startRy } = resizeState;
            const bb = getItemBounds(item);
            if (!bb) return it;
            
            // Support both new format (w, h) and old format (rx, ry or r)
            if (item.w !== undefined && item.h !== undefined) {
              // New format: treat like rectangle
              const origX = bb.x;
              const origY = bb.y;
              
              // Allow negative width/height to flip (like Paint)
              let newW = startW! + (handle.includes('e') ? dx : handle.includes('w') ? -dx : 0);
              let newH = startH! + (handle.includes('s') ? dy : handle.includes('n') ? -dy : 0);
              let newX = origX;
              let newY = origY;
              
              // Adjust position when resizing from left or top
              if (handle.includes('w')) { newX = origX + dx; }
              if (handle.includes('n')) { newY = origY + dy; }
              
              return { ...it, x: newX, y: newY, w: newW, h: newH };
            } else {
              // Old format: support rx, ry or r (center-based)
              const centerX = item.x;
              const centerY = item.y;
              
              if (item.rx !== undefined || item.ry !== undefined || startRx !== undefined || startRy !== undefined) {
                // Ellipse mode - allow independent x and y radii
                let newRx = startRx !== undefined ? startRx : (item.rx || item.r || 1);
                let newRy = startRy !== undefined ? startRy : (item.ry || item.r || 1);
                let newX = centerX;
                let newY = centerY;
                
                if (handle === 'se' || handle === 'ne' || handle === 'sw' || handle === 'nw') {
                  // Corner handles - calculate distance from center
                  const distX = Math.abs(x - centerX);
                  const distY = Math.abs(y - centerY);
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
                // Circle mode - maintain aspect ratio
                let newR = startR!;
                
                if (handle === 'se' || handle === 'ne' || handle === 'sw' || handle === 'nw') {
                  const dist = Math.hypot(x - centerX, y - centerY);
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
            
            // For arrows, map bounding box handles to actual arrow endpoints
            // Calculate the bounding box
            const bbX = Math.min(origX, origX2);
            const bbY = Math.min(origY, origY2);
            const bbW = Math.abs(origX2 - origX);
            const bbH = Math.abs(origY2 - origY);
            
            // Calculate handle position in bounding box
            let handleX = 0, handleY = 0;
            if (handle === 'nw') { handleX = bbX; handleY = bbY; }
            else if (handle === 'ne') { handleX = bbX + bbW; handleY = bbY; }
            else if (handle === 'se') { handleX = bbX + bbW; handleY = bbY + bbH; }
            else if (handle === 'sw') { handleX = bbX; handleY = bbY + bbH; }
            else if (handle === 'n') { handleX = bbX + bbW / 2; handleY = bbY; }
            else if (handle === 's') { handleX = bbX + bbW / 2; handleY = bbY + bbH; }
            else if (handle === 'e') { handleX = bbX + bbW; handleY = bbY + bbH / 2; }
            else if (handle === 'w') { handleX = bbX; handleY = bbY + bbH / 2; }
            
            // Find which arrow point is closer to the handle
            const distToStart = Math.hypot(handleX - origX, handleY - origY);
            const distToEnd = Math.hypot(handleX - origX2, handleY - origY2);
            
            // Move the closer point
            if (distToStart <= distToEnd) {
              return { ...it, x: origX + dx, y: origY + dy };
            } else {
              return { ...it, x2: origX2 + dx, y2: origY2 + dy };
            }
          } else if (it.type === 'path') {
            // For paths, allow resizing the bounding box
            const { handle, startW, startH } = resizeState;
            const origX = item.x;
            const origY = item.y;
            const origPoints = item.points || [];
            if (!origPoints.length) return it;
            
            // Get original bounds
            let minX = origPoints[0].x, minY = origPoints[0].y, maxX = origPoints[0].x, maxY = origPoints[0].y;
            for (const p of origPoints) {
              if (p.x < minX) minX = p.x;
              if (p.y < minY) minY = p.y;
              if (p.x > maxX) maxX = p.x;
              if (p.y > maxY) maxY = p.y;
            }
            const origW = maxX - minX;
            const origH = maxY - minY;
            
            // Calculate scale factors
            let scaleX = 1, scaleY = 1;
            let offsetX = 0, offsetY = 0;
            
            if (handle.includes('e')) { scaleX = (startW! + dx) / startW!; }
            if (handle.includes('w')) { scaleX = (startW! - dx) / startW!; offsetX = dx; }
            if (handle.includes('s')) { scaleY = (startH! + dy) / startH!; }
            if (handle.includes('n')) { scaleY = (startH! - dy) / startH!; offsetY = dy; }
            
            // Scale and translate points
            const newPoints = origPoints.map(p => ({
              x: (p.x - minX) * scaleX + minX + offsetX,
              y: (p.y - minY) * scaleY + minY + offsetY
            }));
            
            return { ...it, points: newPoints };
          } else if (it.type === 'text') {
            const { handle, startW, startH } = resizeState;
            const origX = item.x;
            const origY = item.y;
            
            let newW = startW!;
            let newH = startH!;
            let newX = origX;
            let newY = origY;
            
            if (handle.includes('e')) { newW = Math.max(50, startW! + dx); }
            if (handle.includes('w')) { newW = Math.max(50, startW! - dx); newX = origX + dx; }
            if (handle.includes('s')) { newH = Math.max(20, startH! + dy); }
            if (handle.includes('n')) { newH = Math.max(20, startH! - dy); newY = origY + dy; }
            
            return { ...it, x: newX, y: newY, w: newW, h: newH };
          }
        }
        return it;
      }).filter(it => it && it.id));
      drawOverlay();
      return;
    }
    
    if (movingRef.current) {
      const moveState = movingRef.current;
      const dx = x - moveState.startX;
      const dy = y - moveState.startY;
      
      // Only move if there's significant movement to avoid accidental moves
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        setItems(prev => prev.map(it => {
          if (!it || !it.id) return it;
          if (it.id === moveState.item.id) {
            // Use original item position from moveState, not current state
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
            } else if (it.type === 'path') {
              const origPoints = moveState.item.points || [];
              return { 
                ...it, 
                points: origPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) 
              };
            }
          }
          return it;
        }));
        drawOverlay();
      }
    }
  };

  const handleOverlayMouseUp = () => {
    // Clear pan dragging if active (when panning in select mode)
    if (draggingRef.current && mode === 'select' && !drawingRef.current && !movingRef.current && !resizingRef.current) {
      draggingRef.current = null;
    }
    
    if (textSelectingRef.current) {
      textSelectingRef.current = false;
    }
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      const x = Math.min(m.x, m.x2);
      const y = Math.min(m.y, m.y2);
      const w = Math.abs(m.x2 - m.x);
      const h = Math.abs(m.y2 - m.y);
      const sel: string[] = [];
      for (const it of items) {
        if (!it || !it.id) continue; // Skip null/undefined items
        const b = getItemBounds(it);
        if (b && b.x >= x && b.y >= y && (b.x + b.w) <= x + w && (b.y + b.h) <= y + h) {
          sel.push(it.id);
        }
      }
      setSelectedIds(sel);
      marqueeRef.current = null;
    }
    
    // If we just finished drawing rect, arrow, circle, or text, switch to select mode
    if (drawingRef.current) {
      const drawnType = drawingRef.current.type;
      const drawnId = drawingRef.current.id;
      if (drawnType === 'rect' || drawnType === 'circle') {
        // Normalize coordinates: ensure x, y is top-left and w, h are positive
        setItems(prev => prev.map(it => {
          if (!it || !it.id || it.id !== drawnId) return it;
          const currentW = it.w || 0;
          const currentH = it.h || 0;
          let newX = it.x;
          let newY = it.y;
          let newW = currentW;
          let newH = currentH;
          
          // If width is negative, adjust x and make w positive
          if (currentW < 0) {
            newX = it.x + currentW;
            newW = Math.abs(currentW);
          }
          
          // If height is negative, adjust y and make h positive
          if (currentH < 0) {
            newY = it.y + currentH;
            newH = Math.abs(currentH);
          }
          
          return { ...it, x: newX, y: newY, w: newW, h: newH };
        }).filter(it => it && it.id));
        setMode('select');
      } else if (drawnType === 'arrow') {
        setMode('select');
      } else if (drawnType === 'text') {
        // For text, enable editing after creating the area
        // Make sure item exists in items array before trying to edit
        const textItem = items.find(it => it && it.id === drawnId);
        if (textItem && textItem.w > 50 && textItem.h > 20) {
          // Only enable editing if text box has meaningful size
          setItems(prev => prev.map(it => !it || !it.id ? it : (it.id === drawnId ? { ...it, _editing: true } : it)).filter(it => it && it.id));
          textEditingRef.current = drawnId;
          setMode('select');
          // Start cursor blink
          if (cursorBlinkRef.current) {
            clearInterval(cursorBlinkRef.current);
          }
          setCursorVisible(true);
          cursorBlinkRef.current = setInterval(() => {
            setCursorVisible(prev => !prev);
          }, 500);
          // Focus canvas for text input
          setTimeout(() => {
            if (overlayRef.current) {
              overlayRef.current.focus();
            }
          }, 100);
        } else {
          // If text box is too small, just switch to select mode without editing
          // Also clear textEditingRef to ensure drag works
          textEditingRef.current = null;
          setMode('select');
        }
      }
    }
    
    drawingRef.current = null;
    movingRef.current = null;
    resizingRef.current = null;
  };

  // Keyboard handlers
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't delete when editing text - ESC should exit edit mode instead
        if (textEditingRef.current) {
          const editingItem = items.find(it => it && it.id === textEditingRef.current && it.type === 'text');
          if (editingItem) {
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
              setItems(prev => prev.map(it =>
                !it || !it.id ? it : (it.id === textEditingRef.current ? { ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it)
              ).filter(it => it && it.id));
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const { start, end } = hasSelection ? normSelection() : { start: cursorPos, end: cursorPos };
            const newText = currentText.substring(0, start) + '\n' + currentText.substring(end);
            cursorPos = start + 1;
            textCursorPositionRef.current = cursorPos;
            textSelectionStartRef.current = null;
            setItems(prev => prev.map(it => 
              !it || !it.id ? it : (it.id === textEditingRef.current ? { ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it)
            ).filter(it => it && it.id));
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
            setItems(prev => prev.map(it => 
              !it || !it.id ? it : (it.id === textEditingRef.current ? { ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it)
            ).filter(it => it && it.id));
          }
        }
      } else if (e.key === 'Delete' && selectedIds.length) {
        // Only delete when not editing text
        setItems(prev => prev.filter(it => it && it.id && !selectedIds.includes(it.id)));
        setSelectedIds([]);
      } else if (e.key === 'Escape' && mode !== 'select' && mode !== 'pan') {
        // Escape key -> return to select mode
        setMode('select');
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIds, items, mode]);

  // Reset
  const handleReset = () => {
    setAngle(0);
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
    setItems([]);
    setSelectedIds([]);
  };

  // Save
  const handleSave = async () => {
    if (isSaving) return; // Prevent multiple saves
    
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay || !img) return;
    
    setIsSaving(true);
    
    // Get display dimensions (CSS pixels) - this is what the user sees
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;
    
    // Create final canvas with same size as the editing canvas to match what user sees
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = displayWidth;
    finalCanvas.height = displayHeight;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) return;
    
    // Draw base image with transformations (same as drawBase function)
    ctx.save();
    const clamped = clampOffset(offsetX, offsetY);
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    
    // Use white background instead of blur
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    
    ctx.translate(displayWidth / 2 + clamped.x, displayHeight / 2 + clamped.y);
    ctx.rotate(angle * Math.PI / 180);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = scale;
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    
    // Draw annotations (same as drawOverlay function, but simplified for text)
    for (const it of items) {
      if (!it || !it.id) continue; // Skip null/undefined items
      ctx.save();
      ctx.strokeStyle = it.color;
      ctx.fillStyle = it.color;
      ctx.lineWidth = it.stroke;
      
      if (it.type === 'rect') {
        ctx.strokeRect(it.x, it.y, it.w || 0, it.h || 0);
      } else if (it.type === 'arrow') {
        const dx = (it.x2 || it.x) - it.x;
        const dy = (it.y2 || it.y) - it.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const head = 10 + it.stroke * 2;
        ctx.beginPath();
        ctx.moveTo(it.x, it.y);
        ctx.lineTo(it.x2 || it.x, it.y2 || it.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(it.x2 || it.x, it.y2 || it.y);
        ctx.lineTo((it.x2 || it.x) - ux * head - uy * head * 0.5, (it.y2 || it.y) - uy * head + ux * head * 0.5);
        ctx.lineTo((it.x2 || it.x) - ux * head + uy * head * 0.5, (it.y2 || it.y) - uy * head - ux * head * 0.5);
        ctx.closePath();
        ctx.fill();
      } else if (it.type === 'text') {
        const itemFontSize = it.fontSize || fontSize;
        ctx.font = `${itemFontSize}px Montserrat`;
        const padding = 4;
        const textContent = it.text || '';
        const maxWidth = (it.w || 200) - padding * 2;
        const lineHeight = itemFontSize * 1.2;
        const startY = it.y + padding + itemFontSize;
        
        // Word wrap text (same logic as drawOverlay)
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
        
        // Draw text background if enabled
        const bgEnabled = it.textBackgroundEnabled !== undefined ? it.textBackgroundEnabled : textBackgroundEnabled;
        if (bgEnabled && it.w && it.h) {
          const bgColor = it.textBackgroundColor || textBackgroundColor;
          const bgOpacity = it.textBackgroundOpacity !== undefined ? it.textBackgroundOpacity : textBackgroundOpacity;
          
          // Convert hex color to rgba
          const hex = bgColor.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`;
          ctx.fillRect(it.x, it.y, it.w, it.h);
        }
        
        // Clip to text box area
        ctx.save();
        ctx.beginPath();
        ctx.rect(it.x, it.y, it.w || 200, it.h || 30);
        ctx.clip();
        
        ctx.fillStyle = it.color;
        let y = startY;
        const maxY = it.y + (it.h || 30) - padding;
        
        for (let i = 0; i < lines.length; i++) {
          if (y > maxY) break;
          ctx.fillText(lines[i], it.x + padding, y);
          y += lineHeight;
        }
        
        ctx.restore();
      } else if (it.type === 'circle') {
        ctx.beginPath();
        if (it.rx !== undefined && it.ry !== undefined) {
          ctx.ellipse(it.x, it.y, Math.max(1, it.rx), Math.max(1, it.ry), 0, 0, Math.PI * 2);
        } else {
          ctx.arc(it.x, it.y, Math.max(1, it.r || 1), 0, Math.PI * 2);
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

  // Calculate modal size based on canvas dimensions
  const canvasWidth = canvasDimensions.width || canvasRef.current?.width || 0;
  const canvasHeight = canvasDimensions.height || canvasRef.current?.height || 0;
  const sidebarWidth = 240; // w-56 = 224px + gap-4 = 16px
  const padding = 32; // p-4 = 16px * 2
  const headerHeight = 60; // approximate header height
  const modalWidth = isLoading ? 800 : (canvasWidth > 0 ? canvasWidth + sidebarWidth + padding : 1200);
  const modalHeight = isLoading ? 600 : (canvasHeight > 0 ? Math.max(canvasHeight, 400) + headerHeight + padding : 700);

  return (
    <>
      <style>{sliderStyle}</style>
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-xl overflow-hidden flex flex-col"
        style={{
          width: isLoading ? '800px' : `${Math.min(modalWidth, window.innerWidth - 32)}px`,
          maxWidth: '95vw',
          maxHeight: '95vh'
        }}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
          <div className="font-semibold">Edit Image: {imageName}</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100">×</button>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          <div ref={containerRef} className="flex gap-4 items-start">
            <div className="flex-shrink-0" style={{ width: canvasWidth > 0 ? `${canvasWidth}px` : 'auto', maxWidth: canvasWidth > 0 ? `${canvasWidth}px` : 'none' }}>
              <div className="relative inline-block" style={isLoading ? { height: '500px', width: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}>
                {isLoading && (
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-gray-200 border-t-brand-red animate-spin" />
                    <div className="text-sm text-gray-600">Loading image...</div>
                  </div>
                )}
                {loadError && !isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="text-center">
                      <div className="text-red-600 font-semibold mb-2">Error</div>
                      <div className="text-sm text-gray-600 mb-4 max-w-md">{loadError}</div>
                      <button onClick={() => window.location.reload()} className="px-4 py-2 rounded bg-brand-red text-white">
                        Retry
                      </button>
                    </div>
                  </div>
                )}
                {!isLoading && !loadError && (
                  <>
                    <canvas
                      ref={canvasRef}
                      className="block"
                      style={{ 
                        cursor: ((mode === 'pan' || mode === 'select') && !textEditingRef.current) ? (draggingRef.current ? 'grabbing' : 'grab') : 'default',
                        display: 'block',
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
                        cursor: (mode === 'select' || mode === 'delete')
                          ? 'default'
                          : mode === 'draw'
                            ? `url("${pencilCursorIcon}") 6 28, auto`
                            : mode !== 'pan'
                              ? 'crosshair'
                              : textEditingRef.current
                                ? 'text'
                                : 'default',
                        pointerEvents: mode !== 'pan' ? 'auto' : (textEditingRef.current ? 'auto' : 'none'),
                        outline: 'none'
                      }}
                      onMouseMove={(e) => {
                        if (mode === 'select' || mode === 'delete') {
                          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const y = e.clientY - rect.top;
                          let cursor = 'default';
                          
                          // Check if hovering over a resize handle (only in select mode)
                          let handleFound = false;
                          if (mode === 'select') {
                            for (const item of items) {
                              if (!item || !item.id) continue;
                              if (selectedIds.includes(item.id)) {
                                const handle = getHandleAt(x, y, item);
                                if (handle) {
                                  if (handle === 'nw' || handle === 'se') cursor = 'nwse-resize';
                                  else if (handle === 'ne' || handle === 'sw') cursor = 'nesw-resize';
                                  else if (handle === 'n' || handle === 's') cursor = 'ns-resize';
                                  else if (handle === 'e' || handle === 'w') cursor = 'ew-resize';
                                  handleFound = true;
                                  break;
                                }
                              }
                            }
                          }
                          
                          // If not over a handle, check if over an item or can pan
                          if (!handleFound) {
                            const hit = itemAt(x, y);
                            if (hit) {
                              cursor = 'default';
                            } else {
                              // Not over any item - can pan, show grab cursor (only in select mode)
                              if (mode === 'select') {
                                cursor = draggingRef.current ? 'grabbing' : 'grab';
                              } else {
                                // In delete mode, show default cursor when not over item
                                cursor = 'default';
                              }
                            }
                          }
                          
                          (e.target as HTMLCanvasElement).style.cursor = cursor;
                        }
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
                        const newScale = Math.min(3, Math.max(0.1, currentScale * factor));
                        
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
                  </>
                )}
              </div>
            </div>
            
            <div className="w-56 flex-shrink-0 space-y-2.5">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-gray-700">Image Controls</label>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Rotation</label>
                  <div className="flex gap-1.5">
                    <button onClick={() => setAngle(prev => (prev + 270) % 360)} className="flex-1 px-2 py-1.5 rounded text-xs bg-gray-100 hover:bg-gray-200 transition-colors">
                      ⟲ Left
                    </button>
                    <button onClick={() => setAngle(prev => (prev + 90) % 360)} className="flex-1 px-2 py-1.5 rounded text-xs bg-gray-100 hover:bg-gray-200 transition-colors">
                      ⟳ Right
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="custom-slider-container mb-1">
                    <span className="text-xs font-medium text-gray-700 flex-shrink-0" style={{ width: '45px' }}>Zoom:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="3"
                      step="0.01"
                      value={scale}
                      onChange={e => setScale(parseFloat(e.target.value))}
                      className="custom-slider"
                      style={{
                        background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((scale - 0.1) / (3 - 0.1)) * 100}%, #e5e7eb ${((scale - 0.1) / (3 - 0.1)) * 100}%, #e5e7eb 100%)`
                      }}
                    />
                    <div className="custom-slider-value">{scale.toFixed(2)}x</div>
                  </div>
                </div>
              </div>
              
              <div className="pt-2.5 border-t">
                <label className="block text-xs font-medium mb-1.5 text-gray-700">Tools</label>
                <div className="grid grid-cols-3 gap-1.5">
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
                  }} className={`px-2 py-2 rounded flex items-center justify-center hover:bg-gray-200 transition-colors ${mode === 'select' ? 'bg-brand-red text-white' : 'bg-gray-100'}`} title="Select">
                    <img src={selectIcon} alt="Select" className="w-6 h-6" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      setItems(prev => prev.map(it => !it || !it.id ? it : ({ ...it, _editing: false })).filter(it => it && it.id));
                      textEditingRef.current = null;
                      if (cursorBlinkRef.current) {
                        clearInterval(cursorBlinkRef.current);
                        cursorBlinkRef.current = null;
                      }
                    }
                    setMode('rect');
                  }} className={`px-2 py-2 rounded flex items-center justify-center hover:bg-gray-200 transition-colors ${mode === 'rect' ? 'bg-brand-red text-white' : 'bg-gray-100'}`} title="Rectangle">
                    <img src={rectIcon} alt="Rect" className="w-6 h-6" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      setItems(prev => prev.map(it => !it || !it.id ? it : ({ ...it, _editing: false })).filter(it => it && it.id));
                      textEditingRef.current = null;
                      if (cursorBlinkRef.current) {
                        clearInterval(cursorBlinkRef.current);
                        cursorBlinkRef.current = null;
                      }
                    }
                    setMode('arrow');
                  }} className={`px-2 py-2 rounded flex items-center justify-center hover:bg-gray-200 transition-colors ${mode === 'arrow' ? 'bg-brand-red text-white' : 'bg-gray-100'}`} title="Arrow">
                    <img src={arrowIcon} alt="Arrow" className="w-6 h-6" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      setItems(prev => prev.map(it => !it || !it.id ? it : ({ ...it, _editing: false })).filter(it => it && it.id));
                      textEditingRef.current = null;
                      if (cursorBlinkRef.current) {
                        clearInterval(cursorBlinkRef.current);
                        cursorBlinkRef.current = null;
                      }
                    }
                    setMode('text');
                  }} className={`px-2 py-2 rounded flex items-center justify-center hover:bg-gray-200 transition-colors ${mode === 'text' ? 'bg-brand-red text-white' : 'bg-gray-100'}`} title="Text">
                    <img src={textIcon} alt="Text" className="w-5 h-5" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      setItems(prev => prev.map(it => !it || !it.id ? it : ({ ...it, _editing: false })).filter(it => it && it.id));
                      textEditingRef.current = null;
                      if (cursorBlinkRef.current) {
                        clearInterval(cursorBlinkRef.current);
                        cursorBlinkRef.current = null;
                      }
                    }
                    setMode('circle');
                  }} className={`px-2 py-2 rounded flex items-center justify-center hover:bg-gray-200 transition-colors ${mode === 'circle' ? 'bg-brand-red text-white' : 'bg-gray-100'}`} title="Circle">
                    <img src={circleIcon} alt="Circle" className="w-5 h-5" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('draw');
                  }} className={`px-2 py-2 rounded flex items-center justify-center hover:bg-gray-200 transition-colors ${mode === 'draw' ? 'bg-brand-red text-white' : 'bg-gray-100'}`} title="Draw">
                    <img src={pencilIcon} alt="Draw" className="w-5 h-5" />
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode('delete');
                  }} className={`px-2 py-2 rounded flex items-center justify-center hover:bg-gray-200 transition-colors ${mode === 'delete' ? 'bg-brand-red text-white' : 'bg-gray-100'}`} title="Delete">
                    <img src={deleteIcon} alt="Delete" className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="pt-2.5 border-t">
                <label className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs font-medium text-gray-700">Text Background:</span>
                  <input
                    type="checkbox"
                    checked={textBackgroundEnabled}
                    onChange={e => setTextBackgroundEnabled(e.target.checked)}
                    className="w-2.5 h-2.5"
                  />
                  <span className="text-xs text-gray-600">Enable</span>
                </label>
                {textBackgroundEnabled && (
                  <div className="flex gap-1.5 items-start">
                    <div style={{ width: '20%' }}>
                      <label className="block text-xs text-gray-600 mb-1">Color</label>
                      <input
                        type="color"
                        value={textBackgroundColor}
                        onChange={e => setTextBackgroundColor(e.target.value)}
                        className="w-full h-6 rounded"
                      />
                    </div>
                    <div style={{ width: '80%' }}>
                      <label className="block text-xs text-gray-600 mb-1">Opacity</label>
                      <div className="custom-slider-container mb-1">
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
                    </div>
                  </div>
                )}
              </div>
              
              <div className="pt-2.5 border-t">
                <label className="block text-xs font-medium mb-2 text-gray-700">Text/Line Configs</label>
                <div className="custom-slider-container mb-1">
                  <span className="text-xs font-medium text-gray-700 flex-shrink-0" style={{ width: '50px' }}>Color:</span>
                  <input 
                    type="color" 
                    value={color} 
                    onChange={e => setColor(e.target.value)} 
                    className="h-6 rounded" 
                    style={{ width: '60px' }}
                  />
                </div>
              </div>
              <div>
                <div className="custom-slider-container mb-1">
                  <span className="text-xs font-medium text-gray-700 flex-shrink-0" style={{ width: '50px' }}>Stroke:</span>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={stroke}
                    onChange={e => setStroke(parseInt(e.target.value))}
                    className="custom-slider"
                    style={{
                      background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((stroke - 1) / (20 - 1)) * 100}%, #e5e7eb ${((stroke - 1) / (20 - 1)) * 100}%, #e5e7eb 100%)`
                    }}
                  />
                  <div className="custom-slider-value">{stroke}</div>
                </div>
              </div>
              <div>
                <div className="custom-slider-container mb-1">
                  <span className="text-xs font-medium text-gray-700 flex-shrink-0" style={{ width: '50px' }}>Font:</span>
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
              </div>
              
              <div className="pt-2.5 border-t">
                <div className="flex gap-1.5">
                  <button onClick={handleReset} className="flex-1 px-1.5 py-1.5 rounded text-xs bg-gray-100 hover:bg-gray-200 transition-colors">
                    Reset
                  </button>
                  <button onClick={handleSave} disabled={isSaving} className="flex-1 px-1.5 py-1.5 rounded text-xs bg-brand-red text-white flex items-center justify-center disabled:opacity-50 hover:bg-red-700 transition-colors">
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
