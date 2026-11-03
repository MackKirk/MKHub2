import { File, Paths } from "expo-file-system";
import { api } from "./api";
import { sanitizeFileName } from "../lib/filePreview";
import type {
  SignatureInboxResponse,
  SignatureSource,
  SigningContext
} from "../types/signatures";

function previewPath(source: SignatureSource, id: string): string {
  if (source === "onboarding") {
    return `/auth/me/onboarding/documents/${id}/preview`;
  }
  return `/auth/me/document-signature-requests/${id}/preview`;
}

function contextPath(source: SignatureSource, id: string): string {
  if (source === "onboarding") {
    return `/auth/me/onboarding/documents/${id}/signing-context`;
  }
  return `/auth/me/document-signature-requests/${id}/signing-context`;
}

function signPath(source: SignatureSource, id: string): string {
  if (source === "onboarding") {
    return `/auth/me/onboarding/sign`;
  }
  return `/auth/me/document-signature-requests/${id}/sign`;
}

export async function listMySignatures(): Promise<SignatureInboxResponse> {
  const response = await api.get<SignatureInboxResponse>("/auth/me/signatures");
  return (
    response.data ?? {
      items: [],
      sections: { action_required: 0, waiting: 0, completed: 0 }
    }
  );
}

export async function getSigningContext(
  source: SignatureSource,
  id: string
): Promise<SigningContext> {
  const response = await api.get<SigningContext>(contextPath(source, id));
  return response.data;
}

export async function downloadSignaturePreviewToCache(
  source: SignatureSource,
  id: string,
  title?: string | null
): Promise<File> {
  const response = await api.get<ArrayBuffer>(previewPath(source, id), {
    responseType: "arraybuffer",
    timeout: 120000
  });
  const bytes = new Uint8Array(response.data);
  const looksLikePdf =
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46;
  if (!looksLikePdf) {
    throw new Error("Could not load the document PDF.");
  }
  const safeName = `${sanitizeFileName(title || "document")}.pdf`;
  const destination = new File(Paths.cache, `sign_${Date.now()}_${safeName}`);
  if (destination.exists) destination.delete();
  destination.create({ overwrite: true });
  destination.write(bytes);
  return destination;
}

export async function downloadSignedPreviewToCache(args: {
  source: SignatureSource;
  id: string;
  signedFileId?: string | null;
  title?: string | null;
}): Promise<File> {
  const path =
    args.source === "document_builder"
      ? `/auth/me/document-signature-requests/${args.id}/signed-preview`
      : args.signedFileId
        ? `/files/${args.signedFileId}`
        : null;
  if (!path) {
    throw new Error("Signed PDF is not available yet.");
  }
  const response = await api.get<ArrayBuffer>(path, {
    responseType: "arraybuffer",
    timeout: 120000
  });
  const bytes = new Uint8Array(response.data);
  const looksLikePdf =
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46;
  if (!looksLikePdf) {
    throw new Error("Could not load the signed PDF.");
  }
  const safeName = `${sanitizeFileName(args.title || "document")}_signed.pdf`;
  const destination = new File(Paths.cache, `signed_${Date.now()}_${safeName}`);
  if (destination.exists) destination.delete();
  destination.create({ overwrite: true });
  destination.write(bytes);
  return destination;
}

export async function signDocument(args: {
  source: SignatureSource;
  id: string;
  fieldValues: Record<string, unknown>;
  /** Legacy onboarding only (no template). */
  signatureBase64?: string;
}): Promise<void> {
  const form = new FormData();
  form.append("agreement", "true");
  form.append("field_values_json", JSON.stringify(args.fieldValues ?? {}));
  if (args.source === "onboarding") {
    form.append("assignment_item_id", args.id);
    form.append("signature_base64", args.signatureBase64 || "");
  }
  await api.post(signPath(args.source, args.id), form, {
    timeout: 120000
  });
}
