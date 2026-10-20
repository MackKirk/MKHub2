import type { ProjectLine } from '@/lib/projectLinePermissions';

export type TutorialId = string;

export type TutorialMedia = {
  type: 'image';
  src: string;
  alt: string;
};

export type TutorialRelatedLink = {
  label: string;
  tutorialId?: TutorialId;
  href?: string;
};

export type TutorialCategory = {
  id: string;
  label: string;
};

/** Access: user needs menu access to any of the listed project lines. */
export type TutorialAccess = {
  kind: 'anyProjectLine';
  lines: ProjectLine[];
};

/** Registry metadata only — section copy lives in API (seed + admin overrides). */
export type Tutorial = {
  id: TutorialId;
  title: string;
  summary: string;
  category: TutorialCategory;
  access: TutorialAccess;
  related?: TutorialRelatedLink[];
};

export type TutorialContentSection = {
  id: string;
  title: string;
  body_md: string;
  allows_media: boolean;
  origin: 'seed' | 'custom';
  is_overridden: boolean;
  sort_order: number;
};

export type TutorialHiddenSection = {
  id: string;
  title: string;
  origin: 'seed' | 'custom' | string;
};

export type TutorialContentResponse = {
  tutorial_id: string;
  sections: TutorialContentSection[];
  /** Present for admins only. */
  hidden_sections?: TutorialHiddenSection[];
};

export type TutorialCategoryGroup = {
  category: TutorialCategory;
  tutorials: Tutorial[];
};
