import { api } from "./api";
import type { OnboardingDocumentRow, SignatureRequestRow } from "../types/inbox";

function isReadyToSign(row: SignatureRequestRow): boolean {
  const mine = row.my_status || (row.status === "pending" ? "ready" : row.status);
  return mine === "ready";
}

export async function getPendingSignatureRequests(): Promise<SignatureRequestRow[]> {
  try {
    const response = await api.get<SignatureRequestRow[]>(
      "/auth/me/document-signature-requests"
    );
    const rows = Array.isArray(response.data) ? response.data : [];
    return rows.filter(isReadyToSign);
  } catch {
    return [];
  }
}

export async function getPendingOnboardingDocuments(): Promise<OnboardingDocumentRow[]> {
  try {
    const response = await api.get<OnboardingDocumentRow[]>(
      "/auth/me/onboarding/documents"
    );
    const rows = Array.isArray(response.data) ? response.data : [];
    return rows.filter((row) => row.status === "pending");
  } catch {
    return [];
  }
}
