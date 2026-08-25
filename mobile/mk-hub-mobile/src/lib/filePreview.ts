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

/** Renders a PDF in WebView via PDF.js so Android does not download the file. */
export function buildPdfJsViewerHtml(base64: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4, user-scalable=yes" />
  <style>
    html, body { margin: 0; background: #111827; }
    #pages { padding: 8px; }
    canvas { width: 100%; height: auto; display: block; margin: 0 0 8px; background: #fff; }
  </style>
</head>
<body>
  <div id="pages"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    var raw = atob(${JSON.stringify(base64)});
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
      var host = document.getElementById("pages");
      var scale = 1.35;
      function render(n) {
        pdf.getPage(n).then(function (page) {
          var viewport = page.getViewport({ scale: scale });
          var canvas = document.createElement("canvas");
          var ctx = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          host.appendChild(canvas);
          page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            if (n < pdf.numPages) render(n + 1);
          });
        });
      }
      render(1);
    }).catch(function () {
      document.body.innerHTML =
        '<p style="color:#e5e7eb;font-family:sans-serif;padding:24px;text-align:center;">Could not render this PDF.</p>';
    });
  </script>
</body>
</html>`;
}
