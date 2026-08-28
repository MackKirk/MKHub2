import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatDateLocal } from "./dateUtils";

const HOUR_MS = 60 * 60 * 1000;

export type PendingAlertCadence = {
  clockDate?: string;
  tasksDate?: string;
  urgentAt?: number;
};

export type PendingAlertBuckets = {
  hasClock: boolean;
  hasTasks: boolean;
  hasUrgent: boolean;
};

function storageKey(userId: string): string {
  return `pending-alert-cadence:${userId}`;
}

export async function loadPendingAlertCadence(
  userId: string
): Promise<PendingAlertCadence> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PendingAlertCadence;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function savePendingAlertCadence(
  userId: string,
  cadence: PendingAlertCadence
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(cadence));
}

export function pendingAlertEligibility(
  buckets: PendingAlertBuckets,
  cadence: PendingAlertCadence,
  now = Date.now()
): PendingAlertBuckets {
  const today = formatDateLocal(new Date(now));
  return {
    hasClock: buckets.hasClock && cadence.clockDate !== today,
    hasTasks: buckets.hasTasks && cadence.tasksDate !== today,
    hasUrgent:
      buckets.hasUrgent &&
      (cadence.urgentAt == null || now - cadence.urgentAt >= HOUR_MS)
  };
}

export function markPendingAlertsShown(
  cadence: PendingAlertCadence,
  shown: PendingAlertBuckets,
  now = Date.now()
): PendingAlertCadence {
  const today = formatDateLocal(new Date(now));
  return {
    clockDate: shown.hasClock ? today : cadence.clockDate,
    tasksDate: shown.hasTasks ? today : cadence.tasksDate,
    urgentAt: shown.hasUrgent ? now : cadence.urgentAt
  };
}
