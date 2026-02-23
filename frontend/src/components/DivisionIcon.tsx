import React from 'react';
import { getDivisionIconUrl, getDivisionIconFallback } from '@/lib/divisionIcons';

type DivisionIconProps = {
  label: string;
  className?: string;
  /** Size in pixels for the image (width and height). Default 24. */
  size?: number;
  title?: string;
};

/**
 * Renders the division icon as an image when available, otherwise as fallback emoji.
 * Use wherever division icons are shown (cards, dropdowns, tooltips, etc.).
 */
export function DivisionIcon({ label, className = '', size = 24, title }: DivisionIconProps): React.ReactElement {
  const src = getDivisionIconUrl(label);
  const fallback = getDivisionIconFallback(label);

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`object-contain flex-shrink-0 ${className}`}
        title={title ?? label}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      title={title ?? label}
    >
      {fallback}
    </span>
  );
}
