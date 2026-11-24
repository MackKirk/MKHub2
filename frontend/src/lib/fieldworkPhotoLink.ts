import { api } from '@/lib/api';

export type FieldworkPhotoClassifyMeta = {
  entryType: 'observation' | 'work_performed';
  phraseItemIds: string[];
  phraseTexts: string[];
};

type PhotoRow = {
  id: string;
  file_object_id?: string | null;
  entry_type?: string | null;
  phrase_item_id?: string | null;
  extra_notes?: string | null;
};

type PhotoMutationResult = {
  id: string;
  file_object_id?: string;
  record_row_version?: number;
};

export function isPhotoClassifyMeta(v: unknown): v is FieldworkPhotoClassifyMeta {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const entry = o.entryType;
  const ids = o.phraseItemIds;
  const texts = o.phraseTexts;
  return (
    (entry === 'observation' || entry === 'work_performed') &&
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every((x) => typeof x === 'string' && x.trim()) &&
    Array.isArray(texts)
  );
}

function normalizeExtraNotes(value: string | null | undefined): string {
  return String(value || '').trim();
}

function classificationMatches(
  photo: PhotoRow,
  classify: FieldworkPhotoClassifyMeta,
  extraNotes: string | null
): boolean {
  const primaryId = classify.phraseItemIds[0] || '';
  return (
    String(photo.phrase_item_id || '') === primaryId &&
    String(photo.entry_type || '').toLowerCase() === classify.entryType &&
    normalizeExtraNotes(photo.extra_notes) === normalizeExtraNotes(extraNotes)
  );
}

/**
 * Create or update FieldworkPhotoObservation rows for the given file ids.
 * New files are POSTed; already-linked files are PATCHed when phrase/entry/notes changed
 * (needed when a report is returned for edits and the technician updates captions).
 */
export async function ensureFieldworkPhotosLinked(args: {
  projectId: string;
  recordId: string;
  fileObjectIds: string[];
  classify: FieldworkPhotoClassifyMeta;
  expectedRowVersion: number | null;
}): Promise<{
  linked: number;
  updated: number;
  skipped: number;
  recordRowVersion: number | null;
}> {
  const { projectId, recordId, classify } = args;
  const fileIds = [...new Set(args.fileObjectIds.map((x) => String(x || '').trim()).filter(Boolean))];
  if (!fileIds.length) {
    return { linked: 0, updated: 0, skipped: 0, recordRowVersion: args.expectedRowVersion };
  }
  const primaryId = classify.phraseItemIds[0];
  if (!primaryId) {
    throw new Error('Select at least one catalog phrase');
  }
  const extra =
    classify.phraseTexts.length > 1 ? classify.phraseTexts.slice(1).join('\n') : null;

  const existing = await api<PhotoRow[]>(
    'GET',
    `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/photos`
  );
  const byFile = new Map<string, PhotoRow>();
  for (const p of existing || []) {
    const fo = String(p.file_object_id || '').trim();
    if (fo) byFile.set(fo, p);
  }

  let rowVersion = args.expectedRowVersion;
  let linked = 0;
  let updated = 0;
  let skipped = 0;

  for (const fileObjectId of fileIds) {
    const current = byFile.get(fileObjectId);
    if (current) {
      if (classificationMatches(current, classify, extra)) {
        skipped += 1;
        continue;
      }
      const patched = await api<PhotoMutationResult>(
        'PATCH',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/photos/${encodeURIComponent(current.id)}`,
        {
          entry_type: classify.entryType,
          phrase_item_id: primaryId,
          // Empty string clears prior notes (API ignores JSON null).
          extra_notes: extra ?? '',
          expected_row_version: rowVersion,
        }
      );
      updated += 1;
      if (typeof patched.record_row_version === 'number') {
        rowVersion = patched.record_row_version;
      } else if (typeof rowVersion === 'number') {
        rowVersion = rowVersion + 1;
      }
      continue;
    }

    const created = await api<PhotoMutationResult>(
      'POST',
      `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/photos`,
      {
        file_object_id: fileObjectId,
        entry_type: classify.entryType,
        phrase_item_id: primaryId,
        extra_notes: extra,
        expected_row_version: rowVersion,
      }
    );
    linked += 1;
    byFile.set(fileObjectId, {
      id: created.id,
      file_object_id: fileObjectId,
      entry_type: classify.entryType,
      phrase_item_id: primaryId,
      extra_notes: extra,
    });
    if (typeof created.record_row_version === 'number') {
      rowVersion = created.record_row_version;
    } else if (typeof rowVersion === 'number') {
      rowVersion = rowVersion + 1;
    }
  }

  return { linked, updated, skipped, recordRowVersion: rowVersion };
}

/** Collect image ids + classify meta from a fieldwork form_payload. */
export function collectFieldworkImageClassifications(
  formPayload: Record<string, unknown>
): { fieldKey: string; fileObjectIds: string[]; classify: FieldworkPhotoClassifyMeta | null }[] {
  const out: {
    fieldKey: string;
    fileObjectIds: string[];
    classify: FieldworkPhotoClassifyMeta | null;
  }[] = [];

  const side = formPayload._fieldComments;
  if (side && typeof side === 'object' && !Array.isArray(side)) {
    for (const [fieldKey, raw] of Object.entries(side as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const o = raw as Record<string, unknown>;
      const arr = o.imageIds ?? o.images;
      const imageIds = Array.isArray(arr)
        ? arr.filter((x): x is string => typeof x === 'string' && !!x.trim())
        : [];
      if (!imageIds.length) continue;
      out.push({
        fieldKey,
        fileObjectIds: imageIds,
        classify: isPhotoClassifyMeta(o.photoClassify) ? o.photoClassify : null,
      });
    }
  }

  for (const [key, raw] of Object.entries(formPayload)) {
    if (key.startsWith('_')) continue;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    if (!('commentImageIds' in o) && !('status' in o && 'comments' in o)) continue;
    const imgs = o.commentImageIds;
    const imageIds = Array.isArray(imgs)
      ? imgs.filter((x): x is string => typeof x === 'string' && !!x.trim())
      : [];
    if (!imageIds.length) continue;
    out.push({
      fieldKey: key,
      fileObjectIds: imageIds,
      classify: isPhotoClassifyMeta(o.photoClassify) ? o.photoClassify : null,
    });
  }

  return out;
}
