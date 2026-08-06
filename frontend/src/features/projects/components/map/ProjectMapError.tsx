import { AppButton, uiCx, uiTypography } from '@/components/ui';

type Props = {
  message: string;
  onRetry?: () => void;
};

export function ProjectMapError({ message, onRetry }: Props) {
  return (
    <div
      className={uiCx('flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-8 text-center')}
      style={{ minHeight: 320 }}
      role="alert"
    >
      <p className={uiTypography.body}>{message}</p>
      {onRetry ? (
        <AppButton type="button" variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </AppButton>
      ) : null}
    </div>
  );
}
