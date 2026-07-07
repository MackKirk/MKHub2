import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import { formatSiteHeroAddress } from '@/lib/addressUtils';
import toast from 'react-hot-toast';
import {
  readAllDirectoryEntries,
  getWebkitRelativePath,
  dropLooksLikeFolderTree,
  dataTransferMayContainDirectory,
} from '@/lib/projectFolderDrop';
import ImagePicker from '@/components/ImagePicker';
import EstimateBuilder, { type EstimateBuilderRef } from '@/components/EstimateBuilder';
import ProposalForm, { toSqft, fromSqft, formatAreaLabel, type AreaUnit } from '@/components/ProposalForm';
import ProjectProposalTab from '@/components/ProjectProposalTab';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import CalendarMock from '@/components/CalendarMock';
import { ProjectConvertToProjectModalDsForm } from '@/components/ProjectConvertToProjectModalDsForm';
import { ProjectReportsTabDs } from '@/components/ProjectReportsTabDs';
import DispatchTab from '@/components/DispatchTab';
import ProjectTimesheetTab from '@/components/ProjectTimesheetTab';
import ProjectFilesTabEnhanced from '@/components/ProjectFilesTabEnhanced';
import OrdersTab from '@/components/OrdersTab';
import ProjectDocumentsTab from '@/components/ProjectDocumentsTab';
import ProjectSafetyTab from '@/components/ProjectSafetyTab';
import ProjectFieldBriefCard from '@/components/ProjectFieldBriefCard';
import SiteFormModal, { type ClientSiteRecord } from '@/components/SiteFormModal';
import ProjectBillingSection from '@/components/ProjectBillingSection';
import { formatDateLocal, getCurrentMonthLocal } from '@/lib/dateUtils';
import { DivisionIcon } from '@/components/DivisionIcon';
import { ReportAttachmentAreaMultiple } from '@/components/ReportAttachmentArea';
import OverlayPortal from '@/components/OverlayPortal';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE, filterProjectDivisionsForBusinessLine, PROJECT_DIVISIONS_QUERY_KEY } from '@/lib/businessLine';
import { projectHasLeakInvestigationDivision } from '@/lib/leakInvestigation';
import {
  hasProjectFeaturePermission,
  hasProjectFeatureReadPermission,
  hasProjectFeatureWritePermission,
  hasProjectMembersWritePermission,
  isAdminRole,
  resolveProjectBusinessLine,
} from '@/lib/projectLinePermissionKeys';
import { filterStatusesForOpportunity, filterStatusesForProject } from '@/lib/projectStatusVisibility';
import { isHiddenReportCategory, isHiddenReportNote } from '@/lib/reportCategories';
import { formatReportListSubtitle, reportHasStatusBadges } from '@/lib/reportNotes';
import { ReportStatusChangeBadges } from '@/components/ReportStatusChangeBadges';
import { buildReportCategorySelectGroups } from '@/lib/reportCategorySelectGroups';
import { employeeHasSalesOrEstimatingDepartment, mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import {
  editProjectDivisionsQuickInfo,
  opportunityEditEstimatorsQuickInfo,
  opportunityEditLeadSourceQuickInfo,
  opportunityEditNameQuickInfo,
  opportunityConvertToProjectQuickInfo,
  opportunityCreateNoteQuickInfo,
  opportunityEditRelatedCustomersQuickInfo,
  opportunityEditSiteQuickInfo,
  opportunityEditStatusQuickInfo,
} from '@/lib/formModalQuickInfo';
import { getProjectStatusBadgeVariant } from '@/lib/projectUi';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppHeroEditButton,
  AppListRowIconButton,
  AppPageHeader,
  AppFormModal,
  AppInput,
  AppModal,
  AppSectionHeader,
  appSectionPresetProps,
  AppSelect,
  AppTabCountBadge,
  AppTabs,
  AppTextarea,
  AppTooltip,
  AppUserAvatar,
  AppUserSelect,
  AppDatePicker,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiSpacing,
  uiTypography,
  uiUserSelect,
} from '@/components/ui';
import { Briefcase, ChevronDown, ChevronUp, ClipboardList, FolderKanban } from 'lucide-react';
import { useProjectTabCounts } from '@/hooks/useProjectTabCounts';

/** Hero expand/collapse — same timing as CustomerDetail. */
const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden';
const HERO_EXPAND_DURATION = 'duration-[1400ms]';
const HERO_COLLAPSE_DURATION = 'duration-[650ms]';
const HERO_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** CustomerDetail expanded cap — used to scale opportunity expand duration to the same perceived speed. */
const CUSTOMER_HERO_EXPANDED_MAX_PX = 320;
const HERO_EXPAND_BASE_MS = 1400;
const HERO_COLLAPSE_MS = 650;
const OPPORTUNITY_HERO_COLLAPSED_PX = 72;
const HERO_FIELD_STACK = uiSpacing.sectionStack;

function salesListPaths(project: { business_line?: string; is_bidding?: boolean } | undefined | null) {
  const rm = project?.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE;
  return {
    opportunities: rm ? '/rm-opportunities' : '/opportunities',
    projects: rm ? '/rm-projects' : '/projects',
  };
}

// Helper function to calculate and format time since status change
function getTimeSinceStatusChange(project: any): string {
  if (!project) return '';
  
  // Don't show timer for certain statuses:
  // - "Refused" for Opportunities (is_bidding = true)
  // - "Finished" for Projects (is_bidding = false)
  const statusLabel = (project as any).status_label || '';
  const isBidding = (project as any).is_bidding || false;
  
  if (isBidding && (statusLabel.toLowerCase().trim() === 'refused' || statusLabel.toLowerCase().trim() === 'cancelled' || statusLabel.toLowerCase().trim() === 'canceled')) {
    return ''; // Don't show timer for Refused or Cancelled opportunities
  }
  
  if (!isBidding && (statusLabel.toLowerCase().trim() === 'finished' || statusLabel.toLowerCase().trim() === 'cancelled' || statusLabel.toLowerCase().trim() === 'canceled')) {
    return ''; // Don't show timer for Finished or Cancelled projects
  }
  
  // Use status_changed_at if available (this is when status was last changed)
  // If status_changed_at is not set, it means status was never changed, so don't show timer
  const statusChangedAt = (project as any).status_changed_at;
  if (!statusChangedAt) return '';
  
  const now = new Date();
  const changedAt = new Date(statusChangedAt);
  
  // Debug: log if the date parsing fails
  if (isNaN(changedAt.getTime())) {
    console.warn('Invalid status_changed_at date:', statusChangedAt);
    return '';
  }
  
  const diffMs = now.getTime() - changedAt.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffYears > 0) {
    return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
  } else if (diffMonths > 0) {
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  } else if (diffWeeks > 0) {
    return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
  } else if (diffDays > 0) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else {
    return 'Just now';
  }
}

// Component to display status timer
function StatusTimer({ project }: { project: any }) {
  const [timeSince, setTimeSince] = useState(getTimeSinceStatusChange(project));
  
  useEffect(() => {
    // Update immediately when project changes
    setTimeSince(getTimeSinceStatusChange(project));
    
    // Then update every minute
    const interval = setInterval(() => {
      setTimeSince(getTimeSinceStatusChange(project));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [project?.status_changed_at, project?.status_label, project?.is_bidding]); // Depend on status fields to trigger updates
  
  if (!timeSince) return null;
  
  return (
    <div className="text-xs text-gray-500 mt-1">
      {timeSince}
    </div>
  );
}

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

// Helper to format date as "day, month dd"
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  return `${month} ${day}`;
}


// Helper function to format hours and minutes in a readable format (e.g., "8h30min")
function formatHoursMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${minutes}min`;
}

// Field-to-label mapping for project hero/detail updates (Recent Activity)
const PROJECT_UPDATE_LABELS: Record<string, string> = {
  status_label: 'Status',
  status_id: 'Status',
  estimator_id: 'Estimator',
  estimator_ids: 'Estimator(s)',
  project_admin_id: 'Project admin',
  onsite_lead_id: 'On-site lead',
  division_onsite_leads: 'On-site leads',
  contact_id: 'Contact',
  site_id: 'Site',
  project_division_ids: 'Divisions',
  division_ids: 'Divisions',
  name: 'Name',
  address: 'Address',
  date_start: 'Start date',
  date_end: 'End date',
  date_eta: 'End Date',
  date_awarded: 'Awarded Date',
  progress: 'Progress',
  lat: 'Location',
  lng: 'Location',
  lead_source: 'Lead source',
  is_bidding: 'Is bidding',
  client_id: 'Client',
  code: 'Code',
  related_client_ids: 'Related customers',
  awarded_related_client_ids: 'Awarded related customers',
  scope_of_work: 'Scope of work',
  job_completion_estimate: 'Job completion estimate',
  crew_material_list: 'Material list',
};

const REPORT_FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  category_id: 'Category',
  division_id: 'Division',
  description: 'Description',
  financial_type: 'Financial type',
  financial_value: 'Financial value',
  approval_status: 'Approval status',
  approved_by: 'Approved by',
  created_by: 'Created by',
  items_added: 'Items added',
  total_value: 'Total value',
  deleted_report: 'Deleted report',
};

const FILE_FIELD_LABELS: Record<string, string> = {
  file_name: 'File name',
  original_name: 'File name',
  name: 'Folder name',
  category: 'Category',
  folder_id: 'Folder',
  parent_id: 'Parent folder',
  content_type: 'File type',
  uploaded_by: 'Uploaded by',
};

const TIMESHEET_FIELD_LABELS: Record<string, string> = {
  minutes: 'Duration',
  work_date: 'Work date',
  start_time: 'Start time',
  end_time: 'End time',
  clock_in_time: 'Clock in',
  clock_out_time: 'Clock out',
  hours_worked: 'Hours worked',
  break_minutes: 'Break',
  notes: 'Notes',
  source: 'Source',
  is_approved: 'Approved',
  status: 'Status',
};

const SHIFT_FIELD_LABELS: Record<string, string> = {
  worker_id: 'Worker',
  project_id: 'Project',
  date: 'Date',
  start_time: 'Start time',
  end_time: 'End time',
  status: 'Status',
  job_name: 'Job type',
  geofences: 'Geofences',
  notes: 'Notes',
};

const PROPOSAL_FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  cover_title: 'Cover title',
  order_number: 'Order number',
  project_name: 'Project',
  client_name: 'Client',
  client_id: 'Client',
  total: 'Total',
  template_style: 'Template',
  is_new: 'New',
  soft_delete: 'Soft delete',
  restored: 'Restored',
  source: 'Source',
  proposal_created_for: 'Created for',
  date: 'Date',
  primary_contact_name: 'Primary contact',
  primary_contact_phone: 'Contact phone',
  primary_contact_email: 'Contact email',
  type_of_project: 'Project type',
  other_notes: 'Notes',
  project_description: 'Project description',
  additional_project_notes: 'Additional notes',
  terms_text: 'Terms',
  show_total_in_pdf: 'Show total in PDF',
  show_pst_in_pdf: 'Show PST in PDF',
  show_gst_in_pdf: 'Show GST in PDF',
  pst_rate: 'PST rate',
  gst_rate: 'GST rate',
  area_display_unit: 'Area unit',
  pricing_items_count: 'Pricing items',
};

const ENTITY_FIELD_LABELS: Record<string, Record<string, string>> = {
  project: PROJECT_UPDATE_LABELS,
  report: REPORT_FIELD_LABELS,
  project_file: FILE_FIELD_LABELS,
  project_folder: FILE_FIELD_LABELS,
  timesheet_entry: TIMESHEET_FIELD_LABELS,
  attendance: TIMESHEET_FIELD_LABELS,
  shift: SHIFT_FIELD_LABELS,
  proposal: PROPOSAL_FIELD_LABELS,
  proposal_draft: PROPOSAL_FIELD_LABELS,
};

// Helper to get display value for a field (from resolved_values, or after, or fallback)
function getDisplayValue(
  field: string,
  resolvedValues: Record<string, string> | undefined,
  after: Record<string, any>,
  before: Record<string, any>
): string {
  const resolved = resolvedValues?.[field];
  if (resolved !== undefined && resolved !== null && String(resolved).trim()) return String(resolved);
  const val = after[field];
  if (val === null || val === undefined) return '—';
  if (field === 'progress') return `${val}%`;
  if (['date_start', 'date_end', 'date_eta', 'date_awarded'].includes(field) && typeof val === 'string') {
    return val.length >= 10 ? val.slice(0, 10) : val;
  }
  if (field === 'estimator_ids' && Array.isArray(val)) return val.length > 0 ? `${val.length} selected` : '—';
  if (
    (field === 'related_client_ids' || field === 'awarded_related_client_ids') &&
    Array.isArray(val)
  ) {
    return val.length > 0 ? `${val.length} customer(s)` : '—';
  }
  if (typeof val === 'string' && val.length > 50) return val.slice(0, 47) + '...';
  return String(val);
}

// Helper to build human-readable label from audit log for Recent Activity
function buildRecentActivityLabel(
  log: { action?: string; entity_type?: string; changes?: any; context?: any; resolved_values?: Record<string, string> },
  isOpportunity?: boolean,
  isLeakInvestigation?: boolean
): string {
  const action = (log.action || '').toUpperCase();
  const entityType = (log.entity_type || '').toLowerCase();
  const changes = log.changes || {};
  const after = changes.after || {};
  const before = changes.before || {};
  const context = log.context || {};
  const resolvedValues = log.resolved_values || {};
  const changedFields: string[] = Array.isArray(context.changed_fields) ? context.changed_fields : [];

    if (entityType === 'project') {
    if (action === 'CREATE') {
      if (isLeakInvestigation) return 'Leak investigation created';
      return isOpportunity ? 'Opportunity created' : 'Project created';
    }
    if (action === 'DELETE') {
      if (isLeakInvestigation) return 'Leak investigation deleted';
      return isOpportunity ? 'Opportunity deleted' : 'Project deleted';
    }
    if (action === 'RESTORE') {
      if (isLeakInvestigation) return 'Leak investigation restored';
      return isOpportunity ? 'Opportunity restored' : 'Project restored';
    }
    if (action === 'UPDATE') {
      if (context.conversion) {
        // Show conversion with each updated field and its value: "Field to "value"" (one line per logical field, prefer name over ID)
        const heroFields = ['status_label', 'status_id', 'estimator_id', 'estimator_ids', 'project_admin_id', 'onsite_lead_id', 'division_onsite_leads', 'contact_id', 'site_id', 'project_division_ids', 'division_ids', 'name', 'address', 'date_start', 'date_end', 'date_eta', 'date_awarded', 'progress', 'lead_source', 'lat', 'lng', 'related_client_ids', 'awarded_related_client_ids'];
        const relevantChanged = changedFields.filter((f: string) => heroFields.includes(f) && f !== 'is_bidding');
        const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const byLabel: Record<string, { value: string; isId: boolean }> = {};
        for (const f of relevantChanged) {
          const label = PROJECT_UPDATE_LABELS[f] || f;
          const displayVal = getDisplayValue(f, resolvedValues, after, before);
          const valueStr = (displayVal != null && displayVal !== '—') ? String(displayVal).trim() : '';
          const isId = uuidLike.test(valueStr);
          if (!byLabel[label] || (byLabel[label].isId && !isId)) {
            byLabel[label] = { value: valueStr, isId };
          }
        }
        const parts = Object.entries(byLabel).map(([label, { value }]) => `${label} to "${value}"`);
        if (parts.length > 0) {
          return `Opportunity converted to project · Fields updated: ${parts.join(', ')}`;
        }
        return 'Opportunity converted to project';
      }
      const heroFields = ['status_label', 'status_id', 'estimator_id', 'estimator_ids', 'project_admin_id', 'onsite_lead_id', 'division_onsite_leads', 'contact_id', 'site_id', 'project_division_ids', 'division_ids', 'name', 'address', 'date_start', 'date_end', 'date_eta', 'date_awarded', 'progress', 'lead_source', 'lat', 'lng', 'related_client_ids', 'awarded_related_client_ids'];
      const relevantChanged = changedFields.filter((f: string) => heroFields.includes(f));
      if (relevantChanged.length === 0) {
        // Fallback below
      } else {
        const relatedFields = ['related_client_ids', 'awarded_related_client_ids'];
        const relSummary =
          typeof context.related_customers_summary === 'string' ? context.related_customers_summary.trim() : '';
        const hasRelatedChange = relevantChanged.some((f: string) => relatedFields.includes(f));
        if (hasRelatedChange && relSummary) {
          const others = relevantChanged.filter((f: string) => !relatedFields.includes(f));
          if (others.length === 0) return relSummary;
          const displayField = others[0];
          const label = PROJECT_UPDATE_LABELS[displayField] || displayField;
          const displayVal = getDisplayValue(displayField, resolvedValues, after, before);
          if (displayVal && displayVal !== '—' && displayVal.trim()) {
            return `${relSummary} · ${label} updated to "${displayVal}"`;
          }
          return `${relSummary} · ${label} updated`;
        }
        if (hasRelatedChange && relevantChanged.every((f: string) => relatedFields.includes(f))) {
          return 'Related customers updated';
        }
        // Group estimator_id + estimator_ids as single "Estimator" (backend updates both together)
        const estimatorFields = ['estimator_id', 'estimator_ids'];
        const isOnlyEstimator = relevantChanged.every((f: string) => estimatorFields.includes(f));
        const displayField = isOnlyEstimator
          ? (relevantChanged.includes('estimator_ids') ? 'estimator_ids' : 'estimator_id')
          : relevantChanged[0];
        const label = isOnlyEstimator ? 'Estimator' : (PROJECT_UPDATE_LABELS[displayField] || displayField);
        const displayVal = getDisplayValue(displayField, resolvedValues, after, before);
        if (displayVal && displayVal !== '—' && displayVal.trim()) {
          return `${label} updated to "${displayVal}"`;
        }
        return `${label} updated`;
      }
      // Fallback: check before/after
      const fallbacks: Array<[string, string]> = [
        ['status_label', 'Status'],
        ['estimator_id', 'Estimator'],
        ['project_admin_id', 'Project admin'],
        ['contact_id', 'Contact'],
        ['site_id', 'Site'],
        ['name', 'Name'],
      ];
      for (const [f, lbl] of fallbacks) {
        if (after[f] !== before[f]) {
          const displayVal = getDisplayValue(f, resolvedValues, after, before);
          if (displayVal && displayVal !== '—' && displayVal.trim()) {
            return `${lbl} updated to "${displayVal}"`;
          }
          return `${lbl} updated`;
        }
      }
      return 'Details updated';
    }
  }
  if (entityType === 'report') {
    if (action === 'CREATE') return changes.title ? `Report added: "${changes.title}"` : 'Report/note added';
    if (action === 'APPROVE') return 'Report approved';
    if (action === 'UPDATE') return changes.title ? `Report updated to "${changes.title}"` : 'Report updated';
    if (action === 'DELETE') return changes.title ? `Report "${changes.title}" removed` : 'Report removed';
  }
  if (entityType === 'project_file') {
    const fileName = changes.file_name || context.file_name || changes.deleted_file?.file_name || (changes.after || {}).original_name || '';
    if (action === 'CREATE' || action === 'UPLOAD') return fileName ? `File uploaded: "${fileName}"` : 'File uploaded';
    if (action === 'DELETE') return fileName ? `File "${fileName}" removed` : 'File removed';
    if (action === 'UPDATE') return fileName ? `File "${fileName}" updated` : 'File updated';
  }
  if (entityType === 'project_folder') {
    const folderName = changes.name || context.folder_name || changes.deleted_folder?.name || (changes.after || {}).name || '';
    if (action === 'CREATE') return folderName ? `Folder created: "${folderName}"` : 'Folder created';
    if (action === 'DELETE') return folderName ? `Folder "${folderName}" deleted` : 'Folder deleted';
    if (action === 'UPDATE') return folderName ? `Folder "${folderName}" updated` : 'Folder updated';
  }
  if (entityType === 'proposal' || entityType === 'proposal_draft') {
    const source = (log.context || {}).source;
    if (source === 'conversion') return 'Pricing item approvals set';
    const isDraft = entityType === 'proposal_draft';
    const label = isDraft ? 'Draft' : source === 'pricing' ? 'Pricing' : 'Proposal';
    const title = changes.title || changes.cover_title || (changes.after || {}).cover_title || context.proposal_title || '';
    const titlePart = title ? `: "${title}"` : '';

    if (action === 'UPDATE') return `${label} updated`;
    if (action === 'CREATE') return `${label} created${titlePart}`;
    if (action === 'DELETE') return `${label} deleted${titlePart}`;
    if (action === 'RESTORE') return `${label} restored${titlePart}`;
    if (action === 'GENERATE_PDF') return `PDF generated${titlePart}`;
  }
  if (entityType === 'estimate' || entityType === 'estimate_item') {
    if (action === 'CREATE') return 'Estimate created';
    if (action === 'UPDATE') return 'Estimate updated';
  }
  if (entityType === 'order' || entityType === 'order_item') {
    if (action === 'CREATE') return changes.order_number ? `Order #${changes.order_number} created` : 'Order created';
    if (action === 'UPDATE') return changes.order_number ? `Order #${changes.order_number} updated` : 'Order updated';
  }
  if (entityType === 'shift') {
    const workerName = context.affected_user_name || (log as any).affected_user_name || '';
    const shiftDate = (changes.after || changes.before || {}).date || context.date || '';
    const datePart = shiftDate ? ` on ${String(shiftDate).slice(0, 10)}` : '';
    const workerPart = workerName ? ` for ${workerName}` : '';
    if (action === 'CREATE') return `Shift scheduled${workerPart}${datePart}`;
    if (action === 'DELETE') return `Shift cancelled${workerPart}${datePart}`;
    if (action === 'UPDATE') return `Shift updated${workerPart}${datePart}`;
    return `Workload updated${workerPart}`;
  }
  if (entityType === 'attendance' || entityType === 'timesheet_entry') {
    const userName = context.affected_user_name || (log as any).affected_user_name || '';
    const workDate = changes.work_date || context.work_date || (changes.after || {}).work_date || '';
    const datePart = workDate ? ` on ${String(workDate).slice(0, 10)}` : '';
    const userPart = userName ? ` for ${userName}` : '';
    if (action === 'CREATE') return `Time entry added${userPart}${datePart}`;
    if (action === 'DELETE') return `Time entry deleted${userPart}${datePart}`;
    if (action === 'APPROVE') return `Time entry approved${userPart}${datePart}`;
    if (action === 'UNAPPROVE') return `Time entry unapproved${userPart}${datePart}`;
    if (action === 'RESET') return `Attendance reset${userPart}`;
    if (action === 'UPDATE') return `Time entry updated${userPart}${datePart}`;
    return `Timesheet updated${userPart}`;
  }

  return `${(log.action || 'Unknown').replace(/_/g, ' ')} on ${entityType || 'item'}`;
}

// Recent Activity card for project/opportunity - uses audit logs API
function ProjectRecentActivity({
  projectId,
  isOpportunity,
  isLeakInvestigation,
  useDesignSystem,
}: {
  projectId: string;
  isOpportunity?: boolean;
  isLeakInvestigation?: boolean;
  useDesignSystem?: boolean;
}) {
  const { data: logs = [], isFetching } = useQuery({
    queryKey: ['projectRecentActivity', projectId],
    queryFn: () => api<any[]>('GET', `/projects/${encodeURIComponent(projectId)}/audit-logs?limit=15&offset=0`),
  });

  const formatTimestamp = (ts: string) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return ts;
    }
  };

  const activityList = (
    <div className="h-[200px] overflow-y-auto flex-shrink-0 space-y-1.5 pr-1">
      {isFetching ? (
        <div className={uiCx(uiTypography.helper, 'py-4')}>Loading...</div>
      ) : logs.length > 0 ? (
        logs.map((log: any, idx: number) => (
          <div
            key={`${log.id}-${idx}`}
            className={uiCx(
              uiTypography.body,
              'py-1.5 border-b border-gray-100 last:border-0 text-xs',
            )}
          >
            <div className="font-medium">{buildRecentActivityLabel(log, isOpportunity, isLeakInvestigation)}</div>
            <div className={uiCx(uiTypography.helper, 'text-[11px]')}>
              {formatTimestamp(log.timestamp)}
              {log.actor_name ? ` · by ${log.actor_name}` : ''}
            </div>
          </div>
        ))
      ) : useDesignSystem ? (
        <AppEmptyState title="No recent activity" className="py-6" />
      ) : (
        <div className="text-xs text-gray-400 py-4">No recent activity</div>
      )}
    </div>
  );

  if (useDesignSystem) {
    return (
      <AppCard className="flex min-h-0 flex-col">
        <AppSectionHeader
          title="Recent Activity"
          description="Latest updates and changes on this record."
          {...appSectionPresetProps('notesHistory')}
        />
        <div className="mt-3 min-h-0 flex-1">{activityList}</div>
      </AppCard>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 flex flex-col min-h-0">
      <div className="p-3 flex flex-col flex-1 min-h-0">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex-shrink-0">Recent Activity</div>
        {activityList}
      </div>
    </div>
  );
}

// Helper function to get user initials
function getUserInitials(user: any): string {
  const firstName = user?.first_name || user?.name || user?.username || '';
  const lastName = user?.last_name || '';
  const firstInitial = firstName ? firstName[0].toUpperCase() : '';
  const lastInitial = lastName ? lastName[0].toUpperCase() : '';
  if (firstInitial && lastInitial) {
    return firstInitial + lastInitial;
  }
  return firstInitial || (user?.username ? user.username[0].toUpperCase() : '?');
}

// Helper function to get user display name
function getUserDisplayName(user: any): string {
  if (user?.first_name && user?.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  return user?.name || user?.username || 'Unknown';
}

// Tooltip component for division icons - uses fixed positioning to avoid being cut off
function DivisionTooltip({ label, percentage, icon }: { label: string; percentage: number; icon: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; arrowClass: string } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isHovered || !containerRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const tooltipWidth = 200; // Estimate tooltip width
        const tooltipHeight = 30; // Estimate tooltip height
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const spaceLeft = rect.left;
        const spaceRight = window.innerWidth - rect.right;
        
        // Show above if not enough space below, otherwise show below
        const showAbove = spaceBelow < tooltipHeight + 10 && spaceAbove > spaceBelow;
        
        // Calculate horizontal position to avoid cutting off
        let left = rect.left + (rect.width / 2) + window.scrollX;
        const minLeft = 8; // Minimum distance from left edge
        const maxLeft = window.innerWidth - tooltipWidth - 8; // Maximum distance from right edge
        
        // Adjust if tooltip would be cut off on the left
        if (left - (tooltipWidth / 2) < minLeft) {
          left = minLeft + (tooltipWidth / 2);
        }
        // Adjust if tooltip would be cut off on the right
        if (left + (tooltipWidth / 2) > window.innerWidth - 8) {
          left = maxLeft + (tooltipWidth / 2);
        }
        
        setPosition({
          top: showAbove 
            ? rect.top + window.scrollY - tooltipHeight - 8
            : rect.bottom + window.scrollY + 4,
          left: left - (tooltipWidth / 2),
          arrowClass: showAbove ? 'bottom-0 top-auto' : '-top-1'
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isHovered]);

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative group/icon flex flex-col items-center"
      >
        <div className="text-base transition-transform hover:scale-110">
          {icon}
        </div>
        <div className="text-[10px] font-semibold mt-0.5 text-gray-600">
          {percentage}%
        </div>
      </div>
      {isHovered && position && (
        <div
          className="fixed px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap pointer-events-none z-[100] shadow-lg"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          {label}
          <div className={`absolute ${position.arrowClass} left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45`}></div>
        </div>
      )}
    </>
  );
}

// Tooltip component for on-site leads with multiple divisions - uses fixed positioning to appear above footer
function LeadTooltip({ employee, divisions, children }: { employee: any; divisions: string[]; children: React.ReactElement }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number; arrowClass: string } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isHovered || !containerRef.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const tooltipHeight = 100 + (divisions.length * 20); // Estimate tooltip height
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        // Show above if not enough space below, otherwise show below
        const showAbove = spaceBelow < tooltipHeight && spaceAbove > spaceBelow;
        
        setPosition({
          top: showAbove 
            ? rect.top + window.scrollY - tooltipHeight - 8
            : rect.bottom + window.scrollY + 4,
          right: window.innerWidth - rect.right + window.scrollX,
          arrowClass: showAbove ? 'bottom-0 top-auto rotate-45' : '-top-1'
        });
      }
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isHovered, divisions.length]);

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {children}
      </div>
      {isHovered && position && (
        <div
          className="fixed px-2 py-1 bg-gray-900 text-white text-xs rounded pointer-events-none z-[100]"
          style={{
            top: `${position.top}px`,
            right: `${position.right}px`,
            maxWidth: '300px'
          }}
        >
          <div className="font-semibold">{getUserDisplayName(employee)}</div>
          {divisions.length > 0 && (
            <div className="text-gray-300 mt-1">
              {divisions.map((div, idx) => (
                <div key={idx} className="whitespace-normal">{div}</div>
              ))}
            </div>
          )}
          <div className={`absolute ${position.arrowClass} right-2 w-2 h-2 bg-gray-900 rotate-45`}></div>
        </div>
      )}
    </>
  );
}

// Component for user avatar with tooltip

function UserAvatar({ user, size = 'w-8 h-8', showTooltip = true, tooltipText }: { 
  user: any; 
  size?: string; 
  showTooltip?: boolean;
  tooltipText?: string;
}) {
  const photoFileId = user?.profile_photo_file_id;
  const initials = getUserInitials(user);
  const displayName = tooltipText || getUserDisplayName(user);
  const [imageError, setImageError] = useState(false);
  
  if (photoFileId && !imageError) {
    return (
      <div className="relative group/avatar">
        <img
          src={withFileAccessToken(`/files/${photoFileId}/thumbnail?w=80`)}
          alt={displayName}
          className={`${size} rounded-full object-cover border border-gray-300`}
          onError={() => setImageError(true)}
        />
        {showTooltip && (
          <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none z-[9999]">
            {displayName}
            <div className="absolute -top-1 right-2 w-2 h-2 bg-gray-900 rotate-45"></div>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className={`relative group/avatar ${size} rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs`}>
      {initials}
      {showTooltip && (
        <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none z-[9999]">
          {displayName}
          <div className="absolute -top-1 right-2 w-2 h-2 bg-gray-900 rotate-45"></div>
        </div>
      )}
    </div>
  );
}

type Project = { id:string, code?:string, name?:string, client_id?:string, client_display_name?:string, client_name?:string, related_client_ids?:string[], related_client_display_names?:string[], awarded_related_client_ids?:string[], awarded_related_client_id?:string|null, address?:string, address_city?:string, address_province?:string, address_country?:string, address_postal_code?:string, description?:string, scope_of_work?:string|null, job_completion_estimate?:string|null, crew_material_list?:{ id: string; name: string; quantity?: string|null; unit?: string|null; notes?: string|null }[]|null, status_id?:string, division_id?:string, division_ids?:string[], project_division_ids?:string[], estimator_id?:string, estimator_ids?:string[], project_admin_id?:string, onsite_lead_id?:string, division_onsite_leads?:Record<string, string>, contact_id?:string, contact_name?:string, contact_email?:string, contact_phone?:string, date_start?:string, date_eta?:string, date_awarded?:string, date_end?:string, cost_estimated?:number, cost_actual?:number, service_value?:number, progress?:number, site_id?:string, site_name?:string, site_address_line1?:string, site_address_line2?:string, site_city?:string, site_province?:string, site_country?:string, site_postal_code?:string, status_label?:string, status_changed_at?:string, is_bidding?:boolean, lead_source?:string, business_line?: string, purchase_order_number?:string|null, billing_contact?:string|null, invoice_to?:string|null, billing_email?:string|null, po_required?:boolean, billing_address_line1?:string|null, billing_address_line2?:string|null, billing_country?:string|null, billing_province?:string|null, billing_city?:string|null, billing_postal_code?:string|null, billing_differs_from_customer?:boolean, invoice_blocked_reason?:string|null };

function projectAwardedRelatedIdsSet(proj: Project | null | undefined): Set<string> {
  const raw = proj?.awarded_related_client_ids;
  if (Array.isArray(raw) && raw.length > 0) return new Set(raw.map(String));
  const leg = proj?.awarded_related_client_id;
  if (leg) return new Set([String(leg)]);
  return new Set();
}

/** Project hero: which related clients to show (awarded only when award data exists) and who lost the bid. */
function projectRelatedCustomersHeroSplit(proj: Project | null | undefined): {
  displayedEntries: { id: string; name: string }[];
  nonAwardedEntries: { id: string; name: string }[];
  hasAwardedData: boolean;
} {
  const ids = proj?.related_client_ids;
  const names = proj?.related_client_display_names;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { displayedEntries: [], nonAwardedEntries: [], hasAwardedData: false };
  }
  const all = ids.map((rid, i) => {
    const id = String(rid);
    const name =
      (Array.isArray(names) && names[i] != null && String(names[i]).trim() !== ''
        ? String(names[i])
        : id) || 'View Customer';
    return { id, name };
  });
  const awardedSet = projectAwardedRelatedIdsSet(proj);
  if (awardedSet.size === 0) {
    return { displayedEntries: all, nonAwardedEntries: [], hasAwardedData: false };
  }
  const displayedEntries = all.filter((e) => awardedSet.has(String(e.id)));
  const nonAwardedEntries = all.filter((e) => !awardedSet.has(String(e.id)));
  return { displayedEntries, nonAwardedEntries, hasAwardedData: true };
}

function ProjectHeroSiteField({
  proj,
  hasEditPermission,
  onEdit,
}: {
  proj: Project | null | undefined;
  hasEditPermission: boolean;
  onEdit: () => void;
}) {
  const siteName = proj?.site_name?.trim();
  const city = (proj?.site_city || proj?.address_city || '').trim();
  const province = (proj?.site_province || proj?.address_province || '').trim();
  const heroAddress = formatSiteHeroAddress({
    address_line1: proj?.site_address_line1 || proj?.address,
    address_line2: proj?.site_address_line2,
    city: proj?.site_city || proj?.address_city,
    postal_code: proj?.site_postal_code || proj?.address_postal_code,
  });

  const displayName =
    siteName ||
    heroAddress ||
    (city && province ? `${city}, ${province}` : city || province || '—');
  const addressBelow = siteName && heroAddress ? heroAddress : null;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Site</span>
        {hasEditPermission ? (
          <button
            onClick={onEdit}
            className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
            title="Edit Site"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
        ) : null}
      </div>
      <div className="text-xs font-semibold text-gray-900 break-words">{displayName}</div>
      {addressBelow ? (
        <div className="mt-0.5 text-[11px] font-normal leading-snug text-gray-600 break-words">
          {addressBelow}
        </div>
      ) : null}
    </div>
  );
}

type ProjectFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, category?:string, folder_id?:string|null, original_name?:string, notes?:string|null, uploaded_at?:string };
type Update = { id:string, timestamp?:string, text?:string, images?:any };
type Report = {
  id: string;
  title?: string;
  category_id?: string;
  division_id?: string;
  description?: string;
  images?: {
    attachments?: any[];
    status_change?: {
      from_label?: string;
      to_label?: string;
      from_id?: string | null;
      to_id?: string | null;
    };
  };
  status?: string;
  created_at?: string;
  created_by?: string;
  created_by_name?: string;
  financial_value?: number;
  financial_type?: string;
  estimate_data?: any;
  approval_status?: string;
  approved_by?: string;
  approved_at?: string;
};
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string, data?:any, is_change_order?:boolean, change_order_number?:number, parent_proposal_id?:string, approved_report_id?:string, approval_status?:string };

export default function ProjectDetail(){
  const location = useLocation();
  const nav = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const searchParams = new URLSearchParams(location.search);
  const safetyInspectionFromUrl = searchParams.get('safety_inspection');
  const signOnlySafetySession =
    searchParams.get('sign_only') === '1' && Boolean((safetyInspectionFromUrl || '').trim());

  const projectQueryKey =
    signOnlySafetySession && safetyInspectionFromUrl
      ? (['project', id, 'sign', safetyInspectionFromUrl] as const)
      : (['project', id] as const);
  const { data:proj, isLoading } = useQuery({
    queryKey: projectQueryKey,
    queryFn: () =>
      api<Project>(
        'GET',
        signOnlySafetySession && safetyInspectionFromUrl
          ? `/projects/${id}?sign_inspection_id=${encodeURIComponent(safetyInspectionFromUrl)}`
          : `/projects/${id}`
      ),
    enabled: !!id,
  });
  const isOpportunityStyleTabs = !!proj?.is_bidding;
  const isOpportunityDetailRoute =
    location.pathname.startsWith('/opportunities/') ||
    location.pathname.startsWith('/rm-opportunities/');
  const isProjectDetailRoute =
    location.pathname.startsWith('/projects/') ||
    location.pathname.startsWith('/rm-projects/');
  const useDesignSystem =
    isOpportunityDetailRoute || isProjectDetailRoute;
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data:projectDivisions } = useQuery({ queryKey:PROJECT_DIVISIONS_QUERY_KEY, queryFn: ()=>api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const { data:files, refetch: refetchFiles } = useQuery({ queryKey:['projectFiles', id], queryFn: ()=>api<ProjectFile[]>('GET', `/projects/${id}/files`), enabled: !!id && !signOnlySafetySession });
  const { data:clientFiles } = useQuery({ queryKey:['clientFilesForContacts-project', proj?.client_id||''], queryFn: ()=> proj?.client_id? api<any[]>('GET', `/clients/${encodeURIComponent(String(proj?.client_id||''))}/files`) : Promise.resolve([]), enabled: !!proj?.client_id && !signOnlySafetySession });
  const { data:updates, refetch: refetchUpdates } = useQuery({ queryKey:['projectUpdates', id], queryFn: ()=>api<Update[]>('GET', `/projects/${id}/updates`), enabled: !!id && !signOnlySafetySession });
  const { data:reports, refetch: refetchReports } = useQuery({ queryKey:['projectReports', id], queryFn: ()=>api<Report[]>('GET', `/projects/${id}/reports`), enabled: !!id && !signOnlySafetySession });
  const { data:proposals } = useQuery({ queryKey:['projectProposals', id], queryFn: ()=>api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(id||''))}`), enabled: !!id && !signOnlySafetySession });
  const { data:projectEstimates } = useQuery({ queryKey:['projectEstimates', id], queryFn: ()=>api<any[]>('GET', `/estimate/estimates?project_id=${encodeURIComponent(String(id||''))}`), enabled: !!id && !signOnlySafetySession });
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });
  // Tab query parameter (searchParams above)
  const initialTab = (searchParams.get('tab') as 'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'documents'|'proposal'|'pricing'|'estimate'|'orders'|'safety'|null) || null;
  const [tab, setTab] = useState<'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'documents'|'proposal'|'pricing'|'estimate'|'orders'|'safety'|null>(initialTab);
  // Live pricing items (from ProposalForm) to update division percentages instantly without reload.
  const [livePricingItems, setLivePricingItems] = useState<any[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showOnSiteLeadsModal, setShowOnSiteLeadsModal] = useState(false);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(() => signOnlySafetySession);
  const estimateBuilderRef = useRef<EstimateBuilderRef>(null);
  const proposalFormSaveRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const safetyTabSaveRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const { hasUnsavedChanges, getHasUnsavedChanges } = useUnsavedChanges();
  
  // Check user permissions (moved before useEffect that uses them)
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = isAdminRole(me?.roles);
  const permissions = useMemo(() => new Set(me?.permissions || []), [me?.permissions]);
  const projectBusinessLine = useMemo(
    () => resolveProjectBusinessLine(proj?.business_line, location.pathname),
    [proj?.business_line, location.pathname]
  );
  const projectDivisionsForPicker = useMemo(
    () => filterProjectDivisionsForBusinessLine(projectDivisions, projectBusinessLine),
    [projectDivisions, projectBusinessLine]
  );
  const isLeakInvestigation = projectHasLeakInvestigationDivision(proj, projectDivisionsForPicker);
  const hasEditPermission = isAdmin || permissions.has('business:projects:write');
  const canEditEstimate = isAdmin || permissions.has('business:projects:estimate:write');
  const hasAdministratorAccess = isAdmin || permissions.has('users:write');
  const canManageMembers = hasProjectMembersWritePermission(
    permissions,
    projectBusinessLine,
    isAdmin,
    location.pathname
  );
  
  // Helper to check if user has permission for a tab
  const hasTabPermission = useMemo(() => {
    const bl = projectBusinessLine;
    const featureByTab: Record<string, string> = {
      reports: 'reports',
      dispatch: 'workload',
      timesheet: 'timesheet',
      files: 'files',
      photos: 'files',
      documents: 'documents',
      proposal: 'proposal',
      pricing: 'proposal',
      estimate: 'estimate',
      orders: 'orders',
      safety: 'safety',
    };
    return (tabKey: string): boolean => {
      const feature = featureByTab[tabKey];
      if (!feature) return true;
      return hasProjectFeaturePermission(permissions, bl, feature, isAdmin, location.pathname);
    };
  }, [isAdmin, permissions, projectBusinessLine, location.pathname]);
  
  // Update tab when URL search params change
  useEffect(() => {
    if (me === undefined) return;

    const sp = new URLSearchParams(location.search);
    const tabParam = sp.get('tab') as 'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'documents'|'proposal'|'pricing'|'estimate'|'orders'|'safety'|null;
    const signOnly =
      sp.get('sign_only') === '1' && Boolean(sp.get('safety_inspection')?.trim());
    const validTabs = ['overview','general','reports','dispatch','timesheet','files','photos','documents','proposal','pricing','estimate','orders','safety'];
    if (tabParam && validTabs.includes(tabParam)) {
      if (tabParam === 'safety' && signOnly) {
        setTab('safety');
        return;
      }
      if (tabParam === 'overview' || hasTabPermission(tabParam)) {
        setTab(tabParam === 'overview' ? null : tabParam);
        if (tabParam === 'files' && id) {
          const projectId = String(id);
          queryClient.invalidateQueries({ queryKey: ['projectFiles', projectId] });
          queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
        }
      } else {
        setTab(null);
        toast.error('You do not have permission to access this tab');
      }
    } else {
      setTab(null);
    }
  }, [location.search, hasTabPermission, me, id, queryClient]);

  useEffect(() => {
    if (isLoading || !proj) return;
    if (isOpportunityStyleTabs && tab === 'safety') {
      setTab(null);
      nav(location.pathname, { replace: true });
      toast.error('Safety inspections are only available for awarded projects.');
    }
  }, [isLoading, proj, tab, location.pathname, nav, isOpportunityStyleTabs]);

  // Auto-collapse hero section when a tab is selected, expand when back to primary page
  useEffect(() => {
    if (signOnlySafetySession) {
      setIsHeroCollapsed(true);
      return;
    }
    if (tab === null || tab === 'overview') {
      setIsHeroCollapsed(false);
    } else {
      setIsHeroCollapsed(true);
    }
  }, [tab, signOnlySafetySession]);

  const showBillingSection = !tab && !proj?.is_bidding;
  
  const cover = useMemo(()=>{
    const arr = (files||[]) as ProjectFile[];

    // 1) Manual legacy cover (what users were already setting before)
    const legacyPreferredCategories = new Set([
      'project-cover-derived',
      'project-cover',
      'cover',
      'hero-cover',
      'opportunity-cover-derived',
      'opportunity-cover',
    ]);
    const legacy = arr.find(f => legacyPreferredCategories.has(String(f.category||'')) && (f.is_image===true || String(f.content_type||'').startsWith('image/')));
    if (legacy?.file_object_id) return withFileAccessToken(`/files/${legacy.file_object_id}/thumbnail?w=1000`);

    // 2) Manual new field (General Info image picker)
    if ((proj as any)?.image_manually_set && (proj as any)?.image_file_object_id) {
      return withFileAccessToken(`/files/${(proj as any).image_file_object_id}/thumbnail?w=1000`);
    }

    // 3) Synced from proposal (project.image_file_object_id) OR latest proposal cover
    if ((proj as any)?.image_file_object_id) {
      return withFileAccessToken(`/files/${(proj as any).image_file_object_id}/thumbnail?w=1000`);
    }
    const latest = (proposals||[]).slice().sort((a,b)=>{
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd-ad;
    })[0];
    const proposalCoverFo = latest?.data?.cover_file_object_id;
    if (proposalCoverFo) return withFileAccessToken(`/files/${proposalCoverFo}/thumbnail?w=1000`);

    // 4) Default blueprint
    return '/ui/assets/placeholders/project.png';
  }, [files, proj, proposals]);
  // File object ID of current hero image (for ImagePicker to show it when opening)
  const heroCoverFileObjectId = useMemo(() => {
    const arr = (files || []) as ProjectFile[];
    const legacyPreferredCategories = new Set([
      'project-cover-derived', 'project-cover', 'cover', 'hero-cover',
      'opportunity-cover-derived', 'opportunity-cover',
    ]);
    const legacy = arr.find(f => legacyPreferredCategories.has(String(f.category || '')) && (f.is_image === true || String(f.content_type || '').startsWith('image/')));
    if (legacy?.file_object_id) return legacy.file_object_id;
    if ((proj as any)?.image_manually_set && (proj as any)?.image_file_object_id) return (proj as any).image_file_object_id;
    if ((proj as any)?.image_file_object_id) return (proj as any).image_file_object_id;
    const latest = (proposals || []).slice().sort((a, b) => {
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad;
    })[0];
    const proposalCoverFo = latest?.data?.cover_file_object_id;
    if (proposalCoverFo) return proposalCoverFo;
    return undefined;
  }, [files, proj, proposals]);
  const [showAuditLogModal, setShowAuditLogModal] = useState(false);
  const [auditLogSection, setAuditLogSection] = useState<'general' | 'timesheet' | 'reports' | 'workload' | 'files' | 'proposal' | 'pricing' | 'estimate' | 'orders'>('general');
  const [editStatusModal, setEditStatusModal] = useState(false);
  const [editProgressModal, setEditProgressModal] = useState(false);
  const [editProjectNameModal, setEditProjectNameModal] = useState(false);
  const [editSiteModal, setEditSiteModal] = useState(false);
  const [editEstimatorModal, setEditEstimatorModal] = useState(false);
  const [editProjectAdminModal, setEditProjectAdminModal] = useState(false);
  const [editEtaModal, setEditEtaModal] = useState(false);
  const [editStartDateModal, setEditStartDateModal] = useState(false);
  const [editAwardedDateModal, setEditAwardedDateModal] = useState(false);
  const [editLeadSourceModal, setEditLeadSourceModal] = useState(false);
  const [editRelatedCustomersModal, setEditRelatedCustomersModal] = useState(false);
  const [editDescriptionModal, setEditDescriptionModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [workloadEventCreateOpen, setWorkloadEventCreateOpen] = useState(false);

  // Base available tabs (leak investigations use the same strip as opportunities)
  const baseAvailableTabs = isOpportunityStyleTabs
    ? (['overview','reports','dispatch','timesheet','files','documents','proposal','pricing'] as const)
    : (['overview','reports','dispatch','timesheet','files','documents','proposal','pricing','orders','safety'] as const);
  
  // Filter tabs based on permissions (only when user data is loaded)
  const availableTabs = useMemo(() => {
    if (signOnlySafetySession) {
      return [] as unknown as typeof baseAvailableTabs;
    }
    // Until /auth/me loads, only Overview (avoid flashing all tabs)
    if (me === undefined) {
      return ['overview'] as unknown as typeof baseAvailableTabs;
    }
    return baseAvailableTabs.filter(tab => {
      if (tab === 'overview') return true; // Overview is always available
      return hasTabPermission(tab);
    });
  }, [baseAvailableTabs, hasTabPermission, me, signOnlySafetySession]);

  const tabCounts = useProjectTabCounts({
    projectId: id,
    availableTabs,
    signOnlySafetySession,
    reports,
    files,
    proposals,
  });

  // Invalidate Recent Activity when project data changes (so card updates without waiting for refetch interval)
  const invalidateRecentActivity = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', String(id ?? '')] });
  }, [id, queryClient]);

  // Invalidate queries for a tab so that when we switch to it we see fresh data (e.g. after save elsewhere)
  const invalidateQueriesForTab = useCallback((tabName: typeof availableTabs[number] | 'estimate' | null) => {
    if (!tabName || tabName === 'overview') return;
    const projectId = String(id ?? '');
    queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
    switch (tabName) {
      case 'files':
        queryClient.invalidateQueries({ queryKey: ['projectFiles', projectId] });
        queryClient.invalidateQueries({ queryKey: ['project-folders', projectId] });
        break;
      case 'documents':
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] });
        break;
      case 'orders':
        queryClient.invalidateQueries({ queryKey: ['projectOrders', projectId] });
        break;
      case 'reports':
        queryClient.invalidateQueries({ queryKey: ['projectReports', projectId] });
        break;
      case 'proposal':
      case 'pricing':
        queryClient.invalidateQueries({ queryKey: ['projectProposals', projectId] });
        queryClient.invalidateQueries({ queryKey: ['proposal'] });
        break;
      case 'estimate':
        queryClient.invalidateQueries({ queryKey: ['projectEstimates', projectId] });
        queryClient.invalidateQueries({ queryKey: ['estimate'] });
        break;
      case 'dispatch':
        queryClient.invalidateQueries({ queryKey: ['dispatch-shifts-all'] });
        queryClient.invalidateQueries({ queryKey: ['dispatch-shifts', projectId] });
        queryClient.invalidateQueries({ queryKey: ['projectShifts', projectId] });
        queryClient.invalidateQueries({ queryKey: ['dispatch-pending', projectId] });
        queryClient.invalidateQueries({ queryKey: ['shifts'] });
        queryClient.invalidateQueries({ queryKey: ['attendances'] });
        break;
      case 'timesheet':
        queryClient.invalidateQueries({ queryKey: ['timesheet'] });
        queryClient.invalidateQueries({ queryKey: ['timesheetLogs'] });
        queryClient.invalidateQueries({ queryKey: ['timesheetLogsMini'] });
        queryClient.invalidateQueries({ queryKey: ['attendances'] });
        queryClient.invalidateQueries({ queryKey: ['dispatch-shifts-all'] });
        break;
      case 'safety':
        queryClient.invalidateQueries({ queryKey: ['projectSafetyInspections', projectId] });
        queryClient.invalidateQueries({ queryKey: ['projectSafetyInspection', projectId] });
        queryClient.invalidateQueries({ queryKey: ['safetyInspections'] });
        queryClient.invalidateQueries({ queryKey: ['safetyInspectionsCalendar'] });
        break;
      default:
        break;
    }
  }, [id, queryClient]);

  const doTabSwitch = useCallback((newTab: typeof availableTabs[number] | 'estimate' | null) => {
    setTab(newTab);
    if (newTab === null) {
      nav(location.pathname, { replace: true });
      if (!useDesignSystem) setIsHeroCollapsed(false);
    } else {
      nav(`${location.pathname}?tab=${newTab}`, { replace: true });
      if (!useDesignSystem) setIsHeroCollapsed(newTab !== 'overview');
      invalidateQueriesForTab(newTab);
    }
  }, [location.pathname, nav, invalidateQueriesForTab, useDesignSystem]);

  const handleTabClick = async (newTab: typeof availableTabs[number] | 'estimate' | null) => {
    if (signOnlySafetySession) {
      return;
    }
    // Check permission for the tab being accessed (when not going to overview)
    if (newTab !== null && newTab !== 'overview' && !hasTabPermission(newTab)) {
      toast.error('You do not have permission to access this tab');
      return;
    }

    // Check if we're leaving a tab that has unsaved changes (ref + state so we never miss)
    const proposalPricingUnsaved = getHasUnsavedChanges() || hasUnsavedChanges;
    const leavingEstimateWithUnsaved = tab === 'estimate' && newTab !== 'estimate' && estimateBuilderRef.current?.hasUnsavedChanges();
    // Show confirmation when leaving Proposal or Pricing (including switching between Proposal ↔ Pricing) with unsaved changes
    const leavingProposalPricingWithUnsaved = (tab === 'proposal' || tab === 'pricing') && newTab !== tab && proposalPricingUnsaved;
    const leavingSafetyWithUnsaved = tab === 'safety' && newTab !== 'safety' && proposalPricingUnsaved;

    if (leavingEstimateWithUnsaved || leavingProposalPricingWithUnsaved || leavingSafetyWithUnsaved) {
      const tabLabel =
        tab === 'estimate'
          ? 'Estimate'
          : tab === 'safety'
            ? 'Safety'
            : tab === 'pricing'
              ? 'Pricing'
              : 'Proposal';
      const result = await confirm({
        title: 'Unsaved Changes',
        message: `You have unsaved changes in the ${tabLabel} tab. What would you like to do?`,
        confirmText: 'Save and Continue',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });

      if (result === 'confirm') {
        if (leavingEstimateWithUnsaved) {
          const saved = await estimateBuilderRef.current?.save();
          if (saved) doTabSwitch(newTab);
        } else if (leavingSafetyWithUnsaved) {
          try {
            await safetyTabSaveRef.current?.();
          } catch {
            return;
          }
          doTabSwitch(newTab);
        } else {
          await proposalFormSaveRef.current?.();
          doTabSwitch(newTab);
        }
      } else if (result === 'discard') {
        doTabSwitch(newTab);
      }
      return;
    }

    doTabSwitch(newTab);
  };

  const estimator = employees?.find((e:any) => String(e.id) === String(proj?.estimator_id));
  const statusLabel = String((proj as any)?.status_label||'').trim();
  const statusColor = ((settings||{}).project_statuses||[]).find((s:any)=>s.label===statusLabel)?.value || '#e5e7eb';

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  // Helper function to get page title based on active tab
  const getPageTitle = (proj: any, activeTab: typeof tab): string => {
    const baseTitle = proj?.is_bidding ? 'Opportunity Information' : 'Project Information';
    if (!activeTab || activeTab === 'overview') {
      return baseTitle;
    }
    const tabTitles: Record<string, string> = {
      'reports': 'Notes/History',
      'dispatch': 'Workload',
      'timesheet': 'Timesheet',
      'files': 'Project Files',
      'documents': 'Documents',
      'proposal': 'Proposal',
      'pricing': 'Pricing',
      'estimate': 'Estimate',
      'orders': 'Orders',
      'safety': 'Safety',
    };
    const tabTitle = tabTitles[activeTab] || activeTab;
    return `${baseTitle} • ${tabTitle}`;
  };

  // Helper function to get page description based on active tab
  const getPageDescription = (proj: any, activeTab: typeof tab): string => {
    if (!activeTab || activeTab === 'overview') {
      return proj?.is_bidding
        ? 'Overview, files, proposal and estimate.'
        : 'Overview, files, schedule and contacts.';
    }
    const tabDescriptions: Record<string, string> = {
      'reports': 'Notes and history',
      'dispatch': 'Employee shifts and workload management',
      'timesheet': 'Time tracking and hours',
      'files': 'Documents, photos and files',
      'documents': 'Create and edit documents, export to PDF',
      'proposal': 'Full proposal with General Information, Sections, Pricing, Optional Services, Terms',
      'pricing': 'Project pricing',
      'estimate': 'Cost estimates and budgets',
      'orders': 'Purchase orders and supplies',
      'safety': 'Site safety inspections',
    };
    return tabDescriptions[activeTab] || '';
  };

  const handlePageBack = () => {
    if (tab && tab !== 'overview') {
      handleTabClick(null);
      return;
    }
    const sp = salesListPaths(proj);
    if (proj?.is_bidding) nav(sp.opportunities);
    else if (isLeakInvestigation) nav(sp.projects);
    else nav(sp.projects);
  };

  const pageBackLabel =
    tab && tab !== 'overview'
      ? 'Back to Overview'
      : proj?.is_bidding
        ? 'Back to Opportunities'
        : 'Back to Projects';

  const heroCardShell = (extra: string) =>
    useDesignSystem
      ? uiCx(uiRadius.card, uiBorders.subtle, 'bg-white', extra)
      : uiCx('rounded-xl border bg-white', extra);

  const opportunityHeroMeasureRef = useRef<HTMLDivElement>(null);
  const [opportunityHeroExpandedHeight, setOpportunityHeroExpandedHeight] = useState(320);

  useLayoutEffect(() => {
    if (!useDesignSystem) return;
    const el = opportunityHeroMeasureRef.current;
    if (!el) return;
    const measure = () => setOpportunityHeroExpandedHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [useDesignSystem, proj, cover, livePricingItems, projectDivisions]);

  const opportunityHeroExpandMs = useMemo(
    () =>
      Math.min(3200, Math.round((opportunityHeroExpandedHeight / CUSTOMER_HERO_EXPANDED_MAX_PX) * HERO_EXPAND_BASE_MS)),
    [opportunityHeroExpandedHeight],
  );

  const opportunityHeroExpandedStyle = useMemo((): CSSProperties | undefined => {
    if (!useDesignSystem) return undefined;
    return {
      transitionProperty: 'max-height, opacity',
      transitionDuration: isHeroCollapsed ? `${HERO_COLLAPSE_MS}ms` : `${opportunityHeroExpandMs}ms`,
      transitionTimingFunction: HERO_EXPAND_EASING,
      maxHeight: isHeroCollapsed ? 0 : opportunityHeroExpandedHeight,
      opacity: isHeroCollapsed ? 0 : 1,
    };
  }, [useDesignSystem, isHeroCollapsed, opportunityHeroExpandedHeight, opportunityHeroExpandMs]);

  const opportunityHeroCollapsedStyle = useMemo((): CSSProperties | undefined => {
    if (!useDesignSystem) return undefined;
    return {
      transitionProperty: 'max-height, opacity',
      transitionDuration: isHeroCollapsed ? `${HERO_EXPAND_BASE_MS}ms` : `${HERO_COLLAPSE_MS}ms`,
      transitionTimingFunction: HERO_EXPAND_EASING,
      maxHeight: isHeroCollapsed ? OPPORTUNITY_HERO_COLLAPSED_PX : 0,
      opacity: isHeroCollapsed ? 1 : 0,
    };
  }, [useDesignSystem, isHeroCollapsed]);

  const opportunityConvertHeaderAction = useMemo(() => {
    if (!isOpportunityDetailRoute || !proj?.is_bidding || !hasEditPermission) return null;

    const hasName = !!proj?.name?.trim();
    const hasSite = !!proj?.site_id;
    const hasEstimator = !!proj?.estimator_id;
    const hasDivisions = Array.isArray(proj?.project_division_ids) && proj.project_division_ids.length > 0;
    const isComplete = hasName && hasSite && hasEstimator && hasDivisions;

    const missingFields: string[] = [];
    if (!hasName) missingFields.push('Project Name');
    if (!hasSite) missingFields.push('Site');
    if (!hasEstimator) missingFields.push('Estimator');
    if (!hasDivisions) missingFields.push('Project Divisions');

    const missingMessage =
      missingFields.length > 0
        ? `Please complete the following fields before converting: ${missingFields.join(', ')}`
        : '';

    const convertTooltipContent =
      missingFields.length > 0 ? (
        <div>
          <p>Please complete the following fields before converting:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {missingFields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
        </div>
      ) : null;

    const convertButton = (
      <AppButton
        type="button"
        size="sm"
        variant="secondary"
        disabled={!isComplete}
        className={!isComplete ? 'pointer-events-none' : undefined}
        onClick={() => {
          if (!isComplete) {
            toast.error(missingMessage);
            return;
          }
          setShowConvertModal(true);
        }}
      >
        Convert to Project
      </AppButton>
    );

    if (!isComplete && convertTooltipContent) {
      return (
        <AppTooltip wrap content={convertTooltipContent} placement="top" className="cursor-not-allowed">
          {convertButton}
        </AppTooltip>
      );
    }

    return convertButton;
  }, [isOpportunityDetailRoute, proj, hasEditPermission]);

  const PageShell = useDesignSystem ? 'main' : 'div';

  return (
    <PageShell
      className={uiCx(
        useDesignSystem && 'w-full min-w-0 min-h-full bg-gray-50',
        uiSpacing.pageStack,
      )}
    >
      {useDesignSystem ? (
        <AppPageHeader
          title={getPageTitle(proj, tab)}
          subtitle={getPageDescription(proj, tab)}
          icon={
            isProjectDetailRoute && isLeakInvestigation ? (
              <ClipboardList className="h-4 w-4" />
            ) : isProjectDetailRoute ? (
              <FolderKanban className="h-4 w-4" />
            ) : (
              <Briefcase className="h-4 w-4" />
            )
          }
          onBack={handlePageBack}
          backLabel={pageBackLabel}
          actions={
            <div className="text-right">
              <div className={uiTypography.overline}>Today</div>
              <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
            </div>
          }
        />
      ) : (
        <div className="rounded-xl border bg-white p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={handlePageBack}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                title={pageBackLabel}
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{getPageTitle(proj, tab)}</div>
                <div className="text-xs text-gray-500 mt-0.5">{getPageDescription(proj, tab)}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
            </div>
          </div>
        </div>
      )}

      {/* Hero + tabs — opportunity uses in-flow collapse (CustomerDetail pattern) */}
      {(() => {
        const heroPanels = (
          <>
        {/* Expanded View - Full Hero Section */}
        <div
          className={
            useDesignSystem
              ? HERO_PANEL_TRANSITION_BASE
              : heroCardShell(
                  `transition-all ${isHeroCollapsed ? 'overflow-hidden duration-[1200ms]' : 'overflow-visible duration-[1800ms]'} ease-in-out ${
                    isHeroCollapsed
                      ? 'opacity-0 max-h-0 pointer-events-none relative'
                      : 'opacity-100 max-h-[2000px] pointer-events-auto relative'
                  }`,
                )
          }
          style={
            useDesignSystem
              ? opportunityHeroExpandedStyle
              : {
                  transitionProperty: 'max-height, opacity',
                  transitionDuration: isHeroCollapsed ? '1200ms, 300ms' : '1800ms, 300ms',
                  transitionTimingFunction: 'ease-in-out, ease-in-out',
                }
          }
          aria-hidden={useDesignSystem ? isHeroCollapsed : undefined}
        >
          <div
            ref={useDesignSystem ? opportunityHeroMeasureRef : undefined}
            className={uiCx(useDesignSystem ? 'p-2.5' : 'p-3', 'overflow-visible')}
          >
            <div className={uiCx('flex items-start', useDesignSystem ? 'gap-5' : 'gap-4')}>
              {/* Left Section - Image and Project Divisions */}
              <div className={uiCx('w-48 flex-shrink-0 overflow-visible', HERO_FIELD_STACK)}>
                {/* Image */}
                <div
                  className={uiCx(
                    'h-36 w-48 overflow-hidden group relative overflow-visible',
                    uiRadius.card,
                    uiBorders.subtle,
                  )}
                >
                  <img src={cover} className="w-full h-full object-cover" alt="" />
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Change
                  </button>
                </div>
                
                {/* Project Divisions below image - with Edit button and modal */}
                <ProjectDivisionsHeroSection
                  projectId={String(id || '')}
                  proj={proj || {}}
                  hasEditPermission={hasEditPermission}
                  livePricingItems={livePricingItems}
                  compact={isOpportunityDetailRoute || isProjectDetailRoute}
                  designSystem={useDesignSystem}
                />
                {!isOpportunityStyleTabs ? (
                  <ProjectHeroPricingArea projectId={String(id || '')} proposals={proposals || []} />
                ) : null}
              </div>
              
              {/* Right Section - General Information */}
              <div className="flex-1 min-w-0">
                <div className={useDesignSystem ? 'mb-1' : 'mb-2'}>
                <div className="flex items-center gap-1.5">
                  <h3 
                    className="text-sm font-bold text-gray-900 cursor-text"
                    onClick={() => hasEditPermission && setEditProjectNameModal(true)}
                  >
                    {proj?.name || 'Untitled Project'}
                  </h3>
                  {hasEditPermission &&
                    (useDesignSystem ? (
                      <AppHeroEditButton
                        onClick={() => setEditProjectNameModal(true)}
                        title="Edit Project Name"
                      />
                    ) : (
                      <button
                        onClick={() => setEditProjectNameModal(true)}
                        className="text-gray-400 hover:text-[#7f1010] transition-colors"
                        title="Edit Project Name"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    ))}
                </div>
              </div>
              
              {/* Align by columns */}
              <div
                className={uiCx(
                  'grid grid-cols-3',
                  useDesignSystem ? 'gap-x-2.5 gap-y-1' : 'gap-x-3 gap-y-1.5',
                )}
              >
                  {/* Column 1 */}
                  <div className={uiCx('min-w-0', HERO_FIELD_STACK)}>
                    {/* Code */}
                    <div>
                      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Code</span>
                      <div className="text-xs font-semibold text-gray-900 mt-0.5">{proj?.code || '—'}</div>
                    </div>

                    {/* Project Owner / Source - only show for projects */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Project Owner / Source</span>
                        {proj?.client_id ? (
                          <Link
                            to={`/customers/${encodeURIComponent(String(proj.client_id))}`}
                            className="text-xs font-semibold text-[#7f1010] hover:text-[#a31414] hover:underline break-words mt-0.5 block"
                          >
                            {proj?.client_display_name || proj?.client_name || 'Open record'}
                          </Link>
                        ) : (
                          <div className="text-xs font-semibold text-gray-400 mt-0.5">—</div>
                        )}
                      </div>
                    )}

                    {/* Related Customers - only show for projects (after conversion: list awarded only; tooltip for non-awarded) */}
                    {!isOpportunityStyleTabs && (() => {
                      const relatedHero = projectRelatedCustomersHeroSplit(proj);
                      const showInfoTooltip =
                        relatedHero.hasAwardedData && relatedHero.nonAwardedEntries.length > 0;
                      return (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Related Customers</span>
                          {showInfoTooltip && (
                            <div className="relative group/nonAwarded inline-flex">
                              <button
                                type="button"
                                className="p-0.5 text-gray-400 hover:text-gray-600 rounded"
                                aria-label="Related customers not awarded this bid"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                              <div className="absolute left-1/2 bottom-full z-[100] mb-2 w-max min-w-[22rem] max-w-[min(100vw-1.5rem,40rem)] -translate-x-1/2 px-3 py-2 text-xs text-white whitespace-normal rounded-lg bg-gray-900 shadow-xl opacity-0 invisible pointer-events-none transition-all duration-200 group-hover/nonAwarded:visible group-hover/nonAwarded:opacity-100">
                                <div className="font-semibold mb-1.5 text-white">Not Awarded (Bid)</div>
                                <ul className="space-y-1 text-gray-200 leading-snug">
                                  {relatedHero.nonAwardedEntries.map((e) => (
                                    <li key={e.id}>• {e.name}</li>
                                  ))}
                                </ul>
                                <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900" />
                              </div>
                            </div>
                          )}
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditRelatedCustomersModal(true)}
                              className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Related Customers"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {(proj?.related_client_ids?.length ?? 0) > 0 ? (
                          relatedHero.displayedEntries.length > 0 ? (
                          <div className="flex flex-wrap gap-x-1 gap-y-1 mt-0.5">
                            {relatedHero.displayedEntries.map((e, i) => (
                              <span key={e.id} className="inline-flex items-center gap-1 flex-wrap">
                                <Link
                                  to={`/customers/${encodeURIComponent(String(e.id))}`}
                                  className="text-xs font-semibold text-[#7f1010] hover:text-[#a31414] hover:underline break-words"
                                >
                                  {e.name}
                                </Link>
                                {i < relatedHero.displayedEntries.length - 1 ? <span className="text-gray-400">,</span> : null}
                              </span>
                            ))}
                          </div>
                          ) : (
                            <div className="text-xs font-semibold text-gray-400 mt-0.5">—</div>
                          )
                        ) : (
                          <div className="text-xs font-semibold text-gray-400 mt-0.5">—</div>
                        )}
                      </div>
                      );
                    })()}

                    {/* Site - only show for projects */}
                    {!isOpportunityStyleTabs && (
                      <ProjectHeroSiteField
                        proj={proj}
                        hasEditPermission={hasEditPermission}
                        onEdit={() => setEditSiteModal(true)}
                      />
                    )}

                    {/* Status */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Status</span>
                        {hasEditPermission && (
                          <button
                            onClick={() => setEditStatusModal(true)}
                            className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                            title="Edit Status"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                      </div>
                      {useDesignSystem ? (
                        <AppBadge variant={getProjectStatusBadgeVariant(statusLabel)}>
                          {statusLabel || '—'}
                        </AppBadge>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium inline-block" style={{ backgroundColor: statusColor, color: '#000' }}>
                          {statusLabel || '—'}
                        </span>
                      )}
                      {statusLabel && <StatusTimer project={proj} />}
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className={uiCx('min-w-0', HERO_FIELD_STACK)}>
                    {/* Project Owner / Source - opportunities and leak investigations */}
                    {isOpportunityStyleTabs && (
                      <div>
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Project Owner / Source</span>
                        {proj?.client_id ? (
                          <Link
                            to={`/customers/${encodeURIComponent(String(proj.client_id))}`}
                            className="text-xs font-semibold text-[#7f1010] hover:text-[#a31414] hover:underline break-words mt-0.5 block"
                          >
                            {proj?.client_display_name || proj?.client_name || 'Open record'}
                          </Link>
                        ) : (
                          <div className="text-xs font-semibold text-gray-400 mt-0.5">—</div>
                        )}
                      </div>
                    )}

                    {/* Related Customers - opportunities and leak investigations */}
                    {isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Related Customers</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditRelatedCustomersModal(true)}
                              className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Related Customers"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {(proj?.related_client_ids?.length ?? 0) > 0 ? (
                          <div className="flex flex-wrap gap-x-1 gap-y-0.5 mt-0.5">
                            {(proj?.related_client_ids ?? []).map((rid, i) => (
                              <span key={rid}>
                                <Link
                                  to={`/customers/${encodeURIComponent(String(rid))}`}
                                  className="text-xs font-semibold text-[#7f1010] hover:text-[#a31414] hover:underline break-words"
                                >
                                  {(proj?.related_client_display_names?.[i] ?? rid) || 'View Customer'}
                                </Link>
                                {i < (proj?.related_client_ids?.length ?? 0) - 1 ? ', ' : null}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs font-semibold text-gray-400 mt-0.5">—</div>
                        )}
                      </div>
                    )}

                    {/* Site - opportunities and leak investigations */}
                    {isOpportunityStyleTabs && (
                      <ProjectHeroSiteField
                        proj={proj}
                        hasEditPermission={hasEditPermission}
                        onEdit={() => setEditSiteModal(true)}
                      />
                    )}

                    {/* Lead Source - opportunities and leak investigations */}
                    {isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Lead Source</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditLeadSourceModal(true)}
                              className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Lead Source"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-gray-900">{proj?.lead_source || '—'}</div>
                      </div>
                    )}

                    {/* Lead Source - only show for projects, at top of column 2 */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Lead Source</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditLeadSourceModal(true)}
                              className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Lead Source"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-gray-900">{proj?.lead_source || '—'}</div>
                      </div>
                    )}

                    {/* Start Date - only show for projects, not opportunities */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Start Date</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditStartDateModal(true)}
                              className="text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Start Date"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="text-sm font-medium">{proj?.date_start ? proj.date_start.slice(0, 10) : '—'}</div>
                      </div>
                    )}

                    {/* Awarded Date - only show for projects, not opportunities */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Awarded Date</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditAwardedDateModal(true)}
                              className="text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Awarded Date"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="text-sm font-medium">{proj?.date_awarded ? proj.date_awarded.slice(0, 10) : '—'}</div>
                      </div>
                    )}

                    {/* End date - only show for projects, not opportunities */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">End Date</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditEtaModal(true)}
                              className="text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit End Date"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="text-sm font-medium">{proj?.date_eta ? proj.date_eta.slice(0, 10) : '—'}</div>
                      </div>
                    )}
                  </div>
                  
                  {/* Column 3 */}
                  <div className={uiCx('min-w-0', HERO_FIELD_STACK)}>
                    {/* Estimators - for opportunities and leak investigations, show in column 3 */}
                    {isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Estimators</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditEstimatorModal(true)}
                              className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Estimators"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {(() => {
                          const estimatorIds = proj?.estimator_ids || (proj?.estimator_id ? [proj.estimator_id] : []);
                          const estimators = estimatorIds
                            .map((id: string) => employees?.find((e: any) => String(e.id) === String(id)))
                            .filter(Boolean);
                          
                          if (estimators.length === 0) {
                            return <div className="text-xs text-gray-400">—</div>;
                          }
                          
                          if (estimators.length === 1) {
                            const est = estimators[0];
                            return (
                              <div className="flex items-center gap-2">
                                <UserAvatar user={est} size="w-6 h-6" showTooltip={true} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-gray-900 truncate">{getUserDisplayName(est)}</div>
                                </div>
                              </div>
                            );
                          }
                          
                          // Multiple estimators - show only avatars
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {estimators.map((est: any) => (
                                <UserAvatar key={est.id} user={est} size="w-6 h-6" showTooltip={true} />
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Estimators - only show for projects, not opportunities */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Estimators</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditEstimatorModal(true)}
                              className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Estimators"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {(() => {
                          const estimatorIds = proj?.estimator_ids || (proj?.estimator_id ? [proj.estimator_id] : []);
                          const estimators = estimatorIds
                            .map((id: string) => employees?.find((e: any) => String(e.id) === String(id)))
                            .filter(Boolean);
                          
                          if (estimators.length === 0) {
                            return <div className="text-xs text-gray-400">—</div>;
                          }
                          
                          if (estimators.length === 1) {
                            const est = estimators[0];
                            return (
                              <div className="flex items-center gap-2">
                                <UserAvatar user={est} size="w-6 h-6" showTooltip={true} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-gray-900 truncate">{getUserDisplayName(est)}</div>
                                </div>
                              </div>
                            );
                          }
                          
                          // Multiple estimators - show only avatars
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {estimators.map((est: any) => (
                                <UserAvatar key={est.id} user={est} size="w-6 h-6" showTooltip={true} />
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}


                    {/* Project Admin - Only show for projects, not opportunities */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Project Admin</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditProjectAdminModal(true)}
                              className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Project Admin"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {(() => {
                          const adminId = proj?.project_admin_id;
                          const admin = adminId ? employees?.find((e: any) => String(e.id) === String(adminId)) : null;
                          if (!admin) return <div className="text-xs text-gray-400">—</div>;
                          return (
                            <div className="flex items-center gap-2">
                              <UserAvatar user={admin} size="w-6 h-6" showTooltip={true} />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-gray-900 truncate">{getUserDisplayName(admin)}</div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* On-site Leads */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">On-site Leads</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setShowOnSiteLeadsModal(true)}
                              className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit On-site Leads"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {(() => {
                          const leads = proj?.division_onsite_leads || {};
                          
                          // Helper function to get division label
                          const getDivisionLabel = (divId: string): string => {
                            if (!projectDivisions) return divId;
                            for (const d of projectDivisions) {
                              if (String(d.id) === String(divId)) return d.label || divId;
                              for (const sub of (d.subdivisions || [])) {
                                if (String(sub.id) === String(divId)) return `${d.label} - ${sub.label}`;
                              }
                            }
                            return divId;
                          };

                          // Group leads by employee ID and collect all their divisions
                          const leadMap = new Map<string, { employee: any; divisions: string[] }>();
                          
                          Object.entries(leads).forEach(([divId, leadId]) => {
                            if (!leadId) return;
                            const emp = employees?.find((e: any) => String(e.id) === String(leadId));
                            if (!emp) return;
                            
                            const employeeId = String(leadId);
                            const divisionLabel = getDivisionLabel(divId);
                            
                            if (leadMap.has(employeeId)) {
                              // Employee already exists, add division to their list
                              leadMap.get(employeeId)!.divisions.push(divisionLabel);
                            } else {
                              // New employee
                              leadMap.set(employeeId, {
                                employee: emp,
                                divisions: [divisionLabel]
                              });
                            }
                          });

                          const uniqueLeads = Array.from(leadMap.values());
                          
                          if (uniqueLeads.length === 0) {
                            return <div className="text-xs text-gray-400">—</div>;
                          }
                          
                          if (uniqueLeads.length === 1) {
                            const { employee, divisions } = uniqueLeads[0];
                            return (
                              <div className="flex items-center gap-2">
                                <LeadTooltip employee={employee} divisions={divisions}>
                                  <div className="relative group/lead">
                                    <UserAvatar user={employee} size="w-6 h-6" showTooltip={false} />
                                  </div>
                                </LeadTooltip>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-gray-900 truncate">{getUserDisplayName(employee)}</div>
                                </div>
                              </div>
                            );
                          }
                          
                          // Multiple leads - show only avatars (one per unique employee)
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {uniqueLeads.map(({ employee, divisions }) => (
                                <LeadTooltip key={employee.id} employee={employee} divisions={divisions}>
                                  <div className="relative group/lead">
                                    <UserAvatar user={employee} size="w-6 h-6" showTooltip={false} />
                                  </div>
                                </LeadTooltip>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Progress - below On-site Leads, projects only */}
                    {!isOpportunityStyleTabs && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Progress</span>
                          {hasEditPermission && (
                            <button
                              onClick={() => setEditProgressModal(true)}
                              className="text-gray-400 hover:text-[#7f1010] transition-colors"
                              title="Edit Progress"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 max-w-[280px] h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-red rounded-full transition-all"
                              style={{ width: String(Math.max(0, Math.min(100, Number(proj?.progress || 0)))) + '%' }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-gray-700 w-12 text-right">
                            {Math.max(0, Math.min(100, Number(proj?.progress || 0)))}%
                          </span>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Collapse button - bottom right corner of card */}
          {useDesignSystem ? (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="absolute bottom-2 right-2 z-20 p-1"
              onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
              title="Collapse"
              aria-label="Collapse"
            >
              <ChevronUp className="h-3 w-3" />
            </AppButton>
          ) : (
            <button
              onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
              className="absolute bottom-2 right-2 p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
              title="Collapse"
            >
              <svg
                className="w-3 h-3 transition-transform rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
        
        {/* Collapsed View - Single Line */}
        <div
          className={
            useDesignSystem
              ? HERO_PANEL_TRANSITION_BASE
              : heroCardShell(
                  `overflow-hidden transition-all ${isHeroCollapsed ? 'duration-[1200ms]' : 'duration-[1800ms]'} ease-in-out absolute top-0 left-0 right-0 ${
                    isHeroCollapsed
                      ? 'opacity-100 min-h-[60px] max-h-[200px] pointer-events-auto z-10'
                      : 'opacity-0 max-h-0 pointer-events-none z-0'
                  }`,
                )
          }
          style={
            useDesignSystem
              ? opportunityHeroCollapsedStyle
              : {
                  transitionProperty: 'max-height, opacity',
                  transitionDuration: isHeroCollapsed ? '1200ms, 300ms' : '1800ms, 300ms',
                  transitionTimingFunction: 'ease-in-out, ease-in-out',
                }
          }
          aria-hidden={useDesignSystem ? !isHeroCollapsed : undefined}
        >
          <div className="p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-900 truncate">{proj?.name||'—'}</h3>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 pr-8">
                {/* Progress - only show for projects, not opportunities */}
                {!isOpportunityStyleTabs && (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-red rounded-full transition-all" style={{ width: `${Math.max(0,Math.min(100,Number(proj?.progress||0)))}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-8 text-right">{Math.max(0,Math.min(100,Number(proj?.progress||0)))}%</span>
                  </div>
                )}
                {/* Project Admin for projects, Estimators for opportunities / leak investigations */}
                {(() => {
                  if (isOpportunityStyleTabs) {
                    // For opportunities and leak investigations: show estimators
                    const estimatorIds = proj?.estimator_ids || (proj?.estimator_id ? [proj.estimator_id] : []);
                    const estimators = estimatorIds
                      .map((id: string) => employees?.find((e: any) => String(e.id) === String(id)))
                      .filter(Boolean);
                    
                    if (estimators.length === 0) {
                      return <div className="text-xs text-gray-400">—</div>;
                    }
                    
                    if (estimators.length === 1) {
                      const est = estimators[0];
                      return (
                        <div className="flex items-center gap-2">
                          <UserAvatar user={est} size="w-6 h-6" showTooltip={true} />
                          <div className="text-xs font-semibold text-gray-700">{getUserDisplayName(est)}</div>
                        </div>
                      );
                    }
                    
                    // Multiple estimators - show only avatars
                    return (
                      <div className="flex items-center gap-1.5">
                        {estimators.map((est: any) => (
                          <UserAvatar key={est.id} user={est} size="w-6 h-6" showTooltip={true} />
                        ))}
                      </div>
                    );
                  } else {
                    // For projects: show Project Admin
                    const adminId = proj?.project_admin_id;
                    if (!adminId) {
                      return <div className="text-xs text-gray-400">—</div>;
                    }
                    
                    const projectAdmin = employees?.find((e: any) => String(e.id) === String(adminId));
                    if (!projectAdmin) {
                      return <div className="text-xs text-gray-400">—</div>;
                    }
                    
                    return (
                      <div className="flex items-center gap-2">
                        <UserAvatar user={projectAdmin} size="w-6 h-6" showTooltip={true} />
                        <div className="text-xs font-semibold text-gray-700">{getUserDisplayName(projectAdmin)}</div>
                      </div>
                    );
                  }
                })()}
              </div>
            </div>
          </div>
          
          {/* Expand button - bottom right corner */}
          {useDesignSystem ? (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="absolute bottom-2 right-2 z-20 p-1"
              onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
              title="Expand"
              aria-label="Expand"
            >
              <ChevronDown className="h-3 w-3" />
            </AppButton>
          ) : (
            <button
              onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
              className="absolute bottom-2 right-2 p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
              title="Expand"
            >
              <svg
                className="w-3 h-3 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
          </>
        );

        const tabCards = (
          <ProjectTabCards
            availableTabs={availableTabs}
            tabCounts={tabCounts}
            onTabClick={handleTabClick}
            proj={proj}
            currentTab={tab}
            useDesignSystem={useDesignSystem}
            isHeroCollapsed={isHeroCollapsed}
            headerEnd={
              isOpportunityDetailRoute && proj?.is_bidding
                ? opportunityConvertHeaderAction
                : undefined
            }
          />
        );

        if (useDesignSystem) {
          return (
            <div className={uiCx('flex flex-col', isHeroCollapsed ? 'gap-1.5' : 'gap-2')}>
              <AppCard
                className={uiCx('transition-[margin]', HERO_PANEL_EASE)}
                bodyClassName="relative overflow-hidden p-0"
              >
                {heroPanels}
              </AppCard>
              {!signOnlySafetySession ? (
                <div className={!isHeroCollapsed ? '-mt-0.5' : undefined}>{tabCards}</div>
              ) : null}
            </div>
          );
        }

        return (
          <>
            <div
              className={`transition-all ${isHeroCollapsed ? 'duration-[1200ms]' : 'duration-[1800ms]'} ease-in-out ${isHeroCollapsed ? 'mb-2' : 'mb-4'}`}
            >
              <div className="relative" style={{ minHeight: isHeroCollapsed ? 'auto' : 'auto' }}>
                {heroPanels}
              </div>
            </div>
            {!signOnlySafetySession ? (
              <div
                className={`mb-4 transition-all duration-[1200ms] ease-in-out ${isHeroCollapsed ? 'mt-16' : 'mt-0'}`}
              >
                {tabCards}
              </div>
            ) : null}
          </>
        );
      })()}
      {/* Same offset as tab strip: collapsed hero is position:absolute; without this, Safety content sits under it */}
      {signOnlySafetySession && isHeroCollapsed && (
        <div className="mt-16 mb-4 shrink-0" aria-hidden />
      )}

      {/* Calendar / team — overview (primary page, tab null) */}
      {!tab && (
        <>
          {useDesignSystem && !isOpportunityStyleTabs ? (
            <>
              <div className={uiCx(uiLayout.pageTwoColumn, 'mb-4 auto-rows-auto')}>
                <AppCard className="flex h-full min-h-0 flex-col">
                  <AppSectionHeader
                    title="Workload"
                    description="Calendar events for this project."
                    {...appSectionPresetProps('workload')}
                    action={
                      hasEditPermission ? (
                        <AppButton type="button" size="sm" onClick={() => setWorkloadEventCreateOpen(true)}>
                          + Create Event
                        </AppButton>
                      ) : null
                    }
                  />
                  <div className="mt-3 min-h-0 flex-1">
                    <CalendarMock
                      title="Project Calendar"
                      projectId={String(id)}
                      hasEditPermission={hasEditPermission}
                      useDesignSystem
                      hideCreateButton
                      createModalOpen={workloadEventCreateOpen}
                      onCreateModalOpenChange={setWorkloadEventCreateOpen}
                    />
                  </div>
                </AppCard>
                <ProjectTeamCard
                  projectId={String(id)}
                  employees={employees || []}
                  canManageMembers={canManageMembers}
                  useDesignSystem
                />
              </div>
              <ProjectDescriptionCard
                proj={proj}
                hasEditPermission={hasEditPermission}
                useDesignSystem
                isLeakInvestigation={isLeakInvestigation}
                className="mb-4"
                onEdit={() => setEditDescriptionModal(true)}
              />
              <div className={uiCx(uiLayout.pageTwoColumn, 'mb-4 auto-rows-auto')}>
                <LastReportsCard reports={reports || []} useDesignSystem />
                <ProjectFieldBriefCard
                  projectId={String(id)}
                  proj={proj || {}}
                  hasEditPermission={hasEditPermission}
                  designSystem
                  onSaved={(updated) => {
                    queryClient.setQueryData<Project | undefined>(projectQueryKey, (old) =>
                      old ? { ...old, ...updated } : old,
                    );
                    queryClient.invalidateQueries({ queryKey: projectQueryKey });
                    invalidateRecentActivity();
                  }}
                />
              </div>
            </>
          ) : !isOpportunityStyleTabs ? (
            <>
              <div className="mb-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-3">Workload</h4>
                  <CalendarMock title="Project Calendar" projectId={String(id)} hasEditPermission={hasEditPermission} />
                </div>
                <ProjectTeamCard
                  projectId={String(id)}
                  employees={employees||[]}
                  canManageMembers={canManageMembers}
                />
              </div>
              <ProjectDescriptionCard
                proj={proj}
                hasEditPermission={hasEditPermission}
                isLeakInvestigation={isLeakInvestigation}
                className="mb-4"
                onEdit={() => setEditDescriptionModal(true)}
              />
              <div className="mb-4 grid gap-4 md:grid-cols-2">
                <LastReportsCard reports={reports||[]} />
                <ProjectFieldBriefCard
                  projectId={String(id)}
                  proj={proj || {}}
                  hasEditPermission={hasEditPermission}
                  onSaved={(updated) => {
                    queryClient.setQueryData<Project | undefined>(projectQueryKey, (old) =>
                      old ? { ...old, ...updated } : old,
                    );
                    queryClient.invalidateQueries({ queryKey: projectQueryKey });
                    invalidateRecentActivity();
                  }}
                />
              </div>
            </>
          ) : useDesignSystem ? (
            <div className={uiCx(uiLayout.pageTwoColumn, 'mb-4')}>
              <AppCard className="flex h-full min-h-0 flex-col">
                <AppSectionHeader
                  title="Workload"
                  description={
                    isLeakInvestigation
                      ? 'Calendar events for this project.'
                      : 'Calendar events for this opportunity.'
                  }
                  {...appSectionPresetProps('workload')}
                  action={
                    hasEditPermission ? (
                      <AppButton type="button" size="sm" onClick={() => setWorkloadEventCreateOpen(true)}>
                        + Create Event
                      </AppButton>
                    ) : null
                  }
                />
                <div className="mt-3 min-h-0 flex-1">
                  <CalendarMock
                    title={
                      isLeakInvestigation
                        ? 'Project Calendar'
                        : proj?.is_bidding
                          ? 'Opportunity Calendar'
                          : 'Project Calendar'
                    }
                    projectId={String(id)}
                    hasEditPermission={hasEditPermission}
                    useDesignSystem
                    hideCreateButton
                    createModalOpen={workloadEventCreateOpen}
                    onCreateModalOpenChange={setWorkloadEventCreateOpen}
                  />
                </div>
              </AppCard>
              <ProjectTeamCard
                projectId={String(id)}
                employees={employees||[]}
                canManageMembers={canManageMembers}
                useDesignSystem
              />
            </div>
          ) : (
            <div className="mb-4 grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-white p-4">
                <h4 className="font-semibold mb-3">Workload</h4>
                <CalendarMock
                  title={proj?.is_bidding ? 'Opportunity Calendar' : 'Project Calendar'}
                  projectId={String(id)}
                  hasEditPermission={hasEditPermission}
                />
              </div>
              <ProjectTeamCard
                projectId={String(id)}
                employees={employees||[]}
                canManageMembers={canManageMembers}
              />
            </div>
          )}
        </>
      )}

      {/* Convert to Project Button (for opportunities — legacy layout only) */}
      {!isOpportunityDetailRoute && !tab && proj?.is_bidding && hasEditPermission && (() => {
        const hasName = !!proj?.name?.trim();
        const hasSite = !!proj?.site_id;
        const hasEstimator = !!proj?.estimator_id;
        const hasDivisions = Array.isArray(proj?.project_division_ids) && proj.project_division_ids.length > 0;
        const isComplete = hasName && hasSite && hasEstimator && hasDivisions;

        const missingFields: string[] = [];
        if (!hasName) missingFields.push('Project Name');
        if (!hasSite) missingFields.push('Site');
        if (!hasEstimator) missingFields.push('Estimator');
        if (!hasDivisions) missingFields.push('Project Divisions');

        const missingMessage =
          missingFields.length > 0
            ? `Please complete the following fields before converting: ${missingFields.join(', ')}`
            : '';

        return (
          <div className="mb-4">
            <button
              onClick={() => {
                if (!isComplete) {
                  toast.error(missingMessage);
                  return;
                }
                setShowConvertModal(true);
              }}
              disabled={!isComplete}
              className={`w-full border-2 border-dashed rounded-lg p-2.5 transition-all text-center bg-white flex items-center justify-center gap-2 min-h-[60px] ${
                isComplete
                  ? 'border-green-300 hover:border-green-600 hover:bg-green-50 cursor-pointer'
                  : 'border-gray-300 cursor-not-allowed'
              }`}
              title={missingMessage || 'Convert this opportunity to an active project'}
            >
              <span className={`text-lg ${isComplete ? 'text-green-500' : 'text-gray-400'}`}>+</span>
              <span className={`font-medium text-xs ${isComplete ? 'text-green-700' : 'text-gray-500'}`}>
                Convert to Project
              </span>
            </button>
            {!isComplete && <p className="mt-2 text-xs text-gray-600 text-center">{missingMessage}</p>}
          </div>
        );
      })()}

      {/* Description card — opportunities only (projects show it in overview grid) */}
      {!tab && isOpportunityStyleTabs && (
        <ProjectDescriptionCard
          proj={proj}
          hasEditPermission={hasEditPermission}
          useDesignSystem={useDesignSystem}
          isLeakInvestigation={isLeakInvestigation}
          className="mt-6"
          onEdit={() => setEditDescriptionModal(true)}
        />
      )}

      {showBillingSection && (
        <ProjectBillingSection
          projectId={String(id ?? '')}
          project={proj || undefined}
          canEdit={hasEditPermission}
          designSystem={useDesignSystem}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['project', id] })}
        />
      )}

      {/* Recent Activity */}
      {!tab && (
        <div className="mt-6">
          <ProjectRecentActivity
            projectId={String(id || '')}
            isOpportunity={!!proj?.is_bidding}
            isLeakInvestigation={isLeakInvestigation}
            useDesignSystem={useDesignSystem}
          />
        </div>
      )}

      {/* Danger Zone */}
      {!tab && hasAdministratorAccess && (
        useDesignSystem ? (
          <AppCard className={uiCx('mt-6', uiBorders.subtle, 'border-red-200 bg-red-50')}>
            <AppSectionHeader
              title="Danger Zone"
              description="Permanent actions that cannot be undone."
              {...appSectionPresetProps('emergency')}
            />
            <div className={uiCx(uiLayout.actionsRow, 'mt-3 flex-wrap')}>
              <AppButton
                variant="danger"
                size="sm"
                onClick={async () => {
                  const result = await confirm({
                    title: proj?.is_bidding
                      ? 'Delete Opportunity'
                      : isLeakInvestigation
                        ? 'Delete Project'
                        : 'Delete Project',
                    message: `Are you sure you want to delete "${proj?.name || (proj?.is_bidding ? 'this opportunity' : 'this project')}"? This action cannot be undone.${proj?.is_bidding ? '' : ' All related data (updates, notes, timesheets) will also be deleted.'}`,
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                  });
                  if (result !== 'confirm') return;
                  try {
                    await api('DELETE', `/projects/${encodeURIComponent(String(id || ''))}`);
                    toast.success(
                      proj?.is_bidding
                        ? 'Opportunity deleted'
                        : isLeakInvestigation
                          ? 'Project deleted'
                          : 'Project deleted',
                    );
                    queryClient.removeQueries({ queryKey: ['opportunities'] });
                    queryClient.removeQueries({ queryKey: ['projects'] });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ['clientOpportunities'] }),
                      queryClient.invalidateQueries({ queryKey: ['clientProjects'] }),
                      queryClient.invalidateQueries({ queryKey: ['clientProjectParticipations'] }),
                    ]);
                    if (proj?.client_id) {
                      nav(`/customers/${encodeURIComponent(String(proj.client_id))}`);
                    } else {
                      const sp = salesListPaths(proj);
                      if (proj?.is_bidding) nav(sp.opportunities);
                      else if (isLeakInvestigation) nav(sp.projects);
                      else nav(sp.projects);
                    }
                  } catch (_e) {
                    toast.error(
                      proj?.is_bidding
                        ? 'Failed to delete opportunity'
                        : isLeakInvestigation
                          ? 'Failed to delete project'
                          : 'Failed to delete project',
                    );
                  }
                }}
              >
                {proj?.is_bidding
                  ? 'Delete Opportunity'
                  : 'Delete Project'}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={async () => {
                  const entityLabel = proj?.is_bidding
                    ? 'Opportunity'
                    : isLeakInvestigation
                      ? 'Project'
                      : 'Project';
                  const result = await confirm({
                    title: `Duplicate ${entityLabel}`,
                    message: `This will create a full copy of "${proj?.name || 'this entity'}" with a new code. Proposals, files, folders, updates, reports and events will be cloned. Timesheet, dispatch and audit logs will not. Continue?`,
                    confirmText: 'Duplicate',
                    cancelText: 'Cancel',
                  });
                  if (result !== 'confirm') return;
                  try {
                    const res = await api<{ id: string }>(
                      'POST',
                      `/projects/${encodeURIComponent(String(id || ''))}/duplicate`,
                    );
                    toast.success(`${entityLabel} duplicated`);
                    queryClient.removeQueries({ queryKey: ['opportunities'] });
                    queryClient.removeQueries({ queryKey: ['projects'] });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ['clientOpportunities'] }),
                      queryClient.invalidateQueries({ queryKey: ['clientProjects'] }),
                      queryClient.invalidateQueries({ queryKey: ['clientProjectParticipations'] }),
                    ]);
                    const rm = proj?.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE;
                    const newIdEnc = encodeURIComponent(res.id);
                    if (isLeakInvestigation) {
                      nav(rm ? `/rm-projects/${newIdEnc}` : `/projects/${newIdEnc}`);
                    } else if (proj?.is_bidding) {
                      nav(rm ? `/rm-opportunities/${newIdEnc}` : `/opportunities/${newIdEnc}`);
                    } else {
                      nav(rm ? `/rm-projects/${newIdEnc}` : `/projects/${newIdEnc}`);
                    }
                  } catch (_e) {
                    toast.error(
                      proj?.is_bidding
                        ? 'Failed to duplicate opportunity'
                        : isLeakInvestigation
                          ? 'Failed to duplicate project'
                          : 'Failed to duplicate project',
                    );
                  }
                }}
              >
                {proj?.is_bidding
                  ? 'Duplicate Opportunity'
                  : isLeakInvestigation
                    ? 'Duplicate Project'
                    : 'Duplicate Project'}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => setShowAuditLogModal(true)}
              >
                Audit Log
              </AppButton>
            </div>
          </AppCard>
        ) : (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-900 mb-3">Danger Zone</h3>
          <div className="flex flex-wrap gap-3">
            <button onClick={async()=>{
              const result = await confirm({ 
                    title: proj?.is_bidding ? 'Delete Opportunity' : 'Delete Project',
                message: `Are you sure you want to delete "${proj?.name||(proj?.is_bidding ? 'this opportunity' : 'this project')}"? This action cannot be undone.${proj?.is_bidding ? '' : ' All related data (updates, notes, timesheets) will also be deleted.'}`,
                confirmText: 'Delete',
                cancelText: 'Cancel'
              });
              if (result !== 'confirm') return;
              try{
                await api('DELETE', `/projects/${encodeURIComponent(String(id||''))}`);
                toast.success(
                      proj?.is_bidding ? 'Opportunity deleted' : 'Project deleted'
                );
                // Remove list caches so sidebar navigation shows fresh data immediately
                queryClient.removeQueries({ queryKey: ['opportunities'] });
                queryClient.removeQueries({ queryKey: ['projects'] });
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ['clientOpportunities'] }),
                  queryClient.invalidateQueries({ queryKey: ['clientProjects'] }),
                  queryClient.invalidateQueries({ queryKey: ['clientProjectParticipations'] }),
                ]);
                if(proj?.client_id){
                  nav(`/customers/${encodeURIComponent(String(proj?.client_id))}`);
                } else {
                  const sp = salesListPaths(proj);
                  if (proj?.is_bidding) nav(sp.opportunities);
                  else if (isLeakInvestigation) nav(sp.projects);
                  else nav(sp.projects);
                }
              }catch(_e){
                toast.error(
                      proj?.is_bidding ? 'Failed to delete opportunity' : 'Failed to delete project'
                );
              }
            }} className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-medium">{proj?.is_bidding ? 'Delete Opportunity' : 'Delete Project'}</button>
            <button
              type="button"
              onClick={async () => {
                const entityLabel = proj?.is_bidding
                  ? 'Opportunity'
                  : isLeakInvestigation
                    ? 'Leak Investigation'
                    : 'Project';
                const result = await confirm({
                  title: `Duplicate ${entityLabel}`,
                  message: `This will create a full copy of "${proj?.name || 'this entity'}" with a new code. Proposals, files, folders, updates, reports and events will be cloned. Timesheet, dispatch and audit logs will not. Continue?`,
                  confirmText: 'Duplicate',
                  cancelText: 'Cancel',
                });
                if (result !== 'confirm') return;
                try {
                  const res = await api<{ id: string }>(
                    'POST',
                    `/projects/${encodeURIComponent(String(id || ''))}/duplicate`
                  );
                  toast.success(`${entityLabel} duplicated`);
                  queryClient.removeQueries({ queryKey: ['opportunities'] });
                  queryClient.removeQueries({ queryKey: ['projects'] });
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['clientOpportunities'] }),
                    queryClient.invalidateQueries({ queryKey: ['clientProjects'] }),
                    queryClient.invalidateQueries({ queryKey: ['clientProjectParticipations'] }),
                  ]);
                  const rm = proj?.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE;
                  const newIdEnc = encodeURIComponent(res.id);
                  if (isLeakInvestigation) {
                    nav(rm ? `/rm-projects/${newIdEnc}` : `/projects/${newIdEnc}`);
                  } else if (proj?.is_bidding) {
                    nav(rm ? `/rm-opportunities/${newIdEnc}` : `/opportunities/${newIdEnc}`);
                  } else {
                    nav(rm ? `/rm-projects/${newIdEnc}` : `/projects/${newIdEnc}`);
                  }
                } catch (_e) {
                  toast.error(
                    proj?.is_bidding
                      ? 'Failed to duplicate opportunity'
                      : isLeakInvestigation
                        ? 'Failed to duplicate project'
                        : 'Failed to duplicate project'
                  );
                }
              }}
              className="px-4 py-2 rounded border border-red-300 bg-white hover:bg-red-50 text-red-700 text-sm font-medium"
            >
              {proj?.is_bidding
                ? 'Duplicate Opportunity'
                : isLeakInvestigation
                  ? 'Duplicate Project'
                  : 'Duplicate Project'}
            </button>
            <button 
              onClick={() => setShowAuditLogModal(true)}
              className="px-4 py-2 rounded border border-red-300 bg-white hover:bg-red-50 text-red-700 text-sm font-medium"
            >
              Audit Log
            </button>
          </div>
        </div>
        )
      )}

      {/* Tab Content */}
      {isLoading? <div className="h-24 bg-gray-100 animate-pulse rounded"/> : (
        <>
          {tab ? (
            // Show tab content
            <>
              {tab==='overview' && (
                <div className="space-y-4">
                  {/* Main Overview Section Card */}
                  <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <h2 className="text-sm font-semibold text-gray-900">Overview</h2>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    <ProjectGeneralInfoCard projectId={String(id)} proj={proj||{}} files={files||[]} hasEditPermission={hasEditPermission} />
                    <ProjectQuickEdit projectId={String(id)} proj={proj||{}} settings={settings||{}} />
                    <ProjectContactCard projectId={String(id)} proj={proj||{}} clientId={proj?.client_id ? String(proj.client_id) : undefined} clientFiles={clientFiles||[]} />
                    <div className="rounded-xl border bg-white p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Estimated Time of Completion</h4>
                      <ProjectEtaEdit projectId={String(id)} proj={proj||{}} settings={settings||{}} />
                    </div>
                    {!isOpportunityStyleTabs && (
                      <div className="md:col-span-3 rounded-xl border bg-white p-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">Workload</h4>
                        <CalendarMock title="Project Calendar" projectId={String(id)} hasEditPermission={hasEditPermission} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab==='reports' && (
                <ReportsTabEnhanced
                  projectId={String(id)}
                  businessLine={proj?.business_line}
                  isBidding={!!proj?.is_bidding}
                  items={reports||[]}
                  designSystem={useDesignSystem}
                  onRefresh={async () => { await refetchReports(); invalidateRecentActivity(); }}
                />
              )}

              {tab==='dispatch' && (
                <DispatchTab
                  projectId={String(id)}
                  statusLabel={proj?.status_label || ''}
                  businessLine={proj?.business_line}
                  designSystem={useDesignSystem}
                />
              )}

              {tab==='timesheet' && (
                <ProjectTimesheetTab
                  projectId={String(id)}
                  statusLabel={proj?.status_label || ''}
                  designSystem={useDesignSystem}
                />
              )}

              {tab==='files' && (
                <ProjectFilesTabEnhanced
                  projectId={String(id)}
                  businessLine={proj?.business_line}
                  files={files||[]}
                  onRefresh={async () => { await refetchFiles(); invalidateRecentActivity(); }}
                  designSystem={useDesignSystem}
                />
              )}

              {tab==='documents' && (
                <ProjectDocumentsTab
                  projectId={String(id)}
                  isBidding={isOpportunityStyleTabs}
                  canEditDocuments={hasProjectFeatureWritePermission(
                    permissions,
                    projectBusinessLine,
                    'documents',
                    isAdmin,
                    location.pathname
                  )}
                  designSystem={useDesignSystem}
                />
              )}

              {tab==='proposal' && (
                <ProjectProposalTab
                  projectId={String(id)}
                  clientId={String(proj?.client_id || '')}
                  siteId={String(proj?.site_id || '')}
                  proposals={proposals || []}
                  statusLabel={proj?.status_label || ''}
                  businessLine={proj?.business_line}
                  settings={settings || {}}
                  isBidding={isOpportunityStyleTabs}
                  onPricingItemsChange={setLivePricingItems}
                  showOnlyPricing={false}
                  proposalFormSaveRef={proposalFormSaveRef}
                  designSystem={useDesignSystem}
                />
              )}

              {tab==='pricing' && (
                <ProjectProposalTab
                  projectId={String(id)}
                  clientId={String(proj?.client_id || '')}
                  siteId={String(proj?.site_id || '')}
                  proposals={proposals || []}
                  statusLabel={proj?.status_label || ''}
                  businessLine={proj?.business_line}
                  settings={settings || {}}
                  isBidding={isOpportunityStyleTabs}
                  onPricingItemsChange={setLivePricingItems}
                  showOnlyPricing
                  proposalFormSaveRef={proposalFormSaveRef}
                  designSystem={useDesignSystem}
                />
              )}

              {tab==='estimate' && (
                <div className="rounded-xl border bg-white p-4">
                  <EstimateBuilder ref={estimateBuilderRef} projectId={String(id)} statusLabel={proj?.status_label||''} settings={settings||{}} isBidding={isOpportunityStyleTabs} canEdit={canEditEstimate} />
                </div>
              )}

              {tab==='orders' && (
                <OrdersTab projectId={String(id)} project={proj||{id: String(id)}} statusLabel={proj?.status_label||''} />
              )}

              {tab==='safety' && !isOpportunityStyleTabs && (
                <ProjectSafetyTab
                  projectId={String(id)}
                  proj={{
                    name: proj?.name,
                    address: proj?.address,
                    address_city: proj?.address_city,
                    address_province: proj?.address_province,
                  }}
                  canRead={
                    signOnlySafetySession ||
                    hasProjectFeatureReadPermission(
                      permissions,
                      projectBusinessLine,
                      'safety',
                      isAdmin,
                      location.pathname
                    )
                  }
                  canWrite={
                    !signOnlySafetySession &&
                    hasProjectFeatureWritePermission(
                      permissions,
                      projectBusinessLine,
                      'safety',
                      isAdmin,
                      location.pathname
                    )
                  }
                  initialSafetyInspectionId={safetyInspectionFromUrl}
                  flushSaveRef={safetyTabSaveRef}
                  signOnlySession={signOnlySafetySession}
                />
              )}
            </>
          ) : null}
        </>
      )}

      {showOnSiteLeadsModal && !isOpportunityStyleTabs && (
        <OnSiteLeadsModal
          projectId={String(id||'')}
          originalDivisions={Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : []}
          divisionLeads={proj?.division_onsite_leads || {}}
          settings={settings||{}}
          projectDivisions={projectDivisions||[]}
          employees={employees||[]}
          canEdit={hasEditPermission}
          onClose={() => setShowOnSiteLeadsModal(false)}
          onUpdate={async (updatedLeads, updatedDivisions) => {
            try {
              await api('PATCH', `/projects/${encodeURIComponent(String(id||''))}`, { 
                division_onsite_leads: updatedLeads
                // Note: updatedDivisions is not used anymore since divisions come from project_division_ids
              });
              await queryClient.invalidateQueries({ queryKey: ['project', id] });
              invalidateRecentActivity();
              toast.success('On-site leads updated');
            } catch (e: any) {
              toast.error('Failed to update on-site leads');
            }
          }}
        />
      )}

      {pickerOpen && (
        <ImagePicker isOpen={true} onClose={()=>setPickerOpen(false)} clientId={String(proj?.client_id||'')} targetWidth={800} targetHeight={800} allowEdit={true} fileObjectId={heroCoverFileObjectId} onConfirm={async(blob)=>{
          try{
            const up:any = await api('POST','/files/upload',{ project_id:id, client_id:proj?.client_id||null, employee_id:null, category_id:'project-cover-derived', original_name:'project-cover.jpg', content_type:'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            await api('POST', `/projects/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`);
            toast.success('Cover updated');
            await refetchFiles();
            invalidateRecentActivity();
            setPickerOpen(false);
          }catch(e){ toast.error('Failed to update cover'); setPickerOpen(false); }
        }} />
      )}

      {/* Audit Log Modal */}
      {showAuditLogModal &&
        (useDesignSystem ? (
          <AppModal
            open
            onClose={() => setShowAuditLogModal(false)}
            title="Audit Log"
            size="lg"
            dialogClassName="!max-w-6xl"
            bodyClassName="flex min-h-0 flex-1 flex-col p-0"
            bodyFill
          >
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className={uiCx('w-48 shrink-0 border-r p-4', uiColors.surfaceSubtle)}>
                <div className="space-y-1">
                  {(['general', 'timesheet', 'reports', 'workload', 'files', 'proposal', 'pricing'] as const).map(
                    (section) => (
                      <AppButton
                        key={section}
                        type="button"
                        variant={auditLogSection === section ? 'secondary' : 'ghost'}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => setAuditLogSection(section as typeof auditLogSection)}
                      >
                        {section === 'general'
                          ? 'General'
                          : section === 'reports'
                            ? 'Notes/History'
                            : section[0].toUpperCase() + section.slice(1)}
                      </AppButton>
                    ),
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {auditLogSection === 'general' && <GeneralAuditSection projectId={String(id)} />}
                {auditLogSection === 'timesheet' && <TimesheetAuditSection projectId={String(id)} />}
                {auditLogSection === 'reports' && <ReportsAuditSection projectId={String(id)} />}
                {auditLogSection === 'workload' && <WorkloadAuditSection projectId={String(id)} />}
                {auditLogSection === 'files' && <FilesAuditSection projectId={String(id)} />}
                {auditLogSection === 'proposal' && <ProposalAuditSection projectId={String(id)} />}
                {auditLogSection === 'pricing' && <PricingAuditSection projectId={String(id)} />}
              </div>
            </div>
          </AppModal>
        ) : (
          <OverlayPortal>
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Audit Log</h2>
                  <button
                    onClick={() => setShowAuditLogModal(false)}
                    className="text-2xl font-bold text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                <div className="flex-1 overflow-hidden flex">
                  <div className="w-48 border-r bg-gray-50 p-4">
                    <div className="space-y-2">
                      {(['general', 'timesheet', 'reports', 'workload', 'files', 'proposal', 'pricing'] as const).map(
                        (section) => (
                          <button
                            key={section}
                            onClick={() => setAuditLogSection(section as typeof auditLogSection)}
                            className={`w-full text-left px-3 py-2 rounded text-sm ${
                              auditLogSection === section
                                ? 'bg-blue-100 text-blue-800 font-medium'
                                : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {section === 'general'
                              ? 'General'
                              : section === 'reports'
                                ? 'Notes/History'
                                : section[0].toUpperCase() + section.slice(1)}
                          </button>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                    {auditLogSection === 'general' && <GeneralAuditSection projectId={String(id)} />}
                    {auditLogSection === 'timesheet' && <TimesheetAuditSection projectId={String(id)} />}
                    {auditLogSection === 'reports' && <ReportsAuditSection projectId={String(id)} />}
                    {auditLogSection === 'workload' && <WorkloadAuditSection projectId={String(id)} />}
                    {auditLogSection === 'files' && <FilesAuditSection projectId={String(id)} />}
                    {auditLogSection === 'proposal' && <ProposalAuditSection projectId={String(id)} />}
                    {auditLogSection === 'pricing' && <PricingAuditSection projectId={String(id)} />}
                  </div>
                </div>
              </div>
            </div>
          </OverlayPortal>
        ))}

      {/* Edit Status Modal */}
      {editStatusModal && (
        <EditStatusModal
          projectId={String(id)}
          currentStatus={proj?.status_id || ''}
          currentStatusLabel={statusLabel}
          settings={settings}
          isBidding={isOpportunityStyleTabs}
          designSystem={useDesignSystem}
          onClose={() => setEditStatusModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditStatusModal(false);
          }}
        />
      )}

      {/* Edit Progress Modal */}
      {editProgressModal && (
        <EditProgressModal
          projectId={String(id)}
          currentProgress={Number(proj?.progress || 0)}
          designSystem={useDesignSystem}
          onClose={() => setEditProgressModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditProgressModal(false);
          }}
        />
      )}

      {/* Edit Project Name Modal */}
      {editProjectNameModal && (
        <EditProjectNameModal
          projectId={String(id)}
          currentName={proj?.name || ''}
          designSystem={useDesignSystem}
          onClose={() => setEditProjectNameModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditProjectNameModal(false);
          }}
        />
      )}

      {/* Edit Description Modal */}
      {editDescriptionModal && (
        <EditDescriptionModal
          projectId={String(id)}
          currentDescription={proj?.description || ''}
          entityLabel={
            proj?.is_bidding
              ? 'opportunity'
              : isLeakInvestigation
                ? 'leak investigation'
                : 'project'
          }
          designSystem={useDesignSystem}
          onClose={() => setEditDescriptionModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditDescriptionModal(false);
          }}
        />
      )}

      {/* Edit Site Modal */}
      {editSiteModal && (
        <EditSiteModal
          projectId={String(id)}
          project={proj}
          designSystem={useDesignSystem}
          onClose={() => setEditSiteModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: projectQueryKey });
            invalidateRecentActivity();
            setEditSiteModal(false);
          }}
          onSiteRecordUpdated={async () => {
            await queryClient.invalidateQueries({ queryKey: projectQueryKey });
            invalidateRecentActivity();
          }}
        />
      )}

      {/* Edit Estimator Modal */}
      {editEstimatorModal && (
        <EditEstimatorModal
          projectId={String(id)}
          currentEstimatorIds={proj?.estimator_ids || (proj?.estimator_id ? [proj.estimator_id] : [])}
          employees={employees||[]}
          designSystem={useDesignSystem}
          onClose={() => setEditEstimatorModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditEstimatorModal(false);
          }}
        />
      )}

      {/* Edit Project Admin Modal */}
      {editProjectAdminModal && (
        <EditProjectAdminModal
          projectId={String(id)}
          currentAdminId={proj?.project_admin_id || ''}
          employees={employees||[]}
          designSystem={useDesignSystem}
          onClose={() => setEditProjectAdminModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditProjectAdminModal(false);
          }}
        />
      )}

      {/* Edit Start Date Modal */}
      {editStartDateModal && (
        <EditStartDateModal
          projectId={String(id)}
          currentStartDate={proj?.date_start ? proj.date_start.slice(0,10) : ''}
          designSystem={useDesignSystem}
          onClose={() => setEditStartDateModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditStartDateModal(false);
          }}
        />
      )}

      {editAwardedDateModal && (
        <EditAwardedDateModal
          projectId={String(id)}
          currentAwardedDate={proj?.date_awarded ? proj.date_awarded.slice(0, 10) : ''}
          designSystem={useDesignSystem}
          onClose={() => setEditAwardedDateModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditAwardedDateModal(false);
          }}
        />
      )}

      {/* Edit End Date Modal */}
      {editEtaModal && (
        <EditEtaModal
          projectId={String(id)}
          currentEta={proj?.date_eta ? proj.date_eta.slice(0,10) : ''}
          designSystem={useDesignSystem}
          onClose={() => setEditEtaModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditEtaModal(false);
          }}
        />
      )}

      {/* Edit Lead Source Modal */}
      {editLeadSourceModal && (
        <EditLeadSourceModal
          projectId={String(id)}
          currentLeadSource={proj?.lead_source || ''}
          designSystem={useDesignSystem}
          onClose={() => setEditLeadSourceModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditLeadSourceModal(false);
          }}
        />
      )}

      {editRelatedCustomersModal && proj && (
        <EditRelatedCustomersModal
          projectId={String(id)}
          excludeClientId={proj.client_id || ''}
          currentRelatedIds={proj.related_client_ids ?? []}
          currentDisplayNames={proj.related_client_display_names ?? []}
          isBidding={!!proj.is_bidding}
          opportunityStyleCustomers={isOpportunityStyleTabs}
          designSystem={useDesignSystem}
          currentAwardedIdsFromServer={Array.from(projectAwardedRelatedIdsSet(proj))}
          onClose={() => setEditRelatedCustomersModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            invalidateRecentActivity();
            setEditRelatedCustomersModal(false);
          }}
        />
      )}

      {showConvertModal && proj?.is_bidding && (
        <ConvertToProjectModal
          projectId={String(id)}
          proj={proj}
          employees={employees || []}
          projectDivisions={projectDivisionsForPicker || []}
          settings={settings || {}}
          designSystem={useDesignSystem}
          onClose={() => setShowConvertModal(false)}
          onSuccess={async () => {
            queryClient.removeQueries({ queryKey: ['opportunities'] });
            queryClient.removeQueries({ queryKey: ['projects'] });
            queryClient.removeQueries({ queryKey: ['proposal'] });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['project', id] }),
              queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', id] }),
              queryClient.invalidateQueries({ queryKey: ['clientProjects'] }),
              queryClient.invalidateQueries({ queryKey: ['clientOpportunities'] }),
              queryClient.invalidateQueries({ queryKey: ['clientProjectParticipations'] }),
              queryClient.invalidateQueries({ queryKey: ['projectProposals', id] }),
            ]);
            toast.success('Opportunity converted to project');
            nav(`${salesListPaths(proj).projects}/${encodeURIComponent(String(id || ''))}`, { replace: true });
          }}
        />
      )}
    </PageShell>
  );
}

function EditStartDateModal({ projectId, currentStartDate, designSystem, onClose, onSave }: {
  projectId: string;
  currentStartDate: string;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [startDate, setStartDate] = useState(currentStartDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStartDate(currentStartDate);
  }, [currentStartDate]);

  const handleSave = async () => {
    if (startDate === currentStartDate) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        date_start: startDate || null
      });
      toast.success('Start date updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update start date');
    } finally {
      setSaving(false);
    }
  };

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Start Date"
        description="When work begins or is scheduled to begin"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppDatePicker label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Start Date</h2>
              <p className="text-xs text-gray-500 mt-0.5">When work begins or is scheduled to begin</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              />
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

function EditAwardedDateModal({ projectId, currentAwardedDate, designSystem, onClose, onSave }: {
  projectId: string;
  currentAwardedDate: string;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [awardedDate, setAwardedDate] = useState(currentAwardedDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAwardedDate(currentAwardedDate);
  }, [currentAwardedDate]);

  const handleSave = async () => {
    if (awardedDate === currentAwardedDate) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        date_awarded: awardedDate || null
      });
      toast.success('Awarded date updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update awarded date');
    } finally {
      setSaving(false);
    }
  };

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Awarded Date"
        description="Date the opportunity was awarded / converted to a project"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppDatePicker label="Awarded date" value={awardedDate} onChange={(e) => setAwardedDate(e.target.value)} />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Awarded Date</h2>
              <p className="text-xs text-gray-500 mt-0.5">Date the opportunity was awarded / converted to a project</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Awarded date</label>
              <input
                type="date"
                value={awardedDate}
                onChange={(e) => setAwardedDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              />
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

function EditEtaModal({ projectId, currentEta, designSystem, onClose, onSave }: {
  projectId: string;
  currentEta: string;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [eta, setEta] = useState(currentEta);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEta(currentEta);
  }, [currentEta]);

  const handleSave = async () => {
    if (eta === currentEta) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        date_eta: eta || null
      });
      toast.success('End date updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update end date');
    } finally {
      setSaving(false);
    }
  };

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit End Date"
        description="Target completion date"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppDatePicker label="End date" value={eta} onChange={(e) => setEta(e.target.value)} />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit End Date</h2>
              <p className="text-xs text-gray-500 mt-0.5">Target completion date</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">End date</label>
              <input
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              />
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

type ClientMini = { id: string; display_name?: string; name?: string; city?: string; province?: string; address_line1?: string };

function buildInitialAwardedIdsSet(awardedFromServer: string[]): Set<string> {
  return new Set(awardedFromServer.map(String));
}

function EditRelatedCustomersModal({
  projectId,
  excludeClientId,
  currentRelatedIds,
  currentDisplayNames,
  isBidding,
  opportunityStyleCustomers,
  designSystem,
  currentAwardedIdsFromServer,
  onClose,
  onSave,
}: {
  projectId: string;
  excludeClientId: string;
  currentRelatedIds: string[];
  currentDisplayNames: string[];
  isBidding: boolean;
  opportunityStyleCustomers?: boolean;
  designSystem?: boolean;
  currentAwardedIdsFromServer: string[];
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [displayedCount, setDisplayedCount] = useState(20);
  const [anchorOrder] = useState(() => currentRelatedIds.map(String));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(currentRelatedIds.map(String)));
  const [awardedIds, setAwardedIds] = useState<Set<string>>(() =>
    isBidding
      ? new Set()
      : buildInitialAwardedIdsSet(currentAwardedIdsFromServer.map(String))
  );
  const [saving, setSaving] = useState(false);

  const { data: allClients = [] } = useQuery<ClientMini[]>({
    queryKey: ['clients-all-edit-related', q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q);
      const result = await api<any>('GET', `/clients?${params.toString()}`);
      if (Array.isArray(result)) return result as ClientMini[];
      if (result?.items) return result.items as ClientMini[];
      if (result?.data) return result.data as ClientMini[];
      return [];
    },
    staleTime: 30_000,
  });

  const orderedSelectedIds = useMemo(() => {
    const head = anchorOrder.filter((id) => selectedIds.has(id));
    const tail = [...selectedIds]
      .filter((id) => !anchorOrder.includes(id))
      .sort((a, b) => a.localeCompare(b));
    return [...head, ...tail];
  }, [selectedIds, anchorOrder]);

  const nameForId = useCallback(
    (cid: string) => {
      const idx = currentRelatedIds.findIndex((id) => String(id) === String(cid));
      if (idx >= 0) {
        const n = currentDisplayNames[idx];
        if (n != null && String(n).trim() !== '') return String(n);
      }
      const c = allClients.find((x) => String(x.id) === String(cid));
      if (c) return String(c.display_name || c.name || c.id);
      return cid;
    },
    [currentRelatedIds, currentDisplayNames, allClients]
  );

  const filteredClients = useMemo(() => {
    const sorted = sortByLabel(allClients, (c) => (c.display_name || c.name || c.id || '').toString());
    let base = sorted.filter((c) => c.id !== excludeClientId);
    if (!isBidding) {
      base = base.filter((c) => !selectedIds.has(String(c.id)));
    }
    return base;
  }, [allClients, excludeClientId, isBidding, selectedIds]);

  const list = filteredClients.slice(0, displayedCount);
  const hasMore = filteredClients.length > displayedCount;

  const toggleClientOpportunity = (c: ClientMini) => {
    const id = String(c.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addClientFromSearchProject = (c: ClientMini) => {
    const id = String(c.id);
    setSelectedIds((prev) => new Set(prev).add(id));
    setAwardedIds((prev) => new Set(prev).add(id));
  };

  const setAwardedForRow = (cid: string) => {
    setAwardedIds((prev) => new Set(prev).add(String(cid)));
  };

  const setNotAwardedForRow = (cid: string) => {
    setAwardedIds((prev) => {
      const next = new Set(prev);
      next.delete(String(cid));
      return next;
    });
  };

  const requestRemoveFromRelated = async (cid: string) => {
    const label = nameForId(cid);
    const res = await confirm({
      message: `Remove "${label}" from related customers?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (res !== 'confirm') return;
    const id = String(cid);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setAwardedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const related = orderedSelectedIds;
      if (isBidding) {
        await api('PATCH', `/projects/${projectId}`, {
          related_client_ids: related.length ? related : null,
        });
      } else {
        const awarded = related.filter((id) => awardedIds.has(id));
        await api('PATCH', `/projects/${projectId}`, {
          related_client_ids: related.length ? related : null,
          awarded_related_client_ids: awarded.length ? awarded : null,
        });
      }
      toast.success('Related customers updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update related customers');
    } finally {
      setSaving(false);
    }
  };

  const checkboxCustomerUi = isBidding || !!opportunityStyleCustomers;

  if (designSystem && checkboxCustomerUi) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Related Customers"
        description={
          isBidding
            ? 'Link additional customers to this opportunity'
            : 'Link additional customers to this leak investigation'
        }
        formWidth="comfortable"
        quickInfo={opportunityEditRelatedCustomersQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : `Save (${selectedIds.size} selected)`}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          {orderedSelectedIds.length > 0 && (
            <div className="space-y-2">
              <p className={uiTypography.overline}>Selected ({selectedIds.size})</p>
              <div className={uiCx(uiBorders.subtle, uiRadius.control, 'divide-y max-h-40 overflow-y-auto')}>
                {orderedSelectedIds.map((rid) => (
                  <div key={rid} className={uiCx('flex items-center justify-between gap-2 px-3 py-2', uiColors.surface)}>
                    <span className={uiCx(uiTypography.body, 'truncate')}>{nameForId(rid)}</span>
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleClientOpportunity({ id: rid } as ClientMini)}
                    >
                      Remove
                    </AppButton>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AppInput
            label="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type customer name, city, or address…"
            autoFocus
            fieldHint="Search\n\nFind customers to add or remove from the related list. The project owner is not listed here."
          />

          {list.length > 0 ? (
            <div className={uiCx(uiBorders.subtle, uiRadius.control, 'max-h-80 overflow-y-auto divide-y')}>
              {list.map((c) => {
                const cid = String(c.id);
                const subtitle = [c.address_line1, c.city, c.province].filter(Boolean).join(', ') || 'No address';
                return (
                  <div key={cid} className={uiCx('px-3 py-2', uiColors.surface)}>
                    <AppCheckbox
                      label={
                        <span>
                          <span className="block font-medium text-gray-900">{c.display_name || c.name || c.id}</span>
                          <span className="block text-xs text-gray-500">{subtitle}</span>
                        </span>
                      }
                      checked={selectedIds.has(cid)}
                      onChange={() => {
                        toggleClientOpportunity(c);
                      }}
                    />
                  </div>
                );
              })}
              {hasMore && (
                <div className={uiCx('border-t px-3 py-2', uiColors.surface)}>
                  <AppButton type="button" variant="ghost" size="sm" className="w-full" onClick={() => setDisplayedCount((prev) => prev + 20)}>
                    Load more ({filteredClients.length - displayedCount} remaining)
                  </AppButton>
                </div>
              )}
            </div>
          ) : q.trim() ? (
            <p className={uiTypography.helper}>No customers found matching &quot;{q}&quot;.</p>
          ) : (
            <p className={uiTypography.helper}>No customers available.</p>
          )}
        </div>
      </AppFormModal>
    );
  }

  if (designSystem && !isBidding) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Related Customers"
        description="Use green for Awarded (Bid Winner) and red for Not Awarded."
        formWidth="comfortable"
        quickInfo={opportunityEditRelatedCustomersQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : `Save (${selectedIds.size} selected)`}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          {orderedSelectedIds.length > 0 && (
            <div className="space-y-2">
              <p className={uiTypography.overline}>Related customers on this project</p>
              <div className={uiCx(uiBorders.subtle, uiRadius.control, 'max-h-56 divide-y overflow-y-auto')}>
                {orderedSelectedIds.map((rid) => {
                  const isAwarded = awardedIds.has(rid);
                  return (
                    <div
                      key={rid}
                      className={uiCx('flex items-center gap-3 px-3 py-2', uiColors.surface, 'hover:bg-gray-50')}
                    >
                      <span className={uiCx(uiTypography.body, 'min-w-0 flex-1 truncate font-medium')}>
                        {nameForId(rid)}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <AppButton
                          type="button"
                          variant={isAwarded ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setAwardedForRow(rid)}
                          title="Awarded"
                        >
                          ✓
                        </AppButton>
                        <AppButton
                          type="button"
                          variant={!isAwarded ? 'danger' : 'ghost'}
                          size="sm"
                          onClick={() => setNotAwardedForRow(rid)}
                          title="Not awarded"
                        >
                          ✕
                        </AppButton>
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => requestRemoveFromRelated(rid)}
                          title="Remove"
                        >
                          Remove
                        </AppButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <AppInput
            label="Add customers (search)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type customer name, city, or address…"
            autoFocus
          />
          {list.length > 0 ? (
            <div className={uiCx(uiBorders.subtle, uiRadius.control, 'max-h-80 divide-y overflow-y-auto')}>
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addClientFromSearchProject(c)}
                  className={uiCx(
                    'w-full px-3 py-2.5 text-left text-sm transition-colors',
                    uiColors.surface,
                    'hover:bg-gray-50',
                  )}
                >
                  <div className="font-semibold text-gray-900">{c.display_name || c.name || c.id}</div>
                  <div className={uiTypography.helper}>
                    {[c.address_line1, c.city, c.province].filter(Boolean).join(', ') || 'No address'}
                  </div>
                </button>
              ))}
              {hasMore && (
                <div className={uiCx('border-t px-3 py-2', uiColors.surface)}>
                  <AppButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setDisplayedCount((prev) => prev + 20)}
                  >
                    Load more ({filteredClients.length - displayedCount} remaining)
                  </AppButton>
                </div>
              )}
            </div>
          ) : q.trim() ? (
            <p className={uiTypography.helper}>No customers found matching &quot;{q}&quot;.</p>
          ) : (
            <p className={uiTypography.helper}>Type to search and add customers.</p>
          )}
        </div>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Related Customers</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isBidding
                  ? 'Link additional customers to this opportunity'
                  : 'Use green for Awarded (Bid Winner) and red for Not Awarded.'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          {!isBidding && orderedSelectedIds.length > 0 && (
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-2">
                Related customers on this project
              </label>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {orderedSelectedIds.map((rid) => {
                  const isAwarded = awardedIds.has(rid);
                  return (
                    <div
                      key={rid}
                      className="flex items-center gap-3 px-3 py-2 bg-white hover:bg-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 truncate block">{nameForId(rid)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAwardedForRow(rid)}
                          title="Awarded"
                          className={`flex items-center justify-center w-7 h-7 rounded-lg border-2 transition-all ${
                            isAwarded
                              ? 'bg-green-100 text-green-700 border-green-400 scale-105 shadow-md'
                              : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotAwardedForRow(rid)}
                          title="Not awarded"
                          className={`flex items-center justify-center w-7 h-7 rounded-lg border-2 transition-all ${
                            !isAwarded
                              ? 'bg-red-100 text-red-700 border-red-400 scale-105 shadow-md'
                              : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => requestRemoveFromRelated(rid)}
                          title="Remove from related customers"
                          className="flex items-center justify-center w-7 h-7 rounded-lg border-2 border-gray-200 bg-white text-gray-500 transition-all hover:border-gray-400 hover:text-gray-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
              {isBidding ? 'Search' : 'Add customers (search)'}
            </label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              placeholder="Type customer name, city, or address..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          {list.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => (isBidding ? toggleClientOpportunity(c) : addClientFromSearchProject(c))}
                  className="w-full text-left px-3 py-2.5 transition-colors text-sm flex items-center gap-2 bg-white hover:bg-gray-50"
                >
                  <span className="flex-shrink-0 w-4 h-4 border rounded flex items-center justify-center border-gray-300">
                    {isBidding && selectedIds.has(String(c.id)) && (
                      <svg className="w-3 h-3 text-brand-red" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {!isBidding && (
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    )}
                  </span>
                  <div>
                    <div className="font-semibold text-gray-900">{c.display_name || c.name || c.id}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {[c.address_line1, c.city, c.province].filter(Boolean).join(', ') || 'No address'}
                    </div>
                  </div>
                </button>
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setDisplayedCount((prev) => prev + 20)}
                  className="w-full text-center px-3 py-2 bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-600 border-t border-gray-100"
                >
                  Load more ({filteredClients.length - displayedCount} remaining)
                </button>
              )}
            </div>
          )}
          {q.trim() && list.length === 0 && (
            <div className="text-center py-6 text-sm text-gray-500">No customers found matching "{q}"</div>
          )}
          {!q.trim() && list.length === 0 && (
            <div className="text-center py-6 text-sm text-gray-500">
              {isBidding ? 'No customers available' : 'Type to search and add customers'}
            </div>
          )}
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : `Save (${selectedIds.size} selected)`}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

function EditLeadSourceModal({ projectId, currentLeadSource, designSystem, onClose, onSave }: {
  projectId: string;
  currentLeadSource: string;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const leadSources = (settings?.lead_sources || []) as any[];
  const [leadSource, setLeadSource] = useState(currentLeadSource);
  const [saving, setSaving] = useState(false);

  const leadSourceOptions = useMemo(() => {
    const opts = sortByLabel(leadSources, (ls: any) => (ls?.label ?? ls?.name ?? '').toString()).map((ls: any) => {
      const val = ls?.value ?? ls?.id ?? ls?.label ?? ls?.name ?? String(ls);
      const label = ls?.label ?? ls?.name ?? String(ls);
      return { value: String(val), label: String(label) };
    });
    return [{ value: '', label: 'Select…' }, ...opts];
  }, [leadSources]);

  useEffect(() => {
    setLeadSource(currentLeadSource);
  }, [currentLeadSource]);

  const handleSave = async () => {
    if (leadSource === currentLeadSource) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        lead_source: leadSource || null
      });
      toast.success('Lead source updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update lead source');
    } finally {
      setSaving(false);
    }
  };

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Lead Source"
        description="Set how this opportunity was sourced"
        formWidth="comfortable"
        quickInfo={opportunityEditLeadSourceQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppSelect
          label="Lead source"
          value={leadSource || ''}
          onChange={(e) => setLeadSource(e.target.value)}
          options={leadSourceOptions}
          placeholder="Select…"
          fieldHint="Lead source\n\nWhere this opportunity originated (referral, campaign, etc.). Options come from system settings."
        />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Lead Source</h2>
              <p className="text-xs text-gray-500 mt-0.5">Set how this opportunity was sourced</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Lead Source</label>
              <select
                value={leadSource || ''}
                onChange={(e) => setLeadSource(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              >
                <option value="">Select...</option>
                {sortByLabel(leadSources, (ls: any) => (ls?.label ?? ls?.name ?? '').toString()).map((ls: any) => {
                  const val = ls?.value ?? ls?.id ?? ls?.label ?? ls?.name ?? String(ls);
                  const label = ls?.label ?? ls?.name ?? String(ls);
                  return <option key={String(val)} value={String(val)}>{label}</option>;
                })}
              </select>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

function ConvertToProjectModal({
  projectId,
  proj,
  employees,
  projectDivisions,
  settings,
  designSystem,
  onClose,
  onSuccess,
}: {
  projectId: string;
  proj: any;
  employees: any[];
  projectDivisions: any[];
  settings: any;
  designSystem?: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [projectAdminId, setProjectAdminId] = useState<string>(proj?.project_admin_id ? String(proj.project_admin_id) : '');
  const [divisionLeads, setDivisionLeads] = useState<Record<string, string>>(proj?.division_onsite_leads || {});
  const [dateEta, setDateEta] = useState<string>((proj?.date_eta || '').toString().slice(0, 10));
  const [dateStart, setDateStart] = useState<string>((proj?.date_start || '').toString().slice(0, 10));
  const [leadSource, setLeadSource] = useState<string>(proj?.lead_source || '');
  const [pricingApprovals, setPricingApprovals] = useState<boolean[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const relatedAwardOptions = useMemo(() => {
    const ids = proj?.related_client_ids;
    const names = proj?.related_client_display_names;
    if (!Array.isArray(ids)) return [] as { id: string; label: string }[];
    return ids
      .map((id: string, i: number) => ({
        id: String(id),
        label: (names?.[i] as string | undefined) || String(id),
      }))
      .filter((x) => x.id && x.id !== 'undefined');
  }, [proj?.related_client_ids, proj?.related_client_display_names]);

  const [awardedRelatedApprovals, setAwardedRelatedApprovals] = useState<boolean[]>([]);

  const relatedAwardIdsKey = useMemo(
    () => relatedAwardOptions.map((o) => o.id).join('|'),
    [relatedAwardOptions]
  );

  // All related start as not awarded (red) before paint to avoid a flash of stale state on reopen.
  useLayoutEffect(() => {
    const n = relatedAwardOptions.length;
    if (n === 0) {
      setAwardedRelatedApprovals([]);
      return;
    }
    setAwardedRelatedApprovals(Array.from({ length: n }, () => false));
  }, [projectId, relatedAwardIdsKey, relatedAwardOptions.length]);

  const divisionIds = Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : [];
  const { data: proposals } = useQuery({
    queryKey: ['projectProposals', projectId],
    queryFn: () => api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(projectId)}`),
    enabled: !!projectId,
  });
  const originalProposal = useMemo(() => proposals?.find(p => !p.is_change_order) || null, [proposals]);
  const { data: proposalData } = useQuery({
    queryKey: ['proposal', originalProposal?.id],
    queryFn: () => originalProposal?.id ? api<any>('GET', `/proposals/${originalProposal.id}`) : Promise.resolve(null),
    enabled: !!originalProposal?.id,
  });
  const additionalCosts = useMemo(() => {
    const d = proposalData?.data || proposalData || {};
    const ac = d.additional_costs;
    return Array.isArray(ac) ? ac : [];
  }, [proposalData]);

  useEffect(() => {
    if (additionalCosts.length > 0 && pricingApprovals.length !== additionalCosts.length) {
      setPricingApprovals(additionalCosts.map(() => true));
    }
  }, [additionalCosts.length]);

  const getDivisionLabel = useCallback((divId: string) => {
    if (!projectDivisions?.length) return divId;
    for (const d of projectDivisions) {
      if (String(d.id) === String(divId)) return d.label || divId;
      for (const sub of d.subdivisions || []) {
        if (String(sub.id) === String(divId)) return `${d.label} - ${sub.label}`;
      }
    }
    return divId;
  }, [projectDivisions]);

  const getDivisionMainLabel = useCallback((divId: string) => {
    if (!projectDivisions?.length) return divId;
    for (const d of projectDivisions) {
      if (String(d.id) === String(divId)) return d.label || divId;
      for (const sub of d.subdivisions || []) {
        if (String(sub.id) === String(divId)) return d.label || divId;
      }
    }
    return divId;
  }, [projectDivisions]);

  const updateSearchQuery = useCallback((key: string, query: string) => {
    setSearchQueries(prev => ({ ...prev, [key]: query }));
  }, []);

  const computeDropdownPosition = useCallback((key: string) => {
    const el = triggerRefs.current[key];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const PADDING = 8;
    const DESIRED_MAX = 280;
    const MIN_HEIGHT = 160;
    const spaceBelow = window.innerHeight - rect.bottom - PADDING;
    const spaceAbove = rect.top - PADDING;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(DESIRED_MAX, Math.max(MIN_HEIGHT, available));
    const width = rect.width;
    const maxLeft = window.innerWidth - width - PADDING;
    const left = Math.max(PADDING, Math.min(rect.left, maxLeft));
    if (openUp) {
      setDropdownPosition({ bottom: window.innerHeight - rect.top + PADDING, left, width, maxHeight });
    } else {
      setDropdownPosition({ top: rect.bottom + PADDING, left, width, maxHeight });
    }
  }, []);

  const toggleDropdown = useCallback((key: string) => {
    if (openDropdownId === key) {
      setOpenDropdownId(null);
      return;
    }
    setOpenDropdownId(key);
    computeDropdownPosition(key);
  }, [openDropdownId, computeDropdownPosition]);

  const getFilteredEmployees = useCallback((key: string) => {
    const query = (searchQueries[key] || '').trim().toLowerCase();
    const list = !query ? (employees || []) : (employees || []).filter((emp: any) => {
      const name = getUserDisplayName(emp).toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const username = (emp.username || '').toLowerCase();
      return name.includes(query) || email.includes(query) || username.includes(query);
    });
    return [...list].sort((a: any, b: any) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
  }, [employees, searchQueries]);

  const leadSourcesList = (settings?.lead_sources || []) as any[];
  const getFilteredLeadSources = useCallback((key: string) => {
    const query = (searchQueries[key] || '').trim().toLowerCase();
    const list = !query ? leadSourcesList : leadSourcesList.filter((ls: any) => {
      const label = (ls.label ?? ls.value ?? String(ls)).toLowerCase();
      const val = (ls.value ?? ls.label ?? String(ls)).toLowerCase();
      return label.includes(query) || val.includes(query);
    });
    return sortByLabel(list, (ls: any) => (ls?.label ?? ls?.name ?? '').toString());
  }, [leadSourcesList, searchQueries]);

  useEffect(() => {
    if (!openDropdownId) {
      setDropdownPosition(null);
      return;
    }
    const update = () => computeDropdownPosition(openDropdownId);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [openDropdownId, computeDropdownPosition]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const body: any = {
        project_admin_id: projectAdminId || null,
        division_onsite_leads: divisionLeads,
        date_eta: dateEta || null,
        date_start: dateStart || null,
        lead_source: leadSource || null,
        pricing_item_approvals: additionalCosts.length > 0 ? pricingApprovals.slice(0, additionalCosts.length) : [],
      };
      if (relatedAwardOptions.length > 0) {
        body.awarded_related_client_ids = relatedAwardOptions
          .map((o, i) => (i < awardedRelatedApprovals.length && awardedRelatedApprovals[i] ? o.id : null))
          .filter((id): id is string => Boolean(id));
      }
      await api('POST', `/projects/${encodeURIComponent(projectId)}/convert-to-project`, body);
      await onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e?.message || 'Failed to convert opportunity');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleApproval = (index: number) => {
    setPricingApprovals(prev => {
      const next = [...prev];
      if (index < next.length) next[index] = !next[index];
      return next;
    });
  };

  const closeDropdown = useCallback(() => setOpenDropdownId(null), []);

  const handleAwardedRelatedChange = useCallback((index: number, awarded: boolean) => {
    setAwardedRelatedApprovals((prev) => {
      const next = [...prev];
      if (index < next.length) next[index] = awarded;
      return next;
    });
  }, []);

  const handlePricingApprovalChange = useCallback((index: number, approved: boolean) => {
    setPricingApprovals((prev) => {
      const next = [...prev];
      if (index < next.length) next[index] = approved;
      return next;
    });
  }, []);

  const handleDivisionLeadChange = useCallback((divId: string, userId: string) => {
    setDivisionLeads((prev) => ({ ...prev, [divId]: userId }));
  }, []);

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Convert to Project"
        description="General information and pricing approvals"
        formWidth="wide"
        quickInfo={opportunityConvertToProjectQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between gap-3')}>
            <span className={uiTypography.helper}>Convert opportunity to active project</span>
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={handleSubmit} disabled={submitting} loading={submitting}>
                {submitting ? 'Converting…' : 'Convert'}
              </AppButton>
            </div>
          </div>
        }
      >
        <ProjectConvertToProjectModalDsForm
          proj={proj}
          employees={employees}
          leadSourcesList={leadSourcesList}
          projectAdminId={projectAdminId}
          onProjectAdminIdChange={setProjectAdminId}
          leadSource={leadSource}
          onLeadSourceChange={setLeadSource}
          divisionIds={divisionIds}
          divisionLeads={divisionLeads}
          onDivisionLeadChange={handleDivisionLeadChange}
          dateStart={dateStart}
          onDateStartChange={setDateStart}
          dateEta={dateEta}
          onDateEtaChange={setDateEta}
          relatedAwardOptions={relatedAwardOptions}
          awardedRelatedApprovals={awardedRelatedApprovals}
          onAwardedRelatedChange={handleAwardedRelatedChange}
          additionalCosts={additionalCosts}
          pricingApprovals={pricingApprovals}
          onPricingApprovalChange={handlePricingApprovalChange}
          getDivisionLabel={getDivisionLabel}
          getDivisionMainLabel={getDivisionMainLabel}
        />
      </AppFormModal>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Title bar - same style as New Opportunity */}
        <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center" title="Close">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div>
                <div className="text-sm font-semibold text-gray-900">Convert to Project</div>
                <div className="text-xs text-gray-500 mt-0.5">General information and pricing approvals</div>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          <div className="rounded-xl border bg-white p-4 grid md:grid-cols-2 gap-4 items-start">
            <div className="md:col-span-2 flex items-start gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50">
              <span className="flex-shrink-0 text-amber-600" title="Aviso">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </span>
              <p className="text-sm text-amber-900">
                Converting &quot;{proj?.name || 'this opportunity'}&quot; to an active project will enable workload and timesheet functionality. <span className="font-medium"> Be careful, this action cannot be undone.</span>
              </p>
            </div>

            {relatedAwardOptions.length > 0 && (
              <div className="md:col-span-2">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                  Related customers – mark awarded (bid winner(s))
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Use green for awarded, red for not.
                </p>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {relatedAwardOptions.map(({ id: rid, label }, i) => {
                    const approved = i < awardedRelatedApprovals.length ? awardedRelatedApprovals[i] : false;
                    return (
                      <div key={rid} className="flex items-center gap-3 px-3 py-2 bg-white hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate">{label}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setAwardedRelatedApprovals((prev) => {
                                const n = [...prev];
                                if (i < n.length) n[i] = true;
                                return n;
                              })
                            }
                            title="Awarded"
                            className={`flex items-center justify-center w-7 h-7 rounded-lg border-2 transition-all ${
                              approved
                                ? 'bg-green-100 text-green-700 border-green-400 scale-105 shadow-md'
                                : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAwardedRelatedApprovals((prev) => {
                                const n = [...prev];
                                if (i < n.length) n[i] = false;
                                return n;
                              })
                            }
                            title="Not awarded"
                            className={`flex items-center justify-center w-7 h-7 rounded-lg border-2 transition-all ${
                              !approved
                                ? 'bg-red-100 text-red-700 border-red-400 scale-105 shadow-md'
                                : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3 min-w-0">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Project Admin</label>
              <div className="relative min-w-0">
                <div
                  ref={(el) => { triggerRefs.current['projectAdmin'] = el; }}
                  onClick={() => toggleDropdown('projectAdmin')}
                  className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer bg-white hover:bg-gray-50 min-w-0"
                >
                  {projectAdminId ? (() => {
                    const emp = (employees || []).find((e: any) => String(e.id) === String(projectAdminId));
                    return emp ? (
                      <>
                        <UserAvatar user={emp} size="w-6 h-6" showTooltip={false} />
                        <span className="flex-1 min-w-0 text-left truncate">{getUserDisplayName(emp)}</span>
                      </>
                    ) : (
                      <span className="flex-1 min-w-0 text-left text-gray-500">Select...</span>
                    );
                  })() : (
                    <span className="flex-1 min-w-0 text-left text-gray-500">Select...</span>
                  )}
                  <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${openDropdownId === 'projectAdmin' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                {openDropdownId === 'projectAdmin' && dropdownPosition && (
                  <OverlayPortal>
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={closeDropdown} />
                      <div
                        className="fixed z-[70] bg-white border rounded-lg shadow-xl overflow-hidden flex flex-col min-h-0"
                        style={{
                          ...(dropdownPosition.top !== undefined ? { top: `${dropdownPosition.top}px` } : {}),
                          ...(dropdownPosition.bottom !== undefined ? { bottom: `${dropdownPosition.bottom}px` } : {}),
                          left: `${dropdownPosition.left}px`,
                          width: `${dropdownPosition.width}px`,
                          maxHeight: `${dropdownPosition.maxHeight}px`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {dropdownPosition.bottom !== undefined ? (
                          <>
                            <div className="overflow-y-auto flex-1 min-h-0 p-2">
                              <div onClick={() => { setProjectAdminId(''); closeDropdown(); }} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-gray-50 rounded">
                                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">—</div>
                                <span className="text-sm">Clear</span>
                              </div>
                              {getFilteredEmployees('projectAdmin').map((emp: any) => (
                                <div key={emp.id} onClick={() => { setProjectAdminId(String(emp.id)); closeDropdown(); }} className={`flex items-center gap-3 p-2 cursor-pointer rounded ${projectAdminId === String(emp.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                  <UserAvatar user={emp} size="w-6 h-6" showTooltip={false} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{getUserDisplayName(emp)}</div>
                                    {emp.email && <div className="text-xs text-gray-600 truncate">{emp.email}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="p-2 border-t flex-shrink-0">
                              <input type="text" value={searchQueries['projectAdmin'] || ''} onChange={(e) => updateSearchQuery('projectAdmin', e.target.value)} placeholder="Search..." className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={(e) => e.stopPropagation()} autoFocus />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="p-2 border-b flex-shrink-0">
                              <input type="text" value={searchQueries['projectAdmin'] || ''} onChange={(e) => updateSearchQuery('projectAdmin', e.target.value)} placeholder="Search..." className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={(e) => e.stopPropagation()} autoFocus />
                            </div>
                            <div className="overflow-y-auto flex-1 min-h-0 p-2">
                              <div onClick={() => { setProjectAdminId(''); closeDropdown(); }} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-gray-50 rounded">
                                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">—</div>
                                <span className="text-sm">Clear</span>
                              </div>
                              {getFilteredEmployees('projectAdmin').map((emp: any) => (
                                <div key={emp.id} onClick={() => { setProjectAdminId(String(emp.id)); closeDropdown(); }} className={`flex items-center gap-3 p-2 cursor-pointer rounded ${projectAdminId === String(emp.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                  <UserAvatar user={emp} size="w-6 h-6" showTooltip={false} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{getUserDisplayName(emp)}</div>
                                    {emp.email && <div className="text-xs text-gray-600 truncate">{emp.email}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  </OverlayPortal>
                )}
              </div>
            </div>

            <div className="space-y-3 min-w-0">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Lead Source</label>
              <div className="relative min-w-0">
                <div
                  ref={(el) => { triggerRefs.current['leadSource'] = el; }}
                  onClick={() => toggleDropdown('leadSource')}
                  className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer bg-white hover:bg-gray-50 min-w-0"
                >
                  <span className="flex-1 min-w-0 text-left truncate">
                    {leadSource ? (leadSourcesList.find((ls: any) => (ls.value ?? ls.label ?? ls) === leadSource)?.label ?? leadSource) : <span className="text-gray-500">Select...</span>}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${openDropdownId === 'leadSource' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                {openDropdownId === 'leadSource' && dropdownPosition && (
                  <OverlayPortal>
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={closeDropdown} />
                      <div
                        className="fixed z-[70] bg-white border rounded-lg shadow-xl overflow-hidden flex flex-col min-h-0"
                        style={{
                          ...(dropdownPosition.top !== undefined ? { top: `${dropdownPosition.top}px` } : {}),
                          ...(dropdownPosition.bottom !== undefined ? { bottom: `${dropdownPosition.bottom}px` } : {}),
                          left: `${dropdownPosition.left}px`,
                          width: `${dropdownPosition.width}px`,
                          maxHeight: `${dropdownPosition.maxHeight}px`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {dropdownPosition.bottom !== undefined ? (
                          <>
                            <div className="overflow-y-auto flex-1 min-h-0 p-2">
                              <div onClick={() => { setLeadSource(''); closeDropdown(); }} className="p-2 cursor-pointer hover:bg-gray-50 rounded text-sm">Clear</div>
                              {getFilteredLeadSources('leadSource').map((ls: any) => {
                                const val = ls.value ?? ls.label ?? ls;
                                const lbl = ls.label ?? ls.value ?? ls;
                                return (
                                  <div key={val} onClick={() => { setLeadSource(val); closeDropdown(); }} className={`p-2 cursor-pointer rounded text-sm ${leadSource === val ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>{lbl}</div>
                                );
                              })}
                            </div>
                            <div className="p-2 border-t flex-shrink-0">
                              <input type="text" value={searchQueries['leadSource'] || ''} onChange={(e) => updateSearchQuery('leadSource', e.target.value)} placeholder="Search..." className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={(e) => e.stopPropagation()} autoFocus />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="p-2 border-b flex-shrink-0">
                              <input type="text" value={searchQueries['leadSource'] || ''} onChange={(e) => updateSearchQuery('leadSource', e.target.value)} placeholder="Search..." className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={(e) => e.stopPropagation()} autoFocus />
                            </div>
                            <div className="overflow-y-auto flex-1 min-h-0 p-2">
                              <div onClick={() => { setLeadSource(''); closeDropdown(); }} className="p-2 cursor-pointer hover:bg-gray-50 rounded text-sm">Clear</div>
                              {getFilteredLeadSources('leadSource').map((ls: any) => {
                                const val = ls.value ?? ls.label ?? ls;
                                const lbl = ls.label ?? ls.value ?? ls;
                                return (
                                  <div key={val} onClick={() => { setLeadSource(val); closeDropdown(); }} className={`p-2 cursor-pointer rounded text-sm ${leadSource === val ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>{lbl}</div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  </OverlayPortal>
                )}
              </div>
            </div>

            {divisionIds.length > 0 && (
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">On-site Leads (by division)</label>
                <div className="space-y-2">
                  {divisionIds.map((divId: string) => {
                    const divKey = `div-${divId}`;
                    const leadId = divisionLeads[divId] || '';
                    const lead = leadId ? (employees || []).find((e: any) => String(e.id) === String(leadId)) : null;
                    const filteredEmps = getFilteredEmployees(divKey);
                    return (
                      <div key={divId} className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 w-36 min-w-0 shrink-0" title={getDivisionLabel(divId)}>
                          <span className="text-base flex-shrink-0">{getDivisionIcon(getDivisionMainLabel(divId), true)}</span>
                          <span className="text-xs text-gray-600 truncate">{getDivisionLabel(divId)}</span>
                        </div>
                        <div className="relative flex-1 min-w-0">
                          <div
                            ref={(el) => { triggerRefs.current[divKey] = el; }}
                            onClick={() => toggleDropdown(divKey)}
                            className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer bg-white hover:bg-gray-50"
                          >
                            {lead ? (
                              <>
                                <UserAvatar user={lead} size="w-6 h-6" showTooltip={false} />
                                <span className="flex-1 text-left truncate">{getUserDisplayName(lead)}</span>
                              </>
                            ) : (
                              <>
                                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs shrink-0">—</div>
                                <span className="flex-1 text-left text-gray-500 truncate">Select...</span>
                              </>
                            )}
                            <svg className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${openDropdownId === divKey ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                          {openDropdownId === divKey && dropdownPosition && (
                            <OverlayPortal>
                              <>
                                <div className="fixed inset-0 z-[60]" onClick={closeDropdown} />
                                <div
                                  className="fixed z-[70] bg-white border rounded-lg shadow-xl overflow-hidden flex flex-col min-h-0"
                                  style={{
                                    ...(dropdownPosition.top !== undefined ? { top: `${dropdownPosition.top}px` } : {}),
                                    ...(dropdownPosition.bottom !== undefined ? { bottom: `${dropdownPosition.bottom}px` } : {}),
                                    left: `${dropdownPosition.left}px`,
                                    width: `${dropdownPosition.width}px`,
                                    maxHeight: `${dropdownPosition.maxHeight}px`,
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {dropdownPosition.bottom !== undefined ? (
                                    <>
                                      <div className="overflow-y-auto flex-1 min-h-0 p-2">
                                        <div onClick={() => { setDivisionLeads(prev => ({ ...prev, [divId]: '' })); closeDropdown(); }} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-gray-50 rounded">
                                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">—</div>
                                          <span className="text-sm">Clear</span>
                                        </div>
                                        {filteredEmps.map((emp: any) => (
                                          <div key={emp.id} onClick={() => { setDivisionLeads(prev => ({ ...prev, [divId]: String(emp.id) })); closeDropdown(); }} className={`flex items-center gap-3 p-2 cursor-pointer rounded ${leadId === String(emp.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                            <UserAvatar user={emp} size="w-6 h-6" showTooltip={false} />
                                            <div className="flex-1 min-w-0">
                                              <div className="text-sm font-medium truncate">{getUserDisplayName(emp)}</div>
                                              {emp.email && <div className="text-xs text-gray-600 truncate">{emp.email}</div>}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="p-2 border-t flex-shrink-0">
                                        <input type="text" value={searchQueries[divKey] || ''} onChange={(e) => updateSearchQuery(divKey, e.target.value)} placeholder="Search..." className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={(e) => e.stopPropagation()} autoFocus />
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="p-2 border-b flex-shrink-0">
                                        <input type="text" value={searchQueries[divKey] || ''} onChange={(e) => updateSearchQuery(divKey, e.target.value)} placeholder="Search..." className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" onClick={(e) => e.stopPropagation()} autoFocus />
                                      </div>
                                      <div className="overflow-y-auto flex-1 min-h-0 p-2">
                                        <div onClick={() => { setDivisionLeads(prev => ({ ...prev, [divId]: '' })); closeDropdown(); }} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-gray-50 rounded">
                                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">—</div>
                                          <span className="text-sm">Clear</span>
                                        </div>
                                        {filteredEmps.map((emp: any) => (
                                          <div key={emp.id} onClick={() => { setDivisionLeads(prev => ({ ...prev, [divId]: String(emp.id) })); closeDropdown(); }} className={`flex items-center gap-3 p-2 cursor-pointer rounded ${leadId === String(emp.id) ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                            <UserAvatar user={emp} size="w-6 h-6" showTooltip={false} />
                                            <div className="flex-1 min-w-0">
                                              <div className="text-sm font-medium truncate">{getUserDisplayName(emp)}</div>
                                              {emp.email && <div className="text-xs text-gray-600 truncate">{emp.email}</div>}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </>
                            </OverlayPortal>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Start Date</label>
              <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">End Date</label>
              <input type="date" value={dateEta} onChange={e => setDateEta(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>

            {additionalCosts.length > 0 && (
              <div className="md:col-span-2">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Pricing – Approve items for project</label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {additionalCosts.map((item: any, i: number) => {
                    const label = item.label ?? item.name ?? '—';
                    const value = (item.value ?? 0) * (parseFloat(item.quantity) || 1);
                    const divId = item.division_id;
                    const approved = i < pricingApprovals.length ? pricingApprovals[i] : true;
                    return (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 bg-white hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          {divId && (
                            <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
                              <span className="flex-shrink-0">{getDivisionIcon(getDivisionMainLabel(divId), true)}</span>
                              {getDivisionLabel(divId)}
                            </span>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{label}</span>
                            <span className="text-gray-400">–</span>
                            <span className="text-sm font-semibold text-gray-900">${Number(value).toLocaleString('en-CA', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPricingApprovals(prev => { const n = [...prev]; if (i < n.length) n[i] = true; return n; })}
                            title="Approved"
                            className={`flex items-center justify-center w-7 h-7 rounded-lg border-2 transition-all ${
                              approved ? 'bg-green-100 text-green-700 border-green-400 scale-105 shadow-md' : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPricingApprovals(prev => { const n = [...prev]; if (i < n.length) n[i] = false; return n; })}
                            title="Not Approved"
                            className={`flex items-center justify-center w-7 h-7 rounded-lg border-2 transition-all ${
                              !approved ? 'bg-red-100 text-red-700 border-red-400 scale-105 shadow-md' : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-400'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3 rounded-b-xl">
          <div className="text-xs text-gray-500">Convert opportunity to active project</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-red text-white hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? 'Converting...' : 'Convert'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpdatesTab({ projectId, items, onRefresh }:{ projectId:string, items: Update[], onRefresh: ()=>any }){
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-2">New Update</h4>
        <input className="w-full border rounded px-3 py-2 mb-2" placeholder="Category (optional)" value={category} onChange={e=>setCategory(e.target.value)} />
        <textarea className="w-full border rounded px-3 py-2 h-28" placeholder="What happened?" value={text} onChange={e=>setText(e.target.value)} />
        <div className="mt-2 text-right"><button onClick={async()=>{ try{ await api('POST', `/projects/${projectId}/updates`, { text, category }); setText(''); setCategory(''); await onRefresh(); toast.success('Update added'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Add Update</button></div>
      </div>
      <div className="md:col-span-2 rounded-xl border bg-white divide-y">
        {items.length? items.map(u=> (
          <div key={u.id} className="p-3 text-sm flex items-start justify-between">
            <div>
              <div className="text-[11px] text-gray-500">{(u.timestamp||'').slice(0,19).replace('T',' ')}</div>
              <div className="text-gray-800 whitespace-pre-wrap">{u.text||''}</div>
            </div>
            <button onClick={async()=>{ if(!confirm('Delete this update?')) return; try{ await api('DELETE', `/projects/${projectId}/updates/${u.id}`); await onRefresh(); toast.success('Deleted'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
          </div>
        )) : <div className="p-3 text-sm text-gray-600">No updates yet</div>}
      </div>
    </div>
  );
}

function normalizeReportCategoryId(categoryId?: string | null): string {
  return String(categoryId || '').trim() || 'uncategorized';
}

function ReportsTabEnhanced({
  projectId,
  businessLine,
  isBidding: isBiddingProject,
  items,
  onRefresh,
  designSystem,
}: {
  projectId: string;
  businessLine?: string;
  isBidding?: boolean;
  items: Report[];
  onRefresh: () => any;
  designSystem?: boolean;
}) {
  const location = useLocation();
  const confirm = useConfirm();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{file_object_id: string, original_name: string, content_type: string}|null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>(''); // Empty string = all categories
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any>('GET','/employees?limit=5000') });
  
  // Check permissions for reports (using local scope variables)
  const { data: meReports } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdminReports = isAdminRole(meReports?.roles);
  const permissionsReports = new Set(meReports?.permissions || []);
  const resolvedBusinessLine = useMemo(
    () => resolveProjectBusinessLine(businessLine, location.pathname),
    [businessLine, location.pathname]
  );

  const canWriteReports = hasProjectFeatureWritePermission(
    permissionsReports,
    resolvedBusinessLine,
    'reports',
    isAdminReports
  );

  const { data: reportCategoryPerms } = useQuery({
    queryKey: ['project-reports-category-perms', resolvedBusinessLine],
    queryFn: () =>
      api<any>(
        'GET',
        `/auth/me/project-reports-category-permissions?business_line=${encodeURIComponent(resolvedBusinessLine)}`
      ),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const readAllowList: string[] | null = Array.isArray(reportCategoryPerms?.read_categories)
    ? reportCategoryPerms.read_categories
    : null;
  const writeAllowList: string[] | null = Array.isArray(reportCategoryPerms?.write_categories)
    ? reportCategoryPerms.write_categories
    : null;

  const isReadCategoryAllowed = useCallback(
    (categoryId?: string | null) => {
      if (isAdminReports) return true;
      const key = normalizeReportCategoryId(categoryId);
      return readAllowList === null ? true : readAllowList.includes(key);
    },
    [readAllowList, isAdminReports]
  );

  const isWriteCategoryAllowed = useCallback(
    (categoryId?: string | null) => {
      if (isAdminReports) return true;
      if (!canWriteReports) return false;
      const key = normalizeReportCategoryId(categoryId);
      return writeAllowList === null ? true : writeAllowList.includes(key);
    },
    [writeAllowList, canWriteReports, isAdminReports]
  );

  const visibleItems = useMemo(
    () =>
      items.filter(
        (r) => !isHiddenReportNote(r) && isReadCategoryAllowed(r.category_id)
      ),
    [items, isReadCategoryAllowed]
  );

  const canCreateNote =
    canWriteReports &&
    (writeAllowList === null ||
      (settings?.report_categories || []).some(
        (cat: any) =>
          !isHiddenReportCategory(cat) &&
          isWriteCategoryAllowed(cat?.value || cat?.label)
      ));
  
  const reportCategories = (settings?.report_categories || []) as any[];

  // Separate categories into commercial and production based on meta.group
  const commercialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return (
          meta.group === 'commercial' &&
          !isHiddenReportCategory(cat) &&
          isReadCategoryAllowed(cat.value || cat.label)
        );
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories, isReadCategoryAllowed]);
  
  const productionCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return (
          meta.group === 'production' &&
          !isHiddenReportCategory(cat) &&
          isReadCategoryAllowed(cat.value || cat.label)
        );
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories, isReadCategoryAllowed]);
  
  const financialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return (
          meta.group === 'financial' &&
          !isHiddenReportCategory(cat) &&
          isReadCategoryAllowed(cat.value || cat.label)
        );
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories, isReadCategoryAllowed]);

  // Calculate counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Count "All" (total reports)
    counts[''] = visibleItems.length;
    // Count by category
    visibleItems.forEach(report => {
      const catId = report.category_id || '';
      counts[catId] = (counts[catId] || 0) + 1;
    });
    return counts;
  }, [visibleItems]);

  // Filter and sort reports
  const sortedReports = useMemo(() => {
    let filtered = [...visibleItems];
    
    // Apply category filter
    if (selectedCategoryFilter) {
      filtered = filtered.filter(r => r.category_id === selectedCategoryFilter);
    }
    
    // Sort by date (newest first)
    return filtered.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [visibleItems, selectedCategoryFilter]);

  const selectedReport = useMemo(() => {
    return selectedReportId ? sortedReports.find(r => r.id === selectedReportId) : null;
  }, [selectedReportId, sortedReports]);

  // Auto-select first report if none selected and reports exist
  // Also reset selection if current selected report is not in filtered list
  useEffect(() => {
    if (sortedReports.length > 0) {
      if (!selectedReportId) {
        setSelectedReportId(sortedReports[0].id);
      } else {
        // Check if selected report is still in the filtered list
        const isSelectedReportInList = sortedReports.some(r => r.id === selectedReportId);
        if (!isSelectedReportInList) {
          setSelectedReportId(sortedReports[0].id);
        }
      }
    } else {
      // No reports in filtered list, clear selection
      setSelectedReportId(null);
    }
  }, [sortedReports, selectedReportId]);

  const getPreviewText = (text: string, maxLength: number = 100) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  const getAuthorInfo = (createdBy: string | null | undefined, createdByName?: string | null) => {
    const fallbackAvatar = '/ui/assets/login/logo-light.svg';
    const resolveAvatar = (userLike: any) =>
      userLike?.profile_photo_file_id
        ? withFileAccessToken(`/files/${userLike.profile_photo_file_id}/thumbnail?w=40`)
        : fallbackAvatar;

    const meMatch =
      createdBy && me && String(me.id) === String(createdBy)
        ? { name: getUserDisplayName(me) || me.username || 'Unknown', avatar: resolveAvatar(me) }
        : null;

    if (createdByName?.trim()) {
      const author = employees?.find((e: any) => String(e.id) === String(createdBy));
      return {
        name: createdByName.trim(),
        avatar: author ? resolveAvatar(author) : meMatch?.avatar || fallbackAvatar,
      };
    }

    if (meMatch) return meMatch;
    if (!createdBy || !employees) return { name: 'Unknown', avatar: fallbackAvatar };

    const author = employees.find((e: any) => String(e.id) === String(createdBy));
    if (!author) return { name: 'Unknown', avatar: fallbackAvatar };
    return {
      name: getUserDisplayName(author) || author.username || 'Unknown',
      avatar: resolveAvatar(author),
    };
  };

  const getAttachmentIcon = (contentType: string, originalName: string) => {
    const isImage = contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(originalName);
    if (isImage) return '📷';
    if (contentType?.includes('pdf')) return '📄';
    if (contentType?.includes('word') || /\.(doc|docx)$/i.test(originalName)) return '📝';
    if (contentType?.includes('excel') || /\.(xls|xlsx)$/i.test(originalName)) return '📊';
    return '📎';
  };

  const handleAttachmentClick = async (attachment: any) => {
    try {
      const isImage = attachment.content_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.original_name);
      if (isImage) {
        setPreviewAttachment(attachment);
      } else {
        const r: any = await api('GET', withFileAccessToken(`/files/${attachment.file_object_id}/preview`));
        const url = String(r.preview_url || r.download_url || '');
        if (url) {
          window.open(url, '_blank');
        }
      }
    } catch (e: any) {
      toast.error('Failed to open attachment');
    }
  };

  const categoryFilterOptionGroups = useMemo(
    () =>
      buildReportCategorySelectGroups({
        commercialCategories,
        productionCategories,
        financialCategories,
        variant: 'filter',
        categoryCounts,
      }),
    [commercialCategories, productionCategories, financialCategories, categoryCounts],
  );

  if (designSystem) {
    return (
      <>
        <ProjectReportsTabDs
          projectId={projectId}
          sortedReports={sortedReports}
          selectedReportId={selectedReportId}
          setSelectedReportId={setSelectedReportId}
          selectedReport={selectedReport ?? null}
          canCreateNote={canCreateNote}
          canWriteReports={canWriteReports}
          isWriteCategoryAllowed={isWriteCategoryAllowed}
          categoryFilterOptionGroups={categoryFilterOptionGroups}
          selectedCategoryFilter={selectedCategoryFilter}
          onCategoryFilterChange={setSelectedCategoryFilter}
          reportCategories={reportCategories}
          getAuthorInfo={getAuthorInfo}
          getPreviewText={getPreviewText}
          getAttachmentIcon={getAttachmentIcon}
          handleAttachmentClick={handleAttachmentClick}
          onRefresh={onRefresh}
          confirm={confirm}
          onNewNote={() => setShowCreateModal(true)}
          onEditNote={() => {
            if (selectedReport) setEditingReport(selectedReport);
          }}
          previewAttachment={previewAttachment}
          onClosePreview={() => setPreviewAttachment(null)}
        />
        {(showCreateModal || editingReport) && (
          <CreateReportModal
            projectId={projectId}
            reportCategories={reportCategories}
            isReadCategoryAllowed={isReadCategoryAllowed}
            isWriteCategoryAllowed={isWriteCategoryAllowed}
            designSystem
            report={editingReport || undefined}
            onClose={() => {
              setShowCreateModal(false);
              setEditingReport(null);
            }}
            onSuccess={async () => {
              const wasEdit = Boolean(editingReport);
              setShowCreateModal(false);
              setEditingReport(null);
              await onRefresh();
              toast.success(wasEdit ? 'Note updated' : 'Note created');
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Notes/History Section Card */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-orange-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Notes/History</h2>
        </div>
      </div>

      <div className="flex flex-col h-full">
        {/* Two-column layout */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left sidebar - Notes list (30%) */}
          <div className="w-[30%] flex flex-col border rounded-xl bg-white overflow-hidden">
          <div className="overflow-y-auto flex-1">
            {/* Category Filter Dropdown - Inside the card, above New Note button */}
            <div className="p-3 border-b">
              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
              >
                <option value="">All ({categoryCounts[''] || 0})</option>
                {commercialCategories.length > 0 && (
                  <optgroup label="📌 Commercial">
                    {commercialCategories.map(cat => {
                      const count = categoryCounts[cat.value || ''] || 0;
                      return (
                        <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                          {cat.label} ({count})
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {productionCategories.length > 0 && (
                  <optgroup label="📌 Production / Execution">
                    {productionCategories.map(cat => {
                      const count = categoryCounts[cat.value || ''] || 0;
                      return (
                        <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                          {cat.label} ({count})
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {financialCategories.length > 0 && (
                  <optgroup label="📌 Financial (Update Project Values)">
                    {financialCategories.map(cat => {
                      const count = categoryCounts[cat.value || ''] || 0;
                      return (
                        <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                          {cat.label} ({count})
                        </option>
                      );
                    })}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="divide-y">
              {canCreateNote && (
                <div className="p-3 pb-3">
                  <div
                    onClick={() => setShowCreateModal(true)}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[120px] cursor-pointer"
                  >
                    <div className="text-lg text-gray-400 mb-1.5">+</div>
                    <div className="font-medium text-xs text-gray-700">New Note</div>
                  </div>
                </div>
              )}
              {sortedReports.length ? sortedReports.map(r => {
              const reportDate = r.created_at ? new Date(r.created_at) : null;
              const attachments = r.images?.attachments || [];
              const isSelected = selectedReportId === r.id;
              const authorInfo = getAuthorInfo(r.created_by, r.created_by_name);
              const preview = getPreviewText(r.description || '');
              const listSubtitle = formatReportListSubtitle(r, authorInfo.name);
              const hasStatusBadges = reportHasStatusBadges(r);
              
              return (
                <div 
                  key={r.id} 
                  className={`p-3 hover:bg-gray-50 transition-colors cursor-pointer border-l-2 ${
                    isSelected ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent'
                  }`}
                  onClick={() => setSelectedReportId(r.id)}
                >
                  <div className="flex items-start gap-2">
                    <img src={authorInfo.avatar} className="w-8 h-8 rounded-full flex-shrink-0" alt={authorInfo.name} />
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-xs mb-1 ${isSelected ? 'text-gray-900' : 'text-gray-800'}`}>
                        {r.title || 'Untitled Note'}
                      </div>
                      <div className="text-[10px] text-gray-500 mb-1 flex flex-wrap items-center gap-1.5">
                        {hasStatusBadges && (
                          <ReportStatusChangeBadges
                            report={r}
                            designSystem={designSystem}
                            statusColors={(settings || {}).project_statuses || []}
                            compact
                          />
                        )}
                        {hasStatusBadges && <span className="text-gray-400">·</span>}
                        <span>{listSubtitle}</span>
                      </div>
                      {preview && (
                        <div className="text-[10px] text-gray-600 line-clamp-2 mb-1">
                          {preview}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                        <span>
                          {reportDate ? reportDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </span>
                        {attachments.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{attachments.length} 📎</span>
                          </>
                        )}
                        {r.category_id && (
                          <>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px]">
                              {reportCategories.find(c => (c.value || c.label) === r.category_id)?.label || r.category_id}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="p-8 text-center text-gray-500">
                <div className="text-sm mb-2">No notes yet</div>
                {canCreateNote && (
                  <div className="text-xs">Click "New Note" to create your first note</div>
                )}
              </div>
            )}
            </div>
          </div>
          </div>

        {/* Right panel - Note content (70%) */}
        <div className="flex-1 border rounded-xl bg-white overflow-hidden flex flex-col">
          {selectedReport ? (() => {
            const reportDate = selectedReport.created_at ? new Date(selectedReport.created_at) : null;
            const attachments = selectedReport.images?.attachments || [];
            const authorInfo = getAuthorInfo(selectedReport.created_by, selectedReport.created_by_name);
            const hasStatusBadges = reportHasStatusBadges(selectedReport);
            const categoryLabel = reportCategories.find(c => c.value === selectedReport.category_id)?.label || selectedReport.category_id || 'General';
            
            return (
              <>
                {/* Header */}
                <div className="p-3 border-b bg-gray-50 flex-shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-sm font-semibold text-gray-900 mb-2">
                        {selectedReport.title || 'Untitled Note'}
                      </h2>
                      {hasStatusBadges && (
                        <div className="mb-2">
                          <ReportStatusChangeBadges
                            report={selectedReport}
                            designSystem={designSystem}
                            statusColors={(settings || {}).project_statuses || []}
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <img src={authorInfo.avatar} className="w-6 h-6 rounded-full" alt={authorInfo.name} />
                          <div>
                            <div className="text-xs font-medium text-gray-900">{authorInfo.name}</div>
                            <div className="text-[10px] text-gray-500">
                              {reportDate ? reportDate.toLocaleDateString('en-US', { 
                                weekday: 'long',
                                month: 'long', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit', 
                                minute: '2-digit' 
                              }) : ''}
                            </div>
                          </div>
                        </div>
                        {selectedReport.category_id && (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">
                            {categoryLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedReport.financial_type === 'estimate-changes' && selectedReport.approval_status === 'pending' && canWriteReports && isWriteCategoryAllowed(selectedReport.category_id) && (
                        <button
                          onClick={async () => {
                            const result = await confirm({
                              title: 'Approve Change Order',
                              message: `Are you sure you want to approve this Change Order note? The items will be added to the project's estimate.`,
                              confirmText: 'Approve',
                              cancelText: 'Cancel'
                            });
                            if (result !== 'confirm') return;
                            try {
                              await api('POST', `/projects/${projectId}/reports/${selectedReport.id}/approve`);
                              await onRefresh();
                              toast.success('Note approved and items added to estimate');
                            } catch (_e: any) {
                              toast.error(_e.message || 'Failed to approve note');
                            }
                          }}
                          className="px-2.5 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex-shrink-0"
                          title="Approve note"
                        >
                          âœ“ Approve
                        </button>
                      )}
                      {selectedReport.financial_type === 'estimate-changes' && selectedReport.approval_status && (
                        <span className={`px-2.5 py-1.5 rounded text-xs font-medium flex-shrink-0 ${
                          selectedReport.approval_status === 'approved' ? 'bg-green-100 text-green-700' :
                          selectedReport.approval_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {selectedReport.approval_status === 'approved' ? 'âœ“ Approved' :
                           selectedReport.approval_status === 'pending' ? 'â³ Pending' :
                           'Rejected'}
                        </span>
                      )}
                      {canWriteReports && isWriteCategoryAllowed(selectedReport.category_id) && (
                        <>
                          <button
                            onClick={() => setEditingReport(selectedReport)}
                            className="px-2.5 py-1.5 rounded text-gray-600 hover:bg-gray-100 text-xs font-medium flex-shrink-0 border border-gray-200"
                            title="Edit note"
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                            const result = await confirm({
                              title: 'Delete Note',
                              message: `Are you sure you want to delete "${selectedReport.title || 'this note'}"? This action cannot be undone.`,
                              confirmText: 'Delete',
                              cancelText: 'Cancel'
                            });
                            if (result !== 'confirm') return;
                            try {
                              await api('DELETE', `/projects/${projectId}/reports/${selectedReport.id}`);
                              await onRefresh();
                              setSelectedReportId(null);
                              toast.success('Note deleted');
                            } catch (_e) {
                              toast.error('Failed to delete note');
                            }
                          }}
                          className="px-2.5 py-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600 text-xs font-medium flex-shrink-0"
                          title="Delete note"
                        >
                          🗑️ Delete
                        </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto flex-1">
                  {/* Financial value display */}
                  {(selectedReport.financial_type === 'additional-income' || selectedReport.financial_type === 'additional-expense') && selectedReport.financial_value !== undefined && (
                    <div className={`mb-4 p-3 rounded-lg border ${
                      selectedReport.financial_type === 'additional-expense' 
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="text-xs font-semibold text-gray-700 mb-1">
                        {selectedReport.financial_type === 'additional-income' ? 'Additional Income' : 'Expense'}
                      </div>
                      <div className="text-lg font-bold text-gray-900">
                        ${(selectedReport.financial_value || 0).toFixed(2)}
                      </div>
                    </div>
                  )}
                  
                  {/* Estimate Changes display */}
                  {selectedReport.financial_type === 'estimate-changes' && selectedReport.estimate_data && (() => {
                    const estimateData = selectedReport.estimate_data;
                    const items = estimateData?.items || [];
                    const sectionOrder = estimateData?.section_order || [];
                    const sectionNames = estimateData?.section_names || {};
                    
                    // Calculate item total base (without markup)
                    const calculateItemTotal = (item: any): number => {
                      if (item.item_type === 'labour' && item.labour_journey_type) {
                        if (item.labour_journey_type === 'contract') {
                          return (item.labour_journey || 0) * (item.unit_price || 0);
                        } else {
                          return (item.labour_journey || 0) * (item.labour_men || 0) * (item.unit_price || 0);
                        }
                      }
                      return (item.quantity || 0) * (item.unit_price || 0);
                    };
                    
                    // Calculate item total with markup applied
                    const calculateItemTotalWithMarkup = (item: any): number => {
                      const itemTotal = calculateItemTotal(item);
                      const itemMarkup = item.markup !== undefined && item.markup !== null ? item.markup : (estimateData?.markup || 0);
                      return itemTotal * (1 + (itemMarkup / 100));
                    };
                    
                    const grandTotal = items.reduce((sum: number, item: any) => sum + calculateItemTotalWithMarkup(item), 0);
                    
                    // Group items by section
                    const itemsBySection: Record<string, any[]> = {};
                    items.forEach((item: any) => {
                      const section = item.section || 'other';
                      if (!itemsBySection[section]) {
                        itemsBySection[section] = [];
                      }
                      itemsBySection[section].push(item);
                    });
                    
                    // Get ordered sections
                    const orderedSections = sectionOrder.length > 0 
                      ? sectionOrder.filter((s: string) => itemsBySection[s])
                      : Object.keys(itemsBySection).sort();
                    
                    return (
                      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs font-semibold text-gray-700">Change Order Summary</div>
                          {selectedReport.approval_status === 'approved' && (
                            <span className="text-[10px] text-green-600 font-medium">âœ“ Items have been added to the project estimate</span>
                          )}
                        </div>
                        
                        {items.length === 0 ? (
                          <div className="text-xs text-gray-500">No items in this estimate change.</div>
                        ) : (
                          <div className="space-y-3">
                            {orderedSections.map((section: string) => {
                              const sectionItems = itemsBySection[section] || [];
                              const sectionName = sectionNames[section] || section || 'Other';
                              const sectionTotal = sectionItems.reduce((sum: number, item: any) => sum + calculateItemTotalWithMarkup(item), 0);
                              
                              return (
                                <div key={section} className="border border-gray-200 rounded bg-white">
                                  <div className="px-2.5 py-2 bg-gray-100 border-b border-gray-200">
                                    <div className="text-xs font-semibold text-gray-700">{sectionName}</div>
                                  </div>
                                  <div className="divide-y divide-gray-100">
                                    {sectionItems.map((item: any, idx: number) => {
                                      const itemTotal = calculateItemTotalWithMarkup(item);
                                      return (
                                        <div key={idx} className="px-2.5 py-2">
                                          <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                              <div className="text-xs font-medium text-gray-900 mb-1">
                                                {item.name || 'Unnamed Item'}
                                              </div>
                                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-600">
                                                <span>
                                                  <span className="font-medium">Qty:</span> {item.quantity || 0} {item.unit || ''}
                                                </span>
                                                {item.item_type === 'labour' && item.labour_journey && (
                                                  <>
                                                    <span>
                                                      <span className="font-medium">Journey:</span> {item.labour_journey} {item.labour_journey_type || 'hours'}
                                                    </span>
                                                    {item.labour_men && item.labour_men > 0 && (
                                                      <span>
                                                        <span className="font-medium">Men:</span> {item.labour_men}
                                                      </span>
                                                    )}
                                                  </>
                                                )}
                                                <span>
                                                  <span className="font-medium">Unit Price:</span> ${(item.unit_price || 0).toFixed(2)}
                                                </span>
                                                {item.item_type && (
                                                  <span>
                                                    <span className="font-medium">Type:</span> {item.item_type}
                                                  </span>
                                                )}
                                                {item.supplier_name && (
                                                  <span>
                                                    <span className="font-medium">Supplier:</span> {item.supplier_name}
                                                  </span>
                                                )}
                                                {item.markup !== undefined && item.markup !== null && item.markup > 0 && (
                                                  <span>
                                                    <span className="font-medium">Markup:</span> {item.markup.toFixed(1)}%
                                                  </span>
                                                )}
                                                {item.taxable && (
                                                  <span className="text-green-600 font-medium">Taxable</span>
                                                )}
                                              </div>
                                              {item.description && (
                                                <div className="text-[10px] text-gray-500 mt-1 italic">
                                                  {item.description}
                                                </div>
                                              )}
                                            </div>
                                            <div className="text-xs font-semibold text-gray-900 whitespace-nowrap">
                                              ${itemTotal.toFixed(2)}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {sectionItems.length > 1 && (
                                    <div className="px-2.5 py-2 bg-gray-50 border-t border-gray-200 flex justify-end">
                                      <div className="text-xs font-semibold text-gray-700">
                                        Section Total: ${sectionTotal.toFixed(2)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            
                            <div className="pt-2 border-t border-gray-300">
                              <div className="flex justify-end">
                                <div className="text-xs font-bold text-gray-900">
                                  Grand Total: ${grandTotal.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  
                  <div className="prose max-w-none">
                    <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {selectedReport.description || 'No description provided.'}
                    </div>
                  </div>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h3 className="text-xs font-semibold text-gray-900 mb-2">Attachments ({attachments.length})</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {attachments.map((a: any, i: number) => {
                          const isImage = (a.content_type || '').startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(a.original_name || '');
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleAttachmentClick(a)}
                              className="rounded-lg border bg-white hover:bg-gray-50 overflow-hidden text-left transition-colors"
                            >
                              {isImage ? (
                                <>
                                  <img
                                    src={withFileAccessToken(`/files/${a.file_object_id}/thumbnail?w=400`)}
                                    alt={a.original_name || 'attachment'}
                                    className="w-full h-32 object-cover"
                                  />
                                  <div className="p-2 border-t">
                                    <div className="text-xs text-gray-600 truncate" title={a.original_name}>
                                      {a.original_name || 'attachment'}
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="p-3 flex items-center gap-2">
                                  <span className="text-sm">{getAttachmentIcon(a.content_type || '', a.original_name || '')}</span>
                                  <span className="text-xs text-gray-700 truncate">{a.original_name || 'attachment'}</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })() : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-lg mb-2">Select a note to view</div>
                <div className="text-sm">Choose a note from the list on the left</div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {(showCreateModal || editingReport) && (
        <CreateReportModal
          projectId={projectId}
          reportCategories={reportCategories}
          isWriteCategoryAllowed={isWriteCategoryAllowed}
          report={editingReport || undefined}
          onClose={() => {
            setShowCreateModal(false);
            setEditingReport(null);
          }}
          onSuccess={async () => {
            const wasEdit = Boolean(editingReport);
            setShowCreateModal(false);
            setEditingReport(null);
            await onRefresh();
            toast.success(wasEdit ? 'Note updated' : 'Note created');
          }}
        />
      )}

      {previewAttachment && (
        <OverlayPortal><div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewAttachment(null)}>
          <div className="max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">{previewAttachment.original_name}</h3>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="text-2xl font-bold text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
              <img
                src={withFileAccessToken(`/files/${previewAttachment.file_object_id}/thumbnail?w=1200`)}
                alt={previewAttachment.original_name}
                className="max-w-full h-auto"
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}
    </div>
  );
}

function CreateReportModal({ projectId, reportCategories, isReadCategoryAllowed, isWriteCategoryAllowed, designSystem, report, onClose, onSuccess }: {
  projectId: string,
  reportCategories: any[],
  isReadCategoryAllowed?: (categoryId?: string | null) => boolean,
  isWriteCategoryAllowed: (categoryId?: string | null) => boolean,
  designSystem?: boolean,
  report?: Report,
  onClose: () => void,
  onSuccess: () => Promise<void>
}){
  const isEditing = Boolean(report);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [financialValue, setFinancialValue] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const { data:project } = useQuery({ queryKey:['project', projectId], queryFn: ()=>api<any>('GET', `/projects/${projectId}`) });
  const isBidding = project?.is_bidding === true;

  useEffect(() => {
    if (report) {
      setTitle(report.title || '');
      setCategory(report.category_id || '');
      setDesc(report.description || '');
      setFinancialValue(report.financial_value || 0);
      setFiles([]);
      return;
    }
    setTitle('');
    setCategory('');
    setDesc('');
    setFinancialValue(0);
    setFiles([]);
  }, [report]);

  const existingAttachments = useMemo(() => {
    const attachments = report?.images?.attachments;
    return Array.isArray(attachments) ? attachments : [];
  }, [report]);

  const isCategoryListed = useCallback(
    (categoryId?: string | null) => {
      if (designSystem && isReadCategoryAllowed) {
        return isReadCategoryAllowed(categoryId);
      }
      return isWriteCategoryAllowed(categoryId);
    },
    [designSystem, isReadCategoryAllowed, isWriteCategoryAllowed],
  );

  const commercialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return (
          meta.group === 'commercial' &&
          !isHiddenReportCategory(cat) &&
          isCategoryListed(cat.value || cat.label)
        );
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories, isCategoryListed]);
  
  const productionCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return (
          meta.group === 'production' &&
          !isHiddenReportCategory(cat) &&
          isCategoryListed(cat.value || cat.label)
        );
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories, isCategoryListed]);
  
  const financialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return (
          meta.group === 'financial' &&
          !isHiddenReportCategory(cat) &&
          isCategoryListed(cat.value || cat.label)
        );
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories, isCategoryListed]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (category && !isWriteCategoryAllowed(category)) {
      toast.error('You do not have permission to save notes in this category');
      return;
    }
    if ((category === 'additional-income' || category === 'additional-expense') && financialValue <= 0) {
      toast.error('Please enter a valid value');
      return;
    }
    if (!desc.trim()) {
      toast.error('Please enter a description');
      return;
    }
    setUploading(true);
    try {
      const newAttachments: any[] = [];
      for (const file of files) {
        const up: any = await api('POST', '/files/upload', {
          project_id: projectId,
          client_id: project?.client_id || null,
          employee_id: null,
          category_id: 'project-report',
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        });
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-ms-blob-type': 'BlockBlob'
          },
          body: file
        });
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: file.size,
          checksum_sha256: 'na',
          content_type: file.type || 'application/octet-stream'
        });
        newAttachments.push({
          file_object_id: conf.id,
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        });
      }

      const payload: any = {
        title: title.trim(),
        category_id: category || null,
        description: desc,
      };

      if (category === 'additional-income' || category === 'additional-expense') {
        payload.financial_value = financialValue;
        payload.financial_type = category;
      }

      if (isEditing && report) {
        const existingImages = report.images && typeof report.images === 'object' ? report.images : {};
        payload.images = {
          ...existingImages,
          attachments: [...existingAttachments, ...newAttachments],
        };
        await api('PATCH', `/projects/${projectId}/reports/${report.id}`, payload);
      } else {
        if (newAttachments.length > 0) {
          payload.images = { attachments: newAttachments };
        }
        await api('POST', `/projects/${projectId}/reports`, payload);
      }

      setTitle('');
      setCategory('');
      setDesc('');
      setFiles([]);
      setFinancialValue(0);
      await onSuccess();
    } catch (_e) {
      toast.error(isEditing ? 'Failed to update note' : 'Failed to create note');
    } finally {
      setUploading(false);
    }
  };

  const categoryOptionGroups = useMemo(
    () =>
      buildReportCategorySelectGroups({
        commercialCategories,
        productionCategories,
        financialCategories,
        variant: 'form',
      }),
    [commercialCategories, productionCategories, financialCategories],
  );

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title={isEditing ? 'Edit Note' : 'New Note'}
        description={
          isEditing
            ? 'Update this note on the project timeline'
            : 'Add a note to this opportunity'
        }
        formWidth="comfortable"
        quickInfo={opportunityCreateNoteQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={uploading}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={uploading}
              loading={uploading}
            >
              {uploading ? (isEditing ? 'Saving…' : 'Creating…') : isEditing ? 'Save Note' : 'Create Note'}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <AppInput
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter note title…"
            fieldHint="Title\n\nShort headline for this note. Shown in the Notes/History list and detail panel."
          />
          <AppSelect
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            optionGroups={categoryOptionGroups}
            sortOptions={false}
            fieldHint={
              isBidding
                ? 'Category\n\nCommercial note type for this opportunity (site visit, client call, etc.). Options come from system settings.'
                : 'Category\n\nGroups the note (commercial, production, or financial). Financial categories can update project values when applicable.'
            }
          />
          {(category === 'additional-income' || category === 'additional-expense') && (
            <AppInput
              label="Value"
              required
              type="number"
              step="0.01"
              min="0"
              value={financialValue > 0 ? String(financialValue) : ''}
              onChange={(e) =>
                setFinancialValue(e.target.value ? parseFloat(e.target.value) : 0)
              }
              placeholder="Enter amount…"
              fieldHint="Value\n\nDollar amount for this additional income or expense. Saved with the note on the project timeline."
            />
          )}
          <AppTextarea
            label="Description"
            required
            rows={6}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Describe what happened, how the day went, or any events on site…"
            fieldHint="Description\n\nMain body of the note. Describe what happened, decisions, or site activity. Required to create the note."
          />
          <ReportAttachmentAreaMultiple
            files={files}
            setFiles={setFiles}
            accept="image/*,.pdf,.doc,.docx"
            label={
              isEditing
                ? 'Add attachments (optional – existing files are kept)'
                : 'Attachments (optional – multiple allowed)'
            }
            fieldHint="Attachments\n\nDrag, click, or paste (Ctrl+V). Optional images, PDFs, or documents linked to this note."
          />
          {isEditing && existingAttachments.length > 0 && (
            <div className={uiTypography.helper}>
              <div className="mb-1 font-medium text-gray-700">Existing attachments</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {existingAttachments.map((a: any, i: number) => (
                  <li key={a.file_object_id || i}>{a.original_name || 'Attachment'}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{isEditing ? 'Edit Note' : 'New Note'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isEditing ? 'Update this note or report' : 'Add a note or report to this project'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <form
            id="create-note-form-project"
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="rounded-xl border border-gray-200 bg-white p-4 space-y-4"
          >
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Title *</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                placeholder="Enter note title..."
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Category</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="">Select category...</option>
                {!isBidding && commercialCategories.length > 0 && (
                  <optgroup label="Commercial">
                    {commercialCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
                {!isBidding && productionCategories.length > 0 && (
                  <optgroup label="Production / Execution">
                    {productionCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
                {!isBidding && financialCategories.length > 0 && (
                  <optgroup label="Financial (Update Project Values)">
                    {financialCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
                {isBidding && commercialCategories.length > 0 && (
                  <>
                    {commercialCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </>
                )}
              </select>
            </div>
            {category === 'additional-income' || category === 'additional-expense' ? (
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Value *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                  placeholder="Enter amount..."
                  value={financialValue}
                  onChange={e => setFinancialValue(e.target.value ? parseFloat(e.target.value) : 0)}
                />
              </div>
            ) : null}
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Description *</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                rows={6}
                placeholder="Describe what happened, how the day went, or any events on site..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>
            <ReportAttachmentAreaMultiple
              files={files}
              setFiles={setFiles}
              accept="image/*,.pdf,.doc,.docx"
              label={
                isEditing
                  ? 'Add attachments (optional – existing files are kept)'
                  : 'Attachments (optional – multiple allowed)'
              }
            />
            {isEditing && existingAttachments.length > 0 && (
              <div className="text-xs text-gray-600">
                <div className="font-medium text-gray-700 mb-1">Existing attachments</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {existingAttachments.map((a: any, i: number) => (
                    <li key={a.file_object_id || i}>{a.original_name || 'Attachment'}</li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-note-form-project"
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (isEditing ? 'Saving...' : 'Creating...') : isEditing ? 'Save Note' : 'Create Note'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

function ClientName({ clientId }:{ clientId:string }){
  const { data } = useQuery({ queryKey:['client-name', clientId], queryFn: ()=> clientId? api<any>('GET', `/clients/${clientId}`): Promise.resolve(null) });
  const name = data?.display_name || data?.name || clientId || '-';
  return <div className="text-sm text-gray-700">{name}</div>;
}

function AddDivisionDropdown({ divisions, selected, onAdd }:{ divisions:any[], selected:string[], onAdd:(id:string)=>void }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = (divisions||[]).filter((d:any)=>{
    const id = String(d.id||d.label||d.value);
    const txt = (String(d.label||'') + ' ' + String(d.meta?.abbr||'')).toLowerCase();
    return !selected.includes(id) && txt.includes(q.toLowerCase());
  });
  return (
    <div className="relative">
      <button onClick={()=>setOpen(v=>!v)} className="px-2 py-1 rounded-full border text-xs bg-white">+ Add Division</button>
      {open && (
        <div className="absolute z-50 mt-2 w-56 rounded-lg border bg-white shadow-lg p-2">
          <input className="w-full border rounded px-2 py-1 text-sm mb-2" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
          <div className="max-h-56 overflow-auto">
            {list.length? list.map((d:any)=>{
              const id = String(d.id||d.label||d.value);
              const bg = d.meta?.color || '#eef2f7';
              return (
                <button key={id} onClick={()=>{ onAdd(id); setOpen(false); setQ(''); }} className="w-full text-left px-2 py-1 rounded flex items-center gap-2 hover:bg-gray-50">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: bg }} />
                  <span className="text-sm">{d.meta?.abbr || d.label}</span>
                </button>
              );
            }) : <div className="text-sm text-gray-600 px-2 py-1">No results</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeSelect({ label, value, onChange, employees }:{ label:string, value?:string, onChange:(v:string)=>void, employees:any[] }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const containerRef = useRef<HTMLDivElement|null>(null);
  const current = (employees||[]).find((e:any)=> String(e.id)===String(value||''));
  const filtered = (employees||[]).filter((e:any)=>{
    const t = (String(e.name||'') + ' ' + String(e.username||'')).toLowerCase();
    return t.includes(q.toLowerCase());
  });
  useEffect(()=>{
    if(!open) return;
    const handleClick = (event: MouseEvent)=>{
      if(!containerRef.current) return;
      if(!containerRef.current.contains(event.target as Node)){
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return ()=> document.removeEventListener('mousedown', handleClick);
  }, [open]);
  return (
    <div ref={containerRef}>
      <label className="text-xs text-gray-600">{label}</label>
      <div className="relative">
        <button onClick={()=>setOpen(v=>!v)} className="w-full border rounded px-2 py-1.5 flex items-center gap-2 bg-white">
          {current?.profile_photo_file_id ? (<img src={withFileAccessToken(`/files/${current.profile_photo_file_id}/thumbnail?w=64`)} className="w-6 h-6 rounded-full object-cover"/>) : (<span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />)}
          <span className="text-sm truncate">{current? (current.name || current.username) : 'Select...'}</span>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-72 rounded-lg border bg-white shadow-lg p-2">
            <input className="w-full border rounded px-2 py-1 text-sm mb-2" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
            <div className="max-h-60 overflow-auto">
              {filtered.length? filtered.map((e:any)=> (
                <button key={e.id} onClick={()=>{ onChange(String(e.id)); setOpen(false); setQ(''); }} className="w-full text-left px-2 py-1 rounded flex items-center gap-2 hover:bg-gray-50">
                  {e.profile_photo_file_id ? (<img src={withFileAccessToken(`/files/${e.profile_photo_file_id}/thumbnail?w=64`)} className="w-6 h-6 rounded-full object-cover"/>) : (<span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />)}
                  <span className="text-sm">{e.name || e.username}</span>
                </button>
              )) : <div className="text-sm text-gray-600 px-2 py-1">No results</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// AUDIT LOG SECTIONS
// ===============================================

// Generic Audit Log Entry display component
function AuditLogEntry({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false);
  const changes = log.changes || {};
  const before = changes.before || {};
  const after = changes.after || {};
  const resolved = log.resolved_values || {};
  const resolvedBefore = log.resolved_values_before || {};

  const getActionColor = (action: string) => {
    switch (action?.toUpperCase()) {
      case 'CREATE': return 'bg-green-100 text-green-800';
      case 'UPDATE': return 'bg-blue-100 text-blue-800';
      case 'DELETE': return 'bg-red-100 text-red-800';
      case 'APPROVE': return 'bg-emerald-100 text-emerald-800';
      case 'REJECT': return 'bg-orange-100 text-orange-800';
      case 'UPLOAD': return 'bg-purple-100 text-purple-800';
      case 'GENERATE_PDF': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const isProposalEntity = log.entity_type === 'proposal' || log.entity_type === 'proposal_draft';
  const entityLabels = ENTITY_FIELD_LABELS[log.entity_type] || {};
  const fieldLabel = (key: string) => {
    if (key.startsWith('pricing__')) {
      const rest = key.substring('pricing__'.length);
      const parts = rest.split('__');
      const label = parts[0].replace(/_/g, ' ');
      if (parts.length > 1) {
        const sub = parts[1] === 'label' ? 'Name' : parts[1] === 'value' ? 'Value' : parts[1] === 'quantity' ? 'Qty' : parts[1] === 'approved' ? 'Approved' : parts[1] === 'pst' ? 'PST' : parts[1] === 'gst' ? 'GST' : parts[1] === 'area_value' ? 'Area' : parts[1] === 'area_unit' ? 'Area unit' : parts[1].replace(/_/g, ' ');
        return `${label} — ${sub}`;
      }
      return label;
    }
    if (key.startsWith('service__')) return `Service: ${key.substring('service__'.length)}`;
    if (key.startsWith('section__')) {
      const rest = key.substring('section__'.length);
      const parts = rest.split('__');
      if (parts.length > 1) {
        const sub = parts[1] === 'title' ? 'Title' : parts[1] === 'content' ? 'Content' : parts[1] === 'images' ? 'Images' : parts[1];
        return `Section "${parts[0]}" — ${sub}`;
      }
      return `Section: ${parts[0]}`;
    }
    return entityLabels[key] || PROJECT_UPDATE_LABELS[key] || key.replace(/_/g, ' ');
  };
  const displayBefore = (key: string) => (resolvedBefore[key] != null && resolvedBefore[key] !== '') ? String(resolvedBefore[key]) : formatValue(before[key]);
  const displayAfter = (key: string) => (resolved[key] != null && resolved[key] !== '') ? String(resolved[key]) : formatValue(after[key]);
  const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])];

  return (
    <div className="px-4 py-3 text-sm hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        {log.actor_avatar_file_id ? (
          <img 
            src={withFileAccessToken(`/files/${log.actor_avatar_file_id}/thumbnail?w=64`)} 
            className="w-8 h-8 rounded-full flex-shrink-0"
            alt=""
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-gray-600">
              {(log.actor_name || 'U')[0].toUpperCase()}
            </span>
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action)}`}>
              {log.action?.replace('_', ' ') || 'ACTION'}
            </span>
            <span className="text-xs text-gray-500">
              {log.timestamp ? new Date(log.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }) : '-'}
            </span>
            {log.actor_name && (
              <>
                <span className="text-gray-300">•</span>
                <span className="text-xs font-medium text-gray-700">{log.actor_name}</span>
              </>
            )}
            {log.affected_user_name && (
              <>
                <span className="text-gray-300">•</span>
                <span className="text-xs text-blue-600">for {log.affected_user_name}</span>
              </>
            )}
          </div>
          
          {/* Summary line */}
          <div className="text-sm text-gray-700 mb-1">
            {changes.title && <span className="font-medium">{changes.title}</span>}
            {changes.file_name && <span className="font-medium">{changes.file_name}</span>}
            {changes.order_number && !changes.title && <span className="font-medium">Order #{changes.order_number}</span>}
            {changes.message && <span>{changes.message}</span>}
            {/* Quick summary for proposal/pricing changes */}
            {isProposalEntity && allKeys.length > 0 && (
              <span className="text-gray-500 text-xs ml-1">({allKeys.length} field{allKeys.length > 1 ? 's' : ''} updated)</span>
            )}
          </div>
          
          {/* Expandable details */}
          {(Object.keys(before).length > 0 || Object.keys(after).length > 0 || Object.keys(changes).length > 0) && (
            <button 
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-blue-600 hover:text-blue-800 mt-1"
            >
              {expanded ? '▼ Hide details' : '▶ Show details'}
            </button>
          )}
          
          {expanded && (
            <div className="mt-2 p-3 bg-gray-50 rounded border text-xs">
              {allKeys.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="font-medium text-gray-500 mb-2">Before</div>
                    {allKeys.map((key) => (
                      <div key={key} className="flex justify-between py-0.5 gap-2">
                        <span className="text-gray-500 shrink-0">{fieldLabel(key)}:</span>
                        <span className="text-gray-700 text-right break-words">{displayBefore(key)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="font-medium text-gray-500 mb-2">After</div>
                    {allKeys.map((key) => (
                      <div key={key} className="flex justify-between py-0.5 gap-2">
                        <span className="text-gray-500 shrink-0">{fieldLabel(key)}:</span>
                        <span className="text-gray-700 text-right break-words">{displayAfter(key)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  {(() => {
                    const flat: Record<string, any> = {};
                    for (const [k, v] of Object.entries(changes)) {
                      if (k === 'before' || k === 'after') continue;
                      if (typeof v === 'object' && v !== null && !Array.isArray(v) && (k === 'deleted_report' || k === 'deleted_proposal' || k === 'deleted_draft')) {
                        Object.assign(flat, v);
                      } else {
                        flat[k] = v;
                      }
                    }
                    return Object.entries(flat).map(([key, val]) => {
                      const display = (resolved[key] != null && resolved[key] !== '') ? String(resolved[key]) : formatValue(val);
                      return (
                        <div key={key} className="flex justify-between py-0.5 gap-2">
                          <span className="text-gray-500 shrink-0">{fieldLabel(key)}:</span>
                          <span className="text-gray-700 text-right break-words">{display}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {log.context && Object.keys(log.context).length > 0 && (
                <div className="mt-2 pt-2 border-t">
                  <div className="font-medium text-gray-500 mb-1">Context</div>
                  {Object.entries(log.context).filter(([_, v]) => v != null).map(([key, val]) => {
                    if (key === 'project_name' || key === 'client_name' || key === 'affected_user_name' || key === 'worker_name' || key === 'approved_by_name') return null;
                    const ctxLabel = key === 'project_id' && log.context?.project_name != null ? 'Project'
                      : key === 'client_id' && log.context?.client_name != null ? 'Client'
                      : key === 'changed_fields' ? 'Changed fields'
                      : key === 'conversion' ? 'Conversion'
                      : key === 'source' ? 'Source'
                      : key.replace(/_/g, ' ');
                    let ctxVal: string;
                    if (key === 'project_id' && log.context?.project_name != null) ctxVal = log.context.project_name;
                    else if (key === 'client_id' && log.context?.client_name != null) ctxVal = log.context.client_name;
                    else if (key === 'changed_fields' && Array.isArray(val)) ctxVal = (val as string[]).map((f: string) => PROJECT_UPDATE_LABELS[f] || f).join(', ');
                    else if (key === 'conversion') ctxVal = val ? 'Yes' : 'No';
                    else if (key === 'source') ctxVal = String(val).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    else ctxVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    return (
                      <div key={key} className="flex justify-between py-0.5">
                        <span className="text-gray-500">{ctxLabel}:</span>
                        <span className="text-gray-700 text-right break-words">{ctxVal}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Reusable Audit Section component
function GenericAuditSection({ projectId, section, title }: { projectId: string; section: string; title: string }) {
  const [month, setMonth] = useState<string>(getCurrentMonthLocal());
  const [offset, setOffset] = useState<number>(0);
  const limit = 50;
  
  const qs = (() => {
    const p = new URLSearchParams();
    p.set('section', section);
    if (month) p.set('month', month);
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    return '?' + p.toString();
  })();
  
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['projectAuditLogs', projectId, section, month, offset],
    queryFn: () => api<any[]>('GET', `/projects/${projectId}/audit-logs${qs}`)
  });
  
  const logs = data || [];
  
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Month:</label>
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setOffset(0);
            }}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      
      <div className="border rounded-lg bg-white overflow-hidden">
        {isFetching && (
          <div className="p-3 bg-gray-50 border-b">
            <span className="text-xs text-gray-500">Loading...</span>
          </div>
        )}
        
        <div className="divide-y">
          {logs.length > 0 ? (
            logs.map((log: any) => <AuditLogEntry key={log.id} log={log} />)
          ) : (
            <div className="p-6 text-center text-gray-500">
              No activity logs found for this period
            </div>
          )}
        </div>
        
        <div className="p-3 bg-gray-50 border-t flex justify-between items-center">
          <span className="text-xs text-gray-500">
            Showing {logs.length} entries
          </span>
          <div>
            <button 
              onClick={() => { setOffset(o => Math.max(0, o - limit)); refetch(); }} 
              disabled={offset <= 0 || isFetching}
              className="px-3 py-1 rounded bg-white border text-sm mr-2 disabled:opacity-50 hover:bg-gray-100"
            >
              Previous
            </button>
            <button 
              onClick={() => { setOffset(o => o + limit); refetch(); }}
              disabled={logs.length < limit || isFetching}
              className="px-3 py-1 rounded bg-white border text-sm disabled:opacity-50 hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Individual section components
function ReportsAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="reports" title="Notes/History Activity Log" />;
}

function FilesAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="files" title="Files Activity Log" />;
}

function ProposalAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="proposal" title="Proposal Activity Log" />;
}

function PricingAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="pricing" title="Pricing Activity Log" />;
}

function EstimateAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="estimate" title="Estimate Activity Log" />;
}

function OrdersAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="orders" title="Orders Activity Log" />;
}

function WorkloadAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="workload" title="Workload Activity Log" />;
}

function GeneralAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="general" title="General Activity Log" />;
}

// ===============================================
// END AUDIT LOG SECTIONS
// ===============================================

function TimesheetAuditSection({ projectId }: { projectId: string }) {
  return <GenericAuditSection projectId={projectId} section="timesheet" title="Timesheet Activity Log" />;
}

function OnSiteLeadsModal({ projectId, originalDivisions, divisionLeads, settings, projectDivisions, employees, canEdit, onClose, onUpdate }: {
  projectId: string,
  originalDivisions: string[],
  divisionLeads: Record<string, string>,
  settings: any,
  projectDivisions: any[],
  employees: any[],
  canEdit: boolean,
  onClose: () => void,
  onUpdate: (updatedLeads: Record<string, string>, updatedDivisions: string[]) => Promise<void>
}){
  const [localDivisions, setLocalDivisions] = useState<string[]>(originalDivisions);
  const [localLeads, setLocalLeads] = useState<Record<string, string>>(divisionLeads);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [openDivisionId, setOpenDivisionId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    setLocalDivisions(originalDivisions);
    setLocalLeads(divisionLeads);
  }, [originalDivisions, divisionLeads]);

  const handleLeadChange = (divId: string, leadId: string) => {
    if (!canEdit) return;
    const updated = { ...localLeads, [divId]: leadId };
    setLocalLeads(updated);
    // Close dropdown after selection
    setOpenDivisionId(null);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      // Pass the same divisions (they come from project_division_ids and cannot be changed here)
      await onUpdate(localLeads, localDivisions);
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update on-site leads');
    } finally {
      setIsSaving(false);
    }
  };

  const updateSearchQuery = (divId: string, query: string) => {
    setSearchQueries(prev => ({ ...prev, [divId]: query }));
  };

  const getFilteredEmployees = (divId: string) => {
    const query = searchQueries[divId] || '';
    if (!query.trim()) return employees;
    const searchLower = query.toLowerCase();
    return employees.filter((emp: any) => {
      const name = getUserDisplayName(emp).toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const username = (emp.username || '').toLowerCase();
      return name.includes(searchLower) || email.includes(searchLower) || username.includes(searchLower);
    });
  };

  const computeDropdownPosition = (divId: string) => {
    const el = triggerRefs.current[divId];
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const PADDING = 8;
    const DESIRED_MAX = 320;
    const MIN_HEIGHT = 160;

    const spaceBelow = window.innerHeight - rect.bottom - PADDING;
    const spaceAbove = rect.top - PADDING;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;

    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(DESIRED_MAX, Math.max(MIN_HEIGHT, available));

    // Keep dropdown within viewport horizontally
    const width = rect.width;
    const maxLeft = window.innerWidth - width - PADDING;
    const left = Math.max(PADDING, Math.min(rect.left, maxLeft));

    if (openUp) {
      // Position dropdown so its bottom aligns just above the trigger
      const bottom = window.innerHeight - rect.top + PADDING;
      setDropdownPosition({ bottom, left, width, maxHeight });
    } else {
      const top = rect.bottom + PADDING;
      setDropdownPosition({ top, left, width, maxHeight });
    }
  };

  const toggleDivisionDropdown = (divId: string) => {
    if (!canEdit) return;
    if (openDivisionId === divId) {
      setOpenDivisionId(null);
      return;
    }
    setOpenDivisionId(divId);
    // Compute immediately (and again via effect below)
    computeDropdownPosition(divId);
  };

  useEffect(() => {
    if (!openDivisionId) {
      setDropdownPosition(null);
      return;
    }
    const update = () => computeDropdownPosition(openDivisionId);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [openDivisionId]);

  // Divisions come from project_division_ids and cannot be modified in this modal
  // No add/remove functionality - only edit leads
  if (localDivisions.length === 0) {
    return null;
  }

  return (
    <OverlayPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-2xl w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">On-site Leads by Division</h2>
              <p className="text-xs text-gray-500 mt-0.5">Assign a lead for each project division</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">
              {localDivisions.length} division{localDivisions.length !== 1 ? 's' : ''} from Project Divisions
            </div>
            <div className="flex items-center gap-2">
              {isSaving && <span className="text-xs text-gray-500">Saving...</span>}
            </div>
          </div>
          <div className="space-y-3">
            {localDivisions.map((divId: string) => {
          // Find division in projectDivisions (check main divisions and subdivisions)
          // Format: "Division" for main division, "Division - Subdivision" for subdivisions
          let divLabel = '';
          let divIcon = '';
          let mainDivisionLabel = ''; // For getting the icon from main division
          
          for (const div of (projectDivisions || [])) {
            if (String(div.id) === String(divId)) {
              // Main division
              divLabel = div.label || divId;
              mainDivisionLabel = div.label || '';
              divIcon = getDivisionIcon(div.label || '');
              break;
            }
            // Check subdivisions - format as "Division - Subdivision"
            for (const sub of (div.subdivisions || [])) {
              if (String(sub.id) === String(divId)) {
                divLabel = `${div.label} - ${sub.label}`;
                mainDivisionLabel = div.label || '';
                divIcon = getDivisionIcon(div.label || '');
                break;
              }
            }
            if (divLabel) break;
          }
          
          // Fallback if not found
          if (!divLabel) {
            divLabel = divId;
            divIcon = '';
          }
          
          const leadId = localLeads[divId] || '';
          const lead = leadId ? employees.find((e:any) => String(e.id) === String(leadId)) : null;
          const filteredEmployeesForDiv = getFilteredEmployees(divId);
          const isExpanded = openDivisionId === divId;
          
          return (
            <div key={divId} className="space-y-2">
              <div className="flex items-center gap-2">
                {divIcon && <span className="text-lg">{divIcon}</span>}
                <span className="text-sm font-medium text-gray-900">{divLabel}</span>
              </div>
              <div className="relative">
                {/* Dropdown trigger */}
                <div
                  ref={(el) => { triggerRefs.current[divId] = el; }}
                  onClick={() => toggleDivisionDropdown(divId)}
                  className={`flex items-center gap-2 border rounded px-3 py-1.5 text-sm cursor-pointer ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}`}
                >
                  {lead ? (
                    <>
                      <UserAvatar user={lead} size="w-6 h-6" showTooltip={false} />
                      <span className="flex-1 text-left">{getUserDisplayName(lead)}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium">
                        —
                      </div>
                      <span className="flex-1 text-left text-gray-500">Select lead...</span>
                    </>
                  )}
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Dropdown content - Using fixed positioning to appear above footer */}
                {isExpanded && canEdit && dropdownPosition && (
                  <>
                    {/* Backdrop to close dropdown */}
                    <OverlayPortal>
                      <div 
                        className="fixed inset-0 z-[60]" 
                        onClick={() => setOpenDivisionId(null)}
                      />
                    </OverlayPortal>
                    {/* Dropdown */}
                    <div 
                      className="fixed z-[70] bg-white border rounded-lg shadow-xl overflow-hidden flex flex-col"
                      style={{
                        ...(dropdownPosition.top !== undefined ? { top: `${dropdownPosition.top}px` } : {}),
                        ...(dropdownPosition.bottom !== undefined ? { bottom: `${dropdownPosition.bottom}px` } : {}),
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {dropdownPosition.bottom !== undefined ? (
                        <>
                          {/* Employee list (top) */}
                          <div className="overflow-y-auto flex-1">
                            {/* Option to clear selection */}
                            <div
                              onClick={() => handleLeadChange(divId, '')}
                              className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${
                                !leadId ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium">
                                —
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">No Lead</div>
                                <div className="text-xs text-gray-600">Clear selection</div>
                              </div>
                            </div>
                            {filteredEmployeesForDiv.length === 0 ? (
                              <div className="text-xs text-gray-500 text-center py-4">No employees found matching your search.</div>
                            ) : (
                              filteredEmployeesForDiv.map((emp: any) => {
                                const isSelected = String(emp.id) === String(leadId);
                                return (
                                  <div
                                    key={emp.id}
                                    onClick={() => handleLeadChange(divId, String(emp.id))}
                                    className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${
                                      isSelected ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <UserAvatar user={emp} size="w-8 h-8" showTooltip={false} />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-900">{getUserDisplayName(emp)}</div>
                                      {emp.email && (
                                        <div className="text-xs text-gray-600 truncate">{emp.email}</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Search input (bottom) */}
                          <div className="p-2 border-t bg-white">
                            <input
                              type="text"
                              value={searchQueries[divId] || ''}
                              onChange={(e) => updateSearchQuery(divId, e.target.value)}
                              placeholder="Search by name, email, or username..."
                              className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Search input (top) */}
                          <div className="p-2 border-b">
                            <input
                              type="text"
                              value={searchQueries[divId] || ''}
                              onChange={(e) => updateSearchQuery(divId, e.target.value)}
                              placeholder="Search by name, email, or username..."
                              className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          </div>

                          {/* Employee list (bottom) */}
                          <div className="overflow-y-auto flex-1">
                            {/* Option to clear selection */}
                            <div
                              onClick={() => handleLeadChange(divId, '')}
                              className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${
                                !leadId ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium">
                                —
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">No Lead</div>
                                <div className="text-xs text-gray-600">Clear selection</div>
                              </div>
                            </div>
                            {filteredEmployeesForDiv.length === 0 ? (
                              <div className="text-xs text-gray-500 text-center py-4">No employees found matching your search.</div>
                            ) : (
                              filteredEmployeesForDiv.map((emp: any) => {
                                const isSelected = String(emp.id) === String(leadId);
                                return (
                                  <div
                                    key={emp.id}
                                    onClick={() => handleLeadChange(divId, String(emp.id))}
                                    className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${
                                      isSelected ? 'bg-indigo-50 border-l-2 border-indigo-500' : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    <UserAvatar user={emp} size="w-8 h-8" showTooltip={false} />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-gray-900">{getUserDisplayName(emp)}</div>
                                      {emp.email && (
                                        <div className="text-xs text-gray-600 truncate">{emp.email}</div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
          </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl relative z-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

function ProjectDescriptionCard({
  proj,
  hasEditPermission,
  useDesignSystem,
  isLeakInvestigation,
  className,
  onEdit,
}: {
  proj: any;
  hasEditPermission: boolean;
  useDesignSystem?: boolean;
  isLeakInvestigation?: boolean;
  className?: string;
  onEdit: () => void;
}) {
  const visible = !!(proj?.description?.trim() || hasEditPermission);
  if (!visible) return null;

  const sectionDescription = proj?.is_bidding
    ? 'Additional notes about this opportunity.'
    : isLeakInvestigation
      ? 'Additional notes about this leak investigation.'
      : 'Additional notes about this project.';

  if (useDesignSystem) {
    return (
      <AppCard className={className}>
        <AppSectionHeader
          title="Description"
          description={sectionDescription}
          {...appSectionPresetProps('description')}
          action={
            hasEditPermission ? <AppHeroEditButton title="Edit Description" onClick={onEdit} /> : null
          }
        />
        <p
          className={uiCx(
            uiTypography.body,
            'mt-3 whitespace-pre-wrap leading-snug',
            hasEditPermission && 'cursor-pointer',
          )}
          onClick={() => hasEditPermission && onEdit()}
        >
          {proj?.description?.trim() ? (
            proj.description.trim()
          ) : (
            <span className="text-gray-400 italic">No description</span>
          )}
        </p>
      </AppCard>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-md transition-shadow duration-200 hover:border-gray-300/80 hover:shadow-lg">
        <div className="p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Description</div>
            {hasEditPermission ? <AppHeroEditButton title="Edit Description" onClick={onEdit} /> : null}
          </div>
          <p
            className={uiCx(
              'text-sm leading-snug text-gray-700 whitespace-pre-wrap',
              hasEditPermission && 'cursor-pointer',
            )}
            onClick={() => hasEditPermission && onEdit()}
          >
            {proj?.description?.trim() ? (
              proj.description.trim()
            ) : (
              <span className="text-gray-400 italic">No description</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function LastReportsCard({ reports, useDesignSystem }: { reports: Report[]; useDesignSystem?: boolean }){
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>(''); // Empty string = all categories
  const { data: settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const reportCategories = (settings?.report_categories || []) as any[];
  const visibleReports = useMemo(
    () => reports.filter((r) => !isHiddenReportNote(r)),
    [reports]
  );

  const commercialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'commercial' && !isHiddenReportCategory(cat);
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);
  
  const productionCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'production' && !isHiddenReportCategory(cat);
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);
  
  const financialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'financial' && !isHiddenReportCategory(cat);
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    counts[''] = visibleReports.length;
    visibleReports.forEach(report => {
      const catId = report.category_id || '';
      counts[catId] = (counts[catId] || 0) + 1;
    });
    return counts;
  }, [visibleReports]);

  const recentReports = useMemo(() => {
    let filtered = [...visibleReports];
    if (selectedCategoryFilter) {
      filtered = filtered.filter(r => r.category_id === selectedCategoryFilter);
    }
    return filtered.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    }).slice(0, 5);
  }, [visibleReports, selectedCategoryFilter]);

  const categoryFilterOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: '', label: `All (${categoryCounts[''] || 0})` },
    ];
    const pushGroup = (label: string, cats: typeof commercialCategories) => {
      cats.forEach((cat) => {
        const val = cat.value || cat.label;
        const count = categoryCounts[val || ''] || 0;
        opts.push({ value: String(val), label: `${label}: ${cat.label} (${count})` });
      });
    };
    if (commercialCategories.length) pushGroup('Commercial', commercialCategories);
    if (productionCategories.length) pushGroup('Production', productionCategories);
    if (financialCategories.length) pushGroup('Financial', financialCategories);
    return opts;
  }, [categoryCounts, commercialCategories, productionCategories, financialCategories]);

  const notesBody =
    recentReports.length > 0 ? (
      <div className="space-y-2">
        {recentReports.map((report) => (
          <div
            key={report.id}
            className={uiCx(
              uiRadius.control,
              uiBorders.subtle,
              'p-2 transition-colors hover:bg-gray-50',
            )}
          >
            <div className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>
              {report.title || 'Untitled Note'}
            </div>
            {report.description && (
              <div className={uiCx(uiTypography.helper, 'mt-1 line-clamp-2')}>{report.description}</div>
            )}
            {report.created_at && (
              <div className={uiCx(uiTypography.helper, 'mt-1')}>
                {new Date(report.created_at).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>
    ) : useDesignSystem ? (
      <AppEmptyState title="No notes yet" className="py-4" />
    ) : (
      <div className="text-sm text-gray-500">No notes yet</div>
    );

  if (useDesignSystem) {
    return (
      <AppCard className="flex h-full min-h-0 flex-col">
        <AppSectionHeader
          title="Last Notes"
          description="Most recent project notes, filtered by category."
          {...appSectionPresetProps('notesHistory')}
          action={
            <AppSelect
              label=""
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              options={categoryFilterOptions}
              className="min-w-[10rem]"
            />
          }
        />
        <div className="mt-3 min-h-0 flex-1">{notesBody}</div>
      </AppCard>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">Last Notes</h4>
        <select
          value={selectedCategoryFilter}
          onChange={(e) => setSelectedCategoryFilter(e.target.value)}
          className="px-2 py-1 rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent min-w-[150px]"
        >
          <option value="">All ({categoryCounts[''] || 0})</option>
          {commercialCategories.length > 0 && (
            <optgroup label="📌 Commercial">
              {commercialCategories.map(cat => {
                const count = categoryCounts[cat.value || ''] || 0;
                return (
                  <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                    {cat.label} ({count})
                  </option>
                );
              })}
            </optgroup>
          )}
          {productionCategories.length > 0 && (
            <optgroup label="📌 Production / Execution">
              {productionCategories.map(cat => {
                const count = categoryCounts[cat.value || ''] || 0;
                return (
                  <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                    {cat.label} ({count})
                  </option>
                );
              })}
            </optgroup>
          )}
          {financialCategories.length > 0 && (
            <optgroup label="📌 Financial">
              {financialCategories.map(cat => {
                const count = categoryCounts[cat.value || ''] || 0;
                return (
                  <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                    {cat.label} ({count})
                  </option>
                );
              })}
            </optgroup>
          )}
        </select>
      </div>
      {notesBody}
    </div>
  );
}

function ProjectTeamCard({ projectId, employees, canManageMembers, useDesignSystem }: { projectId: string, employees: any[], canManageMembers: boolean, useDesignSystem?: boolean }){
  const queryClient = useQueryClient();
  const { data: shifts = [] } = useQuery({
    queryKey: ['projectShifts', projectId],
    queryFn: () => projectId ? api<any[]>('GET', `/dispatch/projects/${projectId}/shifts`) : Promise.resolve([]),
    enabled: !!projectId,
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['employeesDirectory', 'all'],
    queryFn: () => api<any[]>('GET', '/employees?limit=5000'),
    staleTime: 300_000,
  });
  const { data: aclMembers = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => projectId ? api<any[]>('GET', `/projects/${projectId}/members`) : Promise.resolve([]),
    enabled: !!projectId,
  });
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [savingMember, setSavingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  // Extract unique worker IDs from shifts
  const workerIds = useMemo(() => {
    const ids = new Set<string>();
    shifts.forEach((shift: any) => {
      if (shift.worker_id) {
        ids.add(String(shift.worker_id));
      }
    });
    return Array.from(ids);
  }, [shifts]);

  // Get employee details for these IDs
  const teamMembers = useMemo(() => {
    return workerIds.map(wid => employees.find((e: any) => String(e.id) === String(wid))).filter(Boolean);
  }, [workerIds, employees]);
  const aclMemberUserIds = useMemo(() => new Set((aclMembers || []).map((m: any) => String(m.user_id))), [aclMembers]);
  const userLabel = (u: any) => (u?.name || u?.username || u?.email_personal || u?.email || String(u?.id || '')).toString();
  const availableEmployees = useMemo(
    () =>
      sortByLabel(
        (allUsers || []).filter((u: any) => u?.id && !aclMemberUserIds.has(String(u.id))),
        userLabel,
      ),
    [allUsers, aclMemberUserIds],
  );

  const onAddMember = async () => {
    if (!selectedUserId) return;
    setSavingMember(true);
    try {
      await api('POST', `/projects/${projectId}/members`, { user_id: selectedUserId });
      setSelectedUserId('');
      setShowAddMember(false);
      await queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      toast.success('Member added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add member');
    } finally {
      setSavingMember(false);
    }
  };

  const onRemoveMember = async (member: any) => {
    setRemovingMemberId(String(member.user_id));
    try {
      await api('DELETE', `/projects/${projectId}/members/${member.user_id}`);
      await queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      toast.success('Member removed');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove member');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const memberUserOptions = useMemo(
    () => availableEmployees.map((e: any) => mapEmployeeToAppUserSelect(e)),
    [availableEmployees],
  );

  const resolveMemberUser = useCallback(
    (member: any) => {
      const uid = String(member.user_id);
      const fromDir =
        employees.find((e: any) => String(e.id) === uid) ||
        allUsers.find((u: any) => String(u.id) === uid);
      if (fromDir) return mapEmployeeToAppUserSelect(fromDir);
      return {
        id: uid,
        name: (member.name || member.username || 'User') as string,
        username: member.username,
      };
    },
    [employees, allUsers],
  );

  const addPeopleControl = canManageMembers ? (
    useDesignSystem ? (
      <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowAddMember((v) => !v)}>
        {showAddMember ? 'Cancel' : 'Add people'}
      </AppButton>
    ) : (
      <button
        onClick={() => setShowAddMember((v) => !v)}
        className="px-2 py-1 rounded border text-xs bg-white hover:bg-gray-50"
      >
        Add people
      </button>
    )
  ) : null;

  if (useDesignSystem) {
    return (
      <AppCard className="flex h-full min-h-0 flex-col">
        <AppSectionHeader
          title="Project Team"
          description="Members with project access and workers scheduled on shifts."
          {...appSectionPresetProps('contact')}
          action={addPeopleControl}
        />
        <div className={uiCx('mt-3 flex min-h-0 flex-1 flex-col', uiSpacing.sectionStack)}>
          {showAddMember && canManageMembers && (
            <div className={uiCx('grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end')}>
              <AppUserSelect
                mode="single"
                label="Team member"
                users={memberUserOptions}
                value={selectedUserId}
                onChange={setSelectedUserId}
                placeholder="Search user…"
                fieldHint="Team member\n\nGrant this user access to the opportunity in MK Hub."
              />
              <AppButton
                type="button"
                size="sm"
                variant="secondary"
                className="sm:mb-0.5"
                disabled={!selectedUserId || savingMember}
                loading={savingMember}
                onClick={onAddMember}
              >
                Add
              </AppButton>
            </div>
          )}

          {(aclMembers || []).length > 0 ? (
            <div className={uiCx(uiBorders.subtle, uiRadius.control, uiColors.surface, 'divide-y overflow-hidden')}>
              {(aclMembers || []).map((member: any) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50"
                >
                  <AppUserAvatar user={resolveMemberUser(member)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className={uiCx(uiTypography.body, 'truncate font-medium text-gray-900')}>
                      {member.name || member.username}
                    </div>
                    <AppBadge variant={member.is_creator ? 'info' : 'neutral'} className="mt-1">
                      {member.is_creator ? 'Creator' : member.member_role || 'Member'}
                    </AppBadge>
                  </div>
                  {canManageMembers && !member.is_creator ? (
                    <AppListRowIconButton
                      preset="delete"
                      label="Remove member"
                      loading={removingMemberId === String(member.user_id)}
                      disabled={removingMemberId === String(member.user_id)}
                      onClick={() => onRemoveMember(member)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <AppEmptyState
              title="No team members yet"
              description="Add people who need access to this opportunity."
              action={
                canManageMembers ? (
                  <AppButton type="button" size="sm" variant="secondary" onClick={() => setShowAddMember(true)}>
                    Add people
                  </AppButton>
                ) : undefined
              }
            />
          )}

          {teamMembers.length > 0 ? (
            <div className={uiCx('border-t border-gray-100 pt-3', uiSpacing.sectionStack)}>
              <p className={uiTypography.overline}>Scheduled workers</p>
              <div className={uiUserSelect.chipRow}>
                {teamMembers.map((member: any) => (
                  <span key={member.id} className={uiUserSelect.chip}>
                    <AppUserAvatar user={mapEmployeeToAppUserSelect(member)} size="sm" className={uiUserSelect.chipAvatar} />
                    <span className="truncate">{member.name || member.username}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </AppCard>
    );
  }

  const teamBody = (
    <>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">Project Team</h4>
        {addPeopleControl}
      </div>

      {showAddMember && canManageMembers && (
        <div className="mb-3 p-2 rounded border bg-gray-50 flex items-center gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 px-2 py-1.5 rounded border text-sm"
          >
            <option value="">Select user...</option>
            {availableEmployees.map((e: any) => (
              <option key={String(e.id)} value={String(e.id)}>
                {userLabel(e)}
              </option>
            ))}
          </select>
          <button
            onClick={onAddMember}
            disabled={!selectedUserId || savingMember}
            className="px-3 py-1.5 rounded bg-brand-red text-white text-sm disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {(aclMembers || []).length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {(aclMembers || []).map((member: any) => (
            <div key={member.id} className="flex items-center gap-2 p-2 rounded border hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {(member.name||member.username||'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{member.name||member.username}</div>
                <div className="text-[11px] text-gray-500">
                  {member.is_creator ? 'Creator' : (member.member_role || 'Member')}
                </div>
              </div>
              {canManageMembers && !member.is_creator && (
                <button
                  onClick={() => onRemoveMember(member)}
                  disabled={removingMemberId === String(member.user_id)}
                  className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">No team members assigned yet</div>
      )}
      {teamMembers.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs font-medium text-gray-500 mb-2">Scheduled workers</div>
          <div className="flex flex-wrap gap-1.5">
            {teamMembers.map((member: any) => (
              <span key={member.id} className="px-2 py-1 rounded-full border text-xs bg-white">
                {member.name || member.username}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return <div className="rounded-xl border bg-white p-4">{teamBody}</div>;
}

function ProjectTabCards({ availableTabs, tabCounts, onTabClick, proj, currentTab, useDesignSystem, isHeroCollapsed, headerEnd }: { 
  availableTabs: readonly ('overview'|'reports'|'dispatch'|'timesheet'|'files'|'documents'|'proposal'|'pricing'|'estimate'|'orders'|'safety')[], 
  tabCounts?: Partial<Record<string, number>>,
  onTabClick: (tab: typeof availableTabs[number] | 'overview' | null) => void,
  proj: any,
  currentTab: 'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'documents'|'proposal'|'pricing'|'estimate'|'orders'|'safety'|null,
  useDesignSystem?: boolean,
  isHeroCollapsed?: boolean,
  headerEnd?: ReactNode,
}){
  const tabConfig: Record<string, { label: string, icon: string }> = {
    overview: { label: 'Overview', icon: '📊' },
    reports: { label: 'Notes/History', icon: '📝' },
    dispatch: { label: 'Workload', icon: '👷' },
    timesheet: { label: 'Timesheet', icon: '⏰' },
    files: { label: 'Files', icon: '📁' },
    documents: { label: 'Documents', icon: '📄' },
    proposal: { label: 'Proposal', icon: '📄' },
    pricing: { label: 'Pricing', icon: '💰' },
    estimate: { label: 'Estimate', icon: '💰' },
    orders: { label: 'Orders', icon: '🛒' },
    safety: { label: 'Safety', icon: '🦺' },
  };

  // Include 'overview' and filter available tabs (hide 'orders' tab from UI)
  const tabsToShow: (typeof availableTabs[number] | 'overview')[] = ['overview', ...availableTabs.filter(t => t !== 'overview' && t !== 'orders')];

  if (useDesignSystem) {
    const appTabItems = tabsToShow.map((tabKey) => ({
      key: tabKey,
      label: tabConfig[tabKey]?.label || tabKey,
      count: tabCounts?.[tabKey],
    }));
    const activeKey = currentTab === null ? 'overview' : currentTab;
    return (
      <AppCard bodyClassName={isHeroCollapsed ? 'p-2.5' : 'p-3'}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <AppTabs
            className="min-w-0 flex-1"
            tabs={appTabItems}
            value={activeKey}
            onChange={(key) => onTabClick(key === 'overview' ? null : (key as typeof availableTabs[number]))}
          />
          {headerEnd ? <div className="shrink-0 sm:ml-auto">{headerEnd}</div> : null}
        </div>
      </AppCard>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex flex-wrap gap-2">
        {tabsToShow.map(tabKey => {
          const config = tabConfig[tabKey];
          if (!config) return null;
          const isActive = (currentTab === null && tabKey === 'overview') || currentTab === tabKey;
          return (
            <button
              key={tabKey}
              onClick={() => onTabClick(tabKey === 'overview' ? null : tabKey)}
              className={`flex-1 min-w-[120px] px-3 py-1.5 text-sm font-bold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                isActive
                  ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 hover:border-red-400'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
              }`}
            >
              <span className="text-xs leading-none">{config.icon}</span>
              {config.label}
              {typeof tabCounts?.[tabKey] === 'number' ? (
                <AppTabCountBadge count={tabCounts[tabKey]!} isActive={isActive} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectQuickEdit({ projectId, proj, settings }:{ projectId:string, proj:any, settings:any }){
  const location = useLocation();
  const [status, setStatus] = useState<string>(proj?.status_label||'');
  const [divs, setDivs] = useState<string[]>(Array.isArray(proj?.division_ids)? proj.division_ids : []);
  const [progress, setProgress] = useState<number>(Number(proj?.progress||0));
  const [estimator, setEstimator] = useState<string>(proj?.estimator_id||'');
  const [divisionLeads, setDivisionLeads] = useState<Record<string, string>>(proj?.division_onsite_leads || {});
  const [projectDivs, setProjectDivs] = useState<string[]>(Array.isArray(proj?.project_division_ids)? proj.project_division_ids : []);
  const statuses = (settings?.project_statuses||[]) as any[];
  const divisions = (settings?.divisions||[]) as any[];
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });
  const { data:projectDivisions } = useQuery({ queryKey:PROJECT_DIVISIONS_QUERY_KEY, queryFn: ()=>api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const projectBusinessLine = useMemo(
    () => resolveProjectBusinessLine(proj?.business_line, location.pathname),
    [proj?.business_line, location.pathname]
  );
  const projectDivisionsForPicker = useMemo(
    () => filterProjectDivisionsForBusinessLine(projectDivisions, projectBusinessLine),
    [projectDivisions, projectBusinessLine]
  );
  
  useEffect(()=>{
    setProjectDivs(Array.isArray(proj?.project_division_ids)? proj.project_division_ids : []);
  }, [proj?.project_division_ids]);
  const toggleDiv = (id:string)=> {
    setDivs(prev=> {
      const newDivs = prev.includes(id)? prev.filter(x=>x!==id) : [...prev, id];
      // Remove lead for division if division is removed
      if (prev.includes(id) && !newDivs.includes(id)) {
        setDivisionLeads(prevLeads => {
          const newLeads = { ...prevLeads };
          delete newLeads[id];
          return newLeads;
        });
      }
      return newDivs;
    });
  };
  const setDivisionLead = (divisionId: string, leadId: string) => {
    setDivisionLeads(prev => ({ ...prev, [divisionId]: leadId }));
  };
  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-2">Quick Edit</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5">Status</label>
          <select className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">Select...</option>
            {sortByLabel(statuses, (s:any)=> (s.label||'').toString()).map((s:any)=> <option key={s.label} value={s.label}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5">Progress</label>
          <div className="flex items-center gap-2"><input type="range" min={0} max={100} value={progress} onChange={e=>setProgress(Number(e.target.value||0))} className="flex-1" /><span className="w-10 text-right text-xs">{progress}%</span></div>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1.5">Divisions</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {divs.map((id)=>{
              const d = divisions.find((x:any)=> String(x.id||x.label||x.value)===id);
              const bg = d?.meta?.color || '#eef2f7';
              const ab = d?.meta?.abbr || d?.label || id;
              return (
                <span key={id} className="px-2 py-1 rounded-full border text-xs flex items-center gap-1" style={{ backgroundColor: bg }}>
                  {ab}
                  <button onClick={()=> setDivs(prev=> prev.filter(x=>x!==id))} className="ml-1 text-[10px]">âœ•</button>
                </span>
              );
            })}
            <AddDivisionDropdown divisions={divisions} selected={divs} onAdd={(id)=> setDivs(prev=> prev.includes(id)? prev : [...prev, id])} />
          </div>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">Project Divisions</label>
          <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-2">
            {(projectDivisionsForPicker||[]).map((div:any)=>{
              const divId = String(div.id);
              const divSelected = projectDivs.includes(divId);
              const subdivisions = div.subdivisions || [];
              
              return (
                <div key={divId} className="border rounded p-2">
                  <button
                    type="button"
                    onClick={()=> setProjectDivs(prev=> prev.includes(divId)? prev.filter(x=>x!==divId) : [...prev, divId])}
                    className={`w-full text-left px-2 py-1 rounded text-sm font-medium flex items-center gap-2 ${
                      divSelected? 'bg-[#7f1010] text-white': 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-lg">{getDivisionIcon(div.label)}</span>
                    <span>{div.label}</span>
                  </button>
                  {subdivisions.length > 0 && (
                    <div className="mt-1 pl-6 space-y-1">
                      {subdivisions.map((sub:any)=>{
                        const subId = String(sub.id);
                        const subSelected = projectDivs.includes(subId);
                        return (
                          <button
                            key={subId}
                            type="button"
                            onClick={()=> setProjectDivs(prev=> prev.includes(subId)? prev.filter(x=>x!==subId) : [...prev, subId])}
                            className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 ${
                              subSelected? 'bg-[#a31414] text-white': 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            <span className="text-base">{getDivisionIcon(div.label)}</span>
                            <span>• {sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {(!projectDivisionsForPicker || projectDivisionsForPicker.length === 0) && (
              <div className="text-xs text-gray-500">No project divisions available.</div>
            )}
          </div>
        </div>
        <EmployeeSelect label="Estimator" value={estimator} onChange={setEstimator} employees={employees||[]} />
        {!(proj?.is_bidding) && divs.length > 0 && (
          <div className="col-span-2">
            <label className="text-xs text-gray-600 mb-2 block">On-site Leads by Division</label>
            <div className="space-y-2">
              {divs.map((divId) => {
                const div = divisions.find((d:any) => String(d.id||d.label||d.value) === divId);
                const divLabel = div?.meta?.abbr || div?.label || divId;
                const divColor = div?.meta?.color || '#eef2f7';
                return (
                  <div key={divId} className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded text-xs border flex-shrink-0" style={{ backgroundColor: divColor, minWidth: '60px', textAlign: 'center' }}>{divLabel}</span>
                    <select 
                      className="flex-1 border rounded px-2 py-1.5 text-sm" 
                      value={divisionLeads[divId] || ''} 
                      onChange={e => setDivisionLead(divId, e.target.value)}
                    >
                      <option value="">Select on-site lead...</option>
                      {(employees||[]).map((emp:any) => (
                        <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="col-span-2 text-right">
          <button onClick={async()=>{ 
            try{ 
              // Clean up division_onsite_leads to only include divisions that are still selected
              const cleanedLeads: Record<string, string> = {};
              divs.forEach(divId => {
                if (divisionLeads[divId]) {
                  cleanedLeads[divId] = divisionLeads[divId];
                }
              });
              const payload: any = { 
                status_label: status||null, 
                division_ids: divs, // Legacy
                project_division_ids: projectDivs.length > 0 ? projectDivs : null, // New
                progress, 
                estimator_id: estimator||null
              };
              // Only include division_onsite_leads if not opportunity-style (bidding or leak investigation)
              if (!(proj?.is_bidding)) {
                payload.division_onsite_leads = cleanedLeads;
              }
              await api('PATCH', `/projects/${projectId}`, payload); 
              toast.success('Saved'); 
              location.reload(); 
            }catch(_e){ 
              toast.error('Failed to save'); 
            } 
          }} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

// Division icons use images from @/icons via DivisionIcon component
const getDivisionIcon = (label: string, suppressNativeTitle?: boolean) => <DivisionIcon label={label} size={20} suppressNativeTitle={suppressNativeTitle} />;

// Edit Status Modal Component
function EditStatusModal({ projectId, currentStatus, currentStatusLabel, settings, isBidding, designSystem, onClose, onSave }: {
  projectId: string;
  currentStatus: string;
  currentStatusLabel: string;
  settings: any;
  isBidding?: boolean;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [selectedStatusId, setSelectedStatusId] = useState(currentStatus);
  const [statusNotes, setStatusNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const allProjectStatuses = (settings?.project_statuses || []) as any[];
  const reportCategories = (settings?.report_categories || []) as any[];

  const commercialGeneralCategoryId = useMemo(() => {
    const cats = reportCategories;
    const commercialGeneral = cats.find(
      (c: any) => c.meta?.group === 'commercial' && String(c.value || '').toLowerCase() === 'general'
    );
    if (commercialGeneral?.value != null && commercialGeneral.value !== '') {
      return String(commercialGeneral.value);
    }
    const byValue = cats.find((c: any) => String(c.value || '').toLowerCase() === 'general');
    if (byValue?.value != null && byValue.value !== '') {
      return String(byValue.value);
    }
    const byLabel = cats.find(
      (c: any) => c.meta?.group === 'commercial' && String(c.label || '').trim().toLowerCase() === 'general'
    );
    if (byLabel?.value != null && byLabel.value !== '') {
      return String(byLabel.value);
    }
    if (import.meta.env.DEV) {
      console.warn('Commercial General report category not found in settings; using fallback "general"');
    }
    return 'general';
  }, [reportCategories]);
  
  const projectStatuses = useMemo(() => {
    if (isBidding) {
      return filterStatusesForOpportunity(allProjectStatuses);
    }
    return filterStatusesForProject(allProjectStatuses);
  }, [allProjectStatuses, isBidding]);

  const handleSave = async () => {
    const noteText = statusNotes.trim();
    try {
      setSaving(true);
      const selectedStatus = projectStatuses.find((s: any) => String(s.id) === String(selectedStatusId));
      await api('PATCH', `/projects/${projectId}`, {
        status_id: selectedStatusId || null,
        status_label: selectedStatus?.label || null
      });

      if (noteText) {
        try {
          const statusChanged = String(currentStatus || '') !== String(selectedStatusId || '');
          await api('POST', `/projects/${projectId}/reports`, {
            title: 'Status Change',
            category_id: commercialGeneralCategoryId,
            description: noteText,
            images: {
              status_change: {
                from_label: currentStatusLabel || '—',
                to_label: selectedStatus?.label || '—',
                from_id: currentStatus || null,
                to_id: selectedStatusId || null,
                status_changed: statusChanged,
              },
            },
          });
        } catch (noteErr: any) {
          toast.error(noteErr?.response?.data?.detail || 'Status updated, but failed to add note');
          await queryClient.invalidateQueries({ queryKey: ['projectReports', projectId] });
          await onSave();
          return;
        }
      }

      toast.success('Status updated');
      await queryClient.invalidateQueries({ queryKey: ['projectReports', projectId] });
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = projectStatuses.map((status: any) => ({
    value: String(status.id),
    label: String(status.label || status.id),
  }));

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Status"
        description={
          isBidding
            ? 'Update the workflow status for this opportunity'
            : 'Update the workflow status for this project'
        }
        formWidth="comfortable"
        quickInfo={opportunityEditStatusQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || projectStatuses.length === 0}
              loading={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          {projectStatuses.length === 0 ? (
            <p className={uiTypography.helper}>
              No statuses available. In System Settings → project statuses, enable &quot;Show in{' '}
              {isBidding ? 'opportunities' : 'projects'}&quot; for at least one status.
            </p>
          ) : (
            <AppSelect
              label="Status"
              value={selectedStatusId}
              onChange={(e) => setSelectedStatusId(e.target.value)}
              options={statusOptions}
              fieldHint="Status\n\nPipeline stage for this opportunity. Shown on the overview and in opportunity lists."
            />
          )}
          <AppTextarea
            label="Notes (optional)"
            placeholder="Explain why the status is changing…"
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
            rows={4}
            fieldHint="Notes (optional)\n\nOptional context saved as a note when you change status."
          />
        </div>
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Status</h2>
              <p className="text-xs text-gray-500 mt-0.5">Update the workflow status for this project</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Status</label>
              {projectStatuses.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No statuses available. In System Settings → project statuses, enable &quot;Show in {isBidding ? 'opportunities' : 'projects'}&quot; for at least one status.
                </div>
              ) : (
                <select
                  value={selectedStatusId}
                  onChange={(e) => setSelectedStatusId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                >
                  {projectStatuses.map((status: any) => (
                    <option key={status.id} value={status.id}>
                      {status.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Notes (optional)</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 min-h-[88px]"
                placeholder="Explain why the status is changing…"
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                rows={4}
              />
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || projectStatuses.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

// Edit Project Name Modal Component
function EditProjectNameModal({ projectId, currentName, designSystem, onClose, onSave }: {
  projectId: string;
  currentName: string;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [projectName, setProjectName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProjectName(currentName);
  }, [currentName]);

  const handleSave = async () => {
    if (!projectName.trim()) {
      toast.error('Project name cannot be empty');
      return;
    }

    if (projectName.trim() === currentName) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        name: projectName.trim()
      });
      toast.success('Project name updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update project name');
    } finally {
      setSaving(false);
    }
  };

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Project Name"
        description="Rename the opportunity as it appears across the app"
        formWidth="comfortable"
        quickInfo={opportunityEditNameQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppInput
          label="Project Name *"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Enter project name"
          autoFocus
          fieldHint="Project Name\n\nPrimary title for this opportunity in MK Hub."
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            else if (e.key === 'Escape') onClose();
          }}
        />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Project Name</h2>
              <p className="text-xs text-gray-500 mt-0.5">Rename the project as it appears across the app</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                placeholder="Enter project name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                  } else if (e.key === 'Escape') {
                    onClose();
                  }
                }}
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <div className="font-medium mb-1">Important Information</div>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Changing the project name will automatically update the associated folder name in the file system.</li>
                    <li>The project code (e.g., MK-00001/00001-2025) cannot be changed and will remain the same.</li>
                    <li>This change will be reflected across all project views and reports.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !projectName.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

// Edit Description Modal Component
function EditDescriptionModal({ projectId, currentDescription, entityLabel, designSystem, onClose, onSave }: {
  projectId: string;
  currentDescription: string;
  entityLabel: string;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [description, setDescription] = useState(currentDescription);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDescription(currentDescription);
  }, [currentDescription]);

  const handleSave = async () => {
    const trimmed = description.trim();
    const currentTrimmed = currentDescription.trim();
    if (trimmed === currentTrimmed) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        description: trimmed || null,
      });
      toast.success('Description updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update description');
    } finally {
      setSaving(false);
    }
  };

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Description"
        description={`General notes and context for this ${entityLabel}`}
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppTextarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={`Add notes or general information about this ${entityLabel}...`}
          rows={6}
          autoFocus
        />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Description</h2>
              <p className="text-xs text-gray-500 mt-0.5">General notes and context for this {entityLabel}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 min-h-[160px] resize-y"
              placeholder={`Add notes or general information about this ${entityLabel}...`}
              autoFocus
            />
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

// Edit Site Modal Component
function EditSiteModal({ projectId, project, designSystem, onClose, onSave, onSiteRecordUpdated }: {
  projectId: string;
  project: any;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
  onSiteRecordUpdated?: () => void | Promise<void>;
}) {
  const [siteId, setSiteId] = useState(project?.site_id || '');
  const [saving, setSaving] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [siteEditOpen, setSiteEditOpen] = useState(false);

  useEffect(() => {
    setSiteId(project?.site_id || '');
  }, [project?.site_id]);

  const loadSites = useCallback(async () => {
    if (!project?.client_id) {
      setSites([]);
      return;
    }
    setLoadingSites(true);
    try {
      const data = await api<any[]>('GET', `/clients/${encodeURIComponent(String(project.client_id))}/sites`);
      setSites(data || []);
    } catch {
      setSites([]);
    } finally {
      setLoadingSites(false);
    }
  }, [project?.client_id]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  const selectedSite = sites.find(s => String(s.id) === String(siteId));
  const currentSite = sites.find(s => String(s.id) === String(project?.site_id));
  const selectedSiteRecord: ClientSiteRecord | null = selectedSite
    ? { ...selectedSite, id: String(selectedSite.id) }
    : null;

  const handleSiteRecordSaved = async () => {
    await loadSites();
    setSiteEditOpen(false);
    await onSiteRecordUpdated?.();
  };

  const handleSiteRecordDeleted = async () => {
    const deletedId = selectedSite?.id;
    await loadSites();
    setSiteEditOpen(false);
    if (deletedId && String(siteId) === String(deletedId)) {
      setSiteId('');
    }
    await onSiteRecordUpdated?.();
  };

  const siteInformationPanel = selectedSite ? (
    <div className="space-y-2 text-sm">
      {selectedSite.site_name && (
        <div>
          <span className={designSystem ? uiTypography.helper : 'text-gray-600 font-medium'}>Name:</span>
          <span className="ml-2 text-gray-900">{selectedSite.site_name}</span>
        </div>
      )}
      {selectedSite.site_address_line1 && (
        <div>
          <span className={designSystem ? uiTypography.helper : 'text-gray-600 font-medium'}>Address:</span>
          <span className="ml-2 text-gray-900">{selectedSite.site_address_line1}</span>
          {selectedSite.site_address_line2 && (
            <div className={designSystem ? 'ml-12 text-gray-700' : 'ml-20 text-gray-700'}>
              {selectedSite.site_address_line2}
            </div>
          )}
        </div>
      )}
      {(selectedSite.site_city || selectedSite.site_province || selectedSite.site_postal_code) && (
        <div>
          <span className={designSystem ? uiTypography.helper : 'text-gray-600 font-medium'}>Location:</span>
          <span className="ml-2 text-gray-900">
            {[selectedSite.site_city, selectedSite.site_province, selectedSite.site_postal_code]
              .filter(Boolean)
              .join(', ')}
          </span>
        </div>
      )}
      {selectedSite.site_country && (
        <div>
          <span className={designSystem ? uiTypography.helper : 'text-gray-600 font-medium'}>Country:</span>
          <span className="ml-2 text-gray-900">{selectedSite.site_country}</span>
        </div>
      )}
      {selectedSite.site_notes && (
        <div>
          <span className={designSystem ? uiTypography.helper : 'text-gray-600 font-medium'}>Notes:</span>
          <div className="ml-2 mt-1 text-gray-900">{selectedSite.site_notes}</div>
        </div>
      )}
    </div>
  ) : null;

  const siteEditModal =
    siteEditOpen && selectedSiteRecord && project?.client_id ? (
      <SiteFormModal
        open
        onClose={() => setSiteEditOpen(false)}
        clientId={String(project.client_id)}
        clientDisplayName={project?.client_display_name || project?.client_name}
        site={selectedSiteRecord}
        overlayClassName={uiModalLayer.stacked}
        onSaved={handleSiteRecordSaved}
        onDeleted={handleSiteRecordDeleted}
      />
    ) : null;

  const handleSave = async () => {
    if (siteId === (project?.site_id || '')) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        site_id: siteId || null
      });
      toast.success('Project site updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update project site');
    } finally {
      setSaving(false);
    }
  };

  const siteOptions = useMemo(
    () => [
      { value: '', label: 'No Site' },
      ...sortByLabel(sites, (s: any) => (s.site_name || s.site_address_line1 || s.id || '').toString()).map(
        (site: any) => ({
          value: String(site.id),
          label: (site.site_name || site.site_address_line1 || site.id) as string,
        }),
      ),
    ],
    [sites],
  );

  if (designSystem) {
    return (
      <>
        <AppFormModal
          open
          onClose={onClose}
          title="Edit Project Site"
          description="Choose the job site linked to this opportunity"
          formWidth="comfortable"
          quickInfo={opportunityEditSiteQuickInfo}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" onClick={handleSave} disabled={saving || loadingSites} loading={saving}>
                {saving ? 'Saving…' : 'Save'}
              </AppButton>
            </div>
          }
        >
          <div className="space-y-4">
            {loadingSites ? (
              <p className={uiTypography.helper}>Loading sites…</p>
            ) : (
              <AppSelect
                label="Site"
                value={String(siteId || '')}
                onChange={(e) => setSiteId(e.target.value)}
                options={siteOptions}
                searchable={siteOptions.length > 8}
                placeholder="Select site…"
                fieldHint="Site\n\nJob site under the project owner customer. Required before converting to a project."
              />
            )}

            {selectedSite && (
              <AppCard bodyClassName="p-4">
                <div className="mb-3 flex items-center gap-1.5">
                  <p className={uiTypography.sectionTitle}>Site information</p>
                  <AppHeroEditButton title="Edit Site" onClick={() => setSiteEditOpen(true)} />
                </div>
                {siteInformationPanel}
              </AppCard>
            )}

            {currentSite && siteId !== (project?.site_id || '') && (
              <p className={uiCx(uiTypography.helper, 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900')}>
                Changing from <strong>{currentSite.site_name || currentSite.site_address_line1 || 'current site'}</strong>{' '}
                to <strong>{selectedSite?.site_name || selectedSite?.site_address_line1 || 'new site'}</strong> updates
                location on this opportunity.
              </p>
            )}
          </div>
        </AppFormModal>
        {siteEditModal}
      </>
    );
  }

  return (
    <>
      <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Project Site</h2>
              <p className="text-xs text-gray-500 mt-0.5">Choose the job site linked to this project</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Select Site</label>
            {loadingSites ? (
              <div className="text-sm text-gray-500 py-2">Loading sites...</div>
            ) : (
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              >
                <option value="">No Site</option>
                {sites.map((site: any) => (
                  <option key={site.id} value={site.id}>
                    {site.site_name || site.site_address_line1 || site.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedSite && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="mb-3 flex items-center gap-1.5">
                <div className="text-sm font-medium text-gray-900">Site Information</div>
                <AppHeroEditButton title="Edit Site" onClick={() => setSiteEditOpen(true)} />
              </div>
              {siteInformationPanel}
            </div>
          )}

          {currentSite && siteId !== (project?.site_id || '') && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-yellow-800">
                  <div className="font-medium mb-1">Changing Site</div>
                  <div className="text-xs">You are changing from <strong>{currentSite.site_name || currentSite.site_address_line1 || 'current site'}</strong> to <strong>{selectedSite?.site_name || selectedSite?.site_address_line1 || 'new site'}</strong>. This will update the project's location information.</div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
      {siteEditModal}
    </>
  );
}

// Edit Estimator Modal Component
function EditEstimatorModal({ projectId, currentEstimatorIds, employees, designSystem, onClose, onSave }: {
  projectId: string;
  currentEstimatorIds: string[];
  employees: any[];
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [estimatorIds, setEstimatorIds] = useState<string[]>(currentEstimatorIds);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setEstimatorIds(currentEstimatorIds);
  }, [currentEstimatorIds]);

  const toggleEstimator = (id: string) => {
    setEstimatorIds(prev => 
      prev.includes(id) 
        ? prev.filter(eid => eid !== id)
        : [...prev, id]
    );
  };

  const removeEstimator = (id: string) => {
    setEstimatorIds(prev => prev.filter(eid => eid !== id));
  };

  const employeesInEstimatingDept = useMemo(
    () => (employees || []).filter((emp: any) => employeeHasSalesOrEstimatingDepartment(emp)),
    [employees],
  );

  const estimatorUserOptions = useMemo(
    () => employeesInEstimatingDept.map((emp: any) => mapEmployeeToAppUserSelect(emp)),
    [employeesInEstimatingDept],
  );

  const filteredEmployees = employeesInEstimatingDept
    .filter((emp: any) => {
      if (!searchQuery.trim()) return true;
      const searchLower = searchQuery.toLowerCase();
      const name = getUserDisplayName(emp).toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const username = (emp.username || '').toLowerCase();
      return name.includes(searchLower) || email.includes(searchLower) || username.includes(searchLower);
    })
    .sort((a: any, b: any) => getUserDisplayName(a).localeCompare(getUserDisplayName(b), undefined, { sensitivity: 'base' }));

  const handleSave = async () => {
    const sortedIds = [...estimatorIds].sort();
    const sortedCurrent = [...currentEstimatorIds].sort();
    if (JSON.stringify(sortedIds) === JSON.stringify(sortedCurrent)) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        estimator_ids: estimatorIds.length > 0 ? estimatorIds : []
      });
      toast.success('Project estimators updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update project estimators');
    } finally {
      setSaving(false);
    }
  };

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Estimators"
        description="Assign estimating team members to this opportunity"
        formWidth="comfortable"
        quickInfo={opportunityEditEstimatorsQuickInfo}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppUserSelect
          mode="multiple"
          label="Estimators"
          users={estimatorUserOptions}
          value={estimatorIds.map(String)}
          onChange={(ids) => setEstimatorIds(ids)}
          placeholder="Search estimators…"
          emptyMessage="No employees in Sales / Estimating."
          fieldHint="Estimators\n\nTeam members responsible for estimating this opportunity. Select one or more."
        />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Estimators</h2>
              <p className="text-xs text-gray-500 mt-0.5">Assign estimating team members</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          {/* Search input */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Search Employees</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or username..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Select Estimators</label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filteredEmployees.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">
                  {employeesInEstimatingDept.length === 0
                    ? 'No employees in Sales / Estimating department.'
                    : 'No employees found matching your search.'}
                </div>
              ) : (
                filteredEmployees.map((emp: any) => {
                  const isSelected = estimatorIds.includes(String(emp.id));
                  return (
                    <div
                      key={emp.id}
                      onClick={() => toggleEstimator(String(emp.id))}
                      className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <UserAvatar user={emp} size="w-8 h-8" showTooltip={false} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{getUserDisplayName(emp)}</div>
                        {emp.email && (
                          <div className="text-xs text-gray-600 truncate">{emp.email}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {estimatorIds.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs font-medium text-gray-600 mb-2">Selected Estimators ({estimatorIds.length}):</div>
              <div className="flex flex-wrap gap-2">
                {estimatorIds.map(id => {
                  const emp = employees.find((e: any) => String(e.id) === String(id));
                  if (!emp) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 bg-white px-2 py-1 rounded border">
                      <UserAvatar user={emp} size="w-6 h-6" showTooltip={false} />
                      <span className="text-xs font-medium text-gray-700">{getUserDisplayName(emp)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeEstimator(id);
                        }}
                        className="ml-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

// Edit Project Admin Modal Component
function EditProjectAdminModal({ projectId, currentAdminId, employees, designSystem, onClose, onSave }: {
  projectId: string;
  currentAdminId: string;
  employees: any[];
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [adminId, setAdminId] = useState(currentAdminId);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setAdminId(currentAdminId);
  }, [currentAdminId]);

  const selectedAdmin = employees.find((e: any) => String(e.id) === String(adminId));
  const currentAdmin = employees.find((e: any) => String(e.id) === String(currentAdminId));

  const filteredEmployees = employees.filter((emp: any) => {
    if (!searchQuery.trim()) return true;
    const searchLower = searchQuery.toLowerCase();
    const name = getUserDisplayName(emp).toLowerCase();
    const email = (emp.email || '').toLowerCase();
    const username = (emp.username || '').toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower) || username.includes(searchLower);
  });

  const handleSave = async () => {
    if (adminId === currentAdminId) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        project_admin_id: adminId || null
      });
      toast.success('Project admin updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update project admin');
    } finally {
      setSaving(false);
    }
  };

  const adminUserOptions = useMemo(
    () => sortByLabel(employees, (e: any) => getUserDisplayName(e)).map((e: any) => mapEmployeeToAppUserSelect(e)),
    [employees],
  );

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Project Admin"
        description="Assign the primary project administrator"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppUserSelect
          mode="single"
          label="Project Admin"
          users={adminUserOptions}
          value={adminId}
          onChange={setAdminId}
          placeholder="Search employee…"
          fieldHint="Project Admin\n\nPrimary administrator responsible for this project."
        />
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Project Admin</h2>
              <p className="text-xs text-gray-500 mt-0.5">Assign the primary project administrator</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          {/* Search input */}
          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Search Employees</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or username..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Select Project Admin</label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filteredEmployees.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">No employees found matching your search.</div>
              ) : (
                <>
                  {/* Option to clear selection */}
                  <div
                    onClick={() => setAdminId('')}
                    className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${
                      !adminId ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium">
                      —
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">No Admin</div>
                      <div className="text-xs text-gray-600">Clear selection</div>
                    </div>
                  </div>
                  {filteredEmployees.map((emp: any) => {
                    const isSelected = String(emp.id) === String(adminId);
                    return (
                      <div
                        key={emp.id}
                        onClick={() => setAdminId(String(emp.id))}
                        className={`flex items-center gap-3 p-3 rounded border cursor-pointer transition-colors ${
                          isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <UserAvatar user={emp} size="w-8 h-8" showTooltip={false} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{getUserDisplayName(emp)}</div>
                          {emp.email && (
                            <div className="text-xs text-gray-600 truncate">{emp.email}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {selectedAdmin && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-900 mb-3">Admin Information</div>
              <div className="flex items-center gap-3 mb-3">
                <UserAvatar user={selectedAdmin} size="w-12 h-12" showTooltip={false} />
                <div>
                  <div className="font-medium text-gray-900">{getUserDisplayName(selectedAdmin)}</div>
                  {selectedAdmin.email && (
                    <div className="text-sm text-gray-600">{selectedAdmin.email}</div>
                  )}
                  {selectedAdmin.phone && (
                    <div className="text-sm text-gray-600">{selectedAdmin.phone}</div>
                  )}
                </div>
              </div>
              {selectedAdmin.roles && selectedAdmin.roles.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-gray-600 font-medium">Roles:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedAdmin.roles.map((role: string, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentAdmin && adminId !== currentAdminId && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-yellow-800">
                  <div className="font-medium mb-1">Changing Project Admin</div>
                  <div className="text-xs">You are changing from <strong>{getUserDisplayName(currentAdmin)}</strong> to <strong>{selectedAdmin ? getUserDisplayName(selectedAdmin) : 'no admin'}</strong>.</div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

// Edit Progress Modal Component
function EditProgressModal({ projectId, currentProgress, designSystem, onClose, onSave }: {
  projectId: string;
  currentProgress: number;
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [progress, setProgress] = useState(currentProgress);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const progressValue = Math.max(0, Math.min(100, Number(progress)));
      await api('PATCH', `/projects/${projectId}`, {
        progress: progressValue
      });
      toast.success('Progress updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update progress');
    } finally {
      setSaving(false);
    }
  };

  const progressPct = Math.max(0, Math.min(100, progress));

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Progress"
        description="Update completion percentage"
        formWidth="comfortable"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          <AppInput
            label="Progress (%)"
            type="number"
            min={0}
            max={100}
            value={String(progress)}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={progressPct}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-brand-red"
          />
        </div>
      </AppFormModal>
    );
  }

  const progressModalSliderStyle = `
    .edit-progress-slider {
      -webkit-appearance: none;
      appearance: none;
      flex: 1;
      height: 6px;
      border-radius: 3px;
      outline: none;
      cursor: pointer;
    }
    .edit-progress-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #7f1010;
      cursor: pointer;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      position: relative;
      z-index: 1;
    }
    .edit-progress-slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #7f1010;
      cursor: pointer;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      position: relative;
      z-index: 1;
    }
    .edit-progress-slider-container {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .edit-progress-slider-value {
      background: #7f1010;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
      line-height: 1.2;
      flex-shrink: 0;
    }
  `;

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <style>{progressModalSliderStyle}</style>
      <div
        className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit Progress</h2>
              <p className="text-xs text-gray-500 mt-0.5">Update completion percentage</p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Progress (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
              />
            </div>
            <div>
              <div className="edit-progress-slider-container">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={progressPct}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="edit-progress-slider"
                  style={{
                    background: `linear-gradient(to right, #7f1010 0%, #7f1010 ${progressPct}%, #e5e7eb ${progressPct}%, #e5e7eb 100%)`
                  }}
                />
                <div className="edit-progress-slider-value">{progressPct}%</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div></OverlayPortal>
  );
}

function ProjectDivisionsHeroSection({
  projectId,
  proj,
  hasEditPermission,
  livePricingItems,
  compact,
  designSystem,
}: {
  projectId: string;
  proj: any;
  hasEditPermission?: boolean;
  livePricingItems?: any[] | null;
  compact?: boolean;
  designSystem?: boolean;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [showEditModal, setShowEditModal] = useState(false);
  const { data:projectDivisions } = useQuery({ queryKey:PROJECT_DIVISIONS_QUERY_KEY, queryFn: ()=>api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const projectBusinessLine = useMemo(
    () => resolveProjectBusinessLine(proj?.business_line, location.pathname),
    [proj?.business_line, location.pathname]
  );
  const projectDivisionsForPicker = useMemo(
    () => filterProjectDivisionsForBusinessLine(projectDivisions, projectBusinessLine),
    [projectDivisions, projectBusinessLine]
  );
  
  // Fetch proposals to get pricing items for percentage calculation
  const { data:proposals } = useQuery({ 
    queryKey:['projectProposals', projectId], 
    queryFn: ()=>api<any[]>('GET', `/proposals?project_id=${encodeURIComponent(String(projectId||''))}`) 
  });
  
  // Fetch full proposal data if proposal exists
  const proposal = proposals && proposals.length > 0 ? proposals[0] : null;
  const { data:proposalData } = useQuery({ 
    queryKey: ['proposal', proposal?.id],
    queryFn: () => proposal?.id ? api<any>('GET', `/proposals/${proposal.id}`) : Promise.resolve(null),
    enabled: !!proposal?.id
  });

  const projectDivIds = Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : [];

  // Calculate percentages from pricing items
  const calculatedPercentages = useMemo(() => {
    if (projectDivIds.length === 0) return {};
    
    // Initialize all divisions to 0%
    const result: { [key: string]: number } = {};
    projectDivIds.forEach(id => {
      result[String(id)] = 0;
    });
    
    // Get pricing items from proposal (data is nested in proposalData.data)
    // Prefer live pricing items (from ProposalForm via ProjectDetail state) if provided.
    const savedPricingItems = proposalData?.data?.additional_costs || [];
    const pricingItems = Array.isArray(livePricingItems) ? livePricingItems : savedPricingItems;
    
    // If no pricing items, return 0% for all divisions
    if (pricingItems.length === 0) {
      return result;
    }
    
    // Group by division_id and sum values (only approved items count)
    const divisionTotals: { [key: string]: number } = {};
    pricingItems.forEach((item: any) => {
      if (item.approved === false) return;
      if (item.division_id) {
        const divId = String(item.division_id);
        const value = (item.value || 0) * (parseInt(item.quantity || '1', 10) || 1);
        divisionTotals[divId] = (divisionTotals[divId] || 0) + value;
      }
    });
    
    // Calculate total
    const total = Object.values(divisionTotals).reduce((a, b) => a + b, 0);
    
    // Calculate percentages only if total > 0
    if (total > 0) {
      projectDivIds.forEach(id => {
        const idStr = String(id);
        result[idStr] = divisionTotals[idStr] ? (divisionTotals[idStr] / total) * 100 : 0;
      });
    }
    
    return result;
  }, [projectDivIds, proposalData, livePricingItems]);

  // Get division icons and labels with percentages
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: ReactNode; label: string; id: string; percentage: number }> = [];
    for (const divId of projectDivIds) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ 
            icon: getDivisionIcon(div.label, true), 
            label: div.label, 
            id: String(div.id),
            percentage: calculatedPercentages[String(divId)] || 0
          });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ 
              icon: getDivisionIcon(div.label, true), 
              label: `${div.label} - ${sub.label}`, 
              id: String(sub.id),
              percentage: calculatedPercentages[String(divId)] || 0
            });
            break;
          }
        }
        if (icons.length > 0 && icons[icons.length - 1].id === String(divId)) break;
      }
    }
    return icons;
  }, [projectDivIds, projectDivisions, calculatedPercentages]);

  return (
    <>
      <div>
        <div className={uiCx('flex items-center gap-1.5', compact ? 'mb-1' : 'mb-2')}>
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Project Divisions</span>
          {hasEditPermission && (
            <button
              onClick={() => setShowEditModal(true)}
              className="text-gray-400 hover:text-[#7f1010] transition-colors"
              title="Edit Divisions"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
        <div>
          {divisionIcons.length > 0 ? (
            <div className="flex items-end gap-2 flex-wrap">
              {divisionIcons.map((div) => (
                <AppTooltip key={div.id} content={div.label} placement="bottom">
                  <div className="flex flex-col items-center">
                    <div className={compact ? 'text-xl transition-transform hover:scale-110' : 'text-2xl transition-transform hover:scale-110'}>
                      {div.icon}
                    </div>
                    <div className={uiCx('text-xs font-bold text-gray-600', compact ? 'mt-0' : 'mt-0.5')}>
                      {Math.round(div.percentage || 0)}%
                    </div>
                  </div>
                </AppTooltip>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic">No divisions assigned</div>
          )}
        </div>
      </div>

      {/* Edit Divisions Modal */}
      {showEditModal && (
        <EditDivisionsModal
          projectId={projectId}
          currentDivisions={projectDivIds}
          currentPercentages={calculatedPercentages}
          projectDivisions={projectDivisionsForPicker || []}
          designSystem={designSystem}
          onClose={() => setShowEditModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
            queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
            queryClient.invalidateQueries({ queryKey: ['projectProposals', projectId] });
            queryClient.invalidateQueries({ queryKey: ['proposal'] });
            queryClient.removeQueries({ queryKey: ['proposal-pricing-items', projectId] });
            setShowEditModal(false);
          }}
        />
      )}

    </>
  );
}

// Edit Divisions Modal Component
function EditDivisionsModal({ projectId, currentDivisions, currentPercentages, projectDivisions, designSystem, onClose, onSave }: {
  projectId: string;
  currentDivisions: string[];
  currentPercentages: { [key: string]: number };
  projectDivisions: any[];
  designSystem?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [projectDivs, setProjectDivs] = useState<string[]>(currentDivisions);
  const [saving, setSaving] = useState(false);
  const [expandedDivisions, setExpandedDivisions] = useState<Set<string>>(new Set());

  const validDivisionIdSet = useMemo(() => {
    const ids = new Set<string>();
    for (const div of projectDivisions || []) {
      ids.add(String(div.id));
      for (const sub of div.subdivisions || []) {
        ids.add(String(sub.id));
      }
    }
    return ids;
  }, [projectDivisions]);

  // Always work with a de-duplicated list of selected division IDs.
  // Old projects may contain duplicated IDs (e.g. after division removals/edits),
  // which can break totals while React renders only one row per duplicated key.
  const selectedDivIds = useMemo(() => {
    return Array.from(new Set((projectDivs || []).map((x) => String(x)))).filter((id) => validDivisionIdSet.has(id));
  }, [projectDivs, validDivisionIdSet]);

  // Toggle expansion of a division
  const toggleDivision = (divId: string) => {
    setExpandedDivisions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(divId)) {
        newSet.delete(divId);
      } else {
        newSet.add(divId);
      }
      return newSet;
    });
  };

  // Initialize from props when modal opens
  useEffect(() => {
    // First, validate and remove main divisions that have subdivisions
    const cleanedDivisions = currentDivisions.filter((divId) => {
      // Drop IDs that no longer exist in settings (e.g. removed division)
      if (!validDivisionIdSet.has(String(divId))) return false;

      // Check if this division has subdivisions
      for (const div of projectDivisions) {
        if (String(div.id) === String(divId)) {
          const subdivisions = div.subdivisions || [];
          // If it has subdivisions, remove it from selection
          return subdivisions.length === 0;
        }
      }
      return true;
    });
    
    // De-dupe as a safety net (handles legacy/buggy stored arrays)
    setProjectDivs(Array.from(new Set(cleanedDivisions.map((x) => String(x)))));
  }, [currentDivisions, projectDivisions, validDivisionIdSet]);

  const handleSave = async () => {
    try {
      setSaving(true);
      // Percentages are now calculated automatically from pricing items, so send null
      await api('PATCH', `/projects/${projectId}`, { 
        project_division_ids: selectedDivIds.length > 0 ? selectedDivIds : null,
        project_division_percentages: null
      });
      toast.success('Divisions saved');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to save divisions');
    } finally {
      setSaving(false);
    }
  };

  // Helper function to find division info
  const getDivisionInfo = (divId: string) => {
    for (const div of projectDivisions) {
      if (String(div.id) === String(divId)) {
        return { ...div, isSubdivision: false };
      }
      for (const sub of (div.subdivisions || [])) {
        if (String(sub.id) === String(divId)) {
          return { ...sub, parentLabel: div.label, isSubdivision: true };
        }
      }
    }
    return null;
  };

  const divisionsBody = (
    <div className="space-y-2">
                {projectDivisions.map((div: any) => {
                  const divId = String(div.id);
                  const subdivisions = div.subdivisions || [];
                  const hasSubdivisions = subdivisions.length > 0;
                  const isExpanded = expandedDivisions.has(divId);

                  return (
                    <div key={divId} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => {
                          if (hasSubdivisions) {
                            toggleDivision(divId);
                          } else {
                            setProjectDivs((prev) =>
                              prev.includes(divId) ? prev.filter((x) => x !== divId) : [...prev, divId]
                            );
                          }
                        }}
                        className={`w-full text-left px-3 py-2.5 text-sm font-medium flex items-center gap-2 transition-colors ${
                          hasSubdivisions
                            ? 'bg-gray-50 hover:bg-gray-100 text-gray-900'
                            : projectDivs.includes(divId)
                              ? 'bg-indigo-50 text-gray-900 border-l-2 border-l-indigo-500'
                              : 'bg-white hover:bg-gray-50 text-gray-900'
                        }`}
                      >
                        {hasSubdivisions && (
                          <span className="text-gray-500 text-xs w-4 flex-shrink-0">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        )}
                        {!hasSubdivisions && <span className="w-4 flex-shrink-0" aria-hidden />}
                        <span className="text-lg flex-shrink-0">{getDivisionIcon(div.label)}</span>
                        <span className="min-w-0">{div.label}</span>
                      </button>
                      {hasSubdivisions && isExpanded && (
                        <div className="px-2 pb-2 pt-0 space-y-1 border-t border-gray-100 bg-gray-50/80">
                          {subdivisions.map((sub: any) => {
                            const subId = String(sub.id);
                            const subSelected = projectDivs.includes(subId);
                            return (
                              <button
                                key={subId}
                                type="button"
                                onClick={() =>
                                  setProjectDivs((prev) =>
                                    prev.includes(subId) ? prev.filter((x) => x !== subId) : [...prev, subId]
                                  )
                                }
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                                  subSelected
                                    ? 'bg-indigo-50 text-gray-900 border border-indigo-200'
                                    : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-800'
                                }`}
                              >
                                <span className="text-base flex-shrink-0">{getDivisionIcon(div.label)}</span>
                                <span className="min-w-0">• {sub.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {projectDivisions.length === 0 && (
                  <div className="text-xs text-gray-500 text-center py-6">No project divisions available.</div>
                )}
    </div>
  );

  const divisionsFooter = (
    <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
      <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
        Cancel
      </AppButton>
      <AppButton type="button" size="sm" onClick={handleSave} disabled={saving} loading={saving}>
        {saving ? 'Saving…' : 'Save'}
      </AppButton>
    </div>
  );

  if (designSystem) {
    return (
      <AppFormModal
        open
        onClose={onClose}
        title="Edit Project Divisions"
        description="Select divisions for this project. Expand parents to choose subdivisions."
        formWidth="comfortable"
        quickInfo={editProjectDivisionsQuickInfo}
        footer={divisionsFooter}
      >
        {divisionsBody}
      </AppFormModal>
    );
  }

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <div
          className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Edit Project Divisions</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select divisions for this project. Expand parents to choose subdivisions.
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-600">Available divisions</div>
                {saving && <span className="text-xs text-gray-500">Saving...</span>}
              </div>
              {divisionsBody}
            </div>
          </div>
          <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl relative z-0">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}


function ProjectGeneralInfoCard({ projectId, proj, files, hasEditPermission }:{ projectId:string, proj:any, files: ProjectFile[], hasEditPermission?: boolean }){
  const queryClient = useQueryClient();
  const location = useLocation();
  const [description, setDescription] = useState<string>(proj?.description || '');
  const [projectName, setProjectName] = useState<string>(proj?.name || '');
  const [saving, setSaving] = useState(false);
  const [editingDivisions, setEditingDivisions] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingEta, setEditingEta] = useState(false);
  const [eta, setEta] = useState<string>((proj?.date_eta||'').slice(0,10));
  const [projectDivs, setProjectDivs] = useState<string[]>(Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data:projectDivisions } = useQuery({ queryKey:PROJECT_DIVISIONS_QUERY_KEY, queryFn: ()=>api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const projectBusinessLine = useMemo(
    () => resolveProjectBusinessLine(proj?.business_line, location.pathname),
    [proj?.business_line, location.pathname]
  );
  const projectDivisionsForPicker = useMemo(
    () => filterProjectDivisionsForBusinessLine(projectDivisions, projectBusinessLine),
    [projectDivisions, projectBusinessLine]
  );
  const { data:proposals } = useQuery({ queryKey:['projectProposals', projectId], queryFn: ()=>api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(projectId||''))}`) });

  useEffect(()=>{
    setDescription(proj?.description || '');
    setProjectName(proj?.name || '');
    setProjectDivs(Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : []);
    setEta((proj?.date_eta||'').slice(0,10));
  }, [proj?.description, proj?.name, proj?.project_division_ids, proj?.date_eta]);

  const handleSave = useCallback(async()=>{
    try{
      setSaving(true);
      const payload: any = { 
        description: description?.trim()? description : null,
        project_division_ids: projectDivs.length > 0 ? projectDivs : null
      };
      // Include name if it was edited
      if (editingName && projectName.trim() !== (proj?.name || '')) {
        payload.name = projectName.trim();
      }
      // Include end date if it was edited
      if (editingEta) {
        payload.date_eta = eta || null;
      }
      await api('PATCH', `/projects/${projectId}`, payload);
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
      if ('project_division_ids' in payload) {
        queryClient.invalidateQueries({ queryKey: ['projectProposals', projectId] });
        queryClient.invalidateQueries({ queryKey: ['proposal'] });
        queryClient.removeQueries({ queryKey: ['proposal-pricing-items', projectId] });
      }
      setEditingDivisions(false);
      setEditingName(false);
      setEditingEta(false);
    }catch(_e){
      toast.error('Failed to save');
    }finally{
      setSaving(false);
    }
  }, [projectId, description, projectDivs, projectName, editingName, editingEta, eta, proj?.name, queryClient]);

  // Get image URL priority:
  // 1) Manual image set by user (image_manually_set + image_file_object_id)
  // 2) Legacy manual image (existing project-cover-derived file)
  // 3) Cover from latest proposal
  // 4) Default blueprint
  const imageUrl = useMemo(() => {
    // If project has manually set image, use it
    if (proj?.image_file_object_id && proj?.image_manually_set) {
      return withFileAccessToken(`/files/${proj.image_file_object_id}/thumbnail?w=800`);
    }
    // Legacy: if there is an existing cover image file, treat it as user-selected (manual)
    const legacyCover = (files||[]).find(f=> String(f.category||'') === 'project-cover-derived');
    if (legacyCover?.file_object_id) {
      return withFileAccessToken(`/files/${legacyCover.file_object_id}/thumbnail?w=800`);
    }
    // If project has image (synced from proposal), use it
    if (proj?.image_file_object_id) {
      return withFileAccessToken(`/files/${proj.image_file_object_id}/thumbnail?w=800`);
    }
    // Try to get from latest proposal
    if (proposals && proposals.length > 0) {
      // Sort by created_at descending to get latest
      const sortedProposals = [...proposals].sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bDate - aDate;
      });
      const latestProposal = sortedProposals[0];
      if (latestProposal?.data?.cover_file_object_id) {
        return withFileAccessToken(`/files/${latestProposal.data.cover_file_object_id}/thumbnail?w=800`);
      }
    }
    // Default blueprint image (served by backend static /ui)
    return '/ui/assets/placeholders/project.png';
  }, [proj?.image_file_object_id, proj?.image_manually_set, proposals, files]);

  const handleImageConfirm = useCallback(async (blob: Blob, originalFileObjectId?: string) => {
    try {
      setSaving(true);
      // Convert blob to File for upload
      const file = new File([blob], 'project-image.png', { type: 'image/png' });
      
      // Step 1: Get upload URL
      const up: any = await api('POST', '/files/upload', {
        project_id: projectId,
        client_id: proj?.client_id || null,
        employee_id: null,
        category_id: 'project-general-image',
        original_name: file.name,
        content_type: file.type || 'image/png'
      });
      
      // Step 2: Upload file to storage
      await fetch(up.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'image/png',
          'x-ms-blob-type': 'BlockBlob'
        },
        body: file
      });
      
      // Step 3: Confirm upload
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size
      });
      
      // Step 4: Update project with the new image
      await api('PATCH', `/projects/${projectId}`, {
        image_file_object_id: conf.file_object_id,
        image_manually_set: true
      });
      
      toast.success('Image updated');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
      setPickerOpen(false);
    } catch (e) {
      toast.error('Failed to update image');
    } finally {
      setSaving(false);
    }
  }, [projectId, proj?.client_id, queryClient]);

  const city = proj?.address_city || proj?.site_city || '—';
  const province = proj?.address_province || proj?.site_province || proj?.site_state || '—';
  const country = proj?.address_country || proj?.site_country || '—';
  const postal = proj?.address_postal_code || proj?.postal_code || proj?.site_postal_code || proj?.site_zip || '—';
  const projectDivIds = Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : [];

  // Get division icons and labels
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: ReactNode; label: string; id: string }> = [];
    for (const divId of projectDivIds) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ icon: getDivisionIcon(div.label, true), label: div.label, id: String(div.id) });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ icon: getDivisionIcon(div.label, true), label: `${div.label} - ${sub.label}`, id: String(sub.id) });
            break;
          }
        }
        if (icons.length > 0 && icons[icons.length - 1].id === String(divId)) break;
      }
    }
    return icons;
  }, [projectDivIds, projectDivisions]);

  const fields = useMemo(()=>[
    { label: 'City', value: city },
    { label: 'Province / State', value: province },
    { label: 'Country', value: country },
    { label: 'Postal Code', value: postal },
  ], [city, province, country, postal]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-900">General Information</h4>
        {/* Division icons at top right */}
        {divisionIcons.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {divisionIcons.map((div) => (
              <AppTooltip key={div.id} content={div.label} placement="bottom">
                <div className="text-2xl cursor-pointer hover:scale-110 transition-transform">
                  {div.icon}
                </div>
              </AppTooltip>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-3">
        {/* Project Image */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-600">Project Image</label>
            <button
              onClick={() => setPickerOpen(true)}
              className="text-xs text-[#7f1010] hover:text-[#a31414] font-medium"
            >
              Change
            </button>
          </div>
          <div className="mt-1 rounded border overflow-hidden bg-gray-50">
            <img 
              src={imageUrl} 
              alt="Project" 
              className="w-full h-48 object-cover"
              onError={(e) => {
                // Only fallback to logo if it's not already the default image
                const currentSrc = (e.target as HTMLImageElement).src;
                if (!currentSrc.includes('/ui/assets/placeholders/project.png')) {
                  (e.target as HTMLImageElement).src = '/ui/assets/placeholders/project.png';
                }
              }}
            />
          </div>
        </div>

        {/* Project Name - Editable */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className="text-xs font-medium text-gray-600 block">Project Name</label>
            {!editingName && hasEditPermission && (
              <button
                onClick={() => setEditingName(true)}
                className="text-gray-400 hover:text-[#7f1010] transition-colors"
                title="Edit Project Name"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
          {editingName ? (
            <div className="space-y-2">
              <input
                type="text"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                placeholder="Project name"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !projectName.trim()}
                  className="px-3 py-1.5 rounded bg-brand-red text-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setProjectName(proj?.name || '');
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-xs font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              <div className="text-[11px] text-gray-500">
                Note: Changing the project name will also update the associated folder name.
              </div>
            </div>
          ) : (
            <div className="text-sm font-semibold text-gray-900">{proj?.name || proj?.site_name || '-'}</div>
          )}
        </div>

        {/* End date - Editable */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className="text-xs font-medium text-gray-600 block">End Date</label>
            {!editingEta && hasEditPermission && (
              <button
                onClick={() => setEditingEta(true)}
                className="text-gray-400 hover:text-[#7f1010] transition-colors"
                title="Edit End Date"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
          {editingEta ? (
            <div className="space-y-2">
              <input
                type="date"
                value={eta}
                onChange={e => setEta(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded bg-brand-red text-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingEta(false);
                    setEta((proj?.date_eta||'').slice(0,10));
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-xs font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm font-semibold text-gray-900">{eta || '-'}</div>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          {fields.map((item)=> (
            <div key={item.label}>
              <div className="text-xs font-medium text-gray-600 mb-1.5">{item.label}</div>
              <div className="text-sm font-semibold text-gray-900">{item.value || '-'}</div>
            </div>
          ))}
        </div>
        
        {/* Project Divisions Section */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className="text-xs font-medium text-gray-600 block">Project Divisions</label>
            {!editingDivisions && hasEditPermission && (
              <button
                onClick={() => setEditingDivisions(true)}
                className="text-gray-400 hover:text-[#7f1010] transition-colors"
                title="Edit Project Divisions"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
          </div>
          
          {editingDivisions ? (
            <div className="space-y-2">
              <div className="max-h-64 overflow-y-auto border rounded p-3 bg-gray-50">
                {(projectDivisionsForPicker||[]).map((div:any)=>{
                  const divId = String(div.id);
                  const divSelected = projectDivs.includes(divId);
                  const subdivisions = div.subdivisions || [];
                  
                  return (
                    <div key={divId} className="border rounded p-2 bg-white">
                      <button
                        type="button"
                        onClick={()=> setProjectDivs(prev=> prev.includes(divId)? prev.filter(x=>x!==divId) : [...prev, divId])}
                        className={`w-full text-left px-2 py-1 rounded text-sm font-medium flex items-center gap-2 ${
                          divSelected? 'bg-[#7f1010] text-white': 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <span className="text-lg">{getDivisionIcon(div.label)}</span>
                        <span>{div.label}</span>
                      </button>
                      {subdivisions.length > 0 && (
                        <div className="mt-1 pl-6 space-y-1">
                          {subdivisions.map((sub:any)=>{
                            const subId = String(sub.id);
                            const subSelected = projectDivs.includes(subId);
                            return (
                              <button
                                key={subId}
                                type="button"
                                onClick={()=> setProjectDivs(prev=> prev.includes(subId)? prev.filter(x=>x!==subId) : [...prev, subId])}
                                className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 ${
                                  subSelected? 'bg-[#a31414] text-white': 'bg-gray-50 hover:bg-gray-100'
                                }`}
                              >
                                <span className="text-base">{getDivisionIcon(div.label)}</span>
                                <span>• {sub.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!projectDivisionsForPicker || projectDivisionsForPicker.length === 0) && (
                  <div className="text-xs text-gray-500 text-center py-4">No project divisions available.</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1.5 rounded bg-brand-red text-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingDivisions(false);
                    setProjectDivs(Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : []);
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-xs font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : projectDivIds.length > 0 && projectDivisions ? (
            <div className="flex flex-wrap gap-2">
              {projectDivIds.map((divId: string) => {
                // Find division or subdivision
                let divLabel = '';
                let divIcon = '';
                let isSubdivision = false;
                for (const div of (projectDivisions || [])) {
                  if (String(div.id) === String(divId)) {
                    divLabel = div.label;
                    divIcon = getDivisionIcon(div.label);
                    break;
                  }
                  for (const sub of (div.subdivisions || [])) {
                    if (String(sub.id) === String(divId)) {
                      divLabel = sub.label;
                      divIcon = getDivisionIcon(div.label);
                      isSubdivision = true;
                      break;
                    }
                  }
                  if (divLabel) break;
                }
                if (!divLabel) return null;
                return (
                  <span
                    key={divId}
                    className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                      isSubdivision
                        ? 'bg-[#a31414]/10 text-[#a31414] border border-[#a31414]/20'
                        : 'bg-[#7f1010]/10 text-[#7f1010] border border-[#7f1010]/20'
                    }`}
                    title={divLabel}
                  >
                    <span>{divIcon}</span>
                    <span>{divLabel}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">No divisions assigned</div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">Description</label>
          <textarea
            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400 min-h-[120px] resize-y"
            placeholder="Add notes or general information about this project..."
            value={description}
            onChange={e=>setDescription(e.target.value)}
          />
        </div>
        <div className="text-right">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-2.5 py-1.5 rounded bg-brand-red text-white text-xs font-medium disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectContactCard({ projectId, proj, clientId, clientFiles }:{ projectId:string, proj:any, clientId?:string, clientFiles:any[] }){
  const [contactId, setContactId] = useState<string>(proj?.contact_id || '');
  const { data:contacts } = useQuery({
    queryKey:['project-contact-options', clientId||''],
    queryFn: ()=> clientId ? api<any[]>('GET', `/clients/${encodeURIComponent(String(clientId))}/contacts`) : Promise.resolve([]),
    enabled: !!clientId
  });
  useEffect(()=>{
    setContactId(proj?.contact_id || '');
  }, [proj?.contact_id]);
  const currentContact = useMemo(()=> (contacts||[]).find((c:any)=> String(c.id) === String(contactId)) || null, [contacts, contactId]);
  const photoUrl = useMemo(()=>{
    if(!contactId) return '';
    const rec = (clientFiles||[]).find((f:any)=> String(f.category||'').toLowerCase() === `contact-photo-${String(contactId)}`.toLowerCase());
    return rec ? withFileAccessToken(`/files/${rec.file_object_id}/thumbnail?w=160`) : '';
  }, [clientFiles, contactId]);
  const [saving, setSaving] = useState(false);
  const handleSave = useCallback(async()=>{
    try{
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, { contact_id: contactId || null });
      toast.success('Contact updated');
    }catch(_e){
      toast.error('Failed to update contact');
    }finally{
      setSaving(false);
    }
  }, [projectId, contactId]);
  const displayName = currentContact?.name || proj?.contact_name || '—';
  const displayEmail = currentContact?.email || proj?.contact_email || '';
  const displayPhone = currentContact?.phone || proj?.contact_phone || '';
  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="text-sm font-semibold text-gray-900 mb-2">Contact</h4>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img className="w-12 h-12 rounded border object-cover" src={photoUrl} alt="Contact" />
          ) : (
            <span className="w-12 h-12 rounded bg-gray-200 inline-block" />
          )}
          <div>
            <div className="text-sm font-semibold text-gray-900">{displayName}</div>
            {(displayEmail || displayPhone) ? (
              <div className="text-xs text-gray-600">
                {displayEmail}
                {displayEmail && displayPhone ? ' · ' : ''}
                {displayPhone}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No contact details</div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">Customer contact</label>
          <select
            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            value={contactId}
            onChange={e=>setContactId(e.target.value)}
            disabled={!contacts?.length}
          >
            <option value="">No contact</option>
            {(contacts||[]).map((c:any)=> (
              <option key={c.id} value={c.id}>{c.name || c.email || c.phone || c.id}</option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-2.5 py-1.5 rounded bg-brand-red text-white text-xs font-medium disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectEtaEdit({ projectId, proj, settings }:{ projectId:string, proj:any, settings:any }){
  const [isEditing, setIsEditing] = useState(false);
  const [eta, setEta] = useState<string>((proj?.date_eta||'').slice(0,10));
  const { data:projUpdated, refetch } = useQuery({ queryKey:['project', projectId], queryFn: ()=>api<Project>('GET', `/projects/${projectId}`) });
  const queryClient = useQueryClient();
  
  useEffect(()=>{
    if(projUpdated?.date_eta) setEta((projUpdated.date_eta||'').slice(0,10));
  }, [projUpdated?.date_eta]);
  
  const canEdit = useMemo(()=>{
    if (!proj?.status_label) return true;
    const statusLabelStr = String(proj.status_label).trim();
    const statusConfig = ((settings?.project_statuses||[]) as any[]).find((s:any)=> s.label === statusLabelStr);
    if (statusLabelStr.toLowerCase() === 'estimating') return true;
    const allowEdit = statusConfig?.meta?.allow_edit_proposal;
    return allowEdit === true || allowEdit === 'true' || allowEdit === 1;
  }, [proj?.status_label, settings]);
  
  if(!isEditing){
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-gray-900 flex-1">{(proj?.date_eta||'').slice(0,10)||'-'}</div>
        {canEdit && (
          <button onClick={()=>setIsEditing(true)} className="text-gray-500 hover:text-gray-700" title="Edit End Date">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <input type="date" className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400" value={eta} onChange={e=>setEta(e.target.value)} />
      <button onClick={async()=>{
        try{
          await api('PATCH', `/projects/${projectId}`, { date_eta: eta||null });
          queryClient.invalidateQueries({ queryKey:['project', projectId] });
          queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
          toast.success('End date updated');
          setIsEditing(false);
        }catch(_e){ toast.error('Failed to update'); }
      }} className="px-2.5 py-1.5 rounded bg-brand-red text-white text-xs font-medium">Save</button>
      <button onClick={()=>{ setIsEditing(false); setEta((proj?.date_eta||'').slice(0,10)); }} className="px-2.5 py-1.5 rounded bg-gray-100 text-gray-700 text-xs font-medium">Cancel</button>
    </div>
  );
}

// Helper function to calculate Final Total (with GST) from proposal data
function calculateProposalTotal(proposalData: any): number {
  if (!proposalData) return 0;

  const data = proposalData?.data || proposalData || {};
  const rawCosts = data.additional_costs || [];
  const additionalCosts = rawCosts.filter((item: any) => item && item.approved !== false);

  if (additionalCosts.length === 0) return 0;

  const pstRate = Number(data.pst_rate) || 7.0;
  const gstRate = Number(data.gst_rate) || 5.0;

  // Calculate Total Direct Costs
  const totalDirectCosts = additionalCosts.reduce((sum: number, item: any) => {
    const value = Number(item.value || 0);
    const quantity = Number(item.quantity || 1);
    return sum + (value * quantity);
  }, 0);

  // Calculate PST (only on items with pst=true)
  const totalForPst = additionalCosts
    .filter((item: any) => item.pst === true)
    .reduce((sum: number, item: any) => {
      const value = Number(item.value || 0);
      const quantity = Number(item.quantity || 1);
      return sum + (value * quantity);
    }, 0);

  const pst = totalForPst * (pstRate / 100);

  // Calculate Subtotal (Total Direct Costs + PST)
  const subtotal = totalDirectCosts + pst;

  // Calculate GST (only on items with gst=true)
  const totalForGst = additionalCosts
    .filter((item: any) => item.gst === true)
    .reduce((sum: number, item: any) => {
      const value = Number(item.value || 0);
      const quantity = Number(item.quantity || 1);
      return sum + (value * quantity);
    }, 0);
  
  const gst = totalForGst * (gstRate / 100);
  
  // Calculate Grand Total (Final Total with GST) = Subtotal + GST
  return subtotal + gst;
}

// Area conversion: same as ProposalForm. 1 SQS = 100 sqft; 1 mÂ² â‰ˆ 10.7639 sqft
function calculateProposalTotalArea(proposalData: any): number {
  if (!proposalData) return 0;
  const data = proposalData?.data || proposalData || {};
  const rawCosts = data.additional_costs || [];
  if (!Array.isArray(rawCosts)) return 0;
  const additionalCosts = rawCosts.filter((item: any) => item && item.approved !== false);
  const SQFT_PER_SQS = 100;
  const SQFT_PER_M2 = 10.7639;
  return additionalCosts.reduce((sum: number, item: any) => {
    if (!item || typeof item !== 'object') return sum;
    const val = Number(item.area_value);
    if (Number.isNaN(val) || val <= 0) return sum;
    const unit = item.area_unit;
    if (unit === 'sqft') return sum + val;
    if (unit === 'sqs') return sum + val * SQFT_PER_SQS;
    if (unit === 'm2') return sum + val * SQFT_PER_M2;
    return sum;
  }, 0);
}

function ProjectHeroPricingArea({ projectId, proposals }: { projectId: string; proposals: any[] }) {
  const organizedProposals = useMemo(() => {
    const original = proposals.find((p: any) => !p.is_change_order);
    const changeOrders = proposals
      .filter((p: any) => p.is_change_order)
      .sort((a: any, b: any) => (a.change_order_number || 0) - (b.change_order_number || 0));
    return { original: original || null, changeOrders };
  }, [proposals]);

  const { data: originalProposalData } = useQuery({
    queryKey: ['proposal', organizedProposals.original?.id],
    queryFn: () => organizedProposals.original?.id ? api<any>('GET', `/proposals/${organizedProposals.original.id}`) : Promise.resolve(null),
    enabled: !!organizedProposals.original?.id,
  });

  const changeOrderQueries = useQueries({
    queries: organizedProposals.changeOrders.map((co: any) => ({
      queryKey: ['proposal', co.id],
      queryFn: () => api<any>('GET', `/proposals/${co.id}`),
      enabled: !!co.id,
    })),
  });

  const { totalAreaSqft, grandTotal, displayUnit } = useMemo(() => {
    let totalAreaSqft = 0;
    let grandTotal = 0;
    let displayUnit: AreaUnit = 'sqft';

    const dataOriginal = originalProposalData || organizedProposals.original;
    if (dataOriginal) {
      totalAreaSqft += calculateProposalTotalArea(dataOriginal);
      grandTotal += calculateProposalTotal(dataOriginal);
      const d = dataOriginal?.data || dataOriginal || {};
      if (d.area_display_unit === 'sqft' || d.area_display_unit === 'm2' || d.area_display_unit === 'sqs') {
        displayUnit = d.area_display_unit;
      }
    }
    organizedProposals.changeOrders.forEach((co: any, idx: number) => {
      const res = changeOrderQueries[idx];
      const dataToUse = res?.data || co;
      totalAreaSqft += calculateProposalTotalArea(dataToUse);
      grandTotal += calculateProposalTotal(dataToUse);
    });

    return { totalAreaSqft, grandTotal, displayUnit };
  }, [originalProposalData, organizedProposals, changeOrderQueries]);

  if (totalAreaSqft <= 0) return null;

  const displayArea = fromSqft(totalAreaSqft, displayUnit);
  const costPerArea = displayArea > 0 ? grandTotal / displayArea : 0;

  return (
    <div className={HERO_FIELD_STACK}>
      <div>
        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Total Area (Pricing)</div>
        <div className="text-xs font-semibold text-gray-900">
          {displayArea.toLocaleString('en-US', { maximumFractionDigits: 2 })} {formatAreaLabel(displayUnit)}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Cost per Area</div>
        <div className="text-xs font-semibold text-gray-900">
          ${costPerArea.toFixed(2)}/{formatAreaLabel(displayUnit)}
        </div>
      </div>
    </div>
  );
}

