import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';

interface HexLayerProps {
  map: maplibregl.Map | null;
  sourceId: string;
  sourceUrl: string | null;
  colorExpression: unknown[] | null;
  roadsAbove?: boolean;
  opacity?: number;
  /** [startZoom, endZoom] — layer fades in from 0 → opacity over this range */
  fadeInZoom?: [number, number];
  /** [startZoom, endZoom] — layer fades out from opacity → 0 over this range */
  fadeOutZoom?: [number, number];
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

/**
 * Build a fill-opacity value — either a scalar or a MapLibre zoom interpolation
 * expression when the layer should fade in/out over a zoom range.
 */
function buildOpacityExpr(
  opacity: number,
  fadeIn?: [number, number],
  fadeOut?: [number, number],
): unknown {
  if (!fadeIn && !fadeOut) return opacity;
  const expr: unknown[] = ['interpolate', ['linear'], ['zoom']];
  if (fadeIn) {
    expr.push(fadeIn[0], 0, fadeIn[1], opacity);
    if (fadeOut && fadeOut[0] > fadeIn[1]) expr.push(fadeOut[0], opacity);
  }
  if (fadeOut) {
    if (!fadeIn) expr.push(fadeOut[0], opacity);
    expr.push(fadeOut[1], 0);
  }
  return expr;
}

interface Slot {
  srcId: string;
  fillId: string;
  hlId: string;
}

function makeSlot(base: string, n: number): Slot {
  const p = `${base}-${n}`;
  return { srcId: p, fillId: `${p}-fill`, hlId: `${p}-hl` };
}

export function HexLayer({
  map, sourceId, sourceUrl, colorExpression,
  roadsAbove = true, opacity = OPACITY,
  fadeInZoom, fadeOutZoom,
  onHexHover,
}: HexLayerProps) {
  const hoveredId      = useRef<string | null>(null);
  const colorExprRef   = useRef<unknown[] | null>(colorExpression);
  const roadsAboveRef  = useRef(roadsAbove);
  const opacityRef     = useRef(opacity);
  const onHexHoverRef  = useRef(onHexHover);
  const fadeInZoomRef  = useRef(fadeInZoom);
  const fadeOutZoomRef = useRef(fadeOutZoom);
  const currentSlot    = useRef<Slot | null>(null);
  const currentFillRef = useRef<string | null>(null);
  const counterRef     = useRef(0);

  colorExprRef.current  = colorExpression;
  roadsAboveRef.current = roadsAbove;
  opacityRef.current    = opacity;
  onHexHoverRef.current = onHexHover;
  fadeInZoomRef.current  = fadeInZoom;
  fadeOutZoomRef.current = fadeOutZoom;

  useEffect(() => {
    if (!map || !sourceUrl) return;

    const outgoing = currentSlot.current;
    let crossfadeStarted = false;
    let crossfadeFallback: ReturnType<typeof setTimeout> | null = null;
    let outgoingTimer: ReturnType<typeof setTimeout> | null = null;

    const slot = makeSlot(sourceId, counterRef.current++);
    currentSlot.current    = slot;
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
        // No outline; disable antialiasing so translucent hex edges don't
        // stack into dark seams at shared borders (visible when zoomed out).
        'fill-antialias': false,
      },
    }, beforeId);
    map.addLayer({
      id: slot.hlId, type: 'line', source: slot.srcId, 'source-layer': LAYER,
      paint: {
        'line-color': '#ffffff',
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0],
      },
    }, beforeId);

    // Hold outgoing at full opacity; crossfade only once incoming tiles are ready.
    const startCrossfade = () => {
      if (crossfadeStarted) return;
      crossfadeStarted = true;
      if (crossfadeFallback !== null) clearTimeout(crossfadeFallback);

      if (map.getLayer(slot.fillId)) {
        if (colorExprRef.current?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          map.setPaintProperty(slot.fillId, 'fill-color', colorExprRef.current as any);
        }
        // Use zoom expression for GPU-driven crossfade, or scalar in manual mode
        map.setPaintProperty(
          slot.fillId, 'fill-opacity',
          buildOpacityExpr(opacityRef.current, fadeInZoomRef.current, fadeOutZoomRef.current),
        );
      }

      if (outgoing && map.getLayer(outgoing.fillId)) {
        map.setPaintProperty(outgoing.fillId, 'fill-opacity', 0);
        outgoingTimer = setTimeout(() => {
          if (map.getLayer(outgoing.hlId))   map.removeLayer(outgoing.hlId);
          if (map.getLayer(outgoing.fillId)) map.removeLayer(outgoing.fillId);
          if (map.getSource(outgoing.srcId)) map.removeSource(outgoing.srcId);
        }, FADE_MS + 30);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSourceData = (e: any) => {
      if (e.sourceId === slot.srcId && e.isSourceLoaded) {
        map.off('sourcedata', onSourceData);
        startCrossfade();
      }
    };
    map.on('sourcedata', onSourceData);

    crossfadeFallback = setTimeout(() => {
      map.off('sourcedata', onSourceData);
      startCrossfade();
    }, 2000);

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
      map.off('sourcedata', onSourceData);
      if (crossfadeFallback !== null) clearTimeout(crossfadeFallback);

      if (outgoingTimer !== null) clearTimeout(outgoingTimer);
      if (outgoing) {
        if (map.getLayer(outgoing.hlId))   map.removeLayer(outgoing.hlId);
        if (map.getLayer(outgoing.fillId)) map.removeLayer(outgoing.fillId);
        if (map.getSource(outgoing.srcId)) map.removeSource(outgoing.srcId);
      }

      map.off('mousemove', slot.fillId, onMouseMove);
      map.off('mouseleave', slot.fillId, onMouseLeave);
      if (map.getLayer(slot.hlId))   map.removeLayer(slot.hlId);
      if (map.getLayer(slot.fillId)) map.removeLayer(slot.fillId);
      if (map.getSource(slot.srcId)) map.removeSource(slot.srcId);

      currentSlot.current    = null;
      currentFillRef.current = null;
      hoveredId.current      = null;
    };
  }, [map, sourceId, sourceUrl]);

  // Roads above/below toggle — move layers without rebuilding source
  useEffect(() => {
    if (!map) return;
    const slot = currentSlot.current;
    if (!slot) return;
    const beforeId = hexInsertBefore(map, roadsAbove);
    [slot.fillId, slot.hlId].forEach(id => {
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

  // Opacity slider — bypass CSS transition so drags feel instant.
  // Rebuilds zoom expression with updated opacity when slider moves.
  // Deliberately excludes sourceId: new slots get opacity from opacityRef
  // inside startCrossfade; adding sourceId here would skip the fade-in.
  useEffect(() => {
    if (!map) return;
    const fillId = currentFillRef.current;
    if (!fillId || !map.getLayer(fillId)) return;
    const expr = buildOpacityExpr(opacity, fadeInZoomRef.current, fadeOutZoomRef.current);
    map.setPaintProperty(fillId, 'fill-opacity-transition', { duration: 0, delay: 0 });
    map.setPaintProperty(fillId, 'fill-opacity', expr);
    map.setPaintProperty(fillId, 'fill-opacity-transition', { duration: FADE_MS, delay: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, opacity]);

  return null;
}
