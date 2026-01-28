import { useEffect } from 'react';

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  showDiscard?: boolean;
  discardText?: string;
  onConfirm: ()=>void;
  onCancel: ()=>void;
  onDiscard?: ()=>void;
};

export default function ConfirmDialog({ open, title='Confirm', message, confirmText='Confirm', cancelText='Cancel', showDiscard=false, discardText='Discard', onConfirm, onCancel, onDiscard }: Props){
  useEffect(()=>{
    const onKey=(e: KeyboardEvent)=>{ if(!open) return; if(e.key==='Escape'){ onCancel(); } if(e.key==='Enter'){ onConfirm(); } };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[480px] max-w-[95vw] bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-900">{title}</div>
        <div className="p-4 text-xs text-gray-700 whitespace-pre-wrap">{message}</div>
        <div className="p-4 flex items-center justify-end gap-2 border-t border-gray-200">
          <button className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all" onClick={onCancel}>{cancelText}</button>
          {showDiscard && onDiscard && (
            <button className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all" onClick={onDiscard}>{discardText}</button>
          )}
          <button className="rounded-lg px-3 py-2 bg-brand-red text-white text-xs font-medium hover:opacity-90 transition-all" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}



