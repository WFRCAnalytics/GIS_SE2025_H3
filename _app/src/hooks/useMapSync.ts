import { useRef, useCallback } from 'react';
import type maplibregl from 'maplibre-gl';

export function useMapSync() {
  const leftRef  = useRef<maplibregl.Map | null>(null);
  const rightRef = useRef<maplibregl.Map | null>(null);
  const syncing  = useRef(false);

  const attachSync = useCallback(() => {
    const L = leftRef.current;
    const R = rightRef.current;
    if (!L || !R) return () => {};

    const fromLeft = () => {
      if (syncing.current) return;
      syncing.current = true;
      R.jumpTo({ center: L.getCenter(), zoom: L.getZoom(), bearing: L.getBearing(), pitch: L.getPitch() });
      syncing.current = false;
    };
    const fromRight = () => {
      if (syncing.current) return;
      syncing.current = true;
      L.jumpTo({ center: R.getCenter(), zoom: R.getZoom(), bearing: R.getBearing(), pitch: R.getPitch() });
      syncing.current = false;
    };

    L.on('move', fromLeft);
    R.on('move', fromRight);

    return () => {
      L.off('move', fromLeft);
      R.off('move', fromRight);
    };
  }, []);

  return { leftRef, rightRef, attachSync };
}
