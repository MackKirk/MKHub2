/**
 * Microsoft Office Online can only fetch document URLs that are publicly reachable on the internet.
 * Local/dev preview URLs (localhost, private LAN, plain HTTP) fail with "File not found".
 */
export function canEmbedWithOfficeOnline(fileUrl: string): boolean {
  try {
    const u = new URL(fileUrl);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) {
      return false;
    }
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function officeOnlineEmbedSrc(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}
