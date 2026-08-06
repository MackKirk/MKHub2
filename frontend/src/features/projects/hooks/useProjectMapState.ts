import { useCallback, useRef } from 'react';
import { PROJECT_MAP_DEFAULT_REGION } from '../lib/projectMapConfig';
import type { MapBounds } from '../components/map/projectMap.types';

type SessionState = {
  center: google.maps.LatLngLiteral;
  zoom: number;
};

let sessionViewport: SessionState | null = null;

export function useProjectMapState() {
  const userMovedRef = useRef(false);

  const getInitialCenter = useCallback((): google.maps.LatLngLiteral => {
    if (sessionViewport) return sessionViewport.center;
    return { ...PROJECT_MAP_DEFAULT_REGION.center };
  }, []);

  const getInitialZoom = useCallback((): number => {
    if (sessionViewport) return sessionViewport.zoom;
    return PROJECT_MAP_DEFAULT_REGION.zoom;
  }, []);

  const saveViewport = useCallback((center: google.maps.LatLngLiteral, zoom: number) => {
    sessionViewport = { center, zoom };
  }, []);

  const markUserMoved = useCallback(() => {
    userMovedRef.current = true;
  }, []);

  const shouldAutoFit = useCallback(() => !userMovedRef.current, []);

  const resetAutoFit = useCallback(() => {
    userMovedRef.current = false;
  }, []);

  return {
    getInitialCenter,
    getInitialZoom,
    saveViewport,
    markUserMoved,
    shouldAutoFit,
    resetAutoFit,
  };
}

export type { MapBounds };
