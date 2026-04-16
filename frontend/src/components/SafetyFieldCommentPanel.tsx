import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { withFileAccessToken } from '@/lib/api';

const MAX_IMAGES = 8;

type Props = {
  expanded: boolean;
  disabled: boolean;
  text: string;
  imageIds: string[];
  onTextChange: (s: string) => void;
  onImageIdsChange: (ids: string[]) => void;
  projectId: string;
  uploadFile: (file: File) => Promise<string | null>;
};

function ImageThumbStrip({
  ids,
  disabled,
  onRemove,
}: {
  ids: string[];
  disabled: boolean;
  onRemove?: (id: string) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {ids.map((id) => (
        <div key={id} className="relative group">
          <img
            src={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=240`)}
            alt=""
            className="h-20 w-20 object-cover rounded-xl border-2 border-gray-200"
          />
          {!disabled && onRemove ? (
            <button
              type="button"
              className="absolute -top-1 -right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs leading-5 hover:bg-black/80"
              onClick={() => onRemove(id)}
              aria-label="Remove image"
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SafetyFieldCommentPanel({
  expanded,
  disabled,
  text,
  imageIds,
  onTextChange,
  onImageIdsChange,
  projectId,
  uploadFile,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const acceptFile = useCallback(
    (file: File) =>
      /^image\//.test(file.type) || /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(file.name),
    []
  );

  const addImageFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files?.length || disabled || !projectId) return;
      const list = Array.from(files).filter(acceptFile);
      if (!list.length) {
        toast.error('Only image files are allowed.');
        return;
      }
      setBusy(true);
      try {
        let next = [...imageIds];
        for (const file of list) {
          if (next.length >= MAX_IMAGES) {
            toast.error(`You can attach at most ${MAX_IMAGES} images.`);
            break;
          }
          const id = await uploadFile(file);
          if (id) next.push(id);
          else toast.error('Could not upload image.');
        }
        onImageIdsChange(next.slice(0, MAX_IMAGES));
      } finally {
        setBusy(false);
      }
    },
    [acceptFile, disabled, imageIds, onImageIdsChange, projectId, uploadFile]
  );

  const removeImage = useCallback(
    (id: string) => {
      onImageIdsChange(imageIds.filter((x) => x !== id));
    },
    [imageIds, onImageIdsChange]
  );

  const has = text.trim().length > 0 || imageIds.length > 0;

  if (!disabled && expanded) {
    return (
      <div className="mt-3 w-full space-y-3">
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Comments / details (optional)"
          rows={3}
          disabled={disabled}
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm resize-y disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
        />
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOver(true);
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
          className={`rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors ${
            dragOver ? 'border-brand-red bg-red-50/50' : 'border-gray-200 bg-gray-50/80'
          } ${!projectId || busy ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={disabled || busy || !projectId}
            onChange={(e) => {
              void addImageFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <p className="text-xs text-gray-600 mb-2">Images (optional)</p>
          <button
            type="button"
            disabled={disabled || busy || !projectId}
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-medium text-brand-red hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Upload images
          </button>
          <p className="text-xs text-gray-500 mt-1">or drag and drop images here</p>
          {!projectId ? (
            <p className="text-xs text-amber-700 mt-2">Open this inspection from a project to attach images.</p>
          ) : null}
        </div>
        <ImageThumbStrip ids={imageIds} disabled={false} onRemove={removeImage} />
      </div>
    );
  }

  if (!disabled && !expanded && has) {
    return (
      <div className="mt-3 w-full">
        {text.trim() ? <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{text}</p> : null}
        <ImageThumbStrip ids={imageIds} disabled />
      </div>
    );
  }

  if (disabled && has) {
    return (
      <div className="mt-3 w-full">
        {text.trim() ? <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{text}</p> : null}
        <ImageThumbStrip ids={imageIds} disabled />
      </div>
    );
  }

  return null;
}
