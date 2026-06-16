import { useState, useRef, useCallback, useEffect } from 'react';
import { MapPane } from './MapPane';
import { HexLayer } from './HexLayer';
import { useMapSync } from '../../hooks/useMapSync';
import type { ColorScale } from '../../lib/colorScale';
import type { HexLevel, LevelMode } from '../../types';
import {
  AUTO_LEVEL_FADE_START, AUTO_LEVEL_FADE_END,
  AUTO_LEVEL_ZOOM, DEFAULT_ZOOM,
} from '../../constants';

interface SwipeMapProps {
  levelMode: LevelMode;
  sourceUrlL8: string | null;
  colorScaleL8: ColorScale | null;
  sourceUrlL9: string | null;
  colorScaleL9: ColorScale | null;
  roadsAbove?: boolean;
  opacity?: number;
  // false for raw SE counts: no smoothed/raw pair, so collapse to one map
  compare?: boolean;
  onHexHover?: (props: Record<string, unknown>) => void;
  onZoomChange?: (zoom: number) => void;
}

const L8_FADE_OUT: [number, number] = [AUTO_LEVEL_FADE_START, AUTO_LEVEL_FADE_END];
const L9_FADE_IN:  [number, number] = [AUTO_LEVEL_FADE_START, AUTO_LEVEL_FADE_END];

export function SwipeMap({
  levelMode,
  sourceUrlL8, colorScaleL8,
  sourceUrlL9, colorScaleL9,
  roadsAbove = true, opacity,
  compare = true,
  onHexHover, onZoomChange,
}: SwipeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef   = useRef<HTMLDivElement>(null);
  const [divX, setDivX] = useState<number | null>(null);
  const [leftReady, setLeftReady]   = useState(false);
  const [rightReady, setRightReady] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const { leftRef, rightRef, attachSync } = useMapSync();

  useEffect(() => {
    if (!leftReady || !rightReady) return;
    const cleanup = attachSync();
    return cleanup;
  }, [leftReady, rightReady, attachSync]);

  // Track zoom for hover routing and report to parent
  useEffect(() => {
    if (!leftReady) return;
    const map = leftRef.current;
    if (!map) return;
    const handler = () => {
      const z = map.getZoom();
      setZoom(z);
      onZoomChange?.(z);
    };
    map.on('zoom', handler);
    return () => { map.off('zoom', handler); };
  }, [leftReady, leftRef, onZoomChange]);

  useEffect(() => {
    requestAnimationFrame(() => {
      leftRef.current?.resize();
      rightRef.current?.resize();
    });
  }, [divX, leftRef, rightRef]);

  const getClipPx = (): number => {
    const w = containerRef.current?.clientWidth ?? window.innerWidth;
    return divX ?? w / 2;
  };

  const startDrag = useCallback((startX: number) => {
    const container = containerRef.current;
    if (!container) return;

    const onMove = (x: number) => {
      const rect = container.getBoundingClientRect();
      setDivX(Math.max(60, Math.min(rect.width - 60, x - rect.left)));
    };

    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); onMove(e.touches[0].clientX); };
    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', cleanup);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', cleanup);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', cleanup);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', cleanup);
    onMove(startX);
  }, []);

  useEffect(() => {
    const el = dividerRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => { e.preventDefault(); startDrag(e.touches[0].clientX); };
    el.addEventListener('touchstart', handler, { passive: false });
    return () => el.removeEventListener('touchstart', handler);
  }, [startDrag]);

  const handleHexHover = useCallback(
    (props: Record<string, unknown>) => onHexHover?.(props),
    [onHexHover],
  );

  // In auto mode route hover to the dominant level; in manual mode the single layer always wins
  const hoverLevel: HexLevel = zoom >= AUTO_LEVEL_ZOOM ? 'l9' : 'l8';
  const l8Hover = levelMode === 'l8' || (levelMode === 'auto' && hoverLevel === 'l8')
    ? handleHexHover : undefined;
  const l9Hover = levelMode === 'l9' || (levelMode === 'auto' && hoverLevel === 'l9')
    ? handleHexHover : undefined;

  const clipPx = getClipPx();
  // When not comparing, clip the entire right pane away so only the left map shows.
  const rightClip = compare ? `inset(0 0 0 ${clipPx}px)` : 'inset(0 0 0 100%)';

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Left map: smoothed */}
      <div style={styles.mapBase}>
        <MapPane mapRef={leftRef} onReady={() => setLeftReady(true)} />
        {/* L8 — rendered in auto and l8 modes */}
        {leftReady && levelMode !== 'l9' && (
          <HexLayer
            key={`left-l8-${levelMode}`}
            map={leftRef.current}
            sourceId="left-l8"
            sourceUrl={sourceUrlL8}
            colorExpression={colorScaleL8?.smoothedExpression ?? null}
            roadsAbove={roadsAbove}
            opacity={opacity}
            fadeOutZoom={levelMode === 'auto' ? L8_FADE_OUT : undefined}
            onHexHover={l8Hover}
          />
        )}
        {/* L9 — rendered in auto and l9 modes */}
        {leftReady && levelMode !== 'l8' && (
          <HexLayer
            key={`left-l9-${levelMode}`}
            map={leftRef.current}
            sourceId="left-l9"
            sourceUrl={sourceUrlL9}
            colorExpression={colorScaleL9?.smoothedExpression ?? null}
            roadsAbove={roadsAbove}
            opacity={opacity}
            fadeInZoom={levelMode === 'auto' ? L9_FADE_IN : undefined}
            onHexHover={l9Hover}
          />
        )}
      </div>

      {/* Right map: raw — clipped to the right of the divider (fully hidden when not comparing) */}
      <div style={{ ...styles.mapBase, clipPath: rightClip }}>
        <MapPane mapRef={rightRef} onReady={() => setRightReady(true)} />
        {compare && rightReady && levelMode !== 'l9' && (
          <HexLayer
            key={`right-l8-${levelMode}`}
            map={rightRef.current}
            sourceId="right-l8"
            sourceUrl={sourceUrlL8}
            colorExpression={colorScaleL8?.rawExpression ?? null}
            roadsAbove={roadsAbove}
            opacity={opacity}
            fadeOutZoom={levelMode === 'auto' ? L8_FADE_OUT : undefined}
            onHexHover={l8Hover}
          />
        )}
        {compare && rightReady && levelMode !== 'l8' && (
          <HexLayer
            key={`right-l9-${levelMode}`}
            map={rightRef.current}
            sourceId="right-l9"
            sourceUrl={sourceUrlL9}
            colorExpression={colorScaleL9?.rawExpression ?? null}
            roadsAbove={roadsAbove}
            opacity={opacity}
            fadeInZoom={levelMode === 'auto' ? L9_FADE_IN : undefined}
            onHexHover={l9Hover}
          />
        )}
      </div>

      {/* Draggable divider + side labels — only when comparing smoothed vs raw */}
      {compare && (
        <>
          <div
            ref={dividerRef}
            style={{ ...styles.divider, left: clipPx }}
            onMouseDown={e => { e.preventDefault(); startDrag(e.clientX); }}
            role="separator"
            aria-label="Drag to compare smoothed and raw"
          >
            <div style={styles.dividerHandle}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M7 4L3 10L7 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 4L17 10L13 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div style={{ ...styles.label, left: 12 }}>Smoothed</div>
          <div style={{ ...styles.label, right: 12 }}>Raw (Unsmoothed)</div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    background: '#e8ecef',
  },
  mapBase: {
    position: 'absolute',
    inset: 0,
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 4,
    marginLeft: -2,
    background: 'white',
    cursor: 'ew-resize',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 6px rgba(0,0,0,0.35)',
  },
  dividerHandle: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#0067B1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    flexShrink: 0,
  },
  label: {
    position: 'absolute',
    top: 10,
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(4px)',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    color: '#1A2B3C',
    zIndex: 5,
    letterSpacing: '0.01em',
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
  },
};
