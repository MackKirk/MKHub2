import { Link } from 'react-router-dom';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppModal,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import type { ProjectLinkRow, RelatedMembershipRow } from './customerOverviewTypes';

export function CustomerOverviewProjectListModal({
  open,
  onClose,
  title,
  subtitle = 'Click an item to open the project page',
  items,
  emptyMessage = 'No items',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: ProjectLinkRow[];
  emptyMessage?: string;
}) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      description={subtitle}
      size="md"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton variant="secondary" onClick={onClose}>
            Close
          </AppButton>
        </div>
      }
    >
      {items.length === 0 ? (
        <AppEmptyState title={emptyMessage} />
      ) : (
        <ul className={uiCx(uiBorders.subtle, uiRadius.control, 'divide-y divide-gray-100 overflow-hidden')}>
          {items.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${encodeURIComponent(p.id)}`}
                className={uiCx('block px-3 py-2.5 text-sm font-medium text-brand-red hover:bg-red-50')}
                onClick={onClose}
              >
                {p.name || p.code || p.id}
                {p.code && p.name ? <span className="ml-1 font-normal text-gray-500">({p.code})</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppModal>
  );
}

export function CustomerOverviewRelatedModal({
  open,
  onClose,
  memberships,
}: {
  open: boolean;
  onClose: () => void;
  memberships: RelatedMembershipRow[];
}) {
  const projAll = memberships.filter((m) => !m.is_bidding);
  const oppAll = memberships.filter((m) => m.is_bidding);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Related customer"
      description="Projects and opportunities where this customer is related (not owner)"
      size="md"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton variant="secondary" onClick={onClose}>
            Close
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppCard title="Projects" bodyClassName="p-0">
          {projAll.length === 0 ? (
            <p className={uiCx(uiTypography.helper, uiSpacing.cardPadding)}>None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {projAll.map((m) => (
                <li key={m.id} className={uiCx('flex items-center gap-2 px-3 py-2 hover:bg-gray-50')}>
                  <Link
                    to={`/projects/${encodeURIComponent(m.id)}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-brand-red"
                    onClick={onClose}
                  >
                    {m.name || m.code || m.id}
                  </Link>
                  <AppBadge variant={m.is_awarded_related ? 'success' : 'neutral'}>
                    {m.is_awarded_related ? 'Awarded' : 'Not awarded'}
                  </AppBadge>
                </li>
              ))}
            </ul>
          )}
        </AppCard>
        <AppCard title="Opportunities" bodyClassName="p-0">
          {oppAll.length === 0 ? (
            <p className={uiCx(uiTypography.helper, uiSpacing.cardPadding)}>None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {oppAll.map((m) => (
                <li key={m.id} className={uiCx('flex items-center gap-2 px-3 py-2 hover:bg-gray-50')}>
                  <Link
                    to={`/projects/${encodeURIComponent(m.id)}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-brand-red"
                    onClick={onClose}
                  >
                    {m.name || m.code || m.id}
                  </Link>
                  <AppBadge variant={m.is_awarded_related ? 'success' : 'neutral'}>
                    {m.is_awarded_related ? 'Awarded' : 'Not awarded'}
                  </AppBadge>
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      </div>
    </AppModal>
  );
}
