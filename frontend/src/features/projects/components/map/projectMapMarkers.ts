import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { PROJECT_MAP_CLUSTER_COLOR, getProjectMapPinColor } from '../../lib/projectMapColors';
import type { LocationGroup } from './projectMap.types';

function pinSvg(color: string, label?: string): string {
  const text = label
    ? `<text x="12" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${label}</text>`
    : '';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32">
      <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/>
      <circle cx="12" cy="12" r="5" fill="#fff"/>
      ${text}
    </svg>`,
  )}`;
}

function clusterSvg(count: number): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="18" fill="${PROJECT_MAP_CLUSTER_COLOR}" stroke="#fff" stroke-width="2"/>
      <text x="20" y="25" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${count}</text>
    </svg>`,
  )}`;
}

export function groupPointsByLocation<T extends { latitude: number; longitude: number }>(
  points: T[],
): LocationGroup[] {
  const map = new Map<string, LocationGroup>();
  for (const p of points) {
    const key = `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;
    const existing = map.get(key);
    if (existing) {
      existing.projects.push(p as LocationGroup['projects'][number]);
    } else {
      map.set(key, {
        key,
        lat: p.latitude,
        lng: p.longitude,
        projects: [p as LocationGroup['projects'][number]],
      });
    }
  }
  return Array.from(map.values());
}

export type MarkerManager = {
  setGroups: (
    groups: LocationGroup[],
    onClick: (group: LocationGroup) => void,
    entityPlural?: string,
  ) => void;
  clear: () => void;
};

export function createMarkerManager(map: google.maps.Map): MarkerManager {
  const markers = new Map<string, google.maps.Marker>();
  let clusterer: MarkerClusterer | null = null;

  const clear = () => {
    for (const m of markers.values()) {
      m.setMap(null);
    }
    markers.clear();
    clusterer?.clearMarkers();
    clusterer = null;
  };

  const setGroups = (
    groups: LocationGroup[],
    onClick: (group: LocationGroup) => void,
    entityPlural = 'projects',
  ) => {
    clear();
    const markerList: google.maps.Marker[] = [];

    for (const group of groups) {
      const count = group.projects.length;
      const status = group.projects[0]?.status;
      const color = getProjectMapPinColor(status);
      const marker = new google.maps.Marker({
        position: { lat: group.lat, lng: group.lng },
        title: count > 1 ? `${count} ${entityPlural}` : group.projects[0]?.name,
        icon: {
          url: pinSvg(color, count > 1 ? String(count) : undefined),
          scaledSize: new google.maps.Size(24, 32),
          anchor: new google.maps.Point(12, 32),
        },
      });
      marker.addListener('click', () => onClick(group));
      markers.set(group.key, marker);
      markerList.push(marker);
    }

    clusterer = new MarkerClusterer({
      map,
      markers: markerList,
      renderer: {
        render: ({ count, position }) =>
          new google.maps.Marker({
            position,
            icon: {
              url: clusterSvg(count),
              scaledSize: new google.maps.Size(40, 40),
              anchor: new google.maps.Point(20, 20),
            },
            label: undefined,
            zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
          }),
      },
    });
  };

  return { setGroups, clear };
}
