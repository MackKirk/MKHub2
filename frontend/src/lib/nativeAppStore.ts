/** Native MK Hub app store links (Play Store / App Store). */

export const ANDROID_APP_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.mkhub.m54&hl=en_CA';

export const IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/mk-hub/id6787167367';

/** localStorage key — footer / login banner dismissed on this device. */
export const NATIVE_APP_BANNER_DISMISSED_KEY = 'mkhub-native-app-banner-dismissed';

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isMobileWebUserAgent(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

export function isIOSUserAgent(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /iPhone|iPad|iPod/i.test(ua);
}

export function isAndroidUserAgent(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /Android/i.test(ua);
}

/** Prefer platform store; fall back to Android listing on desktop/other. */
export function getNativeAppStoreUrl(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  if (isIOSUserAgent(ua)) return IOS_APP_STORE_URL;
  return ANDROID_APP_STORE_URL;
}

export function getNativeAppStoreLabel(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  if (isIOSUserAgent(ua)) return 'Download on the App Store';
  if (isAndroidUserAgent(ua)) return 'Get it on Google Play';
  return 'Download the MK Hub app';
}

export function isNativeAppBannerDismissed(): boolean {
  try {
    return localStorage.getItem(NATIVE_APP_BANNER_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissNativeAppBanner(): void {
  try {
    localStorage.setItem(NATIVE_APP_BANNER_DISMISSED_KEY, 'true');
  } catch {
    /* ignore */
  }
}

/** Show store prompts only in mobile browsers (not already running as installed PWA/standalone). */
export function shouldSuggestNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandaloneDisplay()) return false;
  if (!isMobileWebUserAgent()) return false;
  return true;
}
