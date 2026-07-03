import { File, Paths } from "expo-file-system";
import { api } from "./api";
import { sanitizeFileName } from "../lib/filePreview";

export interface ProjectDocument {
  id: string;
  title: string;
  project_id?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export async function getProjectDocuments(
  projectId: string
): Promise<ProjectDocument[]> {
  const response = await api.get<ProjectDocument[]>("/document-creator/documents", {
    params: { project_id: projectId }
  });
  return response.data;
}

export async function exportDocumentPdfToCache(
  documentId: string,
  title?: string
): Promise<File> {
  const response = await api.post<ArrayBuffer>(
    `/document-creator/documents/${documentId}/export-pdf`,
    {},
    { responseType: "arraybuffer", timeout: 120000 }
  );

  const safeName = `${sanitizeFileName(title || "document")}.pdf`;
  const destination = new File(Paths.cache, `${Date.now()}_${safeName}`);
  if (destination.exists) destination.delete();
  destination.create({ overwrite: true });
  destination.write(new Uint8Array(response.data));
  return destination;
}
