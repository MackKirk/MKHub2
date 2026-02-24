import React from 'react';
import { getDivisionIconUrl, getDivisionIconFallback } from '@/lib/divisionIcons';

type DivisionIconProps = {
  label: string;
  className?: string;
  /** Size in pixels for the image (width and height). Default 24. */
  size?: number;
  title?: string;
  /** When true, do not set the native title attribute (use when parent shows a custom tooltip). */
  suppressNativeTitle?: boolean;
};

/**
 * Renders the division icon as an image when available, otherwise as fallback emoji.
 * Use wherever division icons are shown (cards, dropdowns, tooltips, etc.).
 */
export function DivisionIcon({ label, className = '', size = 24, title, suppressNativeTitle }: DivisionIconProps): React.ReactElement {
  const src = getDivisionIconUrl(label);
  const fallback = getDivisionIconFallback(label);
  const nativeTitle = suppressNativeTitle ? undefined : (title ?? label);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`object-contain flex-shrink-0 ${className}`}
        {...(nativeTitle !== undefined ? { title: nativeTitle } : {})}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      {...(nativeTitle !== undefined ? { title: nativeTitle } : {})}
    >
      {fallback}
    </span>
  );
}
