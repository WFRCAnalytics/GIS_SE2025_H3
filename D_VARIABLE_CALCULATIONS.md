# Urban Form D Variables — Methodology & Pipeline Reference

Documents the calculation methodology for all D variables produced by `index.R`. Kept in sync with the script; if the script and this document disagree, the script is authoritative.

---

## Script Structure

```
1. Parameters
2. Libraries
3. Helper functions
4. Remote data fetch & cache
5. SE data import
6. Neighbor index build
7. D variable calculations (one section per variable)
8. L9 output assembly
9. L8 aggregation & calculations
10. PMTiles + metadata export
```

Section headers in the script use `# ── Section Name ──────────────────────────────────────` style comments.

---

## Parameters

```r
GDB_NAME      <- "wfrc_se_2025_rtp23"
J2H           <- 1.8      # Jobs-to-Household ratio for WFRC/MAG region
HEX_AREA_SQMI <- 0.0406   # Fixed area of H3 level-9 hex in square miles

CENTER_WEIGHT <- 0.4
RING1_WEIGHT  <- 0.3
RING2_WEIGHT  <- 0.2
RING3_WEIGHT  <- 0.1

stopifnot(isTRUE(all.equal(CENTER_WEIGHT + RING1_WEIGHT + RING2_WEIGHT + RING3_WEIGHT, 1)))
```

---

## Helper Functions

### `fetch_or_cache(url, cache_path, layer = NULL, where = NULL)`

Downloads a FeatureServer layer once and caches it as a full, unfiltered `.gpkg`. On subsequent runs, reads from cache. An optional `where` SQL clause is applied at read time via GDAL push-down — the cached file is never filtered, so the `where` argument can be changed without re-downloading.

```r
fetch_or_cache <- function(url, cache_path, layer = NULL, where = NULL) {
  full_path <- file.path(root, cache_path)
  if (!file.exists(full_path)) {
    dir.create(dirname(full_path), recursive = TRUE, showWarnings = FALSE)
    data <- tryCatch(
      arcgislayers::arc_select(arcgislayers::arc_open(url)),
      error = function(e) stop("Failed to fetch '", cache_path, "': ", conditionMessage(e))
    )
    if (is.na(sf::st_crs(data))) sf::st_crs(data) <- 4326L
    sf::write_sf(data, full_path, driver = "GPKG")
  }
  if (is.null(where)) {
    if (is.null(layer)) sf::read_sf(full_path) else sf::read_sf(full_path, layer = layer)
  } else {
    lyr <- if (is.null(layer)) sf::st_layers(full_path)$name[[1L]] else layer
    sf::read_sf(full_path, query = sprintf('SELECT * FROM "%s" WHERE %s', lyr, where))
  }
}
```

**Key design decisions:**
- `url` is the bare FeatureServer layer URL — `arcgislayers` handles pagination automatically.
- The cache always stores the complete dataset. Filters are pushed to the SQL query at read time, not baked into the cache, so they are cheap to change.
- Passing `layer = NULL` explicitly would crash `sf::read_sf` (triggers `enc2utf8(layer)`) — always branch on `is.null(layer)`.

### `build_neighbor_index(hex_ids, k = 3)`

Returns a data frame with columns `center_id`, `member_id`, `ring`, `weight` for the k-ring neighborhood of every hex in `hex_ids`.

- Uses `h3o::grid_disk()` + `h3o::grid_distances()` with `k = 3`
- Weights: ring 0 → `CENTER_WEIGHT`; ring *n* → `RING_n_WEIGHT / count_of_ring_n_neighbors_for_that_center`
- Per-ring neighbor counts are computed per center cell — edge cells have fewer neighbors
- Members not present in `hex_ids` are dropped (study-area boundary)

### `smooth_by_neighbors(hex_ids, values, neighbor_index)`

Returns a numeric vector of smoothed values in the same order as `hex_ids`.

Implementation: join `values` onto `neighbor_index` by `member_id`, multiply by `weight`, aggregate with `rowsum()` grouped by `center_id`, reorder to match `hex_ids`.

---

## Remote Data Fetch & Cache

All source-level filters use SQL `WHERE` clauses in `fetch_or_cache(..., where = ...)`. The cached `.gpkg` files are always full and unfiltered.

### Design

```r
intersection_hex <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/Street_Intersection_Density_2025/FeatureServer/3",
  cache_path = "_data/remote/design/intersection_hex.gpkg"
)
```

### Destinations

```r
center_boundaries <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/ArcGIS/rest/services/WCV_Centers_and_Regional_Land_Uses/FeatureServer/0",
  cache_path = "_data/remote/destinations/center_boundaries.gpkg"
)

# Exclude residential/home-based care types not relevant to urban accessibility
health_care <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/LicensedHealthCareFacilities/FeatureServer/0",
  cache_path = "_data/remote/destinations/health_care.gpkg",
  where      = "LICENSE_TYPE NOT IN ('Assisted Living Facility - Type I', 'Assisted Living Facility - Type II',
                 'Personal Care Agency', 'Home Health Agency', 'Hospice', 'Birthing Center', 'Abortion Clinic')"
)

schools <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/Schools_PreKto12/FeatureServer/0",
  cache_path = "_data/remote/destinations/schools.gpkg",
  where      = "SchoolLevel LIKE '%high%'"
)

grocery_stores <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/UtahGroceryAndFoodStores_DAF/FeatureServer/0",
  cache_path = "_data/remote/destinations/grocery_stores.gpkg",
  where      = "TYPE IN ('Grocery Store', 'Specialty Grocery', 'Supermarket')"
)

city_halls <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/CommunityServices_gdb/FeatureServer/0",
  cache_path = "_data/remote/destinations/city_halls.gpkg",
  where      = "Facility LIKE '%City Hall%' OR Facility LIKE '%County Office%'"
)

parks_local <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/UtahParksLocal/FeatureServer/0",
  cache_path = "_data/remote/destinations/parks_local.gpkg"
)

parks_wfrc <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/AccessToParks_082024_gdb/FeatureServer/2",
  cache_path = "_data/remote/destinations/parks_wfrc.gpkg"
)

# Exclude prison and military-base stations (not civilian destinations)
ems_stations <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/EmergencyMedicalServices/FeatureServer/0",
  cache_path = "_data/remote/destinations/ems_stations.gpkg",
  where      = "NAME NOT LIKE '%PRISON%' AND NAME NOT LIKE '%-DOD'"
)
```

**Healthcare filter rationale:** An exclude-list is used instead of an allow-list because the source data contains many valid facility subtypes (e.g. "Mammography") that are co-located with full-service clinics. Excluding only the clearly non-destination types (residential care, home-based services) reduces false negatives from miscategorization in the source data.

### Demographics

```r
# ACS 5-year median HH income at block group level — cached to bg_income.gpkg
# 2020 Census block-level occupied housing units — cached to blocks_2020_hh.gpkg
# Both fetched via tidycensus directly (not fetch_or_cache)
```

### Transit

```r
# UTA GTFS downloaded to _data/remote/transit/GTFS.zip, unzipped to gtfs/
# Wrapped in file.exists() check — re-runs skip download
```

### County Boundaries

```r
utah_counties <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahCountyBoundaries/FeatureServer/0",
  cache_path = "_data/remote/boundaries/utah_counties.gpkg"
)
```

---

## D Variable Calculations

> Before any spatial join: `sf::st_transform()` to align CRS. Inspect `names()` before joining — never assume field names.

### 1. Density

```
density = (smoothed_residential_units + smoothed_total_jobs / J2H) / HEX_AREA_SQMI
```

Hexes in Tooele, Morgan, Summit, and Wasatch counties are set to `NA` — pending methodology guidance for those areas.

### 2. Diversity

```
hh_s      = smooth_by_neighbors(households)
emp_s     = smooth_by_neighbors(total_jobs)
hw        = hh_s × J2H
diversity = ifelse(hw == 0 | emp_s == 0, NA, pmin(hw, emp_s) / pmax(hw, emp_s))
```

Pure residential (emp = 0) → 0. Pure employment (hh = 0) → 0. Genuinely empty (both 0) → `NA`.

### 3. Design

IntScore from the WFRC Street Intersection Density 2025 layer (FeatureServer/3, which already has hex-level aggregates) is joined to `se_hex` by `hex_id` and neighbor-smoothed. Hexes with no match → `NA`.

### 4. Destinations

**Step 1 — WC Center score (wc_score):**

```
wc_score = sum(intersection_area / hex_area × tier_weight) per hex, capped at 1.0
```

| Center type | Weight |
|---|---|
| Metropolitan Center | 1.0 |
| Urban Center | 0.8 |
| City Center | 0.6 |
| Neighborhood Center | 0.4 |
| Employment District | 0.2 |
| Retail District | 0.2 |
| Education District | 0.2 |
| Special District | 0.0 |
| Industrial District | 0.0 |

**Step 2 — Amenity presence flags:**

Each flag is 1 if ≥1 qualifying feature intersects the hex centroid or polygon, 0 otherwise.

| Flag | Source | Filter applied at read |
|---|---|---|
| `healthcare_flag` | LicensedHealthCareFacilities | Exclude-list (see above) |
| `highschool_flag` | Schools_PreKto12 | `SchoolLevel LIKE '%high%'` |
| `grocery_flag` | UtahGroceryAndFoodStores_DAF | `TYPE IN (...)` |
| `cityhall_flag` | CommunityServices_gdb | `Facility LIKE '%City Hall%' OR ...` |
| `park_flag` | UtahParksLocal ∪ AccessToParks | none |
| `ems_flag` | EmergencyMedicalServices | Exclude prison/DOD |

**Step 3 — Composite:**

```
amenity_score    = (healthcare_flag + highschool_flag + grocery_flag +
                    cityhall_flag + park_flag + ems_flag) / 6
raw_destinations = 0.6 × wc_score + 0.4 × amenity_score
destinations     = smooth_by_neighbors(raw_destinations)
```

**Sub-components:** each flag/score is also smoothed independently and stored as its own column pair (`destinations_<type>_smoothed` / `_raw`) for per-amenity drill-down.

### 5. Demographics

ACS 5-year median household income (B19013_001, 2023) interpolated from block-group polygons to H3 hexes via `tidycensus::interpolate_pw()` using SE 2025 household counts as areal weights. Only hexes with `households > 0` receive a value. Result is neighbor-smoothed.

> Interpolating median incomes via weighted averaging is statistically imperfect (averaging medians). Flagged for future revision.

### 6. Distance to Transit

Nearest-neighbor distance (miles) from each hex centroid to a frequent UTA transit stop, neighbor-smoothed. Frequent = weekday median headway ≤ 15 minutes, or GTFS `route_type` 1 or 2 (heavy/commuter rail).

---

## Classification Breaks

Color classification for the web app uses **Fisher** (Fisher-Jenks natural breaks) via `classInt::classIntervals(..., style = "fisher")`. Jenks (`O(n²)`) was too slow on 66 k pooled L8+L9 values — Fisher produces equivalent breaks in a fraction of the time.

Breaks are computed pooled across both L8 and L9 values for each variable, stored in `_app/public/metadata.json`, and consumed by the app's `useData` hook. The number of break classes adapts to the number of unique quantile values in the variable (some variables in sparse areas have fewer than 9 distinct breaks).

Variables included in `metadata.json`:
```
density, diversity, design,
destinations, destinations_center, destinations_health, destinations_school,
destinations_grocery, destinations_cityhall, destinations_park, destinations_ems,
demographics, transit_dist
```

---

## Output Assembly

Two GDB layers are produced — `{GDB_NAME}_l9` (H3 level-9, ~66 k hexes) and `{GDB_NAME}_l8` (H3 level-8, ~9.5 k hexes).

Each layer contains all original SE columns plus:

| Column pattern | Description |
|---|---|
| `density_smoothed` / `_raw` | Persons + jobs per sq mi |
| `diversity_smoothed` / `_raw` | HH–job balance ratio 0–1 |
| `design_smoothed` / `_raw` | Street intersection score |
| `destinations_smoothed` / `_raw` | Composite destination score 0–1 |
| `destinations_center_smoothed` / `_raw` | WC center area-overlap score 0–1 |
| `destinations_health_smoothed` / `_raw` | Healthcare flag (smoothed / raw) |
| `destinations_school_smoothed` / `_raw` | High school flag |
| `destinations_grocery_smoothed` / `_raw` | Grocery flag |
| `destinations_cityhall_smoothed` / `_raw` | City hall / county office flag |
| `destinations_park_smoothed` / `_raw` | Park flag |
| `destinations_ems_smoothed` / `_raw` | EMS station flag |
| `demographics_smoothed` / `_raw` | Median HH income, $ |
| `transit_dist_smoothed` / `_raw` | Distance to frequent stop, miles |

---

## PMTiles & Metadata Export

PMTiles are generated via the `freestiler` R package directly from the sf objects. The `metadata.json` file is written at the end of `index.R` with pre-computed Fisher break values for all 13 variables at both L8 and L9. Re-running `index.R` regenerates both PMTiles and metadata atomically.

---

## General Rules

- `sf::st_transform()` before every spatial operation
- `names()` inspection before every join — never assume field names
- All remote fetches wrapped in `tryCatch` with informative messages
- No `library()` calls inside functions
- Run `renv::snapshot()` after adding packages
