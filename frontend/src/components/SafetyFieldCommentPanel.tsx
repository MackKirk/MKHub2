import { useCallback, useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import toast from 'react-hot-toast';
import { withFileAccessToken } from '@/lib/api';
import { imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';
import FieldworkPhraseInsertButton from '@/components/fieldwork/FieldworkPhraseInsertButton';

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
  /** When true, only the image drop zone + thumbnails (no comment textarea). */
  imagesOnly?: boolean;
  /** Fieldwork only: show a control to insert R&M phrase-library text into the comment. */
  enableFieldworkPhrases?: boolean;
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
              className="absolute -top-1 -right-1 w-5 h-5 bg-black/60 text-white rounded-full text-sm leading-5 hover:bg-black/80"
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
  imagesOnly = false,
  enableFieldworkPhrases = false,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const showText = !imagesOnly;
  const showImages = !textCommentsOnly;

  /** After "Add comment", move focus into the textarea so Space types a space (not a focused toggle button). */
  useLayoutEffect(() => {
    if (!expanded || disabled || !showText) return;
    let cancelled = false;
    const focusTa = () => {
      if (cancelled) return;
      textareaRef.current?.focus({ preventScroll: true });
    };
    // Defer past the click/focus chain so we reliably beat any ancestor or browser default focus.
    voidMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(focusTa);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, disabled, showText]);

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

  const has = imagesOnly
    ? imageIds.length > 0
    : textCommentsOnly
      ? text.trim().length > 0
      : text.trim().length > 0 || imageIds.length > 0;

  const insertPhrase = useCallback(
    (phrase: string) => {
      const ta = textareaRef.current;
      const current = ta?.value ?? text;
      const start = ta?.selectionStart ?? current.length;
      const end = ta?.selectionEnd ?? start;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const needsPadBefore = before.length > 0 && !/\s$/.test(before);
      const needsPadAfter = after.length > 0 && !/^\s/.test(after);
      const inserted = `${needsPadBefore ? '\n' : ''}${phrase}${needsPadAfter ? '\n' : ''}`;
      insertTextareaText(inserted);
    },
    [insertTextareaText, text]
  );

  const imageDropZone =
    showImages ? (
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
          <p className="text-sm text-gray-600 mb-2">{imagesOnly ? 'Drop photos here' : 'Images (optional)'}</p>
          <button
            type="button"
            disabled={disabled || busy || !projectId}
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-semibold text-brand-red hover:underline disabled:opacity-50 disabled:no-underline"
          >
            Upload images
          </button>
          <p className="text-sm text-gray-600 mt-1">
            {imagesOnly
              ? 'or drag and drop, or paste (Ctrl+V)'
              : 'or drag and drop here, or paste (Ctrl+V) in this box or in the comment field above'}
          </p>
          {!projectId ? (
            <p className="text-sm text-amber-700 mt-2">Open this inspection from a project to attach images.</p>
          ) : null}
        </div>
        <ImageThumbStrip ids={imageIds} disabled={disabled} onRemove={disabled ? undefined : removeImage} />
      </>
    ) : null;

  if (!disabled && expanded) {
    return (
      <div className={`w-full space-y-3 ${imagesOnly ? '' : 'mt-3'}`}>
        {showText && enableFieldworkPhrases ? (
          <div className="space-y-2">
            <FieldworkPhraseInsertButton disabled={disabled} onInsert={insertPhrase} />
            <p className="text-xs text-gray-500">
              Prefer the library for standard wording. Use the note below only for something site-specific.
            </p>
          </div>
        ) : null}
        {showText ? (
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
              showImages
                ? (e) => {
                    if (disabled || busy || !projectId) return;
                    const files = imageFilesFromClipboardData(e.clipboardData);
                    if (!files.length) return;
                    e.preventDefault();
                    void addImageFiles(files);
                  }
                : undefined
            }
            placeholder={
              enableFieldworkPhrases
                ? 'Short extra note (optional)'
                : textCommentsOnly || imagesOnly
                  ? 'Comment (optional)'
                  : 'Comments / details (optional)'
            }
            rows={enableFieldworkPhrases ? 2 : textCommentsOnly || imagesOnly ? 2 : 3}
            disabled={disabled}
            className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm resize-y disabled:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
          />
        ) : null}
        {imageDropZone}
      </div>
    );
  }

  if (!disabled && !expanded && has) {
    return (
      <div className="mt-3 w-full">
        {showText && text.trim() ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{text}</p>
        ) : null}
        {showImages ? <ImageThumbStrip ids={imageIds} disabled /> : null}
      </div>
    );
  }

  if (disabled && has) {
    return (
      <div className="mt-3 w-full">
        {showText && text.trim() ? (
          <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{text}</p>
        ) : null}
        {showImages ? <ImageThumbStrip ids={imageIds} disabled /> : null}
      </div>
    );
  }

  return null;
}
