import { useEffect, useMemo, useRef, useState } from 'react';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import ImageEditor from '@/components/ImageEditor';
import OverlayPortal from '@/components/OverlayPortal';
import {
  editorCaptionClass,
  editorPanelAsideClass,
  editorPanelTitleClass,
  editorSegmentedControlTrackClass,
  editorSegmentedSegmentIdleClass,
  editorSegmentedSegmentSelectedClass,
  editorTransitionInteractive,
  selectionToolButtonGhostClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';

type LibraryFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, category?:string };

const FILE_INPUT_ACCEPT = 'image/*,.heic,.heif,image/heic,image/heif';

function pickImageFileFromList(files: FileList | null): File | null {
  if (!files?.length) return null;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = (f.name || '').toLowerCase();
    if (f.type.startsWith('image/') || ext.endsWith('.heic') || ext.endsWith('.heif')) return f;
  }
  return null;
}

function computeExportDimensions(
  targetWidth: number,
  targetHeight: number,
  exportScale: number | undefined,
  maxExportLongSide: number | undefined,
) {
  const scaleOut = Math.max(1, Number(exportScale || 1));
  let outW = Math.round(targetWidth * scaleOut);
  let outH = Math.round(targetHeight * scaleOut);
  if (maxExportLongSide && maxExportLongSide > 0) {
    const m = Math.max(outW, outH);
    if (m > maxExportLongSide) {
      const r = maxExportLongSide / m;
      outW = Math.max(1, Math.round(outW * r));
      outH = Math.max(1, Math.round(outH * r));
    }
  }
  return { outW, outH };
}

export default function ImagePicker({
  isOpen,
  onClose,
  onConfirm,
  targetWidth,
  targetHeight,
  allowEdit = true,
  clientId,
  projectId,
  exportScale = 2,
  fileObjectId,
  editorScaleFactor = 2.5,
  hideEditButton = false,
  openEditorOnOpen = false,
  /** If set, scales export down so max(width,height) does not exceed this (px). */
  maxExportLongSide,
}:{
  isOpen:boolean,
  onClose:()=>void,
  onConfirm:(blob:Blob, originalFileObjectId?:string)=>void,
  targetWidth:number,
  targetHeight:number,
  allowEdit?:boolean,
  clientId?:string,
  projectId?:string,
  exportScale?: number,
  fileObjectId?:string,
  editorScaleFactor?: number,
  hideEditButton?: boolean,
  openEditorOnOpen?: boolean,
  maxExportLongSide?: number,
}){
  const exportDimensions = useMemo(
    () => computeExportDimensions(targetWidth, targetHeight, exportScale, maxExportLongSide),
    [targetWidth, targetHeight, exportScale, maxExportLongSide],
  );
  const hasLibrary = !!(clientId || projectId);
  const [tab, setTab] = useState<'upload'|'library'>('upload');
  const [filesOriginals, setFilesOriginals] = useState<LibraryFile[]>([]);
  const [filesDerived, setFilesDerived] = useState<LibraryFile[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState<boolean>(false);
  const [libraryLoaded, setLibraryLoaded] = useState<boolean>(false);
  const [displayPageOriginals, setDisplayPageOriginals] = useState<number>(0);
  const [displayPageDerived, setDisplayPageDerived] = useState<number>(0);
  const IMAGES_PER_PAGE = 9;
  const [img, setImg] = useState<HTMLImageElement|null>(null);
  const [originalFileObjectId, setOriginalFileObjectId] = useState<string|undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showProgress, setShowProgress] = useState<boolean>(false);
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [showImageEditor, setShowImageEditor] = useState<boolean>(false);
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [isSavingFromEditor, setIsSavingFromEditor] = useState<boolean>(false);

  // crop state
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragging = useRef<{x:number, y:number, tx:number, ty:number}|null>(null);
  const [isPanning] = useState(true);
  const blobUrlRef = useRef<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const dropDepthRef = useRef(0);

  useEffect(()=>{
    if(!isOpen){
      setImg(null); setZoom(1); setTx(0); setTy(0); setOriginalFileObjectId(undefined); setTab('upload');
      setLibraryLoaded(false); setFilesOriginals([]); setFilesDerived([]); setDisplayPageOriginals(0); setDisplayPageDerived(0);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    }
  }, [isOpen]);

  // Handle paste from clipboard - works when button is clicked
  const handlePaste = async () => {
    try {
      // Try Clipboard API first (requires HTTPS or localhost)
      if (navigator.clipboard && navigator.clipboard.read) {
        try {
          const clipboardItems = await navigator.clipboard.read();
          
          for (const item of clipboardItems) {
            // Check if clipboard contains image
            const imageTypes = item.types.filter(type => type.startsWith('image/'));
            if (imageTypes.length > 0) {
              const blob = await item.getType(imageTypes[0]);
              
              // Create a File object from the blob
              const file = new File([blob], `pasted-image-${Date.now()}.png`, { 
                type: blob.type || 'image/png' 
              });
              
              await loadFromFile(file);
              toast.success('Image pasted from clipboard');
              return;
            }
          }
          toast.error('No image found in clipboard. Please copy an image first.');
          return;
        } catch (clipboardError: any) {
          if (clipboardError.name === 'NotAllowedError' || clipboardError.name === 'SecurityError') {
            toast.error('Please allow clipboard access or press Ctrl+V to paste');
            return;
          }
          console.log('Clipboard API failed, user should use Ctrl+V instead:', clipboardError);
        }
      }
      
      // If Clipboard API is not available or failed, show helpful message
      toast.error('Please press Ctrl+V (or Cmd+V on Mac) while the picker is open to paste an image from your clipboard.');
    } catch (error: any) {
      console.error('Paste failed:', error);
      toast.error('Failed to paste image. Please try pressing Ctrl+V while the picker is open, or use the file upload button.');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    
    const onKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    // Handle paste event (works with Ctrl+V, Cmd+V, or right-click paste)
    const onPaste = async (e: ClipboardEvent) => {
      e.preventDefault();
      const items = e.clipboardData?.items;
      if (!items) {
        // Try Clipboard API as fallback
        try {
          if (navigator.clipboard && navigator.clipboard.read) {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
              const imageTypes = item.types.filter(type => type.startsWith('image/'));
              if (imageTypes.length > 0) {
                const blob = await item.getType(imageTypes[0]);
                const file = new File([blob], `pasted-image-${Date.now()}.png`, { 
                  type: blob.type || 'image/png' 
                });
                await loadFromFile(file);
                toast.success('Image pasted from clipboard');
                return;
              }
            }
          }
        } catch (err) {
          console.error('Clipboard API fallback failed:', err);
        }
        toast.error('No clipboard data available');
        return;
      }
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const file = new File([blob], `pasted-image-${Date.now()}.png`, { 
              type: blob.type || 'image/png' 
            });
            await loadFromFile(file);
            toast.success('Image pasted from clipboard');
            return;
          }
        }
      }
      toast.error('No image found in clipboard. Please copy an image first.');
    };
    
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose]); // loadFromFile is stable, no need to include

  // Load all images, split into originals vs edited/derived, then show 9 per page per section
  const FETCH_LIMIT = 500;
  const loadLibrary = async (reset: boolean) => {
    if (!clientId && !projectId) return;
    try {
      setIsLoadingLibrary(true);
      let list: LibraryFile[] = [];
      if (projectId) {
        list = await api<LibraryFile[]>('GET', `/projects/${encodeURIComponent(projectId)}/files`);
      } else if (clientId) {
        list = await api<LibraryFile[]>('GET', `/clients/${clientId}/files?limit=${FETCH_LIMIT}&offset=0`);
      }
      const imgs = (list || []).filter((f) => {
        const isImg = (f.is_image === true) || String(f.content_type || '').startsWith('image/');
        return isImg;
      });
      const isDerived = (f: LibraryFile) => String(f.category || '').toLowerCase().includes('derived');
      setFilesOriginals(imgs.filter((f) => !isDerived(f)));
      setFilesDerived(imgs.filter(isDerived));
      setLibraryLoaded(true);
      if (reset) {
        setDisplayPageOriginals(0);
        setDisplayPageDerived(0);
      }
    } catch (err) { /* ignore */ }
    finally { setIsLoadingLibrary(false); }
  };

  useEffect(() => {
    if (tab === 'library' && isOpen && hasLibrary && !libraryLoaded && !isLoadingLibrary) {
      loadLibrary(true);
    }
  }, [tab, isOpen, hasLibrary, clientId, projectId, libraryLoaded, isLoadingLibrary]);

  const cw = 360;
  const ch = useMemo(()=> Math.round(cw * (targetHeight/targetWidth)), [targetWidth, targetHeight]);

  const coverScale = useMemo(()=>{
    if(!img) return 1;
    return Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  }, [img, cw, ch]);

  // clamp translation so image covers the frame (or allows movement within container when zoom < 1)
  const clamp = (nx:number, ny:number, nz:number)=>{
    if(!img) return { x: nx, y: ny };
    const dw = img.naturalWidth * coverScale * nz;
    const dh = img.naturalHeight * coverScale * nz;
    // If zoom < 1, allow movement within container (image smaller than container)
    if (nz < 1) {
      // Image can move from left edge (0) to right edge (cw - dw)
      // and from top edge (0) to bottom edge (ch - dh)
      const minX = 0;
      const maxX = cw - dw;
      const minY = 0;
      const maxY = ch - dh;
      return { x: Math.max(minX, Math.min(maxX, nx)), y: Math.max(minY, Math.min(maxY, ny)) };
    }
    // If zoom >= 1, ensure image covers the frame
    const minX = cw - dw;
    const minY = ch - dh;
    return { x: Math.min(0, Math.max(minX, nx)), y: Math.min(0, Math.max(minY, ny)) };
  };


  const loadFromFile = async (file: File)=>{
    const lower = (file.name||'').toLowerCase();
    const isHeic = lower.endsWith('.heic') || lower.endsWith('.heif') || String(file.type||'').includes('heic') || String(file.type||'').includes('heif');
    // Determine correct content type for HEIC files
    const contentType = isHeic 
      ? (lower.endsWith('.heif') || String(file.type||'').includes('heif') ? 'image/heif' : 'image/heic')
      : (file.type || 'application/octet-stream');
    try{
      setIsLoading(true);
      setShowProgress(true);
      setProgressMessage('Uploading image to storage...');
      if (!clientId){
        // For HEIC files or when we need backend processing, use proxy upload even without clientId
        if (isHeic || !file.type || !file.type.startsWith('image/')){
          // Use proxy upload for HEIC or non-image files to allow backend conversion
          const formData = new FormData();
          formData.append('file', file);
          formData.append('original_name', file.name || 'upload');
          formData.append('content_type', contentType);
          formData.append('project_id', '');
          formData.append('client_id', '');
          formData.append('employee_id', '');
          formData.append('category_id', 'image-picker-temp');
          
          const conf:any = await api('POST', '/files/upload-proxy', formData);
          const fileObjectId = conf.id;
          
          // Load from uploaded file
          const image = new Image();
          let imageLoaded = false;
          const loadTimeout = setTimeout(()=>{
            if (!imageLoaded) {
              setIsLoading(false);
              toast.error('Timeout loading image. The file may be processing.');
              setShowProgress(false);
              setProgressMessage('');
            }
          }, 30000);
          setProgressMessage('Generating preview...');
          image.onload = ()=>{
            imageLoaded = true;
            clearTimeout(loadTimeout);
            setImg(image); 
            setZoom(1); 
            setTx(0); 
            setTy(0); 
            setOriginalFileObjectId(fileObjectId); 
            setIsLoading(false);
            setShowProgress(false);
            setProgressMessage('');
          };
          image.onerror = ()=>{
            imageLoaded = true;
            clearTimeout(loadTimeout);
            toast.error('Failed to load image. The file may still be processing.');
            setIsLoading(false);
            setShowProgress(false);
            setProgressMessage('');
          };
          image.crossOrigin = 'anonymous';
          image.src = withFileAccessToken(`/files/${fileObjectId}/thumbnail?w=1024&cb=${Date.now()}`);
          return;
        }
        
        // Fallback to local preview for regular images when we don't have context to persist
        // Revoke any previous blob URL
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        const url = URL.createObjectURL(file);
        blobUrlRef.current = url; // Keep track of blob URL
        const image = new Image();
        image.onload = ()=>{ 
          // Don't revoke blob URL here - keep it alive while image is displayed
          setImg(image); 
          setZoom(1); 
          setTx(0); 
          setTy(0); 
          setOriginalFileObjectId(undefined); 
          setIsLoading(false); 
          setShowProgress(false); 
          setProgressMessage(''); 
        };
        image.onerror = ()=>{ 
          URL.revokeObjectURL(url);
          blobUrlRef.current = null;
          // If local preview fails, try proxy upload as fallback
          const formData = new FormData();
          formData.append('file', file);
          formData.append('original_name', file.name || 'upload');
          formData.append('content_type', contentType);
          formData.append('project_id', '');
          formData.append('client_id', '');
          formData.append('employee_id', '');
          formData.append('category_id', 'image-picker-temp');
          
          api('POST', '/files/upload-proxy', formData).then((conf:any)=>{
            const fileObjectId = conf.id;
            const img2 = new Image();
            img2.onload = ()=>{
              setImg(img2); 
              setZoom(1); 
              setTx(0); 
              setTy(0); 
              setOriginalFileObjectId(fileObjectId); 
              setIsLoading(false); 
              setShowProgress(false); 
              setProgressMessage('');
            };
            img2.onerror = ()=>{
              toast.error('Failed to load image');
              setIsLoading(false); 
              setShowProgress(false); 
              setProgressMessage('');
            };
            img2.crossOrigin = 'anonymous';
            img2.src = withFileAccessToken(`/files/${fileObjectId}/thumbnail?w=1024&cb=${Date.now()}`);
          }).catch((e:any)=>{
            toast.error('Failed to load image');
            setIsLoading(false); 
            setShowProgress(false); 
            setProgressMessage('');
          });
        };
        image.src = url; 
        return;
      }
      // Persist original to library first (keeps history and enables HEIC and large previews)
      // For HEIC files, preserve the extension so backend can detect and convert
      const uniqueBase = `${isHeic? 'heic':'upload'}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const originalName = isHeic 
        ? `${uniqueBase}.heic`  // Always use .heic extension for HEIC files
        : `${uniqueBase}${(file.name && file.name.includes('.'))? file.name.substring(file.name.lastIndexOf('.')) : '.bin'}`;
      // Use correct content_type for database, but use application/octet-stream for Azure upload
      // Azure may reject non-standard MIME types like image/heic
      const uploadContentType = isHeic ? 'application/octet-stream' : contentType;
      const up:any = await api('POST','/files/upload',{ project_id: null, client_id: clientId||null, employee_id: null, category_id:'proposal-upload', original_name: originalName, content_type: contentType });
      const putResp = await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': uploadContentType, 'x-ms-blob-type':'BlockBlob' }, body: file });
      if (!putResp.ok) {
        const errorText = await putResp.text().catch(() => 'Unknown error');
        throw new Error(`Azure upload failed: ${putResp.status} ${putResp.statusText} - ${errorText}`);
      }
      setProgressMessage(isHeic ? 'Converting HEIC to JPEG…' : 'Saving file…');
      const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256:'na', content_type: contentType });
      const fileObjectId = conf.id;
      // Attach to client library
      try{
        await api('POST', `/clients/${encodeURIComponent(String(clientId))}/files?file_object_id=${encodeURIComponent(fileObjectId)}&category=${encodeURIComponent('proposal-upload')}&original_name=${encodeURIComponent(file.name||'upload')}`);
        try { loadLibrary(false); } catch (_e) {}
      }catch(_e){}

      const image = new Image();
      let imageLoaded = false;
      const loadTimeout = setTimeout(()=>{
        if (!imageLoaded) {
          setIsLoading(false);
          toast.error('Timeout loading image. The file may be processing.');
          setShowProgress(false);
          setProgressMessage('');
        }
      }, 30000); // 30 second timeout
      setProgressMessage('Generating preview...');
      image.onload = ()=>{
        imageLoaded = true;
        clearTimeout(loadTimeout);
        setImg(image); 
        setZoom(1); 
        setTx(0); 
        setTy(0); 
        setOriginalFileObjectId(fileObjectId); 
        setIsLoading(false);
        setShowProgress(false);
        setProgressMessage('');
      };
      image.onerror = ()=>{
        imageLoaded = true;
        clearTimeout(loadTimeout);
        toast.error('Failed to load image. The file may still be processing.');
        setIsLoading(false);
        setShowProgress(false);
        setProgressMessage('');
      };
      image.crossOrigin = 'anonymous';
      image.src = withFileAccessToken(`/files/${fileObjectId}/thumbnail?w=1024&cb=${Date.now()}`);
    }catch(e: any){ 
      console.error('Upload failed:', e);
      const errorMsg = e?.message || e?.response?.data?.detail || 'Upload failed';
      toast.error(`Failed to upload image: ${errorMsg}`);
      setIsLoading(false);
      setShowProgress(false);
      setProgressMessage('');
    }
  };

  const loadFromFileObject = async (fileObjectId:string)=>{
    try{
      // Revoke any previous blob URL when loading from library
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      const image = new Image();
      setIsLoading(true);
      setShowProgress(true);
      setProgressMessage('Loading image...');
      image.onload = ()=>{ setImg(image); setZoom(1); setTx(0); setTy(0); setOriginalFileObjectId(fileObjectId); setIsLoading(false); setShowProgress(false); setProgressMessage(''); };
      image.onerror = ()=>{ toast.error('Failed to load image'); setIsLoading(false); setShowProgress(false); setProgressMessage(''); };
      image.crossOrigin = 'anonymous';
      // Use thumbnail endpoint to ensure browser-compatible PNG (works for HEIC too)
      image.src = withFileAccessToken(`/files/${fileObjectId}/thumbnail?w=1024&cb=${Date.now()}`);
    }catch(e){ toast.error('Failed to open image'); }
  };

  // Load image when picker opens with a fileObjectId
  useEffect(() => {
    if (isOpen && fileObjectId && !img) {
      loadFromFileObject(fileObjectId);
    }
  }, [isOpen, fileObjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;
    if (!openEditorOnOpen) return;
    if (!img) return;
    setShowImageEditor(true);
  }, [isOpen, openEditorOnOpen, img]);

  // Use refs to access current values in event handler
  const zoomRef = useRef(zoom);
  const txRef = useRef(tx);
  const tyRef = useRef(ty);
  
  useEffect(() => {
    zoomRef.current = zoom;
    txRef.current = tx;
    tyRef.current = ty;
  }, [zoom, tx, ty]);

  // Use direct event listener with passive: false to allow preventDefault
  useEffect(() => {
    if (!isOpen || !containerRef.current || !allowEdit || !img) return;
    
    const handleWheel = (e: WheelEvent)=>{
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.06 : 1/1.06;
      const currentZoom = zoomRef.current;
      const currentTx = txRef.current;
      const currentTy = tyRef.current;
      const nz = Math.min(6, Math.max(0.1, currentZoom * factor));
      // Recalculate clamp values using current img and coverScale
      const dw = img.naturalWidth * coverScale * nz;
      const dh = img.naturalHeight * coverScale * nz;
      const minX = cw - dw;
      const minY = ch - dh;
      const x = Math.min(0, Math.max(minX, currentTx));
      const y = Math.min(0, Math.max(minY, currentTy));
      setZoom(nz);
      setTx(x);
      setTy(y);
    };
    
    const container = containerRef.current;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, allowEdit, img, coverScale, cw, ch]);

  const onPointerDown = (e: React.PointerEvent)=>{
    if(!allowEdit || !img || !isPanning) return;
    e.preventDefault();
    const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect();
    dragging.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, tx, ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent)=>{
    if(!allowEdit || !img || !isPanning) return;
    if(!dragging.current) return;
    const rect = (containerRef.current as HTMLDivElement).getBoundingClientRect();
    const dx = e.clientX - rect.left - dragging.current.x;
    const dy = e.clientY - rect.top - dragging.current.y;
    const { x, y } = clamp(dragging.current.tx + dx, dragging.current.ty + dy, zoom);
    setTx(x); setTy(y);
  };
  const onPointerUp = (e: React.PointerEvent)=>{ dragging.current = null; };

  const confirm = async ()=>{
    if(!img){ toast.error('Select an image'); return; }
    if(isConfirming) return; // Prevent multiple clicks
    
    setIsConfirming(true);
    try {
      const canvas = document.createElement('canvas');
      const { outW, outH } = computeExportDimensions(targetWidth, targetHeight, exportScale, maxExportLongSide);
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d')!;
      
      // Use white background instead of blur
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw the main image on top
      const scale = coverScale * zoom;
      const sx = -tx / scale;
      const sy = -ty / scale;
      const sw = cw / scale;
      const sh = ch / scale;
      // draw scaled to target canvas
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob((b)=>{
          if(b){
            try {
              onConfirm(b, originalFileObjectId);
              resolve();
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error('Failed to create blob'));
          }
        }, 'image/jpeg', 0.95);
      });
    } catch (e: any) {
      console.error('Failed to confirm image:', e);
      toast.error('Failed to process image');
    } finally {
      setIsConfirming(false);
    }
  };

  // Get current image URL for ImageEditor
  const getCurrentImageUrl = (): string => {
    if (!img) return '';
    // If image is from a blob URL, return it directly
    if (img.src.startsWith('blob:')) {
      return img.src;
    }
    // Stable URL — ImageEditor keys reloads on this string; avoid cache-bust timestamps here.
    if (originalFileObjectId) {
      return withFileAccessToken(`/files/${originalFileObjectId}/thumbnail?w=1024`);
    }
    // Fallback to image src
    return img.src;
  };

  // Handle save from ImageEditor - update image in picker and upload as copy
  const handleImageEditorSave = async (blob: Blob) => {
    if (isSavingFromEditor) return; // Prevent multiple saves
    
    setIsSavingFromEditor(true);
    try {
      if (!clientId && !projectId) {
        toast.error('Client or project context required');
        return;
      }

      // Convert PNG blob to JPG if needed (ImageEditor saves as PNG)
      let imageBlob = blob;
      if (blob.type === 'image/png') {
        const image = new Image();
        const imageUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Failed to get canvas context'));
              return;
            }
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(image, 0, 0);
            canvas.toBlob((jpgBlob) => {
              if (jpgBlob) {
                imageBlob = jpgBlob;
                URL.revokeObjectURL(imageUrl);
                resolve();
              } else {
                reject(new Error('Failed to convert to JPG'));
              }
            }, 'image/jpeg', 0.95);
          };
          image.onerror = () => {
            URL.revokeObjectURL(imageUrl);
            reject(new Error('Failed to load image'));
          };
          image.src = imageUrl;
        });
      }

      const imageUrl = URL.createObjectURL(imageBlob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => {
          if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
          }
          blobUrlRef.current = imageUrl;
          setImg(image);
          setZoom(1);
          setTx(0);
          setTy(0);
          resolve();
        };
        image.onerror = reject;
        image.src = imageUrl;
      });

      const uniqueName = `edited_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const formData = new FormData();
      formData.append('file', imageBlob, uniqueName);
      formData.append('original_name', uniqueName);
      formData.append('content_type', 'image/jpeg');
      formData.append('project_id', projectId || '');
      formData.append('client_id', clientId || '');
      formData.append('employee_id', '');
      formData.append('category_id', projectId ? 'document-creator' : 'proposal-upload');

      const conf: any = await api('POST', '/files/upload-proxy', formData);
      const fileObjectId = conf.id;

      if (clientId) {
        try {
          await api('POST', `/clients/${encodeURIComponent(String(clientId))}/files?file_object_id=${encodeURIComponent(fileObjectId)}&category=${encodeURIComponent('proposal-upload')}&original_name=${encodeURIComponent(uniqueName)}`);
          try {
            loadLibrary(false);
          } catch (_e) {}
        } catch (attachError) {
          console.error('Failed to attach edited image to client library:', attachError);
        }
      } else if (projectId) {
        try {
          loadLibrary(true);
        } catch (_e) {}
      }

      setOriginalFileObjectId(fileObjectId);
      toast.success('Image edited and saved');
      setShowImageEditor(false);
    } catch (e: any) {
      console.error('Failed to save edited image:', e);
      toast.error('Failed to save edited image');
    } finally {
      setIsSavingFromEditor(false);
    }
  };

  const onDropZoneDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current += 1;
    setDragActive(true);
  };
  const onDropZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current -= 1;
    if (dropDepthRef.current <= 0) {
      dropDepthRef.current = 0;
      setDragActive(false);
    }
  };
  const onDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dropDepthRef.current = 0;
    setDragActive(false);
    const file = pickImageFileFromList(e.dataTransfer.files);
    if (file) void loadFromFile(file);
    else toast.error('Please drop an image file (JPEG, PNG, HEIC, …).');
  };

  if (!isOpen) return null;
  return (
    <>
      <style>{`
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
      `}</style>
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-picker-title"
          className="flex max-h-[90vh] w-[900px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/[0.06]"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200/85 bg-gradient-to-b from-white to-slate-50/90 px-4 py-3">
            <h2 id="image-picker-title" className={`${editorPanelTitleClass} truncate`}>
              Choose image
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

          <div className="grid min-h-0 flex-1 grid-cols-3 gap-0 overflow-hidden">
            <div className={`flex min-h-0 min-w-0 flex-col border-r border-slate-200/90 ${editorPanelAsideClass}`}>
              {hasLibrary ? (
                <>
                  <div className="shrink-0 border-b border-slate-200/80 p-2">
                    <div className={`${editorSegmentedControlTrackClass} w-full`}>
                      <button
                        type="button"
                        onClick={() => setTab('upload')}
                        className={`flex h-full min-h-0 flex-1 items-center justify-center px-2 text-[11px] font-semibold capitalize transition-[background-color,color,box-shadow] duration-150 ${
                          tab === 'upload' ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass
                        }`}
                      >
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('library')}
                        className={`flex h-full min-h-0 flex-1 items-center justify-center px-2 text-[11px] font-semibold capitalize transition-[background-color,color,box-shadow] duration-150 ${
                          tab === 'library' ? editorSegmentedSegmentSelectedClass : editorSegmentedSegmentIdleClass
                        }`}
                      >
                        Gallery
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {tab === 'upload' ? (
                      <div className="space-y-3 p-3">
                        <input
                          ref={inputRef}
                          type="file"
                          accept={FILE_INPUT_ACCEPT}
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void loadFromFile(f);
                            e.target.value = '';
                          }}
                        />
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => inputRef.current?.click()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              inputRef.current?.click();
                            }
                          }}
                          onDragEnter={onDropZoneDragEnter}
                          onDragLeave={onDropZoneDragLeave}
                          onDragOver={onDropZoneDragOver}
                          onDrop={onDropZoneDrop}
                          className={`${editorTransitionInteractive} flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center ${
                            dragActive
                              ? 'border-brand-red/55 bg-brand-red/[0.06] ring-2 ring-brand-red/15'
                              : 'border-slate-300/90 bg-white/60 hover:border-slate-400 hover:bg-slate-50/90'
                          }`}
                        >
                          <svg className="mb-2 h-9 w-9 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm font-medium text-slate-800">
                            Drop an image here or{' '}
                            <span className="text-brand-red underline decoration-brand-red/40 underline-offset-2">browse</span>
                          </p>
                          <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-slate-500">
                            <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-700">Ctrl+V</kbd> /{' '}
                            <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-700">⌘V</kbd> to paste while this dialog is open
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handlePaste}
                          className={`${selectionToolButtonGhostClass} h-9 w-full justify-center gap-2 text-xs font-semibold`}
                          title="Paste from clipboard (may require permission)"
                        >
                          <svg className="h-4 w-4 shrink-0 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Paste from clipboard
                        </button>
                      </div>
                    ) : (
                      <div className="p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {projectId ? 'Project gallery' : 'Library'}
                          </div>
                          <button
                            type="button"
                            disabled={isLoadingLibrary}
                            onClick={() => loadLibrary(true)}
                            className={`${selectionToolButtonGhostClass} h-8 shrink-0 px-2 text-xs`}
                          >
                            Reload
                          </button>
                        </div>
                        {!libraryLoaded && (
                          <div className="py-8 text-center">
                            <button
                              type="button"
                              disabled={isLoadingLibrary}
                              onClick={() => loadLibrary(true)}
                              className={`${editorTransitionInteractive} rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50`}
                            >
                              Load gallery
                            </button>
                          </div>
                        )}
                        {libraryLoaded && (
                          <div className="max-h-[min(380px,50vh)] space-y-4 overflow-auto">
                            <div>
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Original images</span>
                                {filesOriginals.length > IMAGES_PER_PAGE && (
                                  <span className="text-[10px] text-slate-500">
                                    {displayPageOriginals * IMAGES_PER_PAGE + 1}–
                                    {Math.min((displayPageOriginals + 1) * IMAGES_PER_PAGE, filesOriginals.length)} of{' '}
                                    {filesOriginals.length}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {filesOriginals
                                  .slice(displayPageOriginals * IMAGES_PER_PAGE, (displayPageOriginals + 1) * IMAGES_PER_PAGE)
                                  .map((f) => (
                                    <button
                                      type="button"
                                      key={f.id}
                                      className="overflow-hidden rounded-lg border border-slate-200/90 transition-shadow hover:ring-2 hover:ring-brand-red/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35"
                                      onClick={() => loadFromFileObject(f.file_object_id)}
                                    >
                                      <img
                                        className="h-20 w-full object-cover"
                                        src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=160`)}
                                        loading="lazy"
                                        alt=""
                                      />
                                    </button>
                                  ))}
                              </div>
                              {filesOriginals.length > IMAGES_PER_PAGE && (
                                <div className="mt-2 flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    disabled={displayPageOriginals === 0}
                                    onClick={() => setDisplayPageOriginals((p) => p - 1)}
                                    className={`${selectionToolButtonGhostClass} h-8 px-2 text-xs disabled:opacity-40`}
                                  >
                                    Previous
                                  </button>
                                  <span className="px-1 text-xs text-slate-500">
                                    {displayPageOriginals + 1} / {Math.ceil(filesOriginals.length / IMAGES_PER_PAGE)}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={(displayPageOriginals + 1) * IMAGES_PER_PAGE >= filesOriginals.length}
                                    onClick={() => setDisplayPageOriginals((p) => p + 1)}
                                    className={`${selectionToolButtonGhostClass} h-8 px-2 text-xs disabled:opacity-40`}
                                  >
                                    Next
                                  </button>
                                </div>
                              )}
                              {filesOriginals.length === 0 && <p className="py-2 text-xs text-slate-400">No original images</p>}
                            </div>
                            <div>
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Edited images</span>
                                {filesDerived.length > IMAGES_PER_PAGE && (
                                  <span className="text-[10px] text-slate-500">
                                    {displayPageDerived * IMAGES_PER_PAGE + 1}–
                                    {Math.min((displayPageDerived + 1) * IMAGES_PER_PAGE, filesDerived.length)} of {filesDerived.length}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {filesDerived
                                  .slice(displayPageDerived * IMAGES_PER_PAGE, (displayPageDerived + 1) * IMAGES_PER_PAGE)
                                  .map((f) => (
                                    <button
                                      type="button"
                                      key={f.id}
                                      className="overflow-hidden rounded-lg border border-slate-200/90 transition-shadow hover:ring-2 hover:ring-brand-red/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35"
                                      onClick={() => loadFromFileObject(f.file_object_id)}
                                    >
                                      <img
                                        className="h-20 w-full object-cover"
                                        src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=160`)}
                                        loading="lazy"
                                        alt=""
                                      />
                                    </button>
                                  ))}
                              </div>
                              {filesDerived.length > IMAGES_PER_PAGE && (
                                <div className="mt-2 flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    disabled={displayPageDerived === 0}
                                    onClick={() => setDisplayPageDerived((p) => p - 1)}
                                    className={`${selectionToolButtonGhostClass} h-8 px-2 text-xs disabled:opacity-40`}
                                  >
                                    Previous
                                  </button>
                                  <span className="px-1 text-xs text-slate-500">
                                    {displayPageDerived + 1} / {Math.ceil(filesDerived.length / IMAGES_PER_PAGE)}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={(displayPageDerived + 1) * IMAGES_PER_PAGE >= filesDerived.length}
                                    onClick={() => setDisplayPageDerived((p) => p + 1)}
                                    className={`${selectionToolButtonGhostClass} h-8 px-2 text-xs disabled:opacity-40`}
                                  >
                                    Next
                                  </button>
                                </div>
                              )}
                              {filesDerived.length === 0 && <p className="py-2 text-xs text-slate-400">No edited images</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <input
                    ref={inputRef}
                    type="file"
                    accept={FILE_INPUT_ACCEPT}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void loadFromFile(f);
                      e.target.value = '';
                    }}
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        inputRef.current?.click();
                      }
                    }}
                    onDragEnter={onDropZoneDragEnter}
                    onDragLeave={onDropZoneDragLeave}
                    onDragOver={onDropZoneDragOver}
                    onDrop={onDropZoneDrop}
                    className={`${editorTransitionInteractive} mb-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center ${
                      dragActive
                        ? 'border-brand-red/55 bg-brand-red/[0.06] ring-2 ring-brand-red/15'
                        : 'border-slate-300/90 bg-white/60 hover:border-slate-400 hover:bg-slate-50/90'
                    }`}
                  >
                    <svg className="mb-2 h-9 w-9 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-800">
                      Drop an image here or{' '}
                      <span className="text-brand-red underline decoration-brand-red/40 underline-offset-2">browse</span>
                    </p>
                    <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-slate-500">
                      <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-700">Ctrl+V</kbd> /{' '}
                      <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-700">⌘V</kbd> to paste while this dialog is open
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handlePaste}
                    className={`${selectionToolButtonGhostClass} h-9 w-full justify-center gap-2 text-xs font-semibold`}
                    title="Paste from clipboard (may require permission)"
                  >
                    <svg className="h-4 w-4 shrink-0 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Paste from clipboard
                  </button>
                </div>
              )}
            </div>

            <div className="col-span-2 min-h-0 min-w-0 overflow-y-auto bg-slate-50/80">
              <div className="p-4">
                <p className={`${editorCaptionClass} mb-3`}>
                  Target: {targetWidth} × {targetHeight}px · JPEG export {exportDimensions.outW} × {exportDimensions.outH}px
                </p>
                <div
                  className="inline-block rounded-md border-2 border-slate-500 bg-slate-200/95 p-px shadow-[0_2px_8px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/10"
                  title="Exported crop area — outline matches target dimensions"
                >
                  <div
                    ref={containerRef}
                    className="relative overflow-hidden rounded-[3px] bg-slate-200"
                    style={{
                      width: cw,
                      height: ch,
                      userSelect: 'none',
                      cursor: img && isPanning ? (dragging.current ? 'grabbing' : 'grab') : 'default',
                      touchAction: 'none' as const,
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                  >
                    {img && (
                      <img
                        src={img.src}
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        alt=""
                        style={{
                          position: 'absolute',
                          left: tx,
                          top: ty,
                          width: img.naturalWidth * coverScale * zoom,
                          height: img.naturalHeight * coverScale * zoom,
                          maxWidth: 'none',
                          maxHeight: 'none',
                          userSelect: 'none',
                          zIndex: 1,
                        }}
                      />
                    )}
                    {!img && (
                      <div className="grid h-full w-full place-items-center text-sm text-slate-600">
                        {isLoading ? 'Loading image…' : 'Select or upload an image'}
                      </div>
                    )}
                    <div
                      className="pointer-events-none absolute inset-0 z-[2] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.22)]"
                      aria-hidden
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="custom-slider-container min-w-0 flex-1" style={{ flex: 1 }}>
                    <span className="flex w-11 shrink-0 text-xs font-medium text-slate-700">Zoom</span>
                    <input
                      type="range"
                      min={0.1}
                      max={6}
                      step={0.01}
                      disabled={!img || !allowEdit}
                      value={zoom}
                      onChange={(e) => {
                        const nz = Math.min(6, Math.max(0.1, parseFloat(e.target.value || '1')));
                        const { x, y } = clamp(tx, ty, nz);
                        setZoom(nz);
                        setTx(x);
                        setTy(y);
                      }}
                      className="custom-slider"
                      style={{
                        background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((zoom - 0.1) / (6 - 0.1)) * 100}%, #e5e7eb ${((zoom - 0.1) / (6 - 0.1)) * 100}%, #e5e7eb 100%)`,
                      }}
                    />
                    <div className="custom-slider-value">{zoom.toFixed(2)}×</div>
                  </div>
                  <button
                    type="button"
                    disabled={!img || !allowEdit}
                    onClick={() => {
                      const { x, y } = clamp(0, 0, 1);
                      setZoom(1);
                      setTx(x);
                      setTy(y);
                    }}
                    className={`${selectionToolButtonGhostClass} h-8 shrink-0 px-3 text-xs disabled:opacity-50`}
                  >
                    Reset
                  </button>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {!hideEditButton && (
                      <button
                        type="button"
                        disabled={!img || isLoading || isSavingFromEditor}
                        onClick={() => setShowImageEditor(true)}
                        className={`${editorTransitionInteractive} h-9 shrink-0 rounded-md bg-slate-700 px-4 text-xs font-semibold text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35 disabled:opacity-50`}
                      >
                        Edit image
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!img || isLoading || isConfirming}
                      onClick={confirm}
                      className={`${editorTransitionInteractive} h-9 shrink-0 rounded-md bg-brand-red px-4 text-xs font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/45 disabled:opacity-50`}
                    >
                      {isConfirming ? 'Processing…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
      {showProgress && (
        <OverlayPortal>
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="w-[360px] max-w-[90vw] rounded-xl border border-slate-200/90 bg-white px-6 py-5 text-center shadow-2xl ring-1 ring-slate-900/[0.06]">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-red" />
            <div className="text-sm text-slate-600">{progressMessage || 'Processing…'}</div>
          </div>
        </div>
        </OverlayPortal>
      )}
      {showImageEditor && img && (
        <ImageEditor
          isOpen={showImageEditor}
          onClose={() => setShowImageEditor(false)}
          imageUrl={getCurrentImageUrl()}
          imageName={originalFileObjectId || 'image'}
          fileObjectId={originalFileObjectId}
          targetWidth={targetWidth}
          targetHeight={targetHeight}
          editorScaleFactor={editorScaleFactor}
          onSave={handleImageEditorSave}
        />
      )}
    </>
  );
}






