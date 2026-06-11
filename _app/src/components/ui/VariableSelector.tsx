import type { DVariable } from '../../types';
import { D_VARIABLES, VARIABLE_CONFIGS } from '../../constants';

interface VariableSelectorProps {
  value: DVariable;
  onChange: (v: DVariable) => void;
}

const SUB_VARS = new Set<DVariable>([
  'destinations_center', 'destinations_health', 'destinations_school',
  'destinations_grocery', 'destinations_cityhall', 'destinations_park', 'destinations_ems',
]);

export function VariableSelector({ value, onChange }: VariableSelectorProps) {
  return (
    <div style={styles.wrap}>
      <div style={styles.sectionLabel}>Variable</div>
      <div style={styles.list}>
        {D_VARIABLES.map(varId => {
          const cfg = VARIABLE_CONFIGS[varId];
          const active = value === varId;
          const isSub = SUB_VARS.has(varId);
          return (
            <button
              key={varId}
              onClick={() => onChange(varId)}
              style={{
                ...styles.btn,
                ...(isSub ? styles.btnSub : {}),
                ...(active ? styles.btnActive : {}),
              }}
              aria-pressed={active}
            >
              <span
                style={{
                  ...styles.swatch,
                  background: active ? cfg.palette[cfg.palette.length - 1] : 'var(--color-border)',
                }}
              />
              <span style={styles.btnLabel}>{cfg.label}</span>
            </button>
          );
        })}
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
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text)',
    background: 'transparent',
    transition: 'background 0.12s, color 0.12s',
    textAlign: 'left',
    cursor: 'pointer',
  },
  btnSub: {
    paddingLeft: 22,
    fontSize: 12,
  },
  btnActive: {
    background: 'var(--color-primary-10)',
    color: 'var(--color-primary)',
    fontWeight: 600,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
    flexShrink: 0,
    transition: 'background 0.12s',
  },
  btnLabel: {
    flex: 1,
  },
};
