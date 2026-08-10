import { useMemo } from 'react';
import {
  getNativeAppStoreLabel,
  getNativeAppStoreUrl,
  shouldSuggestNativeApp,
} from '@/lib/nativeAppStore';

/** Compact store CTA for the login page (mobile web only). */
export default function LoginAppDownloadHint() {
  const show = useMemo(() => shouldSuggestNativeApp(), []);
  const storeUrl = useMemo(() => getNativeAppStoreUrl(), []);
  const storeLabel = useMemo(() => getNativeAppStoreLabel(), []);

  if (!show) return null;

  const shortLabel = storeLabel.includes('App Store')
    ? 'Download on the App Store'
    : storeLabel.includes('Play')
      ? 'Get it on Google Play'
      : 'Download the MK Hub app';

  return (
    <div className="mt-5 rounded-xl border border-brand-red/20 bg-brand-red/[0.04] p-3 text-center">
      <p className="text-sm font-semibold text-gray-900">Using a phone?</p>
      <p className="mt-1 text-xs text-gray-600">
        For the best experience, use the MK Hub mobile app.
      </p>
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        {shortLabel}
      </a>
    </div>
  );
}
