import type { HexLevel } from '../../types';

interface LevelToggleProps {
  value: HexLevel;
  onChange: (l: HexLevel) => void;
  disabled?: boolean;
}

const LEVELS: Array<{ id: HexLevel; label: string; detail: string }> = [
  { id: 'l9', label: 'Level 9', detail: '~0.04 mi²' },
  { id: 'l8', label: 'Level 8', detail: '~0.28 mi²' },
];

export function LevelToggle({ value, onChange, disabled }: LevelToggleProps) {
  return (
    <div style={styles.wrap}>
      <div style={styles.sectionLabel}>H3 Resolution</div>
      <div style={styles.toggle}>
        {LEVELS.map(lv => (
          <button
            key={lv.id}
            onClick={() => onChange(lv.id)}
            disabled={disabled}
            style={{
              ...styles.btn,
              ...(value === lv.id ? styles.btnActive : {}),
              ...(disabled ? styles.btnDisabled : {}),
            }}
            aria-pressed={value === lv.id}
          >
            <span style={styles.btnLabel}>{lv.label}</span>
            <span style={styles.btnDetail}>{lv.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
    marginBottom: 6,
    paddingLeft: 2,
  },
  toggle: {
    display: 'flex',
    background: 'var(--color-surface-raised)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
  },
  btn: {
    flex: 1,
    padding: '7px 6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    background: 'transparent',
    transition: 'background 0.12s, color 0.12s',
    cursor: 'pointer',
    borderRight: '1px solid var(--color-border)',
  },
  btnActive: {
    background: 'var(--color-primary)',
    color: 'white',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  btnLabel: {
    fontWeight: 600,
  },
  btnDetail: {
    fontSize: 10,
    opacity: 0.75,
  },
};
