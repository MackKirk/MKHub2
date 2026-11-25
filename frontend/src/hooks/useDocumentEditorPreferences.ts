import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  DEFAULT_DOCUMENT_EDITOR_PREFERENCES,
  DOCUMENT_EDITOR_PREFERENCES_QUERY_KEY,
  normalizeDocumentEditorPreferences,
  type DocumentEditorPreferences,
  type TextEditExitMode,
} from '@/lib/documentEditorPreferences';

export function useDocumentEditorPreferences(enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DOCUMENT_EDITOR_PREFERENCES_QUERY_KEY,
    queryFn: async () =>
      normalizeDocumentEditorPreferences(
        await api<unknown>('GET', '/users/me/document-editor-preferences'),
      ),
    enabled,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<DocumentEditorPreferences>) =>
      normalizeDocumentEditorPreferences(
        await api<unknown>('PUT', '/users/me/document-editor-preferences', patch),
      ),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: DOCUMENT_EDITOR_PREFERENCES_QUERY_KEY });
      const previous =
        queryClient.getQueryData<DocumentEditorPreferences>(DOCUMENT_EDITOR_PREFERENCES_QUERY_KEY) ??
        DEFAULT_DOCUMENT_EDITOR_PREFERENCES;
      const next = normalizeDocumentEditorPreferences({ ...previous, ...patch });
      queryClient.setQueryData(DOCUMENT_EDITOR_PREFERENCES_QUERY_KEY, next);
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(DOCUMENT_EDITOR_PREFERENCES_QUERY_KEY, ctx.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(DOCUMENT_EDITOR_PREFERENCES_QUERY_KEY, data);
    },
  });

  const prefs = query.data ?? DEFAULT_DOCUMENT_EDITOR_PREFERENCES;

  const patchPrefs = (patch: Partial<DocumentEditorPreferences>) => {
    const next = normalizeDocumentEditorPreferences({ ...prefs, ...patch });
    const changed = (Object.keys(patch) as (keyof DocumentEditorPreferences)[]).some(
      (key) => next[key] !== prefs[key],
    );
    if (!changed) return;
    mutation.mutate(patch);
  };

  return {
    preferences: prefs,
    textEditExitMode: prefs.text_edit_exit as TextEditExitMode,
    snapToGuides: prefs.snap_to_guides,
    showDragGuides: prefs.show_drag_guides,
    defaultZoom: prefs.default_zoom,
    isLoading: query.isLoading,
    isFetched: query.isFetched,
    setTextEditExitMode: (mode: TextEditExitMode) => patchPrefs({ text_edit_exit: mode }),
    setSnapToGuides: (value: boolean) => patchPrefs({ snap_to_guides: value }),
    setShowDragGuides: (value: boolean) => patchPrefs({ show_drag_guides: value }),
    setDefaultZoom: (zoom: number) => patchPrefs({ default_zoom: zoom }),
    isSaving: mutation.isPending,
  };
}
