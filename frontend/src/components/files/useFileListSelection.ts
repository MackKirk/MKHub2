import { useCallback, useMemo, useRef, useState } from 'react';

export function useFileListSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastClickedIdRef = useRef<string | null>(null);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClickedIdRef.current = id;
  }, []);

  const toggleRange = useCallback((id: string, orderedIds: string[]) => {
    const anchor = lastClickedIdRef.current;
    if (!anchor || !orderedIds.includes(anchor)) {
      toggle(id);
      return;
    }
    const start = orderedIds.indexOf(anchor);
    const end = orderedIds.indexOf(id);
    if (start < 0 || end < 0) {
      toggle(id);
      return;
    }
    const [lo, hi] = start < end ? [start, end] : [end, start];
    const rangeIds = orderedIds.slice(lo, hi + 1);
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const rid of rangeIds) next.add(rid);
      return next;
    });
    lastClickedIdRef.current = id;
  }, [toggle]);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }, []);

  const selectedCount = selectedIds.size;

  const getSelectionState = useCallback(
    (visibleIds: string[]) => {
      if (visibleIds.length === 0) {
        return { allSelected: false, someSelected: false };
      }
      let count = 0;
      for (const id of visibleIds) {
        if (selectedIds.has(id)) count += 1;
      }
      return {
        allSelected: count === visibleIds.length,
        someSelected: count > 0 && count < visibleIds.length,
      };
    },
    [selectedIds],
  );

  const resolveDragIds = useCallback(
    (fileId: string): string[] => {
      if (selectedIds.has(fileId) && selectedIds.size > 0) {
        return [...selectedIds];
      }
      return [fileId];
    },
    [selectedIds],
  );

  return useMemo(
    () => ({
      selectedIds,
      selectedCount,
      isSelected,
      toggle,
      toggleRange,
      selectAll,
      clear,
      getSelectionState,
      resolveDragIds,
    }),
    [selectedIds, selectedCount, isSelected, toggle, toggleRange, selectAll, clear, getSelectionState, resolveDragIds],
  );
}

export type FileListSelection = ReturnType<typeof useFileListSelection>;
