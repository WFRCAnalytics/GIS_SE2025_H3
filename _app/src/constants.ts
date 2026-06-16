import type { DVariable } from './types';

export interface VariableConfig {
  label: string;
  fullName: string;
  unit: string;
  description: string;
  palette: string[];
  invert: boolean;
  formatValue: (v: number) => string;
  // true for raw SE counts — single value, no smoothed/raw swipe comparison
  single?: boolean;
}

// Integer count with thousands separators (raw SE variables)
const fmtCount = (v: number) => Math.round(v).toLocaleString();

// 9-class ColorBrewer palettes
const YlOrRd9 = ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'];
const RdYlGn9 = ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9641'];
const PuBuGn9 = ['#fff7fb', '#ece2f0', '#d0d1e6', '#a6bddb', '#67a9cf', '#3690c0', '#02818a', '#016c59', '#014636'];
const YlGnBu9 = ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58'];
const BuPu9 = ['#f7fcfd', '#e0ecf4', '#bfd3e6', '#9ebcda', '#8c96c6', '#8c6bb1', '#88419d', '#810f7c', '#4d004b'];
const RdPu9 = ['#fff7f3', '#fde0dd', '#fcc5c0', '#fa9fb5', '#f768a1', '#dd3497', '#ae017e', '#7a0177', '#49006a'];

export const VARIABLE_CONFIGS: Record<DVariable, VariableConfig> = {
  density: {
    label: 'Density',
    fullName: 'Population + Employment Density',
    unit: 'pop+jobs / mi²',
    description: 'Residential units and jobs per square mile (neighbor-smoothed)',
    palette: YlOrRd9,
    invert: false,
    formatValue: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0),
  },
  diversity: {
    label: 'Diversity',
    fullName: 'Land Use Mix',
    unit: 'ratio (0–1)',
    description: 'Balance between households and employment (1 = perfect balance)',
    palette: RdYlGn9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  design: {
    label: 'Design',
    fullName: 'Street Network Connectivity',
    unit: 'intersections / mi',
    description: 'Street intersection density (4-way full, 3-way half credit)',
    palette: PuBuGn9,
    invert: false,
    formatValue: (v) => v.toFixed(2),
  },
  destinations: {
    label: 'Destinations',
    fullName: 'Destination Accessibility',
    unit: 'score (0–1)',
    description: 'Proximity to walkable centers and daily-life amenities',
    palette: YlGnBu9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  destinations_center: {
    label: 'Dest: Centers',
    fullName: 'Access to Walkable Centers',
    unit: 'score (0–1)',
    description: 'Area-weighted coverage by WC center tier (Metropolitan → Employment District)',
    palette: YlGnBu9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  destinations_health: {
    label: 'Dest: Health',
    fullName: 'Access to Health Care',
    unit: 'score (0–1)',
    description: 'Proximity to licensed health care facilities',
    palette: RdPu9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  destinations_school: {
    label: 'Dest: Schools',
    fullName: 'Access to High Schools',
    unit: 'score (0–1)',
    description: 'Proximity to PreK–12 high schools',
    palette: PuBuGn9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  destinations_grocery: {
    label: 'Dest: Grocery',
    fullName: 'Access to Grocery Stores',
    unit: 'score (0–1)',
    description: 'Proximity to grocery stores, specialty grocers, and supermarkets',
    palette: YlOrRd9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  destinations_cityhall: {
    label: 'Dest: Civic',
    fullName: 'Access to Civic Services',
    unit: 'score (0–1)',
    description: 'Proximity to city halls and county offices',
    palette: BuPu9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  destinations_park: {
    label: 'Dest: Parks',
    fullName: 'Access to Parks',
    unit: 'score (0–1)',
    description: 'Proximity to local and regional parks',
    palette: RdYlGn9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  destinations_ems: {
    label: 'Dest: EMS',
    fullName: 'Access to Emergency Medical Services',
    unit: 'score (0–1)',
    description: 'Proximity to EMS stations (ambulance services and equipment depots)',
    palette: YlOrRd9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  demographics: {
    label: 'Demographics',
    fullName: 'Socioeconomic Status',
    unit: 'median income ($)',
    description: 'Household-weighted median income (ACS 2023 5-year)',
    palette: BuPu9,
    invert: false,
    formatValue: (v) => `$${Math.round(v).toLocaleString()}`,
  },
  income_diversity: {
    label: 'Income Diversity',
    fullName: 'Income Diversity Index',
    unit: 'score (0–1)',
    description: 'Income mix across lower- (<$60k), middle- ($60k–$125k), and higher-income ($125k+) households: 0 = only one income group present, 1 = all three groups equally represented',
    palette: RdYlGn9,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  transit_dist: {
    label: 'Distance to Transit',
    fullName: 'Transit Access',
    unit: 'miles',
    description: 'Distance to nearest frequent transit stop (≤15 min headway)',
    palette: RdPu9,
    invert: true,
    formatValue: (v) => `${v.toFixed(2)} mi`,
  },

  // ── Raw SE counts (single value — summed from L9 children at L8) ──────────────
  hhpop: {
    label: 'Population',
    fullName: 'Household Population',
    unit: 'people',
    description: 'Population living in households (sum of L9 children at L8)',
    palette: YlOrRd9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  households: {
    label: 'Households',
    fullName: 'Total Households',
    unit: 'households',
    description: 'Number of households (sum of L9 children at L8)',
    palette: BuPu9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  residential_units: {
    label: 'Residential Units',
    fullName: 'Residential Units',
    unit: 'units',
    description: 'Number of residential dwelling units (sum of L9 children at L8)',
    palette: PuBuGn9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  total_jobs: {
    label: 'Total Jobs',
    fullName: 'Total Employment',
    unit: 'jobs',
    description: 'All jobs across every sector (sum of L9 children at L8)',
    palette: YlGnBu9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  industrial_jobs: {
    label: 'Jobs: Industrial',
    fullName: 'Industrial Jobs (Summary)',
    unit: 'jobs',
    description: 'Jobs in the industrial summary category',
    palette: YlOrRd9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  retail_jobs: {
    label: 'Jobs: Retail',
    fullName: 'Retail Jobs (Summary)',
    unit: 'jobs',
    description: 'Jobs in the retail summary category',
    palette: RdPu9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  office_jobs: {
    label: 'Jobs: Office',
    fullName: 'Office Jobs (Summary)',
    unit: 'jobs',
    description: 'Jobs in the office summary category',
    palette: YlGnBu9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  jobs_accom_food: {
    label: 'Sector: Accom/Food',
    fullName: 'Accommodation & Food Services Jobs',
    unit: 'jobs',
    description: 'Jobs in accommodation and food services',
    palette: YlOrRd9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  jobs_gov_edu: {
    label: 'Sector: Gov/Edu',
    fullName: 'Government & Education Jobs',
    unit: 'jobs',
    description: 'Jobs in government and education',
    palette: BuPu9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  jobs_health: {
    label: 'Sector: Health',
    fullName: 'Health Care Jobs',
    unit: 'jobs',
    description: 'Jobs in health care',
    palette: RdPu9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  jobs_manuf: {
    label: 'Sector: Manufacturing',
    fullName: 'Manufacturing Jobs',
    unit: 'jobs',
    description: 'Jobs in manufacturing',
    palette: PuBuGn9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  jobs_office: {
    label: 'Sector: Office',
    fullName: 'Office Jobs (Detailed)',
    unit: 'jobs',
    description: 'Jobs in office-based industries (detailed breakdown)',
    palette: YlGnBu9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  jobs_other: {
    label: 'Sector: Other',
    fullName: 'Other Jobs',
    unit: 'jobs',
    description: 'Jobs not captured by the other sector categories',
    palette: YlOrRd9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  jobs_retail: {
    label: 'Sector: Retail',
    fullName: 'Retail Jobs (Detailed)',
    unit: 'jobs',
    description: 'Jobs in retail trade (detailed breakdown)',
    palette: RdYlGn9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
  jobs_wholesale: {
    label: 'Sector: Wholesale',
    fullName: 'Wholesale Trade Jobs',
    unit: 'jobs',
    description: 'Jobs in wholesale trade',
    palette: BuPu9,
    invert: false,
    formatValue: fmtCount,
    single: true,
  },
};

export interface VariableGroup {
  label: string;
  variables: DVariable[];
}

// Drives the grouped dropdown (optgroups) and the grouped hex-detail table.
export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: 'D Variables',
    variables: ['density', 'diversity', 'design', 'destinations', 'demographics', 'income_diversity', 'transit_dist'],
  },
  {
    label: 'Destination Detail',
    variables: [
      'destinations_center', 'destinations_health', 'destinations_school',
      'destinations_grocery', 'destinations_cityhall', 'destinations_park', 'destinations_ems',
    ],
  },
  {
    label: 'Socioeconomic',
    variables: ['hhpop', 'households', 'residential_units', 'total_jobs'],
  },
  {
    label: 'Jobs (Summary)',
    variables: ['industrial_jobs', 'retail_jobs', 'office_jobs'],
  },
  {
    label: 'Jobs by Sector',
    variables: [
      'jobs_accom_food', 'jobs_gov_edu', 'jobs_health', 'jobs_manuf',
      'jobs_office', 'jobs_other', 'jobs_retail', 'jobs_wholesale',
    ],
  },
];

// D variables (paired smoothed/raw). Kept for the smoothed-vs-raw detail rows.
export const D_VARIABLES: DVariable[] = [
  'density', 'diversity', 'design',
  'destinations',
  'destinations_center', 'destinations_health', 'destinations_school',
  'destinations_grocery', 'destinations_cityhall', 'destinations_park', 'destinations_ems',
  'demographics', 'income_diversity', 'transit_dist',
];

export const CARTO_POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export const DEFAULT_CENTER: [number, number] = [-111.89, 40.76]; // Salt Lake City
export const DEFAULT_ZOOM = 9;

// Below this zoom → auto-select L8; at or above → auto-select L9
export const AUTO_LEVEL_ZOOM = 11;

// Zoom range over which L8 fades out and L9 fades in (GPU-evaluated per frame)
export const AUTO_LEVEL_FADE_START = 10.5;
export const AUTO_LEVEL_FADE_END = 11.5;
