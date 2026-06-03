import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';
import { SAFETY_MODAL_FIELD_LABEL } from '@/components/safety/SafetyModalChrome';
import { AppFieldHint, AppControlLabelRow } from '@/components/ui';

async function uploadFleetAssignmentImage(file: File): Promise<string> {
  const contentType = file.type || 'image/jpeg';
  const up: any = await api('POST', '/files/upload', {
    original_name: file.name,
    content_type: contentType,
    employee_id: null,
    project_id: null,
    client_id: null,
    category_id: 'fleet-assignment-photos',
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

export function FleetAssignmentPhotosPicker({
  label,
  photoIds,
  onPhotoIdsChange,
  onUploadingChange,
  disabled,
  fieldHint,
}: {
  label: string;
  photoIds: string[];
  onPhotoIdsChange: Dispatch<SetStateAction<string[]>>;
  onUploadingChange?: (busy: boolean) => void;
  disabled?: boolean;
  fieldHint?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addImageFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || disabled) return;
    const list = Array.from(files).filter(isLikelyImageFile);
    if (!list.length) {
      toast.error('Only image files are allowed.');
      return;
    }
    onUploadingChange?.(true);
    try {
      const newIds: string[] = [];
      for (const file of list) {
        newIds.push(await uploadFleetAssignmentImage(file));
      }
      onPhotoIdsChange((prev) => [...prev, ...newIds]);
      toast.success(list.length === 1 ? 'Image uploaded' : `${list.length} images uploaded`);
    } catch {
      toast.error('Failed to upload photos');
    } finally {
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (id: string) => {
    onPhotoIdsChange((prev) => prev.filter((x) => x !== id));
  };

  return (
    <div>
      {fieldHint ? (
        <AppControlLabelRow label={label} fieldHint={<AppFieldHint hint={fieldHint} />} />
      ) : (
        <label className={SAFETY_MODAL_FIELD_LABEL}>{label}</label>
      )}
      <div
        tabIndex={disabled ? -1 : 0}
        onPaste={(e) => {
          if (disabled) return;
          const pasted = imageFilesFromClipboardData(e.clipboardData);
          if (!pasted.length) return;
          e.preventDefault();
          void addImageFiles(pasted);
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
          void addImageFiles(e.dataTransfer.files);
        }}
        className={`mt-1.5 rounded-lg border-2 border-dashed px-3 py-4 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-red/25 ${
          dragOver ? 'border-brand-red bg-red-50/50' : 'border-gray-200 bg-gray-50/80'
        } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            void addImageFiles(e.target.files);
          }}
        />
        <p className="mb-2 text-xs text-gray-600">Drag and drop images here, paste (Ctrl+V), or upload</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="text-sm font-medium text-brand-red hover:underline disabled:opacity-50 disabled:no-underline"
        >
          Choose images
        </button>
        <p className="mt-1.5 text-xs text-gray-500">Multiple images supported</p>
      </div>
      {photoIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photoIds.map((id) => (
            <div key={id} className="group relative">
              <img
                src={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=120`)}
                alt=""
                className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
              />
              {!disabled && (
                <button
                  type="button"
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-5 text-white hover:bg-black/80"
                  onClick={() => removePhoto(id)}
                  aria-label="Remove image"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
