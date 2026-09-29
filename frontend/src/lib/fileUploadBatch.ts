import toast from 'react-hot-toast';

export const MAX_FILES_PER_UPLOAD = 25;

export function rejectOversizedBatch(countOrFiles: number | ArrayLike<unknown>): boolean {
  const count = typeof countOrFiles === 'number' ? countOrFiles : countOrFiles.length;
  if (count <= MAX_FILES_PER_UPLOAD) return false;
  toast.error(`You can upload up to ${MAX_FILES_PER_UPLOAD} files at a time.`);
  return true;
}

/** PUT a blob to a presigned URL and report byte progress. Does not send the Hub auth token. */
export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
    xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error('Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });
}
