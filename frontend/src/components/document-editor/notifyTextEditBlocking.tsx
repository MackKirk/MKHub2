import toast from 'react-hot-toast';

export const TEXT_EDIT_BLOCKING_TOAST_ID = 'document-text-edit-blocking';

/** Toast when canvas/toolbar actions are blocked by an open inline text edit. */
export function notifyTextEditBlocking(onFinishEditing: () => void) {
  toast.custom(
    (t) => (
      <div
        className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-lg bg-white px-4 py-3 shadow-lg ring-1 ring-black/5 ${
          t.visible ? 'animate-enter' : 'animate-leave'
        }`}
      >
        <p className="min-w-0 flex-1 text-sm leading-snug text-slate-700">
          Finish editing text to select, move, or resize other elements.
        </p>
        <button
          type="button"
          className="shrink-0 rounded-md bg-brand-red px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-red/90"
          onClick={() => {
            onFinishEditing();
            toast.dismiss(t.id);
          }}
        >
          Finish editing
        </button>
      </div>
    ),
    { id: TEXT_EDIT_BLOCKING_TOAST_ID, duration: 6000 },
  );
}

export function dismissTextEditBlockingToast() {
  toast.dismiss(TEXT_EDIT_BLOCKING_TOAST_ID);
}
