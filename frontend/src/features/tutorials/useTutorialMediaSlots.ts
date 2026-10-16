import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TutorialId } from './types';
import type { TutorialMediaItemDto, TutorialMediaSlotsResponse } from './resolveTutorialMedia';
import { uploadTutorialMediaFile } from './uploadTutorialMedia';

export function tutorialMediaSlotsQueryKey(tutorialId: TutorialId) {
  return ['tutorial-media-slots', tutorialId] as const;
}

export function useTutorialMediaSlots(tutorialId: TutorialId | undefined, enabled = true) {
  return useQuery({
    queryKey: tutorialMediaSlotsQueryKey(tutorialId || ''),
    queryFn: () =>
      api<TutorialMediaSlotsResponse>(
        'GET',
        `/tutorials/${encodeURIComponent(tutorialId!)}/media-slots`,
      ),
    enabled: Boolean(tutorialId) && enabled,
    staleTime: 30_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, tutorialId: TutorialId) {
  void qc.invalidateQueries({ queryKey: tutorialMediaSlotsQueryKey(tutorialId) });
}

export function useAddTutorialMediaItem(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, file, caption }: { sectionId: string; file: File; caption?: string }) => {
      const fileId = await uploadTutorialMediaFile(file);
      return api<{ item: TutorialMediaItemDto }>(
        'POST',
        `/tutorials/${encodeURIComponent(tutorialId)}/media-slots/${encodeURIComponent(sectionId)}`,
        { file_id: fileId, caption: caption ?? null },
      );
    },
    onSuccess: () => invalidate(qc, tutorialId),
  });
}

export function useReplaceTutorialMediaItem(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sectionId,
      itemId,
      file,
    }: {
      sectionId: string;
      itemId: string;
      file: File;
    }) => {
      const fileId = await uploadTutorialMediaFile(file);
      return api<{ item: TutorialMediaItemDto }>(
        'PATCH',
        `/tutorials/${encodeURIComponent(tutorialId)}/media-slots/${encodeURIComponent(sectionId)}/items/${encodeURIComponent(itemId)}`,
        { file_id: fileId },
      );
    },
    onSuccess: () => invalidate(qc, tutorialId),
  });
}

export function useUpdateTutorialMediaCaption(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sectionId,
      itemId,
      caption,
    }: {
      sectionId: string;
      itemId: string;
      caption: string;
    }) =>
      api<{ item: TutorialMediaItemDto }>(
        'PATCH',
        `/tutorials/${encodeURIComponent(tutorialId)}/media-slots/${encodeURIComponent(sectionId)}/items/${encodeURIComponent(itemId)}`,
        { caption },
      ),
    onSuccess: () => invalidate(qc, tutorialId),
  });
}

export function useUpdateTutorialMediaFrame(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sectionId,
      itemId,
      frameX,
      frameY,
      frameZoom,
    }: {
      sectionId: string;
      itemId: string;
      frameX: number;
      frameY: number;
      frameZoom: number;
    }) =>
      api<{ item: TutorialMediaItemDto }>(
        'PATCH',
        `/tutorials/${encodeURIComponent(tutorialId)}/media-slots/${encodeURIComponent(sectionId)}/items/${encodeURIComponent(itemId)}`,
        { frame_x: frameX, frame_y: frameY, frame_zoom: frameZoom },
      ),
    onSuccess: () => invalidate(qc, tutorialId),
  });
}

export function useDeleteTutorialMediaItem(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, itemId }: { sectionId: string; itemId: string }) =>
      api<{ ok: boolean }>(
        'DELETE',
        `/tutorials/${encodeURIComponent(tutorialId)}/media-slots/${encodeURIComponent(sectionId)}/items/${encodeURIComponent(itemId)}`,
      ),
    onSuccess: () => invalidate(qc, tutorialId),
  });
}

export function useReorderTutorialMediaItems(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, itemIds }: { sectionId: string; itemIds: string[] }) =>
      api<{ items: TutorialMediaItemDto[] }>(
        'PUT',
        `/tutorials/${encodeURIComponent(tutorialId)}/media-slots/${encodeURIComponent(sectionId)}/reorder`,
        { item_ids: itemIds },
      ),
    onSuccess: () => invalidate(qc, tutorialId),
  });
}

/** Clears every slide on a section (used when turning the media slot off). */
export function useClearTutorialMediaSlot(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sectionId: string) =>
      api<{ ok: boolean }>(
        'DELETE',
        `/tutorials/${encodeURIComponent(tutorialId)}/media-slots/${encodeURIComponent(sectionId)}`,
      ),
    onSuccess: () => invalidate(qc, tutorialId),
  });
}
