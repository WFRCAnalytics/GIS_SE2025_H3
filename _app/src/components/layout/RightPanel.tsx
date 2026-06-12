import type { ColorScale } from '../../lib/colorScale';
import type { DVariable, HexLevel, PopupData } from '../../types';
import { Legend } from '../map/Legend';
import { HexInfoBox } from '../map/HexInfoBox';

interface RightPanelProps {
  width: number;
  variable: DVariable;
  level: HexLevel;
  colorScale: ColorScale | null;
  hoveredHex: PopupData | null;
}

export function RightPanel({ width, variable, level, colorScale, hoveredHex }: RightPanelProps) {
  return (
    <aside style={{ ...styles.panel, width }}>
      <div style={styles.legendSection}>
        <Legend variable={variable} level={level} colorScale={colorScale} />
      </div>
      <div style={styles.sep} />
      <div style={styles.detailSection}>
        <HexInfoBox data={hoveredHex} activeVariable={variable} panelWidth={width} />
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flexShrink: 0,
    background: 'var(--color-surface)',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'hidden',
  },
  legendSection: {
    padding: '0 14px',
    flexShrink: 0,
  },
  sep: {
    height: 1,
    background: 'var(--color-border)',
    flexShrink: 0,
  },
  detailSection: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
  },
};
