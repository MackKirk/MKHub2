import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';
import { useConfirm } from '@/components/ConfirmProvider';

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

export default function UserReports({ userId, canEdit = true }: { userId: string; canEdit?: boolean }) {
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
    queryKey: ['reports', userId],
    queryFn: () => api<Report[]>('GET', `/employees/${userId}/reports`),
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
    queryKey: ['report-detail', userId, showReportDetail],
    queryFn: () => api<ReportDetail>('GET', `/employees/${userId}/reports/${showReportDetail}`),
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

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search reports..."
            className="w-full max-w-md border rounded-lg px-4 py-2"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-brand-red text-white hover:bg-red-700 font-medium"
          >
            + Add Report
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="Fine">Fine</option>
            <option value="Warning">Warning</option>
            <option value="Suspension">Suspension</option>
            <option value="Behavior Note">Behavior Note</option>
            <option value="Other">Other</option>
          </select>
        </div>
        
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="Open">Open</option>
            <option value="Under Review">Under Review</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Severity</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
          >
            <option value="">All Severities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </div>
        
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">From Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
        </div>
        
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">To Date</label>
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>
        
        <div className="col-span-2 flex items-end">
          <button
            onClick={clearFilters}
            className="w-full px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Reports Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left font-semibold text-gray-700">Date</th>
              <th className="p-3 text-left font-semibold text-gray-700">Type</th>
              <th className="p-3 text-left font-semibold text-gray-700">Title</th>
              <th className="p-3 text-left font-semibold text-gray-700">Severity</th>
              <th className="p-3 text-left font-semibold text-gray-700">Status</th>
              <th className="p-3 text-left font-semibold text-gray-700">Last Updated</th>
              <th className="p-3 text-left font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!reports ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  <div className="h-6 bg-gray-100 animate-pulse rounded" />
                </td>
              </tr>
            ) : filteredReports.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  {reports.length === 0 ? 'No reports found' : 'No reports match the filters'}
                </td>
              </tr>
            ) : (
              filteredReports.map((report) => (
                <tr key={report.id} className="border-t border-gray-200 hover:bg-gray-50 transition-colors">
                  <td className="p-3 text-gray-900">{formatDate(report.occurrence_date)}</td>
                  <td className="p-3 text-gray-900">{report.report_type}</td>
                  <td className="p-3 font-medium text-gray-900">{report.title}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        report.severity === 'High'
                          ? 'bg-red-100 text-red-800'
                          : report.severity === 'Medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {report.severity}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        report.status === 'Closed'
                          ? 'bg-gray-100 text-gray-800'
                          : report.status === 'Under Review'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {report.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600">{formatDate(report.updated_at || report.created_at)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowReportDetail(report.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                      >
                        View
                      </button>
                      {canEdit && (
                        <button
                          onClick={async () => {
                            try {
                              const reportDetail = await api<ReportDetail>('GET', `/employees/${userId}/reports/${report.id}`);
                              setEditingReport(reportDetail);
                              setShowCreateModal(true);
                            } catch (e: any) {
                              toast.error('Failed to load report details');
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
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

      {/* Create/Edit Report Modal */}
      {showCreateModal && (
        <CreateReportModal
          userId={userId}
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
          userId={userId}
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

function CreateReportModal({ userId, report, onClose }: { userId: string; report?: ReportDetail; onClose: () => void }) {
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);
  
  // Suspension-specific fields
  const [suspensionStartDate, setSuspensionStartDate] = useState('');
  const [suspensionEndDate, setSuspensionEndDate] = useState('');
  
  // Behavior Note-specific fields
  const [behaviorNoteType, setBehaviorNoteType] = useState<'Positive' | 'Negative' | ''>('');
  
  // Attachments
  const [attachments, setAttachments] = useState<Array<{ file_id: string; file_name: string; file_size: number; file_type: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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

  // Get selected items display names
  const selectedItemsDisplay = useMemo(() => {
    const items: string[] = [];
    selectedProjectsDepartments.forEach(id => {
      if (id.startsWith('project-')) {
        const projectId = id.replace('project-', '');
        const project = projects?.find((p: any) => String(p.id) === projectId);
        if (project) {
          const name = project.name || project.code || 'Project';
          items.push(project.code ? `${project.code} - ${name}` : name);
        }
      } else if (id.startsWith('department-')) {
        const deptId = id.replace('department-', '');
        const division = settings?.divisions?.find((d: any) => String(d.id) === deptId);
        if (division) items.push(division.label);
      }
    });
    return items;
  }, [selectedProjectsDepartments, projects, settings]);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const up: any = await api('POST', '/files/upload', {
        project_id: null,
        client_id: null,
        employee_id: userId,
        category_id: 'report-attachment',
        original_name: file.name,
        content_type: file.type || 'application/octet-stream'
      });
      
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' },
        body: file
      });
      
      if (!put.ok) throw new Error('Upload failed');
      
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type || 'application/octet-stream'
      });
      
      setAttachments(prev => [...prev, {
        file_id: conf.id,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream'
      }]);
      
      toast.success('File uploaded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
        await api('PATCH', `/employees/${userId}/reports/${report.id}`, payload);
        toast.success('Report updated');
      } else {
        // Create new report
        const result = await api('POST', `/employees/${userId}/reports`, payload);
        
        // Add attachments
        for (const att of attachments) {
          await api('POST', `/employees/${userId}/reports/${result.id}/attachments`, {
            file_id: att.file_id,
            file_name: att.file_name,
            file_size: att.file_size,
            file_type: att.file_type,
          });
        }
        toast.success('Report created');
      }
      
      queryClient.invalidateQueries({ queryKey: ['reports', userId] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to create report');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 overflow-y-auto">
      <div className="w-[700px] max-w-[95vw] bg-white rounded-xl shadow-lg overflow-visible my-8 relative flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-6 rounded-t-xl flex items-center justify-between">
          <div className="text-2xl font-extrabold">{report ? 'Edit Report' : 'Create Report'}</div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-visible p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short title for the report"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Report Type *</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="Fine">Fine</option>
              <option value="Warning">Warning</option>
              <option value="Suspension">Suspension</option>
              <option value="Behavior Note">Behavior Note</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Fine-specific fields - moved right after Report Type */}
          {reportType === 'Fine' && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-900">Fine Details</h4>
              <div>
                <label className="block text-sm font-medium mb-1">Vehicle</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="Vehicle information"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Ticket Number</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  placeholder="Ticket number"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Fine Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full border rounded px-3 py-2"
                    value={fineAmount}
                    onChange={(e) => setFineAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Due Date</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Suspension-specific fields - moved right after Report Type */}
          {reportType === 'Suspension' && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-900">Suspension Period</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={suspensionStartDate}
                    onChange={(e) => setSuspensionStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End Date</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={suspensionEndDate}
                    onChange={(e) => setSuspensionEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Behavior Note-specific fields - moved right after Report Type */}
          {reportType === 'Behavior Note' && (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-900">Behavior Note Type</h4>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setBehaviorNoteType('Positive')}
                  className={`p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                    behaviorNoteType === 'Positive'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-300 bg-white hover:border-green-300'
                  }`}
                >
                  <span className="text-2xl">😊</span>
                  <span className={`font-medium ${behaviorNoteType === 'Positive' ? 'text-green-700' : 'text-gray-700'}`}>
                    Positive
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setBehaviorNoteType('Negative')}
                  className={`p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                    behaviorNoteType === 'Negative'
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-300 bg-white hover:border-red-300'
                  }`}
                >
                  <span className="text-2xl">😞</span>
                  <span className={`font-medium ${behaviorNoteType === 'Negative' ? 'text-red-700' : 'text-gray-700'}`}>
                    Negative
                  </span>
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the occurrence"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Occurrence Date *</label>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              value={occurrenceDate}
              onChange={(e) => setOccurrenceDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Severity</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="Open">Open</option>
                <option value="Under Review">Under Review</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Related Project/Department - for all types */}
          <div className="relative z-[100]">
            <label className="block text-sm font-medium mb-1">Related Project/Department</label>
            <div className="relative">
              <button
                ref={dropdownButtonRef}
                type="button"
                onClick={() => {
                  if (dropdownButtonRef.current) {
                    const rect = dropdownButtonRef.current.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    const spaceBelow = viewportHeight - rect.bottom;
                    const maxHeight = Math.min(spaceBelow - 20, 280); // Max 280px or space available - 20px margin
                    setDropdownPosition({
                      top: rect.bottom + window.scrollY + 4,
                      left: rect.left + window.scrollX,
                      width: rect.width,
                      maxHeight,
                    });
                  }
                  setDropdownOpen(!dropdownOpen);
                }}
                className="w-full border rounded px-3 py-2 text-left bg-white flex items-center justify-between"
              >
                <span className={selectedProjectsDepartments.length === 0 ? 'text-gray-400' : ''}>
                  {selectedProjectsDepartments.length === 0 
                    ? 'Select projects/departments...' 
                    : selectedItemsDisplay.join(', ')}
                </span>
                <span className="text-gray-400">▼</span>
              </button>
              {dropdownOpen && dropdownPosition && (
                <>
                  <div 
                    className="fixed inset-0 z-[60]" 
                    onClick={() => {
                      setDropdownOpen(false);
                      setDropdownPosition(null);
                    }}
                  />
                  <div 
                    className="fixed bg-white border rounded-lg shadow-xl overflow-y-auto z-[100]"
                    style={{
                      top: `${dropdownPosition.top}px`,
                      left: `${dropdownPosition.left}px`,
                      width: `${dropdownPosition.width}px`,
                      maxHeight: `${dropdownPosition.maxHeight}px`,
                    }}
                  >
                    {/* Projects Section */}
                      <div className="p-2 border-t border-b bg-gray-50">
                        <div className="font-semibold text-sm text-gray-700">Projects</div>
                      </div>
                      <div className="p-2">
                        {!projects ? (
                          <div className="text-sm text-gray-500 px-3 py-2">Loading projects...</div>
                        ) : projects.length === 0 ? (
                          <div className="text-sm text-gray-500 px-3 py-2">No projects available</div>
                        ) : (
                          projects.map((project: any) => {
                            const name = project.name || project.code || 'Project';
                            const displayName = project.code ? `${project.code} - ${name}` : name;
                            return (
                              <label
                                key={`project-${project.id}`}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedProjectsDepartments.includes(`project-${project.id}`)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProjectsDepartments(prev => [...prev, `project-${project.id}`]);
                                    } else {
                                      setSelectedProjectsDepartments(prev => prev.filter(id => id !== `project-${project.id}`));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-sm">{displayName}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      
                      {/* Departments Section */}
                      <div className="p-2 border-t border-b bg-gray-50">
                        <div className="font-semibold text-sm text-gray-700">Departments</div>
                      </div>
                      <div className="p-2">
                        {!settings?.divisions ? (
                          <div className="text-sm text-gray-500 px-3 py-2">Loading departments...</div>
                        ) : settings.divisions.length === 0 ? (
                          <div className="text-sm text-gray-500 px-3 py-2">No departments available</div>
                        ) : (
                          settings.divisions.map((division: any) => (
                            <label
                              key={`department-${division.id}`}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={selectedProjectsDepartments.includes(`department-${division.id}`)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedProjectsDepartments(prev => [...prev, `department-${division.id}`]);
                                  } else {
                                    setSelectedProjectsDepartments(prev => prev.filter(id => id !== `department-${division.id}`));
                                  }
                                }}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm">{division.label}</span>
                            </label>
                          ))
                        )}
                      </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium mb-1">Attachments</label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : '+ Add File'}
            </button>
            {attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {attachments.map((att, idx) => (
                  <div key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                    <span>📎 {att.file_name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? (report ? 'Updating...' : 'Creating...') : (report ? 'Update Report' : 'Create Report')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportDetailView({
  userId,
  reportId,
  isEditing,
  canEdit,
  onClose,
  onEdit,
}: {
  userId: string;
  reportId: string;
  isEditing: boolean;
  canEdit: boolean;
  onClose: () => void;
  onEdit?: (report: ReportDetail) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(isEditing);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingReportData, setEditingReportData] = useState<ReportDetail | null>(null);
  const [newComment, setNewComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
  const [editDropdownOpen, setEditDropdownOpen] = useState(false);
  const [editDropdownPosition, setEditDropdownPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const editDropdownButtonRef = useRef<HTMLButtonElement>(null);
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

  // Get selected items display names for edit mode
  const editSelectedItemsDisplay = useMemo(() => {
    const items: string[] = [];
    editSelectedProjectsDepartments.forEach(id => {
      if (id.startsWith('project-')) {
        const projectId = id.replace('project-', '');
        const project = editProjects?.find((p: any) => String(p.id) === projectId);
        if (project) {
          const name = project.name || project.code || 'Project';
          items.push(project.code ? `${project.code} - ${name}` : name);
        }
      } else if (id.startsWith('department-')) {
        const deptId = id.replace('department-', '');
        const division = editSettings?.divisions?.find((d: any) => String(d.id) === deptId);
        if (division) items.push(division.label);
      }
    });
    return items;
  }, [editSelectedProjectsDepartments, editProjects, editSettings]);

  const { data: report, refetch: refetchReport } = useQuery<ReportDetail>({
    queryKey: ['report-detail', userId, reportId],
    queryFn: () => api<ReportDetail>('GET', `/employees/${userId}/reports/${reportId}`),
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
      await api('POST', `/employees/${userId}/reports/${reportId}/comments`, {
        comment_text: newComment.trim(),
        comment_type: 'comment',
      });
      toast.success('Comment added');
      setNewComment('');
      refetchReport();
      queryClient.invalidateQueries({ queryKey: ['report-detail', userId, reportId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to add comment');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const up: any = await api('POST', '/files/upload', {
        project_id: null,
        client_id: null,
        employee_id: userId,
        category_id: 'report-attachment',
        original_name: file.name,
        content_type: file.type || 'application/octet-stream'
      });
      
      const put = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' },
        body: file
      });
      
      if (!put.ok) throw new Error('Upload failed');
      
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type || 'application/octet-stream'
      });
      
      await api('POST', `/employees/${userId}/reports/${reportId}/attachments`, {
        file_id: conf.id,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
      });
      
      toast.success('File uploaded');
      refetchReport();
      queryClient.invalidateQueries({ queryKey: ['report-detail', userId, reportId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await api('DELETE', `/employees/${userId}/reports/${reportId}/attachments/${attachmentId}`);
      toast.success('Attachment removed');
      refetchReport();
      queryClient.invalidateQueries({ queryKey: ['report-detail', userId, reportId] });
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

      await api('PATCH', `/employees/${userId}/reports/${reportId}`, payload);
      toast.success('Report updated');
      setEditing(false);
      refetchReport();
      queryClient.invalidateQueries({ queryKey: ['reports', userId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update report');
    }
  };

  if (!report) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b font-semibold flex items-center justify-between">
            <span>Report Details</span>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-center py-8 text-gray-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
      <div className="w-[900px] max-w-[95vw] bg-white rounded-xl shadow-lg overflow-visible flex flex-col my-8 max-h-[90vh]">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-6 rounded-t-xl flex items-center justify-between">
          <div className="flex-1">
            {editing ? (
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 font-semibold text-gray-900"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Report title"
              />
            ) : (
              <div className="text-2xl font-extrabold">{report.report_type}: {report.title}</div>
            )}
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-visible p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600">Status</div>
              <div className="mt-1">
                {editing ? (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="Open">Open</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Closed">Closed</option>
                  </select>
                ) : (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      report.status === 'Closed'
                        ? 'bg-gray-100 text-gray-800'
                        : report.status === 'Under Review'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}
                  >
                    {report.status}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Severity</div>
              <div className="mt-1">
                {editing ? (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value)}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                ) : (
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      report.severity === 'High'
                        ? 'bg-red-100 text-red-800'
                        : report.severity === 'Medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {report.severity}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Occurrence Date</div>
              <div>{formatDate(report.occurrence_date)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Reported By</div>
              <div>{report.reported_by?.username || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Last Updated</div>
              <div>{formatDate(report.updated_at || report.created_at)}</div>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="text-sm font-medium mb-2">Description</div>
            {editing ? (
              <textarea
                className="w-full border rounded px-3 py-2"
                rows={4}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            ) : (
              <div className="text-gray-700 whitespace-pre-wrap">{report.description || '-'}</div>
            )}
          </div>

          {/* Type-specific fields */}
          {report.report_type === 'Fine' && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-900 mb-3">Fine Details</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Vehicle</div>
                  {editing ? (
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editVehicle}
                      onChange={(e) => setEditVehicle(e.target.value)}
                    />
                  ) : (
                    <div>{report.vehicle || '-'}</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-600">Ticket Number</div>
                  {editing ? (
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editTicketNumber}
                      onChange={(e) => setEditTicketNumber(e.target.value)}
                    />
                  ) : (
                    <div>{report.ticket_number || '-'}</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-600">Fine Amount</div>
                  {editing ? (
                    <input
                      type="number"
                      step="0.01"
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editFineAmount}
                      onChange={(e) => setEditFineAmount(e.target.value)}
                    />
                  ) : (
                    <div>{report.fine_amount ? formatCurrency(report.fine_amount) : '-'}</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-600">Due Date</div>
                  {editing ? (
                    <input
                      type="date"
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                    />
                  ) : (
                    <div>{formatDate(report.due_date)}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Related Project/Department - for all types */}
          <div className="relative">
            <div className="text-sm text-gray-600 mb-1">Related Project/Department</div>
            {editing ? (
              <div className="relative">
                <button
                  ref={editDropdownButtonRef}
                  type="button"
                  onClick={() => {
                    if (editDropdownButtonRef.current) {
                      const rect = editDropdownButtonRef.current.getBoundingClientRect();
                      const viewportHeight = window.innerHeight;
                      const spaceBelow = viewportHeight - rect.bottom;
                      const maxHeight = Math.min(spaceBelow - 20, 280); // Max 280px or space available - 20px margin
                      setEditDropdownPosition({
                        top: rect.bottom + window.scrollY + 4,
                        left: rect.left + window.scrollX,
                        width: rect.width,
                        maxHeight,
                      });
                    }
                    setEditDropdownOpen(!editDropdownOpen);
                  }}
                  className="w-full border rounded px-3 py-2 text-left bg-white flex items-center justify-between"
                >
                  <span className={editSelectedProjectsDepartments.length === 0 ? 'text-gray-400' : ''}>
                    {editSelectedProjectsDepartments.length === 0 
                      ? 'Select projects/departments...' 
                      : editSelectedItemsDisplay.join(', ')}
                  </span>
                  <span className="text-gray-400">▼</span>
                </button>
                {editDropdownOpen && editDropdownPosition && (
                  <>
                    <div 
                      className="fixed inset-0 z-[60]" 
                      onClick={() => {
                        setEditDropdownOpen(false);
                        setEditDropdownPosition(null);
                      }}
                    />
                    <div 
                      className="fixed bg-white border rounded-lg shadow-xl overflow-y-auto z-[100]"
                      style={{
                        top: `${editDropdownPosition.top}px`,
                        left: `${editDropdownPosition.left}px`,
                        width: `${editDropdownPosition.width}px`,
                        maxHeight: `${editDropdownPosition.maxHeight}px`,
                      }}
                    >
                      {/* Projects Section */}
                      <div className="p-2 border-t border-b bg-gray-50">
                        <div className="font-semibold text-sm text-gray-700">Projects</div>
                      </div>
                      <div className="p-2">
                        {!editProjects ? (
                          <div className="text-sm text-gray-500 px-3 py-2">Loading projects...</div>
                        ) : editProjects.length === 0 ? (
                          <div className="text-sm text-gray-500 px-3 py-2">No projects available</div>
                        ) : (
                          editProjects.map((project: any) => {
                            const name = project.name || project.code || 'Project';
                            const displayName = project.code ? `${project.code} - ${name}` : name;
                            return (
                              <label
                                key={`project-${project.id}`}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={editSelectedProjectsDepartments.includes(`project-${project.id}`)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEditSelectedProjectsDepartments(prev => [...prev, `project-${project.id}`]);
                                    } else {
                                      setEditSelectedProjectsDepartments(prev => prev.filter(id => id !== `project-${project.id}`));
                                    }
                                  }}
                                  className="rounded border-gray-300"
                                />
                                <span className="text-sm">{displayName}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      
                      {/* Departments Section */}
                      <div className="p-2 border-t border-b bg-gray-50">
                        <div className="font-semibold text-sm text-gray-700">Departments</div>
                      </div>
                      <div className="p-2">
                        {!editSettings?.divisions ? (
                          <div className="text-sm text-gray-500 px-3 py-2">Loading departments...</div>
                        ) : editSettings.divisions.length === 0 ? (
                          <div className="text-sm text-gray-500 px-3 py-2">No departments available</div>
                        ) : (
                          editSettings.divisions.map((division: any) => (
                            <label
                              key={`department-${division.id}`}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={editSelectedProjectsDepartments.includes(`department-${division.id}`)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditSelectedProjectsDepartments(prev => [...prev, `department-${division.id}`]);
                                  } else {
                                    setEditSelectedProjectsDepartments(prev => prev.filter(id => id !== `department-${division.id}`));
                                  }
                                }}
                                className="rounded border-gray-300"
                              />
                              <span className="text-sm">{division.label}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div>{report.related_project_department || '-'}</div>
            )}
          </div>

          {report.report_type === 'Suspension' && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-900 mb-3">Suspension Period</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Start Date</div>
                  {editing ? (
                    <input
                      type="date"
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editSuspensionStartDate}
                      onChange={(e) => setEditSuspensionStartDate(e.target.value)}
                    />
                  ) : (
                    <div>{formatDate(report.suspension_start_date)}</div>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-600">End Date</div>
                  {editing ? (
                    <input
                      type="date"
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editSuspensionEndDate}
                      onChange={(e) => setEditSuspensionEndDate(e.target.value)}
                    />
                  ) : (
                    <div>{formatDate(report.suspension_end_date)}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {report.report_type === 'Behavior Note' && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-900 mb-3">Behavior Note Type</h4>
              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setEditBehaviorNoteType('Positive')}
                    className={`p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                      editBehaviorNoteType === 'Positive'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 bg-white hover:border-green-300'
                    }`}
                  >
                    <span className="text-2xl">😊</span>
                    <span className={`font-medium ${editBehaviorNoteType === 'Positive' ? 'text-green-700' : 'text-gray-700'}`}>
                      Positive
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditBehaviorNoteType('Negative')}
                    className={`p-4 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                      editBehaviorNoteType === 'Negative'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-300 bg-white hover:border-red-300'
                    }`}
                  >
                    <span className="text-2xl">😞</span>
                    <span className={`font-medium ${editBehaviorNoteType === 'Negative' ? 'text-red-700' : 'text-gray-700'}`}>
                      Negative
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {(report as any).behavior_note_type === 'Positive' ? (
                    <>
                      <span className="text-3xl">😊</span>
                      <span className="font-medium text-green-700">Positive</span>
                    </>
                  ) : (report as any).behavior_note_type === 'Negative' ? (
                    <>
                      <span className="text-3xl">😞</span>
                      <span className="font-medium text-red-700">Negative</span>
                    </>
                  ) : (
                    <span className="text-gray-500">Not specified</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Attachments</div>
              {canEdit && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-sm px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : '+ Add File'}
                  </button>
                </>
              )}
            </div>
            {report.attachments.length === 0 ? (
              <div className="text-sm text-gray-500">No attachments</div>
            ) : (
              <div className="space-y-2">
                {report.attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <a
                      href={`/files/${att.file_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-2"
                    >
                      📎 {att.file_name || 'File'}
                    </a>
                    {canEdit && (
                      <button
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
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
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                className="flex-1 border rounded px-3 py-2"
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddComment();
                  }
                }}
              />
              <button
                onClick={handleAddComment}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700"
              >
                Save Changes
              </button>
            </>
          ) : (
            <>
              {canEdit && !showEditModal && (
                <button
                  onClick={() => {
                    if (report) {
                      setEditingReportData(report);
                      setShowEditModal(true);
                    }
                  }}
                  className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700"
                >
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Edit Modal Overlay */}
      {showEditModal && editingReportData && (
        <CreateReportModal
          userId={userId}
          report={editingReportData}
          onClose={() => {
            setShowEditModal(false);
            setEditingReportData(null);
            refetchReport();
            queryClient.invalidateQueries({ queryKey: ['reports', userId] });
          }}
        />
      )}
    </div>
  );
}

