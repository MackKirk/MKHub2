import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import toast from 'react-hot-toast';
import { withFileAccessToken } from '@/lib/api';
import { imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';

const MAX_IMAGES = 8;

type Props = {
  expanded: boolean;
  disabled: boolean;
  text: string;
  imageIds: string[];
  onTextChange: (s: string) => void;
  /** Use functional updates so async uploads merge with the latest ids (avoids stale closures). */
  onImageIdsChange: Dispatch<SetStateAction<string[]>>;
  projectId: string;
  uploadFile: (file: File) => Promise<string | null>;
  /** When true, only the text field (no image upload, paste, or thumbnails). */
  textCommentsOnly?: boolean;
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
  textCommentsOnly = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /** After "Add comment", move focus into the textarea so Space types a space (not a focused toggle button). */
  useLayoutEffect(() => {
    if (!expanded || disabled) return;
    let cancelled = false;
    const focusTa = () => {
      if (cancelled) return;
      textareaRef.current?.focus({ preventScroll: true });
    };
    // Defer past the click/focus chain so we reliably beat any ancestor or browser default focus.
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(focusTa);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, disabled]);

  const acceptFile = useCallback((file: File) => isLikelyImageFile(file), []);

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
        const newIds: string[] = [];
        for (const file of list) {
          const id = await uploadFile(file);
          if (id) newIds.push(id);
          else toast.error('Could not upload image.');
        }
        if (newIds.length === 0) return;
        onImageIdsChange((prev) => {
          const room = Math.max(0, MAX_IMAGES - prev.length);
          if (room === 0) {
            toast.error(`You can attach at most ${MAX_IMAGES} images.`);
            return prev;
          }
          const toAdd = newIds.slice(0, room);
          if (newIds.length > room) {
            toast.error(`You can attach at most ${MAX_IMAGES} images.`);
          }
          return [...prev, ...toAdd].slice(0, MAX_IMAGES);
        });
      } finally {
        setBusy(false);
      }
    },
    [acceptFile, disabled, onImageIdsChange, projectId, uploadFile]
  );

  const removeImage = useCallback(
    (id: string) => {
      onImageIdsChange((prev) => prev.filter((x) => x !== id));
    },
    [onImageIdsChange]
  );

  const insertTextareaText = useCallback(
    (inserted: string) => {
      const ta = textareaRef.current;
      if (!ta) {
        onTextChange(`${text}${inserted}`);
        return;
      }
      const current = ta.value;
      const start = ta.selectionStart ?? current.length;
      const end = ta.selectionEnd ?? start;
      const next = current.slice(0, start) + inserted + current.slice(end);
      const caret = start + inserted.length;
      onTextChange(next);
      requestAnimationFrame(() => {
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(caret, caret);
      });
    },
    [onTextChange, text]
  );

  const handleTextareaKeyDownCapture = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation();
      if (e.key !== ' ' && e.code !== 'Space') return;
      // Some page-level handlers prevent the native Space default before the textarea sees it.
      e.preventDefault();
      insertTextareaText(' ');
    },
    [insertTextareaText]
  );

  const has = textCommentsOnly ? text.trim().length > 0 : text.trim().length > 0 || imageIds.length > 0;

  if (!disabled && expanded) {
    return (
      <div className="mt-3 w-full space-y-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDownCapture={handleTextareaKeyDownCapture}
          onKeyDown={(e) => {
            // Stop Space/other keys bubbling to page-level shortcuts or sibling buttons.
            e.stopPropagation();
          }}
          onPaste={
            textCommentsOnly
              ? undefined
              : (e) => {
                  if (disabled || busy || !projectId) return;
                  const files = imageFilesFromClipboardData(e.clipboardData);
                  if (!files.length) return;
                  e.preventDefault();
                  void addImageFiles(files);
                }
          }
          placeholder={textCommentsOnly ? 'Comment (optional)' : 'Comments / details (optional)'}
          rows={textCommentsOnly ? 2 : 3}
          disabled={disabled}
          className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm resize-y disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
        />
        {textCommentsOnly ? null : (
          <>
            <div
              tabIndex={-1}
              onPaste={(e) => {
                if (disabled || busy || !projectId) return;
                const files = imageFilesFromClipboardData(e.clipboardData);
                if (!files.length) return;
                e.preventDefault();
                void addImageFiles(files);
              }}
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
              className={`rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 ${
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
              <p className="text-xs text-gray-500 mt-1">or drag and drop here, or paste (Ctrl+V) in this box or in the comment field above</p>
              {!projectId ? (
                <p className="text-xs text-amber-700 mt-2">Open this inspection from a project to attach images.</p>
              ) : null}
            </div>
            <ImageThumbStrip ids={imageIds} disabled={false} onRemove={removeImage} />
          </>
        )}
      </div>
    );
  }

  if (!disabled && !expanded && has) {
    return (
      <div className="mt-3 w-full">
        {text.trim() ? <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{text}</p> : null}
        {textCommentsOnly ? null : <ImageThumbStrip ids={imageIds} disabled />}
      </div>
    );
  }

  if (disabled && has) {
    return (
      <div className="mt-3 w-full">
        {text.trim() ? <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{text}</p> : null}
        {textCommentsOnly ? null : <ImageThumbStrip ids={imageIds} disabled />}
      </div>
    );
  }

  return null;
}
