import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { AppCard, AppSectionHeader, appSectionPresetProps, uiCx } from '@/components/ui';

type Props = {
  lat?: number | null;
  lng?: number | null;
  label?: string;
  className?: string;
  height?: number;
};

export default function PropertyLocationMap({ lat, lng, label, className, height = 320 }: Props) {
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
            fullscreenControl: true,
          });
        } else {
          mapRef.current.setCenter(center);
        }
        if (markerRef.current) markerRef.current.setMap(null);
        markerRef.current = new google.maps.Marker({ position: center, map: mapRef.current, title: label });
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load map');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng, label]);

  if (lat == null || lng == null) {
    return (
      <AppCard className={className}>
        <AppSectionHeader
          title="Location"
          description="Add an address when editing the property to show it on the map."
          {...appSectionPresetProps('address')}
        />
      </AppCard>
    );
  }

  if (error) {
    return (
      <AppCard className={className}>
        <AppSectionHeader title="Location" description={label} {...appSectionPresetProps('address')} />
        <p className="mt-3 text-sm text-red-600">{error}</p>
      </AppCard>
    );
  }

  return (
    <AppCard className={uiCx('overflow-hidden', className)} bodyClassName="!p-0">
      <div className="border-b border-gray-100 px-4 py-3">
        <AppSectionHeader title="Location" description={label} {...appSectionPresetProps('address')} />
      </div>
      <div ref={containerRef} style={{ height, width: '100%' }} />
    </AppCard>
  );
}
