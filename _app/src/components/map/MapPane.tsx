import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CARTO_POSITRON, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../constants';

interface MapPaneProps {
  mapRef: React.RefObject<maplibregl.Map | null>;
  onReady?: (map: maplibregl.Map) => void;
  style?: React.CSSProperties;
}

export function MapPane({ mapRef, onReady, style }: MapPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_POSITRON,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'imperial' }), 'bottom-left');

    // Push the top-right control group below the "Raw (Unsmoothed)" label (~36px tall).
    const ctrlContainer = map.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-top-right');
    if (ctrlContainer) ctrlContainer.style.top = '48px';

    map.on('load', () => {
      // Move building layers before the first road/tunnel layer so the hex fill
      // can be sandwiched: land+buildings below, roads+labels above.
      const firstRoad = map.getStyle().layers.find(
        l => /^tunnel|^road|^bridge/.test(l.id)
      )?.id;
      if (firstRoad) {
        ['building', 'building-top'].forEach(id => {
          if (map.getLayer(id)) map.moveLayer(id, firstRoad);
        });
      }

      (mapRef as React.MutableRefObject<maplibregl.Map | null>).current = map;
      onReady?.(map);
    });

    return () => {
      (mapRef as React.MutableRefObject<maplibregl.Map | null>).current = null;
      map.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        ...style,
      }}
    />
  );
}
