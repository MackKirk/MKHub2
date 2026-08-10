import { useEffect, useState } from 'react';
import {
  ANDROID_APP_STORE_URL,
  IOS_APP_STORE_URL,
  getNativeAppStoreUrl,
  isAndroidUserAgent,
  isIOSUserAgent,
  isMobileWebUserAgent,
} from '@/lib/nativeAppStore';

/**
 * /install — sends mobile browsers to the real store listing;
 * on desktop shows both App Store and Google Play links.
 */
export default function Install() {
  const [mode, setMode] = useState<'redirecting' | 'links'>('redirecting');

  useEffect(() => {
    if (!isMobileWebUserAgent()) {
      setMode('links');
      return;
    }
    const url = getNativeAppStoreUrl();
    window.location.replace(url);
  }, []);

  if (mode === 'redirecting' && isMobileWebUserAgent()) {
    const label = isIOSUserAgent()
      ? 'Opening the App Store…'
      : isAndroidUserAgent()
        ? 'Opening Google Play…'
        : 'Opening the app store…';
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-red to-[#ee2b2b] text-lg font-bold text-white">
            MK
          </div>
          <h1 className="text-xl font-bold text-gray-900">{label}</h1>
          <p className="mt-2 text-sm text-gray-600">
            If nothing opens,{' '}
            <a className="font-semibold text-brand-red underline" href={getNativeAppStoreUrl()}>
              tap here
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-red to-[#ee2b2b] text-lg font-bold text-white">
          MK
        </div>
        <h1 className="text-center text-2xl font-bold text-gray-900">Download MK Hub</h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Get the official app from the App Store or Google Play.
        </p>
        <div className="mt-6 space-y-3">
          <a
            href={IOS_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-900"
          >
            Download on the App Store
          </a>
          <a
            href={ANDROID_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Get it on Google Play
          </a>
        </div>
      </div>
    </div>
  );
}
