import { Link } from 'react-router-dom';

const PRESETS: Record<string, { label: string; path: string }> = {
  tasks: { label: 'Tasks', path: '/tasks' },
  projects: { label: 'Projects', path: '/projects' },
  schedule: { label: 'Schedule', path: '/schedule' },
  quotes: { label: 'Quotes', path: '/quotes' },
  opportunities: { label: 'Opportunities', path: '/opportunities' },
  customers: { label: 'Customers', path: '/customers' },
  clock: { label: 'Clock in/out', path: '/clock-in-out' },
  business: { label: 'Dashboard', path: '/business' },
};

type ShortcutsWidgetProps = {
  config?: { items?: string[] };
};

export function ShortcutsWidget({ config }: ShortcutsWidgetProps) {
  const items = config?.items ?? ['tasks', 'projects', 'schedule', 'quotes'];
  const links = items
    .map((id) => (typeof id === 'string' ? PRESETS[id] : null))
    .filter(Boolean) as { label: string; path: string }[];

  return (
    <ul className="space-y-1">
      {links.map(({ label, path }) => (
        <li key={path}>
          <Link
            to={path}
            className="block text-sm text-[#7f1010] hover:underline py-0.5"
          >
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
