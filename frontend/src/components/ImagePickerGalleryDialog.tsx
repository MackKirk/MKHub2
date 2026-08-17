import { useEffect, useState } from 'react';
import { withFileAccessToken } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import { uiCx, uiModalLayer } from '@/components/ui/tokens';
import { FileViewModeToolbar } from '@/components/files/FileViewModeToolbar';
import { getTileSizeConfig, type FileGridTileSize } from '@/components/files/fileViewMode';import {
  editorPanelTitleClass,
  editorTransitionInteractive,
  selectionToolButtonGhostClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';

export type ImagePickerGalleryFile = {
  id: string;
  file_object_id: string;
};

type ImagePickerGalleryDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  isLoading: boolean;
  filesOriginals: ImagePickerGalleryFile[];
  filesDerived: ImagePickerGalleryFile[];
  onReload: () => void;
  onSelect: (fileObjectId: string) => void;
};

function GallerySection({
  label,
  files,
  tileSize,
  onSelect,
  emptyMessage = 'No images in this section.',
}: {
  label: string;
  files: ImagePickerGalleryFile[];
  tileSize: FileGridTileSize;
  onSelect: (fileObjectId: string) => void;
  emptyMessage?: string;
}) {
  const { thumbnailWidth, gridClass, tileHeightClass } = getTileSizeConfig(tileSize);

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</h3>
      {files.length === 0 ? (
        <p className="py-4 text-sm text-slate-400">{emptyMessage}</p>
      ) : (
        <div className={uiCx('grid gap-3', gridClass)}>
          {files.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect(f.file_object_id)}
              className={uiCx(
                'group relative overflow-hidden rounded-lg border border-slate-200/90 bg-slate-100 text-left transition-shadow hover:ring-2 hover:ring-brand-red/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35',
                tileHeightClass,
              )}
            >
              <img
                src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=${thumbnailWidth}`)}
                alt=""
                loading="lazy"
                draggable={false}
                className="pointer-events-none h-full w-full object-cover select-none"
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ImagePickerGalleryDialog({
  isOpen,
  onClose,
  title,
  isLoading,
  filesOriginals,
  filesDerived,
  onReload,
  onSelect,
}: ImagePickerGalleryDialogProps) {
  const [tileSize, setTileSize] = useState<FileGridTileSize>('large');

  useEffect(() => {
    if (isOpen) setTileSize('large');
  }, [isOpen]);

  useEffect(() => {    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <OverlayPortal>
      <div
        className={uiCx(
          'fixed inset-0 flex items-center justify-center overflow-y-auto bg-black/50 p-4',
          uiModalLayer.nestedPicker,
        )}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-picker-gallery-title"
          className="flex h-[min(720px,88vh)] w-[min(1100px,96vw)] flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/[0.06]"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/85 bg-gradient-to-b from-white to-slate-50/90 px-4 py-3">
            <h2 id="image-picker-gallery-title" className={`${editorPanelTitleClass} truncate`}>
              {title}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <FileViewModeToolbar
                viewMode="grid"
                tileSize={tileSize}
                showGridToggle={false}
                showTileSizeToggle
                onViewModeChange={() => {}}
                onTileSizeChange={setTileSize}
              />
              <button
                type="button"
                disabled={isLoading}
                onClick={onReload}
                className={`${selectionToolButtonGhostClass} h-8 shrink-0 px-2 text-xs`}
              >
                Reload
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`${editorTransitionInteractive} flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35`}
                title="Close"
                aria-label="Close gallery"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-sm text-slate-500">
                <span
                  className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-brand-red"
                  role="status"
                  aria-label="Loading gallery"
                />
                Loading gallery…
              </div>
            ) : (
              <div className="space-y-6">
                <GallerySection
                  label="Original images"
                  files={filesOriginals}
                  tileSize={tileSize}
                  onSelect={onSelect}
                  emptyMessage="No original images"
                />
                <GallerySection
                  label="Edited images"
                  files={filesDerived}
                  tileSize={tileSize}
                  onSelect={onSelect}
                  emptyMessage="No edited images"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
