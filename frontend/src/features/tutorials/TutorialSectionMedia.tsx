import { useEffect, useRef, useState, type ClipboardEvent, type PointerEvent } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { AppButton, uiBorders, uiCx, uiRadius, uiTypography } from '@/components/ui';
import {
  filesFromClipboardData,
  imageFilesFromClipboardData,
} from '@/utils/imageUploadHelpers';
import {
  CAROUSEL_INTERVAL_MS,
  CAROUSEL_MAX_ITEMS,
  carouselShouldAutoplay,
  carouselShowsControls,
} from './carousel';
import {
  clampTutorialFrame,
  DEFAULT_TUTORIAL_FRAME,
  fittedTutorialFrame,
  frameAfterDrag,
  frameAfterWheel,
  tutorialFrameStyle,
  tutorialVideoPlaybackStyle,
  type TutorialFrame,
} from './frame';
import type { TutorialMedia } from './types';
import {
  resolveTutorialMediaItems,
  slotItems,
  type ResolvedTutorialMedia,
  type TutorialMediaSlotOverride,
} from './resolveTutorialMedia';
import {
  useAddTutorialMediaItem,
  useDeleteTutorialMediaItem,
  useReorderTutorialMediaItems,
  useReplaceTutorialMediaItem,
  useUpdateTutorialMediaCaption,
  useUpdateTutorialMediaFrame,
} from './useTutorialMediaSlots';

const ACCEPT = 'image/*,video/mp4,video/webm,image/gif,.webp';

function mediaFileFromClipboard(data: DataTransfer | null): File | null {
  const images = imageFilesFromClipboardData(data);
  if (images[0]) return images[0];
  const files = filesFromClipboardData(data);
  return (
    files.find(
      (f) =>
        f.type.startsWith('image/') ||
        f.type === 'video/mp4' ||
        f.type === 'video/webm' ||
        f.type === 'image/gif',
    ) ?? null
  );
}

function errText(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

type TutorialSectionMediaProps = {
  tutorialId: string;
  sectionId: string;
  altFallback: string;
  staticMedia?: TutorialMedia;
  slots?: Record<string, TutorialMediaSlotOverride>;
  isAdmin: boolean;
  /** When true, omit outer border/radius (parent card already frames the media). */
  embedded?: boolean;
  className?: string;
};

export function TutorialSectionMedia({
  tutorialId,
  sectionId,
  altFallback,
  staticMedia,
  slots,
  isAdmin,
  embedded = false,
  className,
}: TutorialSectionMediaProps) {
  const confirm = useConfirm();
  const rootRef = useRef<HTMLDivElement>(null);
  const frameOverlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickMode = useRef<'add' | 'replace'>('add');
  const replaceItemId = useRef<string | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [captionDraft, setCaptionDraft] = useState('');
  const [frame, setFrame] = useState<TutorialFrame>(DEFAULT_TUTORIAL_FRAME);
  const [mediaAspect, setMediaAspect] = useState<number | undefined>(undefined);
  const frameRef = useRef(frame);
  const dragOrigin = useRef<{ x: number; y: number; frame: TutorialFrame } | null>(null);
  const wheelTimer = useRef<number | null>(null);
  frameRef.current = frame;

  const addItem = useAddTutorialMediaItem(tutorialId);
  const replaceItem = useReplaceTutorialMediaItem(tutorialId);
  const deleteItem = useDeleteTutorialMediaItem(tutorialId);
  const reorderItems = useReorderTutorialMediaItems(tutorialId);
  const updateCaption = useUpdateTutorialMediaCaption(tutorialId);
  const updateFrame = useUpdateTutorialMediaFrame(tutorialId);
  const busy =
    addItem.isPending ||
    replaceItem.isPending ||
    deleteItem.isPending ||
    reorderItems.isPending ||
    updateCaption.isPending;

  const items = resolveTutorialMediaItems(sectionId, staticMedia, slots);
  const count = items.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const active: ResolvedTutorialMedia | undefined = items[safeIndex];
  const carousel = carouselShowsControls(count);
  const atCap = count >= CAROUSEL_MAX_ITEMS;
  const activeSlot = slotItems(slots?.[sectionId]).find((item) => item.id === active?.id);
  const canFrame = Boolean(
    isAdmin && active?.isOverride && (active.kind === 'image' || active.kind === 'video'),
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    setCaptionDraft(active?.isOverride ? active.caption || '' : '');
    setMediaAspect(undefined);
  }, [active?.id, active?.caption, active?.isOverride]);

  useEffect(() => {
    if (dragOrigin.current) return;
    setFrame(
      clampTutorialFrame({
        frameX: activeSlot?.frame_x ?? DEFAULT_TUTORIAL_FRAME.frameX,
        frameY: activeSlot?.frame_y ?? DEFAULT_TUTORIAL_FRAME.frameY,
        frameZoom: activeSlot?.frame_zoom ?? DEFAULT_TUTORIAL_FRAME.frameZoom,
      }),
    );
  }, [active?.id, activeSlot?.frame_x, activeSlot?.frame_y, activeSlot?.frame_zoom]);

  const autoplay = carouselShouldAutoplay({
    count,
    kind: active?.kind ?? 'image',
    paused,
    hovered,
    focused,
    reducedMotion,
  });

  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, count]);

  const go = (next: number) => {
    if (!count) return;
    setPaused(true);
    setIndex((next + count) % count);
  };

  const commitFile = async (file: File, mode: 'add' | 'replace') => {
    const itemId = replaceItemId.current;
    if (mode === 'replace' && itemId) {
      await replaceItem.mutateAsync({ sectionId, itemId, file });
      setBroken((prev) => ({ ...prev, [itemId]: false }));
      toast.success('Slide replaced');
      return;
    }
    if (atCap) {
      toast.error('A step can have at most 6 slides');
      return;
    }
    await addItem.mutateAsync({ sectionId, file });
    setIndex(count);
    toast.success('Slide added');
  };

  const applyFrame = (next: TutorialFrame) => {
    const clamped = clampTutorialFrame(next);
    frameRef.current = clamped;
    setFrame(clamped);
  };

  const saveFrame = async (next: TutorialFrame) => {
    if (!active?.isOverride) return;
    const clamped = clampTutorialFrame(next);
    try {
      await updateFrame.mutateAsync({
        sectionId,
        itemId: active.id,
        frameX: clamped.frameX,
        frameY: clamped.frameY,
        frameZoom: clamped.frameZoom,
      });
    } catch (err) {
      toast.error(errText(err, 'Could not save framing'));
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file || !isAdmin) return;
    const mode = pickMode.current;
    try {
      await commitFile(file, mode);
    } catch (err) {
      toast.error(errText(err, 'Could not update tutorial media'));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onFramePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!canFrame || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    dragOrigin.current = { x: e.clientX, y: e.clientY, frame: frameRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onFramePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    applyFrame(
      frameAfterDrag(origin.frame, e.clientX - origin.x, e.clientY - origin.y, rect.width, rect.height),
    );
  };

  const onFramePointerUp = () => {
    if (!dragOrigin.current) return;
    dragOrigin.current = null;
    void saveFrame(frameRef.current);
  };

  const onFrameWheelRef = useRef<(e: globalThis.WheelEvent) => void>(() => {});
  onFrameWheelRef.current = (e) => {
    if (!canFrame || !rootRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = rootRef.current.getBoundingClientRect();
    const pointerX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    const pointerY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
    applyFrame(frameAfterWheel(frameRef.current, e.deltaY, pointerX, pointerY));
    if (wheelTimer.current) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      void saveFrame(frameRef.current);
    }, 400);
  };

  useEffect(() => {
    const el = active?.kind === 'video' ? frameOverlayRef.current : rootRef.current;
    if (!el || !canFrame) return;
    const onWheel = (e: WheelEvent) => onFrameWheelRef.current(e);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [canFrame, active?.kind, active?.id]);

  const onResetFrame = () => {
    applyFrame(DEFAULT_TUTORIAL_FRAME);
    void saveFrame(DEFAULT_TUTORIAL_FRAME);
  };

  const onFitFrame = () => {
    const next = fittedTutorialFrame(mediaAspect);
    applyFrame(next);
    void saveFrame(next);
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (!isAdmin || busy) return;
    const file = mediaFileFromClipboard(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    pickMode.current = 'add';
    replaceItemId.current = null;
    void onPick(file);
  };

  const onRemove = async () => {
    if (!active?.isOverride) return;
    const result = await confirm({
      title: 'Remove this slide?',
      message: 'This image or clip will be removed from the step.',
      confirmText: 'Remove slide',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await deleteItem.mutateAsync({ sectionId, itemId: active.id });
      setIndex((current) => Math.max(0, Math.min(current, count - 2)));
      toast.success('Slide removed');
    } catch (err) {
      toast.error(errText(err, 'Could not remove slide'));
    }
  };

  const onMove = async (dir: -1 | 1) => {
    if (!active?.isOverride || count < 2) return;
    const ids = items.filter((item) => item.isOverride).map((item) => item.id);
    const from = ids.indexOf(active.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    setPaused(true);
    try {
      await reorderItems.mutateAsync({ sectionId, itemIds: next });
      setIndex(to);
    } catch (err) {
      toast.error(errText(err, 'Could not reorder slides'));
    }
  };

  const saveCaption = async () => {
    if (!active?.isOverride) return;
    const next = captionDraft.trim();
    const current = (active.caption || '').trim();
    if (next === current) return;
    try {
      await updateCaption.mutateAsync({ sectionId, itemId: active.id, caption: next });
    } catch (err) {
      toast.error(errText(err, 'Could not save caption'));
    }
  };

  const openPicker = (mode: 'add' | 'replace') => {
    pickMode.current = mode;
    replaceItemId.current = mode === 'replace' && active?.isOverride ? active.id : null;
    inputRef.current?.click();
  };

  const framingVideo = canFrame && active?.kind === 'video';

  return (
    <div className={uiCx('flex flex-col gap-2', className)}>
      <div
        ref={rootRef}
        tabIndex={isAdmin ? 0 : undefined}
        onPaste={isAdmin ? onPaste : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        onMouseDown={
          isAdmin
            ? () => {
                rootRef.current?.focus({ preventScroll: true });
              }
            : undefined
        }
        onPointerDown={canFrame && !framingVideo ? onFramePointerDown : undefined}
        onPointerMove={canFrame && !framingVideo ? onFramePointerMove : undefined}
        onPointerUp={canFrame && !framingVideo ? onFramePointerUp : undefined}
        onPointerCancel={canFrame && !framingVideo ? onFramePointerUp : undefined}
        title={
          canFrame
            ? 'Drag to frame. Scroll to zoom. Ctrl+V adds a slide.'
            : isAdmin
              ? 'Add a slide or paste with Ctrl+V'
              : undefined
        }
        className={uiCx(
          'relative overflow-hidden bg-gray-50 outline-none',
          isAdmin && 'focus-visible:ring-2 focus-visible:ring-brand-red/35',
          canFrame && !framingVideo && 'cursor-grab touch-none',
          active?.kind === 'video' && !broken[active.id] && 'aspect-video bg-black',
          !embedded && uiRadius.card,
          !embedded && uiBorders.subtle,
          embedded && uiRadius.control,
        )}
      >
        {active && !broken[active.id] ? (
          active.kind === 'video' ? (
            <video
              key={active.src}
              src={active.src}
              controls
              preload="auto"
              playsInline
              className="absolute inset-0 h-full w-full bg-black object-cover"
              style={tutorialVideoPlaybackStyle(frame, mediaAspect)}
              onLoadedMetadata={(e) => {
                const video = e.currentTarget;
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                  setMediaAspect(video.videoWidth / video.videoHeight);
                }
              }}
              onError={() => setBroken((prev) => ({ ...prev, [active.id]: true }))}
            >
              <track kind="captions" />
            </video>
          ) : (
            <img
              key={active.src}
              src={active.src}
              alt={active.alt || altFallback}
              loading="lazy"
              decoding="async"
              className="block aspect-video w-full object-cover"
              style={tutorialFrameStyle(frame, mediaAspect)}
              onLoad={(e) => {
                const image = e.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  setMediaAspect(image.naturalWidth / image.naturalHeight);
                }
              }}
              draggable={false}
              onError={() => setBroken((prev) => ({ ...prev, [active.id]: true }))}
            />
          )
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 border border-dashed border-gray-300 bg-gray-50/80 px-4 text-center">
            <ImagePlus className="h-8 w-8 text-gray-400" aria-hidden />
            <p className={uiTypography.helper}>
              {isAdmin
                ? 'No media yet — Add or paste (Ctrl+V) a screenshot or short clip.'
                : 'No media for this step.'}
            </p>
          </div>
        )}

        {framingVideo ? (
          <div
            ref={frameOverlayRef}
            className="absolute inset-x-0 top-0 bottom-16 z-10 cursor-grab touch-none"
            onPointerDown={onFramePointerDown}
            onPointerMove={onFramePointerMove}
            onPointerUp={onFramePointerUp}
            onPointerCancel={onFramePointerUp}
          />
        ) : null}

        {carousel ? (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              className="absolute left-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-sm"
              onClick={() => go(safeIndex - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-gray-800 shadow-sm"
              onClick={() => go(safeIndex + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div
              className={uiCx(
                'absolute left-3 z-20 flex items-center gap-2',
                active?.kind === 'video' ? 'bottom-16' : 'bottom-3',
              )}
            >
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
                {safeIndex + 1} / {count}
              </span>
              {reducedMotion ? null : (
                <button
                  type="button"
                  aria-label={paused || !autoplay ? 'Play slideshow' : 'Pause slideshow'}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
                  onClick={() => setPaused((value) => !value)}
                >
                  {paused || active?.kind === 'video' ? (
                    <Play className="h-3.5 w-3.5" />
                  ) : (
                    <Pause className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
            <div
              className={uiCx(
                'absolute left-1/2 z-20 flex -translate-x-1/2 gap-1.5',
                active?.kind === 'video' ? 'bottom-16' : 'bottom-3',
              )}
            >
              {items.map((item, dotIndex) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Go to slide ${dotIndex + 1}`}
                  className={uiCx(
                    'h-2 w-2 rounded-full',
                    dotIndex === safeIndex ? 'bg-white' : 'bg-white/50',
                  )}
                  onClick={() => go(dotIndex)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {active?.caption && !isAdmin ? (
        <p className={uiCx(uiTypography.helper, 'px-0.5')}>{active.caption}</p>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          {active?.isOverride ? (
            <input
              type="text"
              maxLength={120}
              value={captionDraft}
              placeholder="Caption (optional)"
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-800"
              onChange={(e) => setCaptionDraft(e.target.value)}
              onBlur={() => void saveCaption()}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || atCap}
              leftIcon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              onClick={() => openPicker('add')}
              title="Add a slide (or Ctrl+V)"
            >
              Add
            </AppButton>
            {active?.isOverride ? (
              <>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => openPicker('replace')}
                >
                  Replace
                </AppButton>
                {canFrame ? (
                  <>
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      title="Fit the whole picture in the frame"
                      onClick={onFitFrame}
                    >
                      Fit
                    </AppButton>
                    <AppButton type="button" variant="ghost" size="sm" disabled={busy} onClick={onResetFrame}>
                      Reset frame
                    </AppButton>
                  </>
                ) : null}
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  onClick={() => void onRemove()}
                >
                  Remove
                </AppButton>
                {carousel ? (
                  <>
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || safeIndex === 0}
                      onClick={() => void onMove(-1)}
                    >
                      Move left
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || safeIndex === count - 1}
                      onClick={() => void onMove(1)}
                    >
                      Move right
                    </AppButton>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
