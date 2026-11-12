import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FieldworkPendingPhoto } from "../types/fieldwork";

export type FieldworkLocalDraft = {
  recordId: string;
  projectId: string;
  formPayload: Record<string, unknown>;
  finalComments: string;
  pendingPhotos: FieldworkPendingPhoto[];
  lastPhraseByEntryType?: Partial<Record<"observation" | "work_performed", string>>;
  updatedAt: string;
};

function key(projectId: string, recordId: string): string {
  return `fieldwork:draft:${projectId}:${recordId}`;
}

export async function loadFieldworkDraft(
  projectId: string,
  recordId: string
): Promise<FieldworkLocalDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key(projectId, recordId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FieldworkLocalDraft;
    if (!parsed || parsed.recordId !== recordId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveFieldworkDraft(draft: FieldworkLocalDraft): Promise<void> {
  const payload: FieldworkLocalDraft = {
    ...draft,
    updatedAt: new Date().toISOString()
  };
  await AsyncStorage.setItem(key(draft.projectId, draft.recordId), JSON.stringify(payload));
}

export async function clearFieldworkDraft(projectId: string, recordId: string): Promise<void> {
  await AsyncStorage.removeItem(key(projectId, recordId));
}

export function newPendingPhotoId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function newClientMutationId(): string {
  return `cm_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}
