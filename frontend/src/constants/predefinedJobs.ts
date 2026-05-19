export type PredefinedJob = {
  id: string;
  code: string;
  name: string;
};

/** Shared job codes used for direct clock-in (job_type). */
export const PREDEFINED_JOBS: PredefinedJob[] = [
  { id: '0', code: '0', name: 'No Project Assigned' },
  { id: '37', code: '37', name: 'Repairs' },
  { id: '47', code: '47', name: 'Shop' },
  { id: '53', code: '53', name: 'YPK Developments' },
  { id: '136', code: '136', name: 'Stat Holiday' },
];

export function formatJobPickerLine(job: { name: string; code?: string | null }): string {
  const code = job.code?.trim();
  return code ? `${job.name} (${code})` : job.name;
}

export function getPredefinedJob(id: string): PredefinedJob | undefined {
  return PREDEFINED_JOBS.find((j) => j.id === id);
}

export function isPredefinedJobId(id: string): boolean {
  return PREDEFINED_JOBS.some((j) => j.id === id);
}
