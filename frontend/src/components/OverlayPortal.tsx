import { createPortal } from 'react-dom';
import { getOverlayRoot } from '@/lib/overlayRoot';

type Props = { children: React.ReactNode };

/** Renders into `#overlay-root` on `document.body` so full-screen overlays sit above app chrome. */
export default function OverlayPortal({ children }: Props) {
  return createPortal(children, getOverlayRoot());
}
