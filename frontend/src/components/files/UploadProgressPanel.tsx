import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { uiBorders, uiColors, uiCx, uiRadius, uiTypography } from '@/components/ui/tokens';

export type UploadProgressStatus = 'pending' | 'uploading' | 'success' | 'error';

export type UploadProgressItem = {
  id: string;
  name: string;
  size?: number;
  progress: number;
  status: UploadProgressStatus;
  error?: string;
  /** Community proxy uploads have no byte progress. */
  indeterminate?: boolean;
};

export function UploadProgressPanel({
  items,
  onClear,
}: {
  items: UploadProgressItem[];
  onClear: () => void;
}) {
  if (!items.length) return null;
  const finished = items.filter((item) => item.status === 'success' || item.status === 'error').length;

  return (
    <AppCard
      className={uiCx('fixed bottom-4 right-4 z-50 w-80 max-h-96 overflow-hidden shadow-2xl', uiBorders.subtle, uiRadius.card)}
      bodyClassName="p-0"
    >
      <div className={uiCx('flex items-center justify-between border-b px-2.5 py-2', uiBorders.subtle, uiColors.surfaceSubtle)}>
        <div className={uiCx(uiTypography.sectionTitle, 'text-sm')}>
          Upload Progress
          <span className={uiCx(uiTypography.helper, 'ml-2 font-normal')}>
            {finished} of {items.length}
          </span>
        </div>
        <AppButton variant="ghost" size="sm" type="button" onClick={onClear}>
          Clear
        </AppButton>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className={uiCx('border-b px-2.5 py-2', uiBorders.subtle)}>
            <div className="mb-1 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className={uiCx(uiTypography.body, 'truncate text-sm font-semibold')} title={item.name}>
                  {item.name}
                </div>
                {typeof item.size === 'number' ? (
                  <div className={uiTypography.helper}>{(item.size / 1024 / 1024).toFixed(2)} MB</div>
                ) : null}
              </div>
              <div className="text-sm">
                {item.status === 'pending' && '…'}
                {item.status === 'uploading' && '…'}
                {item.status === 'success' && '✓'}
                {item.status === 'error' && '✕'}
              </div>
            </div>
            {item.status === 'uploading' && item.indeterminate ? (
              <div className={uiCx('mt-1 h-1.5 w-full overflow-hidden', uiRadius.badge, uiColors.surfaceSubtle)}>
                <div className={uiCx('h-full w-full animate-pulse bg-blue-600', uiRadius.badge)} />
              </div>
            ) : null}
            {item.status === 'uploading' && !item.indeterminate ? (
              <div className={uiCx('mt-1 h-1.5 w-full overflow-hidden', uiRadius.badge, uiColors.surfaceSubtle)}>
                <div
                  className={uiCx('h-full bg-blue-600 transition-all', uiRadius.badge)}
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            ) : null}
            {item.status === 'error' ? (
              <div className={uiCx(uiTypography.helper, 'mt-1 text-red-600')} title={item.error}>
                {item.error || 'Upload failed'}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </AppCard>
  );
}
