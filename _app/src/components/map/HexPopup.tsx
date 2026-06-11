import type { PopupData, DVariable } from '../../types';
import { D_VARIABLES, VARIABLE_CONFIGS } from '../../constants';

const SUB_VARS = new Set<DVariable>([
  'destinations_center', 'destinations_health', 'destinations_school',
  'destinations_grocery', 'destinations_cityhall', 'destinations_park', 'destinations_ems',
]);

interface HexPopupProps {
  data: PopupData | null;
  loading: boolean;
  activeVariable: DVariable;
  onClose: () => void;
}

export function HexPopup({ data, loading, activeVariable, onClose }: HexPopupProps) {
  if (!data && !loading) return null;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Hex Details</div>
          {data && <div style={styles.hexId}>{data.hex_id}</div>}
        </div>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {loading && <div style={styles.loading}>Loading…</div>}

      {data && !loading && (
        <div style={styles.grid}>
          {D_VARIABLES.map(varId => {
            const cfg = VARIABLE_CONFIGS[varId];
            const smooth = data[varId as keyof PopupData] as number | null;
            const raw    = data[`${varId}_raw` as keyof PopupData] as number | null;
            const isActive = varId === activeVariable;
            const isSub = SUB_VARS.has(varId);
            return (
              <div key={varId} style={{
                ...styles.row,
                ...(isSub ? styles.rowSub : {}),
                ...(isActive ? styles.rowActive : {}),
              }}>
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
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    marginTop: 8,
    overflow: 'hidden',
    boxShadow: 'var(--shadow-sm)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '8px 10px 6px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface-raised)',
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-text-secondary)',
  },
  hexId: {
    fontSize: 10,
    color: 'var(--color-text-disabled)',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  closeBtn: {
    color: 'var(--color-text-secondary)',
    padding: 2,
    lineHeight: 0,
    borderRadius: 3,
    cursor: 'pointer',
  },
  loading: {
    padding: '10px',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    textAlign: 'center',
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
  rowSub: {
    paddingLeft: 20,
    paddingTop: 2,
    paddingBottom: 2,
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
    flexWrap: 'wrap',
  },
  tag: {
    fontSize: 9,
    fontWeight: 700,
    background: '#0067B1',
    color: 'white',
    borderRadius: 2,
    padding: '0 3px',
    letterSpacing: '0.05em',
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
