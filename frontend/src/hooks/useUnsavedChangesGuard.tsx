import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';

/**
 * Hook to guard against navigation when there are unsaved changes
 * @param hasUnsavedChanges - Function or value that indicates if there are unsaved changes
 * @param onSave - Optional function to call when user chooses to save before leaving
 * @param onDiscard - Optional function to call when user chooses to discard changes
 */
export function useUnsavedChangesGuard(
  hasUnsavedChanges: boolean | (() => boolean),
  onSave?: () => Promise<void>,
  onDiscard?: () => void | Promise<void>
) {
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const { setHasUnsavedChanges: setGlobalUnsavedChanges } = useUnsavedChanges();
  const hasUnsavedRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const onDiscardRef = useRef(onDiscard);

  // Update refs
  useEffect(() => {
    onSaveRef.current = onSave;
    onDiscardRef.current = onDiscard;
  }, [onSave, onDiscard]);

  // Compute current unsaved state
  const currentHasUnsaved = useMemo(() => {
    return typeof hasUnsavedChanges === 'function' 
      ? hasUnsavedChanges() 
      : hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Update global state
  useEffect(() => {
    hasUnsavedRef.current = currentHasUnsaved;
    setGlobalUnsavedChanges(currentHasUnsaved);
  }, [currentHasUnsaved, setGlobalUnsavedChanges]);

  // Intercept React Router navigation by intercepting link clicks
  useEffect(() => {
    if (!currentHasUnsaved) return;

    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]');
      if (!link) return;
      
      const href = link.getAttribute('href');
      if (!href || 
          href.startsWith('http') || 
          href.startsWith('mailto:') || 
          href.startsWith('tel:') || 
          href.startsWith('#') ||
          link.hasAttribute('download') ||
          link.hasAttribute('target')) {
        return;
      }
      
      if (href === location.pathname || href === window.location.pathname) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        confirmText: 'Save and Leave',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });
      
      if (result === 'confirm') {
        if (onSaveRef.current) {
          await onSaveRef.current();
        }
        navigate(href);
      } else if (result === 'discard') {
        if (onDiscardRef.current) {
          await onDiscardRef.current();
        }
        navigate(href);
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  }, [currentHasUnsaved, location.pathname, navigate, confirm]);

  // Prevent navigation away from page if there are unsaved changes
  useEffect(() => {
    if (!currentHasUnsaved) return;
    
    // Intercept keyboard shortcuts for reload
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.shiftKey && e.key === 'R')) {
        e.preventDefault();
        const result = await confirm({
          title: 'Reload Site?',
          message: 'You have unsaved changes. What would you like to do?',
          confirmText: 'Save and Reload',
          cancelText: 'Cancel',
          showDiscard: true,
          discardText: 'Discard Changes'
        });
        
        if (result === 'confirm') {
          if (onSaveRef.current) {
            await onSaveRef.current();
          }
          window.location.reload();
        } else if (result === 'discard') {
          window.location.reload();
        }
      }
    };

    // Handle beforeunload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return e.returnValue;
    };

    // Intercept browser back button
    const handlePopState = async (e: PopStateEvent) => {
      window.history.pushState(null, '', window.location.href);
      
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        confirmText: 'Save and Leave',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });
      
        if (result === 'confirm') {
          if (onSaveRef.current) {
            await onSaveRef.current();
          }
          window.history.back();
        } else if (result === 'discard') {
          if (onDiscardRef.current) {
            await onDiscardRef.current();
          }
          window.history.back();
        }
    };

    if (currentHasUnsaved) {
      window.history.pushState(null, '', window.location.href);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentHasUnsaved, confirm]);
}

