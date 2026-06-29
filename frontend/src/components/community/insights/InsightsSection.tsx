import type { ReactNode } from 'react';
import { AppCard, AppEmptyState, uiCx } from '@/components/ui';

/** Card shell shared by every detail section on the Insights page. */
export function InsightsSection({
  title,
  subtitle,
  actions,
  children,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <AppCard
      className="min-w-0 max-w-full"
      title={title}
      subtitle={subtitle}
      actions={actions}
      bodyClassName={uiCx(bodyClassName)}
    >
      {children}
    </AppCard>
  );
}

export function InsightsEmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return <AppEmptyState title={title} description={hint} icon={icon} className="border-0 bg-transparent" />;
}
