import EmployeeCommunity from '@/components/EmployeeCommunity';
import { OverviewAnnouncementsInbox } from '@/components/OverviewAnnouncementsInbox';
import {
  AppCard,
  AppPageHeader,
  uiCx,
  uiLayout,
} from '@/components/ui';
import { useState } from 'react';
import { Megaphone } from 'lucide-react';

/** Company news feed + inbox-style jump list (email-like dual pane). */
export default function Announcements() {
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [activeInboxPostId, setActiveInboxPostId] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4 bg-gray-50">
      <div className="shrink-0">
        <AppPageHeader
          title="Announcements"
          subtitle="Company news and required communications"
          icon={<Megaphone className="h-4 w-4" />}
        />
      </div>

      <div className={uiCx(uiLayout.pageOverview, 'min-h-0 flex-1')}>
        <AppCard
          className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <EmployeeCommunity
            feedMode
            focusPostId={focusRequest?.id ?? null}
            focusNonce={focusRequest?.nonce}
            onFocusPostHandled={() => setFocusRequest(null)}
          />
        </AppCard>

        <aside className={uiLayout.pageOverviewInbox}>
          <AppCard
            title="Inbox"
            subtitle="Jump to a post"
            className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <OverviewAnnouncementsInbox
              activePostId={activeInboxPostId}
              onSelectPost={(postId) => {
                setActiveInboxPostId(postId);
                setFocusRequest({ id: postId, nonce: Date.now() });
              }}
            />
          </AppCard>
        </aside>
      </div>
    </div>
  );
}
