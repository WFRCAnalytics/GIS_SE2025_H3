import { useState, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { SwipeMap } from './components/map/SwipeMap';
import { LoadingOverlay } from './components/ui/LoadingOverlay';
import { useData } from './hooks/useData';
import type { DVariable, HexLevel, PopupData } from './types';

export default function App() {
  const [variable, setVariable] = useState<DVariable>('density');
  const [level, setLevel]       = useState<HexLevel>('l9');
  const [selectedHex, setSelectedHex] = useState<PopupData | null>(null);

  const { status, sourceUrl, colorScale, error } = useData(variable, level);

  // Popup data comes directly from MapLibre feature properties — no async query needed
  const handleHexClick = useCallback((props: Record<string, unknown>) => {
    const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
    setSelectedHex({
      hex_id:           String(props.hex_id ?? ''),
      density:          num(props.density),          density_raw:      num(props.density_raw),
      diversity:        num(props.diversity),        diversity_raw:    num(props.diversity_raw),
      design:           num(props.design),           design_raw:       num(props.design_raw),
      destinations:     num(props.destinations),     destinations_raw: num(props.destinations_raw),
      demographics:     num(props.demographics),     demographics_raw: num(props.demographics_raw),
      transit_dist:     num(props.transit_dist),     transit_dist_raw: num(props.transit_dist_raw),
    });
  }, []);

  const handleLevelChange = useCallback((l: HexLevel) => {
    setLevel(l);
    setSelectedHex(null);
  }, []);

  const isLoading = status === 'initializing' || status === 'refreshing';

  return (
    <div style={styles.app}>
      <Header variable={variable} level={level} />
      <div style={styles.body}>
        <Sidebar
          variable={variable}
          level={level}
          colorScale={colorScale}
          selectedHex={selectedHex}
          hexLoading={false}
          disabled={isLoading}
          onVariableChange={setVariable}
          onLevelChange={handleLevelChange}
          onCloseHex={() => setSelectedHex(null)}
        />
        <div style={styles.mapArea}>
          <SwipeMap
            sourceUrl={sourceUrl}
            colorScale={colorScale}
            onHexClick={handleHexClick}
          />
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
