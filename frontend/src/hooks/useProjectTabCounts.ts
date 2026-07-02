import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { isHiddenReportNote } from '@/lib/reportCategories';

type Report = { id: string; category_id?: string; [key: string]: unknown };
type ProjectFile = { id: string; [key: string]: unknown };
type Proposal = {
  id: string;
  is_change_order?: boolean;
  data?: { additional_costs?: unknown[]; [key: string]: unknown };
};

export type ProjectDetailTabKey =
  | 'overview'
  | 'reports'
  | 'dispatch'
  | 'timesheet'
  | 'files'
  | 'documents'
  | 'proposal'
  | 'pricing'
  | 'estimate'
  | 'orders'
  | 'safety';

export type ProjectTabCounts = Partial<
  Record<'reports' | 'dispatch' | 'timesheet' | 'files' | 'documents' | 'pricing' | 'safety', number>
>;

function visibleCount(n: number): number | undefined {
  return n > 0 ? n : undefined;
}

function tabIsAvailable(availableTabs: readonly ProjectDetailTabKey[], tab: ProjectDetailTabKey): boolean {
  return availableTabs.includes(tab);
}

type UseProjectTabCountsArgs = {
  projectId: string | undefined;
  availableTabs: readonly ProjectDetailTabKey[];
  signOnlySafetySession: boolean;
  reports: Report[] | undefined;
  files: ProjectFile[] | undefined;
  proposals: Proposal[] | undefined;
};

export function useProjectTabCounts({
  projectId,
  availableTabs,
  signOnlySafetySession,
  reports,
  files,
  proposals,
}: UseProjectTabCountsArgs): ProjectTabCounts {
  const enabled = !!projectId && !signOnlySafetySession;
  const projectIdStr = String(projectId ?? '');

  const wantsReports = tabIsAvailable(availableTabs, 'reports');
  const wantsDispatch = tabIsAvailable(availableTabs, 'dispatch');
  const wantsTimesheet = tabIsAvailable(availableTabs, 'timesheet');
  const wantsFiles = tabIsAvailable(availableTabs, 'files');
  const wantsDocuments = tabIsAvailable(availableTabs, 'documents');
  const wantsPricing = tabIsAvailable(availableTabs, 'pricing');
  const wantsSafety = tabIsAvailable(availableTabs, 'safety');

  const { data: documents } = useQuery({
    queryKey: ['document-creator-documents', projectIdStr],
    queryFn: () =>
      api<unknown[]>('GET', `/document-creator/documents?project_id=${encodeURIComponent(projectIdStr)}`),
    enabled: enabled && wantsDocuments,
  });

  const { data: shifts } = useQuery({
    queryKey: ['projectShifts', projectIdStr],
    queryFn: () => api<unknown[]>('GET', `/dispatch/projects/${projectIdStr}/shifts`),
    enabled: enabled && wantsDispatch,
  });

  const { data: timesheetEntries } = useQuery({
    queryKey: ['timesheet', projectIdStr, 'all'],
    queryFn: () => api<unknown[]>('GET', `/projects/${projectIdStr}/timesheet`),
    enabled: enabled && wantsTimesheet,
  });

  const { data: safetyInspections } = useQuery({
    queryKey: ['projectSafetyInspections', projectIdStr],
    queryFn: () =>
      api<unknown[]>('GET', `/projects/${encodeURIComponent(projectIdStr)}/safety-inspections`),
    enabled: enabled && wantsSafety,
  });

  return useMemo(() => {
    const counts: ProjectTabCounts = {};

    if (wantsReports && reports) {
      const count = visibleCount(reports.filter((r) => !isHiddenReportNote(r)).length);
      if (count !== undefined) counts.reports = count;
    }

    if (wantsFiles && files) {
      const count = visibleCount(files.length);
      if (count !== undefined) counts.files = count;
    }

    if (wantsDocuments && documents) {
      const count = visibleCount(documents.length);
      if (count !== undefined) counts.documents = count;
    }

    if (wantsDispatch && shifts) {
      const count = visibleCount(shifts.length);
      if (count !== undefined) counts.dispatch = count;
    }

    if (wantsTimesheet && timesheetEntries) {
      const count = visibleCount(timesheetEntries.length);
      if (count !== undefined) counts.timesheet = count;
    }

    if (wantsSafety && safetyInspections) {
      const count = visibleCount(safetyInspections.length);
      if (count !== undefined) counts.safety = count;
    }

    if (wantsPricing && proposals) {
      const original = proposals.find((p) => !p.is_change_order);
      const costs = original?.data?.additional_costs;
      const pricingCount = Array.isArray(costs) ? costs.length : 0;
      const count = visibleCount(pricingCount);
      if (count !== undefined) counts.pricing = count;
    }

    return counts;
  }, [
    wantsReports,
    wantsFiles,
    wantsDocuments,
    wantsDispatch,
    wantsTimesheet,
    wantsSafety,
    wantsPricing,
    reports,
    files,
    documents,
    shifts,
    timesheetEntries,
    safetyInspections,
    proposals,
  ]);
}
