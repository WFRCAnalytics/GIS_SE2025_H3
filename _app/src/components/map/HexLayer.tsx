import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';

interface HexLayerProps {
  map: maplibregl.Map | null;
  sourceId: string;
  sourceUrl: string | null;
  colorExpression: unknown[] | null;
  onHexClick?: (props: Record<string, unknown>) => void;
}

const FILL_ID = (id: string) => `${id}-fill`;
const LINE_ID = (id: string) => `${id}-line`;
const HL_ID   = (id: string) => `${id}-highlight`;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function HexLayer({ map, sourceId, sourceUrl, colorExpression, onHexClick }: HexLayerProps) {
  const hoveredId = useRef<string | null>(null);

  // Initialize source + layers once per map instance
  useEffect(() => {
    if (!map) return;

    map.addSource(sourceId, { type: 'geojson', data: EMPTY_FC, promoteId: 'hex_id' });

    map.addLayer({
      id: FILL_ID(sourceId),
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#CCCCCC',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.78],
      },
    });

    map.addLayer({
      id: LINE_ID(sourceId),
      type: 'line',
      source: sourceId,
      minzoom: 10,
      paint: { 'line-color': 'rgba(0,0,0,0.15)', 'line-width': 0.6 },
    });

    map.addLayer({
      id: HL_ID(sourceId),
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0],
      },
    });

    const onMouseMove = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      const id = String(e.features[0].id);
      if (hoveredId.current === id) return;
      if (hoveredId.current) map.setFeatureState({ source: sourceId, id: hoveredId.current }, { hover: false });
      hoveredId.current = id;
      map.setFeatureState({ source: sourceId, id }, { hover: true });
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      if (hoveredId.current) {
        map.setFeatureState({ source: sourceId, id: hoveredId.current }, { hover: false });
        hoveredId.current = null;
      }
      map.getCanvas().style.cursor = '';
    };

    map.on('mousemove', FILL_ID(sourceId), onMouseMove);
    map.on('mouseleave', FILL_ID(sourceId), onMouseLeave);

    return () => {
      map.off('mousemove', FILL_ID(sourceId), onMouseMove);
      map.off('mouseleave', FILL_ID(sourceId), onMouseLeave);
      if (map.getLayer(HL_ID(sourceId)))   map.removeLayer(HL_ID(sourceId));
      if (map.getLayer(LINE_ID(sourceId))) map.removeLayer(LINE_ID(sourceId));
      if (map.getLayer(FILL_ID(sourceId))) map.removeLayer(FILL_ID(sourceId));
      if (map.getSource(sourceId))         map.removeSource(sourceId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Click handler
  useEffect(() => {
    if (!map || !onHexClick) return;
    const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      onHexClick(e.features[0].properties as Record<string, unknown>);
    };
    map.on('click', FILL_ID(sourceId), onClick);
    return () => { map.off('click', FILL_ID(sourceId), onClick); };
  }, [map, sourceId, onHexClick]);

  // Load GeoJSON by URL (MapLibre fetches + parses in its own Worker)
  useEffect(() => {
    if (!map) return;
    const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    src?.setData(sourceUrl ?? EMPTY_FC);
  }, [map, sourceId, sourceUrl]);

  // Update color expression
  useEffect(() => {
    if (!map || !colorExpression || colorExpression.length === 0) return;
    if (!map.getLayer(FILL_ID(sourceId))) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setPaintProperty(FILL_ID(sourceId), 'fill-color', colorExpression as any);
  }, [map, colorExpression, sourceId]);

  return null;
}
