import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, X } from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  employeeReportDetailQuickInfo,
  employeeReportFormQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppDatePicker,
  AppEmptyState,
  AppFieldHint,
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppMultiSelect,
  type AppMultiSelectOption,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTextarea,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  appSectionPresetProps,
  resolveAppSortableListPreset,
  sortListByAppColumn,
  uiBorders,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
} from '@/components/ui';

type Report = {
  id: string;
  report_type: string;
  title: string;
  description?: string;
  occurrence_date: string;
  severity: string;
  status: string;
  vehicle?: string;
  ticket_number?: string;
  fine_amount?: number;
  due_date?: string;
  related_project_department?: string;
  suspension_start_date?: string;
  suspension_end_date?: string;
  reported_by: { id: string; username?: string };
  created_at: string;
  created_by: { id: string; username?: string };
  updated_at?: string;
  updated_by?: { id: string; username?: string };
  attachments_count: number;
  comments_count: number;
};

type ReportDetail = Report & {
  attachments: Array<{
    id: string;
    file_id: string;
    file_name?: string;
    file_size?: number;
    file_type?: string;
    created_at: string;
    created_by: { id: string; username?: string };
  }>;
  comments: Array<{
    id: string;
    comment_text: string;
    comment_type: string;
    created_at: string;
    created_by: { id: string; username?: string };
  }>;
};

export type UserReportsProps =
  | { variant?: 'user'; userId: string; canEdit?: boolean }
  | { variant: 'worker'; workerId: string; canEdit?: boolean };

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const REPORT_TYPE_OPTIONS = [
  { value: 'Fine', label: 'Fine' },
  { value: 'Warning', label: 'Warning' },
  { value: 'Suspension', label: 'Suspension' },
  { value: 'Behavior Note', label: 'Behavior Note' },
  { value: 'Other', label: 'Other' },
];

const REPORT_STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'Under Review', label: 'Under Review' },
  { value: 'Closed', label: 'Closed' },
];

const REPORT_SEVERITY_OPTIONS = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
];

type ReportBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function reportSeverityVariant(severity: string): ReportBadgeVariant {
  if (severity === 'High') return 'danger';
  if (severity === 'Medium') return 'warning';
  return 'success';
}

function reportStatusVariant(status: string): ReportBadgeVariant {
  if (status === 'Closed') return 'neutral';
  if (status === 'Under Review') return 'info';
  return 'warning';
}

function buildProjectDepartmentOptions(
  projects: any[] | undefined,
  settings: any | undefined,
): AppMultiSelectOption[] {
  const opts: AppMultiSelectOption[] = [];
  projects?.forEach((project: any) => {
    const name = project.name || project.code || 'Project';
    const displayName = project.code ? `${project.code} - ${name}` : name;
    opts.push({ value: `project-${project.id}`, label: displayName });
  });
  settings?.divisions?.forEach((division: any) => {
    opts.push({ value: `department-${division.id}`, label: division.label });
  });
  return opts;
}

function ReportTypeFieldsSection({
  title,
  fieldHint,
  children,
}: {
  title: string;
  fieldHint?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={uiCx(
        uiSpacing.sectionStack,
        uiBorders.subtle,
        uiTypography.body,
        'rounded-lg border bg-gray-50 p-4',
      )}
    >
      <div className="flex items-center gap-1">
        <h4 className={uiCx(uiTypography.sectionTitle)}>{title}</h4>
        {fieldHint ? <AppFieldHint hint={fieldHint} /> : null}
      </div>
      {children}
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className={uiCx(
        'grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-2.5',
      )}
    >
      <dt className={uiTypography.helper}>{label}</dt>
      <dd className={uiCx(uiTypography.body, 'min-w-0 break-words font-medium text-gray-900')}>{children}</dd>
    </div>
  );
}

export default function UserReports(props: UserReportsProps) {
  const canEdit = props.canEdit ?? true;
  const variant = props.variant ?? 'user';
  const isWorker = variant === 'worker';
  const subjectId = isWorker ? props.workerId : props.userId;
  const reportsPrefix = isWorker
    ? `/subcontractors/workers/${props.workerId}/reports`
    : `/employees/${props.userId}/reports`;
  const reportsListQueryKey = ['reports', variant, subjectId] as const;
  const fileUploadEmployeeId: string | null = isWorker ? null : props.userId;

  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReportDetail, setShowReportDetail] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<ReportDetail | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  const { data: reports, refetch: refetchReports } = useQuery<Report[]>({
    queryKey: reportsListQueryKey,
    queryFn: () => api<Report[]>('GET', reportsPrefix),
  });

  // Filter reports
  const filteredReports = useMemo(() => {
    if (!reports) return [];
    
    return reports.filter((report) => {
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !report.title.toLowerCase().includes(query) &&
          !report.description?.toLowerCase().includes(query) &&
          !report.ticket_number?.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      
      // Filter by type
      if (filterType && report.report_type !== filterType) {
        return false;
      }
      
      // Filter by status
      if (filterStatus && report.status !== filterStatus) {
        return false;
      }
      
      // Filter by severity
      if (filterSeverity && report.severity !== filterSeverity) {
        return false;
      }
      
      // Filter by date range
      if (filterDateFrom || filterDateTo) {
        const occurrenceDate = new Date(report.occurrence_date);
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom);
          fromDate.setHours(0, 0, 0, 0);
          if (occurrenceDate < fromDate) return false;
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo);
          toDate.setHours(23, 59, 59, 999);
          if (occurrenceDate > toDate) return false;
        }
      }
      
      return true;
    });
  }, [reports, searchQuery, filterType, filterStatus, filterSeverity, filterDateFrom, filterDateTo]);

  type ReportSortColumn = 'date' | 'type' | 'title' | 'severity' | 'status' | 'updated';
  const { sortBy, sortDir, setSort } = useLocalAppListSort<ReportSortColumn>('date', 'desc');

  const sortedFilteredReports = useMemo(
    () =>
      sortListByAppColumn(filteredReports, sortBy, sortDir, {
        date: (r) => (r.occurrence_date ? Date.parse(r.occurrence_date) : null),
        type: (r) => r.report_type,
        title: (r) => r.title,
        severity: (r) => r.severity,
        status: (r) => r.status,
        updated: (r) => Date.parse(r.updated_at || r.created_at || '') || null,
      }),
    [filteredReports, sortBy, sortDir],
  );

  const clearFilters = () => {
    setSearchQuery('');
    setFilterType('');
    setFilterStatus('');
    setFilterSeverity('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const reportsDescription = isWorker
    ? 'Safety and incident reports linked to this worker.'
    : 'Safety and incident reports for this employee.';

  const openReportDetail = (reportId: string) => {
    setShowReportDetail(reportId);
  };

  const openEditReport = async (reportId: string) => {
    try {
      const detail = await api<ReportDetail>('GET', `${reportsPrefix}/${reportId}`);
      setEditingReport(detail);
      setShowCreateModal(true);
    } catch {
      toast.error('Failed to load report details');
    }
  };

  const handleDeleteReport = async (report: Report) => {
    if (!canEdit) {
      toast.error('You do not have permission to delete reports');
      return;
    }
    const result = await confirm({
      title: 'Delete report',
      message: `Delete "${report.title}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    setDeletingId(report.id);
    try {
      await api('DELETE', `${reportsPrefix}/${report.id}`);
      toast.success('Report deleted');
      if (showReportDetail === report.id) {
        setShowReportDetail(null);
      }
      await refetchReports();
      queryClient.invalidateQueries({ queryKey: reportsListQueryKey });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete report');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <AppCard>
        <AppSectionHeader
          title="Reports"
          description={reportsDescription}
          {...appSectionPresetProps('description')}
        />
        <div className="mt-4 space-y-4">
          <AppInput
            placeholder="Search reports…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <AppSelect
              label="Type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              placeholder="All types"
              options={REPORT_TYPE_OPTIONS}
            />
            <AppSelect
              label="Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              placeholder="All statuses"
              options={REPORT_STATUS_OPTIONS}
            />
            <AppSelect
              label="Severity"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              placeholder="All severities"
              options={REPORT_SEVERITY_OPTIONS}
            />
            <AppDatePicker
              label="From date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
            <AppDatePicker
              label="To date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
            <div className="flex items-end">
              <AppButton type="button" variant="secondary" size="sm" className="w-full" onClick={clearFilters}>
                Clear filters
              </AppButton>
            </div>
          </div>

          <div className={uiCx('rounded-xl border bg-white', uiSpacing.cardPadding)}>
            <p className={uiCx(uiTypography.helper, 'mb-3')}>
              Click a row to view full details, attachments, and comments.
            </p>
            <div className="flex flex-col gap-2 overflow-x-auto">
              {canEdit && (
                <AppListCreateItem
                  label="Add report"
                  layout="row"
                  className={uiCx('w-full', resolveAppSortableListPreset('workerReports').minWidth)}
                  onClick={() => setShowCreateModal(true)}
                />
              )}
              {!reports ? (
                <div
                  className={uiCx(
                    resolveAppSortableListPreset('workerReports').minWidth,
                    'px-4 py-4',
                  )}
                >
                  <div className="h-6 animate-pulse rounded bg-gray-100" />
                </div>
              ) : filteredReports.length === 0 ? (
                <AppEmptyState
                  title={reports.length === 0 ? 'No reports found' : 'No reports match the filters'}
                  className="border-0 bg-transparent p-0 py-6 shadow-none"
                />
              ) : (
                <AppSortableEntityList layout="flat">
                  <AppSortableEntityListHeader preset="workerReports" variant="flat">
                    <AppSortableEntityListSortColumn
                      label="Date"
                      column="date"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Type"
                      column="type"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Title"
                      column="title"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Severity"
                      column="severity"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Status"
                      column="status"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Last updated"
                      column="updated"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <div className="min-w-0 w-24" aria-hidden />
                  </AppSortableEntityListHeader>
                  <AppSortableEntityListFlatBody preset="workerReports">
                    {sortedFilteredReports.map((report) => (
                      <AppSortableEntityListRow
                        key={report.id}
                        as="div"
                        variant="flat"
                        preset="workerReports"
                        className="group"
                        role="button"
                        tabIndex={0}
                        onClick={() => openReportDetail(report.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openReportDetail(report.id);
                          }
                        }}
                      >
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                          {formatDate(report.occurrence_date)}
                        </span>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                          {report.report_type}
                        </span>
                        <span
                          className={uiCx(
                            'min-w-0 truncate text-sm font-bold text-gray-900 transition-colors group-hover:text-[#7f1010]',
                          )}
                        >
                          {report.title}
                        </span>
                        <div className="min-w-0">
                          <AppBadge variant={reportSeverityVariant(report.severity)}>{report.severity}</AppBadge>
                        </div>
                        <div className="min-w-0">
                          <AppBadge variant={reportStatusVariant(report.status)}>{report.status}</AppBadge>
                        </div>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-600')}>
                          {formatDate(report.updated_at || report.created_at)}
                        </span>
                        <div
                          className="flex w-24 shrink-0 items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canEdit ? (
                            <>
                              <AppListRowIconButton
                                preset="edit"
                                label="Edit report"
                                onClick={() => void openEditReport(report.id)}
                              />
                              <AppListRowIconButton
                                preset="delete"
                                label="Delete report"
                                loading={deletingId === report.id}
                                onClick={() => void handleDeleteReport(report)}
                              />
                            </>
                          ) : null}
                        </div>
                      </AppSortableEntityListRow>
                    ))}
                  </AppSortableEntityListFlatBody>
                </AppSortableEntityList>
              )}
            </div>
          </div>
        </div>
      </AppCard>

      {/* Create/Edit Report Modal */}
      {showCreateModal && (
        <CreateReportModal
          reportsPrefix={reportsPrefix}
          reportsListQueryKey={reportsListQueryKey}
          fileUploadEmployeeId={fileUploadEmployeeId}
          isWorker={isWorker}
          report={editingReport || undefined}
          onClose={() => {
            setShowCreateModal(false);
            setEditingReport(null);
            refetchReports();
          }}
        />
      )}

      {/* Report Detail Modal */}
      {showReportDetail && (
        <ReportDetailView
          reportsPrefix={reportsPrefix}
          reportsListQueryKey={reportsListQueryKey}
          fileUploadEmployeeId={fileUploadEmployeeId}
          variant={variant}
          subjectId={subjectId}
          reportId={showReportDetail}
          canEdit={canEdit}
          onClose={() => {
            setShowReportDetail(null);
            refetchReports();
          }}
          onEdit={(report) => {
            setEditingReport(report);
            setShowReportDetail(null);
            setShowCreateModal(true);
          }}
        />
      )}
    </div>
  );
}

function CreateReportModal({
  reportsPrefix,
  reportsListQueryKey,
  fileUploadEmployeeId,
  isWorker,
  report,
  onClose,
}: {
  reportsPrefix: string;
  reportsListQueryKey: readonly ['reports', 'user' | 'worker', string];
  fileUploadEmployeeId: string | null;
  isWorker: boolean;
  report?: ReportDetail;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reportType, setReportType] = useState('Other');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [occurrenceDate, setOccurrenceDate] = useState(formatDateLocal(new Date()));
  const [severity, setSeverity] = useState('Medium');
  const [status, setStatus] = useState('Open');
  
  // Fine-specific fields
  const [vehicle, setVehicle] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [fineAmount, setFineAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  
  // Related Project/Department (for all types)
  const [selectedProjectsDepartments, setSelectedProjectsDepartments] = useState<string[]>([]);

  // Suspension-specific fields
  const [suspensionStartDate, setSuspensionStartDate] = useState('');
  const [suspensionEndDate, setSuspensionEndDate] = useState('');
  
  // Behavior Note-specific fields
  const [behaviorNoteType, setBehaviorNoteType] = useState<'Positive' | 'Negative' | ''>('');
  
  // Attachments (pending on create; existing + new on edit)
  const [attachments, setAttachments] = useState<Array<{ file_id: string; file_name: string; file_size: number; file_type: string }>>([]);
  const [existingAttachments, setExistingAttachments] = useState<ReportDetail['attachments']>([]);
  const [uploading, setUploading] = useState(false);

  const [saving, setSaving] = useState(false);

  // Fetch projects
  const { data: projects } = useQuery<any[]>({
    queryKey: ['projects-list'],
    queryFn: () => api<any[]>('GET', '/projects'),
  });

  // Fetch settings to get divisions (departments)
  const { data: settings } = useQuery<any>({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
  });

  const projectDeptOptions = useMemo(
    () => buildProjectDepartmentOptions(projects, settings),
    [projects, settings],
  );

  const selectedItemsDisplay = useMemo(
    () =>
      selectedProjectsDepartments
        .map((id) => projectDeptOptions.find((o) => o.value === id)?.label)
        .filter((label): label is string => Boolean(label)),
    [selectedProjectsDepartments, projectDeptOptions],
  );

  // Reset form when opening create modal (not when projects/settings finish loading)
  useEffect(() => {
    if (report) return;
    setReportType('Other');
    setTitle('');
    setDescription('');
    setOccurrenceDate(formatDateLocal(new Date()));
    setSeverity('Medium');
    setStatus('Open');
    setVehicle('');
    setTicketNumber('');
    setFineAmount('');
    setDueDate('');
    setSuspensionStartDate('');
    setSuspensionEndDate('');
    setBehaviorNoteType('');
    setSelectedProjectsDepartments([]);
    setAttachments([]);
    setExistingAttachments([]);
  }, [report]);

  // Initialize form when editing (wait for projects/settings for project/department matching)
  useEffect(() => {
    if (!report || !projects || !settings) return;

    setReportType(report.report_type);
    setTitle(report.title);
    setDescription(report.description || '');
    setOccurrenceDate(report.occurrence_date ? report.occurrence_date.split('T')[0] : formatDateLocal(new Date()));
    setSeverity(report.severity);
    setStatus(report.status);
    setVehicle(report.vehicle || '');
    setTicketNumber(report.ticket_number || '');
    setFineAmount(report.fine_amount?.toString() || '');
    setDueDate(report.due_date ? report.due_date.split('T')[0] : '');
    setSuspensionStartDate(report.suspension_start_date ? report.suspension_start_date.split('T')[0] : '');
    setSuspensionEndDate(report.suspension_end_date ? report.suspension_end_date.split('T')[0] : '');
    setBehaviorNoteType((report as ReportDetail & { behavior_note_type?: string }).behavior_note_type || '');

    const matchedIds: string[] = [];
    if (report.related_project_department) {
      const savedNames = report.related_project_department.split(', ').map((s) => s.trim());

      projects.forEach((project: any) => {
        const name = project.name || project.code || 'Project';
        const displayName = project.code ? `${project.code} - ${name}` : name;
        if (savedNames.includes(displayName)) {
          matchedIds.push(`project-${project.id}`);
        }
      });

      if (settings?.divisions) {
        settings.divisions.forEach((division: any) => {
          if (savedNames.includes(division.label)) {
            matchedIds.push(`department-${division.id}`);
          }
        });
      }
    }
    setSelectedProjectsDepartments(matchedIds);
    setExistingAttachments(report.attachments);
  }, [report, projects, settings]);

  const uploadFileToStorage = async (file: File) => {
    const up: any = await api('POST', '/files/upload', {
      project_id: null,
      client_id: null,
      employee_id: fileUploadEmployeeId,
      category_id: 'report-attachment',
      original_name: file.name,
      content_type: file.type || 'application/octet-stream',
    });

    const put = await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });

    if (!put.ok) throw new Error('Upload failed');

    const conf: any = await api('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: file.type || 'application/octet-stream',
    });

    return {
      file_id: conf.id,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
    };
  };

  const handleRemovePendingAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingAttachment = async (attachmentId: string) => {
    if (!report) return;
    try {
      await api('DELETE', `${reportsPrefix}/${report.id}/attachments/${attachmentId}`);
      setExistingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      toast.success('Attachment removed');
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to remove attachment');
    }
  };

  const handleFilesSelected = async (added: File[]) => {
    if (!added.length) return;
    setUploading(true);
    try {
      for (const file of added) {
        const meta = await uploadFileToStorage(file);
        if (report) {
          const result = await api<{ id: string }>('POST', `${reportsPrefix}/${report.id}/attachments`, meta);
          setExistingAttachments((prev) => [
            ...prev,
            {
              id: result.id,
              file_id: meta.file_id,
              file_name: meta.file_name,
              file_size: meta.file_size,
              file_type: meta.file_type,
              created_at: new Date().toISOString(),
              created_by: { id: '', username: undefined },
            },
          ]);
        } else {
          setAttachments((prev) => [...prev, meta]);
        }
      }
      toast.success(added.length === 1 ? 'File uploaded' : `${added.length} files uploaded`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!occurrenceDate) {
      toast.error('Occurrence date is required');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        report_type: reportType,
        title: title.trim(),
        description: description || undefined,
        occurrence_date: occurrenceDate,
        severity: severity,
        status: status,
      };

      // Fine-specific fields
      if (reportType === 'Fine') {
        if (vehicle) payload.vehicle = vehicle;
        if (ticketNumber) payload.ticket_number = ticketNumber;
        if (fineAmount) payload.fine_amount = parseFloat(fineAmount);
        if (dueDate) payload.due_date = dueDate;
      }

      // Related Project/Department (for all types)
      if (selectedProjectsDepartments.length > 0) {
        payload.related_project_department = selectedItemsDisplay.join(', ');
      }

      // Suspension-specific fields
      if (reportType === 'Suspension') {
        if (suspensionStartDate) payload.suspension_start_date = suspensionStartDate;
        if (suspensionEndDate) payload.suspension_end_date = suspensionEndDate;
      }

      if (reportType === 'Behavior Note') {
        if (behaviorNoteType) payload.behavior_note_type = behaviorNoteType;
      }

      if (report) {
        // Update existing report
        await api('PATCH', `${reportsPrefix}/${report.id}`, payload);
        toast.success('Report updated');
      } else {
        // Create new report
        const result = await api<{ id: string }>('POST', reportsPrefix, payload);
        
        // Add attachments
        for (const att of attachments) {
          await api('POST', `${reportsPrefix}/${result.id}/attachments`, {
            file_id: att.file_id,
            file_name: att.file_name,
            file_size: att.file_size,
            file_type: att.file_type,
          });
        }
        toast.success('Report created');
      }
      
      queryClient.invalidateQueries({ queryKey: [...reportsListQueryKey] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to create report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppFormModal
      open
      onClose={onClose}
      formWidth="wide"
      dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
      dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
      title={report ? 'Edit report' : 'Create report'}
      description={
        report
          ? 'Update report details.'
          : isWorker
            ? 'Add a safety or incident report for this worker.'
            : 'Add a safety or incident report for this employee.'
      }
      quickInfo={employeeReportFormQuickInfo({ isWorker, editing: !!report })}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" loading={saving} onClick={handleSubmit}>
            {report ? 'Update report' : 'Create report'}
          </AppButton>
        </div>
      }
    >
        <AppInput
          label="Title *"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short title for the report"
          fieldHint="Title\n\nShort summary shown in the reports list and detail view."
        />
        <AppSelect
          label="Report type *"
          required
          value={reportType}
          options={REPORT_TYPE_OPTIONS}
          onChange={(e) => setReportType(e.target.value)}
          fieldHint="Report type\n\nDetermines which extra fields appear (fine, suspension, behavior note, etc.)."
        />

        {reportType === 'Fine' && (
          <ReportTypeFieldsSection
            title="Fine details"
            fieldHint="Fine details\n\nOptional vehicle, ticket, amount, and due date for traffic or parking fines."
          >
            <AppInput
              label="Vehicle"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder="Vehicle information"
              fieldHint="Vehicle\n\nVehicle or plate related to the fine, if applicable."
            />
            <AppInput
              label="Ticket number"
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              placeholder="Ticket number"
              fieldHint="Ticket number\n\nCitation or ticket reference from the authority."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AppInput
                label="Fine amount"
                type="number"
                step="0.01"
                min="0"
                value={fineAmount}
                onChange={(e) => setFineAmount(e.target.value)}
                placeholder="0.00"
                fieldHint="Fine amount\n\nAmount in USD; optional but useful for HR tracking."
              />
              <AppDatePicker
                label="Due date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                fieldHint="Due date\n\nWhen payment or response to the fine is due."
              />
            </div>
          </ReportTypeFieldsSection>
        )}

        {reportType === 'Suspension' && (
          <ReportTypeFieldsSection
            title="Suspension period"
            fieldHint="Suspension period\n\nStart and end dates when the worker is suspended from site or duties."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AppDatePicker
                label="Start date"
                value={suspensionStartDate}
                onChange={(e) => setSuspensionStartDate(e.target.value)}
                fieldHint="Start date\n\nFirst day of the suspension."
              />
              <AppDatePicker
                label="End date"
                value={suspensionEndDate}
                onChange={(e) => setSuspensionEndDate(e.target.value)}
                fieldHint="End date\n\nLast day of the suspension (leave blank if open-ended)."
              />
            </div>
          </ReportTypeFieldsSection>
        )}

        {reportType === 'Behavior Note' && (
          <ReportTypeFieldsSection
            title="Behavior note type"
            fieldHint="Behavior note type\n\nMark the note as positive recognition or a negative incident."
          >
            <div className="grid grid-cols-2 gap-3">
              <AppButton
                type="button"
                variant={behaviorNoteType === 'Positive' ? 'primary' : 'secondary'}
                className="justify-center gap-2 py-3"
                onClick={() => setBehaviorNoteType('Positive')}
              >
                <span aria-hidden>😊</span>
                Positive
              </AppButton>
              <AppButton
                type="button"
                variant={behaviorNoteType === 'Negative' ? 'primary' : 'secondary'}
                className="justify-center gap-2 py-3"
                onClick={() => setBehaviorNoteType('Negative')}
              >
                <span aria-hidden>😞</span>
                Negative
              </AppButton>
            </div>
          </ReportTypeFieldsSection>
        )}

        <AppTextarea
          label="Description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detailed description of the occurrence"
          fieldHint="Description\n\nWhat happened, context, and any follow-up needed."
        />
        <AppDatePicker
          label="Occurrence date *"
          required
          value={occurrenceDate}
          onChange={(e) => setOccurrenceDate(e.target.value)}
          fieldHint="Occurrence date\n\nWhen the incident happened (not necessarily when this record was filed)."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppSelect
            label="Severity"
            value={severity}
            options={REPORT_SEVERITY_OPTIONS}
            onChange={(e) => setSeverity(e.target.value)}
            fieldHint="Severity\n\nLow, medium, or high — for prioritization and filtering."
          />
          <AppSelect
            label="Status"
            value={status}
            options={REPORT_STATUS_OPTIONS}
            onChange={(e) => setStatus(e.target.value)}
            fieldHint="Status\n\nOpen, under review, or closed workflow state."
          />
        </div>
        <AppMultiSelect
          label="Related project / department"
          value={selectedProjectsDepartments}
          onChange={setSelectedProjectsDepartments}
          options={projectDeptOptions}
          placeholder="Select projects or departments…"
          searchable
          emptyMessage={!projects ? 'Loading…' : 'No projects or departments available'}
          fieldHint="Related project / department\n\nLink the report to one or more projects or departments when relevant."
        />
        <AppFileUpload
          mode="multiple"
          value={[]}
          onChange={() => {}}
          onFilesSelected={handleFilesSelected}
          disabled={uploading}
          label="Attachments"
          fieldHint={
            report
              ? 'Attachments\n\nFiles attach to this report as soon as they are selected.'
              : 'Attachments\n\nFiles upload when selected and are saved when you create the report.'
          }
          helperText={
            report
              ? 'Uploads attach to this report immediately.'
              : 'Files upload when selected and attach when you save the report.'
          }
        />
        {report ? (
          existingAttachments.length === 0 ? (
            <p className={uiTypography.helper}>No attachments</p>
          ) : (
            <ul className="space-y-2">
              {existingAttachments.map((att) => (
                <li
                  key={att.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-600"
                >
                  <a
                    href={withFileAccessToken(`/files/${att.file_id}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-2 text-brand-red hover:underline"
                  >
                    <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{att.file_name || 'File'}</span>
                  </a>
                  <button
                    type="button"
                    className="shrink-0 text-red-600 hover:text-red-800"
                    aria-label={`Remove ${att.file_name || 'file'}`}
                    onClick={() => void handleRemoveExistingAttachment(att.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : attachments.length > 0 ? (
          <ul className="space-y-1">
            {attachments.map((att, idx) => (
              <li key={idx} className="flex items-center gap-2 text-xs text-gray-600">
                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{att.file_name}</span>
                <button
                  type="button"
                  className="text-red-600 hover:text-red-800"
                  aria-label={`Remove ${att.file_name}`}
                  onClick={() => handleRemovePendingAttachment(idx)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={uiTypography.helper}>No attachments yet</p>
        )}
    </AppFormModal>
  );
}

function ReportDetailView({
  reportsPrefix,
  reportsListQueryKey,
  fileUploadEmployeeId,
  variant,
  subjectId,
  reportId,
  canEdit,
  onClose,
  onEdit,
}: {
  reportsPrefix: string;
  reportsListQueryKey: readonly ['reports', 'user' | 'worker', string];
  fileUploadEmployeeId: string | null;
  variant: 'user' | 'worker';
  subjectId: string;
  reportId: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit?: (report: ReportDetail) => void;
}) {
  const queryClient = useQueryClient();
  const isWorker = variant === 'worker';
  const [newComment, setNewComment] = useState('');

  const { data: report, refetch: refetchReport } = useQuery<ReportDetail>({
    queryKey: ['report-detail', variant, subjectId, reportId],
    queryFn: () => api<ReportDetail>('GET', `${reportsPrefix}/${reportId}`),
  });

  const visibleComments = useMemo(() => {
    if (!report) return [];
    if (canEdit) return report.comments;
    return report.comments.filter((c) => c.comment_type === 'comment');
  }, [report, canEdit]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    
    try {
      await api('POST', `${reportsPrefix}/${reportId}/comments`, {
        comment_text: newComment.trim(),
        comment_type: 'comment',
      });
      toast.success('Comment added');
      setNewComment('');
      refetchReport();
      queryClient.invalidateQueries({ queryKey: ['report-detail', variant, subjectId, reportId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to add comment');
    }
  };

  const behaviorNoteType = report?.behavior_note_type;

  return (
    <AppFormModal
      open
      onClose={onClose}
      layout="detail"
      size="md"
      title="Report details"
      description={report ? `${report.report_type}: ${report.title}` : 'Loading…'}
      quickInfo={report ? employeeReportDetailQuickInfo({ isWorker, canEdit }) : undefined}
      bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </AppButton>
          {canEdit && onEdit && report ? (
            <AppButton type="button" size="sm" onClick={() => onEdit(report)}>
              Edit
            </AppButton>
          ) : null}
        </div>
      }
    >
      {!report ? (
        <div className="flex items-center justify-center py-12 text-sm text-gray-500">Loading…</div>
      ) : (
        <div className={uiSpacing.sectionStack}>
          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <dl className="min-w-0">
              <DetailField label="Status">
                <AppBadge variant={reportStatusVariant(report.status)}>{report.status}</AppBadge>
              </DetailField>
              <DetailField label="Severity">
                <AppBadge variant={reportSeverityVariant(report.severity)}>{report.severity}</AppBadge>
              </DetailField>
              <DetailField label="Occurrence date">{formatDate(report.occurrence_date)}</DetailField>
              <DetailField label="Reported by">{report.reported_by?.username || '—'}</DetailField>
              <DetailField label="Last updated">{formatDate(report.updated_at || report.created_at)}</DetailField>
              <DetailField label="Description">
                {report.description ? (
                  <span className="whitespace-pre-wrap font-normal text-gray-700">{report.description}</span>
                ) : (
                  '—'
                )}
              </DetailField>
              <DetailField label="Related project / department">
                {report.related_project_department || '—'}
              </DetailField>
              {report.report_type === 'Fine' && (
                <>
                  <DetailField label="Vehicle">{report.vehicle || '—'}</DetailField>
                  <DetailField label="Ticket number">{report.ticket_number || '—'}</DetailField>
                  <DetailField label="Fine amount">
                    {report.fine_amount != null ? formatCurrency(report.fine_amount) : '—'}
                  </DetailField>
                  <DetailField label="Due date">{formatDate(report.due_date)}</DetailField>
                </>
              )}
              {report.report_type === 'Suspension' && (
                <>
                  <DetailField label="Suspension start">{formatDate(report.suspension_start_date)}</DetailField>
                  <DetailField label="Suspension end">{formatDate(report.suspension_end_date)}</DetailField>
                </>
              )}
              {report.report_type === 'Behavior Note' && (
                <DetailField label="Behavior note type">
                  {behaviorNoteType === 'Positive' ? (
                    <span className="inline-flex items-center gap-2 font-normal text-green-700">
                      <span aria-hidden>😊</span>
                      Positive
                    </span>
                  ) : behaviorNoteType === 'Negative' ? (
                    <span className="inline-flex items-center gap-2 font-normal text-red-700">
                      <span aria-hidden>😞</span>
                      Negative
                    </span>
                  ) : (
                    '—'
                  )}
                </DetailField>
              )}
            </dl>
          </AppCard>

          {report.attachments.length > 0 && (
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <h3 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Attachments</h3>
              <ul className="space-y-2">
                {report.attachments.map((att) => (
                  <li key={att.id} className="rounded-lg bg-gray-50 p-2">
                    <a
                      href={withFileAccessToken(`/files/${att.file_id}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 items-center gap-2 text-sm text-brand-red hover:underline"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{att.file_name || 'File'}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </AppCard>
          )}

          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <h3 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>
              {canEdit ? 'History / activities' : 'Comments'}
            </h3>
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {visibleComments.length === 0 ? (
                <p className={uiTypography.helper}>No activity yet.</p>
              ) : (
                visibleComments.map((comment) => (
                  <div key={comment.id} className="rounded-lg border-l-4 border-gray-300 bg-gray-50 p-3">
                    <div className="mb-1 text-xs text-gray-500">
                      {formatDate(comment.created_at)} by {comment.created_by?.username || 'System'}
                      {comment.comment_type !== 'comment' && (
                        <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          {comment.comment_type === 'status_change' ? 'Status change' : 'System'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700">{comment.comment_text}</div>
                  </div>
                ))
              )}
            </div>
            {canEdit && (
              <div className={uiCx(uiLayout.actionsRow, 'mt-4 flex-wrap items-end')}>
                <AppInput
                  className="min-w-0 flex-1"
                  placeholder="Add a comment…"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddComment();
                    }
                  }}
                />
                <AppButton type="button" size="sm" onClick={() => void handleAddComment()}>
                  Add
                </AppButton>
              </div>
            )}
          </AppCard>
        </div>
      )}
    </AppFormModal>
  );
}

