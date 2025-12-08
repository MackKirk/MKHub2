import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, category?:string };

export default function ImagePicker({
  isOpen,
  onClose,
  onConfirm,
  targetWidth,
  targetHeight,
  allowEdit = true,
  clientId,
  exportScale = 2
}:{
  isOpen:boolean,
  onClose:()=>void,
  onConfirm:(blob:Blob, originalFileObjectId?:string)=>void,
  targetWidth:number,
  targetHeight:number,
  allowEdit?:boolean,
  clientId?:string,
  exportScale?: number
}){
  const [tab, setTab] = useState<'upload'|'library'>('upload');
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState<boolean>(false);
  const [libraryLoaded, setLibraryLoaded] = useState<boolean>(false);
  const [libraryPage, setLibraryPage] = useState<number>(0);
  const [libraryHasMore, setLibraryHasMore] = useState<boolean>(true);
  const [img, setImg] = useState<HTMLImageElement|null>(null);
  const [originalFileObjectId, setOriginalFileObjectId] = useState<string|undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showProgress, setShowProgress] = useState<boolean>(false);
  const [progressMessage, setProgressMessage] = useState<string>("");

  // crop state
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragging = useRef<{x:number, y:number, tx:number, ty:number}|null>(null);
  const [isPanning] = useState(true);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(()=>{
    if(!isOpen){
      setImg(null); setZoom(1); setTx(0); setTy(0); setOriginalFileObjectId(undefined); setTab('upload');
      // Revoke any blob URLs when closing
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

  // On-demand gallery loader with pagination
  const PAGE_SIZE = 60;
  const loadLibrary = async (reset:boolean)=>{
    if (!clientId) return;
    try{
      setIsLoadingLibrary(true);
      const page = reset ? 0 : libraryPage;
      const list = await api<ClientFile[]>('GET', `/clients/${clientId}/files?limit=${PAGE_SIZE}&offset=${page*PAGE_SIZE}`);
      const imgs = (list||[]).filter(f=> {
        const isImg = (f.is_image===true) || String(f.content_type||'').startsWith('image/');
        const isDerived = String(f.category||'').toLowerCase().includes('derived');
        return isImg && !isDerived;
      });
      setFiles(reset ? imgs : [...files, ...imgs]);
      setLibraryLoaded(true);
      setLibraryHasMore((list||[]).length === PAGE_SIZE);
      setLibraryPage(page + 1);
    }catch(err){ /* ignore */ }
    finally{ setIsLoadingLibrary(false); }
  };

  useEffect(()=>{
    // If user switches to library tab, lazy-load first page
    if (tab === 'library' && isOpen && clientId && !libraryLoaded && !isLoadingLibrary){
      loadLibrary(true);
    }
  }, [tab, isOpen, clientId]);

  const cw = 360;
  const ch = useMemo(()=> Math.round(cw * (targetHeight/targetWidth)), [targetWidth, targetHeight]);

  const coverScale = useMemo(()=>{
    if(!img) return 1;
    return Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  }, [img, cw, ch]);

  // clamp translation so image covers the frame
  const clamp = (nx:number, ny:number, nz:number)=>{
    if(!img) return { x: nx, y: ny };
    const dw = img.naturalWidth * coverScale * nz;
    const dh = img.naturalHeight * coverScale * nz;
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
          image.src = `/files/${fileObjectId}/thumbnail?w=1200&cb=${Date.now()}`;
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
            img2.src = `/files/${fileObjectId}/thumbnail?w=1200&cb=${Date.now()}`;
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
      setProgressMessage(isHeic ? 'Converting HEIC to JPG...' : 'Saving file...');
      const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256:'na', content_type: contentType });
      const fileObjectId = conf.id;
      // Attach to client library
      try{
        await api('POST', `/clients/${encodeURIComponent(String(clientId))}/files?file_object_id=${encodeURIComponent(fileObjectId)}&category=${encodeURIComponent('proposal-upload')}&original_name=${encodeURIComponent(file.name||'upload')}`);
        // Refresh library list silently
        try{
          const list = await api<ClientFile[]>('GET', `/clients/${clientId}/files`);
          setFiles((list||[]).filter(f=> {
            const isImg = (f.is_image===true) || String(f.content_type||'').startsWith('image/');
            const isDerived = String(f.category||'').toLowerCase().includes('derived');
            return isImg && !isDerived;
          }));
        }catch(_e){}
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
      image.src = `/files/${fileObjectId}/thumbnail?w=1200&cb=${Date.now()}`;
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
      image.src = `/files/${fileObjectId}/thumbnail?w=1200&cb=${Date.now()}`;
    }catch(e){ toast.error('Failed to open image'); }
  };

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
      const nz = Math.min(6, Math.max(1, currentZoom * factor));
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

  const confirm = ()=>{
    if(!img){ toast.error('Select an image'); return; }
    const canvas = document.createElement('canvas');
    const scaleOut = Math.max(1, Number(exportScale||1));
    canvas.width = Math.round(targetWidth * scaleOut); canvas.height = Math.round(targetHeight * scaleOut);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const scale = coverScale * zoom;
    const sx = -tx / scale;
    const sy = -ty / scale;
    const sw = cw / scale;
    const sh = ch / scale;
    // draw scaled to target canvas
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b)=>{ if(b){ onConfirm(b, originalFileObjectId); } }, 'image/jpeg', 0.95);
  };

  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[900px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">Image Picker</div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
        </div>
        <div className="grid grid-cols-3 gap-0">
          <div className="border-r">
            {clientId && (
              <div className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">Library</div>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={isLoadingLibrary} onClick={()=>loadLibrary(true)} className="text-xs px-2 py-1 rounded bg-gray-100 disabled:opacity-50">Reload</button>
                  </div>
                </div>
                {!libraryLoaded && (
                  <div className="py-6 text-center">
                    <button type="button" disabled={isLoadingLibrary} onClick={()=>loadLibrary(true)} className="px-3 py-2 rounded bg-gray-800 text-white disabled:opacity-50">Load gallery</button>
                  </div>
                )}
                {libraryLoaded && (
                  <>
                    <div className="grid grid-cols-3 gap-2 max-h-[320px] overflow-auto">
                      {files.map(f=> (
                        <button type="button" key={f.id} className="border rounded overflow-hidden" onClick={()=>loadFromFileObject(f.file_object_id)}>
                          <img className="w-full h-20 object-cover" src={`/files/${f.file_object_id}/thumbnail?w=160`} />
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 text-center">
                      {libraryHasMore ? (
                        <button type="button" disabled={isLoadingLibrary} onClick={()=>loadLibrary(false)} className="px-3 py-1.5 rounded bg-gray-100 disabled:opacity-50">
                          {isLoadingLibrary ? 'Loading...' : 'Load more'}
                        </button>
                      ) : (
                        <div className="text-xs text-gray-400">No more images</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="p-3 border-t">
              <div className="mb-2 text-sm font-semibold">Upload</div>
              <input ref={inputRef} type="file" accept="image/*,.heic,.heif,image/heic,image/heif" onChange={(e)=>{ const f=e.target.files?.[0]; if(f) loadFromFile(f); }} />
              <div className="mt-3">
                <button 
                  type="button"
                  onClick={handlePaste}
                  className="w-full px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm flex items-center justify-center gap-2"
                  title="Paste image from clipboard (Ctrl+V)"
                >
                  📋 Paste Image
                </button>
              </div>
            </div>
          </div>
          <div className="col-span-2">
            <div className="p-4">
              <div className="mb-3 text-sm text-gray-600">Target: {targetWidth}×{targetHeight}px</div>
              <div ref={containerRef} className="relative bg-gray-100 overflow-hidden" style={{ width: cw, height: ch, userSelect:'none', cursor: (img && isPanning)? (dragging.current? 'grabbing':'grab') : 'default', touchAction:'none' as any }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                {img && (
                  <img src={img.src} draggable={false} onDragStart={(e)=>e.preventDefault()} style={{ position:'absolute', left: tx, top: ty, width: img.naturalWidth*coverScale*zoom, height: img.naturalHeight*coverScale*zoom, maxWidth:'none', maxHeight:'none', userSelect:'none' }} />
                )}
                {!img && <div className="w-full h-full grid place-items-center text-sm text-gray-500">{isLoading? 'Loading image…' : 'Select or upload an image'}</div>}
                <div className="absolute inset-0 ring-2 ring-black/70 pointer-events-none" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="text-sm text-gray-600">Zoom</label>
                <input type="range" min={1} max={6} step={0.01} disabled={!img || !allowEdit} value={zoom} onChange={(e)=>{ const nz = Math.min(6, Math.max(1, parseFloat(e.target.value||'1'))); const { x, y } = clamp(tx, ty, nz); setZoom(nz); setTx(x); setTy(y); }} />
                <button type="button" disabled={!img || !allowEdit} onClick={()=>{ const { x, y } = clamp(0,0,1); setZoom(1); setTx(x); setTy(y); }} className="px-3 py-1.5 rounded bg-gray-100 disabled:opacity-50">Reset</button>
                <div className="ml-auto" />
                <button type="button" disabled={!img || isLoading} onClick={confirm} className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50">Confirm</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showProgress && (
        <div className="fixed inset-0 z-[60] bg-black/60 grid place-items-center">
          <div className="bg-white rounded-lg shadow-lg px-6 py-5 w-[360px] max-w-[90vw] text-center">
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-gray-200 border-t-brand-red animate-spin" />
            <div className="text-sm text-gray-600">{progressMessage || 'Processing...'}</div>
          </div>
        </div>
      )}
    </div>
  );
}






