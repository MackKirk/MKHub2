import type { WidgetDef } from './types';
import { getWidgetIcon } from './widgetRegistry';
import { getChartMetricLabel } from './widgets/chartShared';

type WidgetWrapperProps = {
  widget: WidgetDef;
  isEditMode: boolean;
  onRemove: () => void;
  onOpenConfig: () => void;
  children: React.ReactNode;
};

export function WidgetWrapper({ widget, isEditMode, onRemove, onOpenConfig, children }: WidgetWrapperProps) {
  const isShortcut = widget.type === 'shortcuts';

  const cardClass =
    'h-full relative rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200';
  const cardHoverClass = !isEditMode ? 'hover:shadow-lg hover:border-gray-300/80' : '';

  if (isShortcut) {
    return (
      <div className={`${cardClass} ${cardHoverClass} [container-type:size] [container-name:widget]`}>
        {children}
        {isEditMode && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 shadow-sm hover:bg-red-100 text-gray-500 hover:text-red-600 z-10"
            title="Remove"
          >
            <span aria-hidden>🗑️</span>
          </button>
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
    <div className={`${cardClass} flex flex-col ${cardHoverClass} [container-type:size] [container-name:widget]`}>
      <div
        className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 shrink-0 min-h-0"
        style={{ padding: 'clamp(0.25rem, 2cqh, 0.5rem) clamp(0.5rem, 3cqw, 0.75rem)' }}
      >
        <span
          className="font-medium text-gray-800 truncate flex items-center gap-1 min-w-0"
          style={{ fontSize: 'clamp(0.625rem, 5.5cqw, 0.875rem)' }}
          title={typeof title === 'string' ? title : undefined}
        >
          <span className="shrink-0" style={{ fontSize: 'clamp(0.625rem, 5cqh, 0.875rem)' }} aria-hidden>{icon}</span>
          {title}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onOpenConfig}
            className="rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors p-1"
            style={{ padding: 'clamp(0.125rem, 1.5cqh, 0.375rem)' }}
            title="Settings"
          >
            <span aria-hidden>⚙️</span>
          </button>
          {isEditMode && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors p-1"
              style={{ padding: 'clamp(0.125rem, 1.5cqh, 0.375rem)' }}
              title="Remove"
            >
              <span aria-hidden>🗑️</span>
            </button>
          )}
        </div>
      </div>
      <div
        className="flex-1 min-h-0 overflow-auto"
        style={{ padding: 'clamp(0.25rem, 2cqh, 0.75rem)' }}
      >
        {children}
      </div>
    </div>
  );
}
