import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppListCreateItem,
  AppModal,
  AppSectionHeader,
  AppSelect,
  type AppSelectOptionGroup,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
  uiUserSelect,
} from '@/components/ui';

import { ReportStatusChangeBadges } from '@/components/ReportStatusChangeBadges';
import {
  formatReportListSubtitle,
  reportHasStatusBadges,
  type ReportNoteLike,
} from '@/lib/reportNotes';

type ProjectReport = {
  id: string;
  title?: string;
  category_id?: string;
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
  created_at?: string;
  created_by?: string;
  created_by_name?: string;
  financial_value?: number;
  financial_type?: string;
  estimate_data?: any;
  approval_status?: string;
};

type AuthorInfo = { name: string; avatar: string };

export type ProjectReportsTabDsProps = {
  projectId: string;
  sortedReports: ProjectReport[];
  selectedReportId: string | null;
  setSelectedReportId: (id: string | null) => void;
  selectedReport: ProjectReport | null;
  canCreateNote: boolean;
  canWriteReports: boolean;
  isWriteCategoryAllowed: (categoryId?: string | null) => boolean;
  categoryFilterOptionGroups: AppSelectOptionGroup[];
  selectedCategoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  reportCategories: any[];
  getAuthorInfo: (createdBy: string | null | undefined, createdByName?: string | null) => AuthorInfo;
  getPreviewText: (text: string, maxLength?: number) => string;
  getAttachmentIcon: (contentType: string, originalName: string) => string;
  handleAttachmentClick: (attachment: any) => void;
  onRefresh: () => any;
  confirm: (opts: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
  }) => Promise<string>;
  onNewNote: () => void;
  onEditNote: () => void;
  previewAttachment: { file_object_id: string; original_name: string; content_type: string } | null;
  onClosePreview: () => void;
};

function approvalBadgeVariant(status?: string): 'success' | 'warning' | 'neutral' {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  return 'neutral';
}

function EstimateChangesBlock({ selectedReport }: { selectedReport: ProjectReport }) {
  const estimateData = selectedReport.estimate_data;
  const items = estimateData?.items || [];
  const sectionOrder = estimateData?.section_order || [];
  const sectionNames = estimateData?.section_names || {};

  const calculateItemTotal = (item: any): number => {
    if (item.item_type === 'labour' && item.labour_journey_type) {
      if (item.labour_journey_type === 'contract') {
        return (item.labour_journey || 0) * (item.unit_price || 0);
      }
      return (item.labour_journey || 0) * (item.labour_men || 0) * (item.unit_price || 0);
    }
    return (item.quantity || 0) * (item.unit_price || 0);
  };

  const calculateItemTotalWithMarkup = (item: any): number => {
    const itemTotal = calculateItemTotal(item);
    const itemMarkup =
      item.markup !== undefined && item.markup !== null ? item.markup : estimateData?.markup || 0;
    return itemTotal * (1 + itemMarkup / 100);
  };

  const grandTotal = items.reduce(
    (sum: number, item: any) => sum + calculateItemTotalWithMarkup(item),
    0,
  );

  const itemsBySection: Record<string, any[]> = {};
  items.forEach((item: any) => {
    const section = item.section || 'other';
    if (!itemsBySection[section]) itemsBySection[section] = [];
    itemsBySection[section].push(item);
  });

  const orderedSections =
    sectionOrder.length > 0
      ? sectionOrder.filter((s: string) => itemsBySection[s])
      : Object.keys(itemsBySection).sort();

  return (
    <div
      className={uiCx(
        'mb-4 p-3',
        uiRadius.card,
        uiBorders.subtle,
        uiColors.surfaceSubtle,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className={uiTypography.sectionTitle}>Change Order Summary</div>
        {selectedReport.approval_status === 'approved' && (
          <span className={uiCx(uiTypography.helper, 'text-green-700')}>
            Items added to project estimate
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className={uiTypography.helper}>No items in this estimate change.</p>
      ) : (
        <div className="space-y-3">
          {orderedSections.map((section: string) => {
            const sectionItems = itemsBySection[section] || [];
            const sectionName = sectionNames[section] || section || 'Other';
            const sectionTotal = sectionItems.reduce(
              (sum: number, item: any) => sum + calculateItemTotalWithMarkup(item),
              0,
            );
            return (
              <div key={section} className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface)}>
                <div
                  className={uiCx(
                    'border-b px-2.5 py-2',
                    uiBorders.subtle,
                    uiColors.surfaceSubtle,
                  )}
                >
                  <div className={uiTypography.sectionTitle}>{sectionName}</div>
                </div>
                <div className={uiCx('divide-y', uiBorders.subtle)}>
                  {sectionItems.map((item: any, idx: number) => {
                    const itemTotal = calculateItemTotalWithMarkup(item);
                    return (
                      <div key={idx} className="px-2.5 py-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className={uiCx(uiTypography.body, 'mb-1 font-medium')}>
                              {item.name || 'Unnamed Item'}
                            </div>
                            <div
                              className={uiCx(
                                'flex flex-wrap gap-x-4 gap-y-1',
                                uiTypography.helper,
                              )}
                            >
                              <span>
                                <span className="font-medium">Qty:</span> {item.quantity || 0}{' '}
                                {item.unit || ''}
                              </span>
                              {item.item_type === 'labour' && item.labour_journey && (
                                <>
                                  <span>
                                    <span className="font-medium">Journey:</span>{' '}
                                    {item.labour_journey} {item.labour_journey_type || 'hours'}
                                  </span>
                                  {item.labour_men && item.labour_men > 0 && (
                                    <span>
                                      <span className="font-medium">Men:</span> {item.labour_men}
                                    </span>
                                  )}
                                </>
                              )}
                              <span>
                                <span className="font-medium">Unit Price:</span> $
                                {(item.unit_price || 0).toFixed(2)}
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
                              {item.markup !== undefined &&
                                item.markup !== null &&
                                item.markup > 0 && (
                                  <span>
                                    <span className="font-medium">Markup:</span>{' '}
                                    {item.markup.toFixed(1)}%
                                  </span>
                                )}
                              {item.taxable && (
                                <span className="font-medium text-green-700">Taxable</span>
                              )}
                            </div>
                            {item.description && (
                              <p className={uiCx('mt-1 italic', uiTypography.helper)}>
                                {item.description}
                              </p>
                            )}
                          </div>
                          <div className={uiCx(uiTypography.body, 'shrink-0 font-semibold')}>
                            ${itemTotal.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {sectionItems.length > 1 && (
                  <div
                    className={uiCx(
                      'flex justify-end border-t px-2.5 py-2',
                      uiBorders.subtle,
                      uiColors.surfaceSubtle,
                    )}
                  >
                    <div className={uiCx(uiTypography.body, 'font-semibold')}>
                      Section Total: ${sectionTotal.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className={uiCx('border-t pt-2', uiBorders.subtle)}>
            <div className="flex justify-end">
              <div className={uiCx(uiTypography.body, 'font-bold')}>
                Grand Total: ${grandTotal.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportDetailPanel({
  projectId,
  selectedReport,
  reportCategories,
  canWriteReports,
  isWriteCategoryAllowed,
  getAuthorInfo,
  getAttachmentIcon,
  handleAttachmentClick,
  onRefresh,
  confirm,
  setSelectedReportId,
  onEditNote,
}: Pick<
  ProjectReportsTabDsProps,
  | 'projectId'
  | 'selectedReport'
  | 'reportCategories'
  | 'canWriteReports'
  | 'isWriteCategoryAllowed'
  | 'getAuthorInfo'
  | 'getAttachmentIcon'
  | 'handleAttachmentClick'
  | 'onRefresh'
  | 'confirm'
  | 'setSelectedReportId'
  | 'onEditNote'
> & { selectedReport: ProjectReport }) {
  const reportDate = selectedReport.created_at ? new Date(selectedReport.created_at) : null;
  const attachments = selectedReport.images?.attachments || [];
  const authorInfo = getAuthorInfo(selectedReport.created_by, selectedReport.created_by_name);
  const hasStatusBadges = reportHasStatusBadges(selectedReport as ReportNoteLike);
  const categoryLabel =
    reportCategories.find((c) => c.value === selectedReport.category_id)?.label ||
    selectedReport.category_id ||
    'General';

  return (
    <>
      <div
        className={uiCx(
          'flex-shrink-0 border-b',
          uiBorders.subtle,
          uiColors.surfaceSubtle,
          uiSpacing.compactCardPadding,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className={uiTypography.sectionTitle}>
              {selectedReport.title || 'Untitled Note'}
            </h2>
            {hasStatusBadges && (
              <div className="mt-1">
                <ReportStatusChangeBadges report={selectedReport as ReportNoteLike} />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <img
                  src={authorInfo.avatar}
                  alt={authorInfo.name}
                  className={uiCx(uiUserSelect.avatarSm, 'rounded-full object-cover')}
                />
                <div>
                  <div className={uiCx(uiTypography.body, 'font-medium')}>{authorInfo.name}</div>
                  <div className={uiTypography.helper}>
                    {reportDate
                      ? reportDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </div>
                </div>
              </div>
              {selectedReport.category_id && (
                <AppBadge variant="info">{categoryLabel}</AppBadge>
              )}
            </div>
          </div>
          <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
            {selectedReport.financial_type === 'estimate-changes' &&
              selectedReport.approval_status === 'pending' &&
              canWriteReports &&
              isWriteCategoryAllowed(selectedReport.category_id) && (
                <AppButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const result = await confirm({
                      title: 'Approve Change Order',
                      message:
                        'Are you sure you want to approve this Change Order note? The items will be added to the project estimate.',
                      confirmText: 'Approve',
                      cancelText: 'Cancel',
                    });
                    if (result !== 'confirm') return;
                    try {
                      await api(
                        'POST',
                        `/projects/${projectId}/reports/${selectedReport.id}/approve`,
                      );
                      await onRefresh();
                      toast.success('Note approved and items added to estimate');
                    } catch (_e: any) {
                      toast.error(_e.message || 'Failed to approve note');
                    }
                  }}
                >
                  Approve
                </AppButton>
              )}
            {selectedReport.financial_type === 'estimate-changes' &&
              selectedReport.approval_status && (
                <AppBadge variant={approvalBadgeVariant(selectedReport.approval_status)}>
                  {selectedReport.approval_status === 'approved'
                    ? 'Approved'
                    : selectedReport.approval_status === 'pending'
                      ? 'Pending'
                      : 'Rejected'}
                </AppBadge>
              )}
            {canWriteReports && isWriteCategoryAllowed(selectedReport.category_id) && (
              <>
                <AppButton type="button" size="sm" variant="secondary" onClick={onEditNote}>
                  Edit
                </AppButton>
                <AppButton
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                  const result = await confirm({
                    title: 'Delete Note',
                    message: `Are you sure you want to delete "${selectedReport.title || 'this note'}"? This action cannot be undone.`,
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                  });
                  if (result !== 'confirm') return;
                  try {
                    await api('DELETE', `/projects/${projectId}/reports/${selectedReport.id}`);
                    await onRefresh();
                    setSelectedReportId(null);
                    toast.success('Note deleted');
                  } catch {
                    toast.error('Failed to delete note');
                  }
                }}
              >
                Delete
              </AppButton>
              </>
            )}
          </div>
        </div>
      </div>

      <div className={uiCx('flex-1 overflow-y-auto', uiSpacing.cardPadding)}>
        {(selectedReport.financial_type === 'additional-income' ||
          selectedReport.financial_type === 'additional-expense') &&
          selectedReport.financial_value !== undefined && (
            <div
              className={uiCx(
                'mb-4 p-3',
                uiRadius.card,
                uiBorders.subtle,
                selectedReport.financial_type === 'additional-expense'
                  ? 'border-red-200 bg-red-50'
                  : 'border-blue-200 bg-blue-50',
              )}
            >
              <div className={uiTypography.helper}>
                {selectedReport.financial_type === 'additional-income'
                  ? 'Additional Income'
                  : 'Expense'}
              </div>
              <div className={uiCx(uiTypography.sectionTitle, 'text-lg')}>
                ${(selectedReport.financial_value || 0).toFixed(2)}
              </div>
            </div>
          )}

        {selectedReport.financial_type === 'estimate-changes' && selectedReport.estimate_data && (
          <EstimateChangesBlock selectedReport={selectedReport} />
        )}

        <div className={uiCx(uiTypography.body, 'whitespace-pre-wrap leading-relaxed')}>
          {selectedReport.description || 'No description provided.'}
        </div>

        {attachments.length > 0 && (
          <div className={uiCx('mt-4 border-t pt-4', uiBorders.subtle)}>
            <h3 className={uiCx(uiTypography.sectionTitle, 'mb-2')}>
              Attachments ({attachments.length})
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {attachments.map((a: any, i: number) => {
                const isImage =
                  (a.content_type || '').startsWith('image/') ||
                  /\.(jpg|jpeg|png|gif|webp)$/i.test(a.original_name || '');
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAttachmentClick(a)}
                    className={uiCx(
                      'overflow-hidden text-left transition-colors hover:bg-gray-50',
                      uiRadius.card,
                      uiBorders.subtle,
                      uiColors.surface,
                    )}
                  >
                    {isImage ? (
                      <>
                        <img
                          src={withFileAccessToken(
                            `/files/${a.file_object_id}/thumbnail?w=400`,
                          )}
                          alt={a.original_name || 'attachment'}
                          className="h-32 w-full object-cover"
                        />
                        <div className={uiCx('border-t p-2', uiBorders.subtle)}>
                          <div className={uiCx(uiTypography.helper, 'truncate')} title={a.original_name}>
                            {a.original_name || 'attachment'}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 p-3">
                        <span className="text-sm">
                          {getAttachmentIcon(a.content_type || '', a.original_name || '')}
                        </span>
                        <span className={uiCx(uiTypography.helper, 'truncate')}>
                          {a.original_name || 'attachment'}
                        </span>
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
}

export function ProjectReportsTabDs(props: ProjectReportsTabDsProps) {
  const {
    projectId,
    sortedReports,
    selectedReportId,
    setSelectedReportId,
    selectedReport,
    canCreateNote,
    categoryFilterOptionGroups,
    selectedCategoryFilter,
    onCategoryFilterChange,
    reportCategories,
    getAuthorInfo,
    getPreviewText,
    onNewNote,
    previewAttachment,
    onClosePreview,
    ...detailProps
  } = props;

  return (
    <>
      <AppCard className="!rounded-2xl" bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader
          title="Notes/History"
          description="Commercial updates, site activity, and shared timeline for this opportunity. Filter by category or create a new note."
          {...appSectionPresetProps('notesHistory')}
        />
        <div
          className={uiCx(
            'mt-4 overflow-hidden',
            uiRadius.card,
            uiBorders.subtle,
          )}
        >
          <div className="flex min-h-[min(65vh,560px)] max-h-[min(75vh,720px)]">
          <aside
            className={uiCx(
              'flex w-[min(100%,300px)] shrink-0 flex-col gap-3 border-r p-3 sm:w-[32%] sm:max-w-[320px]',
              uiBorders.subtle,
              uiColors.surface,
            )}
          >
            <div
              className={uiCx(
                uiRadius.card,
                uiBorders.subtle,
                uiColors.surface,
                uiSpacing.compactCardPadding,
              )}
            >
              <AppSelect
                label="Filter by category"
                value={selectedCategoryFilter}
                onChange={(e) => onCategoryFilterChange(e.target.value)}
                optionGroups={categoryFilterOptionGroups}
                sortOptions={false}
                triggerClassName="rounded-xl"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {canCreateNote && (
                <AppListCreateItem
                  label="New Note"
                  layout="row"
                  className="w-full !rounded-xl"
                  onClick={onNewNote}
                />
              )}
              {sortedReports.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {sortedReports.map((r) => {
                    const reportDate = r.created_at ? new Date(r.created_at) : null;
                    const attachments = r.images?.attachments || [];
                    const isSelected = selectedReportId === r.id;
                    const authorInfo = getAuthorInfo(r.created_by, r.created_by_name);
                    const preview = getPreviewText(r.description || '');
                    const listSubtitle = formatReportListSubtitle(r as ReportNoteLike, authorInfo.name);
                    const hasStatusBadges = reportHasStatusBadges(r as ReportNoteLike);
                    const categoryLabel = r.category_id
                      ? reportCategories.find((c) => (c.value || c.label) === r.category_id)
                          ?.label || r.category_id
                      : null;

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedReportId(r.id)}
                        className={uiCx(
                          'w-full border-l-2 p-3 text-left transition-colors',
                          uiRadius.card,
                          isSelected
                            ? 'border-l-brand-red bg-gray-50'
                            : 'border-l-transparent hover:bg-gray-50',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <img
                            src={authorInfo.avatar}
                            alt={authorInfo.name}
                            className={uiCx(
                              uiUserSelect.avatarSm,
                              'shrink-0 rounded-full object-cover',
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className={uiCx(
                                uiTypography.body,
                                'mb-0.5 font-semibold',
                                isSelected && 'text-gray-900',
                              )}
                            >
                              {r.title || 'Untitled Note'}
                            </div>
                            <div
                              className={uiCx(
                                'flex flex-wrap items-center gap-1.5',
                                uiTypography.helper,
                              )}
                            >
                              {hasStatusBadges && (
                                <ReportStatusChangeBadges
                                  report={r as ReportNoteLike}
                                  compact
                                />
                              )}
                              {hasStatusBadges && <span className="text-gray-400">·</span>}
                              <span>{listSubtitle}</span>
                            </div>
                            {preview && (
                              <p className={uiCx('mt-1 line-clamp-2', uiTypography.helper)}>
                                {preview}
                              </p>
                            )}
                            <div
                              className={uiCx(
                                'mt-1.5 flex flex-wrap items-center gap-1.5',
                                uiTypography.helper,
                              )}
                            >
                              {reportDate &&
                                reportDate.toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              {attachments.length > 0 && (
                                <span>{attachments.length} attachment(s)</span>
                              )}
                              {categoryLabel && (
                                <AppBadge variant="info" className="normal-case">
                                  {categoryLabel}
                                </AppBadge>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <AppEmptyState
                  className="rounded-2xl [&>div:first-child]:rounded-xl"
                  title="No notes yet"
                  description={
                    canCreateNote
                      ? 'Create your first note using New Note above.'
                      : undefined
                  }
                />
              )}
            </div>
          </aside>

          <div className={uiCx('flex min-w-0 flex-1 flex-col', uiColors.surface)}>
            {selectedReport ? (
              <ReportDetailPanel
                projectId={projectId}
                selectedReport={selectedReport}
                setSelectedReportId={setSelectedReportId}
                reportCategories={reportCategories}
                getAuthorInfo={getAuthorInfo}
                {...detailProps}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <AppEmptyState
                  className="max-w-md rounded-2xl"
                  title="Select a note"
                  description="Choose a note from the list to view its details."
                />
              </div>
            )}
          </div>
        </div>
        </div>
      </AppCard>

      <AppModal
        open={!!previewAttachment}
        onClose={onClosePreview}
        title={previewAttachment?.original_name}
        size="lg"
        bodyClassName="p-0"
        bodyFill={false}
      >
        {previewAttachment && (
          <img
            src={withFileAccessToken(
              `/files/${previewAttachment.file_object_id}/thumbnail?w=1200`,
            )}
            alt={previewAttachment.original_name}
            className="max-h-[calc(90vh-120px)] w-full object-contain"
          />
        )}
      </AppModal>
    </>
  );
}
