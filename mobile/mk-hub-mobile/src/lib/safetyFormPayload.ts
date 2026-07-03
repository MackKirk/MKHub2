export type SideCommentEntry = { text: string; imageIds: string[] };

export const SIDE_COMMENT_PAYLOAD_KEY = "_fieldComments";
export const ADDITIONAL_COMMENTS_PAYLOAD_KEY = "_additionalComments";
export const WORKER_SIGNATURE_HIGHLIGHT_KEY = "__dynamic_worker_signature__";

export function parseSideCommentRaw(raw: unknown): SideCommentEntry {
  if (typeof raw === "string") return { text: raw, imageIds: [] };
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const t = typeof o.text === "string" ? o.text : "";
    const arr = o.imageIds ?? o.images ?? o.image_ids;
    const imageIds = Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string")
      : [];
    return { text: t, imageIds };
  }
  return { text: "", imageIds: [] };
}

export function serializeSideCommentEntry(entry: SideCommentEntry): unknown | undefined {
  const text = entry.text;
  const ids = [...new Set(entry.imageIds.filter(Boolean))];
  if (!text.trim() && ids.length === 0) return undefined;
  if (ids.length === 0) return text;
  return { text, imageIds: ids };
}

function getRawSideCommentsBucket(p: Record<string, unknown>): Record<string, unknown> {
  const v = p[SIDE_COMMENT_PAYLOAD_KEY];
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return { ...(v as Record<string, unknown>) };
}

export function getSideCommentForField(
  p: Record<string, unknown>,
  fieldKey: string
): SideCommentEntry {
  const bucket = getRawSideCommentsBucket(p);
  return parseSideCommentRaw(bucket[fieldKey]);
}

export function mergeSideComment(
  prev: Record<string, unknown>,
  fieldKey: string,
  entry: SideCommentEntry
): Record<string, unknown> {
  const bucket = getRawSideCommentsBucket(prev);
  const serialized = serializeSideCommentEntry(entry);
  if (serialized === undefined) delete bucket[fieldKey];
  else bucket[fieldKey] = serialized;
  const out = { ...prev };
  if (Object.keys(bucket).length === 0) delete out[SIDE_COMMENT_PAYLOAD_KEY];
  else out[SIDE_COMMENT_PAYLOAD_KEY] = bucket;
  return out;
}

export function getAdditionalComments(p: Record<string, unknown>): SideCommentEntry {
  return parseSideCommentRaw(p[ADDITIONAL_COMMENTS_PAYLOAD_KEY]);
}

export function mergeAdditionalComments(
  prev: Record<string, unknown>,
  entry: SideCommentEntry
): Record<string, unknown> {
  const serialized = serializeSideCommentEntry(entry);
  const out = { ...prev };
  if (serialized === undefined) delete out[ADDITIONAL_COMMENTS_PAYLOAD_KEY];
  else out[ADDITIONAL_COMMENTS_PAYLOAD_KEY] = serialized;
  return out;
}

export function getStr(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  return typeof v === "string" ? v : "";
}

export function getStrArr(p: Record<string, unknown>, k: string): string[] {
  const v = p[k];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function getYn(p: Record<string, unknown>, k: string): {
  status: "yes" | "no" | "na" | "";
  comments: string;
  commentImageIds: string[];
} {
  const v = p[k];
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return { status: "", comments: "", commentImageIds: [] };
  }
  const o = v as {
    status?: string;
    comments?: string;
    commentImageIds?: unknown;
    comment_image_ids?: unknown;
  };
  const s = o.status;
  const status = s === "yes" || s === "no" || s === "na" ? s : "";
  const imgs = o.commentImageIds ?? o.comment_image_ids;
  const commentImageIds = Array.isArray(imgs)
    ? imgs.filter((x): x is string => typeof x === "string")
    : [];
  return {
    status,
    comments: typeof o.comments === "string" ? o.comments : "",
    commentImageIds
  };
}

export function getPft(
  p: Record<string, unknown>,
  k: string
): { pass: number; fail: number; na: number } {
  const v = p[k];
  if (!v || typeof v !== "object" || Array.isArray(v)) return { pass: 0, fail: 0, na: 0 };
  const o = v as Record<string, unknown>;
  const n = (x: unknown) =>
    typeof x === "number" && !Number.isNaN(x) ? x : parseInt(String(x), 10) || 0;
  return { pass: n(o.pass), fail: n(o.fail), na: n(o.na) };
}

export function getGps(p: Record<string, unknown>, k: string): { lat: string; lng: string } {
  const v = p[k];
  if (!v || typeof v !== "object" || Array.isArray(v)) return { lat: "", lng: "" };
  const o = v as { lat?: unknown; lng?: unknown };
  return {
    lat:
      typeof o.lat === "number"
        ? String(o.lat)
        : typeof o.lat === "string"
          ? o.lat
          : "",
    lng:
      typeof o.lng === "number"
        ? String(o.lng)
        : typeof o.lng === "string"
          ? o.lng
          : ""
  };
}

export function getFileIds(p: Record<string, unknown>, k: string): string[] {
  const v = p[k];
  if (typeof v === "string" && v) return [v];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const ids = (v as { file_object_ids?: unknown }).file_object_ids;
    if (Array.isArray(ids)) return ids.filter((x): x is string => typeof x === "string");
  }
  return [];
}

export function setFileIds(
  multi: boolean,
  ids: string[]
): string | { file_object_ids: string[] } | "" {
  if (multi) return { file_object_ids: ids };
  return ids[0] || "";
}
