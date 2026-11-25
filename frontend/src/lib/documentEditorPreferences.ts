export type TextEditExitMode = 'require_done' | 'click_outside';

/** Keep in sync with DocumentEditorRibbon ZOOM_LEVELS + backend ALLOWED_ZOOM_LEVELS. */
export const DOCUMENT_EDITOR_ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2] as const;

export type DocumentEditorZoomLevel = (typeof DOCUMENT_EDITOR_ZOOM_LEVELS)[number];

export type DocumentEditorPreferences = {
  text_edit_exit: TextEditExitMode;
  snap_to_guides: boolean;
  show_drag_guides: boolean;
  default_zoom: number;
};

export const DOCUMENT_EDITOR_PREFERENCES_QUERY_KEY = ['me-document-editor-preferences'] as const;

export const DEFAULT_DOCUMENT_EDITOR_PREFERENCES: DocumentEditorPreferences = {
  text_edit_exit: 'require_done',
  snap_to_guides: true,
  show_drag_guides: true,
  default_zoom: 0.8,
};

export function nearestDocumentEditorZoom(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_DOCUMENT_EDITOR_PREFERENCES.default_zoom;
  let best: number = DOCUMENT_EDITOR_ZOOM_LEVELS[0];
  let bestDist = Math.abs(best - value);
  for (const level of DOCUMENT_EDITOR_ZOOM_LEVELS) {
    const dist = Math.abs(level - value);
    if (dist < bestDist) {
      best = level;
      bestDist = dist;
    }
  }
  return best;
}

export function normalizeDocumentEditorPreferences(raw: unknown): DocumentEditorPreferences {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode = String(data.text_edit_exit || '').trim();
  return {
    text_edit_exit: mode === 'click_outside' ? 'click_outside' : 'require_done',
    snap_to_guides: data.snap_to_guides === false ? false : true,
    show_drag_guides: data.show_drag_guides === false ? false : true,
    default_zoom: nearestDocumentEditorZoom(
      Object.prototype.hasOwnProperty.call(data, 'default_zoom')
        ? data.default_zoom
        : DEFAULT_DOCUMENT_EDITOR_PREFERENCES.default_zoom,
    ),
  };
}
