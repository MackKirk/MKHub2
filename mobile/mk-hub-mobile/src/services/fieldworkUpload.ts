import { api } from "./api";

/** Fallback only — prefer record settings.default_pictures_folder (Site Assessment → Proposal Photos, Work Report → Invoice Photos). */
export const FIELDWORK_PHOTO_CATEGORY = "Proposal Photos";

/**
 * Upload via FileObject (`/files/upload-proxy`), then attach as project ClientFile.
 * Same bytes appear in Fieldwork and Files — no disconnected temporary store.
 * Attach is idempotent on the server (reuses existing ClientFile for the FileObject).
 */
export async function uploadFieldworkPhotoFile(args: {
  projectId: string;
  file: { uri: string; name: string; type: string };
  category?: string;
}): Promise<{ fileObjectId: string; clientFileId: string | null }> {
  const category = args.category || FIELDWORK_PHOTO_CATEGORY;
  const form = new FormData();
  form.append("file", {
    uri: args.file.uri,
    name: args.file.name,
    type: args.file.type
  } as unknown as Blob);
  form.append("original_name", args.file.name);
  form.append("content_type", args.file.type);
  form.append("project_id", args.projectId);
  form.append("client_id", "");
  form.append("employee_id", "");
  form.append("category_id", category);

  const uploadResp = await api.post<{ id: string; key: string }>(
    "/files/upload-proxy",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  const fileObjectId = uploadResp.data.id;

  let clientFileId: string | null = null;
  try {
    const attach = await api.post<{ id?: string; reused?: boolean }>(
      `/projects/${encodeURIComponent(args.projectId)}/files`,
      null,
      {
        params: {
          file_object_id: fileObjectId,
          category,
          original_name: args.file.name
        }
      }
    );
    clientFileId = attach.data?.id ? String(attach.data.id) : null;
  } catch {
    // FileObject exists; photo create will ensure ClientFile via server-side attach repair.
    clientFileId = null;
  }

  return { fileObjectId, clientFileId };
}
