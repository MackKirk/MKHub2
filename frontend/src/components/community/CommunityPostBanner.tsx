import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ImagePlus, Move } from 'lucide-react';
import { withFileAccessTokenIfNeeded } from '@/lib/api';
import {
  COMMUNITY_POST_BANNER_ASPECT_CSS,
  COMMUNITY_POST_BANNER_HEIGHT_PX,
  COMMUNITY_POST_BANNER_MAX_BYTES,
  COMMUNITY_POST_BANNER_WIDTH_PX,
  communityBannerObjectPosition,
} from '@/lib/communityPostBanner';
import { AppButton, AppControlLabelRow, uiBorders, uiCx, uiTypography } from '@/components/ui';

type DisplayProps = {
  src: string;
  focalX?: number | null;
  focalY?: number | null;
  className?: string;
  alt?: string;
};

export function CommunityPostBanner({ src, focalX, focalY, className, alt = '' }: DisplayProps) {
  return (
    <div
      className={uiCx('w-full overflow-hidden bg-gray-100', className)}
      style={{ aspectRatio: COMMUNITY_POST_BANNER_ASPECT_CSS }}
    >
      <img
        src={withFileAccessTokenIfNeeded(src)}
        alt={alt}
        className="h-full w-full object-cover"
        style={{ objectPosition: communityBannerObjectPosition(focalX, focalY) }}
      />
    </div>
  );
}

type PickerProps = {
  fileId: string | null;
  focalX: number;
  focalY: number;
  uploading?: boolean;
  onPickFile: (file: File) => void;
  onFocalChange: (x: number, y: number) => void;
  onRemove: () => void;
};

export function CommunityPostBannerPicker({
  fileId,
  focalX,
  focalY,
  uploading = false,
  onPickFile,
  onFocalChange,
  onRemove,
}: PickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const src = fileId ? `/files/${fileId}/thumbnail?w=1600` : null;

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!fileId || e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: focalX,
        originY: focalY,
      };
      setDragging(true);
    },
    [fileId, focalX, focalY],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) return;
      const dx = ((e.clientX - drag.startX) / rect.width) * 100;
      const dy = ((e.clientY - drag.startY) / rect.height) * 100;
      const nextX = Math.min(100, Math.max(0, drag.originX - dx));
      const nextY = Math.min(100, Math.max(0, drag.originY - dy));
      onFocalChange(nextX, nextY);
    },
    [onFocalChange],
  );

  const endDrag = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  return (
    <div>
      <div className="mb-2 flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
        <AppControlLabelRow label="Banner (optional)" />
        <span className={uiTypography.helper}>
          {COMMUNITY_POST_BANNER_WIDTH_PX} × {COMMUNITY_POST_BANNER_HEIGHT_PX} px (10:3). Max{' '}
          {Math.round(COMMUNITY_POST_BANNER_MAX_BYTES / (1024 * 1024))} MB.
        </span>
      </div>

      {src ? (
        <div
          ref={frameRef}
          className={uiCx(
            'relative w-full overflow-hidden bg-gray-100 select-none',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={{ aspectRatio: COMMUNITY_POST_BANNER_ASPECT_CSS }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            src={withFileAccessTokenIfNeeded(src)}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-cover"
            style={{ objectPosition: communityBannerObjectPosition(focalX, focalY) }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-xs font-medium text-white">
            <Move className="h-3.5 w-3.5" aria-hidden />
            Drag to reposition
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={uiCx(
            'flex w-full flex-col items-center justify-center gap-2 border-2 border-dashed px-4 text-center transition',
            uiBorders.subtle,
            'rounded-xl bg-gray-50/80 hover:border-gray-300 hover:bg-gray-50',
            uploading && 'opacity-60',
          )}
          style={{ aspectRatio: COMMUNITY_POST_BANNER_ASPECT_CSS }}
        >
          <ImagePlus className="h-8 w-8 text-gray-400" aria-hidden />
          <span className={uiTypography.sectionTitle}>{uploading ? 'Uploading…' : 'Add a banner image'}</span>
          <span className={uiCx(uiTypography.helper, 'max-w-md')}>
            Shown at the top of the post. Use a wide photo; you can drag it to frame the crop.
          </span>
        </button>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {fileId ? 'Change image' : 'Choose image'}
        </AppButton>
        {fileId ? (
          <AppButton type="button" variant="ghost" size="sm" className="text-red-700" onClick={onRemove}>
            Remove banner
          </AppButton>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPickFile(file);
        }}
      />
    </div>
  );
}
