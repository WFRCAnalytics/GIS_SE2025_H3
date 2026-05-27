import { useState, useRef, useCallback, useEffect } from 'react';
import { MapPane } from './MapPane';
import { HexLayer } from './HexLayer';
import { useMapSync } from '../../hooks/useMapSync';
import type { ColorScale } from '../../lib/colorScale';

interface SwipeMapProps {
  sourceUrl: string | null;
  colorScale: ColorScale | null;
  roadsAbove?: boolean;
  opacity?: number;
  onHexHover?: (props: Record<string, unknown>) => void;
  onZoomChange?: (zoom: number) => void;
}

export function SwipeMap({ sourceUrl, colorScale, roadsAbove = true, opacity, onHexHover, onZoomChange }: SwipeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dividerRef   = useRef<HTMLDivElement>(null);
  const [divX, setDivX] = useState<number | null>(null);
  const [leftReady, setLeftReady]   = useState(false);
  const [rightReady, setRightReady] = useState(false);
  const { leftRef, rightRef, attachSync } = useMapSync();

  useEffect(() => {
    if (!leftReady || !rightReady) return;
    const cleanup = attachSync();
    return cleanup;
  }, [leftReady, rightReady, attachSync]);

  useEffect(() => {
    if (!leftReady || !onZoomChange) return;
    const map = leftRef.current;
    if (!map) return;
    const handler = () => onZoomChange(map.getZoom());
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

  // React registers onTouchStart as a passive listener, which blocks preventDefault.
  // Attach directly to the DOM node with { passive: false } so the drag can
  // suppress scroll while the divider is being dragged.
  useEffect(() => {
    const el = dividerRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => { e.preventDefault(); startDrag(e.touches[0].clientX); };
    el.addEventListener('touchstart', handler, { passive: false });
    return () => el.removeEventListener('touchstart', handler);
  }, [startDrag]);

  const handleHexHover = useCallback(
    (props: Record<string, unknown>) => onHexHover?.(props),
    [onHexHover]
  );

  const clipPx = getClipPx();

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Left map: smoothed */}
      <div style={styles.mapBase}>
        <MapPane mapRef={leftRef} onReady={() => setLeftReady(true)} />
        {leftReady && (
          <HexLayer
            map={leftRef.current}
            sourceId="left-hexes"
            sourceUrl={sourceUrl}
            colorExpression={colorScale?.smoothedExpression ?? null}
            roadsAbove={roadsAbove}
            opacity={opacity}
            onHexHover={handleHexHover}
          />
        )}
      </div>

      {/* Right map: raw — clipped to the right of the divider */}
      <div style={{ ...styles.mapBase, clipPath: `inset(0 0 0 ${clipPx}px)` }}>
        <MapPane mapRef={rightRef} onReady={() => setRightReady(true)} />
        {rightReady && (
          <HexLayer
            map={rightRef.current}
            sourceId="right-hexes"
            sourceUrl={sourceUrl}
            colorExpression={colorScale?.rawExpression ?? null}
            roadsAbove={roadsAbove}
            opacity={opacity}
            onHexHover={handleHexHover}
          />
        )}
      </div>

      {/* Draggable divider */}
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
