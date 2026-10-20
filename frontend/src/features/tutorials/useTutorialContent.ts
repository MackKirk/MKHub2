import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TutorialContentResponse, TutorialContentSection, TutorialId } from './types';
import { tutorialMediaSlotsQueryKey } from './useTutorialMediaSlots';

export function tutorialContentQueryKey(tutorialId: TutorialId) {
  return ['tutorial-content', tutorialId] as const;
}

export function useTutorialContent(tutorialId: TutorialId | undefined, enabled = true) {
  return useQuery({
    queryKey: tutorialContentQueryKey(tutorialId || ''),
    queryFn: () =>
      api<TutorialContentResponse>(
        'GET',
        `/tutorials/${encodeURIComponent(tutorialId!)}/content`,
      ),
    enabled: Boolean(tutorialId) && enabled,
    staleTime: 15_000,
  });
}

function invalidateTutorial(qc: ReturnType<typeof useQueryClient>, tutorialId: TutorialId) {
  void qc.invalidateQueries({ queryKey: tutorialContentQueryKey(tutorialId) });
  void qc.invalidateQueries({ queryKey: tutorialMediaSlotsQueryKey(tutorialId) });
}

export function useUpsertTutorialSection(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      sectionId: string;
      title: string;
      body_md: string;
      allows_media: boolean;
    }) =>
      api<{ section: TutorialContentSection }>(
        'PUT',
        `/tutorials/${encodeURIComponent(tutorialId)}/sections/${encodeURIComponent(payload.sectionId)}`,
        {
          title: payload.title,
          body_md: payload.body_md,
          allows_media: payload.allows_media,
        },
      ),
    onSuccess: () => invalidateTutorial(qc, tutorialId),
  });
}

export function useCreateTutorialSection(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      title: string;
      body_md: string;
      allows_media: boolean;
      after_section_id?: string;
    }) =>
      api<{ section: TutorialContentSection }>(
        'POST',
        `/tutorials/${encodeURIComponent(tutorialId)}/sections`,
        payload,
      ),
    onSuccess: () => invalidateTutorial(qc, tutorialId),
  });
}

export function useReorderTutorialSections(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (section_ids: string[]) =>
      api<TutorialContentResponse>(
        'PUT',
        `/tutorials/${encodeURIComponent(tutorialId)}/sections/reorder`,
        { section_ids },
      ),
    onSuccess: () => invalidateTutorial(qc, tutorialId),
  });
}

export function useResetTutorialSection(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      api<{ section: TutorialContentSection | null; sections: TutorialContentSection[] }>(
        'POST',
        `/tutorials/${encodeURIComponent(tutorialId)}/sections/${encodeURIComponent(sectionId)}/reset`,
      ),
    onSuccess: () => invalidateTutorial(qc, tutorialId),
  });
}

export function useDeleteTutorialSection(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      api<{ ok: boolean; action: string; sections: TutorialContentSection[] }>(
        'DELETE',
        `/tutorials/${encodeURIComponent(tutorialId)}/sections/${encodeURIComponent(sectionId)}`,
      ),
    onSuccess: () => invalidateTutorial(qc, tutorialId),
  });
}

export function useUnhideTutorialSection(tutorialId: TutorialId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) =>
      api<{
        section: TutorialContentSection;
        sections: TutorialContentSection[];
        hidden_sections: TutorialContentResponse['hidden_sections'];
      }>(
        'POST',
        `/tutorials/${encodeURIComponent(tutorialId)}/sections/${encodeURIComponent(sectionId)}/unhide`,
      ),
    onSuccess: () => invalidateTutorial(qc, tutorialId),
  });
}
