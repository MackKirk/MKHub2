import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/** Whether the browser history stack has a prior entry (React Router `idx` when available). */
export function canNavigateBack(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  if (typeof idx === 'number') return idx > 0;
  return window.history.length > 1;
}

/**
 * Returns a handler that goes to the previous history entry, or `fallbackPath` when
 * there is no prior entry (deep link, new tab, refresh).
 */
export function useNavigateBack(fallbackPath: string): () => void {
  const navigate = useNavigate();

  return useCallback(() => {
    if (canNavigateBack()) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  }, [navigate, fallbackPath]);
}
