import { PROJECT_MAP_FIT_MAX_ZOOM } from '../../lib/projectMapConfig';
import type { ProjectMapPoint } from './projectMap.types';

export function isValidMapCoordinate(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;
  if (Math.abs(la) < 1e-9 && Math.abs(ln) < 1e-9) return false;
  return true;
}

export function fitMapToPoints(
  map: google.maps.Map,
  points: ProjectMapPoint[],
  padding = 48,
): void {
  const valid = points.filter((p) => isValidMapCoordinate(p.latitude, p.longitude));
  if (!valid.length) return;

  if (valid.length === 1) {
    map.setCenter({ lat: valid[0].latitude, lng: valid[0].longitude });
    map.setZoom(Math.min(PROJECT_MAP_FIT_MAX_ZOOM, 12));
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  for (const p of valid) {
    bounds.extend({ lat: p.latitude, lng: p.longitude });
  }
  map.fitBounds(bounds, padding);
  const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
    const zoom = map.getZoom();
    if (zoom != null && zoom > PROJECT_MAP_FIT_MAX_ZOOM) {
      map.setZoom(PROJECT_MAP_FIT_MAX_ZOOM);
    }
  });
  return () => {
    google.maps.event.removeListener(listener);
  };
}

export function readMapBounds(map: google.maps.Map): {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
} | null {
  const bounds = map.getBounds();
  if (!bounds) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return {
    north: ne.lat(),
    south: sw.lat(),
    east: ne.lng(),
    west: sw.lng(),
    zoom: map.getZoom() ?? 0,
  };
}

export function expandBounds(
  bounds: { north: number; south: number; east: number; west: number },
  ratio = 0.12,
) {
  const latSpan = bounds.north - bounds.south;
  const lngSpan = bounds.east - bounds.west;
  const latPad = latSpan * ratio;
  const lngPad = lngSpan * ratio;
  return {
    north: bounds.north + latPad,
    south: bounds.south - latPad,
    east: bounds.east + lngPad,
    west: bounds.west - lngPad,
  };
}
