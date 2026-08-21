import { useMemo } from 'react';
import {
  DOCUMENT_AUTO_FILL_GROUP_LABEL,
  type DocumentAutoFillGroup,
  type DocumentAutoFillTokenValue,
  textToInsertForToken,
} from '@/lib/documentAutoFillTokens';
import { uiCx } from '@/components/ui';

export const DOCUMENT_AUTO_FILL_PICKER_ATTR = 'data-document-auto-fill-picker';

const GROUP_ORDER: DocumentAutoFillGroup[] = ['project', 'employee'];

type Props = {
  tokens: DocumentAutoFillTokenValue[];
  forceToken: boolean;
  onInsert: (text: string) => void;
  onClose?: () => void;
  className?: string;
  description?: string;
  showClose?: boolean;
};

export default function DocumentAutoFillTokenPicker({
  tokens,
  forceToken,
  onInsert,
  onClose,
  className,
  description = 'Click a token to insert it at the cursor. If project data is available, the filled value is inserted instead.',
  showClose = true,
}: Props) {
  const grouped = useMemo(() => {
    const map = new Map<DocumentAutoFillGroup, DocumentAutoFillTokenValue[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const t of tokens) {
      const list = map.get(t.group) ?? [];
      list.push(t);
      map.set(t.group, list);
    }
    return GROUP_ORDER.map((g) => ({ group: g, items: map.get(g) ?? [] })).filter((g) => g.items.length > 0);
  }, [tokens]);

  return (
    <div
      {...{ [DOCUMENT_AUTO_FILL_PICKER_ATTR]: 'true' }}
      data-document-editor-overlay="true"
      className={uiCx(
        'z-[100010] max-h-[min(70vh,28rem)] w-[320px] overflow-y-auto overscroll-contain rounded-xl border border-slate-200/90 bg-white p-2 shadow-2xl ring-1 ring-slate-900/5',
        className,
      )}
      role="dialog"
      aria-label="Auto-fill tokens"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-900">Auto-fill tokens</span>
        {showClose && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        ) : null}
      </div>
      <p className="mb-3 text-[12px] leading-snug text-slate-500">{description}</p>
      {grouped.map(({ group, items }) => (
        <div key={group} className="mb-3 last:mb-0">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {DOCUMENT_AUTO_FILL_GROUP_LABEL[group]}
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-1.5 text-left font-semibold text-slate-700">Token</th>
                <th className="pb-1.5 text-left font-semibold text-slate-700">Filled with</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item) => {
                const preview = forceToken ? item.label : item.value.trim() || item.label;
                return (
                  <tr key={item.token}>
                    <td className="py-0.5 pr-2">
                      <button
                        type="button"
                        className="w-full rounded px-0 py-1 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35"
                        title={forceToken || !item.value.trim() ? `Insert ${item.token}` : `Insert “${item.value.trim()}”`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onInsert(textToInsertForToken(item.token, item.value, forceToken))}
                      >
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                          {item.token}
                        </code>
                      </button>
                    </td>
                    <td className="py-1.5 text-slate-600">
                      <span className="line-clamp-2" title={preview}>
                        {preview}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
