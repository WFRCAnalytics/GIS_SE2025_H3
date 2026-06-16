import type { DVariable, PopupData } from '../../types';
import { HexInfoBox } from '../map/HexInfoBox';

interface RightPanelProps {
  width: number;
  variable: DVariable;
  hoveredHex: PopupData | null;
}

export function RightPanel({ width, variable, hoveredHex }: RightPanelProps) {
  return (
    <aside style={{ ...styles.panel, width }}>
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
  detailSection: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
  },
};
