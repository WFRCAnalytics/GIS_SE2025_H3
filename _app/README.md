# SE 2025 D Variables — Interactive Web App

Vite + React + TypeScript app that visualizes the six D variables (and seven Destinations sub-components) produced by `index.R` for the WFRC/MAG region.

## Tech stack

| Layer | Tool |
|---|---|
| Build | Vite 6 |
| UI | React 19 + TypeScript |
| Map | MapLibre GL JS |
| Tile format | PMTiles (served from `public/`) |
| Data | `metadata.json` (pre-computed breaks, also in `public/`) |
| Deploy | GitHub Actions → GitHub Pages |

## Development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. PMTiles are loaded from `public/l9.pmtiles` and `public/l8.pmtiles` — regenerate these by re-running `index.R` in the parent project.

```bash
npm run build   # production build → dist/
npm run preview # preview the production build locally
```

## Key source files

| File | Purpose |
|---|---|
| `src/types.ts` | `DVariable` union type, `PopupData` interface |
| `src/constants.ts` | `VARIABLE_CONFIGS` (label, palette, formatter), `D_VARIABLES` order |
| `src/hooks/useData.ts` | Loads `metadata.json`, selects Fisher break values, builds MapLibre color expression |
| `src/App.tsx` | Root state: active variable, zoom, hovered hex, level mode |
| `src/components/map/SwipeMap.tsx` | MapLibre swipe comparison (smoothed left / raw right) |
| `src/components/map/HexInfoBox.tsx` | Hover panel showing all variable values for the focused hex |
| `src/components/ui/VariableSelector.tsx` | Sidebar list of variables; sub-vars indented |
| `src/components/layout/Header.tsx` | Title bar with active variable label and documentation link |

## Variables

The app exposes 14 selectable variables — the 6 core D variables, the Income Diversity Index, and 7 Destinations sub-components. Sub-components are visually indented in the variable selector and in the hex info popup.

| Variable ID | Label | Notes |
|---|---|---|
| `density` | Density | |
| `diversity` | Diversity | |
| `design` | Design | |
| `destinations` | Destinations | Composite (WC centers 60% + amenities 40%) |
| `destinations_center` | Dest: Centers | WC center area-overlap score |
| `destinations_health` | Dest: Health | Healthcare facilities |
| `destinations_school` | Dest: Schools | High schools |
| `destinations_grocery` | Dest: Grocery | Grocery stores & supermarkets |
| `destinations_cityhall` | Dest: Civic | City halls & county offices |
| `destinations_park` | Dest: Parks | Local and regional parks |
| `destinations_ems` | Dest: EMS | Emergency Medical Services stations |
| `demographics` | Demographics | Median household income |
| `income_diversity` | Income Diversity | 3-tier income mix (ACS B19001); 0 = only one income group present, 1 = lower/middle/higher income groups equally represented |
| `transit_dist` | Distance to Transit | Miles to nearest frequent stop |

Each variable is available at H3 level 8 (zoomed out) and level 9 (zoomed in). Level switches automatically at zoom 11 or can be locked in the sidebar. Each variable also has a smoothed and a raw map panel (MapLibre swipe control).

## Adding a new variable

1. Add the variable ID to the `DVariable` union in `src/types.ts`
2. Add smoothed and raw fields to the `PopupData` interface in `src/types.ts`
3. Add a `VariableConfig` entry to `VARIABLE_CONFIGS` in `src/constants.ts`
4. Add the variable ID to the `D_VARIABLES` array in `src/constants.ts`
5. Extract the new fields in the `handleHexHover` callback in `src/App.tsx`
6. Rerun `index.R` (which updates PMTiles and `metadata.json`)

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds the app and deploys `dist/` to GitHub Pages on every push to `main`. PMTiles and `metadata.json` are committed to `public/` and served as static assets.
