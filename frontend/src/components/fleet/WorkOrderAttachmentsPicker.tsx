import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { filesFromClipboardData, imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';
import { SAFETY_MODAL_FIELD_LABEL } from '@/components/safety/SafetyModalChrome';

function isWorkOrderAttachmentFile(file: File): boolean {
  if (isLikelyImageFile(file)) return true;
  const ct = (file.type || '').toLowerCase();
  if (ct === 'application/pdf') return true;
  if (ct === 'application/msword') return true;
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  const n = file.name.toLowerCase();
  if (/\.(pdf|doc|docx)$/i.test(n)) return true;
  return false;
}

async function uploadWorkOrderAttachmentFile(file: File): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const up: any = await api('POST', '/files/upload', {
    original_name: file.name,
    content_type: contentType,
    employee_id: null,
    project_id: null,
    client_id: null,
    category_id: 'fleet-work-order-photos',
  });
  await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
    body: file,
  });
  const conf: any = await api('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: contentType,
  });
  return conf.id as string;
}

function clipboardFilesForWorkOrder(data: DataTransfer | null): File[] {
  const fromFiles = filesFromClipboardData(data);
  const filtered = fromFiles.filter(isWorkOrderAttachmentFile);
  if (filtered.length) return filtered;
  return imageFilesFromClipboardData(data);
}

function WorkOrderAttachmentThumb({
  fileId,
  disabled,
  onRemove,
}: {
  fileId: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const [showImage, setShowImage] = useState(true);

  if (!showImage) {
    return (
      <div className="relative group h-20 w-20 shrink-0">
        <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-100 p-1 text-center text-[10px] font-medium text-gray-600">
          Doc
        </div>
        {!disabled && (
          <button
            type="button"
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-5 text-white hover:bg-black/80"
            onClick={onRemove}
            aria-label="Remove file"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative group h-20 w-20 shrink-0">
      <img
        src={withFileAccessToken(`/files/${encodeURIComponent(fileId)}/thumbnail?w=120`)}
        alt=""
        className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
        onError={() => setShowImage(false)}
      />
      {!disabled && (
        <button
          type="button"
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-5 text-white hover:bg-black/80"
          onClick={onRemove}
          aria-label="Remove file"
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Dashed drop zone (same pattern as assign): drag-and-drop, Ctrl+V paste, or file picker. */
export function WorkOrderAttachmentsPicker({
  label = 'Photos & documents',
  fileIds,
  onFileIdsChange,
  onUploadingChange,
  disabled,
}: {
  label?: string;
  fileIds: string[];
  onFileIdsChange: Dispatch<SetStateAction<string[]>>;
  onUploadingChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || disabled) return;
    const list = Array.from(files).filter(isWorkOrderAttachmentFile);
    if (!list.length) {
      toast.error('Only images, PDF, or Word documents are allowed.');
      return;
    }
    onUploadingChange?.(true);
    try {
      const newIds: string[] = [];
      for (const file of list) {
        newIds.push(await uploadWorkOrderAttachmentFile(file));
      }
      onFileIdsChange((prev) => [...prev, ...newIds]);
      toast.success(list.length === 1 ? 'File uploaded' : `${list.length} files uploaded`);
    } catch {
      toast.error('Failed to upload files');
    } finally {
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    onFileIdsChange((prev) => prev.filter((x) => x !== id));
  };

  return (
    <div>
      <label className={SAFETY_MODAL_FIELD_LABEL}>{label}</label>
      <div
        tabIndex={disabled ? -1 : 0}
        onPaste={(e) => {
          if (disabled) return;
          const pasted = clipboardFilesForWorkOrder(e.clipboardData);
          if (!pasted.length) return;
          e.preventDefault();
          void addFiles(pasted);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed px-3 py-4 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-red/25 ${
          dragOver ? 'border-brand-red bg-red-50/50' : 'border-gray-200 bg-gray-50/80'
        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            void addFiles(e.target.files);
          }}
        />
        <p className="mb-2 text-xs text-gray-600">
          Drag and drop photos or documents here, paste (Ctrl+V), or upload
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="text-sm font-medium text-brand-red hover:underline disabled:opacity-50 disabled:no-underline"
        >
          Choose files
        </button>
        <p className="mt-1.5 text-xs text-gray-500">Images, PDF, and Word documents</p>
      </div>
      {fileIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {fileIds.map((fid) => (
            <WorkOrderAttachmentThumb key={fid} fileId={fid} disabled={disabled} onRemove={() => removeFile(fid)} />
          ))}
        </div>
      )}
    </div>
  );
}
