import { Loader2 } from 'lucide-react';
import { uiCx } from '@/components/ui';

type Props = {
  visible: boolean;
};

export function ProjectMapFetchingOverlay({ visible }: Props) {
  if (!visible) return null;

  return (
    <div
      className={uiCx(
        'pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/40',
      )}
      aria-hidden="true"
    >
      <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
    </div>
  );
}
