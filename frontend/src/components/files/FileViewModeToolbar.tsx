import { LayoutGrid, List } from 'lucide-react';
import { AppButton, uiCx } from '@/components/ui';
import type { FileGridTileSize, FileViewMode } from './fileViewMode';

type Props = {
  viewMode: FileViewMode;
  tileSize: FileGridTileSize;
  showGridToggle?: boolean;
  /** When true, show tile-size icons even if showGridToggle is false. Defaults to viewMode === 'grid'. */
  showTileSizeToggle?: boolean;
  onViewModeChange: (mode: FileViewMode) => void;
  onTileSizeChange: (size: FileGridTileSize) => void;
  className?: string;
};

const TILE_OPTIONS: FileGridTileSize[] = ['small', 'medium', 'large', 'xlarge'];

const TILE_SIZE_TITLES: Record<FileGridTileSize, string> = {
  small: 'Small thumbnails',
  medium: 'Medium thumbnails',
  large: 'Large thumbnails',
  xlarge: 'Extra-large thumbnails',
};

/** Mini grid icons — more cells = smaller thumbnails, fewer = larger. */
function ThumbnailSizeIcon({ size }: { size: FileGridTileSize }) {
  const cell = 'currentColor';
  if (size === 'small') {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={1 + col * 5}
              y={1 + row * 5}
              width="3.5"
              height="3.5"
              rx="0.5"
              fill={cell}
            />
          )),
        )}
      </svg>
    );
  }
  if (size === 'medium') {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
        {[0, 1].map((row) =>
          [0, 1, 2].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={1 + col * 5}
              y={2 + row * 6}
              width="3.5"
              height="4.5"
              rx="0.5"
              fill={cell}
            />
          )),
        )}
      </svg>
    );
  }
  if (size === 'large') {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
        {[0, 1].map((row) =>
          [0, 1].map((col) => (
            <rect
              key={`${row}-${col}`}
              x={1 + col * 7}
              y={1 + row * 7}
              width="5.5"
              height="5.5"
              rx="0.75"
              fill={cell}
            />
          )),
        )}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <rect x="2" y="2" width="12" height="12" rx="1" fill={cell} />
    </svg>
  );
}

function TileSizeButtons({
  tileSize,
  onTileSizeChange,
}: {
  tileSize: FileGridTileSize;
  onTileSizeChange: (size: FileGridTileSize) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
      {TILE_OPTIONS.map((option, index) => (
        <AppButton
          key={option}
          type="button"
          variant={tileSize === option ? 'primary' : 'secondary'}
          size="sm"
          className={uiCx('min-w-[2.25rem] rounded-none border-0 px-2', index > 0 ? 'border-l border-gray-200' : '')}
          onClick={() => onTileSizeChange(option)}
          aria-label={TILE_SIZE_TITLES[option]}
          title={TILE_SIZE_TITLES[option]}
        >
          <ThumbnailSizeIcon size={option} />
        </AppButton>
      ))}
    </div>
  );
}

export function FileViewModeToolbar({
  viewMode,
  tileSize,
  showGridToggle = true,
  showTileSizeToggle,
  onViewModeChange,
  onTileSizeChange,
  className,
}: Props) {
  const showSizes = showTileSizeToggle ?? viewMode === 'grid';
  if (!showGridToggle && !showSizes) return null;

  return (
    <div className={uiCx('flex flex-wrap items-center gap-2', className)}>
      {showGridToggle ? (
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
          <AppButton
            type="button"
            variant={viewMode === 'list' ? 'primary' : 'secondary'}
            size="sm"
            className="rounded-none border-0"
            onClick={() => onViewModeChange('list')}
            aria-label="List view"
            title="List view"
          >
            <List className="h-4 w-4" />
          </AppButton>
          <AppButton
            type="button"
            variant={viewMode === 'grid' ? 'primary' : 'secondary'}
            size="sm"
            className="rounded-none border-0 border-l border-gray-200"
            onClick={() => onViewModeChange('grid')}
            aria-label="Gallery view"
            title="Gallery view"
          >
            <LayoutGrid className="h-4 w-4" />
          </AppButton>
        </div>
      ) : null}
      {showSizes ? <TileSizeButtons tileSize={tileSize} onTileSizeChange={onTileSizeChange} /> : null}
    </div>
  );
}
