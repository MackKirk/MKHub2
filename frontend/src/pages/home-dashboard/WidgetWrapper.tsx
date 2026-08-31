import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { WidgetDef } from './types';
import { getWidgetIcon } from './widgetVisualMeta';
import { getChartWidgetTitle } from './widgets/chartShared';
import { getAccessibleHomeBusinessLines, resolveWidgetBusinessLine } from './homeBusinessLine';
import type { MeForHomeWidgets } from './widgetVisibility';
import { AppButton, uiBorders, uiColors, uiCx, uiRadius, uiShadows } from '@/components/ui';
import { Settings, Trash2 } from 'lucide-react';

type WidgetWrapperProps = {
  widget: WidgetDef;
  isEditMode: boolean;
  onRemove: () => void;
  onOpenConfig: () => void;
  children: React.ReactNode;
};

export function WidgetWrapper({ widget, isEditMode, onRemove, onOpenConfig, children }: WidgetWrapperProps) {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeForHomeWidgets>('GET', '/auth/me'),
  });
  const showLineBadge = getAccessibleHomeBusinessLines(me).length > 1;
  const isShortcut = widget.type === 'shortcuts';

  const cardClass = uiCx(
    'group/widget relative h-full overflow-hidden transition-[border-color,box-shadow] duration-200 [container-type:size] [container-name:widget]',
    uiRadius.card,
    uiBorders.subtle,
    uiColors.surface,
    uiShadows.card,
  );
  const cardHoverClass = !isEditMode ? 'hover:border-gray-300' : 'ring-1 ring-gray-200/80';

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
            className="absolute right-2 top-2 z-10 h-auto min-h-0 p-0 text-gray-400 hover:bg-transparent hover:text-red-600"
            title="Remove"
            aria-label="Remove widget"
          >
            <Trash2 className="h-4 w-4" />
          </AppButton>
        )}
      </div>
    );
  }

  const businessLine = resolveWidgetBusinessLine(widget.config, me);
  const title =
    widget.type === 'chart' && widget.config?.metric
      ? getChartWidgetTitle(String(widget.config.metric), businessLine, showLineBadge)
      : (widget.title ?? widget.type);
  const icon = getWidgetIcon(widget);

  const isCalendar = widget.type === 'calendar';

  return (
    <div className={uiCx(cardClass, 'flex flex-col', cardHoverClass)}>
      <div
        className={uiCx(
          'flex shrink-0 min-h-0 items-center justify-between border-b border-gray-100',
          uiColors.surfaceSubtle,
          'px-[clamp(0.5rem,3cqw,0.75rem)] py-[clamp(0.25rem,1.75cqh,0.4rem)]',
        )}
      >
        <span
          className={uiCx(
            'flex min-w-0 items-center gap-1.5 truncate font-medium text-gray-800',
            'text-[clamp(0.625rem,5.5cqw,0.8125rem)]',
          )}
          title={typeof title === 'string' ? title : undefined}
        >
          <span className="shrink-0" aria-hidden>
            {icon}
          </span>
          <span className="min-w-0 truncate">{title}</span>
        </span>
        <div
          className={uiCx(
            'flex shrink-0 items-center gap-0.5 transition-opacity duration-150',
            isEditMode ? 'opacity-100' : 'opacity-0 group-hover/widget:opacity-100 focus-within:opacity-100',
          )}
        >
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenConfig}
            className="h-auto min-h-0 p-[clamp(0.125rem,1.5cqh,0.375rem)] text-gray-400 hover:text-gray-700"
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
      <div
        className={uiCx(
          'min-h-0 flex-1',
          isCalendar
            ? 'overflow-hidden p-1'
            : 'overflow-auto p-[clamp(0.25rem,2cqh,0.75rem)]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
