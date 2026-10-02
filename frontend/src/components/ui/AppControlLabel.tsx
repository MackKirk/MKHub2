import type { ReactNode } from 'react';
import { uiTypography, uiCx } from './tokens';

const REQUIRED_SUFFIX = /\s*\*$/;

/** Field names are sentence case at label size — not the uppercase overline. */
const FIELD_LABEL_CLASS = uiTypography.controlLabel;

/** Parses trailing `*` on string labels and renders it in brand red. */
export function AppControlLabel({ label }: { label: ReactNode }) {
  if (typeof label !== 'string') {
    return <span className={FIELD_LABEL_CLASS}>{label}</span>;
  }

  const required = REQUIRED_SUFFIX.test(label);
  const text = label.replace(REQUIRED_SUFFIX, '').trim();

  return (
    <span className={FIELD_LABEL_CLASS}>
      {text}
      {required ? <span className="text-brand-red"> *</span> : null}
    </span>
  );
}

export function AppControlLabelRow({
  label,
  fieldHint,
}: {
  label: ReactNode;
  fieldHint?: ReactNode;
}) {
  return (
    <span className={uiCx('flex items-center gap-1')}>
      <AppControlLabel label={label} />
      {fieldHint}
    </span>
  );
}
