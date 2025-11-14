/**
 * Pre-defined job types for shifts
 * This list can be extended or replaced with an API endpoint in the future
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
];

export type JobType = typeof JOB_TYPES[number];




