import type { WidgetDef } from './types';
import { getWidgetIcon } from './widgetRegistry';
import { getChartMetricLabel } from './widgets/chartShared';
import { AppButton, uiBorders, uiColors, uiCx, uiRadius, uiShadows, uiSpacing, uiTypography } from '@/components/ui';
import { Settings, Trash2 } from 'lucide-react';

type WidgetWrapperProps = {
  widget: WidgetDef;
  isEditMode: boolean;
  onRemove: () => void;
  onOpenConfig: () => void;
  children: React.ReactNode;
};

export function WidgetWrapper({ widget, isEditMode, onRemove, onOpenConfig, children }: WidgetWrapperProps) {
  const isShortcut = widget.type === 'shortcuts';

  const cardClass = uiCx(
    'relative h-full overflow-hidden transition-shadow duration-200 [container-type:size] [container-name:widget]',
    uiRadius.card,
    uiBorders.subtle,
    uiColors.surface,
    uiShadows.card,
  );
  const cardHoverClass = !isEditMode ? 'hover:border-gray-300/80 hover:shadow-lg' : '';

  if (isShortcut) {
    return (
      <div className={uiCx(cardClass, cardHoverClass)}>
        {children}
        {isEditMode && (
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            className="absolute right-2 top-2 z-10 bg-white/90 shadow-sm hover:bg-red-50 hover:text-red-600"
            title="Remove"
            aria-label="Remove widget"
          >
            <Trash2 className="h-4 w-4" />
          </AppButton>
        )}
      </div>
    );
  }

  const title =
    widget.type === 'chart' && widget.config?.metric
      ? getChartMetricLabel(String(widget.config.metric))
      : (widget.title ?? widget.type);
  const icon = getWidgetIcon(widget);

  return (
    <div className={uiCx(cardClass, 'flex flex-col', cardHoverClass)}>
      <div
        className={uiCx(
          'flex shrink-0 min-h-0 items-center justify-between border-b border-gray-100',
          uiColors.surfaceSubtle,
          'px-[clamp(0.5rem,3cqw,0.75rem)] py-[clamp(0.25rem,2cqh,0.5rem)]',
        )}
      >
        <span
          className={uiCx(
            'flex min-w-0 items-center gap-1 truncate font-medium text-gray-800',
            'text-[clamp(0.625rem,5.5cqw,0.875rem)]',
          )}
          title={typeof title === 'string' ? title : undefined}
        >
          <span className="shrink-0 text-[clamp(0.625rem,5cqh,0.875rem)]" aria-hidden>
            {icon}
          </span>
          {title}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenConfig}
            className="h-auto min-h-0 p-[clamp(0.125rem,1.5cqh,0.375rem)]"
            title="Settings"
            aria-label="Widget settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </AppButton>
          {isEditMode && (
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-auto min-h-0 p-[clamp(0.125rem,1.5cqh,0.375rem)] hover:bg-red-50 hover:text-red-600"
              title="Remove"
              aria-label="Remove widget"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </AppButton>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-[clamp(0.25rem,2cqh,0.75rem)]">{children}</div>
    </div>
  );
}
