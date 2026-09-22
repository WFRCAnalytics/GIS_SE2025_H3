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
GDB_NAME          <- "wfrc_se_2025_rtp23"
J2H               <- 1.8      # Jobs-to-Household ratio for WFRC/MAG region
L9_HEX_AREA_SQMI  <- 0.0406   # Fixed area of H3 level-9 hex in square miles
L8_HEX_AREA_SQMI  <- 0.2847   # Fixed area of H3 level-8 hex in square miles

# Neighbor-smoothing kernels are level-specific, not shared: L9 smooths out to
# ring 3, while L8 only pulls in ring 1 (rings 2/3 weighted 0).
L9_WEIGHTS <- c(center = 0.4, ring1 = 0.3, ring2 = 0.2, ring3 = 0.1)
L8_WEIGHTS <- c(center = 0.5, ring1 = 0.5, ring2 = 0.0, ring3 = 0.0)

stopifnot(isTRUE(all.equal(sum(L9_WEIGHTS), 1)))
stopifnot(isTRUE(all.equal(sum(L8_WEIGHTS), 1)))

# ACS B19001 income distribution bins (B19001_002 … B19001_017), all 16 brackets
INCOME_BINS <- sprintf("B19001_%03d", 2:17)

# Income Diversity tier mode — "regional_tertiles" derives Low/Mid/High
# breakpoints from the data (33rd/67th percentile of regional households);
# "ami_single"/"ami_county" use a fixed INCOME_TIER_BREAKS override instead.
INCOME_TIER_MODE <- "regional_tertiles"
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

### `build_neighbor_index(hex_ids, weights)`

Returns a data frame with columns `center_id`, `member_id`, `ring`, `weight` for the k-ring neighborhood of every hex in `hex_ids`. `weights` is `L9_WEIGHTS` or `L8_WEIGHTS` — a named vector `c(center, ring1, ring2, ring3)`.

- `k` is derived automatically as the last ring with a non-zero weight (3 for `L9_WEIGHTS`, 1 for `L8_WEIGHTS`), via `h3o::grid_disk()` + `h3o::grid_distances()`
- Weights: ring 0 → `weights["center"]`; ring *n* → `weights[paste0("ring", n)] / (6 × n)` — `6 × n` is the *theoretical* size of a full ring *n* (a fixed constant), not the number of that center's neighbors actually present
- Members not present in `hex_ids` are dropped (study-area boundary) — since the per-neighbor weight is fixed rather than recomputed from the surviving count, edge cells receive less than the full ring weight instead of having it redistributed among fewer neighbors

### `smooth_by_neighbors(hex_ids, values, neighbor_index)`

Returns a numeric vector of smoothed values in the same order as `hex_ids`.

Implementation: join `values` onto `neighbor_index` by `member_id`, multiply by `weight`, aggregate with `rowsum()` grouped by `center_id`, reorder to match `hex_ids`.

### `flag_presence(hex_sf, features_sf)`

Returns an integer vector (same length and order as `hex_sf`) where each element is 1 if any feature in `features_sf` intersects the hex, 0 otherwise.

### `income_diversity_from_tiers(counts, tier_breaks)`

Computes the **3-tier min/max diversity score** for an income distribution represented as household counts in the 16 ACS B19001 brackets, grouped into Low/Mid/High tiers at the bracket indices given by `tier_breaks`.

```r
income_diversity_from_tiers <- function(counts, tier_breaks) {
  counts[is.na(counts) | counts < 0] <- 0
  if (sum(counts) == 0) return(NA_real_)
  low  <- sum(counts[seq_len(tier_breaks["low_max"])])
  mid  <- sum(counts[seq(tier_breaks["low_max"] + 1L, tier_breaks["mid_max"])])
  high <- sum(counts[seq(tier_breaks["mid_max"] + 1L, length(counts))])
  min(low, mid, high) / max(low, mid, high)
}
```

**Algorithm:** sums household counts into three tiers using `tier_breaks = c(low_max, mid_max)`, then scores `min(low, mid, high) / max(low, mid, high)`. Works directly on raw tier counts rather than shares — the shared `/total` divisor cancels out of a min/max ratio, so dividing into shares first would give an identical result.

- **0** — at least one tier has zero households (that income group has no housing in this area)
- **1** — all three tiers have equal household counts (a genuine cross-section of the region)
- Returns `NA` when total households across all 16 brackets is 0 (no data, not "no diversity")

This replaced an earlier Shannon-entropy-over-11-brackets formulation, which produced scores that clustered near the top and were hard to interpret. See [Income Diversity Index](#5b-income-diversity-index) for full methodology, including how `tier_breaks` is derived.

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

# ACS 5-year income distribution (16 household count bins) — cached to bg_income_dist.gpkg
bg_income_dist_path <- file.path(root, "_data/remote/demographics/bg_income_dist.gpkg")
if (!file.exists(bg_income_dist_path)) {
  bg_income_dist <- tidycensus::get_acs(
    geography = "block group",
    variables = c("B19001_001", INCOME_BINS),
    state     = "UT",
    county    = c("Box Elder", "Davis", "Weber", "Salt Lake", "Utah",
                  "Tooele", "Morgan", "Summit", "Wasatch", "Cache"),
    year = 2023, output = "wide", geometry = TRUE
  ) |>
    dplyr::select(GEOID, dplyr::ends_with("E"), geometry) |>
    dplyr::rename_with(~ sub("E$", "", .x), dplyr::ends_with("E"))
  sf::write_sf(bg_income_dist, bg_income_dist_path)
} else {
  bg_income_dist <- sf::read_sf(bg_income_dist_path)
}
```

The B19001 ACS table provides household **counts** (not percentages or medians) for 16 income brackets. See [Income Diversity Index](#5b-income-diversity-index) for bracket definitions.

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
density = (smoothed_residential_units + smoothed_total_jobs / J2H) / L9_HEX_AREA_SQMI   # L8 uses L8_HEX_AREA_SQMI
```

Box Elder, Tooele, Morgan, Cache, Summit, and Wasatch counties are populated via the USTM TAZ expansion (see [Areas outside the WF Model region](README.md#areas-outside-the-wf-model-region)), not excluded. A hex is `NA` only if it ends up with genuinely no real SE data — tracked in `no_se_data_hex_ids` — which today means a hex added by that expansion that still has zero TAZ overlap (e.g. a sliver right at a boundary edge). An L8 hex is `NA` if any of its L9 children lack real SE data.

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

Measures whether households from lower-, middle-, and higher-income tiers all coexist within a neighborhood, using a **3-tier min/max ratio**. A high score means all three tiers are present in roughly equal numbers; a low score means one or more tiers are scarce or absent — regardless of whether the neighborhood is uniformly high-income or uniformly low-income. This framing avoids penalizing high-income areas for being affluent; instead, it rewards the presence of housing accessible to a range of income levels.

> This replaced an earlier Shannon-entropy formulation over the raw 11-bracket distribution, which produced scores that clustered near the top of the range and were hard to interpret. Grouping into three tiers derived from the region's own income distribution gives a more legible score.

```
low, mid, high    = household counts summed into three tiers (tier_breaks below)
income_diversity  = min(low, mid, high) / max(low, mid, high)
```

**Higher is better** (score → 1 = all three tiers equally represented; score = 0 if any tier is empty). Hexes with no households → `NA`. See `income_diversity_from_tiers` in [Helper Functions](#helper-functions).

**Tier breakpoints (`income_tier_breaks`):** controlled by `INCOME_TIER_MODE`.

- **`"regional_tertiles"`** (default) — bracket indices where the *regional* cumulative household share (summed across all 16 brackets, region-wide) crosses 1/3 and 2/3. Each tier therefore represents roughly an equal share of regional households, and boundaries shift automatically if the ACS vintage changes.
- **`"ami_single"` / `"ami_county"`** — use the fixed `INCOME_TIER_BREAKS <- c(low_max, mid_max)` override instead.

```r
income_tier_breaks <- if (INCOME_TIER_MODE == "regional_tertiles") {
  regional_totals <- sf::st_drop_geometry(bg_income_dist) |>
    dplyr::summarise(dplyr::across(dplyr::all_of(INCOME_BINS), \(x) sum(x, na.rm = TRUE))) |>
    unlist()
  cum_pct <- cumsum(regional_totals) / sum(regional_totals)
  n       <- length(cum_pct)
  c(
    low_max = max(1L, min(findInterval(1/3, cum_pct), n - 2L)),
    mid_max = max(2L, min(findInterval(2/3, cum_pct), n - 1L))
  )
} else {
  INCOME_TIER_BREAKS
}
```

**ACS data source:**

- **Table:** `B19001` — Household Income in the Past 12 Months (in inflation-adjusted dollars)
- **Geography:** Block group, state of Utah (9-county WFRC/MAG study area, including Cache)
- **Vintage:** 2019–2023 ACS 5-year estimates
- **Cache:** `_data/remote/demographics/bg_income_dist.gpkg`

The table provides household **counts** for all 16 income brackets (`B19001_002` through `B19001_017`).

**Smoothing:** Following the project's principle of smoothing *inputs* before applying the formula:

**L9 calculation:**

```r
# 1. Interpolate all 16 bin counts from block groups to H3 hexes
bg_bins <- bg_income_dist |>
  sf::st_transform(hex_crs) |>
  dplyr::select(dplyr::all_of(INCOME_BINS))

hex_income_dist <- tidycensus::interpolate_pw(
  from = bg_bins, to = se_hex, to_id = "hex_id",
  extensive = TRUE,
  weights = se_hex[, c("hex_id", "hh_weight")],
  weight_column = "hh_weight", weight_placement = "surface"
)

bin_matrix <- sf::st_drop_geometry(hex_income_dist) |>
  dplyr::select(hex_id, dplyr::all_of(INCOME_BINS)) |>
  dplyr::slice(match(hex_ids, hex_id)) |>    # explicit reindex to match hex_ids order
  dplyr::select(dplyr::all_of(INCOME_BINS)) |>
  as.matrix()

# 2. Raw value: tier score from unsmoothed bin counts
income_diversity_raw <- apply(bin_matrix, 1L, income_diversity_from_tiers, tier_breaks = income_tier_breaks)

# 3. Smoothed value: smooth each bin independently, then compute the tier score
bin_smoothed <- vapply(
  seq_len(ncol(bin_matrix)),
  function(i) smooth_by_neighbors(hex_ids, bin_matrix[, i], neighbor_index),
  numeric(length(hex_ids))
)
income_diversity <- apply(bin_smoothed, 1L, income_diversity_from_tiers, tier_breaks = income_tier_breaks)
```

`vapply` returns an `n_hexes × 16` matrix (one column per bin); `apply(..., 1L, ...)` iterates row-wise.

**L8 calculation:** Aggregate L9 bin counts to L8 by summing each bin within each L8 parent, then apply the same smooth → tier-score pattern. No second `interpolate_pw` call needed.

```r
bin_df_l8 <- as.data.frame(bin_matrix)
bin_df_l8$h8_id <- h8_ids_vec

bin_df_l8 <- bin_df_l8 |>
  dplyr::group_by(h8_id) |>
  dplyr::summarise(dplyr::across(dplyr::all_of(INCOME_BINS), sum), .groups = "drop")

bin_matrix_l8 <- bin_df_l8[match(h8_ids, bin_df_l8$h8_id), INCOME_BINS] |> as.matrix()

income_diversity_raw_l8 <- apply(bin_matrix_l8, 1L, income_diversity_from_tiers, tier_breaks = income_tier_breaks)

bin_smoothed_l8 <- vapply(
  seq_len(ncol(bin_matrix_l8)),
  function(i) smooth_by_neighbors(h8_ids, bin_matrix_l8[, i], neighbor_index_l8),
  numeric(length(h8_ids))
)
income_diversity_l8 <- apply(bin_smoothed_l8, 1L, income_diversity_from_tiers, tier_breaks = income_tier_breaks)
```

**App display:** `RdYlGn9` palette, `invert: false`. Green = high diversity score (all three tiers represented), red = low score (one or more tiers scarce/absent). Score range 0–1.

### 5c. Rental Housing Attainability Index

A supplementary variable, additive alongside Demographics/Income Diversity rather than replacing them. Developed by Cascadia Partners with WFRC and UTA (Sep 2026) to give jurisdictions a more direct, policy-actionable lens on transit-supportive housing than income diversity alone: areas with more multifamily supply and less renter cost burden score higher, pointing at concrete levers (zoning reform, deed-restricted subsidy) rather than household demographics.

Two equal-weight (½ each) 0–1 components, averaged and scaled to 0–100. Both components follow the project's standard pattern: compute a hex-level **raw count** for each of the two components, **neighbor-smooth the counts** (`smooth_by_neighbors()`, same `L9_WEIGHTS`/`L8_WEIGHTS` ring weighting as every other D variable), *then* divide to get the ratio — same "smooth the inputs, then apply the formula" principle as [Income Diversity](#5b-income-diversity-index)'s bin smoothing, not a geometric buffer.

> An earlier version of Component 1 used a ¼-mile (402m) geodesic buffer around each hex centroid, later replaced with the point-in-hex + ring-smoothing approach described below. The original commit message attributed the switch to a buffer-radius discrepancy against Cascadia's draft output (complexes allegedly reached at 450–600m despite a literal 402m cutoff, flipping some hexes from ~0% to ~99% MF share) — but `buffer-mf-share.R`, a standalone script added later to check this independently against Cascadia's own live numbers, found no such discrepancy: a correctly-computed (s2/geodesic) 402m buffer reproduces their published MF-share values almost exactly (r = 0.997, 95% of hexes within 5%). That original bug narrative should be treated as unconfirmed. The actual reason to prefer point-in-hex + ring smoothing here is architectural consistency — it reuses the project's already-established neighbor-smoothing mechanism (the same "smooth the inputs, then apply the formula" pattern as every other D variable) instead of introducing a second, differently-shaped geographic operator, not a demonstrated correctness fix.

**Component 1 — Multifamily share:** WFRC Housing Unit Inventory (HUI), a parcel-level point dataset (`TYPE` = `multi_family` / `single_family`, `UNIT_COUNT`). Raw = HUI units whose point falls inside that hex's own polygon (point-in-polygon, no buffer).

```r
hui_units_by_hex <- function(hex_sf, hui_sf) {
  sf::st_join(hex_sf["hex_id"], sf::st_transform(hui_sf, sf::st_crs(hex_sf))) |>
    sf::st_drop_geometry() |>
    dplyr::group_by(hex_id) |>
    dplyr::summarise(
      mf_units_raw    = sum(UNIT_COUNT[is_mf],    na.rm = TRUE),
      total_units_raw = sum(UNIT_COUNT, na.rm = TRUE),
      .groups         = "drop"
    )
}

# Raw ratio (0 units in the hex -> NA, not 0)
attain_mf_share_raw <- dplyr::if_else(total_units_raw > 0, mf_units_raw / total_units_raw, NA_real_)

# Smooth the counts, then divide
mf_units_smoothed    <- smooth_by_neighbors(hex_ids, mf_units_raw,    neighbor_index)
total_units_smoothed <- smooth_by_neighbors(hex_ids, total_units_raw, neighbor_index)
attain_mf_share <- dplyr::if_else(total_units_smoothed > 0, mf_units_smoothed / total_units_smoothed, NA_real_)
```

- **Source:** WFRC HUI FeatureServer (`hui_for_web2_gdb/FeatureServer/1`), fetched with `fields = c("TYPE", "UNIT_COUNT")` and pre-filtered by `COUNTY` to the region, since it's a ~645k-record statewide dataset
- **Cache:** `_data/remote/demographics/hui.gpkg`
- **Coverage note:** HUI has no records for Cache County — hexes there receive `NA` once smoothing has pulled in every neighbor and still found nothing, consistent with the project's "no data ≠ zero" convention

**Component 2 — Renter affordability:** ACS `B25070` (gross rent as % of household income), tract level. `renter_under30_count` = sum of "<10%" through "25.0–29.9%" categories; `renter_denom_count` = total renter HH − "not computed". Both counts are interpolated from tract polygons to hexes (household-weighted areal interpolation, identical `interpolate_pw()` pattern to the Income Diversity bin interpolation) rather than a hard "hex inherits its containing tract's value" lookup — a hex fully inside one tract recovers that tract's exact ratio (re-verified directly against `_output/wfrc_se_2025_rtp23.gpkg`: max floating-point diff `2.220446e-16` across hexes fully contained in one tract; the hex count itself shifts run to run as the expansion counties grow, so treat any specific count here as a snapshot, not a fixed fact), while a hex straddling two tracts gets a genuine household-weighted blend instead of an arbitrary single-tract pick.

```r
renter_burden_counts_to_hex <- function(hex_sf, tract_sf) {
  interp <- tidycensus::interpolate_pw(
    from = sf::st_transform(tract_sf[, c("renter_under30_count", "renter_denom_count")], sf::st_crs(hex_sf)),
    to = hex_sf, to_id = "hex_id", extensive = TRUE,
    weights = hex_sf[, c("hex_id", "hh_weight")],
    weight_column = "hh_weight", weight_placement = "surface"
  )
  sf::st_drop_geometry(interp) |> dplyr::select(hex_id, renter_under30_count, renter_denom_count)
}

attain_renter_afford_raw <- dplyr::if_else(renter_denom_count > 0, renter_under30_count / renter_denom_count, NA_real_)

renter_num_smoothed <- smooth_by_neighbors(hex_ids, renter_under30_count, neighbor_index)
renter_den_smoothed <- smooth_by_neighbors(hex_ids, renter_denom_count,   neighbor_index)
attain_renter_afford <- dplyr::if_else(renter_den_smoothed > 0, renter_num_smoothed / renter_den_smoothed, NA_real_)
```

- **Table:** `B25070` — Gross Rent as a Percentage of Household Income in the Past 12 Months
- **Geography:** Census tract, 9-county WFRC/MAG study area
- **Vintage:** 2019–2023 ACS 5-year estimates, fetched directly via `tidycensus::get_acs()` — not Esri Living Atlas, per UTA/WFRC agreement, to keep the region's demographic pulls on one consistent data path
- **Cache:** `_data/remote/demographics/tract_renter_burden.gpkg`

**Index:**

```r
attainability_index_raw <- (attain_mf_share_raw + attain_renter_afford_raw) / 2 * 100
attainability_index     <- (attain_mf_share + attain_renter_afford) / 2 * 100
```

`NA` in either component propagates to `NA` for the index — no partial-credit averaging. Computed independently at L8 (against L8 hex geometry, same pattern as Design/Destinations) and L9, not aggregated from L9 to L8.

### 6. Distance to Transit

Nearest-neighbor distance (miles) from each hex centroid to a frequent UTA transit stop, neighbor-smoothed. Frequent = weekday median headway ≤ 15 minutes, or GTFS `route_type` 1 or 2 (heavy/commuter rail).

---

## Classification Breaks

Color classification for the web app uses **Fisher** (Fisher-Jenks natural breaks) via `classInt::classIntervals(..., style = "fisher")`. Jenks (`O(n²)`) was too slow on 66 k pooled L8+L9 values — Fisher produces equivalent breaks in a fraction of the time.

Breaks are computed pooled across both L8 and L9 values for each variable, stored in `_app/public/metadata.json`, and consumed by the app's `useData` hook. The number of break classes adapts to the number of unique quantile values in the variable (some variables in sparse areas have fewer than 9 distinct breaks).

Variables included in `metadata.json` (32 total) — the 17 D variables (the original 14 plus the 3 Attainability Index columns, all smoothed/raw paired) and the 15 raw SE counts:
```
density, diversity, design,
destinations, destinations_center, destinations_health, destinations_school,
destinations_grocery, destinations_cityhall, destinations_park, destinations_ems,
demographics, income_diversity, transit_dist,
attain_mf_share, attain_renter_afford, attainability_index,
hhpop, households, residential_units, total_jobs,
industrial_jobs, retail_jobs, office_jobs,
jobs_accom_food, jobs_gov_edu, jobs_health, jobs_manuf,
jobs_office, jobs_other, jobs_retail, jobs_wholesale
```
D variables (including the Attainability Index columns) pool their smoothed + raw values onto one Fisher scale (so both swipe sides share a scale); raw SE counts are each a single series (no smoothed/raw pair), so their scale and histogram come from one column.

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
| `attain_mf_share_smoothed` / `_raw` | Multifamily share of HUI units in the hex, 0–1 |
| `attain_renter_afford_smoothed` / `_raw` | Renter share paying <30% income on rent (B25070), 0–1 |
| `attainability_index_smoothed` / `_raw` | Rental Housing Attainability Index, 0–100 |

---

## PMTiles & Metadata Export

PMTiles are generated via the `freestiler` R package directly from the sf objects. The `metadata.json` file is written at the end of `index.R` with pre-computed Fisher break values for all 32 variables (see [Classification Breaks](#classification-breaks)) at both L8 and L9. Re-running `index.R` regenerates both PMTiles and metadata atomically.

---

## General Rules

- `sf::st_transform()` before every spatial operation
- `names()` inspection before every join — never assume field names
- All remote fetches wrapped in `tryCatch` with informative messages
- No `library()` calls inside functions
- Run `renv::snapshot()` after adding packages
