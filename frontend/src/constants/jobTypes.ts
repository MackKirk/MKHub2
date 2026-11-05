/**
 * Fallback Job Types for shifts when Settings `job_types` is empty / unavailable.
 * Canonical catalog is seeded via ensure_job_types_list (Settings Lookup lists).
 */
export const JOB_TYPES = [
  { id: 'general_labor', name: 'General Labor' },
  { id: 'roofing', name: 'Roofing' },
  { id: 'installation', name: 'Installation' },
  { id: 'maintenance', name: 'Maintenance' },
  { id: 'inspection', name: 'Inspection' },
  { id: 'cleanup', name: 'Cleanup' },
  { id: 'repair', name: 'Repair' },
  { id: 'demolition', name: 'Demolition' },
  { id: 'safety', name: 'Safety' },
  { id: 'supervision', name: 'Supervision' },
  { id: 'leak_investigation', name: 'Leak Investigation' },
];

export type JobType = (typeof JOB_TYPES)[number];
