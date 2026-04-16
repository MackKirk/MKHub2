import { useRef, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';

const CATEGORY = 'safety-form';

type Props = {
  projectId: string;
  disabled?: boolean;
  fileObjectId: string | null;
  onFileObjectId: (id: string | null) => void;
};

export default function SafetySignaturePad({ projectId, disabled, fileObjectId, onFileObjectId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);

  const pos = (e: React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    const p = 'touches' in e ? e.touches[0] : e;
    const scaleX = c.width / r.width;
    const scaleY = c.height / r.height;
    return { x: (p.clientX - r.left) * scaleX, y: (p.clientY - r.top) * scaleY };
  };

  const start = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const c = canvasRef.current;
    if (!c) return;
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e, c);
  };

  const move = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    e.preventDefault();
    const p = pos(e, c);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    onFileObjectId(null);
  };

  const uploadCanvas = useCallback(async () => {
    const c = canvasRef.current;
    if (!c || disabled) return;
    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
      if (!blob) {
        toast.error('Could not read signature');
        return;
      }
      const file = new File([blob], 'signature.png', { type: 'image/png' });
      const form = new FormData();
      form.append('file', file);
      form.append('original_name', 'signature.png');
      form.append('content_type', 'image/png');
      form.append('project_id', projectId);
      form.append('client_id', '');
      form.append('employee_id', '');
      form.append('category_id', CATEGORY);
      const res = await api<{ id: string }>('POST', '/files/upload-proxy', form);
      await api(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/files?file_object_id=${encodeURIComponent(res.id)}&category=${encodeURIComponent(CATEGORY)}&original_name=${encodeURIComponent('signature.png')}`
      );
      onFileObjectId(res.id);
      toast.success('Signature saved');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }, [disabled, onFileObjectId, projectId]);

  return (
    <div className="space-y-2">
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white touch-none">
        <canvas
          ref={canvasRef}
          width={400}
          height={160}
          className="w-full max-w-full h-40 cursor-crosshair block"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={clear}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={disabled || uploading || !projectId}
          onClick={() => void uploadCanvas()}
          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload signature'}
        </button>
      </div>
      {fileObjectId && (
        <div className="text-xs text-gray-600">
          Saved:{' '}
          <a
            href={withFileAccessToken(`/files/${encodeURIComponent(fileObjectId)}/thumbnail?w=800`)}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            View
          </a>
        </div>
      )}
    </div>
  );
}
