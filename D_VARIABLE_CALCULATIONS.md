# Claude Code Instructions: Urban Form D Variables

Refactor `index.R` to calculate 6 urban form D variables (Density, Diversity, Design, Destinations, Demographics, Distance to Transit) for H3 level-9 hexagons, with neighbor-weighted smoothing embedded into each variable's input calculation.

---

## Context

The project works with WFRC SE 2025 data in H3 level-9 hexagons stored in `_data/wfrc_se_2025_rtp23.gdb.zip`. The current `index.R` smooths raw SE data; this needs to be replaced entirely with D variable calculations where smoothing is embedded into each variable's inputs.

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
8. Assemble output
9. Export
```

Use `# ── Section Name ───────────────────────────────────────────────────────` header comments before each major section.

---

## Parameters

Place at the very top of the script:

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

### `fetch_or_cache(url, cache_path, layer = NULL)`

- If `cache_path` exists, read and return it via `sf::read_sf()`
- Otherwise fetch via `arcgislayers::arc_select(arcgislayers::arc_open(url))`, write to `cache_path` as `.gpkg`, return the data
- `url` must be the bare FeatureServer layer URL (no `/query?...` suffix) — `arcgislayers` handles pagination and attribute fetching automatically
- Create parent directories with `dir.create(..., recursive = TRUE, showWarnings = FALSE)` if needed
- Wrap fetch in `tryCatch` with an informative error message

### `build_neighbor_index(hex_ids, k = 3)`

- Takes a character vector of hex IDs
- Uses `h3o::h3_from_strings()`, `h3o::grid_disk()`, `h3o::grid_distances()` with `k = 3`
- Returns a data frame with columns: `center_id`, `member_id`, `ring`, `weight`
- Weights:
  - ring 0 → `CENTER_WEIGHT`
  - ring 1 → `RING1_WEIGHT / n_ring1_neighbors`
  - ring 2 → `RING2_WEIGHT / n_ring2_neighbors`
  - ring 3 → `RING3_WEIGHT / n_ring3_neighbors`
- Per-ring neighbor counts must be computed per center cell (edge cells have fewer neighbors than interior cells)
- Drop any `member_id` values not present in `hex_ids`

### `smooth_by_neighbors(hex_ids, values, neighbor_index)`

- Takes a character vector `hex_ids`, numeric vector `values` (same length), and the neighbor index data frame
- Returns a numeric vector of smoothed values in the same order as input `hex_ids`
- Implementation: join values onto neighbor index by `member_id`, multiply by `weight`, aggregate with `rowsum()` grouped by `center_id`, reorder result to match input `hex_ids`

---

## Remote Data Fetch & Cache

Fetch and cache all remote sources before any calculations. All cache paths are relative to `here::here()`.

### Design

```r
intersection_hex <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/Street_Intersection_Density_2025/FeatureServer/3/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/design/intersection_hex.gpkg"
)
```

### Destinations

```r
center_boundaries <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/ArcGIS/rest/services/WCV_Centers_and_Regional_Land_Uses/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/destinations/center_boundaries.gpkg"
)
health_care <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/LicensedHealthCareFacilities/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/destinations/health_care.gpkg"
)
schools <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/Schools_PreKto12/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/destinations/schools.gpkg"
)
grocery_stores <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/UtahGroceryAndFoodStores_DAF/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/destinations/grocery_stores.gpkg"
)
city_halls <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/CommunityServices_gdb/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/destinations/city_halls.gpkg"
)
parks_local <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/UtahParksLocal/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/destinations/parks_local.gpkg"
)
parks_wfrc <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/AccessToParks_082024_gdb/FeatureServer/2/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/destinations/parks_wfrc.gpkg"
)
```

### Demographics

Use `tidycensus` directly — do not use `fetch_or_cache` for these:

```r
# 1. ACS 5-year median HH income at block group level (tidy format):
#    variable = "B19013_001", geography = "block group", state = "UT",
#    geometry = TRUE, most recent available year
#    Cache to _data/remote/demographics/bg_income.gpkg

# 2. 2020 Census block-level occupied housing units as interpolation weights:
#    variable = "H1_002N", geography = "block", state = "UT",
#    year = 2020, geometry = TRUE (PL 94-171 default sumfile — H1_002N lives there)
#    Cache to _data/remote/demographics/blocks_2020_hh.gpkg
```

### Transit

```r
# Download https://gtfsfeed.rideuta.com/GTFS.zip to
# _data/remote/transit/GTFS.zip if not already cached
# Unzip to _data/remote/transit/gtfs/
# Use download.file() + unzip(), wrapped in a file.exists() check
```

### County Boundaries (for Density NA flagging)

```r
utah_counties <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/UtahCountyBoundaries/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",
  cache_path = "_data/remote/boundaries/utah_counties.gpkg"
)
```

---

## D Variable Calculations

> **Before any spatial join:** always call `sf::st_transform()` to align CRS. Never assume CRS matches. Always inspect field names with `names()` before joining — do not assume field names match what is documented here.

### 1. Density

```r
# Smooth residential_units and total_jobs via smooth_by_neighbors(), then combine:
# density <- (smoothed_residential_units + smoothed_total_jobs / J2H) / HEX_AREA_SQMI
#
# Identify hexes in Tooele Valley, Morgan, Summit, and Wasatch counties
# via spatial join against utah_counties. Set their density values to NA.
# TODO: pending TBD methodology for these areas per supervisor guidance.
```

### 2. Diversity

```r
# Smooth households and total_jobs independently, then apply formula:
# hh_s  <- smooth_by_neighbors(hex_ids, households, neighbor_index)
# emp_s <- smooth_by_neighbors(hex_ids, total_jobs, neighbor_index)
# hw    <- hh_s * J2H
# diversity <- ifelse(hw == 0 | emp_s == 0, NA, pmin(hw, emp_s) / pmax(hw, emp_s))
```

### 3. Design

```r
# The intersection_hex layer has a hex_id field of unknown type/format.
# Before joining:
#   1. Inspect class and sample values of intersection_hex$hex_id
#   2. Inspect class and sample values of se_hex$hex_id
#   3. Determine join strategy:
#      - If both are H3 strings of same format → direct join on hex_id
#      - If types differ (e.g. integer vs string) → attempt coercion and verify
#      - If IDs do not correspond → fall back to spatial join
#   4. Document the finding in a comment above the join
#
# After joining IntScore to se_hex:
# design <- smooth_by_neighbors(hex_ids, IntScore, neighbor_index)
# Hexes with no match from the join → NA
```

### 4. Destinations

```r
# Step 1: WC Center score
# - Intersect se_hex with center_boundaries (align CRS first)
# - Assign center tier weights:
#     Metropolitan Center = 1.0
#     Urban Center        = 0.8
#     City Center         = 0.6
#     Neighborhood Center = 0.4
#     Employment District = 0.2
#     Retail District     = 0.2
#     Education District  = 0.2
#     Special District    = 0.0  (excluded)
#     Industrial District = 0.0  (excluded)
# - wc_score = sum(intersection_area / hex_area * tier_weight) per hex
# - Cap wc_score at 1.0

# Step 2: Amenity presence score
# For each amenity layer, create a binary flag per hex (1 if >=1 feature present)
# Apply filters before spatial join:
#   schools:       inspect field names, keep only high schools
#   grocery_stores: filter TYPE %in% c("Grocery Store","Specialty Grocery","Supermarket")
#   city_halls:    filter Facility field containing "City Hall" or "County Office"
#
# amenity_score = mean(c(healthcare, high_school, grocery, city_hall, park))
# Each component is 0 or 1, so amenity_score ranges 0–1

# Step 3: Combine and smooth
# raw_destinations = 0.6 * wc_score + 0.4 * amenity_score
# destinations <- smooth_by_neighbors(hex_ids, raw_destinations, neighbor_index)
```

### 5. Demographics

```r
# Use tidycensus::interpolate_pw() to perform population-weighted interpolation
# from BG geographies to H3 hexes:
#   from             = bg_income (ACS BG polygons with estimate column)
#   to               = se_hex
#   to_id            = "hex_id"
#   extensive        = FALSE  (income is intensive — an average, not a count)
#   weights          = blocks_hh (2020 Census blocks with H1_002N occupied HH)
#   weight_column    = "value"
#   weight_placement = "surface"
#
# Only populate for hexes where households > 0 (from SE data); others → NA.
# H3 household count acts as a populated-area mask.
#
# demographics <- smooth_by_neighbors(hex_ids, demographics_raw, neighbor_index)
#
# NOTE: interpolate_pw() on median incomes is statistically imperfect
# (averaging medians). Flagged by supervisor for future revision.
```

### 6. Distance to Transit

```r
# 1. Read from cached GTFS: stop_times.txt, trips.txt, routes.txt, calendar.txt, stops.txt
# 2. Identify weekday service IDs from calendar (monday == 1)
# 3. Filter trips to weekday service IDs
# 4. Join trips → stop_times, then join routes to get route_type per stop arrival
# 5. For each stop_id, compute median headway on a typical weekday:
#    - Sort arrivals by stop_id and arrival_time
#    - diff() consecutive arrivals within each stop_id group
#    - Convert to minutes, take median
# 6. Classify frequent stops as: median_headway <= 15 OR route_type == 2 (CRT)
# 7. Read stops.txt, filter to frequent stop_ids
#    Create sf point layer: st_as_sf(coords = c("stop_lon","stop_lat"), crs = 4326)
#    Transform to se_hex CRS
# 8. Compute hex centroid → nearest frequent stop distance:
#    centroids <- sf::st_centroid(se_hex)
#    dist_matrix <- sf::st_distance(centroids, frequent_stops)
#    transit_dist_raw <- as.numeric(dist_matrix[cbind(seq_len(nrow(se_hex)), apply(dist_matrix, 1, which.min))]) / 1609.34
# 9. transit_dist <- smooth_by_neighbors(hex_ids, transit_dist_raw, neighbor_index)
```

---

## Output Assembly

Attach all D variables to `se_hex` as new columns. Do not modify any original SE columns:

```r
se_hex$density      <- density
se_hex$diversity    <- diversity
se_hex$design       <- design
se_hex$destinations <- destinations
se_hex$demographics <- demographics
se_hex$transit_dist <- transit_dist
```

---

## Visualization

Keep the existing `mapgl` comparison map block but update it to compare `diversity` from `se_hex` (raw smoothed inputs) vs a version with `CENTER_WEIGHT = 1` (no neighbor influence) as a sanity check. If this is too complex, simply display `diversity` on a single `maplibre_view()` map.

---

## Export

```r
# _output/{GDB_NAME}.gdb.zip contains a single layer: GDB_NAME
# (se_hex with all original SE columns + 7 D variable columns appended)
# Remove the old "_smoothed" layer — it is no longer needed

if (!dir.exists(file.path(root, "_output"))) dir.create(file.path(root, "_output"))

gdb_path <- file.path(root, "_output", paste0(GDB_NAME, ".gdb"))
zip_path <- file.path(root, "_output", paste0(GDB_NAME, ".gdb.zip"))

se_hex |>
  sf::write_sf(gdb_path, layer = GDB_NAME, driver = "OpenFileGDB", append = FALSE)

zip(zip_path, files = gdb_path, flags = "-r9X")
unlink(gdb_path, recursive = TRUE)
```

---

## General Rules

- Use `sf::st_transform()` to align CRS before **every** spatial operation
- Inspect field names with `names()` before every join — never assume field names
- For any FeatureServer that may exceed 2000 records, paginate via `resultOffset` / `resultRecordCount`
- Wrap all remote fetches in `tryCatch` with informative messages
- Add inline comments explaining non-obvious methodology decisions
- Do not use `library()` calls inside functions — keep all library calls at the top of the script
- Run `renv::snapshot()` after adding any new packages
