import type { QueryRow } from '../types';

export function buildFeatureCollection(
  rows: QueryRow[],
  valueKey: 'smoothed' | 'raw'
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const row of rows) {
    const val = row[valueKey];
    if (val == null) continue; // NA hexes show basemap — no feature needed
    if (!row.geojson) continue;

    features.push({
      type: 'Feature',
      id: row.hex_id,
      geometry: JSON.parse(row.geojson) as GeoJSON.Geometry,
      properties: {
        hex_id: row.hex_id,
        value: val,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
