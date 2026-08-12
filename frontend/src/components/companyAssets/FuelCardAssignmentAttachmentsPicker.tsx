import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { filesFromClipboardData, imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';
import { AppControlLabelRow, AppFieldHint } from '@/components/ui';

function isFuelCardAttachmentFile(file: File): boolean {
  if (isLikelyImageFile(file)) return true;
  const ct = (file.type || '').toLowerCase();
  if (ct === 'application/pdf') return true;
  if (ct === 'application/msword') return true;
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  const n = file.name.toLowerCase();
  return /\.(pdf|doc|docx)$/i.test(n);
}

async function uploadFuelCardAttachment(file: File): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const up: any = await api('POST', '/files/upload', {
    original_name: file.name,
    content_type: contentType,
    employee_id: null,
    project_id: null,
    client_id: null,
    category_id: 'fuel-card-assignment-attachments',
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

function clipboardFiles(data: DataTransfer | null): File[] {
  const fromFiles = filesFromClipboardData(data).filter(isFuelCardAttachmentFile);
  if (fromFiles.length) return fromFiles;
  return imageFilesFromClipboardData(data);
}

function AttachmentThumb({
  fileId,
  disabled,
  onRemove,
}: {
  fileId: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const [showImage, setShowImage] = useState(true);

  return (
    <div className="relative group h-20 w-20 shrink-0">
      {showImage ? (
        <img
          src={withFileAccessToken(`/files/${encodeURIComponent(fileId)}/thumbnail?w=120`)}
          alt=""
          className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
          onError={() => setShowImage(false)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-100 p-1 text-center text-[10px] font-medium text-gray-600">
          File
        </div>
      )}
      {!disabled ? (
        <button
          type="button"
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-5 text-white hover:bg-black/80"
          onClick={onRemove}
          aria-label="Remove file"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function FuelCardAssignmentAttachmentsPicker({
  label,
  fileIds,
  onFileIdsChange,
  onUploadingChange,
  disabled,
  fieldHint,
}: {
  label: string;
  fileIds: string[];
  onFileIdsChange: Dispatch<SetStateAction<string[]>>;
  onUploadingChange?: (busy: boolean) => void;
  disabled?: boolean;
  fieldHint?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || disabled) return;
    const list = Array.from(files).filter(isFuelCardAttachmentFile);
    if (!list.length) {
      toast.error('Images, PDF, or Word documents only.');
      return;
    }
    onUploadingChange?.(true);
    try {
      const newIds: string[] = [];
      for (const file of list) {
        newIds.push(await uploadFuelCardAttachment(file));
      }
      onFileIdsChange((prev) => [...prev, ...newIds]);
      toast.success(list.length === 1 ? 'File uploaded' : `${list.length} files uploaded`);
    } catch {
      toast.error('Failed to upload attachment');
    } finally {
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {fieldHint ? (
        <AppControlLabelRow label={label} fieldHint={<AppFieldHint hint={fieldHint} />} />
      ) : (
        <div className="mb-1 text-sm font-medium text-gray-700">{label}</div>
      )}
      <div
        className={`rounded-lg border-2 border-dashed px-3 py-4 transition-colors ${
          dragOver ? 'border-sky-400 bg-sky-50' : 'border-gray-200 bg-gray-50/60'
        } ${disabled ? 'opacity-60' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => {
          const pasted = clipboardFiles(e.clipboardData);
          if (pasted.length) {
            e.preventDefault();
            void addFiles(pasted);
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {fileIds.map((id) => (
            <AttachmentThumb
              key={id}
              fileId={id}
              disabled={disabled}
              onRemove={() => onFileIdsChange((prev) => prev.filter((x) => x !== id))}
            />
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Optional — images, PDF, or Word. Drag, paste, or choose files.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,application/pdf"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => void addFiles(e.target.files)}
        />
      </div>
    </div>
  );
}
