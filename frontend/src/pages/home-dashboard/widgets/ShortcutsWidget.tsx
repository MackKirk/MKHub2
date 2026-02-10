import { Link } from 'react-router-dom';

const PRESETS: Record<string, { label: string; path: string; icon: string }> = {
  tasks: { label: 'Tasks', path: '/tasks', icon: '✅' },
  projects: { label: 'Projects', path: '/projects', icon: '🏗️' },
  schedule: { label: 'Schedule', path: '/schedule', icon: '📅' },
  opportunities: { label: 'Opportunities', path: '/opportunities', icon: '📋' },
  customers: { label: 'Customers', path: '/customers', icon: '👥' },
  clock: { label: 'Clock in/out', path: '/clock-in-out', icon: '⏰' },
  business: { label: 'Dashboard', path: '/business', icon: '📊' },
};

type ShortcutsWidgetProps = {
  config?: { items?: string[] };
};

const linkBaseClass =
  'flex items-center justify-center min-h-0 overflow-hidden flex-col w-full min-w-0 rounded-lg transition-colors duration-200 hover:bg-gray-100/80 active:bg-gray-200/80';

export function ShortcutsWidget({ config }: ShortcutsWidgetProps) {
  const items = config?.items ?? ['tasks', 'projects', 'schedule'];
  const links = items
    .map((id) => (typeof id === 'string' ? PRESETS[id] : null))
    .filter(Boolean) as { label: string; path: string; icon: string }[];

  const cols = links.length === 1 ? 1 : 2;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden w-full">
      <div
        className="flex-1 min-h-0 grid auto-rows-fr content-stretch overflow-auto w-full"
        style={{
          gap: 'clamp(0.25rem, 1.5cqh, 0.5rem)',
          padding: 'clamp(0.25rem, 1.5cqh, 0.5rem)',
          gridTemplateColumns: cols === 1 ? '1fr' : 'repeat(2, 1fr)',
        }}
      >
        {links.map(({ label, path, icon }) => (
          <Link
            key={path}
            to={path}
            className={linkBaseClass}
            style={{
              padding: 'clamp(0.25rem, 2.5cqh, 0.5rem)',
              gap: 'clamp(0.25rem, 2cqh, 0.375rem)',
            }}
          >
            <span
              className="flex shrink-0 items-center justify-center text-gray-800"
              style={{
                width: 'clamp(2.25rem, 22cqh, 5rem)',
                height: 'clamp(2.25rem, 22cqh, 5rem)',
                fontSize: 'clamp(1.25rem, 18cqh, 3.25rem)',
              }}
            >
              {icon}
            </span>
            <span
              className="font-medium text-gray-800 truncate text-center w-full min-w-0"
              style={{ fontSize: 'clamp(0.75rem, 9cqh, 1.375rem)' }}
            >
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
