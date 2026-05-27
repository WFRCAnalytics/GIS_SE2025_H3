import { useState, useEffect } from 'react';
import { buildColorScale, type ColorScale } from '../lib/colorScale';
import type { DVariable, HexLevel, AppMetadata } from '../types';

export type DataStatus = 'initializing' | 'ready' | 'refreshing' | 'error';

export interface DataResult {
  status: DataStatus;
  sourceUrl: string | null;
  colorScale: ColorScale | null;
  error: string | null;
}

const BASE_URL = import.meta.env.BASE_URL;
let _metadata: AppMetadata | null = null;

async function loadMetadata(): Promise<AppMetadata> {
  if (_metadata) return _metadata;
  const r = await fetch(`${BASE_URL}data/metadata.json`);
  if (!r.ok) throw new Error(
    'Failed to load metadata.json — run the R pipeline (index.R) to generate app data.'
  );
  _metadata = await r.json() as AppMetadata;
  return _metadata;
}

export function useData(variable: DVariable, level: HexLevel): DataResult {
  const [status, setStatus]         = useState<DataStatus>('initializing');
  const [sourceUrl, setSourceUrl]   = useState<string | null>(null);
  const [colorScale, setColorScale] = useState<ColorScale | null>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus(prev => prev === 'initializing' ? 'initializing' : 'refreshing');

    loadMetadata()
      .then(meta => {
        if (cancelled) return;
        const scale = buildColorScale(variable, meta[level][variable]);
        setSourceUrl(`${BASE_URL}data/${level}.geojson`);
        setColorScale(scale);
        setError(null);
        setStatus('ready');
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
      });

    return () => { cancelled = true; };
  }, [variable, level]);

  return { status, sourceUrl, colorScale, error };
}
