# SE 2025 D Variables — Interactive Web App

Vite + React + TypeScript app that visualizes the six D variables (and seven Destinations sub-components) produced by `index.R` for the WFRC/MAG region, plus the raw SE inputs (population, households, residential units, and the full job-sector breakdown).

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
| `src/constants.ts` | `VARIABLE_CONFIGS` (label, palette, formatter, `single` flag), `VARIABLE_GROUPS` (dropdown/detail grouping) |
| `src/hooks/useData.ts` | Loads `metadata.json`, selects Fisher break values, builds MapLibre color expression |
| `src/App.tsx` | Root state: active variable, zoom, hovered hex, level mode |
| `src/components/map/SwipeMap.tsx` | MapLibre swipe comparison (smoothed left / raw right); collapses to a single full-width map for single-value SE variables |
| `src/components/map/HexInfoBox.tsx` | Hover panel showing all variable values for the focused hex, grouped |
| `src/components/ui/VariableSelector.tsx` | Sidebar grouped dropdown (`<optgroup>` per variable group) |
| `src/components/layout/Header.tsx` | Title bar with active variable label and documentation link |

## Variables

The variable selector is a grouped dropdown organized into five `<optgroup>` sections (defined by `VARIABLE_GROUPS` in `src/constants.ts`):

- **D Variables** — `density`, `diversity`, `design`, `destinations`, `demographics`, `income_diversity`, `transit_dist`
- **Destination Detail** — the 7 `destinations_*` sub-components (centers, health, schools, grocery, civic, parks, EMS)
- **Socioeconomic** — `hhpop` (population), `households`, `residential_units`, `total_jobs`
- **Jobs (Summary)** — `industrial_jobs`, `retail_jobs`, `office_jobs` (the 3-class summary model)
- **Jobs by Sector** — the 8 detailed `jobs_*` sectors (accom/food, gov/edu, health, manufacturing, office, other, retail, wholesale)

The first two groups (the **D variables**, marked with no `single` flag) each have a smoothed and a raw value, compared side-by-side with the MapLibre swipe control. The raw SE counts (`single: true`) have no smoothed/raw distinction, so selecting one **collapses the view to a single full-width map** — the swipe divider and Smoothed/Raw labels are hidden.

Every variable is available at H3 level 8 (zoomed out) and level 9 (zoomed in). The level switches automatically at zoom 11 or can be locked in the sidebar.

## Adding a new variable

1. Add the variable ID to the `DVariable` union in `src/types.ts`
2. Add the field(s) to the `PopupData` interface in `src/types.ts` — a smoothed + `_raw` pair for a D variable, or a single field for a raw count
3. Add a `VariableConfig` entry to `VARIABLE_CONFIGS` in `src/constants.ts` (set `single: true` for a raw count with no swipe comparison)
4. Add the variable ID to the relevant group in `VARIABLE_GROUPS` in `src/constants.ts`
5. Extract the new field(s) in the `handleHexHover` callback in `src/App.tsx`
6. Add the column to `app_cols` in `index.R` (raw counts are covered by `se_count_cols`) and rerun `index.R` to update the PMTiles and `metadata.json`

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds the app and deploys `dist/` to GitHub Pages on every push to `main`. PMTiles and `metadata.json` are committed to `public/` and served as static assets.
