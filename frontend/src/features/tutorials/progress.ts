import type { TutorialId } from './types';

const STORAGE_PREFIX = 'mkhub_tutorial_seen:';

function storageKey(tutorialId: TutorialId): string {
  return `${STORAGE_PREFIX}${tutorialId}`;
}

export function isTutorialSeen(tutorialId: TutorialId): boolean {
  try {
    return localStorage.getItem(storageKey(tutorialId)) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(tutorialId: TutorialId): void {
  try {
    localStorage.setItem(storageKey(tutorialId), '1');
  } catch {
    /* ignore quota / private mode */
  }
}
