import { useState } from 'react';
import type { PopupData, DVariable } from '../../types';
import { D_VARIABLES, VARIABLE_CONFIGS } from '../../constants';

interface HexInfoBoxProps {
  data: PopupData | null;
  activeVariable: DVariable;
  panelWidth?: number;
}

export function HexInfoBox({ data, activeVariable, panelWidth = 280 }: HexInfoBoxProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Responsive value columns: ~28% of usable width, clamped to 58–82px
  const valColW = Math.max(58, Math.min(82, Math.floor((panelWidth - 24) * 0.28)));
  const rowCols = `1fr ${valColW}px ${valColW}px`;

  return (
    <div style={styles.container}>
      <button
        style={styles.header}
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <div style={styles.headerLeft}>
          <span style={styles.title}>Hex Details</span>
          {data && <span style={styles.hexId}>{data.hex_id}</span>}
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
            <div style={styles.table}>
              {/* Column headers */}
              <div style={{ ...styles.colHeader, gridTemplateColumns: rowCols }}>
                <span />
                <span style={{ ...styles.colHeadLabel, color: 'var(--color-primary)' }}>Smoothed</span>
                <span style={{ ...styles.colHeadLabel, color: 'var(--color-text-secondary)' }}>Raw</span>
              </div>

              {/* Variable rows */}
              {D_VARIABLES.map(varId => {
                const cfg    = VARIABLE_CONFIGS[varId];
                const smooth = data[varId as keyof PopupData] as number | null;
                const raw    = data[`${varId}_raw` as keyof PopupData] as number | null;
                const isActive = varId === activeVariable;
                return (
                  <div key={varId} style={{ ...styles.row, gridTemplateColumns: rowCols, ...(isActive ? styles.rowActive : {}) }}>
                    <div style={styles.varLabel}>{cfg.label}</div>
                    <div style={{ ...styles.val, color: 'var(--color-primary)' }}>
                      {smooth == null ? '—' : cfg.formatValue(smooth)}
                    </div>
                    <div style={{ ...styles.val, color: 'var(--color-text-secondary)' }}>
                      {raw == null ? '—' : cfg.formatValue(raw)}
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
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '7px 12px',
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
    flex: 1,
    minHeight: 0,
  },
  placeholder: {
    padding: '16px 12px',
    fontSize: 11,
    color: 'var(--color-text-disabled)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  table: {
    padding: '4px 0 8px',
  },
  colHeader: {
    display: 'grid',
    padding: '4px 12px 4px',
    gap: '0 6px',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: 2,
  },
  colHeadLabel: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    textAlign: 'right',
  },
  row: {
    display: 'grid',
    gap: '0 6px',
    padding: '4px 12px',
    alignItems: 'center',
    borderLeft: '2px solid transparent',
  },
  rowActive: {
    background: 'var(--color-primary-10)',
    borderLeft: '2px solid var(--color-primary)',
  },
  varLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-text)',
    letterSpacing: '0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  val: {
    fontSize: 11,
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
};
