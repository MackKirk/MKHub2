import type { ReactNode } from 'react';

/** Emphasize a visible UI label inside tutorial copy. */
export function uiLabel(children: ReactNode) {
  return <span className="font-semibold text-gray-800">{children}</span>;
}
