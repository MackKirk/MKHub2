import { useCallback, useRef, useEffect, useState, useMemo } from 'react';

const ACCEPT_IMAGES_PDF_DOC = 'image/*,.pdf,.doc,.docx';
const ACCEPT_IMAGES_ONLY = 'image/*';

function isValidFile(file: File, accept: string): boolean {
  const accepts = accept.split(',').map(a => a.trim().toLowerCase());
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  for (const a of accepts) {
    if (a === '*') return true;
    if (a.endsWith('/*')) {
      const prefix = a.slice(0, -1);
      if (type.startsWith(prefix)) return true;
    }
    if (type === a) return true;
    if (name.endsWith(a.replace('.', ''))) return true;
  }
  return false;
}

/** Single-file mode: file + setFile */
export function ReportAttachmentAreaSingle({
  file,
  setFile,
  accept = ACCEPT_IMAGES_PDF_DOC,
  label = 'Attachment (optional)',
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  accept?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const valid = Array.from(files).find(f => isValidFile(f, accept));
      if (valid) setFile(valid);
    },
    [accept, setFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      processFiles(e.dataTransfer?.files ?? null);
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && isValidFile(f, accept)) {
            e.preventDefault();
            setFile(f);
            return;
          }
        }
      }
    },
    [accept, setFile]
  );

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const previewUrl = useMemo(() => {
    if (file?.type.startsWith('image/')) return URL.createObjectURL(file);
    return null;
  }, [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const [viewerOpen, setViewerOpen] = useState(false);
  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewerOpen]);

  return (
    <div>
      <label className="text-xs text-gray-600 block mb-1">{label}</label>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          w-full border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-brand-red bg-red-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
        `}
      >
        <p className="text-sm text-gray-600 mb-1">
          Drag a file here or click to select
        </p>
        <p className="text-xs text-gray-500">
          You can also paste with Ctrl+V
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={e => processFiles(e.target.files)}
        />
      </div>
      {file && (
        <div className="mt-3 border rounded-lg overflow-hidden bg-gray-50">
          {previewUrl ? (
            <div className="relative">
              <img
                src={previewUrl}
                alt={file.name}
                className="w-full max-h-48 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                onClick={e => { e.stopPropagation(); setViewerOpen(true); }}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewerOpen(true); } }}
              />
              {viewerOpen && (
                <div
                  className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
                  onClick={() => setViewerOpen(false)}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Image preview"
                >
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="max-w-full max-h-[90vh] object-contain"
                    onClick={e => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    onClick={() => setViewerOpen(false)}
                    className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-800 flex items-center justify-center text-xl font-bold shadow-lg"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="p-2 bg-white border-t flex items-center justify-between">
                <span className="text-sm text-gray-600 truncate" title={file.name}>
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 flex items-center gap-2">
                <span>📎</span>
                {file.name}
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="text-red-600 hover:text-red-700"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Multiple-file mode: files + setFiles */
export function ReportAttachmentAreaMultiple({
  files,
  setFiles,
  accept = ACCEPT_IMAGES_ONLY,
  label = 'Images (optional - multiple allowed)',
}: {
  files: File[];
  setFiles: (f: File[] | ((prev: File[]) => File[])) => void;
  accept?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const valid = Array.from(fileList).filter(f => isValidFile(f, accept));
      if (valid.length) setFiles(prev => [...prev, ...valid]);
    },
    [accept, setFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      processFiles(e.dataTransfer?.files ?? null);
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const toAdd: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f && isValidFile(f, accept)) toAdd.push(f);
        }
      }
      if (toAdd.length) {
        e.preventDefault();
        setFiles(prev => [...prev, ...toAdd]);
      }
    },
    [accept, setFiles]
  );

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const previewUrls = useMemo(
    () => files.map(f => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)),
    [files]
  );
  useEffect(() => () => previewUrls.forEach(u => u && URL.revokeObjectURL(u)), [previewUrls]);

  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!viewerUrl) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewerUrl(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewerUrl]);

  return (
    <div>
      <label className="text-xs text-gray-600 block mb-1">{label}</label>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          w-full border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-brand-red bg-red-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
        `}
      >
        <p className="text-sm text-gray-600 mb-1">
          Drag files here or click to select
        </p>
        <p className="text-xs text-gray-500">
          You can also paste with Ctrl+V (image or copied file)
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          multiple
          onChange={e => processFiles(e.target.files)}
        />
      </div>
      {files.length > 0 && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          {files.map((file, index) => {
            const previewUrl = previewUrls[index];
            return (
              <div key={index} className="relative border rounded-lg overflow-hidden bg-gray-50">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={e => { e.stopPropagation(); setViewerUrl(previewUrl); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewerUrl(previewUrl); } }}
                  />
                ) : (
                  <div className="w-full h-32 flex items-center justify-center text-gray-400">
                    📎 {file.name}
                  </div>
                )}
                <div className="p-2 bg-white border-t">
                  <div className="text-xs text-gray-600 truncate" title={file.name}>
                    {file.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="mt-1 text-xs text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {viewerUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewerUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
        >
          <img
            src={viewerUrl}
            alt=""
            className="max-w-full max-h-[90vh] object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setViewerUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-800 flex items-center justify-center text-xl font-bold shadow-lg"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
