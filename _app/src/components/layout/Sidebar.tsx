import type { DVariable, HexLevel, LevelMode } from '../../types';
import { VariableSelector } from '../ui/VariableSelector';
import { LevelToggle } from '../ui/LevelToggle';
import { VARIABLE_CONFIGS } from '../../constants';

interface SidebarProps {
  width: number;
  variable: DVariable;
  level: HexLevel;
  levelMode: LevelMode;
  disabled: boolean;
  roadsAbove: boolean;
  hexOpacity: number;
  onVariableChange: (v: DVariable) => void;
  onLevelModeChange: (mode: LevelMode) => void;
  onRoadsAboveChange: (v: boolean) => void;
  onOpacityChange: (v: number) => void;
}

export function Sidebar({
  width, variable, level, levelMode,
  disabled, roadsAbove, hexOpacity, onVariableChange, onLevelModeChange, onRoadsAboveChange, onOpacityChange,
}: SidebarProps) {
  const cfg = VARIABLE_CONFIGS[variable];
  return (
    <aside style={{ ...styles.sidebar, width }}>
      {/* Controls */}
      <div style={styles.section}>
        <VariableSelector value={variable} onChange={onVariableChange} />
        <div style={styles.sep} />
        <LevelToggle mode={levelMode} activeLevel={level} onChange={onLevelModeChange} disabled={disabled} />
      </div>

      {/* Description */}
      <div style={styles.desc}>{cfg.description}</div>

      <div style={styles.sep} />

      {/* Hex opacity slider */}
      <div style={styles.section}>
        <div style={styles.sliderRow}>
          <span style={styles.sliderLabel}>Hex Opacity</span>
          <span style={styles.sliderValue}>{Math.round(hexOpacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(hexOpacity * 100)}
          onChange={e => onOpacityChange(Number(e.target.value) / 100)}
          style={styles.slider}
          aria-label="Hex layer opacity"
        />
      </div>

      <div style={styles.sep} />

      {/* Swipe hint — only meaningful for D variables (which have a raw counterpart) */}
      {!cfg.single && (
        <div style={styles.hint}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M3 7h8M7 3l4 4-4 4" stroke="#0067B1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Drag divider to compare <strong>Smoothed</strong> vs <strong>Raw</strong>
        </div>
      )}

      {/* Roads layer toggle */}
      <div style={styles.roadToggleWrap}>
        <div style={styles.roadToggleRow}>
          <div>
            <div style={styles.roadToggleLabel}>Enable Roads</div>
            <div style={styles.roadToggleSub}>
              {roadsAbove ? 'Roads on top of hexes' : 'Roads below hexes'}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={roadsAbove}
            aria-label="Enable Roads"
            onClick={() => onRoadsAboveChange(!roadsAbove)}
            style={{
              ...styles.toggleTrack,
              background: roadsAbove ? 'var(--color-primary)' : 'var(--color-border)',
            }}
          >
            <span style={{
              ...styles.toggleThumb,
              transform: roadsAbove ? 'translateX(16px)' : 'translateX(0)',
            }} />
          </button>
        </div>
      </div>

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
  sliderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sliderLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  sliderValue: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-primary)',
    fontVariantNumeric: 'tabular-nums',
    minWidth: 32,
    textAlign: 'right' as const,
  },
  slider: {
    width: '100%',
    accentColor: 'var(--color-primary)',
    cursor: 'pointer',
    height: 4,
  },
  roadToggleWrap: {
    padding: '6px 14px 10px',
  },
  roadToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roadToggleLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text)',
  },
  roadToggleSub: {
    fontSize: 10,
    color: 'var(--color-text-disabled)',
    marginTop: 1,
  },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    padding: 2,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.2s',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: 'white',
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
    transition: 'transform 0.2s',
    display: 'block',
  },
};
