import { useCallback, useEffect, useState } from 'react';

export type FileViewMode = 'list' | 'grid';
export type FileGridTileSize = 'small' | 'medium' | 'large';

export type FileViewModeContext = {
  category?: string | null;
};

const TILE_SIZE_CONFIG: Record<
  FileGridTileSize,
  { thumbnailWidth: number; gridClass: string; tileHeightClass: string }
> = {
  small: {
    thumbnailWidth: 200,
    gridClass: 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-8',
    tileHeightClass: 'h-24',
  },
  medium: {
    thumbnailWidth: 400,
    gridClass: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6',
    tileHeightClass: 'h-36',
  },
  large: {
    thumbnailWidth: 600,
    gridClass: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    tileHeightClass: 'h-52',
  },
};

export function getTileSizeConfig(size: FileGridTileSize) {
  return TILE_SIZE_CONFIG[size];
}

export function getDefaultViewMode(context?: FileViewModeContext): FileViewMode {
  const cat = String(context?.category || '').toLowerCase();
  if (cat === 'pictures' || cat === 'photos') return 'grid';
  return 'list';
}

export function getDefaultTileSize(): FileGridTileSize {
  return 'medium';
}

type PersistedFileViewPrefs = {
  viewMode: FileViewMode;
  tileSize: FileGridTileSize;
};

function parsePersisted(raw: string | null): PersistedFileViewPrefs | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedFileViewPrefs>;
    const viewMode = parsed.viewMode === 'grid' ? 'grid' : parsed.viewMode === 'list' ? 'list' : null;
    const tileSize =
      parsed.tileSize === 'small' || parsed.tileSize === 'medium' || parsed.tileSize === 'large'
        ? parsed.tileSize
        : null;
    if (!viewMode || !tileSize) return null;
    return { viewMode, tileSize };
  } catch {
    return null;
  }
}

function loadPrefs(storageKey: string): PersistedFileViewPrefs | null {
  try {
    return parsePersisted(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function savePrefs(storageKey: string, prefs: PersistedFileViewPrefs) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch {
    /* ignore quota / private mode */
  }
}

export function usePersistedFileViewMode(storageKey: string, context?: FileViewModeContext) {
  const [viewMode, setViewModeState] = useState<FileViewMode>(() => {
    const saved = loadPrefs(storageKey);
    return saved?.viewMode ?? getDefaultViewMode(context);
  });
  const [tileSize, setTileSizeState] = useState<FileGridTileSize>(() => {
    const saved = loadPrefs(storageKey);
    return saved?.tileSize ?? getDefaultTileSize();
  });

  const setViewMode = useCallback(
    (mode: FileViewMode) => {
      setViewModeState(mode);
      setTileSizeState((current) => {
        savePrefs(storageKey, { viewMode: mode, tileSize: current });
        return current;
      });
    },
    [storageKey],
  );

  const setTileSize = useCallback(
    (size: FileGridTileSize) => {
      setTileSizeState(size);
      setViewModeState((current) => {
        savePrefs(storageKey, { viewMode: current, tileSize: size });
        return current;
      });
    },
    [storageKey],
  );

  useEffect(() => {
    const saved = loadPrefs(storageKey);
    if (saved) return;
    const nextMode = getDefaultViewMode(context);
    const nextSize = getDefaultTileSize();
    setViewModeState(nextMode);
    setTileSizeState(nextSize);
    savePrefs(storageKey, { viewMode: nextMode, tileSize: nextSize });
  }, [storageKey, context?.category]);

  return { viewMode, tileSize, setViewMode, setTileSize };
}
