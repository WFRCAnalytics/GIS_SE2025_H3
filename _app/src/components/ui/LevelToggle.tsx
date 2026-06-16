import type { HexLevel, LevelMode } from '../../types';

interface LevelToggleProps {
  mode: LevelMode;
  activeLevel: HexLevel;
  onChange: (mode: LevelMode) => void;
  disabled?: boolean;
}

const OPTIONS: Array<{ id: LevelMode; label: string; detail?: string }> = [
  { id: 'l8', label: 'L8', detail: '~0.28 mi²' },
  { id: 'auto', label: 'Auto' },
  { id: 'l9', label: 'L9', detail: '~0.04 mi²' },
];

export function LevelToggle({ mode, activeLevel, onChange, disabled }: LevelToggleProps) {
  return (
    <div style={styles.wrap}>
      <div style={styles.sectionLabel}>H3 Resolution</div>
      <div style={styles.toggle}>
        {OPTIONS.map(opt => {
          const isActive = opt.id === mode;
          return (
            <button
              key={opt.id}
              onClick={() => onChange(opt.id)}
              disabled={disabled}
              style={{
                ...styles.btn,
                ...(isActive ? styles.btnActive : {}),
                ...(disabled ? styles.btnDisabled : {}),
              }}
              aria-pressed={isActive}
            >
              <span style={styles.btnLabel}>{opt.label}</span>
              {opt.id === 'auto'
                ? <span style={styles.btnDetail}>{activeLevel === 'l8' ? 'L8 active' : 'L9 active'}</span>
                : <span style={styles.btnDetail}>{opt.detail}</span>
              }
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 'var(--fs-10)',
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
    fontSize: 'var(--fs-12)',
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
    fontSize: 'var(--fs-10)',
    opacity: 0.75,
  },
};
