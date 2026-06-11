# SE 2025 Urban Form D Variables (H3)

Calculates six **D variables** — a standard framework for measuring urban form and its relationship to travel behavior — for the WFRC/MAG region at H3 level-9 hexagon resolution using WFRC SE 2025 socioeconomic data. Each variable is available at two H3 resolutions (level 8 and level 9) and as both a smoothed and a raw value. The Destinations variable additionally exposes seven sub-component columns (one per amenity type). The Demographics dimension includes two measures: median household income and the Income Diversity Index.

## Variables

| # | D Variable | Full Name | What it measures |
|---|-----------|-----------|-----------------|
| 1 | **Density** | Population + Employment Density | How intensely an area is used — residents and workers per square mile |
| 2 | **Diversity** | Land Use Mix | Balance between homes and jobs; high scores indicate mixed-use areas |
| 3 | **Design** | Street Network Design | How well-connected the street grid is; more intersections = more route choices |
| 4 | **Destinations** | Destination Accessibility | Proximity to activity centers and everyday amenities (composite + 7 sub-components) |
| 5 | **Demographics** | Socioeconomic Status | Median household income as an equity lens |
| 5b | **Income Diversity** | Income Diversity Index | Shannon entropy of household income brackets; 0 = all households in one bracket, 1 = perfectly even mix across all brackets |
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
  - Healthcare: [Licensed Health Care Facilities](https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/LicensedHealthCareFacilities/FeatureServer/0) — AGRC. Excluded types (clearly non-destination): Assisted Living Facility Type I & II, Home Health Agency, Hospice, Birthing Center, Abortion Clinic. All other license types — including clinics, hospitals, urgent care, mammography, personal care agencies, and specialty providers — are included.
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

**ACS variable:** `B19013_001` — Median Household Income in the Past 12 Months (in inflation-adjusted dollars), 2019–2023 ACS 5-year estimates, block-group geography.

ACS 5-year median household income is interpolated from block-group polygons to H3 hexes using `tidycensus::interpolate_pw()`, with SE 2025 estimated household counts (from the same pipeline) as the areal weight. Using SE households keeps the interpolation internally consistent — a hex with more estimated households pulls more of an overlapping block group's income signal. Only populated hexes (`households > 0`) receive a value. Result is neighbor-smoothed.

> **Note:** Interpolating median incomes via weighted averaging is a known statistical approximation (averaging medians is not strictly correct). Flagged for future revision.

---

### 5b. Income Diversity Index

**What it captures:** Whether households from many different income levels coexist within a neighborhood. A high score means income is spread across many brackets — the kind of place where people at very different income levels can all find housing. A low score means the neighborhood is dominated by a single income tier, whether uniformly wealthy or uniformly low-income.

This framing deliberately avoids the problem of treating high median income as "bad." A high-income neighborhood where everyone earns similarly scores *low* on this index — not because incomes are high, but because there is no income mix. The path to a better score is creating places with housing accessible to a range of incomes, not reducing anyone's income.

Reported as part of the Demographics dimension. The column is named `income_diversity` throughout.

#### Method: Shannon entropy

The index uses the **Shannon entropy** formula, drawn from information theory and widely used in ecology and urban studies to measure diversity. Applied here, it measures how evenly households are distributed across the 11 ACS income brackets:

```
H  = −Σᵢ pᵢ × ln(pᵢ)          (sum over non-empty brackets only)
income_diversity = H / ln(11)   (normalized to 0–1)
```

where *pᵢ* = share of households in bracket *i*, and ln(11) is the maximum possible entropy when all 11 brackets have equal shares.

| Score | Meaning |
|---|---|
| **0** | All households in a single income bracket — no mix |
| **0.5** | Moderate mix; a few brackets dominate |
| **1.0** | Perfectly even spread across all 11 brackets |

**Higher is better.** Unlike the Gini coefficient, entropy is agnostic to dollar amounts — it does not matter whether the dominant bracket is high-income or low-income; a homogeneous neighborhood scores low regardless. Improvement requires increasing the representation of *under-represented* income levels, not reducing the income of over-represented ones.

#### ACS data source

**Table:** `B19001` — Household Income in the Past 12 Months (in inflation-adjusted dollars)
**Geography:** Block group, state of Utah (9-county WFRC/MAG study area)
**Vintage:** 2019–2023 ACS 5-year estimates
**Cache:** `_data/remote/demographics/bg_income_dist.gpkg`

The table provides **household counts** (not percentages) for 11 income brackets:

| ACS variable | Income bracket |
|---|---|
| `B19001_002` | Less than $10,000 |
| `B19001_003` | $10,000 to $14,999 |
| `B19001_004` | $15,000 to $24,999 |
| `B19001_005` | $25,000 to $34,999 |
| `B19001_006` | $35,000 to $49,999 |
| `B19001_007` | $50,000 to $74,999 |
| `B19001_008` | $75,000 to $99,999 |
| `B19001_009` | $100,000 to $124,999 |
| `B19001_010` | $125,000 to $149,999 |
| `B19001_011` | $150,000 to $199,999 |
| `B19001_012` | $200,000 or more |

No income midpoints are required — entropy depends only on the *shape* of the distribution (shares per bracket), not the dollar amounts.

#### Smoothing approach

Follows the project's standard principle of smoothing **inputs before applying the formula**:

1. Interpolate all 11 B19001 bin counts from block-group polygons to H3 hexes via `tidycensus::interpolate_pw()` (`extensive = TRUE` — counts, not rates), using SE 2025 household counts as the population-weight surface.
2. For the **smoothed** value: apply `smooth_by_neighbors` to each of the 11 bin counts independently, then compute entropy from the smoothed distribution. This reflects the income mix of the surrounding neighborhood, not just an average of neighboring entropy scores.
3. For the **raw** value: compute entropy directly from the interpolated (unsmoothed) bin counts for that hex alone.
4. For **L8**: aggregate the L9 bin counts to L8 by summing each bin across all ~7 L9 children, then apply the same smooth→entropy pattern.

Hexes with no households receive `NA`.

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

INCOME_BINS <- sprintf("B19001_%03d", 2:12)   # B19001_002 … B19001_012

WC_CENTER_WEIGHTS <- c(   # Edit freely to add/remove/reclassify center types
  "Metropolitan Center" = 1.0,
  "Urban Center"        = 0.8,
  ...
)
```

## Data sources

| Source | ACS/API variable | Fetch method | Cache location |
|--------|-----------------|-------------|----------------|
| WFRC SE 2025 (input) | — | Local GDB zip | `_data/wfrc_se_2025_rtp23.gdb.zip` |
| Street intersection density | — | ArcGIS REST | `_data/remote/design/` |
| WC Centers & Land Uses | — | ArcGIS REST | `_data/remote/destinations/` |
| Healthcare facilities | — | ArcGIS REST | `_data/remote/destinations/health_care.gpkg` |
| Schools (PreK–12) | — | ArcGIS REST | `_data/remote/destinations/schools.gpkg` |
| Grocery & food stores | — | ArcGIS REST | `_data/remote/destinations/grocery_stores.gpkg` |
| Community services (city halls) | — | ArcGIS REST | `_data/remote/destinations/city_halls.gpkg` |
| Parks (local + WFRC) | — | ArcGIS REST | `_data/remote/destinations/` |
| Emergency Medical Services | — | ArcGIS REST | `_data/remote/destinations/ems_stations.gpkg` |
| ACS median HH income | `B19013_001` | tidycensus | `_data/remote/demographics/bg_income.gpkg` |
| ACS income distribution (11 bins) | `B19001_002`–`B19001_012` | tidycensus | `_data/remote/demographics/bg_income_dist.gpkg` |
| 2020 Census HH weights | `H1_002N` | tidycensus | `_data/remote/demographics/blocks_2020_hh.gpkg` |
| UTA GTFS | — | download.file | `_data/remote/transit/` |
| Utah county boundaries | — | tigris | `_data/remote/boundaries/` |

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
2. Calculate all six D variables, seven Destinations sub-components, and Income Diversity Index at both H3 level 8 and level 9
3. Export `_output/wfrc_se_2025_rtp23.gdb.zip` with all original SE columns plus D variable columns
4. Export PMTiles (`_app/public/data/l9.pmtiles`, `_app/public/data/l8.pmtiles`) and `_app/public/data/metadata.json` for the web app

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
| `income_diversity_smoothed` | numeric | Income Diversity Index (Shannon entropy) 0–1 (smoothed) |
| `income_diversity_raw` | numeric | Income Diversity Index (Shannon entropy) 0–1 (raw) |
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
