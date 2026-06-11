import type { DVariable } from './types';

export interface VariableConfig {
  label: string;
  fullName: string;
  unit: string;
  description: string;
  palette: string[];
  invert: boolean;
  formatValue: (v: number) => string;
}

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
  transit_dist: {
    label: 'Distance to Transit',
    fullName: 'Transit Access',
    unit: 'miles',
    description: 'Distance to nearest frequent transit stop (≤15 min headway)',
    palette: RdPu9,
    invert: true,
    formatValue: (v) => `${v.toFixed(2)} mi`,
  },
};

export const D_VARIABLES: DVariable[] = [
  'density', 'diversity', 'design',
  'destinations',
  'destinations_center', 'destinations_health', 'destinations_school',
  'destinations_grocery', 'destinations_cityhall', 'destinations_park', 'destinations_ems',
  'demographics', 'transit_dist',
];

export const CARTO_POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export const DEFAULT_CENTER: [number, number] = [-111.89, 40.76]; // Salt Lake City
export const DEFAULT_ZOOM = 9;

// Below this zoom → auto-select L8; at or above → auto-select L9
export const AUTO_LEVEL_ZOOM = 11;

// Zoom range over which L8 fades out and L9 fades in (GPU-evaluated per frame)
export const AUTO_LEVEL_FADE_START = 10.5;
export const AUTO_LEVEL_FADE_END = 11.5;
