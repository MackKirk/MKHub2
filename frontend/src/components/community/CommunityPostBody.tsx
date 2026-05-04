import { communityContentLooksLikeHtml, sanitizeCommunityPostHtml } from '@/lib/communityPostHtml';
import { injectFileAccessTokensInHtml } from '@/lib/trainingRichText';
import './communityPostBody.css';

type Props = {
  html: string;
  className?: string;
};

/** Renders stored community post HTML (sanitized) or legacy plain text. */
export function CommunityPostBody({ html, className = '' }: Props) {
  const raw = html ?? '';
  if (communityContentLooksLikeHtml(raw)) {
    return (
      <div
        className={`community-post-body ${className}`}
        dangerouslySetInnerHTML={{
          __html: injectFileAccessTokensInHtml(sanitizeCommunityPostHtml(raw)),
        }}
      />
    );
  }
  return <span className={`whitespace-pre-wrap ${className}`}>{raw}</span>;
}
