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

  const bytes = new Uint8Array(response.data);
  const looksLikePdf =
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46;
  if (!looksLikePdf) {
    throw new Error("Could not generate a PDF for this document.");
  }

  const safeName = `${sanitizeFileName(title || "document")}.pdf`;
  const destination = new File(Paths.cache, `${Date.now()}_${safeName}`);
  if (destination.exists) destination.delete();
  destination.create({ overwrite: true });
  destination.write(bytes);
  return destination;
}
