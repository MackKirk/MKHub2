import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useNavigate } from 'react-router-dom';
import { loadGoogleMaps } from '@/lib/googleMapsLoader';
import { uiCx, uiRadius, uiShadows } from '@/components/ui';
import { PROJECT_MAP_LABELS } from '../../lib/mapViewLabels';
import { isMapPointsAbortError, useProjectMapPoints } from '../../hooks/useProjectMapPoints';
import { useProjectMapState } from '../../hooks/useProjectMapState';
import { PROJECT_MAP_MIN_HEIGHT_PX } from '../../lib/projectMapConfig';
import { fitMapToPoints, readMapBounds } from './projectMapBounds';
import { buildMapPopupHtml, MAP_POPUP_ROOT_ID, ProjectMapPopup } from './ProjectMapPopup';
import { ProjectMapFetchingOverlay } from './ProjectMapFetchingOverlay';
import { ProjectMapStatusBar } from './ProjectMapStatusBar';
import { createMarkerManager, groupPointsByLocation } from './projectMapMarkers';
import type { LocationGroup, MapListKind, MapViewLabels } from './projectMap.types';

type Props = {
  searchParams: URLSearchParams;
  businessLine: string;
  detailBasePath: string;
  listKind?: MapListKind;
  labels?: MapViewLabels;
};

export default function ProjectMapView({
  searchParams,
  businessLine,
  detailBasePath,
  listKind = 'projects',
  labels = PROJECT_MAP_LABELS,
}: Props) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const popupRootRef = useRef<Root | null>(null);
  const popupGroupRef = useRef<LocationGroup | null>(null);
  const markerManagerRef = useRef<ReturnType<typeof createMarkerManager> | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const filterKeyRef = useRef(searchParams.toString());
  const hasFittedRef = useRef(false);

  const {
    getInitialCenter,
    getInitialZoom,
    saveViewport,
    markUserMoved,
    shouldAutoFit,
    resetAutoFit,
  } = useProjectMapState();

  const { data, isLoading, isError, error, refetch, isFetching, isFetched } = useProjectMapPoints(
    listKind,
    searchParams,
    businessLine,
    null,
    true,
    false,
  );

  /** Only block the UI on first load — background refetches keep existing markers visible. */
  const isInitialMapLoading = isLoading && !data;

  const fetchError =
    isError && error && !isMapPointsAbortError(error)
      ? error instanceof Error
        ? error.message
        : 'Failed to load map data'
      : null;

  const unmountPopup = useCallback(() => {
    popupRootRef.current?.unmount();
    popupRootRef.current = null;
    popupGroupRef.current = null;
  }, []);

  const handlePopupOpen = useCallback(
    (projectId: string) => {
      navigate(`${detailBasePath}/${projectId}`);
    },
    [detailBasePath, navigate],
  );

  const mountPopup = useCallback(() => {
    const group = popupGroupRef.current;
    if (!group) return;
    const container = document.getElementById(MAP_POPUP_ROOT_ID);
    if (!container) return;
    unmountPopup();
    const root = createRoot(container);
    popupRootRef.current = root;
    root.render(
      <ProjectMapPopup group={group} labels={labels} listKind={listKind} onOpen={handlePopupOpen} />,
    );
  }, [handlePopupOpen, labels, listKind, unmountPopup]);

  const openGroup = useCallback(
    (group: LocationGroup) => {
      const map = mapRef.current;
      const infoWindow = infoWindowRef.current;
      if (!map || !infoWindow) return;

      unmountPopup();
      popupGroupRef.current = group;
      infoWindow.setContent(buildMapPopupHtml());
      infoWindow.setPosition({ lat: group.lat, lng: group.lng });
      infoWindow.open({ map });
      window.setTimeout(() => mountPopup(), 0);
    },
    [mountPopup, unmountPopup],
  );

  const handleFitToResults = useCallback(() => {
    const map = mapRef.current;
    if (!map || !data?.items?.length) return;
    resetAutoFit();
    hasFittedRef.current = true;
    fitMapToPoints(map, data.items);
    window.setTimeout(() => {
      if (mapRef.current) google.maps.event.trigger(mapRef.current, 'resize');
    }, 100);
  }, [data?.items, resetAutoFit]);

  const handleRetry = useCallback(() => {
    void refetch();
    window.setTimeout(() => {
      if (mapRef.current) google.maps.event.trigger(mapRef.current, 'resize');
    }, 150);
  }, [refetch]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const listeners: google.maps.MapsEventListener[] = [];

    const init = async () => {
      try {
        await loadGoogleMaps();
        if (cancelled || !containerRef.current) return;

        const map = new google.maps.Map(containerRef.current, {
          center: getInitialCenter(),
          zoom: getInitialZoom(),
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
        });
        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 320 });
        markerManagerRef.current = createMarkerManager(map);

        const onUserMove = () => {
          markUserMoved();
        };

        const persistViewport = () => {
          const raw = readMapBounds(map);
          if (!raw) return;
          saveViewport(map.getCenter()!.toJSON(), map.getZoom() ?? getInitialZoom());
        };

        listeners.push(map.addListener('dragend', onUserMove));
        listeners.push(map.addListener('zoom_changed', onUserMove));
        listeners.push(map.addListener('idle', persistViewport));

        resizeObserver = new ResizeObserver(() => {
          google.maps.event.trigger(map, 'resize');
        });
        resizeObserver.observe(containerRef.current);

        window.setTimeout(() => {
          if (!cancelled && mapRef.current) {
            google.maps.event.trigger(mapRef.current, 'resize');
          }
        }, 100);

        setMapReady(true);
      } catch (err) {
        if (!cancelled) {
          console.error('[ProjectMapView] map load failed', err);
          setLoadError(err instanceof Error ? err.message : 'Failed to load Google Maps');
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      for (const l of listeners) google.maps.event.removeListener(l);
      resizeObserver?.disconnect();
      markerManagerRef.current?.clear();
      unmountPopup();
      infoWindowRef.current?.close();
      mapRef.current = null;
      markerManagerRef.current = null;
      setMapReady(false);
      hasFittedRef.current = false;
    };
  }, [getInitialCenter, getInitialZoom, markUserMoved, saveViewport, unmountPopup]);

  useEffect(() => {
    const infoWindow = infoWindowRef.current;
    if (!infoWindow) return;

    const domReadyListener = infoWindow.addListener('domready', () => {
      mountPopup();
      const el = document.querySelector('.gm-style-iw-d');
      el?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a');
        if (link?.getAttribute('href')?.startsWith(detailBasePath)) {
          e.preventDefault();
          const href = link.getAttribute('href');
          if (href) navigate(href);
        }
      });
    });
    const closeListener = infoWindow.addListener('closeclick', () => {
      unmountPopup();
    });

    return () => {
      google.maps.event.removeListener(domReadyListener);
      google.maps.event.removeListener(closeListener);
    };
  }, [detailBasePath, mountPopup, navigate, unmountPopup]);

  useEffect(() => {
    const filterKey = searchParams.toString();
    if (filterKey !== filterKeyRef.current) {
      filterKeyRef.current = filterKey;
      resetAutoFit();
      hasFittedRef.current = false;
      unmountPopup();
      infoWindowRef.current?.close();
    }
  }, [searchParams, resetAutoFit, unmountPopup]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const manager = markerManagerRef.current;
    if (!map || !manager || !data?.items) return;

    const groups = groupPointsByLocation(data.items);
    manager.setGroups(groups, openGroup, labels.entityPlural);

    if (shouldAutoFit() && data.items.length > 0 && !hasFittedRef.current) {
      hasFittedRef.current = true;
      fitMapToPoints(map, data.items);
    }
    window.setTimeout(() => google.maps.event.trigger(map, 'resize'), 100);
  }, [mapReady, data?.items, labels.entityPlural, openGroup, shouldAutoFit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        unmountPopup();
        infoWindowRef.current?.close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [unmountPopup]);

  if (loadError) {
    return (
      <div className={uiCx('overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-8 text-center')} role="alert">
        <p className="mb-3 text-sm text-gray-700">{loadError}</p>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={uiCx('overflow-hidden', uiRadius.card, uiShadows.card, 'border border-gray-200')}>
      <ProjectMapStatusBar
        mappedCount={data?.mapped_count ?? 0}
        unmappedCount={data?.unmapped_count ?? 0}
        totalMatching={data?.total_matching ?? 0}
        labels={labels}
        isFetching={isInitialMapLoading}
        hasData={!!data}
        onFitToResults={handleFitToResults}
        errorMessage={fetchError}
        onRetry={fetchError ? handleRetry : undefined}
      />
      <div className="relative w-full">
        <div
          ref={containerRef}
          className="w-full bg-gray-100"
          style={{ minHeight: PROJECT_MAP_MIN_HEIGHT_PX, height: 'min(70vh, calc(100vh - 320px))' }}
          role="application"
          aria-label={labels.mapAriaLabel}
        />
        <ProjectMapFetchingOverlay visible={isInitialMapLoading && mapReady} />
      </div>
      {!data && isFetched && !isFetching && !fetchError ? (
        <p className="px-3 py-2 text-center text-sm text-gray-500">{labels.noMatchFilters}</p>
      ) : null}
    </div>
  );
}
