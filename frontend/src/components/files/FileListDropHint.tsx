import type { FileDropTarget } from './fileListDnD';

/** Drop hint shown only while dragging over a valid target. */
export function FileListDropHint({ dropTarget }: { dropTarget: FileDropTarget | null }) {
  if (!dropTarget) return null;

  return (
    <div
      className="border-b border-brand-red/20 bg-brand-red/5 px-3 py-1.5 text-xs font-medium text-brand-red"
      aria-live="polite"
    >
      {`Drop into: ${dropTarget.label}`}
    </div>
  );
}
export const FILE_DROP_TARGET_ATTR = 'data-file-drop-target';

export function fileDropTargetProps(kind: 'folder' | 'category' | 'root') {
  return { [FILE_DROP_TARGET_ATTR]: kind };
}

/** Skip root/category highlight when pointer is over a nested drop target row. */
export function isOverNestedFileDropTarget(e: DragEvent) {
  const target = e.target;
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(`[${FILE_DROP_TARGET_ATTR}]`));
}
