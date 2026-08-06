import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

let loaderPromise: Promise<typeof google> | null = null;
let optionsConfigured = false;

export function getGoogleMapsApiKey(): string | undefined {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : undefined;
}

export function loadGoogleMaps(): Promise<typeof google> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(new Error('Google Maps API key is not configured'));
  }
  if (!loaderPromise) {
    if (!optionsConfigured) {
      setOptions({ key: apiKey, v: 'weekly' });
      optionsConfigured = true;
    }
    loaderPromise = Promise.all([
      importLibrary('maps'),
      importLibrary('marker'),
    ]).then(() => google);
  }
  return loaderPromise;
}

export function resetGoogleMapsLoaderForTests(): void {
  loaderPromise = null;
  optionsConfigured = false;
}
