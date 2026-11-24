import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Check, ImageIcon, ListChecks, Pencil, Upload, Wrench, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError, formatApiErrorDetail, withFileAccessToken } from '@/lib/api';
import {
  ensureFieldworkPhotosLinked,
  type FieldworkPhotoClassifyMeta,
} from '@/lib/fieldworkPhotoLink';
import { imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';
import { AppButton, AppChoiceCards, AppFormModal, uiCx, uiTypography } from '@/components/ui';
import FieldworkPhraseLibraryPanel, {
  type FieldworkPhraseSelection,
} from '@/components/fieldwork/FieldworkPhraseLibraryPanel';

const MAX_IMAGES = 8;

export type FieldworkNoteModalTab = 'comment' | 'images';

type Props = {
  open: boolean;
  onClose: () => void;
  fieldLabel: string;
  /** Initial pane when the modal opens (Images or Phrases). */
  mode: FieldworkNoteModalTab;
  disabled?: boolean;
  text: string;
  imageIds: string[];
  onTextChange: (s: string) => void;
  onImageIdsChange: Dispatch<SetStateAction<string[]>>;
  /** Persist catalog selection on the field so submit can link photo + phrases. */
  photoClassify?: FieldworkPhotoClassifyMeta | null;
  onPhotoClassifyChange?: (meta: FieldworkPhotoClassifyMeta | null) => void;
  projectId: string;
  uploadFile: (file: File) => Promise<string | null>;
  /** When set, Done links images to FieldworkPhotoObservation (Document Insert / Files). */
  fieldworkRecordId?: string | null;
  fieldworkRowVersion?: number | null;
  onClassifiedPhotosSynced?: (info: { recordRowVersion?: number | null }) => Promise<void> | void;
  onClassifiedPhotoRemoved?: (fileObjectId: string) => Promise<void> | void;
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
  photoClassify = null,
  onPhotoClassifyChange,
  projectId,
  uploadFile,
  fieldworkRecordId,
  fieldworkRowVersion,
  onClassifiedPhotosSynced,
  onClassifiedPhotoRemoved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [activeTab, setActiveTab] = useState<FieldworkNoteModalTab>(mode);
  const [pendingSelection, setPendingSelection] = useState<FieldworkPhraseSelection | null>(null);
  const [editingPhrases, setEditingPhrases] = useState(false);
  const [localRowVersion, setLocalRowVersion] = useState<number | null>(
    typeof fieldworkRowVersion === 'number' ? fieldworkRowVersion : null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const classifyEnabled = !!fieldworkRecordId;

  useEffect(() => {
    if (!open) return;
    setActiveTab(mode);
    setEditingPhrases(false);
    setDragDepth(0);
    if (typeof fieldworkRowVersion === 'number') {
      setLocalRowVersion(fieldworkRowVersion);
    }
    if (photoClassify?.phraseItemIds?.length) {
      setPendingSelection({
        entryType: photoClassify.entryType,
        phraseItemIds: photoClassify.phraseItemIds,
        phraseTexts: photoClassify.phraseTexts || [],
      });
    } else {
      setPendingSelection(null);
    }
  }, [open, mode, fieldworkRowVersion, photoClassify]);

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
          const room = Math.max(0, MAX_IMAGES - (imageIds.length + newIds.length));
          if (room <= 0) {
            toast.error(`You can attach at most ${MAX_IMAGES} images.`);
            break;
          }
          const id = await uploadFile(file);
          if (!id) {
            toast.error('Could not upload image.');
            continue;
          }
          newIds.push(id);
        }
        if (!newIds.length) return;
        onImageIdsChange((prev) => {
          const room = Math.max(0, MAX_IMAGES - prev.length);
          if (room === 0) return prev;
          return [...prev, ...newIds.slice(0, room)].slice(0, MAX_IMAGES);
        });
      } finally {
        setBusy(false);
      }
    },
    [disabled, imageIds.length, onImageIdsChange, projectId, uploadFile]
  );

  const removeImage = useCallback(
    (id: string) => {
      onImageIdsChange((prev) => prev.filter((x) => x !== id));
      if (onClassifiedPhotoRemoved) {
        void Promise.resolve(onClassifiedPhotoRemoved(id)).catch(() => {
          toast.error('Could not unlink classified photo');
        });
      }
    },
    [onClassifiedPhotoRemoved, onImageIdsChange]
  );

  const applySelection = (sel: FieldworkPhraseSelection) => {
    setPendingSelection(sel);
    setEditingPhrases(false);
    onPhotoClassifyChange?.({
      entryType: sel.entryType,
      phraseItemIds: sel.phraseItemIds,
      phraseTexts: sel.phraseTexts,
    });
    // Keep legacy comment text in sync with selected phrases (no free-text UI).
    onTextChange(sel.phraseTexts.join('\n'));
  };

  const clearSelection = () => {
    setPendingSelection(null);
    setEditingPhrases(false);
    onPhotoClassifyChange?.(null);
    if (text.trim()) onTextChange('');
  };

  const removePhraseAt = (index: number) => {
    if (!pendingSelection) return;
    const nextIds = pendingSelection.phraseItemIds.filter((_, i) => i !== index);
    const nextTexts = pendingSelection.phraseTexts.filter((_, i) => i !== index);
    if (!nextIds.length) {
      clearSelection();
      return;
    }
    applySelection({
      entryType: pendingSelection.entryType,
      phraseItemIds: nextIds,
      phraseTexts: nextTexts,
    });
  };

  const finish = async () => {
    if (disabled || busy) return;
    if (!classifyEnabled) {
      onClose();
      return;
    }
    if (imageIds.length === 0) {
      onClose();
      return;
    }
    if (!pendingSelection?.phraseItemIds?.length) {
      toast.error('Select catalog phrase(s) on the Phrases tab before Done.');
      setActiveTab('comment');
      return;
    }

    setBusy(true);
    try {
      const result = await ensureFieldworkPhotosLinked({
        projectId,
        recordId: fieldworkRecordId!,
        fileObjectIds: imageIds,
        classify: {
          entryType: pendingSelection.entryType,
          phraseItemIds: pendingSelection.phraseItemIds,
          phraseTexts: pendingSelection.phraseTexts,
        },
        expectedRowVersion: localRowVersion,
      });
      if (typeof result.recordRowVersion === 'number') {
        setLocalRowVersion(result.recordRowVersion);
      }
      onPhotoClassifyChange?.({
        entryType: pendingSelection.entryType,
        phraseItemIds: pendingSelection.phraseItemIds,
        phraseTexts: pendingSelection.phraseTexts,
      });
      await onClassifiedPhotosSynced?.({ recordRowVersion: result.recordRowVersion });
      if (result.updated > 0 && result.linked === 0) {
        toast.success(
          result.updated === 1
            ? 'Photo caption updated on the report and in Files'
            : `${result.updated} photo captions updated on the report and in Files`
        );
      } else if (result.linked > 0) {
        toast.success(
          result.linked === 1
            ? 'Photo classified for this report'
            : `${result.linked} photos classified for this report`
        );
      } else if (result.updated > 0) {
        toast.success('Photo captions updated on the report and in Files');
      }
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? formatApiErrorDetail(err) || err.message
          : err instanceof Error
            ? err.message
            : 'Could not classify photos'
      );
    } finally {
      setBusy(false);
    }
  };

  const canUpload = !disabled && !busy && !!projectId;
  const dragOver = dragDepth > 0;
  const phraseCount = pendingSelection?.phraseTexts?.length || 0;
  const roomLeft = Math.max(0, MAX_IMAGES - imageIds.length);

  return (
    <AppFormModal
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      title={fieldLabel || 'Field note'}
      description={
        classifyEnabled
          ? 'Use Images for photos and Phrases for catalog options. Done links them for Files and Document Creator.'
          : 'Attach photos or pick catalog phrases for this field.'
      }
      layout="detail"
      size="lg"
      scrollBody={false}
      dialogClassName="!w-[min(96vw,84rem)] !max-w-[min(96vw,84rem)] !h-[min(94vh,58rem)] !max-h-[min(94vh,58rem)]"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className={uiCx(uiTypography.helper)}>
            {imageIds.length
              ? `${imageIds.length} photo${imageIds.length === 1 ? '' : 's'}`
              : 'No photos'}
            {phraseCount
              ? ` · ${phraseCount} phrase${phraseCount === 1 ? '' : 's'}`
              : classifyEnabled
                ? ' · no phrases yet'
                : ''}
          </p>
          <div className="flex gap-2">
            <AppButton type="button" variant="secondary" size="sm" disabled={busy} onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => void finish()}
            >
              Done
            </AppButton>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-5">
        <AppChoiceCards
          className="mb-3 shrink-0"
          columns={2}
          size="comfortable"
          value={activeTab}
          onChange={setActiveTab}
          disabled={busy}
          options={[
            {
              value: 'images',
              title: imageIds.length
                ? `Images (${imageIds.length})`
                : 'Images',
              description: 'Upload and manage photos for this field.',
              icon: ImageIcon,
            },
            {
              value: 'comment',
              title: phraseCount ? `Phrases (${phraseCount})` : 'Phrases',
              description: 'Pick catalog options — no free-text writing.',
              icon: ListChecks,
            },
          ]}
        />

        {activeTab === 'images' ? (
          <div
            tabIndex={-1}
            onPaste={(e) => {
              if (!canUpload || roomLeft <= 0) return;
              const files = imageFilesFromClipboardData(e.clipboardData);
              if (!files.length) return;
              e.preventDefault();
              void addImageFiles(files);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!canUpload || roomLeft <= 0) return;
              setDragDepth((d) => d + 1);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragDepth((d) => Math.max(0, d - 1));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragDepth(0);
              if (!canUpload || roomLeft <= 0) return;
              void addImageFiles(e.dataTransfer.files);
            }}
            className={uiCx(
              'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-dashed transition-colors',
              dragOver
                ? 'border-brand-red bg-red-50/70 ring-4 ring-brand-red/10'
                : 'border-gray-200 bg-gradient-to-b from-gray-50/90 to-white',
              !canUpload && !imageIds.length ? 'opacity-70' : ''
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={!canUpload || roomLeft <= 0}
              onChange={(e) => {
                void addImageFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {imageIds.length ? (
              <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">
                    {imageIds.length} photo{imageIds.length === 1 ? '' : 's'}
                    <span className="ml-1.5 font-normal text-gray-500">
                      · {roomLeft} slot{roomLeft === 1 ? '' : 's'} left
                    </span>
                  </p>
                  {canUpload && roomLeft > 0 ? (
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      loading={busy}
                      leftIcon={<Upload className="h-3.5 w-3.5" aria-hidden />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Add more
                    </AppButton>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {imageIds.map((id) => (
                    <div
                      key={id}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                    >
                      <img
                        src={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=480`)}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                      {!disabled ? (
                        <button
                          type="button"
                          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white shadow-md backdrop-blur-sm transition hover:bg-black/85"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(id);
                          }}
                          aria-label="Remove image"
                        >
                          <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {canUpload && roomLeft > 0 ? (
                  <p className={uiCx(uiTypography.helper, 'mt-4 text-center')}>
                    Drop more images anywhere in this area, or paste (Ctrl+V)
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <span
                  className={uiCx(
                    'inline-flex h-14 w-14 items-center justify-center rounded-2xl border shadow-sm',
                    dragOver
                      ? 'border-brand-red bg-white text-brand-red'
                      : 'border-gray-200 bg-white text-gray-500'
                  )}
                >
                  <Upload className="h-6 w-6" aria-hidden />
                </span>
                <div>
                  <p className="text-base font-semibold text-gray-900">
                    {dragOver ? 'Drop images to upload' : 'Drag & drop images here'}
                  </p>
                  <p className={uiCx(uiTypography.helper, 'mt-1')}>
                    or paste (Ctrl+V) · up to {MAX_IMAGES} photos · switch to Phrases to classify
                  </p>
                </div>
                <AppButton
                  type="button"
                  variant="primary"
                  size="sm"
                  className="mt-1"
                  disabled={!canUpload}
                  loading={busy}
                  leftIcon={<Upload className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose images
                </AppButton>
                {!projectId ? (
                  <p className="text-sm text-amber-700">
                    Open this report from a project to attach images.
                  </p>
                ) : null}
              </div>
            )}

            {dragOver && imageIds.length ? (
              <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-red-50/75 backdrop-blur-[1px]">
                <div className="rounded-2xl border-2 border-brand-red bg-white px-5 py-3 shadow-lg">
                  <p className="text-sm font-semibold text-brand-red">Drop to add photos</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {pendingSelection && !editingPhrases ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 rounded-xl border-2 border-brand-red/25 bg-gradient-to-br from-red-50/80 to-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-red text-white shadow-sm">
                          <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {pendingSelection.phraseTexts.length} phrase
                            {pendingSelection.phraseTexts.length === 1 ? '' : 's'} selected
                          </p>
                          <p className={uiCx(uiTypography.helper, 'mt-0.5')}>
                            Ready to link with photos on Done
                          </p>
                        </div>
                      </div>
                      <span
                        className={uiCx(
                          'mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
                          pendingSelection.entryType === 'work_performed'
                            ? 'border-amber-200 bg-amber-50 text-amber-900'
                            : 'border-sky-200 bg-sky-50 text-sky-900'
                        )}
                      >
                        {pendingSelection.entryType === 'work_performed' ? (
                          <Wrench className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ListChecks className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {pendingSelection.entryType === 'work_performed'
                          ? 'Work Performed'
                          : 'Observed Conditions'}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <AppButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy || disabled}
                        leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden />}
                        onClick={() => setEditingPhrases(true)}
                      >
                        Change
                      </AppButton>
                      {!disabled ? (
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={clearSelection}
                        >
                          Clear
                        </AppButton>
                      ) : null}
                    </div>
                  </div>
                </div>

                <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
                  {pendingSelection.phraseTexts.map((t, i) => (
                    <li
                      key={`${pendingSelection.phraseItemIds[i] || i}-${t.slice(0, 24)}`}
                      className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-brand-red ring-1 ring-brand-red/20">
                        {i + 1}
                      </span>
                      <p className="min-w-0 flex-1 text-sm leading-snug text-gray-900">{t}</p>
                      {!disabled ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-gray-500 opacity-70 transition hover:bg-gray-100 hover:text-brand-red hover:opacity-100"
                          onClick={() => removePhraseAt(i)}
                          aria-label="Remove phrase"
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <p className={uiCx(uiTypography.helper, 'mb-2 shrink-0')}>
                  {editingPhrases
                    ? 'Adjust your selection — previously chosen phrases stay checked.'
                    : 'Choose one or more catalog options — no free-text writing.'}
                </p>
                {editingPhrases && pendingSelection ? (
                  <div className="mb-2 flex shrink-0 justify-end">
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setEditingPhrases(false)}
                    >
                      Cancel edit
                    </AppButton>
                  </div>
                ) : null}
                <FieldworkPhraseLibraryPanel
                  active={open && activeTab === 'comment'}
                  disabled={disabled || busy}
                  initialSelection={editingPhrases ? pendingSelection : null}
                  onConfirmSelection={applySelection}
                  confirmLabel={editingPhrases ? 'Update selection' : 'Use selected'}
                  helperHint="Select phrases — free-text is not available"
                  className="min-h-0 flex-1"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </AppFormModal>
  );
}
