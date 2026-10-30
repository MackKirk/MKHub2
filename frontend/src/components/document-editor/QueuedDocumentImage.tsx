import { useEffect, useState, type CSSProperties } from 'react';
import { withFileAccessToken } from '@/lib/api';
import { ImageIcon } from '@/components/document-editor/documentEditorIcons';
import { documentImageResult, watchDocumentImage } from '@/lib/documentImageQueue';

type QueuedDocumentImageProps = {
  fileId: string;
  width: number;
  className?: string;
  style?: CSSProperties;
};

/**
 * Gray stand-in until this photo's turn in the document image queue, then the real thumbnail.
 */
export function QueuedDocumentImage({ fileId, width, className, style }: QueuedDocumentImageProps) {
  const url = withFileAccessToken(`/files/${fileId}/thumbnail?w=${width}`);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>(() => {
    const known = documentImageResult(url);
    if (known === 'ok') return 'ready';
    if (known === 'error') return 'error';
    return 'loading';
  });

  useEffect(() => {
    const known = documentImageResult(url);
    if (known) {
      setPhase(known === 'ok' ? 'ready' : 'error');
      return;
    }
    let alive = true;
    const watch = watchDocumentImage(url);
    watch.promise.then((result) => {
      if (!alive) return;
      setPhase(result === 'ok' ? 'ready' : 'error');
    });
    return () => {
      alive = false;
      watch.cancel();
    };
  }, [url]);

  if (phase === 'ready') {
    return <img src={url} alt="" decoding="async" className={className} style={style} />;
  }

  return (
    <div
      className="pointer-events-none flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-200 text-slate-500"
      role="status"
      aria-label={phase === 'error' ? 'Image unavailable' : 'Loading image'}
    >
      <ImageIcon className="h-8 w-8 shrink-0" />
      <span className="px-2 text-center text-[11px] font-semibold leading-tight">
        {phase === 'error' ? 'Image unavailable' : 'Loading image'}
      </span>
    </div>
  );
}
