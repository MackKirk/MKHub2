import { isImageContentType } from "./fileUrls";
import type { ProjectFileItem } from "../types/projects";

export type ProjectFilePreviewKind = "image" | "pdf" | "other";

export function getProjectFilePreviewKind(
  file: Pick<ProjectFileItem, "is_image" | "content_type" | "original_name">
): ProjectFilePreviewKind {
  if (file.is_image || isImageContentType(file.content_type, file.original_name)) {
    return "image";
  }
  const name = String(file.original_name || "").toLowerCase();
  const contentType = String(file.content_type || "").toLowerCase();
  if (contentType.includes("pdf") || name.endsWith(".pdf")) {
    return "pdf";
  }
  return "other";
}

export function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || "file";
  return trimmed.replace(/[^\w.\-() ]+/g, "_");
}
