import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';

type UnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  getHasUnsavedChanges: () => boolean;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider');
  return ctx;
}

export default function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [hasUnsavedChanges, setHasUnsavedChangesState] = useState(false);
  const latestRef = useRef(false);

  useEffect(() => {
    latestRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  const setHasUnsavedChanges = useCallback((hasChanges: boolean) => {
    latestRef.current = hasChanges;
    setHasUnsavedChangesState(hasChanges);
  }, []);

  const getHasUnsavedChanges = useCallback(() => {
    return latestRef.current;
  }, []);

  const value = {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    getHasUnsavedChanges,
  };

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

