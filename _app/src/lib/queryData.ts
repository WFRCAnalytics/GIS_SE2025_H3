import { getDuckDB } from './duckdb';
import type { DVariable, HexLevel, QueryRow, PopupData } from '../types';

export async function queryVariable(level: HexLevel, variable: DVariable): Promise<QueryRow[]> {
  const { conn } = await getDuckDB();
  const file = `${level}.parquet`;
  const col = variable;
  const rawCol = `${variable}_raw`;

  const result = await conn.query(`
    SELECT
      hex_id,
      "${col}"     AS smoothed,
      "${rawCol}"  AS raw,
      geojson
    FROM '${file}'
  `);

  const rows: QueryRow[] = [];
  const hexIds   = result.getChildAt(0)!.toArray();
  const smoothed = result.getChildAt(1)!.toArray();
  const raw      = result.getChildAt(2)!.toArray();
  const geojsons = result.getChildAt(3)!.toArray();

  for (let i = 0; i < hexIds.length; i++) {
    rows.push({
      hex_id:   String(hexIds[i]),
      smoothed: smoothed[i] == null ? null : Number(smoothed[i]),
      raw:      raw[i]      == null ? null : Number(raw[i]),
      geojson:  String(geojsons[i]),
    });
  }
  return rows;
}

export async function queryHexPopup(level: HexLevel, hexId: string): Promise<PopupData | null> {
  const { conn } = await getDuckDB();
  const file = `${level}.parquet`;

  const result = await conn.query(`
    SELECT
      hex_id,
      density,       density_raw,
      diversity,     diversity_raw,
      design,        design_raw,
      destinations,  destinations_raw,
      demographics,  demographics_raw,
      transit_dist,  transit_dist_raw
    FROM '${file}'
    WHERE hex_id = '${hexId.replace(/'/g, "''")}'
    LIMIT 1
  `);

  if (result.numRows === 0) return null;

  const row = result.get(0)!;
  const num = (key: string) => {
    const v = row[key];
    return v == null ? null : Number(v);
  };

  return {
    hex_id:           String(row['hex_id']),
    density:          num('density'),       density_raw:      num('density_raw'),
    diversity:        num('diversity'),     diversity_raw:    num('diversity_raw'),
    design:           num('design'),        design_raw:       num('design_raw'),
    destinations:     num('destinations'),  destinations_raw: num('destinations_raw'),
    demographics:     num('demographics'),  demographics_raw: num('demographics_raw'),
    transit_dist:     num('transit_dist'),  transit_dist_raw: num('transit_dist_raw'),
  };
}
