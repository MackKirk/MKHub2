import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ImageOff,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import { useConfirm } from '@/components/ConfirmProvider';
import { AppButton, AppCard, uiCx, uiTypography } from '@/components/ui';
import { TutorialMarkdown } from './TutorialMarkdown';
import { TutorialSectionMedia } from './TutorialSectionMedia';
import {
  sectionHasUploadedMedia,
  type TutorialMediaSlotOverride,
} from './resolveTutorialMedia';
import type { TutorialContentSection } from './types';
import {
  useCreateTutorialSection,
  useDeleteTutorialSection,
  useReorderTutorialSections,
  useResetTutorialSection,
  useUpsertTutorialSection,
} from './useTutorialContent';
import { useClearTutorialMediaSlot } from './useTutorialMediaSlots';

type TutorialSectionCardProps = {
  tutorialId: string;
  section: TutorialContentSection;
  sectionIds: string[];
  slots?: Record<string, TutorialMediaSlotOverride>;
  /** Admin + Edit guide toggle on. */
  editMode: boolean;
  isEditing: boolean;
  /** Discard dirty edit if needed; returns false if user cancelled. */
  onPrepareAction: () => Promise<boolean>;
  onRequestEdit: () => Promise<boolean>;
  onStopEdit: () => void;
  onAddedBelow: (newSectionId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
};

function errMsg(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export function TutorialSectionCard({
  tutorialId,
  section,
  sectionIds,
  slots,
  editMode,
  isEditing,
  onPrepareAction,
  onRequestEdit,
  onStopEdit,
  onAddedBelow,
  onDirtyChange,
}: TutorialSectionCardProps) {
  const confirm = useConfirm();
  const headingId = `tutorial-section-${section.id}`;
  const allowsMedia = Boolean(section.allows_media);
  const hasUploadedMedia = allowsMedia && sectionHasUploadedMedia(section.id, slots);
  const showMediaColumn = hasUploadedMedia || (editMode && allowsMedia);

  const [draftTitle, setDraftTitle] = useState(section.title);
  const [draftBody, setDraftBody] = useState(section.body_md);
  const [draftMedia, setDraftMedia] = useState(section.allows_media);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const menuButtonRef = useRef<HTMLSpanElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  const upsert = useUpsertTutorialSection(tutorialId);
  const create = useCreateTutorialSection(tutorialId);
  const reorder = useReorderTutorialSections(tutorialId);
  const reset = useResetTutorialSection(tutorialId);
  const remove = useDeleteTutorialSection(tutorialId);
  const clearMedia = useClearTutorialMediaSlot(tutorialId);
  const busy =
    upsert.isPending ||
    create.isPending ||
    reorder.isPending ||
    reset.isPending ||
    remove.isPending ||
    clearMedia.isPending;

  const index = sectionIds.indexOf(section.id);
  const dirty =
    isEditing &&
    (draftTitle !== section.title ||
      draftBody !== section.body_md ||
      draftMedia !== section.allows_media);

  useEffect(() => {
    if (!isEditing) return;
    onDirtyChange(dirty);
  }, [isEditing, dirty, onDirtyChange]);

  useEffect(() => {
    if (!isEditing) return;
    setDraftTitle(section.title);
    setDraftBody(section.body_md);
    setDraftMedia(section.allows_media);
  }, [isEditing, section.id, section.title, section.body_md, section.allows_media]);

  useLayoutEffect(() => {
    if (!menuOpen || !menuButtonRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = menuButtonRef.current.getBoundingClientRect();
    const menuHeight = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight && rect.top > spaceBelow;
    const width = 176;
    setMenuPos({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.right - width, window.innerWidth - width - 8),
      openUp,
    });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuButtonRef.current?.contains(t) || menuPanelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onScroll = () => setMenuOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menuOpen]);

  const onSave = async () => {
    try {
      await upsert.mutateAsync({
        sectionId: section.id,
        title: draftTitle.trim() || section.title,
        body_md: draftBody,
        allows_media: draftMedia,
      });
      onStopEdit();
      toast.success('Step saved');
    } catch (err) {
      toast.error(errMsg(err, 'Could not save step'));
    }
  };

  const onCancel = async () => {
    if (dirty) {
      const result = await confirm({
        title: 'Discard unsaved changes?',
        message: 'Your edits to this step will be lost.',
        confirmText: 'Discard',
        cancelText: 'Keep editing',
      });
      if (result !== 'confirm') return;
    }
    onStopEdit();
  };

  const onReset = async () => {
    const result = await confirm({
      title: 'Restore default copy?',
      message: 'This replaces your edited title and body with the original tutorial text.',
      confirmText: 'Restore',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await reset.mutateAsync(section.id);
      onStopEdit();
      toast.success('Restored default copy');
    } catch (err) {
      toast.error(errMsg(err, 'Could not reset step'));
    }
  };

  const onRemove = async () => {
    setMenuOpen(false);
    const isCustom = section.origin === 'custom';
    const result = await confirm({
      title: isCustom ? 'Delete step?' : 'Hide this step?',
      message: isCustom
        ? 'This custom step will be permanently removed.'
        : 'This step will be hidden from the tutorial. You can restore it later from Hidden steps.',
      confirmText: isCustom ? 'Delete' : 'Hide',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await remove.mutateAsync(section.id);
      if (isEditing) onStopEdit();
      toast.success(isCustom ? 'Step deleted' : 'Step hidden');
    } catch (err) {
      toast.error(errMsg(err, 'Could not remove step'));
    }
  };

  const onMove = async (dir: -1 | 1) => {
    setMenuOpen(false);
    const ok = await onPrepareAction();
    if (!ok) return;
    const next = index + dir;
    if (next < 0 || next >= sectionIds.length) return;
    const ids = [...sectionIds];
    const [item] = ids.splice(index, 1);
    ids.splice(next, 0, item);
    try {
      await reorder.mutateAsync(ids);
    } catch (err) {
      toast.error(errMsg(err, 'Could not reorder'));
    }
  };

  const onAddBelow = async () => {
    const ok = await onPrepareAction();
    if (!ok) return;
    try {
      const res = await create.mutateAsync({
        title: 'New step',
        body_md: '',
        allows_media: false,
        after_section_id: section.id,
      });
      const newId = res.section?.id;
      toast.success('Step added — edit below');
      if (newId) onAddedBelow(newId);
    } catch (err) {
      toast.error(errMsg(err, 'Could not add step'));
    }
  };

  const onToggleMediaSlot = async () => {
    setMenuOpen(false);
    const ok = await onPrepareAction();
    if (!ok) return;
    const next = !section.allows_media;
    if (!next && hasUploadedMedia) {
      const result = await confirm({
        title: 'Remove media from this step?',
        message: 'The uploaded images or videos for this step will be cleared.',
        confirmText: 'Remove media',
        cancelText: 'Cancel',
      });
      if (result !== 'confirm') return;
    }
    try {
      if (!next && hasUploadedMedia) {
        await clearMedia.mutateAsync(section.id);
      }
      await upsert.mutateAsync({
        sectionId: section.id,
        title: section.title,
        body_md: section.body_md,
        allows_media: next,
      });
      toast.success(next ? 'Media slot enabled' : 'Media slot removed');
    } catch (err) {
      toast.error(errMsg(err, 'Could not update media slot'));
    }
  };

  const menuItems = (
    <>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        disabled={busy || index <= 0}
        onClick={() => void onMove(-1)}
      >
        <ArrowUp className="h-3.5 w-3.5" /> Move up
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        disabled={busy || index < 0 || index >= sectionIds.length - 1}
        onClick={() => void onMove(1)}
      >
        <ArrowDown className="h-3.5 w-3.5" /> Move down
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        disabled={busy}
        onClick={() => void onToggleMediaSlot()}
      >
        {section.allows_media ? (
          <>
            <ImageOff className="h-3.5 w-3.5" /> Remove media slot
          </>
        ) : (
          <>
            <ImagePlus className="h-3.5 w-3.5" /> Add media slot
          </>
        )}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
        disabled={busy}
        onClick={() => void onRemove()}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {section.origin === 'custom' ? 'Delete' : 'Hide'}
      </button>
    </>
  );

  const textBlock = (
    <div className={uiCx('min-w-0 space-y-3', showMediaColumn && !isEditing && 'order-1')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2
          id={`${headingId}-title`}
          className={uiCx(uiTypography.sectionTitle, 'text-lg sm:text-xl text-gray-900')}
        >
          {isEditing ? draftTitle || section.title : section.title}
        </h2>
        {editMode && !isEditing ? (
          <div className="flex flex-wrap items-center gap-1">
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              leftIcon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => void onRequestEdit()}
            >
              Edit
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || create.isPending}
              leftIcon={
                create.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )
              }
              onClick={() => void onAddBelow()}
            >
              Add below
            </AppButton>
            <span ref={menuButtonRef} className="inline-flex">
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                leftIcon={<MoreHorizontal className="h-3.5 w-3.5" />}
                onClick={() => setMenuOpen((v) => !v)}
                title="More actions"
                aria-expanded={menuOpen}
              >
                More
              </AppButton>
            </span>
            {menuOpen && menuPos ? (
              <OverlayPortal>
                <div
                  ref={menuPanelRef}
                  role="menu"
                  className="fixed z-[80] min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
                  style={{
                    top: menuPos.openUp ? undefined : menuPos.top,
                    bottom: menuPos.openUp ? window.innerHeight - menuPos.top : undefined,
                    left: Math.max(8, menuPos.left),
                  }}
                >
                  {menuItems}
                </div>
              </OverlayPortal>
            ) : null}
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="sticky top-2 z-10 flex flex-wrap gap-2 rounded-md border border-gray-200 bg-white/95 p-2 shadow-sm backdrop-blur">
            <AppButton
              type="button"
              variant="primary"
              size="sm"
              disabled={busy}
              leftIcon={busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
              onClick={() => void onSave()}
            >
              Save
            </AppButton>
            <AppButton type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void onCancel()}>
              Cancel
            </AppButton>
            {section.origin === 'seed' && section.is_overridden ? (
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => void onReset()}
              >
                Reset to default
              </AppButton>
            ) : null}
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title</span>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Body (markdown)
            </span>
            <textarea
              className="min-h-[10rem] w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draftMedia}
              onChange={(e) => setDraftMedia(e.target.checked)}
              disabled={busy}
            />
            Allow media (screenshot / GIF / video)
          </label>
          <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</p>
            <TutorialMarkdown markdown={draftBody} />
          </div>
        </div>
      ) : (
        <TutorialMarkdown markdown={section.body_md} />
      )}
    </div>
  );

  return (
    <AppCard bodyClassName={uiCx('!p-5 sm:!p-6')}>
      <div
        id={headingId}
        aria-labelledby={`${headingId}-title`}
        className={
          !showMediaColumn
            ? 'scroll-mt-24'
            : isEditing
              ? 'grid scroll-mt-24 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-8'
              : 'flex scroll-mt-24 flex-col gap-5 lg:flow-root lg:gap-0'
        }
      >
        {showMediaColumn && !isEditing ? (
          <div className="order-2 lg:float-right lg:mb-4 lg:ml-8 lg:w-[calc(57.4%-2rem)]">
            <TutorialSectionMedia
              tutorialId={tutorialId}
              sectionId={section.id}
              altFallback={section.title}
              slots={slots}
              isAdmin={editMode && allowsMedia}
              embedded
            />
          </div>
        ) : null}
        {textBlock}
        {showMediaColumn && isEditing ? (
          <TutorialSectionMedia
            tutorialId={tutorialId}
            sectionId={section.id}
            altFallback={section.title}
            slots={slots}
            isAdmin={editMode && allowsMedia}
            embedded
          />
        ) : null}
      </div>
    </AppCard>
  );
}
