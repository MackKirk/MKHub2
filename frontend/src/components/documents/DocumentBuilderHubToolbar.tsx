import { Search } from 'lucide-react';
import { AppInput, AppSelect, uiBorders, uiColors, uiCx, uiRadius } from '@/components/ui';
import type { DocumentHubSortKey, DocumentHubStatusFilter } from '@/lib/documentHubListUtils';

type DocumentBuilderHubToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: DocumentHubStatusFilter;
  onStatusFilterChange: (value: DocumentHubStatusFilter) => void;
  sortKey: DocumentHubSortKey;
  onSortKeyChange: (value: DocumentHubSortKey) => void;
};

const STATUS_OPTIONS: { value: DocumentHubStatusFilter; label: string }[] = [
  { value: 'all', label: 'All status' },
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'signed', label: 'Signed' },
];

const SORT_OPTIONS: { value: DocumentHubSortKey; label: string }[] = [
  { value: 'updated', label: 'Sort: Updated' },
  { value: 'title', label: 'Sort: Title' },
  { value: 'status', label: 'Sort: Status' },
];

export default function DocumentBuilderHubToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortKey,
  onSortKeyChange,
}: DocumentBuilderHubToolbarProps) {
  return (
    <div
      className={uiCx(
        uiBorders.subtle,
        uiColors.surface,
        uiRadius.card,
        'flex flex-wrap items-center gap-2 px-4 py-3',
      )}
    >
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <AppInput
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search documents..."
          className="!pl-9"
          aria-label="Search documents"
        />
      </div>
      <div className="w-40 shrink-0">
        <AppSelect
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as DocumentHubStatusFilter)}
          options={STATUS_OPTIONS}
          aria-label="Filter by status"
        />
      </div>
      <div className="w-44 shrink-0">
        <AppSelect
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as DocumentHubSortKey)}
          options={SORT_OPTIONS}
          aria-label="Sort documents"
        />
      </div>
    </div>
  );
}
