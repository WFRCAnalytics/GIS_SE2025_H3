export type DVariable =
  | 'density'
  | 'diversity'
  | 'design'
  | 'destinations'
  | 'demographics'
  | 'transit_dist';

export type HexLevel = 'l9' | 'l8';
export type LevelMode = 'auto' | HexLevel;

export interface BreakData {
  breaks: number[];
  min: number;
  max: number;
}

export type LevelMeta = Record<DVariable, BreakData>;

export interface AppMetadata {
  l9: LevelMeta;
  l8: LevelMeta;
}

export interface PopupData {
  hex_id: string;
  density: number | null;       density_raw: number | null;
  diversity: number | null;     diversity_raw: number | null;
  design: number | null;        design_raw: number | null;
  destinations: number | null;  destinations_raw: number | null;
  demographics: number | null;  demographics_raw: number | null;
  transit_dist: number | null;  transit_dist_raw: number | null;
}

export interface ColorStop {
  color: string;
  value: number;
}
