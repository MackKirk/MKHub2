import { uiCx, uiRadius } from '@/components/ui';
import { PROJECT_MAP_MIN_HEIGHT_PX } from '../../lib/projectMapConfig';

export function ProjectMapLoading() {
  return (
    <div
      className={uiCx('w-full animate-pulse bg-gray-100', uiRadius.card)}
      style={{ minHeight: PROJECT_MAP_MIN_HEIGHT_PX, height: 'min(70vh, calc(100vh - 320px))' }}
      aria-hidden="true"
    />
  );
}
