import { JOB_TYPES } from '@/constants/jobTypes';

export type JobTypeSettingsItem = {
  id?: string;
  label?: string | null;
  value?: string | null;
  sort_index?: number | null;
};

export type JobTypeSelectOption = { value: string; label: string };

/**
 * Build Job Type select options for Create/Edit Shift.
 * Prefers Settings `job_types` labels; falls back to the hardcoded catalog.
 */
export function jobTypeSelectOptions(
  settingsItems?: JobTypeSettingsItem[] | null,
): JobTypeSelectOption[] {
  const empty: JobTypeSelectOption = { value: '', label: 'No job type selected' };
  const fromSettings = (settingsItems || [])
    .map((item) => {
      const label = String(item.label || item.value || '').trim();
      return label ? { value: label, label } : null;
    })
    .filter((o): o is JobTypeSelectOption => !!o);

  if (fromSettings.length > 0) {
    return [empty, ...fromSettings];
  }

  return [empty, ...JOB_TYPES.map((job) => ({ value: job.name, label: job.name }))];
}
