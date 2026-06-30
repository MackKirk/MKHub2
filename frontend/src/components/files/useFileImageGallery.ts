import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { fetchFilePreviewUrl, type FileImagePreviewItem } from './fileImagePreview';

type GalleryState = {
  files: FileImagePreviewItem[];
  index: number;
  urls: Record<string, string>;
  loadingId: string | null;
};

export function useFileImageGallery() {
  const [state, setState] = useState<GalleryState | null>(null);

  const ensureUrl = useCallback(async (fileId: string) => {
    let resolvedUrl = '';
    setState((prev) => {
      if (!prev) return prev;
      if (prev.urls[fileId]) {
        resolvedUrl = prev.urls[fileId];
        return prev;
      }
      return { ...prev, loadingId: fileId };
    });
    if (resolvedUrl) return resolvedUrl;

    try {
      const url = await fetchFilePreviewUrl(fileId);
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          urls: { ...prev.urls, [fileId]: url },
          loadingId: prev.loadingId === fileId ? null : prev.loadingId,
        };
      });
      return url;
    } catch {
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, loadingId: prev.loadingId === fileId ? null : prev.loadingId };
      });
      toast.error('Preview not available');
      return null;
    }
  }, []);

  const openImage = useCallback(
    async <T>(
      file: T,
      visibleFiles: T[],
      isImage: (f: T) => boolean,
      getId: (f: T) => string,
      getName: (f: T) => string,
    ) => {
      const imageFiles = visibleFiles.filter(isImage);
      const clickedId = getId(file);
      const index = imageFiles.findIndex((f) => getId(f) === clickedId);
      if (index < 0) return;

      const files: FileImagePreviewItem[] = imageFiles.map((f) => ({
        id: getId(f),
        name: getName(f),
        fileObjectId: getId(f),
      }));

      setState({ files, index, urls: {}, loadingId: clickedId });

      try {
        const url = await fetchFilePreviewUrl(clickedId);
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            urls: { ...prev.urls, [clickedId]: url },
            loadingId: null,
          };
        });
      } catch {
        setState(null);
        toast.error('Preview not available');
      }
    },
    [],
  );

  const close = useCallback(() => setState(null), []);

  const goPrev = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.files.length <= 1) return prev;
      const nextIndex = (prev.index - 1 + prev.files.length) % prev.files.length;
      const fileId = prev.files[nextIndex]?.id;
      if (fileId && !prev.urls[fileId]) {
        void ensureUrl(fileId);
      }
      return { ...prev, index: nextIndex };
    });
  }, [ensureUrl]);

  const goNext = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.files.length <= 1) return prev;
      const nextIndex = (prev.index + 1) % prev.files.length;
      const fileId = prev.files[nextIndex]?.id;
      if (fileId && !prev.urls[fileId]) {
        void ensureUrl(fileId);
      }
      return { ...prev, index: nextIndex };
    });
  }, [ensureUrl]);

  const items = useMemo<FileImagePreviewItem[]>(() => {
    if (!state) return [];
    return state.files.map((f) => ({
      ...f,
      url: state.urls[f.id],
    }));
  }, [state]);

  const currentItem = state ? items[state.index] ?? null : null;
  const loading = state ? state.loadingId === currentItem?.id && !currentItem?.url : false;

  return {
    open: !!state,
    items,
    index: state?.index ?? 0,
    currentItem,
    loading,
    openImage,
    close,
    goPrev,
    goNext,
  };
}
