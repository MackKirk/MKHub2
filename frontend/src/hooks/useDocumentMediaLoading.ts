import { useEffect, useState } from 'react';
import { isDocumentImagePending, subscribeDocumentImageLoads } from '@/lib/documentImageQueue';

/**
 * True while any of the given image URLs have not finished loading through the document queue.
 * The canvas image component starts the loads; this only reflects that queue.
 */
export function useDocumentMediaLoading(urls: readonly string[]): boolean {
  const [, setVersion] = useState(0);

  useEffect(() => subscribeDocumentImageLoads(() => setVersion((v) => v + 1)), []);

  return isDocumentImagePending(urls);
}
