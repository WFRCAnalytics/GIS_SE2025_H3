# SE 2025 Urban Form D Variables (H3)

Calculates six **D variables** — a standard framework for measuring urban form and its relationship to travel behavior — for the WFRC/MAG region at H3 level-9 hexagon resolution using WFRC SE 2025 socioeconomic data. Each variable is available at two H3 resolutions (level 8 and level 9) and as both a smoothed and a raw value.

## Variables

| # | D Variable | Full Name | What it measures |
|---|-----------|-----------|-----------------|
| 1 | **Density** | Population + Employment Density | How intensely an area is used — residents and workers per square mile |
| 2 | **Diversity** | Land Use Mix | Balance between homes and jobs; high scores indicate mixed-use areas |
| 3 | **Design** | Street Network Design | How well-connected the street grid is; more intersections = more route choices |
| 4 | **Destinations** | Destination Accessibility | Proximity to activity centers and everyday amenities |
| 5 | **Demographics** | Socioeconomic Status | Median household income as an equity lens |
| 6 | **Distance to Transit** | Transit Access | Distance to the nearest frequent-service transit stop |

The D-variable framework originates from Cervero & Kockelman (1997) and has been refined by Ewing & Cervero (2010). These six dimensions collectively describe the built environment features most strongly associated with mode choice and vehicle miles traveled.

## Methodology

### Why spatial smoothing?

Urban form characteristics describe the environment a person *experiences*, not the contents of an arbitrary polygon. A resident living near the edge of a hex cell is equally shaped by what lies in the neighboring cells — a park one block away is just as accessible whether or not it falls within the same hex boundary. Raw per-hex values capture only what lands strictly inside a ~0.04 sq mi footprint, which can produce sharp artificial discontinuities at cell boundaries and miss critical nearby features.

Neighbor-weighted smoothing (up to 3 H3 rings, roughly a 0.5-mile radius) provides a **place-based** perspective that reflects the built environment someone actually experiences from that location. It is applied to the *inputs* of each variable formula before the formula is evaluated, so the smoothed value remains conceptually meaningful (e.g., smoothed density is still persons + jobs per sq mi, not an average of density scores).

The center cell retains the largest weight (40%), so each hex's own character dominates the result — smoothing reduces edge artifacts without washing out local variation.

| Ring | Approximate radius | Default weight | Effect |
|------|--------------------|---------------|--------|
| 0 (self) | — | 0.40 | Anchors value to the cell itself |
| 1 | ~0.15 mi | 0.30 | Immediate neighbors |
| 2 | ~0.30 mi | 0.20 | Near surroundings |
| 3 | ~0.50 mi | 0.10 | Extended neighborhood |

Weights are configurable at the top of `index.R` and must sum to 1. Edge cells (on the boundary of the study area) automatically adjust for their reduced neighbor count — the available neighbors are reweighted so no weight is lost.

The app's **Raw (Unsmoothed)** map panel shows each variable computed with no neighbor influence (center weight = 1.0), allowing direct comparison of the two representations.

---

### 1. Density — Population + Employment Density

**What it captures:** The combined intensity of residential and employment activity. Higher density generally supports more frequent transit, walkable retail, and efficient land use. Jobs are converted to a household-equivalent (`J2H = 1.8`) so the two dimensions are commensurable.

```
density = (smoothed_residential_units + smoothed_total_jobs / J2H) / HEX_AREA_SQMI
```

Hexes in Tooele, Morgan, Summit, and Wasatch counties are set to `NA` pending supervisor guidance on appropriate methodology for those areas.

---

### 2. Diversity — Land Use Mix

**What it captures:** Whether homes and jobs co-exist in the same area. A score of 1.0 means jobs and households are in perfect balance; scores near 0 indicate either a pure residential suburb or a pure employment district. Mixed land uses shorten trips, support midday walkability, and make transit more viable in both peak directions.

```
hw        = smoothed_households × J2H
diversity = min(hw, smoothed_jobs) / max(hw, smoothed_jobs)
```

`NA` where either households or jobs are zero (undeveloped or single-use areas).

---

### 3. Design — Street Network Design

**What it captures:** How well-connected the street network is. A dense grid with frequent intersections gives travelers more route choices, reduces out-of-direction travel, and creates a more walkable, bikeable environment. Dead-ends and cul-de-sac networks score low.

Street intersection score (`IntScore`) from the WFRC Street Intersection Density 2025 layer is joined to H3 hexes and neighbor-smoothed. Scores are awarded per intersection:

| Intersection type | Points | Rationale |
|---|---|---|
| 4-way (or higher) | 1.0 | Provides ≥ 2 additional route choices beyond going straight |
| 3-way (T-intersection) | 0.5 | Provides 1 additional route choice |

Scores are summed to the L8 hex, distributed equally among each hex's 7 L9 children, then neighbor-smoothed.

---

### 4. Destinations — Destination Accessibility

**What it captures:** Whether an area is *near* places people need to reach. Proximity to activity centers and everyday amenities reduces trip distances, supports walking for errands, and makes transit more attractive. Combines two components:

- **Wasatch Choice Center score (60%)** — area-weighted overlap with WC centers, weighted by center type (Metropolitan Center = 1.0 down to Special/Industrial = 0.0). Capped at 1.0. Center type weights are a named vector at the top of `index.R` and can be freely edited.
- **Amenity presence score (40%)** — mean of five binary flags: healthcare facility, high school, grocery store, city hall / county office, park. Each is 1 if ≥1 qualifying feature intersects the hex.

---

### 5. Demographics — Socioeconomic Status

**What it captures:** Median household income as an equity lens. Lower-income households tend to depend more heavily on transit and active transportation, so this variable helps identify where built environment improvements would have the greatest equity benefit. It also contextualizes how the other D variables should be interpreted for a given community.

ACS 5-year median household income (B19013_001, 2023) is interpolated from block-group polygons to H3 hexes using `tidycensus::interpolate_pw()`, with 2020 Census occupied housing unit counts (H1_002N) as the areal weight. Only populated hexes (`households > 0`) receive a value. Result is neighbor-smoothed.

> **Note:** Interpolating median incomes via weighted averaging is a known statistical approximation (averaging medians is not strictly correct). Flagged for future revision.

---

### 6. Distance to Transit — Transit Access

**What it captures:** How accessible transit is on foot from a given location. Only **frequent** service is measured — infrequent buses running every hour are not a genuine travel alternative for most trips. Shorter distances indicate that transit is a viable option for daily travel.

Nearest-neighbor distance (miles) from each hex centroid to a frequent UTA transit stop, neighbor-smoothed. A stop is classified as frequent if its weekday median headway is ≤ 15 minutes, or if it serves commuter or heavy rail (GTFS `route_type` 1 or 2).

---

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
_app/                              # Interactive visualization app (Vite + MapLibre)
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
2. Calculate all six D variables at both H3 level 8 and level 9
3. Export `_output/wfrc_se_2025_rtp23.gdb.zip` with all original SE columns plus D variable columns

## Output columns

The output GDB layer contains all original SE columns plus:

| Column | Type | Description |
|--------|------|-------------|
| `density` | numeric | Persons + jobs equivalent per sq mi (smoothed) |
| `diversity` | numeric | HH–job balance ratio 0–1 (smoothed) |
| `design` | numeric | Intersection score — IntScore (smoothed) |
| `destinations` | numeric | WC center + amenity composite 0–1 (smoothed) |
| `demographics` | numeric | Estimated median HH income, $ (smoothed) |
| `transit_dist` | numeric | Distance to nearest frequent stop, miles (smoothed) |

Raw (unsmoothed) equivalents are available as `density_raw`, `diversity_raw`, `design_raw`, `destinations_raw`, `demographics_raw`, and `transit_dist_raw`.
