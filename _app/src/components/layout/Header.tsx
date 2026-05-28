import type { DVariable, HexLevel } from '../../types';
import { VARIABLE_CONFIGS } from '../../constants';

interface HeaderProps {
  variable: DVariable;
  level: HexLevel;
}

export function Header({ variable, level }: HeaderProps) {
  const cfg = VARIABLE_CONFIGS[variable];
  return (
    <header style={styles.header}>
      {/* WFRC wordmark */}
      <div style={styles.brand}>
        <div style={styles.logoMark}>
          <span style={styles.logoText}>WFRC</span>
        </div>
        <div style={styles.dividerBar} />
        <div>
          <div style={styles.appTitle}>SE 2025 D Variables</div>
          <div style={styles.appSub}>WFRC / MAG Region · H3 Hexagons</div>
        </div>
      </div>

      {/* Active selection chip */}
      <div style={styles.chip}>
        <span style={styles.chipLabel}>{cfg.label}</span>
        <span style={styles.chipSep}>·</span>
        <span style={styles.chipSub}>{level === 'l9' ? 'Level 9' : 'Level 8'}</span>
      </div>

      {/* Documentation link */}
      <a
        href="https://github.com/WFRCAnalytics/GIS_SE2025_H3#readme"
        target="_blank"
        rel="noreferrer"
        style={styles.ghLink}
        aria-label="View documentation on GitHub"
      >
        <span style={styles.ghLinkText}>Documentation</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
        </svg>
      </a>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: 'var(--header-height)',
    background: 'var(--color-primary)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: 16,
    flexShrink: 0,
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  logoMark: {
    background: 'white',
    borderRadius: 4,
    padding: '3px 7px',
    flexShrink: 0,
  },
  logoText: {
    fontSize: 13,
    fontWeight: 800,
    color: 'var(--color-primary)',
    letterSpacing: '0.08em',
  },
  dividerBar: {
    width: 1,
    height: 24,
    background: 'rgba(255,255,255,0.3)',
    flexShrink: 0,
  },
  appTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'white',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  appSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    whiteSpace: 'nowrap',
  },
  chip: {
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: '3px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'white',
  },
  chipSep: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  chipSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  ghLink: {
    color: 'rgba(255,255,255,0.8)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    transition: 'color 0.12s',
    textDecoration: 'none',
  },
  ghLinkText: {
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
};
