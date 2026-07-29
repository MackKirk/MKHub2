import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type DocumentSaveStatus =
  | 'hydrating'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'all_saved'
  | 'save_failed';

export type DocumentAutoSaveSnapshot = {
  title: string;
  pages: unknown[];
};

type UseDocumentAutoSaveOptions<T extends DocumentAutoSaveSnapshot> = {
  documentId: string | undefined;
  readOnly: boolean;
  isHydrated: boolean;
  getSnapshot: () => T;
  save: (snapshot: T) => Promise<void>;
  debounceMs?: number;
  periodicMs?: number;
  minSaveIntervalMs?: number;
  savedDisplayMs?: number;
  retryDelayMs?: number;
};

function serializeSnapshot(snapshot: DocumentAutoSaveSnapshot): string {
  return JSON.stringify({ title: snapshot.title, pages: snapshot.pages });
}

export function useDocumentAutoSave<T extends DocumentAutoSaveSnapshot>({
  documentId,
  readOnly,
  isHydrated,
  getSnapshot,
  save,
  debounceMs = 1500,
  periodicMs = 30000,
  minSaveIntervalMs = 3000,
  savedDisplayMs = 2000,
  retryDelayMs = 5000,
}: UseDocumentAutoSaveOptions<T>) {
  const enabled = !!documentId && !readOnly && isHydrated;

  const lastSavedRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastSaveAtRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedDisplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getSnapshotRef = useRef(getSnapshot);
  const saveRef = useRef(save);

  const [saveStatus, setSaveStatus] = useState<DocumentSaveStatus>('hydrating');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    getSnapshotRef.current = getSnapshot;
  }, [getSnapshot]);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const bumpRevision = useCallback(() => setRevision((n) => n + 1), []);

  const isDirty = useMemo(() => {
    if (!enabled) return false;
    const current = serializeSnapshot(getSnapshot());
    if (lastSavedRef.current === null) return false;
    return current !== lastSavedRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision drives re-check after edits
  }, [enabled, revision, getSnapshot]);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearSavedDisplayTimer = useCallback(() => {
    if (savedDisplayTimerRef.current) {
      clearTimeout(savedDisplayTimerRef.current);
      savedDisplayTimerRef.current = null;
    }
  }, []);

  const scheduleSavedDisplay = useCallback(() => {
    clearSavedDisplayTimer();
    setSaveStatus('saved');
    savedDisplayTimerRef.current = setTimeout(() => {
      savedDisplayTimerRef.current = null;
      const current = serializeSnapshot(getSnapshotRef.current());
      if (lastSavedRef.current !== null && current === lastSavedRef.current) {
        setSaveStatus('all_saved');
      }
    }, savedDisplayMs);
  }, [clearSavedDisplayTimer, savedDisplayMs]);

  const performSave = useCallback(
    async (options?: { force?: boolean; silent?: boolean }): Promise<boolean> => {
      if (!enabled) return true;

      const snapshot = getSnapshotRef.current();
      const serialized = serializeSnapshot(snapshot);
      if (lastSavedRef.current !== null && serialized === lastSavedRef.current) {
        setSaveStatus((prev) =>
          prev === 'dirty' || prev === 'save_failed' ? 'all_saved' : prev,
        );
        return true;
      }

      if (isSavingRef.current && saveInFlightRef.current) {
        const ok = await saveInFlightRef.current;
        const after = serializeSnapshot(getSnapshotRef.current());
        if (after === lastSavedRef.current) return ok;
        if (!ok) return false;
      }

      const now = Date.now();
      if (!options?.force && now - lastSaveAtRef.current < minSaveIntervalMs) {
        return true;
      }

      if (isSavingRef.current && saveInFlightRef.current) {
        return saveInFlightRef.current;
      }

      isSavingRef.current = true;
      setSaveStatus('saving');

      const flight = (async () => {
        try {
          await saveRef.current(snapshot);
          const savedSerialized = serializeSnapshot(snapshot);
          lastSavedRef.current = savedSerialized;
          lastSaveAtRef.current = Date.now();

          const currentAfter = serializeSnapshot(getSnapshotRef.current());
          if (currentAfter !== savedSerialized) {
            setSaveStatus('dirty');
            bumpRevision();
            return true;
          }

          scheduleSavedDisplay();
          if (retryTimerRef.current) {
            clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          return true;
        } catch {
          setSaveStatus('save_failed');
          if (!retryTimerRef.current) {
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null;
              void performSave({ force: true, silent: true });
            }, retryDelayMs);
          }
          return false;
        } finally {
          isSavingRef.current = false;
          saveInFlightRef.current = null;
        }
      })();

      saveInFlightRef.current = flight;
      return flight;
    },
    [enabled, minSaveIntervalMs, retryDelayMs, scheduleSavedDisplay, bumpRevision],
  );

  const flushSave = useCallback(async (): Promise<boolean> => {
    clearDebounce();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    return performSave({ force: true });
  }, [clearDebounce, performSave]);

  const hydrateBaseline = useCallback(
    (snapshot: T) => {
      lastSavedRef.current = serializeSnapshot(snapshot);
      clearDebounce();
      clearSavedDisplayTimer();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setSaveStatus('all_saved');
      bumpRevision();
    },
    [clearDebounce, clearSavedDisplayTimer, bumpRevision],
  );

  const notifyEdited = useCallback(() => {
    bumpRevision();
  }, [bumpRevision]);

  // Reflect hydration / dirty state in saveStatus
  useEffect(() => {
    if (!documentId || readOnly) {
      setSaveStatus('all_saved');
      return;
    }
    if (!isHydrated) {
      setSaveStatus('hydrating');
      return;
    }
    if (isDirty) {
      clearSavedDisplayTimer();
      if (saveStatus !== 'saving' && saveStatus !== 'save_failed') {
        setSaveStatus('dirty');
      }
    }
  }, [documentId, readOnly, isHydrated, isDirty, saveStatus, clearSavedDisplayTimer]);

  // Debounced save on edits
  useEffect(() => {
    if (!enabled || !isDirty) return;
    clearDebounce();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void performSave();
    }, debounceMs);
    return clearDebounce;
  }, [enabled, isDirty, debounceMs, performSave, clearDebounce, revision]);

  // Periodic save
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      if (isDirty) void performSave();
    }, periodicMs);
    return () => clearInterval(interval);
  }, [enabled, isDirty, periodicMs, performSave]);

  // Flush when browser tab is hidden
  useEffect(() => {
    if (!enabled) return;
    const onVisibilityChange = () => {
      if (document.hidden && isDirty) {
        void performSave({ force: true, silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [enabled, isDirty, performSave]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearDebounce();
      clearSavedDisplayTimer();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [clearDebounce, clearSavedDisplayTimer]);

  const hasUnsavedChanges = isDirty || saveStatus === 'save_failed';

  return {
    saveStatus: !documentId || readOnly ? ('all_saved' as const) : saveStatus,
    hasUnsavedChanges: enabled ? hasUnsavedChanges : false,
    isSaving: saveStatus === 'saving',
    flushSave,
    hydrateBaseline,
    notifyEdited,
    lastSavedRef,
  };
}
