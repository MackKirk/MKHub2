import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getShortcutIcon, WidgetIcon } from '../widgetVisualMeta';
import { uiCx, uiRadius, uiTypography } from '@/components/ui';
import { getServicePathsForLine, resolveWidgetBusinessLine } from '../homeBusinessLine';
import type { MeForHomeWidgets } from '../widgetVisibility';

const STATIC_PRESETS: Record<string, { label: string; path: string; description: string }> = {
  tasks: { label: 'Tasks', path: '/tasks', description: 'View your tasks' },
  schedule: { label: 'Schedule', path: '/schedule', description: 'Open your schedule' },
  customers: { label: 'Customers', path: '/customers', description: 'Browse customers' },
  clock: { label: 'Clock in/out', path: '/clock-in-out', description: 'Track attendance' },
};

const SERVICE_PRESET_META: Record<string, { label: string; description: string; pathKey: 'projects' | 'opportunities' | 'business' }> = {
  projects: { label: 'Projects', description: 'View your projects', pathKey: 'projects' },
  opportunities: { label: 'Opportunities', description: 'View opportunities', pathKey: 'opportunities' },
  business: { label: 'Dashboard', description: 'Business overview', pathKey: 'business' },
};

type ShortcutsWidgetProps = {
  config?: { items?: string[]; business_line?: string };
};

const linkBaseClass = uiCx(
  'group/shortcut flex min-h-0 min-w-0 w-full flex-col items-center justify-center overflow-hidden transition-colors duration-150',
  uiRadius.control,
  'hover:bg-gray-50 active:bg-gray-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300',
);

export function ShortcutsWidget({ config }: ShortcutsWidgetProps) {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeForHomeWidgets>('GET', '/auth/me'),
  });
  const businessLine = resolveWidgetBusinessLine(config, me);
  const servicePaths = getServicePathsForLine(businessLine);
  const items = config?.items ?? ['tasks', 'projects', 'schedule'];

  const links = items
    .map((id) => {
      if (typeof id !== 'string') return null;
      if (STATIC_PRESETS[id]) return { id, ...STATIC_PRESETS[id] };
      const svc = SERVICE_PRESET_META[id];
      if (svc) {
        return {
          id,
          label: svc.label,
          path: servicePaths[svc.pathKey],
          description: svc.description,
        };
      }
      return null;
    })
    .filter(Boolean) as { id: string; label: string; path: string; description: string }[];

  const cols = links.length === 1 ? 1 : 2;
  const singleLarge = links.length === 1;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div
        className="grid min-h-0 w-full flex-1 auto-rows-fr content-stretch overflow-auto"
        style={{
          gap: 'clamp(0.25rem, 1.5cqh, 0.5rem)',
          padding: 'clamp(0.25rem, 1.5cqh, 0.5rem)',
          gridTemplateColumns: cols === 1 ? '1fr' : 'repeat(2, 1fr)',
        }}
      >
        {links.map(({ id, label, path, description }) => {
          const Icon = getShortcutIcon(id);
          return (
            <Link
              key={`${id}-${path}`}
              to={path}
              className={linkBaseClass}
              style={{
                padding: 'clamp(0.375rem, 2.5cqh, 0.75rem)',
                gap: 'clamp(0.25rem, 2cqh, 0.5rem)',
              }}
            >
              <WidgetIcon icon={Icon} size={singleLarge ? 'lg' : 'md'} className="text-gray-800" />
              <span
                className="w-full min-w-0 truncate text-center font-medium text-gray-800"
                style={{ fontSize: 'clamp(0.6875rem, 8cqh, 0.9375rem)' }}
              >
                {label}
              </span>
              {singleLarge && (
                <span
                  className={uiCx(uiTypography.helper, 'w-full truncate text-center')}
                  style={{ fontSize: 'clamp(0.5rem, 5cqh, 0.75rem)' }}
                >
                  {description}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
