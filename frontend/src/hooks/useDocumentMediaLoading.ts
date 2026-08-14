import { useLayoutEffect, useRef, useState } from 'react';

/**
 * True while any of the given image URLs have not yet loaded (or failed).
 * Prefetches via Image() so the same URLs used by the canvas hit cache.
 */
export function useDocumentMediaLoading(urls: readonly string[]): boolean {
  const loadedRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const [, setVersion] = useState(0);

  const unique = [...new Set(urls.filter(Boolean))];
  const uniqueKey = unique.join('\n');

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const notify = () => {
      if (mountedRef.current) setVersion((v) => v + 1);
    };

    for (const url of uniqueKey ? uniqueKey.split('\n') : []) {
      if (loadedRef.current.has(url) || inFlightRef.current.has(url)) continue;
      inFlightRef.current.add(url);
      const img = new Image();
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        inFlightRef.current.delete(url);
        loadedRef.current.add(url);
        notify();
      };
      img.onload = settle;
      img.onerror = settle;
      img.src = url;
      if (img.complete) settle();
    }
  }, [uniqueKey]);

  return unique.some((url) => !loadedRef.current.has(url));
}
