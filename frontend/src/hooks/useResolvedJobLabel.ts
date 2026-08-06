import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  formatJobPickerLine,
  getPredefinedJob,
  isPredefinedJobId,
} from '@/constants/predefinedJobs';
import { shouldIgnoreApiJobName } from '@/lib/attendanceJobLabels';

type ProjectLike = {
  id: string;
  name: string;
  code?: string | null;
};

type UseResolvedJobLabelOptions = {
  enabled?: boolean;
  apiJobName?: string | null;
  shiftProject?: ProjectLike | null;
};

export function useResolvedJobLabel(
  jobTypeId: string | null | undefined,
  options: UseResolvedJobLabelOptions = {},
): string | null {
  const enabled = options.enabled !== false && !!jobTypeId;
  const predefined = jobTypeId ? getPredefinedJob(jobTypeId) : undefined;
  const hasShiftProject = !!options.shiftProject;
  const hasValidApiName = !!options.apiJobName && !shouldIgnoreApiJobName(options.apiJobName);

  const shouldFetchProject =
    enabled &&
    !!jobTypeId &&
    !isPredefinedJobId(jobTypeId) &&
    !hasShiftProject &&
    !hasValidApiName &&
    !predefined;

  const { data: project } = useQuery({
    queryKey: ['resolved-job-label-project', jobTypeId],
    queryFn: () => api<ProjectLike>('GET', `/projects/${jobTypeId}`),
    enabled: shouldFetchProject,
  });

  if (hasValidApiName) return options.apiJobName!;
  if (predefined) return formatJobPickerLine(predefined);
  if (options.shiftProject) return formatJobPickerLine(options.shiftProject);
  if (project) return formatJobPickerLine(project);
  return jobTypeId ?? null;
}
