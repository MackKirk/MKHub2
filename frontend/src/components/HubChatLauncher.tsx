import { useEffect, useRef } from 'react';

type MKHubChatWindow = Window & {
  __initMKHubChat?: (host: HTMLElement | null) => void;
};

/**
 * Initializes the vanilla hub chat widget (floating FAB on document.body).
 */
export default function HubChatLauncher() {
  const triedInit = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tryInit = () => {
      if (cancelled || triedInit.current) return !!document.getElementById('mkhub-chat-fab');
      const w = window as MKHubChatWindow;
      if (typeof w.__initMKHubChat !== 'function') return false;

      const host = document.getElementById('hub-chat-fab-host');
      triedInit.current = true;
      w.__initMKHubChat(host);
      return !!document.getElementById('mkhub-chat-fab');
    };

    if (tryInit()) return;

    let attempts = 0;
    const maxAttempts = 120;
    const id = window.setInterval(() => {
      attempts += 1;
      if (tryInit() || attempts >= maxAttempts || cancelled) {
        clearInterval(id);
      }
    }, 50);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return null;
}
