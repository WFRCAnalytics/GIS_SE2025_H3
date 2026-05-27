import type { DVariable } from './types';

export interface VariableConfig {
  label: string;
  unit: string;
  description: string;
  palette: string[];
  invert: boolean;
  formatValue: (v: number) => string;
}

// 7-class ColorBrewer palettes
const YlOrRd7  = ['#ffffb2','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#b10026'];
const RdYlGn7  = ['#d73027','#f46d43','#fdae61','#fee08b','#d9ef8b','#a6d96a','#1a9641'];
const PuBuGn7  = ['#f6eff7','#d0d1e6','#a6bddb','#67a9cf','#3690c0','#02818a','#016450'];
const YlGnBu7  = ['#ffffcc','#c7e9b4','#7fcdbb','#41b6c4','#1d91c0','#225ea8','#0c2c84'];
const BuPu7    = ['#f7fcfd','#e0ecf4','#bfd3e6','#9ebcda','#8c96c6','#8856a7','#810f7c'];
const RdPu7    = ['#feebe2','#fcc5c0','#fa9fb5','#f768a1','#dd3497','#ae017e','#7a0177'];

export const VARIABLE_CONFIGS: Record<DVariable, VariableConfig> = {
  density: {
    label: 'Density',
    unit: 'pop+jobs / mi²',
    description: 'Residential units and jobs per square mile (neighbor-smoothed)',
    palette: YlOrRd7,
    invert: false,
    formatValue: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0),
  },
  diversity: {
    label: 'Diversity',
    unit: 'ratio (0–1)',
    description: 'Balance between households and employment (1 = perfect balance)',
    palette: RdYlGn7,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  design: {
    label: 'Design',
    unit: 'intersections / mi',
    description: 'Street intersection density (4-way full, 3-way half credit)',
    palette: PuBuGn7,
    invert: false,
    formatValue: (v) => v.toFixed(2),
  },
  destinations: {
    label: 'Destinations',
    unit: 'score (0–1)',
    description: 'Proximity to walkable centers and daily-life amenities',
    palette: YlGnBu7,
    invert: false,
    formatValue: (v) => v.toFixed(3),
  },
  demographics: {
    label: 'Demographics',
    unit: 'median income ($)',
    description: 'Household-weighted median income (ACS 2023 5-year)',
    palette: BuPu7,
    invert: false,
    formatValue: (v) => `$${Math.round(v).toLocaleString()}`,
  },
  transit_dist: {
    label: 'Distance to Transit',
    unit: 'miles',
    description: 'Distance to nearest frequent transit stop (≤15 min headway)',
    palette: RdPu7,
    invert: true,
    formatValue: (v) => `${v.toFixed(2)} mi`,
  },
};

export const D_VARIABLES: DVariable[] = [
  'density', 'diversity', 'design', 'destinations', 'demographics', 'transit_dist',
];

export const CARTO_POSITRON = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export const DEFAULT_CENTER: [number, number] = [-111.89, 40.76]; // Salt Lake City
export const DEFAULT_ZOOM = 9;
