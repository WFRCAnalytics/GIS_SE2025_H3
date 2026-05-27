import { useState } from 'react';
import type { PopupData, DVariable } from '../../types';
import { D_VARIABLES, VARIABLE_CONFIGS } from '../../constants';

interface HexInfoBoxProps {
  data: PopupData | null;
  activeVariable: DVariable;
}

export function HexInfoBox({ data, activeVariable }: HexInfoBoxProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={styles.container}>
      <button
        style={styles.header}
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <div style={styles.headerLeft}>
          <span style={styles.title}>Hex Details</span>
          {data && (
            <span style={styles.hexId}>{data.hex_id}</span>
          )}
        </div>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ flexShrink: 0, transition: 'transform 0.15s', transform: collapsed ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {!collapsed && (
        <div style={styles.body}>
          {!data ? (
            <div style={styles.placeholder}>Hover a hexagon for details</div>
          ) : (
            <div style={styles.grid}>
              {D_VARIABLES.map(varId => {
                const cfg = VARIABLE_CONFIGS[varId];
                const smooth = data[varId as keyof PopupData] as number | null;
                const raw    = data[`${varId}_raw` as keyof PopupData] as number | null;
                const isActive = varId === activeVariable;
                return (
                  <div key={varId} style={{ ...styles.row, ...(isActive ? styles.rowActive : {}) }}>
                    <div style={styles.varLabel}>{cfg.label}</div>
                    <div style={styles.values}>
                      <span style={styles.tag}>S</span>
                      <span style={styles.val}>{smooth == null ? '—' : cfg.formatValue(smooth)}</span>
                      <span style={{ ...styles.tag, ...styles.tagRaw }}>R</span>
                      <span style={styles.val}>{raw == null ? '—' : cfg.formatValue(raw)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 44,
    left: 12,
    width: 226,
    zIndex: 10,
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(6px)',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-md)',
    overflow: 'hidden',
    pointerEvents: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '7px 10px',
    background: 'var(--color-surface-raised)',
    borderBottom: '1px solid var(--color-border)',
    cursor: 'pointer',
    gap: 6,
    color: 'var(--color-text-secondary)',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
    lineHeight: 1,
  },
  hexId: {
    fontSize: 9,
    color: 'var(--color-text-disabled)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  body: {
    overflowY: 'auto',
    maxHeight: 280,
  },
  placeholder: {
    padding: '10px 10px',
    fontSize: 11,
    color: 'var(--color-text-disabled)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  grid: {
    padding: '4px 0',
  },
  row: {
    padding: '4px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  rowActive: {
    background: 'var(--color-primary-10)',
    borderLeft: '2px solid var(--color-primary)',
  },
  varLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  values: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  tag: {
    fontSize: 9,
    fontWeight: 700,
    background: '#0067B1',
    color: 'white',
    borderRadius: 2,
    padding: '0 3px',
    letterSpacing: '0.05em',
    lineHeight: '14px',
  },
  tagRaw: {
    background: '#5A6A7A',
    marginLeft: 4,
  },
  val: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text)',
    fontVariantNumeric: 'tabular-nums',
  },
};
