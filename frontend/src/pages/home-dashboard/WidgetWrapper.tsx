import type { WidgetDef } from './types';
import { getChartMetricLabel } from './widgets/chartShared';

type WidgetWrapperProps = {
  widget: WidgetDef;
  isEditMode: boolean;
  onRemove: () => void;
  onOpenConfig: () => void;
  children: React.ReactNode;
};

export function WidgetWrapper({ widget, isEditMode, onRemove, onOpenConfig, children }: WidgetWrapperProps) {
  const title =
    widget.type === 'chart' && widget.config?.metric
      ? getChartMetricLabel(String(widget.config.metric))
      : (widget.title ?? widget.type);

  return (
    <div className="h-full flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50/80 shrink-0">
        <span className="text-sm font-medium text-gray-800 truncate">{title}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenConfig}
            className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
            title="Settings"
          >
            <span aria-hidden>⚙️</span>
          </button>
          {isEditMode && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded hover:bg-red-100 text-gray-500 hover:text-red-600"
              title="Remove"
            >
              <span aria-hidden>🗑️</span>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {children}
      </div>
    </div>
  );
}
