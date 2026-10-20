import { canAccessProjectLineMenu } from '@/lib/projectLinePermissionKeys';
import { documentsBuilderTutorial } from './content/documentsBuilder';
import { opportunitiesListTutorial } from './content/opportunitiesList';
import type { Tutorial, TutorialCategoryGroup, TutorialId } from './types';

const tutorialsById: Record<string, Tutorial> = {
  [opportunitiesListTutorial.id]: opportunitiesListTutorial,
  [documentsBuilderTutorial.id]: documentsBuilderTutorial,
};

export function tutorialPath(id: TutorialId): string {
  return `/tutorials/${encodeURIComponent(id)}`;
}

export function listTutorials(): Tutorial[] {
  return Object.values(tutorialsById);
}

export function getTutorial(id: TutorialId): Tutorial | undefined {
  return tutorialsById[id];
}

export function canAccessTutorial(
  tutorial: Tutorial,
  permissions: Set<string> | string[],
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  if (tutorial.access.kind === 'anyProjectLine') {
    return tutorial.access.lines.some((line) => canAccessProjectLineMenu(permissions, line, false));
  }
  return false;
}

export function listAccessibleTutorials(
  permissions: Set<string> | string[],
  isAdmin = false,
): Tutorial[] {
  return listTutorials().filter((t) => canAccessTutorial(t, permissions, isAdmin));
}

/** Group accessible tutorials by category; empty categories omitted. */
export function listAccessibleTutorialGroups(
  permissions: Set<string> | string[],
  isAdmin = false,
): TutorialCategoryGroup[] {
  const accessible = listAccessibleTutorials(permissions, isAdmin);
  const byCategory = new Map<string, TutorialCategoryGroup>();
  for (const tutorial of accessible) {
    const key = tutorial.category.id;
    let group = byCategory.get(key);
    if (!group) {
      group = { category: tutorial.category, tutorials: [] };
      byCategory.set(key, group);
    }
    group.tutorials.push(tutorial);
  }
  return Array.from(byCategory.values());
}
