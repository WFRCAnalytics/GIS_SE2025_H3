# Computes the six urban-form D variables (Density, Diversity, Design,
# Destinations, Demographics, Distance to Transit) for the WFRC/MAG region
# at H3 levels 9 and 8. Full methodology: D_VARIABLE_CALCULATIONS.md.
#
# Flow: fetch/cache remote data -> import SE 2025 -> expand the hex grid
# into Tooele/Box Elder areas with real USTM TAZ data -> compute L9 D
# variables -> aggregate to L8 and recompute there -> export gdb/pmtiles.

# ── Parameters ────────────────────────────────────────────────────────────────

GDB_NAME          <- "wfrc_se_2025_rtp23"
J2H               <- 1.8      # Jobs-to-Household ratio for WFRC/MAG region
L9_HEX_AREA_SQMI  <- 0.0406   # Fixed area of H3 level-9 hex in square miles
L8_HEX_AREA_SQMI  <- 0.2847   # Fixed area of H3 level-8 hex in square miles

L9_WEIGHTS <- c(center = 0.4, ring1 = 0.3, ring2 = 0.2, ring3 = 0.1)
L8_WEIGHTS <- c(center = 0.5, ring1 = 0.5, ring2 = 0.0, ring3 = 0.0)
stopifnot(isTRUE(all.equal(sum(L9_WEIGHTS), 1)))
stopifnot(isTRUE(all.equal(sum(L8_WEIGHTS), 1)))

# Edit rows to add, remove, or reclassify center types for the Destinations score
WC_CENTER_WEIGHTS <- c(
  "Metropolitan Center" = 1.0,
  "Urban Center"        = 0.8,
  "City Center"         = 0.6,
  "Neighborhood Center" = 0.4,
  "Employment District" = 0.2,
  "Retail District"     = 0.2,
  "Education District"  = 0.2,
  "Special District"    = 0.0,
  "Industrial District" = 0.0
)

# Income Diversity Index: B19001 income brackets (B19001_002 … B19001_017), all 16 brackets
INCOME_BINS <- sprintf("B19001_%03d", 2:17)

# Dollar lower bounds (in $k) for each of the 16 brackets — used only for reporting.
# Last bracket ($200k+) has no upper bound; represented as NA.
INCOME_BIN_LOWER_K <- c(0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 100, 125, 150, 200)

# Income tier mode for the 3-tier min/max diversity score:
#   "regional_tertiles" — Low/Mid/High boundaries at regional 33rd/67th percentile (derived from data)
#   "ami_single"        — set INCOME_TIER_BREAKS below to fixed bracket indices for one regional AMI
#   "ami_county"        — set INCOME_TIER_BREAKS below to fixed bracket indices for county-level AMI
INCOME_TIER_MODE <- "regional_tertiles"

# Explicit bracket-index override (1–11) used when INCOME_TIER_MODE != "regional_tertiles".
# Example: Low = bins 1–4 (<$25k), Mid = bins 5–8 ($25k–$50k), High = bins 9–11 ($50k–$75k)
# INCOME_TIER_BREAKS <- c(low_max = 4L, mid_max = 8L)

# Areas to add to the hex grid, each scoped to a RegionalBoundaryComponents
# polygon rather than the full county (Tooele alone would polyfill to ~168k
# L9 hexes of empty desert). Morgan is excluded — its RPO boundary is ~the
# whole county, so there's no useful trim. `taz_se_sources` are real USTM SE
# 2025 files, area-interpolated onto these hexes below.
#
# All three Box Elder boundaries share the same two sources: its TAZ.shp
# mixes old-style CO_TAZIDs (USTM-only TAZs, SE_BOXELDER_2025.csv) with
# new-style ones (WFRC-modeled TAZs, the FiscallyConstrained extract), and
# each boundary can touch either scheme — the interpolation only pulls in
# whichever TAZs actually overlap a given area's hexes, so listing both
# sources everywhere is safe. "WFRC MPO (Box Elder TAZ)" looks redundant by
# name, but the original SE 2025 gdb only covers a small fraction of it
# (5 of 1,144 cells) — an older/smaller TAZ vintage than USTM's current one.
BOX_ELDER_TAZ_SOURCES <- list(
  list(path = "_data/ustm_20260805/SE/03_BoxElder/SE_BOXELDER_2025.csv"),
  list(path = "_data/ustm_20260805/SE/00_WF/2_WFRC/FiscallyConstrained/SE_2025.csv", county_filter = "BOX ELDER")
)
EXPANSION_AREAS <- list(
  list(label = "WFRC MPO (Box Elder Non-TAZ)", plan_org = "WFRC MPO", in_county = "Box Elder",
       taz_se_sources = BOX_ELDER_TAZ_SOURCES),
  list(label = "WFRC MPO (Box Elder TAZ)",     plan_org = "WFRC MPO", in_county = "Box Elder",
       taz_se_sources = BOX_ELDER_TAZ_SOURCES),
  list(label = "Box Elder (Non-MPO TAZ)",      plan_org = "",         in_county = "Box Elder",
       taz_se_sources = BOX_ELDER_TAZ_SOURCES),
  list(label = "Tooele RPO",                   plan_org = "Tooele RPO", in_county = "Tooele",
       taz_se_sources = list(
         list(path = "_data/ustm_20260805/SE/45_Tooele/SE_TOOELE_2025.csv")
       ))
)

# USTM SE column -> our schema column. residential_units is derived
# separately (TOTHH + secondary-housing units where available; see below).
USTM_FIELD_MAP <- c(
  households = "TOTHH", hhpop = "HHPOP", total_jobs = "TOTEMP",
  industrial_jobs = "INDEMP", retail_jobs = "RETEMP", office_jobs = "OTHEMP",
  jobs_retail = "RETL", jobs_accom_food = "FOOD", jobs_manuf = "MANU",
  jobs_wholesale = "WSLE", jobs_office = "OFFI", jobs_gov_edu = "GVED",
  jobs_health = "HLTH", jobs_other = "OTHR"
)

root <- here::here()

# ── Libraries ─────────────────────────────────────────────────────────────────

library(sf)
library(h3o)
library(here)
library(dplyr)
library(tidyr)
library(mapgl)
library(tidycensus)
library(tigris)
library(arcgislayers)

options(tigris_use_cache = TRUE)

# ── Helper Functions ───────────────────────────────────────────────────────────

fetch_or_cache <- function(url, cache_path, layer = NULL, where = NULL) {
  full_path <- file.path(root, cache_path)
  if (!file.exists(full_path)) {
    dir.create(dirname(full_path), recursive = TRUE, showWarnings = FALSE)
    data <- tryCatch(
      arcgislayers::arc_select(arcgislayers::arc_open(url), crs = sf::st_crs(4326L)),
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

# k = last non-zero ring; per-neighbor weight = ring_weight / (6 × ring_number).
# Edge hexes with fewer available neighbors receive proportionally less total
# weight from that ring — it is not redistributed to remaining neighbors.
build_neighbor_index <- function(hex_ids, weights) {
  k         <- max(which(weights[-1] > 0))
  h3_cells  <- h3o::h3_from_strings(hex_ids)
  all_disks <- h3o::grid_disk(h3_cells, k = k)
  all_dists <- h3o::grid_distances(h3_cells, k = k)
  tibble::tibble(
    center_id = rep(hex_ids, times = lengths(all_disks)),
    member_id = as.character(h3o::flatten_h3(all_disks)),
    ring      = unlist(all_dists)
  ) |>
    dplyr::filter(member_id %in% hex_ids) |>
    dplyr::mutate(
      weight = dplyr::if_else(ring == 0L, weights["center"],
                              weights[paste0("ring", ring)] / (6L * ring))
    )
}

# NAs in `values` are treated as 0 in the weighted sum.
# Because edge weights are not redistributed, smoothed values near NA regions
# or study-area boundaries are naturally pulled toward 0.
smooth_by_neighbors <- function(hex_ids, values, neighbor_index) {
  val_map        <- setNames(values, hex_ids)
  idx            <- neighbor_index
  idx$weighted   <- val_map[idx$member_id] * idx$weight
  agg            <- rowsum(idx$weighted, idx$center_id, na.rm = TRUE)
  agg[hex_ids, , drop = TRUE]
}

# 3-tier income diversity: min(low, mid, high) / max(low, mid, high).
# tier_breaks is c(low_max, mid_max) — 1-based indices into counts splitting into Low/Mid/High.
# Works on raw tier counts: the shared /total divisor cancels out of the min/max
# ratio, so dividing into shares first would give the identical result. Returns
# NA when total households = 0 (avoids 0/0); returns 0 when any tier is absent.
income_diversity_from_tiers <- function(counts, tier_breaks) {
  counts[is.na(counts) | counts < 0] <- 0
  if (sum(counts) == 0) return(NA_real_)
  low  <- sum(counts[seq_len(tier_breaks["low_max"])])
  mid  <- sum(counts[seq(tier_breaks["low_max"] + 1L, tier_breaks["mid_max"])])
  high <- sum(counts[seq(tier_breaks["mid_max"] + 1L, length(counts))])
  min(low, mid, high) / max(low, mid, high)
}

# 1 if any feature from features_sf touches the hex, 0 otherwise
flag_presence <- function(hex_sf, features_sf) {
  ft <- sf::st_transform(features_sf, sf::st_crs(hex_sf))
  as.integer(lengths(sf::st_intersects(hex_sf, ft)) > 0L)
}

# Reads one USTM SE csv, renames USTM_FIELD_MAP columns to our schema, and
# derives residential_units. County-level extracts (e.g. SE_TOOELE_2025.csv)
# are already single-county and carry USTM_SF/MF/RV (secondary/vacation
# housing units, per UDOT: never included in TOTHH, safe to add directly).
# The WFRC "FiscallyConstrained" extract covers multiple counties (needs
# county_filter on its CO_NAME column) and lacks USTM_SF/MF/RV entirely, so
# residential_units there is just TOTHH.
load_ustm_se <- function(path, county_filter = NULL) {
  se <- read.csv(file.path(root, path))
  if (!"CO_TAZID" %in% names(se)) names(se)[1] <- "CO_TAZID"
  if (!is.null(county_filter)) se <- dplyr::filter(se, CO_NAME == county_filter)
  has_secondary <- all(c("USTM_SF", "USTM_MF", "USTM_RV") %in% names(se))

  se |>
    dplyr::rename(!!!USTM_FIELD_MAP) |>
    dplyr::mutate(
      residential_units = if (has_secondary) households + USTM_SF + USTM_MF + USTM_RV else households
    ) |>
    dplyr::select(CO_TAZID, dplyr::all_of(names(USTM_FIELD_MAP)), residential_units)
}

# Area-weighted apportionment of TAZ values onto target hexes: for each
# TAZ-hex overlap piece, contribution = TAZ_value * (piece_area / TAZ_area).
# Same st_intersection + area-ratio pattern as the wc_score calc below.
# Deliberately manual rather than sf::st_interpolate_aw(), which silently
# drops target rows with zero source overlap instead of returning NA — a
# real risk here since hex and TAZ selections come from independent
# boundary queries. Keeping hex_id as an explicit join key throughout avoids
# any row-position assumption.
interpolate_taz_to_hex <- function(taz_sf, target_hexes, value_cols) {
  taz_sf$.taz_area <- as.numeric(sf::st_area(taz_sf))
  ix <- sf::st_intersection(target_hexes["hex_id"], taz_sf[, c(".taz_area", value_cols)])
  ix$.piece_area <- as.numeric(sf::st_area(ix))
  sf::st_drop_geometry(ix) |>
    dplyr::mutate(.frac = .piece_area / .taz_area) |>
    dplyr::mutate(dplyr::across(dplyr::all_of(value_cols), ~ .x * .frac)) |>
    dplyr::group_by(hex_id) |>
    dplyr::summarise(dplyr::across(dplyr::all_of(value_cols), sum), .groups = "drop")
}

# ── Remote Data Fetch & Cache ──────────────────────────────────────────────────

# Design
# The ArcGIS service stores sequential row numbers in hex_id, not H3 IDs.
# Source data is at H3 L8 resolution — derive the L8 cell from each polygon
# centroid, then divide the score equally among its 7 L9 children.
intersection_hex <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/Street_Intersection_Density_2025/FeatureServer/3",
  cache_path = "_data/remote/design/intersection_hex.gpkg"
) |>
  (\(d) {
    xy <- sf::st_coordinates(sf::st_centroid(sf::st_transform(d, 4326L)))
    dplyr::mutate(d, h8_id = as.character(h3o::h3_from_xy(xy[, 2L], xy[, 1L], resolution = 8L)))
  })()

# Sum scores per L8 hex (handles the rare case of two polygons mapping to the same cell)
int_l8 <- sf::st_drop_geometry(intersection_hex) |>
  dplyr::select(h8_id, IntScore) |>
  dplyr::group_by(h8_id) |>
  dplyr::summarise(IntScore = sum(IntScore, na.rm = TRUE), .groups = "drop")

# Divide score equally among each L8 cell's 7 L9 children.
# flatten_h3 expands the H3Indexes list — same pattern as build_neighbor_index.
.children <- h3o::get_children(h3o::h3_from_strings(int_l8$h8_id), resolution = 9L)
int_l9 <- tibble::tibble(
  h8_id  = rep(int_l8$h8_id, times = lengths(.children)),
  hex_id = as.character(h3o::flatten_h3(.children))
) |>
  dplyr::left_join(dplyr::select(int_l8, h8_id, IntScore), by = "h8_id") |>
  dplyr::transmute(hex_id, IntScore = IntScore / 7)
rm(.children)

# Destinations
center_boundaries <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/ArcGIS/rest/services/WCV_Centers_and_Regional_Land_Uses/FeatureServer/0",
  cache_path = "_data/remote/destinations/center_boundaries.gpkg"
)
health_care <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/LicensedHealthCareFacilities/FeatureServer/0",
  cache_path = "_data/remote/destinations/health_care.gpkg",
  where      = "LICENSE_TYPE NOT IN ('Assisted Living Facility - Type I', 'Assisted Living Facility - Type II', 'Home Health Agency', 'Hospice', 'Birthing Center', 'Abortion Clinic')"
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
ems_stations <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/arcgis/rest/services/EmergencyMedicalServices/FeatureServer/0",
  cache_path = "_data/remote/destinations/ems_stations.gpkg",
  where      = "NAME NOT LIKE '%PRISON%' AND NAME NOT LIKE '%-DOD'"
)

# Demographics: ACS BG median income
bg_income_path <- file.path(root, "_data/remote/demographics/bg_income.gpkg")
if (!file.exists(bg_income_path)) {
  dir.create(dirname(bg_income_path), recursive = TRUE, showWarnings = FALSE)
  bg_income <- tidycensus::get_acs(
    geography = "block group",
    variables = "B19013_001",
    state     = "UT",
    county    = c("Box Elder", "Davis", "Weber", "Salt Lake", "Utah",
                  "Tooele", "Morgan", "Summit", "Wasatch"),
    year      = 2023,
    geometry  = TRUE
  )
  sf::write_sf(bg_income, bg_income_path, driver = "GPKG")
} else {
  bg_income <- sf::read_sf(bg_income_path)
}

# Demographics: B19001 income distribution bins (for Income Diversity Index / Gini)
bg_income_dist_path <- file.path(root, "_data/remote/demographics/bg_income_dist.gpkg")
if (!file.exists(bg_income_dist_path)) {
  dir.create(dirname(bg_income_dist_path), recursive = TRUE, showWarnings = FALSE)
  bg_income_dist <- tidycensus::get_acs(
    geography = "block group",
    variables = c("B19001_001", INCOME_BINS),
    state     = "UT",
    county    = c("Box Elder", "Davis", "Weber", "Salt Lake", "Utah",
                  "Tooele", "Morgan", "Summit", "Wasatch"),
    year      = 2023,
    output    = "wide",
    geometry  = TRUE
  ) |>
    dplyr::select(GEOID, dplyr::ends_with("E"), geometry) |>
    dplyr::rename_with(~ sub("E$", "", .x), dplyr::ends_with("E"))
  sf::write_sf(bg_income_dist, bg_income_dist_path)
} else {
  bg_income_dist <- sf::read_sf(bg_income_dist_path)
}

# Derive income tier breakpoints from regional HH distribution.
# For "regional_tertiles": find the bin indices where the cumulative regional share
# crosses 1/3 and 2/3, splitting all households into roughly equal thirds.
# For other modes: use the manually-set INCOME_TIER_BREAKS from the parameters section.
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

# Transit: UTA GTFS
gtfs_zip <- file.path(root, "_data/remote/transit/GTFS.zip")
gtfs_dir <- file.path(root, "_data/remote/transit/gtfs")
if (!file.exists(gtfs_zip) || !dir.exists(gtfs_dir)) {
  dir.create(dirname(gtfs_zip), recursive = TRUE, showWarnings = FALSE)
  if (!file.exists(gtfs_zip))
    download.file("https://gtfsfeed.rideuta.com/GTFS.zip", gtfs_zip, mode = "wb")
  unzip(gtfs_zip, exdir = gtfs_dir)
}

# County boundaries (for density NA flagging) — tigris guarantees a NAME column
utah_counties_path <- file.path(root, "_data/remote/boundaries/utah_counties.gpkg")
if (!file.exists(utah_counties_path)) {
  dir.create(dirname(utah_counties_path), recursive = TRUE, showWarnings = FALSE)
  utah_counties <- tigris::counties(state = "UT", cb = TRUE, year = 2022)
  sf::write_sf(utah_counties, utah_counties_path, driver = "GPKG")
} else {
  utah_counties <- sf::read_sf(utah_counties_path)
}

# WFRC regional planning boundary components — used to scope hex grid
# expansion into areas with no SE 2025 TAZ data (see EXPANSION_AREAS above)
regional_boundary_components <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/ArcGIS/rest/services/RegionalBoundaryComponents/FeatureServer/0",
  cache_path = "_data/remote/boundaries/regional_boundary_components.gpkg"
)

# ── SE Data Import ─────────────────────────────────────────────────────────────

se_hex <- sf::read_sf(
  paste0("/vsizip/", file.path(root, "_data", paste0(GDB_NAME, ".gdb.zip"))),
  layer = GDB_NAME
)
hex_ids <- se_hex$hex_id
hex_crs <- sf::st_crs(se_hex)

# Tooele intentionally NOT listed here — it now has real TAZ SE data (see
# "TAZ SE Data Import" below), so masking is precise per-hex via
# no_se_data_hex_ids instead of blanket-excluding the whole county.
na_county_names <- c("Morgan", "Summit", "Wasatch")

# Raw SE input columns — defined here (not just at L8, where they're also used
# for aggregation) so the hex-grid-expansion section below can NA them out for
# newly-added hexes with no TAZ data yet.
se_count_cols <- c(
  "households", "hhpop", "residential_units", "total_jobs",
  "industrial_jobs", "retail_jobs", "office_jobs",
  "jobs_accom_food", "jobs_gov_edu", "jobs_health", "jobs_manuf",
  "jobs_office", "jobs_other", "jobs_retail", "jobs_wholesale"
)

# ── Hex Grid Expansion: SE-data-pending areas ──────────────────────────────────
# Add H3 L9 hexes for EXPANSION_AREAS (see Parameters). These get real
# Design/Destinations/Demographics; SE columns are left NA (not 0) so the
# rest of the pipeline can tell "no TAZ data yet" apart from "confirmed zero".

expansion_boundary <- purrr::map(EXPANSION_AREAS, \(a) {
    dplyr::filter(regional_boundary_components,
      PlanOrg == a$plan_org, InCounty == a$in_county, Label == a$label)
  }) |>
  dplyr::bind_rows() |>
  sf::st_transform(4326L) |>
  sf::st_make_valid()

stopifnot(
  "One or more EXPANSION_AREAS filters matched zero features — check field values against RegionalBoundaryComponents" =
    nrow(expansion_boundary) == length(EXPANSION_AREAS)
)

expansion_cell_ids <- h3o::sfc_to_cells(
    sf::st_geometry(sf::st_union(expansion_boundary)), resolution = 9L, containment = "centroid"
  ) |>
  h3o::flatten_h3() |>
  as.character() |>
  unique()

new_hex_ids <- setdiff(expansion_cell_ids, hex_ids)

# Pre-existing WFRC hexes whose centroid also falls in an expansion
# boundary — these keep their original se_hex values untouched.
overlap_hex_ids <- intersect(expansion_cell_ids, hex_ids)
message(length(overlap_hex_ids), " pre-existing hex(es) overlap an expansion boundary and keep their original se_hex values: ",
        paste(overlap_hex_ids, collapse = ", "))

stopifnot("No new H3 cells generated for EXPANSION_AREAS" = length(new_hex_ids) > 0L)

# Build true H3 L9 hex boundaries the same way the L8 grid is built further
# down (vertex convex hull of each cell's 6/5 vertices).
new_geom <- h3o::h3_from_strings(new_hex_ids) |>
  h3o::h3_to_vertexes() |>
  purrr::map(sf::st_convex_hull) |>
  sf::st_sfc(crs = 4326L) |>
  sf::st_transform(hex_crs)

sf_col <- attr(se_hex, "sf_column")
new_hex_sf <- sf::st_sf(
  hex_id = new_hex_ids,
  as.data.frame(matrix(NA_real_, length(new_hex_ids), length(se_count_cols),
                        dimnames = list(NULL, se_count_cols))),
  geometry = sf::st_cast(new_geom, "MULTIPOLYGON")
)
names(new_hex_sf)[names(new_hex_sf) == "geometry"] <- sf_col
sf::st_geometry(new_hex_sf) <- sf_col

# Hexes with no real SE data — only the newly-added ones; overlap_hex_ids
# keep real (if small) values, so they're not masked as "no data" below.
no_se_data_hex_ids <- new_hex_ids

# ── TAZ SE Data Import: real USTM SE 2025 data for expansion areas ─────────────
# Fills new_hex_sf (not se_hex — a pre-existing WFRC row is structurally
# unreachable here) with real counts, area-weighted from USTM TAZs. Plain
# area-weighted: assumes SE is spread evenly within each TAZ.

ustm_taz_shp <- sf::read_sf(file.path(root, "_data/ustm_20260805/TAZ/TAZ.shp")) |>
  sf::st_make_valid() |>
  sf::st_transform(hex_crs)

taz_value_cols <- c(names(USTM_FIELD_MAP), "residential_units")

taz_results <- purrr::map(EXPANSION_AREAS, \(area) {
  se_combined <- purrr::map(area$taz_se_sources, \(s) load_ustm_se(s$path, s$county_filter)) |>
    dplyr::bind_rows()

  # Source = the full county's TAZs, not just ones inside the boundary — a
  # boundary-edge TAZ can have its own centroid just outside while still
  # covering a target hex just inside. Only the target hexes are boundary-scoped.
  taz_joined <- ustm_taz_shp |>
    dplyr::filter(toupper(CO_NAME) == toupper(area$in_county)) |>
    dplyr::inner_join(se_combined, by = "CO_TAZID")

  boundary <- regional_boundary_components |>
    dplyr::filter(PlanOrg == area$plan_org, InCounty == area$in_county, Label == area$label) |>
    sf::st_transform(hex_crs) |>
    sf::st_make_valid()

  target_hexes <- new_hex_sf |>
    dplyr::filter(lengths(sf::st_intersects(sf::st_centroid(new_hex_sf["hex_id"]), boundary)) > 0) |>
    dplyr::select(hex_id) |>
    sf::st_make_valid()

  interpolate_taz_to_hex(taz_joined, target_hexes, taz_value_cols)
}) |>
  dplyr::bind_rows()

# rows_update() can't operate directly on an sf object (its `[` method keeps
# geometry sticky, which rows_update's internal column selection rejects) —
# drop geometry, update, reattach.
new_hex_geom <- sf::st_geometry(new_hex_sf)
new_hex_sf <- new_hex_sf |>
  sf::st_drop_geometry() |>
  dplyr::rows_update(taz_results, by = "hex_id") |>
  sf::st_sf(geometry = new_hex_geom)
names(new_hex_sf)[names(new_hex_sf) == "geometry"] <- sf_col
sf::st_geometry(new_hex_sf) <- sf_col

se_hex  <- dplyr::bind_rows(se_hex, new_hex_sf)
hex_ids <- se_hex$hex_id

# Recompute from the current NA state — a few hexes may still lack data
# (e.g. zero TAZ overlap right at a boundary edge) and need the fallback below.
no_se_data_hex_ids <- se_hex$hex_id[is.na(se_hex$households)]

# ── Demographics fallback weight for expansion hexes ────────────────────────
# The income interpolation below needs a household weight surface, which any
# still-NA hex doesn't have. Fall back to 2020 Census block occupied-housing
# counts (H1_002N) as a proxy — `households` itself stays NA, so Density/
# Diversity remain correctly blocked. Area-weighted, not interpolate_pw,
# since blocks are already the finest Census geography available.
se_hex <- dplyr::mutate(se_hex, hh_weight = households)

# Guarded: only runs if TAZ interpolation left hexes uncovered (e.g. zero
# overlap at a boundary edge) — st_interpolate_aw() errors on an empty target.
if (length(no_se_data_hex_ids) > 0L) {
  blocks_hh <- sf::read_sf(file.path(root, "_data/remote/demographics/blocks_2020_hh.gpkg")) |>
    sf::st_transform(hex_crs) |>
    sf::st_make_valid()

  proxy_target <- se_hex |> dplyr::filter(hex_id %in% no_se_data_hex_ids) |>
    dplyr::select(hex_id) |> sf::st_make_valid()
  proxy_hh <- sf::st_interpolate_aw(blocks_hh["value"], proxy_target, extensive = TRUE)

  proxy_df <- tibble::tibble(hex_id = proxy_target$hex_id, hh_weight_proxy = proxy_hh$value)
  se_hex <- se_hex |>
    dplyr::left_join(proxy_df, by = "hex_id") |>
    dplyr::mutate(hh_weight = dplyr::coalesce(hh_weight, hh_weight_proxy)) |>
    dplyr::select(-hh_weight_proxy)
}

# ── Destinations: shared setup (used by both L9 and L8) ───────────────────────

# inspect names(cb_proj) to confirm the center type field; adjust if needed
cb_proj <- center_boundaries |>
  sf::st_transform(hex_crs) |>
  sf::st_make_valid() |>
  dplyr::mutate(tier_weight = WC_CENTER_WEIGHTS[CenterType]) |>
  dplyr::filter(!is.na(tier_weight), tier_weight > 0)


# ── Transit: shared setup (used by both L9 and L8) ────────────────────────────

stop_times <- read.csv(file.path(gtfs_dir, "stop_times.txt"), stringsAsFactors = FALSE)
trips      <- read.csv(file.path(gtfs_dir, "trips.txt"),      stringsAsFactors = FALSE)
routes     <- read.csv(file.path(gtfs_dir, "routes.txt"),     stringsAsFactors = FALSE)
calendar   <- read.csv(file.path(gtfs_dir, "calendar.txt"),   stringsAsFactors = FALSE)
stops_txt  <- read.csv(file.path(gtfs_dir, "stops.txt"),      stringsAsFactors = FALSE)

weekday_service_ids <- dplyr::filter(calendar, monday == 1L) |> dplyr::pull(service_id)

# Parse HH:MM:SS → decimal minutes (handles GTFS times > 24:00); compute
# within-stop inter-arrival headways; null the last row of each stop group.
st_wd <- stop_times |>
  dplyr::inner_join(
    trips |>
      dplyr::filter(service_id %in% weekday_service_ids) |>
      dplyr::inner_join(dplyr::select(routes, route_id, route_type), by = "route_id") |>
      dplyr::select(trip_id, route_type),
    by = "trip_id"
  ) |>
  tidyr::separate(arrival_time, into = c("h", "m", "s"), sep = ":", convert = TRUE) |>
  dplyr::mutate(arr_min = h * 60 + m + s / 60) |>
  dplyr::select(-h, -m, -s) |>
  dplyr::arrange(stop_id, arr_min) |>
  dplyr::group_by(stop_id) |>
  dplyr::mutate(headway = c(diff(arr_min), NA_real_)) |>
  dplyr::ungroup()

# Frequent: median headway <= 15 min OR commuter/heavy rail (route_type 1 or 2)
frequent_ids <- st_wd |>
  dplyr::group_by(stop_id) |>
  dplyr::summarise(
    headway    = median(headway,    na.rm = TRUE),
    route_type = min(route_type),
    .groups    = "drop"
  ) |>
  dplyr::filter(!is.na(headway), headway <= 15 | route_type %in% c(1L, 2L)) |>
  dplyr::pull(stop_id)

frequent_stops <- stops_txt |>
  dplyr::filter(stop_id %in% frequent_ids) |>
  sf::st_as_sf(coords = c("stop_lon", "stop_lat"), crs = 4326L) |>
  sf::st_transform(hex_crs)

# ── 1. Level-9 Pipeline ────────────────────────────────────────────────────────

neighbor_index <- build_neighbor_index(hex_ids, L9_WEIGHTS)

## Density
res_s   <- smooth_by_neighbors(hex_ids, se_hex$residential_units, neighbor_index)
jobs_s  <- smooth_by_neighbors(hex_ids, se_hex$total_jobs,        neighbor_index)
density <- (res_s + jobs_s / J2H) / L9_HEX_AREA_SQMI

# Flag hexes in na_county_names (no SE data, pending methodology) as NA
na_hex_ids <- sf::st_join(
  sf::st_centroid(se_hex["hex_id"]),
  sf::st_transform(utah_counties["NAME"], hex_crs),
  join = sf::st_within
) |>
  sf::st_drop_geometry() |>
  dplyr::filter(NAME %in% na_county_names) |>
  dplyr::pull(hex_id)
# Union in expansion/stray hexes explicitly — they may fall in a county (e.g.
# Box Elder) not otherwise in na_county_names, since only part of it lacks SE data.
na_hex_ids <- union(na_hex_ids, no_se_data_hex_ids)
density <- dplyr::if_else(hex_ids %in% na_hex_ids, NA_real_, density)

## Diversity
hh_s  <- smooth_by_neighbors(hex_ids, se_hex$households, neighbor_index)
emp_s <- smooth_by_neighbors(hex_ids, se_hex$total_jobs,  neighbor_index)
hw    <- hh_s * J2H
diversity <- dplyr::if_else(hw == 0 & emp_s == 0, NA_real_, pmin(hw, emp_s) / pmax(hw, emp_s))

## Design — join L9 children expanded from int_l8
design_raw <- tibble::tibble(hex_id = hex_ids) |>
  dplyr::left_join(int_l9, by = "hex_id") |>
  dplyr::pull(IntScore)
design <- smooth_by_neighbors(hex_ids, design_raw, neighbor_index)

## Destinations
hex_area_m2 <- setNames(as.numeric(sf::st_area(se_hex)), hex_ids)
cb_int      <- sf::st_intersection(se_hex["hex_id"], cb_proj[, c("CenterType", "tier_weight")])

wc_score <- tibble::tibble(hex_id = hex_ids) |>
  dplyr::left_join(
    sf::st_drop_geometry(cb_int) |>
      dplyr::mutate(
        int_area = as.numeric(sf::st_area(cb_int)),
        contrib  = int_area / hex_area_m2[hex_id] * tier_weight
      ) |>
      dplyr::group_by(hex_id) |>
      dplyr::summarise(score = pmin(sum(contrib), 1.0), .groups = "drop"),
    by = "hex_id"
  ) |>
  dplyr::mutate(score = tidyr::replace_na(score, 0)) |>
  dplyr::pull(score)

healthcare_flag <- flag_presence(se_hex, health_care)
highschool_flag <- flag_presence(se_hex, schools)
grocery_flag    <- flag_presence(se_hex, grocery_stores)
cityhall_flag   <- flag_presence(se_hex, city_halls)
park_flag       <- pmax(flag_presence(se_hex, parks_local), flag_presence(se_hex, parks_wfrc))
ems_flag        <- flag_presence(se_hex, ems_stations)

amenity_score    <- (healthcare_flag + highschool_flag + grocery_flag + cityhall_flag + park_flag + ems_flag) / 6
raw_destinations <- 0.6 * wc_score + 0.4 * amenity_score
destinations     <- pmax(0, smooth_by_neighbors(hex_ids, raw_destinations, neighbor_index))

destinations_center   <- pmax(0, smooth_by_neighbors(hex_ids, wc_score,        neighbor_index))
destinations_health   <- pmax(0, smooth_by_neighbors(hex_ids, healthcare_flag, neighbor_index))
destinations_school   <- pmax(0, smooth_by_neighbors(hex_ids, highschool_flag, neighbor_index))
destinations_grocery  <- pmax(0, smooth_by_neighbors(hex_ids, grocery_flag,    neighbor_index))
destinations_cityhall <- pmax(0, smooth_by_neighbors(hex_ids, cityhall_flag,   neighbor_index))
destinations_park     <- pmax(0, smooth_by_neighbors(hex_ids, park_flag,       neighbor_index))
destinations_ems      <- pmax(0, smooth_by_neighbors(hex_ids, ems_flag,        neighbor_index))

## Demographics
# Household-weighted interpolation from BG → hex using SE 2025 estimated HH as
# the weights layer (hh_weight = households, except for expansion hexes with
# no SE data yet, where it falls back to a Census-block proxy — see above).
# Same vintage as the pipeline; Census blocks (Method A) gave R²=0.92,
# RMSE=$10,919, bias=$103 vs this method — negligible average difference.
demographics_interp <- tidycensus::interpolate_pw(
  from             = sf::st_transform(bg_income, hex_crs),
  to               = se_hex,
  to_id            = "hex_id",
  extensive        = FALSE,
  weights          = se_hex[, c("hex_id", "hh_weight")],
  weight_column    = "hh_weight",
  weight_placement = "surface"
)
demographics_raw <- tibble::tibble(hex_id = hex_ids) |>
  dplyr::left_join(
    sf::st_drop_geometry(demographics_interp) |> dplyr::select(hex_id, estimate),
    by = "hex_id"
  ) |>
  dplyr::left_join(
    sf::st_drop_geometry(se_hex) |> dplyr::select(hex_id, hh_weight),
    by = "hex_id"
  ) |>
  dplyr::mutate(estimate = dplyr::if_else(is.na(hh_weight) | hh_weight == 0, NA_real_, estimate)) |>
  dplyr::pull(estimate)
demographics <- smooth_by_neighbors(hex_ids, demographics_raw, neighbor_index)

## Income Diversity — 3-tier min/max from B19001 household income distribution bins (L9)
# Interpolate bin counts from BG polygons to hexes. extensive = TRUE because
# these are household counts, not rates; the interpolation distributes each BG's
# bin counts proportionally by the household surface within each hex.
bg_bins <- bg_income_dist |>
  sf::st_transform(hex_crs) |>
  dplyr::select(dplyr::all_of(INCOME_BINS))

hex_income_dist <- tidycensus::interpolate_pw(
  from             = bg_bins,
  to               = se_hex,
  to_id            = "hex_id",
  extensive        = TRUE,
  weights          = se_hex[, c("hex_id", "hh_weight")],
  weight_column    = "hh_weight",
  weight_placement = "surface"
)

# Reindex by hex_id to guarantee row order matches hex_ids, consistent with how
# demographics_interp is handled. interpolate_pw currently preserves to order,
# but the explicit match is defensive against any future change.
bin_matrix <- sf::st_drop_geometry(hex_income_dist) |>
  dplyr::select(hex_id, dplyr::all_of(INCOME_BINS)) |>
  dplyr::slice(match(hex_ids, hex_id)) |>
  dplyr::select(dplyr::all_of(INCOME_BINS)) |>
  as.matrix()

income_diversity_raw <- apply(bin_matrix, 1L, income_diversity_from_tiers, tier_breaks = income_tier_breaks)

# Smooth each bin independently, then compute diversity from smoothed distribution
bin_smoothed <- vapply(
  seq_len(ncol(bin_matrix)),
  function(i) smooth_by_neighbors(hex_ids, bin_matrix[, i], neighbor_index),
  numeric(length(hex_ids))
)
income_diversity <- apply(bin_smoothed, 1L, income_diversity_from_tiers, tier_breaks = income_tier_breaks)

## Distance to Transit
centroids        <- sf::st_centroid(sf::st_geometry(se_hex))
dist_mat         <- sf::st_distance(centroids, frequent_stops)
nearest_col      <- apply(dist_mat, 1L, which.min)
transit_dist_raw <- as.numeric(dist_mat[cbind(seq_len(nrow(se_hex)), nearest_col)]) / 1609.34
transit_dist     <- smooth_by_neighbors(hex_ids, transit_dist_raw, neighbor_index)

## Raw (unsmoothed) L9 values
density_raw   <- (se_hex$residential_units + se_hex$total_jobs / J2H) / L9_HEX_AREA_SQMI
density_raw   <- dplyr::if_else(hex_ids %in% na_hex_ids, NA_real_, density_raw)

hw_raw        <- se_hex$households * J2H
diversity_raw <- dplyr::if_else(hw_raw == 0 & se_hex$total_jobs == 0, NA_real_,
  pmin(hw_raw, se_hex$total_jobs) / pmax(hw_raw, se_hex$total_jobs))

destinations_raw <- raw_destinations  # alias: raw_destinations computed in the Destinations section above

## Assemble L9
se_hex <- dplyr::mutate(
  se_hex,
  density                   = density,
  density_raw               = density_raw,
  diversity                 = diversity,
  diversity_raw             = diversity_raw,
  design                    = design,
  design_raw                = design_raw,
  destinations              = destinations,
  destinations_raw          = destinations_raw,
  destinations_center       = destinations_center,
  destinations_center_raw   = wc_score,
  destinations_health       = destinations_health,
  destinations_health_raw   = healthcare_flag,
  destinations_school       = destinations_school,
  destinations_school_raw   = highschool_flag,
  destinations_grocery      = destinations_grocery,
  destinations_grocery_raw  = grocery_flag,
  destinations_cityhall     = destinations_cityhall,
  destinations_cityhall_raw = cityhall_flag,
  destinations_park         = destinations_park,
  destinations_park_raw     = park_flag,
  destinations_ems          = destinations_ems,
  destinations_ems_raw      = ems_flag,
  demographics              = demographics,
  demographics_raw          = demographics_raw,
  transit_dist              = transit_dist,
  transit_dist_raw          = transit_dist_raw,
  income_diversity          = income_diversity,
  income_diversity_raw      = income_diversity_raw
)

# ── 2. Level-8 Pipeline ────────────────────────────────────────────────────────

## Aggregate SE from L9 → L8
h8_ids_vec <- as.character(h3o::get_parents(h3o::h3_from_strings(hex_ids), resolution = 8L))

# Raw SE counts aggregate to L8 as a plain sum of each cell's L9 children — only
# the D variables (and their intermediaries) get neighbor-weighted further down.
# So L8 population, jobs, households, etc. are exact child sums, not weighted.
# (se_count_cols is defined earlier, right after SE Data Import.)

# Sum counts by L8 parent (drop geometry first — summarise on sf would dissolve
# L9 polygons into irregular unions instead of clean H3 L8 hex boundaries).
# hh_weight rides along the same plain-sum aggregation as the real SE counts —
# it's a household figure (real or Census-block proxy), so summing is correct.
se_l8_data <- sf::st_drop_geometry(se_hex) |>
  dplyr::mutate(hex_id = h8_ids_vec) |>
  dplyr::select(hex_id, dplyr::all_of(se_count_cols), hh_weight) |>
  dplyr::group_by(hex_id) |>
  dplyr::summarise(dplyr::across(dplyr::everything(), \(x) sum(x, na.rm = TRUE)), .groups = "drop")

# Build true H3 L8 hex boundaries: vertex convex hull of each cell's 6 vertices
h8_geom <- h3o::h3_from_strings(se_l8_data$hex_id) |>
  h3o::h3_to_vertexes() |>
  purrr::map(sf::st_convex_hull) |>
  sf::st_sfc(crs = 4326L) |>
  sf::st_transform(hex_crs)

se_l8 <- sf::st_sf(se_l8_data, geometry = sf::st_cast(h8_geom, "MULTIPOLYGON"))
h8_ids <- se_l8$hex_id

neighbor_index_l8 <- build_neighbor_index(h8_ids, L8_WEIGHTS)

## Density (L8)
res_s_l8   <- smooth_by_neighbors(h8_ids, se_l8$residential_units, neighbor_index_l8)
jobs_s_l8  <- smooth_by_neighbors(h8_ids, se_l8$total_jobs,        neighbor_index_l8)
density_l8 <- (res_s_l8 + jobs_s_l8 / J2H) / L8_HEX_AREA_SQMI

na_hex_ids <- sf::st_join(
  sf::st_centroid(se_l8["hex_id"]),
  sf::st_transform(utah_counties["NAME"], hex_crs),
  join = sf::st_within
) |>
  sf::st_drop_geometry() |>
  dplyr::filter(NAME %in% na_county_names) |>
  dplyr::pull(hex_id)
# An L8 hex is NA if ANY of its L9 children lack real SE data — otherwise its
# summed counts would silently undercount rather than honestly read NA.
no_se_data_hex_ids_l8 <- unique(h8_ids_vec[hex_ids %in% no_se_data_hex_ids])
na_hex_ids <- union(na_hex_ids, no_se_data_hex_ids_l8)
density_l8 <- dplyr::if_else(h8_ids %in% na_hex_ids, NA_real_, density_l8)

## Diversity (L8)
hh_s_l8  <- smooth_by_neighbors(h8_ids, se_l8$households, neighbor_index_l8)
emp_s_l8 <- smooth_by_neighbors(h8_ids, se_l8$total_jobs,  neighbor_index_l8)
hw_l8    <- hh_s_l8 * J2H
diversity_l8 <- dplyr::if_else(hw_l8 == 0 & emp_s_l8 == 0, NA_real_, pmin(hw_l8, emp_s_l8) / pmax(hw_l8, emp_s_l8))

## Design (L8) — direct join; int_l8 is already at L8 resolution
design_raw_l8 <- tibble::tibble(hex_id = h8_ids) |>
  dplyr::left_join(int_l8, by = c("hex_id" = "h8_id")) |>
  dplyr::pull(IntScore)
design_l8 <- smooth_by_neighbors(h8_ids, design_raw_l8, neighbor_index_l8)

## Destinations (L8) — re-run intersection against L8 hexes
hex_area_m2_l8 <- setNames(as.numeric(sf::st_area(se_l8)), h8_ids)
cb_int_l8      <- sf::st_intersection(se_l8["hex_id"], cb_proj[, c("CenterType", "tier_weight")])

wc_score_l8 <- tibble::tibble(hex_id = h8_ids) |>
  dplyr::left_join(
    sf::st_drop_geometry(cb_int_l8) |>
      dplyr::mutate(
        int_area = as.numeric(sf::st_area(cb_int_l8)),
        contrib  = int_area / hex_area_m2_l8[hex_id] * tier_weight
      ) |>
      dplyr::group_by(hex_id) |>
      dplyr::summarise(score = pmin(sum(contrib), 1.0), .groups = "drop"),
    by = "hex_id"
  ) |>
  dplyr::mutate(score = tidyr::replace_na(score, 0)) |>
  dplyr::pull(score)

healthcare_flag_l8 <- flag_presence(se_l8, health_care)
highschool_flag_l8 <- flag_presence(se_l8, schools)
grocery_flag_l8    <- flag_presence(se_l8, grocery_stores)
cityhall_flag_l8   <- flag_presence(se_l8, city_halls)
park_flag_l8       <- pmax(flag_presence(se_l8, parks_local), flag_presence(se_l8, parks_wfrc))
ems_flag_l8        <- flag_presence(se_l8, ems_stations)

amenity_score_l8    <- (healthcare_flag_l8 + highschool_flag_l8 + grocery_flag_l8 +
                        cityhall_flag_l8 + park_flag_l8 + ems_flag_l8) / 6
raw_destinations_l8 <- 0.6 * wc_score_l8 + 0.4 * amenity_score_l8
destinations_l8     <- pmax(0, smooth_by_neighbors(h8_ids, raw_destinations_l8, neighbor_index_l8))

destinations_center_l8   <- pmax(0, smooth_by_neighbors(h8_ids, wc_score_l8,         neighbor_index_l8))
destinations_health_l8   <- pmax(0, smooth_by_neighbors(h8_ids, healthcare_flag_l8,  neighbor_index_l8))
destinations_school_l8   <- pmax(0, smooth_by_neighbors(h8_ids, highschool_flag_l8,  neighbor_index_l8))
destinations_grocery_l8  <- pmax(0, smooth_by_neighbors(h8_ids, grocery_flag_l8,     neighbor_index_l8))
destinations_cityhall_l8 <- pmax(0, smooth_by_neighbors(h8_ids, cityhall_flag_l8,    neighbor_index_l8))
destinations_park_l8     <- pmax(0, smooth_by_neighbors(h8_ids, park_flag_l8,        neighbor_index_l8))
destinations_ems_l8      <- pmax(0, smooth_by_neighbors(h8_ids, ems_flag_l8,         neighbor_index_l8))

## Demographics (L8)
demographics_interp_l8 <- tidycensus::interpolate_pw(
  from             = sf::st_transform(bg_income, hex_crs),
  to               = se_l8,
  to_id            = "hex_id",
  extensive        = FALSE,
  weights          = se_l8[, c("hex_id", "hh_weight")],
  weight_column    = "hh_weight",
  weight_placement = "surface"
)
demographics_raw_l8 <- tibble::tibble(hex_id = h8_ids) |>
  dplyr::left_join(
    sf::st_drop_geometry(demographics_interp_l8) |> dplyr::select(hex_id, estimate),
    by = "hex_id"
  ) |>
  dplyr::left_join(
    sf::st_drop_geometry(se_l8) |> dplyr::select(hex_id, hh_weight),
    by = "hex_id"
  ) |>
  dplyr::mutate(estimate = dplyr::if_else(is.na(hh_weight) | hh_weight == 0, NA_real_, estimate)) |>
  dplyr::pull(estimate)
demographics_l8 <- smooth_by_neighbors(h8_ids, demographics_raw_l8, neighbor_index_l8)

## Income Diversity (L8) — aggregate L9 bin counts to L8, then compute 3-tier diversity
# Sum each bin column across L9 children into their L8 parent, then apply the
# same smooth-bins-first approach used at L9.
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

## Distance to Transit (L8)
centroids_l8        <- sf::st_centroid(sf::st_geometry(se_l8))
dist_mat_l8         <- sf::st_distance(centroids_l8, frequent_stops)
nearest_col_l8      <- apply(dist_mat_l8, 1L, which.min)
transit_dist_raw_l8 <- as.numeric(dist_mat_l8[cbind(seq_len(nrow(se_l8)), nearest_col_l8)]) / 1609.34
transit_dist_l8     <- smooth_by_neighbors(h8_ids, transit_dist_raw_l8, neighbor_index_l8)

## Raw (unsmoothed) L8 values
density_raw_l8   <- (se_l8$residential_units + se_l8$total_jobs / J2H) / L8_HEX_AREA_SQMI
density_raw_l8   <- dplyr::if_else(h8_ids %in% na_hex_ids, NA_real_, density_raw_l8)

hw_raw_l8        <- se_l8$households * J2H
diversity_raw_l8 <- dplyr::if_else(hw_raw_l8 == 0 & se_l8$total_jobs == 0, NA_real_,
  pmin(hw_raw_l8, se_l8$total_jobs) / pmax(hw_raw_l8, se_l8$total_jobs))

## Assemble L8
se_l8 <- dplyr::mutate(
  se_l8,
  density                    = density_l8,
  density_raw                = density_raw_l8,
  diversity                  = diversity_l8,
  diversity_raw              = diversity_raw_l8,
  design                     = design_l8,
  design_raw                 = design_raw_l8,
  destinations               = destinations_l8,
  destinations_raw           = raw_destinations_l8,
  destinations_center        = destinations_center_l8,
  destinations_center_raw    = wc_score_l8,
  destinations_health        = destinations_health_l8,
  destinations_health_raw    = healthcare_flag_l8,
  destinations_school        = destinations_school_l8,
  destinations_school_raw    = highschool_flag_l8,
  destinations_grocery       = destinations_grocery_l8,
  destinations_grocery_raw   = grocery_flag_l8,
  destinations_cityhall      = destinations_cityhall_l8,
  destinations_cityhall_raw  = cityhall_flag_l8,
  destinations_park          = destinations_park_l8,
  destinations_park_raw      = park_flag_l8,
  destinations_ems           = destinations_ems_l8,
  destinations_ems_raw       = ems_flag_l8,
  demographics               = demographics_l8,
  demographics_raw           = demographics_raw_l8,
  transit_dist                = transit_dist_l8,
  transit_dist_raw            = transit_dist_raw_l8,
  income_diversity            = income_diversity_l8,
  income_diversity_raw        = income_diversity_raw_l8
)

# Destination scores are logically bounded [0, 1]; clamp any floating-point
# overshoot before writing to metadata / PMTiles.
se_l8 <- dplyr::mutate(se_l8, dplyr::across(dplyr::starts_with("destinations"), ~ pmax(0, pmin(1, .x))))

# ── Visualization: Diversity — smoothed vs raw (L9) ───────────────────────────

se_hex_4326 <- se_hex |>
  sf::st_transform(4326L) |>
  dplyr::mutate(tooltip = sprintf(
    "<b>Diversity (smoothed):</b> %.2f<br><b>Diversity (raw):</b> %.2f<br><b>HH:</b> %.0f<br><b>Jobs:</b> %.0f",
    diversity, diversity_raw, households, total_jobs
  ))

se_hex_raw_4326 <- dplyr::mutate(se_hex_4326, diversity = diversity_raw)

div_colors <- c("#ffffcc","#ffeda0","#fed976","#feb24c","#fd8d3c",
                "#fc4e2a","#e31a1c","#bd0026","#800026")
# Exclude zeros from break computation: many hexes now score 0 (pure residential
# or employment), which floods quantile breaks. step() maps values below the
# first break to the first color, so zeros still render as minimum diversity.
div_scale  <- mapgl::step_quantile(
  data_values = Filter(function(x) !is.na(x) & x > 0,
                       c(se_hex_4326$diversity, se_hex$diversity_raw)),
  column      = "diversity",
  n           = length(div_colors),
  colors      = div_colors,
  na_color    = "#cccccc"
)

map_smth <- mapgl::maplibre(style = mapgl::carto_style("positron")) |>
  mapgl::fit_bounds(se_hex_4326, animate = FALSE) |>
  mapgl::add_fill_layer(
    id = "diversity-smoothed", source = se_hex_4326,
    fill_color = div_scale$expression, fill_opacity = 0.8,
    fill_outline_color = "transparent", tooltip = "tooltip"
  ) |>
  mapgl::add_legend(
    legend_title   = "Diversity (neighbor-smoothed)",
    classification = div_scale,
    type           = "categorical",
    target         = "compare",
    position       = "top-left",
    patch_shape    = "hexagon"
  )

map_raw <- mapgl::maplibre(style = mapgl::carto_style("positron")) |>
  mapgl::fit_bounds(se_hex_4326, animate = FALSE) |>
  mapgl::add_fill_layer(
    id = "diversity-raw", source = se_hex_raw_4326,
    fill_color = div_scale$expression, fill_opacity = 0.8,
    fill_outline_color = "transparent", tooltip = "tooltip"
  ) |>
  mapgl::add_legend(
    legend_title   = "Diversity (no smoothing)",
    classification = div_scale,
    type           = "categorical",
    target         = "compare",
    position       = "top-left",
    patch_shape    = "hexagon"
  )

mapgl::compare(map_smth, map_raw, mode = "swipe", mousemove = FALSE)

# ── Distribution Check: Income Diversity Tiers ────────────────────────────────

low_max <- income_tier_breaks["low_max"]
mid_max <- income_tier_breaks["mid_max"]
n_bins  <- length(INCOME_BINS)

cat(sprintf(
  "Income tier breakpoints (%s):\n  Low:  bins 1–%d  ($0k – $%dk)\n  Mid:  bins %d–%d  ($%dk – $%dk)\n  High: bins %d–%d  ($%dk+)\n\n",
  INCOME_TIER_MODE,
  low_max,  INCOME_BIN_LOWER_K[low_max + 1L],
  low_max + 1L, mid_max, INCOME_BIN_LOWER_K[low_max + 1L], INCOME_BIN_LOWER_K[mid_max + 1L],
  mid_max + 1L, n_bins,  INCOME_BIN_LOWER_K[mid_max + 1L]
))

cat("L9 income diversity (smoothed):\n"); print(summary(se_hex$income_diversity))
cat("\nL8 income diversity (smoothed):\n"); print(summary(se_l8$income_diversity))

op <- par(mfrow = c(2L, 2L), mar = c(4, 4, 2, 1))
hist(se_hex$income_diversity_raw, breaks = 30, main = "L9 raw",      xlab = "Score", xlim = c(0, 1), col = "#4575b4", border = "white")
hist(se_hex$income_diversity,     breaks = 30, main = "L9 smoothed", xlab = "Score", xlim = c(0, 1), col = "#4575b4", border = "white")
hist(se_l8$income_diversity_raw,  breaks = 30, main = "L8 raw",      xlab = "Score", xlim = c(0, 1), col = "#d73027", border = "white")
hist(se_l8$income_diversity,      breaks = 30, main = "L8 smoothed", xlab = "Score", xlim = c(0, 1), col = "#d73027", border = "white")
par(op)

# ── Export ─────────────────────────────────────────────────────────────────────

if (!dir.exists(file.path(root, "_output"))) dir.create(file.path(root, "_output"))

gdb_path  <- file.path(root, "_output", paste0(GDB_NAME, ".gdb"))
zip_path  <- file.path(root, "_output", paste0(GDB_NAME, ".gdb.zip"))
gpkg_path <- file.path(root, "_output", paste0(GDB_NAME, ".gpkg"))

# Rename smoothed D-variable columns to _smoothed so raw and smoothed names are
# symmetric and unambiguous (density_smoothed / density_raw, etc.).
d_vars <- c("density", "diversity", "design", "destinations", "demographics", "transit_dist", "income_diversity")
rename_smoothed <- function(sf_obj) {
  dplyr::rename_with(sf_obj, ~ paste0(.x, "_smoothed"), dplyr::all_of(d_vars))
}

sf::write_sf(rename_smoothed(se_hex), gdb_path, layer = paste0(GDB_NAME, "_l9"), driver = "OpenFileGDB", append = FALSE)
sf::write_sf(rename_smoothed(se_l8),  gdb_path, layer = paste0(GDB_NAME, "_l8"), driver = "OpenFileGDB", append = FALSE)

# GDAL's OpenFileGDB writer produces .spx spatial index files that ArcGIS and
# QGIS can fail to query correctly at small extents (features vanish when
# zoomed in; see https://github.com/OSGeo/gdal/issues/5888). Deleting them
# makes readers fall back to a correct in-memory index instead.
unlink(list.files(gdb_path, pattern = "\\.spx$", full.names = TRUE))

# GeoPackage backup of the same two layers, unaffected by the OpenFileGDB
# spatial index bug above (GeoPackage indexes via SQLite's own R*Tree).
if (file.exists(gpkg_path)) unlink(gpkg_path)
sf::write_sf(rename_smoothed(se_hex), gpkg_path, layer = paste0(GDB_NAME, "_l9"), driver = "GPKG", append = FALSE)
sf::write_sf(rename_smoothed(se_l8),  gpkg_path, layer = paste0(GDB_NAME, "_l8"), driver = "GPKG", append = FALSE)

# Zip from inside _output with a relative path so the archive contains just
# "<GDB_NAME>.gdb/..." at its root (a relative path keeps zip() from baking in
# the full directory tree). Remove any stale archive first, since zip() appends
# to an existing file rather than overwriting it.
if (file.exists(zip_path)) unlink(zip_path)
old_wd <- setwd(file.path(root, "_output"))
on.exit(setwd(old_wd), add = TRUE)
zip(basename(zip_path), files = basename(gdb_path), flags = "-r9X")
setwd(old_wd)
unlink(gdb_path, recursive = TRUE)

# ── Web App Data Export ─────────────────────────────────────────────────────────
# PMTiles for the map app; metadata.json carries Jenks breaks for the color scale.

app_data_dir <- file.path(root, "_app", "public", "data")
dir.create(app_data_dir, recursive = TRUE, showWarnings = FALSE)

app_cols <- c(
  "hex_id",
  "density",      "density_raw",
  "diversity",    "diversity_raw",
  "design",       "design_raw",
  "destinations", "destinations_raw",
  "destinations_center",   "destinations_center_raw",
  "destinations_health",   "destinations_health_raw",
  "destinations_school",   "destinations_school_raw",
  "destinations_grocery",  "destinations_grocery_raw",
  "destinations_cityhall", "destinations_cityhall_raw",
  "destinations_park",     "destinations_park_raw",
  "destinations_ems",      "destinations_ems_raw",
  "demographics",     "demographics_raw",
  "transit_dist",     "transit_dist_raw",
  "income_diversity", "income_diversity_raw"
)

# Raw SE counts (single value, no smoothed/raw pair) are explorable in the app
# alongside the D variables. se_count_cols is defined in the L8 pipeline above.
app_cols <- c(app_cols, se_count_cols)

# Export PMTiles — viewport-aware tiles for faster web app loading.
# freestiler uses a Rust backend; no external CLI needed on any OS.
export_pmtiles <- function(sf_obj, dest_path, min_zoom, max_zoom) {
  sf_obj |>
    sf::st_transform(4326L) |>
    dplyr::select(dplyr::all_of(app_cols)) |>
    freestiler::freestile(output = dest_path, layer_name = "hexes",
                          min_zoom = min_zoom, max_zoom = max_zoom)
}

export_pmtiles(se_hex, file.path(app_data_dir, "l9.pmtiles"), min_zoom = 6L,  max_zoom = 14L)
export_pmtiles(se_l8,  file.path(app_data_dir, "l8.pmtiles"), min_zoom = 6L,  max_zoom = 13L)

# Pre-compute Jenks breaks for each variable (combined smoothed + raw so both
# map sides are on the same scale for honest visual comparison)
N_BREAKS <- 9L

# Fisher breaks + per-bin counts of the mapped values. `vals` is the pool the
# breaks are fit on (smoothed + raw for D variables, so both swipe sides share a
# scale); `mapped` is the series the histogram counts (what the map renders).
break_stats <- function(vals, mapped) {
  vals <- vals[!is.na(vals) & is.finite(vals)]
  k    <- min(N_BREAKS, length(unique(vals)))
  if (k < 2L) {
    return(list(breaks = numeric(0), min = min(vals, na.rm = TRUE), max = max(vals, na.rm = TRUE), counts = integer(0)))
  }
  brks <- classInt::classIntervals(vals, k, style = "fisher")$brks
  mapped <- mapped[!is.na(mapped) & is.finite(mapped)]
  bin_idx    <- .bincode(mapped, brks, right = TRUE, include.lowest = TRUE)
  bin_counts <- tabulate(bin_idx, nbins = k)
  list(
    # I(unname()) strips H3-ID names and prevents auto_unbox on length-1 vectors
    breaks = I(unname(round(brks[-c(1L, length(brks))], 8L))),
    # Use actual data min/max rather than brks endpoints: classInt Fisher can
    # produce boundary breaks slightly outside the data range.
    min    = min(vals),
    max    = max(vals),
    counts = I(unname(as.integer(bin_counts)))
  )
}

compute_level_breaks <- function(sf_obj) {
  df <- sf::st_drop_geometry(sf_obj)

  # D variables: pool smoothed + raw onto one scale (the histogram counts the
  # smoothed series, which is what the left map renders).
  paired_vars <- c(
    "density", "diversity", "design",
    "destinations",
    "destinations_center", "destinations_health", "destinations_school",
    "destinations_grocery", "destinations_cityhall", "destinations_park", "destinations_ems",
    "demographics", "transit_dist", "income_diversity"
  )
  paired <- purrr::map(purrr::set_names(paired_vars), \(v) {
    vals <- c(df[[v]], df[[paste0(v, "_raw")]])
    # Destination scores are logically [0, 1]; clamp any floating-point overshoot.
    if (startsWith(v, "destinations")) vals <- pmax(0, pmin(1, vals))
    break_stats(vals, df[[v]])
  })

  # Raw SE counts: single series, so the scale and histogram come from one column.
  counts <- purrr::map(purrr::set_names(se_count_cols), \(v) break_stats(df[[v]], df[[v]]))

  c(paired, counts)
}

metadata <- list(
  l9 = compute_level_breaks(se_hex),
  l8 = compute_level_breaks(se_l8)
)

jsonlite::write_json(metadata, file.path(app_data_dir, "metadata.json"),
  auto_unbox = TRUE, digits = 8)
