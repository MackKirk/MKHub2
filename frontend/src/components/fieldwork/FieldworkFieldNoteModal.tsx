import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import toast from 'react-hot-toast';
import { withFileAccessToken } from '@/lib/api';
import { imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';
import { AppButton, AppFormModal, uiCx, uiTypography } from '@/components/ui';
import FieldworkPhraseLibraryPanel from '@/components/fieldwork/FieldworkPhraseLibraryPanel';

const MAX_IMAGES = 8;

export type FieldworkNoteModalTab = 'comment' | 'images';

type Props = {
  open: boolean;
  onClose: () => void;
  fieldLabel: string;
  /** Which dedicated modal to show (comment and images are separate). */
  mode: FieldworkNoteModalTab;
  disabled?: boolean;
  text: string;
  imageIds: string[];
  onTextChange: (s: string) => void;
  onImageIdsChange: Dispatch<SetStateAction<string[]>>;
  projectId: string;
  uploadFile: (file: File) => Promise<string | null>;
};

export default function FieldworkFieldNoteModal({
  open,
  onClose,
  fieldLabel,
  mode,
  disabled = false,
  text,
  imageIds,
  onTextChange,
  onImageIdsChange,
  projectId,
  uploadFile,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || mode !== 'comment' || disabled) return;
    const t = window.setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 40);
    return () => window.clearTimeout(t);
  }, [open, mode, disabled]);

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
      const next = before + inserted + after;
      const caret = before.length + inserted.length;
      onTextChange(next);
      requestAnimationFrame(() => {
        ta?.focus({ preventScroll: true });
        ta?.setSelectionRange(caret, caret);
      });
    },
    [onTextChange, text]
  );

  const addImageFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files?.length || disabled || !projectId) return;
      const list = Array.from(files).filter((f) => isLikelyImageFile(f));
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
        if (!newIds.length) return;
        onImageIdsChange((prev) => {
          const room = Math.max(0, MAX_IMAGES - prev.length);
          if (room === 0) {
            toast.error(`You can attach at most ${MAX_IMAGES} images.`);
            return prev;
          }
          if (newIds.length > room) toast.error(`You can attach at most ${MAX_IMAGES} images.`);
          return [...prev, ...newIds.slice(0, room)].slice(0, MAX_IMAGES);
        });
      } finally {
        setBusy(false);
      }
    },
    [disabled, onImageIdsChange, projectId, uploadFile]
  );

  const removeImage = useCallback(
    (id: string) => {
      onImageIdsChange((prev) => prev.filter((x) => x !== id));
    },
    [onImageIdsChange]
  );

  if (mode === 'images') {
    return (
      <AppFormModal
        open={open}
        onClose={onClose}
        title={fieldLabel ? `${fieldLabel} · Images` : 'Images'}
        description="Attach photos for this field item."
        layout="detail"
        size="lg"
        scrollBody={false}
        dialogClassName="!w-[min(96vw,56rem)] !max-w-[min(96vw,56rem)] !h-[min(88vh,42rem)] !max-h-[min(88vh,42rem)]"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        footer={
          <div className="flex w-full justify-end">
            <AppButton type="button" variant="primary" size="sm" onClick={onClose}>
              Done
            </AppButton>
          </div>
        }
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
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
            className={uiCx(
              'rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
              dragOver ? 'border-brand-red bg-red-50/50' : 'border-gray-200 bg-gray-50/80',
              !projectId || busy || disabled ? 'pointer-events-none opacity-60' : ''
            )}
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
            <p className="text-sm font-semibold text-gray-900">Attach images</p>
            <p className={uiCx(uiTypography.helper, 'mt-1')}>
              Upload, drag and drop, or paste (Ctrl+V)
            </p>
            <AppButton
              type="button"
              variant="primary"
              size="sm"
              className="mt-4"
              disabled={disabled || busy || !projectId}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload images
            </AppButton>
            {!projectId ? (
              <p className="mt-3 text-sm text-amber-700">
                Open this report from a project to attach images.
              </p>
            ) : null}
          </div>

          {imageIds.length ? (
            <div className="flex flex-wrap gap-3">
              {imageIds.map((id) => (
                <div key={id} className="relative">
                  <img
                    src={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=240`)}
                    alt=""
                    className="h-24 w-24 rounded-xl border-2 border-gray-200 object-cover"
                  />
                  {!disabled ? (
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-sm leading-none text-white hover:bg-black/80"
                      onClick={() => removeImage(id)}
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className={uiTypography.helper}>No images attached yet.</p>
          )}
        </div>
      </AppFormModal>
    );
  }

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={fieldLabel ? `${fieldLabel} · Comment` : 'Comment'}
      description="Write a short note above, or insert standard R&M phrases from the library below."
      layout="detail"
      size="lg"
      scrollBody={false}
      dialogClassName="!w-[min(96vw,84rem)] !max-w-[min(96vw,84rem)] !h-[min(94vh,58rem)] !max-h-[min(94vh,58rem)]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footer={
        <div className="flex w-full justify-end">
          <AppButton type="button" variant="primary" size="sm" onClick={onClose}>
            Done
          </AppButton>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4 sm:px-5">
        <label className="block shrink-0">
          <span className="mb-1.5 block text-sm font-semibold text-gray-900">Comment</span>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            disabled={disabled}
            rows={4}
            placeholder="Short note or inserted phrase library text…"
            className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/20 disabled:bg-gray-50"
          />
        </label>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <p className="mb-2 shrink-0 text-sm font-semibold text-gray-900">Phrase library</p>
          <FieldworkPhraseLibraryPanel
            active={open}
            disabled={disabled}
            onInsert={insertPhrase}
            className="min-h-0 flex-1"
          />
        </div>
      </div>
    </AppFormModal>
  );
}
