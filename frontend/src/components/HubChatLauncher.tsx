import { useEffect, useRef } from 'react';

type MKHubChatWindow = Window & {
  __initMKHubChat?: (host: HTMLElement | null) => void;
};

/**
 * Mounts the vanilla hub chat widget into #hub-chat-fab-host and syncs sidebar collapsed state for the launcher label.
 */
export default function HubChatLauncher({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const triedInit = useRef(false);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mkhub-sidebar-collapsed', { detail: { collapsed: sidebarCollapsed } }));
  }, [sidebarCollapsed]);

  useEffect(() => {
    const host = document.getElementById('hub-chat-fab-host');
    if (!host || triedInit.current) return;

    const tryInit = () => {
      const w = window as MKHubChatWindow;
      if (typeof w.__initMKHubChat !== 'function') return false;
      triedInit.current = true;
      w.__initMKHubChat(host);
      window.dispatchEvent(new CustomEvent('mkhub-sidebar-collapsed', { detail: { collapsed: sidebarCollapsed } }));
      return true;
    };

    if (tryInit()) return;

    let attempts = 0;
    const maxAttempts = 80;
    const id = window.setInterval(() => {
      attempts += 1;
      if (tryInit() || attempts >= maxAttempts) {
        clearInterval(id);
      }
    }, 50);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; sidebar updates use separate effect
  }, []);

  return null;
}
