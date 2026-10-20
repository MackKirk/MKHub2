import type { Tutorial } from '../types';

export const OPPORTUNITIES_LIST_TUTORIAL_ID = 'opportunities.list' as const;

/** Metadata only — section markdown lives in backend seed + admin overrides. */
export const opportunitiesListTutorial: Tutorial = {
  id: OPPORTUNITIES_LIST_TUTORIAL_ID,
  title: 'Opportunities',
  summary: 'Create bids, work the pipeline, and convert awarded work to projects.',
  category: { id: 'production', label: 'Production' },
  access: { kind: 'anyProjectLine', lines: ['construction', 'repairs'] },
};
