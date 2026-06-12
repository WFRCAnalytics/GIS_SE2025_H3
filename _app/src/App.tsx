import { useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { RightPanel } from './components/layout/RightPanel';
import { SwipeMap } from './components/map/SwipeMap';
import { LoadingOverlay } from './components/ui/LoadingOverlay';
import { useData } from './hooks/useData';
import { AUTO_LEVEL_ZOOM, DEFAULT_ZOOM, VARIABLE_CONFIGS } from './constants';
import type { DVariable, HexLevel, LevelMode, PopupData } from './types';

const PANEL_MIN = 160;
const PANEL_MAX = 480;
const PANEL_DEFAULT = 280;

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        width: 4,
        flexShrink: 0,
        cursor: 'col-resize',
        background: hovered ? 'var(--color-primary-light)' : 'var(--color-border)',
        transition: 'background 0.15s',
        zIndex: 10,
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  );
}

export default function App() {
  const [variable, setVariable]   = useState<DVariable>('density');
  const [levelMode, setLevelMode] = useState<LevelMode>('auto');
  const [mapZoom, setMapZoom]     = useState<number>(DEFAULT_ZOOM);
  const [hoveredHex, setHoveredHex] = useState<PopupData | null>(null);
  const [roadsAbove, setRoadsAbove] = useState<boolean>(true);
  const [hexOpacity, setHexOpacity] = useState<number>(0.78);
  const [leftWidth, setLeftWidth]   = useState<number>(PANEL_DEFAULT);
  const [rightWidth, setRightWidth] = useState<number>(PANEL_DEFAULT);

  const startResize = useCallback((
    e: React.MouseEvent,
    currentWidth: number,
    setter: React.Dispatch<React.SetStateAction<number>>,
    sign: 1 | -1,
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    const onMove = (ev: MouseEvent) => {
      setter(Math.max(PANEL_MIN, Math.min(PANEL_MAX, currentWidth + sign * (ev.clientX - startX))));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const handleLeftResizeStart  = useCallback((e: React.MouseEvent) => startResize(e, leftWidth,  setLeftWidth,  1),  [leftWidth,  startResize]);
  const handleRightResizeStart = useCallback((e: React.MouseEvent) => startResize(e, rightWidth, setRightWidth, -1), [rightWidth, startResize]);

  // Both levels loaded simultaneously — enables GPU-driven zoom crossfade in auto mode
  const dataL8 = useData(variable, 'l8');
  const dataL9 = useData(variable, 'l9');

  // Display level (for header/sidebar label) — still derived from zoom
  const level: HexLevel = levelMode === 'auto'
    ? (mapZoom >= AUTO_LEVEL_ZOOM ? 'l9' : 'l8')
    : levelMode;

  const compositeStatus =
    dataL8.status === 'error'       || dataL9.status === 'error'       ? 'error'       :
    dataL8.status === 'initializing'|| dataL9.status === 'initializing'? 'initializing' :
    dataL8.status === 'refreshing'  || dataL9.status === 'refreshing'  ? 'refreshing'  :
    'ready';
  const errorMsg = dataL8.error ?? dataL9.error;

  const handleHexHover = useCallback((props: Record<string, unknown>) => {
    const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
    setHoveredHex({
      hex_id:                    String(props.hex_id ?? ''),
      density:                   num(props.density),                   density_raw:               num(props.density_raw),
      diversity:                 num(props.diversity),                 diversity_raw:             num(props.diversity_raw),
      design:                    num(props.design),                    design_raw:                num(props.design_raw),
      destinations:              num(props.destinations),              destinations_raw:          num(props.destinations_raw),
      destinations_center:       num(props.destinations_center),       destinations_center_raw:   num(props.destinations_center_raw),
      destinations_health:       num(props.destinations_health),       destinations_health_raw:   num(props.destinations_health_raw),
      destinations_school:       num(props.destinations_school),       destinations_school_raw:   num(props.destinations_school_raw),
      destinations_grocery:      num(props.destinations_grocery),      destinations_grocery_raw:  num(props.destinations_grocery_raw),
      destinations_cityhall:     num(props.destinations_cityhall),     destinations_cityhall_raw: num(props.destinations_cityhall_raw),
      destinations_park:         num(props.destinations_park),         destinations_park_raw:     num(props.destinations_park_raw),
      destinations_ems:          num(props.destinations_ems),          destinations_ems_raw:      num(props.destinations_ems_raw),
      demographics:              num(props.demographics),              demographics_raw:          num(props.demographics_raw),
      transit_dist:              num(props.transit_dist),              transit_dist_raw:          num(props.transit_dist_raw),
      income_diversity:          num(props.income_diversity),          income_diversity_raw:      num(props.income_diversity_raw),
    });
  }, []);

  const handleLevelModeChange = useCallback((mode: LevelMode) => {
    setLevelMode(mode);
    setHoveredHex(null);
  }, []);

  const handleZoomChange = useCallback((zoom: number) => {
    setMapZoom(zoom);
  }, []);

  return (
    <div style={styles.app}>
      <Header variable={variable} level={level} />
      <div style={styles.body}>
        <Sidebar
          width={leftWidth}
          variable={variable}
          level={level}
          levelMode={levelMode}
          disabled={compositeStatus === 'initializing' || compositeStatus === 'refreshing'}
          roadsAbove={roadsAbove}
          hexOpacity={hexOpacity}
          onVariableChange={setVariable}
          onLevelModeChange={handleLevelModeChange}
          onRoadsAboveChange={setRoadsAbove}
          onOpacityChange={setHexOpacity}
        />
        <ResizeHandle onMouseDown={handleLeftResizeStart} />
        <div style={styles.mapArea}>
          <SwipeMap
            levelMode={levelMode}
            sourceUrlL8={dataL8.sourceUrl}
            colorScaleL8={dataL8.colorScale}
            sourceUrlL9={dataL9.sourceUrl}
            colorScaleL9={dataL9.colorScale}
            roadsAbove={roadsAbove}
            opacity={hexOpacity}
            onHexHover={handleHexHover}
            onZoomChange={handleZoomChange}
          />
          {/* Map title — centered at top of map area */}
          <div style={styles.mapTitle}>
            <span style={styles.mapTitleLabel}>{VARIABLE_CONFIGS[variable].label}</span>
            <span style={styles.mapTitleSep}>—</span>
            <span style={styles.mapTitleFull}>{VARIABLE_CONFIGS[variable].fullName}</span>
          </div>
          {compositeStatus !== 'ready' && <LoadingOverlay status={compositeStatus} error={errorMsg} />}
        </div>
        <ResizeHandle onMouseDown={handleRightResizeStart} />
        <RightPanel
          width={rightWidth}
          variable={variable}
          level={level}
          colorScale={level === 'l8' ? dataL8.colorScale : dataL9.colorScale}
          hoveredHex={hoveredHex}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  mapArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  mapTitle: {
    position: 'absolute',
    top: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 5,
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(4px)',
    borderRadius: 4,
    padding: '4px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
  },
  mapTitleLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--color-primary)',
    letterSpacing: '0.01em',
  },
  mapTitleSep: {
    fontSize: 12,
    color: 'var(--color-text-disabled)',
  },
  mapTitleFull: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text)',
  },
};
