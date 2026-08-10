import { useEffect, useState } from 'react';
import {
  dismissNativeAppBanner,
  getNativeAppStoreLabel,
  getNativeAppStoreUrl,
  isNativeAppBannerDismissed,
  shouldSuggestNativeApp,
} from '@/lib/nativeAppStore';

/**
 * Fixed footer bar on mobile web: open the real App Store / Play Store listing.
 * Dismissible (X) — preference stored in localStorage.
 */
export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [storeUrl, setStoreUrl] = useState(getNativeAppStoreUrl());
  const [ctaLabel, setCtaLabel] = useState('Download');

  useEffect(() => {
    if (!shouldSuggestNativeApp()) return;
    if (isNativeAppBannerDismissed()) return;
    setStoreUrl(getNativeAppStoreUrl());
    const label = getNativeAppStoreLabel();
    setCtaLabel(
      label.includes('App Store') ? 'App Store' : label.includes('Play') ? 'Google Play' : 'Download',
    );
    setVisible(true);
  }, []);

  const handleDismiss = () => {
    dismissNativeAppBanner();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] backdrop-blur-sm"
      role="region"
      aria-label="Download MK Hub app"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-red to-[#ee2b2b] text-sm font-bold text-white">
          MK
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">Get the MK Hub app</p>
          <p className="truncate text-xs text-gray-600">Faster and easier on your phone</p>
        </div>
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 sm:text-sm"
        >
          {ctaLabel}
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Dismiss"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
