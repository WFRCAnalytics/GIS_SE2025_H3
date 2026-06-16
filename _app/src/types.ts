// "D variables" (paired smoothed/raw) plus raw SE counts (single value). The
// type name is kept for historical reasons; it now covers every mappable field.
export type DVariable =
  // D variables — have a smoothed value and a _raw counterpart (swipe-compared)
  | 'density'
  | 'diversity'
  | 'design'
  | 'destinations'
  | 'destinations_center'
  | 'destinations_health'
  | 'destinations_school'
  | 'destinations_grocery'
  | 'destinations_cityhall'
  | 'destinations_park'
  | 'destinations_ems'
  | 'demographics'
  | 'transit_dist'
  | 'income_diversity'
  // Raw SE counts — single value, no smoothed/raw distinction
  | 'hhpop'
  | 'households'
  | 'residential_units'
  | 'total_jobs'
  | 'industrial_jobs'
  | 'retail_jobs'
  | 'office_jobs'
  | 'jobs_accom_food'
  | 'jobs_gov_edu'
  | 'jobs_health'
  | 'jobs_manuf'
  | 'jobs_office'
  | 'jobs_other'
  | 'jobs_retail'
  | 'jobs_wholesale';

export type HexLevel = 'l9' | 'l8';
export type LevelMode = 'auto' | HexLevel;

export interface BreakData {
  breaks: number[];
  min: number;
  max: number;
  counts: number[];
}

export type LevelMeta = Record<DVariable, BreakData>;

export interface AppMetadata {
  l9: LevelMeta;
  l8: LevelMeta;
}

export interface PopupData {
  hex_id: string;
  density: number | null;                    density_raw: number | null;
  diversity: number | null;                  diversity_raw: number | null;
  design: number | null;                     design_raw: number | null;
  destinations: number | null;               destinations_raw: number | null;
  destinations_center: number | null;        destinations_center_raw: number | null;
  destinations_health: number | null;        destinations_health_raw: number | null;
  destinations_school: number | null;        destinations_school_raw: number | null;
  destinations_grocery: number | null;       destinations_grocery_raw: number | null;
  destinations_cityhall: number | null;      destinations_cityhall_raw: number | null;
  destinations_park: number | null;          destinations_park_raw: number | null;
  destinations_ems: number | null;           destinations_ems_raw: number | null;
  demographics: number | null;               demographics_raw: number | null;
  transit_dist: number | null;               transit_dist_raw: number | null;
  income_diversity: number | null;           income_diversity_raw: number | null;
  // Raw SE counts — single value (no _raw counterpart)
  hhpop: number | null;
  households: number | null;
  residential_units: number | null;
  total_jobs: number | null;
  industrial_jobs: number | null;
  retail_jobs: number | null;
  office_jobs: number | null;
  jobs_accom_food: number | null;
  jobs_gov_edu: number | null;
  jobs_health: number | null;
  jobs_manuf: number | null;
  jobs_office: number | null;
  jobs_other: number | null;
  jobs_retail: number | null;
  jobs_wholesale: number | null;
}

export interface ColorStop {
  color: string;
  value: number;
}
