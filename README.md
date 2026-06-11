# SE 2025 Urban Form D Variables (H3)

Calculates six **D variables** — a standard framework for measuring urban form and its relationship to travel behavior — for the WFRC/MAG region at H3 level-9 hexagon resolution using WFRC SE 2025 socioeconomic data. Each variable is available at two H3 resolutions (level 8 and level 9) and as both a smoothed and a raw value. The Destinations variable additionally exposes seven sub-component columns (one per amenity type) for drill-down analysis.

## Variables

| # | D Variable | Full Name | What it measures |
|---|-----------|-----------|-----------------|
| 1 | **Density** | Population + Employment Density | How intensely an area is used — residents and workers per square mile |
| 2 | **Diversity** | Land Use Mix | Balance between homes and jobs; high scores indicate mixed-use areas |
| 3 | **Design** | Street Network Design | How well-connected the street grid is; more intersections = more route choices |
| 4 | **Destinations** | Destination Accessibility | Proximity to activity centers and everyday amenities (composite + 7 sub-components) |
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

Weights are configurable at the top of `index.R` and must sum to 1. For edge cells (on the boundary of the study area), each present neighbor still receives the same fixed per-cell weight (`ring_weight / max_ring_size`), but missing neighbors simply contribute nothing — their weight is not redistributed. This means edge cells have a total weight slightly below 1.0, which is intentional: it avoids over-inflating the influence of the few present neighbors just because the cell happens to sit at a boundary.

The app's **Raw (Unsmoothed)** map panel shows each variable computed with no neighbor influence (center weight = 1.0), allowing direct comparison of the two representations.

---

### 1. Density — Population + Employment Density

**What it captures:** The combined intensity of residential and employment activity. Higher density generally supports more frequent transit, walkable retail, and efficient land use. Jobs are converted to a household-equivalent (`J2H = 1.8`) so the two dimensions are commensurable.

```
density = (smoothed_residential_units + smoothed_total_jobs / J2H) / HEX_AREA_SQMI
```

Hexes in Tooele, Morgan, Summit, and Wasatch counties are set to `NA` pending further guidance on appropriate methodology for those areas.

---

### 2. Diversity — Land Use Mix

**What it captures:** Whether homes and jobs co-exist in the same area. A score of 1.0 means jobs and households are in perfect balance; scores near 0 indicate either a pure residential suburb or a pure employment district. Mixed land uses shorten trips, support midday walkability, and make transit more viable in both peak directions.

```
hw        = smoothed_households × J2H
diversity = min(hw, smoothed_jobs) / max(hw, smoothed_jobs)
```

`NA` only where both households and jobs are zero (genuinely undeveloped — division by zero). Pure residential areas (jobs = 0) correctly score 0, as do pure employment districts (households = 0).

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
  - [WC Centers and Regional Land Uses](https://services1.arcgis.com/taguadKoI1XFwivx/ArcGIS/rest/services/WCV_Centers_and_Regional_Land_Uses/FeatureServer/0) — WFRC ArcGIS REST

- **Amenity presence score (40%)** — mean of six binary flags (1 if ≥1 qualifying feature intersects the hex, 0 otherwise):
  - Healthcare: [Licensed Health Care Facilities](https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/LicensedHealthCareFacilities/FeatureServer/0) — AGRC. Residential-care and home-based service types excluded (Assisted Living Facility Type I & II, Personal Care Agency, Home Health Agency, Hospice, Birthing Center, Abortion Clinic).
  - High school: [Schools Pre-K to 12](https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/Schools_PreKto12/FeatureServer/0) — AGRC (filtered to `SchoolLevel LIKE '%high%'`)
  - Grocery store: [Utah Grocery and Food Stores](https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/UtahGroceryAndFoodStores_DAF/FeatureServer/0) — WFRC (`TYPE IN ('Grocery Store', 'Specialty Grocery', 'Supermarket')`)
  - City hall / county office: [Community Services](https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/CommunityServices_gdb/FeatureServer/0) — WFRC (`Facility LIKE '%City Hall%' OR Facility LIKE '%County Office%'`)
  - Park: [Utah Parks Local](https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/UtahParksLocal/FeatureServer/0) — AGRC · [Access to Parks](https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/AccessToParks_082024_gdb/FeatureServer/2) — WFRC (union of both layers)
  - Emergency Medical Services: [Emergency Medical Services](https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/EmergencyMedicalServices/FeatureServer/0) — AGRC. Prison and military-base stations excluded (`NAME NOT LIKE '%PRISON%' AND NAME NOT LIKE '%-DOD'`).

```
amenity_score    = (healthcare + highschool + grocery + cityhall + park + ems) / 6
raw_destinations = 0.6 × wc_score + 0.4 × amenity_score
destinations     = smooth_by_neighbors(raw_destinations)
```

Each amenity component is also smoothed independently and stored as a separate column (see [Output columns](#output-columns)) to support per-amenity analysis.

All source-level filters are applied as SQL `WHERE` clauses at read time via the `fetch_or_cache` helper — the cached `.gpkg` files always contain the full unfiltered dataset, so filters can be adjusted without re-downloading.

---

### 5. Demographics — Socioeconomic Status

**What it captures:** Median household income as an equity lens. Lower-income households tend to depend more heavily on transit and active transportation, so this variable helps identify where built environment improvements would have the greatest equity benefit. It also contextualizes how the other D variables should be interpreted for a given community.

ACS 5-year median household income (B19013_001, 2023) is interpolated from block-group polygons to H3 hexes using `tidycensus::interpolate_pw()`, with SE 2025 estimated household counts (from the same pipeline) as the areal weight. Using SE households keeps the interpolation internally consistent — a hex with more estimated households pulls more of an overlapping block group's income signal. Only populated hexes (`households > 0`) receive a value. Result is neighbor-smoothed.

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
| Healthcare facilities | ArcGIS REST | `_data/remote/destinations/health_care.gpkg` |
| Schools (PreK–12) | ArcGIS REST | `_data/remote/destinations/schools.gpkg` |
| Grocery & food stores | ArcGIS REST | `_data/remote/destinations/grocery_stores.gpkg` |
| Community services (city halls) | ArcGIS REST | `_data/remote/destinations/city_halls.gpkg` |
| Parks (local + WFRC) | ArcGIS REST | `_data/remote/destinations/` |
| Emergency Medical Services | ArcGIS REST | `_data/remote/destinations/ems_stations.gpkg` |
| ACS BG median income (B19013_001) | tidycensus | `_data/remote/demographics/bg_income.gpkg` |
| UTA GTFS | download.file | `_data/remote/transit/` |
| Utah county boundaries | tigris | `_data/remote/boundaries/` |

Remote data is fetched once and cached locally as `.gpkg` files (full, unfiltered). SQL `WHERE` filters are applied at read time on each run. To change a filter, edit the `where` argument in `fetch_or_cache(...)` and re-run `index.R` — no re-download required.

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
2. Calculate all six D variables plus seven Destinations sub-components at both H3 level 8 and level 9
3. Export `_output/wfrc_se_2025_rtp23.gdb.zip` with all original SE columns plus D variable columns
4. Export PMTiles (`_app/public/l9.pmtiles`, `_app/public/l8.pmtiles`) and `_app/public/metadata.json` for the web app

## Output columns

The GDB contains two layers — `{GDB_NAME}_l9` (H3 level-9) and `{GDB_NAME}_l8` (H3 level-8) — each with all original SE columns plus the D variable columns below. Smoothed and raw versions use symmetric suffixes so it is unambiguous which is which.

### Core D variables

| Column | Type | Description |
|--------|------|-------------|
| `density_smoothed` | numeric | Persons + jobs equivalent per sq mi (neighbor-smoothed) |
| `density_raw` | numeric | Persons + jobs equivalent per sq mi (hex only, no smoothing) |
| `diversity_smoothed` | numeric | HH–job balance ratio 0–1 (smoothed) |
| `diversity_raw` | numeric | HH–job balance ratio 0–1 (raw) |
| `design_smoothed` | numeric | Intersection score — IntScore (smoothed) |
| `design_raw` | numeric | Intersection score — IntScore (raw) |
| `destinations_smoothed` | numeric | WC center + amenity composite 0–1 (smoothed) |
| `destinations_raw` | numeric | WC center + amenity composite 0–1 (raw) |
| `demographics_smoothed` | numeric | Estimated median HH income, $ (smoothed) |
| `demographics_raw` | numeric | Estimated median HH income, $ (raw) |
| `transit_dist_smoothed` | numeric | Distance to nearest frequent stop, miles (smoothed) |
| `transit_dist_raw` | numeric | Distance to nearest frequent stop, miles (raw) |

### Destinations sub-components

Each amenity is also stored as its own smoothed + raw column pair for per-amenity drill-down.

| Column | Type | Description |
|--------|------|-------------|
| `destinations_center_smoothed` | numeric | WC center area-overlap score 0–1 (smoothed) |
| `destinations_center_raw` | numeric | WC center area-overlap score 0–1 (raw) |
| `destinations_health_smoothed` | numeric | Healthcare presence flag 0/1 (smoothed) |
| `destinations_health_raw` | numeric | Healthcare presence flag 0/1 (raw) |
| `destinations_school_smoothed` | numeric | High school presence flag 0/1 (smoothed) |
| `destinations_school_raw` | numeric | High school presence flag 0/1 (raw) |
| `destinations_grocery_smoothed` | numeric | Grocery store presence flag 0/1 (smoothed) |
| `destinations_grocery_raw` | numeric | Grocery store presence flag 0/1 (raw) |
| `destinations_cityhall_smoothed` | numeric | City hall / county office presence flag 0/1 (smoothed) |
| `destinations_cityhall_raw` | numeric | City hall / county office presence flag 0/1 (raw) |
| `destinations_park_smoothed` | numeric | Park presence flag 0/1 (smoothed) |
| `destinations_park_raw` | numeric | Park presence flag 0/1 (raw) |
| `destinations_ems_smoothed` | numeric | EMS station presence flag 0/1 (smoothed) |
| `destinations_ems_raw` | numeric | EMS station presence flag 0/1 (raw) |
