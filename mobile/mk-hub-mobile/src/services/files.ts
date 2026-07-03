import { File, Paths, type DownloadOptions } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { api } from "./api";
import { buildAuthenticatedFileUrl } from "../lib/fileUrls";
import { sanitizeFileName } from "../lib/filePreview";

export interface FilePreviewResponse {
  preview_url?: string;
  download_url?: string;
  expires_in?: number;
}

export interface FileDownloadResponse {
  download_url?: string;
  expires_in?: number;
}

export function getShareableFileUri(file: File): string {
  if (Platform.OS === "android" && file.contentUri) {
    return file.contentUri;
  }
  return file.uri;
}

export async function getFilePreview(
  fileObjectId: string
): Promise<FilePreviewResponse> {
  const response = await api.get<FilePreviewResponse>(
    `/files/${fileObjectId}/preview`
  );
  return response.data;
}

export async function getFileDownloadInfo(
  fileObjectId: string
): Promise<FileDownloadResponse> {
  const response = await api.get<FileDownloadResponse>(
    `/files/${fileObjectId}/download`
  );
  return response.data;
}

export async function resolvePreviewUrl(
  fileObjectId: string,
  token: string | null | undefined,
  kind: "image" | "pdf"
): Promise<string> {
  if (kind === "image") {
    return buildAuthenticatedFileUrl(fileObjectId, {
      token,
      variant: "inline"
    }).uri;
  }

  try {
    const preview = await getFilePreview(fileObjectId);
    if (preview.preview_url) {
      return preview.preview_url;
    }
  } catch {
    // fall through to inline URL
  }

  return buildAuthenticatedFileUrl(fileObjectId, {
    token,
    variant: "inline"
  }).uri;
}

function cacheDestination(originalName?: string | null): File {
  const safeName = sanitizeFileName(originalName || "file");
  return new File(Paths.cache, `${Date.now()}_${safeName}`);
}

async function downloadViaUrl(
  url: string,
  destination: File,
  options?: DownloadOptions
): Promise<File> {
  return File.downloadFileAsync(url, destination, {
    idempotent: true,
    ...options
  });
}

async function downloadViaAuthenticatedApi(
  fileObjectId: string,
  destination: File
): Promise<File> {
  if (destination.exists) {
    destination.delete();
  }
  destination.create({ overwrite: true });

  const response = await api.get<ArrayBuffer>(`/files/${fileObjectId}`, {
    responseType: "arraybuffer",
    timeout: 120000
  });

  destination.write(new Uint8Array(response.data));
  return destination;
}

export async function downloadProjectFileToCache(args: {
  fileObjectId: string;
  originalName?: string | null;
  token?: string | null;
}): Promise<File> {
  const destination = cacheDestination(args.originalName);

  try {
    const downloadInfo = await getFileDownloadInfo(args.fileObjectId);
    if (downloadInfo.download_url) {
      const downloaded = await downloadViaUrl(
        downloadInfo.download_url,
        destination
      );
      if (downloaded.exists && downloaded.size > 0) {
        return downloaded;
      }
    }
  } catch {
    // fall through to inline download
  }

  const source = buildAuthenticatedFileUrl(args.fileObjectId, {
    token: args.token,
    variant: "inline"
  });

  try {
    const downloaded = await downloadViaUrl(source.uri, destination, {
      headers: source.headers
    });
    if (downloaded.exists && downloaded.size > 0) {
      return downloaded;
    }
  } catch {
    // fall through to authenticated API download
  }

  return downloadViaAuthenticatedApi(args.fileObjectId, destination);
}

export async function shareLocalFile(
  file: File,
  options?: { mimeType?: string | null; dialogTitle?: string }
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  if (!file.exists || file.size <= 0) {
    throw new Error("File is not available to share.");
  }

  await Sharing.shareAsync(getShareableFileUri(file), {
    mimeType: options?.mimeType || undefined,
    dialogTitle: options?.dialogTitle
  });
}
