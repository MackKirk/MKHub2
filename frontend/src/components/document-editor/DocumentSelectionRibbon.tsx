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
  if (el.type === 'initials') return 'Initials';
  if (el.type === 'date') return 'Date';
  return el.content ? 'Image' : 'Image area';
}

/** Compact single-line selection strip under the main ribbon. */
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

  const canDelete = multi
    ? selectedEls.filter((e) => !e.locked).length > 0
    : !!element && !isLocked;

  return (
    <div className={editorContextToolbarRowClass}>
      <div className={editorContextToolbarGroupClass}>
        <span className="whitespace-nowrap rounded bg-slate-200/70 px-1.5 py-0.5 text-[11px] font-semibold text-slate-800">
          {selectionKindLabel}
        </span>
      </div>

      {multi ? (
        <div className={editorContextToolbarGroupClass}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, locked: true })))}
            disabled={allLocked}
            className={allLocked ? selectionToolButtonGhostDisabledClass : selectionIconToolButtonClass}
            title="Lock all"
            aria-label="Lock all"
          >
            <LockIcon locked={true} className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, locked: false })))}
            disabled={!anyLocked}
            className={
              !anyLocked
                ? selectionToolButtonGhostDisabledClass
                : `${selectionIconToolButtonClass} text-amber-900 hover:bg-amber-100/80`
            }
            title="Unlock all"
            aria-label="Unlock all"
          >
            <LockIcon locked={false} className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, lockPosition: true })))}
            disabled={allPositionLocked}
            className={allPositionLocked ? selectionToolButtonGhostDisabledClass : selectionIconToolButtonClass}
            title="Block move (still editable)"
            aria-label="Block move all"
          >
            <PinIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => selectedEls.forEach((el) => onUpdate(el.id, (e) => ({ ...e, lockPosition: false })))}
            disabled={!anyPositionLocked}
            className={!anyPositionLocked ? selectionToolButtonGhostDisabledClass : selectionIconToolButtonClass}
            title="Allow move"
            aria-label="Allow move all"
          >
            <PinIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className={editorContextToolbarGroupClass}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => element && onUpdate(id, (el) => ({ ...el, locked: !el.locked }))}
            disabled={!element}
            title={isLocked ? 'Unlock (allow move, resize, edit)' : 'Lock (block move, resize, edit)'}
            aria-label={isLocked ? 'Unlock' : 'Lock'}
            className={`${selectionIconToolButtonClass} ${
              !element
                ? 'cursor-not-allowed opacity-80'
                : isLocked
                  ? 'text-amber-950 hover:bg-amber-100'
                  : ''
            }`}
          >
            <LockIcon locked={isLocked} className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => element && onUpdate(id, (el) => ({ ...el, lockPosition: !el.lockPosition }))}
            disabled={!element}
            title={isPositionLocked ? 'Allow move' : 'Block move (still edit text/image)'}
            aria-label={isPositionLocked ? 'Allow move' : 'Block move'}
            className={`${selectionIconToolButtonClass} ${
              !element
                ? 'cursor-not-allowed opacity-80'
                : isPositionLocked
                  ? 'bg-sky-100 text-sky-950 hover:bg-sky-100'
                  : ''
            }`}
          >
            <PinIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {multi && onAlignSelected ? (
        <div className={editorContextToolbarGroupClass}>
          <span className={`${editorToolbarMicroLabelClass} mr-0.5 leading-none`}>H</span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('left')} className={selectionIconToolButtonClass} title="Align left">
            <AlignLeftIcon className="h-3.5 w-3.5 shrink-0 text-slate-800" />
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('centerH')} className={selectionIconToolButtonClass} title="Align center">
            <AlignCenterIcon className="h-3.5 w-3.5 shrink-0 text-slate-800" />
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('right')} className={selectionIconToolButtonClass} title="Align right">
            <AlignRightIcon className="h-3.5 w-3.5 shrink-0 text-slate-800" />
          </button>
          <span className={`${editorToolbarMicroLabelClass} ml-1 mr-0.5 leading-none`}>V</span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('top')} className={selectionIconToolButtonClass} title="Align top">
            <AlignTopIcon className="h-3.5 w-3.5 shrink-0 text-slate-800" />
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('centerV')} className={selectionIconToolButtonClass} title="Align middle">
            <AlignMiddleIcon className="h-3.5 w-3.5 shrink-0 text-slate-800" />
          </button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onAlignSelected('bottom')} className={selectionIconToolButtonClass} title="Align bottom">
            <AlignBottomIcon className="h-3.5 w-3.5 shrink-0 text-slate-800" />
          </button>
        </div>
      ) : null}

      {element && isImage && (onReplaceImage || onReplaceImageClick) ? (
        <div className={editorContextToolbarGroupClass}>
          {!onReplaceImageClick ? (
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSelectFile} />
          ) : null}
          {hasImage && onReplaceImageClick ? (
            <>
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
                Edit
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (isLocked) return;
                  onReplaceImageClick(id);
                }}
                disabled={isLocked}
                className={isLocked ? selectionToolButtonGhostDisabledClass : selectionToolButtonGhostClass}
              >
                Replace
              </button>
            </>
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (isLocked) return;
                if (onReplaceImageClick) onReplaceImageClick(id);
                else fileInputRef.current?.click();
              }}
              disabled={isLocked}
              className={isLocked ? selectionToolButtonGhostDisabledClass : selectionToolButtonGhostClass}
            >
              {hasImage ? 'Replace' : 'Add image'}
            </button>
          )}
        </div>
      ) : null}

      <div className={editorContextToolbarGroupClass}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDeselect}
          disabled={!element && !multi}
          className={element || multi ? selectionToolButtonGhostClass : selectionToolButtonGhostDisabledClass}
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
          disabled={!canDelete}
          title={isLocked ? 'Unlock the element first to delete' : multi ? 'Delete selected' : 'Delete'}
          className={
            canDelete
              ? `${selectionToolButtonBaseClass} border border-transparent text-red-800 hover:bg-red-50/90`
              : selectionToolButtonGhostDisabledClass
          }
        >
          Delete
        </button>
      </div>

      {!multi && isLocked ? (
        <div className={editorContextToolbarGroupClass}>
          <span className={`${editorCaptionClass} text-[11px] font-semibold text-amber-800`}>Locked</span>
        </div>
      ) : null}
      {multi ? (
        <div className={editorContextToolbarGroupClass}>
          <span className={`${editorCaptionClass} text-[11px]`}>Drag · arrows · Delete</span>
        </div>
      ) : null}
    </div>
  );
}
