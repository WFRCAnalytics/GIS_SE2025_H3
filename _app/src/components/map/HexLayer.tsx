import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';

interface HexLayerProps {
  map: maplibregl.Map | null;
  sourceId: string;
  sourceUrl: string | null;
  colorExpression: unknown[] | null;
  onHexClick?: (props: Record<string, unknown>) => void;
}

const LAYER   = 'hexes';
const FADE_MS = 300;
const OPACITY = 0.78;

// Each source+layer set gets a unique prefixed ID so old and new can coexist
// during the crossfade without MapLibre ID collisions.
interface Slot {
  srcId: string;
  fillId: string;
  lineId: string;
  hlId: string;
}

function makeSlot(base: string, n: number): Slot {
  const p = `${base}-${n}`;
  return { srcId: p, fillId: `${p}-fill`, lineId: `${p}-line`, hlId: `${p}-hl` };
}

export function HexLayer({ map, sourceId, sourceUrl, colorExpression, onHexClick }: HexLayerProps) {
  const hoveredId      = useRef<string | null>(null);
  const colorExprRef   = useRef<unknown[] | null>(colorExpression);
  const currentSlot    = useRef<Slot | null>(null);
  const currentFillRef = useRef<string | null>(null);
  const counterRef     = useRef(0);

  // Keep ref current so the setup effect reads the latest color without it
  // being in the dep array (which would rebuild the source on every variable change).
  colorExprRef.current = colorExpression;

  useEffect(() => {
    if (!map || !sourceUrl) return;

    // ── Outgoing slot: fade out then remove ───────────────────────────────────
    const outgoing = currentSlot.current;
    let outgoingTimer: ReturnType<typeof setTimeout> | null = null;

    if (outgoing && map.getLayer(outgoing.fillId)) {
      map.setPaintProperty(outgoing.fillId, 'fill-opacity', 0);
      outgoingTimer = setTimeout(() => {
        if (map.getLayer(outgoing.hlId))   map.removeLayer(outgoing.hlId);
        if (map.getLayer(outgoing.lineId)) map.removeLayer(outgoing.lineId);
        if (map.getLayer(outgoing.fillId)) map.removeLayer(outgoing.fillId);
        if (map.getSource(outgoing.srcId)) map.removeSource(outgoing.srcId);
      }, FADE_MS + 30);
    }

    // ── Incoming slot: add at opacity 0, then fade in ─────────────────────────
    const slot = makeSlot(sourceId, counterRef.current++);
    currentSlot.current  = slot;
    currentFillRef.current = slot.fillId;

    map.addSource(slot.srcId, {
      type: 'vector',
      url: sourceUrl,
      promoteId: { [LAYER]: 'hex_id' },
    });

    map.addLayer({
      id: slot.fillId, type: 'fill', source: slot.srcId, 'source-layer': LAYER,
      paint: {
        'fill-color': '#CCCCCC',
        'fill-opacity': 0,
        'fill-opacity-transition': { duration: FADE_MS, delay: 0 },
      },
    });
    map.addLayer({
      id: slot.lineId, type: 'line', source: slot.srcId, 'source-layer': LAYER,
      minzoom: 10,
      paint: { 'line-color': 'rgba(0,0,0,0.15)', 'line-width': 0.6 },
    });
    map.addLayer({
      id: slot.hlId, type: 'line', source: slot.srcId, 'source-layer': LAYER,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0],
      },
    });

    // Apply color + start fade-in on the next frame so MapLibre registers
    // the initial opacity:0 before transitioning to the target.
    const fadeInTimer = setTimeout(() => {
      if (!map.getLayer(slot.fillId)) return;
      if (colorExprRef.current?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setPaintProperty(slot.fillId, 'fill-color', colorExprRef.current as any);
      }
      map.setPaintProperty(slot.fillId, 'fill-opacity', OPACITY);
    }, 30);

    // Hover
    const fs = (id: string) => ({ source: slot.srcId, sourceLayer: LAYER, id });
    const onMouseMove = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      const id = String(e.features[0].id);
      if (hoveredId.current === id) return;
      if (hoveredId.current) map.setFeatureState(fs(hoveredId.current), { hover: false });
      hoveredId.current = id;
      map.setFeatureState(fs(id), { hover: true });
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      if (hoveredId.current) {
        map.setFeatureState(fs(hoveredId.current), { hover: false });
        hoveredId.current = null;
      }
      map.getCanvas().style.cursor = '';
    };
    map.on('mousemove', slot.fillId, onMouseMove);
    map.on('mouseleave', slot.fillId, onMouseLeave);

    return () => {
      clearTimeout(fadeInTimer);

      // Cancel the deferred outgoing-slot removal and do it immediately so
      // we don't leave orphaned layers if sourceUrl changes again mid-fade.
      if (outgoingTimer !== null) {
        clearTimeout(outgoingTimer);
        if (outgoing) {
          if (map.getLayer(outgoing.hlId))   map.removeLayer(outgoing.hlId);
          if (map.getLayer(outgoing.lineId)) map.removeLayer(outgoing.lineId);
          if (map.getLayer(outgoing.fillId)) map.removeLayer(outgoing.fillId);
          if (map.getSource(outgoing.srcId)) map.removeSource(outgoing.srcId);
        }
      }

      map.off('mousemove', slot.fillId, onMouseMove);
      map.off('mouseleave', slot.fillId, onMouseLeave);
      if (map.getLayer(slot.hlId))   map.removeLayer(slot.hlId);
      if (map.getLayer(slot.lineId)) map.removeLayer(slot.lineId);
      if (map.getLayer(slot.fillId)) map.removeLayer(slot.fillId);
      if (map.getSource(slot.srcId)) map.removeSource(slot.srcId);

      // Null the refs so the next effect run starts fresh
      currentSlot.current    = null;
      currentFillRef.current = null;
      hoveredId.current      = null;
    };
  }, [map, sourceId, sourceUrl]);

  // Click handler — re-registers whenever the active slot changes
  useEffect(() => {
    if (!map || !onHexClick) return;
    const fillId = currentFillRef.current;
    if (!fillId) return;
    const onClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features?.length) return;
      onHexClick(e.features[0].properties as Record<string, unknown>);
    };
    map.on('click', fillId, onClick);
    return () => { map.off('click', fillId, onClick); };
  }, [map, sourceId, sourceUrl, onHexClick]);

  // Color expression update — variable change only, no source rebuild
  useEffect(() => {
    if (!map || !colorExpression?.length) return;
    const fillId = currentFillRef.current;
    if (!fillId || !map.getLayer(fillId)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setPaintProperty(fillId, 'fill-color', colorExpression as any);
  }, [map, colorExpression, sourceId]);

  return null;
}
