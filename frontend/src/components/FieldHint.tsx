import { useId, type ReactNode } from 'react';

export type FieldHintProps = {
  hint: ReactNode;
  /** Extra classes on the trigger (e.g. `ml-0.5`). */
  className?: string;
};

/** Double newline → title + body; single newlines → soft line breaks. */
function HintRichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\n+/);
  if (blocks.length >= 2) {
    return (
      <>
        <span className="font-semibold text-slate-900">{blocks[0]}</span>
        <span className="mt-1.5 block whitespace-pre-line text-slate-600">{blocks.slice(1).join('\n\n')}</span>
      </>
    );
  }
  return <span className="whitespace-pre-line text-slate-700">{text}</span>;
}

/**
 * Small contextual help: subtle red dot with “?” and a hover/focus tooltip (not `title`).
 * Pass `hint` as a string (optionally `Title\n\nBody`) or as JSX.
 */
export function FieldHint({ hint, className }: FieldHintProps) {
  const tipId = useId();
  const ariaLabel = typeof hint === 'string' ? hint : 'Help';

  return (
    <span className="group relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        className={
          [
            'inline-flex h-3 w-3 cursor-help items-center justify-center rounded-full p-0',
            'bg-red-100 text-[8px] font-bold leading-[1] text-red-700',
            'shadow-sm ring-1 ring-red-200/90 transition',
            'hover:bg-red-200/70 hover:text-red-800',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 focus-visible:ring-offset-1',
            className,
          ]
            .filter(Boolean)
            .join(' ')
        }
        aria-describedby={tipId}
        aria-label={ariaLabel}
      >
        <span aria-hidden className="block leading-none">
          ?
        </span>
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute left-1/2 top-full z-[70] mt-1.5 w-max max-w-[min(18rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-left shadow-xl ring-1 ring-slate-900/5 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <span className="field-hint-content block text-[11px] leading-snug text-slate-700 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_p+p]:mt-1.5 [&_br]:block">
          {typeof hint === 'string' ? (
            <HintRichText text={hint} />
          ) : (
            hint
          )}
        </span>
      </span>
    </span>
  );
}
