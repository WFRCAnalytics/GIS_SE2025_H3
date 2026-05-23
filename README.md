# SE 2025 Urban Form D Variables (H3)

Calculates six urban form **D variables** for the WFRC/MAG region at H3 level-9 hexagon resolution using WFRC SE 2025 socioeconomic data. Neighbor-weighted spatial smoothing is embedded in each variable's inputs rather than applied as a post-processing step.

## Variables

| # | Variable | Description |
|---|----------|-------------|
| 1 | **Density** | Residential + employment density per square mile |
| 2 | **Diversity** | Balance between households and jobs |
| 3 | **Design** | Street intersection density |
| 4 | **Destinations** | Proximity to activity centers and key amenities |
| 5 | **Demographics** | Median household income |
| 6 | **Distance to Transit** | Distance (miles) to nearest frequent transit stop |

## Methodology

### Spatial smoothing

Each variable's raw inputs are smoothed using a weighted average over H3 rings 0–3 before the variable formula is applied. Weights are configurable at the top of `index.R` and must sum to 1. Edge cells with fewer than a full complement of neighbors are handled correctly — weights are divided by the actual neighbor count per ring.

| Parameter | Default | Ring |
|-----------|---------|------|
| `CENTER_WEIGHT` | 0.4 | Cell itself |
| `RING1_WEIGHT` | 0.3 | ~6 neighbors |
| `RING2_WEIGHT` | 0.2 | ~12 neighbors |
| `RING3_WEIGHT` | 0.1 | ~18 neighbors |

### 1. Density

```
density = (smoothed_residential_units + smoothed_total_jobs / J2H) / HEX_AREA_SQMI
```

`J2H = 1.8` converts jobs to a household-equivalent. Hexes in Tooele, Morgan, Summit, and Wasatch counties are set to `NA` pending supervisor guidance on appropriate methodology for those areas.

### 2. Diversity

```
hw  = smoothed_households × J2H
diversity = min(hw, smoothed_jobs) / max(hw, smoothed_jobs)
```

Ranges 0–1 (0 = pure residential or employment, 1 = perfectly balanced). `NA` where either term is zero.

### 3. Design

Street intersection density (`IntPtsPerM`) from the WFRC Street Intersection Density 2025 layer, joined to H3 hexes and neighbor-smoothed.

### 4. Destinations

Combines two sub-scores, then neighbor-smooths the result:

- **WC Center score (60%)** — area-weighted overlap of each hex with Wasatch Choice centers. Center type weights (Metropolitan Center = 1.0 down to Special/Industrial = 0.0) are a named vector at the top of `index.R` and can be freely edited to add, remove, or reclassify center types. Capped at 1.0.
- **Amenity score (40%)** — mean of five binary presence flags (healthcare facility, high school, grocery store, city hall / county office, park). Each flag is 1 if ≥1 qualifying feature intersects the hex.

### 5. Demographics

ACS 5-year median household income (B19013_001, 2023) interpolated from block-group polygons to H3 hexes using `tidycensus::interpolate_pw()`. SE 2025 projected household counts serve as the spatial weight layer (same vintage as the pipeline). Only populated hexes (`households > 0`) receive a value; others are `NA`. Result is neighbor-smoothed.

> **Note:** Interpolating median incomes via weighted averaging is a known statistical approximation. Flagged for future revision.

### 6. Distance to Transit

Nearest-neighbor distance (miles) from each hex centroid to a **frequent** UTA transit stop, neighbor-smoothed. A stop is classified as frequent if its weekday median headway is ≤ 15 minutes, or if it serves commuter or heavy rail (GTFS `route_type` 1 or 2).

## Configuration

All tunable parameters are at the top of `index.R`:

```r
J2H           <- 1.8      # Jobs-to-household ratio
HEX_AREA_SQMI <- 0.0406   # Fixed H3 level-9 hex area (sq mi)

CENTER_WEIGHT <- 0.4      # Smoothing kernel weights (must sum to 1)
RING1_WEIGHT  <- 0.3
RING2_WEIGHT  <- 0.2
RING3_WEIGHT  <- 0.1

WC_CENTER_WEIGHTS <- c(   # Edit freely to add/remove/reclassify center types
  "Metropolitan Center" = 1.0,
  "Urban Center"        = 0.8,
  ...
)
```

## Data sources

| Source | Fetch method | Cache location |
|--------|-------------|----------------|
| WFRC SE 2025 (input) | Local GDB zip | `_data/wfrc_se_2025_rtp23.gdb.zip` |
| Street intersection density | ArcGIS REST | `_data/remote/design/` |
| WC Centers & Land Uses | ArcGIS REST | `_data/remote/destinations/` |
| Healthcare, schools, grocery, parks | ArcGIS REST | `_data/remote/destinations/` |
| ACS BG median income (B19013_001) | tidycensus | `_data/remote/demographics/bg_income.gpkg` |
| UTA GTFS | download.file | `_data/remote/transit/` |
| Utah county boundaries | tigris | `_data/remote/boundaries/` |

Remote data is fetched once and cached locally as `.gpkg` files. Re-runs read from cache.

## Project structure

```
_data/
  wfrc_se_2025_rtp23.gdb.zip     # Input SE data (not tracked by git)
  remote/                         # Auto-created remote data cache
_output/
  wfrc_se_2025_rtp23.gdb.zip     # Output with D variable columns appended
index.R                            # Main pipeline script
compare_income_methods.R           # Diagnostic: compares two income interpolation methods
D_VARIABLE_CALCULATIONS.md        # Detailed methodology specification
renv.lock                          # Locked package versions
```

## Setup

```r
renv::restore()
```

A Census API key is required for `tidycensus`. Set it once with:

```r
tidycensus::census_api_key("YOUR_KEY", install = TRUE)
```

## Running

Open the project in RStudio and source `index.R`. The script will:

1. Fetch and cache all remote data (first run only — subsequent runs load from cache)
2. Calculate all six D variables
3. Render a swipe map comparing smoothed vs. raw diversity in the Viewer pane
4. Export `_output/wfrc_se_2025_rtp23.gdb.zip` with all original SE columns plus six new D variable columns

## Output columns

The output GDB layer contains all original SE columns plus:

| Column | Type | Description |
|--------|------|-------------|
| `density` | numeric | Persons + jobs equivalent per sq mi (smoothed) |
| `diversity` | numeric | HH–job balance ratio 0–1 (smoothed) |
| `design` | numeric | Intersection density (smoothed) |
| `destinations` | numeric | WC center + amenity composite 0–1 (smoothed) |
| `demographics` | numeric | Estimated median HH income, $ (smoothed) |
| `transit_dist` | numeric | Distance to nearest frequent stop, miles (smoothed) |
