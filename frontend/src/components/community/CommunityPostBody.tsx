import { useCallback, useState, type MouseEvent } from 'react';
import { communityContentLooksLikeHtml, sanitizeCommunityPostHtml } from '@/lib/communityPostHtml';
import { injectFileAccessTokensInHtml } from '@/lib/trainingRichText';
import OverlayPortal from '@/components/OverlayPortal';
import CommunityDirectoryUserPeekModal from '@/components/community/CommunityDirectoryUserPeekModal';
import './communityPostBody.css';

type Props = {
  html: string;
  className?: string;
  stripMedia?: boolean;
};

type EntityPeek = { title: string; subtitle: string };

function stripMediaFromHtml(html: string): string {
  if (!html) return '';

  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<img\b[^>]*>/gi, '')
      .replace(/<(video|iframe|embed|object|figure)\b[\s\S]*?<\/\1>/gi, '');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('img, video, iframe, embed, object, picture, source, figure').forEach((el) => el.remove());
  doc.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    if (/\.(png|jpe?g|gif|webp|svg|mp4|mov|webm)(\?|#|$)/i.test(href) && !anchor.textContent?.trim()) {
      anchor.remove();
    }
  });
  return doc.body.innerHTML;
}

/** Renders stored community post HTML (sanitized) or legacy plain text. User @mentions open a directory card. */
export function CommunityPostBody({ html, className = '', stripMedia = false }: Props) {
  const [peekUserId, setPeekUserId] = useState<string | null>(null);
  const [peekEntity, setPeekEntity] = useState<EntityPeek | null>(null);

  const onBodyClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest('span[data-type="mention"]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const entityType = el.getAttribute('data-entity-type');
    const entityId = el.getAttribute('data-entity-id') || el.getAttribute('data-id');
    const label =
      el.getAttribute('data-label') ||
      (el.textContent || '')
        .replace(/^[@\s]+/, '')
        .trim() ||
      'Mention';

    if (entityType === 'user' && entityId) {
      setPeekEntity(null);
      setPeekUserId(entityId);
      return;
    }
    if (entityType === 'division' || entityType === 'community_group') {
      setPeekUserId(null);
      setPeekEntity({
        title: entityType === 'division' ? 'Division' : 'Community group',
        subtitle: label,
      });
    }
  }, []);

  const raw = html ?? '';
  if (communityContentLooksLikeHtml(raw)) {
    const sanitized = sanitizeCommunityPostHtml(raw);
    const previewHtml = stripMedia ? stripMediaFromHtml(sanitized) : sanitized;

    return (
      <>
        <div
          className={`community-post-body ${className}`}
          role="presentation"
          onClick={onBodyClick}
          dangerouslySetInnerHTML={{
            __html: injectFileAccessTokensInHtml(previewHtml),
          }}
        />
        <CommunityDirectoryUserPeekModal userId={peekUserId} onClose={() => setPeekUserId(null)} />
        {peekEntity && (
          <OverlayPortal>
            <div
              className="fixed inset-0 z-[200010] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
              onClick={() => setPeekEntity(null)}
            >
              <div
                className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
                onClick={(ev) => ev.stopPropagation()}
                role="dialog"
                aria-modal="true"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{peekEntity.title}</div>
                <p className="mt-2 text-lg font-semibold text-slate-900">{peekEntity.subtitle}</p>
                <button
                  type="button"
                  className="mt-6 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setPeekEntity(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </OverlayPortal>
        )}
      </>
    );
  }
  return <span className={`whitespace-pre-wrap ${className}`}>{raw}</span>;
}
