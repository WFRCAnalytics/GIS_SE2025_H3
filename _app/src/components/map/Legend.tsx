import { useState } from 'react';
import type { ColorScale } from '../../lib/colorScale';
import type { DVariable, HexLevel } from '../../types';
import { VARIABLE_CONFIGS } from '../../constants';

interface LegendProps {
  variable: DVariable;
  level: HexLevel;
  colorScale: ColorScale | null;
}

const BAR_MAX_H = 70;

export function Legend({ variable, level, colorScale }: LegendProps) {
  const cfg = VARIABLE_CONFIGS[variable];
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!colorScale || colorScale.stops.length === 0) {
    return (
      <div style={styles.wrap}>
        <div style={styles.labelRow}>
          <div style={styles.label}>{cfg.label}</div>
          <div style={styles.badge}>{level.toUpperCase()} · Smoothed</div>
        </div>
        <div style={{ color: 'var(--color-text-disabled)', fontSize: 11 }}>Not developed or Not applicable</div>
      </div>
    );
  }

  const { stops, counts, domainMax } = colorScale;
  const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
  const hasCounts = maxCount > 0;

  const hovered = hoveredIdx !== null ? {
    count: counts[hoveredIdx] ?? 0,
    lo: stops[hoveredIdx].value,
    hi: stops[hoveredIdx + 1]?.value ?? domainMax,
  } : null;

  return (
    <div style={styles.wrap}>
      <div style={styles.labelRow}>
        <div style={styles.label}>{cfg.label}</div>
        <div style={styles.badge}>{level.toUpperCase()} · Smoothed</div>
      </div>

      {/* Hover info — fixed height so layout doesn't shift */}
      <div style={{ ...styles.hoverInfo, visibility: hovered ? 'visible' : 'hidden' }}>
        {hovered && (
          <>
            <span style={styles.hoverCount}>{hovered.count.toLocaleString()} hexes</span>
            <span style={styles.hoverSep}>·</span>
            <span style={styles.hoverRange}>
              {cfg.formatValue(hovered.lo)} – {cfg.formatValue(hovered.hi)}
            </span>
          </>
        )}
      </div>

      {/* Histogram bars */}
      <div style={{ ...styles.barRow, height: BAR_MAX_H }}>
        {stops.map((stop, i) => {
          const barH = hasCounts
            ? Math.max(2, Math.sqrt((counts[i] ?? 0) / maxCount) * BAR_MAX_H)
            : BAR_MAX_H;
          return (
            <div
              key={i}
              style={styles.barWrap}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div
                style={{
                  ...styles.bar,
                  height: barH,
                  background: stop.color,
                  opacity: hoveredIdx === null || hoveredIdx === i ? 1 : 0.55,
                  outline: hoveredIdx === i ? '1.5px solid rgba(0,0,0,0.35)' : 'none',
                  outlineOffset: '-1px',
                }}
              />
            </div>
          );
        })}
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
        <div style={styles.naSwatch} />
        <span style={styles.naLabel}>Not developed or Not applicable</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '10px 0 4px',
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  badge: {
    fontSize: 9,
    fontWeight: 600,
    color: 'var(--color-text-disabled)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: 'var(--color-border)',
    borderRadius: 3,
    padding: '1px 5px',
  },
  hoverInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 16,
    marginBottom: 4,
  },
  hoverCount: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-text)',
    fontVariantNumeric: 'tabular-nums',
  },
  hoverSep: {
    fontSize: 10,
    color: 'var(--color-text-disabled)',
  },
  hoverRange: {
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  barRow: {
    display: 'flex',
    gap: 1,
    alignItems: 'flex-end',
  },
  barWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-end',
    cursor: 'default',
  },
  bar: {
    width: '100%',
    borderRadius: '1px 1px 0 0',
    transition: 'opacity 0.1s',
  },
  tickRow: {
    display: 'flex',
    marginTop: 3,
    borderTop: '1px solid var(--color-border)',
  },
  tick: {
    flex: 1,
    fontSize: 9,
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
    lineHeight: 1.2,
    marginTop: 2,
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
  naSwatch: {
    width: 12,
    height: 12,
    borderRadius: 2,
    flexShrink: 0,
    background: '#CCCCCC',
  },
  naLabel: {
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.3,
  },
};
