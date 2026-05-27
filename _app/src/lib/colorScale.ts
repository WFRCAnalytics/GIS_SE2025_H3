import type { DVariable, BreakData, ColorStop } from '../types';
import { VARIABLE_CONFIGS } from '../constants';

export interface ColorScale {
  stops: ColorStop[];
  smoothedExpression: unknown[];
  rawExpression: unknown[];
  getColor: (value: number | null) => string;
}

export const NULL_COLOR = '#CCCCCC';

// Normalize whatever shape R may have serialized breaks into (named-list object,
// scalar number, or proper array) into a sorted number[].
function toBreaksArray(raw: unknown): number[] {
  if (Array.isArray(raw)) return (raw as number[]).slice().sort((a, b) => a - b);
  if (typeof raw === 'number') return [raw];
  if (raw != null && typeof raw === 'object')
    return Object.values(raw as Record<string, number>).sort((a, b) => a - b);
  return [];
}

export function buildColorScale(variable: DVariable, breakData: BreakData): ColorScale {
  const cfg = VARIABLE_CONFIGS[variable];
  const palette = cfg.invert ? [...cfg.palette].reverse() : cfg.palette;
  const breaks = toBreaksArray(breakData.breaks);
  const domainMin = breakData.min;

  const k = Math.min(breaks.length + 1, palette.length);
  const pal = palette.slice(0, k);

  // Null-safe step: non-numeric (null/missing) properties → NULL_COLOR
  const buildExpr = (prop: string): unknown[] => {
    const step: unknown[] = ['step', ['get', prop], pal[0]];
    breaks.slice(0, pal.length - 1).forEach((b, i) => step.push(b, pal[i + 1]));
    return ['case', ['!=', ['typeof', ['get', prop]], 'number'], NULL_COLOR, step];
  };

  const stops: ColorStop[] = breaks.map((v, i) => ({
    color: pal[Math.min(i + 1, pal.length - 1)],
    value: v,
  }));
  stops.unshift({ color: pal[0], value: domainMin });

  const getColor = (value: number | null): string => {
    if (value == null) return NULL_COLOR;
    let idx = 0;
    for (let i = 0; i < breaks.length; i++) {
      if (value >= breaks[i]) idx = i + 1;
      else break;
    }
    return pal[Math.min(idx, pal.length - 1)];
  };

  return {
    stops,
    smoothedExpression: buildExpr(variable),
    rawExpression:      buildExpr(`${variable}_raw`),
    getColor,
  };
}
