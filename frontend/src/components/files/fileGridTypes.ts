export type FileGridFileItem = {
  id: string;
  fileObjectId: string;
  name: string;
  isImage: boolean;
  uploadedAt?: string;
  /** Derived from PhotoObservation / technical folder policy (PR5–PR6). */
  needsClassification?: boolean;
  fieldworkPhrase?: string | null;
  fieldworkProtected?: boolean;
};

export type FileGridFolderItem = {
  id: string;
  name: string;
  fileCount?: number;
};

export function isFileGridImage(file: {
  is_image?: boolean;
  isImage?: boolean;
  content_type?: string;
}): boolean {
  const ct = String(file.content_type || '').toLowerCase();
  return Boolean(file.is_image || file.isImage || ct.startsWith('image/'));
}

export function toGridFileFromClientLike(file: {
  id: string;
  file_object_id: string;
  original_name?: string | null;
  uploaded_at?: string | null;
  is_image?: boolean;
  content_type?: string;
  needs_classification?: boolean;
  fieldwork?: {
    needs_classification?: boolean;
    phrase_text_snapshot?: string | null;
    protected?: boolean;
  } | null;
}): FileGridFileItem {
  const needs =
    Boolean(file.needs_classification) || Boolean(file.fieldwork?.needs_classification);
  return {
    id: file.id,
    fileObjectId: file.file_object_id,
    name: file.original_name || file.file_object_id,
    isImage: isFileGridImage(file),
    uploadedAt: file.uploaded_at || undefined,
    needsClassification: needs || undefined,
    fieldworkPhrase: file.fieldwork?.phrase_text_snapshot || null,
    fieldworkProtected: Boolean(file.fieldwork?.protected) || undefined,
  };
}

export function toGridFileFromCompanyDoc(file: {
  id: string;
  file_id?: string | null;
  title?: string | null;
  original_name?: string | null;
  created_at?: string | null;
  is_image?: boolean;
  content_type?: string;
}): FileGridFileItem | null {
  const fileObjectId = file.file_id ? String(file.file_id) : '';
  if (!fileObjectId) return null;
  return {
    id: file.id,
    fileObjectId,
    name: file.title || file.original_name || fileObjectId,
    isImage: isFileGridImage(file),
    uploadedAt: file.created_at || undefined,
  };
}

export function toGridFileFromWorkOrder(file: {
  id: string;
  file_object_id: string;
  original_name?: string | null;
  uploaded_at?: string | null;
  is_image?: boolean;
  content_type?: string;
}): FileGridFileItem {
  return {
    id: file.id,
    fileObjectId: file.file_object_id,
    name: file.original_name || file.file_object_id,
    isImage: isFileGridImage(file),
    uploadedAt: file.uploaded_at || undefined,
  };
}

export function partitionGridFiles<T>(
  files: T[],
  isImage: (file: T) => boolean,
  toGrid: (file: T) => FileGridFileItem | null,
): { imageFiles: FileGridFileItem[]; nonImageFiles: T[] } {
  const imageFiles: FileGridFileItem[] = [];
  const nonImageFiles: T[] = [];
  for (const file of files) {
    if (isImage(file)) {
      const mapped = toGrid(file);
      if (mapped) imageFiles.push(mapped);
    } else {
      nonImageFiles.push(file);
    }
  }
  return { imageFiles, nonImageFiles };
}
