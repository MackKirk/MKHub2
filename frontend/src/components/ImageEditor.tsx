import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';

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
  points?: { x: number; y: number }[];
  text?: string;
  color: string;
  stroke: number;
  font?: string;
  _editing?: boolean;
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
  const [mode, setMode] = useState<'pan' | 'rect' | 'arrow' | 'text' | 'circle' | 'draw' | 'select'>('pan');
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
  const [font, setFont] = useState('16px Montserrat');
  const [text, setText] = useState('');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const draggingRef = useRef<{ active: boolean; startX: number; startY: number } | null>(null);
  const drawingRef = useRef<AnnotationItem | null>(null);
  const movingRef = useRef<{ item: AnnotationItem; startX: number; startY: number } | null>(null);
  const marqueeRef = useRef<{ x: number; y: number; x2: number; y2: number } | null>(null);
  const textEditingRef = useRef<string | null>(null);
  const loadedFileIdRef = useRef<string | null>(null);
  const loadingRef = useRef<boolean>(false);
  
  // Load image - only when modal opens or fileObjectId changes
  useEffect(() => {
    if (!isOpen) {
      setImg(null);
      setIsLoading(false);
      setLoadError(null);
      loadedFileIdRef.current = null;
      loadingRef.current = false;
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
      ctx.font = it.font || font;
      const w = ctx.measureText(it.text || '').width;
      const h = parseInt(it.font || font, 10) || 16;
      return { x: it.x, y: it.y - h, w, h };
    }
    if (it.type === 'circle') {
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
  }, [font]);

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
        ctx.font = it.font || font;
        ctx.fillText(it.text || '', it.x, it.y);
      } else if (it.type === 'circle') {
        ctx.beginPath();
        ctx.arc(it.x, it.y, Math.max(1, it.r || 1), 0, Math.PI * 2);
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
      
      // Draw selection border
      if (selectedIds.includes(it.id)) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#3b82f6';
        const bb = getItemBounds(it);
        if (bb) {
          ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
        }
      }
      ctx.restore();
    }
    
    // Draw marquee
    if (marqueeRef.current) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#3b82f6';
      const m = marqueeRef.current;
      const x = Math.min(m.x, m.x2);
      const y = Math.min(m.y, m.y2);
      const w = Math.abs(m.x2 - m.x);
      const h = Math.abs(m.y2 - m.y);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
  }, [items, selectedIds, font, getItemBounds]);

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

  // Canvas mouse handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    if (mode === 'pan') return; // Pan mode handles canvas, not overlay
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (mode === 'rect') {
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
          r: 1,
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
        const newItem: AnnotationItem = {
          id: 'it_' + Date.now(),
          type: 'text',
          x,
          y,
          text: text || '',
          font,
          color,
          stroke,
          _editing: true,
        };
        setItems(prev => [...prev, newItem]);
        setSelectedIds([newItem.id]);
        textEditingRef.current = newItem.id;
      } else if (mode === 'select') {
        if (e.shiftKey) {
          marqueeRef.current = { x, y, x2: x, y2: y };
        } else {
          const hit = itemAt(x, y);
          if (hit) {
            setSelectedIds(prev => prev.includes(hit.id) ? prev : [hit.id]);
            movingRef.current = { item: hit, startX: x, startY: y };
          } else {
            setSelectedIds([]);
            // Click on empty area -> return to pan mode
            setMode('pan');
          }
        }
      }
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
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
        const dx = x - drawingRef.current.x;
        const dy = y - drawingRef.current.y;
        setItems(prev => prev.map(it => it.id === drawingRef.current!.id ? { ...it, r: Math.max(1, Math.hypot(dx, dy)) } : it));
      } else if (drawingRef.current.type === 'path') {
        setItems(prev => prev.map(it => {
          if (it.id === drawingRef.current!.id) {
            const pts = [...(it.points || []), { x, y }];
            return { ...it, points: pts };
          }
          return it;
        }));
      }
      return;
    }
    
    if (movingRef.current) {
      const moveState = movingRef.current;
      const dx = x - moveState.startX;
      const dy = y - moveState.startY;
      setItems(prev => prev.map(it => {
        if (selectedIds.includes(it.id)) {
          if (it.type === 'rect') {
            return { ...it, x: it.x + dx, y: it.y + dy };
          } else if (it.type === 'arrow') {
            return { ...it, x: it.x + dx, y: it.y + dy, x2: (it.x2 || it.x) + dx, y2: (it.y2 || it.y) + dy };
          } else if (it.type === 'text') {
            return { ...it, x: it.x + dx, y: it.y + dy };
          } else if (it.type === 'circle') {
            return { ...it, x: it.x + dx, y: it.y + dy };
          } else if (it.type === 'path') {
            return { ...it, points: (it.points || []).map(p => ({ x: p.x + dx, y: p.y + dy })) };
          }
        }
        return it;
      }));
      // Verify ref still exists before updating
      if (movingRef.current) {
        movingRef.current.startX = x;
        movingRef.current.startY = y;
      }
    }
  };

  const handleOverlayMouseUp = () => {
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
    drawingRef.current = null;
    movingRef.current = null;
  };

  // Keyboard handlers
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedIds.length) {
        setItems(prev => prev.filter(it => !selectedIds.includes(it.id)));
        setSelectedIds([]);
      } else if (textEditingRef.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setItems(prev => prev.map(it => {
          if (it.id === textEditingRef.current && it.type === 'text') {
            return { ...it, text: (it.text || '') + e.key };
          }
          return it;
        }));
      } else if (textEditingRef.current && e.key === 'Backspace') {
        setItems(prev => prev.map(it => {
          if (it.id === textEditingRef.current && it.type === 'text') {
            return { ...it, text: (it.text || '').slice(0, -1) };
          }
          return it;
        }));
      } else if (textEditingRef.current && (e.key === 'Enter' || e.key === 'Escape')) {
        textEditingRef.current = null;
        setItems(prev => prev.map(it => ({ ...it, _editing: false })));
        setSelectedIds([]);
      } else if (e.key === 'Escape' && mode !== 'pan') {
        // Escape key -> return to pan mode
        setMode('pan');
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIds]);

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
    
    // Create final canvas with same size as image
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = img.naturalWidth;
    finalCanvas.height = img.naturalHeight;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) return;
    
    // Draw image with transformations
    ctx.save();
    ctx.translate(finalCanvas.width / 2 + (offsetX * finalCanvas.width / canvas.width), finalCanvas.height / 2 + (offsetY * finalCanvas.height / canvas.height));
    ctx.rotate(angle * Math.PI / 180);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s = scale;
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    
    // Scale annotations and draw them
    const scaleX = finalCanvas.width / canvas.width;
    const scaleY = finalCanvas.height / canvas.height;
    for (const it of items) {
      ctx.save();
      ctx.strokeStyle = it.color;
      ctx.fillStyle = it.color;
      ctx.lineWidth = it.stroke * scaleX;
      
      if (it.type === 'rect') {
        ctx.strokeRect(it.x * scaleX, it.y * scaleY, (it.w || 0) * scaleX, (it.h || 0) * scaleY);
      } else if (it.type === 'arrow') {
        const x1 = it.x * scaleX, y1 = it.y * scaleY;
        const x2 = (it.x2 || it.x) * scaleX, y2 = (it.y2 || it.y) * scaleY;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const head = (10 + it.stroke * 2) * scaleX;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux * head - uy * head * 0.5, y2 - uy * head + ux * head * 0.5);
        ctx.lineTo(x2 - ux * head + uy * head * 0.5, y2 - uy * head - ux * head * 0.5);
        ctx.closePath();
        ctx.fill();
      } else if (it.type === 'text') {
        const fontSize = parseInt(it.font || font, 10) * scaleX;
        ctx.font = `${fontSize}px ${(it.font || font).split(' ').slice(1).join(' ') || 'Montserrat'}`;
        ctx.fillText(it.text || '', it.x * scaleX, it.y * scaleY);
      } else if (it.type === 'circle') {
        ctx.beginPath();
        ctx.arc(it.x * scaleX, it.y * scaleY, Math.max(1, (it.r || 1) * scaleX), 0, Math.PI * 2);
        ctx.stroke();
      } else if (it.type === 'path') {
        const pts = it.points || [];
        if (pts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x * scaleX, pts[0].y * scaleY);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x * scaleX, pts[i].y * scaleY);
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
              <div className="relative border border-gray-300 bg-gray-100 inline-block">
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-gray-200 border-t-brand-red animate-spin" />
                      <div className="text-sm text-gray-600">Loading image...</div>
                    </div>
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
                        cursor: mode === 'pan' ? (draggingRef.current?.active ? 'grabbing' : 'grab') : 'default',
                        display: 'block'
                      }}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseLeave}
                    />
                    <canvas
                      ref={overlayRef}
                      className="absolute left-0 top-0"
                      style={{ 
                        cursor: mode !== 'pan' ? 'crosshair' : 'default',
                        pointerEvents: mode !== 'pan' ? 'auto' : 'none'
                      }}
                      onMouseDown={handleOverlayMouseDown}
                      onMouseMove={handleOverlayMouseMove}
                      onMouseUp={handleOverlayMouseUp}
                      onMouseLeave={handleOverlayMouseUp}
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
                  <button onClick={() => setMode('select')} className={`px-3 py-2 rounded text-sm ${mode === 'select' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                    🖱️ Select
                  </button>
                  <button onClick={() => setMode('rect')} className={`px-3 py-2 rounded text-sm ${mode === 'rect' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                    ▭ Rect
                  </button>
                  <button onClick={() => setMode('arrow')} className={`px-3 py-2 rounded text-sm ${mode === 'arrow' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                    ➤ Arrow
                  </button>
                  <button onClick={() => setMode('text')} className={`px-3 py-2 rounded text-sm ${mode === 'text' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                    T Text
                  </button>
                  <button onClick={() => setMode('circle')} className={`px-3 py-2 rounded text-sm ${mode === 'circle' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                    ◯ Circle
                  </button>
                  <button onClick={() => setMode('draw')} className={`px-3 py-2 rounded text-sm ${mode === 'draw' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                    ✏️ Draw
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
                <label className="block text-sm font-medium mb-2">Font</label>
                <input type="text" value={font} onChange={e => setFont(e.target.value)} className="w-full border rounded px-2 py-1" />
              </div>
              {mode === 'text' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Text (for text tool)</label>
                  <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Your text" className="w-full border rounded px-2 py-1" />
                </div>
              )}
              
              <div className="pt-4 border-t">
                <button onClick={handleReset} className="w-full px-3 py-2 rounded bg-gray-100 mb-2">
                  Reset
                </button>
                <button onClick={handleSave} className="w-full px-3 py-2 rounded bg-brand-red text-white">
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
