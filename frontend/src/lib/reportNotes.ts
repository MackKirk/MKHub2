export type ReportStatusChangeMeta = {
  from_label?: string;
  to_label?: string;
  from_id?: string | null;
  to_id?: string | null;
  status_changed?: boolean;
};

export type ReportNoteLike = {
  title?: string | null;
  images?: {
    attachments?: unknown[];
    status_change?: ReportStatusChangeMeta;
  } | null;
  created_by_name?: string | null;
};

export const STATUS_CHANGE_REPORT_TITLE = 'Status Change';

export function isStatusChangeReport(report: ReportNoteLike | null | undefined): boolean {
  if (!report) return false;
  if (report.title === STATUS_CHANGE_REPORT_TITLE) return true;
  return Boolean(getReportStatusChangeMeta(report));
}

export function getReportStatusChangeMeta(
  report: ReportNoteLike | null | undefined,
): ReportStatusChangeMeta | null {
  const meta = report?.images?.status_change;
  if (!meta || typeof meta !== 'object') return null;
  return meta;
}

function normStatusLabel(label: unknown): string {
  return String(label || '')
    .trim()
    .toLowerCase();
}

/** True when the note was saved without an actual status transition. */
export function isSameStatusChange(meta: ReportStatusChangeMeta): boolean {
  if (meta.status_changed === false) return true;
  if (meta.status_changed === true) return false;

  const fromId = meta.from_id != null ? String(meta.from_id) : '';
  const toId = meta.to_id != null ? String(meta.to_id) : '';
  if (fromId && toId && fromId === toId) return true;

  const from = normStatusLabel(meta.from_label);
  const to = normStatusLabel(meta.to_label);
  if (from && to && from === to && from !== '—' && from !== '-') return true;

  return false;
}

export function formatStatusChangeLabel(
  fromLabel?: string | null,
  toLabel?: string | null,
): string | null {
  const from = (fromLabel || '').trim();
  const to = (toLabel || '').trim();
  if (from && to) return `From ${from} to ${to}`;
  if (to) return `To ${to}`;
  if (from) return `From ${from}`;
  return null;
}

export function getStatusChangeSummary(report: ReportNoteLike | null | undefined): string | null {
  const meta = getReportStatusChangeMeta(report);
  if (meta) {
    if (isSameStatusChange(meta)) return null;
    return formatStatusChangeLabel(meta.from_label, meta.to_label);
  }
  if (isStatusChangeReport(report)) {
    return 'Status updated';
  }
  return null;
}

export type StatusChangeTransition = {
  fromLabel: string;
  toLabel: string;
};

/** From/to labels when status actually changed (for badge transition UI). */
export function getStatusChangeTransition(
  report: ReportNoteLike | null | undefined,
): StatusChangeTransition | null {
  const meta = getReportStatusChangeMeta(report);
  if (!meta || isSameStatusChange(meta)) return null;

  const fromLabel = (meta.from_label || '').trim();
  const toLabel = (meta.to_label || '').trim();
  const fromOk = fromLabel && fromLabel !== '—' && fromLabel !== '-';
  const toOk = toLabel && toLabel !== '—' && toLabel !== '-';

  if (fromOk && toOk) return { fromLabel, toLabel };
  if (toOk) return { fromLabel: '', toLabel };
  if (fromOk) return { fromLabel, toLabel: '' };
  return null;
}

export function reportHasStatusBadges(report: ReportNoteLike | null | undefined): boolean {
  return Boolean(getStatusNoteOnlyLabel(report) || getStatusChangeTransition(report));
}

/** Status label when the note was added without changing status (for badge display). */
export function getStatusNoteOnlyLabel(report: ReportNoteLike | null | undefined): string | null {
  const meta = getReportStatusChangeMeta(report);
  if (!meta || !isSameStatusChange(meta)) return null;
  const label = (meta.to_label || meta.from_label || '').trim();
  if (!label || label === '—' || label === '-') return null;
  return label;
}

export function formatReportListSubtitle(
  report: ReportNoteLike,
  authorName: string,
): string {
  return authorName;
}
