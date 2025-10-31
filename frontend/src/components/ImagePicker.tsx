import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [img, setImg] = useState<HTMLImageElement|null>(null);
  const [originalFileObjectId, setOriginalFileObjectId] = useState<string|undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // crop state
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragging = useRef<{x:number, y:number, tx:number, ty:number}|null>(null);
  const [isPanning] = useState(true);

  useEffect(()=>{
    if(!isOpen){
      setImg(null); setZoom(1); setTx(0); setTy(0); setOriginalFileObjectId(undefined); setTab('upload');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(()=>{
    if (!clientId || !isOpen) return;
    (async()=>{
      try{
        const list = await api<ClientFile[]>('GET', `/clients/${clientId}/files`);
        setFiles((list||[]).filter(f=> {
          const isImg = (f.is_image===true) || String(f.content_type||'').startsWith('image/');
          const isDerived = String(f.category||'').toLowerCase().includes('derived');
          return isImg && !isDerived;
        }));
      }catch(err){ /* ignore */ }
    })();
  }, [clientId, isOpen]);

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
    try{
      setIsLoading(true);
      if (!clientId){
        // Fallback to local preview if we don't have context to persist
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = ()=>{ setImg(image); setZoom(1); setTx(0); setTy(0); setOriginalFileObjectId(undefined); setIsLoading(false); };
        image.onerror = ()=>{ toast.error('Failed to load image'); setIsLoading(false); };
        image.src = url; return;
      }
      // Persist original to library first (keeps history and enables HEIC and large previews)
      const uniqueBase = `${isHeic? 'heic':'upload'}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const originalName = `${uniqueBase}${(file.name && file.name.includes('.'))? file.name.substring(file.name.lastIndexOf('.')) : (isHeic? '.heic': '.bin')}`;
      const up:any = await api('POST','/files/upload',{ project_id: null, client_id: clientId||null, employee_id: null, category_id:'proposal-upload', original_name: originalName, content_type: file.type||'application/octet-stream' });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': file.type||'application/octet-stream', 'x-ms-blob-type':'BlockBlob' }, body: file });
      const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256:'na', content_type:file.type||'application/octet-stream' });
      const fileObjectId = conf.id;
      const image = new Image();
      image.onload = ()=>{ setImg(image); setZoom(1); setTx(0); setTy(0); setOriginalFileObjectId(fileObjectId); setIsLoading(false); };
      image.onerror = ()=>{ toast.error('Failed to load image'); setIsLoading(false); };
      image.crossOrigin = 'anonymous';
      image.src = `/files/${fileObjectId}/thumbnail?w=1200&cb=${Date.now()}`;
    }catch(_e){ toast.error('Upload failed'); setIsLoading(false); }
  };

  const loadFromFileObject = async (fileObjectId:string)=>{
    try{
      const image = new Image();
      setIsLoading(true);
      image.onload = ()=>{ setImg(image); setZoom(1); setTx(0); setTy(0); setOriginalFileObjectId(fileObjectId); setIsLoading(false); };
      image.onerror = ()=>{ toast.error('Failed to load image'); setIsLoading(false); };
      image.crossOrigin = 'anonymous';
      // Use thumbnail endpoint to ensure browser-compatible PNG (works for HEIC too)
      image.src = `/files/${fileObjectId}/thumbnail?w=1200&cb=${Date.now()}`;
    }catch(e){ toast.error('Failed to open image'); }
  };

  const handleWheel = (e: React.WheelEvent)=>{
    if(!allowEdit || !img) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.06 : 1/1.06;
    const nz = Math.min(6, Math.max(1, zoom * factor));
    const { x, y } = clamp(tx, ty, nz);
    setZoom(nz); setTx(x); setTy(y);
  };

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
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
        </div>
        <div className="grid grid-cols-3 gap-0">
          <div className="border-r">
            {clientId && (
              <div className="p-3">
                <div className="mb-2 text-sm font-semibold">Library</div>
                <div className="grid grid-cols-3 gap-2 max-h-[320px] overflow-auto">
                  {files.map(f=> (
                    <button key={f.id} className="border rounded overflow-hidden" onClick={()=>loadFromFileObject(f.file_object_id)}>
                      <img className="w-full h-20 object-cover" src={`/files/${f.file_object_id}/thumbnail?w=200`} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="p-3 border-t">
              <div className="mb-2 text-sm font-semibold">Upload</div>
              <input ref={inputRef} type="file" accept="image/*,.heic,.heif,image/heic,image/heif" onChange={(e)=>{ const f=e.target.files?.[0]; if(f) loadFromFile(f); }} />
            </div>
          </div>
          <div className="col-span-2">
            <div className="p-4">
              <div className="mb-3 text-sm text-gray-600">Target: {targetWidth}×{targetHeight}px</div>
              <div ref={containerRef} className="relative bg-gray-100 overflow-hidden" style={{ width: cw, height: ch, userSelect:'none', cursor: (img && isPanning)? (dragging.current? 'grabbing':'grab') : 'default', touchAction:'none' as any }} onWheel={handleWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                {img && (
                  <img src={img.src} draggable={false} onDragStart={(e)=>e.preventDefault()} style={{ position:'absolute', left: tx, top: ty, width: img.naturalWidth*coverScale*zoom, height: img.naturalHeight*coverScale*zoom, maxWidth:'none', maxHeight:'none', userSelect:'none' }} />
                )}
                {!img && <div className="w-full h-full grid place-items-center text-sm text-gray-500">{isLoading? 'Loading image…' : 'Select or upload an image'}</div>}
                <div className="absolute inset-0 ring-2 ring-black/70 pointer-events-none" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="text-sm text-gray-600">Zoom</label>
                <input type="range" min={1} max={6} step={0.01} disabled={!img || !allowEdit} value={zoom} onChange={(e)=>{ const nz = Math.min(6, Math.max(1, parseFloat(e.target.value||'1'))); const { x, y } = clamp(tx, ty, nz); setZoom(nz); setTx(x); setTy(y); }} />
                <button disabled={!img || !allowEdit} onClick={()=>{ const { x, y } = clamp(0,0,1); setZoom(1); setTx(x); setTy(y); }} className="px-3 py-1.5 rounded bg-gray-100 disabled:opacity-50">Reset</button>
                <div className="ml-auto" />
                <button disabled={!img || isLoading} onClick={confirm} className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50">Confirm</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


