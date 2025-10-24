import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import ConfirmDialog from '@/components/ConfirmDialog';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

type ConfirmContextValue = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(){
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx.confirm;
}

export default function ConfirmProvider({ children }:{ children: any }){
  const [state, setState] = useState<{ open:boolean, opts: ConfirmOptions, resolver?: (v:boolean)=>void }>({ open:false, opts:{ message:'' } });

  const open = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, opts, resolver: resolve });
    });
  }, []);

  const onClose = (value: boolean)=>{
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
        onConfirm={()=> onClose(true)}
        onCancel={()=> onClose(false)}
      />
    </ConfirmContext.Provider>
  );
}


