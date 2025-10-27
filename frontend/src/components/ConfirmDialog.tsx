import { useEffect } from 'react';

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: ()=>void;
  onCancel: ()=>void;
};

export default function ConfirmDialog({ open, title='Confirm', message, confirmText='Confirm', cancelText='Cancel', onConfirm, onCancel }: Props){
  useEffect(()=>{
    const onKey=(e: KeyboardEvent)=>{ if(!open) return; if(e.key==='Escape'){ onCancel(); } if(e.key==='Enter'){ onConfirm(); } };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [open, onCancel, onConfirm]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] max-w-[95vw] bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold">{title}</div>
        <div className="p-4 text-sm text-gray-800 whitespace-pre-wrap">{message}</div>
        <div className="p-3 flex items-center justify-end gap-2 border-t">
          <button className="px-3 py-2 rounded bg-gray-100" onClick={onCancel}>{cancelText}</button>
          <button className="px-3 py-2 rounded bg-brand-red text-white" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}



