import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { uiCx } from '@/components/ui';

type ShiftLocationMapEmbedProps = {
  lat?: number | null;
  lng?: number | null;
  label?: string;
  height?: number;
  className?: string;
};

/**
 * Compact Google Maps pin for shift detail — no card chrome.
 */
export function ShiftLocationMapEmbed({
  lat,
  lng,
  label,
  height = 200,
  className,
}: ShiftLocationMapEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lat == null || lng == null || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;
        const center = { lat, lng };
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(containerRef.current, {
            center,
            zoom: 14,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            zoomControl: true,
          });
        } else {
          mapRef.current.setCenter(center);
        }
        if (markerRef.current) markerRef.current.setMap(null);
        markerRef.current = new google.maps.Marker({
          position: center,
          map: mapRef.current,
          title: label,
        });
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load map');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng, label]);

  if (lat == null || lng == null) return null;

  if (error) {
    return <p className={uiCx('text-sm text-red-600', className)}>{error}</p>;
  }

  return (
    <div
      className={uiCx('overflow-hidden rounded-lg border border-gray-200', className)}
      style={{ height, width: '100%' }}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
