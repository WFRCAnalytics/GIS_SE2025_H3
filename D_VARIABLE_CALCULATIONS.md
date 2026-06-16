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

# ACS B19001 income distribution bins (B19001_002 … B19001_012)
INCOME_BINS <- sprintf("B19001_%03d", 2:12)
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

### `flag_presence(hex_sf, features_sf)`

Returns an integer vector (same length and order as `hex_sf`) where each element is 1 if any feature in `features_sf` intersects the hex, 0 otherwise.

### `entropy_from_bins(counts)`

Computes the **Shannon entropy diversity index** for an income distribution represented as household counts in 11 discrete income brackets. Returns a value in [0, 1] normalized by the maximum possible entropy for 11 brackets.

```r
entropy_from_bins <- function(counts) {
  counts[is.na(counts) | counts < 0] <- 0
  total <- sum(counts)
  if (total == 0) return(NA_real_)
  p <- counts[counts > 0] / total
  -sum(p * log(p)) / log(length(counts))
}
```

**Algorithm:** Shannon entropy `H = −Σ pᵢ ln(pᵢ)` summed over non-empty brackets (zero-count brackets contribute 0 by convention and are excluded). Divided by `ln(11)` — the theoretical maximum when all 11 brackets are equally populated — to normalize to [0, 1].

- **0** — all households in exactly one bracket (no income diversity)
- **1** — households perfectly evenly spread across all 11 brackets (maximum diversity)
- **Higher is better.** Dollar amounts are irrelevant; only the shape of the distribution matters.

See [Income Diversity Index](#5b-income-diversity-index) for full methodology.

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
                 'Home Health Agency', 'Hospice', 'Birthing Center', 'Abortion Clinic')"
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

**Healthcare filter rationale:** An exclude-list is used instead of an allow-list because the source data contains many valid facility subtypes (e.g., "Mammography", "Personal Care Agency", specialty clinics) that are co-located with full-service medical facilities. Excluding only the clearly non-destination types (residential and home-based care) reduces false negatives from miscategorization in the source data. Included types: hospitals, urgent care, clinics, personal care agencies, specialty providers, mammography centers, and all other facility types not in the exclude list.

### Demographics

```r
# ACS 5-year median HH income at block group level — cached to bg_income.gpkg
# 2020 Census block-level occupied housing units — cached to blocks_2020_hh.gpkg
# Both fetched via tidycensus directly (not fetch_or_cache)

# ACS 5-year income distribution (11 household count bins) — cached to bg_income_dist.gpkg
bg_income_dist_path <- file.path(root, "_data/remote/demographics/bg_income_dist.gpkg")
if (!file.exists(bg_income_dist_path)) {
  bg_income_dist <- tidycensus::get_acs(
    geography = "block group",
    variables = c("B19001_001", INCOME_BINS),
    state     = "UT",
    county    = c("Box Elder", "Davis", "Weber", "Salt Lake", "Utah",
                  "Tooele", "Morgan", "Summit", "Wasatch"),
    year = 2023, output = "wide", geometry = TRUE
  ) |>
    dplyr::select(GEOID, dplyr::ends_with("E"), geometry) |>
    dplyr::rename_with(~ sub("E$", "", .x), dplyr::ends_with("E"))
  sf::write_sf(bg_income_dist, bg_income_dist_path)
} else {
  bg_income_dist <- sf::read_sf(bg_income_dist_path)
}
```

The B19001 ACS table provides household **counts** (not percentages or medians) for 11 income brackets. See [Income Diversity Index](#5b-income-diversity-index) for bracket definitions.

> **Note on geometry column name:** `sf::write_sf` writes GPKG files with the geometry column named `"geom"` (GDAL default). When reading back via `sf::read_sf`, the active geometry column retains that name. `dplyr::select()` on an sf object automatically retains the active geometry — never name the geometry column explicitly in `select()` calls, as the name may differ between fresh download and cached read.

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
| `healthcare_flag` | LicensedHealthCareFacilities | Exclude-list (6 types; see Remote Data Fetch) |
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

### 5b. Income Diversity Index

Measures whether households from many different income levels coexist within a neighborhood, using the **Shannon entropy** formula. A high score means income is spread across many brackets; a low score means one bracket dominates — regardless of whether it is a high-income or low-income bracket. This framing avoids penalizing high-income areas for being affluent; instead, it rewards the presence of housing accessible to a range of income levels.

```
H  = −Σᵢ pᵢ × ln(pᵢ)         (non-empty brackets only; 0 × ln(0) ≡ 0)
income_diversity = H / ln(11)  (normalized to 0–1)
```

**Higher is better** (score → 1 = all 11 brackets equally represented). No income midpoints are used — only the *shape* of the distribution matters. Hexes with no households → `NA`.

**ACS data source:**

- **Table:** `B19001` — Household Income in the Past 12 Months (in inflation-adjusted dollars)
- **Geography:** Block group, state of Utah (9-county WFRC/MAG study area)
- **Vintage:** 2019–2023 ACS 5-year estimates
- **Cache:** `_data/remote/demographics/bg_income_dist.gpkg`

The table provides household **counts** for 11 income brackets (`B19001_002` through `B19001_012`). See `entropy_from_bins` in [Helper Functions](#helper-functions).

**Smoothing:** Following the project's principle of smoothing *inputs* before applying the formula:

**L9 calculation:**

```r
# 1. Interpolate all 11 bin counts from block groups to H3 hexes
bg_bins <- bg_income_dist |>
  sf::st_transform(hex_crs) |>
  dplyr::select(dplyr::all_of(INCOME_BINS))

hex_income_dist <- tidycensus::interpolate_pw(
  from = bg_bins, to = se_hex, to_id = "hex_id",
  extensive = TRUE,
  weights = se_hex[, c("hex_id", "households")],
  weight_column = "households", weight_placement = "surface"
)

bin_matrix <- sf::st_drop_geometry(hex_income_dist) |>
  dplyr::select(hex_id, dplyr::all_of(INCOME_BINS)) |>
  dplyr::slice(match(hex_ids, hex_id)) |>    # explicit reindex to match hex_ids order
  dplyr::select(dplyr::all_of(INCOME_BINS)) |>
  as.matrix()

# 2. Raw value: entropy from unsmoothed bin counts
income_diversity_raw <- apply(bin_matrix, 1L, entropy_from_bins)

# 3. Smoothed value: smooth each bin independently, then compute entropy
bin_smoothed <- vapply(
  seq_len(ncol(bin_matrix)),
  function(i) smooth_by_neighbors(hex_ids, bin_matrix[, i], neighbor_index),
  numeric(length(hex_ids))
)
income_diversity <- apply(bin_smoothed, 1L, entropy_from_bins)
```

`vapply` returns an `n_hexes × 11` matrix (one column per bin); `apply(..., 1L, ...)` iterates row-wise.

**L8 calculation:** Aggregate L9 bin counts to L8 by summing each bin within each L8 parent, then apply the same smooth → entropy pattern. No second `interpolate_pw` call needed.

```r
bin_df_l8 <- as.data.frame(bin_matrix)
bin_df_l8$h8_id <- h8_ids_vec

bin_df_l8 <- bin_df_l8 |>
  dplyr::group_by(h8_id) |>
  dplyr::summarise(dplyr::across(dplyr::all_of(INCOME_BINS), sum), .groups = "drop")

bin_matrix_l8 <- bin_df_l8[match(h8_ids, bin_df_l8$h8_id), INCOME_BINS] |> as.matrix()

income_diversity_raw_l8 <- apply(bin_matrix_l8, 1L, entropy_from_bins)

bin_smoothed_l8 <- vapply(
  seq_len(ncol(bin_matrix_l8)),
  function(i) smooth_by_neighbors(h8_ids, bin_matrix_l8[, i], neighbor_index_l8),
  numeric(length(h8_ids))
)
income_diversity_l8 <- apply(bin_smoothed_l8, 1L, entropy_from_bins)
```

**App display:** `RdYlGn9` palette, `invert: false`. Green = high entropy (diverse income mix), red = low entropy (dominated by one bracket). Score range 0–1.

### 6. Distance to Transit

Nearest-neighbor distance (miles) from each hex centroid to a frequent UTA transit stop, neighbor-smoothed. Frequent = weekday median headway ≤ 15 minutes, or GTFS `route_type` 1 or 2 (heavy/commuter rail).

---

## Classification Breaks

Color classification for the web app uses **Fisher** (Fisher-Jenks natural breaks) via `classInt::classIntervals(..., style = "fisher")`. Jenks (`O(n²)`) was too slow on 66 k pooled L8+L9 values — Fisher produces equivalent breaks in a fraction of the time.

Breaks are computed pooled across both L8 and L9 values for each variable, stored in `_app/public/metadata.json`, and consumed by the app's `useData` hook. The number of break classes adapts to the number of unique quantile values in the variable (some variables in sparse areas have fewer than 9 distinct breaks).

Variables included in `metadata.json` (29 total) — the 14 D variables plus the 15 raw SE counts:
```
density, diversity, design,
destinations, destinations_center, destinations_health, destinations_school,
destinations_grocery, destinations_cityhall, destinations_park, destinations_ems,
demographics, income_diversity, transit_dist,
hhpop, households, residential_units, total_jobs,
industrial_jobs, retail_jobs, office_jobs,
jobs_accom_food, jobs_gov_edu, jobs_health, jobs_manuf,
jobs_office, jobs_other, jobs_retail, jobs_wholesale
```
D variables pool their smoothed + raw values onto one Fisher scale (so both swipe sides share a scale); raw SE counts are a single series, so their scale and histogram come from one column.

---

## Output Assembly

Two GDB layers are produced — `{GDB_NAME}_l9` (H3 level-9, ~33 k hexes) and `{GDB_NAME}_l8` (H3 level-8, ~5 k hexes).

**L8 aggregation rule:** raw SE counts (`households`, `hhpop`, `residential_units`, `total_jobs`, and every job sector) are aggregated to L8 as a **plain sum of each cell's L9 children** — no neighbor weighting — so regional totals match exactly at both resolutions (`se_count_cols` in `index.R`). The D variables, by contrast, are recomputed on the L8 grid with neighbor-weighted smoothing rather than summed from L9.

Each layer contains all original SE columns (the raw counts above) plus:

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
| `income_diversity_smoothed` / `_raw` | Income Diversity Index, 0–1 |
| `transit_dist_smoothed` / `_raw` | Distance to frequent stop, miles |

---

## PMTiles & Metadata Export

PMTiles are generated via the `freestiler` R package directly from the sf objects. The `metadata.json` file is written at the end of `index.R` with pre-computed Fisher break values for all 29 variables at both L8 and L9. Re-running `index.R` regenerates both PMTiles and metadata atomically.

---

## General Rules

- `sf::st_transform()` before every spatial operation
- `names()` inspection before every join — never assume field names
- All remote fetches wrapped in `tryCatch` with informative messages
- No `library()` calls inside functions
- Run `renv::snapshot()` after adding packages
