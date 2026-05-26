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
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppMultiSelect,
  type AppMultiSelectOption,
  AppSectionHeader,
  AppSelect,
  AppTextarea,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiSpacing,
  uiTypography,
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
  children,
}: {
  title: string;
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
      <h4 className={uiCx(uiTypography.sectionTitle)}>{title}</h4>
      {children}
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
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<ReportDetail | null>(null);
  
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

  const { data: reportDetail } = useQuery<ReportDetail>({
    queryKey: ['report-detail', variant, subjectId, showReportDetail],
    queryFn: () => api<ReportDetail>('GET', `${reportsPrefix}/${showReportDetail}`),
    enabled: !!showReportDetail,
  });

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

  return (
    <div className="space-y-6 pb-24">
      <AppCard>
        <AppSectionHeader
          title="Reports"
          description={reportsDescription}
          {...appSectionPresetProps('description')}
          action={
            canEdit ? (
              <AppButton type="button" size="sm" onClick={() => setShowCreateModal(true)}>
                Add report
              </AppButton>
            ) : undefined
          }
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

          <div className={uiCx(uiBorders.subtle, 'overflow-hidden rounded-xl border')}>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-xs font-medium text-gray-600">Date</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600">Type</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600">Title</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600">Severity</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600">Status</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600">Last updated</th>
                  <th className="p-3 text-left text-xs font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {canEdit && (
                  <tr>
                    <td colSpan={7} className="p-0 align-top">
                      <button
                        type="button"
                        onClick={() => setShowCreateModal(true)}
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-t-xl border-2 border-dashed border-gray-300 p-3 text-gray-600 transition-colors hover:border-brand-red hover:bg-gray-50 hover:text-brand-red"
                      >
                        <span className="text-lg font-medium">+</span>
                        <span className="text-sm font-medium">Add report</span>
                      </button>
                    </td>
                  </tr>
                )}
                {!reports ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-xs text-gray-500">
                      <div className="h-6 animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ) : filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-xs text-gray-500">
                      {reports.length === 0 ? 'No reports found' : 'No reports match the filters'}
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((report) => (
                    <tr key={report.id} className="border-t border-gray-200 transition-colors hover:bg-gray-50">
                      <td className="p-3 text-xs text-gray-900">{formatDate(report.occurrence_date)}</td>
                      <td className="p-3 text-xs text-gray-900">{report.report_type}</td>
                      <td className="p-3 text-xs font-semibold text-gray-900">{report.title}</td>
                      <td className="p-3">
                        <AppBadge variant={reportSeverityVariant(report.severity)}>{report.severity}</AppBadge>
                      </td>
                      <td className="p-3">
                        <AppBadge variant={reportStatusVariant(report.status)}>{report.status}</AppBadge>
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {formatDate(report.updated_at || report.created_at)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowReportDetail(report.id)}
                            className="text-xs font-medium text-brand-red hover:underline"
                          >
                            View
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const detail = await api<ReportDetail>('GET', `${reportsPrefix}/${report.id}`);
                                  setEditingReport(detail);
                                  setShowCreateModal(true);
                                } catch {
                                  toast.error('Failed to load report details');
                                }
                              }}
                              className="text-xs font-medium text-gray-600 hover:text-gray-900 hover:underline"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
          isEditing={editingReportId === showReportDetail}
          canEdit={canEdit}
          onClose={() => {
            setShowReportDetail(null);
            setEditingReportId(null);
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
  
  // Attachments
  const [attachments, setAttachments] = useState<Array<{ file_id: string; file_name: string; file_size: number; file_type: string }>>([]);
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

  // Initialize form when editing
  useEffect(() => {
    if (report && projects && settings) {
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
      setBehaviorNoteType((report as any).behavior_note_type || '');
      
      // Match saved related_project_department
      const matchedIds: string[] = [];
      if (report.related_project_department) {
        const savedNames = report.related_project_department.split(', ').map(s => s.trim());
        
        // Match projects
        projects.forEach((project: any) => {
          const name = project.name || project.code || 'Project';
          const displayName = project.code ? `${project.code} - ${name}` : name;
          if (savedNames.includes(displayName)) {
            matchedIds.push(`project-${project.id}`);
          }
        });
        
        // Match departments
        if (settings?.divisions) {
          settings.divisions.forEach((division: any) => {
            if (savedNames.includes(division.label)) {
              matchedIds.push(`department-${division.id}`);
            }
          });
        }
      }
      setSelectedProjectsDepartments(matchedIds);
    } else if (!report) {
      // Reset form when creating new report
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
    }
  }, [report, projects, settings]);

  const uploadAttachmentFile = async (file: File) => {
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

    setAttachments((prev) => [
      ...prev,
      {
        file_id: conf.id,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
      },
    ]);
  };

  const handleFilesSelected = async (added: File[]) => {
    if (!added.length) return;
    setUploading(true);
    try {
      for (const file of added) {
        await uploadAttachmentFile(file);
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
        <>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" loading={saving} onClick={handleSubmit}>
            {report ? 'Update report' : 'Create report'}
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        <AppInput
          label="Title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short title for the report"
        />
        <AppSelect
          label="Report type"
          required
          value={reportType}
          options={REPORT_TYPE_OPTIONS}
          onChange={(e) => setReportType(e.target.value)}
        />

        {reportType === 'Fine' && (
          <ReportTypeFieldsSection title="Fine details">
            <AppInput
              label="Vehicle"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder="Vehicle information"
            />
            <AppInput
              label="Ticket number"
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value)}
              placeholder="Ticket number"
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
              />
              <AppDatePicker
                label="Due date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </ReportTypeFieldsSection>
        )}

        {reportType === 'Suspension' && (
          <ReportTypeFieldsSection title="Suspension period">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AppDatePicker
                label="Start date"
                value={suspensionStartDate}
                onChange={(e) => setSuspensionStartDate(e.target.value)}
              />
              <AppDatePicker
                label="End date"
                value={suspensionEndDate}
                onChange={(e) => setSuspensionEndDate(e.target.value)}
              />
            </div>
          </ReportTypeFieldsSection>
        )}

        {reportType === 'Behavior Note' && (
          <ReportTypeFieldsSection title="Behavior note type">
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
        />
        <AppDatePicker
          label="Occurrence date"
          required
          value={occurrenceDate}
          onChange={(e) => setOccurrenceDate(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppSelect
            label="Severity"
            value={severity}
            options={REPORT_SEVERITY_OPTIONS}
            onChange={(e) => setSeverity(e.target.value)}
          />
          <AppSelect
            label="Status"
            value={status}
            options={REPORT_STATUS_OPTIONS}
            onChange={(e) => setStatus(e.target.value)}
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
        />
        {!report && (
          <>
            <AppFileUpload
              mode="multiple"
              value={[]}
              onChange={() => {}}
              onFilesSelected={handleFilesSelected}
              disabled={uploading}
              label="Attachments"
              helperText="Files upload when selected and attach when you save the report."
            />
            {attachments.length > 0 && (
              <ul className="space-y-1">
                {attachments.map((att, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs text-gray-600">
                    <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{att.file_name}</span>
                    <button
                      type="button"
                      className="text-red-600 hover:text-red-800"
                      aria-label={`Remove ${att.file_name}`}
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
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
  isEditing,
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
  isEditing: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit?: (report: ReportDetail) => void;
}) {
  const queryClient = useQueryClient();
  const isWorker = variant === 'worker';
  const [editing, setEditing] = useState(isEditing);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReportData, setEditingReportData] = useState<ReportDetail | null>(null);
  const [newComment, setNewComment] = useState('');
  const [uploading, setUploading] = useState(false);

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSeverity, setEditSeverity] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editVehicle, setEditVehicle] = useState('');
  const [editTicketNumber, setEditTicketNumber] = useState('');
  const [editFineAmount, setEditFineAmount] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editSelectedProjectsDepartments, setEditSelectedProjectsDepartments] = useState<string[]>([]);
  const [editSuspensionStartDate, setEditSuspensionStartDate] = useState('');
  const [editSuspensionEndDate, setEditSuspensionEndDate] = useState('');
  const [editBehaviorNoteType, setEditBehaviorNoteType] = useState<'Positive' | 'Negative' | ''>('');

  // Fetch projects for edit mode
  const { data: editProjects } = useQuery<any[]>({
    queryKey: ['projects-list-edit'],
    queryFn: () => api<any[]>('GET', '/projects'),
  });

  // Fetch settings to get divisions (departments) for edit mode
  const { data: editSettings } = useQuery<any>({
    queryKey: ['settings-edit'],
    queryFn: () => api<any>('GET', '/settings'),
  });

  const editProjectDeptOptions = useMemo(
    () => buildProjectDepartmentOptions(editProjects, editSettings),
    [editProjects, editSettings],
  );

  const editSelectedItemsDisplay = useMemo(
    () =>
      editSelectedProjectsDepartments
        .map((id) => editProjectDeptOptions.find((o) => o.value === id)?.label)
        .filter((label): label is string => Boolean(label)),
    [editSelectedProjectsDepartments, editProjectDeptOptions],
  );

  const { data: report, refetch: refetchReport } = useQuery<ReportDetail>({
    queryKey: ['report-detail', variant, subjectId, reportId],
    queryFn: () => api<ReportDetail>('GET', `${reportsPrefix}/${reportId}`),
  });

  // Initialize edit form when report loads
  useEffect(() => {
    if (report && editProjects && editSettings) {
      setEditTitle(report.title);
      setEditDescription(report.description || '');
      setEditSeverity(report.severity);
      setEditStatus(report.status);
      setEditVehicle(report.vehicle || '');
      setEditTicketNumber(report.ticket_number || '');
      setEditFineAmount(report.fine_amount?.toString() || '');
      setEditDueDate(report.due_date ? report.due_date.split('T')[0] : '');
      
      // Match saved related_project_department with options
      const matchedIds: string[] = [];
      if (report.related_project_department) {
        const savedNames = report.related_project_department.split(', ').map(s => s.trim());
        
        // Match projects
        editProjects.forEach((project: any) => {
          const name = project.name || project.code || 'Project';
          const displayName = project.code ? `${project.code} - ${name}` : name;
          if (savedNames.includes(displayName)) {
            matchedIds.push(`project-${project.id}`);
          }
        });
        
        // Match departments
        if (editSettings?.divisions) {
          editSettings.divisions.forEach((division: any) => {
            if (savedNames.includes(division.label)) {
              matchedIds.push(`department-${division.id}`);
            }
          });
        }
      }
      setEditSelectedProjectsDepartments(matchedIds);
      
      setEditSuspensionStartDate(report.suspension_start_date ? report.suspension_start_date.split('T')[0] : '');
      setEditSuspensionEndDate(report.suspension_end_date ? report.suspension_end_date.split('T')[0] : '');
      setEditBehaviorNoteType((report as any).behavior_note_type || '');
    }
  }, [report, editProjects, editSettings]);

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

  const uploadDetailAttachment = async (file: File) => {
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

    await api('POST', `${reportsPrefix}/${reportId}/attachments`, {
      file_id: conf.id,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
    });
  };

  const handleDetailFilesSelected = async (added: File[]) => {
    if (!added.length) return;
    setUploading(true);
    try {
      for (const file of added) {
        await uploadDetailAttachment(file);
      }
      toast.success('File uploaded');
      refetchReport();
      queryClient.invalidateQueries({ queryKey: ['report-detail', variant, subjectId, reportId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await api('DELETE', `${reportsPrefix}/${reportId}/attachments/${attachmentId}`);
      toast.success('Attachment removed');
      refetchReport();
      queryClient.invalidateQueries({ queryKey: ['report-detail', variant, subjectId, reportId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to remove attachment');
    }
  };

  const handleSave = async () => {
    try {
      const payload: any = {
        title: editTitle.trim(),
        description: editDescription || undefined,
        severity: editSeverity,
        status: editStatus,
      };

      if (report?.report_type === 'Fine') {
        payload.vehicle = editVehicle || undefined;
        payload.ticket_number = editTicketNumber || undefined;
        payload.fine_amount = editFineAmount ? parseFloat(editFineAmount) : undefined;
        payload.due_date = editDueDate || undefined;
      }

      // Related Project/Department (for all types)
      if (editSelectedProjectsDepartments.length > 0) {
        payload.related_project_department = editSelectedItemsDisplay.join(', ');
      } else {
        payload.related_project_department = undefined;
      }

      if (report?.report_type === 'Suspension') {
        payload.suspension_start_date = editSuspensionStartDate || undefined;
        payload.suspension_end_date = editSuspensionEndDate || undefined;
      }

      if (report?.report_type === 'Behavior Note') {
        payload.behavior_note_type = editBehaviorNoteType || undefined;
      }

      await api('PATCH', `${reportsPrefix}/${reportId}`, payload);
      toast.success('Report updated');
      setEditing(false);
      refetchReport();
      queryClient.invalidateQueries({ queryKey: [...reportsListQueryKey] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update report');
    }
  };

  const detailFooter = !report ? (
    <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
      Close
    </AppButton>
  ) : editing ? (
    <>
      <AppButton type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </AppButton>
      <AppButton type="button" size="sm" onClick={handleSave}>
        Save changes
      </AppButton>
    </>
  ) : (
    <>
      <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
        Close
      </AppButton>
      {canEdit && !showEditModal && (
        <AppButton
          type="button"
          size="sm"
          onClick={() => {
            setEditingReportData(report);
            setShowEditModal(true);
          }}
        >
          Edit
        </AppButton>
      )}
    </>
  );

  return (
    <>
      <AppFormModal
        open
        onClose={onClose}
        layout="detail"
        title="Report details"
        description={report ? `${report.report_type}: ${report.title}` : 'Loading…'}
        quickInfo={report ? employeeReportDetailQuickInfo({ isWorker, canEdit }) : undefined}
        footer={detailFooter}
      >
        {!report ? (
          <div className="flex items-center justify-center py-12 text-sm text-gray-500">Loading…</div>
        ) : (
          <div className="space-y-6">
          {editing && (
            <AppInput
              label="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Report title"
            />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              {editing ? (
                <AppSelect
                  label="Status"
                  value={editStatus}
                  options={REPORT_STATUS_OPTIONS}
                  onChange={(e) => setEditStatus(e.target.value)}
                />
              ) : (
                <>
                  <div className={uiCx(uiTypography.sectionSubtitle, 'mb-1.5 text-gray-600')}>Status</div>
                  <AppBadge variant={reportStatusVariant(report.status)}>{report.status}</AppBadge>
                </>
              )}
            </div>
            <div>
              {editing ? (
                <AppSelect
                  label="Severity"
                  value={editSeverity}
                  options={REPORT_SEVERITY_OPTIONS}
                  onChange={(e) => setEditSeverity(e.target.value)}
                />
              ) : (
                <>
                  <div className={uiCx(uiTypography.sectionSubtitle, 'mb-1.5 text-gray-600')}>Severity</div>
                  <AppBadge variant={reportSeverityVariant(report.severity)}>{report.severity}</AppBadge>
                </>
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Occurrence Date</div>
              <div className="text-sm font-semibold text-gray-900">{formatDate(report.occurrence_date)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Reported By</div>
              <div className="text-sm font-semibold text-gray-900">{report.reported_by?.username || '—'}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Last Updated</div>
              <div className="text-sm font-semibold text-gray-900">{formatDate(report.updated_at || report.created_at)}</div>
            </div>
          </div>

          {editing ? (
            <AppTextarea
              label="Description"
              rows={4}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          ) : (
            <div>
              <div className={uiCx(uiTypography.sectionSubtitle, 'mb-2 font-semibold text-gray-900')}>Description</div>
              <div className="whitespace-pre-wrap text-xs text-gray-700">{report.description || '—'}</div>
            </div>
          )}

          {report.report_type === 'Fine' && (
            <ReportTypeFieldsSection title="Fine details">
              {editing ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <AppInput
                    label="Vehicle"
                    value={editVehicle}
                    onChange={(e) => setEditVehicle(e.target.value)}
                  />
                  <AppInput
                    label="Ticket number"
                    value={editTicketNumber}
                    onChange={(e) => setEditTicketNumber(e.target.value)}
                  />
                  <AppInput
                    label="Fine amount"
                    type="number"
                    step="0.01"
                    value={editFineAmount}
                    onChange={(e) => setEditFineAmount(e.target.value)}
                  />
                  <AppDatePicker
                    label="Due date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 text-sm text-gray-900">
                  <div>
                    <div className="text-gray-600">Vehicle</div>
                    <div>{report.vehicle || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Ticket number</div>
                    <div>{report.ticket_number || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Fine amount</div>
                    <div>{report.fine_amount ? formatCurrency(report.fine_amount) : '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Due date</div>
                    <div>{formatDate(report.due_date)}</div>
                  </div>
                </div>
              )}
            </ReportTypeFieldsSection>
          )}

          {editing ? (
            <AppMultiSelect
              label="Related project / department"
              value={editSelectedProjectsDepartments}
              onChange={setEditSelectedProjectsDepartments}
              options={editProjectDeptOptions}
              placeholder="Select projects or departments…"
              searchable
              emptyMessage={!editProjects ? 'Loading…' : 'No projects or departments available'}
            />
          ) : (
            <div>
              <div className={uiCx(uiTypography.sectionSubtitle, 'mb-1 text-gray-600')}>Related project / department</div>
              <div className="text-sm text-gray-900">{report.related_project_department || '—'}</div>
            </div>
          )}

          {report.report_type === 'Suspension' && (
            <ReportTypeFieldsSection title="Suspension period">
              {editing ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <AppDatePicker
                    label="Start date"
                    value={editSuspensionStartDate}
                    onChange={(e) => setEditSuspensionStartDate(e.target.value)}
                  />
                  <AppDatePicker
                    label="End date"
                    value={editSuspensionEndDate}
                    onChange={(e) => setEditSuspensionEndDate(e.target.value)}
                  />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 text-sm text-gray-900">
                  <div>
                    <div className="text-gray-600">Start date</div>
                    <div>{formatDate(report.suspension_start_date)}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">End date</div>
                    <div>{formatDate(report.suspension_end_date)}</div>
                  </div>
                </div>
              )}
            </ReportTypeFieldsSection>
          )}

          {report.report_type === 'Behavior Note' && (
            <ReportTypeFieldsSection title="Behavior note type">
              {editing ? (
                <div className="grid grid-cols-2 gap-3">
                  <AppButton
                    type="button"
                    variant={editBehaviorNoteType === 'Positive' ? 'primary' : 'secondary'}
                    className="justify-center gap-2 py-3"
                    onClick={() => setEditBehaviorNoteType('Positive')}
                  >
                    <span aria-hidden>😊</span>
                    Positive
                  </AppButton>
                  <AppButton
                    type="button"
                    variant={editBehaviorNoteType === 'Negative' ? 'primary' : 'secondary'}
                    className="justify-center gap-2 py-3"
                    onClick={() => setEditBehaviorNoteType('Negative')}
                  >
                    <span aria-hidden>😞</span>
                    Negative
                  </AppButton>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {(report as any).behavior_note_type === 'Positive' ? (
                    <>
                      <span className="text-3xl" aria-hidden>
                        😊
                      </span>
                      <span className="font-medium text-green-700">Positive</span>
                    </>
                  ) : (report as any).behavior_note_type === 'Negative' ? (
                    <>
                      <span className="text-3xl" aria-hidden>
                        😞
                      </span>
                      <span className="font-medium text-red-700">Negative</span>
                    </>
                  ) : (
                    <span className="text-gray-500">Not specified</span>
                  )}
                </div>
              )}
            </ReportTypeFieldsSection>
          )}

          <div>
            <div className={uiCx(uiTypography.sectionSubtitle, 'mb-2 font-semibold text-gray-900')}>Attachments</div>
            {canEdit && (
              <AppFileUpload
                mode="multiple"
                value={[]}
                onChange={() => {}}
                onFilesSelected={handleDetailFilesSelected}
                disabled={uploading}
                label="Add file"
                helperText="Uploads attach to this report immediately."
              />
            )}
            {report.attachments.length === 0 ? (
              <div className="mt-2 text-sm text-gray-500">No attachments</div>
            ) : (
              <ul className="mt-2 space-y-2">
                {report.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 p-2"
                  >
                    <a
                      href={withFileAccessToken(`/files/${att.file_id}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 items-center gap-2 text-sm text-brand-red hover:underline"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{att.file_name || 'File'}</span>
                    </a>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Timeline/Comments */}
          <div>
            <div className="text-sm font-medium mb-2">
              {canEdit ? 'History / Activities' : 'Comments'}
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {canEdit ? (
                // Show all comments (system, status changes, and user comments) when canEdit is true
                report.comments.map((comment) => (
                  <div key={comment.id} className="p-3 bg-gray-50 rounded border-l-4 border-gray-300">
                    <div className="text-xs text-gray-500 mb-1">
                      {formatDate(comment.created_at)} by {comment.created_by?.username || 'System'}
                      {comment.comment_type !== 'comment' && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                          {comment.comment_type === 'status_change' ? 'Status Change' : 'System'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700">{comment.comment_text}</div>
                  </div>
                ))
              ) : (
                // Show only user comments (type 'comment') when canEdit is false (My Information view)
                report.comments
                  .filter((comment) => comment.comment_type === 'comment')
                  .map((comment) => (
                    <div key={comment.id} className="p-3 bg-gray-50 rounded border-l-4 border-gray-300">
                      <div className="text-xs text-gray-500 mb-1">
                        {formatDate(comment.created_at)} by {comment.created_by?.username || 'System'}
                      </div>
                      <div className="text-sm text-gray-700">{comment.comment_text}</div>
                    </div>
                  ))
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <AppInput
                className="min-w-0 flex-1"
                placeholder="Add a comment…"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <AppButton type="button" size="sm" onClick={handleAddComment}>
                Add
              </AppButton>
            </div>
          </div>
          </div>
        )}
      </AppFormModal>

      {showEditModal && editingReportData && (
        <CreateReportModal
          reportsPrefix={reportsPrefix}
          reportsListQueryKey={reportsListQueryKey}
          fileUploadEmployeeId={fileUploadEmployeeId}
          isWorker={isWorker}
          report={editingReportData}
          onClose={() => {
            setShowEditModal(false);
            setEditingReportData(null);
            refetchReport();
            queryClient.invalidateQueries({ queryKey: [...reportsListQueryKey] });
          }}
        />
      )}
    </>
  );
}

