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

fetch_or_cache <- function(url, cache_path, layer = NULL) {
  full_path <- file.path(root, cache_path)
  if (file.exists(full_path))
    return(if (is.null(layer)) sf::read_sf(full_path) else sf::read_sf(full_path, layer = layer))
  dir.create(dirname(full_path), recursive = TRUE, showWarnings = FALSE)
  data <- tryCatch(
    arcgislayers::arc_select(arcgislayers::arc_open(url)),
    error = function(e) stop("Failed to fetch '", cache_path, "': ", conditionMessage(e))
  )
  if (is.na(sf::st_crs(data))) sf::st_crs(data) <- 4326L
  sf::write_sf(data, full_path, driver = "GPKG")
  data
}

# k = last non-zero ring; per-neighbor weight = ring_weight / (6 × ring_number).
# Edge hexes with fewer available neighbors receive proportionally less total
# weight from that ring — it is not redistributed to remaining neighbors.
build_neighbor_index <- function(hex_ids, weights) {
  k         <- max(which(weights[-1] > 0))
  h3_cells  <- h3o::h3_from_strings(hex_ids)
  all_disks <- h3o::grid_disk(h3_cells, k = k)
  all_dists <- h3o::grid_distances(h3_cells, k = k)
  data.frame(
    center_id = rep(hex_ids, times = lengths(all_disks)),
    member_id = as.character(h3o::flatten_h3(all_disks)),
    ring      = unlist(all_dists),
    stringsAsFactors = FALSE
  ) |>
    dplyr::filter(member_id %in% hex_ids) |>
    dplyr::mutate(
      weight = ifelse(ring == 0L, weights["center"],
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

# 1 if any feature from features_sf touches the hex, 0 otherwise
flag_presence <- function(hex_sf, features_sf) {
  ft <- sf::st_transform(features_sf, sf::st_crs(hex_sf))
  as.integer(lengths(sf::st_intersects(hex_sf, ft)) > 0L)
}

# ── Remote Data Fetch & Cache ──────────────────────────────────────────────────

# Design
# Note: the ArcGIS service stores sequential row numbers in hex_id, not H3 IDs.
# Derive the H3 level-9 cell from each polygon centroid instead.
intersection_hex <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/Street_Intersection_Density_2025/FeatureServer/3",
  cache_path = "_data/remote/design/intersection_hex.gpkg"
) |>
  (\(d) {
    xy <- sf::st_coordinates(sf::st_centroid(sf::st_transform(d, 4326L)))
    dplyr::mutate(d, hex_id = as.character(h3o::h3_from_xy(xy[, 1L], xy[, 2L], resolution = 9L)))
  })()

# Destinations
center_boundaries <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/ArcGIS/rest/services/WCV_Centers_and_Regional_Land_Uses/FeatureServer/0",
  cache_path = "_data/remote/destinations/center_boundaries.gpkg"
)
health_care <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/LicensedHealthCareFacilities/FeatureServer/0",
  cache_path = "_data/remote/destinations/health_care.gpkg"
)
schools <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/Schools_PreKto12/FeatureServer/0",
  cache_path = "_data/remote/destinations/schools.gpkg"
)
grocery_stores <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/UtahGroceryAndFoodStores_DAF/FeatureServer/0",
  cache_path = "_data/remote/destinations/grocery_stores.gpkg"
)
city_halls <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/CommunityServices_gdb/FeatureServer/0",
  cache_path = "_data/remote/destinations/city_halls.gpkg"
)
parks_local <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/UtahParksLocal/FeatureServer/0",
  cache_path = "_data/remote/destinations/parks_local.gpkg"
)
parks_wfrc <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/AccessToParks_082024_gdb/FeatureServer/2",
  cache_path = "_data/remote/destinations/parks_wfrc.gpkg"
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

# ── SE Data Import ─────────────────────────────────────────────────────────────

se_hex <- sf::read_sf(
  paste0("/vsizip/", file.path(root, "_data", paste0(GDB_NAME, ".gdb.zip"))),
  layer = GDB_NAME
)
hex_ids <- se_hex$hex_id
hex_crs <- sf::st_crs(se_hex)

na_county_names <- c("Tooele", "Morgan", "Summit", "Wasatch")

# ── Destinations: shared setup (used by both L9 and L8) ───────────────────────

# inspect names(cb_proj) to confirm the center type field; adjust if needed
cb_proj <- center_boundaries |>
  sf::st_transform(hex_crs) |>
  sf::st_make_valid() |>
  dplyr::mutate(tier_weight = WC_CENTER_WEIGHTS[CenterType]) |>
  dplyr::filter(!is.na(tier_weight), tier_weight > 0)

# inspect names(schools) — filter field and value may differ from "SchoolLevel"/"high"
high_schools    <- dplyr::filter(schools,        grepl("high", SchoolLevel,  ignore.case = TRUE))
# inspect names(grocery_stores) — confirm TYPE field name
grocery_filt    <- dplyr::filter(grocery_stores, TYPE %in% c("Grocery Store", "Specialty Grocery", "Supermarket"))
# inspect names(city_halls) — confirm Facility field name
city_halls_filt <- dplyr::filter(city_halls,     grepl("City Hall|County Office", Facility, ignore.case = TRUE))

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

# Flag hexes in Tooele Valley, Morgan, Summit, and Wasatch counties as NA
# TODO: pending TBD methodology for these areas per supervisor guidance
# inspect names(utah_counties) to confirm the county name field before running
na_hex_ids <- sf::st_join(
  sf::st_centroid(se_hex["hex_id"]),
  sf::st_transform(utah_counties["NAME"], hex_crs),
  join = sf::st_within
) |>
  sf::st_drop_geometry() |>
  dplyr::filter(NAME %in% na_county_names) |>
  dplyr::pull(hex_id)
density[hex_ids %in% na_hex_ids] <- NA_real_

## Diversity
hh_s  <- smooth_by_neighbors(hex_ids, se_hex$households, neighbor_index)
emp_s <- smooth_by_neighbors(hex_ids, se_hex$total_jobs,  neighbor_index)
hw    <- hh_s * J2H
diversity <- ifelse(hw == 0 | emp_s == 0, NA_real_, pmin(hw, emp_s) / pmax(hw, emp_s))

## Design
# inspect class(intersection_hex$hex_id) and class(se_hex$hex_id) before joining;
# both layers use H3 string IDs → direct join on hex_id.
# IntPtsPerM = (4-way intersections × 1) + (3-way × 0.5); summing is valid here.
design_raw <- tibble::tibble(hex_id = hex_ids) |>
  dplyr::left_join(
    sf::st_drop_geometry(intersection_hex) |> dplyr::select(hex_id, IntPtsPerM),
    by = "hex_id"
  ) |>
  dplyr::pull(IntPtsPerM)
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
highschool_flag <- flag_presence(se_hex, high_schools)
grocery_flag    <- flag_presence(se_hex, grocery_filt)
cityhall_flag   <- flag_presence(se_hex, city_halls_filt)
park_flag       <- pmax(flag_presence(se_hex, parks_local), flag_presence(se_hex, parks_wfrc))

amenity_score    <- (healthcare_flag + highschool_flag + grocery_flag + cityhall_flag + park_flag) / 5
raw_destinations <- 0.6 * wc_score + 0.4 * amenity_score
destinations     <- smooth_by_neighbors(hex_ids, raw_destinations, neighbor_index)

## Demographics
# Household-weighted interpolation from BG → hex using SE 2025 projected HH as
# the weights layer. Same vintage as the pipeline; Census blocks (Method A) gave
# R²=0.92, RMSE=$10,919, bias=$103 vs this method — negligible average difference.
demographics_interp <- tidycensus::interpolate_pw(
  from             = sf::st_transform(bg_income, hex_crs),
  to               = se_hex,
  to_id            = "hex_id",
  extensive        = FALSE,
  weights          = se_hex[, c("hex_id", "households")],
  weight_column    = "households",
  weight_placement = "surface"
)
demographics_raw <- tibble::tibble(hex_id = hex_ids) |>
  dplyr::left_join(
    sf::st_drop_geometry(demographics_interp) |> dplyr::select(hex_id, estimate),
    by = "hex_id"
  ) |>
  dplyr::left_join(
    sf::st_drop_geometry(se_hex) |> dplyr::select(hex_id, households),
    by = "hex_id"
  ) |>
  dplyr::mutate(estimate = dplyr::if_else(households == 0, NA_real_, estimate)) |>
  dplyr::pull(estimate)
demographics <- smooth_by_neighbors(hex_ids, demographics_raw, neighbor_index)

## Distance to Transit
centroids        <- sf::st_centroid(sf::st_geometry(se_hex))
dist_mat         <- sf::st_distance(centroids, frequent_stops)
nearest_col      <- apply(dist_mat, 1L, which.min)
transit_dist_raw <- as.numeric(dist_mat[cbind(seq_len(nrow(se_hex)), nearest_col)]) / 1609.34
transit_dist     <- smooth_by_neighbors(hex_ids, transit_dist_raw, neighbor_index)

## Raw (unsmoothed) L9 values
density_raw   <- (se_hex$residential_units + se_hex$total_jobs / J2H) / L9_HEX_AREA_SQMI
density_raw[hex_ids %in% na_hex_ids] <- NA_real_

hw_raw        <- se_hex$households * J2H
diversity_raw <- ifelse(hw_raw == 0 | se_hex$total_jobs == 0, NA_real_,
  pmin(hw_raw, se_hex$total_jobs) / pmax(hw_raw, se_hex$total_jobs))

destinations_raw <- raw_destinations  # alias: raw_destinations computed at line 310

## Assemble L9
se_hex$density          <- density
se_hex$density_raw      <- density_raw
se_hex$diversity        <- diversity
se_hex$diversity_raw    <- diversity_raw
se_hex$design           <- design
se_hex$design_raw       <- design_raw
se_hex$destinations     <- destinations
se_hex$destinations_raw <- destinations_raw
se_hex$demographics     <- demographics
se_hex$demographics_raw <- demographics_raw
se_hex$transit_dist     <- transit_dist
se_hex$transit_dist_raw <- transit_dist_raw

# ── 2. Level-8 Pipeline ────────────────────────────────────────────────────────

## Aggregate SE from L9 → L8
h8_ids_vec <- as.character(h3o::get_parents(h3o::h3_from_strings(hex_ids), resolution = 8L))

# Sum counts by L8 parent (drop geometry first — summarise on sf would dissolve
# L9 polygons into irregular unions instead of clean H3 L8 hex boundaries)
se_l8_data <- sf::st_drop_geometry(se_hex) |>
  dplyr::mutate(hex_id = h8_ids_vec) |>
  dplyr::select(hex_id, residential_units, total_jobs, households) |>
  dplyr::group_by(hex_id) |>
  dplyr::summarise(
    residential_units = sum(residential_units, na.rm = TRUE),
    total_jobs        = sum(total_jobs,        na.rm = TRUE),
    households        = sum(households,        na.rm = TRUE),
    .groups = "drop"
  )

# Build true H3 L8 hex boundaries: vertex convex hull of each cell's 6 vertices
h8_geom <- h3o::h3_from_strings(se_l8_data$hex_id) |>
  h3o::h3_to_vertexes() |>
  lapply(sf::st_convex_hull) |>
  sf::st_sfc(crs = 4326L) |>
  sf::st_transform(hex_crs)

se_l8 <- sf::st_sf(se_l8_data, geometry = h8_geom)
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
density_l8[h8_ids %in% na_hex_ids] <- NA_real_

## Diversity (L8)
hh_s_l8  <- smooth_by_neighbors(h8_ids, se_l8$households, neighbor_index_l8)
emp_s_l8 <- smooth_by_neighbors(h8_ids, se_l8$total_jobs,  neighbor_index_l8)
hw_l8    <- hh_s_l8 * J2H
diversity_l8 <- ifelse(hw_l8 == 0 | emp_s_l8 == 0, NA_real_, pmin(hw_l8, emp_s_l8) / pmax(hw_l8, emp_s_l8))

## Design (L8) — sum IntPtsPerM across L9 children per L8 hex
int_hex_l8 <- sf::st_drop_geometry(intersection_hex) |>
  dplyr::select(hex_id, IntPtsPerM) |>
  dplyr::mutate(h8_id = as.character(h3o::get_parents(h3o::h3_from_strings(hex_id), resolution = 8L))) |>
  dplyr::group_by(h8_id) |>
  dplyr::summarise(IntPtsPerM = sum(IntPtsPerM, na.rm = TRUE), .groups = "drop")

design_raw_l8 <- tibble::tibble(hex_id = h8_ids) |>
  dplyr::left_join(int_hex_l8, by = c("hex_id" = "h8_id")) |>
  dplyr::pull(IntPtsPerM)
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
highschool_flag_l8 <- flag_presence(se_l8, high_schools)
grocery_flag_l8    <- flag_presence(se_l8, grocery_filt)
cityhall_flag_l8   <- flag_presence(se_l8, city_halls_filt)
park_flag_l8       <- pmax(flag_presence(se_l8, parks_local), flag_presence(se_l8, parks_wfrc))

amenity_score_l8    <- (healthcare_flag_l8 + highschool_flag_l8 + grocery_flag_l8 +
                        cityhall_flag_l8 + park_flag_l8) / 5
raw_destinations_l8 <- 0.6 * wc_score_l8 + 0.4 * amenity_score_l8
destinations_l8     <- smooth_by_neighbors(h8_ids, raw_destinations_l8, neighbor_index_l8)

## Demographics (L8)
demographics_interp_l8 <- tidycensus::interpolate_pw(
  from             = sf::st_transform(bg_income, hex_crs),
  to               = se_l8,
  to_id            = "hex_id",
  extensive        = FALSE,
  weights          = se_l8[, c("hex_id", "households")],
  weight_column    = "households",
  weight_placement = "surface"
)
demographics_raw_l8 <- tibble::tibble(hex_id = h8_ids) |>
  dplyr::left_join(
    sf::st_drop_geometry(demographics_interp_l8) |> dplyr::select(hex_id, estimate),
    by = "hex_id"
  ) |>
  dplyr::left_join(
    sf::st_drop_geometry(se_l8) |> dplyr::select(hex_id, households),
    by = "hex_id"
  ) |>
  dplyr::mutate(estimate = dplyr::if_else(households == 0, NA_real_, estimate)) |>
  dplyr::pull(estimate)
demographics_l8 <- smooth_by_neighbors(h8_ids, demographics_raw_l8, neighbor_index_l8)

## Distance to Transit (L8)
centroids_l8        <- sf::st_centroid(sf::st_geometry(se_l8))
dist_mat_l8         <- sf::st_distance(centroids_l8, frequent_stops)
nearest_col_l8      <- apply(dist_mat_l8, 1L, which.min)
transit_dist_raw_l8 <- as.numeric(dist_mat_l8[cbind(seq_len(nrow(se_l8)), nearest_col_l8)]) / 1609.34
transit_dist_l8     <- smooth_by_neighbors(h8_ids, transit_dist_raw_l8, neighbor_index_l8)

## Raw (unsmoothed) L8 values
density_raw_l8   <- (se_l8$residential_units + se_l8$total_jobs / J2H) / L8_HEX_AREA_SQMI
density_raw_l8[h8_ids %in% na_hex_ids] <- NA_real_

hw_raw_l8        <- se_l8$households * J2H
diversity_raw_l8 <- ifelse(hw_raw_l8 == 0 | se_l8$total_jobs == 0, NA_real_,
  pmin(hw_raw_l8, se_l8$total_jobs) / pmax(hw_raw_l8, se_l8$total_jobs))

## Assemble L8
se_l8$density          <- density_l8
se_l8$density_raw      <- density_raw_l8
se_l8$diversity        <- diversity_l8
se_l8$diversity_raw    <- diversity_raw_l8
se_l8$design           <- design_l8
se_l8$design_raw       <- design_raw_l8
se_l8$destinations     <- destinations_l8
se_l8$destinations_raw <- raw_destinations_l8
se_l8$demographics     <- demographics_l8
se_l8$demographics_raw <- demographics_raw_l8
se_l8$transit_dist     <- transit_dist_l8
se_l8$transit_dist_raw <- transit_dist_raw_l8

# ── Visualization: Diversity — smoothed vs raw (L9) ───────────────────────────

se_hex_4326 <- sf::st_transform(se_hex, 4326L)

se_hex_4326$tooltip <- sprintf(
  "<b>Diversity (smoothed):</b> %.2f<br><b>Diversity (raw):</b> %.2f<br><b>HH:</b> %.0f<br><b>Jobs:</b> %.0f",
  se_hex$diversity, se_hex$diversity_raw, se_hex$households, se_hex$total_jobs
)

se_hex_raw_4326           <- se_hex_4326
se_hex_raw_4326$diversity <- se_hex$diversity_raw

div_colors <- c("#ffffcc","#ffeda0","#fed976","#feb24c","#fd8d3c",
                "#fc4e2a","#e31a1c","#bd0026","#800026")
div_scale  <- mapgl::step_quantile(
  data_values = c(se_hex_4326$diversity, se_hex$diversity_raw),
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

# ── Export ─────────────────────────────────────────────────────────────────────

if (!dir.exists(file.path(root, "_output"))) dir.create(file.path(root, "_output"))

gdb_path <- file.path(root, "_output", paste0(GDB_NAME, ".gdb"))
zip_path <- file.path(root, "_output", paste0(GDB_NAME, ".gdb.zip"))

sf::write_sf(se_hex, gdb_path, layer = GDB_NAME,                driver = "OpenFileGDB", append = FALSE)
sf::write_sf(se_l8,  gdb_path, layer = paste0(GDB_NAME, "_l8"), driver = "OpenFileGDB", append = FALSE)

zip(zip_path, files = gdb_path, flags = "-r9X")
unlink(gdb_path, recursive = TRUE)

# ── Web App Data Export ─────────────────────────────────────────────────────────
# GeoJSON loaded directly by MapLibre (fetched + parsed in MapLibre's own Worker).
# metadata.json carries pre-computed Jenks breaks so the browser has zero heavy
# computation at startup.

app_data_dir <- file.path(root, "_app", "public", "data")
dir.create(app_data_dir, recursive = TRUE, showWarnings = FALSE)

app_cols <- c(
  "hex_id",
  "density",      "density_raw",
  "diversity",    "diversity_raw",
  "design",       "design_raw",
  "destinations", "destinations_raw",
  "demographics", "demographics_raw",
  "transit_dist", "transit_dist_raw"
)

# Export GeoJSON — MapLibre fetches by URL and parses in its own Worker
export_geojson <- function(sf_obj, dest_path) {
  sf_obj |>
    sf::st_transform(4326L) |>
    dplyr::select(dplyr::all_of(app_cols)) |>
    sf::st_write(dest_path, driver = "GeoJSON", delete_dsn = TRUE,
      layer_options = c("COORDINATE_PRECISION=6", "RFC7946=YES"))
}

export_geojson(se_hex, file.path(app_data_dir, "l9.geojson"))
export_geojson(se_l8,  file.path(app_data_dir, "l8.geojson"))

# Pre-compute Jenks breaks for each variable (combined smoothed + raw so both
# map sides are on the same scale for honest visual comparison)
N_BREAKS <- 7L

compute_level_breaks <- function(sf_obj) {
  df   <- sf::st_drop_geometry(sf_obj)
  vars <- c("density", "diversity", "design", "destinations", "demographics", "transit_dist")
  lapply(setNames(vars, vars), function(v) {
    vals <- c(df[[v]], df[[paste0(v, "_raw")]])
    vals <- vals[!is.na(vals) & is.finite(vals)]
    k    <- min(N_BREAKS, length(unique(vals)))
    if (k < 2L) {
      return(list(breaks = numeric(0), min = min(vals, na.rm = TRUE), max = max(vals, na.rm = TRUE)))
    }
    brks <- classInt::classIntervals(vals, k, style = "jenks")$brks
    list(
      # I(unname()) strips H3-ID names and prevents auto_unbox on length-1 vectors
      breaks = I(unname(round(brks[-c(1L, length(brks))], 8L))),
      min    = brks[[1L]],
      max    = brks[[length(brks)]]
    )
  })
}

metadata <- list(
  l9 = compute_level_breaks(se_hex),
  l8 = compute_level_breaks(se_l8)
)

jsonlite::write_json(metadata, file.path(app_data_dir, "metadata.json"),
  auto_unbox = TRUE, digits = 8)
