import { useEffect, useState } from 'react';

type FadeInOnMountProps = {
  children: React.ReactNode;
  /** When false, stay at opacity 0 until enabled. Use to sync with page loading. Default true. */
  enabled?: boolean;
  /** Delay before starting the fade-in (ms). Default 50. */
  delay?: number;
  /** Stagger offset for lists (ms). Default 0. */
  staggerIndex?: number;
  /** Duration of the transition (ms). Default 400. */
  duration?: number;
  className?: string;
};

export function FadeInOnMount({
  children,
  enabled = true,
  delay = 50,
  staggerIndex = 0,
  duration = 400,
  className = '',
}: FadeInOnMountProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setVisible(true), delay + staggerIndex);
    return () => clearTimeout(timer);
  }, [enabled, delay, staggerIndex]);

  const show = enabled && visible;
  return (
    <div
      className={className}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
        transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
}

export default FadeInOnMount;
