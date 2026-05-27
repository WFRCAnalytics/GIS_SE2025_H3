import type { DataStatus } from '../../hooks/useData';

interface LoadingOverlayProps {
  status: DataStatus;
  error: string | null;
}

export function LoadingOverlay({ status, error }: LoadingOverlayProps) {
  if (status === 'ready') return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {error ? (
          <>
            <div style={styles.errorIcon}>!</div>
            <div style={styles.title}>Failed to load data</div>
            <div style={styles.message}>{error}</div>
          </>
        ) : (
          <>
            <div style={styles.spinner} />
            <div style={styles.title}>
              {status === 'initializing' ? 'Initializing…' : 'Refreshing…'}
            </div>
            {status === 'initializing' && (
              <div style={styles.message}>Loading map data…</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(245,247,250,0.88)',
    backdropFilter: 'blur(3px)',
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: 'white',
    borderRadius: 10,
    padding: '28px 36px',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    maxWidth: 320,
  },
  spinner: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '3px solid #E6F2FA',
    borderTopColor: '#0067B1',
    animation: 'spin 0.9s linear infinite',
    margin: '0 auto 14px',
  },
  errorIcon: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#fee2e2',
    color: '#dc2626',
    fontSize: 20,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 14px',
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1A2B3C',
    marginBottom: 6,
  },
  message: {
    fontSize: 12,
    color: '#5A6A7A',
    lineHeight: 1.5,
  },
};
