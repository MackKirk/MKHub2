import type { DragEvent, ReactNode } from 'react';
import { Folder } from 'lucide-react';
import { AppCheckboxControl, uiCx } from '@/components/ui';
import { dropTargetClass } from './fileListDnD';
import { fileDropTargetProps } from './FileListDropHint';
import type { FileGridFolderItem } from './fileGridTypes';

type Props = {
  folder: FileGridFolderItem;
  tileSizeClass?: string;
  selected?: boolean;
  canSelect?: boolean;
  canWrite?: boolean;
  isDropActive?: boolean;
  draggable?: boolean;
  onOpen: () => void;
  onSelect?: (shiftKey: boolean) => void;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  actions?: ReactNode;
};

export function FileFolderGridTile({
  folder,
  tileSizeClass = 'h-36',
  selected = false,
  canSelect = false,
  canWrite = false,
  isDropActive = false,
  draggable = false,
  onOpen,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  actions,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable && canWrite}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      {...fileDropTargetProps('folder')}
      className={uiCx(
        'group relative flex flex-col overflow-hidden rounded-lg border bg-white text-left transition-colors hover:bg-gray-50',
        tileSizeClass,
        selected ? 'ring-2 ring-brand-red' : '',
        dropTargetClass(isDropActive, 'folder'),
        canWrite && draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
    >
      {canSelect ? (
        <div
          className="absolute left-2 top-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <AppCheckboxControl
            checked={selected}
            aria-label={`Select folder ${folder.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(e.shiftKey);
            }}
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 py-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <Folder className="h-7 w-7" aria-hidden />
        </div>
        <div className="w-full text-center">
          <div className="truncate text-xs font-semibold text-gray-900">{folder.name}</div>
          {typeof folder.fileCount === 'number' ? (
            <div className="text-[10px] text-gray-500">({folder.fileCount})</div>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function FileParentGridTile({
  tileSizeClass = 'h-36',
  onNavigate,
}: {
  tileSizeClass?: string;
  onNavigate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      className={uiCx(
        'flex flex-col items-center justify-center gap-2 rounded-lg border bg-gray-50 px-2 py-3 text-left transition-colors hover:bg-gray-100',
        tileSizeClass,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-200 text-gray-600 text-lg font-semibold">
        ..
      </div>
      <div className="truncate text-xs font-semibold text-gray-700">Up one level</div>
    </button>
  );
}
