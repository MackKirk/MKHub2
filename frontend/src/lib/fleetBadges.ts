/**
 * Centralized labels and CSS classes for Fleet module badges:
 * inspection result, work order status, schedule status, urgency, category.
 */

export const INSPECTION_RESULT_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'conditional', label: 'Conditional' },
];

export const INSPECTION_RESULT_LABELS: Record<string, string> = {
  pending: 'Pending',
  pass: 'Pass',
  fail: 'Fail',
  conditional: 'Conditional',
};

export const INSPECTION_RESULT_COLORS: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-800',
  pass: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-800',
  conditional: 'bg-yellow-100 text-yellow-800',
};

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  open: 'Pending',
  in_progress: 'In progress',
  pending_parts: 'Awaiting parts',
  closed: 'Finished',
  cancelled: 'Cancelled',
  not_approved: 'Not approved',
};

export const WORK_ORDER_STATUS_COLORS: Record<string, string> = {
  open: 'bg-slate-100 text-slate-800',
  in_progress: 'bg-amber-100 text-amber-800',
  pending_parts: 'bg-orange-100 text-orange-800',
  closed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  not_approved: 'bg-rose-100 text-rose-800',
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const WORK_ORDER_STATUS_OPTIONS = Object.entries(WORK_ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label }));

export const URGENCY_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const URGENCY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800',
  normal: 'bg-gray-100 text-gray-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

export const CATEGORY_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  repair: 'Repair',
  inspection: 'Inspection',
  other: 'Other',
};
