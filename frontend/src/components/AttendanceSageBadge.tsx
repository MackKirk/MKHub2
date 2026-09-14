import { AppBadge } from '@/components/ui';
import { sageBadgeMeta } from '@/lib/sageAttendance';

type Props = {
  state?: string | null;
  recordKind?: string | null;
  error?: string | null;
  empty?: 'none' | 'dash';
};

export function AttendanceSageBadge({ state, recordKind, error, empty = 'none' }: Props) {
  const meta = sageBadgeMeta(state, recordKind);
  if (!meta) {
    if (empty === 'dash') return <span className="text-gray-400">—</span>;
    return null;
  }
  const badge = <AppBadge variant={meta.variant}>{meta.label}</AppBadge>;
  if (meta.key === 'error' && error) {
    return <span title={error}>{badge}</span>;
  }
  return badge;
}
