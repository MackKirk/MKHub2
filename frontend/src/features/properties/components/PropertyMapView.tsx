import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { AppEmptyState, uiCx, uiRadius } from '@/components/ui';

type MapPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  city?: string;
  province?: string;
  address_line1?: string;
};

type Props = {
  search?: string;
  visibility?: string;
};

export default function PropertyMapView({ search, visibility }: Props) {
  const nav = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const qs = new URLSearchParams();
  if (search?.trim()) qs.set('search', search.trim());
  if (visibility) qs.set('visibility', visibility);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['properties-map-points', search, visibility],
    queryFn: () => api<{ items: MapPoint[] }>('GET', `/properties/map-points?${qs.toString()}`),
  });

  const points = data?.items || [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(containerRef.current, {
            center: { lat: 49.25, lng: -123.12 },
            zoom: 8,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });
        }
        setMapReady(true);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError('Could not load Google Maps');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (!points.length) return;

    const bounds = new google.maps.LatLngBounds();
    for (const p of points) {
      const pos = { lat: p.lat, lng: p.lng };
      bounds.extend(pos);
      const marker = new google.maps.Marker({
        position: pos,
        map: mapRef.current!,
        title: p.name,
      });
      marker.addListener('click', () => nav(`/properties/${p.id}`));
      markersRef.current.push(marker);
    }
    if (points.length === 1) {
      mapRef.current.setCenter({ lat: points[0].lat, lng: points[0].lng });
      mapRef.current.setZoom(14);
    } else {
      mapRef.current.fitBounds(bounds, 48);
    }
  }, [mapReady, points, nav]);

  if (loadError) {
    return <AppEmptyState title="Map unavailable" description={loadError} />;
  }

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-gray-600">
          Loading map…
        </div>
      )}
      {isError && !isLoading && (
        <AppEmptyState title="Could not load properties on map" className="mb-4" />
      )}
      {!isLoading && !points.length && (
        <AppEmptyState
          title="No mapped properties"
          description="Edit a property and set latitude/longitude to appear on the map."
          className="mb-4"
        />
      )}
      <div
        ref={containerRef}
        className={uiCx('w-full min-h-[480px]', uiRadius.card, 'border border-gray-200 overflow-hidden')}
      />
    </div>
  );
}
