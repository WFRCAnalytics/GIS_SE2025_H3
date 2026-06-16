import type { DVariable } from '../../types';
import { VARIABLE_GROUPS, VARIABLE_CONFIGS } from '../../constants';

interface VariableSelectorProps {
  value: DVariable;
  onChange: (v: DVariable) => void;
}

export function VariableSelector({ value, onChange }: VariableSelectorProps) {
  const cfg = VARIABLE_CONFIGS[value];
  const activeColor = cfg.invert ? cfg.palette[0] : cfg.palette[cfg.palette.length - 1];

  return (
    <div style={styles.wrap}>
      <div style={styles.sectionLabel}>Variable</div>
      <div style={styles.control}>
        <span style={{ ...styles.swatch, background: activeColor }} />
        <select
          value={value}
          onChange={e => onChange(e.target.value as DVariable)}
          style={styles.select}
          aria-label="Select variable"
        >
          {VARIABLE_GROUPS.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.variables.map(varId => (
                <option key={varId} value={varId}>
                  {VARIABLE_CONFIGS[varId].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <svg
          style={styles.chevron}
          width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '0 0 12px',
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
  control: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 10px',
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
    flexShrink: 0,
  },
  select: {
    flex: 1,
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '8px 20px 8px 0',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
    cursor: 'pointer',
  },
  chevron: {
    position: 'absolute',
    right: 10,
    pointerEvents: 'none',
    color: 'var(--color-text-secondary)',
  },
};
