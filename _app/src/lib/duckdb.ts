import * as duckdb from '@duckdb/duckdb-wasm';

let _db: duckdb.AsyncDuckDB | null = null;
let _conn: duckdb.AsyncDuckDBConnection | null = null;
let _initPromise: Promise<void> | null = null;
let _filesLoaded = false;

const BUNDLES = duckdb.getJsDelivrBundles();

async function init(): Promise<void> {
  const bundle = await duckdb.selectBundle(BUNDLES);
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'application/javascript' })
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.ERROR);

  _db = new duckdb.AsyncDuckDB(logger, worker);
  await _db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  _conn = await _db.connect();
}

export async function getDuckDB(): Promise<{ db: duckdb.AsyncDuckDB; conn: duckdb.AsyncDuckDBConnection }> {
  if (!_initPromise) _initPromise = init();
  await _initPromise;
  return { db: _db!, conn: _conn! };
}

export async function ensureParquetLoaded(basePath: string): Promise<void> {
  if (_filesLoaded) return;

  const { db } = await getDuckDB();

  const DATA_NOT_FOUND =
    'Parquet data files not found. Run the R pipeline (index.R) to generate ' +
    '_app/public/data/l9.parquet and l8.parquet.';

  async function fetchParquet(name: string): Promise<ArrayBuffer> {
    const r = await fetch(`${basePath}data/${name}`);
    // Vite SPA fallback and GitHub Pages both serve HTML for missing files with status 200
    if (!r.ok || r.headers.get('content-type')?.startsWith('text/html')) {
      throw new Error(DATA_NOT_FOUND);
    }
    const buf = await r.arrayBuffer();
    // Validate parquet magic bytes ("PAR1") at end of file
    const tail = new Uint8Array(buf, buf.byteLength - 4, 4);
    if (tail[0] !== 0x50 || tail[1] !== 0x41 || tail[2] !== 0x52 || tail[3] !== 0x31) {
      throw new Error(DATA_NOT_FOUND);
    }
    return buf;
  }

  const [l9, l8] = await Promise.all([fetchParquet('l9.parquet'), fetchParquet('l8.parquet')]);

  await db.registerFileBuffer('l9.parquet', new Uint8Array(l9));
  await db.registerFileBuffer('l8.parquet', new Uint8Array(l8));
  _filesLoaded = true;
}
