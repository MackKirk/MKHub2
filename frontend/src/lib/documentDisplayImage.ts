/**
 * One on-screen width for document images.
 * The original file stays in storage. The server keeps a single disk copy at this width.
 */
export const DOCUMENT_DISPLAY_IMAGE_WIDTH = 1600;

export function documentFileThumbnailPath(fileId: string): string {
  return `/files/${fileId}/thumbnail?w=${DOCUMENT_DISPLAY_IMAGE_WIDTH}`;
}
