import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';

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
};

type ImageEditorProps = {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageName?: string;
  fileObjectId?: string;
  onSave: (blob: Blob) => Promise<void>;
};

export default function ImageEditor({ isOpen, onClose, imageUrl, imageName = 'image', fileObjectId, onSave }: ImageEditorProps) {
  const [mode, setMode] = useState<'pan' | 'rect' | 'arrow' | 'text' | 'circle' | 'draw' | 'select' | 'delete'>('pan');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [angle, setAngle] = useState(0);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [items, setItems] = useState<AnnotationItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [color, setColor] = useState('#ff0000');
  const [stroke, setStroke] = useState(3);
  const [fontSize, setFontSize] = useState(16);
  const [text, setText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const cursorBlinkRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const draggingRef = useRef<{ active: boolean; startX: number; startY: number } | null>(null);
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
        if (it.id === textEditingRef.current && it.type === 'text') {
          return { ...it, fontSize };
        }
        return it;
      }));
    }
  }, [fontSize]);

  // Helper to exit text editing mode (used by ESC and click-outside)
  const exitTextEditing = useCallback(() => {
    const editingId = textEditingRef.current;
    if (!editingId) return;

    textEditingRef.current = null;
    textCursorPositionRef.current = 0;
    textSelectionStartRef.current = null;

    // Turn off editing flag for the text item
    setItems(prev => prev.map(it =>
      it.id === editingId && it.type === 'text'
        ? { ...it, _editing: false, selectionStart: undefined, selectionEnd: undefined }
        : it
    ));

    // Keep the text selected so user can still move/resize it
    setSelectedIds(prev =>
      prev.length === 1 && prev[0] === editingId ? prev : [editingId]
    );

    if (cursorBlinkRef.current) {
      clearInterval(cursorBlinkRef.current);
      cursorBlinkRef.current = null;
    }

    // After leaving text editing we always return to pan mode
    setMode('pan');
  }, [setItems, setSelectedIds, setMode]);

  // Load image - only when modal opens or fileObjectId changes
  useEffect(() => {
    if (!isOpen) {
      setImg(null);
      setIsLoading(false);
      setLoadError(null);
      loadedFileIdRef.current = null;
      loadingRef.current = false;
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
          setMode('pan');
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

  // Set canvas size to match image dimensions (scaled to fit viewport if needed)
  useEffect(() => {
    if (!canvasRef.current || !overlayRef.current || !img) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    // Get available space in container (accounting for sidebar width ~280px and padding)
    const availableWidth = Math.max(300, container.clientWidth - 300);
    const availableHeight = Math.max(300, window.innerHeight * 0.75);
    
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;
    const imgAspect = imgWidth / imgHeight;
    const containerAspect = availableWidth / availableHeight;
    
    let canvasWidth: number;
    let canvasHeight: number;
    
    // Scale image to fit available space while maintaining aspect ratio
    if (imgAspect > containerAspect) {
      // Image is wider - fit to width
      canvasWidth = Math.min(imgWidth, availableWidth);
      canvasHeight = canvasWidth / imgAspect;
    } else {
      // Image is taller - fit to height
      canvasHeight = Math.min(imgHeight, availableHeight);
      canvasWidth = canvasHeight * imgAspect;
    }
    
    canvasRef.current.width = Math.round(canvasWidth);
    canvasRef.current.height = Math.round(canvasHeight);
    overlayRef.current.width = canvasRef.current.width;
    overlayRef.current.height = canvasRef.current.height;
  }, [img, isOpen]);

  // Clamp translation to prevent white margins - image must always fill canvas
  const clampOffset = useCallback((x: number, y: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return { x, y };

    // Calculate the displayed size of the image after rotation and scale
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = scale;
    
    // For rotated images, we need to calculate the bounding box
    const angleRad = (angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angleRad));
    const sin = Math.abs(Math.sin(angleRad));
    
    // Rotated bounding box dimensions
    const rotatedW = iw * s * cos + ih * s * sin;
    const rotatedH = iw * s * sin + ih * s * cos;
    
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Calculate limits: image edges must touch or exceed canvas edges
    const maxX = Math.max(0, (rotatedW - cw) / 2);
    const maxY = Math.max(0, (rotatedH - ch) / 2);
    const minX = -maxX;
    const minY = -maxY;
    
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
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

  // Draw base image
  const drawBase = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Use clamped offsets
    const clamped = clampOffset(offsetX, offsetY);
    
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f6f6f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.translate(canvas.width / 2 + clamped.x, canvas.height / 2 + clamped.y);
    ctx.rotate(angle * Math.PI / 180);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = scale;
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }, [img, angle, scale, offsetX, offsetY, clampOffset]);

  // Get item bounds
  const getItemBounds = useCallback((it: AnnotationItem) => {
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
      // Support both circle (r) and ellipse (rx, ry)
      if (it.rx !== undefined && it.ry !== undefined) {
        return { x: it.x - it.rx, y: it.y - it.ry, w: it.rx * 2, h: it.ry * 2 };
      }
      const r = Math.max(1, it.r || 1);
      return { x: it.x - r, y: it.y - r, w: r * 2, h: r * 2 };
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
    
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    
    // Draw items
    for (const it of items) {
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
        if (it.w && it.h && (it._editing || (drawingRef.current && drawingRef.current.id === it.id))) {
          ctx.strokeStyle = it.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(it.x, it.y, it.w, it.h);
          ctx.setLineDash([]);
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
        // Support both circle (r) and ellipse (rx, ry)
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
      
      // Draw selection border in red when items are selected (only in select mode, not during drawing)
      if (selectedIds.includes(it.id) && mode === 'select' && !drawingRef.current) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#d11616'; // brand-red
        ctx.lineWidth = 1;
        const bb = getItemBounds(it);
        if (bb) {
          ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
          
          // Draw resize handles (8 handles: corners and midpoints)
          // For paths, only show corner handles
          const handleSize = 12; // slightly larger for easier interaction
          const isPath = it.type === 'path';
          const handles = isPath ? [
            { x: bb.x, y: bb.y, name: 'nw' }, // top-left
            { x: bb.x + bb.w, y: bb.y, name: 'ne' }, // top-right
            { x: bb.x + bb.w, y: bb.y + bb.h, name: 'se' }, // bottom-right
            { x: bb.x, y: bb.y + bb.h, name: 'sw' }, // bottom-left
          ] : [
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

  // Redraw both canvases
  useEffect(() => {
    if (!isOpen || !img) return;
    // Small delay to ensure canvas size is set
    const timeout = setTimeout(() => {
      drawBase();
      drawOverlay();
    }, 10);
    return () => clearTimeout(timeout);
  }, [isOpen, img, drawBase, drawOverlay]);

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
    
    // Calculate which line was clicked
    const lineHeight = itemFontSize * 1.2;
    const startY = item.y + padding + itemFontSize;
    const relativeY = clickY - startY;
    const lineIndex = Math.max(0, Math.floor(relativeY / lineHeight));
    
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

  // Canvas mouse handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Disable pan when editing text - clicking canvas should exit edit mode
    if (textEditingRef.current) {
      // Same behavior as pressing ESC
      exitTextEditing();
      return;
    }
    if (mode !== 'pan') return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    draggingRef.current = {
      active: true,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // This handler is mostly for cursor updates, actual dragging handled by global listener
    if (mode !== 'pan' || !draggingRef.current?.active) return;
  };

  const handleCanvasMouseUp = () => {
    draggingRef.current = null;
  };

  const handleCanvasMouseLeave = () => {
    // Clean up dragging when mouse leaves canvas
    draggingRef.current = null;
  };

  // Global mouse handlers to track dragging even when mouse leaves canvas
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Disable pan when editing text
      if (textEditingRef.current) return;
      if (mode !== 'pan') return;
      
      const dragState = draggingRef.current;
      if (!dragState || !dragState.active) return;

      try {
        const canvas = canvasRef.current;
        if (!canvas) {
          draggingRef.current = null;
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        // Capture all needed values before any state updates to avoid race conditions
        const startX = dragState.startX;
        const startY = dragState.startY;

        // Verify ref still exists and is active
        if (!draggingRef.current || !draggingRef.current.active) {
          return;
        }

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        // Only update if there's actual movement
        if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1) {
          // Update offsets - clamp will be applied by useEffect
          setOffsetX(prev => prev + deltaX);
          setOffsetY(prev => prev + deltaY);

          // Update the ref with new start position only if it still exists
          if (draggingRef.current && draggingRef.current.active) {
            draggingRef.current.startX = currentX;
            draggingRef.current.startY = currentY;
          }
        }
      } catch (error) {
        console.error('Error in global mouse move:', error);
        draggingRef.current = null;
      }
    };

    const handleGlobalMouseUp = () => {
      draggingRef.current = null;
    };

    // Always add listeners, they'll only work when dragging is active
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isOpen, mode, clampOffset]);

  // Overlay mouse handlers
  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Handle clicks when editing text (even in pan mode)
    if (textEditingRef.current) {
      const editingItem = items.find(it => it.id === textEditingRef.current && it.type === 'text');
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
              // Click inside the core text area → start caret + drag-selection
              const cursorPos = getTextCursorPosition(editingItem, x, y);
              textCursorPositionRef.current = cursorPos;
              textSelectionStartRef.current = cursorPos;
              textSelectingRef.current = true;
              setItems(prev => prev.map(it => 
                it.id === editingItem.id ? { ...it, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it
              ));
              // Ensure overlay has focus for keyboard events (arrows, etc)
              if (overlayRef.current) {
                overlayRef.current.focus();
              }
              e.stopPropagation();
              return;
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
        setItems(prev => prev.filter(it => it.id !== hit.id));
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
        setItems(prev => [...prev, newItem]);
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
        setItems(prev => [...prev, newItem]);
        setSelectedIds([newItem.id]);
        drawingRef.current = newItem;
      } else if (mode === 'circle') {
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'circle',
          x,
          y,
          rx: 1, // Start as ellipse to allow oval shapes
          ry: 1,
          color,
          stroke,
        };
        setItems(prev => [...prev, newItem]);
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
        setItems(prev => [...prev, newItem]);
        setSelectedIds([newItem.id]);
        drawingRef.current = newItem;
      } else if (mode === 'text') {
        // Create a text area by drawing a rectangle first
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'text',
          x,
          y,
          w: 200, // default width
          h: 30, // default height
          text: '', // Start with empty text
          fontSize,
          color,
          stroke,
          _editing: false,
        };
        setItems(prev => [...prev, newItem]);
        setSelectedIds([newItem.id]);
        drawingRef.current = newItem; // Use drawingRef to allow resizing the text area
      } else if (mode === 'select') {
        if (e.shiftKey) {
          marqueeRef.current = { x, y, x2: x, y2: y };
        } else {
          // First check if clicking on a resize handle of any selected item
          let handleClicked = false;
          for (const item of items) {
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
                    startR: item.type === 'circle' ? (item.r || (item.rx && item.ry ? Math.max(item.rx, item.ry) : undefined)) : undefined,
                    startRx: item.type === 'circle' ? (item.rx || item.r) : undefined,
                    startRy: item.type === 'circle' ? (item.ry || item.r) : undefined,
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
                it.id === hit.id ? { ...it, cursorPosition: cursorPos } : it
              ));
              return; // Don't do anything else, just update cursor position
            }
            
            // If clicking outside the text being edited, exit edit mode and return to pan
            if (textEditingRef.current && (!hit || hit.type !== 'text' || hit.id !== textEditingRef.current)) {
              setItems(prev => prev.map(it => ({ ...it, _editing: false })));
              textEditingRef.current = null;
              textCursorPositionRef.current = 0;
              if (cursorBlinkRef.current) {
                clearInterval(cursorBlinkRef.current);
                cursorBlinkRef.current = null;
              }
              setMode('pan');
              return; // Don't continue with selection logic
            }
            
          if (hit) {
            // Select the item (or keep it selected if already selected)
            if (!selectedIds.includes(hit.id)) {
              setSelectedIds([hit.id]);
            }
            
            if (hit.type === 'text') {
              // SINGLE STATE for text:
              // - Click inside area enters edit mode
              // - Resize handles still work (handled above via getHandleAt)
            const cursorPos = getTextCursorPosition(hit, x, y);
            textCursorPositionRef.current = cursorPos;
            textSelectionStartRef.current = null;
            setItems(prev => prev.map(it => 
              it.id === hit.id ? { ...it, _editing: true, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it
            ));
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
              // Click on empty area -> return to pan mode
              setMode('pan');
            }
          }
        }
      }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Mouse-drag text selection while editing
    if (textEditingRef.current && textSelectingRef.current) {
      const editingItem = items.find(it => it.id === textEditingRef.current && it.type === 'text');
      if (editingItem) {
        const currentText = editingItem.text || '';
        const anchor = textSelectionStartRef.current ?? textCursorPositionRef.current;
        const cursorPos = getTextCursorPosition(editingItem, x, y);
        textCursorPositionRef.current = cursorPos;
        textSelectionStartRef.current = anchor;
        const start = Math.max(0, Math.min(anchor, cursorPos));
        const end = Math.min(currentText.length, Math.max(anchor, cursorPos));
        setItems(prev => prev.map(it => 
          it.id === editingItem.id
            ? { ...it, cursorPosition: cursorPos, selectionStart: start, selectionEnd: end }
            : it
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
    
    if (drawingRef.current) {
      if (drawingRef.current.type === 'rect') {
        setItems(prev => prev.map(it => it.id === drawingRef.current!.id ? { ...it, w: x - it.x, h: y - it.y } : it));
      } else if (drawingRef.current.type === 'arrow') {
        setItems(prev => prev.map(it => it.id === drawingRef.current!.id ? { ...it, x2: x, y2: y } : it));
      } else if (drawingRef.current.type === 'circle') {
        const dx = Math.abs(x - drawingRef.current.x);
        const dy = Math.abs(y - drawingRef.current.y);
        // Allow independent rx and ry for oval shapes
        setItems(prev => prev.map(it => {
          if (it.id === drawingRef.current!.id) {
            return { ...it, rx: Math.max(1, dx), ry: Math.max(1, dy) };
          }
          return it;
        }));
      } else if (drawingRef.current.type === 'text') {
        // Allow resizing text area
        setItems(prev => prev.map(it => it.id === drawingRef.current!.id ? { ...it, w: x - it.x, h: y - it.y } : it));
      } else if (drawingRef.current.type === 'path') {
        setItems(prev => prev.map(it => {
          if (it.id === drawingRef.current!.id) {
            const pts = [...(it.points || []), { x, y }];
            return { ...it, points: pts };
          }
          return it;
        }));
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
            const { handle, startR, startRx, startRy } = resizeState;
            const centerX = item.x;
            const centerY = item.y;
            
            // Support both circle (r) and ellipse (rx, ry)
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
      }));
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
        const b = getItemBounds(it);
        if (b && b.x >= x && b.y >= y && (b.x + b.w) <= x + w && (b.y + b.h) <= y + h) {
          sel.push(it.id);
        }
      }
      setSelectedIds(sel);
      marqueeRef.current = null;
    }
    
    // If we just finished drawing rect, arrow, circle, or text, switch to pan mode
    if (drawingRef.current) {
      const drawnType = drawingRef.current.type;
      const drawnId = drawingRef.current.id;
      if (drawnType === 'rect' || drawnType === 'arrow' || drawnType === 'circle') {
        setMode('pan');
      } else if (drawnType === 'text') {
        // For text, enable editing after creating the area
        setItems(prev => prev.map(it => it.id === drawnId ? { ...it, _editing: true } : it));
        textEditingRef.current = drawnId;
        setMode('pan');
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
          const editingItem = items.find(it => it.id === textEditingRef.current && it.type === 'text');
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
                it.id === textEditingRef.current ? { ...it, cursorPosition: cursorPos, selectionStart: selStart === null ? undefined : start, selectionEnd: selStart === null ? undefined : end } : it
              ));
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
              it.id === textEditingRef.current ? { ...it, cursorPosition: cursorPos, selectionStart: selStart === null ? undefined : start, selectionEnd: selStart === null ? undefined : end } : it
            ));
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
              it.id === textEditingRef.current ? { ...it, cursorPosition: cursorPos, selectionStart: selStart === null ? undefined : start, selectionEnd: selStart === null ? undefined : end } : it
            ));
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
              it.id === textEditingRef.current ? { ...it, cursorPosition: cursorPos, selectionStart: selStart === null ? undefined : start, selectionEnd: selStart === null ? undefined : end } : it
            ));
          } else if (e.key === 'Backspace') {
            e.preventDefault();
            const { start, end } = hasSelection ? normSelection() : { start: cursorPos - 1, end: cursorPos };
            if (start >= 0 && end > start) {
              const newText = currentText.substring(0, start) + currentText.substring(end);
              cursorPos = start;
              textCursorPositionRef.current = cursorPos;
              textSelectionStartRef.current = null;
              setItems(prev => prev.map(it => 
                it.id === textEditingRef.current ? { ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it
              ));
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const { start, end } = hasSelection ? normSelection() : { start: cursorPos, end: cursorPos };
            const newText = currentText.substring(0, start) + '\n' + currentText.substring(end);
            cursorPos = start + 1;
            textCursorPositionRef.current = cursorPos;
            textSelectionStartRef.current = null;
            setItems(prev => prev.map(it => 
              it.id === textEditingRef.current ? { ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it
            ));
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
              it.id === textEditingRef.current ? { 
                ...it, 
                cursorPosition: cursorPos, 
                selectionStart: 0, 
                selectionEnd: currentText.length 
              } : it
            ));
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
                it.id === textEditingRef.current ? { 
                  ...it, 
                  text: newText, 
                  cursorPosition: cursorPos, 
                  selectionStart: undefined, 
                  selectionEnd: undefined 
                } : it
              ));
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
              it.id === textEditingRef.current ? { ...it, text: newText, cursorPosition: cursorPos, selectionStart: undefined, selectionEnd: undefined } : it
            ));
          }
        }
      } else if (e.key === 'Delete' && selectedIds.length) {
        // Only delete when not editing text
        setItems(prev => prev.filter(it => !selectedIds.includes(it.id)));
        setSelectedIds([]);
      } else if (e.key === 'Escape' && mode !== 'pan') {
        // Escape key -> return to pan mode
        setMode('pan');
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
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay || !img) return;
    
    // Create final canvas with same size as the editing canvas to match what user sees
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = canvas.width;
    finalCanvas.height = canvas.height;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) return;
    
    // Draw base image with transformations (same as drawBase function)
    ctx.save();
    const clamped = clampOffset(offsetX, offsetY);
    ctx.clearRect(0, 0, finalCanvas.width, finalCanvas.height);
    ctx.fillStyle = '#f6f6f6';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    
    ctx.translate(finalCanvas.width / 2 + clamped.x, finalCanvas.height / 2 + clamped.y);
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
    finalCanvas.toBlob(async (blob) => {
      if (blob) {
        await onSave(blob);
        onClose();
      }
    }, 'image/png');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="w-[1200px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">Edit Image: {imageName}</div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100">×</button>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          <div ref={containerRef} className="flex gap-4 flex-wrap">
            <div className="flex-1">
              <div className="relative border border-gray-300 bg-gray-100 inline-block" style={isLoading ? { height: '500px', width: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' } : undefined}>
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
                        cursor: (mode === 'pan' && !textEditingRef.current) ? (draggingRef.current?.active ? 'grabbing' : 'grab') : 'default',
                        display: 'block',
                        pointerEvents: textEditingRef.current ? 'none' : 'auto'
                      }}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseLeave}
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
                        pointerEvents: (mode !== 'pan' || textEditingRef.current) ? 'auto' : 'none',
                        outline: 'none'
                      }}
                      onMouseMove={(e) => {
                        if (mode === 'select') {
                          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
                          const x = e.clientX - rect.left;
                          const y = e.clientY - rect.top;
                          let cursor = 'default';
                          for (const item of items) {
                            if (selectedIds.includes(item.id)) {
                              const handle = getHandleAt(x, y, item);
                              if (handle) {
                                if (handle === 'nw' || handle === 'se') cursor = 'nwse-resize';
                                else if (handle === 'ne' || handle === 'sw') cursor = 'nesw-resize';
                                else if (handle === 'n' || handle === 's') cursor = 'ns-resize';
                                else if (handle === 'e' || handle === 'w') cursor = 'ew-resize';
                                break;
                              }
                            }
                          }
                          (e.target as HTMLCanvasElement).style.cursor = cursor;
                        }
                        handleOverlayMouseMove(e);
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
            
            <div className="w-64 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Image Controls</label>
                <div>
                  <label className="block text-sm font-medium mb-2">Rotation</label>
                  <div className="flex gap-2">
                    <button onClick={() => setAngle(prev => (prev + 270) % 360)} className="flex-1 px-3 py-2 rounded bg-gray-100">
                      ⟲ Left
                    </button>
                    <button onClick={() => setAngle(prev => (prev + 90) % 360)} className="flex-1 px-3 py-2 rounded bg-gray-100">
                      ⟳ Right
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-2">Zoom: {scale.toFixed(2)}x</label>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.01"
                    value={scale}
                    onChange={e => setScale(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  Pan: Drag image automatically when no tool is selected (Press ESC to return to pan)
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <label className="block text-sm font-medium mb-2">Annotation Tools</label>
                <div className="grid grid-cols-2 gap-2">
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
                    setMode(mode === 'select' ? 'pan' : 'select');
                  }} className={`px-3 py-2 rounded text-sm flex items-center justify-center gap-2 ${mode === 'select' ? 'bg-brand-red text-white' : 'bg-gray-100'}`}>
                    <img src={selectIcon} alt="Select" className="w-5 h-5" />
                    Select
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      setItems(prev => prev.map(it => ({ ...it, _editing: false })));
                      textEditingRef.current = null;
                      if (cursorBlinkRef.current) {
                        clearInterval(cursorBlinkRef.current);
                        cursorBlinkRef.current = null;
                      }
                    }
                    setMode(mode === 'rect' ? 'pan' : 'rect');
                  }} className={`px-3 py-2 rounded text-sm flex items-center justify-center gap-2 ${mode === 'rect' ? 'bg-brand-red text-white' : 'bg-gray-100'}`}>
                    <img src={rectIcon} alt="Rect" className="w-5 h-5" />
                    Rect
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      setItems(prev => prev.map(it => ({ ...it, _editing: false })));
                      textEditingRef.current = null;
                      if (cursorBlinkRef.current) {
                        clearInterval(cursorBlinkRef.current);
                        cursorBlinkRef.current = null;
                      }
                    }
                    setMode(mode === 'arrow' ? 'pan' : 'arrow');
                  }} className={`px-3 py-2 rounded text-sm flex items-center justify-center gap-2 ${mode === 'arrow' ? 'bg-brand-red text-white' : 'bg-gray-100'}`}>
                    <img src={arrowIcon} alt="Arrow" className="w-5 h-5" />
                    Arrow
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      setItems(prev => prev.map(it => ({ ...it, _editing: false })));
                      textEditingRef.current = null;
                      if (cursorBlinkRef.current) {
                        clearInterval(cursorBlinkRef.current);
                        cursorBlinkRef.current = null;
                      }
                    }
                    setMode(mode === 'text' ? 'pan' : 'text');
                  }} className={`px-3 py-2 rounded text-sm flex items-center justify-center gap-2 ${mode === 'text' ? 'bg-brand-red text-white' : 'bg-gray-100'}`}>
                    <img src={textIcon} alt="Text" className="w-5 h-5" />
                    Text
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      setItems(prev => prev.map(it => ({ ...it, _editing: false })));
                      textEditingRef.current = null;
                      if (cursorBlinkRef.current) {
                        clearInterval(cursorBlinkRef.current);
                        cursorBlinkRef.current = null;
                      }
                    }
                    setMode(mode === 'circle' ? 'pan' : 'circle');
                  }} className={`px-3 py-2 rounded text-sm flex items-center justify-center gap-2 ${mode === 'circle' ? 'bg-brand-red text-white' : 'bg-gray-100'}`}>
                    <img src={circleIcon} alt="Circle" className="w-5 h-5" />
                    Circle
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode(mode === 'draw' ? 'pan' : 'draw');
                  }} className={`px-3 py-2 rounded text-sm flex items-center justify-center gap-2 ${mode === 'draw' ? 'bg-brand-red text-white' : 'bg-gray-100'}`}>
                    <img src={pencilIcon} alt="Draw" className="w-5 h-5" />
                    Draw
                  </button>
                  <button onClick={() => {
                    if (textEditingRef.current) {
                      exitTextEditing();
                    }
                    setMode(mode === 'delete' ? 'pan' : 'delete');
                  }} className={`px-3 py-2 rounded text-sm flex items-center justify-center gap-2 ${mode === 'delete' ? 'bg-brand-red text-white' : 'bg-gray-100'}`}>
                    <img src={deleteIcon} alt="Delete" className="w-5 h-5" />
                    Delete
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Color</label>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-10" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Stroke: {stroke}</label>
                <input type="range" min="1" max="20" value={stroke} onChange={e => setStroke(parseInt(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Font Size: {fontSize}</label>
                <input type="range" min="8" max="72" value={fontSize} onChange={e => setFontSize(parseInt(e.target.value))} className="w-full" />
              </div>
              
              <div className="pt-4 border-t">
                <button onClick={handleReset} className="w-full px-3 py-2 rounded bg-gray-100 mb-2">
                  Reset
                </button>
                <button onClick={handleSave} className="w-full px-3 py-2 rounded bg-brand-red text-white flex items-center justify-center gap-2">
                  <img src={saveIcon} alt="Save" className="w-5 h-5" />
                  Save Image
                </button>
              </div>
              
              <div className="text-xs text-gray-500">
                <div>• Pan: drag image</div>
                <div>• Rect/Arrow/Text: click or drag</div>
                <div>• Click to select, drag to move</div>
                <div>• Del key removes selected</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
