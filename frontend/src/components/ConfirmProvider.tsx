import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  showDiscard?: boolean;
  discardText?: string;
};

type ConfirmContextValue = {
  confirm: (opts: ConfirmOptions) => Promise<'confirm' | 'discard' | 'cancel'>;
};

export const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(){
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}

export default function ConfirmProvider({ children }:{ children: any }){
  const [state, setState] = useState<{ open:boolean, opts: ConfirmOptions, resolver?: (v:'confirm' | 'discard' | 'cancel')=>void }>({ open:false, opts:{ message:'' } });

  const open = useCallback((opts: ConfirmOptions) => {
    return new Promise<'confirm' | 'discard' | 'cancel'>((resolve) => {
      setState({ open: true, opts, resolver: resolve });
    });
  }, []);

  const onClose = (value: 'confirm' | 'discard' | 'cancel')=>{
    try{ state.resolver?.(value); }catch(_e){}
    setState(s=> ({ ...s, open:false, resolver: undefined }));
  };

  const value = useMemo<ConfirmContextValue>(()=> ({ confirm: open }), [open]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.opts.title || 'Confirm'}
        message={state.opts.message}
        confirmText={state.opts.confirmText || 'Confirm'}
        cancelText={state.opts.cancelText || 'Cancel'}
        showDiscard={state.opts.showDiscard}
        discardText={state.opts.discardText || 'Discard'}
        onConfirm={()=> onClose('confirm')}
        onCancel={()=> onClose('cancel')}
        onDiscard={state.opts.showDiscard ? ()=> onClose('discard') : undefined}
      />
    </ConfirmContext.Provider>
  );
}



