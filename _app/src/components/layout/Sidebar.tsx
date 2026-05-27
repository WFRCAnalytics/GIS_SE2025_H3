import type { DVariable, HexLevel, PopupData } from '../../types';
import type { ColorScale } from '../../lib/colorScale';
import { VariableSelector } from '../ui/VariableSelector';
import { LevelToggle } from '../ui/LevelToggle';
import { Legend } from '../map/Legend';
import { HexPopup } from '../map/HexPopup';
import { VARIABLE_CONFIGS } from '../../constants';

interface SidebarProps {
  variable: DVariable;
  level: HexLevel;
  colorScale: ColorScale | null;
  selectedHex: PopupData | null;
  hexLoading: boolean;
  disabled: boolean;
  onVariableChange: (v: DVariable) => void;
  onLevelChange: (l: HexLevel) => void;
  onCloseHex: () => void;
}

export function Sidebar({
  variable, level, colorScale, selectedHex, hexLoading,
  disabled, onVariableChange, onLevelChange, onCloseHex,
}: SidebarProps) {
  const cfg = VARIABLE_CONFIGS[variable];
  return (
    <aside style={styles.sidebar}>
      {/* Controls */}
      <div style={styles.section}>
        <VariableSelector value={variable} onChange={onVariableChange} />
        <div style={styles.sep} />
        <LevelToggle value={level} onChange={onLevelChange} disabled={disabled} />
      </div>

      {/* Description */}
      <div style={styles.desc}>{cfg.description}</div>

      <div style={styles.sep} />

      {/* Legend */}
      <div style={styles.section}>
        <Legend variable={variable} colorScale={colorScale} />
      </div>

      {/* Swipe hint */}
      <div style={styles.hint}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <path d="M3 7h8M7 3l4 4-4 4" stroke="#0067B1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Drag divider to compare <strong>Smoothed</strong> vs <strong>Raw</strong>
      </div>

      <div style={styles.sep} />

      {/* Hex popup */}
      {(selectedHex || hexLoading) && (
        <div style={styles.section}>
          <HexPopup
            data={selectedHex}
            loading={hexLoading}
            activeVariable={variable}
            onClose={onCloseHex}
          />
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <div>SE 2025 · WFRC/MAG Region</div>
        <div>ACS 2023 · UTA GTFS</div>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 'var(--sidebar-width)',
    flexShrink: 0,
    background: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  section: {
    padding: '12px 14px',
  },
  sep: {
    height: 1,
    background: 'var(--color-border)',
    flexShrink: 0,
  },
  desc: {
    padding: '0 14px 10px',
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.5,
  },
  hint: {
    padding: '8px 14px',
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    lineHeight: 1.4,
  },
  footer: {
    marginTop: 'auto',
    padding: '10px 14px',
    fontSize: 10,
    color: 'var(--color-text-disabled)',
    lineHeight: 1.6,
    borderTop: '1px solid var(--color-border)',
  },
};
