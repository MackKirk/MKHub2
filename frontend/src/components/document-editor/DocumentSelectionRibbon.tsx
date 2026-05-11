import { useRef } from 'react';
import { useConfirm } from '@/components/ConfirmProvider';
import type { DocElement } from '@/types/documentCreator';
import {
  AlignBottomIcon,
  AlignCenterIcon,
  AlignLeftIcon,
  AlignMiddleIcon,
  AlignRightIcon,
  AlignTopIcon,
  LockIcon,
  PinIcon,
} from '@/components/document-editor/documentEditorIcons';
import {
  editorCaptionClass,
  editorContextToolbarGroupClass,
  editorContextToolbarRowClass,
  editorToolbarMicroLabelClass,
  selectionIconToolButtonClass,
  selectionToolButtonBaseClass,
  selectionToolButtonGhostClass,
  selectionToolButtonGhostDisabledClass,
} from '@/components/document-editor/documentEditorRibbonPrimitives';

export type AlignKind = 'left' | 'right' | 'centerH' | 'top' | 'bottom' | 'centerV';

function elementTypeLabel(el: DocElement): string {
  if (el.type === 'text') return 'Text';
  if (el.type === 'block') return 'Blocked Area';
  return el.content ? 'Image' : 'Image area';
}

/** Compact selection strip (layout: render inside ribbon below main toolbar, or standalone with a wrapper). */
export default function DocumentSelectionRibbon({
  selectedElementIds,
  elements,
  element,
  onUpdate,
  onRemove,
  onDeselect,
  onReplaceImage,
  onReplaceImageClick,
  onEditImageClick,
  onAlignSelected,
}: {
  selectedElementIds: string[];
  elements: DocElement[];
  element: DocElement | null;
  onUpdate: (id: string, updater: (el: DocElement) => DocElement) => void;
  onRemove: (id: string) => void;
  onDeselect: () => void;
  onReplaceImage?: (elementId: string, file: File) => Promise<void>;
  onReplaceImageClick?: (elementId: string) => void;
  onEditImageClick?: (elementId: string) => void;
  onAlignSelected?: (alignment: AlignKind) => void;
}) {
  const confirm = useConfirm();
  const id = element?.id ?? '';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isImage = element?.type === 'image';
  const hasImage = !!element && isImage && !!element.content;
  const isLocked = !!element?.locked;
  const isPositionLocked = !!element?.lockPosition;
  const multi = selectedElementIds.length > 1;
  const selectedEls = elements.filter((e) => selectedElementIds.includes(e.id));
  const allLocked = multi && selectedEls.every((e) => e.locked);
  const anyLocked = multi && selectedEls.some((e) => e.locked);
  const allPositionLocked = multi && selectedEls.every((e) => e.lockPosition);
  const anyPositionLocked = multi && selectedEls.some((e) => e.lockPosition);

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!element || !file || !file.type.startsWith('image/') || !onReplaceImage) return;
    await onReplaceImage(id, file);
  };

  if (selectedElementIds.length === 0) return null;

  const selectionKindLabel = multi
    ? `${selectedElementIds.length} selected`
    : element
      ? elementTypeLabel(element)
      : selectedEls[0]
        ? elementTypeLabel(selectedEls[0])
        : 'Selected';

  return (
    <div className={editorContextToolbarRowClass}>
      <div className={editorContextToolbarGroupClass}>
        <span className="whitespace-nowrap rounded-md bg-slate-200/70 px-2 py-1 text-[11px] font-semibold text-slate-800">
          {selectionKindLabel}
        </span>
      </div>

      <div className={`${editorContextToolbarGroupClass} gap-1.5`}>
        {multi ? (
          <>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, locked: true })))}
              disabled={allLocked}
              className={
                allLocked
                  ? selectionToolButtonGhostDisabledClass
                  : `${selectionToolButtonGhostClass} flex items-center gap-1`
              }
              title="Lock all"
            >
              <LockIcon locked={true} className="w-3 h-3" />
              Lock all
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, locked: false })))}
              disabled={!anyLocked}
              className={
                !anyLocked
                  ? selectionToolButtonGhostDisabledClass
                  : `${selectionToolButtonGhostClass} flex items-center gap-1 text-amber-900 hover:bg-amber-100/80`
              }
              title="Unlock all"
            >
              <LockIcon locked={false} className="w-3 h-3" />
              Unlock all
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, lockPosition: true })))}
              disabled={allPositionLocked}
              className={
                allPositionLocked
                  ? selectionToolButtonGhostDisabledClass
                  : `${selectionToolButtonGhostClass} flex items-center gap-1`
              }
              title="Block move (still editable)"
            >
              <PinIcon className="w-3 h-3" />
              Block move
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, lockPosition: false })))}
              disabled={!anyPositionLocked}
              className={
                !anyPositionLocked
                  ? selectionToolButtonGhostDisabledClass
                  : `${selectionToolButtonGhostClass} flex items-center gap-1`
              }
              title="Allow move"
            >
              <PinIcon className="w-3 h-3" />
              Allow move
            </button>
          </>
        ) : null}

        {!multi ? (
          <>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => element && onUpdate(id, (el) => ({ ...el, locked: !el.locked }))}
              disabled={!element}
              title={isLocked ? 'Unlock (allow move, resize, edit)' : 'Lock (block move, resize, edit)'}
              className={`${selectionToolButtonBaseClass} flex items-center gap-1 border border-transparent ${
                !element
                  ? 'cursor-not-allowed text-slate-500 opacity-80'
                  : isLocked
                    ? 'text-amber-950 hover:bg-amber-100'
                    : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              <LockIcon locked={isLocked} className="w-3 h-3" />
              {isLocked ? 'Unlock' : 'Lock'}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => element && onUpdate(id, (el) => ({ ...el, lockPosition: !el.lockPosition }))}
              disabled={!element}
              className={`${selectionToolButtonBaseClass} flex items-center gap-1 ${
                !element
                  ? 'cursor-not-allowed border-transparent text-slate-500 opacity-80'
                  : isPositionLocked
                    ? 'border border-sky-400/50 bg-sky-100 text-sky-950 hover:bg-sky-100'
                    : 'border-transparent text-slate-800 hover:bg-slate-100'
              }`}
              title={isPositionLocked ? 'Allow move' : 'Block move (still edit text/image)'}
            >
              <PinIcon className="w-3 h-3" />
              {isPositionLocked ? 'Allow move' : 'Block move'}
            </button>
          </>
        ) : null}

        {multi && onAlignSelected && (
          <div className="flex flex-shrink-0 items-center gap-1 pl-1">
            <span className={`${editorToolbarMicroLabelClass} mr-0.5 leading-none`}>Align</span>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('left')} className={selectionIconToolButtonClass} title="Align left">
              <AlignLeftIcon className="h-4 w-4 shrink-0 text-slate-800" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('centerH')} className={selectionIconToolButtonClass} title="Align center">
              <AlignCenterIcon className="h-4 w-4 shrink-0 text-slate-800" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('right')} className={selectionIconToolButtonClass} title="Align right">
              <AlignRightIcon className="h-4 w-4 shrink-0 text-slate-800" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('top')} className={selectionIconToolButtonClass} title="Align top">
              <AlignTopIcon className="h-4 w-4 shrink-0 text-slate-800" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('centerV')} className={selectionIconToolButtonClass} title="Align middle">
              <AlignMiddleIcon className="h-4 w-4 shrink-0 text-slate-800" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('bottom')} className={selectionIconToolButtonClass} title="Align bottom">
              <AlignBottomIcon className="h-4 w-4 shrink-0 text-slate-800" />
            </button>
          </div>
        )}
      </div>

      {element && isImage && (onReplaceImage || onReplaceImageClick) && (
        <div className={editorContextToolbarGroupClass}>
          {!onReplaceImageClick && (
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSelectFile} />
          )}
          {hasImage && onReplaceImageClick && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (isLocked) return;
                if (onEditImageClick) onEditImageClick(id);
                else onReplaceImageClick(id);
              }}
              disabled={isLocked}
              className={isLocked ? selectionToolButtonGhostDisabledClass : selectionToolButtonGhostClass}
            >
              Edit image
            </button>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (isLocked) return;
              if (onReplaceImageClick) {
                onReplaceImageClick(id);
              } else {
                fileInputRef.current?.click();
              }
            }}
            disabled={isLocked}
            className={isLocked ? selectionToolButtonGhostDisabledClass : selectionToolButtonGhostClass}
          >
            {hasImage ? 'Replace image' : 'Add image'}
          </button>
        </div>
      )}

      <div className={`${editorContextToolbarGroupClass} gap-1.5`}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDeselect}
          disabled={!element && !multi}
          className={
            element || multi ? selectionToolButtonGhostClass : selectionToolButtonGhostDisabledClass
          }
        >
          Done
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={async () => {
            if (multi) {
              const toRemove = selectedEls.filter((e) => !e.locked);
              const n = toRemove.length;
              if (n === 0) return;
              const choice = await confirm({
                title: 'Delete selected',
                message:
                  n === 1
                    ? 'Remove this element from the page? This cannot be undone.'
                    : `Remove ${n} selected elements from the page? This cannot be undone.`,
                confirmText: 'Delete',
              });
              if (choice !== 'confirm') return;
              toRemove.forEach((e) => onRemove(e.id));
              return;
            }
            if (!element) return;
            const choice = await confirm({
              title: 'Delete element',
              message: 'Remove this element from the page? This cannot be undone.',
              confirmText: 'Delete',
            });
            if (choice !== 'confirm') return;
            onRemove(id);
          }}
          disabled={multi ? selectedEls.filter((e) => !e.locked).length === 0 : !element || isLocked}
          title={isLocked ? 'Unlock the element first to delete' : multi ? 'Delete selected' : 'Delete'}
          className={
            (multi && selectedEls.filter((e) => !e.locked).length > 0) || (!multi && element && !isLocked)
              ? `${selectionToolButtonBaseClass} border border-transparent text-red-800 hover:bg-red-50/90`
              : selectionToolButtonGhostDisabledClass
          }
        >
          Delete
        </button>
      </div>

      {!multi && isLocked && (
        <div className={editorContextToolbarGroupClass}>
          <span className={`${editorCaptionClass} font-medium text-amber-800`}>
            Locked — unlock to move, resize or edit
          </span>
        </div>
      )}
      {multi && (
        <div className={editorContextToolbarGroupClass}>
          <span className={editorCaptionClass}>Drag to move all. Arrow keys or Delete.</span>
        </div>
      )}
    </div>
  );
}
