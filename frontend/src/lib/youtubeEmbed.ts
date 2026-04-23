/** Extract YouTube video id from common URL shapes. */
export function parseYoutubeVideoId(input: string): string | null {
  const s = (input || '').trim();
  if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = /^https?:\/\//i.test(s) ? new URL(s) : new URL(s, 'https://www.youtube.com/');
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(embed|live|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (m?.[2]) return m[2];
    }
    if (host === 'youtube-nocookie.com') {
      const m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (m?.[1]) return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function youtubeEmbedSrc(videoId: string, nocookie = true): string {
  const base = nocookie ? 'https://www.youtube-nocookie.com/embed/' : 'https://www.youtube.com/embed/';
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return `${base}${encodeURIComponent(videoId)}`;
  return `${base}${videoId}`;
}

/** If input is a YouTube link or id, return embed URL; otherwise return null. */
export function toYoutubeEmbedUrl(input: string): string | null {
  const id = parseYoutubeVideoId(input);
  if (!id) return null;
  return youtubeEmbedSrc(id, true);
}

export function isYoutubeEmbedIframeSrc(src: string): boolean {
  try {
    const u = new URL(src, 'https://www.youtube-nocookie.com');
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (h !== 'youtube.com' && h !== 'youtube-nocookie.com' && h !== 'm.youtube.com') return false;
    return /^\/embed\//.test(u.pathname);
  } catch {
    return false;
  }
}
