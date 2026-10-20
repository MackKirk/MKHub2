import { useState, type ReactNode } from 'react';
import { uiBorders, uiCx, uiRadius } from '@/components/ui';
import type { TutorialMedia } from './types';

type TutorialMediaBlockProps = {
  media: TutorialMedia;
};

/** Lazy image that hides itself if the asset is missing or fails to load. */
export function TutorialMediaBlock({ media }: TutorialMediaBlockProps) {
  const [failed, setFailed] = useState(false);
  if (failed || media.type !== 'image') return null;

  return (
    <div className={uiCx('overflow-hidden bg-gray-50', uiRadius.card, uiBorders.subtle)}>
      <img
        src={media.src}
        alt={media.alt}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full object-cover object-top"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

type TutorialSectionBodyProps = {
  children: ReactNode;
  className?: string;
};

export function TutorialSectionBody({ children, className }: TutorialSectionBodyProps) {
  return (
    <div
      className={uiCx(
        'space-y-2.5 text-[15px] leading-relaxed text-gray-700',
        '[&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
