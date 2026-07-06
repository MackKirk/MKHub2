import { LayoutGrid, List } from 'lucide-react';
import { AppButton, uiCx } from '@/components/ui';
import type { FileGridTileSize, FileViewMode } from './fileViewMode';

type Props = {
  viewMode: FileViewMode;
  tileSize: FileGridTileSize;
  showGridToggle?: boolean;
  onViewModeChange: (mode: FileViewMode) => void;
  onTileSizeChange: (size: FileGridTileSize) => void;
  className?: string;
};

const TILE_OPTIONS: Array<{ id: FileGridTileSize; label: string }> = [
  { id: 'small', label: 'S' },
  { id: 'medium', label: 'M' },
  { id: 'large', label: 'L' },
];

export function FileViewModeToolbar({
  viewMode,
  tileSize,
  showGridToggle = true,
  onViewModeChange,
  onTileSizeChange,
  className,
}: Props) {
  if (!showGridToggle) return null;

  return (
    <div className={uiCx('flex flex-wrap items-center gap-2', className)}>
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
      {viewMode === 'grid' ? (
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
          {TILE_OPTIONS.map((option, index) => (
            <AppButton
              key={option.id}
              type="button"
              variant={tileSize === option.id ? 'primary' : 'secondary'}
              size="sm"
              className={uiCx('min-w-[2rem] rounded-none border-0', index > 0 ? 'border-l border-gray-200' : '')}
              onClick={() => onTileSizeChange(option.id)}
              aria-label={`${option.label} thumbnail size`}
              title={`${option.label === 'S' ? 'Small' : option.label === 'M' ? 'Medium' : 'Large'} thumbnails`}
            >
              {option.label}
            </AppButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
