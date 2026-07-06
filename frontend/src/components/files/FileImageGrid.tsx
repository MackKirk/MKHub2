import type { DragEvent, ReactNode } from 'react';
import { withFileAccessToken } from '@/lib/api';
import { AppCheckboxControl, uiCx } from '@/components/ui';
import { dropTargetClass, setDraggedFileIds } from './fileListDnD';
import { FileFolderGridTile, FileParentGridTile } from './FileFolderGridTile';
import type { FileGridFileItem, FileGridFolderItem } from './fileGridTypes';
import { getTileSizeConfig, type FileGridTileSize } from './fileViewMode';

type Props = {
  folders?: FileGridFolderItem[];
  files: FileGridFileItem[];
  tileSize: FileGridTileSize;
  selectedIds?: Set<string>;
  canSelect?: boolean;
  canWrite?: boolean;
  showParentTile?: boolean;
  onParentNavigate?: () => void;
  onOpenFolder?: (folderId: string) => void;
  onPreviewFile?: (file: FileGridFileItem) => void;
  onSelectFile?: (fileId: string, shiftKey: boolean) => void;
  onFileDragStart?: (e: DragEvent, fileId: string) => void;
  onFileDragEnd?: () => void;
  onFolderDragStart?: (e: DragEvent, folderId: string) => void;
  onFolderDragEnd?: () => void;
  makeFolderDropHandlers?: (folderId: string, folderName: string) => {
    onDragOver?: (e: DragEvent) => void;
    onDragLeave?: (e: DragEvent) => void;
    onDrop?: (e: DragEvent) => void;
    isDropActive?: boolean;
  };
  renderFileActions?: (file: FileGridFileItem) => ReactNode;
  renderFolderActions?: (folder: FileGridFolderItem) => ReactNode;
  nonImageSection?: ReactNode;
  emptyMessage?: string;
};

export function FileImageGrid({
  folders = [],
  files,
  tileSize,
  selectedIds,
  canSelect = false,
  canWrite = false,
  showParentTile = false,
  onParentNavigate,
  onOpenFolder,
  onPreviewFile,
  onSelectFile,
  onFileDragStart,
  onFileDragEnd,
  onFolderDragStart,
  onFolderDragEnd,
  makeFolderDropHandlers,
  renderFileActions,
  renderFolderActions,
  nonImageSection,
  emptyMessage = 'No images in this view.',
}: Props) {
  const { thumbnailWidth, gridClass, tileHeightClass } = getTileSizeConfig(tileSize);
  const hasContent = showParentTile || folders.length > 0 || files.length > 0;

  return (
    <div className="p-3">
      {!hasContent ? (
        <div className="py-8 text-center text-sm text-gray-600">{emptyMessage}</div>
      ) : (
        <div className={uiCx('grid gap-3', gridClass)}>
          {showParentTile && onParentNavigate ? (
            <FileParentGridTile tileSizeClass={tileHeightClass} onNavigate={onParentNavigate} />
          ) : null}
          {folders.map((folder) => {
            const dropHandlers = makeFolderDropHandlers?.(folder.id, folder.name) ?? {};
            return (
              <FileFolderGridTile
                key={folder.id}
                folder={folder}
                tileSizeClass={tileHeightClass}
                canSelect={canSelect}
                canWrite={canWrite}
                draggable={canWrite}
                isDropActive={dropHandlers.isDropActive}
                onOpen={() => onOpenFolder?.(folder.id)}
                onDragStart={(e) => onFolderDragStart?.(e, folder.id)}
                onDragEnd={onFolderDragEnd}
                onDragOver={dropHandlers.onDragOver}
                onDragLeave={dropHandlers.onDragLeave}
                onDrop={dropHandlers.onDrop}
                actions={renderFolderActions?.(folder)}
              />
            );
          })}
          {files.map((file) => {
            const selected = selectedIds?.has(file.id) ?? false;
            return (
              <div
                key={file.id}
                role="button"
                tabIndex={0}
                draggable={canWrite}
                onDragStart={(e) => {
                  const ids =
                    canSelect && selectedIds && selectedIds.size > 0 && selectedIds.has(file.id)
                      ? [...selectedIds]
                      : [file.id];
                  setDraggedFileIds(e.dataTransfer, ids);
                  onFileDragStart?.(e, file.id);
                }}
                onDragEnd={onFileDragEnd}
                onClick={() => onPreviewFile?.(file)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPreviewFile?.(file);
                  }
                }}
                className={uiCx(
                  'group relative overflow-hidden rounded-lg border bg-gray-100 text-left transition-colors hover:ring-2 hover:ring-brand-red/40',
                  tileHeightClass,
                  selected ? 'ring-2 ring-brand-red' : '',
                  canWrite ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                )}
              >
                {canSelect ? (
                  <div className="absolute left-2 top-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <AppCheckboxControl
                      checked={selected}
                      aria-label={`Select ${file.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectFile?.(file.id, e.shiftKey);
                      }}
                    />
                  </div>
                ) : null}
                <img
                  src={withFileAccessToken(`/files/${file.fileObjectId}/thumbnail?w=${thumbnailWidth}`)}
                  alt={file.name}
                  loading="lazy"
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  className="pointer-events-none h-full w-full object-cover select-none"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                  <div className="truncate text-[11px] font-medium text-white">{file.name}</div>
                </div>
                {renderFileActions ? (
                  <div
                    className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderFileActions(file)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {nonImageSection}
    </div>
  );
}

export function FileGridNonImageList({
  title = 'Other files',
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      {children}
    </div>
  );
}

export { dropTargetClass };
