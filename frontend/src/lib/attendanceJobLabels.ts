import {
  formatJobPickerLine,
  getPredefinedJob,
} from '@/constants/predefinedJobs';

export type JobLabelSource = {
  id: string;
  name: string;
  code?: string | null;
};

export function shouldIgnoreApiJobName(jobName?: string | null): boolean {
  return !jobName || jobName.trim() === '' || jobName === 'Unknown';
}

export function parseJobTypeFromReasonText(reason?: string | null): string | null {
  if (!reason?.startsWith('JOB_TYPE:')) return null;
  const marker = reason.split('|')[0] ?? '';
  const jobType = marker.replace('JOB_TYPE:', '').trim();
  return jobType || null;
}

export function resolveJobLabelFromCache(
  jobTypeId: string | null | undefined,
  options: {
    apiJobName?: string | null;
    projectsById?: Record<string, JobLabelSource>;
    projectFromFetch?: JobLabelSource | null;
    shiftProject?: JobLabelSource | null;
  } = {},
): string | null {
  if (options.apiJobName && !shouldIgnoreApiJobName(options.apiJobName)) {
    return options.apiJobName;
  }

  if (!jobTypeId) return null;

  const predefined = getPredefinedJob(jobTypeId);
  if (predefined) return formatJobPickerLine(predefined);

  if (options.shiftProject) return formatJobPickerLine(options.shiftProject);

  const fromMap = options.projectsById?.[jobTypeId];
  if (fromMap) return formatJobPickerLine(fromMap);

  if (options.projectFromFetch) return formatJobPickerLine(options.projectFromFetch);

  return null;
}

export function resolveAttendanceEventJobLabel(
  event: {
    shift_id?: string | null;
    job_name?: string | null;
    project_name?: string | null;
    job_type?: string | null;
  },
  jobOptions: JobLabelSource[],
): string {
  if (event.shift_id) {
    return event.project_name || event.job_name || 'No Project';
  }

  const fromOptions = event.job_type
    ? jobOptions.find((j) => j.id === event.job_type)?.name
    : undefined;

  if (event.job_name && !shouldIgnoreApiJobName(event.job_name)) {
    return event.job_name;
  }
  if (event.project_name) return event.project_name;
  if (fromOptions) return fromOptions;
  if (event.job_type) return 'Unknown';
  return 'No Project';
}

export function resolveDirectAttendanceJobLabel(
  attendance: {
  shift_id?: string | null;
  job_name?: string | null;
  project_name?: string | null;
  reason_text?: string | null;
  job_type?: string | null;
}, options: {
  shiftProject?: JobLabelSource | null;
  projectsById?: Record<string, JobLabelSource>;
} = {}): string | null {
  if (attendance.shift_id) {
    if (options.shiftProject) return formatJobPickerLine(options.shiftProject);
    if (attendance.project_name) return attendance.project_name;
    return attendance.job_name || 'Unknown Project';
  }

  const jobTypeId =
    attendance.job_type || parseJobTypeFromReasonText(attendance.reason_text);

  return (
    resolveJobLabelFromCache(jobTypeId, {
      apiJobName: attendance.job_name,
      projectsById: options.projectsById,
    }) ?? jobTypeId
  );
}
