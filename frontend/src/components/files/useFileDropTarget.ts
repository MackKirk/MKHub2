import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { FileDropTarget, FileDropTargetKind } from './fileListDnD';

type DropHandler = (e: DragEvent) => void | Promise<void>;

const DROP_TARGET_PRIORITY: Record<FileDropTargetKind, number> = {
  category: 1,
  root: 2,
  folder: 3,
};

function dropTargetKey(kind: FileDropTargetKind, id: string) {
  return `${kind}:${id}`;
}

function isSameDropTarget(a: FileDropTarget | null, b: FileDropTarget | null) {
  return a?.kind === b?.kind && a?.id === b?.id && a?.label === b?.label;
}

/** Prevents parent dragLeave from clearing the target when the pointer enters a child. */
export function leaveContainerDragLeave(
  e: DragEvent,
  onLeave: () => void,
) {
  const related = e.relatedTarget as Node | null;
  if (related && e.currentTarget.contains(related)) return;
  onLeave();
}

export function useFileDropTarget() {
  const [dropTarget, setDropTarget] = useState<FileDropTarget | null>(null);
  const depthByTarget = useRef<Map<string, number>>(new Map());

  const clearDropTarget = useCallback(() => {
    depthByTarget.current.clear();
    setDropTarget(null);
  }, []);

  const setDropTargetIfNeeded = useCallback((next: FileDropTarget) => {
    setDropTarget((prev) => {
      if (isSameDropTarget(prev, next)) return prev;
      if (prev && DROP_TARGET_PRIORITY[prev.kind] > DROP_TARGET_PRIORITY[next.kind]) {
        return prev;
      }
      return next;
    });
  }, []);

  const makeDropHandlers = useCallback(
    (
      kind: FileDropTargetKind,
      id: string,
      label: string,
      onDrop: DropHandler,
      options?: { enabled?: boolean },
    ) => {
      const enabled = options?.enabled !== false;
      if (!enabled) {
        return {};
      }

      const key = dropTargetKey(kind, id);

      return {
        onDragOver: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          setDropTargetIfNeeded({ kind, id, label });
        },
        onDragEnter: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const depth = depthByTarget.current.get(key) ?? 0;
          depthByTarget.current.set(key, depth + 1);
          setDropTargetIfNeeded({ kind, id, label });
        },
        onDragLeave: (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const related = e.relatedTarget as Node | null;
          if (related && e.currentTarget.contains(related)) return;

          const depth = Math.max(0, (depthByTarget.current.get(key) ?? 0) - 1);
          if (depth === 0) depthByTarget.current.delete(key);
          else depthByTarget.current.set(key, depth);

          if (depth === 0) {
            setDropTarget((prev) =>
              prev?.kind === kind && prev?.id === id ? null : prev,
            );
          }
        },
        onDrop: async (e: DragEvent) => {
          e.preventDefault();
          e.stopPropagation();
          clearDropTarget();
          await onDrop(e);
        },
      };
    },
    [clearDropTarget, setDropTargetIfNeeded],
  );

  const isDropActive = useCallback(
    (kind: FileDropTargetKind, id: string) =>
      dropTarget?.kind === kind && dropTarget?.id === id,
    [dropTarget],
  );

  return {
    dropTarget,
    setDropTarget: setDropTargetIfNeeded,
    clearDropTarget,
    makeDropHandlers,
    isDropActive,
  };
}
