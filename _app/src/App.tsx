import { useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { SwipeMap } from './components/map/SwipeMap';
import { HexInfoBox } from './components/map/HexInfoBox';
import { LoadingOverlay } from './components/ui/LoadingOverlay';
import { useData } from './hooks/useData';
import { AUTO_LEVEL_ZOOM, DEFAULT_ZOOM } from './constants';
import type { DVariable, HexLevel, LevelMode, PopupData } from './types';

export default function App() {
  const [variable, setVariable]   = useState<DVariable>('density');
  const [levelMode, setLevelMode] = useState<LevelMode>('auto');
  const [mapZoom, setMapZoom]     = useState<number>(DEFAULT_ZOOM);
  const [hoveredHex, setHoveredHex] = useState<PopupData | null>(null);
  const [roadsAbove, setRoadsAbove] = useState<boolean>(true);
  const [hexOpacity, setHexOpacity] = useState<number>(0.78);

  const level: HexLevel = levelMode === 'auto'
    ? (mapZoom >= AUTO_LEVEL_ZOOM ? 'l9' : 'l8')
    : levelMode;

  const { status, sourceUrl, colorScale, error } = useData(variable, level);

  const handleHexHover = useCallback((props: Record<string, unknown>) => {
    const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
    setHoveredHex({
      hex_id:           String(props.hex_id ?? ''),
      density:          num(props.density),          density_raw:      num(props.density_raw),
      diversity:        num(props.diversity),        diversity_raw:    num(props.diversity_raw),
      design:           num(props.design),           design_raw:       num(props.design_raw),
      destinations:     num(props.destinations),     destinations_raw: num(props.destinations_raw),
      demographics:     num(props.demographics),     demographics_raw: num(props.demographics_raw),
      transit_dist:     num(props.transit_dist),     transit_dist_raw: num(props.transit_dist_raw),
    });
  }, []);

  const handleLevelModeChange = useCallback((mode: LevelMode) => {
    setLevelMode(mode);
    setHoveredHex(null);
  }, []);

  const handleZoomChange = useCallback((zoom: number) => {
    setMapZoom(zoom);
  }, []);

  const isLoading = status === 'initializing' || status === 'refreshing';

  return (
    <div style={styles.app}>
      <Header variable={variable} level={level} />
      <div style={styles.body}>
        <Sidebar
          variable={variable}
          level={level}
          levelMode={levelMode}
          colorScale={colorScale}
          disabled={isLoading}
          roadsAbove={roadsAbove}
          hexOpacity={hexOpacity}
          onVariableChange={setVariable}
          onLevelModeChange={handleLevelModeChange}
          onRoadsAboveChange={setRoadsAbove}
          onOpacityChange={setHexOpacity}
        />
        <div style={styles.mapArea}>
          <SwipeMap
            sourceUrl={sourceUrl}
            colorScale={colorScale}
            roadsAbove={roadsAbove}
            opacity={hexOpacity}
            onHexHover={handleHexHover}
            onZoomChange={handleZoomChange}
          />
          <HexInfoBox data={hoveredHex} activeVariable={variable} />
          {isLoading && <LoadingOverlay status={status} error={null} />}
          {status === 'error' && <LoadingOverlay status={status} error={error} />}
        </div>
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
};
