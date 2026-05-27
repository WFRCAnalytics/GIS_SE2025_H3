import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';

interface HexLayerProps {
  map: maplibregl.Map | null;
  sourceId: string;
  sourceUrl: string | null;
  colorExpression: unknown[] | null;
  roadsAbove?: boolean;
  onHexHover?: (props: Record<string, unknown>) => void;
}

const LAYER   = 'hexes';
const FADE_MS = 300;
const OPACITY = 0.78;

function hexInsertBefore(map: maplibregl.Map, roadsAbove: boolean): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  if (roadsAbove) {
    return layers.find(l => /^tunnel|^road|^bridge/.test(l.id))?.id;
  }
  // Roads-below: place hex after the last road/tunnel/bridge/rail *line* layer
  // but before the first symbol layer that follows (labels always stay on top).
  // Exclude symbol-type layers from the road scan so that road_label (a symbol
  // with id starting "road_") doesn't push lastRoadIdx past the text layers.
  let lastRoadIdx = -1;
  layers.forEach((l, i) => {
    if (/^tunnel|^road|^bridge|^rail/.test(l.id) && l.type !== 'symbol') lastRoadIdx = i;
  });
  if (lastRoadIdx < 0) return undefined;
  for (let i = lastRoadIdx + 1; i < layers.length; i++) {
    if (layers[i].type === 'symbol') return layers[i].id;
  }
  return undefined;
}

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

export function HexLayer({ map, sourceId, sourceUrl, colorExpression, roadsAbove = true, onHexHover }: HexLayerProps) {
  const hoveredId      = useRef<string | null>(null);
  const colorExprRef   = useRef<unknown[] | null>(colorExpression);
  const roadsAboveRef  = useRef(roadsAbove);
  const onHexHoverRef  = useRef(onHexHover);
  const currentSlot    = useRef<Slot | null>(null);
  const currentFillRef = useRef<string | null>(null);
  const counterRef     = useRef(0);

  colorExprRef.current  = colorExpression;
  roadsAboveRef.current = roadsAbove;
  onHexHoverRef.current = onHexHover;

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

    const beforeId = hexInsertBefore(map, roadsAboveRef.current);

    map.addLayer({
      id: slot.fillId, type: 'fill', source: slot.srcId, 'source-layer': LAYER,
      paint: {
        'fill-color': '#CCCCCC',
        'fill-opacity': 0,
        'fill-opacity-transition': { duration: FADE_MS, delay: 0 },
      },
    }, beforeId);
    map.addLayer({
      id: slot.lineId, type: 'line', source: slot.srcId, 'source-layer': LAYER,
      minzoom: 10,
      paint: { 'line-color': 'rgba(0,0,0,0.15)', 'line-width': 0.6 },
    }, beforeId);
    map.addLayer({
      id: slot.hlId, type: 'line', source: slot.srcId, 'source-layer': LAYER,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0],
      },
    }, beforeId);

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
      onHexHoverRef.current?.(e.features[0].properties as Record<string, unknown>);
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

  // Roads above/below toggle — move existing layers without rebuilding the source
  useEffect(() => {
    if (!map) return;
    const slot = currentSlot.current;
    if (!slot) return;
    const beforeId = hexInsertBefore(map, roadsAbove);
    [slot.fillId, slot.lineId, slot.hlId].forEach(id => {
      if (map.getLayer(id)) map.moveLayer(id, beforeId);
    });
  }, [map, roadsAbove]);

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
