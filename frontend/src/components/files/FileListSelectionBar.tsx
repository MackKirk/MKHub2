import { AppButton, uiCx, uiLayout, uiTypography } from '@/components/ui';

type FileListSelectionBarProps = {
  selectedCount: number;
  visibleCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  deleting?: boolean;
  className?: string;
};

export function FileListSelectionBar({
  selectedCount,
  visibleCount,
  onSelectAll,
  onClear,
  onDeleteSelected,
  deleting,
  className,
}: FileListSelectionBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className={uiCx(
        'mb-3 flex min-h-[2.75rem] flex-wrap items-center gap-2 rounded-lg border border-brand-red/20 bg-brand-red/5 px-3 py-2',
        className,
      )}
    >
      <span className={uiCx(uiTypography.helper, 'font-semibold text-gray-800')}>
        {selectedCount} selected
      </span>
      <div className={uiCx(uiLayout.actionsRow, 'ml-auto gap-2')}>
        {selectedCount < visibleCount ? (
          <AppButton variant="ghost" size="sm" type="button" onClick={onSelectAll}>
            Select all ({visibleCount})
          </AppButton>
        ) : null}
        <AppButton variant="ghost" size="sm" type="button" onClick={onClear}>
          Clear
        </AppButton>
        <AppButton
          variant="secondary"
          size="sm"
          type="button"
          onClick={onDeleteSelected}
          loading={deleting}
        >
          Delete selected
        </AppButton>
      </div>
    </div>
  );
}
