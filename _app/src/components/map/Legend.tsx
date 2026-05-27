import type { ColorScale } from '../../lib/colorScale';
import type { DVariable } from '../../types';
import { VARIABLE_CONFIGS } from '../../constants';

interface LegendProps {
  variable: DVariable;
  colorScale: ColorScale | null;
}

export function Legend({ variable, colorScale }: LegendProps) {
  const cfg = VARIABLE_CONFIGS[variable];

  if (!colorScale || colorScale.stops.length === 0) {
    return (
      <div style={styles.wrap}>
        <div style={styles.label}>{cfg.label}</div>
        <div style={{ color: 'var(--color-text-disabled)', fontSize: 11 }}>Not developed or Not applicable</div>
      </div>
    );
  }

  const { stops } = colorScale;

  return (
    <div style={styles.wrap}>
      <div style={styles.label}>{cfg.label}</div>
      <div style={styles.row}>
        {stops.map((stop, i) => (
          <div key={i} style={styles.swatchWrap}>
            <div style={{ ...styles.swatch, background: stop.color }} />
          </div>
        ))}
      </div>
      <div style={styles.tickRow}>
        {stops.map((stop, i) => (
          <div key={i} style={styles.tick}>
            {i === 0 || i === stops.length - 1 || i === Math.floor(stops.length / 2)
              ? cfg.formatValue(stop.value)
              : null}
          </div>
        ))}
      </div>
      <div style={styles.unit}>{cfg.unit}</div>
      <div style={styles.naRow}>
        <div style={{ ...styles.swatch, background: '#CCCCCC', width: 12, height: 12, borderRadius: 2, flexShrink: 0 }} />
        <span style={styles.naLabel}>Not developed or Not applicable</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '10px 0 4px',
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 6,
  },
  row: {
    display: 'flex',
    gap: 1,
  },
  swatchWrap: {
    flex: 1,
  },
  swatch: {
    height: 10,
    borderRadius: 1,
  },
  tickRow: {
    display: 'flex',
    marginTop: 3,
  },
  tick: {
    flex: 1,
    fontSize: 9,
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  unit: {
    fontSize: 10,
    color: 'var(--color-text-disabled)',
    marginTop: 4,
  },
  naRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  naLabel: {
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.3,
  },
};
